-- ====================================================================
-- منصة "أرض اللغة" — كتب الصف الثامن (الفصلان) + (تثبيت مسارات الكتب)
-- نفّذه مرة واحدة في Supabase SQL Editor
-- ملاحظة: ملف الفصل الثاني يُرفع من لوحة المعلم (صفحة الكتب) عند توفره
-- ====================================================================

INSERT INTO public.books (id, grade, term, title, cover_url, pdf_url, sort_order) VALUES
('book-8-term1', 'الصف الثامن', 'الفصل الأول', 'كتاب اللغة العربية - الصف الثامن · الفصل الأول', '/books/arabic-8-term1.jpg', '/books/arabic-8-term1.pdf', 0),
('book-8-term2', 'الصف الثامن', 'الفصل الثاني', 'كتاب اللغة العربية - الصف الثامن · الفصل الثاني', '/books/arabic-8-term2.jpg', '/books/arabic-8-term2.pdf', 5)
ON CONFLICT (id) DO UPDATE SET
    grade = EXCLUDED.grade,
    term = EXCLUDED.term,
    title = EXCLUDED.title,
    cover_url = EXCLUDED.cover_url,
    pdf_url = EXCLUDED.pdf_url;

-- تم بحمد الله
