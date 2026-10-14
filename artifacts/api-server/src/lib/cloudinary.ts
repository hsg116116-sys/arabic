import { createHash } from "node:crypto";
import { loadLocalEnvOnce } from "./env";
import { logger } from "./logger";

// ============================================================================
// Cloudinary — تخزين فيديوهات الدروس مع ضغط خيالي عند العرض.
// ----------------------------------------------------------------------------
// الفكرة: الفيديو يُرفع مرة واحدة بأصله، والعرض دائماً بنسخة مضغوطة
// (f_mp4,vc_h264,q_auto:low,w_960) — فيديو 20 دقيقة ينزل من مئات الميجا
// إلى عشرات. الضغط يتم على خوادم Cloudinary نفسها، لا على جهازنا ولا
// على Vercel — فيعمل من الآيباد مباشرة وبلا مهلة تنفيذ.
//
// حسابان بتناوب تلقائي: إن امتلأ الأول (حصة التخزين ≥95%) أو أبلغ
// المتصفح عن فشله، ينتقل التوقيع فوراً للثاني — بلا تدخل من الأستاذ.
// المفاتيح السرية تبقى في process.env / .env ولا تصل للمتصفح أبداً:
// المتصفح يأخذ توقيعاً مؤقتاً فقط (timestamp + signature).
// ============================================================================

export type CloudinaryAccount = {
  index: number;
  cloud: string;
  apiKey: string;
  apiSecret: string;
};

/** صيغة المفتاح: cloudinary://API_KEY:API_SECRET@CLOUD_NAME */
function parseCloudinaryUrl(raw: unknown): { cloud: string; apiKey: string; apiSecret: string } | null {
  const text = String(raw || "").trim();
  const m = text.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/]+)\/?$/);
  if (!m) return null;
  const [, apiKey, apiSecret, cloud] = m;
  if (!apiKey || !apiSecret || !cloud) return null;
  return { cloud: cloud.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim() };
}

export function getCloudinaryAccounts(): CloudinaryAccount[] {
  loadLocalEnvOnce();
  const out: CloudinaryAccount[] = [];
  for (let i = 1; i <= 4; i++) {
    // الأولوية لصيغة URL الكاملة، ثم المتغيرات المنفصلة
    const fromUrl = parseCloudinaryUrl(process.env[`CLOUDINARY_${i}_URL`]);
    const cloud = fromUrl?.cloud || String(process.env[`CLOUDINARY_${i}_CLOUD`] || "").trim();
    const apiKey = fromUrl?.apiKey || String(process.env[`CLOUDINARY_${i}_KEY`] || "").trim();
    const apiSecret = fromUrl?.apiSecret || String(process.env[`CLOUDINARY_${i}_SECRET`] || "").trim();
    if (!cloud || !apiKey || !apiSecret) continue;
    out.push({ index: i, cloud, apiKey, apiSecret });
  }
  return out;
}

// ---------------------------------------------------------------------------
// الحالة الصحية: حساب ساقط يُتجاوز لمدة، ثم يُعاد اختباره تلقائياً.
// (ذاكرة العملية فقط — والاختيار الحصصي أدناه حتمي فيعمل على كل النسخ)
// ---------------------------------------------------------------------------
const downUntil = new Map<number, number>();

export function markCloudinaryDown(index: number, minutes = 10): void {
  downUntil.set(index, Date.now() + minutes * 60 * 1000);
  logger.warn({ index, minutes }, "Cloudinary account marked down, failing over");
}

function isDown(index: number): boolean {
  const until = downUntil.get(index) || 0;
  if (until && until < Date.now()) downUntil.delete(index);
  return (downUntil.get(index) || 0) > Date.now();
}

// ---------------------------------------------------------------------------
// حصة التخزين: نسأل Cloudinary نفسها كم بقي — فالتبديل عند الامتلاء
// تلقائي وحتمي، لا تخمين فيه.
// ---------------------------------------------------------------------------
export type CloudinaryUsage = {
  storageUsed: number;
  storageLimit: number;
  storagePct: number | null;
  plan: string;
};

const usageCache = new Map<number, { at: number; usage: CloudinaryUsage | null }>();
const USAGE_TTL = 5 * 60 * 1000;
const EXHAUSTED_AT = 0.95;

