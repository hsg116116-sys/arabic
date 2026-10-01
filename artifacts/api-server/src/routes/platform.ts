import { Router, type IRouter } from "express";
import {
  GetPlatformOverviewResponse,
  GetStudentDashboardResponse,
  GetTeacherDashboardResponse,
  GetTeacherSettingsResponse,
  ListAnnouncementsResponse,
  ListAssessmentsResponse,
  ListAssignmentsResponse,
  ListCoursesResponse,
  ListStudentsResponse,
  UpdateTeacherSettingsBody,
  UpdateTeacherSettingsResponse,
} from "@workspace/api-zod";
import { supabaseQuery, getSupabaseUser } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zjxotgcsbsfwrfqtximw.supabase.co";

// ============================================================================
// Helpers (بيانات حقيقية فقط من قاعدة البيانات - بلا قيم وهمية صلبة)
// ============================================================================

/** هل تفعل بدل الطالب النشط؟ حل الملف الشخصي من جلسة الدخول إن وُجدت */
async function resolveProfileFromSession(accessToken?: string): Promise<any | null> {
  if (!accessToken) return null;
  try {
    const user = await getSupabaseUser(accessToken);
    if (!user) return null;
    const userId = String(user.id ?? "");
    if (!userId) return null;
    const { data } = await supabaseQuery<any[]>(
      `profiles?select=*&id=eq.${userId}&limit=1`,
    );
    return data?.[0] || null;
  } catch (err) {
    logger.error({ err }, "resolveProfileFromSession failed");
    return null;
  }
}

/** الطالب النشط الحالي: صاحب الجلسة فقط — بلا أي بديل تجريبي (وضع الإنتاج) */
async function getActiveStudent(req?: any): Promise<any | null> {
  // مسار الجلسة عبر الوسيط (إن وُجد)
  const authUserId = (req as AuthedRequest)?.auth?.userId;
  if (authUserId) {
    try {
      const { data } = await supabaseQuery<any[]>(
        `profiles?id=eq.${encodeURIComponent(authUserId)}&select=*&limit=1`,
      );
      if (data?.[0]) return data[0];
    } catch { /* تجاهل */ }
  }
  const sessionProfile = await resolveProfileFromSession(
    req?.cookies?.supabase_access_token,
  );
  return sessionProfile || null;
}

/** تحويل سجل الملف الشخصي إلى الشكل المطلوب في واجهات المنصة */
function toStudentShape(profile: any, progress: number): any {
  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email || "",
    school: profile.school || "",
    branch: profile.branch || "",
    grade: profile.grade || "",
    section: profile.section || "",
    gender: profile.gender || "",
    phone: profile.phone || "",
    progress,
    status: profile.status || "نشط",
    avatarUrl: profile.avatar_url || "",
  };
}

/** مطابقة أيام الأسبوع العربية حسب تاريخ JavaScript (0=الأحد ... 6=السبت) */
const ARABIC_DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function toLocalDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** النشاط الأسبوعي آخر 7 أيام من جدول learning_activity الحقيقي */
async function getWeeklyActivity(): Promise<{ label: string; value: number }[]> {
  const days: Date[] = [];
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
    keys.push(toLocalDateKey(d));
  }

  const { data } = await supabaseQuery<any[]>(
    `learning_activity?select=activity_date&activity_date=gte.${keys[0]}&limit=1000`
  );

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const key = toLocalDateKey(new Date(row.activity_date));
    if (keys.includes(key)) counts[key] = (counts[key] || 0) + 1;
  }

  return days.map((d, i) => ({ label: ARABIC_DAY_LABELS[d.getDay()], value: counts[keys[i]] || 0 }));
}

/** إجمالي الدروس المكتملة لطالب معين (lesson_progress) */
async function getCompletedLessons(userId: string): Promise<{ completed: number; total: number }> {
  const [{ data: lessonsData }, { data: progressData }] = await Promise.all([
    supabaseQuery<any[]>("lessons?published=eq.true&select=id&limit=1000"),
    supabaseQuery<any[]>(`lesson_progress?user_id=eq.${userId}&select=lesson_id&limit=1000`),
  ]);
  const total = lessonsData?.length || 0;
  const completed = progressData?.length || 0;
  return { completed, total };
}

/** تقدم كل طالب (متوسط نسب تقدّمه في الوحدات) من course_progress */
async function getStudentProgressAvg(): Promise<Record<string, number>> {
  const { data } = await supabaseQuery<any[]>("course_progress?select=user_id,progress&limit=1000");
  const sums: Record<string, number[]> = {};
  for (const cp of data || []) {
    (sums[cp.user_id] ||= []).push(cp.progress || 0);
  }
  const map: Record<string, number> = {};
  for (const [uid, vals] of Object.entries(sums)) {
    map[uid] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return map;
}

/** تقدم وحدات طالب معين (course_id -> progress) */
async function getCourseProgressMap(userId: string): Promise<Record<string, number>> {
  const { data } = await supabaseQuery<any[]>(`course_progress?user_id=eq.${userId}&select=course_id,progress&limit=1000`);
  const map: Record<string, number> = {};
  for (const cp of data || []) map[cp.course_id] = cp.progress || 0;
  return map;
}

/** تقويم الاختبار بأسئلته الحقيقية من جدول assessment_questions */
async function getAssessmentQuestions(assessmentId: string): Promise<any[]> {
  const { data } = await supabaseQuery<any[]>(
    `assessment_questions?assessment_id=eq.${assessmentId}&order=position.asc&limit=100`
  );
  return (data || []).map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options || [],
    correctAnswer: q.correct_answer,
    explanation: q.explanation || "",
  }));
}

