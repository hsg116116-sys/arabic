import { Router, type IRouter } from "express";
import { supabaseQuery } from "../lib/supabase";
import { uploadFile } from "../lib/imagekit";
import { getStudentProfile, getSplitMap, itemVisible } from "./curriculum";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ============================================================================
// الملخصات + تكملة الدفتر (صور الدفاتر)
// يتطلب تنفيذ sql_curriculum_v3.sql — وبدونه تُرجع القوائم فارغة ورسالة واضحة
// ============================================================================

const enc = (v: string | string[] | undefined): string =>
  encodeURIComponent(Array.isArray(v) ? v[0] ?? "" : v ?? "");
const V3_HINT = "نفّذ ملف sql_curriculum_v3.sql في Supabase SQL Editor أولاً";

/* ---------------- الملخصات ---------------- */

function summaryToJson(s: any) {
  return {
    id: s.id,
    title: s.title,
    description: s.description || "",
    content: s.content || "",
    summaryType: s.summary_type || "ملخص",
    grade: s.grade || "الصف العاشر",
    term: s.term || "الفصل الأول",
    unitTitle: s.unit_title || "",
    courseId: s.course_id || null,
    coverUrl: s.cover_url || "",
    fileUrl: s.file_url || "",
    published: s.published !== false,
    sortOrder: s.sort_order ?? 1,
    section: s.section || "الجميع",
  };
}

router.get("/curriculum/summaries", async (req, res) => {
  try {
    const { grade, term, student_id } = req.query as { grade?: string; term?: string; student_id?: string };
    let endpoint = "summaries?order=sort_order.asc&limit=200";
    if (grade) endpoint += `&grade=eq.${enc(grade)}`;
    if (term) endpoint += `&term=eq.${enc(term)}`;
    const { data, error } = await supabaseQuery<any[]>(endpoint);
    if (error) throw new Error(String(error));
    let list = (data || []).filter((s) => s.published !== false).map(summaryToJson);
    if (student_id) {
      const [profile, splitMap] = await Promise.all([getStudentProfile(student_id), getSplitMap()]);
      if (profile) list = list.filter((s) => itemVisible(s.grade, s.section, profile.grade, profile.gender, splitMap));
    }
    res.json(list);
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/summaries failed");
    res.json([]);
  }
});

router.get("/teacher/curriculum/summaries", requireAdmin, async (req, res) => {
  try {
    const { grade, term } = req.query as { grade?: string; term?: string };
    let endpoint = "summaries?order=sort_order.asc&limit=200";
    if (grade) endpoint += `&grade=eq.${enc(grade)}`;
    if (term) endpoint += `&term=eq.${enc(term)}`;
    const { data, error } = await supabaseQuery<any[]>(endpoint);
    if (error) throw new Error(String(error));
    res.json((data || []).map(summaryToJson));
  } catch (err: any) {
    logger.error({ err }, "GET teacher summaries failed");
    res.status(500).json({ error: "تعذر جلب الملخصات — " + V3_HINT });
  }
});

router.post("/teacher/curriculum/summaries", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title) {
      res.status(400).json({ error: "عنوان الملخص مطلوب" });
      return;
    }
    const { error } = await supabaseQuery("summaries", {
      method: "POST",
      body: [{
        title: b.title,
        description: b.description || "",
        content: b.content || "",
        summary_type: b.summaryType || b.summary_type || "ملخص",
        grade: b.grade || "الصف العاشر",
        term: b.term || "الفصل الأول",
        unit_title: b.unitTitle || b.unit_title || "",
        course_id: b.courseId || b.course_id || null,
        cover_url: b.coverUrl || b.cover_url || "",
        file_url: b.fileUrl || b.file_url || "",
        section: b.section || "الجميع",
        published: b.published !== false,
        sort_order: Number(b.sortOrder ?? b.sort_order) || 1,
      }],
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تمت إضافة الملخص بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "POST summary failed");
    res.status(500).json({ error: "تعذر حفظ الملخص — " + V3_HINT });
  }
});

