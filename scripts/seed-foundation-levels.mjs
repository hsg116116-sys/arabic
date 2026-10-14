// ══════════════════════════════════════════════════════════════════════
//  أرض اللغة | زرع إعداد التأسيس — خمسة مستويات · خمسون درساً
// ──────────────────────────────────────────────────────────────────────
//  ما يفعله هذا الملف:
//    1) ينشئ/يضمن خمسة أقسام في foundation_sections (المستويات الخمسة)
//    2) ينشئ/يضمن خمسين درساً في foundation_lessons — المحتوى كله فاضي
//       عمداً: الأستاذ يكتب نص كل درس من لوحة «إعداد التأسيس» بنفسه
//    3) يفتح المستويات الخمسة لكل الطلاب المسجّلين (foundation_members)
//
//  طريقة التشغيل (من جذر المستودع):
//    node scripts/seed-foundation-levels.mjs
//
//  آمن إعادة التشغيل: إدراج بـ ON CONFLICT DO NOTHING عبر
//  Prefer: resolution=ignore-duplicates — لا يمسح ولا يغيّر أي نص كتبه
//  الأستاذ لاحقاً. يزرع الناقص فقط.
//  ──────────────────────────────────────────────────────────────────────
//  المتطلبات: SUPABASE_URL و SUPABASE_SECRET_KEY في ملف .env (أو في البيئة).
// ══════════════════════════════════════════════════════════════════════
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── 1) تحميل .env من الجذر (نفس منهج السيرفر) ──
function loadEnv() {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rhs] = m;
    let value = rhs.trim();
    if (/^("|').*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
if (!SUPABASE_URL || !KEY) {
  console.error("✗ ناقص: SUPABASE_URL أو SUPABASE_SECRET_KEY — ضعهما في .env ثم أعد التشغيل.");
  process.exit(1);
}

const HEADERS = {
  "Content-Type": "application/json",
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

/** طلب REST إلى Supabase — يرمي خطأً واضحاً عند الفشل حتى لا نُخفي زرعاً ناقصاً */
async function rest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: { ...HEADERS, ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} → ${res.status} ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** إدراج جماعي مع تجاهل المكرر — يعيد عدد الصفوف المُدخلة فعلاً */
async function insertIgnoringDuplicates(table, rows) {
  const before = await rest(`${table}?select=id`);
  const existing = new Set((before || []).map((r) => r.id));
  const fresh = rows.filter((r) => !existing.has(r.id));
  if (!fresh.length) return 0;
  const inserted = await rest(table, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: fresh,
  });
  void inserted;
  return fresh.length;
}

// ──────────────────────────────────────────────────────────────────────
//  المستويات الخمسة — كل مستوى عشرة دروس
//  المعرّفات ثابتة (UUID حرفية): يتعرّف عليها السيرفر كـ«مستويات الموقع»
//  فيدخل الطالب الجديد إليها تلقائياً.
// ──────────────────────────────────────────────────────────────────────
const LEVEL_IDS = [
  "f1000000-0000-4000-8000-000000000001",
  "f1000000-0000-4000-8000-000000000002",
  "f1000000-0000-4000-8000-000000000003",
  "f1000000-0000-4000-8000-000000000004",
  "f1000000-0000-4000-8000-000000000005",
];

const LEVELS = [
  {
    id: LEVEL_IDS[0],
    title: "أساسيات النحو والتركيب",
    subtitle: "المستوى الأول",
    description:
      "نحكم على كل كلمة: أقسامها، والجملة التي تنتمي إليها، وعلامة إعرابها. هنا تبدأ الرحلة — من الجملة إلى الكلمة.",
    color: "#17413f",
    icon: "landmark",
    lessons: [
      "أقسام الكلمة",
      "الجملة الاسمية",
      "الجملة الفعلية",
      "المفرد والمثنى والجمع",
      "المذكر والمؤنث",
      "الضمائر",
      "أدوات الإشارة والأسماء الموصولة",
      "النكرة والمعرفة",
      "حروف الجر",
      "الأساليب الأساسية",
    ],
  },
  {
    id: LEVEL_IDS[1],
    title: "النحو التطبيقي",
    subtitle: "المستوى الثاني",
    description:
      "ما في الإعراب يُبنى على الجملة كلها: كان وأخواتها، وإن وأخواتها، والإضافة، والعطف — من الفهم إلى التطبيق.",
    color: "#0d47a1",
    icon: "library",
    lessons: [
      "كان وأخواتها",
      "إن وأخواتها",
      "النعت والمنعوت",
      "العطف",
      "الإضافة",
      "أدوات الشرط",
      "المفعول به والمفعول المطلق",
      "الحال والتمييز",
      "علامات الإعراب الأصلية والفرعية",
      "تطبيقات إعرابية شاملة",
    ],
  },
  {
    id: LEVEL_IDS[2],
    title: "الصرف",
    subtitle: "المستوى الثالث",
    description:
      "من أين جاءت الكلمة؟ جذرها ووزنها، ومزيدها، ومشتقاتها. هنا يتغيّر النظر — تصير الكلمة شجرة لها أغصان.",
    color: "#6a1b9a",
    icon: "scroll-text",
    lessons: [
      "الجذر والميزان الصرفي",
      "الفعل الصحيح والمعتل",
      "المجرد والمزيد",
      "تصريف الفعل مع الضمائر",
      "المصادر",
      "اسم الفاعل واسم المفعول",
      "الصفة المشبهة واسم الآلة",
      "اسم المكان والزمان",
      "التصغير وجمع التكسير",
      "الاشتقاق وتطبيقاته",
    ],
  },
  {
    id: LEVEL_IDS[3],
    title: "البلاغة",
    subtitle: "المستوى الرابع",
    description:
      "نقرأ النص الجميل: تشبيه واستعارة وكناية ومجاز ومحسّنات بديعية. هنا نتعلّم لماذا اختيار الشاعر كلمة دون أخرى.",
    color: "#a85d3d",
    icon: "sparkles",
    lessons: [
      "التشبيه",
      "الاستعارة",
      "الكناية",
      "المجاز المرسل",
      "المحسنات البديعية اللفظية",
      "المحسنات البديعية المعنوية",
      "الجملة الخبرية والإنشائية",
      "التقديم والتأخير",
      "الإيجاز والإطناب",
      "تحليل نص أدبي بلاغياً",
    ],
  },
  {
    id: LEVEL_IDS[4],
    title: "الإملاء والتعبير والقراءة",
    subtitle: "المستوى الخامس",
    description:
      "نثبت الكلمة كتابةً صحيحة، ونكتب فقرة ومقالاً ورسالة بلغةٍ سليمة، ونتلخّص ونوسّع المعنى — من الفهم إلى الإنتاج.",
    color: "#b7791f",
    icon: "book-open",
    lessons: [
      "الهمزة",
      "التاء المفتوحة والمربوطة",
      "الألف اللينة",
      "اللام الشمسية والقمرية",
      "التنوين وعلامات الترقيم",
      "كتابة الفقرة",
      "كتابة المقال",
      "كتابة الرسالة",
      "الفهم القرائي",
      "التلخيص والتوسع",
    ],
  },
];

/** معرّف درس ثابت مشتق من رقم المستوى ورقم الدرس — إعادة الزرع تُطابق نفسها */
function lessonId(levelIndex, lessonIndex) {
  const hex = (n) => n.toString(16).padStart(4, "0");
  return `f${levelIndex + 1}02${hex(lessonIndex + 1)}-0000-4000-8000-${String(levelIndex + 1).padStart(8, "0")}${String(lessonIndex + 1).padStart(4, "0")}`;
}

// ──────────────────────────────────────────────────────────────────────
//  التنفيذ
// ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`→ القاعدة: ${SUPABASE_URL}\n`);

  const sectionRows = LEVELS.map((level, i) => ({
    id: level.id,
    title: level.title,
    subtitle: level.subtitle,
    description: level.description,
    cover_url: "",
    color: level.color,
    icon: level.icon,
    sort_order: i + 1,
    is_locked: false,
    is_visible: true,
    is_published: true,
  }));

  const lessonRows = LEVELS.flatMap((level, levelIndex) =>
    level.lessons.map((title, lessonIndex) => ({
      id: lessonId(levelIndex, lessonIndex),
      section_id: level.id,
      title,
      description: "",
      kind: "text",
      body_text: "",
      cover_url: "",
      images: [],
      video_url: "",
      video_caption: "",
      html_content: "",
      html_file_url: "",
      position: lessonIndex + 1,
      is_locked: false,
      is_visible: true,
    })),
  );

  const newSections = await insertIgnoringDuplicates("foundation_sections", sectionRows);
  console.log(`✓ الأقسام   : ${LEVELS.length} مستوى (أُضيف ${newSections})`);

  const newLessons = await insertIgnoringDuplicates("foundation_lessons", lessonRows);
  console.log(`✓ الدروس   : ${lessonRows.length} درس (أُضيف ${newLessons})`);

  // فتح المستويات لكل الطلاب — رابط واحد لكل (قسم × طالب)
  const students = (await rest("profiles?select=id&role=eq.student&limit=5000")) || [];
  const memberRows = students.flatMap((p) => LEVEL_IDS.map((sectionId) => ({ section_id: sectionId, user_id: p.id })));
  let newMembers = 0;
  if (memberRows.length) {
    // foundation_members لا تكرار فيها (unique) — نتجاهل المكرر كما هي
    const inserted = await rest("foundation_members", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: memberRows,
    });
    void inserted;
    const after = (await rest("foundation_members?section_id=in.(" + LEVEL_IDS.join(",") + ")&select=id&limit=20000")) || [];
    newMembers = after.length;
    console.log(`✓ الأعضاء   : ${students.length} طالب · ${newMembers} عضوية مفتوحة`);
  } else {
    console.log("✓ الأعضاء   : لا يوجد طلاب بعد — سيُضافون تلقائياً عند التسجيل");
  }

  console.log(`\nتم بنجاح — ${LEVELS.length} مستويات · ${lessonRows.length} درس. افتح: بوابة الطالب ← التأسيس.`);
}

main().catch((err) => {
  console.error(`\n✗ فشل الزرع: ${err.message}`);
  console.error("  تأكد من تنفيذ sql_foundation_v7.sql أولاً (جداول foundation_*).");
  process.exit(1);
});