/** تحديد الطالب الفعلي: الجلسة أولاً ولا شيء غيرها (وضع الإنتاج — لا انتحال هوية) */
async function resolveStudentId(requestedUserId?: string, req?: any): Promise<string | null> {
  const authUserId = (req as AuthedRequest)?.auth?.userId;
  if (authUserId) return authUserId;
  const active = await getActiveStudent(req);
  // السماح بالمعرف الصريح فقط عند غياب الجلسة لمسارات عامة قديمة — الكتابة تتطلب جلسة
  if (active?.id) return active.id;
  return requestedUserId || null;
}

/** تطبيع النصوص العربية لأغراض المقارنة (توحيد الهمزات والمسافات) */
function normalizeArabic(value: string): string {
  return value
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/[\u0649]/g, "\u064A")
    .replace(/\s+/g, " ")
    .trim();
}

/** جلب الكتب المدرسية بأمان (قبل تطبيق ترقيع الجداول تعيد مصفوفة فارغة) */
async function fetchBooksSafe(): Promise<any[]> {
  try {
    const { data } = await supabaseQuery<any[]>("books?order=sort_order.asc");
    return data || [];
  } catch (err) {
    logger.warn({ err }, "books table not available yet, using empty list");
    return [];
  }
}

// 1. Platform Overview
router.get("/platform/overview", async (_req, res) => {
  try {
    const [{ data: settingsList }, books] = await Promise.all([
      supabaseQuery<any[]>("platform_settings?select=*&limit=1"),
      fetchBooksSafe(),
    ]);
    const settings = settingsList?.[0] || {};

    const semester = settings.semester || "الفصل الأول";
    const booksMapped = books.map((b) => ({
      id: b.id,
      grade: b.grade,
      term: b.term,
      title: b.title,
      coverUrl: b.cover_url,
      pdfUrl: b.pdf_url,
    }));

    const [{ count: studentsCount }, { count: unitsCount }, { count: assignmentsCount }, { count: assessmentsCount }, { count: certificatesCount }] =
      await Promise.all([
        supabaseQuery("profiles?role=eq.student", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("courses?published=eq.true", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("assignments?published=eq.true", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("assessments?published=eq.true", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("certificates", { headers: { Prefer: "count=exact" } }),
      ]);

    const overview = {
      platformName: settings.platform_name || "أرض اللغة",
      teacherName: settings.teacher_name || "المعلم أحمد يحيى الأسطل",
      tagline: settings.tagline || "",
      description: settings.description || "",
      semester,
      books: booksMapped,
      stats: {
        students: studentsCount ?? 0,
        units: unitsCount ?? 0,
        assignments: assignmentsCount ?? 0,
        assessments: assessmentsCount ?? 0,
        certificates: certificatesCount ?? 0,
      },
      settings: {
        platformName: settings.platform_name || "أرض اللغة",
        teacherName: settings.teacher_name || "المعلم أحمد يحيى الأسطل",
        teacherBio: settings.teacher_bio || "",
        teacherImageUrl: settings.teacher_image_url || "/teacher-ahmed.jpg",
        signatureUrl: settings.signature_url || "",
        accentColor: settings.accent_color || "#d7b65e",
      },
    };

    res.json(GetPlatformOverviewResponse.parse(overview));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /platform/overview");
    res.status(500).json({ error: "تعذر جلب بيانات المنصة" });
  }
});

// 2. Student Dashboard
// 0. هوية المنصة العامة (خفيفة للشعار والصورة والاسم في كل الصفحات — بلا مصادقة)
router.get("/platform/identity", async (_req, res) => {
  try {
    const { data } = await supabaseQuery<any[]>("platform_settings?select=*&limit=1");
    const s = data?.[0] || {};
    res.json({
      platformName: s.platform_name || "أرض اللغة",
      teacherName: s.teacher_name || "المعلم أحمد يحيى الأسطل",
      teacherBio: s.teacher_bio || "",
      teacherImageUrl: s.teacher_image_url || "/teacher-ahmed.jpg",
      accentColor: s.accent_color || "#d7b65e",
      semester: s.semester || "الفصل الأول",
    });
  } catch (err: any) {
    logger.error({ err }, "Error in GET /platform/identity");
    res.json({
      platformName: "أرض اللغة",
      teacherName: "المعلم أحمد يحيى الأسطل",
      teacherBio: "",
      teacherImageUrl: "/teacher-ahmed.jpg",
      accentColor: "#d7b65e",
      semester: "الفصل الأول",
    });
  }
});

router.get("/student/dashboard", requireAuth, async (req, res) => {
  try {
    const activeStudent = await getActiveStudent(req);
    if (!activeStudent) {
      res.status(404).json({ error: "لا يوجد طلاب مسجلون بعد" });
      return;
    }

    const [{ data: coursesData }, { data: announcementsData }, booksData, { data: settingsData }, { completed, total }, courseProgressMap] =
      await Promise.all([
        supabaseQuery<any[]>("courses?published=eq.true&order=sort_order.asc"),
        supabaseQuery<any[]>("announcements?published=eq.true&order=published_at.desc&limit=5"),
        fetchBooksSafe(),
        supabaseQuery<any[]>("platform_settings?select=*&limit=1"),
        getCompletedLessons(activeStudent.id),
        getCourseProgressMap(activeStudent.id),
      ]);

    const semester = settingsData?.[0]?.semester || "الفصل الأول";
    const termBook = (booksData || []).find((b) => normalizeArabic(b.term) === normalizeArabic(semester) && b.grade === activeStudent.grade);
    const studentBook = termBook
      ? {
          id: termBook.id,
          grade: termBook.grade,
          term: termBook.term,
          title: termBook.title,
          coverUrl: termBook.cover_url,
          pdfUrl: termBook.pdf_url,
        }
      : null;

    const progressPercent = total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;

    const nextUp = (coursesData || []).map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description || "",
      lessons: c.lessons_count || 0,
      duration: c.duration || "",
      progress: courseProgressMap[c.id] || 0,
      color: c.color || "#a85d3d",
      icon: c.icon || "book-open",
    }));

    const announcements = (announcementsData || []).map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      date: new Date(a.published_at || a.created_at).toLocaleDateString("ar-EG", { month: "short", day: "numeric" }),
      type: a.announcement_type || "إرشاد",
      audience: a.audience || "الجميع",
    }));

    const studentDashboard = {
      student: { ...toStudentShape(activeStudent, progressPercent), book: studentBook },
      progress: progressPercent,
      completedLessons: completed,
      nextUp,
      announcements,
    };

    res.json(GetStudentDashboardResponse.parse(studentDashboard));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /student/dashboard");
    res.status(500).json({ error: "تعذر تحميل لوحة الطالب" });
  }
});