router.patch("/teacher/curriculum/summaries/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) full.title = b.title;
    if (b.description !== undefined) full.description = b.description;
    if (b.content !== undefined) full.content = b.content;
    if (b.summaryType !== undefined || b.summary_type !== undefined) full.summary_type = b.summaryType ?? b.summary_type;
    if (b.grade !== undefined) full.grade = b.grade;
    if (b.term !== undefined) full.term = b.term;
    if (b.unitTitle !== undefined || b.unit_title !== undefined) full.unit_title = b.unitTitle ?? b.unit_title ?? "";
    if (b.courseId !== undefined || b.course_id !== undefined) full.course_id = b.courseId ?? b.course_id ?? null;
    if (b.coverUrl !== undefined || b.cover_url !== undefined) full.cover_url = b.coverUrl ?? b.cover_url ?? "";
    if (b.fileUrl !== undefined || b.file_url !== undefined) full.file_url = b.fileUrl ?? b.file_url ?? "";
    if (b.section !== undefined) full.section = b.section || "الجميع";
    if (b.published !== undefined) full.published = !!b.published;
    if (b.sortOrder !== undefined || b.sort_order !== undefined) full.sort_order = Number(b.sortOrder ?? b.sort_order) || 1;
    const { error } = await supabaseQuery(`summaries?id=eq.${enc(req.params.id)}`, { method: "PATCH", body: full });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حفظ الملخص!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH summary failed");
    res.status(500).json({ error: "تعذر حفظ الملخص" });
  }
});

router.delete("/teacher/curriculum/summaries/:id", requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseQuery(`summaries?id=eq.${enc(req.params.id)}`, { method: "DELETE" });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حذف الملخص!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE summary failed");
    res.status(500).json({ error: "تعذر حذف الملخص" });
  }
});

/* ---------------- مهام تكملة الدفتر ---------------- */

/** أسماء الدروس المرتبطة بمهام معطاة */
async function lessonTitlesFor(ids: (string | null)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))] as string[];
  if (!uniq.length) return {};
  try {
    const { data } = await supabaseQuery<any[]>(
      `lessons?id=in.(${uniq.map(enc).join(",")})&select=id,title&limit=200`,
    );
    const map: Record<string, string> = {};
    for (const l of data || []) map[l.id] = l.title;
    return map;
  } catch {
    return {};
  }
}

function taskToJson(t: any, mySubmission?: any, lessonTitles: Record<string, string> = {}) {
  let requirements: any[] = [];
  try {
    requirements = Array.isArray(t.requirements) ? t.requirements : JSON.parse(t.requirements || "[]");
  } catch {
    requirements = [];
  }
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    grade: t.grade || "الصف العاشر",
    term: t.term || "الفصل الأول",
    unitTitle: t.unit_title || "",
    courseId: t.course_id || null,
    lessonId: t.lesson_id || null,
    lessonTitle: (t.lesson_id && lessonTitles[t.lesson_id]) || "",
    requirements,
    dueDate: t.due_date || "",
    points: t.points ?? 10,
    published: t.published !== false,
    section: t.section || "الجميع",
    myStatus: mySubmission?.status || null,
    myScore: mySubmission?.score ?? null,
    myFeedback: mySubmission?.feedback || "",
    submissionsCount: t.submissionsCount ?? undefined,
  };
}

