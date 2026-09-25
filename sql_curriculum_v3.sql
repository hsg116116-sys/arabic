-- ====================================================================
-- منصة "أرض اللغة" — حزمة الميزات V3
-- 1) الملخصات (summaries): ملخص / خريطة ذهنية / ورقة عمل — لكل صف وفصل
-- 2) تكملة الدفتر (notebook_tasks + notebook_submissions): المعلم يطلب
--    تصوير الدفتر، والطلاب يرفعون الصور (ImageKit) والمعلم يقيّم
-- ملف تزايدي آمن — نفّذه مرة واحدة في Supabase SQL Editor
-- ====================================================================

-- ─────────────────────────────
-- 1. جدول الملخصات
-- ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    summary_type TEXT NOT NULL DEFAULT 'ملخص',
    grade TEXT NOT NULL DEFAULT 'الصف العاشر',
    term TEXT NOT NULL DEFAULT 'الفصل الأول',
    unit_title TEXT NOT NULL DEFAULT '',
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    cover_url TEXT NOT NULL DEFAULT '',
    file_url TEXT NOT NULL DEFAULT '',
    published BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS summaries_grade_term_idx ON public.summaries (grade, term, sort_order);

-- ─────────────────────────────
-- 2. مهام تكملة الدفتر
-- ─────────────────────────────
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notebook_tasks_grade_term_idx ON public.notebook_tasks (grade, term);

-- ─────────────────────────────
-- 3. تسليمات الدفاتر (صور الطلاب)
-- ─────────────────────────────
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

CREATE INDEX IF NOT EXISTS notebook_submissions_task_idx ON public.notebook_submissions (task_id);
CREATE INDEX IF NOT EXISTS notebook_submissions_user_idx ON public.notebook_submissions (user_id);

-- ─────────────────────────────
-- 4. سياسات الوصول المفتوحة (عبر API بالمفتاح)
-- ─────────────────────────────
DO $$ BEGIN
  BEGIN ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.notebook_tasks ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.notebook_submissions ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_summaries') THEN
    CREATE POLICY open_all_summaries ON public.summaries FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_notebook_tasks') THEN
    CREATE POLICY open_all_notebook_tasks ON public.notebook_tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_notebook_submissions') THEN
    CREATE POLICY open_all_notebook_submissions ON public.notebook_submissions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────
-- 5. بيانات ترحيبية: ملخصان للصف العاشر (المعلم يعدّلها من اللوحة)
-- ─────────────────────────────
INSERT INTO public.summaries (title, description, content, summary_type, grade, term, unit_title, sort_order, published) VALUES
('ملخص الوحدة الأولى: الحال والتشبيه', 'بطاقة مراجعة مركزة: تعريف الحال وأنواعها + أركان التشبيه مع شواهد.', 'الحال: وصف منصوب يبين هيئة صاحبه (مفردة/جملة/شبه جملة). التشبيه: مشبه + مشبه به + أداة + وجه شبه. البليغ ما حذف منه الأداة ووجه الشبه.', 'ملخص', 'الصف العاشر', 'الفصل الأول', 'الوحدة الأولى: الكلمة مفتاح القلوب', 1, TRUE),
('خريطة ذهنية: النداء', 'خريطة بصرية لأسلوب النداء: الأدوات وأنواع المنادى وحكمه.', 'أدوات النداء: الهمزة/أي (قريب) — أيا/هيا (بعيد) — يا (الكل). مبني: المفرد العلم والنكرة المقصودة. معرب منصوب: المضاف والشبيه بالمضاف والنكرة غير المقصودة.', 'خريطة ذهنية', 'الصف العاشر', 'الفصل الأول', 'الوحدة الثالثة: السلامة المهنية', 2, TRUE)
ON CONFLICT DO NOTHING;

-- تم بحمد الله
