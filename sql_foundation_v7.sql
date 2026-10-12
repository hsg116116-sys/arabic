-- ====================================================================
-- منصة "أرض اللغة" — قسم "التأسيس" الخاص (V7)
-- قسم خاص يرى فقط من يختارهم الأستاذ بالاسم — بلا وحدات ولا واجبات.
-- كل عنصر داخل القسم درس فقط، ويحمل من الأنواع:
--   نص  |  صورة  |  فيديو  |  HTML  |  مختلط (نص + صور + فيديو + HTML)
-- --------------------------------------------------------------------
-- طريقة التنفيذ: Supabase Dashboard ← SQL Editor ← الصق الملف كله ← Run
-- الملف آمن بالكامل: إن كان الجدول موجوداً لا يكرّره ولا يمسح بياناتك.
-- ====================================================================


-- ────────────────────────────────────────────────────────────────────
-- 1) أقسام التأسيس — كل قسم صندوق مستقل يراه أعضاؤه فقط
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.foundation_sections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    subtitle        TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    cover_url       TEXT NOT NULL DEFAULT '',
    color           TEXT NOT NULL DEFAULT '#17413f',
    icon            TEXT NOT NULL DEFAULT 'sparkles',
    sort_order      INT  NOT NULL DEFAULT 1,
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,   -- مقفل: الطالب يرى العنوان لكن لا يفتح
    is_visible      BOOLEAN NOT NULL DEFAULT TRUE,    -- مخفي: لا يظهر لأحد إطلاقاً
    is_published    BOOLEAN NOT NULL DEFAULT TRUE,    -- مسودة: يحضّرها الأستاذ دون نشر
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ترقية آمنة لو كان الجدول موجوداً بحقول ناقصة
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS subtitle        TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS description     TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS cover_url       TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS color           TEXT NOT NULL DEFAULT '#17413f';
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS icon            TEXT NOT NULL DEFAULT 'sparkles';
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS sort_order      INT  NOT NULL DEFAULT 1;
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS is_locked       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS is_visible      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.foundation_sections ADD COLUMN IF NOT EXISTS is_published    BOOLEAN NOT NULL DEFAULT TRUE;


-- ────────────────────────────────────────────────────────────────────
-- 2) أعضاء القسم — من يعرض عنده هذا القسم بالضبط (يختارهم الأستاذ)
--    ملاحظة: لا وجود للعضو = لا وصول. هذا هو مصدر الحقيقة الوحيد.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.foundation_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id      UUID NOT NULL REFERENCES public.foundation_sections(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.profiles(id)            ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (section_id, user_id)
);

ALTER TABLE public.foundation_members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- ────────────────────────────────────────────────────────────────────
-- 3) دروس التأسيس — لا وحدات ولا واجبات ولا اختبارات: دروس فقط
--    kind يحدد شكل العرض في واجهة الطالب:
--      'text'  = نص فقط        'image' = صورة/صور
--      'video' = فيديو         'html'  = محتوى HTML تفاعلي
--      'mixed' = كل ما سبق معاً
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.foundation_lessons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id      UUID NOT NULL REFERENCES public.foundation_sections(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    kind            TEXT NOT NULL DEFAULT 'text',   -- text | image | video | html | mixed
    body_text       TEXT NOT NULL DEFAULT '',        -- النص المقروء
    cover_url       TEXT NOT NULL DEFAULT '',        -- صورة الغلاف
    images          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- صور الدرس
    video_url       TEXT NOT NULL DEFAULT '',        -- يوتيوب/ملف فيديو
    video_caption   TEXT NOT NULL DEFAULT '',
    html_content    TEXT NOT NULL DEFAULT '',        -- كود HTML الملصوق
    html_file_url   TEXT NOT NULL DEFAULT '',        -- ملف HTML مرفوع
    position        INT  NOT NULL DEFAULT 1,          -- الترتيب داخل القسم
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
    is_visible      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ترقية آمنة
ALTER TABLE public.foundation_lessons ADD COLUMN IF NOT EXISTS kind          TEXT NOT NULL DEFAULT 'text';
ALTER TABLE public.foundation_lessons ADD COLUMN IF NOT EXISTS body_text     TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_lessons ADD COLUMN IF NOT EXISTS video_url     TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_lessons ADD COLUMN IF NOT EXISTS video_caption TEXT NOT NULL DEFAULT '';
ALTER TABLE public.foundation_lessons ADD COLUMN IF NOT EXISTS position      INT  NOT NULL DEFAULT 1;
ALTER TABLE public.foundation_lessons ADD COLUMN IF NOT EXISTS is_locked     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.foundation_lessons ADD COLUMN IF NOT EXISTS is_visible    BOOLEAN NOT NULL DEFAULT TRUE;


-- ────────────────────────────────────────────────────────────────────
-- 4) تقدّم الطالب داخل التأسيس — لعرض "أنجزت كذا من كذا" ولمنع التكرار
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.foundation_progress (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id)            ON DELETE CASCADE,
    lesson_id       UUID NOT NULL REFERENCES public.foundation_lessons(id)   ON DELETE CASCADE,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, lesson_id)
);

