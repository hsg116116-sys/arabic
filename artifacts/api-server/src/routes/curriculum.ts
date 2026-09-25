import { Router, type IRouter } from "express";
import { supabaseQuery } from "../lib/supabase";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ============================================================================
// منظومة المنهاج الكاملة: صفوف × فصول × وحدات × دروس × اختبارات + بوابات
// كل المسارات هنا تُرجع JSON خام (بدون Zod صارم) حتى لا تُفقد الحقول الجديدة.
// القراءات متسامحة مع قاعدة لم تُرقَّ بعد (try/select=* ثم قيم افتراضية).
// ============================================================================

const enc = (v: string | string[] | undefined): string =>
  encodeURIComponent(Array.isArray(v) ? v[0] ?? "" : v ?? "");

type Gate = {
  grade: string;
  term: string;
  unlocked_course_id: string | null;
  unlocked_lesson_id: string | null;
  unlocked_unit_order: number;
  note: string;
};

const DEFAULT_GATE: Gate = {
  grade: "",
  term: "",
  unlocked_course_id: null,
  unlocked_lesson_id: null,
  unlocked_unit_order: 99,
  note: "",
};

async function getGate(grade: string, term: string): Promise<Gate> {
  try {
    const { data } = await supabaseQuery<any[]>(
      `grade_gates?grade=eq.${enc(grade)}&term=eq.${enc(term)}&limit=1`,
    );
    const g = data?.[0];
    if (!g) return { ...DEFAULT_GATE, grade, term };
    return {
      grade: g.grade,
      term: g.term,
      unlocked_course_id: g.unlocked_course_id || null,
      unlocked_lesson_id: g.unlocked_lesson_id || null,
      unlocked_unit_order:
        typeof g.unlocked_unit_order === "number" ? g.unlocked_unit_order : 99,
      note: g.note || "",
    };
  } catch {
    return { ...DEFAULT_GATE, grade, term };
  }
}

/** جنس الطالب من بروفايله (طالب/طالبة) — null إن تعذر */
export async function getStudentGender(userId?: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await supabaseQuery<any[]>(`profiles?id=eq.${enc(userId)}&select=gender&limit=1`);
    const g = data?.[0]?.gender;
    return g === "طالب" || g === "طالبة" ? g : null;
  } catch {
    return null;
  }
}

/** هل فعّل الإداري تقسيم الطلاب والطالبات؟ (عام — للتوافق) */
export async function isSplitEnabled(): Promise<boolean> {
  try {
    const { data } = await supabaseQuery<any[]>("platform_settings?select=gender_split&limit=1");
    return data?.[0]?.gender_split === true;
  } catch {
    return false;
  }
}

/** هل هذا المحتوى ظاهر لهذا الطالب؟ (التقسيم يعمل فقط عند تفعيله) */
export function sectionVisible(section: string | undefined, gender: string | null, split: boolean): boolean {
  if (!split || !gender) return true;
  const s = section || "الجميع";
  return s === "الجميع" || s === gender;
}

/** خريطة التقسيم لكل صف: { 'الصف العاشر': true } — يُضبط من الإعدادات لكل صف لحاله */
export async function getSplitMap(): Promise<Record<string, boolean>> {
  try {
    const { data } = await supabaseQuery<any[]>("grade_settings?select=grade,gender_split&limit=20");
    const map: Record<string, boolean> = {};
    for (const g of data || []) {
      if (g.grade) map[g.grade] = g.gender_split === true;
    }
    return map;
  } catch {
    return {};
  }
}

/** بروفايل الطالب المختصر (الصف + الجنس) */
export async function getStudentProfile(userId?: string): Promise<{ grade: string; gender: string | null } | null> {
  if (!userId) return null;
  try {
    const { data } = await supabaseQuery<any[]>(`profiles?id=eq.${enc(userId)}&select=grade,gender&limit=1`);
    const p = data?.[0];
    if (!p) return null;
    return {
      grade: p.grade || "",
      gender: p.gender === "طالب" || p.gender === "طالبة" ? p.gender : null,
    };
  } catch {
    return null;
  }
}

/**
 * هل هذا العنصر ظاهر لهذا الطالب؟
 * - القسم "الجميع" ظاهر دائماً.
 * - القسم المحدد (طلاب/طالبات) يُطبَّق فقط إن كان الصف المعني مقسّماً، وإلا يراه الجميع.
 * - الصف المعني: صف العنصر نفسه، أو صف الطالب إن كان العنصر عاماً (grade = الجميع).
 */
export function itemVisible(
  itemGrade: string | undefined,
  itemSection: string | undefined,
  studentGrade: string,
  studentGender: string | null,
  splitMap: Record<string, boolean>,
): boolean {
  const section = itemSection || "الجميع";
  if (section === "الجميع") return true;
  const relevant = itemGrade && itemGrade !== "الجميع" ? itemGrade : studentGrade;
  if (splitMap[relevant] !== true) return true;
  if (!studentGender) return true;
  return section === studentGender;
}

function courseToJson(c: any) {
  return {
    id: c.id,
    title: c.title,
    description: c.description || "",
    lessons: c.lessons_count ?? 0,
    duration: c.duration || "",
    color: c.color || "#2e7d32",
    icon: c.icon || "book-open",
    sort_order: c.sort_order ?? 1,
    published: c.published !== false,
    grade: c.grade || "الصف العاشر",
    term: c.term || "الفصل الأول",
    coverUrl: c.cover_url || "",
    avatarUrl: c.avatar_url || "",
    status: c.status || "published",
    isLocked: !!c.is_locked,
    isVisible: c.is_visible !== false,
    section: c.section || "الجميع",
  };
}

