// ============================================================================
// نسخ حزمة الـAPI المبنية إلى api/ — لأن Vercel يقدّم /api من هذا الملف.
// بدون هذه الخطوة يبقى الملف مجمّداً عند آخر بناء محلي، فتفشل المسارات الجديدة.
// تُشغَّل بعد `pnpm run build:api` ضمن `pnpm run build:deploy`.
// ============================================================================
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "artifacts/api-server/dist");
const outDir = resolve(root, "api");

// ننسخ ملف الدالة وحده: Vercel considers كل ملف داخل api/ كدالة مستقلة،
// وعمال pino (pino-pretty/worker) لا تُستخدم في الإنتاج أصلاً لأن Logger
// يعطّل الـ transport عند NODE_ENV=production.
const files = ["index.mjs"];

if (!existsSync(dist)) {
  console.error("[copy-api] مجلد البناء غير موجود — شغّل pnpm run build:api أولاً");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const name of files) {
  const from = resolve(dist, name);
  if (!existsSync(from)) continue; // ملفات workers اختيارية (لا تُستخدم في الإنتاج)
  const to = resolve(outDir, name);
  try {
    copyFileSync(from, to);
    copied++;
    console.log(`[copy-api] ${name} → api/${name} (${Math.round(statSync(to).size / 1024)}KB)`);
  } catch (err) {
    console.warn(`[copy-api] تعذّر نسخ ${name}: ${err?.message || err}`);
  }
}

if (!copied) {
  console.error("[copy-api] لم يُنسخ أي ملف — تحقّق من ناتج البناء");
  process.exit(1);
}
console.log(`[copy-api] تم نسخ ${copied} ملف بنجاح`);