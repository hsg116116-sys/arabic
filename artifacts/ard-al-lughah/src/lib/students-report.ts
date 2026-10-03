/* ============================================================================
   كشف الطلاب — تجميع حسب (الصف ← المدرسة ← الجنس) وبناء أوراق Excel.
   منطق نقي قابل للاختبار بلا أي اعتماد على React أو الشبكة.
   ============================================================================ */

import type { SheetSpec } from './xlsx';

export type ReportStudent = {
  id: string;
  name: string;
  email: string;
  phone: string;
  school: string;
  branch: string;
  grade: string;
  section: string;
  gender: string;
  status: string;
  studentNumber: string;
  createdAt: string;
  progress: number;
  completedLessons: number;
  hwSubmitted: number;
  hwGraded: number;
  hwAvg: number | null;
  examsTaken: number;
  examAvg: number | null;
  lastActive: string;
};

export type ReportBundle = {
  students: ReportStudent[];
  schools: string[];
  grades: string[];
  generatedAt: string;
};

/** تطبيع الاسم: إزالة المسافات الزائدة وتوحيد الألف/الياء/التاء المربوطة */
export function normalizeText(v: unknown): string {
  return String(v ?? '')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeSchool(v: unknown): string {
  const s = normalizeText(v);
  return s.replace(/^(ال)?مدرسه/, 'مدرسة').replace(/\s*-\s*/g, ' ');
}

/** груп�� مفاتيح: صف واحد ثم مدرسة ثم جنس */
export type StudentGroup = {
  key: string;
  grade: string;
  school: string;
  gender: 'طالب' | 'طالبة' | 'غير محدد';
  students: ReportStudent[];
};

export function groupStudents(rows: ReportStudent[]): {
  byGrade: Array<{ grade: string; total: number; schools: Array<{ school: string; total: number; groups: StudentGroup[] }> }>;
  totals: { students: number; grades: number; schools: number; groups: number };
} {
  const gradeMap = new Map<string, Map<string, StudentGroup>>();
  for (const r of rows) {
    const grade = (r.grade || '').trim() || 'غير محدد';
    const school = (r.school || '').trim() || 'غير محدد';
    const g: StudentGroup['gender'] = r.gender === 'طالبة' ? 'طالبة' : r.gender === 'طالب' ? 'طالب' : 'غير محدد';
    if (!gradeMap.has(grade)) gradeMap.set(grade, new Map());
    const bySchool = gradeMap.get(grade)!;
    const key = `${normalizeSchool(school)}__${g === 'طالبة' ? 'f' : 'm'}`;
    if (!bySchool.has(key)) {
      bySchool.set(key, { key, grade, school, gender: g, students: [] });
    }
    bySchool.get(key)!.students.push(r);
  }
  const byGrade = [...gradeMap.entries()]
    .map(([grade, bySchool]) => {
      const groups = [...bySchool.values()].sort((a, b) => {
        if (a.school !== b.school) return a.school.localeCompare(b.school, 'ar');
        return a.gender === 'طالب' ? -1 : a.gender === 'طالبة' ? 1 : 0;
      });
      const schoolAgg = new Map<string, { school: string; total: number; groups: StudentGroup[] }>();
      for (const g of groups) {
        const cur = schoolAgg.get(g.school) || { school: g.school, total: 0, groups: [] };
        cur.total += g.students.length;
        cur.groups.push(g);
        schoolAgg.set(g.school, cur);
      }
      const schools = [...schoolAgg.values()].sort((a, b) => a.school.localeCompare(b.school, 'ar'));
      return { grade, total: groups.reduce((a, g) => a + g.students.length, 0), schools };
    })
    .sort((a, b) => a.grade.localeCompare(b.grade, 'ar'));

  const groups = byGrade.reduce((a, g) => a + g.schools.reduce((x, s) => x + s.groups.length, 0), 0);
  return {
    byGrade,
    totals: { students: rows.length, grades: byGrade.length, schools: new Set(rows.map((r) => r.school).filter(Boolean)).size, groups },
  };
}

export const REPORT_HEADERS: string[] = [
  'م',
  'اسم الطالب',
  'المدرسة',
  'الصف',
  'القسم',
  'الجنس',
  'رقم الطالب',
  'الهاتف',
  'البريد الإلكتروني',
  'المسار',
  'نسبة التقدم %',
  'الدروس المكتملة',
  'واجبات مُسلّمة',
  'واجبات مُقيَّمة',
  'متوسط الواجبات',
  'عدد الاختبارات',
  'متوسط الاختبارات',
  'الحالة',
  'آخر نشاط',
  'تاريخ التسجيل',
];

export const REPORT_WIDTHS = [5, 30, 22, 14, 8, 9, 12, 16, 26, 16, 13, 14, 13, 13, 14, 13, 14, 10, 14, 14];

function formatDate(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const SHEET_LABELS = {
  boys: 'طلاب',
  girls: 'طالبات',
  unknown: 'غير محدد',
} as const;

const avg = (v: number | null): Cellish => (v === null || v === undefined || Number.isNaN(v) ? '' : Math.round(v * 10) / 10);
type Cellish = string | number;

/** صفوف الجدول لمجموعة واحدة */
export function groupRows(group: StudentGroup): Cellish[][] {
  const sorted = [...group.students].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return [
    REPORT_HEADERS,
    ...sorted.map((s, i) => [
      i + 1,
      s.name,
      s.school,
      s.grade,
      s.section,
      s.gender,
      s.studentNumber,
      s.phone,
      s.email,
      s.branch,
      Math.round(s.progress || 0),
      s.completedLessons || 0,
      s.hwSubmitted || 0,
      s.hwGraded || 0,
      avg(s.hwAvg),
      s.examsTaken || 0,
      avg(s.examAvg),
      s.status,
      formatDate(s.lastActive),
      formatDate(s.createdAt),
    ] as Cellish[]),
  ];
}

/** ورقة الملخص: كل الصفوف × كل المدارس × كل الجنسين */
export function summaryRows(bundle: ReportBundle): Cellish[][] {
  const { byGrade } = groupStudents(bundle.students);
  const rows: Cellish[][] = [
    ['كشف الطلاب التفصيلي'],
    ['الصف', 'المدرسة', 'طلاب', 'طالبات', 'غير محدد', 'الإجمالي'],
  ];
  let tB = 0;
  let tG = 0;
  let tU = 0;
  for (const g of byGrade) {
    let gb = 0;
    let gg = 0;
    let gu = 0;
    for (const s of g.schools) {
      for (const gr of s.groups) {
        if (gr.gender === 'طالب') gb += gr.students.length;
        else if (gr.gender === 'طالبة') gg += gr.students.length;
        else gu += gr.students.length;
      }
    }
    tB += gb;
    tG += gg;
    tU += gu;
    rows.push([g.grade, 'كل المدارس', gb, gg, gu, gb + gg + gu]);
  }
  rows.push(['الإجمالي', '', tB, tG, tU, tB + tG + tU]);
  rows.push([]);
  rows.push(['المدرسة', 'طلاب', 'طالبات', 'غير محدد', 'الإجمالي']);
  const bySchool = new Map<string, { b: number; g: number; u: number }>();
  for (const r of bundle.students) {
    const key = r.school || 'غير محدد';
    const cur = bySchool.get(key) || { b: 0, g: 0, u: 0 };
    if (r.gender === 'طالب') cur.b++;
    else if (r.gender === 'طالبة') cur.g++;
    else cur.u++;
    bySchool.set(key, cur);
  }
  for (const [school, v] of [...bySchool.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))) {
    rows.push([school, v.b, v.g, v.u, v.b + v.g + v.u]);
  }
  return rows;
}

/**
 * يبني كل أوراق الكشف:
 * 1) ملخص شامل  2) ورقة لكل صف  3) ورقة لكل (صف+مدرسة)  4) ورقة لكل (صف+مدرسة+جنس)
 */
export function buildStudentsReport(bundle: ReportBundle, opts?: { onlyGrade?: string }): SheetSpec[] {
  const sheets: SheetSpec[] = [];
  const { byGrade } = groupStudents(bundle.students);
  sheets.push({ name: 'الملخص', rows: summaryRows(bundle), widths: [26, 26, 10, 10, 12, 12] });

  const grades = opts?.onlyGrade ? byGrade.filter((g) => g.grade === opts.onlyGrade) : byGrade;
  for (const g of grades) {
    // ورقة الصف: كل مدارسه في ورقة واحدة
    const gradeRows: Cellish[][] = [REPORT_HEADERS];
    let idx = 0;
    for (const s of g.schools) {
      for (const gr of s.groups) {
        for (const st of [...gr.students].sort((a, b) => a.name.localeCompare(b.name, 'ar'))) {
          idx++;
          gradeRows.push([
            idx, st.name, st.school, st.grade, st.section, st.gender, st.studentNumber, st.phone, st.email,
            st.branch, Math.round(st.progress || 0), st.completedLessons || 0, st.hwSubmitted || 0,
            st.hwGraded || 0, avg(st.hwAvg), st.examsTaken || 0, avg(st.examAvg), st.status,
            formatDate(st.lastActive), formatDate(st.createdAt),
          ] as Cellish[]);
        }
      }
    }
    sheets.push({ name: g.grade, rows: gradeRows, widths: REPORT_WIDTHS });

    for (const s of g.schools) {
      // ورقة المدرسة داخل الصف
      const schoolRows: Cellish[][] = [REPORT_HEADERS];
      let i2 = 0;
      for (const gr of s.groups) {
        for (const st of [...gr.students].sort((a, b) => a.name.localeCompare(b.name, 'ar'))) {
          i2++;
          schoolRows.push([
            i2, st.name, st.school, st.grade, st.section, st.gender, st.studentNumber, st.phone, st.email,
            st.branch, Math.round(st.progress || 0), st.completedLessons || 0, st.hwSubmitted || 0,
            st.hwGraded || 0, avg(st.hwAvg), st.examsTaken || 0, avg(st.examAvg), st.status,
            formatDate(st.lastActive), formatDate(st.createdAt),
          ] as Cellish[]);
        }
      }
      sheets.push({ name: `${s.school} - ${g.grade}`, rows: schoolRows, widths: REPORT_WIDTHS });

      // ورقات مفصولة: طلاب / طالبات
      for (const gr of s.groups) {
        sheets.push({
          name: `${gr.school} - ${g.grade} - ${SHEET_LABELS[gr.gender === 'طالب' ? 'boys' : gr.gender === 'طالبة' ? 'girls' : 'unknown']}`,
          rows: groupRows(gr),
          widths: REPORT_WIDTHS,
        });
      }
    }
  }
  return sheets;
}

/** اسم ملف مقروء مع التاريخ */
export function reportFileName(prefix: string, grade?: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const safe = (grade || 'كل الصفوف').replace(/[\\/:*?"<>|]/g, '').trim();
  return `${prefix} - ${safe} - ${stamp}`;
}