function lessonToJson(l: any) {
  let images: any[] = [];
  try {
    images = Array.isArray(l.images) ? l.images : JSON.parse(l.images || "[]");
  } catch {
    images = [];
  }
  return {
    id: l.id,
    course_id: l.course_id,
    title: l.title,
    description: l.description || "",
    position: l.position ?? 1,
    content: l.content || {},
    published: l.published !== false,
    lessonType: l.lesson_type || "مطالعة",
    coverUrl: l.cover_url || "",
    images,
    htmlContent: l.html_content || "",
    htmlFileUrl: l.html_file_url || "",
    status: l.status || "published",
    isLocked: !!l.is_locked,
    isVisible: l.is_visible !== false,
    grade: l.grade || "الصف العاشر",
    term: l.term || "الفصل الأول",
  };
}

/** كتابة متسامحة: إن فشلت الحمولة الكاملة (أعمدة غير موجودة بعد) نعيد المحاولة بالحقول الأساسية */
async function tolerantWrite(
  table: string,
  method: "POST" | "PATCH",
  query: string,
  full: Record<string, any>,
  baseKeys: string[],
) {
  const attempt = await supabaseQuery(query || table, {
    method,
    body: method === "POST" ? [full] : full,
  });
  if (!attempt.error) return attempt;
  const msg = String(attempt.error || "");
  const missingColumn =
    msg.includes("column") || msg.includes("schema cache") || msg.includes("Could not find");
  if (!missingColumn) return attempt;
  const base: Record<string, any> = {};
  for (const k of baseKeys) if (full[k] !== undefined) base[k] = full[k];
  logger.warn({ table, msg }, "tolerantWrite fallback to base columns");
  return supabaseQuery(query || table, {
    method,
    body: method === "POST" ? [base] : base,
  });
}

const COURSE_BASE = ["title", "description", "lessons_count", "duration", "color", "icon", "sort_order", "published"];
const LESSON_BASE = ["course_id", "title", "description", "position", "content", "published"];
const ASSESSMENT_BASE = ["course_id", "title", "questions_count", "duration", "available_date", "published"];

// ───────────────────────────── إعدادات التقسيم لكل صف ─────────────────────────────
router.get("/curriculum/grade-settings", async (_req, res) => {
  try {
    const { data } = await supabaseQuery<any[]>("grade_settings?order=grade.asc&limit=20");
    res.json(
      (data || []).map((g) => ({ grade: g.grade, genderSplit: g.gender_split === true })),
    );
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/grade-settings failed");
    res.json([]);
  }
});

router.patch("/teacher/grade-settings", requireAdmin, async (req, res) => {
  try {
    const { grade, genderSplit } = req.body || {};
    if (!grade) {
      res.status(400).json({ error: "الصف مطلوب" });
      return;
    }
    const payload = { grade, gender_split: !!genderSplit, updated_at: new Date().toISOString() };
    const existing = await supabaseQuery<any[]>(`grade_settings?grade=eq.${enc(grade)}&limit=1`);
    if (existing.data?.[0]) {
      const r = await supabaseQuery(`grade_settings?grade=eq.${enc(grade)}`, { method: "PATCH", body: payload });
      if (r.error) throw new Error(String(r.error));
    } else {
      const r = await supabaseQuery("grade_settings", { method: "POST", body: [payload] });
      if (r.error) throw new Error(String(r.error));
    }
    res.json({ success: true, message: `تم ${payload.gender_split ? "تفعيل" : "إيقاف"} التقسيم ل${grade}!` });
  } catch (err: any) {
    logger.error({ err }, "PATCH /teacher/grade-settings failed");
    res.status(500).json({ error: "تعذر الحفظ — نفّذ ملف sql_curriculum_v5.sql أولاً" });
  }
});

// ───────────────────────────── الصفوف ─────────────────────────────
router.get("/curriculum/grades", async (_req, res) => {
  try {
    const { data } = await supabaseQuery<any[]>("grade_levels?order=sort_order.asc");
    if (data && data.length) {
      res.json(data.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sort_order ?? 1 })));
      return;
    }
  } catch (err) {
    logger.warn({ err }, "grade_levels missing, using defaults");
  }
  res.json([
    { id: "grade-8", name: "الصف الثامن", sortOrder: 1 },
    { id: "grade-9", name: "الصف التاسع", sortOrder: 2 },
    { id: "grade-10", name: "الصف العاشر", sortOrder: 3 },
  ]);
});

// ───────────────────────────── البوابات ─────────────────────────────
router.get("/curriculum/gates", async (req, res) => {
  try {
    const { grade, term } = req.query as { grade?: string; term?: string };
    let endpoint = "grade_gates?order=grade.asc";
    if (grade) endpoint += `&grade=eq.${enc(grade)}`;
    if (term) endpoint += `&term=eq.${enc(term)}`;
    const { data } = await supabaseQuery<any[]>(endpoint);
    res.json(
      (data || []).map((g) => ({
        grade: g.grade,
        term: g.term,
        unlockedCourseId: g.unlocked_course_id || null,
        unlockedLessonId: g.unlocked_lesson_id || null,
        unlockedUnitOrder: g.unlocked_unit_order ?? 99,
        note: g.note || "",
        updatedAt: g.updated_at || null,
      })),
    );
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/gates failed");
    res.json([]);
  }
});

