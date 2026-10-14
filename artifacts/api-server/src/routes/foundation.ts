import { Router, type IRouter } from "express";
import { supabaseQuery } from "../lib/supabase";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ============================================================================
// قسم "التأسيس" — قسم خاص لمجموعة يختارها الأستاذ بالاسم.
// لا وحدات ولا واجبات ولا اختبارات هنا: دروس فقط (نص/صورة/فيديو/HTML/مختلط).
//
// قاعدة الحماية: الوصول لا يُشتق من أي مُعامل في الرابط ولا من تمرير student_id.
// مصدر الحقيقة الوحيد = سطر واحد في foundation_members باسم الطالب نفسه.
// أي طالب مرّر id قسماً لا ينتمي إليه يُردّ عليه 404 فوراً (لا نكشف وجود القسم أصلاً).
// ============================================================================

const enc = (v: string | string[] | undefined): string =>
  encodeURIComponent(Array.isArray(v) ? v[0] ?? "" : v ?? "");

const V7_HINT = "نفّذ الملف sql_foundation_v7.sql في Supabase ← SQL Editor أولاً.";
const V10_HINT = "نفّذ الملف sql_foundation_units_v10.sql في Supabase ← SQL Editor لتفعيل الأقسام الفرعية.";

const KINDS = new Set(["text", "image", "video", "html", "mixed"]);
const kindOf = (v: unknown): string => {
  const k = String(v || "text").toLowerCase();
  return KINDS.has(k) ? k : "text";
};

