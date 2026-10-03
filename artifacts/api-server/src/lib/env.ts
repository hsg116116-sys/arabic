// ============================================================================
// تحميل متغيرات البيئة من ملف .env في جذر المستودع — مبكراً وبدون اعتماديات.
// السبب: السيرفر يُشغَّل من مجلد الحزمة (artifacts/api-server) أو كملف مبني
// (node dist/index.mjs)، وفي الحالتين لا يرى Vite/tsx/node ملف .env الموجود
// في الجذر تلقائياً. هذا الملف يُستورد كأول سطر في نقاط الدخول فيحمّل .env
// قبل أي قراءة لـ process.env في باقي الوحدات.
// في Vercel لا يلزم الملف — المتغيرات تُحقن تلقائياً — فيُتجاهل بأمان.
// ============================================================================
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // يدعم صيغة `export KEY=value` الشائعة
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rhs] = m;
    let value = rhs.trim();
    // تجاهل التعليق اللاحق خارج الاقتباس:  KEY=val # comment
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
      (value.startsWith("`") && value.endsWith("`") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
      // إزالة اقتباس مفرد حول القيمة إن وُجد جزئياً
      value = value.replace(/^["']|["']$/g, "");
    }
    out[key] = value;
  }
  return out;
}

function candidatePaths(): string[] {
  const list: string[] = [];
  const push = (p?: string) => {
    if (p && !list.includes(p)) list.push(p);
  };
  // 1) مجلد العمل الحالي + الأب + الجذر (يغطي pnpm --filter و node dist)
  push(resolve(process.cwd(), ".env"));
  push(resolve(process.cwd(), "..", ".env"));
  push(resolve(process.cwd(), "..", "..", ".env"));
  // 2) موقع هذا الملف: artifacts/api-server/src/lib → الجذر على بعد 4 مستويات
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    push(resolve(here, ".env"));
    push(resolve(here, "..", "..", "..", "..", ".env"));
    push(resolve(here, "..", "..", ".env"));
  } catch {
    /* تجاهل */
  }
  return list.filter((p) => existsSync(p));
}

export function loadLocalEnvOnce(): void {
  if (loaded) return;
  loaded = true;
  // المتغيرات المحقونة (Vercel / النظام) لها الأولوية — لا نتجاوزها أبداً
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    const hasAnyOptional =
      process.env.IMAGEKIT_1_PRIVATE_KEY || process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY;
    if (hasAnyOptional) return;
    // حتى مع وجود الأساسيات، نكمّل النواقص فقط من .env دون تجاوز الموجود
  }
  for (const p of candidatePaths()) {
    try {
      const parsed = parseDotEnv(readFileSync(p, "utf8"));
      let filled = 0;
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) {
          process.env[k] = v;
          filled++;
        }
      }
      if (filled > 0 || process.env.SUPABASE_URL) return;
    } catch {
      /* جرّب المرشح التالي */
    }
  }
}

// تحميل فوري عند الاستيراد — يكفي وضع `import "./lib/env"` أولاً.
loadLocalEnvOnce();
