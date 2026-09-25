-- ====================================================================
-- منصة "أرض اللغة" — مهام الدفتر الاحترافية V6
-- 1) ربط المهمة بوحدة ودرس محددين (course_id موجود + lesson_id جديد)
-- 2) بنود المطلوب: requirements [{label, kind, place}] يحددها المعلم
--    (مثال: "اكتب قاعدة الحال — صفحة 12" + "ارسم خريطة التشبيه")
-- 3) تقييم كل بند: checks [{label, done}] محفوظة في كل تسليم
-- (ملف شامل لجدولي الدفتر: يعمل وحده حتى بدون v3 — نفّذه في SQL Editor)
-- ====================================================================

-- 1. جدول المهام (كاملاً إن لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS public.notebook_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT 'الصف العاشر',
    term TEXT NOT NULL DEFAULT 'الفصل الأول',
    unit_title TEXT NOT NULL DEFAULT '',
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    due_date DATE,
    points INT NOT NULL DEFAULT 10,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    section TEXT NOT NULL DEFAULT 'الجميع',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. الأعمدة الجديدة على المهام (آمنة إن كان الجدول موجوداً من v3)
ALTER TABLE public.notebook_tasks ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE public.notebook_tasks ADD COLUMN IF NOT EXISTS requirements JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notebook_tasks ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع';

-- 3. جدول التسليمات (كاملاً إن لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS public.notebook_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.notebook_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'مسلّم',
    score INT,
    feedback TEXT NOT NULL DEFAULT '',
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    UNIQUE (task_id, user_id)
);

-- 4. تقييم البنود في التسليم
ALTER TABLE public.notebook_submissions ADD COLUMN IF NOT EXISTS checks JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 5. فهارس
CREATE INDEX IF NOT EXISTS notebook_tasks_grade_term_idx ON public.notebook_tasks (grade, term);
CREATE INDEX IF NOT EXISTS notebook_tasks_lesson_idx ON public.notebook_tasks (lesson_id);
CREATE INDEX IF NOT EXISTS notebook_submissions_task_idx ON public.notebook_submissions (task_id);
CREATE INDEX IF NOT EXISTS notebook_submissions_user_idx ON public.notebook_submissions (user_id);

-- 6. سياسات الوصول
ALTER TABLE public.notebook_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebook_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_notebook_tasks') THEN
    CREATE POLICY open_all_notebook_tasks ON public.notebook_tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_notebook_submissions') THEN
    CREATE POLICY open_all_notebook_submissions ON public.notebook_submissions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- تم بحمد الله — بعد التنفيذ: مهام الدفتر تدعم الربط بالدرس وبنود المطلوب
