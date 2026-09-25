-- ====================================================================
-- منصة "أرض اللغة" — منظومة المنهاج الكاملة V2
-- الصفوف (الثامن/التاسع/العاشر) × الفصول × الوحدات × الدروس × الاختبارات
-- + بوابة "آخر ما وصلنا" التي يتحكم بها المعلم (grade_gates)
-- + أغلفة الوحدات والدروس وصور الدروس وملفات HTML
-- ملف تزايدي آمن: يعمل على قاعدة البيانات الحية دون حذف أي بيانات
-- نفّذه مرة واحدة في Supabase SQL Editor على مشروع:
-- https://zjxotgcsbsfwrfqtximw.supabase.co
-- ====================================================================

-- ─────────────────────────────────────────────
-- 1. أعمدة جديدة على الوحدات (courses)
-- ─────────────────────────────────────────────
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الصف العاشر';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT 'الفصل الأول';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cover_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- ─────────────────────────────────────────────
-- 2. أعمدة جديدة على الدروس (lessons)
-- ─────────────────────────────────────────────
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS lesson_type TEXT NOT NULL DEFAULT 'مطالعة';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS cover_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS html_content TEXT NOT NULL DEFAULT '';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS html_file_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الصف العاشر';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT 'الفصل الأول';

-- ─────────────────────────────────────────────
-- 3. أعمدة جديدة على الاختبارات (assessments)
-- ─────────────────────────────────────────────
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الصف العاشر';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS term TEXT NOT NULL DEFAULT 'الفصل الأول';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS unit_title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- ─────────────────────────────────────────────
-- 4. عمود الصف على الإعلانات (لتوجيه إعلان لصف معين)
-- ─────────────────────────────────────────────
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT 'الجميع';

-- ─────────────────────────────────────────────
-- 5. جدول الصفوف الدراسية
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_levels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.grade_levels (id, name, sort_order) VALUES
('grade-8', 'الصف الثامن', 1),
('grade-9', 'الصف التاسع', 2),
('grade-10', 'الصف العاشر', 3)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────
-- 6. بوابة "آخر ما وصلنا" — يحددها المعلم لكل صف وفصل
-- الطالب يرى فقط الوحدات/الدروس حتى هذه البوابة
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_gates (
    grade TEXT NOT NULL,
    term TEXT NOT NULL,
    unlocked_course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    unlocked_lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    unlocked_unit_order INT NOT NULL DEFAULT 99,
    note TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (grade, term)
);

INSERT INTO public.grade_levels (id, name, sort_order) VALUES
('grade-8', 'الصف الثامن', 1),
('grade-9', 'الصف التاسع', 2),
('grade-10', 'الصف العاشر', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.grade_gates (grade, term, unlocked_unit_order, note) VALUES
('الصف الثامن', 'الفصل الأول', 99, 'مفتوح بالكامل افتراضياً — يعدّلها المعلم'),
('الصف التاسع', 'الفصل الأول', 99, 'مفتوح بالكامل افتراضياً — يعدّلها المعلم'),
('الصف العاشر', 'الفصل الأول', 99, 'مفتوح بالكامل افتراضياً — يعدّلها المعلم'),
('الصف الثامن', 'الفصل الثاني', 99, ''),
('الصف التاسع', 'الفصل الثاني', 99, ''),
('الصف العاشر', 'الفصل الثاني', 99, '')
ON CONFLICT (grade, term) DO NOTHING;

-- ─────────────────────────────────────────────
-- 7. فهارس الأداء
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS courses_grade_term_idx ON public.courses (grade, term, sort_order);
CREATE INDEX IF NOT EXISTS lessons_course_position_idx ON public.lessons (course_id, position);
CREATE INDEX IF NOT EXISTS lessons_grade_term_idx ON public.lessons (grade, term);
CREATE INDEX IF NOT EXISTS assessments_grade_term_idx ON public.assessments (grade, term);
CREATE INDEX IF NOT EXISTS assessments_lesson_idx ON public.assessments (lesson_id);

-- ─────────────────────────────────────────────
-- 8. سياسات الوصول (RLS مفتوحة للقراءة والكتابة عبر API)
-- ─────────────────────────────────────────────
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_gates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_grade_levels') THEN
    CREATE POLICY open_all_grade_levels ON public.grade_levels FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_grade_gates') THEN
    CREATE POLICY open_all_grade_gates ON public.grade_gates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- فتح RLS على الجداول الأساسية إن كانت مفعّلة (حتى يعمل API بالمفتاح العام)
DO $$ BEGIN
  BEGIN ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_courses') THEN
    CREATE POLICY open_all_courses ON public.courses FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_lessons') THEN
    CREATE POLICY open_all_lessons ON public.lessons FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_assessments') THEN
    CREATE POLICY open_all_assessments ON public.assessments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'open_all_assessment_questions') THEN
    CREATE POLICY open_all_assessment_questions ON public.assessment_questions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ====================================================================