router.get("/curriculum/notebooks", async (req, res) => {
  try {
    const { grade, term, student_id } = req.query as { grade?: string; term?: string; student_id?: string };
    let endpoint = "notebook_tasks?order=created_at.desc&limit=200";
    if (grade) endpoint += `&grade=eq.${enc(grade)}`;
    if (term) endpoint += `&term=eq.${enc(term)}`;
    const { data, error } = await supabaseQuery<any[]>(endpoint);
    if (error) throw new Error(String(error));
    let subs: Record<string, any> = {};
    let profile: { grade: string; gender: string | null } | null = null;
    let splitMap: Record<string, boolean> = {};
    if (student_id) {
      const ids = (data || []).map((t) => t.id);
      if (ids.length) {
        const { data: sdata } = await supabaseQuery<any[]>(
          `notebook_submissions?user_id=eq.${enc(student_id)}&select=task_id,status,score,feedback&limit=200`,
        );
        for (const s of sdata || []) subs[s.task_id] = s;
      }
      [profile, splitMap] = await Promise.all([getStudentProfile(student_id), getSplitMap()]);
    }
    const lessonTitles = await lessonTitlesFor((data || []).map((t) => t.lesson_id));
    let list = (data || []).filter((t) => t.published !== false).map((t) => taskToJson(t, subs[t.id], lessonTitles));
    if (profile) list = list.filter((t) => itemVisible(t.grade, t.section, profile!.grade, profile!.gender, splitMap));
    res.json(list);
  } catch (err: any) {
    logger.error({ err }, "GET /curriculum/notebooks failed");
    res.json([]);
  }
});

router.get("/teacher/curriculum/notebooks", requireAdmin, async (req, res) => {
  try {
    const { grade, term } = req.query as { grade?: string; term?: string };
    let endpoint = "notebook_tasks?order=created_at.desc&limit=200";
    if (grade) endpoint += `&grade=eq.${enc(grade)}`;
    if (term) endpoint += `&term=eq.${enc(term)}`;
    const { data, error } = await supabaseQuery<any[]>(endpoint);
    if (error) throw new Error(String(error));
    const { data: allSubs } = await supabaseQuery<any[]>("notebook_submissions?select=task_id&limit=2000");
    const counts: Record<string, number> = {};
    for (const s of allSubs || []) counts[s.task_id] = (counts[s.task_id] || 0) + 1;
    const lessonTitles = await lessonTitlesFor((data || []).map((t) => t.lesson_id));
    res.json((data || []).map((t) => ({ ...taskToJson(t, undefined, lessonTitles), submissionsCount: counts[t.id] || 0 })));
  } catch (err: any) {
    logger.error({ err }, "GET teacher notebooks failed");
    res.status(500).json({ error: "تعذر جلب مهام الدفتر — " + V3_HINT });
  }
});

router.post("/teacher/curriculum/notebooks", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title) {
      res.status(400).json({ error: "عنوان المهمة مطلوب" });
      return;
    }
    const requirements = Array.isArray(b.requirements)
      ? b.requirements.filter((r: any) => r?.label?.trim()).slice(0, 20).map((r: any) => ({
          label: String(r.label).slice(0, 200),
          kind: r.kind || "كتابة",
          place: String(r.place || "").slice(0, 120),
        }))
      : [];
    const { error } = await supabaseQuery("notebook_tasks", {
      method: "POST",
      body: [{
        title: b.title,
        description: b.description || "",
        grade: b.grade || "الصف العاشر",
        term: b.term || "الفصل الأول",
        unit_title: b.unitTitle || b.unit_title || "",
        course_id: b.courseId || b.course_id || null,
        lesson_id: b.lessonId || b.lesson_id || null,
        requirements,
        due_date: b.dueDate || b.due_date || null,
        points: Number(b.points) || 10,
        section: b.section || "الجميع",
        published: b.published !== false,
      }],
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم إنشاء مهمة الدفتر بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "POST notebook task failed");
    res.status(500).json({ error: "تعذر إنشاء المهمة — " + V3_HINT });
  }
});