// 3. Teacher Dashboard
router.get("/teacher/dashboard", requireAdmin, async (_req, res) => {
  try {
    const [{ count: studentsCount }, { count: activeStudents }, { count: unitsCount }, { count: assignmentsCount }, { count: assessmentsCount }, { count: certificatesCount }, { data: recentStudentsData }, { data: assignmentsData }, { data: attemptsData }, { data: schoolsData }, weeklyActivity] =
      await Promise.all([
        supabaseQuery("profiles?role=eq.student", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("profiles?role=eq.student&status=eq.نشط", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("courses?published=eq.true", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("assignments?published=eq.true", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("assessments?published=eq.true", { headers: { Prefer: "count=exact" } }),
        supabaseQuery("certificates", { headers: { Prefer: "count=exact" } }),
        supabaseQuery<any[]>("profiles?role=eq.student&order=created_at.desc&limit=6"),
        supabaseQuery<any[]>("assignments?published=eq.true&order=due_date.asc&limit=50"),
        supabaseQuery<any[]>("assessment_attempts?select=score&limit=1000"),
        supabaseQuery<any[]>("profiles?role=eq.student&select=school&limit=1000"),
        getWeeklyActivity(),
      ]);

    const studentProgressAvg = await getStudentProgressAvg();

    const scores = (attemptsData || []).map((r) => r.score).filter((s): s is number => typeof s === "number");
    const averageScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const schoolCount = new Set((schoolsData || []).map((s) => s.school).filter(Boolean)).size;

    const stats = {
      students: studentsCount ?? 0,
      activeStudents,
      schools: schoolCount,
      units: unitsCount ?? 0,
      assignments: assignmentsCount ?? 0,
      assessments: assessmentsCount ?? 0,
      averageScore,
      certificates: certificatesCount ?? 0,
    };

    const recentStudents = (recentStudentsData || []).map((s) => toStudentShape(s, studentProgressAvg[s.id] || 0));

    const submissionsData = await supabaseQuery<any[]>(
      "assignment_submissions?select=assignment_id,score,status&limit=1000"
    );
    const submissionStatusMap: Record<string, string> = {};
    for (const sub of submissionsData.data || []) {
      if (sub.score != null) {
        submissionStatusMap[sub.assignment_id] = "تم التسليم";
      } else if (!submissionStatusMap[sub.assignment_id]) {
        submissionStatusMap[sub.assignment_id] = "قيد المراجعة";
      }
    }

    const pendingAssignments = (assignmentsData || [])
      .filter((a) => submissionStatusMap[a.id] === "قيد المراجعة" || !submissionStatusMap[a.id])
      .map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description || "",
        unit: a.unit || "",
        dueDate: a.due_date || "",
        status: submissionStatusMap[a.id] === "قيد المراجعة" ? "بحاجة للمراجعة" : "لم يبدأ",
        points: a.points || 0,
      }));

    const teacherDashboard = {
      stats,
      weeklyActivity,
      recentStudents,
      pendingAssignments,
    };

    res.json(GetTeacherDashboardResponse.parse(teacherDashboard));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /teacher/dashboard");
    res.status(500).json({ error: "تعذر تحميل لوحة المعلم" });
  }
});

// 4. Courses
router.get("/courses", async (req, res) => {
  try {
    const [activeStudent, { data }] = await Promise.all([
      getActiveStudent(req),
      supabaseQuery<any[]>("courses?published=eq.true&order=sort_order.asc"),
    ]);

    const courseProgressMap = activeStudent ? await getCourseProgressMap(activeStudent.id) : {};

    const parsed = (data || []).map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description || "",
      lessons: c.lessons_count || 0,
      duration: c.duration || "",
      progress: courseProgressMap[c.id] || 0,
      color: c.color || "#a85d3d",
      icon: c.icon || "book-open",
    }));

    res.json(ListCoursesResponse.parse(parsed));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /courses");
    res.status(500).json({ error: "تعذر جلب الوحدات التعليمية" });
  }
});

