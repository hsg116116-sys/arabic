-- ====================================================================
-- منصة "أرض اللغة" — حزمة التقسيم لكل صف V5
-- التقسيم (طلاب/طالبات) يُضبط لكل صف على حدة، لا لجميع الصفوف معاً
-- (هذا الملف شامل: يغني عن v4 — نفّذه وحده إن لم تنفذ v4)
-- نفّذه مرة واحدة في Supabase SQL Editor — آمن وتزايدي
-- ====================================================================

-- 1. مفتاح التقسيم العام (يبقى للتوافق — التحكم الفعلي لكل صف أدناه)
ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS gender_split BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. عمود القسم على المحتوى الموجه (الجميع/طالب/طالبة)
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.summaries ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.notebook_tasks ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';

-- 3. الواجبات: صف + قسم (القديمة تبقى للجميع)
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الجميع';
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';

-- 4. جدول إعدادات كل صف (التقسيم لكل صف لحاله)
CREATE TABLE IF NOT EXISTS public.grade_settings (
    grade TEXT PRIMARY KEY,
    gender_split BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.grade_settings (grade, gender_split) VALUES
('الصف الثامن', FALSE),
('الصف التاسع', FALSE),
('الصف العاشر', FALSE)
ON CONFLICT (grade) DO NOTHING;

-- 5. فهارس
CREATE INDEX IF NOT EXISTS courses_section_idx ON public.courses (section);
CREATE INDEX IF NOT EXISTS summaries_section_idx ON public.summaries (grade, section);
CREATE INDEX IF NOT EXISTS assessments_section_idx ON public.assessments (grade, section);
CREATE INDEX IF NOT EXISTS notebook_tasks_section_idx ON public.notebook_tasks (grade, section);
CREATE INDEX IF NOT EXISTS assignments_grade_section_idx ON public.assignments (grade, section);

-- 6. سياسة الوصول
ALTER TABLE public.grade_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_grade_settings') THEN
    CREATE POLICY open_all_grade_settings ON public.grade_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- تم بحمد الله — بعد التنفيذ: الإعدادات → تقسيم كل صف على حدة