/** قائمة JSONB قد تصل نصاً أو مصفوفة — نطبّعها دائماً */
function jsonList(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ذاكرة صلاحية خفيفة: فحص "هل أنا عضو؟" يتكرر مع كل فتح — نخزّنه 15 ثانية
// حتى يفتح الطالب أقسامه فوراً، ويبطُل فور تعديل الأستاذ للأعضاء.
// ────────────────────────────────────────────────────────────────────────────
type AccessEntry = { ok: boolean; at: number };
const accessCache = new Map<string, AccessEntry>();
const ACCESS_TTL = 15 * 1000;
const ACCESS_MAX = 5000;

function cacheKey(sectionId: string, userId: string) {
  return `${sectionId}::${userId}`;
}

/** يُستدعى بعد أي تعديل على الأعضاء حتى لا ينتظر الطالب fifteen ثانية */
export function invalidateFoundationAccess(sectionId?: string | null, userId?: string | null): void {
  if (!sectionId) {
    accessCache.clear();
    return;
  }
  for (const key of accessCache.keys()) {
    if (key.startsWith(`${sectionId}::`) || (userId && key.endsWith(`::${userId}`))) {
      accessCache.delete(key);
    }
  }
}

/** فحص صلاحية الطالب في قسم — استعلام واحد مفهرس (أقل من جزء من الثانية) */
export async function hasAccess(sectionId: string, userId: string): Promise<boolean> {
  if (!sectionId || !userId) return false;
  const key = cacheKey(sectionId, userId);
  const now = Date.now();
  const hit = accessCache.get(key);
  if (hit && now - hit.at < ACCESS_TTL) return hit.ok;

  let ok = false;
  try {
    const { data, error } = await supabaseQuery<any[]>(
      `foundation_members?section_id=eq.${enc(sectionId)}&user_id=eq.${enc(userId)}&select=id&limit=1`,
    );
    if (error) {
      logger.warn({ error, sectionId }, "foundation access check failed");
      return false;
    }
    ok = Array.isArray(data) && data.length > 0;
  } catch (err) {
    logger.warn({ err, sectionId }, "foundation access check threw");
    return false;
  }

  if (accessCache.size >= ACCESS_MAX) accessCache.clear();
  accessCache.set(key, { ok, at: now });
  return ok;
}

/** middleware: الطالب داخل قسم لا يخصّه يُمنع فوراً — نردّ 404 لا 403 حتى لا نكشف أن القسم موجود أصلاً */
async function requireFoundationAccess(req: any, res: any, next: any) {
  try {
    const auth = (req as AuthedRequest).auth;
    if (!auth?.userId) {
      res.status(401).json({ error: "سجل الدخول أولاً للمتابعة." });
      return;
    }
    if (auth.role === "admin") {
      // الأستاذ معاينته لكل أقسامه — بلا استعلام إضافي
      next();
      return;
    }
    const sectionId = String(req.params?.id || req.params?.sectionId || "");
    const ok = await hasAccess(sectionId, auth.userId);
    if (!ok) {
      // لا نكشف وجود القسم أصلاً — 404 أأمن من 403 في قسم خاص
      res.status(404).json({ error: "هذا القسم غير متاح لحسابك." });
      return;
    }
    next();
  } catch (err: any) {
    logger.error({ err }, "requireFoundationAccess failed");
    res.status(500).json({ error: "تعذر التحقق من صلاحية القسم — " + V7_HINT });
  }
}

function sectionToJson(s: any) {
  return {
    id: s.id,
    title: s.title || "قسم بلا اسم",
    subtitle: s.subtitle || "",
    description: s.description || "",
    coverUrl: s.cover_url || "",
    color: s.color || "#17413f",
    icon: s.icon || "sparkles",
    sortOrder: s.sort_order ?? 1,
    isLocked: !!s.is_locked,
    isVisible: s.is_visible !== false,
    isPublished: s.is_published !== false,
    createdAt: s.created_at || null,
    updatedAt: s.updated_at || null,
  };
}

function unitToJson(u: any) {
  return {
    id: u.id,
    sectionId: u.section_id,
    title: u.title || "قسم فرعي بلا اسم",
    description: u.description || "",
    coverUrl: u.cover_url || "",
    color: u.color || "",
    icon: u.icon || "book-open",
    sortOrder: u.sort_order ?? 1,
    isLocked: !!u.is_locked,
    isVisible: u.is_visible !== false,
    isVirtual: false,
  };
}

/** قسم فرعي وهمي يحوي دروس المستوى كلّها — يُستخدم قبل تنفيذ ملف V10 فقط */
function virtualUnit(sectionId: string): any {
  return {
    id: `__flat__${sectionId}`,
    section_id: sectionId,
    title: "دروس المستوى",
    description: "",
    cover_url: "",
    color: "",
    icon: "book-open",
    sort_order: 1,
    is_locked: false,
    is_visible: true,
  };
}

// ---------------------------------------------------------------------------
// بنية التأسيس ثلاثية المستويات: القسم ← القسم الفرعي ← الدرس.
// جدول foundation_units أُضيف في ملف V10. قبل تنفيذه نعمل مسطّحاً: قسم
// فرعي واحد وهمي لكل مستوى يحمل دروسه — فالموقع لا ينكسر أبداً، ويصحّ
// وحده تلقائياً بعد تنفيذ الملف.
// ---------------------------------------------------------------------------
let unitsTableCheckAt = 0;
let unitsTableReady = false;
const UNITS_TABLE_TTL = 60 * 1000;

export async function hasUnitsTable(): Promise<boolean> {
  if (Date.now() - unitsTableCheckAt < UNITS_TABLE_TTL) return unitsTableReady;
  unitsTableCheckAt = Date.now();
  const { error } = await supabaseQuery("foundation_units?select=id&limit=1");
  unitsTableReady = !error;
  if (!unitsTableReady) logger.warn({ hint: V10_HINT }, "foundation_units not ready — running flat");
  return unitsTableReady;
}

function lessonToJson(l: any, opts: { full?: boolean; done?: boolean } = {}) {
  const images = jsonList(l.images);
  const base = {
    id: l.id,
    sectionId: l.section_id,
    unitId: l.unit_id || `__flat__${l.section_id}`,
    title: l.title || "درس بلا اسم",
    description: l.description || "",
    kind: kindOf(l.kind),
    position: l.position ?? 1,
    isLocked: !!l.is_locked,
    isVisible: l.is_visible !== false,
    done: !!opts.done,
  };
  if (!opts.full) {
    // بطاقة مختصرة للقائمة — بدون المحتوى الثقيل
    return {
      ...base,
      coverUrl: l.cover_url || "",
      imageCount: images.length,
      hasVideo: !!l.video_url,
      hasHtml: !!l.html_content || !!l.html_file_url,
      textPreview: String(l.body_text || "").slice(0, 140),
    };
  }
  return {
    ...base,
    coverUrl: l.cover_url || "",
    bodyText: l.body_text || "",
    images,
    videoUrl: l.video_url || "",
    videoCaption: l.video_caption || "",
    htmlContent: l.html_content || "",
    htmlFileUrl: l.html_file_url || "",
  };
}

// ============================================================================
// واجهة الطالب
// ============================================================================

/** يبني شجرة القسم ← الأقسام الفرعية ← الدروس مع عدّاداتها.
 *  بدون جدول الأقسام الفرعية يبني شجرة مسطّحة: قسم فرعي واحد لكل مستوى. */
function buildSectionTree(
  sections: any[],
  lessons: any[],
  done: Set<string>,
  opts: { units: any[] | null; memberCount?: Record<string, number> },
) {
  const lessonsByUnit: Record<string, any[]> = {};
  const unitIds = new Set((opts.units || []).map((u: any) => u.id));
  for (const l of lessons) {
    // درس بلا قسم فرعي (أُنشئ قبل V10 أو حُذف قسمه) ينزل في القسم الفرعي الأول
    const key = unitIds.has(l.unit_id) ? l.unit_id : `__first__${l.section_id}`;
    (lessonsByUnit[key] ||= []).push(l);
  }

  return sections.map((s: any) => {
    const sectionUnits = opts.units
      ? (opts.units || []).filter((u: any) => u.section_id === s.id)
      : [];

    let units = sectionUnits
      .map((u: any) => {
        const list = [...(lessonsByUnit[u.id] || [])];
        // دروس بلا قسم فرعي تُلحق بأول قسم فرعي ظاهر في المستوى
        const orphans = lessonsByUnit[`__first__${s.id}`] || [];
        if (u === sectionUnits[0]) list.push(...orphans);
        const doneCount = list.filter((l: any) => done.has(l.id)).length;
        return {
          ...unitToJson(u),
          lessonsCount: list.length,
          doneCount,
          totalCount: list.length,
          lessons: list.map((l: any) => lessonToJson(l, { full: true, done: done.has(l.id) })),
        };
      })
      .sort((a: any, b: any) => (a.sortOrder ?? 1) - (b.sortOrder ?? 1));

    // مستوى بلا أقسام فرعية بعد (فارغ أو جدول غير منفّذ) → قسم وهمي واحد
    if (!units.length) {
      const list = lessons.filter((l: any) => l.section_id === s.id);
      const doneCount = list.filter((l: any) => done.has(l.id)).length;
      units = [
        {
          ...unitToJson(virtualUnit(s.id)),
          isVirtual: true,
          lessonsCount: list.length,
          doneCount,
          totalCount: list.length,
          lessons: list.map((l: any) => lessonToJson(l, { full: true, done: done.has(l.id) })),
        },
      ];
    }

    const totalCount = units.reduce((a: number, u: any) => a + u.totalCount, 0);
    const doneCount = units.reduce((a: number, u: any) => a + u.doneCount, 0);
    return {
      ...sectionToJson(s),
      memberCount: opts.memberCount?.[s.id] || 0,
      lessonsCount: totalCount,
      doneCount,
      totalCount,
      unitsCount: units.length,
      units,
    };
  });
}

/** أقسام التأسيس المسموحة لهذا الطالب فقط — فحص واحد مفهرس ثم قراءة القسم */
router.get("/foundation/sections", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth!;

    // الأستاذ معاين: يرى كل أقسامه غير المخفية
    if (auth.role === "admin") {
      const { data } = await supabaseQuery<any[]>(
        "foundation_sections?is_visible=eq.true&order=sort_order.asc&limit=200",
      );
      res.json((data || []).map((s) => ({ ...sectionToJson(s), memberCount: 0, lessonsCount: 0, doneCount: 0, totalCount: 0 })));
      return;
    }

    // الطالب: صفوف العضوية وحدها (لاexists-check مكلف)
    const { data: memberships, error: memErr } = await supabaseQuery<any[]>(
      `foundation_members?user_id=eq.${enc(auth.userId)}&select=section_id&limit=200`,
    );
    if (memErr) throw new Error(String(memErr));
    const ids = [...new Set((memberships || []).map((m: any) => m.section_id).filter(Boolean))];
    if (!ids.length) {
      res.json([]);
      return;
    }

    const [{ data: sections }, { data: counts }, { data: lessons }, { data: progress }] = await Promise.all([
      supabaseQuery<any[]>(
        `foundation_sections?id=in.(${ids.map(enc).join(",")})&is_visible=eq.true&order=sort_order.asc&limit=200`,
      ),
      supabaseQuery<any[]>(`foundation_members?section_id=in.(${ids.map(enc).join(",")})&select=section_id&limit=3000`),
      supabaseQuery<any[]>(
        `foundation_lessons?section_id=in.(${ids.map(enc).join(",")})&is_visible=eq.true&select=id,section_id&limit=3000`,
      ),
      supabaseQuery<any[]>(
        `foundation_progress?user_id=eq.${enc(auth.userId)}&select=lesson_id&limit=1000`,
      ),
    ]);

    const memberCount: Record<string, number> = {};
    for (const m of counts || []) memberCount[m.section_id] = (memberCount[m.section_id] || 0) + 1;

    const lessonsBySection: Record<string, string[]> = {};
    for (const l of lessons || []) (lessonsBySection[l.section_id] ||= []).push(l.id);

    const doneSet = new Set<string>((progress || []).map((p: any) => p.lesson_id));
    const doneBySection: Record<string, number> = {};
    for (const [sid, lids] of Object.entries(lessonsBySection)) {
      doneBySection[sid] = lids.filter((id) => doneSet.has(id)).length;
    }

    res.json(
      (sections || []).map((s: any) => {
        const total = (lessonsBySection[s.id] || []).length;
        return {
          ...sectionToJson(s),
          memberCount: memberCount[s.id] || 0,
          lessonsCount: total,
          doneCount: doneBySection[s.id] || 0,
          totalCount: total,
        };
      }),
    );
  } catch (err: any) {
    logger.error({ err }, "GET /foundation/sections failed");
    res.status(500).json({ error: "تعذر تحميل أقسام التأسيس — " + V7_HINT });
  }
});