/** حفظ بوابة "آخر ما وصلنا" — upsert متسامح */
router.patch("/teacher/gates", requireAdmin, async (req, res) => {
  try {
    const { grade, term, unlockedCourseId, unlockedLessonId, unlockedUnitOrder, note } = req.body || {};
    if (!grade || !term) {
      res.status(400).json({ error: "الصف والفصل مطلوبان" });
      return;
    }
    const payload: Record<string, any> = { grade, term, updated_at: new Date().toISOString() };
    if (unlockedCourseId !== undefined) payload.unlocked_course_id = unlockedCourseId || null;
    if (unlockedLessonId !== undefined) payload.unlocked_lesson_id = unlockedLessonId || null;
    if (unlockedUnitOrder !== undefined) payload.unlocked_unit_order = Number(unlockedUnitOrder) || 0;
    if (note !== undefined) payload.note = note;

    // هل الصف موجود؟
    const existing = await supabaseQuery<any[]>(
      `grade_gates?grade=eq.${enc(grade)}&term=eq.${enc(term)}&limit=1`,
    );
    if (existing.data?.[0]) {
      const r = await supabaseQuery(`grade_gates?grade=eq.${enc(grade)}&term=eq.${enc(term)}`, {
        method: "PATCH",
        body: payload,
      });
      if (r.error) throw new Error(String(r.error));
    } else {
      const r = await supabaseQuery("grade_gates", { method: "POST", body: [payload] });
      if (r.error) throw new Error(String(r.error));
    }
    res.json({ success: true, message: "تم حفظ نقطة الوصول لطلاب هذا الصف بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH /teacher/gates failed");
    res.status(500).json({ error: "تعذر حفظ البوابة — نفّذ ملف sql_curriculum_v2.sql أولاً" });
  }
});

// ───────────────────────────── الوحدات ─────────────────────────────
router.get("/curriculum/courses", async (req, res) => {
  try {
    const { grade, term, student, progress } = req.query as {
      grade?: string;
      term?: string;
      student?: string;
      progress?: string;
    };
    let endpoint = "courses?order=sort_order.asc&limit=200";
    if (grade) endpoint += `&grade=eq.${enc(grade)}`;
    if (term) endpoint += `&term=eq.${enc(term)}`;
    const { data } = await supabaseQuery<any[]>(endpoint);
    let courses = (data || []).map(courseToJson);

    // فلترة الأقسام (طلاب/طالبات) — التقسيم لكل صف لحاله
    if (student === "1" && progress) {
      const [profile, splitMap] = await Promise.all([getStudentProfile(progress), getSplitMap()]);
      if (profile) {
        courses = courses.filter((c) => itemVisible(c.grade, c.section, profile.grade, profile.gender, splitMap));
      }
    }

    // تقدم الطالب (اختياري)
    let progressMap: Record<string, number> = {};
    if (progress) {
      try {
        const { data: cp } = await supabaseQuery<any[]>(
          `course_progress?user_id=eq.${enc(progress)}&select=course_id,progress&limit=500`,
        );
        for (const row of cp || []) progressMap[row.course_id] = row.progress || 0;
      } catch { /* تجاهل */ }
    }

    // بوابة الطالب: وسم المقفل (لا نحذف — الواجهة تعرض القفل)
    let gate: Gate | null = null;
    if (student === "1" && grade && term) gate = await getGate(grade, term);
    if (gate) {
      let cutoff = gate.unlocked_unit_order ?? 99;
      if (gate.unlocked_course_id) {
        const ref = courses.find((c) => c.id === gate!.unlocked_course_id);
        if (ref) cutoff = Math.min(cutoff, ref.sort_order);
      }
      courses = courses.map((c) => ({
        ...c,
        locked: c.isLocked || !c.isVisible || !c.published || c.sort_order > cutoff || c.status === "empty" ? c.sort_order > cutoff || c.isLocked || !c.isVisible : false,
        gateLocked: c.sort_order > cutoff,
        isEmpty: c.status === "empty" || c.lessons === 0,
      }));
    } else {
      courses = courses.map((c) => ({
        ...c,
        locked: c.isLocked,
        gateLocked: false,
        isEmpty: c.status === "empty" || c.lessons === 0,
      }));
    }

    res.json(courses.map((c) => ({ ...c, progress: progressMap[c.id] || 0 })));
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/courses failed");
    res.status(500).json({ error: "تعذر جلب الوحدات" });
  }
});

router.post("/teacher/curriculum/courses", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full = {
      title: b.title || "وحدة تعليمية جديدة",
      description: b.description || "",
      lessons_count: Number(b.lessons) || Number(b.lessons_count) || 0,
      duration: b.duration || "",
      color: b.color || "#2e7d32",
      icon: b.icon || "book-open",
      sort_order: Number(b.sortOrder) || Number(b.sort_order) || 1,
      published: b.published !== false,
      grade: b.grade || "الصف العاشر",
      term: b.term || "الفصل الأول",
      cover_url: b.coverUrl || b.cover_url || "",
      avatar_url: b.avatarUrl || b.avatar_url || "",
      status: b.status || "published",
      is_locked: !!b.isLocked,
      is_visible: b.isVisible !== false,
      section: b.section || "الجميع",
    };
    const r = await tolerantWrite("courses", "POST", "courses", full, COURSE_BASE);
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تمت إضافة الوحدة بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "POST /teacher/curriculum/courses failed");
    res.status(500).json({ error: "تعذر إنشاء الوحدة" });
  }
});

