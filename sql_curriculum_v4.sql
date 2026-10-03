-- ====================================================================
-- منصة "أرض اللغة" — حزمة التقسيم V4 (طلاب / طالبات)
-- 1) مفتاح التقسيم في الإعدادات: gender_split (يتحكم به الإداري فقط)
-- 2) عمود القسم section (الجميع/طالب/طالبة) على المحتوى الموجه
-- ملف تزايدي آمن — نفّذه مرة واحدة في Supabase SQL Editor
-- القاعدة: التقسيم يعمل فقط إذا فعّله الإداري، وإلا يرى الجميع كل شيء
-- ====================================================================

-- 1. مفتاح التقسيم
ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS gender_split BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. عمود القسم على الجداول الموجهة
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.notebook_tasks ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';

-- 3. فهارس
CREATE INDEX IF NOT EXISTS courses_section_idx ON public.courses (section);
CREATE INDEX IF NOT EXISTS summaries_section_idx ON public.summaries (grade, section);
CREATE INDEX IF NOT EXISTS assessments_section_idx ON public.assessments (grade, section);
CREATE INDEX IF NOT EXISTS notebook_tasks_section_idx ON public.notebook_tasks (grade, section);

-- تم بحمد الله