/**
 * الـ STREAM — كل دروس التأسيس دفعة واحدة وبترتيبها.
 * الطالب لا "يدخل" كل قسم ولا كل درس: يفتح التأسيس مرة واحدة ويقرأ متصلاً
 * (نص تحت نص، صورة تحت صورة) — لهذا نجمع كل شيء في طلب واحد لا عدة.
 * الإرجاع: { sections: [{...section, lessons:[درس كامل…]}], stats }
 */
router.get("/foundation/stream", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth!;

    // الأستاذ معاين: كل أقسامه
    let ids: string[] | null = null;
    if (auth.role !== "admin") {
      const { data: memberships, error } = await supabaseQuery<any[]>(
        `foundation_members?user_id=eq.${enc(auth.userId)}&select=section_id&limit=200`,
      );
      if (error) throw new Error(String(error));
      ids = [...new Set((memberships || []).map((m: any) => m.section_id).filter(Boolean))];
      if (!ids.length) {
        res.json({ sections: [], stats: { sections: 0, lessons: 0, done: 0, percent: 0 } });
        return;
      }
    }

    // الأقسام تُرشَّح بـ id، والدروس تُرشَّح بـ section_id — الخلط بينهما يجعل
// الطالب يرى أقساماً فارغة دائماً لأن id للدرس لا يساوي id للقسم أبداً.
    const sectionFilter = ids ? `&id=in.(${ids.map(enc).join(",")})` : "";
    const lessonFilter = ids ? `&section_id=in.(${ids.map(enc).join(",")})` : "";
    const unitFilter = ids ? `&section_id=in.(${ids.map(enc).join(",")})` : "";
    const unitsReady = await hasUnitsTable();
    const [{ data: sections }, { data: lessons }, { data: progress }, { data: units }] = await Promise.all([
      supabaseQuery<any[]>(`foundation_sections?is_visible=eq.true&order=sort_order.asc${sectionFilter}&limit=200`),
      supabaseQuery<any[]>(`foundation_lessons?is_visible=eq.true&order=position.asc${lessonFilter}&limit=1000`),
      supabaseQuery<any[]>(`foundation_progress?user_id=eq.${enc(auth.userId)}&select=lesson_id&limit=2000`),
      unitsReady
        ? supabaseQuery<any[]>(`foundation_units?is_visible=eq.true&order=sort_order.asc${unitFilter}&limit=500`)
        : Promise.resolve({ data: null, error: null, count: null }),
    ]);

    const done = new Set<string>((progress || []).map((p: any) => p.lesson_id));
    const out = buildSectionTree(sections || [], lessons || [], done, { units: units || null });

    const totalLessons = out.reduce((a, s) => a + s.totalCount, 0);
    const totalDone = out.reduce((a, s) => a + s.doneCount, 0);
    res.json({
      sections: out,
      stats: {
        sections: out.length,
        units: out.reduce((a, s) => a + s.unitsCount, 0),
        lessons: totalLessons,
        done: totalDone,
        percent: totalLessons > 0 ? Math.round((totalDone / totalLessons) * 100) : 0,
      },
    });
  } catch (err: any) {
    logger.error({ err }, "GET /foundation/stream failed");
    res.status(500).json({ error: "تعذر تحميل محتوى التأسيس — " + V7_HINT });
  }
});

/** فحص صلاحية فوري لـقسم واحد — أخف نقطة في النظام (استعلام واحد مفهرس) */
router.get("/foundation/sections/:id/access", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth!;
    const ok = await hasAccess(String(req.params.id), auth.userId);
    res.json({ allowed: ok, role: auth.role });
  } catch (err: any) {
    logger.error({ err }, "GET foundation access failed");
    res.status(500).json({ error: "تعذر التحقق" });
  }
});

/** قسم واحد + دروسه — محمي بالكامل (لا وجود للعضو = 404) */
router.get("/foundation/sections/:id", requireAuth, requireFoundationAccess, async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth!;
    const sectionId = String(req.params.id);

    const { data: sRows } = await supabaseQuery<any[]>(
      `foundation_sections?id=eq.${enc(sectionId)}&is_visible=eq.true&limit=1`,
    );
    const section = sRows?.[0];
    if (!section) {
      res.status(404).json({ error: "القسم غير موجود أو مخفي." });
      return;
    }

    const { data: lessons } = await supabaseQuery<any[]>(
      `foundation_lessons?section_id=eq.${enc(sectionId)}&is_visible=eq.true&order=position.asc&limit=300`,
    );
    const { data: progress } = await supabaseQuery<any[]>(
      `foundation_progress?user_id=eq.${enc(auth.userId)}&select=lesson_id&limit=1000`,
    );
    const done = new Set<string>((progress || []).map((p: any) => p.lesson_id));
    const { count: memberCount } = await supabaseQuery(
      `foundation_members?section_id=eq.${enc(sectionId)}&select=id`,
      { headers: { Prefer: "count=exact" } },
    );

    res.json({
      ...sectionToJson(section),
      memberCount: memberCount ?? 0,
      lessonsCount: (lessons || []).length,
      doneCount: (lessons || []).filter((l: any) => done.has(l.id)).length,
      totalCount: (lessons || []).length,
      lessons: (lessons || []).map((l: any) => lessonToJson(l, { done: done.has(l.id) })),
    });
  } catch (err: any) {
    logger.error({ err }, "GET /foundation/sections/:id failed");
    res.status(500).json({ error: "تعذر تحميل القسم — " + V7_HINT });
  }
});