router.patch("/teacher/curriculum/courses/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) full.title = b.title;
    if (b.description !== undefined) full.description = b.description;
    if (b.lessons !== undefined || b.lessons_count !== undefined) full.lessons_count = Number(b.lessons ?? b.lessons_count) || 0;
    if (b.duration !== undefined) full.duration = b.duration;
    if (b.color !== undefined) full.color = b.color;
    if (b.icon !== undefined) full.icon = b.icon;
    if (b.sortOrder !== undefined || b.sort_order !== undefined) full.sort_order = Number(b.sortOrder ?? b.sort_order) || 1;
    if (b.published !== undefined) full.published = !!b.published;
    if (b.grade !== undefined) full.grade = b.grade;
    if (b.term !== undefined) full.term = b.term;
    if (b.coverUrl !== undefined || b.cover_url !== undefined) full.cover_url = b.coverUrl ?? b.cover_url ?? "";
    if (b.avatarUrl !== undefined || b.avatar_url !== undefined) full.avatar_url = b.avatarUrl ?? b.avatar_url ?? "";
    if (b.status !== undefined) full.status = b.status;
    if (b.isLocked !== undefined || b.is_locked !== undefined) full.is_locked = !!(b.isLocked ?? b.is_locked);
    if (b.isVisible !== undefined || b.is_visible !== undefined) full.is_visible = (b.isVisible ?? b.is_visible) !== false;
    if (b.section !== undefined) full.section = b.section || "الجميع";
    const r = await tolerantWrite("courses", "PATCH", `courses?id=eq.${enc(req.params.id)}`, full, [...COURSE_BASE]);
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حفظ الوحدة بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH /teacher/curriculum/courses failed");
    res.status(500).json({ error: "تعذر حفظ الوحدة" });
  }
});

router.delete("/teacher/curriculum/courses/:id", requireAdmin, async (req, res) => {
  try {
    const r = await supabaseQuery(`courses?id=eq.${enc(req.params.id)}`, { method: "DELETE" });
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حذف الوحدة ودروسها!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE course failed");
    res.status(500).json({ error: "تعذر حذف الوحدة" });
  }
});

// ───────────────────────────── درس واحد ─────────────────────────────
router.get("/curriculum/lessons/:id", async (req, res) => {
  try {
    const { data } = await supabaseQuery<any[]>(`lessons?id=eq.${enc(req.params.id)}&limit=1`);
    if (!data?.[0]) {
      res.status(404).json({ error: "الدرس غير موجود" });
      return;
    }
    res.json(lessonToJson(data[0]));
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/lessons/:id failed");
    res.status(500).json({ error: "تعذر جلب الدرس" });
  }
});

// ───────────────────────────── الدروس ─────────────────────────────
router.get("/curriculum/courses/:id/lessons", async (req, res) => {
  try {
    const courseId = req.params.id;
    const { student } = req.query as { student?: string };
    const { data: courseData } = await supabaseQuery<any[]>(`courses?id=eq.${enc(courseId)}&limit=1`);
    const course = courseData?.[0];
    const { data } = await supabaseQuery<any[]>(`lessons?course_id=eq.${enc(courseId)}&order=position.asc&limit=200`);
    let lessons = (data || []).map(lessonToJson);

    if (student === "1" && course) {
      const gate = await getGate(course.grade || "الصف العاشر", course.term || "الفصل الأول");
      let cutoff = gate.unlocked_unit_order ?? 99;
      if (gate.unlocked_course_id) {
        const { data: refData } = await supabaseQuery<any[]>(`courses?id=eq.${enc(gate.unlocked_course_id)}&limit=1`);
        const refOrder = refData?.[0]?.sort_order;
        if (typeof refOrder === "number") cutoff = Math.min(cutoff, refOrder);
      }
      const courseLocked = (course.sort_order ?? 1) > cutoff;
      let lessonCutoff = 9999;
      if (gate.unlocked_lesson_id && gate.unlocked_course_id === courseId) {
        const ref = lessons.find((l) => l.id === gate.unlocked_lesson_id);
        if (ref) lessonCutoff = ref.position;
      }
      lessons = lessons.map((l) => {
        const locked = courseLocked || l.isLocked || !l.isVisible || l.position > lessonCutoff;
        return { ...l, locked, gateLocked: courseLocked || l.position > lessonCutoff, isEmpty: l.status === "empty" };
      });
    } else {
      lessons = lessons.map((l) => ({ ...l, locked: l.isLocked, gateLocked: false, isEmpty: l.status === "empty" }));
    }
    res.json(lessons);
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/courses/:id/lessons failed");
    res.status(500).json({ error: "تعذر جلب الدروس" });
  }
});

