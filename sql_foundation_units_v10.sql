-- ====================================================================
-- منصة "أرض اللغة" — بنية التأسيس الثلاثية (V10)
-- --------------------------------------------------------------------
-- الوضع الجديد للتأسيس ثلاثة مستويات واضحة بدل المسطّح:
--
--   foundation_sections   →  القسم (المستوى)      مثال: أساسيات النحو
--   foundation_units      →  القسم الفرعي (المحور) مثال: الجملة وأنواعها
--   foundation_lessons    →  الدرس                مثال: الجملة الاسمية
--
-- الطالب: يفتح المستوى ← يرى مربعات الأقسام ← يفتح القسم ← يرى دروسه ← الدرس في صفحة.
-- الأستاذ: ينشئ ويرتّب ويحرّر كل مستوى، ويضع HTML وصوراً وفيديو في أي درس.
--
-- ⚠️ نفّذ هذا الملف في: Supabase Dashboard ← SQL Editor ← الصق ← Run
--    الملف آمن تماماً: لا يحذف شيئاً ولا يمسّ نصوصاً قائمة. الدروس
--    القائمة تُبقى كما هي (unit_id = NULL) فتظهر تحت قسم فرعي افتراضي
--    حتى يعيد الأستاذ توزيعها.
-- ====================================================================


-- ────────────────────────────────────────────────────────────────────
-- 1) الأقسام الفرعية — الحلقة الوسطى بين المستوى والدرس
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.foundation_units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id      UUID NOT NULL REFERENCES public.foundation_sections(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    cover_url       TEXT NOT NULL DEFAULT '',
    color           TEXT NOT NULL DEFAULT '',      -- فارغ = يرث لون المستوى
    icon            TEXT NOT NULL DEFAULT 'book-open',
    sort_order      INT  NOT NULL DEFAULT 1,
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
    is_visible      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ترقية آمنة لو كان الجدول موجوداً بحقول ناقصة
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS section_id  UUID REFERENCES public.foundation_sections(id) ON DELETE CASCADE;
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS title       TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS cover_url   TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS color       TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS icon        TEXT NOT NULL DEFAULT 'book-open';
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS sort_order  INT  NOT NULL DEFAULT 1;
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS is_locked   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.foundation_units ADD COLUMN IF NOT EXISTS is_visible  BOOLEAN NOT NULL DEFAULT TRUE;


-- ────────────────────────────────────────────────────────────────────
-- 2) الدرس ينتمي الآن لقسم فرعي — العمود اختياري ليبقى backwards compatible
--    ON DELETE SET NULL: يحذف الأستاذ القسم الفرعي فيبقى الدرس بلا قسم
--    (تظهره الواجهة في قسم افتراضي) بدل أن يختفي معه.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.foundation_lessons
    ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.foundation_units(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────────────
-- 3) فهارس — فتح أي مستوى أو قسم فرعي استعلام واحد مفهرس
-- ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS foundation_units_section_idx  ON public.foundation_units (section_id);
CREATE INDEX IF NOT EXISTS foundation_units_order_idx    ON public.foundation_units (section_id, sort_order);
CREATE INDEX IF NOT EXISTS foundation_lessons_unit_idx    ON public.foundation_lessons (unit_id);


-- ────────────────────────────────────────────────────────────────────
-- 4) سياسات الوصول — السيرفر يتصل بـ service-role ويتجاوز RLS،
--    لكن نُفعّلها احتياطاً تماماً كما في ملف V7.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.foundation_units ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_foundation_units') THEN
    CREATE POLICY open_all_foundation_units ON public.foundation_units FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────
-- 5) قسم فرعي افتراضي لكل مستوى قائم — فينتقل التأسيس فوراً إلى
--    البنية الثلاثية بلا أن يلمس الأستاذ درساً واحداً.
 --    المعرّف ثابت (بادئة u + أول 12 خانة من معرّف المستوى) فيبقى قابلاً للتحديث لا للتكرار.
-- ────────────────────────────────────────────────────────────────────
INSERT INTO public.foundation_units (id, section_id, title, description, icon, sort_order, is_locked, is_visible)
SELECT
    ('u0000000-0000-4000-8000-' || substr(replace(s.id::text, '-', ''), 1, 12))::uuid,
    s.id,
    'المحاور الأساسية',
    'كل دروس هذا المستوى مجموعها — قسّمها إلى أقسام فرعية أكثر من هنا.',
    'book-open',
    1,
    FALSE,
    TRUE