/** درس واحد بمحتواه الكامل — محمي بنفس القاعدة */
router.get("/foundation/lessons/:id", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth!;
    const lessonId = String(req.params.id);

    const { data: rows } = await supabaseQuery<any[]>(
      `foundation_lessons?id=eq.${enc(lessonId)}&is_visible=eq.true&limit=1`,
    );
    const lesson = rows?.[0];
    if (!lesson) {
      res.status(404).json({ error: "الدرس غير موجود." });
      return;
    }
    if (auth.role !== "admin" && !(await hasAccess(lesson.section_id, auth.userId))) {
      res.status(404).json({ error: "هذا الدرس غير متاح لحسابك." });
      return;
    }

    const { data: progress } = await supabaseQuery<any[]>(
      `foundation_progress?user_id=eq.${enc(auth.userId)}&lesson_id=eq.${enc(lessonId)}&select=id&limit=1`,
    );
    res.json(lessonToJson(lesson, { full: true, done: (progress || []).length > 0 }));
  } catch (err: any) {
    logger.error({ err }, "GET /foundation/lessons/:id failed");
    res.status(500).json({ error: "تعذر تحميل الدرس — " + V7_HINT });
  }
});

/** تسجيل إنجاز الدرس — يُنشئ السجل إن لم يوجد */
router.post("/foundation/lessons/:id/complete", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth!;
    const lessonId = String(req.params.id);
    const { data: rows } = await supabaseQuery<any[]>(`foundation_lessons?id=eq.${enc(lessonId)}&select=id,section_id&limit=1`);
    const lesson = rows?.[0];
    if (!lesson) {
      res.status(404).json({ error: "الدرس غير موجود." });
      return;
    }
    if (auth.role !== "admin" && !(await hasAccess(lesson.section_id, auth.userId))) {
      res.status(404).json({ error: "هذا الدرس غير متاح لحسابك." });
      return;
    }

    const { data: existing } = await supabaseQuery<any[]>(
      `foundation_progress?user_id=eq.${enc(auth.userId)}&lesson_id=eq.${enc(lessonId)}&select=id&limit=1`,
    );
    if (existing?.length) {
      res.json({ success: true, alreadyDone: true });
      return;
    }
    const { error } = await supabaseQuery("foundation_progress", {
      method: "POST",
      body: [{ user_id: auth.userId, lesson_id: lessonId }],
    });
    if (error) throw new Error(String(error));
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "POST foundation complete failed");
    res.status(500).json({ error: "تعذر حفظ الإنجاز" });
  }
});

/** فتح الدرس في تبويب جديد — يعيد رابطاً موقّعاً يُتحقق منه في <1ث */
router.get("/foundation/lessons/:id/open", requireAuth, async (req, res) => {
  try {
    const auth = (req as AuthedRequest).auth!;
    const { data: rows } = await supabaseQuery<any[]>(`foundation_lessons?id=eq.${enc(req.params.id)}&select=id,section_id&limit=1`);
    const lesson = rows?.[0];
    if (!lesson) {
      res.status(404).json({ error: "الدرس غير موجود." });
      return;
    }
    if (auth.role !== "admin" && !(await hasAccess(lesson.section_id, auth.userId))) {
      res.status(404).json({ error: "هذا الدرس غير متاح لحسابك." });
      return;
    }
    res.json({ success: true, lessonId: lesson.id });
  } catch (err: any) {
    logger.error({ err }, "GET foundation open failed");
    res.status(500).json({ error: "تعذر فتح الدرس" });
  }
});

// ============================================================================
// واجهة الأستاذ
// ============================================================================

/** كل الأقسام + إحصاءاتها (أعضاء/دروس) — لقائمة لوحة التحكم */
router.get("/teacher/foundation/sections", requireAdmin, async (_req, res) => {
  try {
    const { data: sections, error } = await supabaseQuery<any[]>(
      "foundation_sections?order=sort_order.asc&limit=200",
    );
    if (error) throw new Error(String(error));
    const ids = (sections || []).map((s: any) => s.id);
    if (!ids.length) {
      res.json([]);
      return;
    }

    const [{ data: members }, { data: lessons }] = await Promise.all([
      supabaseQuery<any[]>(`foundation_members?section_id=in.(${ids.map(enc).join(",")})&select=section_id&limit=5000`),
      supabaseQuery<any[]>(`foundation_lessons?section_id=in.(${ids.map(enc).join(",")})&select=id,section_id&limit=5000`),
    ]);

    const memberCount: Record<string, number> = {};
    for (const m of members || []) memberCount[m.section_id] = (memberCount[m.section_id] || 0) + 1;
    const lessonCount: Record<string, number> = {};
    for (const l of lessons || []) lessonCount[l.section_id] = (lessonCount[l.section_id] || 0) + 1;

    res.json(
      (sections || []).map((s: any) => ({
        ...sectionToJson(s),
        memberCount: memberCount[s.id] || 0,
        lessonsCount: lessonCount[s.id] || 0,
      })),
    );
  } catch (err: any) {
    logger.error({ err }, "GET teacher foundation sections failed");
    res.status(500).json({ error: "تعذر تحميل أقسام التأسيس — " + V7_HINT });
  }
});

/**
 * الـ STREAM للأستاذ — كل الأقسام وكل الدروس دفعة واحدة وبالترتيب،
 * ليعرضها في قائمة واحدة متصلة بدل التنقّل بين الأقسام.
 */
router.get("/teacher/foundation/stream", requireAdmin, async (_req, res) => {
  try {
    const unitsReady = await hasUnitsTable();
    const [{ data: sections, error }, { data: lessons }, { data: members }, { data: units }] = await Promise.all([
      supabaseQuery<any[]>("foundation_sections?order=sort_order.asc&limit=200"),
      supabaseQuery<any[]>("foundation_lessons?order=position.asc&limit=2000"),
      supabaseQuery<any[]>("foundation_members?select=section_id&limit=5000"),
      unitsReady
        ? supabaseQuery<any[]>("foundation_units?order=sort_order.asc&limit=500")
        : Promise.resolve({ data: null, error: null, count: null }),
    ]);
    if (error) throw new Error(String(error));

    const memberCount: Record<string, number> = {};
    for (const m of members || []) memberCount[m.section_id] = (memberCount[m.section_id] || 0) + 1;

    res.json(buildSectionTree(sections || [], lessons || [], new Set(), {
      units: units || null,
      memberCount,
    }));
  } catch (err: any) {
    logger.error({ err }, "GET teacher foundation stream failed");
    res.status(500).json({ error: "تعذر تحميل محتوى التأسيس — " + V7_HINT });
  }
});

