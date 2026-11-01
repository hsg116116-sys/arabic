-- ====================================================================
-- منصة "أرض اللغة" — قسم التحضير (v1)
--   ١) preparations        : تحضير للوحدة أو للدرس الواحد، لفترة محددة —
--                            يومي/أسبوعي/شهري (ملف الأستاذ + توقيع المشرفة + اعتماد المديرة)
--   ٢) preparation_events  : سجل تدقيق — مين حط إيه ومتى، لا يُحذف أبداً
--   ٣) profiles.prep_role  : تمييز دور صاحب الحساب داخل التحضير
--                            teacher = يرفع الملف · supervisor = يوقّع · director = تعتمِد
--                            (فارغ = الدور من profiles.role: admin→teacher، observer→supervisor)
-- الوحدات والدروس لا تُزرع هنا: تُقرأ من المنهاج (courses + lessons) مباشرة،
-- فيظهر كل جديد تلقائياً بلا أي بذر.
-- ملف تزايدي آمن — نفّذه مرة واحدة في Supabase SQL Editor
-- تكراره لا يكرّر البيانات ولا يمسح المرفوع. بدونه: القسم يعمل ويطلب تنفيذه برسالة واضحة.
-- ====================================================================

-- ── ١) أدوار التحضير ────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS prep_role TEXT;

-- مديرة الاعتماد: غيّر البريد إن أردت غير الدكتورة أسماء — أو من قسم التحضير نفسه
UPDATE public.profiles SET prep_role = 'director'
 WHERE email = 'asmaa@ard-allughah.com' AND (prep_role IS NULL OR prep_role = '');

