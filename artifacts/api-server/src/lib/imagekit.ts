import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "./logger";

// ============================================================================
// ImageKit — التخزين السحابي للصور والملفات (4 حسابات بتناوب تلقائي)
// القاعدة: الصور وملفات HTML تُرفع هنا، والنص فقط في Supabase.
// المفاتيح السرية تبقى في process.env / .env ولا تصل للمتصفح أبداً.
// ============================================================================

export type ImageKitAccount = {
  id: string;
  endpoint: string;
  publicKey: string;
  privateKey: string;
};

/** تحميل ‎.env‎ المحلي يدوياً (بدون اعتماديات) — في Vercel تُحقن المتغيرات تلقائياً */
export function loadLocalEnvOnce(): void {
  if (process.env.IMAGEKIT_1_PRIVATE_KEY) return;
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", "..", ".env"),
    resolve(process.cwd(), "..", ".env"),
  ];
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      const text = readFileSync(p, "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, key, raw] = m;
        if (process.env[key] !== undefined) continue;
        process.env[key] = raw.replace(/^["']|["']$/g, "");
      }
      if (process.env.IMAGEKIT_1_PRIVATE_KEY) return;
    } catch {
      /* تجاهل وواصل */
    }
  }
}

export function getImageKitAccounts(): ImageKitAccount[] {
  loadLocalEnvOnce();
  const accounts: ImageKitAccount[] = [];
  for (let i = 1; i <= 8; i++) {
    const id = process.env[`IMAGEKIT_${i}_ID`];
    const privateKey = process.env[`IMAGEKIT_${i}_PRIVATE_KEY`];
    if (!id || !privateKey) continue;
    accounts.push({
      id,
      endpoint: (process.env[`IMAGEKIT_${i}_ENDPOINT`] || `https://ik.imagekit.io/${id}`).replace(/\/+$/, ""),
      publicKey: process.env[`IMAGEKIT_${i}_PUBLIC_KEY`] || "",
      privateKey,
    });
  }
  return accounts;
}

let activeIndex = 0;

function basicAuth(privateKey: string): string {
  return "Basic " + Buffer.from(`${privateKey}:`).toString("base64");
}

export type UploadResult = {
  url: string;
  thumbnailUrl: string;
  fileId: string;
  name: string;
  filePath: string;
  size: number;
  accountId: string;
  endpoint: string;
};

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const m = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) {
    // base64 خام بدون غلاف dataURL
    return { buffer: Buffer.from(dataUrl, "base64"), mime: "application/octet-stream" };
  }
  return { buffer: Buffer.from(m[3], "base64"), mime: m[1] || "application/octet-stream" };
}

async function uploadToAccount(
  account: ImageKitAccount,
  buffer: Buffer,
  fileName: string,
  mime: string,
  folder: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), fileName);
  form.append("fileName", fileName);
  form.append("folder", folder.startsWith("/") ? folder : `/${folder}`);
  form.append("useUniqueFileName", "true");
  form.append("tags", "ard-al-lughah");

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: { Authorization: basicAuth(account.privateKey) },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    throw new Error(data?.message || `ImageKit upload failed (${res.status})`);
  }
  return {
    url: data.url,
    thumbnailUrl: data.thumbnailUrl || data.url,
    fileId: data.fileId,
    name: data.name,
    filePath: data.filePath,
    size: data.size || buffer.length,
    accountId: account.id,
    endpoint: account.endpoint,
  };
}

/**
 * رفع ملف مع تناوب تلقائي: يبدأ من الحساب النشط، وعند فشل حساب
 * (امتلاء/خطأ) ينتقل تلقائياً للحساب التالي — حتى 4 حسابات ≈ 12GB.
 */
export async function uploadFile(
  dataUrlOrBase64: string,
  fileName: string,
  folder = "/ard-al-lughah",
  preferredAccountId?: string,
): Promise<UploadResult> {
  const accounts = getImageKitAccounts();
  if (!accounts.length) {
    throw new Error("التخزين السحابي غير مهيأ — أضف مفاتيح IMAGEKIT_* إلى .env");
  }
  const { buffer, mime } = dataUrlToBuffer(dataUrlOrBase64);
  const MAX = 20 * 1024 * 1024;
  if (buffer.length > MAX) {
    throw new Error("حجم الملف يتجاوز 20MB — صغّر الصورة وحاول مجدداً");
  }
  const safeName = (fileName || `file-${Date.now()}`).replace(/[^\w.\-()\[\] ]+/g, "_").slice(0, 120);

  let start = activeIndex % accounts.length;
  if (preferredAccountId) {
    const idx = accounts.findIndex((a) => a.id === preferredAccountId);
    if (idx >= 0) start = idx;
  }

  const errors: string[] = [];
  for (let step = 0; step < accounts.length; step++) {
    const idx = (start + step) % accounts.length;
    try {
      const result = await uploadToAccount(accounts[idx], buffer, safeName, mime, folder);
      activeIndex = idx; // الحساب الناجح يبقى نشطاً
      return result;
    } catch (err: any) {
      errors.push(`${accounts[idx].id}: ${err?.message || err}`);
      logger.warn({ account: accounts[idx].id, err }, "ImageKit upload failed, rotating");
    }
  }
  throw new Error("تعذر الرفع على كل حسابات التخزين: " + errors.join(" | "));
}

export async function deleteFileById(fileId: string, accountId?: string): Promise<void> {
  const accounts = getImageKitAccounts();
  const targets = accountId ? accounts.filter((a) => a.id === accountId) : accounts;
  if (!targets.length) throw new Error("لا توجد حسابات تخزين مهيأة");
  const errors: string[] = [];
  for (const acc of targets) {
    const res = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: basicAuth(acc.privateKey) },
    });
    if (res.ok || res.status === 404) return;
    const t = await res.text().catch(() => "");
    errors.push(`${acc.id}: ${t.slice(0, 120)}`);
  }
  throw new Error("تعذر حذف الملف: " + errors.join(" | "));
}

/** حذف بواسطة الرابط الكامل (يستخرج الحساب والمسار من الرابط نفسه) */
export async function deleteFileByUrl(url: string): Promise<void> {
  const accounts = getImageKitAccounts();
  const acc = accounts.find((a) => url.startsWith(a.endpoint + "/"));
  if (!acc) throw new Error("الرابط ليس من حسابات التخزين المعروفة");
  const filePath = "/" + url.slice(acc.endpoint.length + 1).split("?")[0];
  const res = await fetch(
    `https://api.imagekit.io/v1/files?limit=1000&searchQuery=${encodeURIComponent(`path:"${filePath}"`)}`,
    { headers: { Authorization: basicAuth(acc.privateKey) } },
  );
  if (!res.ok) throw new Error("تعذر البحث عن الملف في التخزين");
  const list = (await res.json().catch(() => [])) as any[];
  const hit = Array.isArray(list) ? list.find((f) => f.filePath === filePath) || list[0] : null;
  if (!hit?.fileId) throw new Error("الملف غير موجود في التخزين");
  await deleteFileById(hit.fileId, acc.id);
}

export function getStorageStatus() {
  const accounts = getImageKitAccounts();
  return {
    configured: accounts.length,
    accounts: accounts.map((a, i) => ({
      id: a.id,
      endpoint: a.endpoint,
      active: i === activeIndex % Math.max(accounts.length, 1),
    })),
    activeAccountId: accounts.length ? accounts[activeIndex % accounts.length].id : null,
    maxFileMB: 20,
  };
}
