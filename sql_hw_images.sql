-- ====================================================================
-- منصة "أرض اللغة" — صور الواجبات (v7)
--  1) assignments.images: صور توضيحية يضيفها الأستاذ على الواجب
--  2) assignment_submissions.photos: صور يرفقها الطالب بحلّه
-- ملف تزايدي آمن — نفّذه مرة واحدة في Supabase SQL Editor
-- بدونه: الكود يعمل بلا صور (يتجاوز الأعمدة الناقصة تلقائياً)
-- ====================================================================

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS assignments_course_idx ON public.assignments (course_id);

-- تم بحمد الله