ALTER TABLE public.foundation_progress ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- ────────────────────────────────────────────────────────────────────
-- 5) فهارس — سرعة التحقق أقل من ثانية (الأهم هنا)
--    الفهرس compound على (user_id, section_id) يجعل فحص الصلاحية
--    استعلاماً واحداً مفهرساً بدل مسح الجدول.
-- ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS foundation_members_user_idx      ON public.foundation_members (user_id);
CREATE INDEX IF NOT EXISTS foundation_members_section_idx   ON public.foundation_members (section_id);
CREATE INDEX IF NOT EXISTS foundation_members_user_section_idx ON public.foundation_members (user_id, section_id);

CREATE INDEX IF NOT EXISTS foundation_sections_order_idx    ON public.foundation_sections (sort_order);
CREATE INDEX IF NOT EXISTS foundation_sections_visible_idx  ON public.foundation_sections (is_visible, is_published);

CREATE INDEX IF NOT EXISTS foundation_lessons_section_idx   ON public.foundation_lessons (section_id);
CREATE INDEX IF NOT EXISTS foundation_lessons_order_idx     ON public.foundation_lessons (section_id, position);

CREATE INDEX IF NOT EXISTS foundation_progress_user_idx     ON public.foundation_progress (user_id);
CREATE INDEX IF NOT EXISTS foundation_progress_lesson_idx   ON public.foundation_progress (lesson_id);


-- ────────────────────────────────────────────────────────────────────
-- 6) سياسات الوصول — السيرفر يتصل بـ service-role ويتجاوز RLS،
--    لكن نُفعّلها احتياطاً حتى لو غُيّر مفتاح الاتصال لاحقاً.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.foundation_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundation_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundation_lessons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundation_progress  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_foundation_sections') THEN
    CREATE POLICY open_all_foundation_sections ON public.foundation_sections FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_foundation_members') THEN
    CREATE POLICY open_all_foundation_members ON public.foundation_members FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_foundation_lessons') THEN
    CREATE POLICY open_all_foundation_lessons ON public.foundation_lessons FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_foundation_progress') THEN
    CREATE POLICY open_all_foundation_progress ON public.foundation_progress FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────
-- 7) دالة تحقق الصلاحية الفورية (اختيارية — مفيدة إن أردت استدعاءها
--    من SQL مباشرة). وجود السطر في foundation_members = الدخول مسموح.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_foundation_access(p_section UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.foundation_members m
    WHERE m.section_id = p_section AND m.user_id = p_user
  );
$$;


-- ────────────────────────────────────────────────────────────────────
-- 8) فحص بعد التنفيذ: هل كل شيء جاهز؟
--    SELECT count(*) FROM information_schema.tables
--    WHERE table_name LIKE 'foundation_%';   -- يجب أن يُرجع 4
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ' , ') INTO missing
  FROM unnest(ARRAY['foundation_sections','foundation_members','foundation_lessons','foundation_progress']) AS t
  WHERE to_regclass('public.' || t) IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'نقص في الجداول: %', missing;
  END IF;

  RAISE NOTICE 'تم بنجاح — قسم التأسيس جاهز. اذهب إلى: إعدادات المنصة ← إعداد التأسيس.';
END $$;