router.patch("/teacher/curriculum/notebooks/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) full.title = b.title;
    if (b.description !== undefined) full.description = b.description;
    if (b.grade !== undefined) full.grade = b.grade;
    if (b.term !== undefined) full.term = b.term;
    if (b.unitTitle !== undefined || b.unit_title !== undefined) full.unit_title = b.unitTitle ?? b.unit_title ?? "";
    if (b.courseId !== undefined || b.course_id !== undefined) full.course_id = b.courseId ?? b.course_id ?? null;
    if (b.lessonId !== undefined || b.lesson_id !== undefined) full.lesson_id = b.lessonId ?? b.lesson_id ?? null;
    if (b.requirements !== undefined) {
      full.requirements = Array.isArray(b.requirements)
        ? b.requirements.filter((r: any) => r?.label?.trim()).slice(0, 20).map((r: any) => ({
            label: String(r.label).slice(0, 200),
            kind: r.kind || "كتابة",
            place: String(r.place || "").slice(0, 120),
          }))
        : [];
    }
    if (b.dueDate !== undefined || b.due_date !== undefined) full.due_date = b.dueDate ?? b.due_date ?? null;
    if (b.points !== undefined) full.points = Number(b.points) || 10;
    if (b.section !== undefined) full.section = b.section || "الجميع";
    if (b.published !== undefined) full.published = !!b.published;
    const { error } = await supabaseQuery(`notebook_tasks?id=eq.${enc(req.params.id)}`, { method: "PATCH", body: full });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حفظ المهمة!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH notebook task failed");
    res.status(500).json({ error: "تعذر حفظ المهمة" });
  }
});

router.delete("/teacher/curriculum/notebooks/:id", requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseQuery(`notebook_tasks?id=eq.${enc(req.params.id)}`, { method: "DELETE" });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حذف المهمة وتسليماتها!" });
  } catch (err: any) {
    logger.error({ err }, "DELETE notebook task failed");
    res.status(500).json({ error: "تعذر حذف المهمة" });
  }
});

/** تسليمات مهمة مع أسماء الطلاب */
router.get("/teacher/curriculum/notebooks/:id/submissions", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseQuery<any[]>(
      `notebook_submissions?task_id=eq.${enc(req.params.id)}&order=submitted_at.desc&limit=500`,
    );
    if (error) throw new Error(String(error));
    const userIds = [...new Set((data || []).map((s) => s.user_id))];
    let names: Record<string, any> = {};
    if (userIds.length) {
      const { data: profiles } = await supabaseQuery<any[]>(
        `profiles?id=in.(${userIds.map(enc).join(",")})&select=id,full_name,grade,section,school,avatar_url&limit=500`,
      );
      for (const p of profiles || []) names[p.id] = p;
    }
    res.json(
      (data || []).map((s) => {
        let checks: any[] = [];
        try {
          checks = Array.isArray(s.checks) ? s.checks : JSON.parse(s.checks || "[]");
        } catch {
          checks = [];
        }
        return {
        id: s.id,
        photos: Array.isArray(s.photos) ? s.photos : [],
        note: s.note || "",
        status: s.status || "مسلّم",
        score: s.score ?? null,
        feedback: s.feedback || "",
        checks,
        submittedAt: s.submitted_at,
        student: {
          id: s.user_id,
          name: names[s.user_id]?.full_name || "طالب",
          grade: names[s.user_id]?.grade || "",
          section: names[s.user_id]?.section || "",
          school: names[s.user_id]?.school || "",
          avatarUrl: names[s.user_id]?.avatar_url || "",
        },
      };
      }),
    );
  } catch (err: any) {
    logger.error({ err }, "GET notebook submissions failed");
    res.status(500).json({ error: "تعذر جلب التسليمات" });
  }
});

