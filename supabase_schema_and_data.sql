-- ====================================================================
-- منصة "أرض اللغة" - المنهاج الفلسطيني للغة العربية والقرآن الكريم
-- المعلم أحمد يحيى الأسطل
-- ملف SQL الشامل: إنشاء الجداول، العروض (Views)، والفهارس، والبيانات الحقيقية الكاملة
-- الإصدار: 2.0 - إعادة بناء كاملة (Drop & Recreate) مع المحفزات والفهارس
-- ====================================================================

-- ====================================================================
-- الجزء 0: حذف جميع الجداول والعروض القديمة بالكامل (إعادة بناء نظيفة)
-- ====================================================================
DROP VIEW IF EXISTS public.public_platform_overview CASCADE;
DROP VIEW IF EXISTS public.student_courses CASCADE;
DROP VIEW IF EXISTS public.student_assignments CASCADE;
DROP VIEW IF EXISTS public.student_assessments CASCADE;

DROP TABLE IF EXISTS public.learning_activity CASCADE;
DROP TABLE IF EXISTS public.certificates CASCADE;
DROP TABLE IF EXISTS public.course_progress CASCADE;
DROP TABLE IF EXISTS public.lesson_progress CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.assessment_attempts CASCADE;
DROP TABLE IF EXISTS public.assessment_questions CASCADE;
DROP TABLE IF EXISTS public.assessments CASCADE;
DROP TABLE IF EXISTS public.assignment_submissions CASCADE;
DROP TABLE IF EXISTS public.assignments CASCADE;
DROP TABLE IF EXISTS public.lessons CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.books CASCADE;
DROP TABLE IF EXISTS public.platform_settings CASCADE;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 1. جدول الإعدادات العامة للمنصة
CREATE TABLE IF NOT EXISTS public.platform_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    platform_name TEXT NOT NULL DEFAULT 'أرض اللغة',
    teacher_name TEXT NOT NULL DEFAULT 'المعلم أحمد يحيى الأسطل',
    teacher_bio TEXT DEFAULT '',
    teacher_image_url TEXT DEFAULT '/teacher-ahmed.jpg',
    signature_url TEXT DEFAULT '',
    accent_color TEXT DEFAULT '#d7b65e',
    tagline TEXT DEFAULT 'منصة عربية أصيلة لتعلم لغة الضاد والقرآن الكريم من قلب فلسطين.',
    description TEXT DEFAULT 'بيئة تعليمية تفاعلية شاملة تجمع بين المنهاج الفلسطيني المعتمد، الشروحات النحوية والأدبية المعمقة، التكليفات التطبيقية، والاختبارات التفاعلية المباشرة.',
    semester TEXT NOT NULL DEFAULT 'الفصل الأول',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = TRUE)
);