// 4.1 Lessons for a specific course
router.get("/courses/:id/lessons", async (req, res) => {
  try {
    const courseId = req.params.id;
    const { data } = await supabaseQuery<any[]>(`lessons?course_id=eq.${courseId}&order=position.asc`);
    res.json(data || []);
  } catch (err: any) {
    logger.error({ err }, "Error in GET /courses/:id/lessons");
    res.status(500).json({ error: "تعذر جلب دروس الوحدة" });
  }
});

// 4.2 Complete a lesson
router.post("/lessons/:id/complete", requireAuth, async (req, res) => {
  try {
    const lessonId = req.params.id;
    const userId = await resolveStudentId(req.body?.userId, req);
    if (!userId) {
      res.status(404).json({ error: "لم يتم العثور على الطالب النشط" });
      return;
    }

    await supabaseQuery("lesson_progress", {
      method: "POST",
      body: [{ user_id: userId, lesson_id: lessonId, completed_at: new Date().toISOString() }],
      headers: { Prefer: "resolution=merge-duplicates" },
    });

    res.json({ success: true, message: "تم تسجيل إكمال الدرس بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "Error in POST /lessons/:id/complete");
    res.status(500).json({ error: "تعذر تسجيل إكمال الدرس" });
  }
});

// 5. Assignments
router.get("/assignments", async (req, res) => {
  try {
    const [activeStudent, { data }] = await Promise.all([
      getActiveStudent(req),
      supabaseQuery<any[]>("assignments?published=eq.true&order=due_date.asc"),
    ]);

    let submissions: any[] = [];
    if (activeStudent) {
      const subRes = await supabaseQuery<any[]>(
        `assignment_submissions?user_id=eq.${activeStudent.id}&select=assignment_id,score&limit=1000`
      );
      submissions = subRes.data || [];
    }
    const statusMap: Record<string, string> = {};
    const scoreMap: Record<string, number | null> = {};
    for (const sub of submissions) {
      statusMap[sub.assignment_id] = sub.score != null ? "تم التقييم" : "قيد المراجعة";
      scoreMap[sub.assignment_id] = sub.score ?? null;
    }

    let parsed = (data || []).map((a) => {
      let images: string[] = [];
      try {
        images = Array.isArray(a.images) ? a.images : JSON.parse(a.images || "[]");
      } catch { images = []; }
      return {
        id: a.id,
        title: a.title,
        description: a.description || "",
        unit: a.unit || "",
        courseId: a.course_id || null,
        lessonId: a.lesson_id || null,
        images: images.filter((u) => String(u || "").trim()),
        dueDate: a.due_date || "",
      status: statusMap[a.id] || "لم يبدأ",
      score: scoreMap[a.id] ?? null,
      points: a.points || 0,
      grade: a.grade || "الجميع",
      section: a.section || "الجميع",
      };
    });

    // فلترة الأقسام للواجبات — التقسيم لكل صف لحاله (صف الطالب النشط)
    if (activeStudent) {
      const { getStudentProfile, getSplitMap, itemVisible } = await import("./curriculum");
      const [profile, splitMap] = await Promise.all([
        getStudentProfile(activeStudent.id),
        getSplitMap(),
      ]);
      if (profile) {
        parsed = parsed.filter((a) => itemVisible(a.grade, a.section, profile.grade, profile.gender, splitMap));
      }
    }

    res.json(ListAssignmentsResponse.parse(parsed));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /assignments");
    res.status(500).json({ error: "تعذر جلب الواجبات" });
  }
});

// 5.1 Submit Assignment (صور الحل + إنشاء أو تحديث التسليم)
router.post("/assignments/:id/submit", requireAuth, async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const { answer, userId, photos } = req.body;
    const studentId = await resolveStudentId(userId, req);
    if (!studentId) {
      res.status(404).json({ error: "لم يتم العثور على الطالب النشط" });
      return;
    }
    const cleanPhotos = Array.isArray(photos) ? photos.filter((u: unknown) => String(u || "").trim()) : [];
    if (!String(answer || "").trim() && !cleanPhotos.length) {
      res.status(400).json({ error: "اكتب حلّك أو أرفق صورة واحدة على الأقل" });
      return;
    }

    // ممنوع التعديل أثناء المراجعة: تسليم بلا علامة = قيد المراجعة ولا يُمس حتى يقيّمه الأستاذ
    const { data: prev } = await supabaseQuery<any[]>(
      `assignment_submissions?assignment_id=eq.${assignmentId}&user_id=eq.${studentId}&select=id,score,status&limit=1`,
    );
    if (prev?.[0] && prev[0].score == null && String(prev[0].status || "") !== "تم التقييم") {
      res.status(400).json({ error: "تسليمك قيد مراجعة الأستاذ 🔒 — لا يمكن التعديل أو إعادة الرفع حتى يقيّمه." });
      return;
    }

    const fullRow = {
      assignment_id: assignmentId,
      user_id: studentId,
      status: "تم التسليم بنجاح",
      answer: String(answer || "").trim() || "تسليم بصور مرفقة",
      photos: cleanPhotos,
      submitted_at: new Date().toISOString(),
    };
    const writeRow = async (row: Record<string, any>) => {
      if (prev?.[0]) {
        return supabaseQuery(`assignment_submissions?id=eq.${prev[0].id}`, {
          method: "PATCH",
          body: { ...row, score: null, feedback: "" },
        });
      }
      return supabaseQuery("assignment_submissions", { method: "POST", body: [row] });
    };

    let r = await writeRow(fullRow);
    if (r.error && /column|schema cache|Could not find/i.test(String(r.error))) {
      // القاعدة قبل عمود photos — نخزن الصور كنص في attachment_url
      const { photos: _p, ...withoutPhotos } = fullRow;
      if (cleanPhotos.length) (withoutPhotos as any).attachment_url = JSON.stringify(cleanPhotos);
      r = await writeRow(withoutPhotos);
    }
    if (r.error) throw new Error(String(r.error));

    res.json({ success: true, message: "تم إرسال إجابتك إلى الأستاذ أحمد يحيى الأسطل بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "Error in POST /assignments/:id/submit");
    res.status(500).json({ error: "تعذر إرسال الواجب" });
  }
});

// 5.2 My submission for one assignment (حلّي + صوري + تقييم الأستاذ)
router.get("/assignments/:id/mine", requireAuth, async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const { userId } = req.query as { userId?: string };
    const studentId = await resolveStudentId(userId as string, req);
    if (!studentId) {
      res.json(null);
      return;
    }
    const { data } = await supabaseQuery<any[]>(
      `assignment_submissions?assignment_id=eq.${assignmentId}&user_id=eq.${studentId}&order=submitted_at.desc&limit=1`,
    );
    const s = data?.[0];
    if (!s) {
      res.json(null);
      return;
    }
    let photos: string[] = [];
    try {
      if (Array.isArray(s.photos)) photos = s.photos;
      else if (typeof s.photos === "string" && s.photos.trim()) photos = JSON.parse(s.photos);
      else if (s.attachment_url && String(s.attachment_url).trim().startsWith("[")) photos = JSON.parse(s.attachment_url);
      else if (s.attachment_url && String(s.attachment_url).trim()) photos = [String(s.attachment_url)];
    } catch { photos = []; }
    res.json({
      answer: s.answer || "",
      photos: photos.filter((u) => String(u || "").trim()),
      score: s.score ?? null,
      feedback: s.feedback || "",
      status: s.status || "تم التسليم",
      submittedAt: s.submitted_at || null,
    });
  } catch (err: any) {
    logger.error({ err }, "Error in GET /assignments/:id/mine");
    res.json(null);
  }
});

