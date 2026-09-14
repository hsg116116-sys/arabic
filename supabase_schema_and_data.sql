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
('book-9-term1', 'الصف التاسع', 'الفصل الأول', 'كتاب اللغة العربية - الصف التاسع · الفصل الأول', '/books/arabic-9-term1.jpg', '/books/arabic-9-term1.pdf', 1),
('book-10-term1', 'الصف العاشر', 'الفصل الأول', 'كتاب اللغة العربية - الصف العاشر · الفصل الأول', '/books/arabic-10-term1.jpg', '/books/arabic-10-term1.pdf', 2),
('book-9-term2', 'الصف التاسع', 'الفصل الثاني', 'كتاب اللغة العربية - الصف التاسع · الفصل الثاني', '/books/arabic-9-term2.png', '/books/arabic-9-term2.pdf', 3),
('book-10-term2', 'الصف العاشر', 'الفصل الثاني', 'كتاب اللغة العربية - الصف العاشر · الفصل الثاني', '/books/arabic-10-term2.png', '/books/arabic-10-term2.pdf', 4)
ON CONFLICT (id) DO UPDATE SET
    grade = EXCLUDED.grade,
    term = EXCLUDED.term,
    title = EXCLUDED.title,
    cover_url = EXCLUDED.cover_url,
    pdf_url = EXCLUDED.pdf_url;

-- 2. إدراج الوحدات التعليمية (Courses)
INSERT INTO public.courses (id, title, description, lessons_count, duration, color, icon, sort_order, published)
VALUES
('00000000-0000-0000-0000-000000000001', 'الوحدة الأولى · القراءة والنصوص الأدبية (الصف التاسع)', 'دراسة نصوص أدبية مختارة من الأدب الفلسطيني والتراثي، تعزيز مهارات الفهم والاستيعاب، وتذوق الجماليات اللغوية.', 5, '4 ساعات', '#a85d3d', 'book-open', 1, TRUE),
('00000000-0000-0000-0000-000000000002', 'الوحدة الثانية · قواعد اللغة والنحو (الصف التاسع)', 'شرح شامل ومفصل لبنية الجملة الاسمية، النواسخ الفعلية والحرفية، المشتقات وإعمالها مع نماذج إعرابية نموذجية.', 5, '5 ساعات', '#2f7772', 'sparkles', 2, TRUE),
('00000000-0000-0000-0000-000000000003', 'الوحدة الثالثة · البلاغة والعروض والإملاء (الصف التاسع)', 'أسرار الفصاحة والبلاغة: التشبيه وأركانه، الاستعارة، وقواعد الإملاء المعتمدة في الهمزات وعلامات الترقيم.', 4, '3.5 ساعات', '#8a508f', 'pen-line', 3, TRUE),
('00000000-0000-0000-0000-000000000004', 'الوحدة الرابعة · روائع الأدب والشعر العربي (الصف العاشر)', 'دراسة معلقة زهير بن أبي سلمى، شعر المقاومة الفلسطيني، وتحليل نصوص من الأدب الحديث والمعاصر.', 5, '4.5 ساعات', '#c49b3b', 'library', 4, TRUE),
('00000000-0000-0000-0000-000000000005', 'الوحدة الخامسة · الصرف والنحو المتقدم (الصف العاشر)', 'الميزان الصرفي، مصادر الأفعال الثلاثية وغير الثلاثية، أحكام التمييز والحال، والممنوع من الصرف وعلله.', 4, '4 ساعات', '#3f51b5', 'target', 5, TRUE),
('00000000-0000-0000-0000-000000000006', 'الوحدة السادسة · علوم القرآن الكريم وأحكام التلاوة', 'منهج تلاوة القرآن الكريم: أحكام النون الساكنة والتنوين، الميم الساكنة، المدود، وتدبر سورة الحجرات.', 5, '4 ساعات', '#2e7d32', 'award', 6, TRUE)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    lessons_count = EXCLUDED.lessons_count,
    duration = EXCLUDED.duration,
    color = EXCLUDED.color,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- 3. إدراج الدروس التعليمية (Lessons)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published)
