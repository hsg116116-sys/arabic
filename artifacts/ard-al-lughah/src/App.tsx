// @ts-nocheck
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  useGetPlatformOverview,
  useGetGoogleAuthUrl,
  useGetStudentDashboard,
  useGetTeacherDashboard,
  useGetTeacherSettings,
  useListAnnouncements,
  useListAssessments,
  useListAssignments,
  useListCourses,
  useListStudents,
  useLoginAccount,
  useLogoutAccount,
  useRegisterAccount,
  useRequestPasswordReset,
  useUpdateTeacherSettings,
  getGetGoogleAuthUrlQueryKey,
} from '@workspace/api-client-react';
import {
  ArrowLeft,
  ArrowUpLeft,
  Award,
  Bell,
  BookMarked,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  BookCopy,
  Camera,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  GraduationCap,
  Castle,
  HelpCircle,
  ImagePlus,
  Landmark,
  LayoutDashboard,
  Leaf,
  Library,
  Lightbulb,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  Maximize2,
  Medal,
  Menu,
  MessagesSquare,
  MoreHorizontal,
  NotebookPen,
  NotebookText,
  Pencil,
  Package,
  Phone,
  PlayCircle,
  Printer,
  ScrollText,
  Swords,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

async function jsonFetch(path: string, options?: { method?: string; body?: unknown }): Promise<any> {
  const res = await fetch(path, {
    method: options?.method || 'GET',
    headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return Promise.reject(new Error(data?.error || data?.message || 'حدث خطأ غير متوقع.'));
  return data;
}

async function fetchAuthMe(): Promise<any> {
  return jsonFetch('/api/auth/me');
}

function redirectAfterAuth(setLocation: (to: string) => void, fallback = '/student') {
  fetchAuthMe()
    .then((me) => {
      if (!me.authenticated) { setLocation(fallback); return; }
      if (me.needsSetup) { setLocation('/auth/complete'); return; }
      setLocation(me.role === 'admin' ? '/teacher' : fallback);
    })
    .catch(() => setLocation(fallback));
}
const teacherImageUrl = '/teacher-ahmed.jpg';
const APP_VERSION = 'v25.09-C';
const platformLogoUrl = '/ard-al-lughah-logo-transparent.png';
const platformBannerUrl = '/ard-al-lughah-banner-transparent.png';
const bookNineUrl = '/arab-9.jpg';
const bookTenUrl = '/arab-10.jpg';

const resourceTabs = [
  { id: 'quizzes', label: 'بنك الاختبارات', icon: Target, description: 'تقييمات حقيقية على المنصة' },
  { id: 'downloads', label: 'المكتبة الرقمية', icon: Download, description: 'الكتب المعتمدة القابلة للقراءة والتحميل' },
  { id: 'grammar', label: 'الوحدات التعليمية', icon: BookMarked, description: 'وحدات المنهاج بترتيبها الرسمي' },
] as const;

const navStudent = [
  { href: '/student', label: 'نظرة عامة', icon: LayoutDashboard },
  { href: '/student/courses', label: 'الوحدات التعليمية', icon: BookOpen },
  { href: '/student/summaries', label: 'الملخصات', icon: NotebookText },
  { href: '/student/notebook', label: 'دفتري', icon: NotebookPen },
  { href: '/student/assessments', label: 'التقييمات', icon: Target },
  { href: '/student/assignments', label: 'الواجبات', icon: ClipboardCheck },
  { href: '/student/profile', label: 'ملفي الشخصي', icon: UserRound },
];

const navTeacher = [
  { href: '/teacher', label: 'لوحة المتابعة', icon: LayoutDashboard },
  { href: '/teacher/students', label: 'الطلاب', icon: UsersRound },
  { href: '/teacher/content', label: 'المنهاج والوحدات', icon: Library },
  { href: '/teacher/exams', label: 'الاختبارات', icon: Target },
  { href: '/teacher/assignments', label: 'الواجبات', icon: ClipboardCheck },
  { href: '/teacher/notebooks', label: 'مهام الدفتر', icon: NotebookPen },
  { href: '/teacher/announcements', label: 'الإعلانات', icon: Bell },
  { href: '/teacher/settings', label: 'هوية المنصة', icon: Settings },
];

/* =========================================================================
   منظومة المنهاج — ثوابت مشتركة (صفوف × فصول × أنواع الدروس)
========================================================================= */
const GRADES = ['الصف الثامن', 'الصف التاسع', 'الصف العاشر'];
const TERMS = ['الفصل الأول', 'الفصل الثاني'];
const LESSON_TYPES = ['مطالعة', 'قراءة', 'استماع', 'شعر', 'قواعد', 'بلاغة', 'عروض', 'إملاء', 'خط', 'تعبير', 'تقويم'];
const UNIT_STATUSES = [
  { id: 'published', label: 'منشورة ومفتوحة' },
  { id: 'locked', label: 'مقفلة مؤقتاً' },
  { id: 'empty', label: 'فارغة — قريباً' },
  { id: 'hidden', label: 'مخفية عن الطلاب' },
];
const UNIT_COLORS = ['#2e7d32', '#2f7772', '#8a508f', '#a85d3d', '#b7791f', '#0d47a1', '#5d4037', '#37474f', '#6a1b9a', '#00695c'];

const UNIT_ICONS: Record<string, typeof BookOpen> = {
  'book-open': BookOpen,
  'library': Library,
  'target': Target,
  'award': Award,
  'sparkles': Sparkles,
  'shield-check': ShieldCheck,
  'landmark': Landmark,
  'leaf': Leaf,
  'swords': Swords,
  'package': Package,
  'scroll-text': ScrollText,
  'castle': Castle,
  'graduation-cap': GraduationCap,
  'medal': Medal,
};

function lessonTypeIcon(type: string) {
  switch (type) {
    case 'شعر': return Quote;
    case 'قواعد': return Pencil;
    case 'بلاغة': return Sparkles;
    case 'عروض': return TrendingUp;
    case 'إملاء': return FileText;
    case 'تعبير': return MessagesSquare;
    case 'تقويم': return ClipboardCheck;
    case 'استماع': return Bell;
    case 'قراءة': return BookCopy;
    case 'خط': return Pencil;
    default: return BookOpen;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/** رفع ملف إلى التخزين السحابي (ImageKit) — النص فقط يبقى في Supabase */
async function uploadFileToCloud(file: File, folder: string): Promise<any> {
  const dataUrl = await fileToDataUrl(file);
  return jsonFetch('/api/teacher/upload', {
    method: 'POST',
    body: { file: dataUrl, fileName: file.name, folder },
  });
}

function isCloudUrl(url?: string) {
  return !!url && url.startsWith('https://ik.imagekit.io/');
}

const AR_LETTER_INDEX: Record<string, number> = { 'أ': 0, 'ا': 0, 'إ': 0, 'ب': 1, 'ج': 2, 'د': 3, 'هـ': 4, 'ه': 4, 'و': 5, 'ز': 6, 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };

/** استخراج الأسئلة من نص ماركداون عادي (## عنوان + الخيارات + الجواب الصحيح + ملاحظة) */
function parseTextQuiz(raw: string) {
  const lines = String(raw || '').split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  const isHeader = (l: string) => {
    const t = l.trim();
    return /^#{1,4}\s*\d*\.?\s*\S/.test(t) || /^\d{1,2}\s*[.)]\s*\S/.test(t);
  };
  for (const line of lines) {
    if (isHeader(line) && cur.length) { blocks.push(cur); cur = [line]; }
    else cur.push(line);
  }
  if (cur.length) blocks.push(cur);

  const out: any[] = [];
  for (const b of blocks) {
    const text = b.join('\n');
    if (!/الخيارات|الاختيارات/i.test(text)) continue;
    // العنوان: أول سطر (يُجرَّد من # والترقيم)
    const title = b.map((l) => l.trim()).find((l) => l && !/^\*{0,2}\s*(الخيارات|الاختيارات|الجواب|الإجابة|ملاحظة|توضيح)/.test(l))
      ?.replace(/^#{1,4}\s*/, '').replace(/^\*{0,2}\s*\d{1,2}\s*[.)]\s*/, '').replace(/^\*+\s*/, '').trim() || '';
    // الخيارات
    const optLine = b.map((l) => l.trim()).find((l) => /الخيارات|الاختيارات/.test(l)) || '';
    let opts: string[] = optLine.split(':').slice(1).join(':').split('|').map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) {
      opts = optLine.split(':').slice(1).join(':').split(/(?=[أابجدهـوA-Da-d]\s*[).])/).map((o) => o.trim()).filter(Boolean);
    }
    opts = opts
      .map((o) => o.replace(/^[-*•\s]+/, '').replace(/^[أا-يA-Za-z]\s*[).:：-]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!title || opts.length < 2) continue;
    // الجواب الصحيح
    const ansLine = b.map((l) => l.trim()).find((l) => /الجواب الصحيح|الإجابة الصحيحة|^\*{0,2}\s*الجواب\s*:/.test(l)) || '';
    const ansText = ansLine.split(':').slice(1).join(':').trim();
    let correct = -1;
    const letterMatch = ansText.match(/^\*?\s*([أا-يA-Za-z])\s*[).:：-]/);
    if (letterMatch && AR_LETTER_INDEX[letterMatch[1]] !== undefined) {
      const li = AR_LETTER_INDEX[letterMatch[1]];
      if (li < opts.length) correct = li;
    }
    if (correct < 0) {
      const idx = opts.findIndex((o) => o && (ansText.includes(o) || o.includes(ansText.replace(/^[أا-يA-Za-z]\s*[).:：-]\s*/, '').trim())));
      if (idx >= 0) correct = idx;
    }
    if (correct < 0) correct = 0;
    // الملاحظة / الشرح
    const noteLine = b.map((l) => l.trim()).find((l) => /ملاحظ[ةه]|توضيح|شرح/.test(l)) || '';
    const explanation = noteLine.split(':').slice(1).join(':').replace(/^\*+\s*/, '').trim();
    out.push({ question: title.slice(0, 500), options: opts.slice(0, 4), correctAnswer: Math.min(correct, opts.slice(0, 4).length - 1), explanation: explanation.slice(0, 500) });
  }
  return out;
}

/** الفصل الدراسي المعتمد من إعدادات المنصة (يغيّره الإداري — بدون اختيار يدوي) */
function usePlatformTerm() {
  const [term, setTerm] = useState('الفصل الأول');
  useEffect(() => {
    jsonFetch('/api/curriculum/settings').then((d) => { if (d?.semester) setTerm(d.semester); }).catch(() => undefined);
  }, []);
  return term;
}

/** خريطة التقسيم لكل صف: { 'الصف العاشر': true } */
function useSplitMap() {
  const [map, setMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    jsonFetch('/api/curriculum/grade-settings')
      .then((d) => {
        const m: Record<string, boolean> = {};
        if (Array.isArray(d)) for (const g of d) m[g.grade] = !!g.genderSplit;
        setMap(m);
      })
      .catch(() => undefined);
  }, []);
  return map;
}

/** صف الطالب من حسابه + الفصل والتقسيم (لصفه فقط) من الإعدادات */
function useStudentGradeTerm() {
  const dash = useGetStudentDashboard();
  const overview = useGetPlatformOverview();
  const [liveSemester, setLiveSemester] = useState<string | null>(null);
  useEffect(() => {
    jsonFetch('/api/curriculum/settings').then((d) => { if (d?.semester) setLiveSemester(d.semester); }).catch(() => undefined);
  }, []);
  const splitMap = useSplitMap();
  const grade = dash.data?.student?.grade || 'الصف العاشر';
  const term = liveSemester || (overview.data as any)?.semester || 'الفصل الأول';
  const split = splitMap[grade] === true;
  const gender = dash.data?.student?.gender || '';
  return { grade, term, split, splitMap, gender, student: dash.data?.student, studentId: dash.data?.student?.id };
}

/** شارة تعريفية: الصف والفصل والقسم المعتمدين تلقائياً */
function GradeTermBadge({ grade, term, split, gender }: { grade: string; term: string; split?: boolean; gender?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm">
        <GraduationCap size={16} /> {grade}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow-sm">
        <BookOpen size={16} /> {term}
      </span>
      {split && (gender === 'طالب' || gender === 'طالبة') ? (
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#6a1b9a] to-[#8a508f] px-4 py-2.5 text-sm font-bold text-white shadow-sm">
          <UsersRound size={16} /> {gender === 'طالب' ? 'قسم الطلاب' : 'قسم الطالبات'}
        </span>
      ) : null}
      <span className="text-xs text-muted-foreground">صفك من حسابك — والفصل يحدده الأستاذ من الإعدادات</span>
    </div>
  );
}

const SECTIONS = [
  { id: 'الجميع', label: 'الجميع', hint: 'طلاب وطالبات معاً' },
  { id: 'طالب', label: 'الطلاب فقط', hint: 'قسم الذكور' },
  { id: 'طالبة', label: 'الطالبات فقط', hint: 'قسم الإناث' },
];

/** اختيار القسم المستهدف للمحتوى (وحدة/ملخص/اختبار/مهمة/إعلان) */
function SectionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-2 block text-sm font-semibold">القسم المستهدف <span className="font-normal text-muted-foreground">(يُطبَّق فقط عند تفعيل التقسيم من الإعدادات)</span></p>
      <div className="grid grid-cols-3 gap-2">
        {SECTIONS.map((s) => {
          const selected = (value || 'الجميع') === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              className={`rounded-2xl border-2 p-3 text-center transition-all ${selected ? 'border-accent bg-accent/15 shadow-md' : 'border-border bg-background hover:border-accent/50'}`}
              data-testid={`section-${s.id}`}
            >
              <p className={`text-sm font-extrabold ${selected ? 'text-primary' : 'text-foreground'}`}>{s.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function statusLabel(status?: string, isEmpty?: boolean) {
  if (isEmpty || status === 'empty') return 'فارغة — قريباً';
  if (status === 'locked') return 'مقفلة';
  if (status === 'hidden') return 'مخفية';
  return 'مفتوحة';
}

/** رفع صور الطالب (الدفاتر) إلى مجلد مخصص سحابياً */
async function uploadStudentPhoto(file: File): Promise<any> {
  const dataUrl = await fileToDataUrl(file);
  return jsonFetch('/api/student/upload', {
    method: 'POST',
    body: { file: dataUrl, fileName: file.name },
  });
}

const SUMMARY_TYPES = ['ملخص', 'خريطة ذهنية', 'ورقة عمل', 'بطاقة مراجعة'];

/* =========================================================================
   لغة التصميم الجديدة — بطل الأقسام + بلاطات الوصول السريع
========================================================================= */

function SectionHero({ eyebrow, title, body, action, tone = 'dark', stats }: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: 'dark' | 'light';
  stats?: { value: string | number; label: string }[];
}) {
  const dark = tone === 'dark';
  return (
    <section className={`relative mb-8 overflow-hidden rounded-[2rem] p-6 shadow-xl sm:p-9 ${dark ? 'bg-gradient-to-l from-[#0c2725] via-[#17413f] to-[#25655f] text-white' : 'border border-accent/35 bg-gradient-to-l from-accent/25 via-card to-card'}`}>
      <div className={`pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full blur-3xl ${dark ? 'bg-accent/30' : 'bg-accent/40'}`} />
      <div className={`pointer-events-none absolute -bottom-24 right-1/4 h-52 w-52 rounded-full blur-3xl ${dark ? 'bg-accent/15' : 'bg-accent/20'}`} />
      <div className={`pointer-events-none absolute -right-4 -top-14 select-none font-display text-[11rem] leading-none ${dark ? 'text-white/[0.07]' : 'text-primary/[0.06]'}`}>ض</div>
      <div className="relative">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            {eyebrow ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold shadow-sm ${dark ? 'bg-accent text-[#3a2c07]' : 'bg-primary text-primary-foreground'}`}>
                <Sparkles size={13} /> {eyebrow}
              </span>
            ) : null}
            <h2 className={`mt-3 font-display text-3xl font-bold leading-snug sm:text-4xl ${dark ? 'text-white' : 'text-primary'}`}>{title}</h2>
            {body ? <p className={`mt-2.5 max-w-xl text-sm leading-7 ${dark ? 'text-white/75' : 'text-muted-foreground'}`}>{body}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{action}</div> : null}
        </div>
        {stats?.length ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s, i) => (
              <div key={i} className={`rounded-2xl px-4 py-3.5 backdrop-blur-md ${dark ? 'bg-white/10 ring-1 ring-white/15' : 'bg-background/70 ring-1 ring-border'}`}>
                <p className={`font-display text-2xl font-bold ${dark ? 'text-accent' : 'text-primary'}`}>{s.value}</p>
                <p className={`mt-0.5 text-xs font-semibold ${dark ? 'text-white/65' : 'text-muted-foreground'}`}>{s.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function QuickTile({ icon: Icon, title, body, href, badge, color = '#17413f' }: {
  icon: typeof BookOpen; title: string; body: string; href: string; badge?: string | number; color?: string;
}) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:ring-2 hover:ring-accent/40" data-testid={`tile-${href.replaceAll('/', '-')}`}>
      <div className="pointer-events-none absolute -left-8 -top-8 h-28 w-28 rounded-full opacity-15 blur-2xl transition-opacity group-hover:opacity-30" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-13 w-13 place-items-center rounded-2xl p-3 text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <Icon size={23} />
        </span>
        {badge !== undefined ? <span className="rounded-full bg-accent/25 px-3 py-1 text-xs font-bold text-accent-foreground">{badge}</span> : null}
      </div>
      <h3 className="mt-4 flex items-center gap-1.5 text-base font-bold text-primary">{title} <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-1" /></h3>
      <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{body}</p>
    </Link>
  );
}

function Logo({ compact = false, size = 'md' }: { compact?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const imgClass = compact ? 'h-12 w-12' : size === 'lg' ? 'h-16 w-16 lg:h-20 lg:w-20' : 'h-14 w-14';
  const textClass = compact ? 'text-lg' : size === 'lg' ? 'text-2xl lg:text-3xl' : 'text-xl';
  return (
    <Link href="/" className="inline-flex shrink-0 items-center gap-3" data-testid="link-brand">
      <img src={platformLogoUrl} alt="شعار أرض اللغة" className={`${imgClass} object-contain`} />
      <span className={`${textClass} font-display font-bold tracking-tight text-primary`}>أرض اللغة</span>
    </Link>
  );
}

function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'outline' }) {
  const variants = {
    primary: 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md',
    soft: 'bg-secondary text-secondary-foreground hover:bg-accent/50',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    outline: 'border border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary/40',
  };
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function StateNotice({ type, onRetry }: { type: 'loading' | 'empty' | 'error'; onRetry?: () => void }) {
  if (type === 'loading') {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
        <div className="h-4 w-1/3 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
        {type === 'error' ? <X size={20} /> : <Sparkles size={20} />}
      </span>
      <p className="font-semibold">{type === 'error' ? 'تعذر تحميل البيانات حالياً' : 'لا توجد عناصر بعد'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {type === 'error' ? 'حاول التحديث مرة أخرى بعد قليل.' : 'ستظهر هنا البيانات المحدثة مباشرة من المنهاج.'}
      </p>
      {type === 'error' && onRetry && (
        <Button onClick={onRetry} variant="soft" className="mt-4">
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  children,
  onClose,
  maxWidth = 'max-w-xl',
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-[#081a19]/[0.96] p-2.5 sm:bg-[#081a19]/[0.93] sm:p-6 sm:backdrop-blur-lg" role="dialog" aria-modal="true">
      <button aria-label="إغلاق" onClick={onClose} data-testid="button-close-modal-overlay" className="fixed inset-0 cursor-default" />
      <div className={`relative z-10 mx-auto my-3 flex w-[calc(100vw_-_1.25rem)] ${maxWidth} flex-col overflow-hidden rounded-[1.8rem] border border-white/10 bg-card animate-modal-pop sm:my-8 sm:w-full sm:max-h-[calc(100dvh_-_4rem)] sm:max-w-[calc(100vw_-_3rem)] sm:shadow-[0_30px_90px_-15px_rgba(0,0,0,0.6)] sm:shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-gradient-to-l from-secondary/80 via-card to-card px-4 py-3.5 sm:gap-4 sm:px-7 sm:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[#2a7a72] text-primary-foreground shadow-md sm:h-11 sm:w-11">
              <Sparkles size={19} />
            </span>
            <div className="min-w-0">
              {eyebrow && <p className="mb-0.5 truncate text-[11px] font-bold text-accent-foreground sm:text-xs">{eyebrow}</p>}
              <h2 className="truncate font-display text-lg font-extrabold text-primary sm:text-2xl">{title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm transition-all hover:rotate-90 hover:border-destructive/40 hover:text-destructive" aria-label="إغلاق" data-testid="button-close-modal">
            <X size={19} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-x-clip overflow-y-visible overscroll-contain px-4 pb-28 pt-4 sm:overflow-y-auto sm:px-7 sm:py-6">{children}</div>
      </div>
    </div>
  );
}

function ProgressRing({ value, size = 100 }: { value: number; size?: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * Math.min(value, 100)) / 100}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-bold text-primary">{value}%</span>
    </div>
  );
}

function Avatar({ name = 'أ', src, size = 'md' }: { name?: string; src?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-20 w-20 text-2xl' };
  return src ? (
    <img src={src} alt={name} className={`${sizes[size]} rounded-2xl object-cover`} data-testid="img-avatar" />
  ) : (
    <span className={`${sizes[size]} grid place-items-center rounded-2xl bg-secondary font-bold text-primary`} data-testid="avatar-fallback">
      {name.slice(0, 1)}
    </span>
  );
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8 lg:py-4">
        <Logo size="lg" />
        <nav className="hidden items-center gap-8 text-base font-semibold text-muted-foreground lg:flex lg:gap-9">
          <a href="#books" className="transition-colors hover:text-primary" data-testid="link-journey">الكتب التعليمية</a>
          <a href="#resources" className="transition-colors hover:text-primary" data-testid="link-resources">الاختبارات والمكتبة</a>
          <a href="#teacher" className="transition-colors hover:text-primary" data-testid="link-teacher">مع الأستاذ أحمد</a>
          <a href="#numbers" className="transition-colors hover:text-primary" data-testid="link-numbers">عن المنصة</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden rounded-xl bg-secondary/60 px-4 py-2.5 text-base font-semibold text-primary transition-colors hover:bg-secondary sm:block" data-testid="link-login">
            تسجيل الدخول
          </Link>
          <Link href="/register" className="rounded-2xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md" data-testid="link-register">
            ابدأ التعلم
          </Link>
        </div>
      </div>
    </header>
  );
}

function Home() {
  const overview = useGetPlatformOverview();
  const platform = overview.data;
  const stats = platform?.stats;
  const semester = platform?.semester ?? 'الفصل الأول';
  const allBooks = platform?.books ?? [];
  const norm = (s: string) => s.replace(/[\u0622\u0623\u0625]/g, '\u0627').replace(/\s+/g, ' ').trim();
  const currentTermBooks = allBooks.filter((b) => norm(b.term) === norm(semester));
  const grade9Book = currentTermBooks.find((b) => b.grade === 'الصف التاسع');
  const grade10Book = currentTermBooks.find((b) => b.grade === 'الصف العاشر');
  const [resourceTab, setResourceTab] = useState<'quizzes' | 'downloads' | 'grammar'>('quizzes');
  const [activeBlog, setActiveBlog] = useState(-1);

  const assessmentsQuery = useListAssessments();
  const coursesQuery = useListCourses();
  const announcementsQuery = useListAnnouncements();
  const studentsQuery = useListStudents();
  const assignmentsQuery = useListAssignments();

  const realAssessments = (assessmentsQuery.data ?? []).slice(0, 3);
  const realCourses = (coursesQuery.data ?? []).slice(0, 3);
  const realBooks = currentTermBooks.slice(0, 3);
  const realAnnouncements = (announcementsQuery.data ?? []).slice(0, 3);
  const realHonor = [...(studentsQuery.data ?? [])].sort((a, b) => b.progress - a.progress).slice(0, 3);
  const realAssignments = [...(assignmentsQuery.data ?? [])].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 3);

  const resourceItems = resourceTab === 'quizzes'
    ? realAssessments.map((a) => ({ id: a.id, title: a.title, body: `${a.questions} سؤالاً · المدة ${a.duration}`, meta: a.status ?? a.date, icon: Target }))
    : resourceTab === 'downloads'
      ? realBooks.map((b) => ({ id: b.id, title: b.title, body: `الكتاب المعتمد لـ ${b.grade} · ${b.term}`, meta: 'ملف رقمي PDF', icon: BookOpen }))
      : realCourses.map((c) => ({ id: c.id, title: c.title, body: c.description, meta: `${c.lessons} دروس · ${c.duration}`, icon: BookMarked }));

  const communityCards = realAnnouncements.map((a) => ({ key: a.id, quote: a.body, name: a.title, detail: a.date }));
  const liveCards = realAssignments.map((a) => {
    const dueDate = new Date(a.dueDate + 'T00:00:00');
    return {
      key: a.id,
      title: a.title,
      meta: `${a.points} نقطة ${a.unit ? '· ' + a.unit : ''}`,
      status: a.status,
      day: dueDate.toLocaleDateString('ar-EG', { weekday: 'long' }),
      dayNum: dueDate.toLocaleDateString('ar-EG', { day: 'numeric' }),
      month: dueDate.toLocaleDateString('ar-EG', { month: 'long' }),
    };
  });
  const blogCards = realCourses.map((c, index) => ({ key: c.id, category: `وحدة تعليمية · ٠${index + 1}`, title: c.title, body: c.description }));

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-background">
      <PublicHeader />
      <main>
        {/* Hero */}
        <section className="surface-grid relative mx-auto max-w-7xl px-5 pb-20 pt-10 lg:px-8 lg:pb-28 lg:pt-16">
          <div className="pointer-events-none absolute -left-48 top-10 h-[34rem] w-[34rem] rounded-full bg-accent/20 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.03fr_.97fr]">
            <div className="order-2 animate-rise lg:order-1">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/45 bg-card/75 px-3.5 py-2 text-xs font-bold text-primary shadow-sm">
                <Sparkles size={14} className="text-accent-foreground" /> منصة عربية للتعلّم من قلب فلسطين
              </div>
              <h1 className="max-w-2xl text-balance font-display text-[2.75rem] font-bold leading-[1.45] text-primary sm:text-5xl lg:text-[4.35rem]">
                أرض اللغة
                <br />
                <span className="text-accent-foreground">تقرّبك من العربية.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
                {platform?.tagline ?? 'منهاج فلسطيني معتمد للغة العربية والقرآن الكريم، بخطوات واضحة ومتابعة إنسانية من الأستاذ أحمد يحيى الأسطل.'}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="link-hero-register">
                  ابدأ رحلتك <ArrowLeft size={18} />
                </Link>
                <a href="#books" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3.5 font-semibold text-primary transition-colors hover:bg-secondary" data-testid="link-hero-books">
                  تصفح الكتب <BookOpen size={18} />
                </a>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
                <div className="flex -space-x-2 space-x-reverse">
                  {['س', 'م', 'ر'].map((letter) => (
                    <Avatar key={letter} name={letter} size="sm" />
                  ))}
                </div>
                <span>محتوى مرتب للصفين التاسع والعاشر</span>
                <span className="hidden h-1 w-1 rounded-full bg-accent sm:block" />
                <span className="flex items-center gap-1.5 font-semibold text-primary">
                  <CheckCircle2 size={16} className="text-accent-foreground" /> تعلّم بثقة
                </span>
              </div>
            </div>
            <div className="relative order-1 animate-rise [animation-delay:120ms] lg:order-2">
              <div className="relative flex aspect-[2/1] items-center justify-center overflow-hidden">
                <img src={platformBannerUrl} alt="بانر أرض اللغة مع كتاب اللغة العربية والمعلم أحمد يحيى الأسطل" className="absolute -top-[20%] block w-full max-w-none" data-testid="img-platform-banner" />
              </div>
              <div className="absolute bottom-2 right-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-md" data-testid="badge-hero-semester">
                <BookOpen size={13} className="text-accent" /> كتب {semester}
              </div>
            </div>
          </div>
        </section>

        {/* Books */}
        <section id="books" className="border-y border-border bg-card/60 py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-8">
            <div>
              <p className="text-sm font-bold text-accent-foreground">كتب ترافقك في كل خطوة</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.55] text-primary sm:text-4xl">
                كتب واضحة،
                <br />
                تستحق أن تُفتح كل يوم.
              </h2>
              <p className="mt-5 max-w-md text-base leading-8 text-muted-foreground">
                سلسلة اللغة العربية للصفين التاسع والعاشر في {semester}، مرتبة لتقرأ وتفهم وتطبّق بثقة — ويمكنك تحميل كل كتاب بنسخته الرقمية.
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-accent/45 bg-card px-3 py-1 text-xs font-bold text-primary shadow-sm" data-testid="badge-books-semester">
                <BookOpen size={13} className="text-accent-foreground" /> كتب {semester} المعتمدة
              </div>
              <Link href="/register" className="mt-7 inline-flex items-center gap-2 font-semibold text-primary hover:text-accent-foreground" data-testid="link-books-register">
                ابدأ مع كتبك <ArrowLeft size={17} />
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {grade9Book && grade10Book ? (
                <>
                  <HomeBookCard book={grade9Book} tone="purple" />
                  <HomeBookCard book={grade10Book} tone="rose" />
                </>
              ) : (
                <>
                  <BookCover image={bookNineUrl} grade="الجزء الأول · ٠٩" title="اللغة العربية" subtitle="المسار الأكاديمي" tone="purple" />
                  <BookCover image={bookTenUrl} grade="الجزء الأول · ١٠" title="اللغة العربية" subtitle="المسار الأكاديمي" tone="rose" />
                </>
              )}
            </div>
          </div>
        </section>

        {/* Resources */}
        <section id="resources" className="bg-secondary/25 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-bold text-accent-foreground">تعلم أكثر، بطريقة أقرب لك</p>
                <h2 className="mt-3 font-display text-3xl font-bold leading-[1.5] text-primary sm:text-4xl">كل ما تحتاجه للمراجعة في مكان واحد.</h2>
                <p className="mt-4 leading-8 text-muted-foreground">تقييمات حقيقية، كتب معتمدة، ووحدات المنهاج الكاملة — نضع لك كل شيء في مساحتك التعليمية.</p>
              </div>
              <Link href="/register" className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" data-testid="link-resources-register">
                افتح مساحتك التعليمية <ArrowLeft size={17} />
              </Link>
            </div>
            <div className="mt-10 flex gap-2 overflow-x-auto border-b border-border pb-2 scrollbar-thin">
              {resourceTabs.map((tab) => {
                const Icon = tab.icon;
                const active = resourceTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => setResourceTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-card hover:text-primary'}`} aria-pressed={active} data-testid={`button-resource-${tab.id}`}>
                    <Icon size={17} />{tab.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {resourceItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="group rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:shadow-md">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary transition-colors group-hover:bg-accent"><Icon size={21} /></span>
                      <span className="rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold text-muted-foreground">{item.meta}</span>
                    </div>
                    <h3 className="mt-6 text-lg font-bold text-primary">{item.title}</h3>
                    <p className="mt-2 min-h-14 text-sm leading-7 text-muted-foreground">{item.body}</p>
                    <Link href="/register" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-accent-foreground" data-testid={`link-resource-${item.id}`}>
                      {resourceTab === 'quizzes' ? 'ابدأ التدريب' : resourceTab === 'downloads' ? 'تحميل الكتاب' : 'افتح الوحدة'} <ArrowLeft size={15} />
                    </Link>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 size={15} className="text-accent-foreground" /> المحتوى يتوسع باستمرار مع كل وحدة ودرس جديد.</p>
          </div>
        </section>

        {/* Journey */}
        <section id="journey" className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
          <div className="max-w-xl">
            <p className="text-sm font-bold text-accent-foreground">طريق واضح، أثر دائم</p>
            <h2 className="mt-3 font-display text-4xl font-bold text-primary">كل درس يقرّبك من صوتك العربي</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <FeatureCard number="01" icon={Library} title="تعلم على مهل" body="وحدات قصيرة ومركزة، مصممة لتناسب يومك وتحافظ على فضولك." />
            <FeatureCard number="02" icon={Target} title="اعرف تقدمك" body="ترى ما أنجزته وما ينتظرك، فتتحول الخطوات الصغيرة إلى إنجاز ملموس." />
            <FeatureCard number="03" icon={Award} title="احتفل بالنمو" body="تقييمات هادئة وشهادات تعكس رحلة حقيقية، لا مجرد أرقام عابرة." />
          </div>
        </section>

        {/* Community */}
        <section id="community" className="border-y border-border bg-card/60 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold text-accent-foreground">رحلة يشاركك فيها الآخرون</p>
                <h2 className="mt-3 font-display text-3xl font-bold text-primary sm:text-4xl">مستجدات حقيقية من مساحة التعلم.</h2>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-bold text-primary"><MessagesSquare size={15} /> مجتمع يتعلم معًا</span>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
              <div className="grid gap-4 md:grid-cols-3">
                  {communityCards.map((item) => (
                    <div key={item.key} className="rounded-3xl border border-border bg-background p-5">
                      <Quote size={23} className="text-accent-foreground" />
                      <p className="mt-5 min-h-24 text-sm leading-7 text-muted-foreground">“{item.quote}”</p>
                      <div className="mt-5 border-t border-border pt-4">
                        <p className="font-bold text-primary">{item.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              <div className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-primary-foreground/65">لوحة الشرف</p>
                    <h3 className="mt-1 font-display text-2xl font-bold">أبطال أرض اللغة</h3>
                  </div>
                  <Medal className="text-accent" size={30} />
                </div>
                <div className="mt-6 space-y-3">
                  {realHonor.map((student, index) => (
                    <div key={student.id} className="flex items-center gap-3 rounded-2xl bg-primary-foreground/10 px-3 py-3">
                      <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent font-bold text-accent-foreground">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{student.name}</p>
                        <p className="mt-0.5 text-[11px] text-primary-foreground/55">{student.grade}{student.school ? ' · ' + student.school : ''}</p>
                      </div>
                      <span className="font-display text-lg font-bold text-accent">{student.progress}%</span>
                    </div>
                  ))}
                </div>
                <Link href="/register" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-accent hover:text-primary-foreground" data-testid="link-honor-register">
                  ابدأ طريقك إلى لوحة الشرف <ArrowLeft size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Teacher */}
        <section id="teacher" className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-8 lg:py-24">
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-4 rotate-3 rounded-[2rem] bg-accent/25" />
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-primary text-primary-foreground shadow-lg">
              <img src={teacherImageUrl} alt="الأستاذ أحمد يحيى الأسطل" className="h-full w-full object-cover object-[center_18%]" data-testid="img-teacher-public" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/25 to-transparent" />
              <div className="absolute bottom-7 right-7 left-7">
                <p className="text-sm text-primary-foreground/70">المعلم الذي يمشي معك</p>
                <h2 className="mt-1 font-display text-3xl font-bold">{platform?.teacherName ?? 'أحمد يحيى الأسطل'}</h2>
              </div>
              <div className="absolute left-7 top-7 h-3 w-3 rounded-full bg-accent shadow-[0_0_0_6px_hsl(var(--accent)/.18)]" />
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-accent-foreground">تعلم إنساني</p>
            <h2 className="mt-3 max-w-xl font-display text-4xl font-bold leading-tight text-primary">منهج يعرف أن لكل طالب إيقاعه.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              {platform?.description ?? 'بيئة تعليمية تفاعلية شاملة تجمع بين المنهاج الفلسطيني المعتمد، الشروحات النحوية والأدبية المعمقة، التكليفات التطبيقية، والاختبارات التفاعلية المباشرة.'}
            </p>
            <div className="mt-8 flex items-center gap-5">
              <div className="h-px w-16 bg-accent" />
              <span className="font-display text-xl text-primary">{platform?.teacherName ?? 'أحمد يحيى الأسطل'}</span>
            </div>
          </div>
        </section>

        {/* Live */}
        <section id="live" className="bg-secondary/25 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold text-accent-foreground">لا تتعلم وحدك</p>
                <h2 className="mt-3 font-display text-3xl font-bold text-primary sm:text-4xl">مواعيد واجباتك القادمة.</h2>
                <p className="mt-4 max-w-2xl leading-8 text-muted-foreground">واجبات حقيقية على المنصة بتواريخ استحقاق واضحة، لتبقى متابعة لصفّيك التاسع والعاشر بلا أوراق ضائعة.</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/40 bg-card px-4 py-2 text-xs font-bold text-primary"><ClipboardCheck size={15} className="text-accent-foreground" /> جدول حي من المنصة</span>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {liveCards.map((session) => (
                <div key={session.key} className="rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-center text-primary-foreground">
                      <span className="text-[10px] text-primary-foreground/65">{session.day}</span>
                      <span className="font-bold">{session.dayNum}</span>
                    </div>
                    <span className="rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold text-primary">{session.status}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-bold text-primary">{session.title}</h3>
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 size={16} className="text-accent-foreground" /> {session.meta} · {session.month}</p>
                  <Link href="/register" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary" data-testid={`link-live-${session.key}`}>سجّل وتابع واجبك <ArrowLeft size={16} /></Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Blog */}
        <section id="blog" className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-accent-foreground">المسارات التعليمية</p>
              <h2 className="mt-3 font-display text-3xl font-bold text-primary sm:text-4xl">وحدات متسلسلة لبناء لغتك خطوة بخطوة.</h2>
            </div>
            <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Lightbulb size={17} className="text-accent-foreground" /> وحدات المنهاج بترتيبها الرسمي</span>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {blogCards.map((post, index) => (
              <article key={post.key} className={`rounded-3xl border p-6 transition-all ${activeBlog === index ? 'border-primary/20 bg-primary text-primary-foreground shadow-md' : 'border-border bg-card'}`}>
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${activeBlog === index ? 'bg-primary-foreground/15 text-accent' : 'bg-secondary text-primary'}`}>{post.category}</span>
                  <span className={`text-xs ${activeBlog === index ? 'text-primary-foreground/55' : 'text-muted-foreground'}`}>الوحدة ٠{index + 1}</span>
                </div>
                <h3 className="mt-7 text-xl font-bold">{post.title}</h3>
                {activeBlog === index && <p className="mt-4 text-sm leading-7 text-primary-foreground/75">{post.body}</p>}
                <button type="button" onClick={() => setActiveBlog(activeBlog === index ? -1 : index)} className={`mt-6 inline-flex items-center gap-2 text-sm font-bold ${activeBlog === index ? 'text-accent' : 'text-primary'}`} data-testid={`button-blog-${index}`}>
                  {activeBlog === index ? 'إخفاء الوحدة' : 'افتح الوحدة'} <ArrowLeft size={15} />
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* Numbers */}
        <section id="numbers" className="bg-primary py-14 text-primary-foreground">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-8 px-5 lg:grid-cols-5 lg:px-8">
            {[
              ['students', 'طالباً'],
              ['units', 'وحدة تعليمية'],
              ['assessments', 'تقييماً'],
              ['assignments', 'واجباً'],
              ['certificates', 'شهادة'],
            ].map(([key, label]) => (
              <div key={key} className="text-center lg:border-l lg:border-primary-foreground/15 last:lg:border-0">
                <p className="font-display text-4xl font-bold text-accent">{stats?.[key as keyof typeof stats] ?? '—'}</p>
                <p className="mt-2 text-sm text-primary-foreground/65">{label}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <Logo />
        <p>لغة تنمو بك، وبك تنمو.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ number, icon: Icon, title, body }: { number: string; icon: typeof BookOpen; title: string; body: string }) {
  return (
    <div className="group rounded-3xl border border-border bg-background p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold text-muted-foreground">{number}</span>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
          <Icon size={22} />
        </span>
      </div>
      <h3 className="mt-7 text-xl font-bold text-primary">{title}</h3>
      <p className="mt-3 leading-7 text-muted-foreground text-sm">{body}</p>
    </div>
  );
}

function BookCover({ image, grade, title, subtitle, tone }: { image: string; grade: string; title: string; subtitle: string; tone: 'purple' | 'rose' | 'gold' }) {
  const tones = {
    purple: 'from-[#2d2040]/80 via-transparent',
    rose: 'from-[#3d263f]/80 via-transparent',
    gold: 'from-[#382b13]/85 via-transparent',
  };
  return (
    <Link href="/register" className="group relative overflow-hidden rounded-[1.8rem] border border-primary/15 bg-primary p-3 shadow-md transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl" data-testid={`card-book-${grade}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-[1.3rem] bg-muted">
        <img src={image} alt={`${title} ${grade}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className={`absolute inset-0 bg-gradient-to-t ${tones[tone]} to-transparent`} />
        <div className="absolute right-4 top-4 rounded-full border border-white/30 bg-black/30 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
          {grade}
        </div>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <p className="text-lg font-bold leading-tight">{title}</p>
          <p className="mt-1 text-xs text-white/80">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-1 pt-4 text-primary-foreground">
        <span className="text-sm font-bold">تصفح المحتوى والدروس</span>
        <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-1" />
      </div>
    </Link>
  );
}

function HomeBookCard({ book, tone }: { book: any; tone: 'purple' | 'rose' }) {
  const tones = {
    purple: 'from-[#2d2040]/80 via-transparent',
    rose: 'from-[#3d263f]/80 via-transparent',
  };
  return (
    <div className="group relative overflow-hidden rounded-[1.8rem] border border-primary/15 bg-primary p-3 shadow-md transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl" data-testid={`card-book-${book.grade}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-[1.3rem] bg-muted">
        <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className={`absolute inset-0 bg-gradient-to-t ${tones[tone]} to-transparent`} />
        <div className="absolute right-4 top-4 rounded-full border border-white/30 bg-black/30 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
          {book.grade} · {book.term}
        </div>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <p className="text-lg font-bold leading-tight">{book.title}</p>
          <p className="mt-1 text-xs text-white/80">المقرر الرسمي المعتمد · مفتوح للقراءة والتحميل</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-4">
        <a href={book.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow-sm transition-all hover:brightness-105" data-testid={`link-open-book-${book.grade}`}>
          <BookOpen size={16} /> اقرأ الكتاب
        </a>
        <a href={book.pdfUrl} download={book.title.endsWith('.pdf') ? book.title : `${book.title}.pdf`} title="تحميل نسخة PDF" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/80 transition-colors hover:text-accent-foreground">
          <Download size={15} /> PDF
        </a>
      </div>
    </div>
  );
}

function AuthLayout({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow: string }) {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <Logo />
        <div>
          <p className="mb-4 text-sm font-semibold text-primary-foreground/70">{eyebrow}</p>
          <h1 className="max-w-md font-display text-6xl font-bold leading-tight">
            العربية
            <br />
            تسكنك فصاحةً وبياناً.
          </h1>
          <p className="mt-6 max-w-sm leading-8 text-primary-foreground/70 text-base">
            مساحتك المعتمدة لدراسة المنهاج الفلسطيني للغة العربية والقرآن الكريم مع الأستاذ أحمد يحيى الأسطل.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/50">أرض اللغة · التعليم الرقمي الرصين من فلسطين</p>
      </div>
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-20 lg:py-12">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <Link href="/" className="mr-auto inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-auth-home">
            <ArrowLeft size={16} /> العودة للرئيسية
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <p className="text-sm font-semibold text-accent-foreground">{eyebrow}</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-primary">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

function Login() {
  const [, setLocation] = useLocation();
  const login = useLoginAccount();
  const reset = useRequestPasswordReset();
  const google = useGetGoogleAuthUrl({ query: { enabled: false, queryKey: getGetGoogleAuthUrlQueryKey() } });
  const [message, setMessage] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setMessage('');
    login.mutate(
      { data: { email: String(data.get('email') ?? ''), password: String(data.get('password') ?? '') } },
      {
        onSuccess: () => redirectAfterAuth(setLocation),
        onError: (error) => setMessage(error?.message || 'تعذر تسجيل الدخول. راجع البيانات وحاول مرة أخرى.'),
      }
    );
  };

  const requestReset = () => {
    if (!showForgot) {
      setShowForgot(true);
      return;
    }
    const email = document.querySelector<HTMLInputElement>('[data-testid="input-email"]')?.value;
    if (!email) {
      setMessage('اكتب بريدك الإلكتروني أولاً.');
      return;
    }
    reset.mutate(
      { data: { email } },
      {
        onSuccess: (result) => setMessage(result.message),
        onError: () => setMessage('تعذر إرسال رسالة الاستعادة الآن.'),
      }
    );
  };

  const continueWithGoogle = async () => {
    const result = await google.refetch();
    if (result.data?.url) window.location.assign(result.data.url);
    else setMessage('تسجيل الدخول باستخدام Google غير مفعّل حالياً.');
  };

  return (
    <AuthLayout title="مرحباً بعودتك" eyebrow="تسجيل الدخول">
      <form onSubmit={submit} className="mt-8 space-y-5">
        <Field name="email" label="البريد الإلكتروني" type="email" placeholder="name@example.com" testId="input-email" />
        <Field name="password" label="كلمة المرور" type="password" placeholder="••••••••" testId="input-password" />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" className="accent-primary" /> تذكرني
          </label>
          <button type="button" onClick={requestReset} className="font-semibold text-primary hover:underline" data-testid="button-forgot">
            نسيت كلمة المرور؟
          </button>
        </div>
        {showForgot && <p className="rounded-xl bg-secondary px-4 py-3 text-xs leading-6 text-muted-foreground">سيتم إرسال رابط الاستعادة إلى بريدك الإلكتروني المسجل.</p>}
        {message && <p className="rounded-xl bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground font-semibold">{message}</p>}
        <Button type="submit" disabled={login.isPending} className="mt-2 w-full py-3.5" data-testid="button-login">
          {login.isPending ? 'جارٍ الدخول...' : 'دخول إلى مساحتي'} <ArrowLeft size={17} />
        </Button>
      </form>
      <button
        type="button"
        onClick={continueWithGoogle}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary"
        data-testid="button-google-login"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">G</span> المتابعة باستخدام Google
      </button>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{' '}
        <Link href="/register" className="font-bold text-primary hover:underline" data-testid="link-register-auth">
          أنشئ حساباً جديداً
        </Link>
      </p>
    </AuthLayout>
  );
}

function Register() {
  const [, setLocation] = useLocation();
  const register = useRegisterAccount();
  const google = useGetGoogleAuthUrl({ query: { enabled: false, queryKey: getGetGoogleAuthUrlQueryKey() } });
  const [message, setMessage] = useState('');

  const continueWithGoogle = async () => {
    const result = await google.refetch();
    if (result.data?.url) window.location.assign(result.data.url);
    else setMessage('تسجيل الدخول باستخدام Google غير مفعّل حالياً.');
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fullName = String(data.get('fullName') ?? '').trim();
    setMessage('');
    if (fullName.length < 3) {
      setMessage('اسم المستخدم إلزامي — اكتب اسمك الثلاثي أو الرباعي (3 أحرف على الأقل).');
      return;
    }
    register.mutate(
      {
        data: {
          fullName,
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
          studentNumber: '',
          school: String(data.get('school') ?? 'مدرسة وايلد'),
          branch: 'المسار الأكاديمي',
          grade: String(data.get('grade') ?? 'الصف العاشر'),
          section: 'أ',
          gender: String(data.get('gender') ?? 'طالب'),
          phone: String(data.get('phone') ?? ''),
        },
      },
      {
        onSuccess: () => redirectAfterAuth(setLocation),
        onError: (error) => setMessage(error?.message || 'تعذر إنشاء الحساب. تحقق من صحة البريد وكلمة المرور وحاول ثانية.'),
      }
    );
  };

  return (
    <AuthLayout title="انضم لأرض اللغة" eyebrow="حساب طالب جديد">
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field name="fullName" label="الاسم الكامل (اسم المستخدم)" placeholder="اكتب الاسم الثلاثي أو الرباعي — إلزامي" testId="input-name" />
        <Field name="email" label="البريد الإلكتروني" type="email" placeholder="name@example.com" testId="input-register-email" />
        <Field name="password" label="كلمة المرور (6 خانات على الأقل)" type="password" placeholder="••••••••" testId="input-register-password" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="school" label="المدرسة" options={['مدرسة وايلد', 'مبادرة أهرامات الأمل']} testId="select-school" />
          <SelectField name="grade" label="الصف الدراسي" options={['الصف الثامن', 'الصف التاسع', 'الصف العاشر']} testId="select-grade" />
          <SelectField name="gender" label="الجنس" options={['طالب', 'طالبة']} testId="select-gender" />
          <Field name="phone" label="رقم الهاتف (اختياري)" placeholder="059xxxxxxx" testId="input-phone" />
        </div>
        <label className="flex items-start gap-2 pt-1 text-xs leading-5 text-muted-foreground">
          <input type="checkbox" required className="mt-1 accent-primary" /> أوافق على الالتزام بمتابعة الدروس والتكليفات وفق توجيهات الأستاذ أحمد الأسطل.
        </label>
        {message && <p className="rounded-xl bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground font-semibold">{message}</p>}
        <Button type="submit" disabled={register.isPending} className="mt-2 w-full py-3.5" data-testid="button-register">
          {register.isPending ? 'جارٍ إنشاء الحساب...' : 'إنشاء حسابي والبدء فوراً'} <ArrowLeft size={17} />
        </Button>
      </form>
      <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        أو
        <span className="h-px flex-1 bg-border" />
      </div>
      <button
        type="button"
        onClick={continueWithGoogle}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary"
        data-testid="button-google-register"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">G</span> إنشاء حساب عبر Google
      </button>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{' '}
        <Link href="/login" className="font-bold text-primary hover:underline" data-testid="link-login-auth">
          سجل دخولك
        </Link>
      </p>
    </AuthLayout>
  );
}

function Field({ name, label, type = 'text', placeholder, testId }: { name?: string; label: string; type?: string; placeholder: string; testId: string }) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      <span className="mb-2 block">{label}</span>
      <input
        name={name}
        required={type !== 'tel' && !label.includes('اختياري')}
        type={type}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-accent/20"
      />
    </label>
  );
}

function SelectField({ name, label, options, testId, optional = false }: { name: string; label: string; options: string[]; testId: string; optional?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      <span className="mb-2 block">{label}</span>
      <select name={name} required={!optional} data-testid={testId} className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20">
        <option value="">اختر</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function AuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState('جارٍ تأكيد حسابك عبر Google...');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');
      if (!code || error) {
        if (!cancelled) {
          setFailed(true);
          setStatus(error === 'access_denied' ? 'ألغيت تسجيل الدخول عبر Google. يمكنك المتابعة بالبريد وكلمة المرور.' : 'تعذر إتمام تسجيل الدخول عبر Google.');
        }
        window.setTimeout(() => { if (!cancelled) setLocation('/login'); }, 2500);
        return;
      }
      try {
        const result = await jsonFetch('/api/auth/exchange', { method: 'POST', body: { code } });
        if (cancelled) return;
        setStatus(result.needsSetup ? 'تم التحقق من حسابك بنجاح. أكمل بياناتك لتندفع إلى مساحة التعلم!' : 'تم التحقق من حسابك بنجاح.');
        window.setTimeout(() => {
          if (!cancelled) setLocation(result.needsSetup ? '/auth/complete' : '/student');
        }, 800);
      } catch (err: any) {
        if (!cancelled) {
          setFailed(true);
          setStatus(err?.message || 'تعذر تأكيد الجلسة عبر Google. أعد المحاولة.');
          window.setTimeout(() => { if (!cancelled) setLocation('/login'); }, 2500);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setLocation]);
  return (
    <AuthLayout title="نجهّز مساحتك" eyebrow="تسجيل الدخول">
      <div className="mt-8 flex items-center gap-3 rounded-2xl bg-secondary p-5 text-sm leading-7 text-muted-foreground">
        {!failed && <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-primary" />}
        <span>{status}</span>
      </div>
    </AuthLayout>
  );
}

function CompleteProfilePage() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initial, setInitial] = useState({ fullName: '', email: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchAuthMe();
        if (cancelled) return;
        if (!me.authenticated) { setLocation('/login'); return; }
        if (!me.needsSetup) { setLocation('/student'); return; }
        setInitial({ fullName: me.user?.fullName || '', email: me.user?.email || '' });
        setLoading(false);
      } catch {
        if (!cancelled) { setMessage('تعذر التحقق من حسابك. حاول مرة أخرى.'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [setLocation]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setMessage('');
    setSaving(true);
    jsonFetch('/api/auth/complete-profile', {
      method: 'POST',
      body: {
        fullName: String(data.get('fullName') || initial.fullName),
        gender: String(data.get('gender') ?? ''),
        grade: String(data.get('grade') ?? ''),
        school: String(data.get('school') ?? ''),
        section: String(data.get('section') ?? 'أ'),
        branch: 'المسار الأكاديمي',
        phone: String(data.get('phone') ?? ''),
      },
    })
      .then(() => setLocation('/student'))
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <AuthLayout title="فقط خطوة أخيرة" eyebrow="إكمال الحساب">
        <div className="mt-8 flex items-center gap-3 rounded-2xl bg-secondary p-5 text-sm leading-7 text-muted-foreground">
          <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-primary" /> نتحقق من بيانات حسابك...
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="أكمل بيانات حسابك" eyebrow="خطوة أخيرة">
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        مرحباً بك في <span className="font-bold text-primary">أرض اللغة</span>! أكمل بياناتك التالية لندخل بك إلى مساحتك التعليمية.
        {initial.email && <span> الوارد منها تسجيلك: <strong className="text-accent-foreground" dir="ltr">{initial.email}</strong></span>}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field name="fullName" label="الاسم الكامل (اسم المستخدم)" placeholder="اكتب الاسم الثلاثي أو الرباعي — إلزامي" testId="input-complete-name" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="gender" label="طالب أم طالبة؟" options={['طالب', 'طالبة']} testId="select-complete-gender" />
          <SelectField name="grade" label="الصف الدراسي" options={['الصف الثامن', 'الصف التاسع', 'الصف العاشر']} testId="select-complete-grade" />
          <SelectField name="school" label="المدرسة" options={['مدرسة وايلد', 'مبادرة أهرامات الأمل']} testId="select-complete-school" />
          <Field name="phone" label="رقم الهاتف (اختياري)" placeholder="059xxxxxxx" testId="input-complete-phone" />
        </div>
        {message && <p className="rounded-xl bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground font-semibold">{message}</p>}
        <Button type="submit" disabled={saving} className="mt-2 w-full py-3.5" data-testid="button-complete-profile">
          {saving ? 'جارٍ حفظ بياناتك...' : 'دخول إلى مساحتي'} <ArrowLeft size={17} />
        </Button>
      </form>
    </AuthLayout>
  );
}

function Shell({ mode, children }: { mode: 'student' | 'teacher'; children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  // إغلاق قائمة الجوال تلقائياً عند التنقل — حتى لا تغطي المحتوى والنوافذ
  useEffect(() => { setMobileMenu(false); setProfileMenu(false); }, [location]);
  const logout = useLogoutAccount();
  const studentDash = useGetStudentDashboard();
  // صورة الحساب (صورة Google إن سجل بها) — للطالب والمعلم
  const [meAvatar, setMeAvatar] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchAuthMe()
      .then((me) => { if (!cancelled && me?.user?.avatarUrl) setMeAvatar(me.user.avatarUrl); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const dashAvatar = studentDash.data?.student?.avatarUrl || '';
  const avatarSrc = mode === 'teacher' ? teacherImageUrl : dashAvatar || meAvatar || undefined;

  // بوابة الدخول: لا يُعرض أي محتوى قبل التأكد من الجلسة والصلاحية
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    if (mode !== 'student') return;
    let cancelled = false;
    fetchAuthMe()
      .then((me) => {
        if (cancelled) return;
        if (!me.authenticated) { setLocation('/login'); return; }
        if (me.needsSetup) { setLocation('/auth/complete'); return; }
        if (me.role === 'admin') { setLocation('/teacher'); return; }
        setAuthReady(true);
      })
      .catch(() => {
        if (!cancelled) setLocation('/login');
      });
    return () => { cancelled = true; };
  }, [mode, setLocation]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    let cancelled = false;
    fetchAuthMe()
      .then((me) => {
        if (cancelled) return;
        if (!me.authenticated) { setLocation('/login'); return; }
        if (me.role !== 'admin') { setLocation('/student'); return; }
        setAuthReady(true);
      })
      .catch(() => {
        if (!cancelled) setLocation('/login');
      });
    return () => { cancelled = true; };
  }, [mode, setLocation]);

  const studentName = studentDash.data?.student?.name || '';
  const studentSubtitle = [studentDash.data?.student?.grade, studentDash.data?.student?.school].filter(Boolean).join(' · ');

  const links = mode === 'student' ? navStudent : navTeacher;
  const active = links.find((link) => location === link.href)?.label ?? links[0].label;

  const signOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation('/login');
      },
      onError: () => setLocation('/login'),
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[86vw] flex-col overflow-hidden overflow-y-auto bg-gradient-to-b from-[#0d2926] via-[#123936] to-[#0a201e] px-5 py-6 text-white shadow-2xl transition-transform duration-300 ${
          mobileMenu ? 'translate-x-0' : 'translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="pointer-events-none absolute -left-20 top-24 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <span className="[&_span]:!text-white">
            <Logo />
          </span>
          <button onClick={() => setMobileMenu(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden" data-testid="button-close-menu">
            <X size={19} />
          </button>
        </div>
        <div className="relative mt-8 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="ring-2 ring-accent/70 rounded-2xl">
              <Avatar name={mode === 'student' ? studentName : 'أ'} src={avatarSrc} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{mode === 'student' ? studentName : 'المعلم أحمد يحيى الأسطل'}</p>
              <p className="mt-0.5 truncate text-xs text-accent/90">{mode === 'student' ? studentSubtitle : 'إدارة ومتابعة المنصة'}</p>
            </div>
          </div>
        </div>
        <nav className="relative mt-8 space-y-1.5">
          {links.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenu(false)}
                className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-sm font-bold transition-all duration-200 ${
                  isActive ? 'bg-gradient-to-l from-accent to-[#e8c876] text-[#3a2c07] shadow-lg shadow-accent/25' : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
                data-testid={`link-nav-${item.href.replaceAll('/', '-').replace(/^-/, '')}`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-xl transition-colors ${isActive ? 'bg-black/15' : 'bg-white/10 group-hover:bg-white/15'}`}>
                  <Icon size={18} />
                </span>
                <span>{item.label}</span>
                {isActive && <ChevronLeft size={16} className="mr-auto" />}
              </Link>
            );
          })}
        </nav>
        <div className="relative mt-auto overflow-hidden rounded-2xl bg-white/[0.07] p-4 ring-1 ring-accent/25 backdrop-blur-md">
          <div className="pointer-events-none absolute -left-6 -top-6 h-20 w-20 rounded-full bg-accent/25 blur-2xl" />
          <p className="relative text-xs leading-6 text-white/70">
            تقدمك اليوم يصنع
            <br />
            <strong className="font-bold text-accent">فصاحتك وعلو شأنك في لغة القرآن.</strong>
          </p>
          <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full w-[70%] rounded-full bg-gradient-to-l from-accent to-[#f3d68a]" />
          </div>
          <p className="relative mt-2 text-center text-[10px] font-mono text-white/30" dir="ltr">{APP_VERSION}</p>
        </div>
      </aside>

      {mobileMenu && <button aria-label="إغلاق القائمة الجانبية" onClick={() => setMobileMenu(false)} className="fixed inset-0 z-40 bg-primary/45 backdrop-blur-[2px] lg:hidden" data-testid="button-close-menu-backdrop" />}

      <div className="lg:mr-72">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-border bg-background px-5 shadow-[0_2px_16px_-6px_rgba(0,0,0,0.15)] sm:px-8">
          <div className="flex items-center gap-3">
            <div>
              <p className="hidden items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> أرض اللغة / {mode === 'student' ? 'بوابة الطالب' : 'بوابة المعلم'}</p>
              <h1 className="bg-gradient-to-l from-primary to-[#3f7d78] bg-clip-text text-lg font-extrabold text-transparent">{active}</h1>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <button className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" data-testid="button-notifications">
              <Bell size={19} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
            </button>
            <button onClick={() => setProfileMenu((open) => !open)} className="flex items-center gap-2 rounded-xl p-1.5 pl-2.5 ring-2 ring-accent/50 transition-all hover:bg-muted hover:ring-accent sm:pl-3" data-testid="button-profile-menu" aria-label="القائمة الشخصية">
              <Avatar name={mode === 'student' ? studentName : 'أ'} src={avatarSrc} size="sm" />
              <span className="hidden text-sm font-semibold sm:block">{mode === 'student' ? studentName.split(' ')[0] : 'الأستاذ أحمد'}</span>
              <ChevronLeft size={15} className={`hidden transition-transform sm:block ${profileMenu ? 'rotate-90' : '-rotate-90'}`} />
            </button>
            {profileMenu && (
              <div className="absolute left-0 top-14 z-50 w-56 rounded-2xl border border-border bg-card p-2 shadow-xl animate-rise">
                <Link href={mode === 'student' ? '/student/profile' : '/teacher/settings'} onClick={() => setProfileMenu(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-primary hover:bg-secondary" data-testid="link-profile-dropdown">
                  <UserRound size={16} /> {mode === 'student' ? 'ملفي الشخصي' : 'إعدادات المنصة'}
                </Link>
                <button onClick={signOut} disabled={logout.isPending} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10" data-testid="button-logout">
                  <LogOut size={16} /> {logout.isPending ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="animate-fade px-5 py-7 pb-24 sm:px-8 lg:px-10">
          {authReady ? children : (
            <div className="grid min-h-[55dvh] place-items-center" data-testid="auth-gate-loading">
              <div className="flex flex-col items-center gap-4 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-3xl bg-primary text-primary-foreground shadow-lg">
                  <RefreshCw size={26} className="animate-spin" />
                </span>
                <p className="font-display text-lg font-bold text-primary">نتحقق من صلاحية الدخول...</p>
                <p className="text-xs text-muted-foreground">لحظات ويتم توجيهك لمكانك الصحيح</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-1.5 overflow-x-auto rounded-3xl border border-white/10 bg-[#0d2926] p-2 shadow-2xl no-scrollbar lg:hidden">
        {links.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={`grid min-w-[62px] shrink-0 place-items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-bold transition-all ${isActive ? 'bg-gradient-to-b from-accent to-[#ddbd6d] text-[#3a2c07] shadow-md' : 'text-white/55'}`} data-testid={`link-mobile-${item.href.replaceAll('/', '-').replace(/^-/, '')}`}>
              <Icon size={18} />
              <span className="whitespace-nowrap">{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function PageHeading({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-sm font-semibold text-accent-foreground">{eyebrow}</p>}
        <h2 className="font-display text-4xl font-bold text-primary">{title}</h2>
        {body && <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone = 'default' }: { label: string; value: string | number; icon: typeof UsersRound; tone?: 'default' | 'warm' }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone === 'warm' ? 'bg-accent/30 text-accent-foreground' : 'bg-secondary text-primary'}`}>
          <Icon size={19} />
        </span>
        <MoreHorizontal size={18} className="text-muted-foreground/60" />
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-primary">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

/* =========================================================================
   STUDENT PORTAL PAGES
========================================================================= */

function StudentDashboard() {
  const query = useGetStudentDashboard();
  const announcementsQuery = useListAnnouncements();
  const [gradeNotes, setGradeNotes] = useState<any[] | null>(null);
  const dashGrade = query.data?.student?.grade;
  useEffect(() => {
    if (!dashGrade) return;
    jsonFetch(`/api/curriculum/announcements?grade=${encodeURIComponent(dashGrade)}`)
      .then((d) => { if (Array.isArray(d) && d.length) setGradeNotes(d); })
      .catch(() => undefined);
  }, [dashGrade]);
  const data = query.data ? { ...query.data, announcements: gradeNotes || (query.data.announcements?.length ? query.data.announcements : announcementsQuery.data ?? []) } : undefined;
  const student = data?.student;

  return (
    <Shell mode="student">
      <PageHeading
        eyebrow={`مرحباً بك يا ${student?.name ? student.name.split(' ')[0] : 'محمد'}`}
        title="واصل رحلتك مع لغة الضاد"
        body="خطوة جادة اليوم، تصنع تفوقك وثقتك في منهاج اللغة العربية والقرآن الكريم."
        action={
          <Link href="/student/courses">
            <Button variant="soft" data-testid="button-learning-plan">
              <CalendarDays size={17} /> تصفح الخطة الدراسية
            </Button>
          </Link>
        }
      />
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : !data ? (
        <StateNotice type="empty" />
      ) : (
        <>
          {student?.book ? (
            <section className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-l from-primary via-primary to-[hsl(var(--primary)/0.92)] p-6 text-primary-foreground shadow-lg">
              <div className="pointer-events-none absolute -left-14 -top-14 h-52 w-52 rounded-full bg-accent/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 right-1/3 h-44 w-44 rounded-full bg-accent/10 blur-3xl" />
              <div className="relative grid items-center gap-6 sm:grid-cols-[auto_1fr]">
                <a href={student.book.pdfUrl} target="_blank" rel="noreferrer" className="relative block w-36 shrink-0 overflow-hidden rounded-2xl border-2 border-accent/60 shadow-2xl transition-transform duration-300 hover:-translate-y-1" data-testid="link-my-book-cover">
                  <img src={student.book.coverUrl} alt={student.book.title} className="w-full object-cover" />
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-accent-foreground shadow">
                    {student.book.term}
                  </span>
                </a>
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1.5 text-xs font-bold backdrop-blur-md">
                    <BookOpen size={14} className="text-accent" /> الكتاب الخاص بك وفق فصلك الدراسي
                  </div>
                  <h3 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{student.book.title}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-primary-foreground/80">
                    نسختك الرقمية من مقرر اللغة العربية لـ{student.book.grade} — {student.book.term}. افتحها في أي وقت لقراءة الدروس والمراجعة قبل الاختبارات.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <a href={student.book.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground shadow-sm transition-all hover:brightness-105" data-testid="link-read-my-book">
                      <BookOpen size={17} /> افتح واقرأ الكتاب
                    </a>
                    <a href={student.book.pdfUrl} download className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-5 py-3 text-sm font-bold text-primary-foreground backdrop-blur-md transition-colors hover:bg-primary-foreground/20" data-testid="link-download-my-book">
                      <Download size={17} /> تحميل نسخة PDF
                    </a>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
          <section className="mt-8 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
            <div className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-md sm:p-8">
              <div className="relative z-10 max-w-lg">
                <p className="text-sm text-primary-foreground/75 font-semibold">إنجازك الدراسي المستمر</p>
                <h3 className="mt-2 font-display text-3xl font-bold">تبني مستقبلك بعزة وفصاحة.</h3>
                <p className="mt-3 text-sm leading-7 text-primary-foreground/80">
                  أنجزت {data.completedLessons} دروس من المنهاج حتى الآن. يمكنك إكمال الدروس المتبقية والاختبارات لقياس مهاراتك.
                </p>
                <Link href="/student/courses" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground shadow-sm hover:brightness-105" data-testid="link-continue-learning">
                  متابعة الدروس الآن <ArrowLeft size={17} />
                </Link>
              </div>
              <div className="absolute -left-8 -top-16 font-display text-[16rem] leading-none text-primary-foreground/5 select-none">ض</div>
              <div className="absolute -bottom-12 -right-12 h-40 w-40 rounded-full border-[18px] border-accent/20" />
            </div>
            <div className="flex items-center gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
              <ProgressRing value={data.progress} size={110} />
              <div>
                <p className="text-sm font-semibold text-muted-foreground">التقدم العام بالمنهاج</p>
                <p className="mt-1 text-2xl font-bold text-primary">{data.progress >= 50 ? 'تقدم ممتاز' : 'انطلاقة موفقة'}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">أكمل الوحدات القادمة لتحصل على شهادة التميز اللغوي.</p>
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-semibold">الوحدات المقترحة</p>
                  <h3 className="mt-1 text-xl font-bold text-primary">المناهج المتاحة لك</h3>
                </div>
                <Link href="/student/courses" className="text-sm font-bold text-primary hover:underline" data-testid="link-all-courses">
                  عرض كل الوحدات
                </Link>
              </div>
              <div className="mt-5 space-y-3">{data.nextUp?.length ? data.nextUp.slice(0, 4).map((course) => <CourseRow key={course.id} course={course} />) : <StateNotice type="empty" />}</div>
            </div>
            <AnnouncementPanel announcements={data.announcements} />
          </section>
        </>
      )}
    </Shell>
  );
}

function CourseRow({ course }: { course: any }) {
  return (
    <Link href="/student/courses" className="group flex items-center gap-4 rounded-2xl border border-border p-3.5 transition-colors hover:bg-secondary/40" data-testid={`card-course-${course.id}`}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-primary-foreground shadow-sm" style={{ backgroundColor: course.color || 'hsl(var(--primary))' }}>
        <BookOpen size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-bold text-primary">{course.title}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">
          {course.lessons} دروس تفاعلية · {course.duration}
        </span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${course.progress}%` }} />
        </span>
      </span>
      <span className="text-xs font-bold text-muted-foreground">{course.progress}%</span>
      <ChevronLeft size={16} className="text-muted-foreground transition-transform group-hover:-translate-x-1" />
    </Link>
  );
}

function AnnouncementPanel({ announcements }: { announcements?: any[] }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-semibold">توجيهات وإعلانات</p>
          <h3 className="mt-1 text-xl font-bold text-primary">رسائل المعلم أحمد</h3>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">
          <Bell size={18} />
        </span>
      </div>
      <div className="mt-5 space-y-4">
        {announcements?.length ? (
          announcements.slice(0, 3).map((a) => (
            <div key={a.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-primary text-sm">{a.title}</p>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-primary">{a.type}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs leading-6 text-muted-foreground">{a.body}</p>
              <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{a.date}</p>
            </div>
          ))
        ) : (
          <StateNotice type="empty" />
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   COURSES & DETAILED LESSONS VIEWER
========================================================================= */

function CoursesPage() {
  const query = useListCourses();
  const studentDash = useGetStudentDashboard();
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [activeLesson, setActiveLesson] = useState<any | null>(null);
  const [completedMsg, setCompletedMsg] = useState('');

  const openCourse = async (course: any) => {
    setSelectedCourse(course);
    setLoadingLessons(true);
    try {
      const res = await fetch(`/api/courses/${course.id}/lessons`);
      const data = await res.json();
      setLessons(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLessons(false);
    }
  };

  const markComplete = async (lessonId: string) => {
    try {
      await fetch(`/api/lessons/${lessonId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: studentDash.data?.student?.id }),
      });
      setCompletedMsg('تم حفظ إنجازك للدرس بنجاح!');
      query.refetch();
      setTimeout(() => setCompletedMsg(''), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Shell mode="student">
      <PageHeading eyebrow="المنهاج الفلسطيني المعتمد" title="الوحدات التعليمية" body="وحدات تعليمية متكاملة تشمل القراءة والنصوص، قواعد النحو والصرف، البلاغة، وعلوم القرآن الكريم." />
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <StateNotice type="empty" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {query.data.map((course, index) => (
            <div key={course.id} className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl" data-testid={`card-course-detail-${course.id}`}>
              <div className="relative h-36 p-5" style={{ backgroundColor: course.color || 'hsl(var(--primary))' }}>
                <div className="absolute -left-5 -top-12 font-display text-[10rem] leading-none text-white/10 select-none">ض</div>
                <div className="relative flex items-start justify-between text-primary-foreground">
                  <span className="rounded-lg bg-black/20 px-3 py-1 text-xs font-bold backdrop-blur-sm">الوحدة {String(index + 1).padStart(2, '0')}</span>
                  <BookOpen size={22} />
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-bold text-primary leading-tight">{course.title}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{course.description}</p>
                <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground font-semibold">
                  <span>{course.lessons} دروس تفاعلية</span>
                  <span>{course.duration}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${course.progress}%` }} />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs font-bold text-primary">{course.progress}% مكتمل</span>
                  <Button onClick={() => openCourse(course)} variant="soft" className="text-xs py-2 px-3.5" data-testid={`link-open-course-${course.id}`}>
                    فتح الدروس <ArrowLeft size={14} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Course Lessons Modal */}
      {selectedCourse && (
        <Modal title={selectedCourse.title} eyebrow="دروس الوحدة التعليمية" onClose={() => { setSelectedCourse(null); setActiveLesson(null); }} maxWidth="max-w-2xl">
          {loadingLessons ? (
            <StateNotice type="loading" />
          ) : !lessons.length ? (
            <StateNotice type="empty" />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-6 mb-4">{selectedCourse.description}</p>
              {lessons.map((lesson) => (
                <div key={lesson.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary font-bold text-sm">
                      {lesson.position}
                    </span>
                    <div>
                      <p className="font-bold text-primary text-sm">{lesson.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{lesson.description || 'شرح الدرس والتدريبات المرافقة'}</p>
                    </div>
                  </div>
                  <Button onClick={() => setActiveLesson(lesson)} variant="outline" className="text-xs py-2 px-3">
                    عرض المحتوى <BookOpen size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Lesson Content Viewer Modal */}
      {activeLesson && (
        <Modal title={activeLesson.title} eyebrow="المحتوى التعليمي الكامل" onClose={() => setActiveLesson(null)} maxWidth="max-w-3xl">
          <div className="space-y-6 text-right">
            {completedMsg && (
              <div className="rounded-2xl bg-green-500/15 border border-green-500/30 p-4 text-green-800 text-sm font-bold flex items-center gap-2">
                <CheckCircle2 size={18} /> {completedMsg}
              </div>
            )}

            {/* Introduction */}
            {activeLesson.content?.introduction && (
              <div className="rounded-2xl bg-secondary/50 p-5 border border-border">
                <h4 className="font-bold text-primary text-sm flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-accent-foreground" /> مقدمة الدرس
                </h4>
                <p className="text-sm leading-7 text-muted-foreground">{activeLesson.content.introduction}</p>
              </div>
            )}

            {/* Main Text / Poem / Rule */}
            {activeLesson.content?.mainText && (
              <div className="rounded-2xl bg-card p-6 border border-primary/20 shadow-sm">
                <h4 className="font-bold text-primary text-sm mb-3">النص المعتمد / الشاهد التعليمي:</h4>
                <div className="rounded-xl bg-muted/40 p-4 font-serif text-base leading-8 text-primary font-medium whitespace-pre-line border-r-4 border-accent">
                  {activeLesson.content.mainText}
                </div>
              </div>
            )}

            {/* Vocabulary */}
            {activeLesson.content?.vocabulary?.length > 0 && (
              <div className="rounded-2xl border border-border p-5">
                <h4 className="font-bold text-primary text-sm mb-3 flex items-center gap-2">
                  <BookOpen size={16} /> المفردات والدلالات اللغوية:
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeLesson.content.vocabulary.map((v: any, idx: number) => (
                    <div key={idx} className="rounded-xl bg-secondary/40 p-2.5 text-xs">
                      <span className="font-bold text-primary ml-2">«{v.word}»:</span>
                      <span className="text-muted-foreground">{v.meaning}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grammar / Literary Rule */}
            {activeLesson.content?.grammarRule && (
              <div className="rounded-2xl bg-accent/15 border border-accent/30 p-5">
                <h4 className="font-bold text-primary text-sm mb-2">القاعدة اللغوية والإعرابية:</h4>
                <p className="text-sm leading-7 text-primary/90">{activeLesson.content.grammarRule}</p>
              </div>
            )}

            {/* Summary */}
            {activeLesson.content?.summary && (
              <div className="rounded-2xl border border-border p-4 bg-background">
                <h4 className="font-bold text-primary text-xs mb-1 text-muted-foreground">خلاصة الدرس:</h4>
                <p className="text-sm leading-6 font-semibold text-primary">{activeLesson.content.summary}</p>
              </div>
            )}

            {/* Practice Questions */}
            {activeLesson.content?.practiceQuestions?.length > 0 && (
              <div className="rounded-2xl border border-border p-5 bg-card">
                <h4 className="font-bold text-primary text-sm mb-3 flex items-center gap-2">
                  <HelpCircle size={16} /> تطبيقات وأسئلة تدريبية:
                </h4>
                <div className="space-y-3">
                  {activeLesson.content.practiceQuestions.map((pq: any, i: number) => (
                    <div key={i} className="rounded-xl bg-secondary/30 p-3 text-xs leading-6">
                      <p className="font-bold text-primary mb-1">س: {pq.q}</p>
                      <p className="text-muted-foreground">الإجابة: {pq.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button onClick={() => markComplete(activeLesson.id)} variant="primary" className="py-3 px-6" data-testid="button-complete-lesson">
                <Check size={17} /> إكمال الدرس وتسجيل التقدم
              </Button>
              <Button onClick={() => setActiveLesson(null)} variant="ghost">
                إغلاق
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

/* =========================================================================
   ASSIGNMENTS & SUBMISSIONS
========================================================================= */

function AssignmentsPage() {
  const query = useListAssignments();
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted'>('all');
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState('');

  const assignments = useMemo(() => {
    const list = query.data ?? [];
    if (filter === 'all') return list;
    if (filter === 'submitted') return list.filter((a) => a.status.includes('تم'));
    return list.filter((a) => !a.status.includes('تم'));
  }, [query.data, filter]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || !studentAnswer.trim()) return;
    setSubmitting(true);
    setSubmitFeedback('');
    try {
      const res = await fetch(`/api/assignments/${selectedAssignment.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: studentAnswer }),
      });
      const resData = await res.json();
      setSubmitFeedback(resData.message || 'تم إرسال الحل بنجاح!');
      query.refetch();
      setTimeout(() => {
        setSelectedAssignment(null);
        setStudentAnswer('');
        setSubmitFeedback('');
      }, 2500);
    } catch (e) {
      setSubmitFeedback('تعذر إرسال الواجب حالياً.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell mode="student">
      <PageHeading eyebrow="تطبيق وإتقان" title="الواجبات والتكليفات" body="الممارسة الدائمة ترسخ القواعد النحوية والبلاغية. راجع واجباتك المحددة وقم بتسليمها." />
      <div className="mb-6 flex gap-2">
        <Button onClick={() => setFilter('all')} variant={filter === 'all' ? 'primary' : 'outline'} className="text-xs py-2 px-4" data-testid="button-filter-all">
          الكل ({query.data?.length ?? 0})
        </Button>
        <Button onClick={() => setFilter('pending')} variant={filter === 'pending' ? 'primary' : 'outline'} className="text-xs py-2 px-4" data-testid="button-filter-pending">
          قيد الإنجاز
        </Button>
        <Button onClick={() => setFilter('submitted')} variant={filter === 'submitted' ? 'primary' : 'outline'} className="text-xs py-2 px-4" data-testid="button-filter-done">
          تم التسليم
        </Button>
      </div>
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : !assignments.length ? (
        <StateNotice type="empty" />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="hidden grid-cols-[1.5fr_1.1fr_.7fr_.6fr_.6fr] gap-4 border-b border-border bg-secondary/40 px-6 py-4 text-xs font-bold text-muted-foreground sm:grid">
            <span>عنوان الواجب</span>
            <span>الوحدة التعليمية</span>
            <span>آخر موعد</span>
            <span>الحالة</span>
            <span>إجراء</span>
          </div>
          {assignments.map((a) => (
            <div key={a.id} className="grid gap-3 border-b border-border px-5 py-5 last:border-0 sm:grid-cols-[1.5fr_1.1fr_.7fr_.6fr_.6fr] sm:items-center sm:gap-4 sm:px-6" data-testid={`row-assignment-${a.id}`}>
              <div>
                <p className="font-bold text-primary text-base">{a.title}</p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{a.description}</p>
              </div>
              <p className="text-sm font-medium text-muted-foreground">{a.unit}{a.section && a.section !== 'الجميع' ? <span className="mr-2 rounded-full bg-[#6a1b9a]/15 px-2 py-0.5 text-[10px] font-bold text-[#6a1b9a]">{a.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <Clock3 size={15} /> {a.dueDate}
              </p>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${a.status.includes('تم') ? 'bg-green-100 text-green-800' : 'bg-accent/30 text-accent-foreground'}`}>
                {a.status}
              </span>
              <Button onClick={() => setSelectedAssignment(a)} variant="soft" className="text-xs py-2">
                {a.status.includes('تم') ? 'عرض التسليم' : 'تقديم الحل'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Submit Assignment Modal */}
      {selectedAssignment && (
        <Modal title={selectedAssignment.title} eyebrow={selectedAssignment.unit} onClose={() => setSelectedAssignment(null)} maxWidth="max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-2xl bg-secondary/40 p-4 text-xs leading-6 text-muted-foreground">
              <p className="font-bold text-primary mb-1">تعليمات الواجب:</p>
              <p>{selectedAssignment.description}</p>
              <p className="mt-2 font-semibold text-primary">الدرجة المخصصة: {selectedAssignment.points} نقطة · تاريخ التسليم: {selectedAssignment.dueDate}</p>
            </div>

            <label className="block text-sm font-semibold">
              <span className="mb-2 block">إجابتك / حل الواجب:</span>
              <textarea
                value={studentAnswer}
                onChange={(e) => setStudentAnswer(e.target.value)}
                required
                rows={6}
                placeholder="اكتب هنا إجابتك النموذجية، الإعراب، أو الفقرة التعبيرية المطلوبة بالتفصيل..."
                className="w-full resize-none rounded-2xl border border-input bg-background p-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20"
              />
            </label>

            {submitFeedback && (
              <div className="rounded-2xl bg-accent/20 p-3 text-sm font-bold text-accent-foreground text-center">
                {submitFeedback}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button onClick={() => setSelectedAssignment(null)} variant="ghost">
                إلغاء
              </Button>
              <Button type="submit" disabled={submitting} variant="primary" className="py-2.5 px-6">
                {submitting ? 'جارٍ الإرسال...' : 'إرسال للأستاذ أحمد الأسطل'} <ArrowLeft size={16} />
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

/* =========================================================================
   ASSESSMENTS & INTERACTIVE QUIZ RUNNER
========================================================================= */

const ARABIC_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

function QuizRunner({ assessment, onClose, onFinished }: { assessment: any; onClose: () => void; onFinished: () => void }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(answersKey) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  });
  const answersRef = useRef<Record<string, number>>(answers);
  const [result, setResult] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ringOn, setRingOn] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(deadlineKey)) {
        localStorage.setItem(deadlineKey, String(Date.now() + totalSecs * 1000));
      }
    } catch { /* تجاهل */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment]);

  const totalSecs = useMemo(() => {
    const m = parseInt(String(assessment?.duration || '').match(/(\d+)/)?.[1] || '20', 10);
    return Math.max((isNaN(m) ? 20 : m) * 60, 60);
  }, [assessment]);
  const deadlineKey = `aq_deadline_${assessment.id}`;
  const answersKey = `aq_answers_${assessment.id}`;
  // المؤقت محفوظ في المتصفح: التحديث لا يصفّره ولا يسمح بإعادة البدء
  const [secondsLeft, setSecondsLeft] = useState(() => {
    try {
      const raw = localStorage.getItem(deadlineKey);
      if (raw) {
        const left = Math.round((Number(raw) - Date.now()) / 1000);
        return left > 0 ? left : 0;
      }
    } catch { /* تجاهل */ }
    return totalSecs;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/assessments/${assessment.id}/questions`)
      .then((r) => r.json())
      .then((qs) => {
        if (cancelled) return;
        setQuestions(Array.isArray(qs) ? qs : []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assessment]);

  const doSubmit = async (finalAnswers: Record<string, number>) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/assessments/${assessment.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: finalAnswers }),
      });
      const data = await res.json();
      try {
        localStorage.removeItem(deadlineKey);
        localStorage.removeItem(answersKey);
      } catch { /* تجاهل */ }
      setResult(data);
      onFinished();
    } catch {
      setResult({ error: true });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (loading || result || !questions.length) return;
    if (secondsLeft <= 0) {
      doSubmit(answersRef.current);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, loading, result, questions.length]);

  useEffect(() => {
    if (result) {
      const t = setTimeout(() => setRingOn(true), 150);
      return () => clearTimeout(t);
    }
  }, [result]);

  const go = (i: number) => {
    if (i < 0 || i >= questions.length) return;
    setDir(i > idx ? 1 : -1);
    setIdx(i);
  };

  const choose = (optIdx: number) => {
    const q = questions[idx];
    if (!q || result) return;
    const next = { ...answersRef.current, [q.id]: optIdx };
    answersRef.current = next;
    setAnswers(next);
    try {
      localStorage.setItem(answersKey, JSON.stringify(next));
    } catch { /* تجاهل */ }
    if (idx < questions.length - 1) {
      window.setTimeout(() => go(idx + 1), 380);
    }
  };

  const retry = () => {
    answersRef.current = {};
    setAnswers({});
    setIdx(0);
    setDir(1);
    setResult(null);
    setRingOn(false);
    setSecondsLeft(totalSecs);
  };

  const mm = String(Math.floor(Math.max(secondsLeft, 0) / 60)).padStart(2, '0');
  const ss = String(Math.max(secondsLeft, 0) % 60).padStart(2, '0');
  const danger = secondsLeft <= 60 && !result;
  const [resumed] = useState(() => {
    try {
      return !!localStorage.getItem(deadlineKey);
    } catch {
      return false;
    }
  });
  const answered = Object.keys(answers).length;
  const qmap: Record<string, any> = Object.fromEntries(questions.map((q) => [q.id, q]));

  if (loading) return <StateNotice type="loading" />;

  /* ---------- شاشة النتيجة ---------- */
  if (result) {
    if (result.error) {
      return (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="font-bold">تعذر تصحيح الاختبار — تحقق من الاتصال وحاول مجدداً.</p>
          <Button onClick={retry} variant="soft" className="mt-4">إعادة المحاولة</Button>
        </div>
      );
    }
    const score = result.score || 0;
    const R = 52;
    const CIRC = 2 * Math.PI * R;
    return (
      <div className="space-y-6 text-center" dir="rtl">
        <div className="relative mx-auto h-44 w-44 animate-score-pop">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="11" />
            <circle
              cx="60" cy="60" r={R} fill="none"
              stroke={score >= 70 ? '#16a34a' : score >= 50 ? '#d7b65e' : '#dc2626'}
              strokeWidth="11" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={ringOn ? CIRC - (CIRC * Math.min(score, 100)) / 100 : CIRC}
              style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div>
              <p className="font-display text-4xl font-extrabold text-primary">{score}%</p>
              <p className="text-[11px] font-bold text-muted-foreground">نتيجتك</p>
            </div>
          </div>
        </div>
        <div className="animate-fade-up">
          <p className="font-display text-xl font-bold text-primary">{result.message}</p>
          <p className="mt-1.5 text-sm text-muted-foreground">أجبت صحيحاً على <strong className="text-primary">{result.correctAnswers}</strong> من أصل <strong className="text-primary">{result.totalQuestions}</strong></p>
        </div>
        <div className="space-y-3 border-t border-border pt-5 text-right">
          <h4 className="font-display text-sm font-bold text-primary">مراجعة الإجابات والشروحات:</h4>
          {result.review?.map((r: any, i: number) => {
            const q = qmap[r.questionId];
            const yourText = q?.options?.[r.selectedOption] ?? '—';
            const correctText = q?.options?.[r.correctOption] ?? '';
            return (
              <div key={i} className={`rounded-2xl border p-4 text-xs animate-fade-up ${r.isCorrect ? 'border-green-500/40 bg-green-500/[0.07]' : 'border-red-500/30 bg-red-500/[0.06]'}`} style={{ animationDelay: `${Math.min(i, 8) * 0.07}s` }}>
                <p className="mb-2 text-sm font-bold leading-6 text-primary">{i + 1}. {r.question}</p>
                <p className={`mb-1 leading-6 ${r.isCorrect ? 'text-green-800' : 'text-red-700'}`}>
                  <span className="font-extrabold">{r.isCorrect ? '✓ إجابتك صحيحة: ' : '✗ إجابتك: '}</span>{yourText}
                </p>
                {!r.isCorrect ? <p className="mb-1 font-bold leading-6 text-green-800">الإجابة الصحيحة: {correctText}</p> : null}
                {r.explanation ? <p className="leading-6 text-muted-foreground"><span className="font-bold">💡 الشرح:</span> {r.explanation}</p> : null}
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button onClick={retry} variant="soft" className="flex-1 py-3"><RefreshCw size={16} /> إعادة المحاولة</Button>
          <Button onClick={onClose} variant="primary" className="flex-1 py-3">إنهاء ومتابعة الوحدات <ArrowLeft size={16} /></Button>
        </div>
      </div>
    );
  }

  /* ---------- سؤال واحد متحرك ---------- */
  if (!questions.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <p className="font-bold">لا توجد أسئلة في هذا الاختبار بعد.</p>
        <p className="mt-1 text-sm text-muted-foreground">أخبر أستاذك ليضيف الأسئلة من لوحة الإدارة.</p>
      </div>
    );
  }

  const q = questions[idx];
  const R2 = 26;
  const C2 = 2 * Math.PI * R2;
  const frac = totalSecs > 0 ? Math.max(secondsLeft, 0) / totalSecs : 0;

  return (
    <div dir="rtl">
      {/* شريط علوي: المؤقت + التقدم */}
      <div className="mb-4 flex items-center gap-3">
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-extrabold tabular-nums shadow-sm ${danger ? 'animate-timer-danger bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>
          <Clock3 size={16} /> {mm}:{ss}
        </span>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-l from-primary to-accent transition-all duration-500" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
        </div>
        <span className="shrink-0 rounded-2xl bg-secondary px-3 py-2 text-xs font-extrabold text-primary">سؤال {idx + 1} / {questions.length}</span>
      </div>
      {resumed && !result ? (
        <p className="mb-3 rounded-xl bg-accent/15 px-4 py-2 text-center text-[11px] font-bold text-accent-foreground">⏱ تكملة لوقتك السابق — تحديث الصفحة لا يعيد الوقت ولا يلغي إجاباتك</p>
      ) : null}
      {!result ? (
        <p className="mb-3 rounded-xl bg-destructive/[0.07] px-4 py-2 text-center text-[11px] font-bold text-destructive">🔒 وضع الاختبار: مراجعة الدرس والملخصات متوقفة حتى تسليم الإجابات</p>
      ) : null}
      {/* نقاط التنقل */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            type="button"
            onClick={() => go(i)}
            className={`h-8 w-8 shrink-0 rounded-lg text-xs font-extrabold transition-all ${i === idx ? 'scale-110 bg-primary text-primary-foreground shadow-md' : answers[qq.id] !== undefined ? 'bg-green-500/25 text-green-800' : 'bg-muted text-muted-foreground hover:bg-secondary'}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* بطاقة السؤال */}
      <div key={`${q.id}-${idx}`} className={dir === 1 ? 'animate-quiz-next' : 'animate-quiz-prev'}>
        <div className="rounded-3xl border border-primary/20 bg-gradient-to-b from-secondary/60 to-card p-5 shadow-sm sm:p-6">
          <p className="font-display text-base font-bold leading-8 text-primary sm:text-lg">{q.question}</p>
        </div>
        <div className="mt-3.5 grid gap-2.5">
          {q.options.map((opt: string, oi: number) => {
            const selected = answers[q.id] === oi;
            return (
              <button
                key={oi}
                type="button"
                onClick={() => choose(oi)}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-right text-sm font-bold transition-all active:scale-[0.98] sm:p-4 ${selected ? 'animate-opt-pop border-primary bg-primary/[0.08] text-primary shadow-md' : 'border-border bg-card hover:border-primary/50 hover:bg-secondary/40'}`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold transition-colors ${selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}>
                  {selected ? <Check size={17} /> : ARABIC_LETTERS[oi] || oi + 1}
                </span>
                <span className="min-w-0 flex-1 leading-6">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* تنقل سفلي ثابت */}
      <div className="sticky bottom-0 -mx-1 mt-5 flex items-center gap-2.5 border-t border-border bg-card/95 px-1 pb-1 pt-4 backdrop-blur">
        <Button onClick={() => go(idx - 1)} disabled={idx === 0} variant="outline" className="flex-1 py-3 text-sm">
          <ChevronRight size={16} /> السابق
        </Button>
        <span className="hidden text-[11px] font-bold text-muted-foreground sm:block">أجبت {answered} من {questions.length}</span>
        {idx < questions.length - 1 ? (
          <Button onClick={() => go(idx + 1)} variant="soft" className="flex-1 py-3 text-sm">التالي <ChevronLeft size={16} /></Button>
        ) : (
          <Button onClick={() => doSubmit(answersRef.current)} disabled={submitting || answered < questions.length} variant="primary" className="flex-1 py-3 text-sm shadow-md animate-glow-pulse">
            {submitting ? 'جارٍ التصحيح...' : `تسليم الإجابات (${answered}/${questions.length})`} <ArrowLeft size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

function AssessmentsPage() {
  const query = useListAssessments();
  const studentDashForExams = useGetStudentDashboard();
  const [gradeExams, setGradeExams] = useState<any[] | null>(null);
  const studentGrade = studentDashForExams.data?.student?.grade;
  const examsStudentId = studentDashForExams.data?.student?.id;
  const examsGender = studentDashForExams.data?.student?.gender;
  const platformOverview = useGetPlatformOverview();
  const examsTerm = (platformOverview.data as any)?.semester || 'الفصل الأول';
  const examsSplitMap = useSplitMap();
  const examsSplit = examsSplitMap[studentGrade || ''] === true;
  useEffect(() => {
    if (!studentGrade) return;
    const params = new URLSearchParams({ grade: studentGrade, student: '1' });
    if (examsStudentId) params.set('student_id', examsStudentId);
    jsonFetch(`/api/curriculum/assessments?${params.toString()}`)
      .then((d) => { if (Array.isArray(d) && d.length) setGradeExams(d); })
      .catch(() => undefined);
  }, [studentGrade, examsStudentId]);
  const examList = gradeExams || query.data;
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow="قياس الفهم والإتقان"
        title="التقييمات والاختبارات"
        body="اختبارات تفاعلية حية تقيس فهمك للنحو والبلاغة — أجب وراجع الشروحات فور التسليم."
        tone="light"
        stats={[{ value: examList?.length ?? 0, label: 'اختبارات متاحة' }]}
      />
      <GradeTermBadge grade={studentGrade || 'الصف العاشر'} term={examsTerm} split={examsSplit} gender={examsGender} />
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : !examList?.length ? (
        <StateNotice type="empty" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {examList.map((assessment, ai) => {
            const done = assessment.score > 0 || (assessment.status && assessment.status !== 'متاح الآن');
            return (
            <div key={assessment.id} className="group relative overflow-hidden rounded-[1.8rem] border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-fade-up" style={{ animationDelay: `${Math.min(ai, 6) * 0.06}s` }} data-testid={`card-assessment-${assessment.id}`}>
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/15 blur-2xl transition-opacity group-hover:opacity-100" />
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#0d47a1] to-[#3f7dc2] p-3 text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"><Target size={22} /></span>
                <span className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${done ? 'bg-green-500/15 text-green-800' : 'bg-accent/25 text-accent-foreground animate-glow-pulse'}`}>
                  {assessment.status || 'متاح الآن'}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold leading-snug text-primary">{assessment.title}</h3>
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {[
                  { v: assessment.questions, l: 'أسئلة' },
                  { v: assessment.duration, l: 'المدة' },
                  { v: assessment.score > 0 ? `${assessment.score}%` : '—', l: 'نتيجتك' },
                ].map((s, si) => (
                  <div key={si} className="rounded-2xl bg-secondary/60 px-2 py-3 text-center">
                    <p className="truncate font-display text-base font-extrabold text-primary">{s.v}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{s.l}</p>
                  </div>
                ))}
              </div>
              <Button onClick={() => setActiveQuiz(assessment)} variant="primary" className="mt-5 w-full py-3.5 shadow-md" data-testid={`button-assessment-${assessment.id}`}>
                {done ? 'إعادة الاختبار وتحسين النتيجة' : 'ابدأ الاختبار التفاعلي الآن'} <ArrowLeft size={16} />
              </Button>
            </div>
            );
          })}
        </div>
      )}

      {/* Quiz Modal — مشغّل تفاعلي متحرك */}
      {activeQuiz && (
        <Modal title={activeQuiz.title} eyebrow="اختبار تفاعلي مباشر" onClose={() => setActiveQuiz(null)} maxWidth="max-w-2xl">
          <QuizRunner
            key={activeQuiz.id}
            assessment={activeQuiz}
            onClose={() => setActiveQuiz(null)}
            onFinished={() => query.refetch()}
          />
        </Modal>
      )}
    </Shell>
  );
}

/* =========================================================================
   STUDENT PROFILE & EDIT
========================================================================= */

function ProfilePage() {
  const query = useGetStudentDashboard();
  const s = query.data?.student;
  const progress = query.data?.progress ?? 70;
  const completed = query.data?.completedLessons ?? 0;
  const [showEdit, setShowEdit] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const openEdit = () => {
    setPhone((s as any)?.phone || '');
    setMsg('');
    setShowEdit(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await fetch('/api/student/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s?.id, phone }),
      });
      query.refetch();
      setMsg('تم حفظ رقم الهاتف بنجاح! ✓');
      setTimeout(() => {
        setShowEdit(false);
        setMsg('');
      }, 1500);
    } catch (e) {
      setMsg('تعذر حفظ الرقم — تحقق من الاتصال');
    } finally {
      setSaving(false);
    }
  };

  const locked: [string, any, string][] = [
    ['الاسم الكامل', s?.name || '—', 'UserRound'],
    ['البريد الإلكتروني', s?.email || '—', 'Mail'],
    ['المدرسة المعتمدة', s?.school || '—', 'GraduationCap'],
    ['الصف الدراسي', s?.grade || '—', 'BookOpen'],
    ['المسار الأكاديمي', s?.branch || '—', 'Library'],
    ['الجنس', s?.gender || '—', 'UsersRound'],
  ];
  const lockedIcons: Record<string, typeof UserRound> = {
    UserRound, Mail, GraduationCap, BookOpen, Library, UsersRound,
  };

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow="بياناتي التعليمية"
        title={`أهلاً ${s?.name ? s.name.split(' ')[0] : ''} 👋`}
        body="ملفك الشخصي الرسمي في منصة أرض اللغة — بياناتك الأساسية محمية ومقفلة، ويمكنك تحديث رقم هاتفك فقط."
        action={
          <Button onClick={openEdit} variant="soft" className="!bg-accent !text-accent-foreground shadow-md hover:brightness-105" data-testid="button-edit-profile">
            <Phone size={17} /> تعديل رقم الهاتف
          </Button>
        }
      />
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : (
        <>
          {/* بطاقة الهوية */}
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#0d2926] via-[#17413f] to-[#25655f] p-6 text-white shadow-xl sm:p-8">
            <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 right-1/4 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-2 top-6 select-none font-display text-[9rem] leading-none text-white/[0.06]">ض</div>
            <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:text-right">
              <span className="relative shrink-0">
                <Avatar name={s?.name ?? 'م'} src={s?.avatarUrl} size="lg" />
                <span className="absolute -bottom-1 -left-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[#17413f] bg-green-500 text-white" title="نشط">
                  <Check size={13} />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-2xl font-extrabold sm:text-3xl">{s?.name || ''}</h3>
                <p className="mt-1 truncate text-sm text-white/70" dir="ltr">{s?.email || ''}</p>
                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-extrabold text-[#3a2c07] shadow">{s?.grade || ''}</span>
                  <span className="rounded-xl bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur-sm">{s?.school || ''}</span>
                  <span className="rounded-xl bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur-sm">{s?.gender || ''}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-5 rounded-3xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur-md">
                <ProgressRing value={progress} size={96} />
                <div className="text-right">
                  <p className="font-display text-2xl font-extrabold text-accent">{completed}</p>
                  <p className="mt-0.5 text-xs font-semibold text-white/65">دروس<br />منجزة</p>
                </div>
              </div>
            </div>
            <div className="relative mt-6 h-2.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-l from-accent to-[#f3d68a] transition-all animate-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* البيانات الرسمية المقفلة */}
          <div className="mt-6 rounded-[2rem] border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-display text-xl font-bold text-primary">
                  <ShieldCheck size={20} className="text-accent-foreground" /> البيانات الرسمية
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">مقفلة ولا يمكن تعديلها — لتغييرها تواصل مع الأستاذ مباشرة</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-xs font-bold text-primary">
                <Lock size={13} /> محمية
              </span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {locked.map(([label, value, iconKey]) => {
                const Icon = lockedIcons[iconKey as string] || UserRound;
                return (
                  <div key={label as string} className="group flex items-center gap-3.5 rounded-2xl border border-border/70 bg-background/60 p-4 transition-all hover:border-primary/25 hover:shadow-sm">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                      <Icon size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">{label} <Lock size={10} className="opacity-60" /></p>
                      <p className="mt-0.5 truncate text-sm font-extrabold text-primary" dir={label === 'البريد الإلكتروني' ? 'ltr' : undefined}>{value as string}</p>
                    </div>
                  </div>
                );
              })}
              {/* بطاقة الهاتف — قابلة للتعديل */}
              <button type="button" onClick={openEdit} className="group flex items-center gap-3.5 rounded-2xl border-2 border-dashed border-accent/50 bg-accent/[0.07] p-4 text-right transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="button-edit-phone">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-sm transition-transform group-hover:scale-110">
                  <Phone size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">رقم الهاتف — اضغط للتعديل ✏️</p>
                  <p className="mt-0.5 truncate text-sm font-extrabold text-primary" dir="ltr">{(s as any)?.phone || 'لم يُسجَّل بعد'}</p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* نافذة تعديل الرقم فقط */}
      {showEdit && (
        <Modal title="تعديل رقم الهاتف" eyebrow="التعديل الوحيد المتاح لك" onClose={() => setShowEdit(false)} maxWidth="max-w-md">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <p className="mb-3 text-xs font-bold text-muted-foreground">بيانات مقفلة 🔒 (الاسم، المدرسة، الصف، البريد)</p>
              <div className="space-y-2 opacity-70">
                {[s?.name, s?.school, s?.grade].map((v, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">
                    <Lock size={12} /> <span className="truncate">{v || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
            <label className="block text-sm font-semibold text-foreground">
              <span className="mb-2 flex items-center gap-1.5">📱 رقم الهاتف الجديد <span className="rounded-md bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-800">قابل للتعديل</span></span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required dir="ltr" inputMode="tel" placeholder="059xxxxxxx" className="w-full rounded-2xl border-2 border-accent/40 bg-background p-3.5 text-center font-mono text-base font-bold outline-none transition-all placeholder:text-muted-foreground/50 focus:border-accent focus:ring-4 focus:ring-accent/20" data-testid="input-edit-phone" />
            </label>
            {msg ? <p className="rounded-xl bg-accent/20 px-4 py-3 text-center text-sm font-bold text-accent-foreground">{msg}</p> : null}
            <div className="flex items-center justify-end gap-3 pt-1">
              <Button onClick={() => setShowEdit(false)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={saving} variant="primary" className="px-6 py-3" data-testid="button-save-phone">
                {saving ? 'جارٍ الحفظ...' : 'حفظ الرقم ✓'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

/* =========================================================================
   TEACHER PORTAL PAGES
========================================================================= */

function TeacherDashboard() {
  const query = useGetTeacherDashboard();
  const d = query.data;

  return (
    <Shell mode="teacher">
      <PageHeading
        eyebrow="لوحة المتابعة الإدارية"
        title="مرحباً بالأستاذ أحمد يحيى الأسطل"
        body="مؤشرات أداء منصة أرض اللغة ونشاط الطلاب في مناهج اللغة العربية والقرآن الكريم."
        action={
          <Link href="/teacher/content">
            <Button data-testid="button-teacher-action">
              <Plus size={17} /> إضافة محتوى جديد
            </Button>
          </Link>
        }
      />
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : !d ? (
        <StateNotice type="empty" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Kpi label="إجمالي الطلبة" value={d.stats.students} icon={UsersRound} />
            <Kpi label="طلبة نشطون" value={d.stats.activeStudents} icon={TrendingUp} tone="warm" />
            <Kpi label="متوسط درجات الاختبارات" value={`${d.stats.averageScore}%`} icon={Target} />
            <Kpi label="الشهادات الممنوحة" value={d.stats.certificates} icon={Award} tone="warm" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">نبض المنصة التعليمي</p>
                  <h3 className="mt-1 text-xl font-bold text-primary">نشاط تفاعل الطلاب الأسبوعي</h3>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">الأسبوع الحالي</span>
              </div>
              <div className="mt-8 flex h-52 items-end gap-2 sm:gap-6">
                {(d.weeklyActivity ?? []).map((point) => (
                  <div key={point.label} className="group flex flex-1 flex-col items-center gap-2">
                    <div className="relative w-full max-w-10 rounded-t-xl bg-secondary transition-all group-hover:bg-accent" style={{ height: `${Math.max(point.value, 10)}%` }}>
                      <span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-md bg-primary px-2 py-1 text-[10px] text-primary-foreground group-hover:block font-bold">
                        {point.value}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">{point.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm font-semibold text-muted-foreground">ملخص المقررات</p>
              <h3 className="mt-1 text-xl font-bold text-primary">محتوى أرض اللغة</h3>
              <div className="mt-6 space-y-4">
                {[
                  ['الوحدات التعليمية المعتمدة', d.stats.units, BookOpen],
                  ['الواجبات والتكليفات', d.stats.assignments, FileText],
                  ['الاختبارات والتقييمات', d.stats.assessments, ClipboardCheck],
                  ['المدارس المشاركة', d.stats.schools, GraduationCap],
                ].map(([label, value, Icon]) => (
                  <div key={label as string} className="flex items-center gap-3.5 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary">
                      {Icon && <Icon size={18} />}
                    </span>
                    <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
                    <strong className="text-primary font-bold text-base">{value as number}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-primary">طلبة انضموا حديثاً</h3>
                <Link href="/teacher/students" className="text-sm font-bold text-primary hover:underline" data-testid="link-teacher-students">
                  عرض كل الطلاب
                </Link>
              </div>
              <div className="mt-5 space-y-2">
                {d.recentStudents?.length ? (
                  d.recentStudents.slice(0, 5).map((s) => (
                    <div key={s.id} className="flex items-center gap-3.5 rounded-xl p-3 hover:bg-secondary/40 transition-colors">
                      <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-primary truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.school} · {s.grade}</p>
                      </div>
                      <span className="text-xs font-bold text-primary bg-secondary px-2.5 py-1 rounded-lg">{s.progress}%</span>
                    </div>
                  ))
                ) : (
                  <StateNotice type="empty" />
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-primary">تكليفات قيد المتابعة</h3>
                <Link href="/teacher/content" className="text-sm font-bold text-primary hover:underline" data-testid="link-teacher-content">
                  إدارة المحتوى
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                {d.pendingAssignments?.length ? (
                  d.pendingAssignments.slice(0, 4).map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-border p-3.5">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/30 text-accent-foreground">
                        <FileText size={18} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-primary truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.unit}</p>
                      </div>
                      <Link href="/teacher/content">
                        <Button variant="ghost" className="px-2" data-testid={`button-review-${a.id}`}>
                          <ArrowLeft size={16} />
                        </Button>
                      </Link>
                    </div>
                  ))
                ) : (
                  <StateNotice type="empty" />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

function StudentsPage() {
  const query = useListStudents();
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'الكل' | 'طالب' | 'طالبة'>('الكل');
  const [showAdd, setShowAdd] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', school: 'مدرسة وايلد', grade: 'الصف العاشر', section: 'أ', gender: 'طالب', phone: '' });
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  const students = useMemo(
    () => (query.data ?? []).filter((s) =>
      (genderFilter === 'الكل' || s.gender === genderFilter) &&
      (s.name.toLowerCase().includes(search.toLowerCase()) || s.school.toLowerCase().includes(search.toLowerCase()))
    ),
    [query.data, search, genderFilter]
  );
  const boysCount = (query.data ?? []).filter((s) => s.gender === 'طالب').length;
  const girlsCount = (query.data ?? []).filter((s) => s.gender === 'طالبة').length;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddMsg('');
    try {
      await fetch('/api/teacher/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudent),
      });
      query.refetch();
      setAddMsg('تمت إضافة الطالب بنجاح!');
      setTimeout(() => {
        setShowAdd(false);
        setAddMsg('');
        setNewStudent({ name: '', email: '', school: 'مدرسة وايلد', grade: 'الصف العاشر', section: 'أ', gender: 'طالب', phone: '' });
      }, 1500);
    } catch (e) {
      setAddMsg('تعذر إضافة الطالب');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Shell mode="teacher">
      <PageHeading eyebrow="سجل الطلاب" title="إدارة ومتابعة الطلاب" body="استعرض سجل الطلاب المسجلين بالمنصة، تابع نسب تقدمهم، أو أضف طالباً جديداً." action={<Button onClick={() => setShowAdd(true)} data-testid="button-add-student"><Plus size={17} /> إضافة طالب جديد</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm sm:max-w-md flex-1">
          <Search size={18} className="text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الطالب أو المدرسة..." className="w-full bg-transparent text-sm outline-none" data-testid="input-search-students" />
        </div>
        {[
          { id: 'الكل' as const, label: `الكل (${(query.data ?? []).length})` },
          { id: 'طالب' as const, label: `الطلاب (${boysCount})` },
          { id: 'طالبة' as const, label: `الطالبات (${girlsCount})` },
        ].map((f) => (
          <button key={f.id} type="button" onClick={() => setGenderFilter(f.id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${genderFilter === f.id ? 'bg-primary text-primary-foreground shadow-sm' : 'border border-border bg-card text-muted-foreground hover:text-primary'}`} data-testid={`filter-gender-${f.id}`}>{f.label}</button>
        ))}
      </div>
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : !students.length ? (
        <StateNotice type="empty" />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="hidden grid-cols-[1.4fr_1fr_.75fr_.75fr_.5fr] gap-4 border-b border-border bg-secondary/40 px-6 py-4 text-xs font-bold text-muted-foreground md:grid">
            <span>الطالب</span>
            <span>المدرسة</span>
            <span>الصف الدراسي</span>
            <span>نسبة الإنجاز</span>
            <span>الحالة</span>
          </div>
          {students.map((s) => (
            <div key={s.id} className="grid gap-3 border-b border-border px-5 py-4 last:border-0 md:grid-cols-[1.4fr_1fr_.75fr_.75fr_.5fr] md:items-center md:gap-4 md:px-6" data-testid={`row-student-${s.id}`}>
              <div className="flex items-center gap-3">
                <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <p className="font-bold text-primary text-sm truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground font-medium">{s.school}</p>
              <p className="text-sm text-muted-foreground font-medium">{s.grade} · <span className={`font-bold ${s.gender === 'طالبة' ? 'text-[#8a508f]' : 'text-primary'}`}>{s.gender || '—'}</span></p>
              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span>{s.progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${s.progress}%` }} />
                </div>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary w-fit">{s.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add Student Modal */}
      {showAdd && (
        <Modal title="إضافة طالب جديد" eyebrow="بوابة المعلم" onClose={() => setShowAdd(false)} maxWidth="max-w-md">
          <form onSubmit={handleAdd} className="space-y-4">
            <label className="block text-sm font-semibold">
              <span className="mb-2 block">اسم الطالب الكامل</span>
              <input value={newStudent.name} onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })} required placeholder="مثال: يوسف خالد" className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" />
            </label>
            <label className="block text-sm font-semibold">
              <span className="mb-2 block">البريد الإلكتروني</span>
              <input type="email" value={newStudent.email} onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })} placeholder="student@example.com" className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                <span className="mb-2 block">المدرسة</span>
                <input value={newStudent.school} onChange={(e) => setNewStudent({ ...newStudent, school: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none" />
              </label>
              <label className="block text-sm font-semibold">
                <span className="mb-2 block">الصف</span>
                <input value={newStudent.grade} onChange={(e) => setNewStudent({ ...newStudent, grade: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none" />
              </label>
            </div>
            {addMsg && <p className="text-sm font-bold text-accent-foreground">{addMsg}</p>}
            <div className="flex items-center justify-end gap-3 pt-3">
              <Button onClick={() => setShowAdd(false)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={adding} variant="primary">
                {adding ? 'جارٍ الإضافة...' : 'إضافة الطالب'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

function ContentPage() {
  const courses = useListCourses();
  const assignments = useListAssignments();
  const assessments = useListAssessments();
  const [tab, setTab] = useState<'courses' | 'assignments' | 'assessments'>('courses');
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const tabs = [
    { id: 'courses' as const, label: 'الوحدات التعليمية', count: courses.data?.length },
    { id: 'assignments' as const, label: 'الواجبات والتكليفات', count: assignments.data?.length },
    { id: 'assessments' as const, label: 'الاختبارات والتقييمات', count: assessments.data?.length },
  ];

  const items = tab === 'courses' ? courses.data : tab === 'assignments' ? assignments.data : assessments.data;
  const loading = tab === 'courses' ? courses.isLoading : tab === 'assignments' ? assignments.isLoading : assessments.isLoading;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback('');
    try {
      const endpoint = tab === 'courses' ? '/api/teacher/courses' : tab === 'assignments' ? '/api/teacher/assignments' : '/api/teacher/assessments';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (tab === 'courses') courses.refetch();
      if (tab === 'assignments') assignments.refetch();
      if (tab === 'assessments') assessments.refetch();
      setFeedback('تمت الإضافة بنجاح!');
      setTimeout(() => {
        setShowAddModal(false);
        setFormData({});
        setFeedback('');
      }, 1500);
    } catch (e) {
      setFeedback('تعذر إضافة العنصر');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell mode="teacher">
      <PageHeading
        eyebrow="مكتبة المنهاج"
        title="إدارة المحتوى التعليمي"
        body="إضافة وتعديل الوحدات والدروس والواجبات والاختبارات لمناهج اللغة العربية والقرآن الكريم."
        action={
          <Button onClick={() => { setFormData({}); setShowAddModal(true); }} data-testid="button-add-content">
            <Plus size={17} /> إضافة {tab === 'courses' ? 'وحدة جديدة' : tab === 'assignments' ? 'واجب جديد' : 'تقييم جديد'}
          </Button>
        }
      />
      <div className="mb-6 flex gap-1.5 overflow-auto rounded-2xl bg-muted p-1.5 sm:w-fit shadow-inner">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              tab === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-primary'
            }`}
            data-testid={`button-content-tab-${t.id}`}
          >
            {t.label} <span className="mr-1.5 text-xs opacity-75 font-mono">({t.count ?? 0})</span>
          </button>
        ))}
      </div>
      {loading ? (
        <StateNotice type="loading" />
      ) : !items?.length ? (
        <StateNotice type="empty" />
      ) : (
        <div className="grid gap-3">
          {items.map((item: any) => (
            <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary/30 shadow-sm" data-testid={`row-content-${item.id}`}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                {tab === 'courses' ? <BookOpen size={20} /> : tab === 'assignments' ? <FileText size={20} /> : <Target size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-primary text-base">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tab === 'courses' ? `${item.lessons} دروس تفاعلية · ${item.duration}` : tab === 'assignments' ? `${item.unit} · ${item.points} درجة` : `${item.questions} أسئلة · ${item.duration}`}
                </p>
              </div>
              <span className="hidden rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary sm:block">
                {tab === 'courses' ? `${item.progress}% مكتمل` : item.status}
              </span>
              <Button variant="ghost" className="px-2" data-testid={`button-edit-content-${item.id}`}>
                <Pencil size={17} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add Content Modal */}
      {showAddModal && (
        <Modal title={`إضافة ${tab === 'courses' ? 'وحدة تعليمية' : tab === 'assignments' ? 'واجب جديد' : 'تقييم جديد'}`} eyebrow="إدارة المحتوى" onClose={() => setShowAddModal(false)} maxWidth="max-w-lg">
          <form onSubmit={handleCreate} className="space-y-4">
            <label className="block text-sm font-semibold">
              <span className="mb-2 block">العنوان</span>
              <input value={formData.title || ''} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" />
            </label>
            <label className="block text-sm font-semibold">
              <span className="mb-2 block">الوصف / التعليمات</span>
              <textarea value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none resize-none" />
            </label>
            {tab === 'courses' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  <span className="mb-2 block">عدد الدروس</span>
                  <input type="number" defaultValue={5} onChange={(e) => setFormData({ ...formData, lessons: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none" />
                </label>
                <label className="block text-sm font-semibold">
                  <span className="mb-2 block">المدة المقدرة</span>
                  <input defaultValue="4 ساعات" onChange={(e) => setFormData({ ...formData, duration: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none" />
                </label>
              </div>
            )}
            {tab === 'assignments' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  <span className="mb-2 block">الوحدة المرتبطة</span>
                  <input defaultValue="الوحدة الأولى" onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none" />
                </label>
                <label className="block text-sm font-semibold">
                  <span className="mb-2 block">الدرجة</span>
                  <input type="number" defaultValue={25} onChange={(e) => setFormData({ ...formData, points: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none" />
                </label>
              </div>
            )}
            {tab === 'assessments' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  <span className="mb-2 block">عدد الأسئلة</span>
                  <input type="number" defaultValue={5} onChange={(e) => setFormData({ ...formData, questions: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none" />
                </label>
                <label className="block text-sm font-semibold">
                  <span className="mb-2 block">المدة المحددة</span>
                  <input defaultValue="20 دقيقة" onChange={(e) => setFormData({ ...formData, duration: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none" />
                </label>
              </div>
            )}
            {feedback && <p className="text-sm font-bold text-accent-foreground">{feedback}</p>}
            <div className="flex items-center justify-end gap-3 pt-3">
              <Button onClick={() => setShowAddModal(false)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={saving} variant="primary">
                {saving ? 'جارٍ الحفظ...' : 'حفظ المحتوى'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

function SettingsPage() {
  const query = useGetTeacherSettings();
  const mutation = useUpdateTeacherSettings();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({ platformName: '', teacherName: '', teacherBio: '', teacherImageUrl: '', signatureUrl: '', accentColor: '', semester: 'الفصل الأول' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [splitMapState, setSplitMapState] = useState<Record<string, boolean>>({});
  const [splitSaving, setSplitSaving] = useState<string | null>(null);
  const [splitMsg, setSplitMsg] = useState('');
  useEffect(() => {
    jsonFetch('/api/curriculum/grade-settings')
      .then((d) => {
        const m: Record<string, boolean> = {};
        if (Array.isArray(d)) for (const g of d) m[g.grade] = !!g.genderSplit;
        setSplitMapState(m);
      })
      .catch(() => undefined);
  }, []);
  const toggleSplit = async (g: string) => {
    setSplitSaving(g);
    try {
      const res = await jsonFetch('/api/teacher/grade-settings', { method: 'PATCH', body: { grade: g, genderSplit: !splitMapState[g] } });
      setSplitMapState((m) => ({ ...m, [g]: !m[g] }));
      setSplitMsg(res.message || 'تم الحفظ!');
      setTimeout(() => setSplitMsg(''), 3000);
    } catch (e: any) {
      setSplitMsg(e?.message || 'تعذر الحفظ');
    } finally {
      setSplitSaving(null);
    }
  };

  const current = query.data;
  const values = {
    platformName: touched.platformName ? form.platformName : current?.platformName || 'أرض اللغة',
    teacherName: touched.teacherName ? form.teacherName : current?.teacherName || 'المعلم أحمد يحيى الأسطل',
    teacherBio: touched.teacherBio ? form.teacherBio : current?.teacherBio || 'معلم اللغة العربية والقرآن الكريم والتربية الإسلامية.',
    teacherImageUrl: touched.teacherImageUrl ? form.teacherImageUrl : current?.teacherImageUrl || teacherImageUrl,
    signatureUrl: touched.signatureUrl ? form.signatureUrl : current?.signatureUrl || '',
    accentColor: touched.accentColor ? form.accentColor : current?.accentColor || '#d7b65e',
    semester: touched.semester ? form.semester : current?.semester || 'الفصل الأول',
  };

  const change = (key: keyof typeof form, value: string | boolean) => {
    setSaved(false);
    setSaveError('');
    setTouched((old) => ({ ...old, [key]: true }));
    setForm((old) => ({ ...old, [key]: value }));
  };

  const save = () => {
    setSaveError('');
    mutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          setSaved(true);
          queryClient.invalidateQueries();
        },
        onError: () => setSaveError('تعذر حفظ التغييرات. تحقق من الاتصال وحاول ثانية.'),
      }
    );
  };

  const [uploadingTeacherImg, setUploadingTeacherImg] = useState(false);
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingTeacherImg) return;
    setUploadingTeacherImg(true);
    setSaveError('');
    uploadFileToCloud(file, '/ard-al-lughah/teacher')
      .then((res) => { if (res?.url) change('teacherImageUrl', res.url); })
      .catch(() => setSaveError('تعذر رفع صورة المعلم سحابياً — تحقق من الاتصال وحاول ثانية.'))
      .finally(() => { setUploadingTeacherImg(false); e.target.value = ''; });
  };

  return (
    <Shell mode="teacher">
      <PageHeading
        eyebrow="هوية المنصة والمعلم"
        title="إعدادات المنصة"
        body="تخصيص هوية منصة أرض اللغة، صورة المعلم أحمد الأسطل، ونبذة المنهاج."
        action={
          saved ? (
            <span className="flex items-center gap-2 text-sm font-bold text-green-700 bg-green-100 px-4 py-2 rounded-xl">
              <Check size={18} /> تم الحفظ في قاعدة البيانات
            </span>
          ) : (
            <Button onClick={save} disabled={mutation.isPending} data-testid="button-save-settings">
              <Save size={17} /> {mutation.isPending ? 'يحفظ في Supabase...' : 'حفظ التغييرات'}
            </Button>
          )
        }
      />
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
          <div className="settings-preview relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-xl">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
              <img src={values.teacherImageUrl || teacherImageUrl} alt={values.teacherName || 'صورة المعلم'} className="h-full w-full object-cover object-[center_18%]" data-testid="img-teacher-settings-preview" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/20 to-transparent" />
              <div className="absolute right-5 top-5 rounded-full border border-primary-foreground/25 bg-primary/50 px-3 py-1 text-xs font-bold backdrop-blur-md">
                المعاينة العامة
              </div>
              <div className="absolute bottom-5 right-5 left-5">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground shadow-sm">
                  <BookOpen size={12} /> {values.semester || 'الفصل الأول'}
                </div>
                <p className="mt-3 text-xs text-primary-foreground/70 font-semibold">{values.platformName || 'أرض اللغة'}</p>
                <h3 className="mt-1 font-display text-2xl font-bold">{values.teacherName || 'اسم المعلم'}</h3>
                <p className="mt-2 text-xs leading-6 text-primary-foreground/80 line-clamp-3">{values.teacherBio}</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-primary-foreground/15 pt-4">
              <span className="text-xs text-primary-foreground/70 font-semibold">لون الهوية المعتمد</span>
              <span className="flex items-center gap-2 text-xs font-bold font-mono">
                <span className="h-6 w-6 rounded-full border border-white/30" style={{ backgroundColor: values.accentColor }} />
                {values.accentColor}
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-7 shadow-sm">
            <h3 className="text-lg font-bold text-primary">البيانات الأساسية</h3>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <SettingsField label="اسم المنصة" value={values.platformName} onChange={(v) => change('platformName', v)} testId="input-platform-name" />
              <SettingsField label="اسم المعلم" value={values.teacherName} onChange={(v) => change('teacherName', v)} testId="input-teacher-name" />
              <div className="sm:col-span-2">
                <SettingsField label="نبذة عن المعلم والمنهاج" value={values.teacherBio} onChange={(v) => change('teacherBio', v)} multiline testId="input-teacher-bio" />
              </div>
              <SettingsField label="رمز لون الهوية (HEX)" value={values.accentColor} onChange={(v) => change('accentColor', v)} testId="input-accent-color" />
            </div>
            <div className="mt-8 border-t border-border pt-6">
              <p className="font-bold text-primary text-sm">الفصل الدراسي المعتمد</p>
              <p className="mt-1 text-xs text-muted-foreground">اختر الفصل الذي يعرضه الموقع حالياً — تُحدَّث كتب وواجهة الصفحة الرئيسية ولوحات الطلاب تلقائياً عند الحفظ.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[
                  { value: 'الفصل الأول', icon: BookOpen, desc: 'كتب منتصف العام الدراسي — التشطيبات والمعاملات اللغوية الأساسية.' },
                  { value: 'الفصل الثاني', icon: Library, desc: 'كتب نهاية العام — الروائع والتركيبات المتقدمة ومراجعات ما بعد الفصل الأول.' },
                ].map((option) => {
                  const selected = values.semester === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => change('semester', option.value)}
                      className={`group relative overflow-hidden rounded-2xl border-2 p-5 text-right transition-all ${selected ? 'border-accent bg-accent/10 shadow-md' : 'border-border bg-background hover:border-accent/50 hover:bg-secondary/40'}`}
                      data-testid={`option-semester-${option.value}`}
                    >
                      <div className={`absolute left-4 top-4 grid h-7 w-7 place-items-center rounded-full transition-all ${selected ? 'bg-accent text-accent-foreground' : 'border-2 border-border text-transparent'}`}>
                        <Check size={15} />
                      </div>
                      <span className={`grid h-11 w-11 place-items-center rounded-xl transition-colors ${selected ? 'bg-accent text-accent-foreground' : 'bg-secondary text-primary'}`}>
                        <Icon size={22} />
                      </span>
                      <p className={`mt-4 text-sm font-bold ${selected ? 'text-primary' : 'text-foreground'}`}>{option.value}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-8 overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-b from-accent/15 to-card">
              <div className="flex items-center gap-4 p-6 pb-4">
                <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#6a1b9a] to-[#b7791f] p-3 text-white shadow-lg">
                  <UsersRound size={24} />
                </span>
                <div>
                  <p className="font-display text-lg font-bold text-primary">تقسيم الطلاب والطالبات — لكل صف لحاله</p>
                  <p className="mt-1 max-w-xl text-xs leading-6 text-muted-foreground">
                    فعّل التقسيم للصف الذي تريده فقط: طلابه يرون محتوى «الجميع» + «الطلاب فقط»، وطالباته يرين «الجميع» + «الطالبات فقط».
                    الصف غير المقسّم يرى طلابه كل شيء. وخيار القسم يظهر لك تلقائياً عند إضافة محتوى لصف مقسّم.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 p-5 pt-2 sm:grid-cols-3">
                {GRADES.map((g) => {
                  const on = splitMapState[g] === true;
                  const busy = splitSaving === g;
                  return (
                    <div key={g} className={`rounded-2xl border-2 p-4 text-center transition-all ${on ? 'border-accent bg-accent/10 shadow-md' : 'border-border bg-background'}`}>
                      <p className="text-sm font-extrabold text-primary">{g}</p>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        disabled={busy}
                        onClick={() => toggleSplit(g)}
                        className={`relative mx-auto mt-3 h-9 w-16 rounded-full p-1 shadow-inner transition-colors duration-300 ${on ? 'bg-gradient-to-l from-[#6a1b9a] to-[#b7791f]' : 'bg-muted'}`}
                        data-testid={`switch-split-${g}`}
                      >
                        <span className={`block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-300 ${on ? '-translate-x-7' : 'translate-x-0'}`} />
                      </button>
                      <p className={`mt-2 text-[11px] font-bold ${on ? 'text-[#6a1b9a]' : 'text-muted-foreground'}`}>
                        {busy ? 'جارٍ الحفظ...' : on ? 'مقسّم ✓ طلاب / طالبات' : 'غير مقسّم — الكل معاً'}
                      </p>
                    </div>
                  );
                })}
              </div>
              {splitMsg ? <p className="border-t border-accent/25 px-6 py-3 text-xs font-bold text-accent-foreground">{splitMsg}</p> : null}
            </div>
            <div className="mt-8 border-t border-border pt-6">
              <p className="font-bold text-primary text-sm">صورة المعلم</p>
              <p className="mt-1 text-xs text-muted-foreground">تظهر في الصفحة الرئيسية ومساحات الطلاب.</p>
              <label className="mt-4 flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-border p-4 transition-colors hover:bg-secondary/40">
                <Avatar name={values.teacherName || 'أ'} src={values.teacherImageUrl || teacherImageUrl} />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-primary">{uploadingTeacherImg ? 'جارٍ الرفع سحابياً...' : 'تغيير صورة المعلم'}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">PNG أو JPG — تُرفع سحابياً (ImageKit) {isCloudUrl(values.teacherImageUrl) ? '✓' : ''}</span>
                </span>
                <Upload size={20} className="text-primary" />
                <input type="file" accept="image/png,image/jpeg" onChange={upload} className="hidden" data-testid="input-teacher-image" />
              </label>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function SettingsField({ label, value, onChange, testId, multiline = false }: { label: string; value?: string; onChange: (value: string) => void; testId: string; multiline?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      <span className="mb-2 block">{label}</span>
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20"
          data-testid={testId}
        />
      ) : (
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20"
          data-testid={testId}
        />
      )}
    </label>
  );
}

/* =========================================================================
   منظومة المنهاج — عارض الدرس المشترك (صور + HTML + المحتوى)
========================================================================= */

/** جلب محتوى HTML خارجي (ملف نصي سحابي) وعرضه داخل الدرس — بلا Egress على Supabase */
function decodeArdB64(s: string): string {
  try {
    return decodeURIComponent(escape(atob(s.replace(/^ARDB64\s*/, '').trim())));
  } catch {
    return s;
  }
}

function ExtHtmlViewer({ url, fill }: { url: string; fill?: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setHtml(null);
    setFailed(false);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then((t) => { if (live) setHtml(t.startsWith('ARDB64') ? decodeArdB64(t) : t); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [url]);
  if (failed) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 p-4 text-sm font-bold text-primary hover:bg-secondary">
        <span className="flex items-center gap-2"><FileCode2 size={17} /> تعذر العرض المدمج — افتح الملف مباشرة</span>
        <ArrowLeft size={16} />
      </a>
    );
  }
  if (html === null) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-secondary/60 p-5 text-sm font-bold text-primary">
        <RefreshCw size={17} className="animate-spin" /> جارٍ تحميل المحتوى التفاعلي...
      </div>
    );
  }
  return <iframe title="المحتوى التفاعلي" sandbox="allow-same-origin" srcDoc={html} className={fill ? 'h-full w-full bg-white' : 'h-[480px] w-full bg-white'} data-testid="iframe-lesson-html-ext" />;
}

/* =========================================================================
   كتلة HTML المدمجة — 6 مميزات احترافية:
   تكبير/ملء شاشة/طباعة/تبويب جديد/تقدم القراءة/اختبار النهاية
========================================================================= */
function LessonHtmlBlock({ lesson, exam, onStartExam, onReachEnd }: {
  lesson: any; exam?: any; onStartExam?: () => void; onReachEnd?: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [extHtml, setExtHtml] = useState<string | null>(null);
  const [extFailed, setExtFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fluidH, setFluidH] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const endedRef = useRef(false);
  const inline = !!lesson?.htmlContent;

  useEffect(() => {
    setExtHtml(null);
    setExtFailed(false);
    setProgress(0);
    setFluidH(null);
    endedRef.current = false;
    if (inline || !lesson?.htmlFileUrl) return;
    let live = true;
    fetch(lesson.htmlFileUrl)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then((t) => { if (live) setExtHtml(t.startsWith('ARDB64') ? decodeArdB64(t) : t); })
      .catch(() => { if (live) setExtFailed(true); });
    return () => { live = false; };
  }, [lesson, inline]);

  const html: string | null = inline ? lesson.htmlContent : extHtml;

  const trackProgress = () => {
    try {
      const win = iframeRef.current?.contentWindow;
      const doc = iframeRef.current?.contentDocument;
      if (!win || !doc) return;
      const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0);
      if (h > 120) setFluidH((old) => old ?? Math.min(h + 48, 6000));
      const st = win.scrollY || doc.documentElement.scrollTop || doc.body.scrollTop || 0;
      const vh = win.innerHeight || doc.documentElement.clientHeight || 1;
      const frac = h > vh ? Math.min(st / (h - vh), 1) : 1;
      setProgress(Math.round(frac * 100));
      if (frac >= 0.92 && !endedRef.current) {
        endedRef.current = true;
        onReachEnd?.();
      }
    } catch { /* cross-origin: لا تتبع */ }
  };

  const openNewTab = () => {
    const src = inline ? lesson.htmlContent : extHtml;
    if (!src) return;
    const blob = new Blob([src], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  };

  const printHtml = () => {
    try {
      iframeRef.current?.contentWindow?.print();
    } catch {
      openNewTab();
    }
  };

  const frameH = fluidH ? `${fluidH}px` : '62vh';

  return (
    <div className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-md">
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-gradient-to-l from-secondary/80 to-card px-3 py-2.5 sm:px-4">
        <span className="flex items-center gap-1.5 rounded-xl bg-primary px-2.5 py-1.5 text-xs font-extrabold text-primary-foreground">
          <FileCode2 size={14} /> المحتوى التفاعلي
        </span>
        <span className="mr-auto" />
        <span className="flex items-center gap-1 rounded-xl bg-background p-1 ring-1 ring-border">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)))} title="تصغير العرض" className="grid h-8 w-9 place-items-center rounded-lg text-sm font-extrabold text-primary hover:bg-secondary">أ-</button>
          <button type="button" onClick={() => setZoom(1)} title="إعادة الحجم الأصلي" className="min-w-12 rounded-lg px-1 text-xs font-extrabold tabular-nums text-muted-foreground hover:text-primary">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} title="تكبير العرض" className="grid h-8 w-9 place-items-center rounded-lg text-sm font-extrabold text-primary hover:bg-secondary">أ+</button>
        </span>
        <button type="button" onClick={printHtml} title="طباعة الدرس" className="grid h-9 w-9 place-items-center rounded-xl bg-background text-muted-foreground ring-1 ring-border transition-colors hover:text-primary"><Printer size={16} /></button>
        <button type="button" onClick={openNewTab} title="فتح في تبويب جديد" className="grid h-9 w-9 place-items-center rounded-xl bg-background text-muted-foreground ring-1 ring-border transition-colors hover:text-primary"><ArrowUpLeft size={16} /></button>
        <button type="button" onClick={() => setFull(true)} title="ملء الشاشة" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:scale-105" data-testid="button-fullscreen-html">
          <Maximize2 size={15} /> ملء الشاشة
        </button>
      </div>
      {/* شريط تقدم القراءة */}
      <div className="h-1.5 bg-muted/60">
        <div className="h-full rounded-l-full bg-gradient-to-l from-primary via-accent to-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      {/* المحتوى المدمج */}
      <div className="bg-white">
        {!inline && extFailed ? (
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-destructive">تعذر تحميل المحتوى التفاعلي</p>
            <a href={lesson.htmlFileUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-xs font-bold text-primary">فتح الملف مباشرة <ArrowLeft size={14} /></a>
          </div>
        ) : !html ? (
          <div className="flex items-center gap-3 p-6 text-sm font-bold text-primary">
            <RefreshCw size={17} className="animate-spin" /> جارٍ تحميل المحتوى التفاعلي...
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            title={`محتوى ${lesson.title}`}
            sandbox="allow-same-origin"
            srcDoc={html}
            onLoad={trackProgress}
            style={{ zoom }}
            className="w-full bg-white"
            height={frameH}
            data-testid="iframe-lesson-html"
          />
        )}
      </div>
      {/* ملء الشاشة الحقيقي */}
      {full && html ? (
        <div className="fixed inset-0 z-[95] flex flex-col bg-gradient-to-b from-[#0d2926] to-[#081a19]" dir="rtl" data-testid="fullscreen-html">
          <div className="flex items-center gap-2.5 px-3 py-3 sm:gap-3 sm:px-6">
            <button type="button" onClick={() => setFull(false)} className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-white/10 px-3.5 py-2.5 text-xs font-extrabold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 sm:px-4" aria-label="رجوع">
              <ChevronRight size={17} /> رجوع
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-white sm:text-base">{lesson?.title}</p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <span className="hidden rounded-xl bg-white/10 px-3 py-2 text-xs font-extrabold text-white tabular-nums ring-1 ring-white/15 sm:block">{Math.round(zoom * 100)}%</span>
            {exam && onStartExam ? (
              <button type="button" onClick={() => { setFull(false); onStartExam(); }} className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-xs font-extrabold text-[#3a2c07] shadow-lg transition-transform hover:scale-105 sm:px-5 sm:text-sm">
                <PlayCircle size={17} /> ابدأ الاختبار
              </button>
            ) : null}
            <button type="button" onClick={() => setFull(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20" aria-label="إغلاق">
              <X size={19} />
            </button>
          </div>
          <div className="min-h-0 flex-1 px-2 pb-2 sm:px-5 sm:pb-5">
            <div className="h-full overflow-hidden rounded-2xl bg-white shadow-2xl">
              <iframe title={`محتوى ${lesson.title}`} sandbox="allow-same-origin" srcDoc={html} style={{ zoom }} className="h-full w-full" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LessonViewerBody({ lesson, exam, onStartExam }: { lesson: any; exam?: any; onStartExam?: () => void }) {
  const [endReached, setEndReached] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const images: any[] = Array.isArray(lesson?.images) ? lesson.images : [];
  const content = lesson?.content || {};
  const TypeIcon = lessonTypeIcon(lesson?.lessonType || 'مطالعة');
  return (
    <div className="space-y-6 text-right" dir="rtl">
      {lesson?.coverUrl ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <img src={lesson.coverUrl} alt={lesson.title} className="max-h-72 w-full object-cover" data-testid="img-lesson-cover" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
          <TypeIcon size={14} /> {lesson?.lessonType || 'مطالعة'}
        </span>
        {lesson?.grade ? <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{lesson.grade}</span> : null}
        {lesson?.term ? <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{lesson.term}</span> : null}
        {(lesson?.locked || lesson?.isLocked) ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"><Lock size={13} /> مقفل</span>
        ) : null}
      </div>
      {lesson?.description ? <p className="text-sm leading-7 text-muted-foreground">{lesson.description}</p> : null}

      {images.length > 0 && (
        <div className="rounded-2xl border border-border p-5">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary"><ImagePlus size={16} /> صور الدرس ({images.length})</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((src: string, idx: number) => (
              <a key={idx} href={src} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border">
                <img src={src} alt={`صورة ${idx + 1} من ${lesson.title}`} loading="lazy" className="max-h-64 w-full object-cover transition-transform duration-300 group-hover:scale-105" data-testid={`img-lesson-gallery-${idx}`} />
              </a>
            ))}
          </div>
        </div>
      )}

      {(lesson?.htmlContent || lesson?.htmlFileUrl) ? (
        <LessonHtmlBlock
          lesson={lesson}
          exam={exam}
          onStartExam={onStartExam}
          onReachEnd={() => {
            setEndReached(true);
            window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
          }}
        />
      ) : null}

      {content?.introduction && (
        <div className="rounded-2xl border border-border bg-secondary/50 p-5">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><Sparkles size={16} className="text-accent-foreground" /> مقدمة الدرس</h4>
          <p className="text-sm leading-7 text-muted-foreground">{content.introduction}</p>
        </div>
      )}
      {content?.mainText && (
        <div className="rounded-2xl border border-primary/20 bg-card p-6 shadow-sm">
          <h4 className="mb-3 text-sm font-bold text-primary">النص المعتمد / الشاهد التعليمي:</h4>
          <div className="whitespace-pre-line rounded-xl border-r-4 border-accent bg-muted/40 p-4 font-serif text-base font-medium leading-8 text-primary">{content.mainText}</div>
        </div>
      )}
      {Array.isArray(content?.vocabulary) && content.vocabulary.length > 0 && (
        <div className="rounded-2xl border border-border p-5">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary"><BookOpen size={16} /> المفردات والدلالات اللغوية:</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {content.vocabulary.map((v: any, idx: number) => (
              <div key={idx} className="rounded-xl bg-secondary/40 p-2.5 text-xs">
                <span className="ml-2 font-bold text-primary">«{v.word}»:</span>
                <span className="text-muted-foreground">{v.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {content?.grammarRule && (
        <div className="rounded-2xl border border-accent/30 bg-accent/15 p-5">
          <h4 className="mb-2 text-sm font-bold text-primary">القاعدة اللغوية والإعرابية:</h4>
          <p className="text-sm leading-7 text-primary/90">{content.grammarRule}</p>
        </div>
      )}
      {content?.summary && (
        <div className="rounded-2xl border border-border bg-background p-4">
          <h4 className="mb-1 text-xs font-bold text-muted-foreground">خلاصة الدرس:</h4>
          <p className="text-sm font-semibold leading-6 text-primary">{content.summary}</p>
        </div>
      )}
      {Array.isArray(content?.practiceQuestions) && content.practiceQuestions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary"><HelpCircle size={16} /> تطبيقات وأسئلة تدريبية:</h4>
          <div className="space-y-3">
            {content.practiceQuestions.map((pq: any, i: number) => (
              <div key={i} className="rounded-xl bg-secondary/30 p-3 text-xs leading-6">
                <p className="mb-1 font-bold text-primary">س: {pq.q}</p>
                <p className="text-muted-foreground">الإجابة: {pq.a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {exam && onStartExam ? (
        <div ref={endRef} className="scroll-mt-6">
        <button
          type="button"
          onClick={onStartExam}
          className={`group flex w-full items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-l from-[#0d2926] via-[#17413f] to-[#25655f] p-5 text-right shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl ${endReached ? 'animate-glow-pulse ring-4 ring-accent/60' : ''}`}
          data-testid="button-lesson-exam"
        >
          <span className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-accent/25 blur-2xl" />
          <span className="relative">
            <span className="block font-display text-lg font-extrabold text-white">أنهيت الدرس؟ اختبر نفسك الآن 🎯</span>
            <span className="mt-1.5 block text-xs leading-5 text-white/70">{exam.title} · {exam.questions} أسئلة · {exam.duration}</span>
          </span>
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent font-extrabold text-[#3a2c07] shadow-lg transition-transform group-hover:scale-110">
            <PlayCircle size={26} />
          </span>
        </button>
        </div>
      ) : null}
    </div>
  );
}

/* =========================================================================
   صفحة الطالب الجديدة — الوحدات حسب الصف والفصل مع الأقفال والأغلفة
========================================================================= */

function StudentCoursesPage() {
  const { grade: effectiveGrade, term, split, gender, student } = useStudentGradeTerm();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [activeLesson, setActiveLesson] = useState<any | null>(null);
  const [completedMsg, setCompletedMsg] = useState('');
  const [showLocked, setShowLocked] = useState(false);
  const [lessonQuiz, setLessonQuiz] = useState<any | null>(null);
  const [lessonExam, setLessonExam] = useState<any | null>(null);
  const [quizLocked, setQuizLocked] = useState(false);
  useEffect(() => {
    setLessonQuiz(null);
    setLessonExam(null);
    setQuizLocked(false);
    if (!activeLesson || !student?.id) return;
    const params = new URLSearchParams({ grade: effectiveGrade, student: '1', student_id: student.id });
    jsonFetch(`/api/curriculum/assessments?${params.toString()}`)
      .then((d) => {
        if (Array.isArray(d)) {
          const hit = d.find((a: any) => a.lessonId === activeLesson.id);
          if (hit) setLessonExam(hit);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLesson]);

  const loadCourses = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ grade: effectiveGrade, term, student: '1' });
      if (student?.id) params.set('progress', student.id);
      const data = await jsonFetch(`/api/curriculum/courses?${params.toString()}`);
      setCourses(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e?.message || 'تعذر جلب الوحدات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveGrade, term, student?.id]);

  const openCourse = async (course: any) => {
    if (course.locked || course.isEmpty) return;
    setSelectedCourse(course);
    setLoadingLessons(true);
    try {
      const data = await jsonFetch(`/api/curriculum/courses/${course.id}/lessons?student=1`);
      setLessons(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLessons(false);
    }
  };

  const markComplete = async (lessonId: string) => {
    try {
      await fetch(`/api/lessons/${lessonId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: student?.id }),
      });
      setCompletedMsg('تم حفظ إنجازك للدرس بنجاح!');
      loadCourses();
      setTimeout(() => setCompletedMsg(''), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const visibleCourses = showLocked ? courses : courses.filter((c) => !c.gateLocked && c.isVisible && c.published);
  const openCount = courses.filter((c) => !c.locked && !c.isEmpty).length;

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow="المنهاج الفلسطيني المعتمد"
        title="الوحدات التعليمية"
        body={`وحدات ${effectiveGrade} · ${term} — تظهر لك فقط الوحدات التي وصلتم إليها مع الأستاذ.`}
        tone="light"
        stats={[
          { value: openCount, label: 'وحدات مفتوحة' },
          { value: courses.length, label: 'إجمالي الوحدات' },
        ]}
      />
      <GradeTermBadge grade={effectiveGrade} term={term} split={split} gender={gender} />
      <div className="mb-5 flex items-center justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground">
          <input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} className="accent-primary" /> عرض الوحدات المقفلة أيضاً
        </label>
      </div>

      {loading ? (
        <StateNotice type="loading" />
      ) : loadError ? (
        <StateNotice type="error" onRetry={loadCourses} />
      ) : !visibleCourses.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary"><Lock size={20} /></span>
          <p className="font-semibold">لا توجد وحدات مفتوحة بعد في {effectiveGrade} · {term}</p>
          <p className="mt-1 text-sm text-muted-foreground">سيفتحها لك الأستاذ تباعاً كلما تقدمتم في المنهاج — تابع حصة الأستاذ أحمد.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleCourses.map((course, index) => {
            const locked = course.locked || course.isEmpty;
            return (
              <div key={course.id} className={`group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all ${locked ? 'opacity-90' : 'hover:-translate-y-1 hover:shadow-xl'}`} data-testid={`card-course-detail-${course.id}`}>
                <div className="relative h-40 overflow-hidden" style={{ backgroundColor: course.color || 'hsl(var(--primary))' }}>
                  {course.coverUrl ? (
                    <img src={course.coverUrl} alt={course.title} className={`h-full w-full object-cover ${locked ? 'grayscale' : ''}`} />
                  ) : (
                    <div className="absolute -left-5 -top-12 select-none font-display text-[10rem] leading-none text-white/10">ض</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                  <div className="absolute right-4 top-4 flex items-center gap-2">
                    <span className="rounded-lg bg-black/30 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">الوحدة {String(course.sort_order || index + 1).padStart(2, '0')}</span>
                    {course.isEmpty ? (
                      <span className="rounded-lg bg-white/90 px-3 py-1 text-xs font-bold text-muted-foreground">قريباً</span>
                    ) : course.locked ? (
                      <span className="flex items-center gap-1 rounded-lg bg-black/50 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm"><Lock size={12} /> مقفلة</span>
                    ) : null}
                  </div>
                  <div className="absolute bottom-3 right-4 left-4 flex items-end justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {course.avatarUrl ? (
                        <img src={course.avatarUrl} alt="" className="h-11 w-11 rounded-2xl border-2 border-white/60 object-cover shadow" />
                      ) : (
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 text-white backdrop-blur-sm"><BookOpen size={20} /></span>
                      )}
                      <span className="text-xs font-bold text-white/90">{course.grade} · {course.term}</span>
                    </div>
                    {typeof course.progress === 'number' && course.progress > 0 ? (
                      <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground">{course.progress}%</span>
                    ) : null}
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold leading-tight text-primary">{course.title}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{course.description}</p>
                  <div className="mt-5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>{course.lessons} دروس تفاعلية</span>
                    <span>{course.duration}</span>
                  </div>
                  {typeof course.progress === 'number' ? (
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${course.progress}%` }} />
                    </div>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs font-bold text-primary">{locked ? statusLabel(course.status, course.isEmpty) : 'متاحة الآن'}</span>
                    <Button onClick={() => openCourse(course)} disabled={locked} variant={locked ? 'ghost' : 'soft'} className="px-3.5 py-2 text-xs" data-testid={`link-open-course-${course.id}`}>
                      {course.isEmpty ? 'ستُنشر قريباً' : locked ? (<><Lock size={14} /> مقفلة</>) : (<>فتح الدروس <ArrowLeft size={14} /></>)}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCourse && (
        <Modal title={selectedCourse.title} eyebrow={`دروس الوحدة · ${selectedCourse.grade}`} onClose={() => { setSelectedCourse(null); setActiveLesson(null); }} maxWidth="max-w-2xl">
          {loadingLessons ? (
            <StateNotice type="loading" />
          ) : !lessons.length ? (
            <StateNotice type="empty" />
          ) : (
            <div className="space-y-3">
              <p className="mb-4 text-xs leading-6 text-muted-foreground">{selectedCourse.description}</p>
              {lessons.filter((l) => l.isVisible).map((lesson) => {
                const TypeIcon = lessonTypeIcon(lesson.lessonType);
                const locked = lesson.locked;
                return (
                    <div key={lesson.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4 transition-colors ${locked ? 'opacity-60' : 'hover:border-primary/40'}`}>
                    <div className="flex min-w-[200px] flex-1 items-center gap-3">
                      {lesson.coverUrl ? (
                        <img src={lesson.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><TypeIcon size={17} /></span>
                      )}
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-bold text-primary">
                          <span className="truncate">{lesson.title}</span>
                          {locked ? <Lock size={13} className="shrink-0 text-muted-foreground" /> : null}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-md bg-secondary px-2 py-0.5 font-bold text-primary">{lesson.lessonType}</span>
                          <span className="truncate">{lesson.description || 'شرح الدرس والتدريبات المرافقة'}</span>
                        </p>
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {!locked ? (
                        <Link href={`/student/courses/${selectedCourse.id}/lessons/${lesson.id}`} className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105" data-testid={`link-lesson-page-${lesson.id}`}>
                          صفحة كاملة <ArrowUpLeft size={14} />
                        </Link>
                      ) : null}
                      <Button onClick={() => !locked && setActiveLesson(lesson)} disabled={locked} variant="outline" className="px-3 py-2 text-xs">
                        {locked ? 'مقفل' : (<>عرض سريع <BookOpen size={14} /></>)}
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {activeLesson && (
        <Modal
          title={lessonQuiz ? lessonQuiz.title : activeLesson.title}
          eyebrow={lessonQuiz ? 'اختبار الدرس — بالتوفيق' : 'المحتوى التعليمي الكامل'}
          onClose={() => { setActiveLesson(null); setLessonQuiz(null); }}
          maxWidth={(activeLesson.htmlContent || activeLesson.htmlFileUrl) && !lessonQuiz ? 'max-w-5xl' : 'max-w-3xl'}
        >
          {lessonQuiz ? (
            <div dir="rtl">
              {!quizLocked ? (
                <button type="button" onClick={() => setLessonQuiz(null)} className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-primary hover:bg-accent/40">
                  <ChevronRight size={15} /> عودة للدرس
                </button>
              ) : null}
              <QuizRunner
                key={lessonQuiz.id}
                assessment={lessonQuiz}
                onClose={() => { setLessonQuiz(null); setQuizLocked(false); }}
                onFinished={() => { setQuizLocked(false); markComplete(activeLesson.id); }}
              />
            </div>
          ) : (
            <>
              {completedMsg && (
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/15 p-4 text-sm font-bold text-green-800">
                  <CheckCircle2 size={18} /> {completedMsg}
                </div>
              )}
              <LessonViewerBody lesson={activeLesson} exam={lessonExam} onStartExam={() => { if (lessonExam) { setLessonQuiz(lessonExam); setQuizLocked(true); } }} />
              <div className="flex items-center justify-between border-t border-border pt-4">
                <Button onClick={() => markComplete(activeLesson.id)} variant="primary" className="px-6 py-3" data-testid="button-complete-lesson">
                  <Check size={17} /> إكمال الدرس وتسجيل التقدم
                </Button>
                <Button onClick={() => setActiveLesson(null)} variant="ghost">إغلاق</Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </Shell>
  );
}

/* =========================================================================
   لوحة المعلم الجديدة — إدارة المنهاج الكاملة
   (الصفوف × الوحدات × الدروس × الاختبارات × بوابة آخر ما وصلنا)
========================================================================= */

function Field2({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm font-semibold text-foreground">
      <span className="mb-2 block">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputCls = 'w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-accent/20';

function ImageUrlField({ label, value, onChange, testId, folder = '/ard-al-lughah/covers' }: { label: string; value: string; onChange: (v: string) => void; testId: string; folder?: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const pick = (file?: File | null) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadErr('');
    uploadFileToCloud(file, folder)
      .then((res) => onChange(res.url || ''))
      .catch((e: Error) => setUploadErr(e?.message || 'تعذر الرفع'))
      .finally(() => setUploading(false));
  };
  return (
    <div className="rounded-2xl border border-dashed border-border p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {label}
        {isCloudUrl(value) ? <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-800">مخزّنة سحابياً ✓</span> : null}
      </p>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt="معاينة الغلاف" className="h-16 w-16 rounded-xl border border-border object-cover" data-testid={`${testId}-preview`} />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-xl bg-secondary text-muted-foreground"><ImagePlus size={20} /></span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="رابط الصورة https://..." dir="ltr" className={`${inputCls} font-mono text-xs`} data-testid={testId} />
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-primary hover:bg-accent/40 ${uploading ? 'opacity-60' : ''}`}>
              {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} {uploading ? 'جارٍ الرفع سحابياً...' : 'ارفع صورة من جهازك'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {value ? <button type="button" onClick={() => onChange('')} className="text-xs font-bold text-destructive hover:underline">إزالة</button> : null}
          </div>
          {uploadErr ? <p className="text-xs font-bold text-destructive">{uploadErr}</p> : null}
        </div>
      </div>
    </div>
  );
}

type ManagerTab = 'units' | 'exams' | 'assignments' | 'notes' | 'gates';

function CurriculumManagerPage({ onlyTab, hero }: {
  onlyTab?: ManagerTab;
  hero?: { eyebrow: string; title: string; body: string };
}) {
  const [grade, setGrade] = useState('الصف العاشر');
  const term = usePlatformTerm();
  const [tab, setTab] = useState<ManagerTab>(onlyTab || 'units');
  const splitMap = useSplitMap();
  const gradeSplit = splitMap[grade] === true;
  // تبويب واحد فقط عند التضمين في صفحة مستقلة، وإلا: المنهاج والوحدات + آخر ما وصلنا
  const visibleTabIds: ManagerTab[] = onlyTab ? [onlyTab] : ['units', 'gates'];
  // فلتر القسم (يظهر فقط للصف المقسّم)
  const [sectionFilter, setSectionFilter] = useState('الجميع');
  const [examSearch, setExamSearch] = useState('');

  const [courses, setCourses] = useState<any[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  const [unitModal, setUnitModal] = useState<null | { mode: 'create' } | { mode: 'edit'; course: any }>(null);
  const [unitForm, setUnitForm] = useState<any>({});
  const [savingUnit, setSavingUnit] = useState(false);

  const [lessonModal, setLessonModal] = useState<null | { mode: 'create'; courseId: string } | { mode: 'edit'; lesson: any }>(null);
  const [lessonForm, setLessonForm] = useState<any>({});
  const [lessonImages, setLessonImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingImages, setUploadingImages] = useState(0);
  const [imagesErr, setImagesErr] = useState('');
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [uploadingHtml, setUploadingHtml] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);
  const [previewLesson, setPreviewLesson] = useState<any | null>(null);

  const [exams, setExams] = useState<any[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [hwItems, setHwItems] = useState<any[]>([]);
  const [loadingHw, setLoadingHw] = useState(false);
  const [hwModal, setHwModal] = useState<null | { mode: 'create' } | { mode: 'edit'; item: any }>(null);
  const [hwForm, setHwForm] = useState<any>({});
  const [savingHw, setSavingHw] = useState(false);
  const [examModal, setExamModal] = useState(false);
  const [examForm, setExamForm] = useState<any>({ title: '', description: '', courseId: '', lessonId: '', duration: '20 دقيقة', published: true, isVisible: true });
  const [examLessons, setExamLessons] = useState<any[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLevel, setAiLevel] = useState('متوسط');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDrafts, setAiDrafts] = useState<any[]>([]);
  const [aiMsg, setAiMsg] = useState('');
  const [importText, setImportText] = useState('');
  const importFromText = () => {
    const parsed = parseTextQuiz(importText);
    if (!parsed.length) {
      setAiMsg('لم أجد أسئلة بالنص — الصق أسئلة بصيغة: عنوان، سطر الخيارات (أ) ... | ب) ...)، سطر الجواب الصحيح، سطر ملاحظة.');
      return;
    }
    setAiDrafts(parsed);
    setAiMsg(`تم استخراج ${parsed.length} سؤالاً من النص ✓ — راجعها واعتمدها (الكل أو واحداً واحداً).`);
  };
  useEffect(() => {
    const cid = examForm.courseId;
    if (!examModal || !cid) { setExamLessons([]); return; }
    jsonFetch(`/api/curriculum/courses/${cid}/lessons`).then((d) => setExamLessons(Array.isArray(d) ? d : [])).catch(() => setExamLessons([]));
  }, [examModal, examForm.courseId]);
  const generateWithAi = async () => {
    const course = courses.find((c: any) => c.id === examForm.courseId);
    const lesson = examLessons.find((l: any) => l.id === examForm.lessonId);
    const prompt = aiPrompt.trim() || `اختبار شامل عن ${lesson?.title || course?.title || 'المنهاج'}`;
    setAiLoading(true);
    setAiMsg('');
    try {
      const res = await jsonFetch('/api/teacher/curriculum/assessments/generate', {
        method: 'POST',
        body: { prompt, level: aiLevel, grade, unitTitle: course?.title || '', lessonTitle: lesson?.title || '' },
      });
      const qs = Array.isArray(res.questions) ? res.questions : [];
      setAiDrafts(qs);
      // تعبئة تلقائية للحقول الفارغة: العنوان والوصف والمدة (من اقتراح الذكاء نفسه)
      const filled: string[] = [];
      if (!examForm.title?.trim() && res.suggestedTitle) {
        setExamForm((f: any) => ({ ...f, title: res.suggestedTitle }));
        filled.push('العنوان');
      }
      if (!examForm.description?.trim() && res.suggestedDescription) {
        setExamForm((f: any) => ({ ...f, description: res.suggestedDescription }));
        filled.push('الوصف');
      }
      if (res.suggestedDuration) {
        setExamForm((f: any) => ({ ...f, duration: res.suggestedDuration }));
        filled.push('المدة المناسبة');
      }
      if (!qs.length) {
        setAiMsg('لم يولّد الذكاء أسئلة — جرّب صياغة أخرى');
      } else if (filled.length) {
        setAiMsg(`تم توليد ${qs.length} أسئلة (العدد الحقيقي ✓) وتعبئة (${filled.join(' + ')}) تلقائياً ✓`);
      } else {
        setAiMsg(`تم توليد ${qs.length} أسئلة بنجاح — راجعها واعتمدها ✓`);
      }
    } catch (e: any) {
      setAiMsg(e?.message || 'تعذر التوليد الآن');
    } finally {
      setAiLoading(false);
    }
  };
  const adoptDraft = (i: number) => {
    const q = aiDrafts[i];
    if (!q) return;
    setExamQuestions((qs) => [...qs, { question: q.question, options: [...q.options], correctAnswer: q.correctAnswer, explanation: q.explanation || '' }]);
    setAiDrafts((ds) => ds.filter((_, j) => j !== i));
  };
  const adoptAllDrafts = () => {
    setExamQuestions((qs) => [...qs, ...aiDrafts.map((q) => ({ question: q.question, options: [...q.options], correctAnswer: q.correctAnswer, explanation: q.explanation || '' }))]);
    setAiDrafts([]);
  };
  const [examQuestions, setExamQuestions] = useState<any[]>([{ question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' }]);
  const [savingExam, setSavingExam] = useState(false);
  const [examDetail, setExamDetail] = useState<any | null>(null);
  const [examDetailQuestions, setExamDetailQuestions] = useState<any[]>([]);
  const [newQ, setNewQ] = useState({ question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' });

  const [storage, setStorage] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [noteForm, setNoteForm] = useState<any>({ title: '', body: '', type: 'إرشاد', audience: 'الجميع', targetGrade: 'الجميع', published: true });
  const [savingNote, setSavingNote] = useState(false);

  const [gates, setGates] = useState<any[]>([]);
  const [gateCourseId, setGateCourseId] = useState('');
  const [gateLessonId, setGateLessonId] = useState('');
  const [gateNote, setGateNote] = useState('');
  const [savingGate, setSavingGate] = useState(false);
  const [gateMsg, setGateMsg] = useState('');

  const [msg, setMsg] = useState('');

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || null;
  const currentGate = gates.find((g) => g.grade === grade && g.term === term) || null;

  const loadCourses = async () => {
    setLoadingCourses(true);
    try {
      const data = await jsonFetch(`/api/curriculum/courses?grade=${encodeURIComponent(grade)}&term=${encodeURIComponent(term)}`);
      const list = Array.isArray(data) ? data : [];
      setCourses(list);
      if (selectedCourseId && !list.find((c: any) => c.id === selectedCourseId)) {
        setSelectedCourseId(null);
        setLessons([]);
      }
    } catch (e) { console.error(e); } finally { setLoadingCourses(false); }
  };

  const loadLessons = async (courseId: string) => {
    setLoadingLessons(true);
    try {
      const data = await jsonFetch(`/api/curriculum/courses/${courseId}/lessons`);
      setLessons(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); } finally { setLoadingLessons(false); }
  };

  const loadExams = async () => {
    setLoadingExams(true);
    try {
      const data = await jsonFetch(`/api/curriculum/assessments?grade=${encodeURIComponent(grade)}&term=${encodeURIComponent(term)}`);
      setExams(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); } finally { setLoadingExams(false); }
  };

  const loadGates = async () => {
    try {
      const data = await jsonFetch('/api/curriculum/gates');
      const list = Array.isArray(data) ? data : [];
      setGates(list);
      const cur = list.find((g: any) => g.grade === grade && g.term === term);
      setGateCourseId(cur?.unlockedCourseId || '');
      setGateLessonId(cur?.unlockedLessonId || '');
      setGateNote(cur?.note || '');
    } catch (e) { console.error(e); }
  };

  const loadNotes = async () => {
    setLoadingNotes(true);
    try {
      const data = await jsonFetch('/api/curriculum/announcements');
      setNotes(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); } finally { setLoadingNotes(false); }
  };

  useEffect(() => {
    jsonFetch('/api/teacher/storage').then(setStorage).catch(() => undefined);
  }, []);

  const loadHw = async () => {
    setLoadingHw(true);
    try {
      const data = await jsonFetch(`/api/teacher/curriculum/assignments?grade=${encodeURIComponent(grade)}`);
      setHwItems(Array.isArray(data) ? data : []);
    } catch { setHwItems([]); } finally { setLoadingHw(false); }
  };

  useEffect(() => { loadCourses(); loadExams(); loadNotes(); loadHw(); loadGates(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grade, term]);

  /* ---------- الواجبات ---------- */
  const openHwCreate = () => {
    setHwForm({ title: '', description: '', unit: courses[0]?.title || '', dueDate: '', points: 20, published: true, section: 'الجميع' });
    setHwModal({ mode: 'create' });
  };
  const openHwEdit = (item: any) => {
    setHwForm({ title: item.title, description: item.description, unit: item.unit, dueDate: item.dueDate, points: item.points, published: item.published, section: item.section || 'الجميع' });
    setHwModal({ mode: 'edit', item });
  };
  const saveHw = async (e: FormEvent) => {
    e.preventDefault();
    setSavingHw(true);
    try {
      if (hwModal?.mode === 'create') {
        await jsonFetch('/api/teacher/assignments', { method: 'POST', body: { ...hwForm, grade, section: gradeSplit ? (hwForm.section || 'الجميع') : 'الجميع' } });
        flash('تمت إضافة الواجب بنجاح!');
      } else if (hwModal?.mode === 'edit') {
        await jsonFetch(`/api/teacher/curriculum/assignments/${hwModal.item.id}`, { method: 'PATCH', body: { ...hwForm, grade, section: gradeSplit ? (hwForm.section || 'الجميع') : 'الجميع' } });
        flash('تم حفظ الواجب بنجاح!');
      }
      setHwModal(null);
      loadHw();
    } catch (e: any) { flash(e?.message || 'تعذر حفظ الواجب'); } finally { setSavingHw(false); }
  };
  const deleteHw = async (item: any) => {
    if (!window.confirm(`حذف واجب "${item.title}"؟`)) return;
    try {
      await jsonFetch(`/api/teacher/curriculum/assignments/${item.id}`, { method: 'DELETE' });
      loadHw();
      flash('تم حذف الواجب');
    } catch (e: any) { flash(e?.message || 'تعذر الحذف'); }
  };

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(''), 3000); };

  /* ---------- الوحدات ---------- */
  const openUnitCreate = () => {
    setUnitForm({ title: '', description: '', color: UNIT_COLORS[courses.length % UNIT_COLORS.length], icon: 'book-open', sortOrder: courses.length + 1, duration: '', coverUrl: '', avatarUrl: '', status: 'published', isLocked: false, isVisible: true, section: 'الجميع' });
    setUnitModal({ mode: 'create' });
  };
  const openUnitEdit = (course: any) => {
    setUnitForm({ title: course.title, description: course.description, color: course.color, icon: course.icon, sortOrder: course.sort_order, duration: course.duration, coverUrl: course.coverUrl || '', avatarUrl: course.avatarUrl || '', status: course.status || 'published', isLocked: !!course.isLocked, isVisible: course.isVisible !== false, section: course.section || 'الجميع' });
    setUnitModal({ mode: 'edit', course });
  };
  const saveUnit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingUnit(true);
    try {
      const payload = { ...unitForm, grade, term, section: gradeSplit ? (unitForm.section || 'الجميع') : 'الجميع' };
      if (unitModal?.mode === 'create') {
        await jsonFetch('/api/teacher/curriculum/courses', { method: 'POST', body: payload });
        flash('تمت إضافة الوحدة بنجاح!');
      } else if (unitModal?.mode === 'edit') {
        await jsonFetch(`/api/teacher/curriculum/courses/${unitModal.course.id}`, { method: 'PATCH', body: payload });
        flash('تم حفظ الوحدة بنجاح!');
      }
      setUnitModal(null);
      loadCourses();
    } catch (e: any) { flash(e?.message || 'تعذر حفظ الوحدة'); } finally { setSavingUnit(false); }
  };
  const deleteUnit = async (course: any) => {
    if (!window.confirm(`حذف "${course.title}" مع كل دروسها؟ لا يمكن التراجع.`)) return;
    try {
      await jsonFetch(`/api/teacher/curriculum/courses/${course.id}`, { method: 'DELETE' });
      if (selectedCourseId === course.id) { setSelectedCourseId(null); setLessons([]); }
      loadCourses(); loadExams();
      flash('تم حذف الوحدة');
    } catch (e: any) { flash(e?.message || 'تعذر الحذف'); }
  };
  const quickToggleCourse = async (course: any, patch: any) => {
    try {
      await jsonFetch(`/api/teacher/curriculum/courses/${course.id}`, { method: 'PATCH', body: patch });
      loadCourses();
    } catch (e) { console.error(e); }
  };

  /* ---------- الدروس ---------- */
  const openLessonCreate = (courseId: string) => {
    setLessonForm({ title: '', lessonType: 'مطالعة', description: '', position: lessons.length + 1, coverUrl: '', htmlContent: '', htmlFileUrl: '', introduction: '', mainText: '', grammarRule: '', summary: '', status: 'published', isLocked: false, isVisible: true, examId: '' });
    setLessonImages([]);
    setNewImageUrl('');
    setShowHtmlPreview(false);
    setLessonModal({ mode: 'create', courseId });
  };
  const openLessonEdit = (lesson: any) => {
    const linked = exams.find((e: any) => e.lessonId === lesson.id);
    setLessonForm({ title: lesson.title, lessonType: lesson.lessonType || 'مطالعة', description: lesson.description || '', position: lesson.position || 1, coverUrl: lesson.coverUrl || '', htmlContent: lesson.htmlContent || '', htmlFileUrl: lesson.htmlFileUrl || '', introduction: lesson.content?.introduction || '', mainText: lesson.content?.mainText || '', grammarRule: lesson.content?.grammarRule || '', summary: lesson.content?.summary || '', status: lesson.status || 'published', isLocked: !!lesson.isLocked, isVisible: lesson.isVisible !== false, examId: linked?.id || '' });
    setLessonImages(Array.isArray(lesson.images) ? [...lesson.images] : []);
    setNewImageUrl('');
    setShowHtmlPreview(false);
    setLessonModal({ mode: 'edit', lesson });
  };
  const saveLesson = async (e: FormEvent) => {
    e.preventDefault();
    setSavingLesson(true);
    try {
      const baseContent = lessonModal?.mode === 'edit' ? (lessonModal.lesson.content || {}) : {};
      const payload = {
        title: lessonForm.title,
        lessonType: lessonForm.lessonType,
        description: lessonForm.description,
        position: Number(lessonForm.position) || 1,
        coverUrl: lessonForm.coverUrl,
        images: lessonImages,
        htmlContent: lessonForm.htmlContent,
        htmlFileUrl: lessonForm.htmlFileUrl,
        content: { ...baseContent, introduction: lessonForm.introduction, mainText: lessonForm.mainText, grammarRule: lessonForm.grammarRule, summary: lessonForm.summary },
        status: lessonForm.status,
        isLocked: !!lessonForm.isLocked,
        isVisible: !!lessonForm.isVisible,
        grade, term,
      };
      const syncExamLink = async (lessonId: string, prevExamId: string) => {
        const nextExamId = lessonForm.examId || '';
        if (prevExamId === nextExamId) return;
        if (prevExamId) {
          await jsonFetch(`/api/teacher/curriculum/assessments/${prevExamId}`, { method: 'PATCH', body: { lessonId: null } }).catch(() => undefined);
        }
        if (nextExamId) {
          await jsonFetch(`/api/teacher/curriculum/assessments/${nextExamId}`, { method: 'PATCH', body: { lessonId, courseId: lessonModal?.mode === 'edit' ? lessonModal.lesson.course_id : lessonModal?.mode === 'create' ? lessonModal.courseId : null } }).catch(() => undefined);
        }
      };
      if (lessonModal?.mode === 'create') {
        const created: any = await jsonFetch('/api/teacher/curriculum/lessons', { method: 'POST', body: { ...payload, course_id: lessonModal.courseId } });
        if (created?.id && lessonForm.examId) await syncExamLink(created.id, '');
        flash('تمت إضافة الدرس بنجاح!');
      } else if (lessonModal?.mode === 'edit') {
        await jsonFetch(`/api/teacher/curriculum/lessons/${lessonModal.lesson.id}`, { method: 'PATCH', body: payload });
        const prev = exams.find((e: any) => e.lessonId === lessonModal.lesson.id)?.id || '';
        await syncExamLink(lessonModal.lesson.id, prev);
        flash('تم حفظ الدرس بنجاح!');
      }
      setLessonModal(null);
      if (selectedCourseId) loadLessons(selectedCourseId);
      loadCourses();
    } catch (e: any) { flash(e?.message || 'تعذر حفظ الدرس'); } finally { setSavingLesson(false); }
  };
  const deleteLesson = async (lesson: any) => {
    if (!window.confirm(`حذف درس "${lesson.title}"؟`)) return;
    try {
      await jsonFetch(`/api/teacher/curriculum/lessons/${lesson.id}`, { method: 'DELETE' });
      if (selectedCourseId) loadLessons(selectedCourseId);
      loadCourses();
      flash('تم حذف الدرس');
    } catch (e: any) { flash(e?.message || 'تعذر الحذف'); }
  };

  /* ---------- الاختبارات ---------- */
  const openExamCreate = () => {
    setExamForm({ title: '', description: '', courseId: selectedCourseId || courses[0]?.id || '', lessonId: '', duration: '20 دقيقة', published: true, isVisible: true, section: 'الجميع' });
    setAiPrompt(''); setAiDrafts([]); setAiMsg(''); setAiLevel('متوسط');
    setExamQuestions([{ question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' }]);
    setExamModal(true);
  };
  const saveExam = async (e: FormEvent) => {
    e.preventDefault();
    const clean = examQuestions.filter((q) => q.question.trim() && q.options.filter((o: string) => o.trim()).length >= 2);
    if (!examForm.title.trim()) { flash('عنوان الاختبار مطلوب'); return; }
    if (!clean.length) { flash('أضف سؤالاً واحداً على الأقل بخيارين'); return; }
    setSavingExam(true);
    try {
      await jsonFetch('/api/teacher/curriculum/assessments', { method: 'POST', body: { ...examForm, grade, term, section: gradeSplit ? (examForm.section || 'الجميع') : 'الجميع', questions: clean } });
      setExamModal(false);
      loadExams();
      flash('تم إنشاء الاختبار وأسئلته بنجاح!');
    } catch (e: any) { flash(e?.message || 'تعذر إنشاء الاختبار'); } finally { setSavingExam(false); }
  };
  const openExamDetail = async (exam: any) => {
    setExamDetail(exam);
    try {
      const data = await jsonFetch(`/api/curriculum/assessments/${exam.id}/questions`);
      setExamDetailQuestions(Array.isArray(data) ? data : []);
    } catch { setExamDetailQuestions([]); }
  };
  const addQuestionToExam = async (e: FormEvent) => {
    e.preventDefault();
    if (!examDetail || !newQ.question.trim() || newQ.options.filter((o) => o.trim()).length < 2) { flash('أكمل السؤال وخيارين على الأقل'); return; }
    try {
      await jsonFetch(`/api/teacher/curriculum/assessments/${examDetail.id}/questions`, { method: 'POST', body: newQ });
      const data = await jsonFetch(`/api/curriculum/assessments/${examDetail.id}/questions`);
      setExamDetailQuestions(Array.isArray(data) ? data : []);
      setNewQ({ question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' });
      loadExams();
      flash('تمت إضافة السؤال!');
    } catch (e: any) { flash(e?.message || 'تعذر إضافة السؤال'); }
  };
  const deleteQuestion = async (qId: string) => {
    if (!window.confirm('حذف هذا السؤال؟')) return;
    try {
      await jsonFetch(`/api/teacher/curriculum/questions/${qId}`, { method: 'DELETE' });
      setExamDetailQuestions((qs) => qs.filter((q) => q.id !== qId));
      loadExams();
    } catch (e: any) { flash(e?.message || 'تعذر الحذف'); }
  };
  const deleteExam = async (exam: any) => {
    if (!window.confirm(`حذف اختبار "${exam.title}" مع أسئلته؟`)) return;
    try {
      await jsonFetch(`/api/teacher/curriculum/assessments/${exam.id}`, { method: 'DELETE' });
      setExamDetail(null);
      loadExams();
      flash('تم حذف الاختبار');
    } catch (e: any) { flash(e?.message || 'تعذر الحذف'); }
  };

  /* ---------- الإعلانات ---------- */
  const openNoteCreate = () => {
    setNoteForm({ title: '', body: '', type: 'إرشاد', audience: 'الجميع', targetGrade: grade, section: 'الجميع', published: true });
    setNoteModal(true);
  };
  const saveNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!noteForm.title.trim() || !noteForm.body.trim()) { flash('عنوان الإعلان ونصه مطلوبان'); return; }
    setSavingNote(true);
    try {
      const noteGrade = noteForm.targetGrade || 'الجميع';
      const noteSplit = noteGrade !== 'الجميع' && splitMap[noteGrade] === true;
      await jsonFetch('/api/teacher/curriculum/announcements', { method: 'POST', body: { ...noteForm, grade: noteGrade, section: noteSplit ? (noteForm.section || 'الجميع') : 'الجميع' } });
      setNoteModal(false);
      loadNotes();
      flash('تم نشر الإعلان بنجاح!');
    } catch (e: any) { flash(e?.message || 'تعذر نشر الإعلان'); } finally { setSavingNote(false); }
  };
  const deleteNote = async (note: any) => {
    if (!window.confirm(`حذف إعلان "${note.title}"؟`)) return;
    try {
      await jsonFetch(`/api/teacher/curriculum/announcements/${note.id}`, { method: 'DELETE' });
      loadNotes();
      flash('تم حذف الإعلان');
    } catch (e: any) { flash(e?.message || 'تعذر الحذف'); }
  };
  const toggleNotePublish = async (note: any) => {
    try {
      await jsonFetch(`/api/teacher/curriculum/announcements/${note.id}`, { method: 'PATCH', body: { published: !note.published } });
      loadNotes();
    } catch (e) { console.error(e); }
  };

  /* ---------- البوابة ---------- */
  const gateCourseLessons = lessons.filter((l) => l.course_id === gateCourseId || (selectedCourseId === gateCourseId));
  const saveGate = async (quick?: 'open' | 'lock') => {
    setSavingGate(true);
    setGateMsg('');
    try {
      let payload: any;
      if (quick === 'open') {
        payload = { grade, term, unlockedCourseId: null, unlockedLessonId: null, unlockedUnitOrder: 99, note: 'مفتوح بالكامل' };
      } else if (quick === 'lock') {
        payload = { grade, term, unlockedCourseId: null, unlockedLessonId: null, unlockedUnitOrder: 0, note: 'مقفل بالكامل' };
      } else {
        const course = courses.find((c) => c.id === gateCourseId);
        payload = { grade, term, unlockedCourseId: gateCourseId || null, unlockedLessonId: gateLessonId || null, unlockedUnitOrder: course ? course.sort_order : 99, note: gateNote };
      }
      const res = await jsonFetch('/api/teacher/gates', { method: 'PATCH', body: payload });
      setGateMsg(res.message || 'تم الحفظ!');
      loadGates();
    } catch (e: any) { setGateMsg(e?.message || 'تعذر الحفظ'); } finally { setSavingGate(false); }
  };

  // قوائم مفلترة حسب القسم — بعد كل تعريفات الحالة لتفادي خطأ التهيئة
  const matchSection = (s?: string) => sectionFilter === 'الجميع' || (s || 'الجميع') === sectionFilter;
  const activeTabList: any[] = tab === 'units' ? courses : tab === 'exams' ? exams : tab === 'assignments' ? hwItems : tab === 'notes' ? notes : [];
  const sectionCount = (s: string) => s === 'الجميع' ? activeTabList.length : activeTabList.filter((x) => (x.section || 'الجميع') === s).length;
  const shownCourses = courses.filter((c) => matchSection(c.section));
  const shownExams = exams.filter((e) => matchSection(e.section));
  const visibleExams = shownExams.filter((e) => {
    const q = examSearch.trim();
    if (!q) return true;
    return (e.title + ' ' + (e.unitTitle || '') + ' ' + (e.lessonTitle || '')).includes(q);
  });
  const shownHw = hwItems.filter((h) => matchSection(h.section));
  const shownNotes = notes.filter((n) => matchSection(n.section));

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow={hero?.eyebrow || 'مكتبة المنهاج الكاملة'}
        title={hero?.title || 'إدارة المنهاج والوحدات'}
        body={hero?.body || 'الوحدات بأغلفتها والدروس بصورها وملفات HTML، وبوابة «آخر ما وصلنا» التي تحدد ما يراه الطلاب.'}
        tone="light"
        action={
          tab === 'units' ? (
            <Button onClick={openUnitCreate} data-testid="button-add-content"><Plus size={17} /> إضافة وحدة جديدة</Button>
          ) : tab === 'exams' ? (
            <Button onClick={openExamCreate} data-testid="button-add-exam"><Plus size={17} /> إنشاء اختبار جديد</Button>
          ) : tab === 'assignments' ? (
            <Button onClick={openHwCreate} data-testid="button-add-hw"><Plus size={17} /> إضافة واجب جديد</Button>
          ) : tab === 'notes' ? (
            <Button onClick={openNoteCreate} data-testid="button-add-note"><Plus size={17} /> نشر إعلان جديد</Button>
          ) : undefined
        }
      />

      {msg ? <p className="mb-4 rounded-xl bg-accent/20 px-4 py-3 text-sm font-bold text-accent-foreground">{msg}</p> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs shadow-sm">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary"><ImagePlus size={17} /></span>
        <span className="font-bold text-primary">التخزين السحابي للصور والملفات:</span>
        {storage ? (
          <>
            <span className="font-semibold text-muted-foreground">{storage.configured || 0} حسابات مهيأة (≈{(storage.configured || 0) * 3}GB)</span>
            {storage.activeAccountId ? <span className="rounded-full bg-green-500/15 px-2.5 py-1 font-bold text-green-800">النشط الآن: {storage.activeAccountId} ✓</span> : null}
            <span className="text-muted-foreground">· التناوب تلقائي عند امتلاء حساب · النص فقط في Supabase</span>
          </>
        ) : (
          <span className="font-semibold text-destructive">غير مهيأ — أضف مفاتيح IMAGEKIT_* في .env (السيرفر) ثم أعد التشغيل</span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {GRADES.map((g) => (
          <button key={g} type="button" onClick={() => { setGrade(g); setSelectedCourseId(null); setLessons([]); setSectionFilter('الجميع'); }} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${grade === g ? 'bg-primary text-primary-foreground shadow-sm' : 'border border-border bg-card text-muted-foreground hover:text-primary'}`} data-testid={`button-grade-${g}`}>{g}</button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow-sm" title="الفصل المعتمد من الإعدادات">
          <BookOpen size={16} /> {term}
        </span>
        {gradeSplit && tab !== 'gates' && (
          <>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <span className="text-xs font-extrabold text-[#6a1b9a]">القسم:</span>
            {[
              { id: 'الجميع', label: 'الكل', cls: 'bg-primary text-primary-foreground shadow-sm', idle: 'border border-border bg-card text-muted-foreground hover:text-primary' },
              { id: 'طالب', label: 'الطلاب', cls: 'bg-gradient-to-l from-[#17413f] to-[#2a7a72] text-white shadow-md', idle: 'border border-[#17413f]/30 bg-card text-[#17413f] hover:bg-[#17413f]/10' },
              { id: 'طالبة', label: 'الطالبات', cls: 'bg-gradient-to-l from-[#6a1b9a] to-[#b06ab3] text-white shadow-md', idle: 'border border-[#6a1b9a]/30 bg-card text-[#6a1b9a] hover:bg-[#6a1b9a]/10' },
            ].map((s) => (
              <button key={s.id} type="button" onClick={() => setSectionFilter(s.id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${sectionFilter === s.id ? s.cls : s.idle}`} data-testid={`button-section-${s.id}`}>
                {s.label} <span className="mr-1 font-mono text-xs opacity-75">({sectionCount(s.id)})</span>
              </button>
            ))}
          </>
        )}
      </div>

      {!onlyTab && (
      <div className="mb-6 flex gap-1.5 overflow-auto rounded-2xl bg-muted p-1.5 shadow-inner sm:w-fit">
        {[
          { id: 'units' as ManagerTab, label: 'الوحدات والدروس', count: courses.length },
          { id: 'gates' as ManagerTab, label: 'آخر ما وصلنا (تحكم الطلاب)', count: undefined },
        ].filter((t) => visibleTabIds.includes(t.id)).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${tab === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-primary'}`} data-testid={`button-content-tab-${t.id}`}>
            {t.label} {t.count !== undefined ? <span className="mr-1.5 font-mono text-xs opacity-75">({t.count})</span> : null}
          </button>
        ))}
      </div>
      )}

      {tab === 'units' && (
        <>
          {loadingCourses ? <StateNotice type="loading" /> : !shownCourses.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="font-semibold">{sectionFilter !== 'الجميع' ? `لا توجد وحدات لقسم ${sectionFilter === 'طالب' ? 'الطلاب' : 'الطالبات'} في ${grade}` : `لا توجد وحدات بعد في ${grade} · ${term}`}</p>
              <p className="mt-1 text-sm text-muted-foreground">اضغط «إضافة وحدة جديدة» لبناء الوحدة الأولى بغلافها ودروسها.</p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {shownCourses.map((course) => {
                const active = selectedCourseId === course.id;
                return (
                  <div key={course.id} className={`overflow-hidden rounded-3xl border bg-card shadow-sm transition-all ${active ? 'border-accent ring-4 ring-accent/20' : 'border-border'}`} data-testid={`row-content-${course.id}`}>
                    <div className="flex gap-4 p-4">
                      {course.coverUrl ? (
                        <img src={course.coverUrl} alt="" className="h-24 w-20 shrink-0 rounded-2xl border border-border object-cover" />
                      ) : (
                        <span className="grid h-24 w-20 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ backgroundColor: course.color }}><BookOpen size={26} /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-base font-bold text-primary">{course.title}</p>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${course.status === 'empty' ? 'bg-muted text-muted-foreground' : course.isLocked || !course.isVisible ? 'bg-destructive/10 text-destructive' : 'bg-green-100 text-green-800'}`}>
                            {statusLabel(course.status, course.isEmpty)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{course.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                          <span>ترتيب {course.sort_order}</span>·<span>{course.lessons} دروس</span>·<span>{course.duration || 'بدون مدة'}</span>
                          {course.section && course.section !== 'الجميع' ? <span className="rounded-full bg-[#6a1b9a]/15 px-2 py-0.5 font-bold text-[#6a1b9a]">{course.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}
                          {course.avatarUrl ? <span className="text-green-700">· يوجد أفاتار</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/30 px-4 py-3">
                      <Button onClick={() => { if (active) { setSelectedCourseId(null); setLessons([]); } else { setSelectedCourseId(course.id); loadLessons(course.id); } }} variant={active ? 'primary' : 'soft'} className="px-3.5 py-2 text-xs" data-testid={`button-lessons-${course.id}`}>
                        <Library size={14} /> {active ? 'إخفاء الدروس' : `الدروس (${course.lessons})`}
                      </Button>
                      <button type="button" onClick={() => quickToggleCourse(course, { isLocked: !course.isLocked })} title={course.isLocked ? 'فتح الوحدة' : 'قفل الوحدة'} className={`rounded-lg p-2 transition-colors ${course.isLocked ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:bg-muted'}`} data-testid={`button-lock-${course.id}`}>
                        {course.isLocked ? <Lock size={16} /> : <LockOpen size={16} />}
                      </button>
                      <button type="button" onClick={() => quickToggleCourse(course, { isVisible: !course.isVisible })} title={course.isVisible ? 'إخفاء عن الطلاب' : 'إظهار للطلاب'} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted" data-testid={`button-visible-${course.id}`}>
                        {course.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <span className="mr-auto flex items-center gap-1">
                        <Button onClick={() => openUnitEdit(course)} variant="ghost" className="px-2" data-testid={`button-edit-content-${course.id}`}><Pencil size={16} /></Button>
                        <Button onClick={() => deleteUnit(course)} variant="ghost" className="px-2 text-destructive" data-testid={`button-delete-${course.id}`}><Trash2 size={16} /></Button>
                      </span>
                    </div>
                    {active && (
                      <div className="border-t border-border bg-background p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-bold text-primary">دروس {course.title} ({lessons.length})</p>
                          <Button onClick={() => openLessonCreate(course.id)} variant="outline" className="shrink-0 px-3 py-1.5 text-xs" data-testid="button-add-lesson"><Plus size={14} /> إضافة درس</Button>
                        </div>
                        {loadingLessons ? <StateNotice type="loading" /> : !lessons.length ? (
                          <p className="rounded-xl bg-secondary/50 px-4 py-5 text-center text-xs text-muted-foreground">الوحدة فارغة — أضف الدرس الأول (مطالعة/قواعد/بلاغة...) بزر «إضافة درس».</p>
                        ) : (
                          <div className="grid gap-2 xl:grid-cols-2">
                            {lessons.map((lesson) => {
                              const TypeIcon = lessonTypeIcon(lesson.lessonType);
                              return (
                                <div key={lesson.id} title={lesson.description || lesson.title} className="group flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary font-display text-xs font-extrabold text-primary-foreground">{lesson.position}</span>
                                  {lesson.coverUrl ? <img src={lesson.coverUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><TypeIcon size={15} /></span>}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-extrabold leading-5 text-primary">{lesson.title || 'بدون عنوان'}</p>
                                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                      <span className="rounded bg-secondary px-1.5 py-px font-bold text-primary">{lesson.lessonType}</span>
                                      {lesson.isLocked ? <span className="font-bold text-destructive">🔒</span> : null}
                                      {!lesson.isVisible ? <span className="font-bold text-destructive">مخفي</span> : null}
                                      {lesson.images?.length ? <span>· {lesson.images.length}📷</span> : null}
                                      {lesson.htmlContent || lesson.htmlFileUrl ? <span>· HTML</span> : null}
                                    </p>
                                  </div>
                                  <span className="flex shrink-0 items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                                    <button type="button" onClick={() => setPreviewLesson(lesson)} title="معاينة كما يراها الطالب" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"><Eye size={14} /></button>
                                    <button type="button" onClick={() => openLessonEdit(lesson)} title="تعديل الدرس" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"><Pencil size={14} /></button>
                                    <button type="button" onClick={() => deleteLesson(lesson)} title="حذف الدرس" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'exams' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <div className="flex min-w-52 flex-1 items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm">
              <Search size={17} className="shrink-0 text-muted-foreground" />
              <input value={examSearch} onChange={(e) => setExamSearch(e.target.value)} placeholder="ابحث بعنوان الاختبار أو الوحدة أو الدرس..." className="w-full bg-transparent text-sm outline-none" data-testid="input-search-exams" />
              {examSearch ? <button type="button" onClick={() => setExamSearch('')} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X size={14} /></button> : null}
            </div>
            <span className="rounded-xl bg-secondary px-3.5 py-2.5 text-xs font-extrabold text-primary">{visibleExams.length} اختبارات</span>
          </div>
          {loadingExams ? <StateNotice type="loading" /> : !visibleExams.length ? (
            <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#0d47a1] to-[#3f7dc2] text-white shadow-lg"><Target size={24} /></span>
              <p className="font-display text-lg font-bold text-primary">{examSearch ? 'لا نتائج مطابقة لبحثك' : `لا توجد اختبارات بعد في ${grade}`}</p>
              <p className="mt-1 text-sm text-muted-foreground">{examSearch ? 'جرّب كلمة أخرى أو امسح البحث.' : 'اضغط «إنشاء اختبار جديد» — العنوان والمدة يُعبّآن تلقائياً بالذكاء.'}</p>
              {!examSearch ? <Button onClick={openExamCreate} variant="soft" className="mt-4"><Plus size={16} /> إنشاء أول اختبار</Button> : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleExams.map((exam, ei) => (
                <div key={exam.id} className="group relative overflow-hidden rounded-[1.8rem] border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-fade-up" style={{ animationDelay: `${Math.min(ei, 6) * 0.06}s` }} data-testid={`row-exam-${exam.id}`}>
                  <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-accent/15 blur-2xl transition-opacity group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#0d47a1] to-[#3f7dc2] p-3 text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"><Target size={22} /></span>
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-bold text-primary">{exam.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{exam.duration} · {exam.date || 'متاح الآن'}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold ${exam.published ? 'bg-green-500/15 text-green-800' : 'bg-muted text-muted-foreground'}`}>{exam.published ? '● منشور' : 'مسودة'}</span>
                  </div>
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {[
                      { label: exam.grade || grade, icon: GraduationCap },
                      { label: exam.term || term, icon: BookOpen },
                    ].map((chip, ci) => (
                      <span key={ci} className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-bold text-primary"><chip.icon size={12} /> {chip.label}</span>
                    ))}
                    {exam.unitTitle ? <span className="inline-flex items-center gap-1 rounded-lg bg-accent/20 px-2.5 py-1 text-[11px] font-bold text-accent-foreground"><Library size={12} /> {exam.unitTitle}</span> : null}
                    {exam.lessonTitle ? <span className="inline-flex items-center gap-1 rounded-lg bg-[#6a1b9a]/10 px-2.5 py-1 text-[11px] font-bold text-[#6a1b9a]"><BookCopy size={12} /> {exam.lessonTitle}</span> : null}
                    {exam.section && exam.section !== 'الجميع' ? <span className="rounded-lg bg-[#6a1b9a]/15 px-2.5 py-1 text-[11px] font-extrabold text-[#6a1b9a]">{exam.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}
                  </div>
                  <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4">
                    <span className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-extrabold text-primary"><HelpCircle size={14} /> {exam.questions} أسئلة</span>
                    <span className="mr-auto flex items-center gap-1.5">
                      <Button onClick={() => openExamDetail(exam)} variant="primary" className="px-4 py-2 text-xs shadow-sm">إدارة الأسئلة <ArrowLeft size={14} /></Button>
                      <Button onClick={() => deleteExam(exam)} variant="ghost" className="px-2 text-destructive" title="حذف الاختبار"><Trash2 size={16} /></Button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'assignments' && (
        <>
          {loadingHw ? <StateNotice type="loading" /> : !shownHw.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="font-semibold">لا توجد واجبات بعد في {grade}</p>
              <p className="mt-1 text-sm text-muted-foreground">اضغط «إضافة واجب جديد» — ويمكن توجيهه لقسم الطلاب أو الطالبات إن كان الصف مقسّماً.</p>
              <Button onClick={openHwCreate} variant="soft" className="mt-4"><Plus size={16} /> إضافة أول واجب</Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {shownHw.map((hw) => (
                <div key={hw.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid={`row-hw-${hw.id}`}>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><ClipboardCheck size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-bold text-primary">{hw.title}</p>
                      {hw.section && hw.section !== 'الجميع' ? <span className="rounded-full bg-[#6a1b9a]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#6a1b9a]">{hw.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}
                      {!hw.published ? <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">مسودة</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{hw.unit || 'عام'} {hw.dueDate ? `· حتى ${hw.dueDate}` : ''} · {hw.points} نقاط</p>
                  </div>
                  <Button onClick={() => openHwEdit(hw)} variant="soft" className="px-3 py-2 text-xs"><Pencil size={14} /></Button>
                  <Button onClick={() => deleteHw(hw)} variant="ghost" className="px-2 text-destructive"><Trash2 size={16} /></Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'notes' && (
        <>
          {loadingNotes ? <StateNotice type="loading" /> : !shownNotes.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="font-semibold">لا توجد إعلانات منشورة بعد</p>
              <p className="mt-1 text-sm text-muted-foreground">انشر أول إعلان لطلابك — يمكن توجيهه لصف معين أو للجميع.</p>
              <Button onClick={openNoteCreate} variant="soft" className="mt-4"><Plus size={16} /> نشر أول إعلان</Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {shownNotes.map((note) => (
                <div key={note.id} className={`flex items-start gap-4 rounded-2xl border bg-card p-4 shadow-sm ${note.published ? 'border-border' : 'border-dashed opacity-70'}`} data-testid={`row-note-${note.id}`}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Bell size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-primary">{note.title}</p>
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{note.type}</span>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{note.grade || 'الجميع'}</span>
                      {note.section && note.section !== 'الجميع' ? <span className="rounded-full bg-[#6a1b9a]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#6a1b9a]">{note.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}
                      {!note.published ? <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[11px] font-bold text-destructive">مسودة</span> : null}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{note.body}</p>
                    <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{note.date} · {note.audience}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => toggleNotePublish(note)} title={note.published ? 'سحب النشر' : 'نشر'} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary">{note.published ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                    <button type="button" onClick={() => deleteNote(note)} title="حذف الإعلان" className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={15} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'gates' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-accent/40 bg-gradient-to-b from-accent/15 to-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><ShieldCheck size={22} /></span>
              <div>
                <h3 className="text-lg font-bold text-primary">آخر ما وصلنا — {grade} · {term}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">الطلاب يرون فقط الوحدات والدروس حتى هذه النقطة، والباقي مقفل.</p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <Field2 label="آخر وحدة وصلها الطلاب">
                <select value={gateCourseId} onChange={(e) => { setGateCourseId(e.target.value); setGateLessonId(''); if (e.target.value) loadLessons(e.target.value); }} className={inputCls} data-testid="select-gate-course">
                  <option value="">الكل مفتوح — كل الوحدات ظاهرة</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>حتى الوحدة {c.sort_order}: {c.title}</option>)}
                </select>
              </Field2>
              {gateCourseId ? (
                <Field2 label="آخر درس داخل هذه الوحدة (اختياري)">
                  <select value={gateLessonId} onChange={(e) => setGateLessonId(e.target.value)} className={inputCls} data-testid="select-gate-lesson">
                    <option value="">كل دروس الوحدة مفتوحة</option>
                    {(selectedCourseId === gateCourseId ? lessons : []).map((l: any) => <option key={l.id} value={l.id}>حتى الدرس {l.position}: {l.title}</option>)}
                  </select>
                </Field2>
              ) : null}
              <Field2 label="ملاحظة للمعلم (خاصة — لا يراها الطلاب)">
                <input value={gateNote} onChange={(e) => setGateNote(e.target.value)} placeholder="مثال: توقفنا عند الحال (2) قبل الامتحان" className={inputCls} data-testid="input-gate-note" />
              </Field2>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveGate()} disabled={savingGate} data-testid="button-save-gate"><Save size={16} /> {savingGate ? 'جارٍ الحفظ...' : 'حفظ نقطة الوصول'}</Button>
                <Button onClick={() => saveGate('open')} variant="soft" className="text-xs">فتح الكل</Button>
                <Button onClick={() => saveGate('lock')} variant="ghost" className="text-xs text-destructive">قفل الكل</Button>
              </div>
              {gateMsg ? <p className="rounded-xl bg-accent/20 px-4 py-2.5 text-sm font-bold text-accent-foreground">{gateMsg}</p> : null}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <h3 className="text-lg font-bold text-primary">الوضع الحالي للطلاب</h3>
            {currentGate?.unlockedCourseId || (currentGate && currentGate.unlockedUnitOrder < 99) ? (
              <div className="mt-4 space-y-2">
                {courses.map((c) => {
                  const open = currentGate.unlockedCourseId
                    ? courses.find((x: any) => x.id === currentGate.unlockedCourseId)?.sort_order >= c.sort_order
                    : c.sort_order <= (currentGate.unlockedUnitOrder ?? 99);
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
                      <span className={`grid h-8 w-8 place-items-center rounded-lg ${open ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>{open ? <Check size={15} /> : <Lock size={14} />}</span>
                      <span className={`flex-1 truncate font-semibold ${open ? 'text-primary' : 'text-muted-foreground'}`}>{c.sort_order}. {c.title}</span>
                      <span className="text-xs font-bold text-muted-foreground">{open ? 'ظاهر' : 'مقفل'}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-800">كل الوحدات مفتوحة حالياً لطلاب {grade} · {term}.</p>
            )}
          </div>
        </div>
      )}

      {/* ---------- نافذة الوحدة (عريضة + معاينة حية) ---------- */}
      {unitModal && (
        <Modal title={unitModal.mode === 'create' ? 'إضافة وحدة جديدة' : 'تعديل الوحدة'} eyebrow={`${grade} · ${term}`} onClose={() => setUnitModal(null)} maxWidth="max-w-5xl">
          <form onSubmit={saveUnit} className="space-y-5">
            {/* معاينة حية كما يراها الطالب */}
            <div className="relative overflow-hidden rounded-3xl shadow-lg" style={{ background: `linear-gradient(135deg, ${unitForm.color || '#2e7d32'}, ${(unitForm.color || '#2e7d32')}cc)` }}>
              {unitForm.coverUrl ? <img src={unitForm.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="pointer-events-none absolute -left-4 -top-10 select-none font-display text-[7rem] leading-none text-white/15">ض</span>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="relative flex items-center gap-4 p-5">
                {unitForm.avatarUrl ? (
                  <img src={unitForm.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl border-2 border-white/70 object-cover shadow-xl" />
                ) : (
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/20 text-white shadow-xl backdrop-blur-sm">
                    {(() => { const I = UNIT_ICONS[unitForm.icon] || BookOpen; return <I size={28} />; })()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-extrabold text-white">{unitForm.title || 'عنوان الوحدة...'}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/85">
                    <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">ترتيب {unitForm.sortOrder || 1}</span>
                    <span>{unitForm.duration || 'بدون مدة'}</span>
                    <span className="rounded-lg bg-accent px-2 py-0.5 text-[#3a2c07]">{unitForm.status === 'empty' ? 'قريباً' : unitForm.isLocked ? 'مقفلة' : 'مفتوحة'}</span>
                  </p>
                </div>
              </div>
              <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md">👁 معاينة حية</span>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
              {/* العمود الرئيسي: البيانات */}
              <div className="space-y-4 rounded-3xl border border-border bg-background/50 p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><FileText size={16} /> بيانات الوحدة</p>
                <Field2 label="عنوان الوحدة"><input value={unitForm.title || ''} onChange={(e) => setUnitForm({ ...unitForm, title: e.target.value })} required placeholder="مثال: الوحدة العاشرة: ..." className={inputCls} data-testid="input-unit-title" /></Field2>
                <Field2 label="وصف الوحدة (الدروس والموضوعات)"><textarea value={unitForm.description || ''} onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })} rows={3} className={`${inputCls} resize-none leading-6`} /></Field2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field2 label="الترتيب"><input type="number" min={1} value={unitForm.sortOrder || 1} onChange={(e) => setUnitForm({ ...unitForm, sortOrder: Number(e.target.value) })} className={inputCls} /></Field2>
                  <Field2 label="المدة المقدرة"><input value={unitForm.duration || ''} onChange={(e) => setUnitForm({ ...unitForm, duration: e.target.value })} placeholder="مثال: 4 ساعات" className={inputCls} /></Field2>
                </div>
                <Field2 label="أيقونة الوحدة">
                  <div className="grid grid-cols-7 gap-1.5">
                    {Object.entries(UNIT_ICONS).map(([key, Icon]) => (
                      <button key={key} type="button" onClick={() => setUnitForm({ ...unitForm, icon: key })} title={key} className={`grid aspect-square place-items-center rounded-xl transition-all ${unitForm.icon === key ? 'scale-105 bg-primary text-primary-foreground shadow-md' : 'bg-secondary text-primary hover:bg-accent/40'}`}>
                        <Icon size={18} />
                      </button>
                    ))}
                  </div>
                </Field2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field2 label="الحالة">
                    <select value={unitForm.status || 'published'} onChange={(e) => setUnitForm({ ...unitForm, status: e.target.value })} className={inputCls}>
                      {UNIT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </Field2>
                  <div className="flex items-end gap-4 pb-1">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={!!unitForm.isLocked} onChange={(e) => setUnitForm({ ...unitForm, isLocked: e.target.checked })} className="accent-primary" /> 🔒 مقفلة</label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-sm font-semibold"><input type="checkbox" checked={unitForm.isVisible !== false} onChange={(e) => setUnitForm({ ...unitForm, isVisible: e.target.checked })} className="accent-primary" /> 👁 ظاهرة</label>
                  </div>
                </div>
                {gradeSplit ? <SectionField value={unitForm.section || 'الجميع'} onChange={(v) => setUnitForm({ ...unitForm, section: v })} /> : <p className="rounded-xl bg-secondary/50 px-4 py-2.5 text-xs text-muted-foreground">هذا الصف غير مقسّم — الوحدة ستظهر للطلاب والطالبات معاً.</p>}
              </div>

              {/* العمود الجانبي: المظهر */}
              <div className="space-y-4 rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-card p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><ImagePlus size={16} /> المظهر والأغلفة</p>
                <Field2 label="لون الوحدة">
                  <div className="grid grid-cols-5 gap-2">
                    {UNIT_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setUnitForm({ ...unitForm, color: c })} className={`aspect-square rounded-xl border-[3px] transition-all hover:scale-105 ${unitForm.color === c ? 'scale-105 border-primary shadow-lg' : 'border-white/60'}`} style={{ backgroundColor: c }} aria-label={c} />
                    ))}
                  </div>
                </Field2>
                <ImageUrlField label="صورة الغلاف (تظهر للطلاب)" value={unitForm.coverUrl || ''} onChange={(v) => setUnitForm({ ...unitForm, coverUrl: v })} testId="input-unit-cover" />
                <ImageUrlField label="الأفاتار (أيقونة مصغرة)" value={unitForm.avatarUrl || ''} onChange={(v) => setUnitForm({ ...unitForm, avatarUrl: v })} testId="input-unit-avatar" folder="/ard-al-lughah/avatars" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button onClick={() => setUnitModal(null)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={savingUnit} variant="primary" className="px-8 py-3 shadow-md" data-testid="button-save-unit">{savingUnit ? 'جارٍ الحفظ...' : 'حفظ الوحدة ✓'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- نافذة الدرس (عريضة + معاينة حية) ---------- */}
      {lessonModal && (
        <Modal title={lessonModal.mode === 'create' ? 'إضافة درس جديد' : 'تعديل الدرس'} eyebrow={selectedCourse?.title || grade} onClose={() => setLessonModal(null)} maxWidth="max-w-6xl">
          <form onSubmit={saveLesson} className="space-y-5">
            {/* معاينة حية */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0d2926] via-[#17413f] to-[#25655f] shadow-lg">
              {lessonForm.coverUrl ? <img src={lessonForm.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="pointer-events-none absolute -left-4 -top-10 select-none font-display text-[7rem] leading-none text-white/10">ض</span>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <div className="relative flex items-center gap-4 p-5">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/20 text-white shadow-xl backdrop-blur-sm">
                  {(() => { const I = lessonTypeIcon(lessonForm.lessonType || 'مطالعة'); return <I size={28} />; })()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-extrabold text-white">{lessonForm.title || 'عنوان الدرس...'}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-white/85">
                    <span className="rounded-lg bg-accent px-2 py-0.5 text-[#3a2c07]">{lessonForm.lessonType || 'مطالعة'}</span>
                    <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">ترتيب {lessonForm.position || 1}</span>
                    {lessonImages.length ? <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">{lessonImages.length} صور</span> : null}
                    {(lessonForm.htmlContent || lessonForm.htmlFileUrl) ? <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">تفاعلي HTML</span> : null}
                    {lessonForm.examId ? <span className="rounded-lg bg-green-500/80 px-2 py-0.5 text-white">+ اختبار مرتبط</span> : null}
                  </p>
                </div>
              </div>
              <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md">👁 معاينة حية</span>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
              {/* العمود الرئيسي: المحتوى */}
              <div className="space-y-4 rounded-3xl border border-border bg-background/50 p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><FileText size={16} /> المحتوى التعليمي</p>
                <Field2 label="عنوان الدرس"><input value={lessonForm.title || ''} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} required placeholder="مثال: القواعد: الحال (2)" className={inputCls} data-testid="input-lesson-title" /></Field2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field2 label="نوع الدرس">
                    <select value={lessonForm.lessonType || 'مطالعة'} onChange={(e) => setLessonForm({ ...lessonForm, lessonType: e.target.value })} className={inputCls}>
                      {LESSON_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field2>
                  <Field2 label="الترتيب داخل الوحدة"><input type="number" min={1} value={lessonForm.position || 1} onChange={(e) => setLessonForm({ ...lessonForm, position: Number(e.target.value) })} className={inputCls} /></Field2>
                </div>
                <Field2 label="وصف مختصر"><input value={lessonForm.description || ''} onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })} placeholder="سطر تعريفي يظهر للطالب" className={inputCls} /></Field2>
                <Field2 label="مقدمة الدرس"><textarea value={lessonForm.introduction || ''} onChange={(e) => setLessonForm({ ...lessonForm, introduction: e.target.value })} rows={2} className={`${inputCls} resize-none`} /></Field2>
                <Field2 label="النص المعتمد / الشاهد"><textarea value={lessonForm.mainText || ''} onChange={(e) => setLessonForm({ ...lessonForm, mainText: e.target.value })} rows={3} className={`${inputCls} resize-none font-serif`} /></Field2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field2 label="القاعدة اللغوية"><textarea value={lessonForm.grammarRule || ''} onChange={(e) => setLessonForm({ ...lessonForm, grammarRule: e.target.value })} rows={2} className={`${inputCls} resize-none`} /></Field2>
                  <Field2 label="خلاصة الدرس"><textarea value={lessonForm.summary || ''} onChange={(e) => setLessonForm({ ...lessonForm, summary: e.target.value })} rows={2} className={`${inputCls} resize-none`} /></Field2>
                </div>
                <div className="rounded-2xl border-2 border-dashed border-accent/50 bg-gradient-to-b from-accent/10 to-card p-4">
                  <Field2 label="🎯 اختبار هذا الدرس (يظهر للطالب زر «اختبر نفسك» بعد إنهاء الدرس)">
                    <select value={lessonForm.examId || ''} onChange={(e) => setLessonForm({ ...lessonForm, examId: e.target.value })} className={inputCls} data-testid="select-lesson-exam">
                      <option value="">بدون اختبار مرتبط</option>
                      {exams.map((e: any) => <option key={e.id} value={e.id}>{e.title} ({e.questions} أسئلة)</option>)}
                    </select>
                  </Field2>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">اختر اختباراً من {grade} ليُفتح داخل الدرس مباشرة بعد المحتوى.</p>
                </div>
              </div>

              {/* العمود الجانبي: الوسائط والنشر */}
              <div className="space-y-4 rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-card p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><ImagePlus size={16} /> الوسائط والنشر</p>
                <ImageUrlField label="صورة غلاف الدرس" value={lessonForm.coverUrl || ''} onChange={(v) => setLessonForm({ ...lessonForm, coverUrl: v })} testId="input-lesson-cover" folder="/ard-al-lughah/lessons" />
                <div className="rounded-2xl border border-dashed border-border p-4">
                  <p className="mb-3 text-sm font-semibold">صور داخل الدرس ({lessonImages.length})</p>
                  {lessonImages.length ? (
                    <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {lessonImages.map((src, i) => (
                        <div key={i} className="group relative overflow-hidden rounded-xl border border-border">
                          <img src={src} alt={`صورة ${i + 1}`} className="h-20 w-full object-cover" />
                          <button type="button" onClick={() => setLessonImages((imgs) => imgs.filter((_, x) => x !== i))} className="absolute left-1 top-1 rounded-lg bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"><X size={13} /></button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {imagesErr ? <p className="mb-2 text-xs font-bold text-destructive">{imagesErr}</p> : null}
                  {lessonImages.length && lessonImages.some(isCloudUrl) ? <p className="mb-2 text-[11px] font-bold text-green-800">✓ الصور المرفوعة مخزّنة سحابياً ولا تُثقل قاعدة البيانات</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="الصق رابط صورة ثم اضغط إضافة" dir="ltr" className={`${inputCls} font-mono text-xs`} />
                    <Button type="button" onClick={() => { if (newImageUrl.trim()) { setLessonImages((imgs) => [...imgs, newImageUrl.trim()]); setNewImageUrl(''); } }} variant="soft" className="px-3 py-2 text-xs"><Plus size={14} /> إضافة الرابط</Button>
                    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary hover:bg-accent/40 ${uploadingImages ? 'opacity-60' : ''}`}>
                      {uploadingImages ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} {uploadingImages ? `جارٍ الرفع سحابياً (${uploadingImages})...` : 'رفع من الجهاز'}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const target = e.target;
                        if (!files.length || uploadingImages) return;
                        setImagesErr('');
                        setUploadingImages(files.length);
                        (async () => {
                          for (const f of files) {
                            try {
                              const res = await uploadFileToCloud(f, '/ard-al-lughah/lessons');
                              if (res?.url) setLessonImages((imgs) => [...imgs, res.url]);
                            } catch (err: any) {
                              setImagesErr(err?.message || 'تعذر رفع صورة');
                            } finally {
                              setUploadingImages((n) => Math.max(n - 1, 0));
                            }
                          }
                          target.value = '';
                        })();
                      }} />
                    </label>
                  </div>
                </div>
              </div>
              </div>
              <div className="rounded-3xl border border-border bg-background/50 p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-extrabold text-primary"><FileCode2 size={16} /> ملف / محتوى HTML للدرس</p>
                <div className="rounded-2xl border border-border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">الكود والمرفقات</p>
                    <div className="flex items-center gap-2">
                      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-primary hover:bg-accent/40 ${uploadingHtml ? 'opacity-60' : ''}`} title="يُرفع كنص (.txt) على ImageKit فيُعرض بدون خطأ 403 وبدون استهلاك Supabase">
                        {uploadingHtml ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} {uploadingHtml ? 'جارٍ الرفع سحابياً...' : 'ارفع ملف HTML'}
                        <input type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => {
                          const f = e.target.files?.[0];
                          const target = e.target;
                          if (!f || uploadingHtml) return;
                          setUploadingHtml(true);
                          readTextFile(f)
                            .then((text) => {
                              // ترميز المحتوى base64 حتى لا يفحصه ImageKit ويرفضه (403) — يُفك الترميز عند العرض
                              const encoded = 'ARDB64\n' + btoa(unescape(encodeURIComponent(text)));
                              const txt = new File([encoded], f.name.replace(/\.html?$/i, '') + '.txt', { type: 'text/plain' });
                              return uploadFileToCloud(txt, '/ard-al-lughah/html');
                            })
                            .then((res) => {
                              if (res?.url) setLessonForm((lf: any) => ({ ...lf, htmlFileUrl: res.url }));
                              flash('تم رفع ملف HTML مشفّراً سحابياً ✓ (يعمل دائماً بلا 403 ولا يستهلك Supabase)');
                            })
                            .catch((err: Error) => flash(err?.message || 'تعذر رفع ملف HTML'))
                            .finally(() => { setUploadingHtml(false); target.value = ''; });
                        }} />
                      </label>
                      {(lessonForm.htmlContent || lessonForm.htmlFileUrl) ? (
                        <button type="button" onClick={() => setShowHtmlPreview((v) => !v)} className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-primary">{showHtmlPreview ? 'إخفاء المعاينة' : 'معاينة'}</button>
                      ) : null}
                    </div>
                  </div>
                  <textarea value={lessonForm.htmlContent || ''} onChange={(e) => setLessonForm({ ...lessonForm, htmlContent: e.target.value })} rows={3} dir="ltr" placeholder="<h1>... كود HTML مضمّن (اختياري — يُحفظ كنص) ..." className={`${inputCls} font-mono text-xs`} />
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">ملف HTML يُرمَّز ويُرفع كنص مشفّر على ImageKit — يعمل دائماً بلا 403 وبلا أي استهلاك من Supabase. (الملفات المرفوعة سابقاً بصيغة خام تحتاج إعادة رفع من جهازك).</p>
                  <div className="mt-2 flex items-center gap-2">
                    <input value={lessonForm.htmlFileUrl || ''} onChange={(e) => setLessonForm({ ...lessonForm, htmlFileUrl: e.target.value })} placeholder="رابط خارجي فقط (مثال: Google Sites) — اتركه فارغاً للمحتوى الداخلي" dir="ltr" className={`${inputCls} font-mono text-xs`} data-testid="input-lesson-html-url" />
                  </div>
                  {showHtmlPreview && lessonForm.htmlContent ? <iframe title="معاينة HTML" sandbox="allow-same-origin" srcDoc={lessonForm.htmlContent} className="mt-3 h-64 w-full rounded-xl border border-border bg-white" /> : null}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field2 label="الحالة">
                  <select value={lessonForm.status || 'published'} onChange={(e) => setLessonForm({ ...lessonForm, status: e.target.value })} className={inputCls}>
                    {UNIT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field2>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={!!lessonForm.isLocked} onChange={(e) => setLessonForm({ ...lessonForm, isLocked: e.target.checked })} className="accent-primary" /> 🔒 مقفل</label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={lessonForm.isVisible !== false} onChange={(e) => setLessonForm({ ...lessonForm, isVisible: e.target.checked })} className="accent-primary" /> 👁 ظاهر</label>
              </div>
            <div className="flex items-center justify-end gap-3 pt-3">
              <Button onClick={() => setLessonModal(null)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={savingLesson} variant="primary" data-testid="button-save-lesson">{savingLesson ? 'جارٍ الحفظ...' : 'حفظ الدرس'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- معاينة الدرس كما يراها الطالب ---------- */}
      {previewLesson && (
        <Modal title={previewLesson.title} eyebrow="معاينة الطالب" onClose={() => setPreviewLesson(null)} maxWidth="max-w-3xl">
          <LessonViewerBody lesson={previewLesson} />
        </Modal>
      )}

      {/* ---------- نافذة إنشاء اختبار (عريضة + معاينة) ---------- */}
      {examModal && (
        <Modal title="إنشاء اختبار جديد" eyebrow={`${grade} · ${term}`} onClose={() => setExamModal(false)} maxWidth="max-w-6xl">
          <form onSubmit={saveExam} className="space-y-5">
            {/* معاينة حية */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0d47a1] via-[#1a5cb8] to-[#3f7dc2] shadow-lg">
              <div className="pointer-events-none absolute -left-10 -top-14 select-none font-display text-[7rem] leading-none text-white/10">؟</div>
              <div className="relative flex items-center gap-4 p-5">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/20 text-white shadow-xl backdrop-blur-sm"><Target size={28} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-extrabold text-white">{examForm.title || 'عنوان الاختبار...'}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-white/85">
                    <span className="rounded-lg bg-accent px-2 py-0.5 text-[#3a2c07]">{examQuestions.length + aiDrafts.length} أسئلة</span>
                    <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">{examForm.duration || '20 دقيقة'}</span>
                    <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">{aiLevel}</span>
                    {examForm.section && examForm.section !== 'الجميع' ? <span className="rounded-lg bg-white/90 px-2 py-0.5 text-[#6a1b9a]">{examForm.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}
                  </p>
                </div>
              </div>
              <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md">👁 معاينة حية</span>
            </div>
            <div className="grid gap-4 rounded-3xl border border-border bg-background/50 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field2 label="عنوان الاختبار"><input value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} required placeholder="مثال: اختبار الوحدة الأولى: الحال والتشبيه" className={inputCls} data-testid="input-exam-title" /></Field2></div>
              <div className="sm:col-span-2"><Field2 label="وصف الاختبار"><textarea value={examForm.description} onChange={(e) => setExamForm({ ...examForm, description: e.target.value })} rows={2} className={`${inputCls} resize-none`} /></Field2></div>
              <Field2 label="الوحدة المرتبطة">
                <select value={examForm.courseId} onChange={(e) => setExamForm({ ...examForm, courseId: e.target.value, lessonId: '' })} className={inputCls}>
                  <option value="">بدون ارتباط</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </Field2>
              <Field2 label="المدة (من قائمة جاهزة)">
                <select value={examForm.duration || '20 دقيقة'} onChange={(e) => setExamForm({ ...examForm, duration: e.target.value })} className={inputCls} data-testid="select-exam-duration">
                  {['10 دقائق', '15 دقيقة', '20 دقيقة', '30 دقيقة', '45 دقيقة', '60 دقيقة'].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field2>
              <div className="sm:col-span-2">
                <Field2 label="الدرس المرتبط (يظهر في بطاقة الاختبار ويوجّه الذكاء الاصطناعي)">
                  <select value={examForm.lessonId} onChange={(e) => setExamForm({ ...examForm, lessonId: e.target.value })} className={inputCls} data-testid="select-exam-lesson">
                    <option value="">كل دروس الوحدة</option>
                    {examLessons.map((l: any) => <option key={l.id} value={l.id}>{l.position}. {l.title} ({l.lessonType})</option>)}
                  </select>
                </Field2>
              </div>
            </div>
            {/* لوحة التوليد بالذكاء الاصطناعي */}
            <div className="overflow-hidden rounded-3xl border-2 border-dashed border-accent/60 bg-gradient-to-b from-accent/15 via-card to-card">
              <div className="flex items-center gap-3 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#6a1b9a] to-[#d7b65e] text-white shadow-lg animate-float-slow"><Sparkles size={20} /></span>
                <div>
                  <p className="font-display text-sm font-bold text-primary">ولّد الأسئلة بالذكاء الاصطناعي ✨</p>
                  <p className="text-[11px] text-muted-foreground">اكتب وصفاً (برومبت) وسيبني لك الذكاء أسئلة كاملة: السؤال + 4 خيارات + الإجابة + الشرح — راجعها واعتمدها.</p>
                </div>
              </div>
              <div className="space-y-3 border-t border-accent/25 p-4">
                <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2} placeholder="مثال: اختبار عن الحال وأنواعها — اتركه فارغاً للتوليد التلقائي من الوحدة والدرس" className={`${inputCls} resize-none`} data-testid="input-ai-prompt" />
                <div className="rounded-2xl border border-dashed border-accent/40 bg-background/60 p-3">
                  <p className="mb-2 text-xs font-extrabold text-primary">📥 أو الصق أسئلة جاهزة بنص عادي وستُستخرج تلقائياً:</p>
                  <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3} placeholder={'مثال: ## 1. عاصمة أستراليا | * الخيارات: أ) سيدني | ب) ملبورن | ج) كانبيرا | د) بريزبان | * الجواب الصحيح: ج) كانبيرا | * ملاحظة: ...'} className={`${inputCls} resize-none font-mono text-xs leading-6`} data-testid="input-import-text" />
                  <Button type="button" onClick={importFromText} variant="soft" className="mt-2 w-full py-2 text-xs" data-testid="button-import-parse">📥 استخراج الأسئلة من النص الملصق</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary">✨ عدد الأسئلة تلقائي حسب الدرس</span>
                  <label className="flex items-center gap-1.5 text-xs font-bold">المستوى:
                    <select value={aiLevel} onChange={(e) => setAiLevel(e.target.value)} className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none">
                      {['سهل', 'متوسط', 'صعب'].map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                  <Button type="button" onClick={generateWithAi} disabled={aiLoading} variant="primary" className="mr-auto px-5 py-2 text-xs shadow-md" data-testid="button-ai-generate">
                    {aiLoading ? <><RefreshCw size={14} className="animate-spin" /> الذكاء يكتب الآن...</> : <><Sparkles size={14} /> ولّد الأسئلة</>}
                  </Button>
                </div>
                {aiLoading ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-4 text-xs font-bold text-primary">
                    <RefreshCw size={16} className="animate-spin" /> يكتب الذكاء الاصطناعي أسئلتك... قد يستغرق حتى دقيقة — لا تغلق النافذة.
                  </div>
                ) : null}
                {aiMsg ? <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-xs font-bold text-destructive">{aiMsg}</p> : null}
                {aiDrafts.length ? (
                  <div className="rounded-2xl bg-background/70 p-3 ring-1 ring-accent/30">
                    <div className="mb-2.5 flex items-center justify-between">
                      <p className="text-xs font-extrabold text-primary">الأسئلة الجاهزة ({aiDrafts.length}) — راجع ثم اعتمد:</p>
                      <button type="button" onClick={adoptAllDrafts} className="rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm hover:brightness-110">اعتماد الكل ✓</button>
                    </div>
                    <div className="grid gap-2.5 xl:grid-cols-2">
                    {aiDrafts.map((q, qi) => (
                      <div key={qi} className="rounded-2xl border border-accent/40 bg-card p-3.5 animate-fade-up" style={{ animationDelay: `${qi * 0.08}s` }}>
                        <p className="text-sm font-bold leading-6 text-primary">{qi + 1}. {q.question}</p>
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {q.options.map((opt: string, oi: number) => (
                            <span key={oi} className={`rounded-lg px-2.5 py-1.5 text-xs ${oi === q.correctAnswer ? 'bg-green-500/15 font-extrabold text-green-800 ring-1 ring-green-500/40' : 'bg-secondary/60 text-muted-foreground'}`}>
                              {oi === q.correctAnswer ? '✓ ' : ''}{opt}
                            </span>
                          ))}
                        </div>
                        {q.explanation ? <p className="mt-2 text-[11px] leading-5 text-muted-foreground">💡 {q.explanation}</p> : null}
                        <div className="mt-2.5 flex items-center gap-2">
                          <button type="button" onClick={() => adoptDraft(qi)} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground hover:brightness-110">اعتماد السؤال ✓</button>
                          <button type="button" onClick={() => setAiDrafts((ds) => ds.filter((_, j) => j !== qi))} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10">حذف المسودة</button>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {gradeSplit ? <SectionField value={examForm.section || 'الجميع'} onChange={(v) => setExamForm({ ...examForm, section: v })} /> : <p className="text-xs text-muted-foreground">هذا الصف غير مقسّم — الاختبار سيظهر للجميع.</p>}
            <div className="rounded-3xl border border-border bg-background/50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><HelpCircle size={16} /> الأسئلة اليدوية ({examQuestions.length})</p>
                <Button type="button" onClick={() => setExamQuestions((qs) => [...qs, { question: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' }])} variant="soft" className="px-3 py-1.5 text-xs"><Plus size={14} /> إضافة سؤال</Button>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {examQuestions.map((q, qi) => (
                  <div key={qi} className="rounded-2xl bg-secondary/40 p-4">
                    <div className="flex items-start gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{qi + 1}</span>
                      <textarea value={q.question} onChange={(e) => setExamQuestions((qs) => qs.map((x, j) => j === qi ? { ...x, question: e.target.value } : x))} rows={2} placeholder={`نص السؤال ${qi + 1}...`} className={`${inputCls} resize-none`} data-testid={`input-question-${qi}`} />
                      {examQuestions.length > 1 ? <button type="button" onClick={() => setExamQuestions((qs) => qs.filter((_, j) => j !== qi))} className="rounded-lg p-2 text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button> : null}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt: string, oi: number) => (
                        <label key={oi} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs ${q.correctAnswer === oi ? 'border-green-600 bg-green-500/10' : 'border-border bg-background'}`}>
                          <input type="radio" name={`correct-${qi}`} checked={q.correctAnswer === oi} onChange={() => setExamQuestions((qs) => qs.map((x, j) => j === qi ? { ...x, correctAnswer: oi } : x))} className="accent-green-700" title="الإجابة الصحيحة" />
                          <input value={opt} onChange={(e) => setExamQuestions((qs) => qs.map((x, j) => j === qi ? { ...x, options: x.options.map((o: string, k: number) => k === oi ? e.target.value : o) } : x))} placeholder={`الخيار ${oi + 1}`} className="w-full bg-transparent text-sm outline-none" data-testid={`input-q${qi}-opt${oi}`} />
                        </label>
                      ))}
                    </div>
                    <input value={q.explanation} onChange={(e) => setExamQuestions((qs) => qs.map((x, j) => j === qi ? { ...x, explanation: e.target.value } : x))} placeholder="شرح الإجابة النموذجية (يظهر للطالب بعد التسليم)" className={`${inputCls} mt-2 text-xs`} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button onClick={() => setExamModal(false)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={savingExam} variant="primary" data-testid="button-save-exam">{savingExam ? 'جارٍ الإنشاء...' : 'إنشاء الاختبار'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- إدارة أسئلة اختبار موجود ---------- */}
      {examDetail && (
        <Modal title={examDetail.title} eyebrow={`إدارة الأسئلة · ${examDetail.questions} أسئلة`} onClose={() => setExamDetail(null)} maxWidth="max-w-3xl">
          <div className="space-y-3">
            {examDetailQuestions.map((q, qi) => (
              <div key={q.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-primary">{qi + 1}. {q.question}</p>
                  <button type="button" onClick={() => deleteQuestion(q.id)} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((opt: string, oi: number) => (
                    <span key={oi} className={`rounded-lg px-3 py-1.5 text-xs ${oi === q.correctAnswer ? 'bg-green-500/15 font-bold text-green-800' : 'bg-secondary/50 text-muted-foreground'}`}>{oi === q.correctAnswer ? '✓ ' : ''}{opt}</span>
                  ))}
                </div>
                {q.explanation ? <p className="mt-2 text-xs text-muted-foreground">الشرح: {q.explanation}</p> : null}
              </div>
            ))}
          </div>
          <form onSubmit={addQuestionToExam} className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4">
            <p className="mb-3 text-sm font-bold text-primary">إضافة سؤال جديد للاختبار</p>
            <textarea value={newQ.question} onChange={(e) => setNewQ({ ...newQ, question: e.target.value })} rows={2} placeholder="نص السؤال..." className={`${inputCls} resize-none`} />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {newQ.options.map((opt, oi) => (
                <label key={oi} className={`flex items-center gap-2 rounded-xl border bg-card p-2.5 text-xs ${newQ.correctAnswer === oi ? 'border-green-600' : 'border-border'}`}>
                  <input type="radio" name="new-correct" checked={newQ.correctAnswer === oi} onChange={() => setNewQ({ ...newQ, correctAnswer: oi })} className="accent-green-700" title="الإجابة الصحيحة" />
                  <input value={opt} onChange={(e) => setNewQ({ ...newQ, options: newQ.options.map((o, k) => k === oi ? e.target.value : o) })} placeholder={`الخيار ${oi + 1}`} className="w-full bg-transparent text-sm outline-none" />
                </label>
              ))}
            </div>
            <input value={newQ.explanation} onChange={(e) => setNewQ({ ...newQ, explanation: e.target.value })} placeholder="شرح الإجابة (اختياري)" className={`${inputCls} mt-2 text-xs`} />
            <Button type="submit" variant="primary" className="mt-3 px-5 py-2 text-xs"><Plus size={14} /> إضافة السؤال للاختبار</Button>
          </form>
        </Modal>
      )}

      {/* ---------- نافذة الواجب (عريضة + معاينة) ---------- */}
      {hwModal && (
        <Modal title={hwModal.mode === 'create' ? 'إضافة واجب جديد' : 'تعديل الواجب'} eyebrow={`${grade} · ${term}`} onClose={() => setHwModal(null)} maxWidth="max-w-4xl">
          <form onSubmit={saveHw} className="space-y-5">
            {/* معاينة حية */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0d2926] via-[#17413f] to-[#25655f] shadow-lg">
              <div className="pointer-events-none absolute -left-8 -top-10 select-none font-display text-[6rem] leading-none text-white/10">و</div>
              <div className="relative flex items-center gap-4 p-5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent text-[#3a2c07] shadow-xl"><ClipboardCheck size={26} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-extrabold text-white">{hwForm.title || 'عنوان الواجب...'}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-white/85">
                    <span className="rounded-lg bg-white/15 px-2 py-0.5 backdrop-blur-sm">{hwForm.unit || 'عام'}</span>
                    <span className="rounded-lg bg-white/15 px-2 py-0.5 backdrop-blur-sm">{hwForm.dueDate || 'بلا موعد'}</span>
                    <span className="rounded-lg bg-accent px-2 py-0.5 text-[#3a2c07]">{hwForm.points || 20} نقاط</span>
                  </p>
                </div>
              </div>
              <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md">👁 معاينة حية</span>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
              <div className="space-y-4 rounded-3xl border border-border bg-background/50 p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><ClipboardCheck size={16} /> تفاصيل الواجب</p>
                <Field2 label="عنوان الواجب"><input value={hwForm.title || ''} onChange={(e) => setHwForm({ ...hwForm, title: e.target.value })} required placeholder="مثال: أعرب الجمل التالية" className={inputCls} data-testid="input-hw-title" /></Field2>
                <Field2 label="التعليمات والوصف"><textarea value={hwForm.description || ''} onChange={(e) => setHwForm({ ...hwForm, description: e.target.value })} rows={4} placeholder="اشرح المطلوب بالتفصيل..." className={`${inputCls} resize-none leading-6`} /></Field2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field2 label="الوحدة"><input value={hwForm.unit || ''} onChange={(e) => setHwForm({ ...hwForm, unit: e.target.value })} placeholder="مثال: الوحدة الأولى" className={inputCls} /></Field2>
                  <Field2 label="آخر موعد"><input type="date" value={hwForm.dueDate || ''} onChange={(e) => setHwForm({ ...hwForm, dueDate: e.target.value })} className={inputCls} /></Field2>
                  <Field2 label="النقاط"><input type="number" min={1} value={hwForm.points || 20} onChange={(e) => setHwForm({ ...hwForm, points: Number(e.target.value) })} className={inputCls} /></Field2>
                </div>
              </div>
              <div className="space-y-4 rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-card p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><Settings size={16} /> النشر والاستهداف</p>
                {gradeSplit ? <SectionField value={hwForm.section || 'الجميع'} onChange={(v) => setHwForm({ ...hwForm, section: v })} /> : <p className="rounded-xl bg-secondary/50 px-4 py-2.5 text-xs text-muted-foreground">هذا الصف غير مقسّم — الواجب سيظهر للجميع.</p>}
                <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-3 py-3 text-sm font-semibold"><input type="checkbox" checked={hwForm.published !== false} onChange={(e) => setHwForm({ ...hwForm, published: e.target.checked })} className="accent-primary" /> منشور للطلاب فوراً</label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button onClick={() => setHwModal(null)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={savingHw} variant="primary" className="px-8 py-3 shadow-md" data-testid="button-save-hw">{savingHw ? 'جارٍ الحفظ...' : 'حفظ الواجب ✓'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- نافذة نشر إعلان (عريضة + معاينة) ---------- */}
      {noteModal && (
        <Modal title="نشر إعلان جديد" eyebrow="رسائل المعلم للطلاب" onClose={() => setNoteModal(false)} maxWidth="max-w-4xl">
          <form onSubmit={saveNote} className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
              <div className="space-y-4 rounded-3xl border border-border bg-background/50 p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><Bell size={16} /> نص الإعلان</p>
                <Field2 label="عنوان الإعلان"><input value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} required placeholder="مثال: موعد الاختبار النحوي الأول" className={inputCls} data-testid="input-note-title" /></Field2>
                <Field2 label="نص الإعلان"><textarea value={noteForm.body} onChange={(e) => setNoteForm({ ...noteForm, body: e.target.value })} required rows={5} placeholder="اكتب توجيهك للطلاب..." className={`${inputCls} resize-none leading-7`} data-testid="input-note-body" /></Field2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field2 label="نوع الإعلان">
                    <select value={noteForm.type} onChange={(e) => setNoteForm({ ...noteForm, type: e.target.value })} className={inputCls}>
                      {['إرشاد', 'اختبار تقييمي', 'محتوى جديد', 'تذكير بالتكليف', 'تهنئة'].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field2>
                  <Field2 label="الصف المستهدف">
                    <select value={noteForm.targetGrade} onChange={(e) => setNoteForm({ ...noteForm, targetGrade: e.target.value })} className={inputCls} data-testid="select-note-grade">
                      <option value="الجميع">الجميع — كل الصفوف</option>
                      {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </Field2>
                </div>
                {noteForm.targetGrade && noteForm.targetGrade !== 'الجميع' && splitMap[noteForm.targetGrade] ? (
                  <SectionField value={noteForm.section || 'الجميع'} onChange={(v) => setNoteForm({ ...noteForm, section: v })} />
                ) : (
                  <p className="rounded-xl bg-secondary/50 px-4 py-2.5 text-xs text-muted-foreground">{!noteForm.targetGrade || noteForm.targetGrade === 'الجميع' ? 'الإعلان عام لكل الصفوف — يظهر للجميع.' : 'هذا الصف غير مقسّم — الإعلان سيظهر للجميع.'}</p>
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-3 py-3 text-sm font-semibold"><input type="checkbox" checked={noteForm.published !== false} onChange={(e) => setNoteForm({ ...noteForm, published: e.target.checked })} className="accent-primary" /> نشر فوراً (إلغاؤها تحفظه كمسودة)</label>
              </div>
              <div className="space-y-4">
                <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-card p-5">
                  <p className="mb-3 flex items-center gap-2 text-sm font-extrabold text-primary"><Eye size={16} /> معاينة حية كما يراها الطالب 👁</p>
                  <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-primary text-sm">{noteForm.title || 'عنوان الإعلان...'}</p>
                      <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-primary">{noteForm.type || 'إرشاد'}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-4 text-xs leading-6 text-muted-foreground">{noteForm.body || 'نص الإعلان سيظهر هنا...'}</p>
                    <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                      {noteForm.targetGrade && noteForm.targetGrade !== 'الجميع' ? noteForm.targetGrade : 'كل الصفوف'}
                      {noteForm.section && noteForm.section !== 'الجميع' ? ` · ${noteForm.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}` : ''}
                      {!noteForm.published ? ' · مسودة' : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button onClick={() => setNoteModal(null)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={savingNote} variant="primary" className="px-8 py-3 shadow-md" data-testid="button-save-note">{savingNote ? 'جارٍ النشر...' : 'نشر الإعلان ✓'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

/* =========================================================================
   لوحتا التحكم الجديدتان — تصميم فاخر بنفس الهوية
========================================================================= */

function StudentDashboardNew() {
  const query = useGetStudentDashboard();
  const announcementsQuery = useListAnnouncements();
  const assessmentsQuery = useListAssessments();
  const [gradeNotes, setGradeNotes] = useState<any[] | null>(null);
  const [sumCount, setSumCount] = useState<number | null>(null);
  const [nbPending, setNbPending] = useState<number | null>(null);

  const dashGrade = query.data?.student?.grade;
  const dashId = query.data?.student?.id;
  const dashGender = query.data?.student?.gender;
  const dashSplitMap = useSplitMap();
  const dashSplit = dashSplitMap[dashGrade || ''] === true;
  useEffect(() => {
    if (!dashGrade) return;
    const params = new URLSearchParams({ grade: dashGrade });
    if (dashId) params.set('student_id', dashId);
    jsonFetch(`/api/curriculum/announcements?${params.toString()}`)
      .then((d) => { if (Array.isArray(d) && d.length) setGradeNotes(d); })
      .catch(() => undefined);
    jsonFetch(`/api/curriculum/summaries?grade=${encodeURIComponent(dashGrade)}`)
      .then((d) => { if (Array.isArray(d)) setSumCount(d.length); })
      .catch(() => undefined);
    if (dashId) {
      jsonFetch(`/api/curriculum/notebooks?grade=${encodeURIComponent(dashGrade)}&student_id=${dashId}`)
        .then((d) => { if (Array.isArray(d)) setNbPending(d.filter((t: any) => !t.myStatus).length); })
        .catch(() => undefined);
    }
  }, [dashGrade, dashId]);

  const data = query.data ? { ...query.data, announcements: gradeNotes || (query.data.announcements?.length ? query.data.announcements : announcementsQuery.data ?? []) } : undefined;
  const student = data?.student;
  const firstName = student?.name ? student.name.split(' ')[0] : 'بطلنا';
  const dashOverview = useGetPlatformOverview();
  const dashTerm = (dashOverview.data as any)?.semester || 'الفصل الأول';

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow={`مرحباً بك يا ${firstName} ✨`}
        title="واصل رحلتك مع لغة الضاد"
        body="خطوة جادة اليوم تصنع تفوقك — وحداتك وملخصاتك ودفترك واختباراتك كلها في مكان واحد."
        action={
          <Link href="/student/courses" className="inline-flex items-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-extrabold text-[#3a2c07] shadow-lg shadow-accent/30 transition-all hover:-translate-y-0.5 hover:shadow-xl" data-testid="button-learning-plan">
            <CalendarDays size={17} /> تصفح خطتي الدراسية
          </Link>
        }
        stats={[
          { value: `${data?.progress ?? 0}%`, label: 'التقدم العام' },
          { value: data?.completedLessons ?? 0, label: 'دروس منجزة' },
          { value: data?.nextUp?.length ?? 0, label: 'وحدات متاحة' },
          { value: data?.announcements?.length ?? 0, label: 'رسائل المعلم' },
        ]}
      />
      <GradeTermBadge grade={student?.grade || 'الصف العاشر'} term={dashTerm} split={dashSplit} gender={dashGender} />

      {query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : !data ? <StateNotice type="empty" /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <QuickTile icon={BookOpen} title="وحداتي التعليمية" body="الدروس التي وصلتم إليها مع الأستاذ" href="/student/courses" badge={`${data.nextUp?.length ?? 0} وحدات`} color="#17413f" />
            <QuickTile icon={NotebookText} title="ملخصاتي" body="بطاقات مراجعة وخرائط ذهنية مركزة" href="/student/summaries" badge={sumCount !== null ? `${sumCount} ملخصات` : 'جديد'} color="#8a508f" />
            <QuickTile icon={NotebookPen} title="دفتري" body="صوّر دفترك وسلّمه للأستاذ" href="/student/notebook" badge={nbPending ? `${nbPending} بانتظارك` : 'محدّث'} color="#b7791f" />
            <QuickTile icon={Target} title="اختباراتي" body="قياس فهمك أولاً بأول" href="/student/assessments" badge={`${assessmentsQuery.data?.length ?? 0} اختبارات`} color="#0d47a1" />
          </div>

          {student?.book ? (
            <section className="relative mt-6 overflow-hidden rounded-[2rem] border border-accent/30 bg-gradient-to-l from-[#0d2926] via-[#17413f] to-[#1d5c57] p-6 text-white shadow-xl">
              <div className="pointer-events-none absolute -left-14 -top-14 h-52 w-52 rounded-full bg-accent/25 blur-3xl" />
              <div className="relative grid items-center gap-6 sm:grid-cols-[auto_1fr]">
                <a href={student.book.pdfUrl} target="_blank" rel="noreferrer" className="relative block w-36 shrink-0 overflow-hidden rounded-2xl border-2 border-accent/60 shadow-2xl transition-transform duration-300 hover:-translate-y-1" data-testid="link-my-book-cover">
                  <img src={student.book.coverUrl} alt={student.book.title} className="w-full object-cover" />
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-[#3a2c07] shadow">{student.book.term}</span>
                </a>
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold ring-1 ring-white/15 backdrop-blur-md">
                    <BookOpen size={14} className="text-accent" /> كتابك الخاص وفق صفك الدراسي
                  </div>
                  <h3 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{student.book.title}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-white/75">نسختك الرقمية من مقرر اللغة العربية — افتحها في أي وقت للقراءة والمراجعة قبل الاختبارات.</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <a href={student.book.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-extrabold text-[#3a2c07] shadow-md transition-all hover:brightness-105" data-testid="link-read-my-book"><BookOpen size={17} /> افتح واقرأ الكتاب</a>
                    <a href={student.book.pdfUrl} download className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/20" data-testid="link-download-my-book"><Download size={17} /> تحميل PDF</a>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#0d2926] to-[#1d5c57] p-6 text-white shadow-md sm:p-8">
              <div className="absolute -left-8 -top-16 select-none font-display text-[15rem] leading-none text-white/5">ض</div>
              <div className="relative z-10 flex flex-wrap items-center gap-6">
                <ProgressRing value={data.progress} size={110} />
                <div className="min-w-52 flex-1">
                  <p className="text-sm font-semibold text-white/70">التقدم العام بالمنهاج</p>
                  <p className="mt-1 font-display text-2xl font-bold">{data.progress >= 50 ? 'تقدم ممتاز، استمر!' : 'انطلاقة موفقة يا بطل'}</p>
                  <p className="mt-2 text-xs leading-5 text-white/60">أنجزت {data.completedLessons} دروس حتى الآن — أكمل الوحدات القادمة لتحصل على شهادة التميز.</p>
                  <Link href="/student/courses" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-extrabold text-[#3a2c07] shadow-sm hover:brightness-105" data-testid="link-continue-learning">متابعة الدروس <ArrowLeft size={16} /></Link>
                </div>
              </div>
            </div>
            <AnnouncementPanel announcements={data.announcements} />
          </section>

          <section className="mt-6 rounded-[2rem] border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">أكمل من حيث توقفت</p>
                <h3 className="mt-1 font-display text-xl font-bold text-primary">وحداتك المقترحة</h3>
              </div>
              <Link href="/student/courses" className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-primary hover:bg-accent/40" data-testid="link-all-courses">عرض الكل</Link>
            </div>
            <div className="mt-5 space-y-3">{data.nextUp?.length ? data.nextUp.slice(0, 4).map((course) => <CourseRow key={course.id} course={course} />) : <StateNotice type="empty" />}</div>
          </section>
        </>
      )}
    </Shell>
  );
}

function KpiGradient({ label, value, icon: Icon, from, to, testId }: { label: string; value: string | number; icon: typeof UsersRound; from: string; to: string; testId?: string }) {
  return (
    <div className="relative overflow-hidden rounded-[1.6rem] p-5 text-white shadow-lg transition-transform duration-300 hover:-translate-y-1" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} data-testid={testId}>
      <div className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
      <div className="flex items-start justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 backdrop-blur-sm"><Icon size={20} /></span>
      </div>
      <p className="mt-4 font-display text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-sm font-semibold text-white/80">{label}</p>
    </div>
  );
}

function TeacherDashboardNew() {
  const query = useGetTeacherDashboard();
  const d = query.data;

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow="لوحة المتابعة الإدارية"
        title="مرحباً بالأستاذ أحمد يحيى الأسطل"
        body="نبض منصة أرض اللغة: الطلاب والوحدات والملخصات والدفاتر والاختبارات — كلها تحت عينك."
        action={
          <Link href="/teacher/content" className="inline-flex items-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-sm font-extrabold text-[#3a2c07] shadow-lg shadow-accent/30 transition-all hover:-translate-y-0.5 hover:shadow-xl" data-testid="button-teacher-action">
            <Plus size={17} /> إضافة محتوى جديد
          </Link>
        }
        stats={d ? [
          { value: d.stats.students, label: 'إجمالي الطلبة' },
          { value: d.stats.units, label: 'الوحدات المعتمدة' },
          { value: d.stats.assignments, label: 'الواجبات' },
          { value: `${d.stats.averageScore}%`, label: 'متوسط الاختبارات' },
        ] : undefined}
      />

      {query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : !d ? <StateNotice type="empty" /> : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <KpiGradient label="إجمالي الطلبة" value={d.stats.students} icon={UsersRound} from="#17413f" to="#2a7a72" testId="kpi-students" />
            <KpiGradient label="طلبة نشطون" value={d.stats.activeStudents} icon={TrendingUp} from="#8a6d1f" to="#d7b65e" testId="kpi-active" />
            <KpiGradient label="متوسط الاختبارات" value={`${d.stats.averageScore}%`} icon={Target} from="#0d47a1" to="#3f7dc2" testId="kpi-avg" />
            <KpiGradient label="الشهادات الممنوحة" value={d.stats.certificates} icon={Award} from="#6a1b9a" to="#a06cd5" testId="kpi-certs" />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <QuickTile icon={Library} title="المنهاج والوحدات" body="الوحدات والدروس وبوابة آخر ما وصلنا" href="/teacher/content" badge={`${d.stats.units} وحدات`} color="#17413f" />
            <QuickTile icon={Target} title="الاختبارات" body="بنك الاختبارات وباني الأسئلة" href="/teacher/exams" badge={`${d.stats.assessments} اختبارات`} color="#0d47a1" />
            <QuickTile icon={ClipboardCheck} title="الواجبات" body="تكليفات الصفوف ومواعيدها" href="/teacher/assignments" badge={`${d.stats.assignments} واجبات`} color="#2f7772" />
            <QuickTile icon={Bell} title="الإعلانات" body="رسائلك وتوجيهاتك للطلاب" href="/teacher/announcements" badge="نشر" color="#b7791f" />
            <QuickTile icon={NotebookPen} title="مهام الدفتر" body="اطلب تصوير الدفاتر وقيّمها" href="/teacher/notebooks" badge="جديد" color="#a85d3d" />
            <QuickTile icon={UsersRound} title="الطلاب" body="السجل والنسب والمتابعة" href="/teacher/students" badge={`${d.stats.students} طلاب`} color="#5d4037" />
            <QuickTile icon={Settings} title="هوية المنصة" body="الإعدادات وتقسيم الأقسام" href="/teacher/settings" badge="تحكم" color="#37474f" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">نبض المنصة التعليمي</p>
                  <h3 className="mt-1 font-display text-xl font-bold text-primary">نشاط تفاعل الطلاب الأسبوعي</h3>
                </div>
                <span className="rounded-full bg-accent/25 px-3 py-1 text-xs font-bold text-accent-foreground">الأسبوع الحالي</span>
              </div>
              <div className="mt-8 flex h-52 items-end gap-2 sm:gap-6">
                {(d.weeklyActivity ?? []).map((point) => (
                  <div key={point.label} className="group flex flex-1 flex-col items-center gap-2">
                    <div className="relative w-full max-w-10 rounded-t-xl bg-gradient-to-t from-primary/70 to-accent transition-all group-hover:from-accent group-hover:to-accent" style={{ height: `${Math.max(point.value, 10)}%` }}>
                      <span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground group-hover:block">{point.value}</span>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">{point.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <p className="text-sm font-semibold text-muted-foreground">ملخص المقررات</p>
              <h3 className="mt-1 font-display text-xl font-bold text-primary">محتوى أرض اللغة</h3>
              <div className="mt-6 space-y-4">
                {[
                  ['الوحدات التعليمية المعتمدة', d.stats.units, BookOpen],
                  ['الواجبات والتكليفات', d.stats.assignments, FileText],
                  ['الاختبارات والتقييمات', d.stats.assessments, ClipboardCheck],
                  ['المدارس المشاركة', d.stats.schools, GraduationCap],
                ].map(([label, value, Icon]) => (
                  <div key={label as string} className="flex items-center gap-3.5 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary">{Icon && <Icon size={18} />}</span>
                    <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
                    <strong className="text-base font-bold text-primary">{value as number}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-primary">طلبة انضموا حديثاً</h3>
                <Link href="/teacher/students" className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-primary hover:bg-accent/40" data-testid="link-teacher-students">عرض الكل</Link>
              </div>
              <div className="mt-5 space-y-2">
                {d.recentStudents?.length ? d.recentStudents.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center gap-3.5 rounded-2xl p-3 transition-colors hover:bg-secondary/40">
                    <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-primary">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.school} · {s.grade}</p>
                    </div>
                    <span className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-bold text-primary">{s.progress}%</span>
                  </div>
                )) : <StateNotice type="empty" />}
              </div>
            </div>

            <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-primary">تكليفات قيد المتابعة</h3>
                <Link href="/teacher/content" className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-primary hover:bg-accent/40" data-testid="link-teacher-content">إدارة المحتوى</Link>
              </div>
              <div className="mt-5 space-y-3">
                {d.pendingAssignments?.length ? d.pendingAssignments.slice(0, 4).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-border p-3.5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/30 text-accent-foreground"><FileText size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-primary">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.unit}</p>
                    </div>
                    <Link href="/teacher/content" className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary hover:bg-accent/40" data-testid={`button-review-${a.id}`}><ArrowLeft size={16} /></Link>
                  </div>
                )) : <StateNotice type="empty" />}
              </div>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

/* =========================================================================
   الملخصات — طالب ومعلم
========================================================================= */

function summaryTypeColor(type: string) {
  switch (type) {
    case 'خريطة ذهنية': return '#8a508f';
    case 'ورقة عمل': return '#0d47a1';
    case 'بطاقة مراجعة': return '#b7791f';
    default: return '#2e7d32';
  }
}

function StudentSummariesPage() {
  const { grade: effectiveGrade, term, split, gender, studentId } = useStudentGradeTerm();
  const [typeFilter, setTypeFilter] = useState('الكل');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ grade: effectiveGrade, term });
      if (studentId) params.set('student_id', studentId);
      const data = await jsonFetch(`/api/curriculum/summaries?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [effectiveGrade, term, studentId]);

  const filtered = typeFilter === 'الكل' ? items : items.filter((s) => s.summaryType === typeFilter);

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow="راجع بذكاء"
        title="ملخصاتك المركزة"
        body={`بطاقات مراجعة وخرائط ذهنية وأوراق عمل لـ ${effectiveGrade} · ${term} — خلاصة المنهاج في دقائق.`}
        stats={[
          { value: items.length, label: 'ملخص متاح' },
          { value: new Set(items.map((s) => s.summaryType)).size, label: 'أنواع' },
          { value: new Set(items.map((s) => s.unitTitle).filter(Boolean)).size, label: 'وحدات مغطاة' },
        ]}
      />
      <GradeTermBadge grade={effectiveGrade} term={term} split={split} gender={gender} />
      <div className="mb-6 flex flex-wrap gap-2">
        {['الكل', ...SUMMARY_TYPES].map((t) => (
          <button key={t} type="button" onClick={() => setTypeFilter(t)} className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${typeFilter === t ? 'bg-primary text-primary-foreground shadow-md' : 'bg-secondary text-muted-foreground hover:text-primary'}`}>{t}</button>
        ))}
      </div>

      {loading ? <StateNotice type="loading" /> : !filtered.length ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><NotebookText size={24} /></span>
          <p className="font-display text-lg font-bold text-primary">لا توجد ملخصات هنا بعد</p>
          <p className="mt-1 text-sm text-muted-foreground">الأستاذ يجهّز لك ملخصات هذا القسم — عُد قريباً.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const color = summaryTypeColor(s.summaryType);
            return (
              <div key={s.id} className="group overflow-hidden rounded-[1.8rem] border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl" data-testid={`card-summary-${s.id}`}>
                <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
                  {s.coverUrl ? <img src={s.coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="absolute -left-4 -top-10 select-none font-display text-[8rem] leading-none text-white/15">خ</div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-extrabold" style={{ color }}>{s.summaryType}</span>
                  <p className="absolute bottom-3 right-4 left-4 truncate text-sm font-bold text-white">{s.unitTitle || s.grade}</p>
                </div>
                <div className="p-5">
                  <h3 className="font-display text-base font-bold leading-snug text-primary">{s.title}</h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-6 text-muted-foreground">{s.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">{s.fileUrl ? <><FileText size={13} /> مرفق قابل للتحميل</> : <><BookOpen size={13} /> قراءة مباشرة</>}</span>
                    <Button onClick={() => setActive(s)} variant="soft" className="px-4 py-2 text-xs">افتح الملخص <ArrowLeft size={14} /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {active && (
        <Modal title={active.title} eyebrow={`${active.summaryType} · ${active.unitTitle || active.grade}`} onClose={() => setActive(null)} maxWidth="max-w-2xl">
          <div className="space-y-5" dir="rtl">
            {active.coverUrl ? <img src={active.coverUrl} alt={active.title} className="max-h-64 w-full rounded-2xl border border-border object-cover" /> : null}
            {active.description ? <p className="text-sm leading-7 text-muted-foreground">{active.description}</p> : null}
            {active.content ? (
              <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><Sparkles size={15} /> خلاصة الملخص</h4>
                <p className="whitespace-pre-line text-sm leading-8 text-primary/90">{active.content}</p>
              </div>
            ) : null}
            {active.fileUrl ? (
              <a href={active.fileUrl} target="_blank" rel="noreferrer" download className="flex items-center justify-between gap-3 rounded-2xl bg-primary p-4 text-sm font-bold text-primary-foreground shadow-md transition-transform hover:-translate-y-0.5" data-testid="link-summary-file">
                <span className="flex items-center gap-2"><Download size={18} /> تحميل المرفق (PDF / صورة)</span>
                <ArrowLeft size={16} />
              </a>
            ) : null}
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function TeacherSummariesPage() {
  const [grade, setGrade] = useState('الصف العاشر');
  const term = usePlatformTerm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; item: any }>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [msg, setMsg] = useState('');
  const splitMap = useSplitMap();
  const gradeSplit = splitMap[grade] === true;
  const [sectionFilter, setSectionFilter] = useState('الجميع');
  const shownItems = items.filter((s) => sectionFilter === 'الجميع' || (s.section || 'الجميع') === sectionFilter);

  const load = async () => {
    setLoading(true);
    try {
      const data = await jsonFetch(`/api/teacher/curriculum/summaries?grade=${encodeURIComponent(grade)}&term=${encodeURIComponent(term)}`);
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grade, term]);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  const openCreate = () => {
    setForm({ title: '', summaryType: 'ملخص', unitTitle: '', description: '', content: '', coverUrl: '', fileUrl: '', sortOrder: items.length + 1, published: true, section: 'الجميع' });
    setModal({ mode: 'create' });
  };
  const openEdit = (item: any) => {
    setForm({ title: item.title, summaryType: item.summaryType, unitTitle: item.unitTitle, description: item.description, content: item.content, coverUrl: item.coverUrl, fileUrl: item.fileUrl, sortOrder: item.sortOrder, published: item.published, section: item.section || 'الجميع' });
    setModal({ mode: 'edit', item });
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, grade, term, section: gradeSplit ? (form.section || 'الجميع') : 'الجميع' };
      if (modal?.mode === 'create') await jsonFetch('/api/teacher/curriculum/summaries', { method: 'POST', body: payload });
      else if (modal?.mode === 'edit') await jsonFetch(`/api/teacher/curriculum/summaries/${modal.item.id}`, { method: 'PATCH', body: payload });
      setModal(null);
      load();
      flash('تم الحفظ بنجاح!');
    } catch (e: any) { flash(e?.message || 'تعذر الحفظ'); } finally { setSaving(false); }
  };
  const remove = async (item: any) => {
    if (!window.confirm(`حذف "${item.title}"؟`)) return;
    try {
      await jsonFetch(`/api/teacher/curriculum/summaries/${item.id}`, { method: 'DELETE' });
      load();
      flash('تم الحذف');
    } catch (e: any) { flash(e?.message || 'تعذر الحذف'); }
  };

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow="بطاقات التفوق"
        title="إدارة الملخصات"
        body={`ملخصات وخرائط ذهنية وأوراق عمل لـ ${grade} · ${term} — تُرفع الملفات سحابياً ويُحفظ النص في القاعدة.`}
        tone="light"
        action={<Button onClick={openCreate} data-testid="button-add-summary"><Plus size={17} /> إضافة ملخص جديد</Button>}
        stats={[
          { value: items.length, label: 'ملخص منشور' },
          { value: items.filter((s) => s.fileUrl).length, label: 'بمرفق تحميل' },
          { value: new Set(items.map((s) => s.summaryType)).size, label: 'أنواع' },
        ]}
      />
      {msg ? <p className="mb-4 rounded-xl bg-accent/20 px-4 py-3 text-sm font-bold text-accent-foreground">{msg}</p> : null}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {GRADES.map((g) => (
          <button key={g} type="button" onClick={() => { setGrade(g); setSectionFilter('الجميع'); }} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${grade === g ? 'bg-primary text-primary-foreground shadow-sm' : 'border border-border bg-card text-muted-foreground hover:text-primary'}`}>{g}</button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow-sm" title="الفصل المعتمد من الإعدادات">
          <BookOpen size={16} /> {term}
        </span>
        {gradeSplit && (
          <>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <span className="text-xs font-extrabold text-[#6a1b9a]">القسم:</span>
            {[
              { id: 'الجميع', label: 'الكل', cls: 'bg-primary text-primary-foreground shadow-sm', idle: 'border border-border bg-card text-muted-foreground hover:text-primary' },
              { id: 'طالب', label: 'الطلاب', cls: 'bg-gradient-to-l from-[#17413f] to-[#2a7a72] text-white shadow-md', idle: 'border border-[#17413f]/30 bg-card text-[#17413f] hover:bg-[#17413f]/10' },
              { id: 'طالبة', label: 'الطالبات', cls: 'bg-gradient-to-l from-[#6a1b9a] to-[#b06ab3] text-white shadow-md', idle: 'border border-[#6a1b9a]/30 bg-card text-[#6a1b9a] hover:bg-[#6a1b9a]/10' },
            ].map((s) => (
              <button key={s.id} type="button" onClick={() => setSectionFilter(s.id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${sectionFilter === s.id ? s.cls : s.idle}`}>
                {s.label} <span className="mr-1 font-mono text-xs opacity-75">({s.id === 'الجميع' ? items.length : items.filter((x) => (x.section || 'الجميع') === s.id).length})</span>
              </button>
            ))}
          </>
        )}
      </div>

      {loading ? <StateNotice type="loading" /> : !shownItems.length ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="font-display text-lg font-bold text-primary">لا توجد ملخصات بعد</p>
          <p className="mt-1 text-sm text-muted-foreground">أضف أول ملخص لطلاب {grade}.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shownItems.map((s) => (
            <div key={s.id} className="flex gap-4 rounded-3xl border border-border bg-card p-4 shadow-sm">
              {s.coverUrl ? <img src={s.coverUrl} alt="" className="h-24 w-20 shrink-0 rounded-2xl object-cover" /> : (
                <span className="grid h-24 w-20 shrink-0 place-items-center rounded-2xl text-white" style={{ background: summaryTypeColor(s.summaryType) }}><NotebookText size={26} /></span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-bold text-primary">{s.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${s.published ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>{s.published ? 'منشور' : 'مسودة'}</span>
                </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.summaryType} · {s.unitTitle || 'عام'} {s.fileUrl ? '· مرفق' : ''}{s.section && s.section !== 'الجميع' ? ` · ${s.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}` : ''}</p>
                <div className="mt-2.5 flex items-center gap-1">
                  <Button onClick={() => openEdit(s)} variant="soft" className="px-3 py-1.5 text-xs"><Pencil size={13} /> تعديل</Button>
                  <Button onClick={() => remove(s)} variant="ghost" className="px-2 py-1.5 text-xs text-destructive"><Trash2 size={14} /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === 'create' ? 'إضافة ملخص جديد' : 'تعديل الملخص'} eyebrow={`${grade} · ${term}`} onClose={() => setModal(null)} maxWidth="max-w-2xl">
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field2 label="عنوان الملخص"><input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required className={inputCls} data-testid="input-summary-title" /></Field2></div>
              <Field2 label="النوع">
                <select value={form.summaryType} onChange={(e) => setForm({ ...form, summaryType: e.target.value })} className={inputCls}>
                  {SUMMARY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field2>
              <Field2 label="الوحدة المرتبطة"><input value={form.unitTitle || ''} onChange={(e) => setForm({ ...form, unitTitle: e.target.value })} placeholder="مثال: الوحدة الأولى" className={inputCls} /></Field2>
              <div className="sm:col-span-2"><Field2 label="وصف مختصر"><input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} /></Field2></div>
              <div className="sm:col-span-2"><Field2 label="نص الملخص (يُحفظ كنص في القاعدة)"><textarea value={form.content || ''} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} placeholder="اكتب خلاصة الدرس هنا..." className={`${inputCls} resize-none leading-7`} /></Field2></div>
              <div className="sm:col-span-2"><ImageUrlField label="صورة غلاف الملخص" value={form.coverUrl || ''} onChange={(v) => setForm({ ...form, coverUrl: v })} testId="input-summary-cover" folder="/ard-al-lughah/summaries" /></div>
              <div className="sm:col-span-2">
                <div className="rounded-2xl border border-dashed border-border p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold">ملف المرفق (PDF / صورة) {isCloudUrl(form.fileUrl) ? <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-800">سحابي ✓</span> : null}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary hover:bg-accent/40 ${uploadingFile ? 'opacity-60' : ''}`}>
                      {uploadingFile ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} {uploadingFile ? 'جارٍ الرفع...' : 'ارفع المرفق'}
                      <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        const target = e.target;
                        if (!f || uploadingFile) return;
                        setUploadingFile(true);
                        uploadFileToCloud(f, '/ard-al-lughah/summaries')
                          .then((res) => { if (res?.url) setForm({ ...form, fileUrl: res.url }); })
                          .catch((err: Error) => flash(err?.message || 'تعذر الرفع'))
                          .finally(() => { setUploadingFile(false); target.value = ''; });
                      }} />
                    </label>
                    {form.fileUrl ? <a href={form.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline">معاينة المرفق</a> : null}
                    {form.fileUrl ? <button type="button" onClick={() => setForm({ ...form, fileUrl: '' })} className="text-xs font-bold text-destructive hover:underline">إزالة</button> : null}
                  </div>
                </div>
              </div>
              <Field2 label="الترتيب"><input type="number" min={1} value={form.sortOrder || 1} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className={inputCls} /></Field2>
              <label className="flex cursor-pointer items-end gap-2 pb-1 text-sm font-semibold"><input type="checkbox" checked={form.published !== false} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="accent-primary" /> منشور للطلاب</label>
              {gradeSplit ? <div className="sm:col-span-2"><SectionField value={form.section || 'الجميع'} onChange={(v) => setForm({ ...form, section: v })} /></div> : <p className="text-xs text-muted-foreground sm:col-span-2">هذا الصف غير مقسّم — الملخص سيظهر للجميع.</p>}
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button onClick={() => setModal(null)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={saving} variant="primary" data-testid="button-save-summary">{saving ? 'جارٍ الحفظ...' : 'حفظ الملخص'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

/* =========================================================================
   تكملة الدفتر — طالب ومعلم (تصوير الدفاتر)
========================================================================= */

function StudentNotebookPage() {
  const { grade: effectiveGrade, term, split, gender, student } = useStudentGradeTerm();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [mine, setMine] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ grade: effectiveGrade, term });
      if (student?.id) params.set('student_id', student.id);
      const data = await jsonFetch(`/api/curriculum/notebooks?${params.toString()}`);
      setTasks(Array.isArray(data) ? data : []);
    } catch { setTasks([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [effectiveGrade, term, student?.id]);

  const openTask = (task: any) => {
    setActive(task);
    setPhotos([]);
    setNote('');
    setMsg('');
    setMine(null);
    if (task.myStatus && student?.id) {
      jsonFetch(`/api/notebooks/${task.id}/mine?user_id=${student.id}`)
        .then((d) => { if (d) setMine(d); })
        .catch(() => undefined);
    }
  };

  const pickPhotos = (files: File[]) => {
    if (!files.length || uploading) return;
    setUploading(files.length);
    (async () => {
      for (const f of files) {
        try {
          const res = await uploadStudentPhoto(f);
          if (res?.url) setPhotos((p) => [...p, res.url]);
        } catch (e: any) {
          setMsg(e?.message || 'تعذر رفع صورة');
        } finally {
          setUploading((n) => Math.max(n - 1, 0));
        }
      }
    })();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!active || !photos.length || !student?.id) return;
    setSubmitting(true);
    try {
      const res = await jsonFetch(`/api/notebooks/${active.id}/submit`, {
        method: 'POST',
        body: { userId: student.id, photos, note },
      });
      setMsg(res.message || 'تم التسليم!');
      load();
      setTimeout(() => { setActive(null); setMsg(''); }, 2000);
    } catch (e: any) {
      setMsg(e?.message || 'تعذر التسليم');
    } finally {
      setSubmitting(false);
    }
  };

  const pending = tasks.filter((t) => !t.myStatus).length;

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow="دفترك مرآة اجتهادك"
        title="تكملة الدفتر"
        body="الأستاذ يطلب تصوير الدفتر — صوّر صفحاتك بوضوح وارفعها هنا ليطّلع عليها ويقيّمها."
        stats={[
          { value: tasks.length, label: 'مهام مطلوبة' },
          { value: pending, label: 'بانتظار تصويرك' },
          { value: tasks.filter((t) => t.myStatus === 'تم التقييم').length, label: 'تم تقييمها' },
        ]}
      />
      <GradeTermBadge grade={effectiveGrade} term={term} split={split} gender={gender} />

      {loading ? <StateNotice type="loading" /> : !tasks.length ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><NotebookPen size={24} /></span>
          <p className="font-display text-lg font-bold text-primary">لا توجد مهام دفتر حالياً</p>
          <p className="mt-1 text-sm text-muted-foreground">عندما يطلب الأستاذ تصوير الدفتر ستجد المهمة هنا.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {tasks.map((task) => (
            <div key={task.id} className="group relative overflow-hidden rounded-[1.8rem] border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl" data-testid={`card-notebook-${task.id}`}>
              <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-accent/15 blur-2xl" />
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#b7791f] to-[#d7b65e] text-white shadow-md"><NotebookPen size={22} /></span>
                {task.myStatus === 'تم التقييم' ? (
                  <span className="rounded-full bg-green-500/15 px-3 py-1.5 text-xs font-extrabold text-green-800">تم التقييم {task.myScore !== null ? `· ${task.myScore}` : ''}</span>
                ) : task.myStatus ? (
                  <span className="rounded-full bg-accent/25 px-3 py-1.5 text-xs font-extrabold text-accent-foreground">مسلّم ✓ بانتظار المراجعة</span>
                ) : (
                  <span className="rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-extrabold text-destructive">لم يُسلَّم بعد</span>
                )}
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-primary">{task.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-7 text-muted-foreground">{task.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted-foreground">
                {task.unitTitle ? <span className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1"><Library size={12} /> {task.unitTitle}</span> : null}
                {task.lessonTitle ? <span className="inline-flex items-center gap-1 rounded-lg bg-[#6a1b9a]/10 px-2.5 py-1 text-[#6a1b9a]"><BookCopy size={12} /> {task.lessonTitle}</span> : null}
                {task.requirements?.length ? <span className="rounded-lg bg-accent/20 px-2.5 py-1 text-accent-foreground">🎯 {task.requirements.length} بنود</span> : null}
                {task.dueDate ? <span className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1"><Clock3 size={12} /> حتى {task.dueDate}</span> : null}
                <span className="rounded-lg bg-secondary px-2.5 py-1">{task.points} نقاط</span>
              </div>
              <Button onClick={() => openTask(task)} variant={task.myStatus ? 'soft' : 'primary'} className="mt-5 w-full py-3">
                {task.myStatus ? (<><Eye size={16} /> عرض التسليم والتقييم</>) : (<><Camera size={16} /> صوّر دفترك وسلّم الآن</>)}
              </Button>
            </div>
          ))}
        </div>
      )}

      {active && (
        <Modal title={active.title} eyebrow={`مهمة دفتر · ${active.unitTitle || active.grade}`} onClose={() => setActive(null)} maxWidth="max-w-2xl">
          <div className="space-y-4" dir="rtl">
            <p className="rounded-2xl bg-secondary/50 p-4 text-sm leading-7 text-muted-foreground">{active.description || 'صوّر صفحات دفترك المطلوبة بوضوح ثم ارفعها.'}</p>

            {active.requirements?.length ? (
              <div className="overflow-hidden rounded-2xl border-2 border-accent/40 bg-gradient-to-b from-accent/10 to-card">
                <p className="flex items-center gap-2 bg-accent/15 px-4 py-3 text-sm font-extrabold text-primary">🎯 ماذا تكتب في دفترك؟ ({active.requirements.length} بنود)</p>
                <div className="space-y-2 p-3.5">
                  {active.requirements.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 animate-fade-up" style={{ animationDelay: `${i * 0.06}s` }}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#b7791f] to-[#d7b65e] text-sm font-extrabold text-white shadow">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-6 text-primary">{r.label}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="rounded-md bg-secondary px-1.5 py-0.5 font-bold text-primary">{r.kind}</span>
                          {r.place ? <span>📍 {r.place}</span> : null}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {mine ? (
              <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
                <p className="text-sm font-extrabold text-primary">📸 تسليمك السابق:</p>
                <div className="grid grid-cols-3 gap-2">
                  {(mine.photos || []).map((src: string, i: number) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-border">
                      <img src={src} alt={`صفحتك ${i + 1}`} loading="lazy" className="h-24 w-full object-cover" />
                    </a>
                  ))}
                </div>
                {(mine.checks || []).length ? (
                  <div className="space-y-1.5">
                    {(mine.checks || []).map((c: any, i: number) => (
                      <div key={i} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${c.done ? 'bg-green-500/10 text-green-800' : 'bg-muted text-muted-foreground'}`}>
                        <span>{c.done ? '✓' : `${i + 1}.`}</span>
                        <span className="flex-1">{c.label}</span>
                        <span>{c.done ? 'منجز' : 'بانتظار المراجعة'}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {mine.status === 'تم التقييم' ? (
                  <div className="rounded-xl bg-green-500/10 p-3 text-sm font-bold text-green-800">
                    الدرجة: {mine.score ?? '—'}{mine.feedback ? ` — ملاحظة الأستاذ: ${mine.feedback}` : ''}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-accent-foreground">استلمنا صور دفترك — الأستاذ يراجعها الآن.</p>
                )}
                <p className="text-xs text-muted-foreground">لإعادة التصوير والتسليم من جديد، أضف صوراً جديدة وسلّم مرة أخرى:</p>
              </div>
            ) : active.myStatus ? (
              <p className="rounded-2xl bg-accent/10 p-3 text-center text-xs font-bold text-accent-foreground">مسلّم ✓ — جارٍ تحميل تفاصيل تسليمك...</p>
            ) : null}

            <form onSubmit={submit} className="space-y-4">
              <div className="rounded-2xl border border-dashed border-border p-4">
                <p className="mb-3 text-sm font-bold text-primary">صور الدفتر ({photos.length}) — تُرفع سحابياً بجودتها</p>
                {photos.length ? (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {photos.map((src, i) => (
                      <div key={i} className="group relative overflow-hidden rounded-xl border border-border">
                        <img src={src} alt={`صفحة ${i + 1}`} className="h-28 w-full object-cover" />
                        <button type="button" onClick={() => setPhotos((p) => p.filter((_, x) => x !== i))} className="absolute left-1 top-1 rounded-lg bg-black/60 p-1 text-white"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-primary hover:bg-accent/40 ${uploading ? 'opacity-60' : ''}`}>
                  {uploading ? <RefreshCw size={15} className="animate-spin" /> : <Camera size={15} />} {uploading ? `جارٍ الرفع (${uploading})...` : 'التقط / اختر صور الدفتر'}
                  <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    pickPhotos(files);
                  }} />
                </label>
                <p className="mt-2 text-[11px] text-muted-foreground">نصيحة: صوّر في إضاءة جيدة واجعل الصفحة كاملة داخل الإطار.</p>
              </div>
              <Field2 label="ملاحظة للأستاذ (اختياري)">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: أكملت حتى درس الحال" className={inputCls} />
              </Field2>
              {msg ? <p className="rounded-xl bg-accent/20 px-4 py-2.5 text-center text-sm font-bold text-accent-foreground">{msg}</p> : null}
              <div className="flex items-center justify-end gap-3">
                <Button onClick={() => setActive(null)} variant="ghost">إغلاق</Button>
                <Button type="submit" disabled={submitting || !photos.length} variant="primary" className="px-6 py-2.5" data-testid="button-submit-notebook">
                  {submitting ? 'جارٍ التسليم...' : 'تسليم الدفتر للأستاذ'} <ArrowLeft size={16} />
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function TeacherNotebooksPage() {
  const [grade, setGrade] = useState('الصف العاشر');
  const term = usePlatformTerm();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; item: any }>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [reviewTask, setReviewTask] = useState<any | null>(null);
  const splitMapNb = useSplitMap();
  const gradeSplitNb = splitMapNb[grade] === true;
  const [sectionFilter, setSectionFilter] = useState('الجميع');
  const shownTasks = tasks.filter((t) => sectionFilter === 'الجميع' || (t.section || 'الجميع') === sectionFilter);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [taskCourses, setTaskCourses] = useState<any[]>([]);
  const [taskLessons, setTaskLessons] = useState<any[]>([]);
  const [newReq, setNewReq] = useState({ label: '', kind: 'كتابة', place: '' });
  useEffect(() => {
    jsonFetch(`/api/curriculum/courses?grade=${encodeURIComponent(grade)}&term=${encodeURIComponent(term)}`)
      .then((d) => setTaskCourses(Array.isArray(d) ? d : []))
      .catch(() => setTaskCourses([]));
  }, [grade, term]);
  useEffect(() => {
    if (!modal || !form.courseId) { setTaskLessons([]); return; }
    jsonFetch(`/api/curriculum/courses/${form.courseId}/lessons`)
      .then((d) => setTaskLessons(Array.isArray(d) ? d : []))
      .catch(() => setTaskLessons([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, form.courseId]);
  const [grading, setGrading] = useState<Record<string, { score: string; feedback: string; checks: { label: string; done: boolean }[] }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await jsonFetch(`/api/teacher/curriculum/notebooks?grade=${encodeURIComponent(grade)}&term=${encodeURIComponent(term)}`);
      setTasks(Array.isArray(data) ? data : []);
    } catch { setTasks([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grade, term]);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  const openCreate = () => {
    setForm({ title: '', description: '', unitTitle: '', courseId: '', lessonId: '', requirements: [], dueDate: '', points: 10, published: true, section: 'الجميع' });
    setNewReq({ label: '', kind: 'كتابة', place: '' });
    setModal({ mode: 'create' });
  };
  const openEdit = (item: any) => {
    setForm({ title: item.title, description: item.description, unitTitle: item.unitTitle, courseId: item.courseId || '', lessonId: item.lessonId || '', requirements: Array.isArray(item.requirements) ? [...item.requirements] : [], dueDate: item.dueDate, points: item.points, published: item.published, section: item.section || 'الجميع' });
    setNewReq({ label: '', kind: 'كتابة', place: '' });
    setModal({ mode: 'edit', item });
  };
  const addReq = () => {
    if (!newReq.label.trim()) return;
    setForm((f: any) => ({ ...f, requirements: [...(f.requirements || []), { label: newReq.label.trim(), kind: newReq.kind, place: newReq.place.trim() }] }));
    setNewReq({ label: '', kind: 'كتابة', place: '' });
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, grade, term, section: gradeSplitNb ? (form.section || 'الجميع') : 'الجميع' };
      if (modal?.mode === 'create') await jsonFetch('/api/teacher/curriculum/notebooks', { method: 'POST', body: payload });
      else if (modal?.mode === 'edit') await jsonFetch(`/api/teacher/curriculum/notebooks/${modal.item.id}`, { method: 'PATCH', body: payload });
      setModal(null);
      load();
      flash('تم الحفظ بنجاح!');
    } catch (e: any) { flash(e?.message || 'تعذر الحفظ'); } finally { setSaving(false); }
  };
  const remove = async (item: any) => {
    if (!window.confirm(`حذف مهمة "${item.title}" مع كل تسليماتها؟`)) return;
    try {
      await jsonFetch(`/api/teacher/curriculum/notebooks/${item.id}`, { method: 'DELETE' });
      load();
      flash('تم الحذف');
    } catch (e: any) { flash(e?.message || 'تعذر الحذف'); }
  };

  const openReview = async (task: any) => {
    setReviewTask(task);
    try {
      const data = await jsonFetch(`/api/teacher/curriculum/notebooks/${task.id}/submissions`);
      const list = Array.isArray(data) ? data : [];
      setSubmissions(list);
      const taskReqs = Array.isArray(task.requirements) ? task.requirements : [];
      const g: Record<string, { score: string; feedback: string; checks: { label: string; done: boolean }[] }> = {};
      for (const s of list) {
        const checks = (Array.isArray(s.checks) && s.checks.length ? s.checks : taskReqs.map((r: any) => ({ label: r.label, done: false })))
          .map((c: any) => ({ label: String(c.label || ''), done: !!c.done }));
        g[s.id] = { score: s.score !== null && s.score !== undefined ? String(s.score) : '', feedback: s.feedback || '', checks };
      }
      setGrading(g);
    } catch { setSubmissions([]); }
  };

  const saveGrade = async (sub: any) => {
    const g = grading[sub.id] || { score: '', feedback: '', checks: [] };
    try {
      await jsonFetch(`/api/teacher/curriculum/notebook-submissions/${sub.id}`, {
        method: 'PATCH',
        body: { score: g.score === '' ? null : Number(g.score), feedback: g.feedback, checks: g.checks || [] },
      });
      const data = await jsonFetch(`/api/teacher/curriculum/notebooks/${reviewTask.id}/submissions`);
      setSubmissions(Array.isArray(data) ? data : []);
      load();
      flash(`تم تقييم دفتر ${sub.student.name}!`);
    } catch (e: any) { flash(e?.message || 'تعذر الحفظ'); }
  };

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow="عينك على دفاترهم"
        title="مهام تكملة الدفتر"
        body="اطلب من الطلاب تصوير دفاترهم — يستلمون المهمة، يرفعون الصور بجودتها، وأنت تتصفح وتقيّم."
        tone="light"
        action={<Button onClick={openCreate} data-testid="button-add-notebook"><Plus size={17} /> مهمة دفتر جديدة</Button>}
        stats={[
          { value: tasks.length, label: 'مهام منشورة' },
          { value: tasks.reduce((a, t) => a + (t.submissionsCount || 0), 0), label: 'تسليمات مستلمة' },
          { value: tasks.filter((t) => t.published).length, label: 'نشطة الآن' },
        ]}
      />
      {msg ? <p className="mb-4 rounded-xl bg-accent/20 px-4 py-3 text-sm font-bold text-accent-foreground">{msg}</p> : null}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {GRADES.map((g) => (
          <button key={g} type="button" onClick={() => { setGrade(g); setSectionFilter('الجميع'); }} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${grade === g ? 'bg-primary text-primary-foreground shadow-sm' : 'border border-border bg-card text-muted-foreground hover:text-primary'}`}>{g}</button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow-sm" title="الفصل المعتمد من الإعدادات">
          <BookOpen size={16} /> {term}
        </span>
        {gradeSplitNb && (
          <>
            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <span className="text-xs font-extrabold text-[#6a1b9a]">القسم:</span>
            {[
              { id: 'الجميع', label: 'الكل', cls: 'bg-primary text-primary-foreground shadow-sm', idle: 'border border-border bg-card text-muted-foreground hover:text-primary' },
              { id: 'طالب', label: 'الطلاب', cls: 'bg-gradient-to-l from-[#17413f] to-[#2a7a72] text-white shadow-md', idle: 'border border-[#17413f]/30 bg-card text-[#17413f] hover:bg-[#17413f]/10' },
              { id: 'طالبة', label: 'الطالبات', cls: 'bg-gradient-to-l from-[#6a1b9a] to-[#b06ab3] text-white shadow-md', idle: 'border border-[#6a1b9a]/30 bg-card text-[#6a1b9a] hover:bg-[#6a1b9a]/10' },
            ].map((s) => (
              <button key={s.id} type="button" onClick={() => setSectionFilter(s.id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${sectionFilter === s.id ? s.cls : s.idle}`}>
                {s.label} <span className="mr-1 font-mono text-xs opacity-75">({s.id === 'الجميع' ? tasks.length : tasks.filter((x) => (x.section || 'الجميع') === s.id).length})</span>
              </button>
            ))}
          </>
        )}
      </div>

      {loading ? <StateNotice type="loading" /> : !shownTasks.length ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="font-display text-lg font-bold text-primary">لا توجد مهام دفتر بعد</p>
          <p className="mt-1 text-sm text-muted-foreground">أنشئ أول مهمة واطلب من طلاب {grade} تصوير دفاترهم.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shownTasks.map((task) => (
            <div key={task.id} className="rounded-[1.8rem] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#b7791f] to-[#d7b65e] text-white shadow"><NotebookPen size={20} /></span>
                  <div>
                    <p className="font-bold text-primary">{task.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{task.unitTitle || grade} {task.dueDate ? `· حتى ${task.dueDate}` : ''}{task.section && task.section !== 'الجميع' ? ` · ${task.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}` : ''}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${task.published ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>{task.published ? 'نشطة' : 'مسودة'}</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {task.unitTitle ? <span className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-bold text-primary"><Library size={12} /> {task.unitTitle}</span> : null}
                {task.lessonTitle ? <span className="inline-flex items-center gap-1 rounded-lg bg-[#6a1b9a]/10 px-2.5 py-1 text-[11px] font-bold text-[#6a1b9a]"><BookCopy size={12} /> {task.lessonTitle}</span> : null}
                {task.requirements?.length ? <span className="inline-flex items-center gap-1 rounded-lg bg-accent/20 px-2.5 py-1 text-[11px] font-extrabold text-accent-foreground">🎯 {task.requirements.length} بنود مطلوبة</span> : null}
              </div>
              <p className="mt-2.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{task.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={() => openReview(task)} variant="primary" className="px-4 py-2 text-xs" data-testid={`button-review-${task.id}`}>
                  <Camera size={14} /> مراجعة الدفاتر ({task.submissionsCount || 0})
                </Button>
                <Button onClick={() => openEdit(task)} variant="soft" className="px-3 py-2 text-xs"><Pencil size={13} /></Button>
                <Button onClick={() => remove(task)} variant="ghost" className="px-2 py-2 text-xs text-destructive"><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === 'create' ? 'مهمة دفتر جديدة' : 'تعديل المهمة'} eyebrow={`${grade} · ${term}`} onClose={() => setModal(null)} maxWidth="max-w-5xl">
          <form onSubmit={save} className="space-y-5">
            {/* معاينة حية */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#b7791f] via-[#c9962e] to-[#d7b65e] shadow-lg">
              <div className="pointer-events-none absolute -left-8 -top-10 select-none font-display text-[6rem] leading-none text-white/15">د</div>
              <div className="relative flex items-center gap-4 p-5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/25 text-white shadow-xl backdrop-blur-sm"><NotebookPen size={26} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-extrabold text-white">{form.title || 'عنوان المهمة...'}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-white/90">
                    <span className="rounded-lg bg-black/25 px-2 py-0.5 backdrop-blur-sm">{form.dueDate || 'بلا موعد'}</span>
                    <span className="rounded-lg bg-black/25 px-2 py-0.5 backdrop-blur-sm">{form.points || 10} نقاط</span>
                    <span className="rounded-lg bg-white/90 px-2 py-0.5 text-[#6a4a00]">{(form.requirements || []).length} بنود مطلوبة</span>
                  </p>
                </div>
              </div>
              <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md">👁 معاينة حية</span>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
              <div className="space-y-4 rounded-3xl border border-border bg-background/50 p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><NotebookPen size={16} /> تفاصيل المهمة</p>
                <Field2 label="عنوان المهمة"><input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="مثال: صوّر دفتر القواعد حتى درس الحال" className={inputCls} data-testid="input-notebook-title" /></Field2>
                <Field2 label="تعليمات المهمة"><textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="حدد الصفحات المطلوبة وشروط التصوير الواضح..." className={`${inputCls} resize-none leading-6`} /></Field2>
                <div className="grid gap-4 sm:grid-cols-2">
              <Field2 label="من أي وحدة؟ (اختيار سهل)">
                <select value={form.courseId || ''} onChange={(e) => { const c = taskCourses.find((x: any) => x.id === e.target.value); setForm({ ...form, courseId: e.target.value, lessonId: '', unitTitle: c ? c.title : form.unitTitle }); }} className={inputCls} data-testid="select-notebook-course">
                  <option value="">اختر الوحدة...</option>
                  {taskCourses.map((c: any) => <option key={c.id} value={c.id}>{c.sort_order}. {c.title}</option>)}
                </select>
              </Field2>
              <Field2 label="من أي درس؟">
                <select value={form.lessonId || ''} onChange={(e) => setForm({ ...form, lessonId: e.target.value })} className={inputCls} data-testid="select-notebook-lesson" disabled={!form.courseId}>
                  <option value="">{form.courseId ? 'كل دروس الوحدة' : 'اختر الوحدة أولاً'}</option>
                  {taskLessons.map((l: any) => <option key={l.id} value={l.id}>{l.position}. {l.title}</option>)}
                </select>
              </Field2>
            </div>
            <div className="rounded-2xl border-2 border-dashed border-accent/50 bg-gradient-to-b from-accent/10 to-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-extrabold text-primary">🎯 ماذا يكتب الطالب؟ — بنود المطلوب ({(form.requirements || []).length})</p>
                <span className="text-[11px] text-muted-foreground">تظهر مرقّمة للطالب ويقيّم كل بند لحاله</span>
              </div>
              {(form.requirements || []).length ? (
                <div className="mb-3 space-y-2">
                  {(form.requirements || []).map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3 animate-fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-primary">{r.label}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="rounded-md bg-accent/25 px-1.5 py-0.5 font-bold text-accent-foreground">{r.kind}</span>
                          {r.place ? <span className="rounded-md bg-secondary px-1.5 py-0.5">📍 {r.place}</span> : null}
                        </p>
                      </div>
                      <button type="button" onClick={() => setForm((f: any) => ({ ...f, requirements: (f.requirements || []).filter((_: any, j: number) => j !== i) }))} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-3 rounded-xl bg-secondary/50 px-4 py-3 text-center text-xs text-muted-foreground">لا بنود بعد — حدد أول بند: ماذا يكتب الطالب وأين؟</p>
              )}
              <div className="grid gap-2 sm:grid-cols-[1fr_130px_130px_auto]">
                <input value={newReq.label} onChange={(e) => setNewReq({ ...newReq, label: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReq(); } }} placeholder="البند: مثال: اكتب قاعدة الحال كاملة" className={inputCls} data-testid="input-req-label" />
                <select value={newReq.kind} onChange={(e) => setNewReq({ ...newReq, kind: e.target.value })} className={inputCls}>
                  {['كتابة', 'تلخيص', 'حل أسئلة', 'رسم/مخطط', 'حفظ وتسميع', 'قراءة'].map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <input value={newReq.place} onChange={(e) => setNewReq({ ...newReq, place: e.target.value })} placeholder="المكان: ص 12" className={inputCls} />
                <Button type="button" onClick={addReq} variant="primary" className="px-4 py-2 text-xs whitespace-nowrap"><Plus size={14} /> أضف</Button>
              </div>
            </div>
                </div>
              </div>
              <div className="space-y-4 rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-card p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><Settings size={16} /> المواعيد والنشر</p>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  <Field2 label="آخر موعد"><input type="date" value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={inputCls} /></Field2>
                  <Field2 label="النقاط"><input type="number" min={1} value={form.points || 10} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} className={inputCls} /></Field2>
                  <Field2 label="الوحدة (نص حر)"><input value={form.unitTitle || ''} onChange={(e) => setForm({ ...form, unitTitle: e.target.value })} placeholder="تُملأ تلقائياً" className={inputCls} /></Field2>
                </div>
                {gradeSplitNb ? <SectionField value={form.section || 'الجميع'} onChange={(v) => setForm({ ...form, section: v })} /> : <p className="rounded-xl bg-secondary/50 px-4 py-2.5 text-xs text-muted-foreground">هذا الصف غير مقسّم — المهمة ستظهر للجميع.</p>}
                <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-3 py-3 text-sm font-semibold"><input type="checkbox" checked={form.published !== false} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="accent-primary" /> منشورة للطلاب فوراً</label>
              </div>
            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button onClick={() => setModal(null)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={saving} variant="primary" className="px-8 py-3 shadow-md" data-testid="button-save-notebook">{saving ? 'جارٍ الحفظ...' : 'حفظ المهمة ✓'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {reviewTask && (
        <Modal title={reviewTask.title} eyebrow={`دفاتر الطلاب · ${submissions.length} تسليمات`} onClose={() => setReviewTask(null)} maxWidth="max-w-3xl">
          {!submissions.length ? (
            <p className="rounded-2xl bg-secondary/50 px-4 py-8 text-center text-sm text-muted-foreground">لم يسلّم أي طالب دفتره بعد — سيظهرون هنا فور التسليم.</p>
          ) : (
            <div className="space-y-4">
              {submissions.map((sub) => (
                <div key={sub.id} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={sub.student.name} src={sub.student.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-primary">{sub.student.name}</p>
                      <p className="text-xs text-muted-foreground">{sub.student.grade}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${sub.status === 'تم التقييم' ? 'bg-green-500/15 text-green-800' : 'bg-accent/25 text-accent-foreground'}`}>{sub.status}</span>
                  </div>
                  {sub.note ? <p className="mt-2 text-xs text-muted-foreground">ملاحظة الطالب: {sub.note}</p> : null}
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {sub.photos.map((src: string, i: number) => (
                      <a key={i} href={src} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border" title="اضغط للعرض بالحجم الكامل">
                        <img src={src} alt={`دفتر ${sub.student.name} — صفحة ${i + 1}`} loading="lazy" className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      </a>
                    ))}
                  </div>
                  {(grading[sub.id]?.checks || []).length ? (
                    <div className="mt-3 rounded-2xl border border-accent/30 bg-accent/[0.07] p-3.5">
                      <div className="mb-2.5 flex items-center justify-between">
                        <p className="text-xs font-extrabold text-primary">🎯 بنود المطلوب — اضغط على المنجز منها:</p>
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-extrabold text-primary">
                          {(grading[sub.id]?.checks || []).filter((c) => c.done).length}/{(grading[sub.id]?.checks || []).length} منجزة
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(grading[sub.id]?.checks || []).map((c, ci) => (
                          <button
                            key={ci}
                            type="button"
                            onClick={() => setGrading((g) => ({ ...g, [sub.id]: { ...g[sub.id], checks: (g[sub.id]?.checks || []).map((x, j) => j === ci ? { ...x, done: !x.done } : x) } }))}
                            className={`flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-right text-xs font-bold transition-all active:scale-[0.98] ${c.done ? 'border-green-600 bg-green-500/10 text-green-800' : 'border-border bg-card text-muted-foreground hover:border-accent/60'}`}
                          >
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-extrabold ${c.done ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                              {c.done ? <Check size={15} /> : <span>{ci + 1}</span>}
                            </span>
                            <span className="min-w-0 flex-1 leading-5">{c.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-2 rounded-2xl bg-secondary/40 p-3 sm:grid-cols-[100px_1fr_auto]">
                    <input type="number" min={0} value={grading[sub.id]?.score ?? ''} onChange={(e) => setGrading((g) => ({ ...g, [sub.id]: { ...g[sub.id], score: e.target.value } }))} placeholder="الدرجة" className={`${inputCls} py-2 text-sm`} />
                    <input value={grading[sub.id]?.feedback ?? ''} onChange={(e) => setGrading((g) => ({ ...g, [sub.id]: { ...g[sub.id], feedback: e.target.value } }))} placeholder="ملاحظتك على الدفتر..." className={`${inputCls} py-2 text-sm`} />
                    <Button onClick={() => saveGrade(sub)} variant="primary" className="px-4 py-2 text-xs"><Save size={14} /> حفظ التقييم</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </Shell>
  );
}

/* =========================================================================
   أقسام الإدارة المنفصلة — كل قسم صفحة مستقلة من نفس المنظومة
========================================================================= */

function TeacherExamsPage() {
  return (
    <CurriculumManagerPage
      onlyTab="exams"
      hero={{
        eyebrow: 'بنك الاختبارات',
        title: 'إدارة الاختبارات',
        body: 'أنشئ اختبارات تفاعلية بأسئلتها وخياراتها وشروحاتها — ووجّهها لصف وقسم محددين.',
      }}
    />
  );
}

function TeacherAssignmentsPage() {
  return (
    <CurriculumManagerPage
      onlyTab="assignments"
      hero={{
        eyebrow: 'التكليفات والمتابعة',
        title: 'إدارة الواجبات',
        body: 'واجبات وتكليفات لكل صف — حدد الوحدة والموعد والنقاط والقسم المستهدف.',
      }}
    />
  );
}

function TeacherAnnouncementsPage() {
  return (
    <CurriculumManagerPage
      onlyTab="notes"
      hero={{
        eyebrow: 'صوتك يصلهم',
        title: 'إدارة الإعلانات',
        body: 'انشر توجيهاتك وإعلاناتك — لصف معين أو للجميع، ولقسم محدد عند تقسيم الصف.',
      }}
    />
  );
}

/* =========================================================================
   صفحة الدرس الكاملة — بدون نوافذ (المحتوى مدمج + اختبار النهاية)
========================================================================= */

function StudentLessonPage() {
  const params = useParams();
  const courseId = (params as any)?.courseId;
  const lessonId = (params as any)?.lessonId;
  const [, setLocation] = useLocation();
  const { student } = useStudentGradeTerm();
  const [course, setCourse] = useState<any>(null);
  const [lesson, setLesson] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [inQuiz, setInQuiz] = useState(false);
  const [quizLocked, setQuizLocked] = useState(false);
  const [completedMsg, setCompletedMsg] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    setInQuiz(false);
    setQuizLocked(false);
    (async () => {
      try {
        const [ls, cs] = await Promise.all([
          jsonFetch(`/api/curriculum/lessons/${lessonId}`),
          jsonFetch('/api/curriculum/courses'),
        ]);
        if (!live) return;
        setLesson(ls);
        const c = (Array.isArray(cs) ? cs : []).find((x: any) => x.id === (ls.course_id || courseId));
        setCourse(c || null);
        if (student?.id) {
          const g = ls.grade || 'الصف العاشر';
          const list = await jsonFetch(`/api/curriculum/assessments?grade=${encodeURIComponent(g)}&student=1&student_id=${student.id}`);
          if (!live) return;
          const hit = (Array.isArray(list) ? list : []).find((a: any) => a.lessonId === lessonId);
          if (hit) setExam(hit);
        }
      } catch {
        if (live) setLesson(null);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId, student?.id]);

  const markComplete = async () => {
    try {
      await fetch(`/api/lessons/${lessonId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: student?.id }),
      });
      setCompletedMsg('تم حفظ إنجازك للدرس بنجاح! 🎉');
      setTimeout(() => setCompletedMsg(''), 4000);
    } catch { /* تجاهل */ }
  };

  const TypeIcon = lessonTypeIcon(lesson?.lessonType || 'مطالعة');

  return (
    <Shell mode="student">
      <button type="button" onClick={() => setLocation('/student/courses')} className="mb-5 inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-primary shadow-sm transition-colors hover:bg-secondary" data-testid="button-back-courses">
        <ChevronRight size={16} /> عودة للوحدات التعليمية
      </button>

      {loading ? <StateNotice type="loading" /> : !lesson ? (
        <StateNotice type="empty" />
      ) : inQuiz && exam ? (
        <div dir="rtl">
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground"><Target size={20} /></span>
            <div>
              <p className="text-sm font-extrabold text-primary">اختبار درس: {lesson.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">🔒 لا يمكن مراجعة الدرس حتى تسليم الإجابات — والوقت مستمر حتى مع التحديث</p>
            </div>
          </div>
          <QuizRunner
            key={exam.id}
            assessment={exam}
            onClose={() => { setInQuiz(false); setQuizLocked(false); }}
            onFinished={() => { setQuizLocked(false); markComplete(); }}
          />
        </div>
      ) : (
        <article dir="rtl">
          {/* ترويسة الدرس */}
          <header className="relative overflow-hidden rounded-[2rem] shadow-xl">
            {lesson.coverUrl ? (
              <img src={lesson.coverUrl} alt={lesson.title} className="h-56 w-full object-cover sm:h-72" />
            ) : (
              <div className="h-44 bg-gradient-to-l from-[#0d2926] via-[#17413f] to-[#25655f] sm:h-56" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 right-0 left-0 flex items-end gap-4 p-5 sm:p-7">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent text-[#3a2c07] shadow-xl"><TypeIcon size={26} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-accent">{lesson.lessonType} · {course?.title || lesson.grade}</p>
                <h1 className="mt-1 font-display text-2xl font-extrabold leading-snug text-white sm:text-3xl">{lesson.title}</h1>
              </div>
            </div>
          </header>

          {completedMsg ? (
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/15 p-4 text-sm font-bold text-green-800">
              <CheckCircle2 size={18} /> {completedMsg}
            </div>
          ) : null}

          {/* المحتوى المدمج الكامل */}
          <div className="mt-5">
            <LessonViewerBody
              lesson={lesson}
              exam={exam}
              onStartExam={() => { if (exam) { setInQuiz(true); setQuizLocked(true); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
            />
          </div>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Button onClick={markComplete} variant="primary" className="flex-1 py-3.5" data-testid="button-complete-lesson-page">
              <Check size={17} /> إكمال الدرس وتسجيل التقدم
            </Button>
            {exam && !inQuiz ? (
              <Button onClick={() => { setInQuiz(true); setQuizLocked(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} variant="soft" className="flex-1 py-3.5">
                <Target size={17} /> اختبار الدرس ({exam.questions} أسئلة)
              </Button>
            ) : null}
          </div>
        </article>
      )}
    </Shell>
  );
}

/* =========================================================================
   ROUTING & ROOT APP
========================================================================= */

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/auth/complete" component={CompleteProfilePage} />
        <Route path="/student" component={StudentDashboardNew} />
        <Route path="/student/courses" component={StudentCoursesPage} />
        <Route path="/student/courses/:courseId/lessons/:lessonId" component={StudentLessonPage} />
        <Route path="/student/summaries" component={StudentSummariesPage} />
        <Route path="/student/notebook" component={StudentNotebookPage} />
        <Route path="/student/assignments" component={AssignmentsPage} />
        <Route path="/student/assessments" component={AssessmentsPage} />
        <Route path="/student/profile" component={ProfilePage} />
        <Route path="/teacher" component={TeacherDashboardNew} />
        <Route path="/teacher/students" component={StudentsPage} />
        <Route path="/teacher/content" component={CurriculumManagerPage} />
        <Route path="/teacher/exams" component={TeacherExamsPage} />
        <Route path="/teacher/assignments" component={TeacherAssignmentsPage} />
        <Route path="/teacher/announcements" component={TeacherAnnouncementsPage} />
        <Route path="/teacher/notebooks" component={TeacherNotebooksPage} />
        <Route path="/teacher/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;