router.post("/teacher/foundation/sections", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.title || "").trim()) {
      res.status(400).json({ error: "عنوان القسم مطلوب" });
      return;
    }
    const { data: existing } = await supabaseQuery<any[]>("foundation_sections?select=sort_order&limit=1");
    const nextOrder = (existing || []).reduce((max: number, s: any) => Math.max(max, s.sort_order ?? 0), 0) + 1;

    const { data, error } = await supabaseQuery<any[]>("foundation_sections", {
      method: "POST",
      // بدون هذا-headيرجع PostgREST 201 بجسم فارغ، فلا نعرف id للقسم الجديد
      // ولا يستطيع الأستاذ إضافة دروس داخله مباشرة.
      headers: { Prefer: "return=representation" },
      body: [
        {
          title: String(b.title).slice(0, 200),
          subtitle: String(b.subtitle || "").slice(0, 200),
          description: String(b.description || "").slice(0, 2000),
          cover_url: String(b.coverUrl || ""),
          color: String(b.color || "#17413f"),
          icon: String(b.icon || "sparkles"),
          sort_order: Number(b.sortOrder) || nextOrder,
          is_locked: !!b.isLocked,
          is_visible: b.isVisible !== false,
          is_published: b.isPublished !== false,
        },
      ],
    });
    if (error) throw new Error(String(error));
    const created = (data || [])[0];
    if (!created?.id) throw new Error("لم يُرجع الخادم معرّف القسم — تحقّق من صلاحيات الجدول foundation_sections");
    res.json({ success: true, section: sectionToJson(created), message: "تم إنشاء فاصل التأسيس!" });
  } catch (err: any) {
    logger.error({ err }, "POST teacher foundation section failed");
    res.status(500).json({ error: "تعذر إنشاء القسم — " + V7_HINT });
  }
});

router.patch("/teacher/foundation/sections/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) full.title = String(b.title).slice(0, 200);
    if (b.subtitle !== undefined) full.subtitle = String(b.subtitle || "").slice(0, 200);
    if (b.description !== undefined) full.description = String(b.description || "").slice(0, 2000);
    if (b.coverUrl !== undefined) full.cover_url = String(b.coverUrl || "");
    if (b.color !== undefined) full.color = String(b.color || "#17413f");
    if (b.icon !== undefined) full.icon = String(b.icon || "sparkles");
    if (b.sortOrder !== undefined) full.sort_order = Number(b.sortOrder) || 1;
    if (b.isLocked !== undefined) full.is_locked = !!b.isLocked;
    if (b.isVisible !== undefined) full.is_visible = b.isVisible !== false;
    if (b.isPublished !== undefined) full.is_published = b.isPublished !== false;

    const { error } = await supabaseQuery(`foundation_sections?id=eq.${enc(req.params.id)}`, {
      method: "PATCH",
      body: full,
    });
    if (error) throw new Error(String(error));
    invalidateFoundationAccess(String(req.params.id));
    res.json({ success: true, message: "تم حفظ القسم!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH teacher foundation section failed");
    res.status(500).json({ error: "تعذر حفظ القسم — " + V7_HINT });
  }
});

router.delete("/teacher/foundation/sections/:id", requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseQuery(`foundation_sections?id=eq.${enc(req.params.id)}`, {
      method: "DELETE",
    });
    if (error) throw new Error(String(error));
    invalidateFoundationAccess(String(req.params.id));
    res.json({ success: true, message: "تم حذف القسم وكل دروسه." });
  } catch (err: any) {
    logger.error({ err }, "DELETE teacher foundation section failed");
    res.status(500).json({ error: "تعذر حذف القسم — " + V7_HINT });
  }
});

/** تبديل موضع قسمين متتاليين — السهمان في لوحة الأستاذ */
router.post("/teacher/foundation/sections/reorder", requireAdmin, async (req, res) => {
  try {
    const id = String(req.body?.id || "");
    const dir = req.body?.dir === "up" ? -1 : 1;
    if (!id) {
      res.status(400).json({ error: "القسم مطلوب" });
      return;
    }
    const { data: rows } = await supabaseQuery<any[]>("foundation_sections?select=id,sort_order&order=sort_order.asc&limit=200");
    const list = rows || [];
    const index = list.findIndex((s: any) => s.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= list.length) {
      res.json({ success: true, swapped: false });
      return;
    }
    const a = list[index];
    const b = list[target];
    const pa = a.sort_order ?? index + 1;
    const pb = b.sort_order ?? target + 1;
    const nextA = pa === pb ? target + 1 : pa;
    const nextB = pa === pb ? index + 1 : pb;
    await Promise.all([
      supabaseQuery(`foundation_sections?id=eq.${enc(a.id)}`, { method: "PATCH", body: { sort_order: nextB, updated_at: new Date().toISOString() } }),
      supabaseQuery(`foundation_sections?id=eq.${enc(b.id)}`, { method: "PATCH", body: { sort_order: nextA, updated_at: new Date().toISOString() } }),
    ]);
    res.json({ success: true, swapped: true });
  } catch (err: any) {
    logger.error({ err }, "POST foundation section reorder failed");
    res.status(500).json({ error: "تعذر إعادة ترتيب الأقسام — " + V7_HINT });
  }
});

// ── الأقسام الفرعية ─────────────────────────────────────────────────────────

router.get("/teacher/foundation/sections/:id/units", requireAdmin, async (req, res) => {
  try {
    if (!(await hasUnitsTable())) {
      res.json([]);
      return;
    }
    const { data, error } = await supabaseQuery<any[]>(
      `foundation_units?section_id=eq.${enc(req.params.id)}&order=sort_order.asc&limit=300`,
    );
    if (error) throw new Error(String(error));
    const ids = (data || []).map((u: any) => u.id);
    const { data: lessons } = ids.length
      ? await supabaseQuery<any[]>(
          `foundation_lessons?section_id=eq.${enc(req.params.id)}&select=id,unit_id&limit=500`,
        )
      : { data: [] as any[] };
    const counts: Record<string, number> = {};
    for (const l of lessons || []) {
      const key = l.unit_id || "__first__";
      counts[key] = (counts[key] || 0) + 1;
    }
    res.json(
      (data || []).map((u: any) => ({ ...unitToJson(u), lessonsCount: counts[u.id] || 0 })),
    );
  } catch (err: any) {
    logger.error({ err }, "GET teacher foundation units failed");
    res.status(500).json({ error: "تعذر تحميل الأقسام الفرعية — " + V10_HINT });
  }
});