VALUES
('01000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'الدرس الأول: سورة الحجرات - بلاغة المعنى وأدب التخاطب', 'تفسير وتحليل الآيات الكريمة، واستخراج القيم الأخلاقية والأساليب البلاغية واللغوية.', 1, '{"introduction":"تعد سورة الحجرات دستور الأخلاق والآداب الاجتماعية في الإسلام، وقد سميت بسورة الأخلاق لما احتوته من توجيهات سامية.","mainText":"قال تعالى: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا إِن جَاءَكُمْ فَاسِقٌ بِنَبَإٍ فَتَبَيَّنُوا أَن تُصِيبُوا قَوْمًا بِجَهَالَةٍ فَتُصْبِحُوا عَلَىٰ مَا فَعَلْتُمْ نَادِمِينَ﴾.","vocabulary":[{"word":"نبإ","meaning":"الخبر الهام ذو الشأن الكبير"},{"word":"فتبيّنوا","meaning":"تثبّتوا وتحروا الحقيقة قبل إصدار الحكم"},{"word":"بجهالة","meaning":"عن غير علم بحقيقة الأمر"}],"grammarRule":"أسلوب النداء: (يا أيها الذين آمنوا) نداء يفيد التنبيه والتشريف، وجواب النداء جملة الشرط (إن جاءكم...).","summary":"وجوب التثبت من الأخبار ونبذ الشائعات لصيانة المجتمع ووحدته.","practiceQuestions":[{"q":"ما دلالة تصدير الآية بالنداء (يا أيها الذين آمنوا)؟","a":"لتنبيه المؤمنين وتشريفهم واستنهاض هممهم لامتثال الأمر الإلهي."},{"q":"ما الأثر المترتب على عدم التثبت من الأخبار؟","a":"إصابة الأبرياء بضرر والندم بعد فوات الأوان."}]}'::jsonb, TRUE),
('01000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'الدرس الثاني: قصيدة موطني للشاعر إبراهيم طوقان', 'دراسة الأبيات، الفكرة الرئيسة، العاطفة الوطنية، والصور الجمالية في النشيد الخالد.', 2, '{"introduction":"قصيدة وطنية صاغها شاعر فلسطين إبراهيم طوقان عام 1934، لتعبر عن كبرياء الشعب العربي وتطلعه للحرية والاستقلال.","mainText":"مَوْطِنِي مَوْطِنِي / الجَلالُ وَالجَمالُ وَالسَّناءُ وَالبَهاءُ فِي رُباكْ / وَالحَياةُ وَالنَّجاةُ وَالهَناءُ وَالرَّجاءُ فِي هَواكْ / هَلْ أَراكْ سالِماً مُنَعَّماً وَغانِماً مُكَرَّماً؟","vocabulary":[{"word":"السناء","meaning":"الرفعة والعلو والضياء الساطع"},{"word":"الربا","meaning":"جمع ربوة، وهي الأرض المرتفعة"},{"word":"هواك","meaning":"نسيمك وحبك المقيم في الفؤاد"}],"grammarRule":"الجناس والسجع الموسيقي: الجمع بين (الجلال والجمال، السناء والبهاء) يعطي إيقاعاً موسيقياً عذباً يفيض بالعاطفة.","summary":"عشق الوطن والاستعداد للتضحية من أجل رفعته وكرامته واستقلاله.","practiceQuestions":[{"q":"ما الغرض البلاغي من الاستفهام في قوله (هل أراك)؟","a":"التمني والرجاء الصادق لرفعة الوطن وحريته."}]}'::jsonb, TRUE),
('01000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'الدرس الثالث: من مآثر العرب والشهامة في التراث', 'قراءة نقدية لقصص الكرم والمروءة وإغاثة الملهوف في الأدب العربي القديم.', 3, '{"introduction":"عرف العرب منذ الجاهلية بمكارم الأخلاق، كالوفاء بالعهد، ونجدة الملهوف، وإكرام الضيف، وهي ركائز رسخها الإسلام وهذبها.","mainText":"كان حاتم الطائي إذا اشتد البرد وقل الطعام، أمر غلامه بإيقاد النار في المرتفعات ليسترشد بها السارون وعابرو السبيل.","vocabulary":[{"word":"المآثر","meaning":"المكارم والخصال الحميدة المتوارثة"},{"word":"السارون","meaning":"المسافرون ليلاً"}],"grammarRule":"أفعال الشرط والاستجابة في السرد النثري: توظيف كان وأخواتها في بناء الحكاية ونقل المعاني.","summary":"الكرم والمروءة ليسا مجرد بذل للمال بل هما شرف وخلق إنساني رفيع.","practiceQuestions":[{"q":"ما الهدف من إيقاد النار في رؤوس الجبال؟","a":"ليهتدي بها السائرون في ظلمات الليل ويجدوا طعاماً ومأوى."}]}'::jsonb, TRUE),
('01000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'الدرس الرابع: القدس في عيون الأدباء والشعراء', 'تحليل النصوص الأدبية التي جسدت مكانة بيت المقدس وقدسيتها في الوجدان الإنساني.', 4, '{"introduction":"تحتل القدس زهرة المدائن مكانة فريدة في الأدب الفلسطيني والعالمي، بوصفها رمزاً للصمود والتاريخ والمقدسات.","mainText":"يا قدس يا مدينة الصلاة، عيوننا إليك ترحل كل يوم، تدور في أروقة المعابد، تعانق الكنائس القديمة، وتمسح الحزن عن المساجد.","vocabulary":[{"word":"الأروقة","meaning":"الممرات والساحات المحيطة بالمعالم"},{"word":"الوجدان","meaning":"الإحساس الباطني والمشاعر العميقة"}],"grammarRule":"التشخيص والاستعارة: إسناد الحزن إلى المساجد ومسحه كأنه إنسان حزين يعاني الألم.","summary":"القدس ليست حجارة وأسواراً، بل هي هوية وروح وقضية حية في كل بيت.","practiceQuestions":[{"q":"وضح الصورة الفنية في عبارة (تمسح الحزن عن المساجد)؟","a":"شبه المساجد بإنسان حزين، وشبه التضامن بمسح الدموع في استعارة مكنية مؤثرة."}]}'::jsonb, TRUE),
('01000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'الدرس الخامس: أساليب التعبير وفن المقال الأدبي', 'خطوات كتابة المقال الأدبي والفكري الناجح: المقدمة، العرض، الخاتمة، وتوظيف الشواهد.', 5, '{"introduction":"المقال الأدبي هو قالب نثري يعبر فيه الكاتب عن فكرة أو تجربة ذاتية بأسلوب مشرق يجمع بين الإقناع العقلي والإمتاع الفني.","mainText":"عناصر المقال: 1. العنوان الجذاب، 2. المقدمة الممهدة، 3. العرض المترابط، 4. الخاتمة الملخصة المركزة.","vocabulary":[{"word":"الشواهد","meaning":"الأدلة من القرآن والحديث والشعر"},{"word":"المسبوك","meaning":"الكلام المتقن الصياغة المحكم الربط"}],"grammarRule":"أدوات الربط اللغوي: (فضلاً عن، بناءً عليه، علاوة على ذلك، في حين أن) لتماسك النص.","summary":"إتقان الكتابة التعبيرية يبدأ من تنظيم الفكر وسلامة القواعد وقوة المفردة.","practiceQuestions":[{"q":"ما هي شروط الخاتمة الناجحة في المقال الأدبي؟","a":"أن تكون موجزة وتلخص الفكرة الرئيسة وتترك أثراً عميقاً في نفس القارئ."}]}'::jsonb, TRUE),
('02000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'الدرس الأول: المبتدأ والخبر وصور مجيئهما', 'تعريف المبتدأ والخبر، تطابقهما في الإفراد والتثنية والتذكير، وصور الخبر (مفرد، جملة، شبه جملة).', 1, '{"introduction":"الجملة الاسمية هي التي تبدأ باسم، وتتكون من ركنين أساسيين هما المبتدأ والخبر، وحكمهما الرفع دائماً.","mainText":"1. العلمُ نورٌ (الخبر مفرد) / 2. المعلمُ يشرحُ الدرسَ (الخبر جملة فعلية) / 3. الطالبُ أدبُه رفيعٌ (الخبر جملة اسمية) / 4. النظافةُ من الإيمانِ (الخبر شبه جملة جار ومجرور).","vocabulary":[{"word":"المسند والمسند إليه","meaning":"المبتدأ هو المسند إليه والخبر هو المسند الذي يتم به المعنى"}],"grammarRule":"علامات الرفع: الضمة للمفرد وجمع التكسير وجمع المؤنث السالم، الألف للمثنى، والواو لجمع المذكر السالم والأسماء الخمسة.","summary":"الخبر هو الجزء المتمم للفائدة مع المبتدأ، وبدونه لا تكتمل الجملة المفيدة.","practiceQuestions":[{"q":"عين المبتدأ ونوع الخبر في: (فلسطينُ في قلوبنا)؟","a":"المبتدأ: فلسطينُ، الخبر: (في قلوبنا) شبه جملة جار ومجرور."}]}'::jsonb, TRUE),
('02000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'الدرس الثاني: كان وأخواتها (الأفعال الناسخة)', 'عمل كان وأخواتها، معانيها، وتصريفها، وأثرها الإعرابي على المبتدأ والخبر.', 2, '{"introduction":"كان وأخواتها أفعال ناسخة ناقصة تدخل على الجملة الاسمية، فترفع المبتدأ ويسمى اسمها، وتنصب الخبر ويسمى خبرها.","mainText":"أخوات كان: (كان، أصبح، أضحى، أمسى، بات، ظل، صار، ليس، ما زال، ما برح، ما فتئ، ما انفك، ما دام). مثال: كان الجوُّ ماطراً.","vocabulary":[{"word":"ناسخة","meaning":"تغير حكم الخبر من الرفع إلى النصب"},{"word":"ناقصة","meaning":"لا تكتفي بمرفوعها بل تحتاج إلى خبر يتمم معناها"}],"grammarRule":"إعراب: كان: فعل ماضٍ ناقص مبني على الفتح. الجوُّ: اسم كان مرفوع بالضمة. ماطراً: خبر كان منصوب بالفتحة.","summary":"الأفعال الناسخة تفيد توقيت اتصاف المبتدأ بالخبر في أزمنة مختلفة مع تغيير الحالة الإعرابية.","practiceQuestions":[{"q":"أدخل (صار) على جملة (الماءُ ثلجٌ) وغير ما يلزم؟","a":"صارَ الماءُ ثلجاً."}]}'::jsonb, TRUE),
('02000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'الدرس الثالث: إن وأخواتها (الحروف الناسخة)', 'عمل إن وأخواتها ومعانيها ودخولها على الجملة الاسمية مع دراسة كافّة الكافة.', 3, '{"introduction":"إن وأخواتها حروف ناسخة تدخل على المبتدأ والخبر، فتنصب المبتدأ ويسمى اسمها، وترفع الخبر ويسمى خبرها.","mainText":"الحروف الناسخة: (إنّ وأنّ للتوكيد، كأنّ للتشبيه، لكنّ للاستدراك، ليتَ للتمني، لعلّ للترجي). مثال: إنّ الحقَّ منتصرٌ.","vocabulary":[{"word":"الاستدراك","meaning":"رفع ما يتوهم ثبوته أو نفيه من الكلام السابق"},{"word":"التمني","meaning":"طلب الشيء المستحيل أو ما فيه عسر شديد"}],"grammarRule":"إذا اتصلت (ما) الكافة بـ (إن وأخواتها) بطل عملها ما عدا (ليت)، مثل: ﴿إِنَّمَا الْمُؤْمِنُونَ إِخْوَةٌ﴾.","summary":"الحروف الناسخة تؤكد المعنى وتغير الموقع الإعرابي للاسم مع إبقاء الخبر مرفوعاً.","practiceQuestions":[{"q":"أعرب: (لعلَّ الفرجَ قريبٌ)؟","a":"لعلّ: حرف ترجٍّ ونصب، الفرجَ: اسم لعل منصوب بالفتحة، قريبٌ: خبر لعل مرفوع بالضمة."}]}'::jsonb, TRUE),
('02000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'الدرس الرابع: اسم الفاعل وصياغته وإعماله', 'صياغة اسم الفاعل من الفعل الثلاثي على وزن (فاعل) ومن غير الثلاثي بميم مضمومة وكسر ما قبل الآخر.', 4, '{"introduction":"اسم الفاعل اسم مشتق من الفعل المبني للمعلوم للدلالة على من قام بالفعل أو اتصف به.","mainText":"1. من الثلاثي: كتب -> كاتب، قال -> قائل، سعى -> ساعٍ. 2. من غير الثلاثي: أكرم -> يُكرِم -> مُكرِم، استخرج -> مُستخرِج.","vocabulary":[{"word":"المشتق","meaning":"الاسم المأخوذ من غيره وله دلالة وصفية"}],"grammarRule":"يعمل اسم الفاعل عمل فعله إذا كان محلى بأل دون شروط، أو إذا نُوّن واعتمد على نفي أو استفهام أو نداء أو مبتدأ.","summary":"اسم الفاعل يحافظ على معنى الحدث وصاحبه وله دور فعال في فصاحة التعبير.","practiceQuestions":[{"q":"صغ اسم الفاعل من الأفعال: (صام، انطلق، تعلّم)؟","a":"صائم، مُنطلِق، مُتعلِّم."}]}'::jsonb, TRUE),
('02000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'الدرس الخامس: اسم المفعول وصيغ المبالغة', 'أوزان صيغ المبالغة الخمسة القياسية (فعّال، مِفعال، فَعول، فَعيل، فَعِل) وصياغة اسم المفعول.', 5, '{"introduction":"صيغ المبالغة تدل على الكثرة والشدة في إحداث الفعل، واسم المفعول يدل على من وقع عليه الفعل.","mainText":"أوزان صيغ المبالغة: (غفّار، مِقدام، صَبور، سَميع، حَذِر). اسم المفعول: من الثلاثي (مفهوم)، من غير الثلاثي (مُحترَم).","vocabulary":[{"word":"المبالغة","meaning":"الزيادة والتأكيد على تكرار الحدث ورسوخه"}],"grammarRule":"اسم المفعول يشتق من الفعل المبني للمجهول، ويرفع بعده نائب فاعل، مثل: (الدرسُ مفهومٌ شرحُه).","summary":"المشتقات تثري اللغة وتمنح المتكلم دقة متناهية في التعبير والوصف.","practiceQuestions":[{"q":"ما صيغة المبالغة من (رحم) و(صدق)؟","a":"رحيم (أو رحوم)، وصَدوق (أو صِدّيق)."}]}'::jsonb, TRUE),
('03000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'الدرس الأول: التشبيه وأركانه الأربعة', 'المشبه، المشبه به، أداة التشبيه، ووجه الشبه، والتمييز بين التشبيه التام والمجمل والمؤكد والبليغ.', 1, '{"introduction":"التشبيه هو عقد مماثلة بين شيئين اشتركا في صفة أو أكثر بأداة ملفوظة أو ملحوظة.","mainText":"أركان التشبيه: 1. المشبه (الجندي)، 2. المشبه به (الأسد)، 3. أداة التشبيه (الكاف / كأن)، 4. وجه الشبه (الشجاعة). التشبيه البليغ: ما حذفت منه الأداة ووجه الشبه مثل: (العلمُ نورٌ).","vocabulary":[{"word":"وجه الشبه","meaning":"الصفة المشتركة وتكون في المشبه به أقوى وأظهر"}],"grammarRule":"سر جمال التشبيه: التوضيح، التشخيص (جعل المعنوي شخصاً)، أو التجسيم (جعل المعنوي جسماً ملموساً).","summary":"التشبيه هو ركيزة البيان العربي لنقل المعاني المجردة إلى صور حسية تنبض بالحياة.","practiceQuestions":[{"q":"حدد أركان التشبيه في: (الأمُ كالمدرسةِ في التربيةِ)؟","a":"المشبه: الأم، الأداة: الكاف، المشبه به: المدرسة، وجه الشبه: التربية."}]}'::jsonb, TRUE),
('03000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'الدرس الثاني: الاستعارة المكنية والاستعارة التصريحية', 'الاستعارة تشبيه بليغ حذف أحد طرفيه: المكنية (حذف المشبه به) والتصريحية (صرح بالمشبه به).', 2, '{"introduction":"تعد الاستعارة من أبلغ فنون البيان، لأنها تقوم على ادعاء أن المشبه هو عين المشبه به.","mainText":"1. الاستعارة المكنية: (ابتسم الأمل في وجوه الصابرين) شبه الأمل بإنسان يبتسم وحذف المشبه به ورمز له بشيء من لوازمه (الابتسام). 2. التصريحية: ﴿كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ لِتُخْرِجَ النَّاسَ مِنَ الظُّلُمَاتِ إِلَى النُّورِ﴾ شبه الكفر بالظلمات والإيمان بالنور وصرح بالمشبه به.","vocabulary":[{"word":"قرينة الاستعارة","meaning":"اللفظ الذي يمنع من إرادة المعنى الحقيقي للجملة"}],"grammarRule":"الفرق الجوهري: إذا ذُكر المشبه به فالاستعارة تصريحية، وإذا حُذف وبقيت لوازمه فالاستعارة مكنية.","summary":"الاستعارة تمنح الكلام بعداً خيالياً ممتعاً وتكشف عن مهارة الأديب البلاغية.","practiceQuestions":[{"q":"بين نوع الاستعارة في: (طار الخبرُ في المدينةِ)؟","a":"استعارة مكنية؛ شبه الخبر بطائر يطير، وحذف المشبه به ورمز إليه بشيء من لوازمه وهو (الطيران)."}]}'::jsonb, TRUE),
('03000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'الدرس الثالث: همزتا الوصل والقطع ومواضعهما', 'قواعد رسم همزة الوصل وهمزة القطع في الأسماء والأفعال والحروف مع التطبيقات الإملائية.', 3, '{"introduction":"همزة الوصل تنطق في ابتداء الكلام وتسقط عند وصله وتكتب (ا)، بينما همزة القطع تنطق في كل الأحوال وتكتب (أ / إ).","mainText":"مواضع همزة الوصل: ال التعريف، الأسماء العشرة (ابن، ابنة، اسم...)، أمر الفعل الثلاثي (اكتب)، ماضي وأمر ومصدر الخماسي والسداسي (انطلق، استخرج). مواضع القطع: ماضي الثلاثي المهموز (أكل)، ماضي الرباعي ومصدره (أكرم، إكرام)، وكل الحروف (إلى، أن، إن) ما عدا ال.","vocabulary":[{"word":"سبر الهمزة","meaning":"وضع حرف الواو أو الفاء قبل الكلمة لاختبار ثبوت الهمزة من عدمه"}],"grammarRule":"قاعدة فحص الهمزة: ضع قبل الكلمة واواً، فإذا نطقت الهمزة فهي قطع (وأقبل)، وإذا سقطت فهي وصل (واستغفر).","summary":"ضبط رسم الهمزات يحمي النص من اللحن والخطأ الإملائي الشائع.","practiceQuestions":[{"q":"علل كتابة الهمزة وصلاً في كلمة (اجتهاد) وقطعاً في (إحسان)؟","a":"(اجتهاد) مصدر لفعل خماسي (اجتهد)، و(إحسان) مصدر لفعل رباعي (أحسن)."}]}'::jsonb, TRUE),
('03000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'الدرس الرابع: الهمزة المتوسطة والمتطرفة وقواعد رسمها', 'ميزان قوة الحركات (الكسرة فالضمة فالفتحة فالسكون) وكتابة الهمزة على نبرة أو واو أو ألف أو على السطر.', 4, '{"introduction":"تخضع الهمزة المتوسطة لقانون القوة النسبية بين حركتها وحركة الحرف الذي يسبقها.","mainText":"ترتيب القوة: 1. الكسرة (يناسبها الياء/النبرة: فِئَة، سُئِل)، 2. الضمة (يناسبها الواو: مُؤْمِن، رَؤُوف)، 3. الفتحة (يناسبها الألف: سَأَل، مَأْوَى)، 4. السكون (وهو انعدام الحركة). الهمزة المتطرفة تكتب بحسب حركة الحرف الذي قبلها فقط (قارِئ، لُؤْلُؤ، بَدَأ، سَمَاء).","vocabulary":[{"word":"النبرة","meaning":"كرسي الياء غير المنقوطة (ئ)"}],"grammarRule":"إذا سبقت الهمزة المتطرفة بساكن أو حرف مد كتبت على السطر: (شيء، عبء، ماء، هدوء).","summary":"معرفة ترتيب قوة الحركات يضمن إتقان كتابة أي همزة دون تردد.","practiceQuestions":[{"q":"علل كتابة الهمزة على واو في كلمة (يَؤُمُّ)؟","a":"لأنها مضمومة وما قبلها مفتوح، والضمة أقوى من الفتحة ويناسبها الواو."}]}'::jsonb, TRUE),
('04000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'الدرس الأول: معلقة زهير بن أبي سلمى - حكمة الجاهلية', 'قراءة نقدية لأبيات المعلقة الخالدة، واستخلاص قيم السلام والصلح وحكمة الشاعر الشيخ.', 1, '{"introduction":"زهير بن أبي سلمى حكيم شعراء الجاهلية وصاحب الحوليات، مدح في معلقته هرم بن سنان والحارث بن عوف لحقنهما دماء حرب داحس والغبراء.","mainText":"سَئِمتُ تَكاليفَ الحَياةِ وَمَن يَعِش / ثَمانينَ حَولاً لا أَبا لَكَ يَسأَمِ / وَأَعلَمُ ما في اليَومِ وَالأَمسِ قَبلَهُ / وَلَكِنَّني عَن عِلمِ ما في غَدٍ عَمِ / وَمَن يَجعَلِ المَعروفَ مِن دونِ عِرضِهِ / يَفِرهُ وَمَن لا يَتَّقِ الشَتمَ يُشتَمِ.","vocabulary":[{"word":"تكاليف الحياة","meaning":"مشاقها ومتاعبها"},{"word":"حَوْلاً","meaning":"عاماً وسنة كاملة"},{"word":"عِرضه","meaning":"شرفه ومكانته وكرامته"}],"grammarRule":"أسلوب الشرط الجازم: (مَن يجعلْ... يفرْهُ)، (مَن لا يتقِ... يُشتَمْ) أدوات شرط تجزم فعلين مضارعين.","summary":"الحكمة الأخلاقية وحماية العِرض وبذل المعروف فوق كل غنيمة.","practiceQuestions":[{"q":"ما الموقف الإنساني الذي دعا إليه زهير في معلقته؟","a":"الدعوة للصلح والسلام ونبذ ويلات الحروب وإعلاء فضيلة الحكمة."}]}'::jsonb, TRUE),
('04000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'الدرس الثاني: شعر الفتوحات والمدائح النبوية في العصر الإسلامي', 'تطور الأغراض الشعرية مع بزوغ الإسلام، والشاعر حسان بن ثابت شاعر الرسول صلى الله عليه وسلم.', 2, '{"introduction":"جاء الإسلام فهذب الشعر ووجهه نحو نصرة الحق وإشاعة مكارم الأخلاق والدفاع عن الرسالة الخالدة.","mainText":"قال حسان بن ثابت رضي الله عنه: / وَأَحسَنُ مِنكَ لَم تَرَ قَطُّ عَيني / وَأَجمَلُ مِنكَ لَم تَلِدِ النِساءُ / خُلِقتَ مُبَرَّءاً مِن كُلِّ عَيبٍ / كَأَنَّكَ قَد خُلِقتَ كَما تَشاءُ.","vocabulary":[{"word":"مبرأً","meaning":"خالياً ومنزهاً وطاهراً"},{"word":"قطُّ","meaning":"ظرف لاستغراق ما مضى من الزمان"}],"grammarRule":"أفعل التفضيل: (أحسن، أجمل) للدلالة على علو المنزلة والكمال الخَلقي والخُلقي.","summary":"توظيف الشعر في خدمة الرسالة السامية ونشر النور والفضائل.","practiceQuestions":[{"q":"ما العاطفة المسيطرة على الشاعر حسان بن ثابت في أبياته؟","a":"عاطفة الحب الصادق والإجلال والتعظيم لشخص النبي صلى الله عليه وسلم."}]}'::jsonb, TRUE),
('04000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'الدرس الثالث: أدب المقاومة الفلسطيني والتمسك بالأرض', 'نماذج شعرية ونثرية لأعلام الأدب الفلسطيني (محمود درويش، سميح القاسم، فدوى طوقان).', 3, '{"introduction":"شكل الأدب الفلسطيني رافعة وطنية هامة عكست تجذر الإنسان بأرضه ورفضه للاقتلاع وتطلعه للحرية والعدالة.","mainText":"على هذه الأرض ما يستحق الحياة: / على هذه الأرض سيدةُ الأرض، / أمُّ البدايات أمُّ النهايات. / كانت تسمى فلسطين. / صارت تسمى فلسطين. / سيدتي: أستحق، لأنك سيدتي، / أستحق الحياة.","vocabulary":[{"word":"سيدة الأرض","meaning":"فلسطين بقدسيتها وعراقة تاريخها"},{"word":"أم البدايات","meaning":"مهد الحضارات والرسالات السماوية"}],"grammarRule":"التكرار الدلالي: تكرار (فلسطين، أستحق الحياة) لتوكيد الثبات وترسيخ الهوية.","summary":"الأرض رمز الوجود، والكلمة رصاصة في مواجهة محاولات الطمس والنسيان.","practiceQuestions":[{"q":"ما دلالة قول الشاعر (كانت تسمى فلسطين، صارت تسمى فلسطين)؟","a":"التأكيد على أزلية الهوية الفلسطينية واستمراريتها عبر الماضي والحاضر والمستقبل."}]}'::jsonb, TRUE),
('04000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'الدرس الرابع: المحسنات البديعية - الطباق والمقابلة والجناس', 'علم البديع: المحسنات المعنوية (الطباق والمقابلة) والمحسنات اللفظية (الجناس والسجع) وأثرها الفني.', 4, '{"introduction":"علم البديع هو العلم الذي يُعرف به وجوه تحسين الكلام بعد رعاية مطابقته لمقتضى الحال ووضوح الدلالة.","mainText":"1. الطباق: الجمع بين الكلمة وضدها (طباق إيجاب: يعلمون ولا يعلمون، طباق سلب: قل هل يستوي الأعمى والبصير). 2. المقابلة: الإتيان بمعنيين أو أكثر ثم يؤتى بما يقابل ذلك على الترتيب (يحل لهم الطيبات ويحرم عليهم الخبائث). 3. الجناس: تشابه كلمتين في اللفظ مع اختلاف المعنى (صليت المغرب في المغرب).","vocabulary":[{"word":"المحسنات المعنوية","meaning":"التي ترجع إلى تحسين المعنى أولاً"},{"word":"المحسنات اللفظية","meaning":"التي ترجع إلى إكساب اللفظ رونقاً وإيقاعاً صوتياً"}],"grammarRule":"أثر الطباق والمقابلة: إبراز المعنى وتوضيحه؛ لأن الضد يظهر حسنه الضد.","summary":"المحسنات البديعية وسيلة لإثراء المعنى إذا جاءت عفو الخاطر دون تكلف.","practiceQuestions":[{"q":"استخرج المحسن البديعي من: ﴿فَلْيَضْحَكُوا قَلِيلًا وَلْيَبْكُوا كَثِيرًا﴾؟","a":"مقابلة بين (يضحكوا قليلاً) و(يبكوا كثيراً) توضح التباين في المشهد."}]}'::jsonb, TRUE),
('04000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'الدرس الخامس: النقد الأدبي وقراءة النص الموازي', 'أدوات الناقد في قراءة العنوان، الإهداء، الهوامش، وبنية العمل الإبداعي.', 5, '{"introduction":"النقد الأدبي هو دراسة الأعمال الأدبية وتفسيرها وتقويمها لبيان مواطن الجمال والجودة وأوجه النقص.","mainText":"النص الموازي (العتبات النصية): يشمل العنوان، الغلاف، الإهداء، والمقدمة، وهي مفاتيح قرائية تعين على ولوج عالم النص والتقاط رسائله العميقة.","vocabulary":[{"word":"العتبات النصية","meaning":"كل ما يحيط بالنص الرئيس ويهيئ القارئ للدخول إليه"}],"grammarRule":"البناء السردي: التحليل من العام إلى الخاص، وتفكيك الرموز والدلالات الإيحائية.","summary":"القراءة الواعية تتجاوز المعنى الظاهر إلى تفكيك طبقات النص وأبعاده الفنية.","practiceQuestions":[{"q":"ما أهمية دراسة العنوان في العمل الأدبي؟","a":"العنوان هو الثريا الدالة وبؤرة النص المكثفة التي تلخص رؤية الكاتب."}]}'::jsonb, TRUE),
('05000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'الدرس الأول: الميزان الصرفي وأصول الكلمات', 'وزن الكلمات الثلاثية والرباعية ومراعاة حروف الزيادة والحذف والإعلال.', 1, '{"introduction":"الميزان الصرفي مقياس وضعه علماء النحو لمعرفة بنية الكلمة وأحوال حروفها، وجعلوا أصله مادة (ف - ع - ل).","mainText":"الثلاثي المجرد: كَتَبَ على وزن فَعَلَ. مع الزيادة: كَاتَبَ (فَاعَلَ)، اسْتَكْتَبَ (اسْتَفْعَلَ). مع الحذف: قُلْ (فُلْ)، قِ (عِ). الرباعي: دَحْرَجَ (فَعْلَلَ).","vocabulary":[{"word":"فاء الكلمة وعينها ولامها","meaning":"الحروف الأصلية الثلاثة المقابلة للميزان"}],"grammarRule":"تجمع حروف الزيادة في كلمة (سألتمونيها) أو (هناء وتسليم).","summary":"الميزان الصرفي يضبط نطق الكلمات ويوضح أصالتها وتفرع معانيها.","practiceQuestions":[{"q":"زن الكلمات التالية: (انتصر، قاضٍ، زلزل)؟","a":"انتصر: افتعل، قاضٍ: فاعٍ، زلزل: فعلل."}]}'::jsonb, TRUE),
('05000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'الدرس الثاني: مصادر الأفعال الثلاثية وغير الثلاثية', 'مصادر الأفعال القياسية والسماعية، وصياغة المصدر الصريح ومصدر المرة والهيئة والميمي.', 2, '{"introduction":"المصدر هو اسم يدل على حدث مجرد من الزمان، وهو أصل المشتقات في اللغة العربية.","mainText":"مصادر الثلاثي سماعية غالباً ولها ضوابط دلالية: صياغة تدل على حرفة (زراعة، تجارة: فِعَالة)، حركة واضطراب (غليان، فيضان: فَعَلان). مصادر غير الثلاثي قياسية: أَكْرَمَ إِكْرَاماً (إِفْعَالاً)، قَدَّمَ تَقْدِيماً (تَفْعِيلاً)، جَادَلَ جِدَالاً ومُجَادَلَةً.","vocabulary":[{"word":"سماعي","meaning":"ما نُقل عن العرب بالسماع ولا يقاس عليه باطراد"},{"word":"قياسي","meaning":"ما له قاعدة عامة منتظمة يقاس عليها"}],"grammarRule":"المصدر يعمل عمل فعله إذا كان مضافاً أو منوناً، فيرفع فاعلاً وينصب مفعولاً به.","summary":"إتقان المصادر يمنح المتحدث قدرة على الإيجاز والبيان الصائب.","practiceQuestions":[{"q":"هات مصدر كل من: (استغفر، أجاد، ناضل)؟","a":"استغفار، إجادة، نضال (أو مناضلة)."}]}'::jsonb, TRUE),
('05000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 'الدرس الثالث: أحكام التمييز والحال والفرق بينهما', 'التمييز الملفوظ والملحوظ، إعراب الحال المفردة والجملة، وضوابط التمييز بينهما.', 3, '{"introduction":"كلا المنصوبين (الحال والتمييز) يزيل إبهاماً، فالحال تبين هيئة صاحبها عند وقوع الفعل، والتمييز يفسر اسماً مبهماً أو نسبة غامضة.","mainText":"الحال: (جاء الطالبُ مسروراً) مسروراً حال مشتقة تبين هيئة الفاعل. التمييز الملفوظ: (اشتريتُ رطلاً عسلاً). التمييز الملحوظ: ﴿وَاشْتَعَلَ الرَّأْسُ شَيْبًا﴾ شيباً تمييز محول عن فاعل.","vocabulary":[{"word":"صاحب الحال","meaning":"الاسم المعرفة الذي تبين الحال هيئته"},{"word":"المميز","meaning":"الاسم أو التركيب المبهم المراد توضيحه"}],"grammarRule":"الأصل في الحال أن تكون نكرة مشتقة وصاحبها معرفة، والأصل في التمييز أن يكون اسماً جامداً مفسراً لما قبله.","summary":"المنصوبات من متممات الجملة التي تضفي دقة وتفصيلاً على الحدث وهيئته.","practiceQuestions":[{"q":"ميز بين نوع المنصوب في: (فاض القلبُ فرحاً) و(أقبل المعلمُ باسماً)؟","a":"(فرحاً): تمييز ملحوظ منصوب، (باسماً): حال منصوبة تبين هيئة الفاعل."}]}'::jsonb, TRUE),
('05000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 'الدرس الرابع: الممنوع من الصرف وعلل منعه', 'الممنوع من الصرف لعلة واحدة ولعلتين، وإعرابه بالفتحة عوضاً عن الكسرة وشروط جره بالكسرة.', 4, '{"introduction":"الممنوع من الصرف هو الاسم الذي لا يلحقه التنوين، ويجر بالفتحة نيابة عن الكسرة ما لم يعرف بأل أو يضاف.","mainText":"الممنوع لعلة واحدة: صيغة منتهى الجموع (مساجد، مصابيح)، الاسم المنتهي بألف التأنيث المقصورة أو الممدودة (صحراء، ذكرى). الممنوع لعلتين: العَلمية مع (التأنيث: فاطمة، العجمة: إبراهيم، زيادة الألف والنون: عثمان، وزن الفعل: أحمد، العدل: عُمَر). والصفة مع (وزن أفعل: أفضل، فعلان: غضبان).","vocabulary":[{"word":"الصرف","meaning":"التنوين، فالممنوع من الصرف هو الممنوع من التنوين"}],"grammarRule":"يجر الممنوع من الصرف بالكسرة في حالتين: 1. إذا اقترن بأل (في المساجدِ)، 2. إذا أضيف (في مساجدِ المدينةِ).","summary":"الممنوع من الصرف باب نحوي وصرفي دقيق يعكس رقة اللغة ونبذها للثقل الصوتي.","practiceQuestions":[{"q":"أعرب كلمة (مساجد) في: (صليتُ في مساجدَ أثريةٍ)؟","a":"اسم مجرور بفي وعلامة جره الفتحة نيابة عن الكسرة لأنه ممنوع من الصرف."}]}'::jsonb, TRUE),
('06000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'الدرس الأول: فضل تلاوة القرآن الكريم وآدابها', 'الأحاديث النبوية في فضل التلاوة، الطهارة، الاستعاذة والبسملة، والتدبر والخشوع.', 1, '{"introduction":"القرآن الكريم كلام الله المعجز المنزل على نبيه محمد صلى الله عليه وسلم، المتعبد بتلاوته المنقول بالتواتر.","mainText":"قال رسول الله صلى الله عليه وسلم: «خَيْرُكُمْ مَنْ تَعَلَّمَ القُرْآنَ وَعَلَّمَهُ». وقال أيضاً: «الْمَاهِرُ بِالْقُرْآنِ مَعَ السَّفَرَةِ الْكِرَامِ الْبَرَرَةِ».","vocabulary":[{"word":"السفرة الكرام البررة","meaning":"الملائكة المقربون الذين ينقلون وحي الله"},{"word":"التدبر","meaning":"التفكر في معاني الآيات ومقاصدها والعمل بما جاء فيها"}],"grammarRule":"أحكام الاستعاذة والبسملة: أربعة أوجه جائزة عند الابتداء بالتلاوة بين سورتين.","summary":"تلاوة القرآن تجارة رابحة مع الله ترتقي بصاحبها في أعلى درجات الجنة.","practiceQuestions":[{"q":"ما هي شروط التلاوة المقبولة المثمرة؟","a":"الإخلاص لله تعالى، الطهارة، التدبر بالقلب، وتحسين الصوت مع الالتزام بأحكام التجويد."}]}'::jsonb, TRUE),
('06000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'الدرس الثاني: أحكام النون الساكنة والتنوين (الإظهار والإدغام)', 'شرح حروف الإظهار الحلقي الستة (ء، هـ، ع، ح، غ، خ)، وحروف الإدغام (يرملون) بغنة وبغير غنة.', 2, '{"introduction":"للنون الساكنة والتنوين أربعة أحكام عند التقائها بحروف الهجاء، أولها الإظهار وثانيها الإدغام.","mainText":"1. الإظهار الحلقي: حروفه (أخي هاك علماً حازه غير خاسر). مثال: (مَنْ آمَنَ، يَنْأَوْنَ، رَسُولٌ أَمِينٌ). 2. الإدغام: حروفه مجموعة في (يَرْمَلُونَ). بغنة في (يَنْمُو): (مَن يَقُولُ، رَحِيمٌ وَدُودٌ)، وبغير غنة في (الراء واللام): (مِّن رَّبِّهِمْ، غَفُورٌ رَّحِيمٌ).","vocabulary":[{"word":"الغنة","meaning":"صوت رخيم يخرج من الخيشوم مقداره حركتان"},{"word":"الإدغام","meaning":"إدخال حرف ساكن بحرف متحرك بحيث يصيران حرفاً واحداً مشدداً"}],"grammarRule":"شرط الإدغام أن يكون في كلمتين، فإذا التقت النون بحرف الإدغام في كلمة واحدة وجب الإظهار المطلق (دُنْيَا، قِنْوَان، صِنْوَان، بُنْيَان).","summary":"الإتقان العملي لأحكام الإظهار والإدغام يصون اللسان عن الخطأ في كتاب الله.","practiceQuestions":[{"q":"ما حكم النون في (مِنْ حَكِيمٍ) و(مَن يَعْمَلْ)؟","a":"(مِنْ حَكِيمٍ): إظهار حلقي لوقوع حرف الحاء بعد النون الساكنة. (مَن يَعْمَلْ): إدغام بغنة لوقوع حرف الياء."}]}'::jsonb, TRUE),
('06000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'الدرس الثالث: أحكام النون الساكنة والتنوين (الإقلاب والإخفاء)', 'الإقلاب عند حرف الباء بقلب النون ميماً مخفاة، وحروف الإخفاء الحقيقي الخمسة عشر.', 3, '{"introduction":"الحكم الثالث للنون الساكنة هو الإقلاب، والرابع هو الإخفاء الحقيقي الذي يمثل النطق بالحرف بين الإظهار والإدغام.","mainText":"1. الإقلاب: حرفه الوحيد هو (الباء)، مثل: ﴿مِن بَعْدِ﴾ تقرأ ميماً مخفاة مع بقاء الغنة. 2. الإخفاء الحقيقي: حروفه في أوائل كلمات البيت: (صِفْ ذَا ثَنَا كَمْ جَادَ شَخْصٌ قَدْ سَمَا / دُمْ طَيِّباً زِدْ فِي تُقَىً ضَعْ ظَالِماً)، مثل: (مِن قَبْلُ، أَنفُسَكُمْ، كِتَابٌ كَرِيمٌ).","vocabulary":[{"word":"الإخفاء","meaning":"ستر الحرف والنطق به بصفة بين الإظهار والإدغام عارياً عن التشديد مع بقاء الغنة"}],"grammarRule":"تفخم غنة الإخفاء إذا جاء بعدها حرف استعلاء (ص، ض، ط، ظ، ق)، وترقق إذا جاء بعدها حرف استفال.","summary":"أحكام التجويد تعطي كل حرف حقه ومستحقه دون إفراط أو تفريط.","practiceQuestions":[{"q":"بين حكم التجويد في قوله تعالى: (أَنبِئْهُم) و(إِنسَان)؟","a":"(أنبئهم): إقلاب لوقوع الباء بعد النون. (إنسان): إخفاء حقيقي لوقوع حرف السين."}]}'::jsonb, TRUE),
('06000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006', 'الدرس الرابع: أحكام الميم الساكنة الثلاثة', 'الإخفاء الشفوي عند الباء، الإدغام الشفوي عند الميم، والإظهار الشفوي عند بقية الحروف وخاصة الواو والفاء.', 4, '{"introduction":"الميم الساكنة هي الميم الخالية من الحركة، ولها مع حروف الهجاء ثلاثة أحكام: الإخفاء والإدغام والإظهار، وتسمى أحكاماً شفوية لأن مخرج الميم من الشفتين.","mainText":"1. الإخفاء الشفوي: عند حرف الباء فقط، مثل: ﴿تَرْمِيهِم بِحِجَارَةٍ﴾. 2. إدغام المتماثلين (إدغام شفوي): عند الميم، مثل: ﴿لَهُم مَّا يَشَاءُونَ﴾. 3. الإظهار الشفوي: عند بقية الحروف الستة والعشرين، مثل: ﴿أَلَمْ تَرَ﴾، وتشتد العناية بإظهارها عند الواو والفاء لقرب المخرج.","vocabulary":[{"word":"الشفوية","meaning":"نسبة إلى مخرج الحرف من الشفتين"}],"grammarRule":"قال الجمزوري في تحفة الأطفال: (وَاحْذَرْ لَدَى وَاوٍ وَفَا أَنْ تَخْتَفِي / لِقُرْبِهَا وَلاِتِّحَادِ فَاعْرِفِ).","summary":"مراعاة أحكام الميم الساكنة يمنع اختلاط الأصوات ويبرز بهاء النطق القرآني.","practiceQuestions":[{"q":"لماذا يحذر القارئ من إخفاء الميم الساكنة عند الواو والفاء؟","a":"لاتحاد الميم مع الواو في المخرج (الشفتين)، ولقربها الشديد من مخرج الفاء."}]}'::jsonb, TRUE),
('06000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', 'الدرس الخامس: أحكام المدود وأنواعها ومقاديرها', 'المد الأصلي (الطبيعي) والمد الفرعي بسبب الهمز (المتصل، المنفصل، البدل) وبسبب السكون (العارض، اللازم).', 5, '{"introduction":"المد لغة هو الزيادة، واصطلاحاً هو إطالة الصوت بحرف من حروف المد الثلاثة (الألف الساكنة المفتوح ما قبلها، الواو الساكنة المضموم ما قبلها، الياء الساكنة المكسور ما قبلها).","mainText":"1. المد الطبيعي: مقداره حركتان (نُوحِيهَا). 2. المد الفرعي بسبب الهمز: - المتصل (واجب 4-5 حركات): جاء، السماء. - المنفصل (جائز 4-5 حركات أو قصر حركتان): يا أيها، بما أنزل. - البدل (حركتان): آمنوا، أوتوا. 3. بسبب السكون: - العارض للسكون (2، 4، 6 حركات): العالمين، نستعين. - المد اللازم (6 حركات لزوماً): الحاقة، الضالين.","vocabulary":[{"word":"حركة المد","meaning":"مقدار زمن قبض الإصبع أو بسطه بحالة وسطية"}],"grammarRule":"المد اللازم أقوى المدود وأطولها، ويليه المتصل، ثم العارض، ثم المنفصل، وأضعفها البدل.","summary":"إتقان مقادير المدود يضبط توازن التلاوة وترتيل القرآن ترتيلاً مباركاً.","practiceQuestions":[{"q":"ما نوع المد ومقداره في كلمتي: (السَّمَاءِ) و(الصَّاخَّةُ)؟","a":"(السَّمَاءِ): مد واجب متصل ومقداره 4 أو 5 حركات. (الصَّاخَّةُ): مد لازم كلمي مثقل ومقداره 6 حركات لزوماً."}]}'::jsonb, TRUE)
ON CONFLICT (id) DO UPDATE SET
    course_id = EXCLUDED.course_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    position = EXCLUDED.position,
    content = EXCLUDED.content;

-- 4. إدراج الواجبات والتكليفات (Assignments)
INSERT INTO public.assignments (id, course_id, title, description, unit, due_date, points, published)
VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'تحليل لغوي وبلاغي لأبيات من قصيدة موطني', 'استخرج من المقطع الأول لقصيدة موطني محسنين بديعيين، وصورة فنية مع شرحها، وأعرب الشطر: (الجلال والجمال في رباك).', 'الوحدة الأولى · القراءة والنصوص', '2026-09-22', 20, TRUE),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'تطبيق إعرابي على كان وأخواتها وإن وأخواتها', 'أعرب الجملتين إعراباً تاماً: 1. (كان جنودُ الوطنِ مرابطينَ على الحدودِ)، 2. (إنّ العلمَ والأخلاقَ سلاحُ الأمةِ).', 'الوحدة الثانية · قواعد اللغة والنحو', '2026-09-25', 25, TRUE),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'اشتقاق اسم الفاعل واسم المفعول وصيغ المبالغة', 'صغ اسم الفاعل واسم المفعول وصيغة مبالغة من الأفعال التالية: (نصر، صان، استخرج، علم)، مع وضع كل مشتق في جملة مفيدة.', 'الوحدة الثانية · قواعد اللغة والنحو', '2026-09-28', 20, TRUE),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'كتابة فقرة تعبيرية موظفاً التشبيه والاستعارة', 'اكتب فقرة من سبعة أسطر عن جمال مدينة القدس وأسوارها التاريخية، مستخدماً تشبيهاً بليغاً واستعارة مكنية مع ضبط الهمزات.', 'الوحدة الثالثة · البلاغة والعروض', '2026-10-02', 25, TRUE),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'دراسة نقدية في معلقة زهير بن أبي سلمى', 'لخص في عشرة أسطر أثر حكمة زهير بن أبي سلمى في المجتمع العربي، واستشهد بثلاثة أبيات مع بيان المعنى المقصود.', 'الوحدة الرابعة · روائع الأدب والشعر', '2026-10-05', 30, TRUE),
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005', 'جدول الممنوع من الصرف وتطبيقات الميزان الصرفي', 'استخرج الأسماء الممنوعة من الصرف من القطعة المرفقة واذكر علة منعها، ثم زن الكلمات المحددة مبيناً حروف الزيادة.', 'الوحدة الخامسة · الصرف والنحو المتقدم', '2026-10-09', 25, TRUE),
('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000006', 'استخراج أحكام النون والميم الساكنة من سورة الحجرات', 'اقرأ الآيات (1-6) من سورة الحجرات، واستخرج منها في جدول: ثلاثة مواضع للإظهار، موضعين للإدغام بغنة، موضعاً للإقلاب، وثلاثة للإخفاء.', 'الوحدة السادسة · علوم القرآن والتلاوة', '2026-10-12', 30, TRUE)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    unit = EXCLUDED.unit,
    due_date = EXCLUDED.due_date,
    points = EXCLUDED.points,
    updated_at = NOW();

-- 5. إدراج التقييمات والاختبارات (Assessments)
INSERT INTO public.assessments (id, course_id, title, questions_count, duration, available_date, published)
VALUES
('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'الاختبار النحوي الشامل: الجملة الاسمية والنواسخ', 5, '20 دقيقة', '2026-09-15', TRUE),
('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'اختبار البلاغة والبيان: التشبيه والاستعارة', 5, '20 دقيقة', '2026-09-18', TRUE),
('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'اختبار أحكام التلاوة والتجويد والقرآن الكريم', 5, '20 دقيقة', '2026-09-20', TRUE),
('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 'اختبار الصرف والمشتقات والممنوع من الصرف', 5, '20 دقيقة', '2026-09-24', TRUE)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    questions_count = EXCLUDED.questions_count,
    duration = EXCLUDED.duration,
    available_date = EXCLUDED.available_date,
    updated_at = NOW();

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
-- 8. إدراج تسليمات الواجبات الفعلية (Assignment Submissions)
-- ====================================================================
INSERT INTO public.assignment_submissions (id, assignment_id, user_id, status, answer, score, feedback, submitted_at, reviewed_at)
VALUES
('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'تم التسليم', 'استخرجت من القصيدة محسن الجناس بين (السناء والبهاء)، واستعارة مكنية في (ربواك). وأعربت: الجلال مبتدأ مرفوع، والجمال معطوف، وفي رباك جار ومجرور متعلقان بمحذوف خبر.', 18, 'تحليل دقيق وربط جميل بين الجانب البلاغي والإعرابي. حافظت على هذا المستوى يا محمود.', '2026-09-09T15:20:00Z', '2026-09-10T09:10:00Z'),
('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'تم التسليم', 'وضحت صورة الاستعارة المكنية في بيت (هل أراك سالماً منعماً) وبيّنت أن النداء موجه للوطن بوصفه كائناً حياً يرجو له الشاعر السلامة.', 16, 'إجابة سليمة، لاحظت أنك بدأت الخطوات لكنك أردت توضيح وجه الشبه بالتفصيل.', '2026-09-09T16:10:00Z', '2026-09-10T11:30:00Z'),
('80000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005', 'تم التسليم', 'أعربت الشطر إعراباً تاماً، واستخرجت محسناً بديعياً هو الطباق بين (سالماً) و(النقمة) في جو الرواية الغنائية للنشيد.', 19, 'إعراب ممتاز ومستوى تحليل شعري متقدم، أحسنت يا أحمد.', '2026-09-10T10:05:00Z', '2026-09-10T18:40:00Z'),
('80000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000008', 'تم التسليم', 'خلصت إلى أن العاطفة الوطنية هي المسيطرة، وبينت أن تكرار لفظ (موطني) إيقاعٌ يرسخ الانتماء.', 15, 'أحسنتِ التعبير عن العاطفة، وكان ينبغي توثيق الصور البيانية بأمثلة من النص.', '2026-09-10T12:30:00Z', '2026-09-11T08:20:00Z'),
('80000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'تم التسليم', 'أعربت: كانَ فعل ماضٍ ناقص، جنودُ اسم كان مرفوع بالضمة وهو مضاف، الوطنِ مضاف إليه مجرور، مرابطين خبر كان منصوب بالياء لأنه جمع مذكر سالم. وإنّ حرف ناسخ، الحقَّ اسم إن منصوب، سلاحُ خبر إن مرفوع.', 22, 'إعراب رصين متقن للجملتين، وأتقنت ترتيب علامات الإعراب، بوركت.', '2026-09-11T09:00:00Z', '2026-09-11T14:30:00Z'),
('80000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'تم التسليم', 'ذكرت أن (كان) ترفع الاسم وتنصب الخبر، وأن (إنّ) تنصب الاسم وترفع الخبر، مع تطبيق إعرابي كامل على الشاهدين.', 20, 'إجابة جيدة، راجعي قليلاً في تسمية معمولي النواسخ عند الجملة الثانية.', '2026-09-11T10:20:00Z', '2026-09-11T15:00:00Z'),
('80000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000005', 'تم التسليم', 'أبرزت أن (مرابطين) خبر كان منصوب بالياء نيابة عن الكسرة، وأن (سلاح) خبر إن مرفوع بالضمة لما دل على معنى الجملة.', 23, 'أداء إعرابي متميز، ويبدو أنك أتقنت النواسخ بشكل كامل.', '2026-09-12T11:45:00Z', '2026-09-12T16:10:00Z'),
('80000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000004', 'تم التسليم', 'أعربت الجملة الأولى ثم حاولت الثانية، وأوضحت أن (أخلاق) معطوف على العلم داخل اسم إن.', 19, 'تبين أنك وازنت بين الجملتين، حافظي على الدقة في تسمية الخبر.', '2026-09-12T13:00:00Z', '2026-09-12T17:20:00Z'),
('80000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', 'تم التسليم', 'صغت: ناصر فاعل ومفعول من نصر، صان صان وصائن، مستخرج من استخرج، وعالم من علم، ووضعت المشتقات في جمل تعبر عن معانيها بدقة.', 18, 'مشتقات سليمة وجمل مفيدة، لاحظت أنك نسيت صيغة المبالغة من (استخرج).', '2026-09-13T08:50:00Z', '2026-09-13T12:20:00Z'),
('80000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000007', 'قيد المراجعة', 'بدأت بصياغة الأسماء المشتقة من الأفعال المقررة وسأكمل صيغ المبالغة ومراجعة الجمل قبل التسليم النهائي.', NULL, 'سلمت الحل، وسأصححه خلال يومين كحد أقصى.', '2026-09-13T09:10:00Z', NULL),
('80000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000009', 'تم التسليم', 'صغت اسم الفاعل واسم المفعول وصيغ المبالغة: ناصِر ومنصور ونَصّار، صائِن ومصون وصوّان، مستخرِج ومستخرَج، عالم ومعلوم وعلاّمة مع جمل موضحة.', 20, 'إتقان واضح للصياغات الصرفية ومواضع صيغ المبالغة، أحسنت يا آدم.', '2026-09-13T10:40:00Z', '2026-09-13T15:30:00Z'),
('80000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000008', 'تم التسليم', 'كتبت فقرة عن القدس وصفت فيها الأزقة والمآذن والكنائس، ووظفت تشبيهاً بليغاً (القدس قلادة الأرض) واستعارة مكنية (تحتضن الأحياء أبناءها).', 24, 'فقرة أدبية رائعة، وست مستوياك في توظيف الصور البلاغية بسلاسة.', '2026-09-14T09:30:00Z', '2026-09-14T13:45:00Z'),
('80000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000006', 'تم التسليم', 'وصفت جمال أسوار القدس بهوية الحجر، مستخدمة تشبيهاً مجملاً واستعارة تصريحية مع ضبط الهمزات في كلمات مثل (السماء، مبدئ، أسوار).', 21, 'تركيب تعبيري جميل، وراعيتِ الهمزات بدقة، استمري.', '2026-09-14T11:10:00Z', '2026-09-14T15:00:00Z'),
('80000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000006', 'تم التسليم', 'لخصت أن زهيراً جعل الحكمة دستوراً للحياة، واستشهدت بثلاثة أبيات بينت فيها قيم الحقن والصلح وبذل المعروف.', 28, 'فهم عميق لروح المعلقة، ومقابل نقدي واعٍ، تشكرين على الجهد.', '2026-09-15T10:15:00Z', '2026-09-15T16:20:00Z'),
('80000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000009', 'تم التسليم', 'ركزت على موقف الشاعر من الحروب وأثر حكمته في نبذ الثأر وتقديم السلم، مع شواهد دقيقة من المعلقة.', 25, 'قسم نقدي ممتاز، اجتهد في الربط بين أبيات الشواهد ووجه الاستشهاد.', '2026-09-15T12:40:00Z', '2026-09-16T09:00:00Z'),
('80000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000003', 'تم التسليم', 'استخرجت الأسماء الممنوعة من الصرف وقدت وزن الكلمات المحددة على الميزان الصرفي مع الإشارة إلى حروف الزيادة.', 22, 'جدول منظم وعلل متقنة، لاحظت سؤالاً مطولاً عن ألف التأنيث أحسنت فيه.', '2026-09-15T14:20:00Z', '2026-09-16T10:30:00Z'),
('80000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000007', 'قيد المراجعة', 'استخرجت الممنوعات وبيّنت عللها من القطعة، وبقيت أوزان الكلمات الإضافية أحسم فيها قبل التسليم.', NULL, 'وصلت الإجابة، وسأصححها هذا الأسبوع.', '2026-09-16T09:00:00Z', NULL),
('80000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000006', 'تم التسليم', 'استخرجت من آيات سورة الحجرات: ثلاثة مواضع إظهار حلقي، وموضعين إدغام بغنة، وموضع إقلاب، وثلاثة مواضع إخفاء، مع جدول توضيحي دقيق.', 27, 'تطبيق قرآني مضبوط، والجدول دقيق، ممتازة يا نور.', '2026-09-16T11:15:00Z', '2026-09-16T18:00:00Z'),
('80000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000011', 'تم التسليم', 'حددت أحكام النون والميم الساكنة في الآيات المقررة، مع الإشارة إلى مواطن الغنة ومواضع الإقلاب والإخفاء.', 26, 'إجابة متقنة وأحسنت تنظيم الجدول، مع ملاحظة بسيطة على وجه إدغام المتماثلين.', '2026-09-17T10:00:00Z', '2026-09-17T14:00:00Z')
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    score = EXCLUDED.score,
    feedback = EXCLUDED.feedback;

-- ====================================================================
-- 9. إدراج أسئلة الاختبارات التقييمية الكاملة (Assessment Questions)
-- ====================================================================
INSERT INTO public.assessment_questions (id, assessment_id, question, options, correct_answer, explanation, position)
VALUES
('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ما نوع الخبر في جملة: ﴿وَاللَّهُ يَعْلَمُ مَا تُسِرُّونَ﴾؟', '["مفرد", "جملة فعلية", "جملة اسمية", "شبه جملة"]', 1, 'الخبر هو الفعل والفاعل (يعلم)، وهو جملة فعلية في محل رفع خبر المبتدأ.', 1),
('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'ما إعراب كلمة (مجتهدين) في جملة: (أصبح الطلابُ مجتهدينَ)؟', '["فاعل مرفوع بالواو", "خبر أصبح منصوب بالياء", "اسم أصبح منصوب بالفتحة", "نعت منصوب بالياء"]', 1, 'أصبح من أخوات كان ترفع المبتدأ وتنصب الخبر، ومجتهدين خبر أصبح منصوب بالياء لأنه جمع مذكر سالم.', 2),
('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'ما الأثر الإعرابي لدخول (إنّ) على جملة (الحقُّ أبلجُ)؟', '["إنَّ الحقُّ أبلجَ", "إنَّ الحقَّ أبلجٌ", "إنَّ الحقَّ أبلجاً", "إنَّ الحقُّ أبلجٌ"]', 1, 'إنّ تنصب الاسم وترفع الخبر: إنّ الحقَّ أبلجٌ.', 3),
('21000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'ما إعراب (المؤمنون) في قوله تعالى: ﴿إِنَّمَا الْمُؤْمِنُونَ إِخْوَةٌ﴾؟', '["اسم إن منصوب بالياء", "مبتدأ مرفوع بالواو لكفّ إن بـ (ما)", "خبر إن مرفوع بالواو", "نائب فاعل مرفوع بالضمة"]', 1, 'دخلت (ما) الكافة على (إنّ) فكفتها عن العمل، ويعرب ما بعدها مبتدأ مرفوع بالواو.', 4),
('21000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'أي الجمل التالية تتضمن فعلاً ناسخاً يفيد التحول والصيرورة؟', '["كان الجو جميلاً", "صار العنبُ زبيباً", "ليس الكسلُ محموداً", "أمسى العاملُ متعباً"]', 1, 'الفعل (صار) يفيد تحول الاسم وانتقاله من حال إلى حال.', 5),
('21000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', 'ما نوع التشبيه في قوله تعالى: ﴿وَهِيَ تَجْرِي بِهِمْ فِي مَوْجٍ كَالْجِبَالِ﴾؟', '["تشبيه بليغ", "تشبيه مجمل مرسل", "تشبيه مؤكد مفصل", "استعارة مكنية"]', 1, 'ذكر المشبه (موج) والأداة (الكاف) والمشبه به (الجبال) وحذف وجه الشبه، فهو مجمل مرسل.', 1),
('21000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000002', 'ما الصورة البيانية في قولنا: (عضّنا الدهرُ بأنيابه)؟', '["تشبيه بليغ", "استعارة تصريحية", "استعارة مكنية", "جناس تام"]', 2, 'شبه الدهر بحيوان مفترس يعض، وحذف المشبه به ورمز إليه بشيء من لوازمه (الأنياب والعض)، فهي استعارة مكنية.', 2),
('21000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000002', 'ما هو التشبيه البليغ؟', '["ما ذكرت فيه جميع الأركان", "ما حذفت منه الأداة ووجه الشبه معاً", "ما حذف منه المشبه", "ما حذف منه المشبه به"]', 1, 'التشبيه البليغ هو ما حذف منه وجه الشبه وأداة التشبيه واقتصر على المشبه والمشبه به مثل: (العلمُ نورٌ).', 3),
('21000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', 'في قوله تعالى: ﴿اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ﴾ ما الصورة البيانية في (الصراط المستقيم)؟', '["تشبيه مفصل", "استعارة تصريحية حيث شبه الدين بالصراط وحذف المشبه", "استعارة مكنية", "طباق إيجاب"]', 1, 'شبه الدين الحق بالصراط الواضح وصرح بلفظ المشبه به، فهي استعارة تصريحية.', 4),
('21000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002', 'ما سر الجمال في تشبيه (المعنوي بالمادي المجسم)؟', '["التشخيص", "التجسيم", "التوكيد فقط", "السجع"]', 1, 'تحويل الأمور المعنوية إلى محسوسات مادية مجسمة يسمى تجسيماً ويزيد المعنى وضوحاً.', 5),
('21000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000003', 'ما حكم النون الساكنة في قوله تعالى: ﴿مِنْ خَوْفٍ﴾؟', '["إدغام بغنة", "إظهار حلقي", "إخفاء حقيقي", "إقلاب"]', 1, 'حرف الخاء من حروف الإظهار الحلقي الستة، فحكم النون هنا الإظهار.', 1),
('21000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000003', 'كم عدد حروف الإخفاء الحقيقي للنون الساكنة والتنوين؟', '["6 حروف", "4 حروف", "15 حرفاً", "8 حروف"]', 2, 'حروف الإخفاء 15 حرفاً مجموعة في أوائل كلمات: (صف ذا ثنا كم جاد شخص قد سما دم طيبا زد في تقى ضع ظالما).', 2),
('21000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000003', 'ما هو حكم الميم الساكنة في قوله تعالى: ﴿أَمْ لَمْ تُنذِرْهُمْ لاَ يُؤْمِنُونَ﴾؟', '["إخفاء شفوي", "إظهار شفوي", "إدغام شفوي", "إقلاب"]', 1, 'الميم بعدها تاء ولام، وحكمها الإظهار الشفوي.', 3),
('21000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000003', 'كم مقدار مد المد اللازم الكلمي المثقل مثل: ﴿الضَّالِّينَ﴾؟', '["حركتان", "أربع حركات", "ست حركات لزوماً", "ثلاث حركات"]', 2, 'يمد المد اللازم ست حركات إشباعاً ولا يجوز قصره بحال.', 4),
('21000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000003', 'ما حكم النون في كلمة (بُنْيَانٌ)؟', '["إدغام بغنة", "إظهار مطلق لورود النون وحرف الإدغام في كلمة واحدة", "إخفاء حقيقي", "إقلاب"]', 1, 'إذا اجتمعت النون مع الياء أو الواو في كلمة واحدة تعين الإظهار المطلق حماية للبنية من اللبس.', 5),
('21000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000004', 'ما هو وزن الفعل (استقامَ) في الميزان الصرفي؟', '["استفعلَ", "استفالَ", "افتعَلَ", "تفعَّلَ"]', 1, 'أصل استقام من (قوم)، حذفت عين الكلمة أو قلبت، ووزنه استفال.', 1),
('21000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000004', 'ما علة منع اسم (عائشة) من الصرف؟', '["للعلمية والتأنيث", "للعلمية والعجمة", "لأنه على وزن الفعل", "لأنه منتهٍ بألف ونون زائدتين"]', 0, 'عائشة علم لمؤنث تأنيثاً حقيقياً ولفظياً فيمنع للعلمية والتأنيث.', 2),
('21000000-0000-0000-0000-000000000018', '20000000-0000-0000-0000-000000000004', 'متى يجر الممنوع من الصرف بالكسرة الظاهرة؟', '["إذا كان نكرة فقط", "إذا عُرِّف بـ (أل) أو أُضيف", "إذا وقع مبتدأً", "إذا جاء بعد حرف عطف"]', 1, 'يعود الممنوع من الصرف إلى الجر بالكسرة إذا اقترن بأل التعريف أو أضيف إلى ما بعده.', 3),
('21000000-0000-0000-0000-000000000019', '20000000-0000-0000-0000-000000000004', 'ما نوع المشتق في كلمة (معطاء)؟', '["اسم فاعل", "صيغة مبالغة على وزن مِفعال", "اسم مفعول", "صفة مشبهة"]', 1, 'معطاء على وزن مِفْعال، وهي من صيغ المبالغة القياسية.', 4),
('21000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000004', 'ما نوع المصدر في كلمة (استغفار)؟', '["مصدر ثلاثي سماعي", "مصدر سداسي قياسي", "مصدر خماسي", "مصدر رباعي"]', 1, 'استغفار مصدر قياسي للفعل السداسي (استغفر).', 5)
ON CONFLICT (id) DO UPDATE SET
    question = EXCLUDED.question,
    options = EXCLUDED.options,
    correct_answer = EXCLUDED.correct_answer,
    explanation = EXCLUDED.explanation,
    position = EXCLUDED.position;

-- ====================================================================
-- 10. إدراج محاولات الاختبارات الفعلية (Assessment Attempts)
-- ====================================================================
INSERT INTO public.assessment_attempts (id, assessment_id, user_id, status, score, answers, started_at, completed_at)
VALUES
('90000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'مكتمل', 80, '[]', '2026-09-15T09:00:00Z', '2026-09-15T09:12:00Z'),
('90000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'مكتمل', 100, '[]', '2026-09-15T10:00:00Z', '2026-09-15T10:14:00Z'),
('90000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000005', 'مكتمل', 60, '[]', '2026-09-15T11:15:00Z', '2026-09-15T11:28:00Z'),
('90000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000008', 'مكتمل', 80, '[]', '2026-09-15T12:30:00Z', '2026-09-15T12:42:00Z'),
('90000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 'مكتمل', 100, '[]', '2026-09-15T13:10:00Z', '2026-09-15T13:22:00Z'),
('90000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'مكتمل', 80, '[]', '2026-09-18T09:20:00Z', '2026-09-18T09:33:00Z'),
('90000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000005', 'مكتمل', 100, '[]', '2026-09-18T10:40:00Z', '2026-09-18T10:55:00Z'),
('90000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000008', 'مكتمل', 60, '[]', '2026-09-18T12:05:00Z', '2026-09-18T12:18:00Z'),
('90000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000005', 'مكتمل', 100, '[]', '2026-09-20T09:10:00Z', '2026-09-20T09:25:00Z'),
('90000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000008', 'مكتمل', 80, '[]', '2026-09-20T11:30:00Z', '2026-09-20T11:44:00Z'),
('90000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000006', 'مكتمل', 60, '[]', '2026-09-20T13:00:00Z', '2026-09-20T13:15:00Z'),
('90000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000003', 'مكتمل', 80, '[]', '2026-09-24T09:40:00Z', '2026-09-24T09:52:00Z'),
('90000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000009', 'مكتمل', 60, '[]', '2026-09-24T10:50:00Z', '2026-09-24T11:05:00Z'),
('90000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000006', 'مكتمل', 80, '[]', '2026-09-24T12:20:00Z', '2026-09-24T12:33:00Z')
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    score = EXCLUDED.score;

-- ====================================================================
-- 11. تقدم الطلاب في الدروس المنجزة (Lesson Progress)
-- ====================================================================
INSERT INTO public.lesson_progress (user_id, lesson_id, completed_at)
SELECT lp.user_id, lp.lesson_id, lp.completed_at
FROM (VALUES
    ('70000000-0000-0000-0000-000000000001'::uuid, '01000000-0000-0000-0000-000000000001'::uuid, '2026-09-02T09:00:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000001'::uuid, '01000000-0000-0000-0000-000000000002'::uuid, '2026-09-04T10:30:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000001'::uuid, '01000000-0000-0000-0000-000000000003'::uuid, '2026-09-06T11:15:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000001'::uuid, '02000000-0000-0000-0000-000000000001'::uuid, '2026-09-08T09:45:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000001'::uuid, '02000000-0000-0000-0000-000000000002'::uuid, '2026-09-09T10:20:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000001'::uuid, '02000000-0000-0000-0000-000000000003'::uuid, '2026-09-11T08:50:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000001'::uuid, '03000000-0000-0000-0000-000000000001'::uuid, '2026-09-12T12:00:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000002'::uuid, '01000000-0000-0000-0000-000000000001'::uuid, '2026-09-03T09:10:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000002'::uuid, '01000000-0000-0000-0000-000000000002'::uuid, '2026-09-05T10:40:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000002'::uuid, '01000000-0000-0000-0000-000000000003'::uuid, '2026-09-07T11:20:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000002'::uuid, '02000000-0000-0000-0000-000000000001'::uuid, '2026-09-09T09:30:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000002'::uuid, '02000000-0000-0000-0000-000000000002'::uuid, '2026-09-11T08:10:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000002'::uuid, '03000000-0000-0000-0000-000000000001'::uuid, '2026-09-13T13:00:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000003'::uuid, '01000000-0000-0000-0000-000000000001'::uuid, '2026-09-04T09:40:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000003'::uuid, '01000000-0000-0000-0000-000000000002'::uuid, '2026-09-06T10:50:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000003'::uuid, '01000000-0000-0000-0000-000000000003'::uuid, '2026-09-08T11:30:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000003'::uuid, '01000000-0000-0000-0000-000000000004'::uuid, '2026-09-10T12:10:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000003'::uuid, '02000000-0000-0000-0000-000000000001'::uuid, '2026-09-12T09:20:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000003'::uuid, '05000000-0000-0000-0000-000000000001'::uuid, '2026-09-13T10:30:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000004'::uuid, '01000000-0000-0000-0000-000000000001'::uuid, '2026-09-05T09:15:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000004'::uuid, '01000000-0000-0000-0000-000000000002'::uuid, '2026-09-07T10:05:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000004'::uuid, '02000000-0000-0000-0000-000000000001'::uuid, '2026-09-10T08:40:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '01000000-0000-0000-0000-000000000001'::uuid, '2026-09-03T09:55:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '01000000-0000-0000-0000-000000000002'::uuid, '2026-09-04T10:25:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '01000000-0000-0000-0000-000000000003'::uuid, '2026-09-06T11:05:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '01000000-0000-0000-0000-000000000004'::uuid, '2026-09-08T12:15:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '01000000-0000-0000-0000-000000000005'::uuid, '2026-09-10T09:35:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '02000000-0000-0000-0000-000000000001'::uuid, '2026-09-12T10:45:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '03000000-0000-0000-0000-000000000001'::uuid, '2026-09-13T11:20:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '06000000-0000-0000-0000-000000000001'::uuid, '2026-09-04T13:00:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '06000000-0000-0000-0000-000000000002'::uuid, '2026-09-05T13:40:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '06000000-0000-0000-0000-000000000003'::uuid, '2026-09-07T14:10:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '06000000-0000-0000-0000-000000000004'::uuid, '2026-09-09T14:30:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000005'::uuid, '06000000-0000-0000-0000-000000000005'::uuid, '2026-09-11T15:00:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000006'::uuid, '04000000-0000-0000-0000-000000000001'::uuid, '2026-09-06T09:20:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000006'::uuid, '04000000-0000-0000-0000-000000000002'::uuid, '2026-09-08T10:10:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000006'::uuid, '04000000-0000-0000-0000-000000000003'::uuid, '2026-09-10T11:40:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000006'::uuid, '05000000-0000-0000-0000-000000000001'::uuid, '2026-09-12T12:30:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000006'::uuid, '06000000-0000-0000-0000-000000000001'::uuid, '2026-09-13T09:05:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000007'::uuid, '04000000-0000-0000-0000-000000000001'::uuid, '2026-09-08T09:50:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000007'::uuid, '04000000-0000-0000-0000-000000000002'::uuid, '2026-09-11T10:30:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000008'::uuid, '01000000-0000-0000-0000-000000000001'::uuid, '2026-09-02T09:30:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000008'::uuid, '01000000-0000-0000-0000-000000000002'::uuid, '2026-09-03T10:20:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000008'::uuid, '01000000-0000-0000-0000-000000000003'::uuid, '2026-09-05T11:10:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000008'::uuid, '01000000-0000-0000-0000-000000000004'::uuid, '2026-09-08T12:20:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000008'::uuid, '01000000-0000-0000-0000-000000000005'::uuid, '2026-09-10T09:15:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000008'::uuid, '02000000-0000-0000-0000-000000000001'::uuid, '2026-09-12T10:40:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000008'::uuid, '02000000-0000-0000-0000-000000000002'::uuid, '2026-09-13T11:50:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000008'::uuid, '03000000-0000-0000-0000-000000000001'::uuid, '2026-09-14T08:55:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000009'::uuid, '04000000-0000-0000-0000-000000000001'::uuid, '2026-09-07T10:00:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000009'::uuid, '04000000-0000-0000-0000-000000000002'::uuid, '2026-09-09T11:00:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000009'::uuid, '04000000-0000-0000-0000-000000000003'::uuid, '2026-09-11T12:05:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000009'::uuid, '04000000-0000-0000-0000-000000000004'::uuid, '2026-09-13T09:40:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000009'::uuid, '05000000-0000-0000-0000-000000000001'::uuid, '2026-09-14T10:15:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000010'::uuid, '04000000-0000-0000-0000-000000000001'::uuid, '2026-09-09T09:25:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000010'::uuid, '04000000-0000-0000-0000-000000000002'::uuid, '2026-09-11T10:35:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000010'::uuid, '05000000-0000-0000-0000-000000000001'::uuid, '2026-09-13T11:25:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000011'::uuid, '04000000-0000-0000-0000-000000000001'::uuid, '2026-09-10T09:35:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000011'::uuid, '04000000-0000-0000-0000-000000000002'::uuid, '2026-09-12T10:25:00Z'::timestamptz),
    ('70000000-0000-0000-0000-000000000011'::uuid, '06000000-0000-0000-0000-000000000001'::uuid, '2026-09-14T12:10:00Z'::timestamptz)
) AS lp(user_id, lesson_id, completed_at)
ON CONFLICT (user_id, lesson_id) DO NOTHING;

-- ====================================================================
-- 12. تقدم الطلاب في الوحدات التعليمية (Course Progress)
-- ====================================================================
INSERT INTO public.course_progress (user_id, course_id, progress, completed_lessons, last_opened_at, updated_at)
VALUES
('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 60, 3, '2026-09-12T12:00:00Z', '2026-09-12T12:00:00Z'),
('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 60, 3, '2026-09-11T08:50:00Z', '2026-09-11T08:50:00Z'),
('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 25, 1, '2026-09-12T12:00:00Z', '2026-09-12T12:00:00Z'),
('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 60, 3, '2026-09-09T09:30:00Z', '2026-09-09T09:30:00Z'),
('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 40, 2, '2026-09-11T08:10:00Z', '2026-09-11T08:10:00Z'),
('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 25, 1, '2026-09-13T13:00:00Z', '2026-09-13T13:00:00Z'),
('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 80, 4, '2026-09-10T12:10:00Z', '2026-09-10T12:10:00Z'),
('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 20, 1, '2026-09-12T09:20:00Z', '2026-09-12T09:20:00Z'),
('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', 25, 1, '2026-09-13T10:30:00Z', '2026-09-13T10:30:00Z'),
('70000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 40, 2, '2026-09-07T10:05:00Z', '2026-09-07T10:05:00Z'),
('70000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 20, 1, '2026-09-10T08:40:00Z', '2026-09-10T08:40:00Z'),
('70000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 60, 1, '2026-09-08T12:15:00Z', '2026-09-08T12:15:00Z'),
('70000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', 20, 1, '2026-09-12T10:45:00Z', '2026-09-12T10:45:00Z'),
('70000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', 100, 5, '2026-09-11T15:00:00Z', '2026-09-11T15:00:00Z'),
('70000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', 60, 3, '2026-09-10T11:40:00Z', '2026-09-10T11:40:00Z'),
('70000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005', 25, 1, '2026-09-12T12:30:00Z', '2026-09-12T12:30:00Z'),
('70000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 20, 1, '2026-09-13T09:05:00Z', '2026-09-13T09:05:00Z'),
('70000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000004', 40, 2, '2026-09-11T10:30:00Z', '2026-09-11T10:30:00Z'),
('70000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 100, 5, '2026-09-10T09:15:00Z', '2026-09-10T09:15:00Z'),
('70000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002', 40, 2, '2026-09-13T11:50:00Z', '2026-09-13T11:50:00Z'),
('70000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000003', 25, 1, '2026-09-14T08:55:00Z', '2026-09-14T08:55:00Z'),
('70000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', 80, 4, '2026-09-13T09:40:00Z', '2026-09-13T09:40:00Z'),
('70000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000005', 25, 1, '2026-09-14T10:15:00Z', '2026-09-14T10:15:00Z'),
('70000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000004', 40, 2, '2026-09-11T10:35:00Z', '2026-09-11T10:35:00Z'),
('70000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000005', 25, 1, '2026-09-13T11:25:00Z', '2026-09-13T11:25:00Z'),
('70000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000004', 40, 2, '2026-09-12T10:25:00Z', '2026-09-12T10:25:00Z'),
('70000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000006', 20, 1, '2026-09-14T12:10:00Z', '2026-09-14T12:10:00Z')
ON CONFLICT (user_id, course_id) DO UPDATE SET
    progress = EXCLUDED.progress,
    completed_lessons = EXCLUDED.completed_lessons,
    last_opened_at = EXCLUDED.last_opened_at,
    updated_at = NOW();

-- ====================================================================
-- 13. إدراج شهادات الإنجاز الفعلية (Certificates)
-- ====================================================================
INSERT INTO public.certificates (id, user_id, course_id, title, issued_at, certificate_url)
VALUES
('a1000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'شهادة إتمام الوحدة الأولى · القراءة والنصوص الأدبية', '2026-09-13T09:00:00Z', '/certificates/grade9-unit1-mahmoud.pdf'),
('a1000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'شهادة إتمام الوحدة الأولى · القراءة والنصوص الأدبية', '2026-09-13T09:10:00Z', '/certificates/grade9-unit1-yasmin.pdf'),
('a1000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'شهادة إتمام الوحدة الأولى · القراءة والنصوص الأدبية', '2026-09-13T09:20:00Z', '/certificates/grade9-unit1-jana.pdf'),
('a1000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', 'شهادة إتمام الوحدة السادسة · علوم القرآن الكريم وأحكام التلاوة', '2026-09-12T10:00:00Z', '/certificates/quran-unit6-ahmed.pdf'),
('a1000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', 'شهادة إتمام الوحدة الرابعة · روائع الأدب والشعر العربي', '2026-09-11T11:00:00Z', '/certificates/grade10-unit4-nour.pdf'),
('a1000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', 'شهادة إتمام الوحدة الرابعة · روائع الأدب والشعر العربي', '2026-09-13T12:00:00Z', '/certificates/grade10-unit4-adam.pdf')
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    issued_at = EXCLUDED.issued_at;

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
