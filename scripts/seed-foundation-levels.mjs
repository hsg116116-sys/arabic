// ══════════════════════════════════════════════════════════════════════
//  أرض اللغة | زرع إعداد التأسيس — خمسة مستويات · خمسون درساً
// ──────────────────────────────────────────────────────────────────────
//  ما يفعله هذا الملف:
//    1) ينشئ/يضمن خمسة أقسام في foundation_sections (المستويات الخمسة)
//    2) ينشئ/يضمن خمسين درساً في foundation_lessons — المحتوى كله فاضي
//       عمداً: الأستاذ يكتب نص كل درس من لوحة «إعداد التأسيس» بنفسه
//    3) يفتح المستويات الخمسة لكل الطلاب المسجّلين (foundation_members)
//    4) — إن كان جدول الأقسام الفرعية منفّذاً (sql_foundation_units_v10.sql) —
//       ينشئ 15 قسماً فرعياً (ثلاثة لكل مستوى) ويوزّع عليها الدروس
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

/* ──────────────────────────────────────────────────────────────────────
   الأقسام الفرعية — ثلاثة لكل مستوى.
   كل قسم يحدّد المدى (from..to) من مواضع الدروس العشرة في nivelه،
   فالزرع يضع كل درس في قسمه الصحيح بلا تخمين.
   ────────────────────────────────────────────────────────────────────── */
const UNIT_GROUPS = [
  [
    { suffix: "01", title: "الجملة وأنواعها", description: "ما الجملة؟ وكيف تختلف الاسمية عن الفعلية في التركيب والإعراب.", icon: "book-open", from: 1, to: 3 },
    { suffix: "02", title: "أقسام الكلمة وعددها", description: "الكلمة وحدها: نوعها وعددها وتذكيرها وتأنيثها.", icon: "library", from: 4, to: 5 },
    { suffix: "03", title: "أدوات المعاني", description: "الضمائر والإشارة والوصل والنكرة والمعرفة وحروف الجر.", icon: "scroll-text", from: 6, to: 10 },
  ],
  [
    { suffix: "01", title: "الجملة المركّبة", description: "كان وأخواتها، وإن وأخواتها، والإضافة والعطف.", icon: "landmark", from: 1, to: 2 },
    { suffix: "02", title: "العلاقات النحوية", description: "النعت والعطف والشرط والمفعول به والمفعول المطلق.", icon: "target", from: 3, to: 7 },
    { suffix: "03", title: "الإعراب والتطبيقات", description: "الحال والتمييز وعلامات الإعراب ثم تطبيقات شاملة.", icon: "award", from: 8, to: 10 },
  ],
  [
    { suffix: "01", title: "بنية الكلمة صرفياً", description: "الجذر والميزان والمجرد والمزيد والفعل الصحيح والمعتل.", icon: "scroll-text", from: 1, to: 4 },
    { suffix: "02", title: "المشتقات", description: "المصادر واسم الفاعل والمفعول والصفة المشبهة والآلة.", icon: "library", from: 5, to: 8 },
    { suffix: "03", title: "صيغ الكلمة وتطبيقاتها", description: "التصغير وجمع التكسير والاشتقاق.", icon: "sparkles", from: 9, to: 10 },
  ],
  [
    { suffix: "01", title: "الصورة البيانية", description: "التشبيه والاستعارة والكناية والمجاز المرسل.", icon: "sparkles", from: 1, to: 4 },
    { suffix: "02", title: "المحسّنات البديعية", description: "المحسّنات اللفظية والمعنوية.", icon: "award", from: 5, to: 6 },
    { suffix: "03", title: "أساليب الخطاب", description: "الخبر والإنشاء، والتقديم والتأخير، والإيجاز والإطناب.", icon: "target", from: 7, to: 10 },
  ],
  [
    { suffix: "01", title: "قواعد الإملاء", description: "الهمزة والتاء والألف اللينة واللام والتنوين والترقيم.", icon: "shield-check", from: 1, to: 5 },
    { suffix: "02", title: "فنون الكتابة", description: "كتابة الفقرة والمقال والرسالة.", icon: "book-open", from: 6, to: 8 },
    { suffix: "03", title: "القراءة والتلخيص", description: "الفهم القرائي ثم التلخيص والتوسع.", icon: "library", from: 9, to: 10 },
  ],
];

