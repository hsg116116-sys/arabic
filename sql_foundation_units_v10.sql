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
-- ────────────────────────────────────────────────────────────────────
-- 5) الأقسام الفرعية الخمسة عشر + توزيع الدروس عليها
--    ────────────────────────────────────────────────────────────────
--    المعرّفات تُولَّد هنا ولا تُكتب يدوياً — كتابة 15 ثابتاً باليد هي
--    مصدر الخطأ الوحيد في هذا الملف.
--    تنبيه: خانة UUID لا تقبل إلا 0-9 و a-f (hex)، فالبادئة 'a' لا 'u'.
--    الصيغة:  a + رقم المستوى + 00000 + رقم القسم الفرعي
--             -0000-4000-8000-0000000000 + رقم القسم الفرعي (خانتين)
--    مثال المستوى ٢ القسم ٣ = a2000003-0000-4000-8000-000000000003
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  lv   INT;   -- رقم المستوى 1..5
  un   INT;   -- رقم القسم الفرعي داخل المستوى 1..3
  idx  INT;   -- الفهرس في المصفوفات 1..15
  uid  UUID;
  sid  UUID;

  titles TEXT[] := ARRAY[
    'الجملة وأنواعها',        'أقسام الكلمة وعددها',      'أدوات المعاني',
    'الجملة المركّبة',        'العلاقات النحوية',         'الإعراب والتطبيقات',
    'بنية الكلمة صرفياً',     'المشتقات',                 'صيغ الكلمة وتطبيقاتها',
    'الصورة البيانية',        'المحسّنات البديعية',       'أساليب الخطاب',
    'قواعد الإملاء',          'فنون الكتابة',             'القراءة والتلخيص'
  ];
  descs  TEXT[] := ARRAY[
    'ما الجملة؟ وكيف تختلف الاسمية عن الفعلية في التركيب والإعراب.',
    'الكلمة وحدها: نوعها وعددها وتذكيرها وتأنيثها.',
    'الضمائر والإشارة والوصل والنكرة والمعرفة وحروف الجر.',
    'كان وأخواتها، وإن وأخواتها، والإضافة والعطف.',
    'النعت والعطف والشرط والمفعول به والمفعول المطلق.',
    'الحال والتمييز وعلامات الإعراب ثم تطبيقات شاملة.',
    'الجذر والميزان والمجرد والمزيد والفعل الصحيح والمعتل.',
    'المصادر واسم الفاعل والمفعول والصفة المشبهة والآلة.',
    'التصغير وجمع التكسير والاشتقاق.',
    'التشبيه والاستعارة والكناية والمجاز المرسل.',
    'المحسّنات اللفظية والمعنوية.',
    'الخبر والإنشاء، والتقديم والتأخير، والإيجاز والإطناب.',
    'الهمزة والتاء والألف اللينة واللام والتنوين والترقيم.',
    'كتابة الفقرة والمقال والرسالة.',
    'الفهم القرائي ثم التلخيص والتوسع.'
  ];
  icons  TEXT[] := ARRAY[
    'book-open', 'library', 'scroll-text',
    'landmark', 'target', 'award',
    'scroll-text', 'library', 'sparkles',
    'sparkles', 'award', 'target',
    'shield-check', 'book-open', 'library'
  ];
  froms  INT[] := ARRAY[ 1, 4,  6,  1, 3,  8,  1, 5,  9,  1, 5,  7,  1, 6,  9];
  tos    INT[] := ARRAY[ 3, 5, 10,  2, 7, 10,  4, 8, 10,  4, 6, 10,  5, 8, 10];
BEGIN
  FOR lv IN 1..5 LOOP
    sid := ('f1000000-0000-4000-8000-00000000000' || lv)::uuid;
    FOR un IN 1..3 LOOP
      idx  := ((lv - 1) * 3) + un;
      uid  := ('a' || lv || '00000' || un || '-0000-4000-8000-0000000000'
               || lpad(un::TEXT, 2, '0'))::uuid;

      -- 1) أنشئ القسم الفرعي (وإن سبق وجوده فلا نكرّره ولا نمسّ ما عدّله الأستاذ)
      INSERT INTO public.foundation_units
        (id, section_id, title, description, icon, sort_order, is_locked, is_visible)
      VALUES
        (uid, sid, titles[idx], descs[idx], icons[idx], un, FALSE, TRUE)
      ON CONFLICT (id) DO NOTHING;

      -- 2) ضع دروس هذا المدى تحته — والدرس بلا قسم أولاً حتى لا نمسّ توزيعاً سابقاً
      UPDATE public.foundation_lessons
         SET unit_id = uid, updated_at = NOW()
       WHERE section_id = sid
         AND position BETWEEN froms[idx] AND tos[idx]
         AND unit_id IS NULL;
    END LOOP;
  END LOOP;

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
