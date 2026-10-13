// ============================================================================
// التحقق من البريد الإلكتروني قبل إنشاء الحساب.
// ثلاث مسؤوليات هنا: قائمة مزوّدي البريد المسموحين، حجز الكود بشكل مشفّر
// داخل كوكي httpOnly (فيبقى الخادم بلا قاعدة بيانات جديدة ولا ذاكرة مؤقتة
// تنكسر على الخوادم المتعددة)، وبناء رسالة الكود.
// ============================================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { loadLocalEnvOnce } from "./env";
import { logger } from "./logger";

loadLocalEnvOnce();

/** مزوّدو البريد المسموحون للتسجيل: Gmail و Hotmail و Outlook فقط.
 *  أي نطاق آخر ممنوع — والسيرفر هو المرجع، لا الواجهة. */
export const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
] as const;

export const ALLOWED_PROVIDERS_LABEL = "Gmail أو Hotmail أو Outlook";

export const VERIFY_COOKIE = "ard_verify";
export const VERIFY_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_CODE_TRIES = 5;

export type VerifyState = {
  /** البريد المنتظر تأكيده */
  email: string;
  /** الكود المولَّد */
  code: string;
  /** متى أُرسل آخر كود (ms) — لتفرض مهلة إعادة الإرسال */
  sentAt: number;
  /** متى ينتهي الطلب (ms) */
  expiresAt: number;
  /** عدد المحاولات الخاطئة */
  tries: number;
  /** اسم الطالب لعرضه في الرسالة */
  name?: string;
};

const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
}

/** نطاق مسموح؟ Gmail و Hotmail و Outlook بكل نطاقاتها الإقليمية. */
function isAllowedDomain(domain: string): boolean {
  if (ALLOWED_EMAIL_DOMAINS.includes(domain as (typeof ALLOWED_EMAIL_DOMAINS)[number])) return true;
  // نطاقات إقليمية: hotmail.co.uk، outlook.ae، live.fr ... كلها عائلة المزوّد نفسه
  return ["hotmail.", "outlook.", "live.", "msn."].some((prefix) => domain.startsWith(prefix));
}

export function checkEmailAllowed(raw: unknown):
  | { ok: true; email: string }
  | { ok: false; error: string } {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, error: "اكتب بريدك الإلكتروني أولاً." };
  if (!EMAIL_SHAPE.test(email)) {
    return { ok: false, error: "صيغة البريد غير صحيحة. مثال صحيح: name@gmail.com" };
  }
  const domain = emailDomain(email);
  if (!isAllowedDomain(domain)) {
    return {
      ok: false,
      error: `هذا النطاق غير مسموح بالتسجيل. استخدم بريد ${ALLOWED_PROVIDERS_LABEL} فقط.`,
    };
  }
  return { ok: true, email };
}

