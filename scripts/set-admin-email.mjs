// ══════════════════════════════════════════════════════════════════════
//  أرض اللغة | نقل بريد الإدارة
//  يرقّي البريد الجديد إلى admin ويخفض القديم، ويضبط platform_settings.
//  آمن إعادة التشغيل: يقرأ الحالة أولاً فلا يفعل إلا ما يلزم.
// ══════════════════════════════════════════════════════════════════════
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEW_ADMIN = "ahmadalastal12345@gmail.com";
const OLD_ADMIN = "cpshzt@gmail.com";

for (const raw of readFileSync(resolve(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  const [, k, rhs] = m;
  let v = rhs.trim();
  if (/^("|').*\1$/.test(v)) v = v.slice(1, -1);
  if (process.env[k] === undefined) process.env[k] = v;
}

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || "";
if (!URL_BASE || !KEY) {
  console.error("✗ ناقص: SUPABASE_URL / SUPABASE_SECRET_KEY");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "User-Agent": "node", "Content-Type": "application/json" };

async function rest(path, method = "GET", body, extra = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: { ...H, ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const main = async () => {
  console.log(`→ ${URL_BASE}\n`);

  // 1) البريد الجديد: يُرقّى إلى admin (وينشأ ملفه إن لم يوجد)
  const [newProfile] = await rest(`profiles?email=eq.${encodeURIComponent(NEW_ADMIN)}&select=id,email,role,full_name&limit=1`);
  if (!newProfile) {
    console.log(`✗ لا يوجد ملف لـ ${NEW_ADMIN} — سجّل دخوله مرة واحدة أولاً`);
    process.exit(1);
  }
  if (newProfile.role === "admin") {
    console.log(`✓ ${NEW_ADMIN} — admin (كما هو)`);
  } else {
    await rest(`profiles?id=eq.${newProfile.id}`, "PATCH", {
      role: "admin",
      full_name: "الأستاذ أحمد يحيى الأسطل",
      status: "نشط",
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    console.log(`✓ ${NEW_ADMIN} — رُقّي من ${newProfile.role} إلى admin`);
  }

  // 2) البريد القديم: يسقط من الإدارة (يبقى حسابه طالباً)
  const oldRows = await rest(`profiles?email=eq.${encodeURIComponent(OLD_ADMIN)}&select=id,role&limit=1`);
  if (oldRows[0]?.role === "admin") {
    await rest(`profiles?id=eq.${oldRows[0].id}`, "PATCH", {
      role: "student",
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    console.log(`✓ ${OLD_ADMIN} — أُزيل من الإدارة (صار طالباً)`);
  } else {
    console.log(`✓ ${OLD_ADMIN} — ليس في الإدارة أصلاً`);
  }

  // 3) المصدر المعتمد لبريد الإدارة — يُقرأ في كل تسجيل دخول
  const [settings] = await rest("platform_settings?select=id,admin_email&limit=1");
  if (settings?.admin_email === NEW_ADMIN) {
    console.log("✓ platform_settings.admin_email — مضبوط مسبقاً");
  } else {
    await rest(`platform_settings?id=eq.${settings.id}`, "PATCH", {
      admin_email: NEW_ADMIN,
      updated_at: new Date().toISOString(),
    }, { Prefer: "return=minimal" });
    console.log(`✓ platform_settings.admin_email — صار ${NEW_ADMIN}`);
  }

  const admins = await rest("profiles?role=eq.admin&select=email,full_name");
  console.log("\nحسابات الأدمن الآن:");
  for (const a of admins) console.log(`  • ${a.email} — ${a.full_name || ""}`);
};

main().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
