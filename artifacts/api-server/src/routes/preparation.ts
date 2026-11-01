import { Router, type IRouter } from "express";
import { supabaseQuery } from "../lib/supabase";
import { requireAuth, type AuthInfo } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ============================================================================
// قسم التحضير — الأستاذ يرفع، المشرفة توقّع، المديرة تعتمِد
//   · التحضير للوحدة أو لأحد دروسها، في فترة يومية أو أسبوعية أو شهرية
//   · الصفوف: الثامن والتاسع والعاشر فقط — والوحدات والدروس تُقرأ من المنهاج
//   · لا يُمحى أثر: كل حركة تُكتب في preparation_events
// يتطلب sql_preparation_v1.sql — وبدونه تُرجع المسارات رسالة تنفيذ واضحة
// ============================================================================

const enc = (v: unknown): string => encodeURIComponent(String(v ?? ""));

export const PREP_GRADES = ["الصف الثامن", "الصف التاسع", "الصف العاشر"];
const PREP_TERMS = ["الفصل الأول", "الفصل الثاني"];
const PERIOD_TYPES = ["daily", "weekly", "monthly"];
const DOC_TYPES = ["pdf", "docx", "doc"];
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const SQL_HINT = "نفّذ ملف sql_preparation_v1.sql في Supabase SQL Editor أولاً";

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const AR_MONTHS = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "تشرين الثالث",
];

type PrepCapability = "teacher" | "supervisor" | "director";

/**
 * دور الحساب داخل التحضير: prep_role إن سُند صراحة، وإلا من الدور العام
 * (admin = أستاذ يرفع · observer = مشرفة توقّع). الطالب بلا أي وصول.
 * المديرة لا ترفع والأستاذ لا يوقّع — فصل الصلاحيات ضمانٌ في الخادم لا في الواجهة.
 */
export function prepCapability(auth: AuthInfo | null | undefined): PrepCapability | null {
  if (!auth) return null;
  const explicit = String(auth.prepRole || "").trim();
  if (explicit === "director") return "director";
  if (explicit === "supervisor") return "supervisor";
  if (explicit === "teacher") return auth.role === "admin" ? "teacher" : null;
  if (auth.role === "observer") return "supervisor";
  if (auth.role === "admin") return "teacher";
  return null;
}

const deny = (res: any, status: number, error: string, extra: Record<string, unknown> = {}) => {
  res.status(status).json({ error, ...extra });
};

/** حارس القسم: لا وصول لطالب، ولا حركة خارج دور صاحبها */
const requirePrep = (allowed: PrepCapability[]) => async (req: any, res: any, next: any) => {
  const auth = (req as any).auth as AuthInfo | undefined;
  if (!auth) {
    deny(res, 401, "سجل الدخول أولاً للمتابعة.");
    return;
  }
  const cap = prepCapability(auth);
  if (!cap) {
    deny(res, 403, "قسم التحضير للإدارة والمشرفين فقط.");
    return;
  }
  if (!allowed.includes(cap)) {
    deny(res, 403, "هذه الحركة لا تدخل في صلاحيتك داخل التحضير.");
    return;
  }
  req.prepCapability = cap;
  next();
};

// ── أدوات ────────────────────────────────────────────────────────────────────

const isUuid = (v: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());

/** رابط ملف مقبول: تخزين ImageKit أو مسار محلي — لا javascript: ولا data: */
function safeFileUrl(v: unknown): string {
  const raw = String(v || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, 500);
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return "";
    if (!/(^|\.)imagekit\.io$/i.test(u.hostname)) return "";
    return u.href.slice(0, 500);
  } catch {
    return "";
  }
}

function readSignatures(value: unknown): any[] {
  const arr =
    typeof value === "string"
      ? (() => { try { return JSON.parse(value); } catch { return []; } })()
      : value;
  return Array.isArray(arr) ? arr.filter((s) => s && typeof s === "object" && s.email) : [];
}

