import { writeFileSync } from "node:fs";

const LEVEL_IDS = [
  "f1000000-0000-4000-8000-000000000000",
  "f1000000-0000-4000-8000-000000000001",
  "f1000000-0000-4000-8000-000000000002",
  "f1000000-0000-4000-8000-000000000003",
  "f1000000-0000-4000-8000-000000000004",
  "f1000000-0000-4000-8000-000000000005",
  "f1000000-0000-4000-8000-000000000006",
  "f1000000-0000-4000-8000-000000000007",
  "f1000000-0000-4000-8000-000000000008",
  "f1000000-0000-4000-8000-000000000009",
];

const LEVELS = [
  {
    id: LEVEL_IDS[0],
    levelNumber: 0,
    subtitle: "المستوى 0",
    title: "المهارات الأولى",
    description: "اللبنات الأساسية للغة العربية: الحروف وأشكالها ومخارجها، الحركات والشدة والتنوين والمدود، اللام الشمسية والقمرية والهمزات.",
    color: "#17413f",
    icon: "sparkles",
    lessons: [
      { num: 1, title: "الحروف العربية وأشكالها ومخارجها" },
      { num: 2, title: "الحركات والسكون والشدة" },
      { num: 3, title: "التنوين" },
      { num: 4, title: "المدود" },
      { num: 5, title: "اللام الشمسية والقمرية" },
      { num: 6, title: "همزة الوصل وهمزة القطع" },
      { num: 7, title: "التاء المربوطة والمفتوحة والهاء" },
      { num: 8, title: "الألف اللينة (الأساس)" },
    ],
  },
  {
    id: LEVEL_IDS[1],
    levelNumber: 1,
    subtitle: "المستوى 1",
    title: "أساسيات الكلام والجملة",
    description: "بناء الجملة وأركانها: أقسام الكلمة، المفرد والمثنى والجمع، الضمائر والمعارف، وأركان الجملتين الاسمية والفعلية وأسس الإعراب.",
    color: "#0d47a1",
    icon: "landmark",
    lessons: [
      { num: 9, title: "أقسام الكلمة" },
      { num: 10, title: "المفرد والمثنى والجمع" },
      { num: 11, title: "المذكر والمؤنث" },
      { num: 12, title: "النكرة والمعرفة" },
      { num: 13, title: "الضمائر" },
      { num: 14, title: "أسماء الإشارة والأسماء الموصولة" },
      { num: 15, title: "الفعل: ماضٍ ومضارع وأمر" },
      { num: 16, title: "الجملة الاسمية: المبتدأ والخبر" },
      { num: 17, title: "الجملة الفعلية: الفعل والفاعل" },
      { num: 18, title: "المفعول به" },
      { num: 19, title: "حروف الجر" },
      { num: 20, title: "الإعراب والبناء وعلامات الإعراب الأصلية" },
    ],
  },
  {
    id: LEVEL_IDS[2],
    levelNumber: 2,
    subtitle: "المستوى 2",
    title: "النحو التطبيقي",
    description: "إعراب وتطبيق متقدم: علامات الإعراب الفرعية، صور الخبر والفاعل، النواسخ والتوابع، والحال والتمييز.",
    color: "#2f7772",
    icon: "library",
    lessons: [
      { num: 21, title: "علامات الإعراب الفرعية" },
      { num: 22, title: "المعرب والمبني والأسماء المبنية" },
      { num: 23, title: "صور الخبر" },
      { num: 24, title: "اللازم والمتعدي وصور الفاعل والمفعول به" },
      { num: 25, title: "المبني للمعلوم والمبني للمجهول ونائب الفاعل" },
      { num: 26, title: "الإضافة" },
      { num: 27, title: "النعت" },
      { num: 28, title: "العطف" },
      { num: 29, title: "التوكيد" },
      { num: 30, title: "البدل" },
      { num: 31, title: "كان وأخواتها" },
      { num: 32, title: "إنّ وأخواتها" },
      { num: 33, title: "كاد وأخواتها" },
      { num: 34, title: "الحال" },
      { num: 35, title: "التمييز" },
    ],
  },
  {
    id: LEVEL_IDS[3],
    levelNumber: 3,
    subtitle: "المستوى 3",
    title: "النحو المتقدم",
    description: "المفاعيل الخمسة، أساليب الاستثناء والنداء والشرط، العدد، الممنوع من الصرف، إعراب المضارع، والجمل التي لها محل.",
    color: "#6a1b9a",
    icon: "target",
    lessons: [
      { num: 36, title: "المفعول المطلق" },
      { num: 37, title: "المفعول لأجله" },
      { num: 38, title: "المفعول فيه (الظرف)" },
      { num: 39, title: "المفعول معه" },
      { num: 40, title: "الاستثناء" },
      { num: 41, title: "النداء" },
      { num: 42, title: "العدد" },
      { num: 43, title: "اسم التفضيل" },
      { num: 44, title: "اسم الفعل" },
      { num: 45, title: "الجر بحرف الجر وبالإضافة" },
      { num: 46, title: "الممنوع من الصرف" },
      { num: 47, title: "إعراب المضارع والأفعال الخمسة" },
      { num: 48, title: "أدوات الشرط وجزم المضارع" },
      { num: 49, title: "المعاني النحوية للحروف ومعاني حروف الجر" },
      { num: 50, title: "الجمل التي لها محل من الإعراب" },
      { num: 51, title: "تطبيقات إعرابية شاملة" },
    ],
  },
  {
    id: LEVEL_IDS[4],
    levelNumber: 4,
    subtitle: "المستوى 4",
    title: "الصرف",
    description: "بنية الكلمة وميزانها: الميزان الصرفي، المجرد والمزيد، الصحيح والمعتل، المشتقات، المصادر، والإعلال والإبدال.",
    color: "#8a508f",
    icon: "package",
    lessons: [
      { num: 52, title: "الجذر والميزان الصرفي" },
      { num: 53, title: "المجرد والمزيد" },
      { num: 54, title: "الفعل الصحيح" },
      { num: 55, title: "الفعل المعتل" },
      { num: 56, title: "بناء الفعل الماضي وفعل الأمر" },
      { num: 57, title: "تصريف الفعل مع الضمائر" },
      { num: 58, title: "معاني زيادات الأفعال" },
      { num: 59, title: "المصادر" },
      { num: 60, title: "اسم الفاعل" },
      { num: 61, title: "اسم المفعول" },
      { num: 62, title: "صيغ المبالغة والصفة المشبهة" },
      { num: 63, title: "اسم الآلة واسم الزمان والمكان" },
      { num: 64, title: "التصغير والنسب" },
      { num: 65, title: "جمع التكسير" },
      { num: 66, title: "الإعلال" },
      { num: 67, title: "الإبدال" },
    ],
  },
  {
    id: LEVEL_IDS[5],
    levelNumber: 5,
    subtitle: "المستوى 5",
    title: "الإملاء",
    description: "قواعد الرسم الإملائي الصحيح: الهمزات المتوسطة والمتطرفة، الألف اللينة، الحروف التي تُكتب ولا تُلفظ، وعلامات الترقيم.",
    color: "#a85d3d",
    icon: "award",
    lessons: [
      { num: 68, title: "الهمزة المتوسطة" },
      { num: 69, title: "الهمزة المتطرفة" },
      { num: 70, title: "همزة ابن وابنة" },
      { num: 71, title: "الألف اللينة في الأفعال والأسماء" },
      { num: 72, title: "ما يُكتب ولا يُلفظ وما يُلفظ ولا يُكتب" },
      { num: 73, title: "علامات الترقيم" },
      { num: 74, title: "الأخطاء الإملائية الشائعة" },
    ],
  },
  {
    id: LEVEL_IDS[6],
    levelNumber: 6,
    subtitle: "المستوى 6",
    title: "القراءة والتعبير",
    description: "فنون الفهم والإنتاج الكتابي: الفهم القرائي، التلخيص، كتابة الفقرة والمقال، الرسائل الإخوانية والرسمية، والقصة الإبداعية.",
    color: "#b7791f",
    icon: "book-open",
    lessons: [
      { num: 75, title: "الفهم القرائي" },
      { num: 76, title: "التلخيص" },
      { num: 77, title: "كتابة الفقرة" },
      { num: 78, title: "الرسالة الإخوانية" },
      { num: 79, title: "الإعلان والتقرير ومحضر الاجتماع" },
      { num: 80, title: "السيرة الذاتية والتهنئة والتعزية" },
      { num: 81, title: "المقالة" },
      { num: 82, title: "القصة والتعبير الإبداعي" },
    ],
  },
  {
    id: LEVEL_IDS[7],
    levelNumber: 7,
    subtitle: "المستوى 7",
    title: "البلاغة",
    description: "تذوق جماليات البيان والمعاني والبديع: التشبيه والاستعارة والكناية، الإنشاء والخبر، المحسنات اللفظية والمعنوية، وتحليل النصوص.",
    color: "#5d4037",
    icon: "sparkles",
    lessons: [
      { num: 83, title: "الحقيقة والمجاز" },
      { num: 84, title: "التشبيه" },
      { num: 85, title: "الاستعارة المكنية والتصريحية" },
      { num: 86, title: "الكناية والمجاز المرسل" },
      { num: 87, title: "الخبر: أغراضه ومؤكداته وأضربه" },
      { num: 88, title: "الإنشاء الطلبي" },
      { num: 89, title: "الطباق والمقابلة" },
      { num: 90, title: "الجناس والسجع" },
      { num: 91, title: "التقسيم والتورية" },
      { num: 92, title: "الإيجاز والإطناب" },
      { num: 93, title: "تحليل نص بلاغيًا" },
    ],
  },
  {
    id: LEVEL_IDS[8],
    levelNumber: 8,
    subtitle: "المستوى 8",
    title: "العروض",
    description: "موسيقى الشعر وأوزانه: المقاطع والتفعيلات، الكتابة العروضية والتقطيع، والبحور الشعرية الشهيرة والقافية.",
    color: "#00695c",
    icon: "scroll-text",
    lessons: [
      { num: 94, title: "المقاطع الصوتية والتفعيلات" },
      { num: 95, title: "الكتابة العروضية والتقطيع" },
      { num: 96, title: "المتقارب" },
      { num: 97, title: "الكامل" },
      { num: 98, title: "الهزج" },
      { num: 99, title: "المحدَث" },
      { num: 100, title: "الوافر" },
      { num: 101, title: "الطويل" },
      { num: 102, title: "البسيط" },
      { num: 103, title: "الخفيف" },
      { num: 104, title: "القافية" },
    ],
  },
  {
    id: LEVEL_IDS[9],
    levelNumber: 9,
    subtitle: "المستوى 9",
    title: "الأدب والنصوص",
    description: "رحلة في عصور الأدب وفنونه: دراسة النصوص الشعرية والنثرية، المعلقات، فنون النثر والشعر الحديث، ونماذج تدريبية شاملة.",
    color: "#37474f",
    icon: "castle",
    lessons: [
      { num: 105, title: "كيف تدرس النص الشعري" },
      { num: 106, title: "كيف تدرس النص النثري" },
      { num: 107, title: "عصور الأدب العربي القديم" },
      { num: 108, title: "المعلقات" },
      { num: 109, title: "فن الوصف" },
      { num: 110, title: "شعر الحماسة" },
      { num: 111, title: "التجديد في العصر العباسي" },
      { num: 112, title: "الغزل" },
      { num: 113, title: "الرثاء" },
      { num: 114, title: "الموشحات" },
      { num: 115, title: "فن الخطبة" },
      { num: 116, title: "فن المقامة" },
      { num: 117, title: "المدارس الشعرية الحديثة" },
      { num: 118, title: "اتجاهات الشعر المعاصر" },
      { num: 119, title: "ظاهرة الاغتراب" },
      { num: 120, title: "الشعر الفلسطيني الحديث" },
      { num: 121, title: "القصة القصيرة" },
      { num: 122, title: "الرواية" },
      { num: 123, title: "المسرحية" },
      { num: 124, title: "نماذج وامتحانات تدريبية شاملة" },
    ],
  },
];