/** تسليم الطالب لصور دفتره (إنشاء أو تحديث) */
router.post("/api/notebooks/:id/submit", requireAuth, async (req, res) => {
  try {
    const { userId, photos, note } = req.body || {};
    if (!userId) {
      res.status(400).json({ error: "تعذر تحديد الطالب" });
      return;
    }
    if (!Array.isArray(photos) || !photos.length) {
      res.status(400).json({ error: "صوّر دفترك وأرفق صورة واحدة على الأقل" });
      return;
    }
    // تهيئة تقييم البنود من بنود المهمة (كلها غير منجزة)
    let initChecks: any[] = [];
    try {
      const { data: task } = await supabaseQuery<any[]>(
        `notebook_tasks?id=eq.${enc(req.params.id)}&select=requirements&limit=1`,
      );
      const reqs = task?.[0]?.requirements;
      const arr = Array.isArray(reqs) ? reqs : JSON.parse(reqs || "[]");
      initChecks = arr.map((r: any) => ({ label: String(r.label || ""), done: false }));
    } catch { /* تجاهل */ }
    const payload = {
      task_id: req.params.id,
      user_id: userId,
      photos,
      note: note || "",
      status: "مسلّم",
      checks: initChecks,
      submitted_at: new Date().toISOString(),
    };
    const existing = await supabaseQuery<any[]>(
      `notebook_submissions?task_id=eq.${enc(req.params.id)}&user_id=eq.${enc(userId)}&limit=1`,
    );
    if (existing.data?.[0]) {
      const { error } = await supabaseQuery(`notebook_submissions?id=eq.${existing.data[0].id}`, {
        method: "PATCH",
        body: { ...payload, score: null, feedback: "" },
      });
      if (error) throw new Error(String(error));
    } else {
      const { error } = await supabaseQuery("notebook_submissions", { method: "POST", body: [payload] });
      if (error) throw new Error(String(error));
    }
    res.json({ success: true, message: "تم تسليم صور دفترك للأستاذ بنجاح! أحسنت." });
  } catch (err: any) {
    logger.error({ err }, "POST notebook submit failed");
    res.status(500).json({ error: "تعذر تسليم الدفتر — " + V3_HINT });
  }
});

/** تسليم الطالب نفسه (صوره + بنوده + تقييمه) */
router.get("/api/notebooks/:id/mine", async (req, res) => {
  try {
    const { user_id } = req.query as { user_id?: string };
    if (!user_id) {
      res.status(400).json({ error: "تعذر تحديد الطالب" });
      return;
    }
    const { data } = await supabaseQuery<any[]>(
      `notebook_submissions?task_id=eq.${enc(req.params.id)}&user_id=eq.${enc(user_id)}&limit=1`,
    );
    const s = data?.[0];
    if (!s) {
      res.json(null);
      return;
    }
    let checks: any[] = [];
    try {
      checks = Array.isArray(s.checks) ? s.checks : JSON.parse(s.checks || "[]");
    } catch {
      checks = [];
    }
    res.json({
      photos: Array.isArray(s.photos) ? s.photos : [],
      note: s.note || "",
      status: s.status || "مسلّم",
      score: s.score ?? null,
      feedback: s.feedback || "",
      checks,
      submittedAt: s.submitted_at,
    });
  } catch (err: any) {
    logger.error({ err }, "GET notebook mine failed");
    res.json(null);
  }
});

/** تقييم المعلم للتسليم */
router.patch("/teacher/curriculum/notebook-submissions/:id", requireAdmin, async (req, res) => {
  try {
    const { score, feedback, status, checks } = req.body || {};
    const full: Record<string, any> = { reviewed_at: new Date().toISOString() };
    if (score !== undefined) full.score = score === null || score === "" ? null : Number(score);
    if (feedback !== undefined) full.feedback = feedback;
    if (checks !== undefined) {
      full.checks = Array.isArray(checks)
        ? checks.map((c: any) => ({ label: String(c.label || ""), done: !!c.done }))
        : [];
    }
    if (status !== undefined) full.status = status;
    else if (score !== undefined || checks !== undefined) full.status = "تم التقييم";
    const { error } = await supabaseQuery(`notebook_submissions?id=eq.${enc(req.params.id)}`, {
      method: "PATCH",
      body: full,
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حفظ التقييم!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH notebook submission failed");
    res.status(500).json({ error: "تعذر حفظ التقييم" });
  }
});

/** رفع صور الدفاتر للطلاب (مجلد مخصص) */
router.post("/api/student/upload", requireAuth, async (req, res) => {
  try {
    const { file, fileName } = req.body || {};
    if (!file || typeof file !== "string") {
      res.status(400).json({ error: "ملف غير صالح للرفع" });
      return;
    }
    const result = await uploadFile(file, fileName || `notebook-${Date.now()}`, "/ard-al-lughah/notebooks");
    res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error({ err }, "POST /api/student/upload failed");
    res.status(500).json({ error: err?.message || "تعذر رفع الصورة" });
  }
});

export default router;
