import { Router, type IRouter } from "express";
import { supabaseQuery } from "../lib/supabase";
import { requireAdmin, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getSplitMap, itemVisible } from "./curriculum";

const router: IRouter = Router();

// ============================================================================
// كشف العلامات — ملف الطالب الكامل.
// الغرض: الأستاذ يفتح طالباً فيرى كل شيء عنه في شاشة واحدة — علاماته في
// الاختبارات والواجبات ومهام الدفتر، وما سلّمه وما لم يسلّمه، ومشاركته
// في التأسيس. بلا تنقّل بين أربع لوحات.
// ----------------------------------------------------------------------------
// قاعدة الحساب (تُقرأ من القاعدة نفسها، لا تُخترع):
//   الاختبار  = نسبة مئوية مخزّنة (0-100) — هكذا يحفظها التصحيح التلقائي.
//   الواجب    = score / points — والـ points يضعها الأستاذ على كل واجب.
//   الدفتر    = score / points — والـ points يضعها الأستاذ على كل مهمة.
//   التأسيس   = دروس منجزة / دروس القسم.
// لا حاجة لأي عمود جديد: كل المعطيات موجودة فعلاً.
// ============================================================================

const enc = (v: string | string[] | undefined): string =>
  encodeURIComponent(Array.isArray(v) ? v[0] ?? "" : v ?? "");

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pctOf(earned: number, possible: number): number | null {
  if (possible <= 0) return null;
  return Math.round((earned / possible) * 100);
}

/** التقدير من النسبة — نفس عتبة النجاح في التصحيح (70) */
function levelOf(pct: number | null): string {
  if (pct === null) return "لا علامات بعد";
  if (pct >= 90) return "ممتاز";
  if (pct >= 80) return "جيد جداً";
  if (pct >= 70) return "جيد";
  if (pct >= 60) return "مقبول";
  return "يحتاج متابعة";
}

/** هل هذا البند موجّه لهذا الطالب؟ (صف/مدرسة/جنس — نفس منطق الظهور للطالب)
 *  تنبيه: itemVisible تقارن المدرسة والقسم فقط — الصف يُقارَن هنا صراحة،
 *  وإلا حُسب طالب التاسع على واجبات العاشر (وهو الخطأ الذي كان). */
function appliesTo(
  item: { grade?: string; section?: string; school?: string; published?: boolean; is_visible?: boolean },
  profile: { grade: string; gender: string | null; school: string },
  splitMap: Record<string, boolean>,
): boolean {
  if (item.published === false) return false;
  if (item.is_visible === false) return false;
  const ig = String(item.grade || "").trim();
  const pg = String(profile.grade || "").trim();
  // صف محدد + صف طالب محدد ومختلف = ليس له. الفارغ أو "الجميع" = للكل.
  if (ig && pg && ig !== "الجميع" && pg !== "الجميع" && ig !== pg) return false;
  return itemVisible(item.grade, item.section, profile.grade, profile.gender, splitMap, item.school, profile.school);
}

/** سياق الحساب المشترك: كل البيانات الخام مرة واحدة، ثم تُحسب الصفوف محلياً.
 *  يضمن أن النظرة العامة وملف الطالب والمقارنة يخرجون من نفس الأرقام. */
type ReportCtx = {
  assessments: any[];
  attemptsByUser: Record<string, Record<string, number>>;
  assignments: any[];
  hwByUser: Record<string, Record<string, number | null>>;
  tasks: any[];
  nbByUser: Record<string, Record<string, number | null>>;
  sections: any[];
  lessonsBySection: Record<string, string[]>;
  memberByUser: Record<string, Set<string>>;
  doneByUser: Record<string, Set<string>>;
  /** آخر نشاط لكل طالب (أحدث تسليم/محاولة/إنجاز) — للترتيب "الأحدث دخولاً" */
  lastByUser: Record<string, string>;
  splitMap: Record<string, boolean>;
};