// 6. Assessments
router.get("/assessments", async (req, res) => {
  try {
    const [activeStudent, { data }] = await Promise.all([
      getActiveStudent(req),
      supabaseQuery<any[]>("assessments?published=eq.true&order=available_date.asc"),
    ]);

    let attempts: any[] = [];
    if (activeStudent) {
      const attemptsRes = await supabaseQuery<any[]>(
        `assessment_attempts?user_id=eq.${activeStudent.id}&select=assessment_id,score,status&order=completed_at.desc&limit=1000`
      );
      attempts = attemptsRes.data || [];
    }
    const bestAttempt: Record<string, any> = {};
    for (const att of attempts) {
      if (!bestAttempt[att.assessment_id]) bestAttempt[att.assessment_id] = att;
    }

    const parsed = (data || []).map((ass) => {
      const attempt = bestAttempt[ass.id];
      return {
        id: ass.id,
        title: ass.title,
        questions: ass.questions_count || 0,
        duration: ass.duration || "",
        score: attempt?.score || 0,
        status: attempt ? (attempt.status || "مكتمل") : "متاح الآن",
        date: ass.available_date || "",
      };
    });

    res.json(ListAssessmentsResponse.parse(parsed));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /assessments");
    res.status(500).json({ error: "تعذر جلب التقييمات" });
  }
});

// 6.1 Get questions for an assessment
router.get("/assessments/:id/questions", async (req, res) => {
  try {
    const assessmentId = req.params.id;
    const questions = await getAssessmentQuestions(assessmentId);
    res.json(questions);
  } catch (err: any) {
    logger.error({ err }, "Error in GET /assessments/:id/questions");
    res.status(500).json({ error: "تعذر جلب أسئلة الاختبار" });
  }
});