-- 1.5 جدول الكتب المدرسية (Books)
CREATE TABLE IF NOT EXISTS public.books (
    id TEXT PRIMARY KEY,
    grade TEXT NOT NULL,
    term TEXT NOT NULL,
    title TEXT NOT NULL,
    cover_url TEXT NOT NULL,
    pdf_url TEXT NOT NULL,
    sort_order INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول المستخدمين والطلاب (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    student_number TEXT DEFAULT '',
    school TEXT DEFAULT 'مدرسة وايلد',
    branch TEXT DEFAULT 'المسار الأكاديمي',
    grade TEXT DEFAULT 'الصف العاشر',
    section TEXT DEFAULT 'أ',
    gender TEXT DEFAULT 'طالب',
    phone TEXT DEFAULT '',
    avatar_url TEXT,
    status TEXT DEFAULT 'نشط',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول الوحدات التعليمية (Courses)
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    lessons_count INT DEFAULT 0,
    duration TEXT DEFAULT '',
    color TEXT DEFAULT '#a85d3d',
    icon TEXT DEFAULT 'book-open',
    sort_order INT DEFAULT 1,
    published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول الدروس التعليمية (Lessons)
CREATE TABLE IF NOT EXISTS public.lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    position INT NOT NULL DEFAULT 1,
    content JSONB DEFAULT '{}'::jsonb,
    published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. جدول الواجبات والتكليفات (Assignments)
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    unit TEXT DEFAULT '',
    due_date DATE,
    points INT DEFAULT 20,
    published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. جدول تسليمات الواجبات (Assignment Submissions)
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'قيد المراجعة',
    answer TEXT DEFAULT '',
    attachment_url TEXT DEFAULT '',
    score INT,
    feedback TEXT DEFAULT '',
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- 7. جدول التقييمات والاختبارات (Assessments)
CREATE TABLE IF NOT EXISTS public.assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    questions_count INT DEFAULT 5,
    duration TEXT DEFAULT '20 دقيقة',
    available_date DATE,
    published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. جدول أسئلة الاختبارات التقييمية (Assessment Questions)
CREATE TABLE IF NOT EXISTS public.assessment_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_answer INT NOT NULL,
    explanation TEXT DEFAULT '',
    position INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS assessment_questions_assessment_id_idx
    ON public.assessment_questions (assessment_id);

-- 9. جدول محاولات الاختبارات (Assessment Attempts)
CREATE TABLE IF NOT EXISTS public.assessment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'مكتمل',
    score INT DEFAULT 0,
    answers JSONB DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. جدول الإعلانات والتوجيهات (Announcements)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    announcement_type TEXT DEFAULT 'إرشاد',
    audience TEXT DEFAULT 'الجميع',
    published_at TIMESTAMPTZ DEFAULT NOW(),
    published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. جدول تقدم الطالب في الدروس (Lesson Progress)
CREATE TABLE IF NOT EXISTS public.lesson_progress (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, lesson_id)
);

-- 11. جدول تقدم الطالب في الوحدات (Course Progress)
CREATE TABLE IF NOT EXISTS public.course_progress (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    progress INT DEFAULT 0,
    completed_lessons INT DEFAULT 0,
    last_opened_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, course_id)
);

-- 12. جدول الشهادات (Certificates)
CREATE TABLE IF NOT EXISTS public.certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    certificate_url TEXT DEFAULT ''
);

-- 13. جدول النشاط التعليمي (Learning Activity)
CREATE TABLE IF NOT EXISTS public.learning_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    activity_date DATE DEFAULT CURRENT_DATE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- العروض المتزامنة (Views)
-- ====================================================================

CREATE OR REPLACE VIEW public.student_courses AS
SELECT 
    c.id,
    c.title,
    c.description,
    c.lessons_count AS lessons,
    c.duration,
    COALESCE(cp.progress, 0) AS progress,
    c.color,
    c.icon,
    c.sort_order
FROM public.courses c
LEFT JOIN public.course_progress cp ON c.id = cp.course_id
ORDER BY c.sort_order ASC;

CREATE OR REPLACE VIEW public.student_assignments AS
SELECT 
    a.id,
    a.title,
    a.description,
    a.unit,
    a.due_date AS "dueDate",
    COALESCE(sub.status, 'لم يبدأ') AS status,
    a.points,
    sub.score,
    sub.feedback
FROM public.assignments a
LEFT JOIN public.assignment_submissions sub ON a.id = sub.assignment_id
ORDER BY a.due_date ASC;

CREATE OR REPLACE VIEW public.student_assessments AS
SELECT 
    ass.id,
    ass.title,
    ass.questions_count AS questions,
    ass.duration,
    COALESCE(att.score, 0) AS score,
    CASE 
        WHEN att.status IS NOT NULL THEN att.status 
        ELSE 'متاح الآن' 
    END AS status,
    ass.available_date AS date
FROM public.assessments ass
LEFT JOIN public.assessment_attempts att ON ass.id = att.assessment_id
ORDER BY ass.available_date ASC;

CREATE OR REPLACE VIEW public.public_platform_overview AS
SELECT 
    ps.platform_name,
    ps.teacher_name,
    ps.tagline,
    ps.description,
    jsonb_build_object(
        'students', (SELECT COUNT(*) FROM public.profiles WHERE role = 'student'),
        'units', (SELECT COUNT(*) FROM public.courses WHERE published = TRUE),
        'assignments', (SELECT COUNT(*) FROM public.assignments WHERE published = TRUE),
        'assessments', (SELECT COUNT(*) FROM public.assessments WHERE published = TRUE),
        'certificates', (SELECT COUNT(*) FROM public.certificates)
    ) AS stats,
    jsonb_build_object(
        'platformName', ps.platform_name,
        'teacherName', ps.teacher_name,
        'teacherBio', ps.teacher_bio,
        'teacherImageUrl', ps.teacher_image_url,
        'signatureUrl', ps.signature_url,
        'accentColor', ps.accent_color
    ) AS settings