async function loadReportCtx(): Promise<ReportCtx> {
  const [
    { data: assessments },
    { data: attempts },
    { data: assignments },
    { data: hwSubs },
    { data: tasks },
    { data: nbSubs },
    { data: sections },
    { data: fLessons },
    { data: fMembers },
    { data: fProgress },
    splitMap,
  ] = await Promise.all([
    supabaseQuery<any[]>("assessments?order=available_date.asc&limit=500"),
    supabaseQuery<any[]>("assessment_attempts?select=user_id,assessment_id,score,completed_at&limit=20000"),
    supabaseQuery<any[]>("assignments?order=due_date.asc&limit=500"),
    supabaseQuery<any[]>("assignment_submissions?select=user_id,assignment_id,score,submitted_at&limit=20000"),
    supabaseQuery<any[]>("notebook_tasks?order=due_date.asc&limit=500"),
    supabaseQuery<any[]>("notebook_submissions?select=user_id,task_id,score,submitted_at&limit=20000"),
    supabaseQuery<any[]>("foundation_sections?is_visible=eq.true&order=sort_order.asc&limit=200"),
    supabaseQuery<any[]>("foundation_lessons?is_visible=eq.true&select=id,section_id&limit=3000"),
    supabaseQuery<any[]>("foundation_members?select=section_id,user_id&limit=20000"),
    supabaseQuery<any[]>("foundation_progress?select=user_id,lesson_id,completed_at&limit=20000"),
    getSplitMap(),
  ]);

  const touchLast = (map: Record<string, string>, userId: unknown, at: unknown) => {
    const u = String(userId || "");
    const t = String(at || "");
    if (!u || !t) return;
    if (!map[u] || t > map[u]) map[u] = t;
  };
  const lastByUser: ReportCtx["lastByUser"] = {};

  const attemptsByUser: ReportCtx["attemptsByUser"] = {};
  for (const a of attempts || []) {
    if (!a.user_id) continue;
    const cur = num(a.score);
    const prev = attemptsByUser[a.user_id]?.[a.assessment_id];
    if (prev === undefined || cur > prev) {
      (attemptsByUser[a.user_id] ||= {})[a.assessment_id] = cur;
    }
    touchLast(lastByUser, a.user_id, a.completed_at);
  }
  const hwByUser: ReportCtx["hwByUser"] = {};
  for (const s of hwSubs || []) {
    if (!s?.user_id) continue;
    (hwByUser[s.user_id] ||= {})[s.assignment_id] =
      typeof s.score === "number" ? num(s.score) : null;
    touchLast(lastByUser, s.user_id, s.submitted_at);
  }
  const nbByUser: ReportCtx["nbByUser"] = {};
  for (const s of nbSubs || []) {
    if (!s?.user_id) continue;
    (nbByUser[s.user_id] ||= {})[s.task_id] =
      typeof s.score === "number" ? num(s.score) : null;
    touchLast(lastByUser, s.user_id, s.submitted_at);
  }
  const doneByUser: ReportCtx["doneByUser"] = {};
  for (const p of fProgress || []) {
    if (!p.user_id) continue;
    (doneByUser[p.user_id] ||= new Set()).add(String(p.lesson_id));
    touchLast(lastByUser, p.user_id, p.completed_at);
  }
  const memberByUser: ReportCtx["memberByUser"] = {};
  for (const m of fMembers || []) {
    if (!m.user_id) continue;
    (memberByUser[m.user_id] ||= new Set()).add(String(m.section_id));
  }
  const lessonsBySection: ReportCtx["lessonsBySection"] = {};
  for (const l of fLessons || []) (lessonsBySection[l.section_id] ||= []).push(l.id);

  return {
    assessments: assessments || [],
    attemptsByUser,
    assignments: assignments || [],
    hwByUser,
    tasks: tasks || [],
    nbByUser,
    sections: sections || [],
    lessonsBySection,
    memberByUser,
    doneByUser,
    lastByUser,
    splitMap,
  };
}