-- 9. وحدات الصف العاشر — الفصل الأول (9 وحدات حسب كتاب المنهاج)
-- ====================================================================
INSERT INTO public.courses (id, title, description, lessons_count, duration, color, icon, sort_order, published, grade, term, cover_url, avatar_url, status, is_locked, is_visible)
VALUES
('b1000000-0000-0000-0000-000000000001', 'الوحدة الأولى: الكلمة مفتاح القلوب', 'المطالعة: الكلمة مفتاح القلوب (سورة إبراهيم 24-43) · القواعد: الحال (1) · البلاغة: التشبيه (1) · التعبير: المقالة.', 4, '3 ساعات', '#2e7d32', 'book-open', 1, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE),
('b1000000-0000-0000-0000-000000000002', 'الوحدة الثانية: القدس روح فلسطين', 'المطالعة: القدس روح فلسطين · الشعر: مرثية بيت المقدس · القواعد: الحال (2) · العروض: الكتابة العروضية · الإملاء: التاء والهاء · التعبير: كتابة مقالة.', 6, '4 ساعات', '#8a508f', 'library', 2, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE),
('b1000000-0000-0000-0000-000000000003', 'الوحدة الثالثة: السلامة المهنية', 'المطالعة: السلامة المهنية · الشعر: مرارة أب · القواعد: النداء (1) · البلاغة: التشبيه (2) · التعبير: كتابة كلمة وإلقاؤها.', 5, '3.5 ساعات', '#b7791f', 'shield-check', 3, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE),
('b1000000-0000-0000-0000-000000000004', 'الوحدة الرابعة: ساحة الحناطير', 'المطالعة: ساحة الحناطير · القواعد: النداء (2) · العروض: المقاطع الصوتية · الإملاء: همزة ابن وابنة والحروف المحذوفة · التعبير: كلمة عن يوم النكبة.', 5, '3.5 ساعات', '#a85d3d', 'landmark', 4, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE),
('b1000000-0000-0000-0000-000000000005', 'الوحدة الخامسة: شجرة التين', 'المطالعة: شجرة التين · الشعر: أغنية ريفية · القواعد: اسما الزمان والمكان · التعبير: السيرة الذاتية.', 4, '3 ساعات', '#2f7772', 'leaf', 5, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE),
('b1000000-0000-0000-0000-000000000006', 'الوحدة السادسة: صلاح الدين الأيوبي', 'المطالعة: صلاح الدين الأيوبي · الشعر: بكائية إلى أبي فراس الحمداني · الإملاء: الحروف المزيدة وعلامات الترقيم · التعبير: كتابة سيرة ذاتية.', 4, '3 ساعات', '#5d4037', 'swords', 6, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE),
('b1000000-0000-0000-0000-000000000007', 'الوحدة السابعة: مستودع الذخائر', 'المطالعة: مستودع الذخائر · القواعد: اسم الآلة · التعبير: محضر الاجتماع.', 3, '2.5 ساعات', '#455a64', 'package', 7, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE),
('b1000000-0000-0000-0000-000000000008', 'الوحدة الثامنة: كلمة شرف', 'المطالعة: كلمة شرف · القواعد: معاني زيادات الأفعال (1) المزيد بحرف · العروض: التفعيلات · الإملاء: تطبيقات ورقعة · التعبير: كتابة محضر اجتماع.', 5, '4 ساعات', '#37474f', 'scroll-text', 8, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE),
('b1000000-0000-0000-0000-000000000009', 'الوحدة التاسعة: سور عكا — تحدٍ وصمود', 'المطالعة: سور عكا وتحد وصمود · الشعر: هنا باقون · القواعد: معاني زيادات الأفعال (2) · البلاغة: تدريبات عامة · الإملاء: الألف اللينة والهمزة المتوسطة · التقويم الذاتي والمشروع.', 6, '4 ساعات', '#0d47a1', 'castle', 9, TRUE, 'الصف العاشر', 'الفصل الأول', '', '', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title, description = EXCLUDED.description, lessons_count = EXCLUDED.lessons_count,
    duration = EXCLUDED.duration, color = EXCLUDED.color, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order,
    published = EXCLUDED.published, grade = EXCLUDED.grade, term = EXCLUDED.term, updated_at = NOW();

-- ====================================================================
-- 10. دروس الصف العاشر — الفصل الأول (42 درساً)
-- lesson_type: مطالعة | شعر | قواعد | بلاغة | عروض | إملاء | تعبير | تقويم
-- ====================================================================

-- الوحدة 1 (4 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000001', 'المطالعة: الكلمة مفتاح القلوب (سورة إبراهيم 24-43)', 'دراسة الآيات الكريمة: الكلمة الطيبة كشجرة طيبة، والمعاني الإيمانية والبلاغية.', 1, '{"introduction":"سورة إبراهيم تصوّر أثر الكلمة الطيبة والكلمة الخبيثة بمشهد الشجرة، درس في قوة البيان ومسؤولية اللسان.","mainText":"﴿أَلَمْ تَرَ كَيْفَ ضَرَبَ اللَّهُ مَثَلًا كَلِمَةً طَيِّبَةً كَشَجَرَةٍ طَيِّبَةٍ أَصْلُهَا ثَابِتٌ وَفَرْعُهَا فِي السَّمَاءِ﴾","vocabulary":[{"word":"كشجرة طيبة","meaning":"النخلة أو كل شجرة نافعة مثمرة"},{"word":"تؤتي أكلها","meaning":"تعطي ثمرها ونفعها كل حين"}],"grammarRule":"التشبيه التمثيلي: وجه الشبه منتزع من صورة مركبة (الثبات والعطاء الدائم).","summary":"الكلمة الطيبة عمل صالح يثمر في الدنيا والآخرة.","practiceQuestions":[{"q":"ما وجه الشبه في تشبيه الكلمة الطيبة بالشجرة الطيبة؟","a":"الثبات والرسوخ وكثرة النفع ودوام العطاء."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000001', 'القواعد: الحال (1)', 'تعريف الحال وصاحبها، شروطها، وأنواعها: مفردة وجملة وشبه جملة.', 2, '{"introduction":"الحال وصف منصوب يبين هيئة صاحبه عند وقوع الفعل، وهو من المنصوبات الأساسية.","mainText":"جاء الطالبُ مسروراً · عاد الجيشُ منتصراً · شاهدتُ القمرَ بين السحابِ","vocabulary":[{"word":"صاحب الحال","meaning":"الاسم الذي تبين الحال هيئته ويكون غالباً معرفة"}],"grammarRule":"الأصل في الحال أن تكون نكرة مشتقة منتقلة، وصاحبها معرفة.","summary":"الحال تجيب عن سؤال: كيف؟","practiceQuestions":[{"q":"عين الحال وصاحبها في: (أقبل المعلمُ باسماً)؟","a":"الحال: باسماً، صاحبها: المعلمُ."}]}'::jsonb, TRUE, 'قواعد', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000013', 'b1000000-0000-0000-0000-000000000001', 'البلاغة: التشبيه (1)', 'أركان التشبيه الأربعة وأنواعه: التام والمجمل والمؤكد والبليغ.', 3, '{"introduction":"التشبيه أول أبواب علم البيان: مشاركة بين شيئين في صفة بأداة.","mainText":"العلمُ نورٌ (بليغ) · الجنديُّ كالأسدِ في الشجاعةِ (تام الأركان)","vocabulary":[{"word":"وجه الشبه","meaning":"الصفة المشتركة وتكون في المشبه به أقوى"}],"grammarRule":"سر الجمال: التوضيح أو التشخيص أو التجسيم.","summary":"التشبيه البليغ ما حذفت منه الأداة ووجه الشبه.","practiceQuestions":[{"q":"حدد أركان التشبيه في: (الأمُ كالمدرسةِ في التربيةِ)؟","a":"المشبه: الأم، الأداة: الكاف، المشبه به: المدرسة، وجه الشبه: التربية."}]}'::jsonb, TRUE, 'بلاغة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000014', 'b1000000-0000-0000-0000-000000000001', 'التعبير: المقالة', 'فن كتابة المقالة: العنوان والمقدمة والعرض والخاتمة وتوظيف الشواهد.', 4, '{"introduction":"المقالة قالب نثري يعرض فكرة بأسلوب يجمع الإقناع والإمتاع.","mainText":"عناصر المقالة: عنوان جذاب، مقدمة ممهدة، عرض مترابط بالأدلة، خاتمة مركزة.","vocabulary":[{"word":"الشواهد","meaning":"الأدلة من القرآن والحديث والشعر والحكم"}],"grammarRule":"أدوات الربط: (فضلاً عن، بناء عليه، علاوة على ذلك) لتماسك النص.","summary":"الكتابة الجيدة تبدأ من تنظيم الفكر.","practiceQuestions":[{"q":"ما شروط الخاتمة الناجحة؟","a":"الإيجاز وتلخيص الفكرة وترك أثر في نفس القارئ."}]}'::jsonb, TRUE, 'تعبير', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- الوحدة 2 (6 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000021', 'b1000000-0000-0000-0000-000000000002', 'المطالعة: القدس روح فلسطين', 'نص يبرز مكانة القدس التاريخية والدينية وروح الصمود فيها.', 1, '{"introduction":"القدس زهرة المدائن: تاريخ عريق ومقدسات ورمز للصمود الفلسطيني.","mainText":"القدس ليست حجارة وأسواراً، بل روح أمة وهوية شعب وذاكرة تاريخ.","vocabulary":[{"word":"الروح","meaning":"جوهر الشيء وحقيقته النابضة"}],"grammarRule":"توظيف الوصف الحسي والمعنوي في إبراز قدسية المكان.","summary":"حب القدس عقيدة وانتماء وعمل.","practiceQuestions":[{"q":"لماذا وصفت القدس بأنها روح فلسطين؟","a":"لأنها قلبها النابض دينياً وتاريخياً ووجدانياً."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000022', 'b1000000-0000-0000-0000-000000000002', 'الشعر: مرثية بيت المقدس (الأبيوردي)', 'دراسة أبيات أبي المظفر الأبيوردي في رثاء بيت المقدس إبان المحن.', 2, '{"introduction":"الأبيوردي شاعر عباسي رثى بيت المقدس واستنهض الهمم لتحريره.","mainText":"مزج الدمع بالدم في رثاء المدينة المقدسة، واستنهاض للأمة.","vocabulary":[{"word":"المرثية","meaning":"شعر الرثاء والحزن على الفقيد أو المجد الضائع"}],"grammarRule":"العاطفة الدينية والحماسة: النداء والاستفهام الإنكاري.","summary":"الشعر ذاكرة الأمة وسلاح وعيها.","practiceQuestions":[{"q":"ما العاطفة المسيطرة على الشاعر؟","a":"الحزن على بيت المقدس والغضب واستنهاض الهمم."}]}'::jsonb, TRUE, 'شعر', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000023', 'b1000000-0000-0000-0000-000000000002', 'القواعد: الحال (2)', 'تتمة باب الحال: الحال الجملة وشروطها والروابط، وتعدد الحال.', 3, '{"introduction":"تأتي الحال جملة اسمية أو فعلية، ولها شروط وروابط.","mainText":"جاء الطالبُ وهو مبتسمٌ (جملة اسمية) · عاد الفريقُ يحمل الكأسَ (جملة فعلية)","vocabulary":[{"word":"الرابط","meaning":"ما يربط جملة الحال بصاحبها: الواو أو الضمير أو هما معاً"}],"grammarRule":"جملة الحال بعد معرفة، والجملة بعد النكرات صفات.","summary":"الجمل بعد المعارف أحوال وبعد النكرات صفات.","practiceQuestions":[{"q":"عين الحال في: (خرجنا والشمسُ مشرقةٌ)؟","a":"جملة (والشمس مشرقة) حال من الضمير (نا)."}]}'::jsonb, TRUE, 'قواعد', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000024', 'b1000000-0000-0000-0000-000000000002', 'العروض: الكتابة العروضية', 'قواعد الكتابة العروضية: ما يكتب وما لا يكتب عند التقطيع.', 4, '{"introduction":"الكتابة العروضية تسجيل المنطوق لا المرسوم الإملائي.","mainText":"يُكتب المنطوق: التنوين نوناً، والحرف المشدد حرفين، وتُحذف همزة الوصل وأل الشمسية.","vocabulary":[{"word":"التقطيع","meaning":"تجزئة البيت إلى مقاطع صوتية لمعرفة وزنه"}],"grammarRule":"كل ما يُنطق يُكتب، وما لا يُنطق لا يُكتب.","summary":"الكتابة العروضية أساس التقطيع الصحيح.","practiceQuestions":[{"q":"اكتب عروضياً: (والشمسُ مشرقةٌ)؟","a":"وَشْشَمْسُ مُشْرِقَتُنْ."}]}'::jsonb, TRUE, 'عروض', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000025', 'b1000000-0000-0000-0000-000000000002', 'الإملاء: التاء المفتوحة والمربوطة والهاء', 'التمييز بين التاء المربوطة والمفتوحة والهاء، ودخول حروف الجر على المعرف بأل.', 5, '{"introduction":"أخطاء التاء والهاء من أكثر الأخطاء الإملائية شيوعاً.","mainText":"التاء المربوطة تنطق هاء عند الوقف (مدرسة)، والمفتوحة تبقى تاء (بيت)، والهاء ضمير أو أصلية (وجهه، الله).","vocabulary":[{"word":"التاء المربوطة","meaning":"تلحق الأسماء المؤنثة وتنطق هاء وقفاً"}],"grammarRule":"عند دخول حرف الجر على (ال): للَّهِ أصلها (لـ + ال + له).","summary":"اختبار الوقف يميز التاء المربوطة من الهاء.","practiceQuestions":[{"q":"علل كتابة التاء مربوطة في (فلسطينية) ومفتوحة في (أصوات)؟","a":"فلسطينية: مفرد مؤنث. أصوات: جمع تكسير مفرده ساكن الوسط (صوت)."}]}'::jsonb, TRUE, 'إملاء', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000026', 'b1000000-0000-0000-0000-000000000002', 'التعبير: كتابة مقالة', 'تطبيق عملي: كتابة مقالة عن القدس بعناصرها الكاملة.', 6, '{"introduction":"نوظف ما تعلمناه في المقالة لكتابة نص عن القدس.","mainText":"مقدمة تعريفية، عرض بالأدلة والشواهد، خاتمة تدعو للعمل والوفاء.","vocabulary":[{"word":"المقدمة الممهدة","meaning":"تمهيد يجذب القارئ ويعلن الفكرة"}],"grammarRule":"توظيف التشبيه والاستعارة في الوصف.","summary":"الكتابة عن القدس وفاء بالكلمة.","practiceQuestions":[{"q":"اقترح عنواناً جذاباً لمقالة عن القدس؟","a":"إجابات متنوعة: (القدس.. البوصلة والروح)."}]}'::jsonb, TRUE, 'تعبير', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- الوحدة 3 (5 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000031', 'b1000000-0000-0000-0000-000000000003', 'المطالعة: السلامة المهنية', 'مفهوم السلامة المهنية وإجراءات الوقاية في بيئة العمل.', 1, '{"introduction":"السلامة المهنية علم يحمي الإنسان والممتلكات من المخاطر.","mainText":"الوقاية خير من العلاج: وسائل الحماية، لافتات التحذير، التدريب المستمر.","vocabulary":[{"word":"المخاطر المهنية","meaning":"كل ما يهدد سلامة العامل أثناء العمل"}],"grammarRule":"أسلوب الأمر والنصح والإرشاد في النصوص التوجيهية.","summary":"سلامتك مسؤوليتك أولاً.","practiceQuestions":[{"q":"عدد ثلاث وسائل للسلامة المهنية؟","a":"الخوذة، القفازات، لافتات التحذير، التدريب."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000032', 'b1000000-0000-0000-0000-000000000003', 'الشعر: مرارة أب', 'قصيدة تجسد معاناة الأب وكفاحه من أجل أسرته.', 2, '{"introduction":"قصيدة إنسانية تصور تضحية الآباء ومرارة العيش الكريم.","mainText":"الأب شمعة تحترق لتضيء دروب الأبناء.","vocabulary":[{"word":"المرارة","meaning":"شدة العناء وقسوة التجربة"}],"grammarRule":"الصور الحسية في التعبير عن المعاناة.","summary":"بر الوالدين دين ووفاء.","practiceQuestions":[{"q":"ما الفكرة الرئيسة في القصيدة؟","a":"تضحية الأب ومعاناته في سبيل أسرته."}]}'::jsonb, TRUE, 'شعر', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000033', 'b1000000-0000-0000-0000-000000000003', 'القواعد: النداء (1)', 'أسلوب النداء: أدواته، والمنادى المفرد العلم والنكرة المقصودة.', 3, '{"introduction":"النداء طلب الإقبال بحرف نائب عن فعل (أنادي).","mainText":"أدوات النداء: الهمزة وأي للقريب، أيا وهيا للبعيد، يا للكل. المنادى المفرد العلم والنكرة المقصودة يُبنيان على ما يُرفعان به.","vocabulary":[{"word":"المنادى","meaning":"الاسم المطلوب إقباله بعد حرف النداء"}],"grammarRule":"يا محمدُ (مبني على الضم)، يا طالبُ (نكرة مقصودة مبنية على الضم).","summary":"النداء أسلوب إنشائي طلبي.","practiceQuestions":[{"q":"أعرب: (يا فلسطينُ)؟","a":"يا: حرف نداء، فلسطينُ: منادى مفرد علم مبني على الضم."}]}'::jsonb, TRUE, 'قواعد', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000034', 'b1000000-0000-0000-0000-000000000003', 'البلاغة: التشبيه (2)', 'تتمة التشبيه: أغراضه وسر جماله ومواضع الإبداع فيه.', 4, '{"introduction":"للتشبيه أغراض بلاغية تتجاوز التوضيح إلى التأثير الوجداني.","mainText":"أغراض التشبيه: التوضيح، المبالغة، التصوير، التجميل أو التقبيح.","vocabulary":[{"word":"التجسيم","meaning":"تصوير المعنوي بصورة مادية محسوسة"}],"grammarRule":"كلما كان وجه الشبه بعيداً كان التشبيه أبدع.","summary":"التشبيه المبدع يكشف عن خيال الأديب.","practiceQuestions":[{"q":"بين سر الجمال في: (العلم في الصدور كالنقش في الحجر)؟","a":"التوضيح والمبالغة في الثبات والرسوخ."}]}'::jsonb, TRUE, 'بلاغة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000035', 'b1000000-0000-0000-0000-000000000003', 'التعبير: كتابة كلمة وإلقاؤها', 'فن كتابة الكلمة الخطابية وإلقائها: الوقفة والنبرة ولغة الجسد.', 5, '{"introduction":"الكلمة الملقاة فن يجمع حسن الكتابة وحسن الأداء.","mainText":"خطوات: تحية، مقدمة، عرض مرتب، خاتمة مؤثرة. الإلقاء: وضوح الصوت، الوقفات، التواصل البصري.","vocabulary":[{"word":"الخطابة","meaning":"فن مخاطبة الجمهور للتأثير والإقناع"}],"grammarRule":"أساليب التوكيد والنداء والاستفهام في الخطاب.","summary":"الكلمة الصادقة تصنع الموقف.","practiceQuestions":[{"q":"ما شروط الإلقاء الجيد؟","a":"وضوح الصوت، الوقفات المناسبة، الثقة، التواصل البصري."}]}'::jsonb, TRUE, 'تعبير', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- الوحدة 4 (5 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000041', 'b1000000-0000-0000-0000-000000000004', 'المطالعة: ساحة الحناطير', 'نص يصور الحياة الشعبية الفلسطينية وساحة الحناطير ذاكرة المكان.', 1, '{"introduction":"ساحة الحناطير في غزة ذاكرة مكان ونبض حياة شعبية أصيلة.","mainText":"المكان ذاكرة: الحناطير والعربات وحكايات الباعة والمارة.","vocabulary":[{"word":"الحناطير","meaning":"عربات تجرها الخيول لنقل الناس والبضائع"}],"grammarRule":"الوصف الحسي المتحرك في السرد.","summary":"المكان الفلسطيني هوية لا تمحى.","practiceQuestions":[{"q":"ما دلالة اهتمام الكاتب بساحة الحناطير؟","a":"توثيق الذاكرة الشعبية والحفاظ على الهوية."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000042', 'b1000000-0000-0000-0000-000000000004', 'القواعد: النداء (2)', 'تتمة النداء: المنادى المضاف والشبيه بالمضاف والنكرة غير المقصودة وحكمها النصب.', 2, '{"introduction":"المنادى المعرب منصوب: المضاف والشبيه بالمضاف والنكرة غير المقصودة.","mainText":"يا طالبَ العلمِ (مضاف منصوب) · يا مسافراً (نكرة غير مقصودة منصوبة)","vocabulary":[{"word":"الشبيه بالمضاف","meaning":"ما اتصل به شيء يتمم معناه كالجار والمجرور أو الفاعل"}],"grammarRule":"المنادى المبني: المفرد العلم والنكرة المقصودة. المعرب: ما سواهما.","summary":"اضبط المنادى تعرف نوعه.","practiceQuestions":[{"q":"أعرب: (يا حارسَ المدرسةِ)؟","a":"منادى مضاف منصوب بالفتحة."}]}'::jsonb, TRUE, 'قواعد', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000043', 'b1000000-0000-0000-0000-000000000004', 'العروض: المقاطع الصوتية', 'المقاطع الصوتية: الأسباب والأوتاد والفواصل وأنواعها.', 3, '{"introduction":"المقطع الصوتي وحدة النطق: متحرك وساكن.","mainText":"السبب الخفيف (مُتْ)، السبب الثقيل (مُتَ)، الوتد المجموع (مُتَنْ)، الوتد المفروق (مَاْتِ).","vocabulary":[{"word":"السبب","meaning":"حرفان: متحرك فساكن (خفيف) أو متحركان (ثقيل)"}],"grammarRule":"من المقاطع تُبنى التفعيلات ومنها البحور.","summary":"المقاطع لبنات الإيقاع الشعري.","practiceQuestions":[{"q":"قطّع عروضياً: (قُمْ)؟","a":"سبب خفيف: متحرك فساكن."}]}'::jsonb, TRUE, 'عروض', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000044', 'b1000000-0000-0000-0000-000000000004', 'الإملاء: همزة ابن وابنة والحروف المحذوفة', 'متى تحذف همزة ابن وابنة، والحروف المحذوفة في الكتابة (الألف والواو).', 4, '{"introduction":"همزة (ابن) وصل تحذف في مواضع، وتثبت في أخرى.","mainText":"تحذف همزة ابن إذا وقعت بين علمين مذكرين والثاني أب للأول (عمر بن الخطاب)، وتثبت في أول السطر وفي الخبر. تحذف ألف (هذا، هذه، هؤلاء) وواو (عمرو) نطقاً لا كتابة أو العكس.","vocabulary":[{"word":"همزة الوصل","meaning":"تسقط نطقاً في الوصل وتثبت في الابتداء"}],"grammarRule":"شرط حذف همزة ابن: بين علمين، الثاني أب، في سطر واحد، بلا فاصل.","summary":"رسم الكلمة يحفظ تاريخ اللغة.","practiceQuestions":[{"q":"علل حذف همزة (ابن) في: (خالد بن الوليد)؟","a":"وقعت بين علمين مذكرين والثاني أب للأول في سطر واحد."}]}'::jsonb, TRUE, 'إملاء', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000045', 'b1000000-0000-0000-0000-000000000004', 'التعبير: كتابة كلمة عن يوم النكبة', 'كتابة كلمة خطابية عن النكبة: الفكرة والشاهد والخاتمة المؤثرة.', 5, '{"introduction":"النكبة جرح الذاكرة الفلسطينية: 1948 والتهجير.","mainText":"الكلمة: تذكير بالحدث، سرد الشواهد، دعوة للثبات وحفظ الحق.","vocabulary":[{"word":"النكبة","meaning":"كارثة احتلال فلسطين وتشريد أهلها عام 1948"}],"grammarRule":"توظيف النداء والاستفهام والتوكيد في الخطاب.","summary":"الكلمة توثيق وموقف.","practiceQuestions":[{"q":"ما عناصر الكلمة عن النكبة؟","a":"مقدمة، عرض بالشواهد، خاتمة تدعو للثبات."}]}'::jsonb, TRUE, 'تعبير', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- الوحدة 5 (4 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000051', 'b1000000-0000-0000-0000-000000000005', 'المطالعة: شجرة التين', 'نص عن شجرة التين رمز الأرض والعطاء والجذور الفلسطينية.', 1, '{"introduction":"التينة شجرة فلسطينية أصيلة: ظل وثمر وجذور ضاربة.","mainText":"الشجرة رمز الجذور والانتماء والعطاء الصامت.","vocabulary":[{"word":"الجذور","meaning":"الأصول الراسخة في الأرض والتاريخ"}],"grammarRule":"الرمزية في النص الأدبي: الشجرة = الوطن.","summary":"من له جذور لا تقتلعه الرياح.","practiceQuestions":[{"q":"ما رمزية شجرة التين في النص؟","a":"الأرض والجذور والانتماء والعطاء."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000052', 'b1000000-0000-0000-0000-000000000005', 'الشعر: أغنية ريفية', 'قصيدة تغني بالريف الفلسطيني وجماله وبساطته.', 2, '{"introduction":"الريف الفلسطيني: زيتون وتين وحقول ومواويل.","mainText":"القصيدة لوحة غنائية للطبيعة والحياة البسيطة.","vocabulary":[{"word":"الموال","meaning":"غناء شعبي يعبر عن الوجدان"}],"grammarRule":"الموسيقى الداخلية: التكرار والجناس.","summary":"الريف روح فلسطين الخضراء.","practiceQuestions":[{"q":"ما مظاهر حب الشاعر للريف؟","a":"وصف طبيعته والغناء لها والحنين إليها."}]}'::jsonb, TRUE, 'شعر', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000053', 'b1000000-0000-0000-0000-000000000005', 'القواعد: اسما الزمان والمكان', 'صياغتهما من الثلاثي وغير الثلاثي وأوزانهما (مَفْعَل ومَفْعِل).', 3, '{"introduction":"اسما الزمان والمكان مشتقان يدلان على زمن الحدث أو مكانه.","mainText":"من الثلاثي: مَفْعَل (ملعب) ومَفْعِل (مجلس). من غير الثلاثي: ميم مضمومة وفتح ما قبل الآخر (مُستشفى).","vocabulary":[{"word":"المشتق","meaning":"اسم مأخوذ من الفعل يدل على معنى وصاحبه"}],"grammarRule":"يُصاغان من الثلاثي على وزنين، ومن غير الثلاثي بوزن اسم المفعول.","summary":"الوزن يكشف المعنى.","practiceQuestions":[{"q":"صغ اسمي الزمان والمكان من (لعب، جلس)؟","a":"ملعب، مجلس."}]}'::jsonb, TRUE, 'قواعد', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000054', 'b1000000-0000-0000-0000-000000000005', 'التعبير: السيرة الذاتية', 'فن كتابة السيرة الذاتية: عناصرها وأسلوبها الموضوعي.', 4, '{"introduction":"السيرة الذاتية فن نثري يروي حياة شخصية بأسلوب موثق.","mainText":"العناصر: النشأة، التعليم، الأعمال، الصفات، الأثر. الأسلوب: الدقة والموضوعية والتوثيق.","vocabulary":[{"word":"السيرة","meaning":"سرد موثق لحياة شخصية وأعمالها"}],"grammarRule":"السرد بضمير الغائب والترتيب الزمني.","summary":"السيرة مرآة القدوة.","practiceQuestions":[{"q":"ما عناصر السيرة الذاتية؟","a":"النشأة والتعليم والأعمال والصفات والأثر."}]}'::jsonb, TRUE, 'تعبير', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- الوحدة 6 (4 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000061', 'b1000000-0000-0000-0000-000000000006', 'المطالعة: صلاح الدين الأيوبي', 'سيرة القائد صلاح الدين وتحرير القدس ودروس القيادة.', 1, '{"introduction":"صلاح الدين الأيوبي محرر القدس في حطين 1187م: عدل وشجاعة ووحدة.","mainText":"النصر ثمرة الإيمان والوحدة والإعداد وحسن القيادة.","vocabulary":[{"word":"حطين","meaning":"معركة فاصلة حرر بعدها صلاح الدين القدس"}],"grammarRule":"السرد التاريخي: الموضوعية والتوثيق والتحليل.","summary":"القدس تتحرر بالوحدة والإعداد.","practiceQuestions":[{"q":"ما عوامل نصر صلاح الدين؟","a":"الإيمان والوحدة والإعداد والعدل وحسن القيادة."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000062', 'b1000000-0000-0000-0000-000000000006', 'الشعر: بكائية إلى أبي فراس الحمداني', 'قصيدة في رثاء أبي فراس الحمداني شاعر البطولة والأسر.', 2, '{"introduction":"أبو فراس الحمداني شاعر أمير جمع السيف والقلم.","mainText":"البكائية: حزن على الفارس الشاعر وتمجيد لخصاله.","vocabulary":[{"word":"البكائية","meaning":"قصيدة رثاء وبكاء على الراحل"}],"grammarRule":"عاطفة الحزن والإعجاب: النداء والتكرار.","summary":"الرثاء وفاء للأعلام.","practiceQuestions":[{"q":"ما الصفات التي مجّدها الشاعر في أبي فراس؟","a":"الشجاعة والكرم والشاعرية والفروسية."}]}'::jsonb, TRUE, 'شعر', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000063', 'b1000000-0000-0000-0000-000000000006', 'الإملاء: الحروف المزيدة وعلامات الترقيم', 'ألف التفريق والواو المزيدة، وأهم علامات الترقيم ومواضعها.', 3, '{"introduction":"حروف تُكتب ولا تُنطق: ألف التفريق بعد واو الجماعة، وواو (عمرو).","mainText":"ألف التفريق: (كتبوا) تميز واو الجماعة عن الواو الأصلية. علامات الترقيم: النقطة، الفاصلة، النقطتان، علامتا الاستفهام والتعجب.","vocabulary":[{"word":"ألف التفريق","meaning":"ألف تُكتب بعد واو الجماعة ولا تُنطق"}],"grammarRule":"الفاصلة بين الجمل، والنقطتان بعد القول، والنقطة نهاية المعنى.","summary":"الترقيم يضبط الإيقاع والمعنى.","practiceQuestions":[{"q":"علل كتابة الألف في (لم يكتبوا)؟","a":"ألف التفريق بعد واو الجماعة."}]}'::jsonb, TRUE, 'إملاء', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000064', 'b1000000-0000-0000-0000-000000000006', 'التعبير: كتابة سيرة ذاتية', 'تطبيق: كتابة سيرة ذاتية لشخصية (صلاح الدين) بعناصرها.', 4, '{"introduction":"نكتب سيرة صلاح الدين موظفين عناصر السيرة.","mainText":"النشأة في تكريت، النشأة العلمية، توحيد مصر والشام، حطين وتحرير القدس، العدل والوفاة.","vocabulary":[{"word":"التوثيق","meaning":"ذكر المصادر والأدلة على الأحداث"}],"grammarRule":"الترتيب الزمني وضمير الغائب.","summary":"القدوة بالكتابة والعمل.","practiceQuestions":[{"q":"اكتب فقرة عن عدل صلاح الدين؟","a":"إجابات إبداعية متنوعة توثق المواقف."}]}'::jsonb, TRUE, 'تعبير', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- الوحدة 7 (3 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000071', 'b1000000-0000-0000-0000-000000000007', 'المطالعة: مستودع الذخائر', 'نص عن المخزون الثقافي واللغوي للأمة: لغتها وتاريخها.', 1, '{"introduction":"لغة الأمة مستودع ذخائرها: تاريخها وقيمها وعلومها.","mainText":"الحفاظ على اللغة حفاظ على الهوية والذاكرة.","vocabulary":[{"word":"الذخائر","meaning":"ما يُدخر من نفائس للقادم من الأيام"}],"grammarRule":"الاستعارة: اللغة مستودع يحفظ الكنوز.","summary":"لغتي هويتي.","practiceQuestions":[{"q":"ما ذخائر الأمة في النص؟","a":"لغتها وتاريخها وقيمها وآدابها."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000072', 'b1000000-0000-0000-0000-000000000007', 'القواعد: اسم الآلة', 'تعريفه وأوزانه القياسية (مِفْعَل، مِفْعال، مِفْعَلة) والسماعية.', 2, '{"introduction":"اسم الآلة مشتق يدل على الأداة التي يقع بها الفعل.","mainText":"الأوزان: مِفْعَل (مِبْرَد)، مِفْعال (مِفتاح)، مِفْعَلة (مِطرقة). سماعي: (قلم، سكين).","vocabulary":[{"word":"القياسي","meaning":"ما له قاعدة مطردة يُقاس عليها"}],"grammarRule":"يُصاغ غالباً من الفعل الثلاثي المتعدي.","summary":"الآلة وسيلة الإتقان.","practiceQuestions":[{"q":"صغ اسم الآلة من (برد، فتح)؟","a":"مِبْرَد، مِفتاح."}]}'::jsonb, TRUE, 'قواعد', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000073', 'b1000000-0000-0000-0000-000000000007', 'التعبير: محضر الاجتماع', 'فن كتابة محضر الاجتماع: عناصره وصياغته الرسمية.', 3, '{"introduction":"المحضر وثيقة رسمية توثق وقائع الاجتماع وقراراته.","mainText":"العناصر: التاريخ والمكان، الحاضرون، جدول الأعمال، المناقشات، القرارات، التوقيع.","vocabulary":[{"word":"المحضر","meaning":"سجل رسمي لوقائع اجتماع"}],"grammarRule":"الأسلوب الرسمي الموضوعي والدقة في الأرقام والأسماء.","summary":"التوثيق أمانة.","practiceQuestions":[{"q":"ما عناصر محضر الاجتماع؟","a":"الزمان والمكان والحاضرون والمناقشات والقرارات."}]}'::jsonb, TRUE, 'تعبير', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- الوحدة 8 (5 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000081', 'b1000000-0000-0000-0000-000000000008', 'المطالعة: كلمة شرف', 'نص عن قيمة الكلمة والوفاء بالعهد وشرف الموقف.', 1, '{"introduction":"كلمة الشرف عهد: الوفاء بها كرامة والنكوص عنها سقوط.","mainText":"الرجال مواقف وكلمات: الشرف في الصدق والوفاء.","vocabulary":[{"word":"الشرف","meaning":"الكرامة والمروءة والوفاء بالعهد"}],"grammarRule":"أسلوب القسم والتوكيد في النص.","summary":"كلمتك عنوانك.","practiceQuestions":[{"q":"ما الفكرة الرئيسة؟","a":"قيمة الوفاء بالكلمة والعهد."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000082', 'b1000000-0000-0000-0000-000000000008', 'القواعد: معاني زيادات الأفعال (1) — المزيد بحرف', 'أوزان المزيد بحرف (أفعل، فاعل، فعّل) ومعانيها.', 2, '{"introduction":"زيادة المبنى زيادة في المعنى: لكل وزن دلالاته.","mainText":"أفعل: التعدية (خرج/أخرج). فاعل: المشاركة (كاتب). فعّل: التكثير والمبالغة (قطّع).","vocabulary":[{"word":"المجرد","meaning":"ما خلت حروفه من الزوائد"},{"word":"المزيد","meaning":"ما لحقته حروف الزيادة"}],"grammarRule":"المشاركة والتعدية والتكثير أشهر المعاني.","summary":"الوزن مفتاح المعنى.","practiceQuestions":[{"q":"ما معنى الزيادة في (أخرج، شارك، علّم)؟","a":"التعدية، المشاركة، التكثير."}]}'::jsonb, TRUE, 'قواعد', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000083', 'b1000000-0000-0000-0000-000000000008', 'العروض: التفعيلات', 'التفعيلات العشر: أجزاء البحور وكيفية تشكلها من المقاطع.', 3, '{"introduction":"التفعيلة وحدة إيقاعية تتكون من أسباب وأوتاد.","mainText":"التفعيلات: فعولن، فاعلن، مفاعيلن، مستفعلن، فاعلاتن، متفاعلن، مفاعلتن، مفعولاتُ.","vocabulary":[{"word":"التفعيلة","meaning":"وحدة الوزن الشعري الأساسية"}],"grammarRule":"بتكرار التفعيلات تتكون البحور.","summary":"التفعيلة نبض القصيدة.","practiceQuestions":[{"q":"مما تتكون فعولن؟","a":"وتد مجموع + سبب خفيف."}]}'::jsonb, TRUE, 'عروض', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000084', 'b1000000-0000-0000-0000-000000000008', 'الإملاء: تطبيقات وخط الرقعة', 'تطبيقات إملائية شاملة وقواعد خط الرقعة.', 4, '{"introduction":"التطبيق محك القاعدة، والرقعة خط الحياة اليومية.","mainText":"مراجعة الهمزات والتاءات، وقواعد الرقعة: الطمس والاستقرار على السطر.","vocabulary":[{"word":"الطمس","meaning":"عدم إظهار بعض الحروف في الرقعة كالميم"}],"grammarRule":"الرقعة: تُطمس الميم والعين والغين والهاء الوسطية.","summary":"الخط الجميل أدب.","practiceQuestions":[{"q":"ما الحروف المطموسة في الرقعة؟","a":"الميم والعين والغين والهاء."}]}'::jsonb, TRUE, 'إملاء', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000085', 'b1000000-0000-0000-0000-000000000008', 'التعبير: كتابة محضر اجتماع', 'تطبيق عملي: صياغة محضر اجتماع صفي بعناصره الكاملة.', 5, '{"introduction":"نوظف قواعد المحضر في كتابة محضر حقيقي.","mainText":"نموذج تطبيقي: اجتماع اللجنة الثقافية الصفية.","vocabulary":[{"word":"جدول الأعمال","meaning":"الموضوعات المقرر مناقشتها"}],"grammarRule":"الدقة والموضوعية والرسمية.","summary":"الكتابة الرسمية مهارة حياتية.","practiceQuestions":[{"q":"صغ قراراً بصيغة رسمية؟","a":"قررت اللجنة بالإجماع..."}]}'::jsonb, TRUE, 'تعبير', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- الوحدة 9 (6 دروس)
INSERT INTO public.lessons (id, course_id, title, description, position, content, published, lesson_type, grade, term, status, is_locked, is_visible) VALUES
('d1000000-0000-0000-0000-000000000091', 'b1000000-0000-0000-0000-000000000009', 'المطالعة: سور عكا — تحدٍ وصمود', 'نص عن أسوار عكا وصمودها في وجه الغزاة عبر التاريخ.', 1, '{"introduction":"عكا قلعة الصمود: أسوارها صدت نابليون وحفظت الكرامة.","mainText":"الصمود صناعة: إيمان وتخطيط ووحدة وإرادة.","vocabulary":[{"word":"الصمود","meaning":"الثبات في وجه التحديات"}],"grammarRule":"السرد التاريخي البطولي.","summary":"عكا درس في التحدي.","practiceQuestions":[{"q":"ما دلالة صمود عكا؟","a":"أن الإرادة والوحدة تصنعان النصر."}]}'::jsonb, TRUE, 'مطالعة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000092', 'b1000000-0000-0000-0000-000000000009', 'الشعر: هنا باقون', 'قصيدة الثبات الفلسطيني: البقاء والصمود رغم الاقتلاع.', 2, '{"introduction":"هنا باقون: نشيد الثبات على الأرض والهوية.","mainText":"التكرار الدلالي (هنا) يرسخ التجذر والرفض للرحيل.","vocabulary":[{"word":"البقاء","meaning":"الثبات والاستمرار رغم المحن"}],"grammarRule":"التكرار والتوكيد في الشعر الوطني.","summary":"البقاء مقاومة.","practiceQuestions":[{"q":"ما دلالة تكرار (هنا)؟","a":"التجذر في الأرض ورفض الاقتلاع."}]}'::jsonb, TRUE, 'شعر', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000093', 'b1000000-0000-0000-0000-000000000009', 'القواعد: معاني زيادات الأفعال (2) — المزيد بحرفين أو أكثر', 'أوزان المزيد بحرفين (انفعل، افتعل، تفاعل، تفعّل، افعلّ) وبثلاثة (استفعل).', 3, '{"introduction":"تتمة الصرف: المزيد بحرفين أو ثلاثة ومعانيه.","mainText":"انفعل: المطاوعة (انكسر). افتعل: الاشتراك والاتخاذ (اجتمع). تفاعل: المشاركة (تقاتل). استفعل: الطلب (استغفر).","vocabulary":[{"word":"المطاوعة","meaning":"قبول أثر الفعل: كسرته فانكسر"}],"grammarRule":"معاني الأوزان تُستنبط من السياق.","summary":"الصرف مفتاح الدلالة.","practiceQuestions":[{"q":"ما معنى الزيادة في (انتصر، استعلم)؟","a":"المطاوعة/الاجتهاد، والطلب."}]}'::jsonb, TRUE, 'قواعد', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000094', 'b1000000-0000-0000-0000-000000000009', 'البلاغة: تدريبات عامة', 'مراجعة شاملة للتشبيه والاستعارة والمحسنات بتطبيقات عامة.', 4, '{"introduction":"مراجعة البيان والبديع قبل التقويم الختامي.","mainText":"تطبيقات على التشبيه بأنواعه والاستعارة بنوعيها والطباق والجناس.","vocabulary":[{"word":"التدريب","meaning":"التطبيق العملي لترسيخ القاعدة"}],"grammarRule":"التفريق بين التشبيه البليغ والاستعارة.","summary":"البلاغة ذوق وتدريب.","practiceQuestions":[{"q":"فرّق بين التشبيه البليغ والاستعارة؟","a":"البليغ يذكر الطرفين بلا أداة، والاستعارة تحذف أحدهما."}]}'::jsonb, TRUE, 'بلاغة', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000095', 'b1000000-0000-0000-0000-000000000009', 'الإملاء: الألف اللينة والهمزة المتوسطة', 'الألف اللينة في الأفعال والأسماء، ومراجعة الهمزة المتوسطة.', 5, '{"introduction":"الألف اللينة: قائمة أو مقصورة بحسب الأصل.","mainText":"في الأفعال: تُكتب ممدودة إن كان أصلها واواً (دعا)، ومقصورة إن كان أصلها ياء (رمى). في الأسماء فوق الثلاثية مقصورة غالباً (مستشفى).","vocabulary":[{"word":"الألف اللينة","meaning":"ألف ساكنة مفتوح ما قبلها: ا / ى"}],"grammarRule":"رد الكلمة إلى أصلها أو مضارعها لمعرفة رسم الألف.","summary":"الأصل يكشف الرسم.","practiceQuestions":[{"q":"علل كتابة الألف في (سعى، عصا)؟","a":"سعى: أصلها ياء (يسعى). عصا: ثلاثية أصل ألفها واو."}]}'::jsonb, TRUE, 'إملاء', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE),
('d1000000-0000-0000-0000-000000000096', 'b1000000-0000-0000-0000-000000000009', 'التقويم الذاتي والمشروع', 'تقويم ذاتي لمهارات الفصل ومشروع ختامي: مجلة لغوية أو بحث.', 6, '{"introduction":"التقويم مرآة التعلم: ماذا أتقنت؟ وما خطوتي القادمة؟","mainText":"بطاقة تقويم ذاتي + مشروع: مجلة صفية، أو بحث عن علم، أو إلقاء خطابي.","vocabulary":[{"word":"التقويم الذاتي","meaning":"حكم المتعلم على تعلمه بنفسه بموضوعية"}],"grammarRule":"معايير المشروع: الفكرة، والتنظيم، واللغة، والعرض.","summary":"التعلم رحلة لا محطة.","practiceQuestions":[{"q":"اقترح مشروعك الختامي؟","a":"مشاريع إبداعية متنوعة."}]}'::jsonb, TRUE, 'تقويم', 'الصف العاشر', 'الفصل الأول', 'published', FALSE, TRUE)
ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id, title=EXCLUDED.title, description=EXCLUDED.description, position=EXCLUDED.position, content=EXCLUDED.content, lesson_type=EXCLUDED.lesson_type, grade=EXCLUDED.grade, term=EXCLUDED.term;

-- تحديث أعداد الدروس للوحدات التسع
UPDATE public.courses SET lessons_count = sub.cnt FROM (SELECT course_id, COUNT(*) AS cnt FROM public.lessons WHERE course_id IN ('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000009') GROUP BY course_id) AS sub WHERE id = sub.course_id;

-- ====================================================================
-- 11. هيكل فارغ جاهز للصفين الثامن والتاسع (الفصل الأول)
-- حالة "empty" + مقفل: المعلم يملؤها من لوحة التحكم
-- ====================================================================
INSERT INTO public.courses (id, title, description, lessons_count, duration, color, icon, sort_order, published, grade, term, status, is_locked, is_visible)
VALUES
('b8000000-0000-0000-0000-000000000001', 'الوحدة الأولى (الصف الثامن)', 'وحدة فارغة — يعبّئها المعلم من لوحة التحكم: المطالعة والقواعد والبلاغة والتعبير.', 0, '—', '#2f7772', 'book-open', 1, TRUE, 'الصف الثامن', 'الفصل الأول', 'empty', TRUE, TRUE),
('b8000000-0000-0000-0000-000000000002', 'الوحدة الثانية (الصف الثامن)', 'وحدة فارغة — يعبّئها المعلم من لوحة التحكم.', 0, '—', '#8a508f', 'library', 2, TRUE, 'الصف الثامن', 'الفصل الأول', 'empty', TRUE, TRUE),
('b8000000-0000-0000-0000-000000000003', 'الوحدة الثالثة (الصف الثامن)', 'وحدة فارغة — يعبّئها المعلم من لوحة التحكم.', 0, '—', '#b7791f', 'pen-line', 3, TRUE, 'الصف الثامن', 'الفصل الأول', 'empty', TRUE, TRUE),
('b8000000-0000-0000-0000-000000000004', 'الوحدة الرابعة (الصف الثامن)', 'وحدة فارغة — يعبّئها المعلم من لوحة التحكم.', 0, '—', '#a85d3d', 'target', 4, TRUE, 'الصف الثامن', 'الفصل الأول', 'empty', TRUE, TRUE),
('b9000000-0000-0000-0000-000000000001', 'الوحدة الأولى (الصف التاسع)', 'وحدة فارغة — يعبّئها المعلم من لوحة التحكم: المطالعة والقواعد والبلاغة والتعبير.', 0, '—', '#2f7772', 'book-open', 1, TRUE, 'الصف التاسع', 'الفصل الأول', 'empty', TRUE, TRUE),
('b9000000-0000-0000-0000-000000000002', 'الوحدة الثانية (الصف التاسع)', 'وحدة فارغة — يعبّئها المعلم من لوحة التحكم.', 0, '—', '#8a508f', 'library', 2, TRUE, 'الصف التاسع', 'الفصل الأول', 'empty', TRUE, TRUE),
('b9000000-0000-0000-0000-000000000003', 'الوحدة الثالثة (الصف التاسع)', 'وحدة فارغة — يعبّئها المعلم من لوحة التحكم.', 0, '—', '#b7791f', 'pen-line', 3, TRUE, 'الصف التاسع', 'الفصل الأول', 'empty', TRUE, TRUE),
('b9000000-0000-0000-0000-000000000004', 'الوحدة الرابعة (الصف التاسع)', 'وحدة فارغة — يعبّئها المعلم من لوحة التحكم.', 0, '—', '#a85d3d', 'target', 4, TRUE, 'الصف التاسع', 'الفصل الأول', 'empty', TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET grade = EXCLUDED.grade, term = EXCLUDED.term, status = EXCLUDED.status;

-- ====================================================================
-- 12. اختبارات جاهزة للصف العاشر (ترتبط بالوحدات الجديدة)
-- المعلم يضيف أسئلتها من لوحة التحكم (باني الاختبارات)
-- ====================================================================
INSERT INTO public.assessments (id, course_id, title, description, unit_title, questions_count, duration, available_date, published, grade, term, is_visible)
VALUES
('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'اختبار الوحدة الأولى: الحال والتشبيه والمقالة', 'اختبار تفاعلي على دروس الوحدة الأولى للصف العاشر.', 'الوحدة الأولى: الكلمة مفتاح القلوب', 0, '20 دقيقة', CURRENT_DATE, TRUE, 'الصف العاشر', 'الفصل الأول', TRUE),
('e1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'اختبار الوحدة الثانية: الحال والكتابة العروضية والإملاء', 'اختبار تفاعلي على دروس الوحدة الثانية للصف العاشر.', 'الوحدة الثانية: القدس روح فلسطين', 0, '20 دقيقة', CURRENT_DATE, TRUE, 'الصف العاشر', 'الفصل الأول', TRUE),
('e1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'اختبار الوحدة الثالثة: النداء والتشبيه', 'اختبار تفاعلي على دروس الوحدة الثالثة للصف العاشر.', 'الوحدة الثالثة: السلامة المهنية', 0, '20 دقيقة', CURRENT_DATE, TRUE, 'الصف العاشر', 'الفصل الأول', TRUE)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, grade = EXCLUDED.grade, term = EXCLUDED.term;

-- تم بحمد الله — نفّذ هذا الملف كاملاً في Supabase SQL Editor
