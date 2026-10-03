-- ====================================================================
-- منصة "أرض اللغة" — مسح جميع الوحدات والدروس من Supabase (تنفيذ مرة واحدة)
-- نفّذ هذا الملف في Supabase SQL Editor بعد أخذ نسخة احتياطية عند الحاجة.
--
-- ماذا يفعل؟
--  1) يحذف كل الوحدات (courses) — والدروس (lessons) تُحذف تلقائياً عبر CASCADE.
--  2) يحذف التقدم المرتبط (lesson_progress / course_progress) والشهادات المرتبطة بوحدات.
--  3) يُصفّر بوابات "آخر ما وصلنا" (grade_gates) حتى لا تقفل الوحدات الجديدة.
--
-- ماذا يبقى؟ (لا يُمس)
--  الكتب (books)، الإعلانات (announcements)، حسابات الطلاب (profiles)،
--  الاختبارات والواجبات والملخصات (تبقى صفوفها لكن بلا وحدة — أعد ربطها من اللوحة).
--
-- بعد التنفيذ: أدخل الوحدات من Table Editor (courses ثم lessons) أو لوحة الأستاذ.
-- ====================================================================

BEGIN;

-- 1) التقدم المرتبط بالدروس/الوحدات (CASCADE يحذفها لاحقاً، لكن نحذف صراحة للأمان)
DELETE FROM public.lesson_progress;
DELETE FROM public.course_progress;

-- 2) الشهادات المرتبطة بوحدات موجودة (ستفقد معناها بعد مسح الوحدات)
DELETE FROM public.certificates WHERE course_id IS NOT NULL;

-- 3) الوحدات نفسها — الدروس تُحذف تلقائياً (lessons.course_id ON DELETE CASCADE)
DELETE FROM public.courses;

-- 4) تصفير البوابات: لا نقطة وصول قديمة تقفل الوحدات الجديدة عند الطلاب
DELETE FROM public.grade_gates;

-- 5) تحقق سريع — يجب أن تكون كلها صفراً
SELECT 'courses' AS tbl, COUNT(*) AS remaining FROM public.courses
UNION ALL SELECT 'lessons', COUNT(*) FROM public.lessons
UNION ALL SELECT 'lesson_progress', COUNT(*) FROM public.lesson_progress
UNION ALL SELECT 'course_progress', COUNT(*) FROM public.course_progress
UNION ALL SELECT 'grade_gates', COUNT(*) FROM public.grade_gates;

COMMIT;
