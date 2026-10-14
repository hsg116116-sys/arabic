-- ============================================================================
--  أرض اللغة — تبديل المصادقة إلى Kinde
--  نُفّذ هذا الملف مرة واحدة على مشروع Supabase قبل تشغيل السيرفر الجديد.
-- ============================================================================
--
--  لماذا عمود جديد بدل تغيير profiles.id؟
--  معرّف Kinde نصي (kp_...) بينما profiles.id مفتاح UUID، وستة جداول
--  تشير إليه بـ REFERENCES public.profiles(id):
--    lesson_progress, course_progress, certificates, learning_activity,
--    assignment_submissions, assessment_attempts
--  تغيير نوع المفتاح يعني إعادة بناء كل تلك الجداول وكل بياناتها بلا فائدة.
--
--  الحل: profiles.id يبقى UUID داخلياً كما هو، ونضيف auth_id يحمل معرّف
--  Kinde. باقي النظام (الدرجات، المجموعات، التسليمات) يبقى كما هو بلا تعديل.
-- ============================================================================

BEGIN;

-- ─────────────────────────────
--  1) عمود معرّف Kinde
-- ─────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_id TEXT;

COMMENT ON COLUMN public.profiles.auth_id IS
  'معرّف المستخدم في Kinde (قيمة sub من توكن الوصول). يُملأ عند أول دخول.';

-- ─────────────────────────────
--  2) فهرس فريد — حساب Kinde واحد لكل ملف شخصي
-- ─────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_id_key
  ON public.profiles (auth_id)
  WHERE auth_id IS NOT NULL;

-- ─────────────────────────────
--  3) فهارس البريد — للبحث أثناء ربط الحسابات القديمة بالجديدة
-- ─────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON public.profiles (email);

CREATE INDEX IF NOT EXISTS profiles_email_lower_idx
  ON public.profiles (lower(email));

COMMIT;

-- ============================================================================
--  بعد التنفيذ، اختبر:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'profiles' AND column_name = 'auth_id';
--  المتوقع: auth_id | text
-- ============================================================================