const sameEmail = (a: unknown, b: unknown) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** حالة التحضير محسوبة من محتواه — لا من حقل قد يتخلف عنه */
function computeState(p: any): string {
  if (!p.file_url) return "none";
  if (p.returned_at && (!p.uploaded_at || new Date(p.returned_at).getTime() > new Date(p.uploaded_at).getTime())) {
    return "returned";
  }
  if (readSignatures(p.director_signatures).length) return "approved";
  if (readSignatures(p.supervisor_signatures).length) return "awaiting_director";
  return "awaiting_supervisor";
}

function withState(prep: any, body: Record<string, unknown>) {
  return { ...body, state: computeState({ ...prep, ...body }) };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const prettyDay = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
const addDays = (d: Date, n: number) => {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + n);
  return next;
};

/**
 * مفتاح وعنوان ونطاق الفترة — من تاريخ يختاره الأستاذ.
 * الأسبوع يبدأ السبت (أسبوع الدراسة) وينتهي الخميس، والشهر تقويمي.
 */
export function buildPeriod(periodType: string, rawDate: unknown) {
  const d = new Date(String(rawDate || ""));
  if (Number.isNaN(d.getTime())) return null;
  if (periodType === "daily") {
    return {
      period_type: "daily",
      period_key: isoDay(d),
      period_label: `${AR_DAYS[d.getDay()]} ${prettyDay(d)}`,
      period_start: isoDay(d),
      period_end: isoDay(d),
    };
  }
  if (periodType === "weekly") {
    const start = addDays(d, -((d.getDay() + 1) % 7));
    const end = addDays(start, 5);
    return {
      period_type: "weekly",
      period_key: `week-${isoDay(start)}`,
      period_label: `أسبوع ${prettyDay(start)} – ${prettyDay(end)}`,
      period_start: isoDay(start),
      period_end: isoDay(end),
    };
  }
  if (periodType === "monthly") {
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      period_type: "monthly",
      period_key: key,
      period_label: `شهر ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      period_start: `${key}-01`,
      period_end: isoDay(last),
    };
  }
  return null;
}

const PREP_COLUMNS =
  "id,target_id,target_title,course_id,grade,term,unit_title,unit_no,period_type,period_key,period_label,period_start,period_end,file_url,file_name,file_type,file_size,teacher_note,uploaded_by_name,uploaded_by_email,uploaded_at,supervisor_signatures,director_signatures,return_note,returned_by_name,returned_by_email,returned_at,state,updated_at";

function prepToJson(p: any) {
  return {
    id: p.id,
    targetId: p.target_id || p.course_id,
    targetTitle: p.target_title || p.unit_title || "",
    courseId: p.course_id,
    grade: p.grade || "",
    term: p.term || "",
    unitTitle: p.unit_title || "",
    unitNo: Number(p.unit_no) || 1,
    periodType: p.period_type || "weekly",
    periodKey: p.period_key || "",
    periodLabel: p.period_label || "تحضير الوحدة",
    periodStart: p.period_start || null,
    periodEnd: p.period_end || null,
    fileUrl: p.file_url || "",
    fileName: p.file_name || "",
    fileType: p.file_type || "",
    fileSize: Number(p.file_size) || 0,
    teacherNote: p.teacher_note || "",
    uploadedByName: p.uploaded_by_name || "",
    uploadedByEmail: p.uploaded_by_email || "",
    uploadedAt: p.uploaded_at || null,
    supervisorSignatures: readSignatures(p.supervisor_signatures),
    directorSignatures: readSignatures(p.director_signatures),
    returnNote: p.return_note || "",
    returnedByName: p.returned_by_name || "",
    returnedByEmail: p.returned_by_email || "",
    returnedAt: p.returned_at || null,
    state: p.state && p.state !== "none" ? String(p.state) : computeState(p),
    updatedAt: p.updated_at || null,
  };
}

function isMissingTables(error: unknown): boolean {
  const t = String(error || "");
  return /(preparations?|preparation_events)/.test(t) && /(does not exist|relation|Could not find|schema cache)/i.test(t);
}

/** الجداول غير منفّذة بعد — رسالة واحدة متكررة في كل المسارات */
function sqlGuard(err: any, res: any, route: string): boolean {
  if (!isMissingTables(err?.message)) return false;
  deny(res, 503, `جداول التحضير غير بعدُ — ${SQL_HINT}.`, { needsSql: true });
  logger.warn({ route }, "قسم التحضير يحتاج تنفيذ SQL");
  return true;
}

async function logEvent(
  prep: { id?: string | null; course_id?: string | null },
  auth: AuthInfo,
  action: string,
  opts: { note?: string; meta?: Record<string, unknown>; capability?: string } = {},
) {
  const { error } = await supabaseQuery("preparation_events", {
    method: "POST",
    body: [
      {
        preparation_id: prep.id || null,
        course_id: prep.course_id || null,
        action,
        actor_name: auth.fullName || auth.email,
        actor_email: auth.email,
        actor_role: opts.capability || auth.role,
        note: String(opts.note || "").slice(0, 500),
        meta: opts.meta || {},
      },
    ],
  });
  if (error) logger.error({ error, action }, "تعذّر تسجيل حدث تحضيري");
}

async function loadPreparation(id: string) {
  const { data, error } = await supabaseQuery<any[]>(
    `preparations?id=eq.${enc(id)}&select=${PREP_COLUMNS}&limit=1`,
  );
  if (error) throw new Error(String(error));
  return data?.[0] || null;
}

/** وحدات المنهاج ودروسها + تحضيراتها — التحضير على مستوى الوحدة، والدروس مرجع */
async function loadUnits(grade: string, term: string) {
  const { data: courses, error } = await supabaseQuery<any[]>(
    `courses?select=id,title,grade,term,sort_order,lessons_count&grade=eq.${enc(grade)}&term=eq.${enc(term)}&order=sort_order.asc&limit=100`,
  );
  if (error) throw new Error(String(error));
  const list = (courses || []).filter((c) => PREP_GRADES.includes(c.grade));
  const ids = list.map((c: any) => `"${c.id}"`).join(",");

  const [lessonsRes, prepsRes] = await Promise.all([
    ids
      ? supabaseQuery<any[]>(`lessons?select=id,course_id,title,position&course_id=in.(${ids})&order=course_id.asc,position.asc&limit=1200`)
      : Promise.resolve({ data: [] as any[], error: null }),
    ids
      ? supabaseQuery<any[]>(
          `preparations?select=${PREP_COLUMNS}&course_id=in.(${ids})&order=period_start.desc,unit_no.asc&limit=1500`,
        )
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if ((lessonsRes as any).error) throw new Error(String((lessonsRes as any).error));
  if ((prepsRes as any).error) throw new Error(String((prepsRes as any).error));

  const lessonsByUnit = new Map<string, any[]>();
  ((lessonsRes as any).data || []).forEach((l: any) => {
    const key = String(l.course_id);
    lessonsByUnit.set(key, [...(lessonsByUnit.get(key) || []), { id: l.id, title: l.title || "", position: Number(l.position) || 0 }]);
  });

  const prepsByUnit = new Map<string, any[]>();
  const records = ((prepsRes as any).data || []).map(prepToJson);
  records.forEach((r: any) => {
    const key = String(r.courseId);
    prepsByUnit.set(key, [...(prepsByUnit.get(key) || []), r]);
  });

  const units = list.map((c: any) => {
    const lessons = lessonsByUnit.get(String(c.id)) || [];
    const unitPreps = prepsByUnit.get(String(c.id)) || [];
    return {
      courseId: c.id,
      title: c.title || "",
      grade: c.grade || "",
      term: c.term || "",
      unitNo: Number(c.sort_order) || 1,
      lessonsCount: lessons.length || Number(c.lessons_count) || 0,
      lessons,
      preparations: unitPreps,
      summary: {
        unitPrepared: unitPreps.some((p: any) => p.state !== "none"),
        awaiting: unitPreps.filter((p: any) => p.state === "awaiting_supervisor" || p.state === "returned").length,
        awaitingDirector: unitPreps.filter((p: any) => p.state === "awaiting_director").length,
        approved: unitPreps.filter((p: any) => p.state === "approved").length,
        total: unitPreps.filter((p: any) => p.state !== "none").length,
      },
    };
  });

  const count = (s: string) => records.filter((p: any) => p.state === s).length;
  return {
    units,
    stats: {
      units: units.length,
      preparedUnits: units.filter((u: any) => u.summary.unitPrepared).length,
      lessons: units.reduce((sum: number, u: any) => sum + u.lessonsCount, 0),
      records: records.length,
      awaitingSupervisor: count("awaiting_supervisor") + count("returned"),
      awaitingDirector: count("awaiting_director"),
      approved: count("approved"),
    },
  };
}

// ── ١) وحدات التحضير ودروسها ────────────────────────────────────────────────

router.get("/teacher/prep/units", requireAuth, requirePrep(["teacher", "supervisor", "director"]), async (req, res) => {
  try {
    const auth = (req as any).auth as AuthInfo;
    const grade = PREP_GRADES.includes(String(req.query.grade)) ? String(req.query.grade) : PREP_GRADES[0];
    const term = PREP_TERMS.includes(String(req.query.term)) ? String(req.query.term) : PREP_TERMS[0];
    const { units, stats } = await loadUnits(grade, term);
    res.json({
      capability: (req as any).prepCapability,
      account: { name: auth.fullName || auth.email, email: auth.email, role: auth.role },
      grades: PREP_GRADES,
      terms: PREP_TERMS,
      grade,
      term,
      units,
      stats,
    });
  } catch (err: any) {
    if (sqlGuard(err, res, "units")) return;
    logger.error({ err }, "GET /teacher/prep/units failed");
    deny(res, 500, "تعذّر جلب وحدات التحضير.");
  }
});

// ── ٢) سجل التحضير — كل التحضيرات في صفحة واحدة قابلة للتصفية ────────────────

router.get("/teacher/prep/ledger", requireAuth, requirePrep(["teacher", "supervisor", "director"]), async (req, res) => {
  try {
    const grades = String(req.query.grade || "")
      .split("|")
      .filter((g) => PREP_GRADES.includes(g));
    const gradeIn = (grades.length ? grades : PREP_GRADES).map((g) => `"${g}"`).join(",");
    let endpoint = `preparations?select=${PREP_COLUMNS}&grade=in.(${gradeIn})&order=period_start.desc,unit_no.asc&limit=800`;
    if (PREP_TERMS.includes(String(req.query.term))) endpoint += `&term=eq.${enc(String(req.query.term))}`;
    if (PERIOD_TYPES.includes(String(req.query.periodType))) endpoint += `&period_type=eq.${enc(String(req.query.periodType))}`;
    const { data, error } = await supabaseQuery<any[]>(endpoint);
    if (error) throw new Error(String(error));
    const items = (data || []).map(prepToJson);
    res.json({ items, total: items.length, periodTypes: PERIOD_TYPES });
  } catch (err: any) {
    if (sqlGuard(err, res, "ledger")) return;
    logger.error({ err }, "GET /teacher/prep/ledger failed");
    deny(res, 500, "تعذّر جلب سجل التحضير.");
  }
});

// ── ٣) ملف التحضير — للأستاذ وحده ───────────────────────────────────────────

router.post("/teacher/prep/document", requireAuth, requirePrep(["teacher"]), async (req, res) => {
  try {
    const auth = (req as any).auth as AuthInfo;
    const b = req.body || {};
    const courseId = String(b.courseId || b.targetId || "").trim();
    const period = buildPeriod(String(b.periodType || ""), b.date);
    if (!isUuid(courseId) || !period) {
      deny(res, 400, "حدد الوحدة، والتاريخ الصحيح للفترة (يوم أو أسبوع أو شهر).");
      return;
    }
    const fileUrl = safeFileUrl(b.fileUrl);
    const ext = String(b.fileType || String(b.fileName || "").split(".").pop() || "").toLowerCase();
    if (!fileUrl || !DOC_TYPES.includes(ext)) {
      deny(res, 400, "الملف مرفوض — المقبول PDF أو وورد (docx/doc) من تخزين المنصة.");
      return;
    }
    const size = Number(b.fileSize) || 0;
    if (size > MAX_FILE_BYTES) {
      deny(res, 400, "حجم الملف يتجاوز ٣٠ ميجابايت.");
      return;
    }

    // الوحدة المحضَّرة لازم تكون من صفوف التحضير — وإلا يُرفض الحفظ
    const { data: courseRows, error: courseError } = await supabaseQuery<any[]>(
      `courses?select=id,title,grade,term,sort_order&id=eq.${enc(courseId)}&limit=1`,
    );
    if (courseError) throw new Error(String(courseError));
    const unit = courseRows?.[0] || null;
    if (!unit || !PREP_GRADES.includes(unit.grade)) {
      deny(res, 400, "هذه الوحدة ليست ضمن صفوف التحضير (الثامن والتاسع والعاشر).");
      return;
    }

    const now = new Date().toISOString();
    const unitTitle = String(unit.title || "").slice(0, 220);
    const fields = {
      file_url: fileUrl,
      file_name: String(b.fileName || "").slice(0, 220),
      file_type: ext,
      file_size: size,
      teacher_note: String(b.note || "").slice(0, 1000),
      uploaded_by_name: auth.fullName || auth.email,
      uploaded_by_email: auth.email,
      uploaded_at: now,
      // رفع جديد يبدأ دورة التوقيع من أولها — لا يُوقَّع على ملف لم يعد موجوداً
      supervisor_signatures: [],
      director_signatures: [],
      return_note: "",
      returned_by_name: "",
      returned_by_email: "",
      returned_at: null,
      updated_at: now,
    };
    const { data: existing } = await supabaseQuery<any[]>(
      `preparations?target_id=eq.${enc(courseId)}&period_key=eq.${enc(period.period_key)}&select=id,file_url&limit=1`,
    );
    const prev = existing?.[0] || null;
    let recordId = prev?.id || "";
    const action = prev?.file_url ? "replaced" : "uploaded";
    if (prev) {
      const { error } = await supabaseQuery(`preparations?id=eq.${enc(prev.id)}`, {
        method: "PATCH",
        body: withState(
          { file_url: prev.file_url, uploaded_at: null, returned_at: null, supervisor_signatures: [], director_signatures: [] },
          fields,
        ),
      });
      if (error) throw new Error(String(error));
    } else {
      const row = {
        target_id: unit.id,
        target_type: "unit",
        target_title: unitTitle,
        course_id: unit.id,
        lesson_id: null,
        grade: unit.grade || "",
        term: unit.term || "",
        unit_title: unit.title || "",
        unit_no: Number(unit.sort_order) || 1,
        lesson_no: null,
        ...period,
        ...fields,
        state: "awaiting_supervisor",
      };
      const { data: created, error } = await supabaseQuery("preparations", { method: "POST", body: [row] });
      if (error) throw new Error(String(error));
      recordId = created?.[0]?.id || "";
    }
    if (recordId) {
      await logEvent({ id: recordId, course_id: unit.id }, auth, action, {
        note: `${fields.file_name} — وحدة: ${unitTitle} · ${period.period_label}`,
        meta: { file_url: fileUrl, file_type: ext, file_size: size, period },
        capability: "teacher",
      });
    }
    const fresh = recordId ? await loadPreparation(recordId) : null;
    res.json({
      success: true,
      message: action === "replaced" ? "تم استبدال ملف التحضير ✓" : "تم رفع ملف التحضير ✓",
      unit: fresh ? prepToJson(fresh) : null,
    });
  } catch (err: any) {
    if (sqlGuard(err, res, "document")) return;
    logger.error({ err }, "POST /teacher/prep/document failed");
    deny(res, 500, "تعذّر حفظ ملف التحضير.");
  }
});

router.post("/teacher/prep/document/delete", requireAuth, requirePrep(["teacher"]), async (req, res) => {
  try {
    const auth = (req as any).auth as AuthInfo;
    const id = String((req.body || {}).preparationId || "").trim();
    if (!isUuid(id)) {
      deny(res, 400, "معرّف تحضير غير صالح.");
      return;
    }
    const prep = await loadPreparation(id);
    if (!prep) {
      deny(res, 404, "هذا التحضير غير موجود.");
      return;
    }
    if (readSignatures(prep.director_signatures).length) {
      deny(res, 400, "تحضير معتمَد من المديرة — لا يُمسح. راجعها لسحب الاعتماد.");
      return;
    }
    await logEvent({ id: prep.id, course_id: prep.course_id }, auth, "removed", {
      note: `${prep.file_name || ""} — ${prep.target_title || ""} · ${prep.period_label || ""}`,
      meta: { file_url: prep.file_url },
      capability: "teacher",
    });
    const { error } = await supabaseQuery(`preparations?id=eq.${enc(id)}`, { method: "DELETE" });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "أُزيل ملف التحضير" });
  } catch (err: any) {
    if (sqlGuard(err, res, "document/delete")) return;
    logger.error({ err }, "POST /teacher/prep/document/delete failed");
    deny(res, 500, "تعذّر إزالة الملف.");
  }
});

// ── ٤) التوقيع والاعتماد ────────────────────────────────────────────────────

router.post("/teacher/prep/sign", requireAuth, requirePrep(["supervisor", "director"]), async (req, res) => {
  try {
    const auth = (req as any).auth as AuthInfo;
    const cap = (req as any).prepCapability as PrepCapability;
    const b = req.body || {};
    const id = String(b.preparationId || "").trim();
    const stage = b.stage === "director" ? "director" : "supervisor";
    const decision = ["sign", "unsign", "return"].includes(String(b.decision)) ? String(b.decision) : "";
    if (!isUuid(id) || !decision) {
      deny(res, 400, "طلب توقيع غير مكتمل.");
      return;
    }
    // لا تتجاوز المشرفة دورها ولا تُقبل المديرة قبل توقيع الإشراف
    if (cap !== stage) {
      deny(res, 403, cap === "supervisor" ? "المشرفة توقّع مرحلة الإشراف فقط." : "المديرة تعتمد المرحلة النهائية فقط.");
      return;
    }
    const prep = await loadPreparation(id);
    if (!prep) {
      deny(res, 404, "هذا التحضير غير موجود.");
      return;
    }
    if (!prep.file_url) {
      deny(res, 400, "لا يوجد ملف تحضير بعد — لا توقيع على فراغ.");
      return;
    }
    const note = String(b.note || "").slice(0, 1000);
    const column = stage === "director" ? "director_signatures" : "supervisor_signatures";
    const all = readSignatures(prep[column]);
    const others = all.filter((s) => !sameEmail(s.email, auth.email));
    const mine = all.find((s) => sameEmail(s.email, auth.email));

    if (stage === "director" && decision !== "return" && !readSignatures(prep.supervisor_signatures).length) {
      deny(res, 400, "بانتظار توقيع المشرفة أولاً.");
      return;
    }
    if (decision === "unsign" && stage === "supervisor" && readSignatures(prep.director_signatures).length) {
      deny(res, 400, "التحضير معتمَد من المديرة — يُسحب اعتمادها أولاً.");
      return;
    }
    if (decision === "sign" && mine) {
      res.json({ success: true, message: "توقيعك مسجّل سابقاً ✓", unit: prepToJson(prep) });
      return;
    }
    if (decision === "unsign" && !mine) {
      res.json({ success: true, message: "لا توقيع لك لمسحه", unit: prepToJson(prep) });
      return;
    }
    if (decision === "return" && !note) {
      deny(res, 400, "الإرجاع يحتاج ملاحظة تصل إلى الأستاذ.");
      return;
    }

    const now = new Date().toISOString();
    const body: Record<string, unknown> = { updated_at: now };
    let action = "";
    if (decision === "sign") {
      body[column] = [...others, { name: auth.fullName || auth.email, email: auth.email, signed_at: now, note }];
      action = `signed_${stage}`;
      if (prep.returned_at) {
        // توقيع على ملفٍ معدّل بعد الإرجاع: تُطوى صفحة الإرجاع
        body.return_note = "";
        body.returned_by_name = "";
        body.returned_by_email = "";
        body.returned_at = null;
      }
    } else if (decision === "unsign") {
      body[column] = others;
      action = `unsigned_${stage}`;
    } else {
      body.director_signatures = [];
      body.supervisor_signatures = [];
      body.return_note = note;
      body.returned_by_name = auth.fullName || auth.email;
      body.returned_by_email = auth.email;
      body.returned_at = now;
      action = "returned";
    }

    const { error } = await supabaseQuery(`preparations?id=eq.${enc(prep.id)}`, {
      method: "PATCH",
      body: withState(prep, body),
    });
    if (error) throw new Error(String(error));
    await logEvent({ id: prep.id, course_id: prep.course_id }, auth, action, {
      note: decision === "unsign" ? "" : note,
      meta: { stage, period_label: prep.period_label, target_title: prep.target_title },
      capability: cap,
    });
    const fresh = await loadPreparation(id);
    const message =
      decision === "sign"
        ? stage === "director"
          ? "تم اعتماد التحضير ✓"
          : "تم توقيع المشرفة على التحضير ✓"
        : decision === "return"
          ? "أُعيد التحضير إلى الأستاذ مع ملاحظتك"
          : "سُحب التوقيع";
    res.json({ success: true, message, unit: fresh ? prepToJson(fresh) : null });
  } catch (err: any) {
    if (sqlGuard(err, res, "sign")) return;
    logger.error({ err }, "POST /teacher/prep/sign failed");
    deny(res, 500, "تعذّر تسجيل التوقيع.");
  }
});

// ── ٥) سجل التدقيق ──────────────────────────────────────────────────────────

router.get("/teacher/prep/events", requireAuth, requirePrep(["teacher", "supervisor", "director"]), async (req, res) => {
  try {
    const courseId = String(req.query.courseId || "").trim();
    const preparationId = String(req.query.preparationId || "").trim();
    if (!isUuid(courseId) && !isUuid(preparationId)) {
      deny(res, 400, "حدد وحدة أو تحضيراً.");
      return;
    }
    const filter = isUuid(preparationId) ? `preparation_id=eq.${enc(preparationId)}` : `course_id=eq.${enc(courseId)}`;
    const { data, error } = await supabaseQuery<any[]>(
      `preparation_events?select=action,actor_name,actor_email,actor_role,note,meta,created_at&${filter}&order=created_at.desc&limit=100`,
    );
    if (error) throw new Error(String(error));
    res.json({
      events: (data || []).map((e) => ({
        action: e.action,
        actorName: e.actor_name || "",
        actorEmail: e.actor_email || "",
        actorRole: e.actor_role || "",
        note: e.note || "",
        meta: e.meta || {},
        at: e.created_at,
      })),
    });
  } catch (err: any) {
    if (sqlGuard(err, res, "events")) return;
    logger.error({ err }, "GET /teacher/prep/events failed");
    deny(res, 500, "تعذّر جلب السجل.");
  }
});

// ── ٦) خلية التحضير — من يوقّع ومن يعتمِد (لأستاذ المنصة) ───────────────────

const PREP_ROLE_LABEL: Record<string, string> = {
  teacher: "أستاذ — يرفع التحضير",
  supervisor: "مشرفة — توقّع التحضير",
  director: "مديرة — اعتماد نهائي",
};

router.get("/teacher/prep/cell", requireAuth, requirePrep(["teacher"]), async (_req, res) => {
  const map = (p: any) => ({
    email: p.email || "",
    name: p.full_name || p.email || "",
    role: p.role || "",
    prepRole: p.prep_role || "",
    capability: prepCapability(p as AuthInfo) || "none",
    avatarUrl: p.avatar_url || "",
  });
  try {
    const { data, error } = await supabaseQuery<any[]>(
      `profiles?select=email,full_name,role,prep_role,avatar_url&or=(role.eq.admin,role.eq.observer)&order=role.asc,created_at.asc&limit=100`,
    );
    if (error) throw new Error(String(error));
    res.json({ roles: PREP_ROLE_LABEL, members: (data || []).map(map) });
  } catch (err: any) {
    if (!/prep_role/.test(String(err?.message))) {
      if (sqlGuard(err, res, "cell")) return;
      logger.error({ err }, "GET /teacher/prep/cell failed");
      deny(res, 500, "تعذّر جلب خلية التحضير.");
      return;
    }
    // العمود غير موجود بعد = SQL لم يُنفَّذ: القائمة تعمل بدونه مع التنبيه
    const { data, error } = await supabaseQuery<any[]>(
      `profiles?select=email,full_name,role,avatar_url&or=(role.eq.admin,role.eq.observer)&order=role.asc,created_at.asc&limit=100`,
    );
    if (error) {
      logger.error({ error }, "GET /teacher/prep/cell fallback failed");
      deny(res, 500, "تعذّر جلب خلية التحضير.");
      return;
    }
    res.json({ roles: PREP_ROLE_LABEL, needsSql: true, members: (data || []).map(map) });
  }
});

router.patch("/teacher/prep/cell", requireAuth, requirePrep(["teacher"]), async (req, res) => {
  try {
    const auth = (req as any).auth as AuthInfo;
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase();
    const next = ["teacher", "supervisor", "director", ""].includes(String(b.prepRole)) ? String(b.prepRole) : null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || next === null) {
      deny(res, 400, "بيانات غير صالحة.");
      return;
    }
    if (sameEmail(email, auth.email)) {
      deny(res, 400, "لا تُعدّل دور حسابك — حمايةً من أن تُغلق القسم على نفسك.");
      return;
    }
    const { data: rows, error: findError } = await supabaseQuery<any[]>(
      `profiles?select=id,email,full_name,role&email=eq.${enc(email)}&or=(role.eq.admin,role.eq.observer)&limit=1`,
    );
    if (findError) throw new Error(String(findError));
    const target = rows?.[0];
    if (!target) {
      deny(res, 404, "هذا الحساب ليس ضمن إدارة الموقع أو الإشراف.");
      return;
    }
    const { error } = await supabaseQuery(`profiles?id=eq.${enc(target.id)}`, {
      method: "PATCH",
      body: { prep_role: next || null },
    });
    if (error) throw new Error(String(error));
    await logEvent({}, auth, "role_changed", {
      note: `${target.full_name || target.email}: ${next || "تلقائي"}`,
      capability: "teacher",
    });
    res.json({ success: true, message: `تم تحديث دور ${target.full_name || target.email}` });
  } catch (err: any) {
    if (/prep_role/.test(String(err?.message))) {
      deny(res, 503, `الأدوار تُضبط بعد تنفيذ ${SQL_HINT}.`, { needsSql: true });
      return;
    }
    if (sqlGuard(err, res, "cell")) return;
    logger.error({ err }, "PATCH /teacher/prep/cell failed");
    deny(res, 500, "تعذّر تحديث الدور.");
  }
});

export default router;