/** صف طالب واحد: مجاميعه حسب بنوده هو (صفه ومدرسته وجنسه) لا رقماً عاماً */
function computeStudentRow(p: any, ctx: ReportCtx) {
  const who = {
    grade: String(p.grade || ""),
    gender: (p.gender as string | null) || null,
    school: String(p.school || ""),
  };
  const myExams = ctx.assessments.filter((a: any) => appliesTo(a, who, ctx.splitMap));
  const myHw = ctx.assignments.filter((a: any) => appliesTo(a, who, ctx.splitMap));
  const myNb = ctx.tasks.filter((t: any) => appliesTo(t, who, ctx.splitMap));

  const att = ctx.attemptsByUser[p.id] || {};
  const takenScores = myExams.map((e: any) => att[e.id]).filter((v): v is number => typeof v === "number");
  const examAvg = takenScores.length
    ? Math.round((takenScores.reduce((a, b) => a + b, 0) / takenScores.length) * 10) / 10
    : null;

  const hw = ctx.hwByUser[p.id] || {};
  const hwDoneIds = myHw.filter((h: any) => hw[h.id] !== undefined).map((h: any) => h.id);
  const hwEarned = hwDoneIds.reduce((s: number, id: string) => s + (hw[id] ?? 0), 0);
  const hwPossible = myHw.reduce((s: number, h: any) => s + num(h.points, 20), 0);

  const nb = ctx.nbByUser[p.id] || {};
  const nbDoneIds = myNb.filter((t: any) => nb[t.id] !== undefined).map((t: any) => t.id);
  const nbEarned = nbDoneIds.reduce((s: number, id: string) => s + (nb[id] ?? 0), 0);
  const nbPossible = myNb.reduce((s: number, t: any) => s + num(t.points, 10), 0);

  const mySections = ctx.sections.filter((s: any) => (ctx.memberByUser[p.id] || new Set()).has(s.id));
  const doneSet = ctx.doneByUser[p.id] || new Set();
  const fDone = mySections.reduce(
    (s: number, sec: any) => s + (ctx.lessonsBySection[sec.id] || []).filter((id) => doneSet.has(id)).length,
    0,
  );
  const fTotal = mySections.reduce((s: number, sec: any) => s + (ctx.lessonsBySection[sec.id] || []).length, 0);

  const parts = [examAvg, pctOf(hwEarned, hwPossible), pctOf(nbEarned, nbPossible), pctOf(fDone, fTotal)]
    .filter((v): v is number => typeof v === "number");
  const overall = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  const missing =
    myExams.filter((e: any) => att[e.id] === undefined).length +
    myHw.filter((h: any) => hw[h.id] === undefined).length +
    myNb.filter((t: any) => nb[t.id] === undefined).length;

  return {
    id: p.id,
    name: p.full_name || "",
    school: p.school || "",
    grade: p.grade || "",
    section: p.section || "",
    gender: p.gender || "",
    avatarUrl: p.avatar_url || "",
    status: p.status || "نشط",
    exams: { taken: takenScores.length, total: myExams.length, avg: examAvg },
    homework: { done: hwDoneIds.length, total: myHw.length, earned: hwEarned, possible: hwPossible, percent: pctOf(hwEarned, hwPossible) },
    notebook: { done: nbDoneIds.length, total: myNb.length, earned: nbEarned, possible: nbPossible, percent: pctOf(nbEarned, nbPossible) },
    foundation: { inFoundation: mySections.length > 0, levels: mySections.length, done: fDone, total: fTotal, percent: pctOf(fDone, fTotal) },
    missing,
    overall,
    level: levelOf(overall),
    lastActive: ctx.lastByUser[p.id] || "",
  };
}