router.post("/teacher/curriculum/lessons", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.course_id && !b.courseId) {
      res.status(400).json({ error: "الوحدة مطلوبة للدرس" });
      return;
    }
    const full = {
      course_id: b.course_id || b.courseId,
      title: b.title || "درس جديد",
      description: b.description || "",
      position: Number(b.position) || 1,
      content: b.content || {},
      published: b.published !== false,
      lesson_type: b.lessonType || b.lesson_type || "مطالعة",
      cover_url: b.coverUrl || b.cover_url || "",
      images: b.images || [],
      html_content: b.htmlContent || b.html_content || "",
      html_file_url: b.htmlFileUrl || b.html_file_url || "",
      status: b.status || "published",
      is_locked: !!b.isLocked,
      is_visible: b.isVisible !== false,
      grade: b.grade || "الصف العاشر",
      term: b.term || "الفصل الأول",
    };
    const r = await tolerantWrite("lessons", "POST", "lessons?select=id", full, LESSON_BASE);
    if (r.error) throw new Error(String(r.error));
    let newLessonId: string | null = null;
    if (Array.isArray(r.data) && r.data[0]?.id) newLessonId = r.data[0].id;
    // حدّث عداد الدروس
    try {
      const { data } = await supabaseQuery<any[]>(`lessons?course_id=eq.${enc(full.course_id)}&select=id`);
      await supabaseQuery(`courses?id=eq.${enc(full.course_id)}`, { method: "PATCH", body: { lessons_count: (data || []).length } });
    } catch { /* تجاهل */ }
    res.json({ success: true, message: "تمت إضافة الدرس بنجاح!", id: newLessonId });
  } catch (err: any) {
    logger.error({ err }, "POST lesson failed");
    res.status(500).json({ error: "تعذر إنشاء الدرس" });
  }
});

router.patch("/teacher/curriculum/lessons/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = {};
    if (b.course_id !== undefined || b.courseId !== undefined) full.course_id = b.course_id || b.courseId;
    if (b.title !== undefined) full.title = b.title;
    if (b.description !== undefined) full.description = b.description;
    if (b.position !== undefined) full.position = Number(b.position) || 1;
    if (b.content !== undefined) full.content = b.content;
    if (b.published !== undefined) full.published = !!b.published;
    if (b.lessonType !== undefined || b.lesson_type !== undefined) full.lesson_type = b.lessonType || b.lesson_type;
    if (b.coverUrl !== undefined || b.cover_url !== undefined) full.cover_url = b.coverUrl ?? b.cover_url ?? "";
    if (b.images !== undefined) full.images = b.images;
    if (b.htmlContent !== undefined || b.html_content !== undefined) full.html_content = b.htmlContent ?? b.html_content ?? "";
    if (b.htmlFileUrl !== undefined || b.html_file_url !== undefined) full.html_file_url = b.htmlFileUrl ?? b.html_file_url ?? "";
    if (b.status !== undefined) full.status = b.status;
    if (b.isLocked !== undefined || b.is_locked !== undefined) full.is_locked = !!(b.isLocked ?? b.is_locked);
    if (b.isVisible !== undefined || b.is_visible !== undefined) full.is_visible = (b.isVisible ?? b.is_visible) !== false;
    if (b.grade !== undefined) full.grade = b.grade;
    if (b.term !== undefined) full.term = b.term;
    const r = await tolerantWrite("lessons", "PATCH", `lessons?id=eq.${enc(req.params.id)}`, full, LESSON_BASE);
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حفظ الدرس بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH lesson failed");
    res.status(500).json({ error: "تعذر حفظ الدرس" });
  }
});

router.delete("/teacher/curriculum/lessons/:id", requireAdmin, async (req, res) => {
  try {
    const r = await supabaseQuery(`lessons?id=eq.${enc(req.params.id)}`, { method: "DELETE" });
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حذف الدرس!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE lesson failed");
    res.status(500).json({ error: "تعذر حذف الدرس" });
  }
});

// ───────────────────────────── الاختبارات + باني الأسئلة ─────────────────────────────
router.get("/curriculum/assessments", async (req, res) => {
  try {
    const { grade, term, student, student_id } = req.query as { grade?: string; term?: string; student?: string; student_id?: string };
    let endpoint = "assessments?order=available_date.asc&limit=200";
    if (grade) endpoint += `&grade=eq.${enc(grade)}`;
    if (term) endpoint += `&term=eq.${enc(term)}`;
    const { data } = await supabaseQuery<any[]>(endpoint);
    // أسماء الدروس المرتبطة لعرضها في البطاقات
    const lessonIds = [...new Set((data || []).map((a) => a.lesson_id).filter(Boolean))];
    let lessonTitles: Record<string, string> = {};
    if (lessonIds.length) {
      try {
        const { data: lessons } = await supabaseQuery<any[]>(
          `lessons?id=in.(${lessonIds.map(enc).join(",")})&select=id,title&limit=200`,
        );
        for (const l of lessons || []) lessonTitles[l.id] = l.title;
      } catch { /* تجاهل */ }
    }
    // العدد الحقيقي من صفوف الأسئلة الفعلية (لا من الرقم المخزن — يمنع أي mismatch)
    let realCounts: Record<string, number> = {};
    try {
      const { data: allQ } = await supabaseQuery<any[]>("assessment_questions?select=assessment_id&limit=5000");
      for (const q of allQ || []) realCounts[q.assessment_id] = (realCounts[q.assessment_id] || 0) + 1;
    } catch { /* تجاهل */ }
    let list = (data || []).map((a) => ({
      id: a.id,
      courseId: a.course_id || null,
      lessonId: a.lesson_id || null,
      lessonTitle: (a.lesson_id && lessonTitles[a.lesson_id]) || "",
      title: a.title,
      description: a.description || "",
      unitTitle: a.unit_title || "",
      questions: realCounts[a.id] ?? a.questions_count ?? 0,
      duration: a.duration || "20 دقيقة",
      date: a.available_date || "",
      grade: a.grade || "الصف العاشر",
      term: a.term || "الفصل الأول",
      published: a.published !== false,
      isVisible: a.is_visible !== false,
      section: a.section || "الجميع",
    }));
    if (student === "1") list = list.filter((a) => a.published && a.isVisible);
    if (student_id) {
      const [profile, splitMap] = await Promise.all([getStudentProfile(student_id), getSplitMap()]);
      if (profile) list = list.filter((a) => itemVisible(a.grade, a.section, profile.grade, profile.gender, splitMap));
    }
    res.json(list);
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/assessments failed");
    res.status(500).json({ error: "تعذر جلب الاختبارات" });
  }
});

