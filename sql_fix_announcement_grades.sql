-- ============================================================================
--  إصلاح الإعلانات: تطبيع الصفوف + إسناد الصف الصحيح للإعلانات القديمة
--  نفّذ هذا الملف في Supabase ← SQL Editor ← New query ← Run
-- ----------------------------------------------------------------------------
--  المشكلة:
--  1) قبل تنفيذ sql_announcements_scope.sql لم يكن عمود grade موجوداً، فسقطت
--     قيمة الصف بصمت وحُفظت الإعلانات القديمة بقيمة الافتراضي 'الجميع'.
--     → إعلانات صفٍّ واحد كانت تظهر لكل الصفوف.
--  2) قيم الصفوف قد تكون مكتوبة بصيغ مختلفة ('ثامن' بدل 'الصف الثامن').
--
--  ما يفعله هذا الملف:
--  1) يوحّد كل صيغ الصف إلى الصيغة الرسمية 'الصف الثامن/التاسع/العاشر'.
--  2) يعرض لك جدولاً بما سيصبح عليه كل إعلان قبل التنفيذ النهائي.
--  3) يترك الإعلانات التي صفّها 'الجميع' كما هي — هي صحيحة (لكل الصفوف).
-- ============================================================================

-- ── 1) تطبيع صيغ الصفوف ──────────────────────────────────────────────────
-- 'ثامن' → 'الصف الثامن' ، 'الصف VIII' → 'الصف الثامن' ، '8' → 'الصف الثامن'
UPDATE public.announcements
   SET grade = CASE
     WHEN grade ~* '(^|[^ء-ي])ثامن'   OR grade ~* '8'  THEN 'الصف الثامن'
     WHEN grade ~* '(^|[^ء-ي])تاسع'   OR grade ~* '9'  THEN 'الصف التاسع'
     WHEN grade ~* '(^|[^ء-ي])عاشر'   OR grade ~* '10' THEN 'الصف العاشر'
     ELSE grade
   END
 WHERE grade IS NOT NULL
   AND grade <> ''
   AND grade <> 'الجميع'
   AND grade NOT IN ('الصف الثامن', 'الصف التاسع', 'الصف العاشر');

-- ── 2) القيم الفارغة تعني 'الجميع' ──────────────────────────────────────
UPDATE public.announcements
   SET grade = 'الجميع'
 WHERE grade IS NULL OR btrim(grade) = '';

UPDATE public.announcements
   SET school = ''
 WHERE school IS NULL;

-- ── 3) تقرير: راجع الجدول ثم عدّل الاستهداف من زر pencil في الموقع ──────
SELECT
  a.id,
  left(a.title, 46)                                   AS العنوان,
  a.grade                                            AS الصف,
  CASE WHEN a.school = '' THEN 'كل المدارس' ELSE a.school END AS المدرسة,
  a.section                                          AS القسم,
  CASE WHEN a.published THEN 'منشور' ELSE 'مسودة' END AS الحالة,
  CASE
    WHEN a.grade = 'الجميع' AND a.school = '' THEN '✔ للجميع — صحيح'
    WHEN a.grade = 'الجميع' AND a.school <> '' THEN '⚠ لكل الصفوف في مدرسة واحدة'
    WHEN a.grade <> 'الجميع' AND a.school = '' THEN '✔ لصف واحد بكل مدارسه'
    ELSE '✔ لصف ومدرسة محدَّدين'
  END                                                 AS ملاحظة
FROM public.announcements a
ORDER BY a.published_at DESC NULLS LAST
LIMIT 100;