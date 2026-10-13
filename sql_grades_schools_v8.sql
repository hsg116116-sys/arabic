-- ====================================================================
-- منصة "أرض اللغة" — الصفوف والمدارس كبيانات حيّة (V8)
-- ---------------------------------------------------------------------
-- الهدف: بدل قائمة الصفوف والمدارس المثبّتة داخل الكود، يصير الأستاذ
--        يديرها بنفسه من "إعدادات المنصة" فتظهر في كل مكان فوراً:
--        الصفوف، الطلاب، الواجبات، الدفتر، الاختبارات، الإعلانات،
--        الوحدات والدروس، الملخصات، الكتب، وقسم التأسيس.
--
-- 1) grade_levels : قائمة الصفوف الرسمية (مصدر الحقيقة الوحيد)
-- 2) schools      : قائمة المدارس الرسمية
-- 3) grade_schools : أي صف في أي مدرسة (صف تاسع له مدرستان مثلاً)
-- 4) school       : عمود على كل المحتوى لاستهداف مدرسة بعينها
--                   ('' أو 'الجميع' = كل مدارس ذلك الصف)
-- 5) زرع تلقائي   : يقرأ الصفوف والمدارس الموجودة في profiles الآن
--
-- طريقة التنفيذ: Supabase Dashboard ← SQL Editor ← الصق الملف ← Run
-- آمن بالكامل: لا يحذف ولا يغيّر بياناتك، فقط يضيف ويزرع.
-- ====================================================================


-- ────────────────────────────────────────────────────────────────────
-- 1) الصفوف الرسمية
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_levels (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    sort_order  INT  NOT NULL DEFAULT 1,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    color       TEXT NOT NULL DEFAULT '#17413f',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.grade_levels ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 1;
ALTER TABLE public.grade_levels ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.grade_levels ADD COLUMN IF NOT EXISTS color      TEXT NOT NULL DEFAULT '#17413f';
ALTER TABLE public.grade_levels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- الصفوف الثلاثة الأولى (مع تجاهل التكرار)
INSERT INTO public.grade_levels (id, name, sort_order, is_active, color) VALUES
  ('grade-8',  'الصف الثامن',  1, TRUE, '#2f7772'),
  ('grade-9',  'الصف التاسع',  2, TRUE, '#b7791f'),
  ('grade-10', 'الصف العاشر',  3, TRUE, '#17413f')
ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────
-- 2) المدارس الرسمية
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schools (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    sort_order  INT  NOT NULL DEFAULT 1,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    color       TEXT NOT NULL DEFAULT '#6a1b9a',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 1;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS color      TEXT NOT NULL DEFAULT '#6a1b9a';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO public.schools (id, name, sort_order, is_active, color) VALUES
  ('school-wild',  'مدرسة وايلد',              1, TRUE, '#17413f'),
  ('school-ahramat','مبادرة أهرامات الأمل',    2, TRUE, '#6a1b9a')
ON CONFLICT (name) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────
-- 3) ربط الصفوف بالمدارس — صف تاسع في مدرستان = صفّان منفصلان
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_schools (
    grade_id    TEXT NOT NULL,
    school_id   TEXT NOT NULL,
    sort_order  INT  NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (grade_id, school_id)
);

ALTER TABLE public.grade_schools ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS grade_schools_school_idx ON public.grade_schools (school_id);


-- ────────────────────────────────────────────────────────────────────
-- 4) زرع: كل صف/مدرسة موجودة فعلياً عند الطلاب تدخل النظام تلقائياً
--    (منprofiles) — فلا يضيع صف عندك ولا تظهر مدارس مجهولة
-- ────────────────────────────────────────────────────────────────────

-- 4.1) مدارس موجودة في بيانات الطلاب ولم تُسجَّل بعد
INSERT INTO public.schools (id, name, sort_order, is_active, color)
SELECT
  'school-' || substr(md5(p.school), 1, 10),
  p.school,
  50,
  TRUE,
  '#37474f'
FROM (SELECT DISTINCT school FROM public.profiles WHERE school IS NOT NULL AND school <> '') p
ON CONFLICT (name) DO NOTHING;