router.post("/teacher/foundation/units", requireAdmin, async (req, res) => {
  try {
    if (!(await hasUnitsTable())) {
      res.status(503).json({ error: "الأقسام الفرعية غير مفعّلة — " + V10_HINT });
      return;
    }
    const b = req.body || {};
    const sectionId = String(b.sectionId || b.section_id || "");
    const title = String(b.title || "").trim();
    if (!sectionId) {
      res.status(400).json({ error: "القسم مطلوب" });
      return;
    }
    if (!title) {
      res.status(400).json({ error: "عنوان القسم الفرعي مطلوب" });
      return;
    }
    const { data: existing } = await supabaseQuery<any[]>(
      `foundation_units?section_id=eq.${enc(sectionId)}&select=sort_order&limit=300`,
    );
    const nextOrder = (existing || []).reduce((max: number, u: any) => Math.max(max, u.sort_order ?? 0), 0) + 1;

    const { data, error } = await supabaseQuery<any[]>("foundation_units", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: [
        {
          section_id: sectionId,
          title: title.slice(0, 200),
          description: String(b.description || "").slice(0, 2000),
          cover_url: String(b.coverUrl || ""),
          color: String(b.color || ""),
          icon: String(b.icon || "book-open"),
          sort_order: Number(b.sortOrder) || nextOrder,
          is_locked: !!b.isLocked,
          is_visible: b.isVisible !== false,
        },
      ],
    });
    if (error) throw new Error(String(error));
    const created = (data || [])[0];
    if (!created?.id) throw new Error("لم يُرجع الخادم معرّف القسم الفرعي");
    res.json({ success: true, unit: unitToJson(created), message: "تم إنشاء القسم الفرعي!" });
  } catch (err: any) {
    logger.error({ err }, "POST foundation unit failed");
    res.status(500).json({ error: "تعذر إنشاء القسم الفرعي — " + V10_HINT });
  }
});