// 6.2 Submit assessment attempt
router.post("/assessments/:id/attempt", requireAuth, async (req, res) => {
  try {
    const assessmentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { answers, userId } = req.body;
    const studentId = await resolveStudentId(userId, req);
    if (!studentId) {
      res.status(404).json({ error: "لم يتم العثور على الطالب النشط" });
      return;
    }

    const questions = await getAssessmentQuestions(assessmentId);
    if (!questions.length) {
      res.status(404).json({ error: "لا توجد أسئلة لهذا الاختبار بعد" });
      return;
    }

    let correct = 0;
    const review = questions.map((q, idx) => {
      const studentAnswer = answers?.[q.id] ?? answers?.[idx];
      const isCorrect = studentAnswer === q.correctAnswer;
      if (isCorrect) correct++;
      return {
        questionId: q.id,
        question: q.question,
        selectedOption: studentAnswer,
        correctOption: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const scorePercentage = Math.round((correct / questions.length) * 100);

    await supabaseQuery("assessment_attempts", {
      method: "POST",
      body: [
        {
          assessment_id: assessmentId,
          user_id: studentId,
          status: "مكتمل",
          score: scorePercentage,
          answers: review,
          completed_at: new Date().toISOString(),
        },
      ],
    });

    res.json({
      success: true,
      score: scorePercentage,
      totalQuestions: questions.length,
      correctAnswers: correct,
      review,
      message: scorePercentage >= 70 ? "مبارك! لقد اجتزت التقييم بنجاح وتفوق." : "أداء جيد، راجع الشروحات وأعد المحاولة لتحقيق درجات أعلى.",
    });
  } catch (err: any) {
    logger.error({ err }, "Error in POST /assessments/:id/attempt");
    res.status(500).json({ error: "تعذر تصحيح الاختبار" });
  }
});

// 7. Announcements
router.get("/announcements", async (_req, res) => {
  try {
    const { data } = await supabaseQuery<any[]>("announcements?published=eq.true&order=published_at.desc");
    const parsed = (data || []).map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      date: new Date(a.published_at || a.created_at).toLocaleDateString("ar-EG", { month: "short", day: "numeric" }),
      type: a.announcement_type || "إرشاد",
      audience: a.audience || "الجميع",
    }));

    res.json(ListAnnouncementsResponse.parse(parsed));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /announcements");
    res.status(500).json({ error: "تعذر جلب الإعلانات" });
  }
});

// 8. Teacher Settings
router.get("/teacher/settings", requireAdmin, async (_req, res) => {
  try {
    const { data } = await supabaseQuery<any[]>("platform_settings?select=*&limit=1");
    const s = data?.[0] || {};
    const settings = {
      platformName: s.platform_name || "أرض اللغة",
      teacherName: s.teacher_name || "المعلم أحمد يحيى الأسطل",
      teacherBio: s.teacher_bio || "",
      teacherImageUrl: s.teacher_image_url || "/teacher-ahmed.jpg",
      signatureUrl: s.signature_url || "",
      accentColor: s.accent_color || "#d7b65e",
      semester: s.semester || "الفصل الأول",
      genderSplit: s.gender_split === true,
    };

    res.json(GetTeacherSettingsResponse.parse(settings));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /teacher/settings");
    res.status(500).json({ error: "تعذر جلب إعدادات المنصة" });
  }
});

router.patch("/teacher/settings", requireAdmin, async (req, res) => {
  const parsed = UpdateTeacherSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (parsed.data.platformName !== undefined) updatePayload.platform_name = parsed.data.platformName;
    if (parsed.data.teacherName !== undefined) updatePayload.teacher_name = parsed.data.teacherName;
    if (parsed.data.teacherBio !== undefined) updatePayload.teacher_bio = parsed.data.teacherBio;
    if (parsed.data.teacherImageUrl !== undefined) updatePayload.teacher_image_url = parsed.data.teacherImageUrl;
    if (parsed.data.signatureUrl !== undefined) updatePayload.signature_url = parsed.data.signatureUrl;
    if (parsed.data.accentColor !== undefined) updatePayload.accent_color = parsed.data.accentColor;
    if (parsed.data.semester !== undefined) updatePayload.semester = parsed.data.semester;
    if ((parsed.data as any).genderSplit !== undefined) updatePayload.gender_split = !!(parsed.data as any).genderSplit;

    try {
      await supabaseQuery("platform_settings?id=eq.true", {
        method: "PATCH",
        body: updatePayload,
      });
    } catch (patchErr) {
      // إذا كان عمود جديد غير موجود بعد في القاعدة، نعيد المحاولة بدونه حتى لا تفشل عملية الحفظ.
      if (updatePayload.semester !== undefined || updatePayload.gender_split !== undefined) {
        logger.warn({ err: patchErr }, "new settings column missing, retrying without it");
        const { semester, gender_split, ...rest } = updatePayload;
        await supabaseQuery("platform_settings?id=eq.true", { method: "PATCH", body: rest });
      } else {
        throw patchErr;
      }
    }

    const { data: updated } = await supabaseQuery<any[]>("platform_settings?select=*&limit=1");
    const s = updated?.[0] || {};

    const response = {
      platformName: s.platform_name || parsed.data.platformName || "أرض اللغة",
      teacherName: s.teacher_name || parsed.data.teacherName || "المعلم أحمد يحيى الأسطل",
      teacherBio: s.teacher_bio || parsed.data.teacherBio || "",
      teacherImageUrl: s.teacher_image_url || parsed.data.teacherImageUrl || "/teacher-ahmed.jpg",
      signatureUrl: s.signature_url || parsed.data.signatureUrl || "",
      accentColor: s.accent_color || parsed.data.accentColor || "#d7b65e",
      semester: s.semester || parsed.data.semester || "الفصل الأول",
      genderSplit: s.gender_split === true || (parsed.data as any).genderSplit === true,
    };

    res.json(UpdateTeacherSettingsResponse.parse(response));
  } catch (err: any) {
    logger.error({ err }, "Error in PATCH /teacher/settings");
    res.status(500).json({ error: "تعذر حفظ إعدادات المنصة" });
  }
});