-- 4.2) صفوف موجودة في بيانات الطلاب ولم تُسجَّل بعد
INSERT INTO public.grade_levels (id, name, sort_order, is_active, color)
SELECT
  'grade-' || substr(md5(p.grade), 1, 10),
  p.grade,
  50,
  TRUE,
  '#37474f'
FROM (SELECT DISTINCT grade FROM public.profiles WHERE grade IS NOT NULL AND grade <> '') p
ON CONFLICT (id) DO NOTHING;

-- 4.3) كل صف في كل مدرسة فعلاً فيها طلاب له
INSERT INTO public.grade_schools (grade_id, school_id, sort_order)
SELECT g.id, s.id, g.sort_order
FROM public.grade_levels g
JOIN public.profiles p ON p.grade = g.name
JOIN public.schools  s ON s.name = p.school
GROUP BY g.id, s.id, g.sort_order
ON CONFLICT (grade_id, school_id) DO NOTHING;

-- 4.4) الصفوف الثلاثة الأولى في كل مدرسة (حتى لو فارغة من طلاب)
INSERT INTO public.grade_schools (grade_id, school_id, sort_order)
SELECT g.id, s.id, g.sort_order
FROM public.grade_levels g
CROSS JOIN public.schools s
WHERE g.id IN ('grade-8','grade-9','grade-10')
ON CONFLICT (grade_id, school_id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────
-- 5) عمود المدرسة على كل جداول المحتوى
--    '' = كل مدارس ذلك الصف (السلوك الافتراضي الحالي، بلا كسر)
-- ────────────────────────────────────────────────────────────────────

-- الوحدات
ALTER TABLE public.courses         ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
-- الدروس
ALTER TABLE public.lessons         ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
-- الاختبارات
ALTER TABLE public.assessments     ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
-- الواجبات
ALTER TABLE public.assignments     ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
-- الإعلانات
ALTER TABLE public.announcements   ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
-- الملخصات
ALTER TABLE public.summaries       ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
-- مهام الدفتر
ALTER TABLE public.notebook_tasks  ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';
-- أقسام التأسيس
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS school TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS courses_school_idx        ON public.courses (school);
CREATE INDEX IF NOT EXISTS lessons_school_idx        ON public.lessons (school);
CREATE INDEX IF NOT EXISTS assessments_school_idx    ON public.assessments (school);
CREATE INDEX IF NOT EXISTS assignments_school_idx    ON public.assignments (school);
CREATE INDEX IF NOT EXISTS announcements_school_idx  ON public.announcements (school);
CREATE INDEX IF NOT EXISTS summaries_school_idx      ON public.summaries (school);
CREATE INDEX IF NOT EXISTS notebook_tasks_school_idx ON public.notebook_tasks (school);


-- ────────────────────────────────────────────────────────────────────
-- 6) دالة مساعدة: هل هذا الصف موجود في هذه المدرسة؟
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grade_has_school(p_grade TEXT, p_school TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.grade_schools gs
    JOIN public.grade_levels g ON g.id = gs.grade_id
    JOIN public.schools s      ON s.id = gs.school_id
    WHERE g.name = p_grade AND s.name = p_school
  );
$$;


-- ────────────────────────────────────────────────────────────────────
-- 7) سياسات الوصول
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.schools       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_schools') THEN
    CREATE POLICY open_all_schools ON public.schools FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_grade_schools') THEN
    CREATE POLICY open_all_grade_schools ON public.grade_schools FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────
-- 8) تقرير نهائي — يعرض ما صار
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  g_count INT;
  s_count INT;
  gs_count INT;
BEGIN
  SELECT count(*) INTO g_count   FROM public.grade_levels;
  SELECT count(*) INTO s_count   FROM public.schools;
  SELECT count(*) INTO gs_count  FROM public.grade_schools;

  RAISE NOTICE 'تم بنجاح — % صفاً، % مدرسة، % ارتباطاً بين الصفوف والمدارس.', g_count, s_count, gs_count;
  RAISE NOTICE 'اذهب إلى: هوية المنصة ← الصفوف والمدارس.';
END $$;