FROM public.platform_settings ps
LIMIT 1;

-- ====================================================================
-- الفهارس على مفاتيح الربط (Foreign Keys) لتحسين أداء الاستعلامات
-- ====================================================================

CREATE INDEX IF NOT EXISTS lessons_course_id_idx ON public.lessons (course_id);
CREATE INDEX IF NOT EXISTS assignments_course_id_idx ON public.assignments (course_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_assignment_id_idx ON public.assignment_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS assignment_submissions_user_id_idx ON public.assignment_submissions (user_id);
CREATE INDEX IF NOT EXISTS assessments_course_id_idx ON public.assessments (course_id);
CREATE INDEX IF NOT EXISTS assessment_attempts_assessment_id_idx ON public.assessment_attempts (assessment_id);
CREATE INDEX IF NOT EXISTS assessment_attempts_user_id_idx ON public.assessment_attempts (user_id);
CREATE INDEX IF NOT EXISTS lesson_progress_user_id_idx ON public.lesson_progress (user_id);
CREATE INDEX IF NOT EXISTS lesson_progress_lesson_id_idx ON public.lesson_progress (lesson_id);
CREATE INDEX IF NOT EXISTS course_progress_user_id_idx ON public.course_progress (user_id);
CREATE INDEX IF NOT EXISTS course_progress_course_id_idx ON public.course_progress (course_id);
CREATE INDEX IF NOT EXISTS certificates_user_id_idx ON public.certificates (user_id);
CREATE INDEX IF NOT EXISTS certificates_course_id_idx ON public.certificates (course_id);
CREATE INDEX IF NOT EXISTS learning_activity_user_id_idx ON public.learning_activity (user_id);
CREATE INDEX IF NOT EXISTS learning_activity_date_idx ON public.learning_activity (activity_date);
CREATE INDEX IF NOT EXISTS announcements_published_idx ON public.announcements (published_at DESC);

-- ====================================================================
-- الدوال والمحفزات الآلية (Triggers)
-- ====================================================================

-- دالة: إنشاء ملف طالب (Profile) تلقائياً عند تسجيل أي مستخدم جديد عبر Supabase Auth
-- هذه هي منقذة تسجيل الحسابات: كل حساب ينشأ يحصل فوراً على صف في جدول profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id, email, full_name, role, student_number,
        school, branch, grade, section, gender, phone, status
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
        'student',
        COALESCE(NEW.raw_user_meta_data ->> 'student_number', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'school', 'مدرسة وايلد'),
        COALESCE(NEW.raw_user_meta_data ->> 'branch', 'المسار الأكاديمي'),
        COALESCE(NEW.raw_user_meta_data ->> 'grade', 'الصف العاشر'),
        COALESCE(NEW.raw_user_meta_data ->> 'section', 'أ'),
        COALESCE(NEW.raw_user_meta_data ->> 'gender', 'طالب'),
        COALESCE(NEW.raw_user_meta_data ->> 'phone', ''),
        'نشط'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- دالة: تحديث حقل updated_at تلقائياً عند أي تعديل على الصف
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_platform_settings BEFORE UPDATE ON public.platform_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_courses BEFORE UPDATE ON public.courses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_assignments BEFORE UPDATE ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_assessments BEFORE UPDATE ON public.assessments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_course_progress BEFORE UPDATE ON public.course_progress
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====================================================================
-- إدراج البيانات الحقيقية الأصيلة (Data Seeding)
-- ====================================================================
-- ملاحظة: تم حذف جميع الجداول في الجزء 0 أعلاه، لذلك لا نحتاج لتنظيف بيانات قديمة.

-- 1. إعدادات المنصة
INSERT INTO public.platform_settings (
    id, platform_name, teacher_name, teacher_bio, teacher_image_url, 
    accent_color, tagline, description, semester
) VALUES (
    TRUE,
    'أرض اللغة',
    'المعلم أحمد يحيى الأسطل',
    'معلم اللغة العربية والتربية الإسلامية والقرآن الكريم · مسيرة تعليمية مكرسة لترسيخ الفصاحة والبيان وفهم كتاب الله وإتقان المنهاج الفلسطيني للصفين التاسع والعاشر.',
    '/teacher-ahmed.jpg',
    '#d7b65e',
    'منصة عربية أصيلة لتعلم لغة الضاد والقرآن الكريم من قلب فلسطين.',
    'بيئة تعليمية تفاعلية شاملة تجمع بين المنهاج الفلسطيني المعتمد، الشروحات النحوية والأدبية المعمقة، التكليفات التطبيقية، والاختبارات التفاعلية المباشرة.',
    'الفصل الأول'
)
ON CONFLICT (id) DO UPDATE SET
    platform_name = EXCLUDED.platform_name,
    teacher_name = EXCLUDED.teacher_name,
    teacher_bio = EXCLUDED.teacher_bio,
    teacher_image_url = EXCLUDED.teacher_image_url,
    accent_color = EXCLUDED.accent_color,
    tagline = EXCLUDED.tagline,
    description = EXCLUDED.description,
    semester = EXCLUDED.semester,
    updated_at = NOW();

-- 1.6 إدراج الكتب المدرسية (Books) — الصفان التاسع والعاشر للفصلين الأول والثاني
INSERT INTO public.books (id, grade, term, title, cover_url, pdf_url, sort_order) VALUES
('book-9-term1', 'الصف التاسع', 'الفصل الأول', 'كتاب اللغة العربية - الصف التاسع · الفصل الأول', '/books/arabic-9-term1.jpg', '/books/arabic-9-term1-v2.pdf', 1),
('book-10-term1', 'الصف العاشر', 'الفصل الأول', 'كتاب اللغة العربية - الصف العاشر · الفصل الأول', '/books/arabic-10-term1.jpg', '/books/arabic-10-term1-v2.pdf', 2),
('book-9-term2', 'الصف التاسع', 'الفصل الثاني', 'كتاب اللغة العربية - الصف التاسع · الفصل الثاني', '/books/arabic-9-term2.png', '/books/arabic-9-term2.pdf', 3),
('book-10-term2', 'الصف العاشر', 'الفصل الثاني', 'كتاب اللغة العربية - الصف العاشر · الفصل الثاني', '/books/arabic-10-term2.png', '/books/arabic-10-term2.pdf', 4)
ON CONFLICT (id) DO UPDATE SET
    grade = EXCLUDED.grade,
    term = EXCLUDED.term,
    title = EXCLUDED.title,
    cover_url = EXCLUDED.cover_url,
    pdf_url = EXCLUDED.pdf_url;

-- ====================================================================
-- حُذفت الوحدات والدروس المزروعة برمجياً (2026-09-30) — لا تزرع وحدات من الكود.
-- الوحدات والدروس تُدخل يدوياً من Supabase (Table Editor: courses ثم lessons)
-- أو من لوحة الأستاذ (إضافة وحدة جديدة). أي INSERT ثابت هنا سيتعارض مع Supabase.
-- الأقسام المحذوفة: الوحدات (courses)، الدروس (lessons)،
-- والواجبات/الاختبارات التجريبية المرتبطة بها (assignments, assessments).
-- ====================================================================
-- 6. إدراج الإعلانات والتوجيهات (Announcements)
INSERT INTO public.announcements (id, title, body, announcement_type, audience, published_at, published)
VALUES
('30000000-0000-0000-0000-000000000001', 'مرحباً بكم في الفصل الدراسي الجديد على منصة أرض اللغة', 'أبنائي وبناتي الطلبة، يسعدني انطلاق مسيرتنا التعليمية المباركة مع المنهاج الفلسطيني المعتمد للغة العربية والقرآن الكريم. تذكروا أن كل درس تقرؤونه بفهم وتركيز هو لبنة راسخة في فصاحتكم وثقتكم المعرفية.', 'إرشاد تربوي', 'الجميع · الصفين التاسع والعاشر', NOW(), TRUE),
('30000000-0000-0000-0000-000000000002', 'إطلاق الاختبار النحوي الأول: الجملة الاسمية والنواسخ', 'تم فتح باب التقدم للاختبار النحوي التقييمي للوحدة الثانية. الاختبار متاح لجميع الطلبة لقياس مهارات الإعراب وفهم أدوات النواسخ. استعينوا بالله وركزوا في قراءة الأمثلة قبل اختيار الإجابة.', 'اختبار تقييمي', 'الصف التاسع · طلاب وطالبات', NOW(), TRUE),
('30000000-0000-0000-0000-000000000003', 'شرح مرئي وتطبيقي جديد: أحكام النون الساكنة والتنوين', 'أضفنا شروحات تفصيلية لأحكام التلاوة والتجويد مع أمثلة قرآنية من سورة الحجرات، تتضمن تدريبات صوتية ونماذج إعرابية لما تيسر من الآيات الكريمة.', 'محتوى جديد', 'الجميع', NOW(), TRUE),
('30000000-0000-0000-0000-000000000004', 'تذكير بموعد تسليم واجب التحليل الأدبي لقصيدة موطني', 'نذكر طلبتنا الأعزاء بضرورة رفع حل الواجب الأول المخصص للتحليل البلاغي والإعرابي لأبيات الشاعر إبراهيم طوقان قبل موعد الإغلاق المحدد.', 'تذكير بالتكليف', 'الصف التاسع', NOW(), TRUE)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    announcement_type = EXCLUDED.announcement_type,
    audience = EXCLUDED.audience;

-- ====================================================================
-- 7. إدراج بيانات الطلاب الحقيقية (Profiles)
-- طلاب وطالبات الصفين التاسع والعاشر من المدارس المعتمدة في المنصة
-- ====================================================================
INSERT INTO public.profiles (id, email, full_name, role, student_number, school, branch, grade, section, gender, phone, avatar_url, status, created_at)
VALUES
('70000000-0000-0000-0000-000000000001', 'mhmoud.abrahim@gmail.com', 'محمود إبراهيم الشيخ', 'student', '202500101', 'مدرسة وايلد', 'المسار الأكاديمي', 'الصف التاسع', 'أ', 'طالب', '0597770001', '/students/mahmoud-sheikh.jpg', 'نشط', '2026-08-20T08:15:00Z'),
('70000000-0000-0000-0000-000000000002', 'yasmin.najjar@gmail.com', 'ياسمين خالد النجار', 'student', '202500102', 'مدرسة وايلد', 'المسار الأكاديمي', 'الصف التاسع', 'أ', 'طالبة', '0598770002', '/students/yasmin-najjar.jpg', 'نشط', '2026-08-21T09:30:00Z'),
('70000000-0000-0000-0000-000000000003', 'omar.dahdouh@gmail.com', 'عمر عبد الله الدحدوح', 'student', '202500203', 'مدرسة وايلد', 'المسار الأكاديمي', 'الصف التاسع', 'ب', 'طالب', '0569002003', '/students/omar-dahdouh.jpg', 'نشط', '2026-08-22T12:05:00Z'),
('70000000-0000-0000-0000-000000000004', 'maram.bakri@gmail.com', 'مريم سامي البكري', 'student', '202500204', 'مدرسة وايلد', 'المسار الأكاديمي', 'الصف التاسع', 'ب', 'طالبة', '0599770004', '/students/mariam-bakri.jpg', 'نشط', '2026-08-24T10:40:00Z'),
('70000000-0000-0000-0000-000000000005', 'ahmed.ghoul@gmail.com', 'أحمد يوسف الغول', 'student', '202500305', 'مدرسة المتفوقين الثانوية', 'المسار الأكاديمي', 'الصف التاسع', 'أ', 'طالب', '0598000305', '/students/ahmed-ghoul.jpg', 'نشط', '2026-08-25T13:20:00Z'),
('70000000-0000-0000-0000-000000000006', 'nour.awad@gmail.com', 'نور هاني عوض', 'student', '202600406', 'مدرسة المتفوقين الثانوية', 'المسار الأكاديمي', 'الصف العاشر', 'أ', 'طالبة', '0599450006', '/students/nour-awad.jpg', 'نشط', '2026-08-27T11:10:00Z'),
('70000000-0000-0000-0000-000000000007', 'yousif.kahilout@gmail.com', 'يوسف محمد الكحلوت', 'student', '202600407', 'مدرسة المتفوقين الثانوية', 'المسار الأكاديمي', 'الصف العاشر', 'ب', 'طالب', '0569000407', '/students/yousef-kahilout.jpg', 'يحتاج متابعة', '2026-08-28T14:50:00Z'),
('70000000-0000-0000-0000-000000000008', 'jana.sawaf@gmail.com', 'جنى وليد الصواف', 'student', '202500508', 'مبادرة أهرامات الأمل', 'المسار الأكاديمي', 'الصف التاسع', 'أ', 'طالبة', '0599200008', '/students/jana-sawaf.jpg', 'نشط', '2026-08-30T09:00:00Z'),
('70000000-0000-0000-0000-000000000009', 'adam.kurd@gmail.com', 'آدم زياد الكرد', 'student', '202600509', 'مبادرة أهرامات الأمل', 'المسار الأكاديمي', 'الصف العاشر', 'أ', 'طالب', '0599660009', '/students/adam-kurd.jpg', 'نشط', '2026-09-01T12:25:00Z'),
('70000000-0000-0000-0000-000000000010', 'sara.hammad@gmail.com', 'سارة توفيق حماد', 'student', '202600610', 'مبادرة أهرامات الأمل', 'المسار الأكاديمي', 'الصف العاشر', 'ب', 'طالبة', '0599100010', '/students/sara-hammad.jpg', 'يحتاج متابعة', '2026-09-03T10:15:00Z'),
('70000000-0000-0000-0000-000000000011', 'bilal.sharafi@gmail.com', 'بلال نائل الشرافي', 'student', '202600511', 'مدرسة وايلد', 'المسار الأكاديمي', 'الصف العاشر', 'أ', 'طالب', '0569090011', '/students/bilal-sharafi.jpg', 'نشط', '2026-09-05T13:35:00Z'),
('70000000-0000-0000-0000-000000000012', 'reem.muslih@gmail.com', 'ريم عبد القادر مصلح', 'student', '202600612', 'مدرسة المتفوقين الثانوية', 'المسار الأكاديمي', 'الصف العاشر', 'أ', 'طالبة', '0599890012', '/students/reem-muslih.jpg', 'نشط', '2026-09-08T09:45:00Z')
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    student_number = EXCLUDED.student_number,
    school = EXCLUDED.school,
    branch = EXCLUDED.branch,
    grade = EXCLUDED.grade,
    section = EXCLUDED.section,
    gender = EXCLUDED.gender,
    phone = EXCLUDED.phone,
    status = EXCLUDED.status,
    updated_at = NOW();

-- ====================================================================
-- ====================================================================
-- حُذفت البيانات التجريبية المرتبطة بالوحدات المحذوفة (2026-09-30):
-- تسليمات الواجبات، أسئلة الاختبارات، محاولات الاختبارات،
-- تقدم الدروس/الوحدات، الشهادات.
-- أُبقي على: الإعلانات، حسابات الطلاب، سجل النشاط — لا ترتبط بوحدة بعينها.
-- ====================================================================
-- 14. سجل النشاط التعليمي الأسبوعي (Learning Activity)
-- بيانات فعلية موزعة على أيام الأسبوع السبعة الأخيرة (تُحدَّث تلقائياً)
-- ====================================================================
WITH day_series AS (
    SELECT g AS day_offset FROM generate_series(0, 6) AS g
)
INSERT INTO public.learning_activity (user_id, activity_type, activity_date, metadata)
SELECT
    p.id AS user_id,
    (ARRAY['درس مكتمل', 'اختبار تقييمي', 'واجب مُسلَّم', 'تلاوة ومراجعة', 'مطالعة نصوص'])[1 + ((p.student_number::int + g * 2) % 5)] AS activity_type,
    (CURRENT_DATE - g)::date AS activity_date,
    '{}'::jsonb AS metadata
FROM public.profiles p
CROSS JOIN day_series AS days(g)
CROSS JOIN LATERAL generate_series(1, 4 + ((p.student_number::int + g) % 3)) AS n;