/** إخفاء جزء من البريد للعرض: a***b@gmail.com */
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  if (!domain) return email;
  const head = name.slice(0, 1);
  const tail = name.length > 2 ? name.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(3, Math.min(6, name.length - 2)))}${tail}@${domain}`;
}

// ---------------------------------------------------------------------------
// حجز الكود: AES-256-GCM داخل كوكي httpOnly
// لماذا لا قاعدة بيانات؟ المشروع كله عبر REST على Supabase، وإضافة جدول
// جديد تعني migrations يدوية. الكود يعيش 10 دقائق فقط، والكوكي المشفّر
// يعمل على الخوادم المتعددة بلا ذاكرة مشتركة.
// ---------------------------------------------------------------------------

function sealingKey(): Buffer {
  const secret =
    process.env.EMAIL_VERIFY_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "ard-al-lughah-verify-fallback-secret";
  return createHash("sha256").update(String(secret)).digest();
}

/** يشفّر الحالة إلى نص واحد صالح للكوكي — غير قابل للتزوير ولا للقراءة من المتصفح. */
export function sealState(state: VerifyState): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealingKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64url");
}

/** يفكّ الحالة، ويعيد null إن كانت تالفة أو زُوّرت. */
export function openState(token: unknown): VerifyState | null {
  if (typeof token !== "string" || !token) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", sealingKey(), iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text) as VerifyState;
    if (!parsed?.email || !parsed?.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function newCode(): string {
  // randomInt يرفض القيم الموزّعة بانتظام، فيعطي كل رقم احتمالاً متساوياً
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** مقارنة بزمن ثابت حتى لا يُستنتج الكود حرفاً بحرف. */
export function codeMatches(expected: string, given: string): boolean {
  const a = Buffer.from(String(expected ?? ""), "utf8");
  const b = Buffer.from(String(given ?? ""), "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function createState(email: string, name?: string): VerifyState {
  const now = Date.now();
  return {
    email,
    code: newCode(),
    sentAt: now,
    expiresAt: now + VERIFY_TTL_MS,
    tries: 0,
    name: name ? String(name).slice(0, 80) : undefined,
  };
}

/** كم ثانية متبقية قبل السماح بإعادة الإرسال. */
export function resendWaitSeconds(state: VerifyState | null): number {
  if (!state) return 0;
  return Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - state.sentAt)) / 1000));
}

// ---------------------------------------------------------------------------
// رسالة الكود — HTML متجاوب يطابق هوية الموقع
// ---------------------------------------------------------------------------

const BRAND = {
  primary: "#255055",
  primaryDark: "#16383c",
  accent: "#e7b55f",
  cream: "#fbf8f1",
  border: "#e7dfd0",
  muted: "#6b7c7a",
};

export function verificationEmailContent(input: {
  code: string;
  name?: string;
  minutes: number;
  platformName: string;
}): { subject: string; html: string; text: string } {
  const code = input.code;
  const platform = input.platformName;
  const who = input.name?.trim() ? input.name.trim() : "طالبنا العزيز";
  const subject = `${code} هو كود تأكيد حسابك في ${platform}`;

  const text = [
    `مرحباً ${who}،`,
    "",
    `رمزك لتأكيد إنشاء الحساب في ${platform}:`,
    code,
    "",
    `الرمز صالح لمدة ${input.minutes} دقائق ولا يُنشأ الحساب إلا بعد إدخاله.`,
    "إذا لم تطلب هذا الرمز فتجاهله تماماً.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:${BRAND.primaryDark};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">رمزك هو ${code} — صالح ${input.minutes} دقائق فقط</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:24px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});padding:28px 28px 24px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:6px 16px;font-size:13px;color:${BRAND.accent};letter-spacing:.5px;">
                تأكيد البريد الإلكتروني
              </div>
              <h1 style="margin:14px 0 6px;font-size:26px;color:#ffffff;">${platform}</h1>
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,.82);">منصة العربية للتعليم الرقمي</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;text-align:center;">
              <p style="margin:0 0 6px;font-size:17px;font-weight:700;">مرحباً ${escapeHtml(who)} 👋</p>
              <p style="margin:0;font-size:15px;line-height:2;color:${BRAND.muted};">
                أرسلنا إليك رمزاً من <strong style="color:${BRAND.primaryDark};">${code.length} أرقام</strong>
                لتأكيد بريدك وإنشاء حسابك.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 4px;">
              <div style="background:${BRAND.cream};border:2px dashed ${BRAND.border};border-radius:20px;padding:22px 16px;text-align:center;">
                <div style="font-size:44px;font-weight:800;letter-spacing:16px;direction:ltr;color:${BRAND.primary};font-family:Consolas,'Courier New',monospace;">
                  ${code}
                </div>
              </div>
              <p style="margin:16px 0 0;text-align:center;font-size:13px;color:${BRAND.muted};">
                صالح لمدة <strong style="color:${BRAND.primaryDark};">${input.minutes} دقائق</strong> — ولا يُنشأ حسابك إلا بعد إدخاله.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e6;border-radius:16px;">
                <tr>
                  <td style="padding:16px 18px;font-size:13px;line-height:2;color:${BRAND.muted};">
                    <strong style="color:${BRAND.primaryDark};">لم تطلب هذا الرمز؟</strong><br />
                    تجاهل هذه الرسالة ولا تفعل شيئاً — لن يُنشأ أي حساب قبل إدخال الرمز.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px 30px;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.9;color:${BRAND.muted};">
                هذه رسالة آلية من ${platform} — لا ترد عليها.<br />
                رابط الموقع: ${escapeHtml(input.platformName)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

/** يمنع أي نص من كسر قالب الرسالة (اسم الطالب يأتي من المستخدم). */
function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** يعالج خطأ الإرسال ويحوّله إلى رسالة عربية مفهومة للمستخدم. */
export function mailErrorMessage(err: unknown, fallback: string): string {
  const message = (err as Error)?.message ?? "";
  if (/auth|password|login|535|534|530/i.test(message)) {
    logger.error({ err }, "Brevo rejected the SMTP credentials");
    return "تعذّر إرسال الكود بسبب إعداد بريد الخادم. راجع مفاتيح Brevo وحاول بعد قليل.";
  }
  return fallback;
}
