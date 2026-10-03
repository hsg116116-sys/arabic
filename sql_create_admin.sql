-- ====================================================================
-- إنشاء / تهيئة حساب الإدارة (Admin) — النسخة الآمنة
-- البريد :   admin@ardallughah.com
-- الدور  :   admin   (بوابة المعلم / الإدارة /teacher)
--
-- ✅ الأمان:
--   1) كلمة المرور تُخزَّن مشفّرة فقط (bcrypt) عبر crypt() + gen_salt('bf')
--   2) تُكتب مرة واحدة في متغير v_pass ثم تُشفَّر داخل الحساب مباشرة
--   3) آمن التكرار (idempotent) — إن كان الحساب موجوداً نُحدّث كلمة مروره ولن نكسر شيئاً
--   4) لا يلمس أي بيانات أخرى في الجداول
--
-- ⚠️ IMPORTANT: غيّر قيمة v_pass أدناه إلى كلمة مرور قوية تختارها أنت
--    قبل التنفيذ. بعد التنفيذ ستسجل الدخول بكلمة المرور الجديدة فقط.
-- ====================================================================

DO $$
DECLARE
  v_email text := 'admin@ardallughah.com';
  v_name  text := 'الأستاذ أحمد يحيى الأسطل';
  v_pass  text := 'REPLACE_WITH_YOUR_STRONG_PASSWORD';  -- <<< ضع هنا كلمة مرورك القوية قبل التنفيذ
  v_hkey  text;
  v_uid   uuid;
BEGIN
  -- تشفير كلمة المرور (bcrypt) — لا تُخزَّن إطلاقاً كنص صريح
  v_hkey := crypt(v_pass, gen_salt('bf'));

  SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

  IF v_uid IS NULL THEN
    -- الحساب غير موجود: إنشاء جديد
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_sent_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, recovery_token,
      email_change_token_new, email_change_token_current, email_change,
      email_change_confirm_status, banned_until, reauthentication_token,
      is_anonymous, deleted_at, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', v_email, v_hkey,
      NOW(), NOW(), NOW(), NOW(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('full_name', v_name, 'role', 'admin'),
      FALSE, '', '', '', '', '', 0, NULL, '', FALSE, NULL, FALSE
    );
  ELSE
    -- الحساب موجود: تحديث كلمة المرور المشفرة فقط (لا نعدّل بيانات أخرى)
    UPDATE auth.users
    SET encrypted_password = v_hkey,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_uid;
  END IF;

  -- سجل المشرف في جدول profiles بصلاحية admin (إن وُجد بدور student نُرقّيه)
  INSERT INTO public.profiles (
    id, email, full_name, role, student_number,
    school, branch, grade, section, gender, phone, status
  ) VALUES (
    v_uid, v_email, v_name, 'admin', '',
    'مدرسة وايلد', 'المسار الأكاديمي', 'الصف العاشر', 'أ', 'طالب', '', 'نشط'
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    status = 'نشط',
    updated_at = NOW();

  RAISE NOTICE 'Admin ready: % (id=%) password now bcrypt-hashed.', v_email, v_uid;
END $$;

-- ====================================================================
-- بعد التنفيذ:
--   البريد: admin@ardallughah.com
--   كلمة المرور: القيمة التي وضعتها في v_pass
--   الجهة: /teacher  (بوابة الإدارة محمية بالدور admin فقط)
-- ====================================================================