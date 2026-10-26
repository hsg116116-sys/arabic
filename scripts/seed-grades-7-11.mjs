/* ============================================================================
   بذر الصف السابع + الصف الحادي عشر (أدبي/علمي) — كتب + وحدات + دروس
   ----------------------------------------------------------------------------
   يستخدمه المطوّر مرة واحدة. يقرأ SUPABASE_URL و SUPABASE_SECRET_KEY من .env
   ثم يرفع البيانات عبر PostgREST (upsert آمن) ويكتب ملف SQL مرافقاً.
   التشغيل: node scripts/seed-grades-7-11.mjs
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'artifacts', 'ard-al-lughah');
const PUBLIC = path.join(WEB, 'public');
const BOOKS = path.join(PUBLIC, 'books');
/* الأصول الأصلية كما وصلت (أغلفة وكتب PDF) — تُحفظ خارج public حتى لا تُنشر نسخاً مكررة. */
const SOURCES = path.join(WEB, 'seed-assets');

/* ── 1) إعداد الاتصال ───────────────────────────────────────────────────── */
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/);
const envGet = (key) => {
  const line = env.find((l) => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).trim() : '';
};
const SUPABASE_URL = envGet('SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_KEY = envGet('SUPABASE_SECRET_KEY') || envGet('SUPABASE_PUBLISHABLE_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY غير موجودين في .env');

const headers = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : ''}`;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${table} فشل (${res.status}): ${text}`);
    }
    process.stdout.write(`  ${table}: ${Math.min(i + 100, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write(`  ${table}: ${rows.length}/${rows.length} ✓\n`);
}

/* ── 2) أنواع الدروس ────────────────────────────────────────────────────── */
const T = {
  listen: 'استماع',
  read: 'قراءة',
  memo: 'محفوظات',
  grammar: 'قواعد لغوية',
  spelling: 'إملاء',
  calligraphy: 'خط',
  expression: 'تعبير',
  evaluate: 'أقيم ذاتي',
  project: 'مشروع',
  reading: 'مطالعة',
  poetry: 'نص شعري',
  rules: 'قواعد',
  prosody: 'عروض',
};

/* ── 3) بيانات الوحدات ──────────────────────────────────────────────────── */
/* كل وحدة: { theme, lessons: [[اسم الدرس, النوع], ...] } */

const g7t1 = [
  { theme: 'رحمة الله بعباده', lessons: [
    ['الرحمة', T.listen], ['رحمة الله بعباده', T.read], ['من وحي الحرمين', T.memo],
    ['علامات الاسم (مراجعة)', T.grammar], ['الهمزة المتوسطة على نبرة', T.spelling],
    ['الخط', T.calligraphy], ['الفقرة', T.expression],
  ]},
  { theme: 'فلسطين قلب الأمة', lessons: [
    ['الأماكن الدينية والتراثية في عكا', T.listen], ['فلسطين قلب الأمة', T.read], ['يافا', T.memo],
    ['النكرة والمعرفة', T.grammar], ['الهمزة المتوسطة على واو', T.spelling],
    ['الخط', T.calligraphy], ['إعادة ترتيب الجمل', T.expression],
  ]},
  { theme: 'الأسرى قضية شعب وأمة', lessons: [
    ['ليلة ظلماء', T.listen], ['الأسرى قضية شعب وأمة', T.read], ['ونحن سواء', T.memo],
    ['أنواع الفعل الصحيح', T.grammar], ['الهمزة المتوسطة على ألف', T.spelling],
    ['الخط', T.calligraphy], ['كتابة جمل داعمة', T.expression],
  ]},
  { theme: 'من تلميذة إلى والدتها', lessons: [
    ['وداع أخي', T.listen], ['من تلميذة إلى والدتها', T.read],
    ['أنواع الفعل المعتل', T.grammar], ['الهمزة المتوسطة على السطر', T.spelling],
    ['الخط', T.calligraphy], ['كتابة جمل مفتاحية', T.expression],
  ]},
  { theme: 'رجال في الشمس', lessons: [
    ['أشواق الغربة', T.listen], ['رجال في الشمس', T.read], ['سنعود', T.memo],
    ['الأسماء المعربة والأسماء المبنية', T.grammar], ['ألف المد وسط الكلمة', T.spelling],
    ['الخط', T.calligraphy], ['التعبير', T.expression],
  ]},
  { theme: 'بين الوفاء وسوء العاقبة', lessons: [
    ['الرفق بالحيوان', T.listen], ['بين الوفاء وسوء العاقبة', T.read],
    ['الأسماء المبنية', T.grammar], ['تطبيقات إملائية على الهمزة المتوسطة', T.spelling],
    ['الخط', T.calligraphy], ['كتابة جمل داعمة', T.expression],
  ]},
  { theme: 'الخليفة والوالي الفقير', lessons: [
    ['الكنز الحقيقي', T.listen], ['الخليفة والوالي الفقير', T.read], ['أين الفوارس', T.memo],
    ['الأسماء المعربة والأسماء المبنية (مراجعة)', T.grammar], ['الهمزة المتطرفة', T.spelling],
    ['الخط', T.calligraphy], ['كتابة جمل داعمة وعنوان', T.expression],
  ]},
  { theme: 'الرقيب', lessons: [
    ['التاجر والمزارع', T.listen], ['الرقيب', T.read],
    ['من علامات الإعراب الفرعية', T.grammar], ['الهمزة المتطرفة على الياء والواو', T.spelling],
    ['الخط', T.calligraphy], ['فن الوصف', T.expression],
  ]},
  { theme: 'المعلم', lessons: [
    ['بالعلم نسمو', T.listen], ['المعلم', T.read], ['فضل المعلم', T.memo],
    ['علامات البناء', T.grammar], ['الهمزة المتطرفة على ألف', T.spelling],
    ['الخط', T.calligraphy], ['كتابة جمل داعمة وجملة ختامية', T.expression],
  ]},
  { theme: 'الضيف المقيم', lessons: [
    ['عبقري القرن', T.listen], ['الضيف المقيم', T.read],
    ['مراجعة الأحرف: (الاستفهام، والجر، والعطف)', T.grammar],
    ['الهمزة المتطرفة المنفردة على السطر', T.spelling], ['الخط', T.calligraphy],
    ['كتابة جمل وصف داعمة', T.expression], ['أقيم ذاتي', T.evaluate], ['المشروع', T.project],
  ]},
];

const g7t2 = [
  { theme: 'حفظ اللسان', lessons: [
    ['خير الناس', T.listen], ['حفظ اللسان', T.read],
    ['الجملة الاسمية', T.grammar], ['مراجعة الهمزة المتوسطة والهمزة المتطرفة', T.spelling],
    ['الخط', T.calligraphy], ['كتابة الإعلان (نموذج تطبيقي)', T.expression],
  ]},
  { theme: 'من ذاكرة التاريخ: عمواس، ويالو، وبيت نوبا', lessons: [
    ['مجزرة الدوايمة', T.listen], ['من ذاكرة التاريخ: عمواس، ويالو، وبيت نوبا', T.read],
    ['فلسطين روحي', T.memo], ['الجملة الاسمية: صور الخبر', T.grammar],
    ['إملاء اختباري', T.spelling], ['الخط', T.calligraphy], ['كتابة الإعلان (عناصر الإعلان)', T.expression],
  ]},
  { theme: 'شرطي المرور', lessons: [
    ['آداب الطريق', T.listen], ['شرطي المرور', T.read],
    ['من الأفعال الناسخة: كان وأخواتها', T.grammar],
    ['كتابة الألف المتطرفة في الفعل الثلاثي', T.spelling], ['الخط', T.calligraphy],
    ['كتابة الإعلان (ترتيب عناصر الإعلان)', T.expression],
  ]},
  { theme: 'عبد الله بن حذافة السهمي', lessons: [
    ['من مذكرات أسير', T.listen], ['عبد الله بن حذافة السهمي', T.read], ['عابرون في كلام عابر', T.memo],
    ['تطبيقات على كان وأخواتها', T.grammar], ['إملاء اختباري', T.spelling],
    ['الخط', T.calligraphy], ['كتابة الإعلان', T.expression],
  ]},
  { theme: 'الابتسامة لغة القلوب', lessons: [
    ['من نوادر العرب', T.listen], ['الابتسامة لغة القلوب', T.read],
    ['من النواسخ: إن وأخواتها', T.grammar], ['كتابة الألف في آخر الاسم الثلاثي', T.spelling],
    ['الخط', T.calligraphy], ['كتابة الإعلان', T.expression],
  ]},
  { theme: 'وتستمر المعاناة...', lessons: [
    ['إصرار وتحد', T.listen], ['وتستمر المعاناة...', T.read], ['تقدموا', T.memo],
    ['تطبيقات على إن وأخواتها', T.grammar], ['إملاء اختباري', T.spelling],
    ['الخط', T.calligraphy], ['تلخيص قصة', T.expression],
  ]},
  { theme: 'خطبة عمر بن عبد العزيز', lessons: [
    ['عاقبة الظلم', T.listen], ['خطبة عمر بن عبد العزيز', T.read],
    ['تطبيقات على كان وأخواتها، وإن وأخواتها', T.grammar],
    ['مراجعة الألف في آخر الأفعال الثلاثية، والأسماء الثلاثية', T.spelling],
    ['الخط', T.calligraphy], ['التلخيص (تحديد فكرة رئيسة، وعناصر قصة)', T.expression],
  ]},
  { theme: 'فراسة الأعراب', lessons: [
    ['الحياة في البادية', T.listen], ['فراسة الأعراب', T.read], ['من أغاني الرعاة', T.memo],
    ['الجر بحرف الجر', T.grammar], ['علامتا الترقيم: القوسان الهلاليان، والحذف', T.spelling],
    ['الخط', T.calligraphy], ['تلخيص قصة (تسلسل الأحداث)', T.expression],
  ]},
  { theme: 'العمل في الإسلام', lessons: [
    ['عمالة الأطفال... براءة أضاعها الفقر، أم الطمع؟', T.listen], ['العمل في الإسلام', T.read],
    ['الجر بالإضافة', T.grammar], ['علامتا الترقيم: الشرطة، والتنصيص', T.spelling],
    ['الخط', T.calligraphy], ['تلخيص قصة (تلخيص أفكار بأسلوبنا)', T.expression],
  ]},
  { theme: 'ذو العصابة الحمراء', lessons: [
    ['معركة عين جالوت', T.listen], ['ذو العصابة الحمراء', T.read], ['صوني دموعك', T.memo],
    ['مراجعة الاسم المجرور', T.grammar], ['تطبيقات عامة', T.spelling],
    ['الخط', T.calligraphy], ['تلخيص قصة', T.expression], ['أقيم ذاتي', T.evaluate], ['المشروع', T.project],
  ]},
];

const g11LitT1 = [
  { theme: 'مظاهر عظمة الخالق', lessons: [
    ['مظاهر عظمة الخالق', T.reading], ['نكبة دمشق', T.poetry], ['التوابع (النعت)', T.rules],
    ['البحر المتقارب', T.prosody], ['التعبير', T.expression],
  ]},
  { theme: 'رسالة أسير: لا تقل لأمي', lessons: [
    ['رسالة أسير: لا تقل لأمي', T.reading], ['إن ضاق صدرك', T.poetry], ['التوكيد', T.rules],
    ['بحر الكامل', T.prosody], ['التعبير', T.expression],
  ]},
  { theme: 'من رحلة ابن بطوطة', lessons: [
    ['من رحلة ابن بطوطة', T.reading], ['البدل', T.rules], ['التعبير', T.expression],
  ]},
  { theme: 'بكاء طفل', lessons: [
    ['بكاء طفل', T.reading], ['واحر قلباه', T.poetry], ['العطف', T.rules],
  ]},
  { theme: 'التلوث', lessons: [
    ['التلوث', T.reading], ['مراجعة التوابع', T.rules],
  ]},
  { theme: 'الخبز المر', lessons: [
    ['الخبز المر', T.reading], ['التمييز', T.rules], ['التعبير', T.expression],
  ]},
  { theme: 'من سيرة جبرا', lessons: [
    ['من سيرة جبرا', T.reading], ['شهداء الانتفاضة', T.poetry], ['العدد', T.rules],
    ['أقيم ذاتي', T.evaluate], ['المشروع', T.project],
  ]},
];

const g11Shared = [
  { theme: 'دعائم بناء المجتمع الراقي', lessons: [
    ['دعائم بناء المجتمع الراقي', T.reading], ['بائية', T.poetry], ['أسلوب الشرط', T.rules],
    ['التعبير', T.expression],
  ]},
  { theme: 'الإعلام ماضياً وحاضراً', lessons: [
    ['الإعلام ماضياً وحاضراً', T.reading], ['التعجب', T.rules], ['بحر الرجز', T.prosody],
    ['التعبير', T.expression],
  ]},
  { theme: 'نماذج من وصايا العرب وأمثالهم', lessons: [
    ['نماذج من وصايا العرب وأمثالهم', T.reading], ['الثلاثاء الحمراء', T.poetry],
    ['أساليب الإغراء والتحذير والاختصاص', T.rules], ['التعبير', T.expression],
  ]},
  { theme: 'نخلة على الجدول', lessons: [
    ['نخلة على الجدول', T.reading], ['أسلوبا المدح والذم', T.rules], ['التعبير', T.expression],
  ]},
  { theme: 'رسالة عبد الحميد الكاتب إلى الكُتّاب', lessons: [
    ['رسالة عبد الحميد الكاتب إلى الكُتّاب', T.reading], ['خليل الرحمن', T.poetry],
    ['الأسماء الخمسة', T.rules], ['بحر الرمل', T.prosody], ['التعبير', T.expression],
  ]},
  { theme: 'الصراع على مياه فلسطين', lessons: [
    ['الصراع على مياه فلسطين', T.reading], ['هذي البلاد لنا', T.poetry],
    ['الاسم المقصور', T.rules], ['التعبير', T.expression],
  ]},
  { theme: 'من الشعر الشعبي الفلسطيني', lessons: [
    ['من الشعر الشعبي الفلسطيني', T.reading], ['رسالة من المعتقل', T.poetry],
    ['الاسم المنقوص', T.rules], ['التعبير', T.expression],
  ]},
  { theme: 'الأقمار الاصطناعية', lessons: [
    ['الأقمار الاصطناعية', T.reading], ['مراجعة عامة', T.rules],
    ['أقيم ذاتي', T.evaluate], ['المشروع', T.project],
  ]},
];

/* ── 4) الصفوف والكتب ───────────────────────────────────────────────────── */
const GRADES = [
  { id: 'grade-7', name: 'الصف السابع', sort_order: 0, is_active: true, color: '#b7791f' },
  { id: 'grade-11-lit', name: 'الصف الحادي عشر الأدبي', sort_order: 4, is_active: true, color: '#6a1b9a' },
  { id: 'grade-11-sci', name: 'الصف الحادي عشر العلمي', sort_order: 5, is_active: true, color: '#0d47a1' },
];

const BOOK_ROWS = [
  { id: 'book-7-term1', grade: 'الصف السابع', term: 'الفصل الأول', title: 'كتاب اللغة العربية - الصف السابع · الفصل الأول', cover_url: '/books/arab-7-term1.jpg', pdf_url: '/books/arabic-7-term1.pdf', sort_order: 6 },
  { id: 'book-7-term2', grade: 'الصف السابع', term: 'الفصل الثاني', title: 'كتاب اللغة العربية - الصف السابع · الفصل الثاني', cover_url: '/books/arab-7-term2.jpg', pdf_url: '/books/arabic-7-term2.pdf', sort_order: 7 },
  { id: 'book-11-lit-term1', grade: 'الصف الحادي عشر الأدبي', term: 'الفصل الأول', title: 'كتاب اللغة العربية (المطالعة والقواعد والعروض) - الصف الحادي عشر الأدبي · الفصل الأول', cover_url: '/books/arab-11-term1.jpg', pdf_url: '/books/arabic-11-term1.pdf', sort_order: 8 },
  { id: 'book-11-lit-term2', grade: 'الصف الحادي عشر الأدبي', term: 'الفصل الثاني', title: 'كتاب اللغة العربية (المطالعة والقواعد والعروض) - الصف الحادي عشر الأدبي · الفصل الثاني', cover_url: '/books/arab-11-term2.jpg', pdf_url: '/books/arabic-11-term2.pdf', sort_order: 9 },
  { id: 'book-11-sci-term1', grade: 'الصف الحادي عشر العلمي', term: 'الفصل الأول', title: 'كتاب اللغة العربية - الصف الحادي عشر العلمي · الفصل الأول', cover_url: '/books/arab-11-term1.jpg', pdf_url: '/books/arabic-11-term1.pdf', sort_order: 10 },
  { id: 'book-11-sci-term2', grade: 'الصف الحادي عشر العلمي', term: 'الفصل الثاني', title: 'كتاب اللغة العربية - الصف الحادي عشر العلمي · الفصل الثاني', cover_url: '/books/arab-11-term2.jpg', pdf_url: '/books/arabic-11-term2.pdf', sort_order: 11 },
];

const ASSET_COPIES = [
  ['arab 7.jpg', 'books/arab-7-term1.jpg'],
  ['ara7772.jpg', 'books/arab-7-term2.jpg'],
  ['arab 11.jpg', 'books/arab-11-term1.jpg'],
  ['e33bdc7e54d2e78bfda346b6c6679543.jpg', 'books/arab-11-term2.jpg'],
  ['5d82ac2bdcea6-secured.pdf', 'books/arabic-7-term1.pdf'],
  ['603e765f1aa48-secured.pdf', 'books/arabic-7-term2.pdf'],
  ['87968579.pdf', 'books/arabic-11-term1.pdf'],
  ['897653467890.pdf', 'books/arabic-11-term2.pdf'],
];

/* ── 5) أدوات التوليد ───────────────────────────────────────────────────── */
const PALETTE = [
  ['#2e7d32', 'book-open'], ['#2f7772', 'library'], ['#8a508f', 'target'], ['#a85d3d', 'award'],
  ['#b7791f', 'sparkles'], ['#0d47a1', 'shield-check'], ['#5d4037', 'landmark'], ['#37474f', 'leaf'],
  ['#6a1b9a', 'swords'], ['#00695c', 'package'],
];

const INTRO = {
  [T.listen]: 'نستمع إلى النص بوعي وانتباه، نحدد الفكرة العامة والأفكار الجزئية، ثم نجيب عن أسئلة الاستماع.',
  [T.read]: 'نقرأ النص قراءة فاهمة واعية: الفكرة العامة والأفكار الجزئية، المفردات والتراكيب، ثم أسئلة الفهم والاستيعاب.',
  [T.memo]: 'نحفظ النص حفظاً متقناً، نتدبر معناه وموسيقاه، ثم نؤديه أداءً معبراً.',
  [T.grammar]: 'نتعرف القاعدة وضابطها بالأمثلة والشواهد، ثم نطبق عليها بنماذج إعرابية وتدريبات متنوعة.',
  [T.spelling]: 'نضبط القاعدة الإملائية: الشرح المختصر، الأمثلة الموضحة، ثم الإملاء المنظور والاختباري.',
  [T.calligraphy]: 'نتدرب على تحسين الخط العربي: رسم الحروف واتصالها، ومراعاة التناسب والوضوح.',
  [T.expression]: 'نتعلم خطوات الكتابة: التخطيط وجمع الأفكار، العرض المرتب بالشواهد، ثم المراجعة والتحسين.',
  [T.evaluate]: 'نقف مع أنفسنا وقفة تقويمية: ماذا تعلمنا؟ وما الذي يحتاج إلى مراجعة؟',
  [T.project]: 'ننجز مشروع الوحدة: نجمع المادة وننظمها ونقدمها في عمل متكامل.',
  [T.reading]: 'نقرأ النص قراءة فاهمة واعية: الفكرة العامة والأفكار الجزئية، المفردات والتراكيب، ثم أسئلة الفهم والاستيعاب.',
  [T.poetry]: 'نتذوق النص الشعري: الفكرة والعاطفة، الصور الفنية والموسيقا، المفردات، ثم التحليل والحفظ والأسئلة.',
  [T.rules]: 'نتعرف القاعدة وضابطها بالأمثلة والشواهد، ثم نطبق عليها بنماذج إعرابية وتدريبات متنوعة.',
  [T.prosody]: 'نتدرب على الموسيقا الشعرية: الكتابة العروضية والتقطيع خطوة بخطوة مع الأمثلة والتطبيقات.',
};

const MAIN = {
  [T.listen]: 'الاستماع المنظم، تحديد الأفكار، تدوين الملاحظات، والإجابة عن الأسئلة.',
  [T.read]: 'الفكرة العامة، الأفكار الجزئية، المفردات والتراكيب، أسئلة الفهم والاستيعاب.',
  [T.memo]: 'الحفظ المتقن، المعنى الإجمالي، الإلقاء المعبر، والتطبيق.',
  [T.grammar]: 'القاعدة، الأمثلة والشواهد، النماذج الإعرابية، والتدريبات المتنوعة.',
  [T.spelling]: 'القاعدة الإملائية، الأمثلة، الإملاء المنظور، والإملاء الاختباري.',
  [T.calligraphy]: 'رسم الحروف، الاتصال، التناسب، والتدريب العملي.',
  [T.expression]: 'التخطيط، جمع الأفكار، العرض، الشواهد، والمراجعة والتحسين.',
  [T.evaluate]: 'ماذا تعلمت؟ ما نقاط قوتي؟ ما الذي أحتاج إلى مراجعته؟',
  [T.project]: 'اختيار الموضوع، جمع المادة، التنظيم، العرض، والتقويم.',
  [T.reading]: 'الفكرة العامة، الأفكار الجزئية، المفردات والتراكيب، أسئلة الفهم والاستيعاب.',
  [T.poetry]: 'الفكرة والعاطفة، الصور الفنية، الموسيقا، المفردات، والتحليل.',
  [T.rules]: 'القاعدة، الأمثلة والشواهد، النماذج الإعرابية، والتدريبات المتنوعة.',
  [T.prosody]: 'الكتابة العروضية، التقطيع، التفعيلات، والتطبيقات.',
};

function durationFor(n) {
  if (n === 1) return 'ساعة';
  if (n === 2) return 'ساعتان';
  if (n <= 10) return `${n} ساعات`;
  return `${n} ساعة`;
}

function buildCourseRows({ key, grade, term, units }) {
  const courses = [];
  const lessons = [];
  units.forEach((unit, ui) => {
    const unitNo = ui + 1;
    const courseId = `c${key}${String(unitNo).padStart(2, '0')}00-0000-4000-8000-${String(unitNo).padStart(12, '0')}`;
    const title = `الوحدة ${['الأولى','الثانية','الثالثة','الرابعة','الخامسة','السادسة','السابعة','الثامنة','التاسعة','العاشرة'][ui] || unitNo}: ${unit.theme}`;
    const [color, icon] = PALETTE[ui % PALETTE.length];
    const description = `دروس الوحدة: ${unit.lessons.map(([name, type]) => `${type} (${name})`).join('؛ ')}`;
    courses.push({
      id: courseId,
      title,
      description,
      lessons_count: unit.lessons.length,
      duration: durationFor(unit.lessons.length),
      color,
      icon,
      sort_order: unitNo,
      published: true,
      grade,
      term,
      cover_url: '',
      avatar_url: '',
      status: 'published',
      is_locked: false,
      is_visible: true,
      section: 'الجميع',
      school: '',
    });
    unit.lessons.forEach(([lessonTitle, lessonType], li) => {
      const lessonNo = li + 1;
      const lessonId = `d${key}${String(unitNo).padStart(2, '0')}${String(lessonNo).padStart(2, '0')}-0000-4000-8000-${String(lessonNo).padStart(12, '0')}`;
      lessons.push({
        id: lessonId,
        course_id: courseId,
        title: lessonTitle,
        description: `درس ${lessonType} من ${title} — ${grade} · ${term}`,
        position: lessonNo,
        content: {
          introduction: `«${lessonTitle}» — ${INTRO[lessonType] || INTRO[T.reading]}`,
          mainText: `محاور الدرس: ${MAIN[lessonType] || MAIN[T.reading]}`,
          summary: 'خلاصة الدرس وتطبيقاته — تُستكمل الشواهد والتدريبات التفصيلية من لوحة الأستاذ.',
        },
        published: true,
        lesson_type: lessonType,
        cover_url: '',
        images: [],
        html_content: '',
        html_file_url: '',
        status: 'published',
        is_locked: false,
        is_visible: true,
        grade,
        term,
        school: '',
      });
    });
  });
  return { courses, lessons };
}

/* ── 6) تجميع البيانات ──────────────────────────────────────────────────── */
const g7t1Rows = buildCourseRows({ key: '071', grade: 'الصف السابع', term: 'الفصل الأول', units: g7t1 });
const g7t2Rows = buildCourseRows({ key: '072', grade: 'الصف السابع', term: 'الفصل الثاني', units: g7t2 });
const g11LitT1Rows = buildCourseRows({ key: '111', grade: 'الصف الحادي عشر الأدبي', term: 'الفصل الأول', units: g11LitT1 });
const g11LitT2Rows = buildCourseRows({ key: '112', grade: 'الصف الحادي عشر الأدبي', term: 'الفصل الثاني', units: g11Shared });
const g11SciT1Rows = buildCourseRows({ key: '113', grade: 'الصف الحادي عشر العلمي', term: 'الفصل الأول', units: g11Shared });
const g11SciT2Rows = buildCourseRows({ key: '114', grade: 'الصف الحادي عشر العلمي', term: 'الفصل الثاني', units: g11Shared });

const ALL_COURSES = [...g7t1Rows.courses, ...g7t2Rows.courses, ...g11LitT1Rows.courses, ...g11LitT2Rows.courses, ...g11SciT1Rows.courses, ...g11SciT2Rows.courses];
const ALL_LESSONS = [...g7t1Rows.lessons, ...g7t2Rows.lessons, ...g11LitT1Rows.lessons, ...g11LitT2Rows.lessons, ...g11SciT1Rows.lessons, ...g11SciT2Rows.lessons];

const GRADE_SETTINGS = GRADES.map((g) => ({ grade: g.name, gender_split: false }));
const GRADE_SCHOOLS = GRADES.flatMap((g) => [
  { grade_id: g.id, school_id: 'school-wild', sort_order: g.sort_order },
  { grade_id: g.id, school_id: 'school-ahramat', sort_order: g.sort_order },
]);
const GRADE_GATES = GRADES.flatMap((g) => ['الفصل الأول', 'الفصل الثاني'].map((term) => ({
  grade: g.name, term, unlocked_unit_order: 99, note: 'مفتوح بالكامل افتراضياً — يعدّلها المعلم',
})));

/* ── 7) نسخ الأصول إلى أسماء نظيفة ──────────────────────────────────────── */
console.log('• نسخ الأغلفة والكتب...');
fs.mkdirSync(BOOKS, { recursive: true });
for (const [from, to] of ASSET_COPIES) {
  const src = path.join(SOURCES, from);
  const dst = path.join(PUBLIC, to);
  if (!fs.existsSync(src)) {
    /* الأصول الأصلية غير محفوظة في المستودع؛ النسخة النظيفة في public/books تكفي. */
    if (fs.existsSync(dst)) continue;
    console.warn(`  ⚠️ الأصل غير موجود: ${from}`);
    continue;
  }
  fs.copyFileSync(src, dst);
  console.log(`  ✓ ${to}`);
}

/* ── 8) الرفع إلى Supabase ──────────────────────────────────────────────── */
console.log('• رفع الصفوف والكتب والمنهاج...');
await upsert('grade_levels', GRADES, 'id');
await upsert('grade_settings', GRADE_SETTINGS, 'grade');
await upsert('grade_schools', GRADE_SCHOOLS, 'grade_id,school_id');
await upsert('grade_gates', GRADE_GATES, 'grade,term');
await upsert('books', BOOK_ROWS, 'id');
await upsert('courses', ALL_COURSES, 'id');
await upsert('lessons', ALL_LESSONS, 'id');

/* ── 9) توليد ملف SQL مرافق (للتشغيل اليدوي لاحقاً) ────────────────────── */
const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const insertSql = (table, rows, conflict) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `(${cols.map((c) => q(r[c])).join(', ')})`).join(',\n');
  return `INSERT INTO public.${table} (${cols.join(', ')}) VALUES\n${values}\nON CONFLICT ${conflict} DO UPDATE SET ${cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(', ')};\n\n`;
};

const sql = `-- ====================================================================
-- منصة أرض اللغة — الصف السابع + الصف الحادي عشر (أدبي/علمي)
-- كتب + وحدات + دروس — ${new Date().toISOString().slice(0, 10)}
-- ملف تزايدي آمن (ON CONFLICT) — نفّذه مرة واحدة في Supabase SQL Editor
-- ====================================================================

${insertSql('grade_levels', GRADES, '(id)')}${insertSql('grade_settings', GRADE_SETTINGS, '(grade)')}${insertSql('grade_schools', GRADE_SCHOOLS, '(grade_id, school_id)')}${insertSql('grade_gates', GRADE_GATES, '(grade, term)')}${insertSql('books', BOOK_ROWS, '(id)')}${insertSql('courses', ALL_COURSES, '(id)')}${insertSql('lessons', ALL_LESSONS, '(id)')}-- تم بحمد الله
`;
fs.writeFileSync(path.join(ROOT, 'sql_curriculum_grades_7_11.sql'), sql, 'utf8');
console.log(`• تم توليد sql_curriculum_grades_7_11.sql (${ALL_COURSES.length} وحدة، ${ALL_LESSONS.length} درساً)`);
console.log('✅ اكتمل البذر بنجاح.');
