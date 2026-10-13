import { Router, type IRouter } from "express";
import { supabaseQuery } from "../lib/supabase";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ============================================================================
// كتالوج الصفوف والمدارس — مصدر الحقيقة الوحيد، بدل القوائم المثبّتة بالكود.
// الأستاذ يبني نظامه بنفسه: يضيف صفاً أو مدرسة ويربطهما، فتظهر في كل مكان فوراً.
// مكان فوراً (الطلاب، الواجبات، الدفتر، الاختبارات، الإعلانات، المنهاج…).
// ============================================================================

const enc = (v: string | string[] | undefined): string =>
  encodeURIComponent(Array.isArray(v) ? v[0] ?? "" : v ?? "");

const V8_HINT = "نفّذ الملف sql_grades_schools_v8.sql في Supabase ← SQL Editor أولاً.";

const DEFAULT_GRADES = [
  { id: "grade-8", name: "الصف الثامن", sortOrder: 1, color: "#2f7772" },
  { id: "grade-9", name: "الصف التاسع", sortOrder: 2, color: "#b7791f" },
  { id: "grade-10", name: "الصف العاشر", sortOrder: 3, color: "#17413f" },
];
const DEFAULT_SCHOOLS = [
  { id: "school-wild", name: "مدرسة وايلد", sortOrder: 1, color: "#17413f" },
  { id: "school-ahramat", name: "مبادرة أهرامات الأمل", sortOrder: 2, color: "#6a1b9a" },
];