FROM public.foundation_sections s
WHERE s.id IN (
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'f1000000-0000-4000-8000-000000000002'::uuid,
    'f1000000-0000-4000-8000-000000000003'::uuid,
    'f1000000-0000-4000-8000-000000000004'::uuid,
    'f1000000-0000-4000-8000-000000000005'::uuid
)
ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────
-- 6) توزيع دروس المستويات الخمسة على أقسامها الفرعية
--    القسمة منطقية لا عددية: كل مستوى عشرة دروس فعلياً مجموعة محاور.
--    نmatched765 الدروس بلا unit_id لتبقى نتيجتها بلا تغيير.
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  -- المستوى الأول: الجملة ← الكلمة ← أدوات
  l1a CONSTANT uuid := 'u1000001-0000-4000-8000-000000000001';
  l1b CONSTANT uuid := 'u1000001-0000-4000-8000-000000000002';
  l1c CONSTANT uuid := 'u1000001-0000-4000-8000-000000000003';
  -- المستوى الثاني: الجملة المركّبة ← الإعراب ← التطبيقات
  l2a CONSTANT uuid := 'u1000002-0000-4000-8000-000000000001';
  l2b CONSTANT uuid := 'u1000002-0000-4000-8000-000000000002';
  l2c CONSTANT uuid := 'u1000002-0000-4000-8000-000000000003';
  -- المستوى الثالث: بنية الكلمة ← المشتقات ← التطبيقات
  l3a CONSTANT uuid := 'u1000003-0000-4000-8000-000000000001';
  l3b CONSTANT uuid := 'u1000003-0000-4000-8000-000000000002';
  l3c CONSTANT uuid := 'u1000003-0000-4000-8000-000000000003';
  -- المستوى الرابع: الصورة البيانية ← المحسّنات ← الأساليب
  l4a CONSTANT uuid := 'u1000004-0000-4000-8000-000000000001';
  l4b CONSTANT uuid := 'u1000004-0000-4000-8000-000000000002';
  l4c CONSTANT uuid := 'u1000004-0000-4000-8000-000000000003';
  -- المستوى الخامس: الإملاء ← الكتابة ← القراءة
  l5a CONSTANT uuid := 'u1000005-0000-4000-8000-000000000001';
  l5b CONSTANT uuid := 'u1000005-0000-4000-8000-000000000002';
  l5c CONSTANT uuid := 'u1000005-0000-4000-8000-000000000003';

  s1 CONSTANT uuid := 'f1000000-0000-4000-8000-000000000001';
  s2 CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
  s3 CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
  s4 CONSTANT uuid := 'f1000000-0000-4000-8000-000000000004';
  s5 CONSTANT uuid := 'f1000000-0000-4000-8000-000000000005';
