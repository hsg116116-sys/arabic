-- ====================================================================
-- منصة "أرض اللغة" — منظومة المنهاج الكاملة V2
-- الصفوف (الثامن/التاسع/العاشر) × الفصول × الوحدات × الدروس × الاختبارات
-- + بوابة "آخر ما وصلنا" التي يتحكم بها المعلم (grade_gates)
-- + أغلفة الوحدات والدروس وصور الدروس وملفات HTML
-- ملف تزايدي آمن: يعمل على قاعدة البيانات الحية دون حذف أي بيانات
-- نفّذه مرة واحدة في Supabase SQL Editor على مشروع:
-- https://zjxotgcsbsfwrfqtximw.supabase.co
-- ====================================================================

-- ─────────────────────────────────────────────
-- 1. أعمدة جديدة على الوحدات (courses)
-- ─────────────────────────────────────────────
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الصف العاشر';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT 'الفصل الأول';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cover_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- ─────────────────────────────────────────────
-- 2. أعمدة جديدة على الدروس (lessons)
-- ─────────────────────────────────────────────
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS lesson_type TEXT NOT NULL DEFAULT 'مطالعة';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS cover_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS html_content TEXT NOT NULL DEFAULT '';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS html_file_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الصف العاشر';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT 'الفصل الأول';

-- ─────────────────────────────────────────────
-- 3. أعمدة جديدة على الاختبارات (assessments)
-- ─────────────────────────────────────────────
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الصف العاشر';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT 'الفصل الأول';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS unit_title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- ─────────────────────────────────────────────
-- 4. عمود الصف على الإعلانات (لتوجيه إعلان لصف معين)
-- ─────────────────────────────────────────────
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الجميع';

-- ─────────────────────────────────────────────
-- 5. جدول الصفوف الدراسية
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_levels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.grade_levels (id, name, sort_order) VALUES
('grade-8', 'الصف الثامن', 1),
('grade-9', 'الصف التاسع', 2),
('grade-10', 'الصف العاشر', 3)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────
-- 6. بوابة "آخر ما وصلنا" — يحددها المعلم لكل صف وفصل
-- الطالب يرى فقط الوحدات/الدروس حتى هذه البوابة
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_gates (
    grade TEXT NOT NULL,
    term TEXT NOT NULL,
    unlocked_course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    unlocked_lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    unlocked_unit_order INT NOT NULL DEFAULT 99,
    note TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (grade, term)
);

INSERT INTO public.grade_levels (id, name, sort_order) VALUES
('grade-8', 'الصف الثامن', 1),
('grade-9', 'الصف التاسع', 2),
('grade-10', 'الصف العاشر', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.grade_gates (grade, term, unlocked_unit_order, note) VALUES
('الصف الثامن', 'الفصل الأول', 99, 'مفتوح بالكامل افتراضياً — يعدّلها المعلم'),
('الصف التاسع', 'الفصل الأول', 99, 'مفتوح بالكامل افتراضياً — يعدّلها المعلم'),
('الصف العاشر', 'الفصل الأول', 99, 'مفتوح بالكامل افتراضياً — يعدّلها المعلم'),
('الصف الثامن', 'الفصل الثاني', 99, ''),
('الصف التاسع', 'الفصل الثاني', 99, ''),
('الصف العاشر', 'الفصل الثاني', 99, '')
ON CONFLICT (grade, term) DO NOTHING;

-- ─────────────────────────────────────────────
-- 7. فهارس الأداء
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS courses_grade_term_idx ON public.courses (grade, term, sort_order);
CREATE INDEX IF NOT EXISTS lessons_course_position_idx ON public.lessons (course_id, position);
CREATE INDEX IF NOT EXISTS lessons_grade_term_idx ON public.lessons (grade, term);
CREATE INDEX IF NOT EXISTS assessments_grade_term_idx ON public.assessments (grade, term);
CREATE INDEX IF NOT EXISTS assessments_lesson_idx ON public.assessments (lesson_id);

-- ─────────────────────────────────────────────
-- 8. سياسات الوصول (RLS مفتوحة للقراءة والكتابة عبر API)
-- ─────────────────────────────────────────────
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_gates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_grade_levels') THEN
    CREATE POLICY open_all_grade_levels ON public.grade_levels FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_grade_gates') THEN
    CREATE POLICY open_all_grade_gates ON public.grade_gates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- فتح RLS على الجداول الأساسية إن كانت مفعّلة (حتى يعمل API بالمفتاح العام)
DO $$ BEGIN
  BEGIN ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_courses') THEN
    CREATE POLICY open_all_courses ON public.courses FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_lessons') THEN
    CREATE POLICY open_all_lessons ON public.lessons FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_assessments') THEN
    CREATE POLICY open_all_assessments ON public.assessments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_assessment_questions') THEN
    CREATE POLICY open_all_assessment_questions ON public.assessment_questions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ====================================================================
-- حُذفت وحدات ودروس واختبارات الصف العاشر المزروعة (b100/d100/e100/b800/b900) — 2026-09-30.
-- السبب: الوحدات تُدخل من Supabase/لوحة الأستاذ فقط —
-- الزرع البرمجي كان يسبب تعارض «مفتوحة عند الأستاذ / مقفلة عند الطلاب».
-- أُبقي على: الجداول والأعمدة والسياسات والبوابات ومستويات الصفوف.
-- ====================================================================

-- تم بحمد الله — نفّذ هذا الملف كاملاً في Supabase SQL Editor