/** slug ثابت ومستقر للاسم — يتيح إعادة التسمية دون كسر الروابط */
function slugId(prefix: string, name: string): string {
  const base = String(name || "")
    .trim()
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\u0627-\u064A\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${prefix}-${base || Math.random().toString(36).slice(2, 10)}`;
}

/** تطبيع للمقارنة: الهمزات والتاء المربوطة والمسافات — فلا يتكرر الصف باسمين */
export function foldName(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[\s_\-]+/g, " ")
    .trim()
    .toLowerCase();
}

export type CatalogGrade = {
  id: string;
  name: string;
  sortOrder: number;
  color: string;
  isActive: boolean;
  genderSplit: boolean;
  schools: string[];
  schoolIds: string[];
  students: number;
};

export type CatalogSchool = {
  id: string;
  name: string;
  sortOrder: number;
  color: string;
  isActive: boolean;
  grades: string[];
  students: number;
};

/** يبني الكتالوج الكامل: صفوف × مدارس + أعداد الطلاب + حالة التقسيم */
async function buildCatalog() {
  const [{ data: gradeRows }, { data: schoolRows }, { data: links }, { data: splits }, { data: profiles }] =
    await Promise.all([
      supabaseQuery<any[]>("grade_levels?order=sort_order.asc&limit=500"),
      supabaseQuery<any[]>("schools?order=sort_order.asc&limit=500"),
      supabaseQuery<any[]>("grade_schools?order=sort_order.asc&limit=5000"),
      supabaseQuery<any[]>("grade_settings?limit=200"),
      supabaseQuery<any[]>("profiles?role=eq.student&select=grade,school&limit=5000"),
    ]);

  // لا خرائط = لا فلاتر. نُرجع الافتراضي حتى لا تنهار الواجهة قبل تنفيذ SQL
  const grades: CatalogGrade[] = [];
  const schools: CatalogSchool[] = [];

  const gradeList = (gradeRows || []).length
    ? gradeRows!.map((g: any) => ({
        id: String(g.id),
        name: String(g.name),
        sortOrder: g.sort_order ?? 1,
        color: g.color || "#17413f",
        isActive: g.is_active !== false,
      }))
    : DEFAULT_GRADES.map((g) => ({ ...g, isActive: true }));

  const schoolList = (schoolRows || []).length
    ? schoolRows!.map((s: any) => ({
        id: String(s.id),
        name: String(s.name),
        sortOrder: s.sort_order ?? 1,
        color: s.color || "#6a1b9a",
        isActive: s.is_active !== false,
      }))
    : DEFAULT_SCHOOLS.map((s) => ({ ...s, isActive: true }));

  const bySchoolId = new Map(schoolList.map((s) => [s.id, s]));
  const byGradeId = new Map(gradeList.map((g) => [g.id, g]));
  const splitByGrade = new Map<string, boolean>((splits || []).map((r: any) => [r.grade, r.gender_split === true]));

  for (const s of schoolList) {
    schools.push({ ...s, grades: [], students: 0 });
  }
  for (const g of gradeList) {
    grades.push({
      ...g,
      genderSplit: splitByGrade.get(g.name) === true,
      schools: [],
      schoolIds: [],
      students: 0,
    });
  }

  // الربط: صف → مدارسه
  for (const l of links || []) {
    const g = byGradeId.get(String(l.grade_id));
    const s = bySchoolId.get(String(l.school_id));
    if (!g || !s) continue;
    const gi = grades.findIndex((x) => x.id === g.id);
    const si = schools.findIndex((x) => x.id === s.id);
    if (gi < 0 || si < 0) continue;
    if (!grades[gi].schools.includes(s.name)) {
      grades[gi].schools.push(s.name);
      grades[gi].schoolIds.push(s.id);
    }
    if (!schools[si].grades.includes(g.name)) schools[si].grades.push(g.name);
  }

  // لا يوجد أي ربط؟ اربط كل صف بكل مدرسة — أفضل من قائمة فارغة
  if (grades.length && schools.length && !grades.some((g) => g.schools.length)) {
    for (const g of grades) {
      g.schools = schools.filter((s) => s.isActive).map((s) => s.name);
      g.schoolIds = schools.filter((s) => s.isActive).map((s) => s.id);
    }
    for (const s of schools) s.grades = grades.filter((g) => g.isActive).map((g) => g.name);
  }

  // عدد الطلاب الفعلي لكل صف/مدرسة
  for (const p of profiles || []) {
    const gname = String(p.grade || "");
    const sname = String(p.school || "");
    const gi = grades.findIndex((g) => g.name === gname);
    if (gi >= 0) grades[gi].students++;
    const si = schools.findIndex((s) => s.name === sname);
    if (si >= 0) schools[si].students++;
  }

  grades.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ar"));
  schools.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ar"));

  return { grades, schools };
}

// ── الكتالوج: مفتوح للقراءة (يستخدمه تسجيل الطالب وكمل حسابه) ─────────────
router.get("/org/catalog", async (_req, res) => {
  try {
    const { grades, schools } = await buildCatalog();
    res.json({ grades, schools });
  } catch (err: any) {
    logger.error({ err }, "GET /org/catalog failed");
    res.status(500).json({ error: "تعذر تحميل الصفوف والمدارس — " + V8_HINT });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// إدارة الصفوف
// ───────────────────────────────────────────────────────────────────────────

router.post("/teacher/org/grades", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "اسم الصف مطلوب" });
      return;
    }
    const { data: existing } = await supabaseQuery<any[]>("grade_levels?select=id,name&limit=500");
    const dupe = (existing || []).find((g: any) => foldName(g.name) === foldName(name));
    if (dupe) {
      res.status(400).json({ error: `الصف «${dupe.name}» موجود مسبقاً.` });
      return;
    }
    const maxOrder = (existing || []).reduce((m: number, g: any) => Math.max(m, g.sort_order ?? 0), 0);

    const id = slugId("grade", name);
    const payload = {
      id,
      name,
      sort_order: Number(req.body?.sortOrder) || maxOrder + 1,
      color: String(req.body?.color || "#37474f"),
      is_active: true,
    };
    // grade_levels عندنا قيود فريدة على (name) وعلى (id) معاً، فنُدخل
    // بـ on_conflict=id لتتجاهل التعارض بدل أن يفشل الإضافة كاملاً.
    const { error } = await supabaseQuery("grade_levels?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: [payload],
    });
    if (error) {
      // احتياط: لو اختلف اسم القيد عندك نضيف الأعمدة الأساسية فقط
      const fallback = await supabaseQuery("grade_levels?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: [{ id, name, sort_order: payload.sort_order }],
      });
      if (fallback.error) throw new Error(String(fallback.error));
    }

    // صف_settings لازم يُوجد حتى يظهر مفتاح التقسيم له
    try {
      await supabaseQuery("grade_settings", {
        method: "POST",
        body: [{ grade: name, gender_split: false }],
      });
    } catch { /* غير حرج */ }

    // اربطه بكل المدارس النشطة افتراضياً
    try {
      const { data: scs } = await supabaseQuery<any[]>("schools?is_active=eq.true&limit=200");
      if (scs?.length) {
        await supabaseQuery("grade_schools", {
          method: "POST",
          body: scs.map((s: any) => ({ grade_id: id, school_id: String(s.id), sort_order: s.sort_order ?? 1 })),
        });
      }
    } catch { /* غير حرج */ }

    res.json({ success: true, grade: { ...payload, genderSplit: false, schools: [], schoolIds: [], students: 0 }, message: `تمت إضافة الصف «${name}».` });
  } catch (err: any) {
    logger.error({ err }, "POST grade failed");
    res.status(500).json({ error: "تعذر إضافة الصف — " + V8_HINT });
  }
});

router.patch("/teacher/org/grades/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const b = req.body || {};
    const { data: rows } = await supabaseQuery<any[]>(`grade_levels?id=eq.${enc(id)}&select=id,name&limit=1`);
    const grade = rows?.[0];
    if (!grade) {
      res.status(404).json({ error: "الصف غير موجود" });
      return;
    }

    const full: Record<string, any> = {};
    const newName = b.name !== undefined ? String(b.name).trim() : grade.name;
    if (!newName) {
      res.status(400).json({ error: "اسم الصف لا может أن يكون فارغاً" });
      return;
    }
    if (newName !== grade.name) {
      const { data: others } = await supabaseQuery<any[]>("grade_levels?select=id,name&limit=500");
      const dupe = (others || []).find((g: any) => g.id !== id && foldName(g.name) === foldName(newName));
      if (dupe) {
        res.status(400).json({ error: `يوجد صف آخر بالاسم «${dupe.name}».` });
        return;
      }
      // إعادة التسمية: نحدّث كل الصفوف التي تحمل الاسم القديم (محتوى + طلاب + إعدادات)
      const tables = ["courses", "lessons", "assessments", "assignments", "announcements", "summaries", "notebook_tasks", "profiles", "grade_settings"];
      for (const t of tables) {
        try {
          await supabaseQuery(`${t}?grade=eq.${enc(grade.name)}`, {
            method: "PATCH",
            body: { grade: newName },
          });
        } catch (e) {
          logger.warn({ table: t, err: e }, "grade rename partial failure");
        }
      }
      full.name = newName;
    }
    if (b.color !== undefined) full.color = String(b.color);
    if (b.sortOrder !== undefined) full.sort_order = Number(b.sortOrder) || 1;
    if (b.isActive !== undefined) full.is_active = !!b.isActive;

    if (Object.keys(full).length) {
      const { error } = await supabaseQuery(`grade_levels?id=eq.${enc(id)}`, { method: "PATCH", body: full });
      if (error) throw new Error(String(error));
    }
    res.json({ success: true, message: `تم حفظ الصف «${newName}».` });
  } catch (err: any) {
    logger.error({ err }, "PATCH grade failed");
    res.status(500).json({ error: "تعذر حفظ الصف — " + V8_HINT });
  }
});

router.delete("/teacher/org/grades/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { data: rows } = await supabaseQuery<any[]>(`grade_levels?id=eq.${enc(id)}&select=id,name&limit=1`);
    const grade = rows?.[0];
    if (!grade) {
      res.status(404).json({ error: "الصف غير موجود" });
      return;
    }
    const { data: students } = await supabaseQuery<any[]>(
      `profiles?role=eq.student&grade=eq.${enc(grade.name)}&select=id&limit=1`,
    );
    if (students?.length) {
      res.status(400).json({
        error: `لا يمكن حذف «${grade.name}» — فيه طلاب مسجّلون. انقلهم لصف آخر أولاً.`,
      });
      return;
    }
    await supabaseQuery(`grade_schools?grade_id=eq.${enc(id)}`, { method: "DELETE" });
    const { error } = await supabaseQuery(`grade_levels?id=eq.${enc(id)}`, { method: "DELETE" });
    if (error) throw new Error(String(error));
    try { await supabaseQuery(`grade_settings?grade=eq.${enc(grade.name)}`, { method: "DELETE" }); } catch { /* غير حرج */ }
    res.json({ success: true, message: `تم حذف الصف «${grade.name}».` });
  } catch (err: any) {
    logger.error({ err }, "DELETE grade failed");
    res.status(500).json({ error: "تعذر حذف الصف — " + V8_HINT });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// إدارة المدارس
// ───────────────────────────────────────────────────────────────────────────

router.post("/teacher/org/schools", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "اسم المدرسة مطلوب" });
      return;
    }
    const { data: existing } = await supabaseQuery<any[]>("schools?select=id,name&limit=500");
    const dupe = (existing || []).find((s: any) => foldName(s.name) === foldName(name));
    if (dupe) {
      res.status(400).json({ error: `المدرسة «${dupe.name}» موجودة مسبقاً.` });
      return;
    }
    const maxOrder = (existing || []).reduce((m: number, s: any) => Math.max(m, s.sort_order ?? 0), 0);
    const payload = {
      id: slugId("school", name),
      name,
      sort_order: Number(req.body?.sortOrder) || maxOrder + 1,
      color: String(req.body?.color || "#37474f"),
      is_active: true,
    };
    const { error } = await supabaseQuery("schools", { method: "POST", body: [payload] });
    if (error) throw new Error(String(error));

    // اربطها بكل الصفوف النشطة افتراضياً
    try {
      const { data: gr } = await supabaseQuery<any[]>("grade_levels?is_active=eq.true&limit=200");
      if (gr?.length) {
        await supabaseQuery("grade_schools", {
          method: "POST",
          body: gr.map((g: any) => ({ grade_id: String(g.id), school_id: payload.id, sort_order: g.sort_order ?? 1 })),
        });
      }
    } catch { /* غير حرج */ }

    res.json({ success: true, school: { ...payload, grades: [], students: 0 }, message: `تمت إضافة المدرسة «${name}».` });
  } catch (err: any) {
    logger.error({ err }, "POST school failed");
    res.status(500).json({ error: "تعذر إضافة المدرسة — " + V8_HINT });
  }
});

router.patch("/teacher/org/schools/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const b = req.body || {};
    const { data: rows } = await supabaseQuery<any[]>(`schools?id=eq.${enc(id)}&select=id,name&limit=1`);
    const school = rows?.[0];
    if (!school) {
      res.status(404).json({ error: "المدرسة غير موجودة" });
      return;
    }
    const full: Record<string, any> = {};
    const newName = b.name !== undefined ? String(b.name).trim() : school.name;
    if (!newName) {
      res.status(400).json({ error: "اسم المدرسة لا يمكن أن يكون فارغاً" });
      return;
    }
    if (newName !== school.name) {
      const { data: others } = await supabaseQuery<any[]>("schools?select=id,name&limit=500");
      const dupe = (others || []).find((s: any) => s.id !== id && foldName(s.name) === foldName(newName));
      if (dupe) {
        res.status(400).json({ error: `توجد مدرسة أخرى بالاسم «${dupe.name}».` });
        return;
      }
      // إعادة التسمية تُطبَّق على الطلاب وعلى كل المحتوى الموجّه لهذه المدرسة
      for (const t of ["profiles", "courses", "lessons", "assessments", "assignments", "announcements", "summaries", "notebook_tasks", "foundation_sections"]) {
        try {
          await supabaseQuery(`${t}?school=eq.${enc(school.name)}`, { method: "PATCH", body: { school: newName } });
        } catch (e) {
          logger.warn({ table: t, err: e }, "school rename partial failure");
        }
      }
      full.name = newName;
    }
    if (b.color !== undefined) full.color = String(b.color);
    if (b.sortOrder !== undefined) full.sort_order = Number(b.sortOrder) || 1;
    if (b.isActive !== undefined) full.is_active = !!b.isActive;

    if (Object.keys(full).length) {
      const { error } = await supabaseQuery(`schools?id=eq.${enc(id)}`, { method: "PATCH", body: full });
      if (error) throw new Error(String(error));
    }
    res.json({ success: true, message: `تم حفظ المدرسة «${newName}».` });
  } catch (err: any) {
    logger.error({ err }, "PATCH school failed");
    res.status(500).json({ error: "تعذر حفظ المدرسة — " + V8_HINT });
  }
});

router.delete("/teacher/org/schools/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { data: rows } = await supabaseQuery<any[]>(`schools?id=eq.${enc(id)}&select=id,name&limit=1`);
    const school = rows?.[0];
    if (!school) {
      res.status(404).json({ error: "المدرسة غير موجودة" });
      return;
    }
    const { data: students } = await supabaseQuery<any[]>(
      `profiles?role=eq.student&school=eq.${enc(school.name)}&select=id&limit=1`,
    );
    if (students?.length) {
      res.status(400).json({
        error: `لا يمكن حذف «${school.name}» — فيه طلاب مسجّلون. انقلهم لمدرسة أخرى أولاً.`,
      });
      return;
    }
    await supabaseQuery(`grade_schools?school_id=eq.${enc(id)}`, { method: "DELETE" });
    const { error } = await supabaseQuery(`schools?id=eq.${enc(id)}`, { method: "DELETE" });
    if (error) throw new Error(String(error));
    res.json({ success: true, message: `تم حذف المدرسة «${school.name}».` });
  } catch (err: any) {
    logger.error({ err }, "DELETE school failed");
    res.status(500).json({ error: "تعذر حذف المدرسة — " + V8_HINT });
  }
});

/** ربط صف بمدرسة (checkbox واحدة) */
router.post("/teacher/org/grades/:gradeId/schools/:schoolId", requireAdmin, async (req, res) => {
  try {
    const g = String(req.params.gradeId);
    const s = String(req.params.schoolId);
    const on = req.body?.linked !== false;
    if (on) {
      const { error } = await supabaseQuery("grade_schools", {
        method: "POST",
        body: [{ grade_id: g, school_id: s }],
      });
      if (error) throw new Error(String(error));
    } else {
      const { error } = await supabaseQuery(`grade_schools?grade_id=eq.${enc(g)}&school_id=eq.${enc(s)}`, {
        method: "DELETE",
      });
      if (error) throw new Error(String(error));
    }
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "POST grade-school link failed");
    res.status(500).json({ error: "تعذر تحديث الربط — " + V8_HINT });
  }
});

/** ضبط كامل: ما هي مدارس هذا الصف */
router.put("/teacher/org/grades/:gradeId/schools", requireAdmin, async (req, res) => {
  try {
    const g = String(req.params.gradeId);
    const wanted = new Set(
      (Array.isArray(req.body?.schoolIds) ? req.body.schoolIds : []).map((x: any) => String(x || "")).filter(Boolean),
    );
    const { data: all } = await supabaseQuery<any[]>("schools?limit=500");
    const keep = (all || []).filter((s: any) => wanted.has(String(s.id))).map((s: any) => ({ grade_id: g, school_id: String(s.id), sort_order: s.sort_order ?? 1 }));

    await supabaseQuery(`grade_schools?grade_id=eq.${enc(g)}`, { method: "DELETE" });
    if (keep.length) {
      const { error } = await supabaseQuery("grade_schools", { method: "POST", body: keep });
      if (error) throw new Error(String(error));
    }
    res.json({ success: true, count: keep.length, message: `تم ربط الصف بـ ${keep.length} مدرسة.` });
  } catch (err: any) {
    logger.error({ err }, "PUT grade-schools failed");
    res.status(500).json({ error: "تعذر تحديث مدارس الصف — " + V8_HINT });
  }
});

export default router;