-- ── ٢) جدول التحضير — سطر لكل (وحدة أو درس × فترة) ─────────────────
CREATE TABLE IF NOT EXISTS public.preparations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ما الذي يُحضَّر: الوحدة نفسها أو أحد دروسها
    target_id     UUID NOT NULL,                      -- معرّف الوحدة أو الدرس
    target_type   TEXT NOT NULL DEFAULT 'unit',       -- unit | lesson
    target_title  TEXT NOT NULL DEFAULT '',           -- عنوان يُقرأ حتى لو حُذف الدرس
    course_id     UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    lesson_id     UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
    grade         TEXT NOT NULL DEFAULT '',
    term          TEXT NOT NULL DEFAULT '',
    unit_title    TEXT NOT NULL DEFAULT '',
    unit_no       INT  NOT NULL DEFAULT 1,
    lesson_no     INT,

    -- الفترة التحضيرية: يومي / أسبوعي / شهري
    period_type   TEXT NOT NULL DEFAULT 'unit',       -- unit | daily | weekly | monthly
    period_key    TEXT NOT NULL DEFAULT '',           -- 2026-11-02 | 2026-11 | week-2026-11-01
    period_label  TEXT NOT NULL DEFAULT 'تحضير وحدة', -- ما يقرأه البشر
    period_start  DATE,
    period_end    DATE,

    -- الملف الذي يرفعه الأستاذ (PDF أو وورد) — الرابط فقط، والملف في ImageKit
    file_url      TEXT NOT NULL DEFAULT '',
    file_name     TEXT NOT NULL DEFAULT '',
    file_type     TEXT NOT NULL DEFAULT '',          -- pdf | docx | doc
    file_size     BIGINT NOT NULL DEFAULT 0,
    teacher_note  TEXT NOT NULL DEFAULT '',
    uploaded_by_name  TEXT NOT NULL DEFAULT '',
    uploaded_by_email TEXT NOT NULL DEFAULT '',
    uploaded_at   TIMESTAMPTZ,

    -- التواقيع: [{ name, email, signed_at, note }]
    supervisor_signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
    director_signatures   JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- إرجاع التحضير إلى الأستاذ مع ملاحظة
    return_note        TEXT NOT NULL DEFAULT '',
    returned_by_name   TEXT NOT NULL DEFAULT '',
    returned_by_email  TEXT NOT NULL DEFAULT '',
    returned_at        TIMESTAMPTZ,

    -- none | awaiting_supervisor | awaiting_director | approved | returned
    state       TEXT NOT NULL DEFAULT 'awaiting_supervisor',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    -- تحضير واحد لنفس الغرض في نفس الفترة — لا نسختان متنافستَان
    CONSTRAINT preparations_target_period_unique UNIQUE (target_id, period_key),
    CONSTRAINT preparations_target_matches CHECK (
      (target_type = 'unit'   AND lesson_id IS NULL)
      OR (target_type = 'lesson' AND lesson_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS preparations_grade_term_idx ON public.preparations (grade, term, unit_no);
CREATE INDEX IF NOT EXISTS preparations_state_idx      ON public.preparations (state);
CREATE INDEX IF NOT EXISTS preparations_period_idx     ON public.preparations (period_type, period_start DESC);
CREATE INDEX IF NOT EXISTS preparations_course_idx     ON public.preparations (course_id);
CREATE INDEX IF NOT EXISTS preparations_lesson_idx     ON public.preparations (lesson_id);

-- ── ٣) سجل التدقيق ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.preparation_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preparation_id UUID REFERENCES public.preparations(id) ON DELETE CASCADE,
    course_id      UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    action         TEXT NOT NULL,   -- uploaded | replaced | removed | signed_supervisor | unsigned_supervisor | signed_director | unsigned_director | returned | role_changed
    actor_name     TEXT NOT NULL DEFAULT '',
    actor_email    TEXT NOT NULL DEFAULT '',
    actor_role     TEXT NOT NULL DEFAULT '',
    note           TEXT NOT NULL DEFAULT '',
    meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS preparation_events_prep_idx   ON public.preparation_events (preparation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preparation_events_course_idx ON public.preparation_events (course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preparation_events_time_idx   ON public.preparation_events (created_at DESC);

-- ── ٤) ترحيل آمن إن كان تنفيذ قديم للملف موجوداً ────────────────────
--    الإصدار الأول كان يزرع سطراً فارغاً لكل وحدة ويقبل تحضيراً واحداً فقط؛
--    الآن السطر الفارغ بلا حاجة (الوحدات تُقرأ من المنهاج) والفترة عمود مُعتمد.
ALTER TABLE public.preparations DROP CONSTRAINT IF EXISTS preparations_unit_unique;
ALTER TABLE public.preparations ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE public.preparations ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE public.preparations ADD COLUMN IF NOT EXISTS target_title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.preparations ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE;
ALTER TABLE public.preparations ADD COLUMN IF NOT EXISTS lesson_no INT;

UPDATE public.preparations SET target_id = course_id WHERE target_id IS NULL;
UPDATE public.preparations SET target_title = unit_title WHERE target_title = '' OR target_title IS NULL;
UPDATE public.preparations SET
    period_type  = 'unit',
    period_key   = 'unit',
    period_label = 'تحضير الوحدة'
 WHERE period_key IS NULL OR period_key = '';
UPDATE public.preparations p SET target_type = 'unit', lesson_id = NULL WHERE p.target_type IS NULL;

ALTER TABLE public.preparations ALTER COLUMN target_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preparations_target_period_unique') THEN
    ALTER TABLE public.preparations ADD CONSTRAINT preparations_target_period_unique UNIQUE (target_id, period_key);
  END IF;
END $$;

-- أسطر Placeholder بلا ملف ولا توقيع تُحذف — الوحدة تبقى ظاهرة لأنها من المنهاج
DELETE FROM public.preparations
 WHERE file_url = ''
   AND supervisor_signatures = '[]'::jsonb
   AND director_signatures   = '[]'::jsonb
   AND COALESCE(teacher_note, '') = '';

-- تم بحمد الله — وحدات الثامن والتاسع والعاشر ودروسها تُقرأ من المنهاج مباشرة