/** معرّف قسم فرعي ثابت — نفس المنطق في ملف V10 حتى لا يتكرر الزرع مرتين */
function unitId(levelIndex, unitIndex) {
  const hex = (n) => n.toString(16).padStart(4, "0");
  return `u${hex(levelIndex + 1)}${hex(unitIndex + 1)}-0000-4000-8000-${String(levelIndex + 1).padStart(8, "0")}${String(unitIndex + 1).padStart(4, "0")}`;
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

  // ── الأقسام الفرعية (اختيارية — تتطلّب sql_foundation_units_v10.sql) ──
  const unitRows = UNIT_GROUPS.flatMap((groups, levelIndex) =>
    groups.map((g, unitIndex) => ({
      id: unitId(levelIndex, unitIndex),
      section_id: LEVELS[levelIndex].id,
      title: g.title,
      description: g.description,
      cover_url: "",
      color: "",
      icon: g.icon,
      sort_order: unitIndex + 1,
      is_locked: false,
      is_visible: true,
    })),
  );

  let unitsReady = true;
  try {
    await rest("foundation_units?select=id&limit=1");
  } catch {
    unitsReady = false;
  }

  if (unitsReady) {
    const newUnits = await insertIgnoringDuplicates("foundation_units", unitRows);
    console.log(`✓ الأقسام الفرعية: ${unitRows.length} قسم (أُضيف ${newUnits})`);

    // توزيع الدروس على أقسامها — نpatch فقط الدروس التي بلا قسم بعد
    let assigned = 0;
    for (let levelIndex = 0; levelIndex < UNIT_GROUPS.length; levelIndex++) {
      const groups = UNIT_GROUPS[levelIndex];
      for (let unitIndex = 0; unitIndex < groups.length; unitIndex++) {
        const g = groups[unitIndex];
        const ids = LEVELS[levelIndex].lessons
          .map((_, lessonIndex) => lessonId(levelIndex, lessonIndex))
          .slice(g.from - 1, g.to);
        if (!ids.length) continue;
        await rest(
          `foundation_lessons?id=in.(${ids.join(",")})&unit_id=is.null`,
          "PATCH",
          { unit_id: unitId(levelIndex, unitIndex), updated_at: new Date().toISOString() },
          { Prefer: "return=minimal" },
        );
        assigned += ids.length;
      }
    }
    console.log(`✓ التوزيع : ${assigned} درس وُضع تحت أقسامه`);
  } else {
    console.log("⚠ الأقسام الفرعية: الجدول غير موجود — نفّذ sql_foundation_units_v10.sql ثم أعد تشغيل هذا الملف");
  }

  // فتح المستويات لكل الطلاب — رابط واحد لكل (قسم × طالب)
  const students = (await rest("profiles?select=id&role=eq.student&limit=5000")) || [];
  if (students.length) {
    // نقرأ العضويات الموجودة أولاً: الترقيم العام بلا هدف يتجاهل المكرر،
    // لكن الاعتماد عليه في كل إصدارات PostgREST غير مضمون — والفلترة هنا مضمونة.
    const existingRows = [];
    for (const sectionId of LEVEL_IDS) {
      const rows = (await rest(
        `foundation_members?section_id=eq.${sectionId}&select=user_id&limit=20000`,
      )) || [];
      for (const r of rows) existingRows.push(`${sectionId}|${r.user_id}`);
    }
    const existing = new Set(existingRows);
    const memberRows = students
      .flatMap((p) => LEVEL_IDS.map((sectionId) => ({ section_id: sectionId, user_id: p.id })))
      .filter((row) => !existing.has(`${row.section_id}|${row.user_id}`));

    if (memberRows.length) {
      // PostgREST يقبل 1000 صف في الطلب الواحد — نقسّم Larger على دفعات
      for (let i = 0; i < memberRows.length; i += 500) {
        await rest("foundation_members", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: memberRows.slice(i, i + 500),
        });
      }
    }
    console.log(`✓ الأعضاء   : ${students.length} طالب · أُضيف ${memberRows.length} عضوية`);
  } else {
    console.log("✓ الأعضاء   : لا يوجد طلاب بعد — سيُضافون تلقائياً عند التسجيل");
  }

  console.log(`\nتم بنجاح — ${LEVELS.length} مستويات · ${unitRows.length} أقسام فرعية · ${lessonRows.length} درس.`);
  console.log("افتح: بوابة الطالب ← التأسيس.");
}

main().catch((err) => {
  console.error(`\n✗ فشل الزرع: ${err.message}`);
  console.error("  تأكد من تنفيذ sql_foundation_v7.sql أولاً (جداول foundation_*).");
  process.exit(1);
});