/** توليد أسئلة اختبار بالذكاء الاصطناعي من وصف المعلم */
router.post("/teacher/curriculum/assessments/generate", requireAdmin, async (req, res) => {
  try {
    const { prompt, count, level, grade, unitTitle, lessonTitle } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      res.status(400).json({ error: "اكتب وصفاً للاختبار أولاً (مثال: اختبار عن الحال وأنواعها)" });
      return;
    }
    const { generateQuestions, suggestExamMeta, PRESET_DURATIONS } = await import("../lib/ai");
    const { questions, provider, description, durationMinutes } = await generateQuestions({
      prompt: String(prompt).slice(0, 1000),
      count: count ? Number(count) : undefined,
      level: level || "متوسط",
      grade,
      unitTitle,
      lessonTitle,
    });
    const { suggestedTitle, suggestedDuration } = suggestExamMeta({
      prompt: String(prompt),
      lessonTitle,
      unitTitle,
      questionsCount: questions.length,
    });
    // مدة الذكاء نفسه (يحددها هو) — تُقرَّب لأقرب مدة جاهزة، وإلا التقدير التلقائي
    let finalDuration = suggestedDuration;
    if (durationMinutes && durationMinutes > 0) {
      const presets = [10, 15, 20, 30, 45, 60];
      const nearest = presets.reduce((a, b) => (Math.abs(b - durationMinutes) < Math.abs(a - durationMinutes) ? b : a));
      finalDuration = PRESET_DURATIONS[presets.indexOf(nearest)] || suggestedDuration;
    }
    const clean = (s?: string) => (s || "").replace(/^(المطالعة|الشعر|القواعد|البلاغة|العروض|الإملاء|التعبير|التقويم)\s*:\s*/, "").trim();
    const about = clean(lessonTitle) || clean(unitTitle) || String(prompt).slice(0, 60);
    const suggestedDescription =
      description ||
      `اختبار تفاعلي بمستوى ${level || "متوسط"} من ${questions.length} أسئلة حول ${about} — أجب عن الأسئلة وراجع الشروحات فور التسليم.`;
    res.json({ success: true, questions, provider, suggestedTitle, suggestedDuration: finalDuration, suggestedDescription, durations: PRESET_DURATIONS });
  } catch (err: any) {
    logger.error({ err }, "POST curriculum assessments/generate failed");
    res.status(500).json({ error: err?.message || "تعذر توليد الأسئلة" });
  }
});

/** إنشاء اختبار مع أسئلته دفعة واحدة */
router.post("/teacher/curriculum/assessments", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title) {
      res.status(400).json({ error: "عنوان الاختبار مطلوب" });
      return;
    }
    const full = {
      course_id: b.courseId || b.course_id || null,
      lesson_id: b.lessonId || b.lesson_id || null,
      title: b.title,
      description: b.description || "",
      unit_title: b.unitTitle || b.unit_title || "",
      questions_count: Array.isArray(b.questions) ? b.questions.length : Number(b.questions) || 0,
      duration: b.duration || "20 دقيقة",
      available_date: b.date || b.available_date || new Date().toISOString().split("T")[0],
      published: b.published !== false,
      grade: b.grade || "الصف العاشر",
      term: b.term || "الفصل الأول",
      is_visible: b.isVisible !== false,
      section: b.section || "الجميع",
    };
    const created = await tolerantWrite("assessments", "POST", "assessments?select=id", full, ASSESSMENT_BASE);
    if (created.error) throw new Error(String(created.error));
    let newId: string | null = null;
    if (Array.isArray(created.data) && created.data[0]?.id) newId = created.data[0].id;
    else {
      const { data } = await supabaseQuery<any[]>(
        `assessments?title=eq.${enc(full.title)}&order=created_at.desc&limit=1`,
      );
      newId = data?.[0]?.id || null;
    }
    const cleanQuestions = Array.isArray(b.questions)
      ? b.questions.filter((q: any) => q?.question?.trim() && Array.isArray(q.options) && q.options.filter((o: string) => String(o || "").trim()).length >= 2)
      : [];
    if (newId && cleanQuestions.length) {
      const rows = cleanQuestions.map((q: any, i: number) => ({
        assessment_id: newId,
        question: q.question,
        options: q.options || [],
        correct_answer: Number(q.correctAnswer ?? q.correct_answer ?? 0),
        explanation: q.explanation || "",
        position: Number(q.position) || i + 1,
      }));
      const qr = await supabaseQuery("assessment_questions", { method: "POST", body: rows });
      if (qr.error) throw new Error(String(qr.error));
      await supabaseQuery(`assessments?id=eq.${enc(newId)}`, { method: "PATCH", body: { questions_count: rows.length } });
    }
    res.json({ success: true, message: "تم إنشاء الاختبار وأسئلته بنجاح!", id: newId });
  } catch (err: any) {
    logger.error({ err }, "POST curriculum assessment failed");
    res.status(500).json({ error: "تعذر إنشاء الاختبار" });
  }
});

