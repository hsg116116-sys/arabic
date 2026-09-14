-- ====================================================================
-- منصة "أرض اللغة" — إضافة إعداد الفصل الدراسي + جدول الكتب المدرسية
-- ملف تزايدي آمن (لا يحذف أي بيانات موجودة) — ينفَّذ مرة واحدة على قاعدة البيانات الحية
-- ====================================================================

-- 1. إضافة عمود الفصل الدراسي إلى إعدادات المنصة (آمن: لا يكرر التنفيذ)
ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS semester TEXT NOT NULL DEFAULT 'الفصل الأول';

-- ضمان أن القيمة الحالية صحيحة
UPDATE public.platform_settings
SET semester = 'الفصل الأول'
WHERE semester IS NULL OR semester = '';

-- ====================================================================
-- 2. جدول الكتب المدرسية (Books)
-- ====================================================================
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

-- إدراج الكتب الأربعة (الصفان التاسع والعاشر × الفصلان الأول والثاني)
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