async function fetchUsage(acc: CloudinaryAccount): Promise<CloudinaryUsage | null> {
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${acc.cloud}/usage`, {
      headers: { Authorization: "Basic " + Buffer.from(`${acc.apiKey}:${acc.apiSecret}`).toString("base64") },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    const used = Number(data?.storage?.used ?? data?.storage?.usage ?? NaN);
    const limit = Number(data?.storage?.limit ?? NaN);
    return {
      storageUsed: Number.isFinite(used) ? used : 0,
      storageLimit: Number.isFinite(limit) ? limit : 0,
      storagePct: Number.isFinite(used) && Number.isFinite(limit) && limit > 0 ? used / limit : null,
      plan: String(data?.plan || ""),
    };
  } catch (err) {
    logger.warn({ err, cloud: acc.cloud }, "Cloudinary usage check failed");
    return null;
  }
}

async function accountExhausted(acc: CloudinaryAccount): Promise<boolean> {
  const now = Date.now();
  const hit = usageCache.get(acc.index);
  let usage = hit && now - hit.at < USAGE_TTL ? hit.usage : null;
  if (!usage) {
    usage = await fetchUsage(acc);
    usageCache.set(acc.index, { at: now, usage });
  }
  if (!usage || usage.storagePct === null) return false;
  return usage.storagePct >= EXHAUSTED_AT;
}

/** الحساب النشط: الأول السليم، وإلا الثاني — وnull إن سقط الكل */
export async function pickCloudinaryAccount(): Promise<CloudinaryAccount | null> {
  const accounts = getCloudinaryAccounts();
  for (const acc of accounts) {
    if (isDown(acc.index)) continue;
    if (await accountExhausted(acc)) {
      logger.warn({ cloud: acc.cloud }, "Cloudinary account exhausted, failing over");
      continue;
    }
    return acc;
  }
  return null;
}

// ---------------------------------------------------------------------------
// التوقيع: SHA1 للمقادير مرتبة أبجدياً + السر — توقيع Cloudinary القياسي.
// ---------------------------------------------------------------------------
export function signCloudinaryParams(
  acc: CloudinaryAccount,
  params: Record<string, string | number>,
): { signature: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const all: Record<string, string> = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) };
  all.timestamp = String(timestamp);
  const body = Object.keys(all)
    .sort()
    .map((k) => `${k}=${all[k]}`)
    .join("&");
  const signature = createHash("sha1").update(body + acc.apiSecret).digest("hex");
  return { signature, timestamp };
}

export const CLOUDINARY_VIDEO_FOLDER = "ard-al-lughah/videos";

/** حزمة التوقيع التي يأخذها المتصفح ليرفع مباشرة إلى Cloudinary */
export async function createVideoUploadAuth(filename?: string): Promise<{
  cloud: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  uploadUrl: string;
  accountIndex: number;
  accountLabel: string;
}> {
  const acc = await pickCloudinaryAccount();
  if (!acc) {
    throw new Error("حسابا Cloudinary ممتلئان أو غير مهيأين — أضف مساحة أو راجع المفاتيح");
  }
  const safe = String(filename || `lesson-${Date.now()}.mp4`)
    .replace(/[^\w.\-()[\] ]+/g, "_")
    .slice(0, 120);
  // ملاحظة: resource_type و type و api_key و cloud_name لا تدخل التوقيع
  // (تُنقل في المسار) — توقيعها يُبطل الطلب. نوقّع الباقي فقط.
  const { signature, timestamp } = signCloudinaryParams(acc, {
    folder: CLOUDINARY_VIDEO_FOLDER,
    filename_override: safe,
    use_filename: "true",
    unique_filename: "true",
    overwrite: "false",
  });
  return {
    cloud: acc.cloud,
    apiKey: acc.apiKey,
    timestamp,
    signature,
    folder: CLOUDINARY_VIDEO_FOLDER,
    uploadUrl: `https://api.cloudinary.com/v1_1/${acc.cloud}/video/upload`,
    accountIndex: acc.index,
    accountLabel: `الحساب ${acc.index === 1 ? "الأول" : "الثاني"}`,
  };
}

// ---------------------------------------------------------------------------
// رابط العرض المضغوط: نفس الفيديو، نسخة خفيفة.
// f_mp4 + vc_h264 = يعمل على كل المتصفحات والآيباد بلا استثناء.
// q_auto:low      = ضغط خيالي (أصغر بكثير من good/best).
// w_960           = عرض كافٍ للسبورة والنصوص.
// ---------------------------------------------------------------------------
const DELIVERY_TRANSFORM = "f_mp4,vc_h264,q_auto:low,w_960";

export function cloudinaryDeliveryUrl(rawUrl: string): string {
  const raw = String(rawUrl || "").trim();
  const m = raw.match(
    /^https?:\/\/res\.cloudinary\.com\/([^/]+)\/video\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i,
  );
  if (!m) return raw;
  const [, cloud, publicId] = m;
  if (!cloud || !publicId) return raw;
  return `https://res.cloudinary.com/${cloud}/video/upload/${DELIVERY_TRANSFORM}/${publicId}.mp4`;
}

/** هل هذا رابط Cloudinary خام (غير مضغوط) يحتاج تطبيعاً؟ */
export function needsDeliveryNormalization(rawUrl: string): boolean {
  const raw = String(rawUrl || "").trim();
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(raw)) return false;
  return !raw.includes(DELIVERY_TRANSFORM);
}

/** حالة الحسابين للواجهة — ماذا يعمل الآن وكم بقي فيه */
export async function getCloudinaryStatus(): Promise<{
  configured: number;
  active: number | null;
  accounts: Array<{
    index: number;
    cloud: string;
    label: string;
    down: boolean;
    exhausted: boolean;
    usage: CloudinaryUsage | null;
  }>;
}> {
  const accounts = getCloudinaryAccounts();
  const active = await pickCloudinaryAccount();
  const list = [];
  for (const acc of accounts) {
    const hit = usageCache.get(acc.index);
    const usage = hit && Date.now() - hit.at < USAGE_TTL ? hit.usage : await fetchUsage(acc).then((u) => {
      usageCache.set(acc.index, { at: Date.now(), usage: u });
      return u;
    });
    list.push({
      index: acc.index,
      cloud: acc.cloud,
      label: `الحساب ${acc.index === 1 ? "الأول" : "الثاني"}`,
      down: isDown(acc.index),
      exhausted: !!usage && usage.storagePct !== null && usage.storagePct >= EXHAUSTED_AT,
      usage,
    });
  }
  return { configured: accounts.length, active: active?.index ?? null, accounts: list };
}