router.patch("/teacher/curriculum/assessments/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) full.title = b.title;
    if (b.description !== undefined) full.description = b.description;
    if (b.unitTitle !== undefined || b.unit_title !== undefined) full.unit_title = b.unitTitle ?? b.unit_title ?? "";
    if (b.courseId !== undefined || b.course_id !== undefined) full.course_id = b.courseId ?? b.course_id ?? null;
    if (b.lessonId !== undefined || b.lesson_id !== undefined) full.lesson_id = b.lessonId ?? b.lesson_id ?? null;
    if (b.duration !== undefined) full.duration = b.duration;
    if (b.date !== undefined || b.available_date !== undefined) full.available_date = b.date ?? b.available_date;
    if (b.published !== undefined) full.published = !!b.published;
    if (b.grade !== undefined) full.grade = b.grade;
    if (b.term !== undefined) full.term = b.term;
    if (b.isVisible !== undefined || b.is_visible !== undefined) full.is_visible = (b.isVisible ?? b.is_visible) !== false;
    if (b.section !== undefined) full.section = b.section || "الجميع";
    const r = await tolerantWrite("assessments", "PATCH", `assessments?id=eq.${enc(req.params.id)}`, full, [...ASSESSMENT_BASE]);
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حفظ الاختبار!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH curriculum assessment failed");
    res.status(500).json({ error: "تعذر حفظ الاختبار" });
  }
});

router.delete("/teacher/curriculum/assessments/:id", requireAdmin, async (req, res) => {
  try {
    const r = await supabaseQuery(`assessments?id=eq.${enc(req.params.id)}`, { method: "DELETE" });
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حذف الاختبار!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE curriculum assessment failed");
    res.status(500).json({ error: "تعذر حذف الاختبار" });
  }
});

router.get("/curriculum/assessments/:id/questions", async (req, res) => {
  try {
    const { data } = await supabaseQuery<any[]>(
      `assessment_questions?assessment_id=eq.${enc(req.params.id)}&order=position.asc&limit=200`,
    );
    res.json(
      (data || []).map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options || [],
        correctAnswer: q.correct_answer,
        explanation: q.explanation || "",
        position: q.position ?? 1,
      })),
    );
  } catch (err: any) {
    logger.error({ err }, "GET curriculum questions failed");
    res.status(500).json({ error: "تعذر جلب الأسئلة" });
  }
});

router.post("/teacher/curriculum/assessments/:id/questions", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.question || !Array.isArray(b.options) || b.options.length < 2) {
      res.status(400).json({ error: "السؤال وخياران على الأقل مطلوبان" });
      return;
    }
    const { data: existing } = await supabaseQuery<any[]>(
      `assessment_questions?assessment_id=eq.${enc(req.params.id)}&select=id`,
    );
    const row = {
      assessment_id: req.params.id,
      question: b.question,
      options: b.options,
      correct_answer: Number(b.correctAnswer ?? b.correct_answer ?? 0),
      explanation: b.explanation || "",
      position: Number(b.position) || (existing || []).length + 1,
    };
    const r = await supabaseQuery("assessment_questions", { method: "POST", body: [row] });
    if (r.error) throw new Error(String(r.error));
    await supabaseQuery(`assessments?id=eq.${enc(req.params.id)}`, {
      method: "PATCH",
      body: { questions_count: (existing || []).length + 1 },
    });
    res.json({ success: true, message: "تمت إضافة السؤال!" });
  } catch (err: any) {
    logger.error({ err }, "POST curriculum question failed");
    res.status(500).json({ error: "تعذر إضافة السؤال" });
  }
});

router.delete("/teacher/curriculum/questions/:id", requireAdmin, async (req, res) => {
  try {
    const { data: qrow } = await supabaseQuery<any[]>(
      `assessment_questions?id=eq.${enc(req.params.id)}&select=assessment_id&limit=1`,
    );
    const aid = qrow?.[0]?.assessment_id;
    const r = await supabaseQuery(`assessment_questions?id=eq.${enc(req.params.id)}`, { method: "DELETE" });
    if (r.error) throw new Error(String(r.error));
    if (aid) {
      const { data: rest } = await supabaseQuery<any[]>(`assessment_questions?assessment_id=eq.${enc(aid)}&select=id`);
      await supabaseQuery(`assessments?id=eq.${enc(aid)}`, { method: "PATCH", body: { questions_count: (rest || []).length } });
    }
    res.json({ success: true, message: "تم حذف السؤال!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE curriculum question failed");
    res.status(500).json({ error: "تعذر حذف السؤال" });
  }
});

// ───────────────────────────── الإعلانات (موجهة حسب الصف) ─────────────────────────────
function announcementToJson(a: any) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    date: new Date(a.published_at || a.created_at || Date.now()).toLocaleDateString("ar-EG", { month: "short", day: "numeric" }),
    type: a.announcement_type || "إرشاد",
    audience: a.audience || "الجميع",
    grade: a.grade || "الجميع",
    section: a.section || "الجميع",
    published: a.published !== false,
  };
}