// 8.5 إدارة الكتب المدرسية (المعلم يحدد كل شيء: الصف/الفصل/الغلاف/الملف)
router.get("/teacher/books", requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseQuery<any[]>("books?order=sort_order.asc&limit=50");
    if (error) throw new Error(String(error));
    res.json(
      (data || []).map((b) => ({
        id: b.id,
        grade: b.grade || "",
        term: b.term || "",
        title: b.title || "",
        coverUrl: b.cover_url || "",
        pdfUrl: b.pdf_url || "",
        sortOrder: b.sort_order ?? 1,
      })),
    );
  } catch (err: any) {
    logger.error({ err }, "Error in GET /teacher/books");
    res.status(500).json({ error: "تعذر جلب الكتب" });
  }
});

router.post("/teacher/books", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title?.trim()) {
      res.status(400).json({ error: "عنوان الكتاب مطلوب" });
      return;
    }
    const id = String(b.id || `book-${Date.now()}`).slice(0, 60);
    const full = {
      id,
      grade: b.grade || "الصف الثامن",
      term: b.term || "الفصل الأول",
      title: String(b.title).slice(0, 200),
      cover_url: b.coverUrl || b.cover_url || "",
      pdf_url: b.pdfUrl || b.pdf_url || "",
      sort_order: Number(b.sortOrder ?? b.sort_order) || 1,
    };
    const { error } = await supabaseQuery("books", { method: "POST", body: [full] });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تمت إضافة الكتاب!", id });
  } catch (err: any) {
    logger.error({ err }, "Error in POST /teacher/books");
    res.status(500).json({ error: "تعذر إضافة الكتاب" });
  }
});

router.patch("/teacher/books/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = {};
    if (b.title !== undefined) full.title = String(b.title).slice(0, 200);
    if (b.grade !== undefined) full.grade = b.grade;
    if (b.term !== undefined) full.term = b.term;
    if (b.coverUrl !== undefined || b.cover_url !== undefined) full.cover_url = b.coverUrl ?? b.cover_url ?? "";
    if (b.pdfUrl !== undefined || b.pdf_url !== undefined) full.pdf_url = b.pdfUrl ?? b.pdf_url ?? "";
    if (b.sortOrder !== undefined || b.sort_order !== undefined) full.sort_order = Number(b.sortOrder ?? b.sort_order) || 1;
    const { error } = await supabaseQuery(`books?id=eq.${encodeURIComponent(String(req.params.id))}`, {
      method: "PATCH",
      body: full,
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حفظ الكتاب!" });
  } catch (err: any) {
    logger.error({ err }, "Error in PATCH /teacher/books");
    res.status(500).json({ error: "تعذر حفظ الكتاب" });
  }
});

router.delete("/teacher/books/:id", requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseQuery(`books?id=eq.${encodeURIComponent(String(req.params.id))}`, { method: "DELETE" });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حذف الكتاب!" });
  } catch (err: any) {
    logger.error({ err }, "Error in DELETE /teacher/books");
    res.status(500).json({ error: "تعذر حذف الكتاب" });
  }
});

// 9. Teacher Students
router.get("/teacher/students", requireAdmin, async (_req, res) => {
  try {
    const [{ data }, progressAvg] = await Promise.all([
      supabaseQuery<any[]>("profiles?order=created_at.desc"),
      getStudentProgressAvg(),
    ]);
    const parsed = (data || [])
      .filter((s) => s.role === "student")
      .map((s) => toStudentShape(s, progressAvg[s.id] || 0));

    res.json(ListStudentsResponse.parse(parsed));
  } catch (err: any) {
    logger.error({ err }, "Error in GET /teacher/students");
    res.status(500).json({ error: "تعذر جلب قائمة الطلاب" });
  }
});

// 9.1 Add Student
router.post("/teacher/students", requireAdmin, async (req, res) => {
  try {
    const { name, email, school, grade, section, gender, phone } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم الطالب مطلوب" });
      return;
    }

    const newStudent = {
      full_name: name,
      email: email || `${Date.now()}@student.local`,
      school: school || "مدرسة وايلد",
      grade: grade || "الصف العاشر",
      section: section || "أ",
      gender: gender || "طالب",
      phone: phone || "",
      role: "student",
      status: "نشط",
    };

    await supabaseQuery("profiles", {
      method: "POST",
      body: [newStudent],
    });

    res.json({ success: true, message: "تمت إضافة الطالب بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "Error in POST /teacher/students");
    res.status(500).json({ error: "تعذر إضافة الطالب" });
  }
});

// 9.2 Edit Student — تعديل كامل لبيانات الطالب
router.patch("/teacher/students/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.name !== undefined && !String(b.name).trim()) {
      res.status(400).json({ error: "اسم الطالب مطلوب" });
      return;
    }
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.name !== undefined) full.full_name = String(b.name).trim();
    if (b.email !== undefined) full.email = String(b.email || "").trim();
    if (b.school !== undefined) full.school = String(b.school || "").trim();
    if (b.branch !== undefined) full.branch = String(b.branch || "").trim();
    if (b.grade !== undefined) full.grade = b.grade;
    if (b.section !== undefined) full.section = String(b.section || "").trim();
    if (b.gender !== undefined) full.gender = b.gender;
    if (b.phone !== undefined) full.phone = String(b.phone || "").trim();
    if (b.status !== undefined) full.status = b.status;
    if (b.avatarUrl !== undefined || b.avatar_url !== undefined) full.avatar_url = b.avatarUrl ?? b.avatar_url ?? "";
    const { error } = await supabaseQuery(`profiles?id=eq.${encodeURIComponent(String(req.params.id))}`, {
      method: "PATCH",
      body: full,
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حفظ بيانات الطالب بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "Error in PATCH /teacher/students/:id");
    res.status(500).json({ error: "تعذر حفظ بيانات الطالب" });
  }
});