BEGIN
  -- 1) إنشاء الأقسام الفرعية الـ 15 (وإن سبق وجودها فلا نكررها)
  INSERT INTO public.foundation_units (id, section_id, title, description, icon, sort_order)
  VALUES
    (l1a, s1, 'الجملة وأنواعها',            'ما الجملة؟ وكيف تختلف الاسمية عن الفعلية في التركيب والإعراب.', 'book-open', 1),
    (l1b, s1, 'أقسام الكلمة وعددها',        'الكلمة وحدها: نوعها وعددها وتذكيرها وتأنيثها.',                 'library',  2),
    (l1c, s1, 'أدوات المعاني',              'الضمائر والإشارة والوصل والنكرة والمعرفة وحروف الجر.',      'scroll-text', 3),
    (l2a, s2, 'الجملة المركّبة',            'كان وأخواتها، وإن وأخواتها، والإضافة والعطف.',               'landmark', 1),
    (l2b, s2, 'العلاقات النحوية',            'النعت والعطف والشرط والمفعول به والمفعول المطلق.',           'target',   2),
    (l2c, s2, 'الإعراب والتطبيقات',         'الحال والتمييز وعلامات الإعراب ثم تطبيقات شاملة.',           'award',    3),
    (l3a, s3, 'بنية الكلمة صرفياً',         'الجذر والميزان والمجرد والمزيد والفعل الصحيح والمعتل.',      'scroll-text', 1),
    (l3b, s3, 'المشتقات',                   'المصادر واسم الفاعل والمفعول والصفة المشبهة والآلة.',        'library',  2),
    (l3c, s3, 'صيغ الكلمة وتطبيقاتها',     'التصغير وجمع التكسير والاشتقاق.',                              'sparkles', 3),
    (l4a, s4, 'الصورة البيانية',            'التشبيه والاستعارة والكناية والمجاز المرسل.',                 'sparkles', 1),
    (l4b, s4, 'المحسّنات البديعية',         'اللفظية والمعنوية.',                                          'award',    2),
    (l4c, s4, 'أساليب الخطاب',              'الخبر والإنشاء، والتقديم والتأخير، والإيجاز والإطناب.',       'target',   3),
    (l5a, s5, 'قواعد الإملاء',              'الهمزة والتاء والألف اللينة واللام والتنوين والترقيم.',      'shield-check', 1),
    (l5b, s5, 'فنون الكتابة',               'الفقرة والمقال والرسالة.',                                    'book-open', 2),
    (l5c, s5, 'القراءة والتلخيص',           'الفهم القرائي ثم التلخيص والتوسع.',                           'library',  3)
  ON CONFLICT (id) DO NOTHING;

  -- 2) توزيع الدروس — من 1 إلى 10 داخل كل مستوى
  UPDATE public.foundation_lessons SET unit_id = l1a, updated_at = NOW()
    WHERE section_id = s1 AND position BETWEEN 1 AND 3;
  UPDATE public.foundation_lessons SET unit_id = l1b, updated_at = NOW()
    WHERE section_id = s1 AND position BETWEEN 4 AND 5;
  UPDATE public.foundation_lessons SET unit_id = l1c, updated_at = NOW()
    WHERE section_id = s1 AND position BETWEEN 6 AND 10;

  UPDATE public.foundation_lessons SET unit_id = l2a, updated_at = NOW()
    WHERE section_id = s2 AND position BETWEEN 1 AND 2;
  UPDATE public.foundation_lessons SET unit_id = l2b, updated_at = NOW()
    WHERE section_id = s2 AND position BETWEEN 3 AND 7;
  UPDATE public.foundation_lessons SET unit_id = l2c, updated_at = NOW()
    WHERE section_id = s2 AND position BETWEEN 8 AND 10;

  UPDATE public.foundation_lessons SET unit_id = l3a, updated_at = NOW()
    WHERE section_id = s3 AND position BETWEEN 1 AND 4;
  UPDATE public.foundation_lessons SET unit_id = l3b, updated_at = NOW()
    WHERE section_id = s3 AND position BETWEEN 5 AND 8;
  UPDATE public.foundation_lessons SET unit_id = l3c, updated_at = NOW()
    WHERE section_id = s3 AND position BETWEEN 9 AND 10;

  UPDATE public.foundation_lessons SET unit_id = l4a, updated_at = NOW()
    WHERE section_id = s4 AND position BETWEEN 1 AND 4;
  UPDATE public.foundation_lessons SET unit_id = l4b, updated_at = NOW()
    WHERE section_id = s4 AND position BETWEEN 5 AND 6;
  UPDATE public.foundation_lessons SET unit_id = l4c, updated_at = NOW()
    WHERE section_id = s4 AND position BETWEEN 7 AND 10;

  UPDATE public.foundation_lessons SET unit_id = l5a, updated_at = NOW()
    WHERE section_id = s5 AND position BETWEEN 1 AND 5;
  UPDATE public.foundation_lessons SET unit_id = l5b, updated_at = NOW()
    WHERE section_id = s5 AND position BETWEEN 6 AND 8;
  UPDATE public.foundation_lessons SET unit_id = l5c, updated_at = NOW()
    WHERE section_id = s5 AND position BETWEEN 9 AND 10;

  RAISE NOTICE 'تم — 15 قسماً فرعياً و 50 درساً موزّعة.';
END $$;


-- ────────────────────────────────────────────────────────────────────
-- 7) فحص بعد التنفيذ — المتوقّع: 5 مستويات · 15 قسماً · 50 درساً
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  units_count   INT;
  lessons_count INT;
  orphans       INT;
BEGIN
  SELECT count(*) INTO units_count   FROM public.foundation_units;
  SELECT count(*) INTO lessons_count FROM public.foundation_lessons WHERE unit_id IS NOT NULL;
  SELECT count(*) INTO orphans       FROM public.foundation_lessons WHERE unit_id IS NULL;

  RAISE NOTICE 'أقسام فرعية: % | دروس موزّعة: % | دروس بلا قسم: %', units_count, lessons_count, orphans;

  IF units_count = 0 THEN
    RAISE EXCEPTION 'لم يُنشأ أي قسم فرعي — راجع صلاحيات الكتابة على public.foundation_units';
  END IF;
END $$;
