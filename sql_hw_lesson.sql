-- ====================================================================
-- منصة "أرض اللغة" — ربط الواجب بالدرس (v8)
--  assignments.lesson_id: الدرس المستهدف من الواجب (اختياري)
-- ملف تزايدي آمن — نفّذه مرة واحدة في Supabase SQL Editor
-- بدونه: الكود يعمل ويربط بالوحدة فقط (يتجاوز العمود الناقص تلقائياً)
-- ====================================================================

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assignments_lesson_idx ON public.assignments (lesson_id);

-- تم بحمد الله