router.patch("/teacher/foundation/units/:id", requireAdmin, async (req, res) => {
  try {
    if (!(await hasUnitsTable())) {
      res.status(503).json({ error: "الأقسام الفرعية غير مفعّلة — " + V10_HINT });
      return;
    }
    const b = req.body || {};
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) full.title = String(b.title).slice(0, 200);
    if (b.description !== undefined) full.description = String(b.description || "").slice(0, 2000);
    if (b.coverUrl !== undefined) full.cover_url = String(b.coverUrl || "");
    if (b.color !== undefined) full.color = String(b.color || "");
    if (b.icon !== undefined) full.icon = String(b.icon || "book-open");
    if (b.sortOrder !== undefined) full.sort_order = Number(b.sortOrder) || 1;
    if (b.isLocked !== undefined) full.is_locked = !!b.isLocked;
    if (b.isVisible !== undefined) full.is_visible = b.isVisible !== false;

    const { error } = await supabaseQuery(`foundation_units?id=eq.${enc(req.params.id)}`, {
      method: "PATCH",
      body: full,
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حفظ القسم الفرعي!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH foundation unit failed");
    res.status(500).json({ error: "تعذر حفظ القسم الفرعي — " + V10_HINT });
  }
});

/** حذف قسم فرعي — دروسه تبقى موجودة ويظهرها القسم الفرعي الأول (SET NULL في القاعدة) */
router.delete("/teacher/foundation/units/:id", requireAdmin, async (req, res) => {
  try {
    if (!(await hasUnitsTable())) {
      res.status(503).json({ error: "الأقسام الفرعية غير مفعّلة — " + V10_HINT });
      return;
    }
    const { data: rows } = await supabaseQuery<any[]>(`foundation_units?id=eq.${enc(req.params.id)}&select=id&limit=1`);
    if (!rows?.[0]) {
      res.status(404).json({ error: "القسم الفرعي غير موجود" });
      return;
    }
    const { error } = await supabaseQuery(`foundation_units?id=eq.${enc(req.params.id)}`, {
      method: "DELETE",
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حذف القسم الفرعي — دروسه انتقلت إلى القسم الأول." });
  } catch (err: any) {
    logger.error({ err }, "DELETE foundation unit failed");
    res.status(500).json({ error: "تعذر حذف القسم الفرعي — " + V10_HINT });
  }
});

/** تبديل موضعين بين قسمين فرعيين داخل المستوى نفسه */
router.post("/teacher/foundation/units/reorder", requireAdmin, async (req, res) => {
  try {
    if (!(await hasUnitsTable())) {
      res.status(503).json({ error: "الأقسام الفرعية غير مفعّلة — " + V10_HINT });
      return;
    }
    const id = String(req.body?.id || "");
    const dir = req.body?.dir === "up" ? -1 : 1;
    if (!id) {
      res.status(400).json({ error: "القسم الفرعي مطلوب" });
      return;
    }
    const { data: rows } = await supabaseQuery<any[]>(`foundation_units?id=eq.${enc(id)}&select=id,section_id&limit=1`);
    const unit = rows?.[0];
    if (!unit) {
      res.status(404).json({ error: "القسم الفرعي غير موجود" });
      return;
    }
    const { data: siblings } = await supabaseQuery<any[]>(
      `foundation_units?section_id=eq.${enc(unit.section_id)}&order=sort_order.asc&limit=300`,
    );
    const list = siblings || [];
    const index = list.findIndex((u: any) => u.id === unit.id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= list.length) {
      res.json({ success: true, swapped: false });
      return;
    }
    const a = list[index];
    const b = list[target];
    const pa = a.sort_order ?? index + 1;
    const pb = b.sort_order ?? target + 1;
    const nextA = pa === pb ? target + 1 : pa;
    const nextB = pa === pb ? index + 1 : pb;
    await Promise.all([
      supabaseQuery(`foundation_units?id=eq.${enc(a.id)}`, { method: "PATCH", body: { sort_order: nextB, updated_at: new Date().toISOString() } }),
      supabaseQuery(`foundation_units?id=eq.${enc(b.id)}`, { method: "PATCH", body: { sort_order: nextA, updated_at: new Date().toISOString() } }),
    ]);
    res.json({ success: true, swapped: true });
  } catch (err: any) {
    logger.error({ err }, "POST foundation unit reorder failed");
    res.status(500).json({ error: "تعذر إعادة ترتيب الأقسام الفرعية — " + V10_HINT });
  }
});

// ── الأعضاء ─────────────────────────────────────────────────────────────────

/** كل الطلاب × كل المستويات في طلب واحد.
 *  لوحة الأستاذ تحتاج أن ترى مصفوفة (طالب × مستوى) كاملة، لا مستوىً واحداً في
 *  كل مرة — وإلا احتاجت خمسة عشر طلباً لتعديل عشرة طلاب. */
router.get("/teacher/foundation/members", requireAdmin, async (_req, res) => {
  try {
    const [{ data: sections }, { data: students }, { data: members }] = await Promise.all([
      supabaseQuery<any[]>("foundation_sections?order=sort_order.asc&limit=200"),
      supabaseQuery<any[]>("profiles?role=eq.student&order=full_name.asc&limit=5000"),
      supabaseQuery<any[]>("foundation_members?select=section_id,user_id&limit=20000"),
    ]);

    const byUser: Record<string, string[]> = {};
    for (const m of members || []) (byUser[m.user_id] ||= []).push(m.section_id);

    res.json({
      sections: (sections || []).map((s: any) => ({
        id: s.id,
        title: s.title || "قسم بلا اسم",
        subtitle: s.subtitle || "",
        color: s.color || "#17413f",
        icon: s.icon || "sparkles",
        sortOrder: s.sort_order ?? 1,
        isLocked: !!s.is_locked,
        isVisible: s.is_visible !== false,
      })),
      students: (students || []).map((s: any) => ({
        id: s.id,
        name: s.full_name || "بلا اسم",
        grade: s.grade || "",
        section: s.section || "",
        gender: s.gender || "",
        school: s.school || "",
        status: s.status || "",
        avatarUrl: s.avatar_url || "",
        sectionIds: byUser[s.id] || [],
      })),
    });
  } catch (err: any) {
    logger.error({ err }, "GET foundation members matrix failed");
    res.status(500).json({ error: "تعذر تحميل الطلاب — " + V7_HINT });
  }
});

/** ضبط مستويات طالب واحد — يستبدل عضويته في كل المستويات دفعة واحدة */
router.put("/teacher/foundation/members", requireAdmin, async (req, res) => {
  try {
    const userId = String(req.body?.userId || "").trim();
    const raw = Array.isArray(req.body?.sectionIds) ? req.body.sectionIds : [];
    if (!userId) {
      res.status(400).json({ error: "الطالب مطلوب" });
      return;
    }
    const sectionIds = [...new Set(raw.map((x: any) => String(x || "")).filter(Boolean))].slice(0, 200);

    // 1) احذف ما لم يبقَ
    const { data: current } = await supabaseQuery<any[]>(
      `foundation_members?user_id=eq.${enc(userId)}&select=id,section_id&limit=500`,
    );
    const currentIds = new Set((current || []).map((m: any) => m.section_id));
    const toRemove = (current || []).filter((m: any) => !sectionIds.includes(m.section_id)).map((m: any) => m.id);
    const toAdd = sectionIds.filter((id) => !currentIds.has(id));

    if (toRemove.length) {
      const { error: delErr } = await supabaseQuery(
        `foundation_members?id=in.(${toRemove.map(enc).join(",")})`,
        { method: "DELETE" },
      );
      if (delErr) throw new Error(String(delErr));
    }
    if (toAdd.length) {
      const { error: addErr } = await supabaseQuery("foundation_members", {
        method: "POST",
        // بنسخة واحدة لكل مستوى: لا تكرار، وإلا رفض Postgres الدفعة كلها
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: toAdd.map((section_id: string) => ({ section_id, user_id: userId })),
      });
      if (addErr) throw new Error(String(addErr));
    }

    invalidateFoundationAccess(null, userId);
    res.json({ success: true, userId, sectionIds });
  } catch (err: any) {
    logger.error({ err }, "PUT foundation member levels failed");
    res.status(500).json({ error: "تعذر حفظ مستويات الطالب — " + V7_HINT });
  }
});

/** قائمة الطلاب كاملة للاختيار بالاسم (مع حالة انتمائهم لهذا القسم) */
router.get("/teacher/foundation/sections/:id/members", requireAdmin, async (req, res) => {
  try {
    const sectionId = String(req.params.id);
    const [{ data: students }, { data: members }] = await Promise.all([
      supabaseQuery<any[]>("profiles?role=eq.student&order=full_name.asc&limit=2000"),
      supabaseQuery<any[]>(`foundation_members?section_id=eq.${enc(sectionId)}&select=user_id&limit=5000`),
    ]);
    const memberIds = new Set<string>((members || []).map((m: any) => m.user_id));
    res.json({
      sectionId,
      memberIds: [...memberIds],
      students: (students || []).map((s: any) => ({
        id: s.id,
        name: s.full_name || "بلا اسم",
        grade: s.grade || "",
        section: s.section || "",
        gender: s.gender || "",
        status: s.status || "",
        avatarUrl: s.avatar_url || "",
        isMember: memberIds.has(s.id),
      })),
    });
  } catch (err: any) {
    logger.error({ err }, "GET foundation members failed");
    res.status(500).json({ error: "تعذر تحميل الطلاب — " + V7_HINT });
  }
});

/** حفظ قائمة الأعضاء — يستبدل المجموعة كاملة (ما تختاره هو من يرى) */
router.put("/teacher/foundation/sections/:id/members", requireAdmin, async (req, res) => {
  try {
    const sectionId = String(req.params.id);
    const raw = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
    const memberIds = [...new Set(raw.map((x: any) => String(x || "")).filter(Boolean))].slice(0, 2000);

    // 1) احذف من لم يبقَ
    const { data: current } = await supabaseQuery<any[]>(
      `foundation_members?section_id=eq.${enc(sectionId)}&select=id,user_id&limit=5000`,
    );
    const currentIds = new Set((current || []).map((m: any) => m.user_id));
    const toAdd = memberIds.filter((id) => !currentIds.has(id));
    const toRemove = (current || []).filter((m: any) => !memberIds.includes(m.user_id)).map((m: any) => m.id);

    if (toRemove.length) {
      const { error: delErr } = await supabaseQuery(
        `foundation_members?id=in.(${toRemove.map(enc).join(",")})`,
        { method: "DELETE" },
      );
      if (delErr) throw new Error(String(delErr));
    }
    if (toAdd.length) {
      const { error: addErr } = await supabaseQuery("foundation_members", {
        method: "POST",
        body: toAdd.map((user_id: string) => ({ section_id: sectionId, user_id })),
      });
      if (addErr) throw new Error(String(addErr));
    }

    invalidateFoundationAccess(sectionId);
    res.json({
      success: true,
      count: memberIds.length,
      message: `تم حفظ ${memberIds.length} طالب في القسم.`,
    });
  } catch (err: any) {
    logger.error({ err }, "PUT foundation members failed");
    res.status(500).json({ error: "تعذر حفظ الأعضاء — " + V7_HINT });
  }
});

// ── الدروس ──────────────────────────────────────────────────────────────────

router.get("/teacher/foundation/sections/:id/lessons", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseQuery<any[]>(
      `foundation_lessons?section_id=eq.${enc(req.params.id)}&order=position.asc&limit=300`,
    );
    if (error) throw new Error(String(error));
    res.json((data || []).map((l: any) => lessonToJson(l)));
  } catch (err: any) {
    logger.error({ err }, "GET teacher foundation lessons failed");
    res.status(500).json({ error: "تعذر تحميل الدروس — " + V7_HINT });
  }
});

router.post("/teacher/foundation/lessons", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const sectionId = String(b.sectionId || b.section_id || "");
    const unitId = String(b.unitId || b.unit_id || "").trim();
    if (!sectionId) {
      res.status(400).json({ error: "القسم مطلوب" });
      return;
    }
    if (!String(b.title || "").trim()) {
      res.status(400).json({ error: "عنوان الدرس مطلوب" });
      return;
    }
    const unitsReady = await hasUnitsTable();
    // الموضع يُحسب داخل القسم الفرعي — فالترتيب يتبع التسلسل الذي يراه الطالب
    const { data: existing } = unitsReady && unitId
      ? await supabaseQuery<any[]>(
          `foundation_lessons?unit_id=eq.${enc(unitId)}&select=position&limit=500`,
        )
      : await supabaseQuery<any[]>(
          `foundation_lessons?section_id=eq.${enc(sectionId)}&select=position&limit=500`,
        );
    const nextPos = (existing || []).reduce((max: number, l: any) => Math.max(max, l.position ?? 0), 0) + 1;

    const row: Record<string, any> = {
      section_id: sectionId,
      title: String(b.title).slice(0, 200),
      description: String(b.description || "").slice(0, 1000),
      kind: kindOf(b.kind),
      body_text: String(b.bodyText ?? b.body_text ?? ""),
      cover_url: String(b.coverUrl || ""),
      images: Array.isArray(b.images) ? b.images.filter(Boolean).slice(0, 40) : [],
      video_url: String(b.videoUrl || ""),
      video_caption: String(b.videoCaption || "").slice(0, 300),
      html_content: String(b.htmlContent || ""),
      html_file_url: String(b.htmlFileUrl || ""),
      position: Number(b.position) || nextPos,
      is_locked: !!b.isLocked,
      is_visible: b.isVisible !== false,
    };
    // العمود موجود فقط بعد ملف V10 — بلاه يفشل الإدراج كله
    if (unitsReady && unitId) row.unit_id = unitId;

    const { data, error } = await supabaseQuery<any[]>("foundation_lessons", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: [row],
    });
    if (error) throw new Error(String(error));
    const created = (data || [])[0];
    if (!created?.id) throw new Error("لم يُرجع الخادم معرّف الدرس — تحقّق من صلاحيات الجدول foundation_lessons");
    res.json({ success: true, lesson: lessonToJson(created), message: "تمت إضافة الدرس!" });
  } catch (err: any) {
    logger.error({ err }, "POST foundation lesson failed");
    res.status(500).json({ error: "تعذر إضافة الدرس — " + V7_HINT });
  }
});