// إعدادات عامة خام للواجهات (الفصل + مفتاح التقسيم) — بدون Zod صارم
router.get("/curriculum/settings", async (_req, res) => {
  try {
    const { data } = await supabaseQuery<any[]>("platform_settings?select=semester,gender_split&limit=1");
    res.json({
      semester: data?.[0]?.semester || "الفصل الأول",
      genderSplit: data?.[0]?.gender_split === true,
    });
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/settings failed");
    res.json({ semester: "الفصل الأول", genderSplit: false });
  }
});

router.get("/curriculum/announcements", async (req, res) => {
  try {
    const { grade, student_id } = req.query as { grade?: string; student_id?: string };
    const { data } = await supabaseQuery<any[]>("announcements?order=published_at.desc&limit=100");
    let list = (data || []).filter((a) => a.published !== false).map(announcementToJson);
    if (grade) list = list.filter((a) => a.grade === "الجميع" || a.grade === grade);
    if (student_id) {
      const [profile, splitMap] = await Promise.all([getStudentProfile(student_id), getSplitMap()]);
      if (profile) list = list.filter((a) => itemVisible(a.grade, a.section, profile.grade, profile.gender, splitMap));
    }
    res.json(list);
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/announcements failed");
    res.status(500).json({ error: "تعذر جلب الإعلانات" });
  }
});

router.post("/teacher/curriculum/announcements", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title || !b.body) {
      res.status(400).json({ error: "عنوان الإعلان ونصه مطلوبان" });
      return;
    }
    const full = {
      title: b.title,
      body: b.body,
      announcement_type: b.type || "إرشاد",
      audience: b.audience || "الجميع",
      grade: b.grade || "الجميع",
      section: b.section || "الجميع",
      published: b.published !== false,
      published_at: new Date().toISOString(),
    };
    const r = await tolerantWrite("announcements", "POST", "announcements", full, ["title", "body", "announcement_type", "audience", "published", "published_at"]);
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم نشر الإعلان بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "POST curriculum announcement failed");
    res.status(500).json({ error: "تعذر نشر الإعلان" });
  }
});

router.patch("/teacher/curriculum/announcements/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = {};
    if (b.title !== undefined) full.title = b.title;
    if (b.body !== undefined) full.body = b.body;
    if (b.type !== undefined) full.announcement_type = b.type;
    if (b.audience !== undefined) full.audience = b.audience;
    if (b.grade !== undefined) full.grade = b.grade;
    if (b.section !== undefined) full.section = b.section || "الجميع";
    if (b.published !== undefined) full.published = !!b.published;
    const r = await tolerantWrite("announcements", "PATCH", `announcements?id=eq.${enc(req.params.id)}`, full, ["title", "body", "announcement_type", "audience", "published"]);
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حفظ الإعلان!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH curriculum announcement failed");
    res.status(500).json({ error: "تعذر حفظ الإعلان" });
  }
});

router.delete("/teacher/curriculum/announcements/:id", requireAdmin, async (req, res) => {
  try {
    const r = await supabaseQuery(`announcements?id=eq.${enc(req.params.id)}`, { method: "DELETE" });
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حذف الإعلان!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE curriculum announcement failed");
    res.status(500).json({ error: "تعذر حذف الإعلان" });
  }
});

// ───────────────────────────── الواجبات (إدارة خام للمعلم) ─────────────────────────────
function assignmentToJson(a: any) {
  return {
    id: a.id,
    title: a.title,
    description: a.description || "",
    unit: a.unit || "",
    dueDate: a.due_date || "",
    points: a.points ?? 0,
    published: a.published !== false,
    grade: a.grade || "الجميع",
    section: a.section || "الجميع",
  };
}

router.get("/teacher/curriculum/assignments", requireAdmin, async (req, res) => {
  try {
    const { grade } = req.query as { grade?: string };
    let endpoint = "assignments?order=due_date.asc&limit=200";
    if (grade) endpoint += `&grade=eq.${enc(grade)}`;
    const { data, error } = await supabaseQuery<any[]>(endpoint);
    if (error) throw new Error(String(error));
    res.json((data || []).map(assignmentToJson));
  } catch (err: any) {
    logger.error({ err }, "GET teacher curriculum assignments failed");
    res.status(500).json({ error: "تعذر جلب الواجبات" });
  }
});

router.patch("/teacher/curriculum/assignments/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) full.title = b.title;
    if (b.description !== undefined) full.description = b.description;
    if (b.unit !== undefined) full.unit = b.unit;
    if (b.dueDate !== undefined || b.due_date !== undefined) full.due_date = b.dueDate ?? b.due_date ?? null;
    if (b.points !== undefined) full.points = Number(b.points) || 0;
    if (b.published !== undefined) full.published = !!b.published;
    if (b.grade !== undefined) full.grade = b.grade || "الجميع";
    if (b.section !== undefined) full.section = b.section || "الجميع";
    const base = ["title", "description", "unit", "due_date", "points", "published"];
    const r = await tolerantWrite("assignments", "PATCH", `assignments?id=eq.${enc(req.params.id)}`, full, base);
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حفظ الواجب!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH curriculum assignment failed");
    res.status(500).json({ error: "تعذر حفظ الواجب" });
  }
});

router.delete("/teacher/curriculum/assignments/:id", requireAdmin, async (req, res) => {
  try {
    const r = await supabaseQuery(`assignments?id=eq.${enc(req.params.id)}`, { method: "DELETE" });
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تم حذف الواجب!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE curriculum assignment failed");
    res.status(500).json({ error: "تعذر حذف الواجب" });
  }
});

export default router;