/** متوسط الزملاء (نفس الصف والمدرسة) — للمقارنة داخل الملف */
function cohortCompare(rows: ReturnType<typeof computeStudentRow>[]) {
  const avg = (pick: (r: ReturnType<typeof computeStudentRow>) => number | null): number | null => {
    const vals = rows.map(pick).filter((v): v is number => typeof v === "number");
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  return {
    count: rows.length,
    exams: avg((r) => r.exams.avg),
    homework: avg((r) => r.homework.percent),
    notebook: avg((r) => r.notebook.percent),
    foundation: avg((r) => r.foundation.percent),
    overall: avg((r) => r.overall),
  };
}
/** نظرة عامة: مجاميع كل طالب في صفحة واحدة — مدرسة ← صف ← طالب.
 *  تُحسب المجاميع لكل طالب حسب بنوده هو (صفه ومدرسته)، لا رقماً عاماً:
 *  فطالب الصف الثامن لا يُحاسَب على واجبٍ للصف العاشر. */
router.get("/teacher/report/overview", requireAdmin, async (req, res) => {
  try {
    const q = (req.query || {}) as Record<string, string>;
    const schoolFilter = (q.school || "").trim();
    const gradeFilter = (q.grade || "").trim();

    const ctx = await loadReportCtx();
    const { data: profiles } = await supabaseQuery<any[]>(
      "profiles?role=eq.student&order=full_name.asc&limit=2000",
    );
    const [{ data: managedGrades }, { data: managedSchools }] = await Promise.all([
      supabaseQuery<any[]>("grade_levels?order=sort_order.asc&limit=500"),
      supabaseQuery<any[]>("schools?order=sort_order.asc&limit=500"),
    ]);

    let students = (profiles || []).map((p: any) => computeStudentRow(p, ctx));

    if (schoolFilter) students = students.filter((s: any) => s.school === schoolFilter);
    if (gradeFilter) students = students.filter((s: any) => s.grade === gradeFilter);

    const allRows = (profiles || []).map((p: any) => ({ school: p.school || "", grade: p.grade || "" }));
    const schools = [
      ...new Set([
        ...((managedSchools || []).filter((s: any) => s.is_active !== false).map((s: any) => s.name)),
        ...allRows.map((r) => r.school),
      ].filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "ar"));
    const grades = [
      ...new Set([
        ...((managedGrades || []).filter((g: any) => g.is_active !== false).map((g: any) => g.name)),
        ...allRows.map((r) => r.grade),
      ].filter(Boolean)),
    ];

    res.json({ students, schools, grades, generatedAt: new Date().toISOString() });
  } catch (err: any) {
    logger.error({ err }, "GET teacher report overview failed");
    res.status(500).json({ error: "تعذر تجهيز كشف العلامات" });
  }
});

/** ملف طالب واحد — كل علاماته وكل نواقصه ومشاركته في التأسيس */
router.get("/teacher/report/student/:id", requireAdmin, async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    if (!studentId) {
      res.status(400).json({ error: "الطالب مطلوب" });
      return;
    }

    const { data: profRows } = await supabaseQuery<any[]>(
      `profiles?id=eq.${enc(studentId)}&select=id,email,full_name,role,grade,school,section,gender,phone,avatar_url,status,student_number,created_at&limit=1`,
    );
    const profile = profRows?.[0];
    if (!profile || profile.role !== "student") {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }
    const who = {
      grade: String(profile.grade || ""),
      gender: (profile.gender as string | null) || null,
      school: String(profile.school || ""),
    };

    const [
      { data: assessments },
      { data: attempts },
      { data: assignments },
      { data: hwSubs },
      { data: tasks },
      { data: nbSubs },
      { data: sections },
      { data: fLessons },
      { data: fMembers },
      { data: fProgress },
      splitMap,
    ] = await Promise.all([
      supabaseQuery<any[]>("assessments?order=available_date.asc&limit=500"),
      supabaseQuery<any[]>(`assessment_attempts?user_id=eq.${enc(studentId)}&select=assessment_id,score,status,completed_at&order=completed_at.desc&limit=1000`),
      supabaseQuery<any[]>("assignments?order=due_date.asc&limit=500"),
      supabaseQuery<any[]>(`assignment_submissions?user_id=eq.${enc(studentId)}&select=assignment_id,answer,score,feedback,status,submitted_at,reviewed_at&limit=1000`),
      supabaseQuery<any[]>("notebook_tasks?order=due_date.asc&limit=500"),
      supabaseQuery<any[]>(`notebook_submissions?user_id=eq.${enc(studentId)}&select=task_id,photos,note,score,feedback,status,submitted_at,reviewed_at&limit=1000`),
      supabaseQuery<any[]>("foundation_sections?is_visible=eq.true&order=sort_order.asc&limit=200"),
      supabaseQuery<any[]>("foundation_lessons?is_visible=eq.true&select=id,section_id,title&limit=3000"),
      supabaseQuery<any[]>(`foundation_members?user_id=eq.${enc(studentId)}&select=section_id&limit=200`),
      supabaseQuery<any[]>(`foundation_progress?user_id=eq.${enc(studentId)}&select=lesson_id&limit=2000`),
      getSplitMap(),
    ]);

    // ── 1) الاختبارات: أفضل محاولة لكل اختبار ──
    const byExam: Record<string, any[]> = {};
    for (const a of attempts || []) (byExam[a.assessment_id] ||= []).push(a);
    const examItems = (assessments || [])
      .filter((a: any) => appliesTo(a, who, splitMap))
      .map((a: any) => {
        const list = (byExam[a.id] || []).slice().sort(
          (x: any, y: any) => num(x.score) - num(y.score),
        );
        const best = list.length ? list[list.length - 1] : null;
        return {
          id: a.id,
          title: a.title || "اختبار بلا عنوان",
          date: a.available_date || "",
          duration: a.duration || "",
          questions: num(a.questions_count),
          unitTitle: a.unit_title || "",
          status: best ? "done" : "missing",
          best: best ? num(best.score) : null,
          bestAt: best?.completed_at || "",
          attempts: list.map((t: any) => ({
            score: num(t.score),
            status: t.status || "مكتمل",
            at: t.completed_at || "",
          })),
        };
      });
    const examTaken = examItems.filter((e: any) => e.status === "done");
    const examAvg = examTaken.length
      ? Math.round((examTaken.reduce((s: number, e: any) => s + e.best, 0) / examTaken.length) * 10) / 10
      : null;

    // ── 2) الواجبات: علامة / علامة قصوى ──
    const hwById: Record<string, any> = {};
    for (const s of hwSubs || []) hwById[s.assignment_id] = s;
    const hwItems = (assignments || [])
      .filter((a: any) => appliesTo(a, who, splitMap))
      .map((a: any) => {
        const sub = hwById[a.id] || null;
        const points = num(a.points, 20);
        return {
          id: a.id,
          title: a.title || "واجب بلا عنوان",
          points,
          dueDate: a.due_date || "",
          status: sub ? "done" : "missing",
          score: sub && typeof sub.score === "number" ? num(sub.score) : null,
          subStatus: sub?.status || "",
          submittedAt: sub?.submitted_at || "",
          feedback: sub?.feedback || "",
          hasAnswer: !!(sub?.answer && String(sub.answer).trim()),
        };
      });
    const hwDone = hwItems.filter((h: any) => h.status === "done");
    const hwEarned = hwDone.reduce((s: number, h: any) => s + (h.score ?? 0), 0);
    const hwPossible = hwItems.reduce((s: number, h: any) => s + h.points, 0);

    // ── 3) مهام الدفتر ──
    const nbById: Record<string, any> = {};
    for (const s of nbSubs || []) nbById[s.task_id] = s;
    const nbItems = (tasks || [])
      .filter((t: any) => appliesTo(t, who, splitMap))
      .map((t: any) => {
        const sub = nbById[t.id] || null;
        const points = num(t.points, 10);
        return {
          id: t.id,
          title: t.title || "مهمة بلا عنوان",
          points,
          dueDate: t.due_date || "",
          status: sub ? "done" : "missing",
          score: sub && typeof sub.score === "number" ? num(sub.score) : null,
          subStatus: sub?.status || "",
          submittedAt: sub?.submitted_at || "",
          feedback: sub?.feedback || "",
          photoCount: Array.isArray(sub?.photos) ? sub.photos.filter(Boolean).length : 0,
        };
      });
    const nbDone = nbItems.filter((t: any) => t.status === "done");
    const nbEarned = nbDone.reduce((s: number, t: any) => s + (t.score ?? 0), 0);
    const nbPossible = nbItems.reduce((s: number, t: any) => s + t.points, 0);

    // ── 4) التأسيس: مشاركته في كل مستوى ──
    const memberIds = new Set((fMembers || []).map((m: any) => m.section_id));
    const doneSet = new Set((fProgress || []).map((p: any) => p.lesson_id));
    const lessonsBySection: Record<string, string[]> = {};
    for (const l of fLessons || []) (lessonsBySection[l.section_id] ||= []).push(l.id);
    const levels = (sections || []).map((s: any) => {
      const ids = lessonsBySection[s.id] || [];
      const done = ids.filter((id) => doneSet.has(id)).length;
      return {
        id: s.id,
        title: s.title || "قسم بلا اسم",
        subtitle: s.subtitle || "",
        color: s.color || "#17413f",
        icon: s.icon || "sparkles",
        member: memberIds.has(s.id),
        done,
        total: ids.length,
        percent: ids.length ? Math.round((done / ids.length) * 100) : 0,
      };
    });
    const inLevels = levels.filter((l: any) => l.member);
    const fDone = inLevels.reduce((s: number, l: any) => s + l.done, 0);
    const fTotal = inLevels.reduce((s: number, l: any) => s + l.total, 0);

    // ── 5) المجاميع والتقدير ──
    const hwPct = pctOf(hwEarned, hwPossible);
    const nbPct = pctOf(nbEarned, nbPossible);
    const fPct = pctOf(fDone, fTotal);
    const parts = [examAvg, hwPct, nbPct, fPct].filter((v): v is number => typeof v === "number");
    const overall = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;

    const missing = {
      exams: examItems.filter((e: any) => e.status === "missing").map((e: any) => e.title),
      homework: hwItems.filter((h: any) => h.status === "missing").map((h: any) => h.title),
      notebook: nbItems.filter((t: any) => t.status === "missing").map((t: any) => t.title),
    };
    const missingCount = missing.exams.length + missing.homework.length + missing.notebook.length;
    // ── 6) المقارنة: متوسط زملائه (نفس الصف والمدرسة) لكل قسم ──
    let compare: ReturnType<typeof cohortCompare> = { count: 0, exams: null, homework: null, notebook: null, foundation: null, overall: null };
    try {
      const ctx = await loadReportCtx();
      const { data: cohort } = await supabaseQuery<any[]>('profiles?role=eq.student&limit=2000');
      const mates = (cohort || []).filter((c: any) => String(c.grade || '') === String(profile.grade || '') && String(c.school || '') === String(profile.school || ''));
      compare = cohortCompare(mates.map((c: any) => computeStudentRow(c, ctx)));
    } catch (err) {
      logger.warn({ err }, 'cohort compare failed, continuing without it');
    }


    res.json({
      student: {
        id: profile.id,
        name: profile.full_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        school: profile.school || '',
        grade: profile.grade || '',
        section: profile.section || '',
        gender: profile.gender || '',
        avatarUrl: profile.avatar_url || '',
        status: profile.status || "نشط",
        studentNumber: profile.student_number || '',
      },
      exams: { items: examItems, taken: examTaken.length, total: examItems.length, avg: examAvg },
      homework: { items: hwItems, done: hwDone.length, total: hwItems.length, earned: hwEarned, possible: hwPossible, percent: hwPct },
      notebook: { items: nbItems, done: nbDone.length, total: nbItems.length, earned: nbEarned, possible: nbPossible, percent: nbPct },
      foundation: { inFoundation: inLevels.length > 0, levels, done: fDone, total: fTotal, percent: fPct },
      missing: { ...missing, count: missingCount },
      overall: { percent: overall, level: levelOf(overall) },
      compare,
    });
  } catch (err: any) {
    logger.error({ err }, "GET teacher report student failed");
    res.status(500).json({ error: "تعذر تجهيز كشف الطالب" });
  }
});

export default router;