router.patch("/teacher/foundation/lessons/:id", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const full: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) full.title = String(b.title).slice(0, 200);
    if (b.description !== undefined) full.description = String(b.description || "").slice(0, 1000);
    if (b.kind !== undefined) full.kind = kindOf(b.kind);
    if (b.bodyText !== undefined || b.body_text !== undefined) full.body_text = String(b.bodyText ?? b.body_text ?? "");
    if (b.coverUrl !== undefined) full.cover_url = String(b.coverUrl || "");
    if (b.images !== undefined) full.images = Array.isArray(b.images) ? b.images.filter(Boolean).slice(0, 40) : [];
    if (b.videoUrl !== undefined) full.video_url = String(b.videoUrl || "");
    if (b.videoCaption !== undefined) full.video_caption = String(b.videoCaption || "").slice(0, 300);
    if (b.htmlContent !== undefined) full.html_content = String(b.htmlContent || "");
    if (b.htmlFileUrl !== undefined) full.html_file_url = String(b.htmlFileUrl || "");
    if (b.position !== undefined) full.position = Number(b.position) || 1;
    if (b.isLocked !== undefined) full.is_locked = !!b.isLocked;
    if (b.isVisible !== undefined) full.is_visible = b.isVisible !== false;
    // نقل الدرس إلى قسم فرعي آخر — والعمود يُكتب فقط بعد تنفيذ ملف V10
    if ((b.unitId !== undefined || b.unit_id !== undefined) && (await hasUnitsTable())) {
      full.unit_id = String(b.unitId ?? b.unit_id ?? "").trim() || null;
    }

    const { error } = await supabaseQuery(`foundation_lessons?id=eq.${enc(req.params.id)}`, {
      method: "PATCH",
      body: full,
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حفظ الدرس!" });
  } catch (err: any) {
    logger.error({ err }, "PATCH foundation lesson failed");
    res.status(500).json({ error: "تعذر حفظ الدرس — " + V7_HINT });
  }
});

router.delete("/teacher/foundation/lessons/:id", requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseQuery(`foundation_lessons?id=eq.${enc(req.params.id)}`, {
      method: "DELETE",
    });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: "تم حذف الدرس." });
  } catch (err: any) {
    logger.error({ err }, "DELETE foundation lesson failed");
    res.status(500).json({ error: "تعذر حذف الدرس — " + V7_HINT });
  }
});

/** إعادة ترتيب الدروس — تبدّل موضعين داخل نفس القسم الفرعي (أو داخل القسم كلّه) */
router.post("/teacher/foundation/lessons/reorder", requireAdmin, async (req, res) => {
  try {
    const id = String(req.body?.id || "");
    const dir = req.body?.dir === "up" ? -1 : 1;
    if (!id) {
      res.status(400).json({ error: "الدرس مطلوب" });
      return;
    }
    const { data: rows } = await supabaseQuery<any[]>(`foundation_lessons?id=eq.${enc(id)}&select=id,section_id,unit_id,position&limit=1`);
    const lesson = rows?.[0];
    if (!lesson) {
      res.status(404).json({ error: "الدرس غير موجود" });
      return;
    }
    // نرتب داخل القسم الفرعي إن وُجد، وإلا نرتب على مستوى القسم كامل
    const scoped = (await hasUnitsTable()) && lesson.unit_id
      ? { key: "unit_id", value: lesson.unit_id }
      : { key: "section_id", value: lesson.section_id };
    const { data: siblings } = await supabaseQuery<any[]>(
      `foundation_lessons?${scoped.key}=eq.${enc(scoped.value)}&order=position.asc&limit=500`,
    );
    const list = siblings || [];
    const index = list.findIndex((l: any) => l.id === lesson.id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= list.length) {
      res.json({ success: true, swapped: false });
      return;
    }
    const a = list[index];
    const b = list[target];
    const pa = a.position ?? index + 1;
    const pb = b.position ?? target + 1;
    // لو كانا متساويين نستعمل الفهارس — يبقى الترتيب مستقراً بلا تشابه
    const nextA = pa === pb ? target + 1 : pa;
    const nextB = pa === pb ? index + 1 : pb;

    await Promise.all([
      supabaseQuery(`foundation_lessons?id=eq.${enc(a.id)}`, { method: "PATCH", body: { position: nextB, updated_at: new Date().toISOString() } }),
      supabaseQuery(`foundation_lessons?id=eq.${enc(b.id)}`, { method: "PATCH", body: { position: nextA, updated_at: new Date().toISOString() } }),
    ]);
    res.json({ success: true, swapped: true });
  } catch (err: any) {
    logger.error({ err }, "POST foundation reorder failed");
    res.status(500).json({ error: "تعذر إعادة الترتيب — " + V7_HINT });
  }
});

export default router;