// 9.3 Delete Student — حذف الطالب وبياناته (وحساب دخوله إن أمكن)
router.delete("/teacher/students/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { error } = await supabaseQuery(`profiles?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (error) throw new Error(String(error));
    // محاولة حذف حساب الدخول من المصادقة (best-effort — لا تفشل الحذف إن تعذر)
    try {
      const base = SUPABASE_URL.replace(/\/+$/, "");
      const key =
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_KEY ||
        "";
      if (key) {
        await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
      }
    } catch { /* تجاهل — المهم حذف الملف */ }
    res.json({ success: true, message: "تم حذف الطالب وبياناته!" });
  } catch (err: any) {
    logger.error({ err }, "Error in DELETE /teacher/students/:id");
    res.status(500).json({ error: "تعذر حذف الطالب" });
  }
});

// 10. Teacher Content Creation
router.post("/teacher/courses", requireAdmin, async (req, res) => {
  try {
    const { title, description, lessons, duration, color } = req.body;
    await supabaseQuery("courses", {
      method: "POST",
      body: [
        {
          title: title || "وحدة تعليمية جديدة",
          description: description || "",
          lessons_count: parseInt(lessons, 10) || 4,
          duration: duration || "3 ساعات",
          color: color || "#a85d3d",
          published: true,
        },
      ],
    });
    res.json({ success: true, message: "تمت إضافة الوحدة التعليمية بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "Error in POST /teacher/courses");
    res.status(500).json({ error: "تعذر إنشاء الوحدة" });
  }
});

router.post("/teacher/assignments", requireAdmin, async (req, res) => {
  try {
    const { title, description, unit, dueDate, points, grade, section } = req.body;
    const courseId = req.body?.courseId ?? req.body?.course_id ?? null;
    const lessonId = req.body?.lessonId ?? req.body?.lesson_id ?? null;
    const images = Array.isArray(req.body?.images) ? req.body.images.filter((u: unknown) => String(u || "").trim()) : [];
    const full = {
      title: title || "واجب جديد",
      description: description || "",
      unit: unit || "الوحدة الأولى",
      course_id: courseId,
      lesson_id: lessonId,
      images,
      due_date: dueDate || new Date(Date.now() + 86400000 * 7).toISOString().split("T")[0],
      points: parseInt(points, 10) || 20,
      published: true,
      grade: grade || "الجميع",
      section: section || "الجميع",
    };
    let r = await supabaseQuery("assignments", { method: "POST", body: [full] });
    if (r.error && /column|schema cache|Could not find/i.test(String(r.error))) {
      // القاعدة قبل صور الواجبات وربط الدروس — نعيد المحاولة بدونهما
      const { lesson_id: _l, course_id: _c, images: _i, ...withoutNew } = full;
      r = await supabaseQuery("assignments", { method: "POST", body: [withoutNew] });
    }
    if (r.error && /column|schema cache|Could not find/i.test(String(r.error))) {
      // القاعدة قبل v5 — نعيد المحاولة بالحقول الأساسية
      const { grade: _g, section: _s, course_id: _cc, lesson_id: _ll, images: _ii, ...base } = full;
      r = await supabaseQuery("assignments", { method: "POST", body: [base] });
    }
    if (r.error) throw new Error(String(r.error));
    res.json({ success: true, message: "تمت إضافة الواجب بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "Error in POST /teacher/assignments");
    res.status(500).json({ error: "تعذر إنشاء الواجب" });
  }
});

router.post("/teacher/assessments", requireAdmin, async (req, res) => {
  try {
    const { title, questions, duration, date } = req.body;
    await supabaseQuery("assessments", {
      method: "POST",
      body: [
        {
          title: title || "تقييم جديد",
          questions_count: parseInt(questions, 10) || 5,
          duration: duration || "20 دقيقة",
          available_date: date || new Date().toISOString().split("T")[0],
          published: true,
        },
      ],
    });
    res.json({ success: true, message: "تمت إضافة التقييم بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "Error in POST /teacher/assessments");
    res.status(500).json({ error: "تعذر إنشاء التقييم" });
  }
});

// 11. Student Profile Update
router.patch("/student/profile", requireAuth, async (req, res) => {
  try {
    const { id, name, school, branch, grade, section, phone } = req.body;
    const targetId = await resolveStudentId(id, req);
    if (!targetId) {
      res.status(404).json({ error: "لم يتم العثور على الطالب النشط" });
      return;
    }

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name) updatePayload.full_name = name;
    if (school) updatePayload.school = school;
    if (branch) updatePayload.branch = branch;
    if (grade) updatePayload.grade = grade;
    if (section) updatePayload.section = section;
    if (phone !== undefined) updatePayload.phone = phone;

    await supabaseQuery(`profiles?id=eq.${targetId}`, {
      method: "PATCH",
      body: updatePayload,
    });

    res.json({ success: true, message: "تم تحديث الملف الشخصي بنجاح!" });
  } catch (err: any) {
    logger.error({ err }, "Error in PATCH /student/profile");
    res.status(500).json({ error: "تعذر تحديث الملف الشخصي" });
  }
});

export default router;