function esc(s) {
  return String(s || "").replace(/'/g, "''");
}

function lessonId(num) {
  return "f2000000-0000-4000-8000-" + String(num).padStart(12, "0");
}

let out = `-- ====================================================================
-- منصة 'أرض اللغة' — قسم إعداد التأسيس الشامل (V11)
-- 10 مستويات كاملة من المستوى 0 إلى المستوى 9 (124 درساً)
-- ====================================================================

-- 1) تنظيف الأقسام والدروس السابقة بأمان
DELETE FROM public.foundation_sections;

-- 2) إدراج المستويات العشرة
INSERT INTO public.foundation_sections (id, title, subtitle, description, color, icon, sort_order, is_locked, is_visible, is_published)
VALUES
`;

const sectionVals = LEVELS.map((l, i) =>
  `  ('${l.id}', '${esc(l.title)}', '${esc(l.subtitle)}', '${esc(l.description)}', '${l.color}', '${l.icon}', ${i + 1}, false, true, true)`
).join(",\n");

out += sectionVals + ";\n\n-- 3) إدراج الدروس الـ 124\nINSERT INTO public.foundation_lessons (id, section_id, title, description, kind, body_text, position, is_locked, is_visible)\nVALUES\n";

const lessonVals = [];
LEVELS.forEach((level) => {
  level.lessons.forEach((l, idx) => {
    lessonVals.push(
      `  ('${lessonId(l.num)}', '${level.id}', '${esc(l.title)}', 'الدرس ${l.num} من مسار التأسيس الشامل', 'text', '', ${idx + 1}, false, true)`
    );
  });
});

out += lessonVals.join(",\n") + ";\n\n";

out += `-- 4) فتح المستويات العشرة لجميع الطلاب المسجلين
INSERT INTO public.foundation_members (section_id, user_id)
SELECT s.id, p.id
FROM public.foundation_sections s
CROSS JOIN public.profiles p
WHERE p.role = 'student'
ON CONFLICT (section_id, user_id) DO NOTHING;
`;

writeFileSync("sql_foundation_curriculum_v11.sql", out, "utf8");
console.log("sql_foundation_curriculum_v11.sql generated successfully! Total lessons: " + lessonVals.length);
