-- ====================================================================
-- منصة "أرض اللغة" — تصحيح روابط وأغلفة الكتب (9/10) + تثبيت الثامن
-- شخّصنا بالفحص أن ملفي الفصل الأول كانا متبادلين — هذه الأوامر تثبت
-- الروابط الصحيحة في القاعدة أياً كانت حالتها الحالية.
-- نفّذه مرة واحدة في Supabase SQL Editor
-- ====================================================================

INSERT INTO public.books (id, grade, term, title, cover_url, pdf_url, sort_order) VALUES
('book-9-term1', 'الصف التاسع', 'الفصل الأول', 'كتاب اللغة العربية - الصف التاسع · الفصل الأول', '/books/arabic-9-term1.jpg', '/books/arabic-9-term1-v2.pdf', 1),
('book-10-term1', 'الصف العاشر', 'الفصل الأول', 'كتاب اللغة العربية - الصف العاشر · الفصل الأول', '/books/arabic-10-term1.jpg', '/books/arabic-10-term1-v2.pdf', 2),
('book-9-term2', 'الصف التاسع', 'الفصل الثاني', 'كتاب اللغة العربية - الصف التاسع · الفصل الثاني', '/books/arabic-9-term2.png', '/books/arabic-9-term2.pdf', 3),
('book-10-term2', 'الصف العاشر', 'الفصل الثاني', 'كتاب اللغة العربية - الصف العاشر · الفصل الثاني', '/books/arabic-10-term2.png', '/books/arabic-10-term2.pdf', 4),
('book-8-term1', 'الصف الثامن', 'الفصل الأول', 'كتاب اللغة العربية - الصف الثامن · الفصل الأول', '/books/arabic-8-term1.jpg', '/books/arabic-8-term1.pdf', 0),
('book-8-term2', 'الصف الثامن', 'الفصل الثاني', 'كتاب اللغة العربية - الصف الثامن · الفصل الثاني', '/books/arabic-8-term2.jpg', '/books/arabic-8-term2.pdf', 5)
ON CONFLICT (id) DO UPDATE SET
    grade = EXCLUDED.grade,
    term = EXCLUDED.term,
    title = EXCLUDED.title,
    cover_url = EXCLUDED.cover_url,
    pdf_url = EXCLUDED.pdf_url;

-- تحقق بعد التنفيذ: يجب أن ترى 6 صفوف بمسارات صحيحة
-- SELECT id, grade, term, pdf_url FROM public.books ORDER BY sort_order;
