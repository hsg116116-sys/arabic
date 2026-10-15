-- ============================================================================
--  إعلانات المنصة — تفعيل الاستهداف بالصف والمدرسة
--  نفّذ هذا الملف في Supabase ← SQL Editor ← New query ← Run
-- ----------------------------------------------------------------------------
--  لماذا؟ بدون هذه الأعمدة، النشر يُسقط grade/section/school بصمت
--  (انظر مسار tolerantWrite في curriculum.ts)، فيصل الإعلان للجميع
--  أو — على مخططات أقدم — لا يراه الطالب أصلاً.
--
--  بعد التنفيذ: كل إعلان يُخزَّن بصفّه ومدرسته، ويظهر لمن يطابقهما فقط.
-- ============================================================================

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS grade   TEXT NOT NULL DEFAULT 'الجميع',
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'الجميع',
  ADD COLUMN IF NOT EXISTS school  TEXT NOT NULL DEFAULT '';

-- الفهارس:لأنnقائمة الإعلانات تُفلتر بالصف والمدرسة
CREATE INDEX IF NOT EXISTS announcements_grade_idx  ON public.announcements (grade);
CREATE INDEX IF NOT EXISTS announcements_school_idx ON public.announcements (school);
CREATE INDEX IF NOT EXISTS announcements_scope_idx  ON public.announcements (published, grade, school);

-- تأكيد سريع — يجب أن ترى 3 أعمدة
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'announcements'
     AND column_name IN ('grade', 'section', 'school');
  RAISE NOTICE 'أعمدة الاستهداف المتاحة: %', COALESCE(cols, 'لا شيء — راجع الصلاحيات');
END $$;