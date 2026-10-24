// @ts-nocheck
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
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
  useRequestPasswordReset,
  useUpdateTeacherSettings,
  getGetGoogleAuthUrlQueryKey,
} from '@workspace/api-client-react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
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
  Copy,
  ClipboardCheck,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode2,
  FileText,
  GraduationCap,
  Castle,
  HelpCircle,
  ImagePlus,
  Landmark,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Leaf,
  Link2,
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
  MinusCircle,
  MoreHorizontal,
  NotebookPen,
  NotebookText,
  Pause,
  Pencil,
  Play,
  Package,
  Phone,
  PlayCircle,
  Printer,
  ScrollText,
  Sprout,
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
  Video,
  X,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import NotFound from '@/pages/not-found';
import {
  downloadWorkbook,
  downloadCsv,
  type SheetSpec,
} from '@/lib/xlsx';
import {
  buildStudentsReport,
  groupStudents,
  groupRows,
  normalizeText,
  reportFileName,
  type ReportStudent,
  type ReportBundle,
} from '@/lib/students-report';
import {
  isBundleUrl,
  isArchiveFileName,
  loadBundleHtml,
  uploadBundleDirect,
  buildUploadDiag,
  formatUploadDiag,
  resolveLessonHtml,
  type BuiltSite,
  type UploadDiag,
} from '@/lib/site-bundle';
import {
  extractRawArchive,
  classifyAndPrepare,
  ensureSourceEngine,
  buildSourceBundle,
  packSourceContainer,
  unpackSourceContainer,
  healSourceJs,
  buildSourceSrcdoc,
  uploadSourceContainer,
  deleteStoredUrl,
  findSiteEntry,
  ESBUILD_WASM_CDN,
  isSourceBundleUrl,
  SOURCE_LIMITS,
  type SourceContainer,
} from '@/lib/source-build';

// تخفيف استهلاك Supabase: لا إعادة جلب مع كل تركيز نافذة، وصلاحية 3 دقائق للبيانات
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

async function jsonFetch(path: string, options?: { method?: string; body?: unknown }): Promise<any> {
  const res = await fetch(path, {
    method: options?.method || 'GET',
    headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || 'حدث خطأ غير متوقع.') as Error & { status?: number };
    err.status = res.status;
    return Promise.reject(err);
  }
  return data;
}

async function fetchAuthMe(): Promise<any> {
  return jsonFetch('/api/auth/me');
}

/* ═══════════════════════════════════════════════════════════════════════
   حساب الرقابة — «الإدارة للرقابة فقط»
   دور profiles.role = observer: يدخل بوابة الإدارة كاملةً، يرى كل الأقسام
   عدا «إدارة المنصة» و«إعداد التأسيس»، ولا يجد زر إضافة أو تعديل أو حذف.
   الحماية الحقيقية على الخادم (blockObserverWrites) — هنا نحمي الواجهة.
   ═══════════════════════════════════════════════════════════════════════ */
const OBSERVER_ROLE = 'observer';

/** من يقف في بوابة الإدارة: المعلم الكامل أو حساب الرقابة */
const isStaffRole = (role: unknown) => role === 'admin' || role === OBSERVER_ROLE;

/** الأقسام التي لا تظهر لحساب الرقابة: إدارة المنصة + إعداد التأسيس */
const OBSERVER_BLOCKED_PATHS = ['/teacher/foundation', '/teacher/settings'];
const isObserverBlockedPath = (path: string) =>
  OBSERVER_BLOCKED_PATHS.some((p) => path === p || path.startsWith(p + '/'));

/* ═══════════════════════════════════════════════════════════════════════
   هوية كل إدارة على حدة
   صاحب المنصة (بريد الإدارة المعتمد) يرث هوية المنصة العامة — صورة
   الأستاذ واسمه. أما أي إدارة أخرى فهويتها من ملفها هي: اسمها وصورتها
   في profiles (full_name + avatar_url) — فالصورة تخصّها وحدها.
   ═══════════════════════════════════════════════════════════════════════ */
const STAFF_FALLBACK_NAME = 'المعلم أحمد يحيى الأسطل';
const STAFF_FALLBACK_SHORT = 'الأستاذ أحمد';
const STAFF_FALLBACK_IMAGE = '/teacher-ahmed.jpg';

/* هوية من سجّل الدخول الآن — اسمه وصورته من ملفه.
   صاحب المنصة (isOwner) يرث هوية المنصة العامة، وغيره يأخذ اسم نفسه.
   النتيجة مُخزّنة دقيقة واحدة: الصفحة تسأل مرتين (الشريط + اللوحة). */
let staffIdentityCache: { at: number; data: any } | null = null;
const STAFF_IDENTITY_TTL = 60 * 1000;

function useStaffIdentity() {
  const [me, setMe] = useState<any>(() => staffIdentityCache?.data || null);
  useEffect(() => {
    if (staffIdentityCache && Date.now() - staffIdentityCache.at < STAFF_IDENTITY_TTL) {
      setMe(staffIdentityCache.data);
      return;
    }
    let cancelled = false;
    fetchAuthMe()
      .then((d) => {
        if (cancelled) return;
        if (d?.authenticated) staffIdentityCache = { at: Date.now(), data: d };
        setMe(d);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return me;
}

/** الاسم الذي يظهر للمدير الحالي: «مشرف الرقابة» / اسمها / اسم صاحب المنصة */
function staffDisplayName(me: any, identity: any): string {
  const own = String(me?.user?.fullName || '').trim();
  if (own && me?.isOwner === false) return own;
  return identity?.teacherName || STAFF_FALLBACK_NAME;
}

/** الاسم المختصر لرأس الصفحة */
function staffDisplayShort(me: any, identity: any): string {
  const own = String(me?.user?.fullName || '').trim();
  if (own && me?.isOwner === false) return own.split(' ').slice(0, 2).join(' ');
  return STAFF_FALLBACK_SHORT;
}

/* ═══════════════════════════════════════════════════════════════════════
   روابط العودة (return-URL): طالب يفتح رابط واجب/اختبار وهو خارج الدخول
   يُحفظ مساره، وبعد تسجيل الدخول أو إنشاء الحساب (بريد أو Google) يرجع
   لنفس الصفحة مباشرة بدل الصفحة الرئيسية. تُحفظ في sessionStorage فتبقى
   حتى مع رحلة Google ذهاباً وإياباً.
   ═══════════════════════════════════════════════════════════════════════ */
const RETURN_URL_KEY = 'ard-return-url';

function isSafeReturnUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !v.startsWith('/')) return false;
  if (v.startsWith('//')) return false;
  if (/[\\]/.test(v)) return false;
  // الداخل فقط: صفحات الطالب المسموحة — لا لوحات ولا API ولا روابط خارجية
  return /^\/(student|auth\/complete)(\/|$|\?)/.test(v);
}

/** تُستدعى قبل رمي المستخدم لصفحة الدخول — تحفظ أين كان */
function saveReturnUrl(path?: string) {
  try {
    const current = path ?? `${window.location.pathname}${window.location.search}`;
    if (isSafeReturnUrl(current)) sessionStorage.setItem(RETURN_URL_KEY, current);
  } catch { /* تجاهل */ }
}

/** تُستهلك مرة واحدة بعد نجاح الدخول — ثم تُمسح */
function takeReturnUrl(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_URL_KEY);
    sessionStorage.removeItem(RETURN_URL_KEY);
    return isSafeReturnUrl(v) ? v : null;
  } catch { return null; }
}

/** اذهب للدخول مع حفظ الرجوع — تُستخدم بدل setLocation('/login') المباشر */
function goLogin(setLocation: (to: string) => void) {
  saveReturnUrl();
  setLocation('/login');
}

/** اذهب لإنشاء حساب مع حفظ الرجوع */
function goRegister(setLocation: (to: string) => void) {
  saveReturnUrl();
  setLocation('/register');
}

function redirectAfterAuth(setLocation: (to: string) => void, fallback = '/student') {
  const next = takeReturnUrl();
  fetchAuthMe()
    .then((me) => {
      if (!me.authenticated) { setLocation(fallback); return; }
      if (me.needsSetup) { setLocation('/auth/complete'); return; }
      if (isStaffRole(me.role)) { setLocation('/teacher'); return; }
      setLocation(next && next.startsWith('/student') ? next : fallback);
    })
    .catch(() => setLocation(fallback));
}

/* ═══════════════════════════════════════════════════════════════════════
   نسخ روابط المشاركة: زر واحد يعطي رابطاً مباشراً للطالب.
   ═══════════════════════════════════════════════════════════════════════ */
async function copyShareLink(path: string): Promise<{ ok: boolean; url: string }> {
  const url = `${window.location.origin}${path}`;
  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, url };
  } catch { /* fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return { ok: true, url };
  } catch {
    return { ok: false, url };
  }
}
/* بطاقة بوابة الدخول: تُعرض عند محاولة التسليم بلا جلسة — زرّا دخول/حساب
   يحفظان الرجوع أولاً فيدخل الطالب ويكمل من حيث توقف بسرعة. */
function LoginGate({ title, compact = false }: { title?: string; compact?: boolean }) {
  const [, setLocation] = useLocation();
  return (
    <div className={`overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-b from-accent/15 to-card ${compact ? 'p-4' : 'p-6'} text-center`} data-testid="login-gate">
      <span className={`mx-auto grid place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md ${compact ? 'mb-3 h-12 w-12' : 'mb-4 h-16 w-16'}`}>
        <LogOut size={compact ? 20 : 26} className="-scale-x-100" />
      </span>
      <p className="font-display text-lg font-extrabold text-primary">{title || 'هذه الصفحة للطلاب المسجلين'}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-muted-foreground">
        يجب عليك تسجيل الدخول أو إنشاء حساب للمتابعة — وبعد الدخول نرجعك إلى هنا مباشرة.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          onClick={() => goLogin(setLocation)}
          className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-primary px-6 text-sm font-extrabold text-primary-foreground shadow-md transition-all hover:-translate-y-0.5 active:scale-[.98]"
          data-testid="button-gate-login"
        >
          تسجيل الدخول <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => goRegister(setLocation)}
          className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl border-2 border-border bg-card px-6 text-sm font-extrabold text-primary transition-colors hover:border-primary/40"
          data-testid="button-gate-register"
        >
          إنشاء حساب جديد
        </button>
      </div>
    </div>
  );
}
/* زر نسخ رابط الطالب: يعطي المعلم رابطاً مباشراً يفتح العنصر بوجه الطالب.
   ينسخ للذاكرة مع إشارة نجاح، وإن تعذّر النسخ يعرض الرابط للنسخ اليدوي. */
function CopyLinkButton({ path, testId, title, className = '' }: {
  path: string; testId?: string; title?: string; className?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return (
    <button
      type="button"
      title={title || 'نسخ رابط الطالب المباشر'}
      data-testid={testId}
      onClick={async () => {
        const r = await copyShareLink(path);
        if (r.ok) {
          setDone(true);
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setDone(false), 2200);
        } else {
          window.prompt('انسخ رابط الطالب:', r.url);
        }
      }}
      className={`inline-flex items-center justify-center gap-1.5 transition-all active:scale-95 ${done ? 'bg-green-600 text-white shadow' : ''} ${className}`}
    >
      {done ? <Check size={15} /> : <Link2 size={15} />}
      {done ? 'تم النسخ!' : null}
    </button>
  );
}

/* بطاقة بوابة الدخول: تُعرض عند محاولة التسليم بلا جلسة — زرّا دخول/حساب
   يحفظان الرجوع أولاً فيدخل الطالب ويكمل من حيث توقف بسرعة. */
const teacherImageUrl = '/teacher-ahmed.jpg';
const APP_VERSION = 'v25.10-SRC';
/* الشعار رمز بلا نص (أسد + مصحف + الأقصى + صورة الأستاذ + زهرة).
   الاسم يُعرض كنص حقيقي بجواره — فالنص المطبوخ داخل الصورة كان
   يظهر مصغّراً غير مقروء إلى جانب الاسم فيصير الازدحام والازدواج. */
const platformLogoUrl = '/ard-al-lughah-emblem.png';
const platformBannerUrl = '/ard-al-lughah-banner.png';
const bookNineUrl = '/arab-9.jpg';
const bookTenUrl = '/arab-10.jpg';

/* =========================================================================
   هوية المنصة الحية — من قاعدة البيانات إلى كل الموقع فوراً
   (اسم المنصة، اسم/صورة/نبذة المعلم، اللون، الفصل)
========================================================================= */
const DEFAULT_IDENTITY = {
  platformName: 'أرض اللغة',
  teacherName: 'المعلم أحمد يحيى الأسطل',
  teacherBio: 'معلم اللغة العربية والتربية الإسلامية والقرآن الكريم.',
  teacherImageUrl: '/teacher-ahmed.jpg',
  accentColor: '#d7b65e',
  semester: 'الفصل الأول',
};

function usePlatformIdentity() {
  const q = useQuery({
    queryKey: ['platform-identity'],
    queryFn: () => jsonFetch('/api/platform/identity'),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  return { ...DEFAULT_IDENTITY, ...(q.data || {}) };
}

/* رابط المشاركة الثابت — يُلحق بصفحة الجذر في كل مرة نشر */
const OG_IMAGE = `${(typeof window !== 'undefined' && window.location.origin) || 'https://arabicc.vercel.app'}/og-image.jpg?v=3`;

/** يضبط وسماً بالخصية والمحتوى (يحدث إن وُجد وإلا ينشئه) */
function setMeta(attr: 'property' | 'name', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** مزامنة عنوان الصفحة ولون المتصفح وهوستها مع هوية المنصة */
function useIdentityHead() {
  const id = usePlatformIdentity();
  const [location] = useLocation();
  useEffect(() => {
    try {
      // عنوان ووصف مخصّصان لكل قسم: نسخة الرابط في واتساب/ديسكورد تعرض الاسم الصحيح
      const isHome = location === '/';
      const seg = isHome
        ? ''
        : (modeOfPath(location) ? ` | ${modeOfPath(location)}` : '');
      const pageTitle = isHome
        ? `${id.platformName} | منصة اللغة العربية والقرآن الكريم في فلسطين`
        : `${id.platformName}${seg}`;
      document.title = pageTitle;

      const desc = isHome
        ? `${id.platformName} — مدرسة فلسطينية للغة العربية والقرآن الكريم مع ${id.teacherName}.`
        : `${seg.replace(/^ \| /, '')} — ${id.platformName} مع ${id.teacherName}.`;
      setMeta('name', 'description', desc);

      // صورة المشاركة: تُثبَّت على كل المسارات فيبقى البانر ظاهراً مهما كان الرابط
      const url = `${window.location.origin}${location}`;
      setMeta('property', 'og:title', pageTitle);
      setMeta('property', 'og:description', desc);
      setMeta('property', 'og:url', url);
      setMeta('property', 'og:image', OG_IMAGE);
      setMeta('property', 'og:image:secure_url', OG_IMAGE);
      setMeta('property', 'og:image:width', '1200');
      setMeta('property', 'og:image:height', '630');
      setMeta('name', 'twitter:image', OG_IMAGE);
      setMeta('name', 'twitter:title', pageTitle);
      setMeta('name', 'twitter:description', desc);
      setMeta('name', 'twitter:card', 'summary_large_image');

      setMeta('name', 'theme-color', '#0d2926');
    } catch { /* تجاهل */ }
  }, [id.platformName, id.teacherName, location]);
}

/** اسم القسم من مساره — لمشاركة وصف مفيد لا رابطاً عاماً */
function modeOfPath(path: string): string {
  if (path.startsWith('/teacher')) return 'بوابة المعلم';
  if (path.startsWith('/student')) return 'بوابة الطالب';
  if (path.startsWith('/login')) return 'تسجيل الدخول';
  if (path.startsWith('/register')) return 'حساب جديد';
  return '';
}

const resourceTabs = [
  { id: 'quizzes', label: 'بنك الاختبارات', icon: Target, description: 'تقييمات حقيقية على المنصة' },
  { id: 'downloads', label: 'المكتبة الرقمية', icon: Download, description: 'الكتب المعتمدة القابلة للقراءة والتحميل' },
  { id: 'grammar', label: 'الوحدات التعليمية', icon: BookMarked, description: 'وحدات المنهاج بترتيبها الرسمي' },
] as const;

const navStudentBase = [
  { href: '/student', label: 'نظرة عامة', icon: LayoutDashboard },
  { href: '/student/courses', label: 'الوحدات التعليمية', icon: BookOpen },
  { href: '/student/foundation', label: 'التأسيس', icon: Sprout, gated: true },
  { href: '/student/summaries', label: 'الملخصات وأوراق العمل', icon: FileText },
  { href: '/student/notebook', label: 'دفتري', icon: NotebookPen },
  { href: '/student/assessments', label: 'التقييمات', icon: Target },
  { href: '/student/assignments', label: 'الواجبات', icon: ClipboardCheck },
  { href: '/student/announcements', label: 'الإعلانات', icon: Bell },
  { href: '/student/profile', label: 'ملفي الشخصي', icon: UserRound },
];

const navTeacher = [
  { href: '/teacher', label: 'لوحة المتابعة', icon: LayoutDashboard },
  { href: '/teacher/students', label: 'الطلاب', icon: UsersRound },
  { href: '/teacher/foundation', label: 'إعداد التأسيس', icon: Sprout },
  { href: '/teacher/content', label: 'المنهاج والوحدات', icon: Library },
  { href: '/teacher/summaries', label: 'الملخصات وأوراق العمل', icon: FileText },
  { href: '/teacher/books', label: 'الكتب المدرسية', icon: BookOpen },
  { href: '/teacher/exams', label: 'الاختبارات', icon: Target },
  { href: '/teacher/assignments', label: 'الواجبات', icon: ClipboardCheck },
  { href: '/teacher/notebooks', label: 'مهام الدفتر', icon: NotebookPen },
  { href: '/teacher/report', label: 'كشف العلامات', icon: Award },
  { href: '/teacher/announcements', label: 'الإعلانات', icon: Bell },
  { href: '/teacher/settings', label: 'هوية المنصة', icon: Settings },
];

/* ── بوابة "التأسيس": لا يظهر في قائمة الطالب إلا لمن أُضيف إلى قسم فعلاً ──
   الطلب يمرّ على خادم مُصادَق (requireAuth) ويعيد أقسام هذا الطالب وحده.
   النتيجة مُربوطة بمعرّف الحساب في ذاكرة دقيقة واحدة: لا تتسرّب بين حسابين،
   وتظهر إضافة الطالب فوراً بلا إبطاء. */
const foundationNavCache = new Map<string, { at: number; count: number }>();

function useFoundationNavCount(enabled: boolean, userKey: string): number {
  const [count, setCount] = useState<number>(-1);
  useEffect(() => {
    if (!enabled || !userKey) return;
    const hit = foundationNavCache.get(userKey);
    if (hit && Date.now() - hit.at < 60 * 1000) {
      setCount(hit.count);
      return;
    }
    let live = true;
    jsonFetch('/api/foundation/sections')
      .then((d) => {
        const n = Array.isArray(d) ? d.length : 0;
        if (foundationNavCache.size > 200) foundationNavCache.clear();
        foundationNavCache.set(userKey, { at: Date.now(), count: n });
        if (live) setCount(n);
      })
      .catch(() => { if (live) setCount(0); });
    return () => { live = false; };
  }, [enabled, userKey]);
  return count;
}

/* =========================================================================
   منظومة المنهاج — ثوابت مشتركة
   الصفوف والمدارس لم تعد هنا ثابتة: صارت تُقرأ من قاعدة البيانات عبر
   useCatalog() فيستطيع الأستاذ	add/delete/reorder من الإعدادات فتظهر
   في كل شاشات النظام فوراً. الثوابت التالية احتياط لCaso فشل الطلب فقط.
   ========================================================================= */
const FALLBACK_GRADES = ['الصف الثامن', 'الصف التاسع', 'الصف العاشر'];
const FALLBACK_SCHOOLS = ['مدرسة وايلد', 'مبادرة أهرامات الأمل'];
const TERMS = ['الفصل الأول', 'الفصل الثاني'];

/* قوائم حيّة محدَّثة من قاعدة البيانات عند كل تحميل كتالوج.
   كل مكوّن يقرأها يستدعي useCatalog() أولاً ليعيد الرسم فور تغيّرها. */
let GRADES: string[] = [...FALLBACK_GRADES];
let SCHOOLS: string[] = [...FALLBACK_SCHOOLS];

type CatalogGrade = { id: string; name: string; sortOrder: number; color: string; isActive: boolean; genderSplit: boolean; schools: string[]; schoolIds: string[]; students: number };
type CatalogSchool = { id: string; name: string; sortOrder: number; color: string; isActive: boolean; grades: string[]; students: number };

const FALLBACK_CATALOG = {
  grades: FALLBACK_GRADES.map((name, i) => ({
    id: `grade-${i + 8}`, name, sortOrder: i + 1, color: '#17413f', isActive: true,
    genderSplit: false, schools: FALLBACK_SCHOOLS.slice(), schoolIds: ['school-wild', 'school-ahramat'], students: 0,
  })) as CatalogGrade[],
  schools: FALLBACK_SCHOOLS.map((name, i) => ({
    id: `school-${i}`, name, sortOrder: i + 1, color: '#6a1b9a', isActive: true,
    grades: FALLBACK_GRADES.slice(), students: 0,
  })) as CatalogSchool[],
};

/**
 * قائمة الصفوف والمدارس الحيّة — تُستخدم في التسجيل وإكمال الحساب.
 * تقرأ من الكتالوج مباشرة فيظهر أي صف أو مدرسة أضافه الأستاذ فوراً.
 * تعرض "جارٍ التحميل" بدل قائمة وهمية حتى يصل Catalog.
 */
function LiveSelectField({ name, label, kind, placeholder, testId }: {
  name: string; label: string; kind: 'grade' | 'school'; placeholder?: string; testId?: string;
}) {
  const cat = useCatalog();
  const options = kind === 'grade' ? cat.gradeNames : cat.schoolNames;
  if (!options.length) {
    return (
      <label className="block text-sm font-semibold">
        <span className="mb-2 block">{label}</span>
        <span className="flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-3 text-sm text-muted-foreground">
          <RefreshCw size={15} className="animate-spin" /> جارٍ تحميل {kind === 'grade' ? 'الصفوف' : 'المدارس'}...
        </span>
      </label>
    );
  }
  return <SelectField name={name} label={label} options={options} testId={testId || name} />;
}

/* =========================================================================
   كتالوج حيّ — مصدر واحد للصفوف والمدارس في كل الموقع
   ========================================================================= */
let catalogCache: { at: number; data: typeof FALLBACK_CATALOG } | null = null;
const CATALOG_TTL = 60 * 1000;
/** يُستدعى بعد أي تعديل على الكتالوج حتى لا ننتظر دقيقة */
let catalogBust = 0;

function useCatalog(enabled = true) {
  const [data, setData] = useState<typeof FALLBACK_CATALOG>(
    () => catalogCache?.data || FALLBACK_CATALOG,
  );
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!!catalogCache);

  const reload = async (force = false) => {
    if (!enabled) return;
    if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL) {
      setData(catalogCache.data);
      setReady(true);
      return;
    }
    setLoading(true);
    try {
      const d = await jsonFetch('/api/org/catalog');
      const next = {
        grades: Array.isArray(d?.grades) && d.grades.length ? d.grades : FALLBACK_CATALOG.grades,
        schools: Array.isArray(d?.schools) && d.schools.length ? d.schools : FALLBACK_CATALOG.schools,
      };
      catalogCache = { at: Date.now(), data: next };
      setData(next);
      // نشر القوائم الحيّة لكل_component يقرأها
      const activeGrades = next.grades.filter((g) => g.isActive).map((g) => g.name);
      const activeSchools = next.schools.filter((s) => s.isActive).map((s) => s.name);
      if (activeGrades.length) GRADES = activeGrades;
      if (activeSchools.length) SCHOOLS = activeSchools;
    } catch {
      // لا نكسر أي شاشة — نكمل بالافتراضي وننبّه الاستاذ بالكتالوج في الإعدادات
      if (!catalogCache) { setData(FALLBACK_CATALOG); GRADES = [...FALLBACK_GRADES]; SCHOOLS = [...FALLBACK_SCHOOLS]; }
    } finally {
      setLoading(false);
      setReady(true);
    }
  };

  useEffect(() => { reload(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [enabled, catalogBust]);

  const gradeNames = useMemo(() => data.grades.filter((g) => g.isActive).map((g) => g.name), [data]);
  const schoolNames = useMemo(() => data.schools.filter((s) => s.isActive).map((s) => s.name), [data]);

  return {
    grades: data.grades,
    schools: data.schools,
    gradeNames,
    schoolNames,
    loading,
    ready,
    reload,
    /** مدارس صف معيّن — إن كانت أكثر من واحدة نعرض منتقي المدرسة */
    schoolsOfGrade: useCallback((gradeName?: string): string[] => {
      // "الجميع" = كل المدارس: نحتاجها حتى يمكن إعلان لمدرسة واحدة بكل الصفوف.
      if (!gradeName || gradeName === 'الجميع') {
        const all = new Set<string>();
        for (const g of data.grades) for (const s of (g.schools || [])) if (s) all.add(s);
        return [...all];
      }
      const g = data.grades.find((x) => x.name === gradeName);
      return g?.schools?.length ? g.schools : [];
    }, [data]),
    gradeOf: useCallback((name?: string) => data.grades.find((g) => g.name === name), [data]),
  };
}

/** يبطل ذاكرة الكتالوج بعد الحفظ حتى تظهر التغييرات فوراً */
export function bustCatalog() {
  catalogBust++;
  catalogCache = null;
}

/** تطبيع مطابق للسيرفر — فلا يتكرر الصف باسم مختلف */
function foldGrade(v: any): string {
  return String(v ?? '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[\s_\-]+/g, ' ')
    .trim()
    .toLowerCase();
}

/* =========================================================================
   منتقي الصف + المدرسة — قلب النظام الجديد
   صف في سطر، وتحته مباشرةً المدرسة (تظهر فقط إن كان للصف أكثر من مدرسة).
   يُستخدم في كل مكان يختار فيه الأستاذ لِمن يصل المحتوى.
   ========================================================================= */
function GradeSchoolPicker({ grade, school, onGrade, onSchool, allowAllGrades, showCounts = true, compact = false }: {
  grade: string;
  school: string;
  onGrade: (v: string) => void;
  onSchool: (v: string) => void;
  allowAllGrades?: boolean;
  showCounts?: boolean;
  compact?: boolean;
}) {
  const cat = useCatalog();
  const grades = allowAllGrades ? ['الجميع', ...cat.gradeNames] : cat.gradeNames;
  const options = cat.schoolsOfGrade(grade);
  const multiSchool = options.length > 1;

  return (
    <div className="space-y-3">
      {/* ── الصف ── */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
          <GraduationCap size={16} className="text-primary" /> الصف الدراسي
        </p>
        <div className="flex flex-wrap gap-2">
          {grades.map((g) => {
            const on = foldGrade(grade) === foldGrade(g);
            const meta = g === 'الجميع' ? null : cat.gradeOf(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => {
                  onGrade(g);
                  // الصف تغيّر ⇒ المدرسة القديمة قد لا تنتمي له — نرجّعها للجميع
                  if (g !== 'الجميع') {
                    const opts = cat.schoolsOfGrade(g);
                    if (opts.length && !opts.some((o) => foldGrade(o) === foldGrade(school))) onSchool('');
                  } else {
                    onSchool('');
                  }
                }}
                className={`min-h-[${compact ? '48' : '52'}px] rounded-2xl px-5 text-sm font-extrabold transition-all active:scale-[.97] ${on ? 'text-white shadow-md' : 'border-2 border-border bg-card text-muted-foreground active:bg-secondary'}`}
                style={on ? { background: meta?.color || '#17413f' } : undefined}
                data-testid={`gs-grade-${g}`}
              >
                {g}
                {showCounts && meta && meta.students > 0 ? (
                  <span className={`mr-1.5 tabular-nums ${on ? 'opacity-80' : 'opacity-60'}`}>({meta.students})</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── المدرسة: تظهر تحت الصف مباشرةً، فقط إن كان له أكثر من مدرسة ── */}
      {grade && grade !== 'الجميع' && options.length > 0 ? (
        <div className="animate-fade-up">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
            <Landmark size={16} className="text-[#6a1b9a]" /> المدرسة
            <span className="rounded-lg bg-secondary px-2 py-0.5 text-[11px] font-extrabold text-muted-foreground">
              {multiSchool ? `${options.length} مدارس لهذا الصف` : 'مدرسة واحدة'}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSchool('')}
              className={`min-h-[48px] rounded-2xl px-5 text-sm font-extrabold transition-all active:scale-[.97] ${!school ? 'bg-[#6a1b9a] text-white shadow-md' : 'border-2 border-border bg-card text-muted-foreground active:bg-secondary'}`}
              data-testid="gs-school-all"
            >
              كل المدارس
            </button>
            {options.map((s) => {
              const on = foldGrade(school) === foldGrade(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSchool(s)}
                  className={`inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-5 text-sm font-extrabold transition-all active:scale-[.97] ${on ? 'bg-[#6a1b9a] text-white shadow-md' : 'border-2 border-border bg-card text-muted-foreground active:bg-secondary'}`}
                  data-testid={`gs-school-${s}`}
                >
                  {on ? <Check size={15} /> : null}
                  {s}
                </button>
              );
            })}
          </div>
          {school ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <Lock size={12} /> سيظهر هذا المحتوى لطلاب «{school}» فقط في {grade}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** صف واحد من منتقي المدرسة — يُدرج مباشرة تحت اختيار القسم في كل نموذج */
function SchoolTargetField({ grade, value, onChange }: { grade: string; value: string; onChange: (v: string) => void }) {
  const cat = useCatalog();
  const options = cat.schoolsOfGrade(grade);
  if (!options.length || !grade) return null;
  return (
    <div className="mt-4 animate-fade-up">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Landmark size={16} className="text-[#6a1b9a]" /> المدرسة المستهدفة
        <span className="rounded-lg bg-secondary px-2 py-0.5 text-[11px] font-extrabold text-muted-foreground">
          {options.length} مدارس في {grade}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange('')}
          className={`min-h-[48px] rounded-2xl px-5 text-sm font-extrabold transition-all active:scale-[.97] ${!value ? 'bg-[#6a1b9a] text-white shadow-md' : 'border-2 border-border bg-background text-muted-foreground active:bg-secondary'}`}
          data-testid="school-target-all"
        >
          كل مدارس الصف
        </button>
        {options.map((s) => {
          const on = foldGrade(s) === foldGrade(value);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className={`inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-5 text-sm font-extrabold transition-all active:scale-[.97] ${on ? 'bg-[#6a1b9a] text-white shadow-md' : 'border-2 border-border bg-background text-muted-foreground active:bg-secondary'}`}
              data-testid={`school-target-${s}`}
            >
              {on ? <Check size={15} /> : null}
              {s}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        <Lock size={12} />
        {value
          ? `يراه طلاب «${value}» في ${grade} فقط — غيرهم لا يظهر لهم.`
          : 'سيظهر لكل طلاب هذا الصف في كل مدارسه.'}
      </p>
    </div>
  );
}

/** نسخة `<select>` للصف لل Places التي Forms صغيرة (تسجيل/ملف) */
function CatalogGradeSelect({ name, value, onChange, testId, label, placeholder }: {
  name: string; value: string; onChange: (v: string) => void; testId?: string; label?: string; placeholder?: string;
}) {
  const cat = useCatalog();
  const schools = cat.schoolsOfGrade(value);
  return (
    <div className="space-y-2">
      {label ? <span className="mb-2 block text-sm font-semibold">{label}</span> : null}
      <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} data-testid={testId}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {cat.gradeNames.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      {schools.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {schools.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className={`min-h-[40px] rounded-xl px-3.5 text-xs font-extrabold ${value === s ? 'bg-[#6a1b9a] text-white' : 'border-2 border-border bg-card text-muted-foreground'}`}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
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

/** رفع ملف إلى التخزين السحابي (ImageKit) — النص فقط يبقى في Supabase.
 *  الصور تُضغط تلقائياً أولاً (حد Vercel للإنتاج 4.5MB — بدونه تفشل الصور الكبيرة على الموقع وتنجح محلياً). */
async function uploadFileToCloud(file: File, folder: string): Promise<any> {
  const isImage = file.type.startsWith('image/');
  const dataUrl = isImage ? await compressImageFile(file) : await fileToDataUrl(file);
  if (!dataUrl) throw new Error('تعذر قراءة الملف — حاول مجدداً');
  // حارس الحجم: لا ترسل طلباً سيفشل حتماً على الإنتاج — رسالة واضحة بدل خطأ مبهم
  // حد الحجم: 3.2MB للصور، 10MB للمستندات الأخرى
  const sizeLimit = file.type.startsWith('image/') ? 3_200_000 : 10_000_000;
  if (dataUrl.length > sizeLimit) {
    throw new Error(file.type.startsWith('image/') ? 'الصورة كبيرة جداً حتى بعد الضغط — اختر صورة أصغر أو التقط بجودة أقل' : 'الملف كبير جداً (الحد الأقصى 10MB) — اختر ملفاً أصغر أو اضغطه أولاً');
  }
  return jsonFetch('/api/teacher/upload', {
    method: 'POST',
    body: { file: dataUrl, fileName: file.name, folder },
  });
}

function isCloudUrl(url?: string) {
  return !!url && url.startsWith('https://ik.imagekit.io/');
}

/* ═══════════════════════════════════════════════════════════════════════
   رفع فيديوهات الدروس — Cloudinary مباشرة من المتصفح.
   ───────────────────────────────────────────────────────────────────────
   لماذا مباشرة؟ ملف 20 دقيقة (مئات الميجا) لا يمر عبر Vercel إطلاقاً —
   المتصفح يرفعه إلى Cloudinary بالمقاطع (20MB للمقطع)، والسيرفر يعطيه
   توقيعاً مؤقتاً فقط. السر لا يغادر الخادم أبداً.
   الضغط: رابط العرض يُبنى بتحويلات (f_mp4,vc_h264,q_auto:low,w_960) —
   نفس الفيديو بنسخة خفيفة جداً تعمل على الآيباد والهاتف.
   التبديل: إن فشل الحساب الأول يُطلب توقيع الثاني تلقائياً ويُعاد الرفع.
   ═══════════════════════════════════════════════════════════════════════ */
const CLOUDINARY_DELIVERY = 'f_mp4,vc_h264,q_auto:low,w_960';

/** رابط العرض المضغوط من أي رابط Cloudinary خام — مطابِق لمنطق السيرفر */
function cloudinaryDeliveryUrl(rawUrl: string): string {
  const raw = String(rawUrl || '').trim();
  const m = raw.match(/^https?:\/\/res\.cloudinary\.com\/([^/]+)\/video\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i);
  if (!m) return raw;
  const [, cloud, publicId] = m;
  if (!cloud || !publicId) return raw;
  return `https://res.cloudinary.com/${cloud}/video/upload/${CLOUDINARY_DELIVERY}/${publicId}.mp4`;
}

function formatMega(bytes: number): string {
  if (!bytes) return '0MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)}GB` : `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
}

/** رفع مقطع واحد — يُستدعى لكل شريحة في الرفع المقطّع */
function postChunk(args: {
  uploadUrl: string; params: Record<string, string>; blob: Blob; fileName: string;
  uploadId: string; range?: string; onProgress: (loaded: number) => void; signal?: AbortSignal;
}): Promise<any> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(args.params)) form.append(k, v);
    form.append('file', args.blob, args.fileName);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', args.uploadUrl);
    xhr.setRequestHeader('X-Unique-Upload-Id', args.uploadId);
    if (args.range) xhr.setRequestHeader('Content-Range', args.range);
    if (args.signal) {
      args.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) args.onProgress(e.loaded); };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && !data.error) resolve(data);
        else reject(new Error(data?.error?.message || `فشل الرفع (${xhr.status})`));
      } catch { reject(new Error('رد غير مفهوم من خادم الفيديو')); }
    };
    xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع — تحقق من الإنترنت'));
    xhr.onabort = () => reject(new Error('أُلغي الرفع'));
    xhr.send(form);
  });
}

async function uploadVideoToCloudinary(
  file: File,
  onProgress: (sent: number, total: number, accountLabel: string) => void,
  signal?: AbortSignal,
): Promise<{ url: string; publicId: string; bytes: number; accountLabel: string; cloud: string }> {
  if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(file.name)) {
    throw new Error('اختر ملف فيديو صالحاً (mp4 أو webm أو mov)');
  }

  // 1) توقيع من السيرفر — يختار الحساب السليم (الأول، وإلا الثاني تلقائياً)
  const signOnce = async (failedCloud?: string) => {
    if (!failedCloud) {
      return jsonFetch(`/api/teacher/cloudinary/sign?${new URLSearchParams({ filename: file.name }).toString()}`);
    }
    return jsonFetch('/api/teacher/cloudinary/failover', {
      method: 'POST',
      body: { failedCloud, filename: file.name },
    });
  };

  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const sign = await signOnce(attempt === 0 ? undefined : (lastError as any)?.__cloud);
    const params: Record<string, string> = {
      api_key: String(sign.apiKey),
      timestamp: String(sign.timestamp),
      signature: String(sign.signature),
      folder: String(sign.folder || 'ard-al-lughah/videos'),
      filename_override: file.name.slice(0, 120),
      use_filename: 'true',
      unique_filename: 'true',
      overwrite: 'false',
    };
    const uploadId = `ard-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const CHUNK = 20 * 1024 * 1024;
    try {
      let sentBase = 0;
      let result: any = null;
      if (file.size <= CHUNK) {
        result = await postChunk({
          uploadUrl: sign.uploadUrl, params, blob: file, fileName: file.name,
          uploadId, onProgress: (l) => onProgress(l, file.size, sign.accountLabel), signal,
        });
      } else {
        // الرفع المقطّع: شرائح 20MB — فيديو 20 دقيقة يُرفع بأمان مهما كبر
        for (let start = 0; start < file.size; start += CHUNK) {
          const end = Math.min(start + CHUNK, file.size);
          const slice = file.slice(start, end, file.type || 'video/mp4');
          result = await postChunk({
            uploadUrl: sign.uploadUrl, params, blob: slice, fileName: file.name,
            uploadId, range: `bytes ${start}-${end - 1}/${file.size}`,
            onProgress: (l) => onProgress(sentBase + l, file.size, sign.accountLabel), signal,
          });
          sentBase = end;
        }
      }
      const secureUrl = String(result?.secure_url || '');
      if (!secureUrl) throw new Error('اكتمل الرفع بلا رابط — حاول مجدداً');
      return {
        url: cloudinaryDeliveryUrl(secureUrl),
        publicId: String(result?.public_id || ''),
        bytes: Number(result?.bytes || file.size),
        accountLabel: String(sign.accountLabel || ''),
        cloud: String(sign.cloud || ''),
      };
    } catch (err: any) {
      lastError = err;
      (lastError as any).__cloud = sign.cloud;
      if (signal?.aborted) throw err;
      if (attempt === 0) continue; // جرّب الحساب الثاني تلقائياً
      throw err;
    }
  }
  throw lastError || new Error('تعذر الرفع');
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
  const school = (dash.data?.student?.school as string) || '';
  const term = liveSemester || (overview.data as any)?.semester || 'الفصل الأول';
  const split = splitMap[grade] === true;
  const gender = dash.data?.student?.gender || '';
  return { grade, school, term, split, splitMap, gender, student: dash.data?.student, studentId: dash.data?.student?.id };
}

/** شارة تعريفية: الصف والفصل والقسم المعتمدين تلقائياً */
function GradeTermBadge({ grade, term, split, gender, school }: { grade: string; term: string; split?: boolean; gender?: string; school?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm">
        <GraduationCap size={16} /> {grade}
      </span>
      {school ? (
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#6a1b9a] to-[#8a508f] px-4 py-2.5 text-sm font-bold text-white shadow-sm" title="مدرستك">
          <Landmark size={16} /> {school}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground shadow-sm">
        <BookOpen size={16} /> {term}
      </span>
      {split && (gender === 'طالب' || gender === 'طالبة') ? (
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#17413f] to-[#2a7a72] px-4 py-2.5 text-sm font-bold text-white shadow-sm">
          <UsersRound size={16} /> {gender === 'طالب' ? 'قسم الطلاب' : 'قسم الطالبات'}
        </span>
      ) : null}
      <span className="text-xs text-muted-foreground">صفك ومدرستك من حسابك — والفصل يحدده الأستاذ من الإعدادات</span>
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

/** رفع صور الطالب (الدفاتر) إلى مجلد مخصص سحابياً — مع ضغط تلقائي لصور الجوال الضخمة */
async function uploadStudentPhoto(file: File): Promise<any> {
  const dataUrl = await compressImageFile(file);
  return jsonFetch('/api/student/upload', {
    method: 'POST',
    body: { file: dataUrl, fileName: file.name },
  });
}

/** ضغط صورة على الجهاز (أقصى ضلع 1600px بجودة JPEG 82%) — يسرّع الرفع ويمنع فشله.
 *  عند أي خطأ يُرجع الصورة الأصلية كما هي بدل منع الرفع. */
function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      fileToDataUrl(file).then(resolve).catch(() => resolve(''));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width || 1, img.height || 1));
        // صغيرة أصلاً؟ أرسلها كما هي بلا إعادة ترميز
        if (scale >= 1 && file.size < 900 * 1024) {
          URL.revokeObjectURL(url);
          fileToDataUrl(file).then(resolve).catch(() => resolve(''));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no-ctx');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        URL.revokeObjectURL(url);
        fileToDataUrl(file).then(resolve).catch(() => resolve(''));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fileToDataUrl(file).then(resolve).catch(() => resolve(''));
    };
    img.src = url;
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
  // الرمز الجديد يملأ المربّع كله (الشعار القديم كان الرسم 60% والنص تحته،
  // فكان الرسم مصغّراً وغير مقروء) — لذلك مقاسات أصغر وأوضح الآن.
  const imgClass = compact ? 'h-11 w-11' : size === 'lg' ? 'h-16 w-16 lg:h-20 lg:w-20' : 'h-12 w-12';
  const textClass = compact ? 'text-lg' : size === 'lg' ? 'text-2xl lg:text-3xl' : 'text-xl';
  const id = usePlatformIdentity();
  return (
    <Link href="/" className="inline-flex min-w-0 items-center gap-2.5" data-testid="link-brand">
      <img
        src={platformLogoUrl}
        alt={`شعار ${id.platformName}`}
        className={`${imgClass} shrink-0 rounded-2xl object-contain ring-1 ring-black/5`}
      />
      <span className={`${textClass} truncate font-display font-bold tracking-tight text-primary`}>{id.platformName}</span>
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

// توجيه فوري: من دخل الموقع وهو مسجل يُنقل لحسابه علطول (رئيسية/دخول/تسجيل)
function useRedirectIfAuthenticated() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    let cancelled = false;
    fetchAuthMe()
      .then((me) => {
        if (cancelled || !me?.authenticated) return;
        if (me.needsSetup) { setLocation('/auth/complete'); return; }
        if (me.needsSetup) { setLocation('/auth/complete'); return; }
        if (isStaffRole(me.role)) { setLocation('/teacher'); return; }
        const back = takeReturnUrl();
        setLocation(back && back.startsWith('/student') ? back : '/student');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [setLocation]);
}

function Home() {
  useRedirectIfAuthenticated();
  const overview = useGetPlatformOverview();
  const platform = overview.data;
  // الهوية الحية من الإعدادات أولاً (تتحدث فور حفظ الأستاذ)، ثم نظرة المنصة، ثم الثوابت
  const identity = usePlatformIdentity();
  const tName = identity.teacherName !== DEFAULT_IDENTITY.teacherName || !platform?.teacherName ? identity.teacherName : (platform?.teacherName ?? identity.teacherName);
  const tImg = identity.teacherImageUrl !== DEFAULT_IDENTITY.teacherImageUrl || !platform?.settings?.teacherImageUrl ? identity.teacherImageUrl : (platform?.settings?.teacherImageUrl ?? identity.teacherImageUrl);
  const pName = identity.platformName;
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
                {pName}
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
                <span>محتوى مرتب للصفوف الثامن والتاسع والعاشر</span>
                <span className="hidden h-1 w-1 rounded-full bg-accent sm:block" />
                <span className="flex items-center gap-1.5 font-semibold text-primary">
                  <CheckCircle2 size={16} className="text-accent-foreground" /> تعلّم بثقة
                </span>
              </div>
            </div>
            <div className="relative order-1 animate-rise [animation-delay:120ms] lg:order-2">
              {/* الصورة PNG شفافة — بلا إطار ولا خلفية ولا قصّ.
                  (البانر السابق JPEG بنسبة 2.34 وكان يحتاج حاوية؛
                   هذا 1.34 شفافة فلا يحتاج شيئاً سوى ظل خفيف.) */}
              <img
                src={platformBannerUrl}
                width={1452}
                height={1083}
                alt="أرض اللغة — منصة عربية للتعلم من قلب فلسطين مع الأستاذ أحمد يحيى الأسطل"
                className="mx-auto block w-full max-w-xl select-none object-contain drop-shadow-[0_20px_45px_rgba(23,65,63,.22)]"
                data-testid="img-platform-banner"
              />
              <span className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full bg-primary/95 px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-sm backdrop-blur-sm" data-testid="badge-hero-semester">
                <BookOpen size={13} className="text-accent" /> كتب {semester}
              </span>
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
                سلسلة اللغة العربية للصفوف الثامن والتاسع والعاشر في {semester}، مرتبة لتقرأ وتفهم وتطبّق بثقة — ويمكنك تحميل كل كتاب بنسخته الرقمية.
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-accent/45 bg-card px-3 py-1 text-xs font-bold text-primary shadow-sm" data-testid="badge-books-semester">
                <BookOpen size={13} className="text-accent-foreground" /> كتب {semester} المعتمدة
              </div>
              <Link href="/register" className="mt-7 inline-flex items-center gap-2 font-semibold text-primary hover:text-accent-foreground" data-testid="link-books-register">
                ابدأ مع كتبك <ArrowLeft size={17} />
              </Link>
            </div>
            {/* سلسلة الكتب الثلاثة — مروحة أغلفة فوق بعضها مائلة.
                كتاب الثامن يظهر من ملفات الموقع مباشرة حتى قبل إضافته للقاعدة. */}
            {(() => {
              const withPdf = (g: string) => currentTermBooks.find((b) => b.grade === g && b.pdfUrl);
              const static8 = semester === 'الفصل الأول'
                ? { id: 'static-8', grade: 'الصف الثامن', term: semester, title: 'كتاب اللغة العربية - الصف الثامن', coverUrl: '/books/arabic-8-term1.jpg', pdfUrl: '/books/arabic-8-term1.pdf' }
                : null;
              const fan = [
                { book: withPdf('الصف الثامن') || static8, tone: 'gold' as const },
                { book: withPdf('الصف التاسع'), tone: 'purple' as const },
                { book: withPdf('الصف العاشر'), tone: 'rose' as const },
              ].filter((x) => x.book);
              if (!fan.length) {
                return (
                  <div className="grid gap-6 sm:grid-cols-3 sm:gap-4 lg:gap-5">
                    {semester === 'الفصل الأول' ? (
                      <div className="-rotate-3 transition-transform duration-300 hover:rotate-0"><BookCover image="/books/arabic-8-term1.jpg" grade="الصف الثامن" title="اللغة العربية" subtitle="المسار الأكاديمي" tone="gold" /></div>
                    ) : null}
                    <div className="sm:-translate-y-2"><BookCover image={bookNineUrl} grade="الجزء الأول · ٠٩" title="اللغة العربية" subtitle="المسار الأكاديمي" tone="purple" /></div>
                    <div className="rotate-3 transition-transform duration-300 hover:rotate-0"><BookCover image={bookTenUrl} grade="الجزء الأول · ١٠" title="اللغة العربية" subtitle="المسار الأكاديمي" tone="rose" /></div>
                  </div>
                );
              }
              return <BookFan items={fan} />;
            })()}
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
              <img src={tImg} alt={tName} className="h-full w-full object-cover object-[center_18%]" data-testid="img-teacher-public" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/25 to-transparent" />
              <div className="absolute bottom-7 right-7 left-7">
                <p className="text-sm text-primary-foreground/70">معلم لغة عربية مدرّس</p>
                <h2 className="mt-1 font-display text-3xl font-bold">{tName}</h2>
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
                <span className="font-display text-xl text-primary">{tName}</span>
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
                <p className="mt-4 max-w-2xl leading-8 text-muted-foreground">واجبات حقيقية على المنصة بتواريخ استحقاق واضحة، لتبقى متابعة لصفوفك الثامن والتاسع والعاشر بلا أوراق ضائعة.</p>
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

/* مروحة الكتب الثلاثة — أغلفة فوق بعضها مائلة، والاختيار يعرض التفاصيل والأزرار */
function BookFan({ items }: { items: { book: any; tone: 'purple' | 'rose' | 'gold' }[] }) {
  const [sel, setSel] = useState(0);
  const idx = Math.min(sel, items.length - 1);
  const current = items[idx];
  const tilt = (i: number) => {
    const n = items.length;
    if (n === 1) return '';
    if (i === 0) return '-rotate-[10deg] translate-y-3';
    if (i === n - 1) return 'rotate-[10deg] translate-y-3';
    return '-translate-y-2';
  };
  return (
    <div>
      <div className="flex items-end justify-center pt-4" dir="ltr">
        {items.map((it, i) => (
          <button
            key={it.book.id || it.book.grade}
            type="button"
            onClick={() => setSel(i)}
            title={it.book.title}
            className={`relative w-32 shrink-0 overflow-hidden rounded-2xl border-4 shadow-2xl transition-all duration-300 hover:-translate-y-2 hover:rotate-0 sm:w-48 lg:w-56 ${i > 0 ? '-ml-8 sm:-ml-12' : ''} ${tilt(i)} ${i === idx ? 'z-30 scale-[1.05] border-accent' : 'z-10 border-white/70'}`}
            data-testid={`fan-book-${it.book.grade}`}
          >
            <img src={it.book.coverUrl} alt={it.book.title} className="aspect-[3/4] w-full bg-muted object-cover" />
            <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-extrabold text-white backdrop-blur-md" dir="rtl">{it.book.grade}</span>
            {i === idx ? <span className="absolute inset-x-0 bottom-0 h-1.5 bg-accent" /> : null}
          </button>
        ))}
      </div>
      <div className="mx-auto mt-6 max-w-xl overflow-hidden rounded-3xl border border-accent/35 bg-gradient-to-l from-accent/20 via-card to-card p-5 shadow-lg sm:p-6" dir="rtl">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold">
          <span className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">{current.book.grade}</span>
          <span className="rounded-lg bg-secondary px-3 py-1.5 text-primary">{current.book.term}</span>
        </div>
        <p className="mt-3 font-display text-xl font-extrabold leading-snug text-primary">{current.book.title}</p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">المقرر الرسمي المعتمد · مفتوح للقراءة والتحميل</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <a href={current.book.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-extrabold text-[#3a2c07] shadow-md transition-all hover:-translate-y-0.5 hover:shadow-xl" data-testid={`link-open-book-${current.book.grade}`}>
            <BookOpen size={17} /> إظهار الكتاب وقراءته
          </a>
          <a href={current.book.pdfUrl} download={`${current.book.title}.pdf`} className="inline-flex items-center gap-2 rounded-xl border-2 border-primary/20 bg-card px-6 py-3 text-sm font-extrabold text-primary transition-all hover:-translate-y-0.5 hover:border-primary/50" data-testid={`link-dl-book-${current.book.grade}`}>
            <Download size={17} /> تنزيل الكتاب PDF
          </a>
        </div>
      </div>
    </div>
  );
}

function HomeBookCard({ book, tone }: { book: any; tone: 'purple' | 'rose' | 'gold' }) {
  const tones = {
    purple: 'from-[#2d2040]/80 via-transparent',
    rose: 'from-[#3d263f]/80 via-transparent',
    gold: 'from-[#382b13]/85 via-transparent',
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
  useRedirectIfAuthenticated();
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
        onSuccess: () => { resetAuthGate(); redirectAfterAuth(setLocation); },
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

/* =========================================================================
   إنشاء الحساب — تسجيل مباشر بلا كود تأكيد
   — المزوّدون المسموحون (السيرفر هو المرجع، وهذا فحص مبكر لتجربة أسرع)
   — الطلب يذهب إلى /auth/register فينشأ الحساب وتدخل الجلسة في خطوة واحدة.
   ========================================================================= */
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com'];
const ALLOWED_EMAIL_FAMILIES = ['hotmail.', 'outlook.', 'live.', 'msn.'];

function emailDomainProblem(raw: string): string {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!email) return 'اكتب بريدك الإلكتروني أولاً.';
  if (!/^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return 'صيغة البريد غير صحيحة. مثال صحيح: name@gmail.com';
  const domain = email.slice(email.lastIndexOf('@') + 1);
  const allowed = ALLOWED_EMAIL_DOMAINS.includes(domain) || ALLOWED_EMAIL_FAMILIES.some((prefix) => domain.startsWith(prefix));
  if (!allowed) return 'التسجيل مسموح ببريد Gmail أو Hotmail أو Outlook فقط.';
  return '';
}

function Register() {
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
  const [, setLocation] = useLocation();
  useRedirectIfAuthenticated();
  const google = useGetGoogleAuthUrl({ query: { enabled: false, queryKey: getGetGoogleAuthUrlQueryKey() } });
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const continueWithGoogle = async () => {
    const result = await google.refetch();
    if (result.data?.url) window.location.assign(result.data.url);
    else setMessage('تسجيل الدخول باستخدام Google غير مفعّل حالياً.');
  };

  // الطلب يذهب مباشرةً للسيرفر: حساب + جلسة في خطوة واحدة، بلا صفحة كود.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fullName = String(data.get('fullName') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    setMessage('');
    if (fullName.length < 3) {
      setMessage('اسم المستخدم إلزامي — اكتب اسمك الثلاثي أو الرباعي (3 أحرف على الأقل).');
      return;
    }
    const emailProblem = emailDomainProblem(email);
    if (emailProblem) {
      setMessage(emailProblem);
      return;
    }

    setSending(true);
    jsonFetch('/api/auth/register', {
      method: 'POST',
      body: {
        fullName,
        email,
        password: String(data.get('password') ?? ''),
        studentNumber: '',
        school: String(data.get('school') ?? ''),
        branch: 'المسار الأكاديمي',
        grade: String(data.get('grade') ?? ''),
        section: 'أ',
        gender: String(data.get('gender') ?? ''),
        phone: String(data.get('phone') ?? ''),
      },
    })
      .then(() => {
        resetAuthGate();
        redirectAfterAuth(setLocation);
      })
      .catch((err: Error) => {
        setSending(false);
        setMessage(err?.message || 'تعذّر إنشاء الحساب. حاول بعد قليل.');
      });
  };

  return (
    <AuthLayout title="انضم لأرض اللغة" eyebrow="حساب طالب جديد">
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field name="fullName" label="الاسم الكامل (اسم المستخدم)" placeholder="اكتب الاسم الثلاثي أو الرباعي — إلزامي" testId="input-name" />
        <div>
          <Field name="email" label="البريد الإلكتروني" type="email" placeholder="name@gmail.com" testId="input-register-email" />
          <p className="mt-2 flex items-center gap-2 px-1 text-xs font-semibold leading-5 text-muted-foreground" data-testid="hint-verify-email">
            <Mail size={13} className="shrink-0 text-primary" /> بريد Gmail أو Hotmail أو Outlook فقط — هذا هو بريد دخولك.
          </p>
        </div>
        <Field name="password" label="كلمة المرور (6 خانات على الأقل)" type="password" placeholder="••••••••" testId="input-register-password" />
        <div className="grid gap-4 sm:grid-cols-2">
          <LiveSelectField name="school" label="المدرسة" kind="school" testId="select-school" />
          <LiveSelectField name="grade" label="الصف الدراسي" kind="grade" testId="select-grade" />
          <SelectField name="gender" label="الجنس" options={['طالب', 'طالبة']} testId="select-gender" />
          <Field name="phone" label="رقم الهاتف (اختياري)" placeholder="059xxxxxxx" testId="input-phone" />
        </div>
        <label className="flex items-start gap-2 pt-1 text-xs leading-5 text-muted-foreground">
          <input type="checkbox" required className="mt-1 accent-primary" /> أوافق على الالتزام بمتابعة الدروس والتكليفات وفق توجيهات الأستاذ أحمد الأسطل.
        </label>
        <div className="flex items-start gap-2 rounded-2xl border border-border bg-secondary/50 px-4 py-3 text-xs font-semibold leading-6 text-muted-foreground">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />
          حسابك يُفتح فور ضغط زر الإنشاء — تدخل مساحتك مباشرة بكلمة المرور التي تكتبها.
        </div>
        {message && (
          <div className="rounded-xl bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground font-semibold">
            <p>{message}</p>
            {message.includes('مسجّل') && (
              <Link href="/login" className="mt-2 inline-flex items-center gap-1.5 font-extrabold text-primary hover:underline" data-testid="link-login-duplicate">
                سجّل دخولك بهذا البريد <ArrowLeft size={14} />
              </Link>
            )}
          </div>
        )}
        <Button type="submit" disabled={sending} className="mt-2 w-full py-3.5" data-testid="button-register">
          {sending ? (
            <><RefreshCw size={17} className="animate-spin" /> جارٍ إنشاء حسابك...</>
          ) : (
            <>إنشاء الحساب والدخول <ArrowLeft size={17} /></>
          )}
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

/** رابط قديم من صفحة التأكيد — التسجيل صار مباشراً فنعيد الطالب لصفحة التسجيل. */
function LegacyVerifyRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/register', { replace: true }); }, [setLocation]);
  return (
    <AuthLayout title="جارٍ تحويلك" eyebrow="تسجيل حساب جديد">
      <div className="mt-8 flex items-center gap-3 rounded-2xl bg-secondary p-5 text-sm leading-7 text-muted-foreground">
        <RefreshCw className="h-5 w-5 shrink-0 animate-spin text-primary" /> التسجيل مباشر الآن — بلا كود تأكيد.
      </div>
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
          if (cancelled) return;
          resetAuthGate();
          if (result.needsSetup) { setLocation('/auth/complete'); return; }
          // التوجيه حسب الدور من السيرفر: الأدمن → /teacher مباشرة، والطالب → رابطه المحفوظ أو صفحته
          redirectAfterAuth(setLocation);
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
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
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
          <LiveSelectField name="grade" label="الصف الدراسي" kind="grade" testId="select-complete-grade" />
          <LiveSelectField name="school" label="المدرسة" kind="school" testId="select-complete-school" />
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

// ذاكرة بوابة الدخول: تحقق واحد صالح لـ 5 دقائق بدل شاشة "نتحقق..." مع كل صفحة
let authGateCache: { mode: string; at: number } | null = null;
const AUTH_GATE_TTL = 5 * 60 * 1000;
export function resetAuthGate() { authGateCache = null; staffIdentityCache = null; }

// حلقة تجديد الجلسة: تنعش التوكن كل 45 دقيقة طالما الموقع مفتوح (جلسة تدوم 30 يوماً)
let refreshTimer: ReturnType<typeof setInterval> | null = null;
function ensureRefreshLoop() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    fetch('/api/auth/refresh', { method: 'POST' }).catch(() => undefined);
  }, 45 * 60 * 1000);
}

/* ═══════════════════════════════════════════════════════════════════════
   وضع الرقابة — إبطال أدوات الكتابة في الواجهة كلها
   القاعدة التي طلبها الأستاذ: «يشوف فقط». فكل ما يضيف أو يعدّل أو يحذف
   يُزال من الصفحة، وكل حقل يصير للقراءة فقط، وكل نموذج لا يُرسَل.
   التنقل والتبويبات والخروج تبقى: لذلك يُستثنى ما يحمل data-ro="keep".
   ─────────────────────────────────────────────────────────────────────────
   تنبيه مهم: هذا تجديد للواجهة فقط. الضمان الحقيقي على الخادم
   (blockObserverWrites) — فحتى لو تسلّل زر واحد فالخادم يرفضه.
   ═══════════════════════════════════════════════════════════════════════ */
const RO_WRITE_ICONS = [
  'lucide-pencil', 'lucide-trash-2', 'lucide-plus', 'lucide-save', 'lucide-upload',
  'lucide-image-plus', 'lucide-minus-circle', 'lucide-camera', 'lucide-pen',
  'lucide-eraser', 'lucide-list-plus', 'lucide-folder-plus', 'lucide-file-plus',
];

const RO_WRITE_WORDS = [
  'إضافة', 'اضافة', 'اضافه', 'أضف', 'اضف',
  'تعديل', 'حذف', 'احذف',
  'حفظ', 'احفظ', 'رفع', 'ارفع',
  'نشر', 'انشر', 'إرسال', 'ارسل',
  'ترقية', 'دمج', 'تعطيل', 'تغيير', 'إعادة تعيين',
  'غياب', 'حضور', 'خصم', 'ترحيل',
  'إضافة طالب', 'سجل طالب', 'تسجيل طالب', 'مفتاح', 'كلمة المرور', 'نسخ إلى',
  'add ', 'edit', 'delete', 'save', 'upload', 'remove', 'create', 'publish', 'submit', 'confirm',
];

function roIsWriteControl(el: Element): boolean {
  if (el.closest('[data-ro="keep"]')) return false;
  for (const cls of RO_WRITE_ICONS) {
    if (el.querySelector(`svg.${cls}`)) return true;
  }
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!text || text.length > 60) return false;
  return RO_WRITE_WORDS.some((w) => text.includes(w));
}

function useReadOnlyDom(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let queued = false;
    const hide = (el: Element | null) => {
      if (!el || el.getAttribute('data-ro-hidden')) return;
      (el as HTMLElement).style.setProperty('display', 'none', 'important');
      el.setAttribute('data-ro-hidden', '1');
    };
    const scan = () => {
      queued = false;
      const root = document.querySelector('[data-ro-root]');
      if (!root) return;
      root.querySelectorAll('button, [role="button"]').forEach((el) => {
        if (roIsWriteControl(el)) hide(el);
      });
      root.querySelectorAll('input[type="file"]').forEach((el) => {
        hide(el.closest('label') || el.parentElement);
      });
      root.querySelectorAll('input, textarea, select').forEach((raw) => {
        const node = raw as HTMLInputElement;
        if (node.type === 'file') return;
        if (node.tagName === 'SELECT' || node.type === 'checkbox' || node.type === 'radio') node.disabled = true;
        else node.readOnly = true;
      });
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      window.setTimeout(scan, 60);
    };
    scan();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    // لا نموذج يُرسَل في وضع الرقابة — حتى لو ظهر زر بلا اسم معروف
    const onSubmit = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener('submit', onSubmit, true);
    return () => {
      mo.disconnect();
      document.removeEventListener('submit', onSubmit, true);
    };
  }, [active]);
}

// ذاكرة الإشعارات لجلسة التصفح — جلب واحد بدل جلب مع كل صفحة
let notifCache: { at: number; items: any[] } | null = null;

function Shell({ mode, children }: { mode: 'student' | 'teacher'; children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  // الإشعارات: إعلانات الأستاذ — تُجلب مرة واحدة وتُحدَّث عند الفتح
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>(() => notifCache?.items || []);
  const [notifLoading, setNotifLoading] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ard-ann-seen') || '[]'); } catch { return []; }
  });
  // إغلاق القوائم تلقائياً عند التنقل — حتى لا تغطي المحتوى والنوافذ
  useEffect(() => { setMobileMenu(false); setDrawerClosing(false); setProfileMenu(false); setNotifOpen(false); }, [location]);

  // درج الأقسام على الهاتف: إغلاق متحرك + منع تمرير الخلفية خلفه.
  // نبقي العنصر مركّباً أثناء خروج الأنيميشن ثم نزيله تماماً.
  const closeDrawer = useCallback(() => {
    setDrawerClosing(true);
    document.body.style.overflow = '';
    window.setTimeout(() => { setMobileMenu(false); setDrawerClosing(false); }, 300);
  }, []);
  const openDrawer = useCallback(() => { setDrawerClosing(false); setMobileMenu(true); }, []);
  useEffect(() => {
    if (!mobileMenu) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenu]);
  // زر الهروب يغلق الدرج — سلوك متوقّع على الحاسوب واللوحي.
  useEffect(() => {
    if (!mobileMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenu, closeDrawer]);
  const logout = useLogoutAccount();
  const studentDash = useGetStudentDashboard();
  // هوية من سجّل الدخول: صورته واسمه من ملفه
  const meIdentity = useStaffIdentity();
  const meAvatar = String(meIdentity?.user?.avatarUrl || '');
  const dashAvatar = studentDash.data?.student?.avatarUrl || '';
  const identity = usePlatformIdentity();

  // بوابة الدخول: تحقق واحد يُحفظ 5 دقائق — لا شاشة تحقق مع كل تنقل
  const [authReady, setAuthReady] = useState(false);
  // حساب الرقابة: يمرّ من نفس البوابة بلا صلاحية كتابة واحدة
  const [roMode, setRoMode] = useState(false);

  // هوية هذا الإدخال: صاحب المنصة يرث الهوية العامة، وغيره يأخذ اسمه وصورته
  const isOwner = meIdentity?.isOwner !== false;
  const staffImage = roMode
    ? '/supervisor.svg'
    : (isOwner
        ? (identity.teacherImageUrl || teacherImageUrl)
        : (meAvatar || identity.teacherImageUrl || teacherImageUrl));
  const avatarSrc = mode === 'teacher' ? staffImage : dashAvatar || meAvatar || undefined;

  useEffect(() => {
    ensureRefreshLoop();
    let cancelled = false;
    const decide = (me: any): boolean => {
      if (!me?.authenticated) return false;
      setRoMode(me.role === OBSERVER_ROLE);
      if (mode === 'student') {
        if (me.needsSetup) { setLocation('/auth/complete'); return false; }
        if (isStaffRole(me.role)) { setLocation('/teacher'); return false; }
        return true;
      }
      if (!isStaffRole(me.role)) { setLocation('/student'); return false; }
      return true;
    };
    const fresh = authGateCache && authGateCache.mode === mode && Date.now() - authGateCache.at < AUTH_GATE_TTL;
    if (fresh) {
      // دخول فوري بلا شاشة + إعادة تحقق صامتة لا تطرد عند عطل الشبكة
      setAuthReady(true);
      fetchAuthMe()
        .then((me) => {
          if (cancelled) return;
          if (decide(me)) authGateCache = { mode, at: Date.now() };
        })
        .catch(() => undefined);
    } else {
      fetchAuthMe()
        .then((me) => {
          if (cancelled) return;
          if (decide(me)) {
            authGateCache = { mode, at: Date.now() };
            setAuthReady(true);
          } else if (!me?.authenticated) {
            authGateCache = null;
            goLogin(setLocation);
          }
        })
        .catch(() => {
          // بلا ذاكرة صالحة ولا شبكة: لا نطرد فوراً — نعرض زر إعادة بدل شاشة عالقة
          if (!cancelled && !authGateCache) goLogin(setLocation);
        });
    }
    return () => { cancelled = true; };
  }, [mode, setLocation]);

  const studentName = studentDash.data?.student?.name || '';
  const studentId = (studentDash.data as any)?.student?.id || '';
  const studentGrade = (studentDash.data as any)?.student?.grade || '';

  const fetchNotifs = async (markRead: boolean) => {
    setNotifLoading(true);
    try {
      // الخادم يحلّ هوية الطالب من الجلسة ويفلتر بالصف والمدرسة — فلا نمرّر معرّفاً.
      // تمريره كان يجعل الاستدعاء قبل جاهزية اللوحة يَرِد فارغاً.
      const p = new URLSearchParams();
      const d = await jsonFetch(`/api/curriculum/announcements?${p.toString()}`);
      const list = Array.isArray(d) ? d : [];
      notifCache = { at: Date.now(), items: list };
      setNotifs(list);
      if (markRead && list.length) {
        setSeenIds((prev) => {
          const ids = [...new Set([...prev, ...list.map((n: any) => n.id)])].slice(-120);
          try { localStorage.setItem('ard-ann-seen', JSON.stringify(ids)); } catch { /* تجاهل */ }
          return ids;
        });
      }
    } catch { /* تجاهل — يبقى الجرس صامتاً بدل كسر الصفحة */ } finally { setNotifLoading(false); }
  };
  useEffect(() => {
    // نعيد الجلب عند جهوزية هوية الطالب: الجلب الأول قد سبق التحميل فيرد فارغاً
    if (!authReady) return;
    if (!notifCache || Date.now() - notifCache.at > 2 * 60 * 1000) fetchNotifs(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, studentId, studentGrade]);
  const unreadCount = notifs.filter((n) => !seenIds.includes(n.id)).length;
  const toggleNotifs = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    setProfileMenu(false);
    if (next) fetchNotifs(true);
  };
  const studentSubtitle = [studentDash.data?.student?.grade, studentDash.data?.student?.school].filter(Boolean).join(' · ');

  // قسم "التأسيس" لا يظهر إلا لمن يملك قسماً فعلاً (يفحصه الخادم بعد الدخول)
  const foundationCount = useFoundationNavCount(mode === 'student' && authReady, studentId);
  const links = useMemo(() => {
    const base = mode === 'teacher'
      ? navTeacher
      : (foundationCount > 0 ? navStudentBase : navStudentBase.filter((l: any) => !l.gated));
    // حساب الرقابة: بلا «إدارة المنصة» وبلا «إعداد التأسيس» — قسمان لا يظهران له
    if (!roMode) return base;
    return (base as any[]).filter((l: any) => !isObserverBlockedPath(l.href));
  }, [mode, foundationCount, roMode]);

  // حتى لو دخل برابط مباشر: القسمان المحجوبان يردّانه للوحة المتابعة بلا نقاش
  useEffect(() => {
    if (!authReady || !roMode) return;
    if (isObserverBlockedPath(location)) setLocation('/teacher');
  }, [authReady, roMode, location, setLocation]);

  // إبطال أدوات الكتابة في الواجهة كلها (تفصيلها أسفل الملف)
  useReadOnlyDom(roMode && authReady);

  const active = links.find((link) => location === link.href)?.label ?? links[0].label;

  // اسم هذه الإدارة في الشريط: صاحب المنصة = هوية المنصة، وغيره = اسمه من ملفه
  const staffName = roMode
    ? 'مشرف الرقابة'
    : staffDisplayName(meIdentity, identity);
  const staffShort = roMode
    ? 'مشرف الرقابة'
    : staffDisplayShort(meIdentity, identity);
  const staffCaption = roMode ? 'رقابة واطّلاع فقط' : 'إدارة ومتابعة المنصة';
  const signOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        resetAuthGate();
        queryClient.clear();
        setLocation('/login');
      },
      onError: () => { resetAuthGate(); setLocation('/login'); },
    });
  };

  return (
    <div className={`min-h-[100dvh] bg-background ${roMode ? 'ro-mode' : ''}`} data-ro-root={roMode ? '1' : undefined}>
      {roMode && (
        <div className="relative z-[60] flex flex-wrap items-center justify-center gap-2 bg-[#0d2926] px-4 py-2 text-center text-[12px] font-extrabold text-white" data-testid="readonly-banner">
          <ShieldCheck size={15} className="text-accent" />
          وضع الرقابة — اطّلاع فقط: كل الأقسام ظاهرة بلا زر إضافة أو تعديل أو حذف
        </div>
      )}
      <aside
        className={`drawer-surface fixed inset-y-0 right-0 z-50 flex w-[min(18.5rem,86vw)] flex-col overflow-hidden overflow-y-auto px-3.5 py-4 text-primary shadow-[0_0_60px_-10px_rgba(23,65,63,.35)] no-scrollbar lg:w-72 lg:px-4 lg:py-6 lg:translate-x-0 ${
          mobileMenu
            ? drawerClosing ? 'drawer-panel is-closing' : 'drawer-panel'
            : 'translate-x-full lg:translate-x-0'
        }`}
        data-testid="sidebar-drawer"
      >
        {/* كل ابن هنا shrink-0: بلاه ينتجه المتصفح عند امتلاء الارتفاع
            فتُقصّ بطاقة الرأس والنص الختامي — وهو ما كان يحدث على آيفون. */}
        <div className="relative flex shrink-0 items-center justify-between gap-2">
          {/* الشعار داخل كبسولة بيضاء ليبدو مقصوداً لا عارضاً */}
          <span className="flex min-w-0 items-center gap-2 rounded-2xl bg-white px-2 py-1.5 shadow-sm ring-1 ring-black/5">
            <img src={platformLogoUrl} alt="شعار أرض اللغة" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
            <span className="truncate font-display text-[17px] font-extrabold tracking-tight text-primary">{identity.platformName}</span>
          </span>
          <button onClick={closeDrawer} data-ro="keep" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-primary/70 shadow-sm ring-1 ring-border transition-all hover:bg-secondary hover:text-primary active:scale-90 lg:hidden" data-testid="button-close-menu" aria-label="إغلاق القائمة">
            <X size={19} />
          </button>
        </div>
{/* ── بطاقة الرأس: أخضر غني على سطح فاتح = تباين واضح ── */}
        <div className="drawer-hero relative mt-4 shrink-0 overflow-hidden rounded-[24px] p-3.5">
          <div className="relative flex items-center gap-3">
            <span className="relative shrink-0">
              <span className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-accent to-[#f3d68a] opacity-85 blur-[7px]" />
              <span className="relative block rounded-2xl ring-[3px] ring-accent/90">
                <Avatar name={mode === 'student' ? studentName : (staffName || 'أ')} src={avatarSrc} />
              </span>
              <span className="absolute -bottom-0.5 -left-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border-[3px] border-[#17413f] bg-green-500 text-white shadow">
                <Check size={12} strokeWidth={3.5} />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-extrabold text-white drop-shadow-sm">{mode === 'student' ? studentName : staffName}</p>
              <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-bold text-accent">
                <GraduationCap size={12} />
                {mode === 'student' ? (studentSubtitle || 'بوابة الطالب') : staffCaption}
              </p>
            </div>
          </div>
          {mode === 'student' && (
            <div className="relative mt-4 rounded-2xl bg-black/25 p-2.5 ring-1 ring-white/10">
              <div className="mb-2 flex items-center justify-between text-[10px] font-extrabold text-white/75">
                <span>تقدمك في المنصة</span>
                <span className="tabular-nums text-[13px] text-accent">{Math.round(Number(studentDash.data?.progress ?? 0))}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-[#f3d68a] via-accent to-[#f3d68a] shadow-[0_0_10px_rgba(215,182,94,.6)] transition-[width] duration-700"
                  style={{ width: `${Math.max(6, Math.min(100, Number(studentDash.data?.progress ?? 0)))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── عنوان الأقسام + عدّاد ── */}
        <div className="relative mb-2.5 mt-6 flex shrink-0 items-center gap-2.5 px-1.5">
          <span className="h-5 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-accent to-[#e8c876]" />
          <h2 className="text-[12px] font-extrabold tracking-wide text-primary/70">أقسام المنصة</h2>
          <span className="mr-auto grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary px-2 text-[11px] font-extrabold tabular-nums text-white shadow-sm">{links.length}</span>
        </div>

        <nav className="relative shrink-0 space-y-2">
          {links.map((item, i) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenu(false)}
                style={{ ['--i' as any]: i }}
                className={`drawer-item group relative block shrink-0 overflow-hidden rounded-[20px] border transition-all duration-300 ${
                  isActive
                    ? 'drawer-link-active px-4 py-3.5'
                    : 'drawer-link px-3.5 py-3 hover:-translate-y-0.5'
                }`}
                data-testid={`link-nav-${item.href.replaceAll('/', '-').replace(/^-/, '')}`}
              >
                <span className="relative flex items-center gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-all duration-300 ${
                    isActive
                      ? 'drawer-active-icon bg-white/18 text-accent ring-1 ring-white/25'
                      : 'bg-primary/8 text-primary group-hover:scale-110 group-hover:bg-accent/20 group-hover:text-primary'
                  }`}>
                    <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[15px] font-extrabold transition-colors ${isActive ? 'text-white' : 'text-primary group-hover:text-primary'}`}>
                    {item.label}
                  </span>
                  <ChevronLeft
                    size={17}
                    className={`shrink-0 transition-all duration-300 ${isActive ? 'text-accent' : '-translate-x-1 text-primary/25 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`}
                  />
                </span>
              </Link>
            );
          })}
        </nav>

        {/* ── بطاقة ختامية ── */}
        <div className="relative mt-6 shrink-0 overflow-hidden rounded-[22px] border border-accent/35 bg-gradient-to-bl from-accent/22 via-accent/12 to-transparent p-4">
          <div className="pointer-events-none absolute -left-8 -top-10 h-24 w-24 rounded-full bg-accent/35 blur-2xl" />
          <p className="relative flex items-start gap-2 text-[12px] leading-6 text-primary/75">
            <Quote className="mt-0.5 shrink-0 text-accent" size={15} />
            <span>
              تقدمك اليوم يصنع
              <strong className="font-extrabold text-primary"> فصاحتك وعلو شأنك </strong>
              في لغة القرآن.
            </span>
          </p>
          <div className="relative mt-3.5 h-1.5 overflow-hidden rounded-full bg-primary/10">
            <div className="h-full w-[70%] rounded-full bg-gradient-to-l from-primary via-[#2a7a72] to-accent" />
          </div>
          <p className="relative mt-2.5 text-center font-mono text-[10px] font-bold tracking-wider text-primary/35" dir="ltr">{APP_VERSION}</p>
        </div>
      </aside>

      {mobileMenu && (
        <button
          aria-label="إغلاق القائمة الجانبية"
          onClick={closeDrawer}
          className={`fixed inset-0 z-40 cursor-default bg-primary/45 lg:hidden ${drawerClosing ? 'drawer-backdrop is-closing' : 'drawer-backdrop'}`}
          data-testid="button-close-menu-backdrop"
        />
      )}

      <div className="lg:mr-72">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-border bg-background/95 px-4 shadow-[0_2px_16px_-6px_rgba(0,0,0,0.15)] backdrop-blur-md sm:px-8">
          {/* زر الأقسام: يظهر أعلى اليمين على الهاتف فقط بدل شريط سفلي مزدحم */}
          <button
            onClick={openDrawer}
            aria-label="عرض أقسام المنصة"
            aria-expanded={mobileMenu}
            data-ro="keep"
            className={`group relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg transition-all duration-200 active:scale-90 lg:hidden ${
              mobileMenu ? 'fab-active' : 'fab-pulse'
            } bg-gradient-to-br from-[#17413f] via-[#1d5a56] to-[#2a7a72] ring-1 ring-accent/40`}
            data-testid="button-open-menu"
          >
            <Menu size={21} className="transition-transform duration-300 group-active:rotate-90" />
          </button>
          <div className="min-w-0 flex-1">
            <div>
              <p className="hidden items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> أرض اللغة / {mode === 'student' ? 'بوابة الطالب' : 'بوابة المعلم'}</p>
              <h1 className="truncate bg-gradient-to-l from-primary to-[#3f7d78] bg-clip-text text-base font-extrabold text-transparent sm:text-lg">{active}</h1>
            </div>
          </div>
          <div className="relative flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button onClick={toggleNotifs} title="الإشعارات — إعلانات الأستاذ" data-ro="keep" className={`relative rounded-xl p-2.5 transition-colors hover:bg-muted hover:text-primary ${notifOpen ? 'bg-muted text-primary' : 'text-muted-foreground'}`} data-testid="button-notifications" aria-label="الإشعارات">
              <Bell size={19} />
              {unreadCount > 0 ? (
                <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-extrabold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
              ) : (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
              )}
            </button>
            {notifOpen && (
              <>
                <button aria-label="إغلاق الإشعارات" onClick={() => setNotifOpen(false)} className="fixed inset-0 z-40 cursor-default" />
                <div className="absolute left-0 top-14 z-50 w-[22rem] max-w-[86vw] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-rise">
                  <div className="flex items-center justify-between bg-gradient-to-l from-[#0d2926] to-[#25655f] px-5 py-4 text-white">
                    <p className="flex items-center gap-2 text-sm font-extrabold"><Bell size={16} /> إعلانات الأستاذ</p>
                    {unreadCount > 0 ? <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-extrabold text-[#3a2c07]">{unreadCount} جديدة</span> : null}
                  </div>
                  <div className="max-h-[46vh] overflow-y-auto p-3">
                    {notifLoading && !notifs.length ? (
                      <p className="flex items-center gap-2 px-3 py-6 text-xs font-bold text-muted-foreground"><RefreshCw size={14} className="animate-spin" /> جارٍ تحميل الإعلانات...</p>
                    ) : !notifs.length ? (
                      <p className="px-3 py-8 text-center text-xs leading-6 text-muted-foreground">لا إعلانات بعد — كل جديد من الأستاذ سيظهر هنا فور نشره.</p>
                    ) : (
                      <div className="space-y-2">
                        {notifs.slice(0, 6).map((n: any) => {
                          const fresh = !seenIds.includes(n.id);
                          return (
                            <div key={n.id} className={`rounded-2xl border p-3.5 transition-colors ${fresh ? 'border-accent/50 bg-accent/10' : 'border-border bg-background'}`}>
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-extrabold text-primary">{n.type || 'إعلان'}</span>
                                {fresh ? <span className="h-2 w-2 rounded-full bg-destructive" /> : null}
                                <span className="mr-auto text-[10px] font-bold text-muted-foreground">{n.date}</span>
                              </div>
                              <p className="mt-1.5 truncate text-sm font-extrabold text-primary">{n.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{n.body}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <Link href={mode === 'student' ? '/student/announcements' : '/teacher/announcements'} onClick={() => setNotifOpen(false)} className="flex items-center justify-center gap-2 border-t border-border bg-secondary/40 px-4 py-3.5 text-xs font-extrabold text-primary transition-colors hover:bg-secondary" data-testid="link-all-notifications">
                    عرض كل الإعلانات <ArrowLeft size={14} />
                  </Link>
                </div>
              </>
            )}
            <button onClick={() => setProfileMenu((open) => !open)} data-ro="keep" className="flex items-center gap-2 rounded-xl p-1.5 pl-2.5 ring-2 ring-accent/50 transition-all hover:bg-muted hover:ring-accent sm:pl-3" data-testid="button-profile-menu" aria-label="القائمة الشخصية">
              <Avatar name={mode === 'student' ? studentName : (staffName || 'أ')} src={avatarSrc} size="sm" />
              <span className="hidden text-sm font-semibold sm:block">{mode === 'student' ? studentName.split(' ')[0] : staffShort}</span>
              <ChevronLeft size={15} className={`hidden transition-transform sm:block ${profileMenu ? 'rotate-90' : '-rotate-90'}`} />
            </button>
            {profileMenu && (
              <div className="absolute left-0 top-14 z-50 w-56 rounded-2xl border border-border bg-card p-2 shadow-xl animate-rise">
                {/* «إدارة المنصة» لا تظهر لحساب الرقابة — قسمها محجوب عنه */}
                {!roMode && (
                  <Link href={mode === 'student' ? '/student/profile' : '/teacher/settings'} onClick={() => setProfileMenu(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-primary hover:bg-secondary" data-testid="link-profile-dropdown">
                    <UserRound size={16} /> {mode === 'student' ? 'ملفي الشخصي' : 'إعدادات المنصة'}
                  </Link>
                )}
                <button onClick={signOut} disabled={logout.isPending} data-ro="keep" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10" data-testid="button-logout">
                  <LogOut size={16} /> {logout.isPending ? 'جارٍ الخروج...' : 'تسجيل الخروج'}
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="animate-fade px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
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

      {/* الشريط السفلي أُزيل: أقسام المنصة صارت في الدرج العلوي.
          المساحة أسفل المحتوى معروضة الآن كاملةً — لا شريط يقطعها. */}
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

/** مخطط النشاط الأسبوعي — أعمدة بمقياس نسبي حقيقي.
 *  كان height = value% فالأعمدة بلا بيانات كلها 10% متساوية. */
function ActivityChart({ points }: { points: { label: string; value: number }[] }) {
  const max = Math.max(1, ...points.map((p) => Number(p.value) || 0));
  const total = points.reduce((s, p) => s + (Number(p.value) || 0), 0);
  if (!points.length || total === 0) {
    return (
      <div className="mt-8 flex h-52 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background/50 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary/60"><TrendingUp size={22} /></span>
        <p className="text-sm font-bold text-primary">لا نشاط في آخر ٧ أيام</p>
        <p className="max-w-xs text-xs leading-6 text-muted-foreground">
          يُحتسب هنا: إكمال الدروس، تسليم الواجبات والدفاتر، والاختبارات.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-8 flex h-52 items-end gap-2 sm:gap-6">
      {points.map((point) => {
        const v = Number(point.value) || 0;
        const pct = Math.round((v / max) * 100);
        return (
          <div key={point.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[11px] font-extrabold tabular-nums text-primary/70">{v}</span>
            <div
              className="relative w-full max-w-10 rounded-t-xl bg-gradient-to-t from-primary/70 to-accent transition-all duration-500 group-hover:from-primary group-hover:to-accent"
              style={{ height: v === 0 ? 3 : Math.max(8, pct) + '%' }}
            >
              <span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground group-hover:block">
                {v}
              </span>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{point.label}</span>
          </div>
        );
      })}
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
    // بلا grade من الواجهة: الخادم يفلتر بالصف والمدرسة الحقيقيين من الجلسة،
    // والانتظار على dashGrade كان يمنع الجلب إن تأخر تحميل اللوحة.
    jsonFetch('/api/curriculum/announcements')
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
  const [answerPhotos, setAnswerPhotos] = useState<string[]>([]);
  const [uploadingAnswer, setUploadingAnswer] = useState(0);
  const [answerErr, setAnswerErr] = useState('');
  const [mySub, setMySub] = useState<any | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState('');
  const [submitOk, setSubmitOk] = useState(true);
  const { assignmentId = '' } = useParams();
  const deepOpened = useRef(false);

  // رابط مباشر: /student/assignments/:id يفتح الواجب بوجه الطالب فوراً
  useEffect(() => {
    if (!assignmentId || deepOpened.current || !query.data?.length) return;
    const hit = query.data.find((a: any) => String(a.id) === assignmentId);
    if (hit) { deepOpened.current = true; openAssignment(hit); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, query.data]);
  const [needLogin, setNeedLogin] = useState(false);

  // حالة الموعد — تستعمل نفس منطق deadlineInfo المحوري (المهلة تُغلق آخر لحظة من اليوم)
  const dueInfo = (due: string) => deadlineInfo(due);

  const openAssignment = (a: any) => {
    setSelectedAssignment(a);
    setStudentAnswer('');
    setAnswerPhotos([]);
    setAnswerErr('');
    setSubmitFeedback('');
    setSubmitOk(true);
    setNeedLogin(false);
    setMySub(null);
    setLoadingMine(true);
    fetch(`/api/assignments/${a.id}/mine`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setMySub(d);
          setStudentAnswer(d.answer || '');
          setAnswerPhotos(Array.isArray(d.photos) ? d.photos : []);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoadingMine(false));
  };

  const pickAnswerPhotos = (files: File[]) => {
    if (!files.length || uploadingAnswer) return;
    setAnswerErr('');
    setUploadingAnswer(files.length);
    (async () => {
      for (const f of files) {
        try {
          const res = await uploadStudentPhoto(f);
          if (res?.url) setAnswerPhotos((p) => [...p, res.url]);
          else setAnswerErr('تعذر رفع صورة — حاول مجدداً');
        } catch (e: any) {
          setAnswerErr(e?.message || 'تعذر رفع الصورة');
        } finally {
          setUploadingAnswer((n) => Math.max(n - 1, 0));
        }
      }
    })();
  };

  const assignments = useMemo(() => {
    const list = query.data ?? [];
    if (filter === 'all') return list;
    if (filter === 'submitted') return list.filter((a) => a.status.includes('تم'));
    return list.filter((a) => !a.status.includes('تم'));
  }, [query.data, filter]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment || submitting) return;
    // تحقّق فوري: لا نضيّع وقت الطالب إن كانت المهلة قد انتهت
    if (deadlineInfo(selectedAssignment.dueDate)?.passed) {
      setSubmitOk(false);
      setSubmitFeedback('انتهت مهلة التسليم — الواجب مغلق ولا يقبل حلاً جديداً');
      return;
    }
    if (!studentAnswer.trim() && !answerPhotos.length) {
      setSubmitOk(false);
      setSubmitFeedback('اكتب حلك أو أرفق صورة واحدة على الأقل');
      return;
    }
    setSubmitting(true);
    setSubmitFeedback('');
    setSubmitOk(true);
    try {
      const res = await fetch(`/api/assignments/${selectedAssignment.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: studentAnswer, photos: answerPhotos }),
      });
      const resData = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // انتهت الجلسة أثناء الكتابة — بوابة دخول واضحة بدل رسالة مبهمة
        setSubmitOk(false);
        setNeedLogin(true);
        return;
      }
      if (res.status === 404) throw new Error('الواجب غير موجود - قد يكون المعلم حذف API أو غيّر الرابط');
      if (res.status === 403) throw new Error(resData.error || 'انتهت المهلة — التسليم مغلق');
      if (!res.ok) throw new Error(resData.error || resData.message || 'تعذر إرسال الواجب');
      setSubmitOk(true);
      setSubmitFeedback(resData.message || 'تم إرسال حلك بنجاح!');
      query.refetch();
      openAssignment({ ...selectedAssignment });
      setTimeout(() => {
        setSelectedAssignment(null);
        setStudentAnswer('');
        setAnswerPhotos([]);
        setSubmitFeedback('');
      }, 2500);
    } catch (e: any) {
      setSubmitOk(false);
      setSubmitFeedback(e?.message || 'تعذر إرسال الواجب. حاول مجدداً.');
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
          {assignments.map((a) => {
            const due = dueInfo(a.dueDate);
            const imgCount = Array.isArray(a.images) ? a.images.length : 0;
            return (
            <div key={a.id} className="grid gap-3 border-b border-border px-5 py-5 last:border-0 sm:grid-cols-[1.5fr_1.1fr_.7fr_.6fr_.6fr] sm:items-center sm:gap-4 sm:px-6" data-testid={`row-assignment-${a.id}`}>
              <div>
                <p className="font-bold text-primary text-base">{a.title}</p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{a.description}</p>
                {imgCount ? <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary"><ImagePlus size={12} /> {imgCount} صور توضيحية</span> : null}
              </div>
              <p className="text-sm font-medium text-muted-foreground">{a.unit}{a.section && a.section !== 'الجميع' ? <span className="mr-2 rounded-full bg-[#6a1b9a]/15 px-2 py-0.5 text-[10px] font-bold text-[#6a1b9a]">{a.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}</p>
              <div className="flex flex-col items-start gap-1.5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  <Clock3 size={15} /> {a.dueDate}
                </p>
                {due ? <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${due.tone}`}>{due.passed ? <Lock size={11} /> : <Clock3 size={11} />} {due.label}</span> : null}
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${a.status.includes('تم') ? 'bg-green-100 text-green-800' : 'bg-accent/30 text-accent-foreground'}`}>
                  {a.status}
                </span>
                {a.score != null ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-xs font-extrabold text-white shadow-sm"><Award size={12} /> علامتك: {a.score}</span>
                ) : null}
              </div>
              <Button onClick={() => openAssignment(a)} variant="soft" className="text-xs py-2">
                {a.status.includes('تم') ? 'عرض التسليم' : 'تقديم الحل'}
              </Button>
            </div>
            );
          })}
        </div>
      )}

      {/* Submit Assignment Modal */}
      {selectedAssignment && (
        <Modal title={selectedAssignment.title} eyebrow={selectedAssignment.unit} onClose={() => setSelectedAssignment(null)} maxWidth="max-w-2xl">
          {(() => {
            // قيّمك الأستاذ؟ علامة موجودة أو حالة تقييم صريحة — عندها يُفتح التعديل ويُعرض التقييم
            const reviewed = !!(mySub && (mySub.score != null || mySub.status === 'تم التقييم'));
            const lockedForReview = !!(mySub && !reviewed);
            // المهلة انتهت؟ يغلق التسليم نهائياً ونُخبر الطالب بوضوح
            const dl = deadlineInfo(selectedAssignment.dueDate);
            const deadlinePassed = !!dl?.passed;
            return (
          <form onSubmit={handleSubmit} className="space-y-4">
            {dl && (
              <p className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-extrabold ${dl.tone}`} data-testid="hw-deadline-banner">
                <Clock3 size={16} /> {dl.label}
              </p>
            )}
            <div className="rounded-2xl bg-secondary/40 p-4 text-xs leading-6 text-muted-foreground">
              <p className="font-bold text-primary mb-1">تعليمات الواجب:</p>
              <p>{selectedAssignment.description}</p>
              <p className="mt-2 font-semibold text-primary">الدرجة المخصصة: {selectedAssignment.points} نقطة · تاريخ التسليم: {selectedAssignment.dueDate}</p>
            </div>

            {lockedForReview ? (
              <p className="flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 text-sm font-extrabold text-amber-800">
                <Lock size={16} /> تسليمك قيد مراجعة الأستاذ — لا يمكن التعديل أو إعادة الرفع حتى يقيّمه.
              </p>
            ) : null}

            {Array.isArray(selectedAssignment.images) && selectedAssignment.images.length ? (
              <div className="rounded-2xl border border-border p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-bold text-primary"><ImagePlus size={16} /> صور الواجب التوضيحية ({selectedAssignment.images.length})</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedAssignment.images.map((src: string, i: number) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border">
                      <img src={src} alt={`صورة الواجب ${i + 1}`} loading="lazy" className="max-h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {loadingMine ? (
              <p className="flex items-center gap-2 rounded-xl bg-secondary/50 px-4 py-3 text-xs font-bold text-primary"><RefreshCw size={14} className="animate-spin" /> جارٍ تحميل تسليمك السابق...</p>
            ) : mySub && (mySub.score != null || mySub.feedback || mySub.status === 'تم التقييم') ? (
              <div className="rounded-2xl border-2 border-green-500/40 bg-green-500/10 p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-extrabold text-green-800"><Award size={17} /> تمت مراجعتك ✓ {mySub.score != null ? `· علامتك: ${mySub.score}` : ''}</p>
                {mySub.feedback ? <p className="mt-1.5 text-sm leading-7 text-green-900"><b>ملاحظة الأستاذ:</b> {mySub.feedback}</p> : <p className="mt-1 text-xs font-bold text-green-800">راجع الأستاذ حلّك — أحسنت على التسليم!</p>}
              </div>
            ) : null}

            <label className="block text-sm font-semibold">
              <span className="mb-2 block">إجابتك / حل الواجب:</span>
              <textarea
                value={studentAnswer}
                onChange={(e) => setStudentAnswer(e.target.value)}
                disabled={lockedForReview}
                rows={6}
                placeholder="اكتب هنا إجابتك النموذجية، الإعراب، أو الفقرة التعبيرية المطلوبة بالتفصيل..."
                className="w-full resize-none rounded-2xl border border-input bg-background p-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20 disabled:opacity-60"
              />
            </label>

            <div className="rounded-2xl border border-dashed border-border p-4">
              <p className="mb-3 text-sm font-bold text-primary">صور حلّك ({answerPhotos.length}) — صوّر دفترك أو أرفق صوراً</p>
              {answerPhotos.length ? (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {answerPhotos.map((src, i) => (
                    <div key={i} className="group relative overflow-hidden rounded-xl border border-border">
                      <img src={src} alt={`صورة الحل ${i + 1}`} className="h-24 w-full object-cover" />
                        {!lockedForReview ? (
                          <button type="button" onClick={() => setAnswerPhotos((p) => p.filter((_, x) => x !== i))} className="absolute left-1 top-1 rounded-lg bg-black/60 p-1 text-white"><X size={13} /></button>
                        ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-primary hover:bg-accent/40 ${uploadingAnswer ? 'opacity-60' : ''} ${lockedForReview ? 'pointer-events-none opacity-50' : ''}`}>
                {uploadingAnswer ? <RefreshCw size={15} className="animate-spin" /> : <Camera size={15} />} {uploadingAnswer ? `جارٍ الرفع (${uploadingAnswer})...` : 'التقط / اختر صور الحل'}
                <input type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  pickAnswerPhotos(files);
                }} />
              </label>
              {answerErr ? <p className="mt-2 text-xs font-bold text-destructive">{answerErr}</p> : null}
            </div>

            {submitFeedback && (
              <div className={`rounded-2xl p-3 text-sm font-bold text-center ${submitOk ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/10 text-destructive'}`}>
                {submitFeedback}
              </div>
            )}
            {needLogin ? (
              <LoginGate compact title="انتهت جلستك أثناء الكتابة" />
            ) : null}

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button onClick={() => setSelectedAssignment(null)} variant="ghost">
                إلغاء
              </Button>
              <Button type="submit" disabled={submitting || lockedForReview || deadlinePassed} variant="primary" className="py-2.5 px-6">
                {submitting ? 'جارٍ الإرسال...' : deadlinePassed ? (<><Lock size={15} /> انتهت المهلة — مغلق</>) : lockedForReview ? (<><Lock size={15} /> قيد المراجعة — بانتظار الأستاذ</>) : mySub ? 'إعادة الإرسال بعد التعديل' : 'إرسال للأستاذ أحمد الأسطل'} <ArrowLeft size={16} />
              </Button>
            </div>
          </form>
            );
          })()}
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
  const [needLogin, setNeedLogin] = useState(false);
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
      if (res.status === 401) {
        // انتهت الجلسة قبل التسليم — نحفظ الإجابات محلياً ونطلب الدخول
        setNeedLogin(true);
        setResult({ authError: true });
        return;
      }
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
  /* ---------- عرض النتيجة ---------- */
  if (result) {
    if (result.authError || needLogin) {
      // الجلسة انتهت قبل تسليم الاختبار — الإجابات محفوظة محلياً،
      // وبعد الدخول يرجع الطالب لنفس الاختبار ويعيد التسليم بضغطة
      return <LoginGate title="انتهت جلستك قبل تسليم الاختبار" />;
    }
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
      // القائمة الفارغة نتيجة صحيحة (لا اختبارات لهذا الصف) — تُحفظ فارغة
      // ولا نسقط على القائمة العامة التي تحوي كل الصفوف والمدارس.
      .then((d) => { if (Array.isArray(d)) setGradeExams(d); })
      .catch(() => setGradeExams([]));
  }, [studentGrade, examsStudentId]);
  // gradeExams أولاً دائماً (ولو فارغة) — والقائمة العامة احتياط التحميل فقط.
  const examList = gradeExams ?? query.data;
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const { assessmentId = '' } = useParams();
  const quizOpened = useRef(false);

  // رابط مباشر: /student/assessments/:id يفتح الاختبار بوجه الطالب فوراً
  useEffect(() => {
    if (!assessmentId || quizOpened.current || !examList?.length) return;
    const hit = examList.find((a: any) => String(a.id) === assessmentId);
    if (hit) { quizOpened.current = true; setActiveQuiz(hit); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId, examList]);

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
              {(() => { const d = deadlineInfo(assessment.date); return d ? (
                <p className={`mt-3 flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-extrabold ${d.tone}`} data-testid={`exam-deadline-${assessment.id}`}>
                  {d.passed ? <Lock size={14} /> : <Clock3 size={14} />} {d.label}
                </p>
              ) : null; })()}
              <Button onClick={() => setActiveQuiz(assessment)} disabled={!!deadlineInfo(assessment.date)?.passed} variant="primary" className="mt-5 w-full py-3.5 shadow-md disabled:opacity-60" data-testid={`button-assessment-${assessment.id}`}>
                {deadlineInfo(assessment.date)?.passed ? (<><Lock size={16} /> انتهت المهلة — مغلق</>) : done ? 'إعادة الاختبار وتحسين النتيجة' : 'ابدأ الاختبار التفاعلي الآن'} <ArrowLeft size={16} />
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
              <ActivityChart points={d.weeklyActivity ?? []} />
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

/** جلب تقرير الطلاب الكامل (كل المؤشرات) — مع_cache خفيف لتفادي تكرار الطلبات */
function useStudentsReport(filters?: { grade?: string; school?: string; gender?: string }) {
  const key = `${filters?.grade || ''}|${filters?.school || ''}|${filters?.gender || ''}`;
  const [data, setData] = useState<ReportBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const q = new URLSearchParams();
    if (filters?.grade) q.set('grade', filters.grade);
    if (filters?.school) q.set('school', filters.school);
    if (filters?.gender) q.set('gender', filters.gender);
    let live = true;
    setLoading(true);
    setError('');
    fetch(`/api/teacher/students/report${q.toString() ? `?${q.toString()}` : ''}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('تعذر تحميل كشف الطلاب');
        return r.json();
      })
      .then((d) => {
        if (live) setData({ students: d?.students || [], schools: d?.schools || [], grades: d?.grades || [], generatedAt: d?.generatedAt || '' });
      })
      .catch((e: any) => {
        if (live) setError(e?.message || 'تعذر تحميل كشف الطلاب');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return { data, loading, error, reload: () => setAttempt((a) => a + 1) };
}

/** بطاقة إحصائية صغيرة */
function ReportStat({ label, value, tone = 'primary' }: { label: string; value: string | number; tone?: 'primary' | 'accent' | 'rose' | 'purple' }) {
  const tones = {
    primary: 'from-[#0c2725] via-[#17413f] to-[#25655f] text-white',
    accent: 'from-[#8a6d1f] to-[#d7b65e] text-[#2b2106]',
    rose: 'from-[#7a2f3d] to-[#c0566b] text-white',
    purple: 'from-[#4a2358] to-[#8a508f] text-white',
  } as const;
  return (
    <div className={`rounded-2xl bg-gradient-to-l ${tones[tone]} px-4 py-3 shadow-sm`}>
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold opacity-80">{label}</p>
    </div>
  );
}

/** جدول طلاب مختصر (يُستخدم داخل بطاقات المدارس) */
function StudentsMiniTable({ rows, onEdit }: { rows: ReportStudent[]; onEdit: (s: any) => void }) {
  if (!rows.length) return <p className="px-3 py-6 text-center text-xs font-bold text-muted-foreground">لا يوجد طلاب في هذه المجموعة</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-right text-xs">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-[11px] font-extrabold text-primary">
            <th className="px-3 py-2">الاسم</th>
            <th className="px-3 py-2">القسم</th>
            <th className="px-3 py-2">رقم الطالب</th>
            <th className="px-3 py-2">الهاتف</th>
            <th className="px-3 py-2">التقدّم</th>
            <th className="px-3 py-2">واجبات</th>
            <th className="px-3 py-2">آخر نشاط</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-border/60 transition-colors hover:bg-secondary/30">
              <td className="px-3 py-2.5 font-bold text-foreground">{s.name}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{s.section}</td>
              <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{s.studentNumber || '—'}</td>
              <td className="px-3 py-2.5 text-muted-foreground tabular-nums" dir="ltr">{s.phone || '—'}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, s.progress || 0)}%` }} />
                  </div>
                  <span className="tabular-nums text-[11px] font-bold text-primary">{s.progress || 0}%</span>
                </div>
              </td>
              <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{s.hwSubmitted || 0}</td>
              <td className="px-3 py-2.5 text-[11px] text-muted-foreground">{s.lastActive ? String(s.lastActive).slice(0, 10) : '—'}</td>
              <td className="px-3 py-2.5">
                <button type="button" onClick={() => onEdit(s)} title="تعديل" className="rounded-lg bg-secondary/70 p-1.5 text-primary transition-colors hover:bg-secondary"><Pencil size={13} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** بطاقة مدرسة داخل صف: طلاب لحال وطالبات لحال */
function SchoolGroupCard({ schoolBlock, grade, onExport, onEdit }: {
  schoolBlock: { school: string; total: number; groups: any[] };
  grade: string;
  onExport: (rows: ReportStudent[], label: string) => void;
  onEdit: (s: any) => void;
}) {
  const boys = schoolBlock.groups.find((g) => g.gender === 'طالب');
  const girls = schoolBlock.groups.find((g) => g.gender === 'طالبة');
  const other = schoolBlock.groups.find((g) => g.gender === 'غير محدد');
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 bg-gradient-to-l from-secondary/70 to-card px-4 py-3.5 text-right transition-colors hover:from-secondary">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary font-display text-sm font-extrabold text-primary-foreground shadow-md">
          <Castle size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-extrabold text-primary">{schoolBlock.school}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
            {grade} · {schoolBlock.total} طالب · {boys?.students.length || 0} طالب · {girls?.students.length || 0} طالبة
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-accent/25 px-3 py-1.5 text-xs font-extrabold text-accent-foreground tabular-nums">{schoolBlock.total}</span>
        <ChevronLeft size={18} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-4 p-4">
          {[
            { label: 'طلاب', rows: boys?.students || [], tone: 'from-[#0d47a1] to-[#3f7dc2]', icon: UsersRound },
            { label: 'طالبات', rows: girls?.students || [], tone: 'from-[#6a1b9a] to-[#8a508f]', icon: UsersRound },
            { label: 'غير محدد', rows: other?.students || [], tone: 'from-[#5d4037] to-[#8d6e63]', icon: HelpCircle },
          ].map((sec) => (
            <div key={sec.label} className="overflow-hidden rounded-2xl border border-border">
              <div className="flex items-center justify-between gap-2 bg-secondary/50 px-3 py-2">
                <p className="flex items-center gap-2 text-xs font-extrabold text-primary">
                  <span className={`grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br ${sec.tone} text-white`}><sec.icon size={13} /></span>
                  {sec.label} ({sec.rows.length})
                </p>
                {sec.rows.length ? (
                  <button type="button" onClick={() => onExport(sec.rows, `${schoolBlock.school} - ${grade} - ${sec.label}`)} className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-extrabold text-primary-foreground hover:brightness-110">تصدير Excel</button>
                ) : null}
              </div>
              <StudentsMiniTable rows={sec.rows} onEdit={onEdit} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** صفحة الطلاب: بطاقات لكل صف ← كل مدرسة ← طلاب/طالبات */
/** صفحة صف واحد مستقلة — كل مدرسة ببطاقة مستقلة فيها طلاب وطالبات */
function GradeStudentsPage({ grade }: { grade: string }) {
  const decoded = decodeURIComponent(grade || '');
  const report = useStudentsReport({ grade: decoded });
  const [schoolFilter, setSchoolFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState<'الكل' | 'طالب' | 'طالبة'>('الكل');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const rows: ReportStudent[] = report.data?.students || [];
  const schools = report.data?.schools || [];
  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return rows.filter((s) => {
      if (schoolFilter && s.school !== schoolFilter) return false;
      if (genderFilter !== 'الكل' && s.gender !== genderFilter) return false;
      if (q && !normalizeText(s.name).includes(q) && !normalizeText(s.studentNumber).includes(q)) return false;
      return true;
    });
  }, [rows, schoolFilter, genderFilter, search]);
  const grouped = useMemo(() => groupStudents(filtered), [filtered]);

  const exportGrade = (csv = false) => {
    if (!rows.length) return;
    setExporting(true);
    try {
      const bundle: ReportBundle = { students: filtered, schools, grades: [decoded], generatedAt: new Date().toISOString() };
      if (csv) {
        const sheets = buildStudentsReport(bundle, { onlyGrade: decoded });
        for (const s of sheets) downloadCsv(reportFileName(s.name), s.rows);
      } else {
        downloadWorkbook(reportFileName('كشف الطلاب', decoded), buildStudentsReport(bundle, { onlyGrade: decoded }), {
          title: `كشف ${decoded}`,
          subject: 'كشف الطلاب حسب المدرسة والقسم',
        });
      }
    } finally {
      setTimeout(() => setExporting(false), 400);
    }
  };

  return (
    <Shell mode="teacher">
      <PageHeading
        eyebrow="صفحة الصف"
        title={decoded}
        body={`جميع طلاب ${decoded} مقسّمين حسب المدرسة، وداخل كل مدرسة طلاب لحال وطالبات لحال — مع كشف Excel جاهز.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/teacher/students" className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-accent/40">
              <ArrowRight size={16} /> كل الطلاب
            </Link>
            <Button type="button" onClick={() => exportGrade(false)} disabled={exporting || !rows.length} variant="primary" data-testid="button-export-grade">
              {exporting ? <><RefreshCw size={16} className="animate-spin" /> جارٍ التصدير...</> : <><Download size={16} /> كشف Excel للصف</>}
            </Button>
            <Button type="button" onClick={() => exportGrade(true)} disabled={!rows.length} variant="soft" title="ملف CSV لكل مجموعة">
              <FileText size={16} /> CSV لكل مجموعة
            </Button>
          </div>
        }
      />

      {report.loading ? <StateNotice type="loading" /> : report.error ? (
        <StateNotice type="error" onRetry={report.reload} />
      ) : !rows.length ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><GraduationCap size={26} /></span>
          <p className="font-display text-lg font-bold text-primary">لا يوجد طلاب في {decoded}</p>
          <p className="mt-1 text-sm text-muted-foreground">سجّل طلاباً لهذا الصف لتظهر أرقامهم هنا.</p>
          <Link href="/teacher/students" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm"><Plus size={16} /> إضافة طالب</Link>
        </div>
      ) : (
        <>
          <SectionHero
            eyebrow="توزيع الطلاب"
            title={`${decoded} — ${grouped.totals.students} طالب`}
            body="كل بطاقة مدرسة تحتوي students لحال وطالبات لحال مع نسبة التقدم وآخر نشاط."
            tone="dark"
            stats={[
              { value: grouped.totals.students, label: 'إجمالي الطلاب' },
              { value: grouped.totals.schools, label: 'المدارس' },
              { value: filtered.filter((s) => s.gender === 'طالب').length, label: 'طلاب' },
              { value: filtered.filter((s) => s.gender === 'طالبة').length, label: 'طالبات' },
            ]}
          />

          {/* فلاتر */}
          <div className="mb-5 grid gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[1.4fr_1fr_auto]">
            <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-background px-4 py-2.5">
              <Search size={17} className="shrink-0 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو رقم الطالب..." className="w-full bg-transparent text-sm outline-none" data-testid="input-grade-search" />
            </div>
            <select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} className="rounded-2xl border border-input bg-background px-4 py-2.5 text-sm font-semibold outline-none focus:border-primary" data-testid="select-grade-school">
              <option value="">كل المدارس</option>
              {schools.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex items-center gap-2">
              {(['الكل', 'طالب', 'طالبة'] as const).map((g) => (
                <button key={g} type="button" onClick={() => setGenderFilter(g)} className={`rounded-xl px-3.5 py-2.5 text-xs font-extrabold transition-colors ${genderFilter === g ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-primary'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* بطاقات المدارس */}
          {grouped.byGrade.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
              <p className="font-display text-lg font-bold text-primary">لا نتائج</p>
              <p className="mt-1 text-sm text-muted-foreground">غيّر الفلاتر لعرض الطلاب.</p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {grouped.byGrade[0]!.schools.map((s) => (
                <SchoolGroupCard
                  key={s.school}
                  schoolBlock={s}
                  grade={decoded}
                  onEdit={() => undefined}
                  onExport={(r, label) => {
                    const g0 = groupStudents(r).byGrade[0];
                    const g1 = g0?.schools[0]?.groups[0];
                    if (g1) downloadCsv(reportFileName(label), groupRows(g1));
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

/** يمرر معامل الصف من المسار إلى الصفحة */
function GradeStudentsRoute() {
  const params = useParams<{ grade?: string }>();
  return <GradeStudentsPage grade={params.grade || ''} />;
}

function StudentsPage() {
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
  const query = useListStudents();
  const report = useStudentsReport();
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'الكل' | 'طالب' | 'طالبة'>('الكل');
  const [gradeFilter, setGradeFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [exporting, setExporting] = useState('');
  const [mergeMsg, setMergeMsg] = useState('');
  const [view, setView] = useState<'groups' | 'table'>('groups');
  const [showAdd, setShowAdd] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', school: 'مدرسة وايلد', grade: 'الصف العاشر', section: 'أ', gender: 'طالب', phone: '' });
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState('');
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [opMsg, setOpMsg] = useState('');
  const [opOk, setOpOk] = useState(true);

  const allReportStudents: ReportStudent[] = report.data?.students || [];
  const grouped = useMemo(() => groupStudents(allReportStudents), [allReportStudents]);

  const filteredReport = useMemo(() => {
    const q = normalizeText(search);
    return allReportStudents.filter((s) => {
      if (gradeFilter && s.grade !== gradeFilter) return false;
      if (schoolFilter && s.school !== schoolFilter) return false;
      if (genderFilter !== 'الكل' && s.gender !== genderFilter) return false;
      if (q && !normalizeText(s.name).includes(q) && !normalizeText(s.school).includes(q) && !normalizeText(s.studentNumber).includes(q)) return false;
      return true;
    });
  }, [allReportStudents, search, gradeFilter, schoolFilter, genderFilter]);

  const visibleGroups = useMemo(() => {
    const g = groupStudents(filteredReport);
    return g.byGrade.filter((gr) => (!gradeFilter || gr.grade === gradeFilter));
  }, [filteredReport, gradeFilter]);

  // القوائم تأتي من الكتالوج المُدار مع بيانات الطلاب — فلا يفيد أي صف أو مدرسة جديدة
  const schoolsFromData = report.data?.schools?.length ? report.data.schools : SCHOOLS;
  const gradesFromData = report.data?.grades?.length ? report.data.grades : GRADES;
  const knownSchools = useMemo(() => [...new Set([...SCHOOLS, ...schoolsFromData])], [schoolsFromData]);
  /** مدارس لم تُسجَّل في الكتالوج بعد (بيانات قديمة) — نعرضها وننبّه */
  const straySchools = useMemo(() => schoolsFromData.filter((s) => !SCHOOLS.includes(s)), [schoolsFromData]);

  const exportExcel = (bundle: { students: ReportStudent[]; schools: string[]; grades: string[]; generatedAt: string }, onlyGrade?: string) => {
    setExporting(onlyGrade || 'all');
    try {
      const sheets = buildStudentsReport(bundle, { onlyGrade });
      downloadWorkbook(reportFileName('كشف الطلاب', onlyGrade || 'كل الصفوف'), sheets, {
        title: onlyGrade ? `كشف الطلاب — ${onlyGrade}` : 'كشف الطلاب الكامل',
        subject: 'كشف الطلاب حسب الصف والمدرسة والقسم',
      });
    } finally {
      setTimeout(() => setExporting(''), 400);
    }
  };

  const exportGroupCsv = (rows: ReportStudent[], label: string) => {
    const grp = groupStudents(rows).byGrade[0];
    const g = grp?.schools[0]?.groups[0];
    if (!g) return;
    downloadCsv(reportFileName(label), groupRows(g));
  };

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

  const openEdit = (s: any) => {
    setEditForm({
      name: s.name || '',
      email: s.email || '',
      phone: s.phone || '',
      school: s.school || '',
      branch: s.branch || 'المسار الأكاديمي',
      grade: s.grade || 'الصف العاشر',
      section: s.section || 'أ',
      gender: s.gender === 'طالبة' ? 'طالبة' : 'طالب',
      status: s.status || 'نشط',
      password: '',
    });
    setEditItem(s);
  };
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    setSavingEdit(true);
    try {
      const { password, ...profile } = editForm;
      await jsonFetch(`/api/teacher/students/${editItem.id}`, { method: 'PATCH', body: profile });
      let pwdMsg = '';
      if (password && String(password).trim()) {
        const pr = await jsonFetch(`/api/teacher/students/${editItem.id}/password`, { method: 'PATCH', body: { password: String(password).trim() } });
        pwdMsg = ' + ' + (pr.message || 'تم تغيير كلمة السر');
      }
      setOpOk(true);
      setOpMsg(`تم حفظ بيانات ${editForm.name} بنجاح ✓${pwdMsg}`);
      setEditItem(null);
      query.refetch();
      setTimeout(() => setOpMsg(''), 4000);
    } catch (e: any) {
      setOpOk(false);
      setOpMsg(e?.message || 'تعذر حفظ بيانات الطالب');
    } finally {
      setSavingEdit(false);
    }
  };
  const deleteStudent = async (s: any) => {
    if (!window.confirm(`حذف الطالب "${s.name}" نهائياً مع كل بياناته (التسليمات والتقدم)؟ لا يمكن التراجع.`)) return;
    try {
      await jsonFetch(`/api/teacher/students/${s.id}`, { method: 'DELETE' });
      setOpOk(true);
      setOpMsg(`تم حذف ${s.name} نهائياً`);
      query.refetch();
      setTimeout(() => setOpMsg(''), 3000);
    } catch (e: any) {
      setOpOk(false);
      setOpMsg(e?.message || 'تعذر حذف الطالب');
    }
  };

  return (
    <Shell mode="teacher">
      <PageHeading eyebrow="سجل الطلاب" title="إدارة ومتابعة الطلاب" body="استعرض سجل الطلاب المسجلين بالمنصة، تابع نسب تقدمهم، أو أضف طالباً جديداً." action={<Button onClick={() => setShowAdd(true)} data-testid="button-add-student"><Plus size={17} /> إضافة طالب جديد</Button>} />
      {opMsg ? <p className={`mb-4 rounded-xl px-4 py-3 text-sm font-bold ${opOk ? 'bg-green-500/15 text-green-800' : 'bg-destructive/10 text-destructive'}`}>{opMsg}</p> : null}
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
      {view === 'groups' ? (
        report.loading ? (
          <StateNotice type="loading" />
        ) : report.error ? (
          <StateNotice type="error" onRetry={report.reload} />
        ) : (
          <div className="space-y-6">
            {/* شريط الأدوات: البحث + فلاتر الصف/المدرسة + التصدير */}
            <div className="grid gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[1.4fr_1fr_1fr_auto]">
              <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-background px-4 py-2.5">
                <Search size={17} className="shrink-0 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الرقم أو المدرسة..." className="w-full bg-transparent text-sm outline-none" data-testid="input-report-search" />
                {search ? <button type="button" onClick={() => setSearch('')} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X size={14} /></button> : null}
              </div>
              <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className="rounded-2xl border border-input bg-background px-4 py-2.5 text-sm font-semibold outline-none focus:border-primary" data-testid="select-report-grade">
                <option value="">كل الصفوف</option>
                {gradesFromData.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} className="rounded-2xl border border-input bg-background px-4 py-2.5 text-sm font-semibold outline-none focus:border-primary" data-testid="select-report-school">
                <option value="">كل المدارس</option>
                {knownSchools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => setView('table')} variant="soft" className="px-3 py-2.5 text-xs">جدول مسطح</Button>
                <Button type="button" disabled={exporting === 'all'} onClick={() => exportExcel({ students: filteredReport, schools: knownSchools, grades: gradesFromData, generatedAt: report.data?.generatedAt || '' })} variant="primary" className="px-4 py-2.5 text-xs shadow-md" data-testid="button-export-all">
                  {exporting === 'all' ? <><RefreshCw size={14} className="animate-spin" /> جارٍ التصدير...</> : <><Download size={14} /> كشف Excel</>}
                </Button>
              </div>
            </div>

            {/* أزرار الجنس + الأرقام */}
            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: 'الكل' as const, label: `الكل (${filteredReport.length})` },
                { id: 'طالب' as const, label: `الطلاب (${filteredReport.filter((s) => s.gender === 'طالب').length})` },
                { id: 'طالبة' as const, label: `الطالبات (${filteredReport.filter((s) => s.gender === 'طالبة').length})` },
              ]).map((b) => (
                <button key={b.id} type="button" onClick={() => setGenderFilter(b.id)} className={`rounded-xl px-4 py-2 text-xs font-extrabold transition-colors ${genderFilter === b.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-muted-foreground hover:text-primary'}`} data-testid={`button-gender-${b.id}`}>
                  {b.label}
                </button>
              ))}
              <span className="mr-auto flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-secondary px-3.5 py-2 text-xs font-extrabold text-primary">{filteredReport.length} طالب</span>
                <span className="rounded-xl bg-secondary px-3.5 py-2 text-xs font-extrabold text-primary">{grouped.totals.schools} مدرسة</span>
                <span className="rounded-xl bg-secondary px-3.5 py-2 text-xs font-extrabold text-primary">{grouped.totals.grades} صفوف</span>
              </span>
            </div>

            {/* مدارس غير رسمية في البيانات → توحيدها */}
            {straySchools.length ? (
              <div className="rounded-3xl border-2 border-dashed border-amber-500/50 bg-amber-500/10 p-4">
                <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
                  <CircleAlert size={16} /> مدارس في البيانات خارج قائمتك الرسمية: {straySchools.join('، ')}
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-800">اختر المدرسة الصحيحة لتوحيد طلاب هذه المدرسة إليها — بعد التوحيد تختفي من الكشف ويُدمجون في الكشف الصحيح.</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {straySchools.map((s) => (
                    <div key={s} className="flex items-center gap-1.5 rounded-xl bg-card px-2.5 py-1.5 text-xs font-bold ring-1 ring-amber-500/40">
                      <span className="text-amber-900">{s}</span>
                      <ArrowLeft size={13} className="text-amber-700" />
                      <select
                        className="rounded-lg border border-input bg-background px-2 py-1 text-xs font-bold outline-none"
                        value=""
                        data-testid={`select-merge-${s}`}
                        onChange={async (e) => {
                          const to = e.target.value;
                          if (!to) return;
                          try {
                            const res = await fetch('/api/teacher/schools/merge', {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ from: s, to }),
                            });
                            const d = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(d?.error || 'تعذر التوحيد');
                            setMergeMsg(d.message || 'تم التوحيد ✓');
                            query.refetch();
                            report.reload();
                          } catch (err: any) {
                            setMergeMsg(err?.message || 'تعذر التوحيد');
                          }
                        }}
                      >
                        <option value="">وحّد إلى…</option>
                        {knownSchools.filter((k) => !straySchools.includes(k)).map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                  ))}
                  {mergeMsg ? <span className="text-xs font-extrabold text-green-800">{mergeMsg}</span> : null}
                </div>
              </div>
            ) : null}

            {/* كل صف ← كل مدرسة ← طلاب/طالبات */}
            {visibleGroups.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
                <p className="font-display text-lg font-bold text-primary">لا يوجد طلاب مطابقون</p>
                <p className="mt-1 text-sm text-muted-foreground">جرّب تغيير الصف أو المدرسة أو البحث.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {visibleGroups.map((g) => (
                  <section key={g.grade}>
                    <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
                      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-primary">
                        <GraduationCap size={20} className="text-accent-foreground" /> {g.grade}
                      </h3>
                      <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-extrabold text-primary">{g.total} طالب</span>
                      <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-extrabold text-muted-foreground">{g.schools.length} مدارس</span>
                      <span className="mr-auto flex items-center gap-2">
                        <Button type="button" onClick={() => exportExcel({ students: filteredReport, schools: knownSchools, grades: gradesFromData, generatedAt: report.data?.generatedAt || '' }, g.grade)} variant="soft" className="px-3 py-2 text-xs" title="كشف هذا الصف">
                          <Download size={13} /> كشف {g.grade}
                        </Button>
                        <Link href={`/teacher/students/grade/${encodeURIComponent(g.grade)}`} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md" data-testid={`link-grade-page-${g.grade}`}>
                          صفحة {g.grade} <ArrowLeft size={13} />
                        </Link>
                      </span>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      {g.schools.map((s) => (
                        <SchoolGroupCard
                          key={`${g.grade}-${s.school}`}
                          schoolBlock={s}
                          grade={g.grade}
                          onEdit={(st) => { setEditItem(st); setEditForm({ ...st }); }}
                          onExport={(rows, label) => exportGroupCsv(rows, label)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )
      ) : query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : !students.length ? (
        <StateNotice type="empty" />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="hidden grid-cols-[1.4fr_1fr_.75fr_.75fr_.5fr_.5fr] gap-4 border-b border-border bg-secondary/40 px-6 py-4 text-xs font-bold text-muted-foreground md:grid">
            <span>الطالب</span>
            <span>المدرسة</span>
            <span>الصف الدراسي</span>
            <span>نسبة الإنجاز</span>
            <span>الحالة</span>
            <span>إجراءات</span>
          </div>
          {students.map((s) => (
            <div key={s.id} className="grid gap-3 border-b border-border px-5 py-4 last:border-0 md:grid-cols-[1.4fr_1fr_.75fr_.75fr_.5fr_.5fr] md:items-center md:gap-4 md:px-6" data-testid={`row-student-${s.id}`}>
              <div className="flex items-center gap-3">
                <Avatar name={s.name} src={s.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <p className="font-bold text-primary text-sm truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate" dir="ltr">{s.email}</p>
                  {s.phone ? <p className="text-xs font-bold text-primary/80 truncate" dir="ltr">{s.phone}</p> : null}
                </div>
              </div>
              <p className="text-sm text-muted-foreground font-medium truncate">{s.school}</p>
              <p className="text-sm text-muted-foreground font-medium">{s.grade} · <span className={`font-bold ${s.gender === 'طالبة' ? 'text-[#8a508f]' : 'text-primary'}`}>{s.gender || '—'}</span></p>
              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1">
                  <span>{s.progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${s.progress}%` }} />
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold w-fit ${s.status === 'نشط' ? 'bg-green-500/15 text-green-800' : 'bg-secondary text-muted-foreground'}`}>{s.status}</span>
              <span className="flex items-center gap-1.5">
                <button type="button" onClick={() => openEdit(s)} title="تعديل بيانات الطالب" className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3.5 py-2 text-xs font-extrabold text-primary transition-all hover:bg-accent/40 active:scale-95" data-testid={`button-edit-student-${s.id}`}>
                  <Pencil size={14} /> تعديل
                </button>
                <button type="button" onClick={() => deleteStudent(s)} title="حذف الطالب نهائياً" className="rounded-xl bg-destructive/10 p-2.5 text-destructive transition-all hover:bg-destructive/20 active:scale-95" data-testid={`button-delete-student-${s.id}`}>
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Edit Student Modal — تعديل كامل لكل بيانات الطالب */}
      {editItem && (
        <Modal title="تعديل بيانات الطالب" eyebrow={editItem.grade || 'سجل الطلاب'} onClose={() => setEditItem(null)} maxWidth="max-w-2xl">
          <div className="mb-5 flex items-center gap-4 rounded-3xl bg-gradient-to-l from-[#0d2926] via-[#17413f] to-[#25655f] p-5 shadow-lg">
            <Avatar name={editForm.name || editItem.name} src={editItem.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-extrabold text-white">{editForm.name || 'اسم الطالب...'}</p>
              <p className="mt-1 text-xs font-bold text-white/75">{editForm.grade || ''} · {editForm.school || ''}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${editForm.status === 'نشط' ? 'bg-green-500/25 text-white' : 'bg-white/15 text-white/80'}`}>{editForm.status || 'نشط'}</span>
          </div>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field2 label="الاسم الكامل">
                <input value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required placeholder="الاسم الثلاثي أو الرباعي" className={inputCls} data-testid="input-edit-student-name" />
              </Field2>
              <Field2 label="البريد الإلكتروني">
                <input type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="student@example.com" dir="ltr" className={`${inputCls} text-left`} />
              </Field2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field2 label="رقم الهاتف">
                <input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="059xxxxxxx" dir="ltr" className={`${inputCls} text-left`} data-testid="input-edit-student-phone" />
              </Field2>
              <Field2 label="المدرسة">
                <select value={SCHOOLS.includes(editForm.school) ? editForm.school : SCHOOLS[0]} onChange={(e) => setEditForm({ ...editForm, school: e.target.value })} className={inputCls} data-testid="select-edit-student-school">
                  {[...new Set([editForm.school || SCHOOLS[0], ...SCHOOLS])].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field2>
            </div>
            <Field2 label="الصف الدراسي">
              <select value={editForm.grade || 'الصف العاشر'} onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })} className={inputCls} data-testid="select-edit-student-grade">
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field2 label="الجنس">
                <select value={editForm.gender || 'طالب'} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })} className={inputCls}>
                  <option value="طالب">طالب</option>
                  <option value="طالبة">طالبة</option>
                </select>
              </Field2>
              <Field2 label="الحالة">
                <select value={editForm.status || 'نشط'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className={inputCls}>
                  <option value="نشط">نشط</option>
                  <option value="يحتاج متابعة">يحتاج متابعة</option>
                  <option value="موقوف">موقوف</option>
                </select>
              </Field2>
            </div>
            <Field2 label="كلمة سر جديدة (اختياري)">
              <input
                type="text"
                value={editForm.password || ''}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="اتركها فارغة للإبقاء — 6 أحرف على الأقل للتغيير"
                dir="ltr"
                className={`${inputCls} text-left`}
                data-testid="input-edit-student-password"
              />
            </Field2>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <Button type="button" onClick={() => editItem && deleteStudent(editItem)} variant="ghost" className="text-destructive"><Trash2 size={15} /> حذف الطالب</Button>
              <span className="flex items-center gap-3">
                <Button onClick={() => setEditItem(null)} variant="ghost">إلغاء</Button>
                <Button type="submit" disabled={savingEdit} variant="primary" className="px-8 py-3 shadow-md" data-testid="button-save-student">{savingEdit ? 'جارٍ الحفظ...' : 'حفظ التعديلات ✓'}</Button>
              </span>
            </div>
          </form>
        </Modal>
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
                <select value={newStudent.school} onChange={(e) => setNewStudent({ ...newStudent, school: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none">
                  {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                <span className="mb-2 block">الصف</span>
                <select value={newStudent.grade} onChange={(e) => setNewStudent({ ...newStudent, grade: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none">
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
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

function OrgManager({ splitMapState, splitSaving, toggleSplit }: {
  splitMapState: Record<string, boolean>;
  splitSaving: string | null;
  toggleSplit: (g: string) => void;
}) {
  const cat = useCatalog();
  const [tab, setTab] = useState<'grades' | 'schools'>('grades');
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [linking, setLinking] = useState<string | null>(null);

  const flash = (text: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast((p) => (p?.text === text ? null : p)), tone === 'err' ? 6000 : 3000);
  };

  const addOne = async (kind: 'grade' | 'school') => {
    const name = newName.trim();
    if (!name) { flash('اكتب الاسم أولاً', 'err'); return; }
    setBusy('add');
    try {
      await jsonFetch(`/api/teacher/org/${kind === 'grade' ? 'grades' : 'schools'}`, { method: 'POST', body: { name } });
      setNewName('');
      await cat.reload(true);
      bustCatalog();
      flash(`تمت إضافة «${name}» — يظهر الآن في كل النظام.`);
    } catch (e: any) { flash(e?.message || 'تعذر الإضافة', 'err'); }
    finally { setBusy(null); }
  };

  const rename = async (kind: 'grade' | 'school', id: string) => {
    const name = editName.trim();
    if (!name) { flash('الاسم لا يمكن أن يكون فارغاً', 'err'); return; }
    setBusy(id);
    try {
      const r = await jsonFetch(`/api/teacher/org/${kind === 'grade' ? 'grades' : 'schools'}/${id}`, { method: 'PATCH', body: { name } });
      setEditing(null);
      await cat.reload(true);
      bustCatalog();
      flash(r?.message || 'تم الحفظ');
    } catch (e: any) { flash(e?.message || 'تعذر الحفظ', 'err'); }
    finally { setBusy(null); }
  };

  const remove = async (kind: 'grade' | 'school', id: string, name: string) => {
    if (!window.confirm(`حذف «${name}»؟`)) return;
    setBusy(id);
    try {
      const r = await jsonFetch(`/api/teacher/org/${kind === 'grade' ? 'grades' : 'schools'}/${id}`, { method: 'DELETE' });
      await cat.reload(true);
      bustCatalog();
      flash(r?.message || 'تم الحذف');
    } catch (e: any) { flash(e?.message || 'تعذر الحذف', 'err'); }
    finally { setBusy(null); }
  };

  const toggleLink = async (gradeId: string, schoolId: string, on: boolean) => {
    setLinking(gradeId);
    try {
      await jsonFetch(`/api/teacher/org/grades/${encodeURIComponent(gradeId)}/schools/${encodeURIComponent(schoolId)}`, { method: 'POST', body: { linked: on } });
      await cat.reload(true);
      bustCatalog();
      flash(on ? 'أُضيفت المدرسة للصف' : 'أُزيلت المدرسة من الصف');
    } catch (e: any) { flash(e?.message || 'تعذر تحديث الربط', 'err'); }
    finally { setLinking(null); }
  };

  const toggleActive = async (kind: 'grade' | 'school', id: string, isActive: boolean) => {
    setBusy(id);
    try {
      await jsonFetch(`/api/teacher/org/${kind === 'grade' ? 'grades' : 'schools'}/${id}`, { method: 'PATCH', body: { isActive: !isActive } });
      await cat.reload(true);
      bustCatalog();
    } catch (e: any) { flash(e?.message || 'تعذر التحديث', 'err'); }
    finally { setBusy(null); }
  };

  const totalStudents = cat.grades.reduce((a, g) => a + (g.students || 0), 0);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#17413f]/30 bg-card shadow-md">
      {/* الترويسة */}
      <div className="relative overflow-hidden bg-gradient-to-l from-[#0d2926] via-[#17413f] to-[#2a7a72] p-6 text-white">
        <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 shadow-lg backdrop-blur-sm"><Landmark size={28} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-extrabold">الصفوف والمدارس</h2>
            <p className="mt-1 text-sm leading-6 text-white/80">
              ابنِ نظامك بنفسك — أضف صفاً أو مدرسة فيظهران فوراً في كل شاشات المنصة.
            </p>
          </div>
          <div className="flex gap-2">
            {[
              { v: cat.grades.length, l: 'صف' },
              { v: cat.schools.length, l: 'مدرسة' },
              { v: totalStudents, l: 'طالب' },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl bg-white/10 px-4 py-2 text-center ring-1 ring-white/15 backdrop-blur-md">
                <p className="font-display text-xl font-bold text-accent">{s.v}</p>
                <p className="text-[10px] font-semibold text-white/70">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* التبويبات */}
      <div className="flex gap-2 border-b border-border bg-secondary/40 p-3">
        {[
          { id: 'grades' as const, label: 'الصفوف الدراسية', icon: GraduationCap, n: cat.grades.length },
          { id: 'schools' as const, label: 'المدارس', icon: Landmark, n: cat.schools.length },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-extrabold transition-all active:scale-[.98] ${tab === t.id ? 'bg-primary text-primary-foreground shadow-md' : 'border-2 border-border bg-card text-muted-foreground active:bg-secondary'}`}
              data-testid={`org-tab-${t.id}`}
            >
              <Icon size={18} /> {t.label}
              <span className={`rounded-lg px-2 py-0.5 text-[11px] tabular-nums ${tab === t.id ? 'bg-white/20' : 'bg-secondary'}`}>{t.n}</span>
            </button>
          );
        })}
      </div>

      {/* الإضافة السريعة */}
      <div className="flex flex-col gap-2.5 border-b border-border bg-secondary/20 p-4 sm:flex-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOne(tab); } }}
          placeholder={tab === 'grades' ? 'اسم الصف الجديد — مثال: الصف الحادي عشر' : 'اسم المدرسة الجديدة — مثال: مدرسة النور'}
          className={`${touchCls} flex-1`}
          data-testid="org-new-name"
        />
        <button type="button" onClick={() => addOne(tab)} disabled={busy === 'add' || !newName.trim()} className={`${touchBtnPrimary} shrink-0`} data-testid="org-add">
          {busy === 'add' ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
          {busy === 'add' ? 'جارٍ…' : 'إضافة'}
        </button>
      </div>

      {/* القائمة */}
      <div className="max-h-[620px] space-y-2.5 overflow-y-auto overscroll-contain p-4">
        {tab === 'grades' ? (
          !cat.grades.length ? <EmptyOrg /> : cat.grades.map((g) => {
            const on = editing === g.id;
            return (
              <div key={g.id} className="overflow-hidden rounded-2xl border-2 border-border bg-background">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow" style={{ background: g.color }}><GraduationCap size={20} /></span>
                  {on ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') rename('grade', g.id); if (e.key === 'Escape') setEditing(null); }}
                      className={`${touchCls} flex-1`}
                      autoFocus
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-extrabold text-primary">{g.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                        <span className="rounded-md bg-secondary px-2 py-0.5">{g.students} طالب</span>
                        <span className="rounded-md bg-[#6a1b9a]/10 px-2 py-0.5 text-[#6a1b9a]">{g.schools.length} مدرسة</span>
                        {!g.isActive ? <span className="rounded-md bg-muted px-2 py-0.5">معطّل</span> : null}
                      </p>
                    </div>
                  )}
                  {on ? (
                    <>
                      <button type="button" onClick={() => rename('grade', g.id)} disabled={busy === g.id} className={`${touchBtnPrimary} min-h-[48px] px-4 text-sm`}><Save size={16} /> حفظ</button>
                      <button type="button" onClick={() => setEditing(null)} className={`${touchBtnSoft} min-h-[48px] px-4 text-sm`}>إلغاء</button>
                    </>
                  ) : (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button type="button" onClick={() => toggleSplit(g.name)} disabled={splitSaving === g.name} className={`min-h-[44px] rounded-xl px-3.5 text-xs font-extrabold transition-colors ${splitMapState[g.name] === true ? 'bg-gradient-to-l from-[#6a1b9a] to-[#b7791f] text-white shadow-sm' : 'border-2 border-border bg-card text-muted-foreground'}`} data-testid={`switch-split-${g.name}`} title="تقسيم طلاب هذا الصف عن طالباته">
                        {splitSaving === g.name ? '…' : splitMapState[g.name] === true ? 'مقسّم ♂♀' : 'غير مقسّم'}
                      </button>
                      <button type="button" onClick={() => { setEditing(g.id); setEditName(g.name); }} className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground active:bg-secondary" aria-label="تعديل"><Pencil size={16} /></button>
                      <button type="button" onClick={() => toggleActive('grade', g.id, g.isActive)} className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground active:bg-secondary" aria-label="تفعيل/تعطيل">{g.isActive ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                      <button type="button" onClick={() => remove('grade', g.id, g.name)} className="grid h-11 w-11 place-items-center rounded-xl text-destructive active:bg-destructive/10" aria-label="حذف"><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>

                {/* مدارس هذا الصف */}
                <div className="border-t border-border bg-secondary/25 p-4">
                  <p className="mb-2.5 flex items-center gap-2 text-xs font-extrabold text-primary">
                    <Landmark size={14} className="text-[#6a1b9a]" /> في أي مدرسة يوجد هذا الصف؟
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cat.schools.filter((s) => s.isActive).map((s) => {
                      const linked = g.schoolIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={linking === g.id}
                          onClick={() => toggleLink(g.id, s.id, !linked)}
                          className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-xs font-extrabold transition-all active:scale-95 ${linked ? 'bg-[#6a1b9a] text-white shadow-sm' : 'border-2 border-dashed border-border bg-card text-muted-foreground'}`}
                          data-testid={`link-${g.id}-${s.id}`}
                        >
                          <span className={`grid h-5 w-5 place-items-center rounded-md ${linked ? 'bg-white/25' : 'border border-border'}`}>{linked ? <Check size={12} /> : null}</span>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                  {g.schools.length > 1 ? (
                    <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-[#6a1b9a]/8 px-3 py-2.5 text-[11px] font-bold leading-5 text-[#6a1b9a]">
                      <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                      هذا الصف في {g.schools.length} مدارس — لذلك يظهر تحت الصف منتقي «المدرسة» في كل مكان تختار فيه من يصل إليه المحتوى.
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          !cat.schools.length ? <EmptyOrg /> : cat.schools.map((s) => {
            const on = editing === s.id;
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-background p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow" style={{ background: s.color }}><Landmark size={20} /></span>
                {on ? (
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') rename('school', s.id); if (e.key === 'Escape') setEditing(null); }} className={`${touchCls} flex-1`} autoFocus />
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-extrabold text-primary">{s.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                      <span className="rounded-md bg-secondary px-2 py-0.5">{s.students} طالب</span>
                      <span className="rounded-md bg-[#17413f]/10 px-2 py-0.5 text-[#17413f]">{s.grades.length} صفوف</span>
                      {!s.isActive ? <span className="rounded-md bg-muted px-2 py-0.5">معطّلة</span> : null}
                    </p>
                    {s.grades.length ? (
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {s.grades.map((g) => <span key={g} className="rounded-md bg-secondary/70 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{g}</span>)}
                      </p>
                    ) : null}
                  </div>
                )}
                {on ? (
                  <>
                    <button type="button" onClick={() => rename('school', s.id)} disabled={busy === s.id} className={`${touchBtnPrimary} min-h-[48px] px-4 text-sm`}><Save size={16} /> حفظ</button>
                    <button type="button" onClick={() => setEditing(null)} className={`${touchBtnSoft} min-h-[48px] px-4 text-sm`}>إلغاء</button>
                  </>
                ) : (
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" onClick={() => { setEditing(s.id); setEditName(s.name); }} className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground active:bg-secondary" aria-label="تعديل"><Pencil size={16} /></button>
                    <button type="button" onClick={() => toggleActive('school', s.id, s.isActive)} className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground active:bg-secondary" aria-label="تفعيل/تعطيل">{s.isActive ? <Eye size={16} /> : <EyeOff size={16} />}</button>
                    <button type="button" onClick={() => remove('school', s.id, s.name)} className="grid h-11 w-11 place-items-center rounded-xl text-destructive active:bg-destructive/10" aria-label="حذف"><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {toast ? (
        <p className={`flex items-center gap-2 border-t px-5 py-3.5 text-sm font-extrabold ${toast.tone === 'ok' ? 'border-green-500/30 bg-green-500/10 text-green-800' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>
          {toast.tone === 'ok' ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />} {toast.text}
        </p>
      ) : null}
    </div>
  );
}

function EmptyOrg() {
  return (
    <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      لا يوجد بعد — اكتب الاسم في الأعلى واضغط «إضافة».
    </p>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   كشف العلامات — ملف كل طالب
   ───────────────────────────────────────────────────────────────────────
   مدرسة ← صف ← طالب ← الملف الكامل: علاماته في الاختبارات (نسبة مئوية)
   والواجبات (علامة/قصوى يضعها الأستاذ) ومهام الدفتر (علامة/قصوى)، وما
   سلّمه وما لم يسلّمه، ومشاركته في التأسيس. مصمم للآيباد أولاً ثم
   الهاتف والحاسوب.
   ═══════════════════════════════════════════════════════════════════════ */

/** لون التقدير — يُقرأ بنظرة واحدة على الآيباد */
function reportTone(pct: number | null): string {
  if (pct === null) return 'bg-muted text-muted-foreground';
  if (pct >= 90) return 'bg-green-600/12 text-green-800';
  if (pct >= 70) return 'bg-primary/10 text-primary';
  if (pct >= 60) return 'bg-[#b7791f]/15 text-[#b7791f]';
  return 'bg-destructive/10 text-destructive';
}

/* ═══════════════ تصدير ملف الطالب إلى Excel ═══════════════ */
function exportStudentFileExcel(file: any) {
  const s = file.student || {};
  const d = (v: any) => String(v || '').slice(0, 10);
  const st = (done: boolean, score: any, extra = '') =>
    done ? (score === null || score === undefined ? `مُسلَّم — بانتظار التصحيح${extra}` : `${score}${extra}`) : 'لم يُسلَّم';

  const sheets: SheetSpec[] = [
    {
      name: 'الملف',
      widths: [24, 44],
      rows: [
        ['الاسم', s.name || ''],
        ['المدرسة', s.school || ''],
        ['الصف', s.grade || ''],
        ['الشعبة', s.section || ''],
        ['الجنس', s.gender || ''],
        ['الهاتف', s.phone || ''],
        ['البريد', s.email || ''],
        ['المجموع', file.overall?.percent === null || file.overall?.percent === undefined ? 'بلا علامات' : `${file.overall.percent}%`],
        ['التقدير', file.overall?.level || ''],
        ['الاختبارات', file.exams?.avg === null ? 'بلا علامات' : `${file.exams.avg}% (${file.exams.taken}/${file.exams.total})`],
        ['الواجبات', `${file.homework?.done}/${file.homework?.total} — ${file.homework?.earned}/${file.homework?.possible}`],
        ['الدفتر', `${file.notebook?.done}/${file.notebook?.total} — ${file.notebook?.earned}/${file.notebook?.possible}`],
        ['التأسيس', file.foundation?.inFoundation ? `${file.foundation.done}/${file.foundation.total}` : 'غير مشارك'],
        ['النواقص', file.missing?.count ?? 0],
      ],
    },
    {
      name: 'الاختبارات',
      widths: [34, 14, 12, 14, 12],
      rows: [
        ['الاختبار', 'التاريخ', 'الأسئلة', 'الأفضل %', 'المحاولات'],
        ...(file.exams?.items || []).map((e: any) => [
          e.title || '',
          d(e.date),
          e.questions ?? '',
          e.best === null || e.best === undefined ? 'لم يتقدم' : e.best,
          (e.attempts || []).length,
        ]),
      ],
    },
    {
      name: 'الواجبات',
      widths: [34, 12, 12, 16, 14, 30],
      rows: [
        ['الواجب', 'القصوى', 'العلامة', 'الحالة', 'تاريخ التسليم', 'ملاحظة الأستاذ'],
        ...(file.homework?.items || []).map((h: any) => [
          h.title || '',
          h.points ?? '',
          h.score === null || h.score === undefined ? (h.status === 'done' ? 'بانتظار التصحيح' : 'لم يُسلَّم') : h.score,
          h.status === 'done' ? (h.subStatus || 'مُسلَّم') : 'ناقص',
          d(h.submittedAt),
          h.feedback || '',
        ]),
      ],
    },
    {
      name: 'الدفتر',
      widths: [34, 12, 12, 16, 14, 30],
      rows: [
        ['المهمة', 'القصوى', 'العلامة', 'الحالة', 'تاريخ التسليم', 'ملاحظة الأستاذ'],
        ...(file.notebook?.items || []).map((t: any) => [
          t.title || '',
          t.points ?? '',
          t.score === null || t.score === undefined ? (t.status === 'done' ? 'بانتظار التصحيح' : 'لم يُسلَّم') : t.score,
          t.status === 'done' ? (t.subStatus || 'مُسلَّم') : 'ناقص',
          d(t.submittedAt),
          t.feedback || '',
        ]),
      ],
    },
    {
      name: 'التأسيس',
      widths: [30, 16, 14, 12],
      rows: [
        ['المستوى', 'المنجز', 'الكلي', 'النسبة %'],
        ...(file.foundation?.levels || []).map((l: any) => [l.title || '', l.done ?? '', l.total ?? '', l.percent ?? '']),
      ],
    },
    {
      name: 'النواقص',
      widths: [16, 52],
      rows: [
        ['النوع', 'العنوان'],
        ...(file.missing?.exams || []).map((t: string) => ['اختبار', t]),
        ...(file.missing?.homework || []).map((t: string) => ['واجب', t]),
        ...(file.missing?.notebook || []).map((t: string) => ['مهمة دفتر', t]),
      ],
    },
  ];

  if (file.compare && file.compare.count > 1) {
    const c = file.compare;
    sheets.push({
      name: 'المقارنة',
      widths: [16, 16, 20],
      rows: [
        ['القسم', 'الطالب %', `متوسط ${c.count} زملاء %`],
        ['المجموع', file.overall?.percent ?? '—', c.overall ?? '—'],
        ['الاختبارات', file.exams?.avg ?? '—', c.exams ?? '—'],
        ['الواجبات', file.homework?.percent ?? '—', c.homework ?? '—'],
        ['الدفتر', file.notebook?.percent ?? '—', c.notebook ?? '—'],
        ['التأسيس', file.foundation?.percent ?? '—', c.foundation ?? '—'],
      ],
    });
  }

  downloadWorkbook(reportFileName(`كشف ${s.name || 'طالب'}`), sheets, {
    title: `كشف علامات — ${s.name || ''}`,
    subject: `${s.school || ''} · ${s.grade || ''}`,
  });
}

function TeacherReportPage() {
  useCatalog();
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [q, setQ] = useState('');
  const [overview, setOverview] = useState<any>(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [ovErr, setOvErr] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [file, setFile] = useState<any>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileErr, setFileErr] = useState('');
  const [viewing, setViewing] = useState<null | { kind: 'hw' | 'nb'; itemId: string; title: string }>(null);

  const loadOverview = useCallback(() => {
    setOvLoading(true);
    setOvErr('');
    const params = new URLSearchParams();
    if (school) params.set('school', school);
    if (grade) params.set('grade', grade);
    jsonFetch(`/api/teacher/report/overview${params.toString() ? `?${params.toString()}` : ''}`)
      .then((d) => setOverview(d))
      .catch((e: Error) => setOvErr(e?.message || 'تعذر تحميل الكشف'))
      .finally(() => setOvLoading(false));
  }, [school, grade]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const openFile = (id: string) => {
    setSelectedId(id);
    setFile(null);
    setFileErr('');
    setFileLoading(true);
    jsonFetch(`/api/teacher/report/student/${id}`)
      .then((d) => {
        setFile(d);
        // الملف يظهر أسفل القائمة — ننزل إليه فوراً وإلا ظن الأستاذ أن الزر لا يعمل
        window.setTimeout(() => {
          document.querySelector('[data-testid="report-student-file"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      })
      .catch((e: Error) => setFileErr(e?.message || 'تعذر فتح ملف الطالب'))
      .finally(() => setFileLoading(false));
  };
  const [sortBy, setSortBy] = useState<'active' | 'name' | 'overall' | 'missing'>('active');

  const students: any[] = Array.isArray(overview?.students) ? overview.students : [];
  const schools: string[] = Array.isArray(overview?.schools) && overview.schools.length ? overview.schools : [];
  const grades: string[] = Array.isArray(overview?.grades) && overview.grades.length ? overview.grades : [];
  const shown = useMemo(() => {
    const needle = String(q || '').trim();
    const list = !needle ? [...students] : students.filter((s) => (s.name || '').includes(needle));
    if (sortBy === 'overall') {
      list.sort((a, b) => (typeof b.overall === 'number' ? b.overall : -1) - (typeof a.overall === 'number' ? a.overall : -1));
    } else if (sortBy === 'missing') {
      list.sort((a, b) => (Number(b.missing) || 0) - (Number(a.missing) || 0));
    } else if (sortBy === 'active') {
      // الأحدث نشاطاً أولاً — ومن بلا نشاط في الآخر ثم أبجدياً
      list.sort((a, b) => {
        const ta = String(a.lastActive || '');
        const tb = String(b.lastActive || '');
        if (tb !== ta) return tb > ta ? 1 : -1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
      });
    }
    return list;
  }, [students, q, sortBy]);

  const classAvg = useMemo(() => {
    const vals = students.map((s) => s.overall).filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [students]);
  const totalMissing = useMemo(() => students.reduce((a, s) => a + (Number(s.missing) || 0), 0), [students]);

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow="العلامات والنواقص والمشاركة — لكل طالب"
        title="كشف العلامات"
        body="اختر المدرسة ثم الصف ثم الطالب لتفتح ملفه الكامل: علاماته في الاختبارات والواجبات والدفتر، وما سلّمه وما فاته، ومشاركته في التأسيس. الاختبار نسبة مئوية، والواجب والدفتر علامة من قصوى يضعها الأستاذ."
        stats={[
          { value: students.length, label: 'طالب في الكشف' },
          { value: classAvg === null ? '—' : `${classAvg}%`, label: 'متوسط الصف' },
          { value: totalMissing, label: 'بند ناقص' },
        ]}
      />

      {/* ── المدرسة ← الصف ← البحث ── */}
      <div className="mb-4 space-y-2.5">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="report-schools">
          <ReportPill active={!school} onClick={() => setSchool('')} label="كل المدارس" />
          {schools.map((s) => (
            <ReportPill key={s} active={school === s} onClick={() => setSchool(school === s ? '' : s)} label={s} />
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="report-grades">
          <ReportPill active={!grade} onClick={() => setGrade('')} label="كل الصفوف" />
          {grades.map((g) => (
            <ReportPill key={g} active={grade === g} onClick={() => setGrade(grade === g ? '' : g)} label={g} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم الطالب..."
              className={`${touchCls} pr-12`}
              data-testid="input-report-search"
            />
          </div>
          <div className="flex shrink-0 gap-1.5 rounded-2xl border border-border bg-card p-1.5" data-testid="report-sort">
            {([
              { id: 'active', label: 'الأحدث نشاطاً' },
              { id: 'name', label: 'بالاسم' },
              { id: 'overall', label: 'الأعلى علامة' },
              { id: 'missing', label: 'الأكثر نواقص' },
            ] as const).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSortBy(o.id)}
                data-testid={`button-sort-${o.id}`}
                className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition-colors ${sortBy === o.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {ovLoading ? <StateNotice type="loading" /> : ovErr ? (
        <StateNotice type="error" onRetry={loadOverview} />
      ) : !shown.length ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><UsersRound size={30} /></span>
          <p className="font-display text-xl font-bold text-primary">لا طلاب في هذا التحديد</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">غيّر المدرسة أو الصف أو امسح البحث.</p>
        </div>
      ) : (
        /* ── شبكة الطلاب: بطاقة لكل طالب تفتح ملفه ── */
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openFile(s.id)}
              data-testid={`button-report-student-${s.id}`}
              className={`group flex flex-col gap-3 rounded-3xl border bg-card p-5 text-right shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${selectedId === s.id ? 'border-accent ring-4 ring-accent/20' : 'border-border hover:border-primary/35'}`}
            >
              <span className="flex items-center gap-3">
                <Avatar name={s.name} src={s.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base font-extrabold text-primary">{s.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground">
                    {[s.school, s.grade].filter(Boolean).join(' · ') || 'بلا بيانات'}
                  </span>
                </span>
                {s.overall === null ? (
                  <span className="rounded-xl bg-muted px-2.5 py-1.5 text-xs font-extrabold text-muted-foreground">بلا علامات</span>
                ) : (
                  <span className={`rounded-xl px-2.5 py-1.5 text-sm font-extrabold tabular-nums ${reportTone(s.overall)}`}>
                    {s.overall}%
                  </span>
                )}
              </span>

              <span className="grid grid-cols-4 gap-1.5 text-center">
                <ReportMini label="اختبار" value={s.exams.avg === null ? '—' : `${s.exams.avg}%`} sub={`${s.exams.taken}/${s.exams.total}`} />
                <ReportMini label="واجب" value={`${s.homework.done}/${s.homework.total}`} sub={s.homework.percent === null ? '—' : `${s.homework.percent}%`} />
                <ReportMini label="دفتر" value={`${s.notebook.done}/${s.notebook.total}`} sub={s.notebook.percent === null ? '—' : `${s.notebook.percent}%`} />
                <ReportMini label="تأسيس" value={s.foundation.inFoundation ? `${s.foundation.done}/${s.foundation.total}` : '—'} sub={s.foundation.percent === null ? (s.foundation.inFoundation ? '0%' : 'خارج') : `${s.foundation.percent}%`} />
              </span>

              <span className="flex items-center justify-between">
                {s.missing > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-extrabold text-destructive">
                    <CircleAlert size={12} /> {s.missing} ناقص
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-600/12 px-2.5 py-1 text-[11px] font-extrabold text-green-800">
                    <CheckCircle2 size={12} /> مكتمل
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs font-extrabold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  افتح الملف <ArrowLeft size={13} />
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── ملف الطالب الكامل ── */}
      {/* ── ملف الطالب: نافذة مستقلة فيها كل شيء ── */}
      {selectedId ? (
        <Modal
          title={file?.student?.name || 'ملف الطالب'}
          eyebrow="كشف العلامات الكامل — واجباته ودفتره وامتحاناته وعلاماته"
          onClose={() => { setSelectedId(''); setFile(null); }}
          maxWidth="max-w-5xl"
        >
          <div data-testid="report-student-file">
            {fileLoading ? <StateNotice type="loading" /> : fileErr || !file ? (
              <StateNotice type="error" onRetry={() => openFile(selectedId)} />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => exportStudentFileExcel(file)}
                    className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-[#1d6f42] px-5 text-sm font-extrabold text-white shadow-md transition-all hover:-translate-y-0.5 active:scale-[.98]"
                    data-testid="button-export-file-excel"
                  >
                    <Download size={17} /> تصدير ملف Excel
                  </button>
                  <span className="self-center text-[11px] font-bold text-muted-foreground">
                    7 أوراق: الملف · الاختبارات · الواجبات · الدفتر · التأسيس · النواقص · المقارنة
                  </span>
                </div>
                <ReportStudentFile
                  file={file}
                  onClose={() => { setSelectedId(''); setFile(null); }}
                  onView={(kind, itemId, title) => setViewing({ kind, itemId, title })}
                  onReload={() => { loadOverview(); openFile(selectedId); }}
                />
              </>
            )}
          </div>
        </Modal>
      ) : null}

      {viewing && file ? (
        <ReportWorkViewer
          kind={viewing.kind}
          itemId={viewing.itemId}
          title={viewing.title}
          studentId={file.student.id}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </Shell>
  );
}

function ReportPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'border border-border bg-card text-muted-foreground hover:text-primary'}`}
    >
      {label}
    </button>
  );
}

function ReportMini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <span className="rounded-xl bg-secondary/70 px-1 py-2">
      <span className="block text-[10px] font-extrabold text-muted-foreground">{label}</span>
      <span className="mt-0.5 block text-[13px] font-extrabold tabular-nums text-primary">{value}</span>
      <span className="block text-[10px] font-bold tabular-nums text-muted-foreground">{sub}</span>
    </span>
  );
}
/* خلية مقارنة: علامة الطالب مقابل متوسط زملائه — فوق/تحت/مساوٍ */
function CompareCell({ label, mine, avg, suffix = '' }: {
  label: string; mine: number | null; avg: number | null; suffix?: string;
}) {
  if (mine === null && avg === null) {
    return (
      <span className="rounded-xl bg-background px-2 py-2 text-center">
        <span className="block text-[10px] font-extrabold text-muted-foreground">{label}</span>
        <span className="mt-0.5 block text-xs font-bold text-muted-foreground">—</span>
      </span>
    );
  }
  const diff = mine !== null && avg !== null ? mine - avg : null;
  const tone = diff === null ? 'text-muted-foreground' : diff > 0 ? 'text-green-700' : diff < 0 ? 'text-destructive' : 'text-muted-foreground';
  return (
    <span className="rounded-xl bg-background px-2 py-2 text-center">
      <span className="block text-[10px] font-extrabold text-muted-foreground">{label}</span>
      <span className="mt-0.5 block text-[13px] font-extrabold tabular-nums text-primary">
        {mine === null ? '—' : `${mine}${suffix}`}
        <span className="font-bold text-muted-foreground"> / {avg === null ? '—' : `${avg}${suffix}`}</span>
      </span>
      {diff !== null ? (
        <span className={`mt-0.5 block text-[10px] font-extrabold tabular-nums ${tone}`}>
          {diff > 0 ? `▲ +${diff}` : diff < 0 ? `▼ ${diff}` : '＝ مساوٍ'}
        </span>
      ) : null}
    </span>
  );
}

/* ═══════════════ ملف الطالب: كل شيء عنه في شاشة واحدة ═══════════════ */
function ReportStudentFile({ file, onClose, onView, onReload }: {
  file: any; onClose: () => void; onView: (kind: 'hw' | 'nb', itemId: string, title: string) => void; onReload: () => void;
}) {
  const s = file.student;
  const [tab, setTab] = useState<'exams' | 'homework' | 'notebook' | 'foundation' | 'missing'>('exams');
  const ov = file.overall || { percent: null, level: '' };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl" data-testid="report-file-card">
      {/* الترويسة: الطالب + الحلقة + التقدير */}
      <div className="relative overflow-hidden bg-gradient-to-l from-[#0c2725] via-[#17413f] to-[#2a7a72] p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -left-14 -top-14 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar name={s.name} src={s.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-accent">ملف الطالب الكامل</p>
            <h2 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{s.name}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-white/75">
              {[s.school, s.grade, s.section ? `شعبة ${s.section}` : '', s.gender].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/60">
              {s.phone ? <span className="inline-flex items-center gap-1"><Phone size={11} /> <span dir="ltr">{s.phone}</span></span> : null}
              {s.email ? <span className="inline-flex items-center gap-1"><Mail size={11} /> <span dir="ltr">{s.email}</span></span> : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2">
            <ReportRing value={ov.percent} />
            <span className="rounded-full bg-accent px-3.5 py-1 text-xs font-extrabold text-[#3a2c07]">{ov.level}</span>
          </div>
          <button type="button" onClick={onClose} className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white/80 transition-colors hover:bg-white/20" aria-label="إغلاق الملف" data-testid="button-close-file">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* مؤشرات الأقسام الأربعة */}
      {/* المقارنة: الطالب مقابل متوسط زملائه (نفس الصف والمدرسة) */}
      {file.compare && file.compare.count > 1 ? (
        <div className="border-b border-border bg-secondary/30 px-4 py-3.5 sm:px-5" data-testid="report-compare">
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
            <UsersRound size={13} /> مقارنة مع متوسط {file.compare.count} طالب من نفس الصف والمدرسة
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <CompareCell label="المجموع" mine={file.overall.percent} avg={file.compare.overall} />
            <CompareCell label="اختبارات" mine={file.exams.avg} avg={file.compare.exams} suffix="%" />
            <CompareCell label="واجبات" mine={file.homework.percent} avg={file.compare.homework} suffix="%" />
            <CompareCell label="دفتر" mine={file.notebook.percent} avg={file.compare.notebook} suffix="%" />
            <CompareCell label="تأسيس" mine={file.foundation.percent} avg={file.compare.foundation} suffix="%" />
          </div>
        </div>
      ) : null}

      {/* مؤشرات الأقسام الأربعة */}
      <div className="grid grid-cols-2 gap-2.5 p-4 sm:p-5 lg:grid-cols-4">
        <ReportKpi icon={<Target size={19} />} tone="#0d47a1" label="الاختبارات" main={file.exams.avg === null ? '—' : `${file.exams.avg}%`} sub={`${file.exams.taken} من ${file.exams.total}`} onClick={() => setTab('exams')} active={tab === 'exams'} />
        <ReportKpi icon={<ClipboardCheck size={19} />} tone="#2e7d32" label="الواجبات" main={`${file.homework.done}/${file.homework.total}`} sub={file.homework.percent === null ? 'بلا علامات' : `${file.homework.earned}/${file.homework.possible} · ${file.homework.percent}%`} onClick={() => setTab('homework')} active={tab === 'homework'} />
        <ReportKpi icon={<NotebookPen size={19} />} tone="#6a1b9a" label="مهام الدفتر" main={`${file.notebook.done}/${file.notebook.total}`} sub={file.notebook.percent === null ? 'بلا علامات' : `${file.notebook.earned}/${file.notebook.possible} · ${file.notebook.percent}%`} onClick={() => setTab('notebook')} active={tab === 'notebook'} />
        <ReportKpi icon={<Sprout size={19} />} tone="#b7791f" label="التأسيس" main={file.foundation.inFoundation ? `${file.foundation.done}/${file.foundation.total}` : 'خارج'} sub={file.foundation.percent === null ? (file.foundation.inFoundation ? 'لم ينجز بعد' : 'غير مشارك') : `${file.foundation.percent}%`} onClick={() => setTab('foundation')} active={tab === 'foundation'} />
      </div>

      {/* تبويبات التفاصيل */}
      <div className="flex gap-2 overflow-x-auto border-y border-border bg-secondary/40 px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          { id: 'exams', label: `الاختبارات (${file.exams.taken}/${file.exams.total})` },
          { id: 'homework', label: `الواجبات (${file.homework.done}/${file.homework.total})` },
          { id: 'notebook', label: `الدفتر (${file.notebook.done}/${file.notebook.total})` },
          { id: 'foundation', label: 'التأسيس' },
          { id: 'missing', label: `النواقص (${file.missing.count})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            data-testid={`button-file-tab-${t.id}`}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card text-muted-foreground hover:text-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {tab === 'exams' && <ReportExamsTab exams={file.exams} />}
        {tab === 'homework' && <ReportWorkTab kind="hw" data={file.homework} emptyHint="لا واجبات موجهة لهذا الطالب بعد." onView={onView} />}
        {tab === 'notebook' && <ReportWorkTab kind="nb" data={file.notebook} emptyHint="لا مهام دفتر موجهة لهذا الطالب بعد." onView={onView} />}
        {tab === 'foundation' && <ReportFoundationTab foundation={file.foundation} />}
        {tab === 'missing' && <ReportMissingTab missing={file.missing} />}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-border bg-secondary/30 px-4 py-3.5 sm:px-5">
        <button type="button" onClick={onReload} className={`${touchBtnSoft} px-5 py-2.5 text-xs`} data-testid="button-file-reload">
          <RefreshCw size={14} /> تحديث الملف
        </button>
        <span className="ms-auto text-[11px] font-bold text-muted-foreground">
          الاختبار نسبة مئوية · الواجب والدفتر علامة من قصوى يضعها الأستاذ
        </span>
      </div>
    </section>
  );
}

/** حلقة المجموع — كبيرة وواضحة على الآيباد */
function ReportRing({ value }: { value: number | null }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="-rotate-90" viewBox="0 0 80 80" width={96} height={96}>
        <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="8" />
        <circle
          cx="40" cy="40" r={radius} fill="none" stroke="#e7b55f" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={value === null ? circumference : circumference - (circumference * Math.min(value, 100)) / 100}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-xl font-bold tabular-nums text-white">
        {value === null ? '—' : `${value}%`}
      </span>
    </div>
  );
}

function ReportKpi({ icon, tone, label, main, sub, onClick, active }: {
  icon: ReactNode; tone: string; label: string; main: string; sub: string; onClick: () => void; active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-right transition-all ${active ? 'border-accent ring-4 ring-accent/20' : 'border-border bg-background hover:border-primary/35'}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ background: tone }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-extrabold text-muted-foreground">{label}</span>
        <span className="block truncate font-display text-lg font-extrabold tabular-nums text-primary">{main}</span>
        <span className="block truncate text-[10px] font-bold text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}

/* ── تبويب الاختبارات: كل اختبار + أفضل علامة + المحاولات ── */
function ReportExamsTab({ exams }: { exams: any }) {
  if (!exams.items.length) {
    return <ReportEmpty text="لا اختبارات موجهة لهذا الطالب بعد." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {exams.items.map((e: any) => (
        <div key={e.id} className={`rounded-3xl border bg-background p-4 ${e.status === 'missing' ? 'border-dashed border-border' : 'border-border'}`}>
          <div className="flex items-start gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-base font-extrabold tabular-nums ${e.status === 'missing' ? 'bg-muted text-muted-foreground' : 'bg-[#0d47a1] text-white'}`}>
              {e.best === null ? '–' : e.best}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-primary">{e.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-muted-foreground">
                {e.date ? <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {e.date}</span> : null}
                <span>{e.questions} أسئلة</span>
                {e.unitTitle ? <span className="truncate">{e.unitTitle}</span> : null}
              </p>
              {e.status === 'missing' ? (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-extrabold text-destructive">
                  <CircleAlert size={12} /> لم يتقدم
                </p>
              ) : (
                <p className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold tabular-nums ${reportTone(e.best)}`}>
                    الأفضل {e.best}%
                  </span>
                  {e.attempts.length > 1 ? (
                    <span className="text-[11px] font-bold text-muted-foreground" title={e.attempts.map((a: any) => `${a.score}%`).join('، ')}>
                      {e.attempts.length} محاولات
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── تبويب الواجبات/الدفتر: سلّم X من Y + كل بند بعلامته ── */
function ReportWorkTab({ kind, data, emptyHint, onView }: {
  kind: 'hw' | 'nb'; data: any; emptyHint: string; onView: (kind: 'hw' | 'nb', itemId: string, title: string) => void;
}) {
  if (!data.items.length) {
    return <ReportEmpty text={emptyHint} />;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-secondary/60 px-4 py-3">
        <span className="text-sm font-extrabold text-primary">
          سلّم {data.done} من أصل {data.total}
        </span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-background">
          <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: data.total ? `${Math.round((data.done / data.total) * 100)}%` : '0%' }} />
        </span>
        <span className="text-sm font-extrabold tabular-nums text-primary">
          {data.earned}/{data.possible}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.items.map((it: any) => (
          <div key={it.id} className={`flex items-start gap-3 rounded-3xl border bg-background p-4 ${it.status === 'missing' ? 'border-dashed' : 'border-border'}`}>
            <span className={`grid h-12 min-w-12 shrink-0 place-items-center rounded-2xl px-2 font-display text-sm font-extrabold tabular-nums ${it.status === 'missing' ? 'bg-muted text-muted-foreground' : 'bg-[#2e7d32] text-white'}`}>
              {it.score === null ? (it.status === 'done' ? '✓' : '–') : `${it.score}/${it.points}`}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-primary">{it.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-muted-foreground">
                {it.dueDate ? <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {it.dueDate}</span> : null}
                <span>القصوى {it.points}</span>
                {it.submittedAt ? <span>{it.submittedAt.slice(0, 10)}</span> : null}
              </p>
              {it.status === 'missing' ? (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-extrabold text-destructive">
                  <CircleAlert size={12} /> لم يسلّم
                </p>
              ) : (
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${reportTone(it.score === null ? null : (it.points ? Math.round((it.score / it.points) * 100) : null))}`}>
                    {it.score === null ? 'بانتظار التصحيح' : `${it.score} من ${it.points}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onView(kind, it.id, it.title)}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-extrabold text-primary transition-colors hover:bg-accent/40"
                    data-testid={`button-view-work-${it.id}`}
                  >
                    <Eye size={12} /> عرض التسليم
                  </button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── تبويب التأسيس: هل هو مشارك؟ وأين وصل في كل مستوى؟ ── */
function ReportFoundationTab({ foundation }: { foundation: any }) {
  if (!foundation.inFoundation) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-background px-6 py-12 text-center">
        <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><Sprout size={30} /></span>
        <p className="font-display text-xl font-bold text-primary">غير مشارك بالتأسيس</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
          هذا الطالب ليس عضواً في أي مستوى تأسيس. أضفه من لوحة «إعداد التأسيس ← من يرى التأسيس؟».
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-secondary/60 px-4 py-3">
        <Sprout size={17} className="text-primary" />
        <span className="text-sm font-extrabold text-primary">
          مشارك في {foundation.levels.length} مستويات · أنجز {foundation.done} من {foundation.total} درساً
        </span>
        {foundation.percent !== null ? (
          <span className="ms-auto rounded-full bg-primary px-3 py-1 text-xs font-extrabold tabular-nums text-primary-foreground">{foundation.percent}%</span>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {foundation.levels.map((l: any) => (
          <div key={l.id} className="rounded-3xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ background: l.color }}>
                {(() => { const I = (UNIT_ICONS as any)[l.icon] || Sprout; return <I size={19} />; })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold text-accent-foreground">{l.subtitle}</p>
                <p className="truncate text-sm font-extrabold text-primary">{l.title}</p>
              </div>
              <span className="shrink-0 text-xs font-extrabold tabular-nums text-primary">{l.done}/{l.total}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${l.percent}%`, background: l.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── تبويب النواقص: كل ما لم يعمله — القائمة التي يطبعها الأستاذ ── */
function ReportMissingTab({ missing }: { missing: any }) {
  const groups = [
    { label: 'اختبارات لم يتقدم لها', items: missing.exams || [], tone: 'text-[#0d47a1]' },
    { label: 'واجبات لم يسلّمها', items: missing.homework || [], tone: 'text-[#2e7d32]' },
    { label: 'مهام دفتر لم يسلّمها', items: missing.notebook || [], tone: 'text-[#6a1b9a]' },
  ];
  if (!missing.count) {
    return (
      <div className="rounded-3xl border border-green-500/30 bg-green-500/8 px-6 py-12 text-center">
        <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-green-600/15 text-green-800"><CheckCircle2 size={30} /></span>
        <p className="font-display text-xl font-bold text-green-800">لا نواقص — كل شيء مُسلَّم</p>
        <p className="mt-2 text-sm text-muted-foreground">هذا الطالب أنجز كل ما طُلب منه.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-2xl bg-destructive/8 px-4 py-3 text-sm font-extrabold text-destructive">
        <CircleAlert size={17} /> عليه {missing.count} بنود ناقصة — تابعها معه
      </p>
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.label} className="overflow-hidden rounded-3xl border border-border bg-background">
          <p className={`border-b border-border bg-secondary/50 px-4 py-3 text-sm font-extrabold ${g.tone}`}>
            {g.label} ({g.items.length})
          </p>
          <ul className="divide-y divide-border">
            {g.items.map((t: string, i: number) => (
              <li key={i} className="flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-primary">
                <CircleAlert size={15} className="shrink-0 text-destructive" />
                <span className="min-w-0 flex-1 truncate">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ReportEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-background px-6 py-12 text-center">
      <p className="text-sm font-semibold text-muted-foreground">{text}</p>
    </div>
  );
}

/* ═══════════════ عارض التسليم: صور الحل + العلامة + الملاحظة ═══════════════ */
function ReportWorkViewer({ kind, itemId, title, studentId, onClose }: {
  kind: 'hw' | 'nb'; itemId: string; title: string; studentId: string; onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr('');
    const url = kind === 'hw'
      ? `/api/teacher/curriculum/assignments/${itemId}/submissions`
      : `/api/teacher/curriculum/notebooks/${itemId}/submissions`;
    jsonFetch(url)
      .then((list: any[]) => {
        if (!live) return;
        const hit = (Array.isArray(list) ? list : []).find((s: any) => s?.student?.id === studentId) || null;
        setData(hit);
      })
      .catch((e: Error) => { if (live) setErr(e?.message || 'تعذر تحميل التسليم'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [kind, itemId, studentId]);

  const photos: string[] = Array.isArray(data?.photos) ? data.photos.filter(Boolean) : [];

  return (
    <Modal title={title} eyebrow={kind === 'hw' ? 'تسليم الواجب' : 'تسليم مهمة الدفتر'} onClose={onClose} maxWidth="max-w-3xl">
      {loading ? <StateNotice type="loading" /> : err || !data ? (
        <StateNotice type="error" onRetry={onClose} />
      ) : (
        <div className="space-y-4 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold tabular-nums ${data.score === null || data.score === undefined ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}>
              {data.score === null || data.score === undefined ? 'بلا علامة بعد' : `العلامة: ${data.score}`}
            </span>
            <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground">{data.status || 'مُسلَّم'}</span>
            {data.submittedAt ? <span className="text-[11px] font-bold text-muted-foreground">{String(data.submittedAt).slice(0, 16).replace('T', ' ')}</span> : null}
          </div>

          {(data.answer || data.note) ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="mb-2 text-xs font-extrabold text-muted-foreground">{kind === 'hw' ? 'إجابة الطالب' : 'ملاحظة الطالب'}</p>
              <p className="whitespace-pre-line text-sm font-semibold leading-7 text-primary">{data.answer || data.note}</p>
            </div>
          ) : null}

          {photos.length ? (
            <div>
              <p className="mb-2 text-xs font-extrabold text-muted-foreground">صور الحل ({photos.length})</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {photos.map((src, i) => (
                  <button key={i} type="button" onClick={() => setImg(src)} className="overflow-hidden rounded-2xl border border-border bg-secondary active:scale-[.98]">
                    <img src={src} alt={`صورة ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-2xl bg-secondary/60 px-4 py-3 text-center text-xs font-bold text-muted-foreground">لا صور مرفقة في هذا التسليم</p>
          )}

          {data.feedback ? (
            <div className="rounded-2xl border-r-4 border-accent bg-accent/10 p-4">
              <p className="mb-1 text-xs font-extrabold text-accent-foreground">ملاحظة الأستاذ</p>
              <p className="whitespace-pre-line text-sm font-semibold leading-7 text-primary">{data.feedback}</p>
            </div>
          ) : null}

          {img ? (
            <button type="button" onClick={() => setImg(null)} className="fixed inset-0 z-[70] grid cursor-zoom-out place-items-center bg-black/80 p-4" aria-label="إغلاق الصورة">
              <img src={img} alt="تكبير" className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl" />
            </button>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
function SettingsPage() {
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
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
          // انتشار فوري: حدّث هوية الموقع في الذاكرة مباشرة ثم أعد الجلب للتأكيد
          queryClient.setQueryData(['platform-identity'], (old: any) => ({ ...(old || {}), ...values }));
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
            {/* ═══ الصفوف والمدارس + التقسيم — كل إدارة النظام من مكان واحد ═══ */}
            <div className="mt-8">
              <OrgManager splitMapState={splitMapState} splitSaving={splitSaving} toggleSplit={toggleSplit} />
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
            <AccountSecurityCard />
            <StaffIdentityCard />
          </div>
        </div>
      )}
    </Shell>
  );
}

/* =========================================================================
   هويتي في الإدارة — الاسم والصورة الشخصيان
   من يبحث عن جهة إدارية ثانية (غير صاحب المنصة) يرى هويته هي:
   اسمها وصورتها في الشريط الجانبي ورأس الصفحة. والرفع هنا يغيّرها
   وحدها ولا يمسّ هوية المنصة العامة.
   ========================================================================= */
function StaffIdentityCard() {
  const [me, setMe] = useState<any>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);

  useEffect(() => {
    fetchAuthMe()
      .then((d) => {
        setMe(d);
        setName(String(d?.user?.fullName || ''));
        setAvatar(String(d?.user?.avatarUrl || ''));
      })
      .catch(() => undefined);
  }, []);

  if (!me || me.isOwner !== false) return null;
  // حساب الرقابة يقرأ فقط — لا بطاقة هوية له (ولا زر حفظ)
  if (me.role === OBSERVER_ROLE) return null;

  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setMsg('');
    uploadFileToCloud(file, '/ard-al-lughah/staff')
      .then((res) => { if (res?.url) setAvatar(res.url); })
      .catch(() => setMsg('تعذر رفع الصورة سحابياً — تحقق من الاتصال.'))
      .finally(() => { setUploading(false); e.target.value = ''; });
  };

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await jsonFetch('/api/teacher/account/profile', {
        method: 'PATCH',
        body: { fullName: name.trim(), avatarUrl: avatar },
      });
      setOk(true);
      setMsg(res?.message || 'تم حفظ هويتك ✓');
      resetAuthGate();
    } catch (e: any) {
      setOk(false);
      setMsg(e?.message || 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 border-t border-border pt-6" data-testid="card-staff-identity">
      <p className="font-bold text-primary text-sm">هويتي في الإدارة</p>
      <p className="mt-1 text-xs text-muted-foreground">
        اسمك وصورتك في بوابة الإدارة — يظهران في الشريط الجانبي ورأس الصفحة. لا يؤثران على هوية المنصة العامة.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Avatar name={name || 'أ'} src={avatar || undefined} />
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 transition-colors hover:bg-secondary/40">
          <span className="text-sm font-bold text-primary">{uploading ? 'جارٍ الرفع...' : 'تغيير صورتي'}</span>
          <Upload size={18} className="text-primary" />
          <input type="file" accept="image/png,image/jpeg" onChange={upload} className="hidden" data-testid="input-staff-avatar" />
        </label>
      </div>
      <div className="mt-4">
        <SettingsField label="اسمي" value={name} onChange={setName} testId="input-staff-name" />
      </div>
      {msg ? (
        <p className={`mt-3 rounded-xl px-4 py-3 text-sm font-bold ${ok ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/10 text-destructive'}`}>{msg}</p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={busy} data-testid="button-save-staff-identity">
          <Save size={17} /> {busy ? 'يحفظ...' : 'حفظ هويتي'}
        </Button>
      </div>
    </div>
  );
}

/* =========================================================================
   حساب دخول المعلم — كلمة السر + بريد الإدارة + ربط Google
========================================================================= */
function AccountSecurityCard() {
  const [info, setInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [adminMail, setAdminMail] = useState('');
  const [busy, setBusy] = useState<'pwd' | 'mail' | null>(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);
  const google = useGetGoogleAuthUrl({ query: { enabled: false, queryKey: getGetGoogleAuthUrlQueryKey() } });

  const load = async () => {
    setLoading(true);
    try {
      const d = await jsonFetch('/api/teacher/account');
      setInfo(d);
      setAdminMail(d.adminEmail || '');
    } catch { setInfo(null); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const savePwd = async (e: FormEvent) => {
    e.preventDefault();
    if (nw !== nw2) { setOk(false); setMsg('تأكيد كلمة السر غير مطابق'); return; }
    setBusy('pwd');
    setMsg('');
    try {
      const r = await jsonFetch('/api/teacher/account/password', { method: 'PATCH', body: { currentPassword: cur, newPassword: nw } });
      setOk(true);
      setMsg(r.message || 'تم تغيير كلمة سرك بنجاح!');
      setCur(''); setNw(''); setNw2('');
    } catch (e: any) {
      setOk(false);
      setMsg(e?.message || 'تعذر تغيير كلمة السر');
    } finally { setBusy(null); }
  };

  const saveMail = async () => {
    setBusy('mail');
    setMsg('');
    try {
      const r = await jsonFetch('/api/teacher/account/email', { method: 'PATCH', body: { adminEmail: adminMail.trim() } });
      setOk(true);
      setMsg(r.message || 'تم الحفظ!');
      load();
    } catch (e: any) {
      setOk(false);
      setMsg(e?.message || 'تعذر الحفظ');
    } finally { setBusy(null); }
  };

  const linkGoogle = async () => {
    const r = await google.refetch();
    if (r.data?.url) window.location.assign(r.data.url);
    else { setOk(false); setMsg('تعذر بدء ربط Google الآن'); }
  };

  return (
    <div className="mt-8 overflow-hidden rounded-3xl border-2 border-primary/20 bg-gradient-to-b from-primary/[0.04] to-card">
      <div className="flex items-center gap-3 p-6 pb-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg"><ShieldCheck size={22} /></span>
        <div>
          <p className="font-display text-lg font-bold text-primary">حساب الدخول والأمان 🔐</p>
          <p className="mt-0.5 text-xs text-muted-foreground">كلمة سرك + بريد الإدارة + ربط Google — لك وحدك كمعلم.</p>
        </div>
      </div>
      {loading ? <StateNotice type="loading" /> : (
        <div className="space-y-4 p-6 pt-2">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/50 px-4 py-3 text-xs font-bold">
            <span className="text-muted-foreground">دخولك الحالي:</span>
            <span className="text-primary" dir="ltr">{info?.email || '—'}</span>
            {info?.googleLinked === true ? (
              <span className="mr-auto rounded-full bg-green-500/15 px-3 py-1 text-[11px] font-extrabold text-green-800">مربوط بـ Google ✓</span>
            ) : info?.googleLinked === false ? (
              <span className="mr-auto rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">غير مربوط بـ Google</span>
            ) : null}
          </div>

          <form onSubmit={savePwd} className="rounded-2xl border border-border bg-background/60 p-4">
            <p className="mb-3 text-sm font-extrabold text-primary">تغيير كلمة سرك</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-bold">الحالية<input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required className={`${inputCls} py-2.5 text-sm`} data-testid="input-current-password" /></label>
              <label className="block text-xs font-bold">الجديدة (6+ أحرف)<input type="password" value={nw} onChange={(e) => setNw(e.target.value)} required minLength={6} className={`${inputCls} py-2.5 text-sm`} data-testid="input-new-password" /></label>
              <label className="block text-xs font-bold">تأكيد الجديدة<input type="password" value={nw2} onChange={(e) => setNw2(e.target.value)} required className={`${inputCls} py-2.5 text-sm`} /></label>
            </div>
            <Button type="submit" disabled={busy === 'pwd'} variant="soft" className="mt-3 px-5 py-2 text-xs">{busy === 'pwd' ? 'جارٍ التغيير...' : 'تغيير كلمة السر ✓'}</Button>
          </form>

          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <p className="mb-1 text-sm font-extrabold text-primary">بريد الإدارة (Gmail) — للدخول عبر Google كمعلم</p>
            <p className="mb-3 text-[11px] leading-5 text-muted-foreground">احفظ بريدك هنا: أي حساب <b>طالب</b> سابق بنفس البريد يُحذف تلقائياً، وبعده سجّل بهذا البريد عبر Google لتدخل كمعلم مباشرة — ويُمنع إنشاء حسابات طلاب جديدة به.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input value={adminMail} onChange={(e) => setAdminMail(e.target.value)} placeholder="you@gmail.com" dir="ltr" className={`${inputCls} min-w-52 flex-1 py-2.5 text-left text-sm`} data-testid="input-admin-email" />
              <Button type="button" onClick={saveMail} disabled={busy === 'mail'} variant="primary" className="px-5 py-2 text-xs">{busy === 'mail' ? 'جارٍ الحفظ والتنظيف...' : 'اعتماد وتنظيف ✓'}</Button>
            </div>
            <Button type="button" onClick={linkGoogle} variant="soft" className="mt-3 w-full py-2.5 text-xs">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">G</span> تسجيل الدخول بهذا البريد عبر Google للربط
            </Button>
          </div>

          {msg ? <p className={`rounded-xl px-4 py-3 text-xs font-bold leading-6 ${ok ? 'bg-green-500/15 text-green-800' : 'bg-destructive/10 text-destructive'}`}>{msg}</p> : null}
        </div>
      )}
    </div>
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
    const b64 = s.replace(/^ARDB64\s*/, '').trim();
    // فك مقطّع لملفات base64 الكبيرة (atob قد يفشل مع النصوص الضخمة دفعة واحدة)
    const CHUNK = 0x8000;
    let bin = '';
    for (let i = 0; i < b64.length; i += CHUNK) {
      bin += atob(b64.slice(i, i + CHUNK));
    }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return s;
  }
}

/** صلاحيات إطار HTML: السكربتات ضرورية لعمل تصاميم المعلم (Tailwind/تفاعلات).
 *  الرفع مقصور على الأستاذ (requireAdmin) فالمحتوى موثوق — والطلاب لا يدخلون HTML أبداً. */
const HTML_FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups';

/* =========================================================================
   خطاف الحزمة المضغوطة — يحمّل ZIP/TAR من رابطه ويفكّه محلياً ويبنيه صفحة
   مستقلة جاهزة للعرض (يُستخدم للطالب والمعلم معاً). لا يمس قاعدة البيانات.
   ========================================================================= */
function useBundleHtml(url?: string | null) {
  const [built, setBuilt] = useState<BuiltSite | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const active = !!url && isBundleUrl(url);
  useEffect(() => {
    if (!active || !url) {
      setBuilt(null);
      setLoading(false);
      setError('');
      return;
    }
    let live = true;
    let current: BuiltSite | null = null;
    setLoading(true);
    setError('');
    setBuilt(null);
    loadBundleHtml(url)
      .then((b) => {
        if (!live) {
          b.revoke();
          return;
        }
        current = b;
        setBuilt(b);
      })
      .catch((e: any) => {
        if (live) setError(e?.message || 'تعذّر فتح الموقع المضغوط');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      if (current) current.revoke();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, active, attempt]);
  return {
    active,
    html: built?.html || null,
    meta: built,
    loading,
    error,
    retry: () => setAttempt((a) => a + 1),
  };
}

/* =========================================================================
   خطاف الحاوية المبنية — يحمّل gz ويفكّه ويبني srcdoc معزولاً.
   العرض داخل iframe بخاصية sandbox="allow-scripts" فقط (بلا same-origin)
   لأن الكود مرفوع من مستخدمين — وكل شيء مضمّن أو من CDN.
   ========================================================================= */
const SOURCE_FRAME_SANDBOX = 'allow-scripts';

function useSourceContainer(url?: string | null, title?: string) {
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [meta, setMeta] = useState<SourceContainer | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const active = !!url && isSourceBundleUrl(url);
  useEffect(() => {
    if (!active || !url) {
      setSrcdoc(null);
      setMeta(null);
      setNotes([]);
      setLoading(false);
      setError('');
      return;
    }
    let live = true;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 90000);
    setLoading(true);
    setError('');
    setNotes([]);
    setSrcdoc(null);
    setMeta(null);
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`تعذّر تحميل الحاوية المبنية (خطأ ${r.status}) — أعد رفع المشروع`);
        return r.arrayBuffer();
      })
      .then((buf) => unpackSourceContainer(new Uint8Array(buf)))
      .then((c) => {
        if (!live) return;
        // شفاء روابط CDN القديمة داخل الحاوية المحفوظة (دون إعادة رفع)
        healSourceJs(c.js, (m) => {
          if (live) setNotes((arr) => (arr.includes(m) ? arr : [...arr, m].slice(-3)));
        }).then((fixedJs) => {
          if (!live) return;
          setMeta(c);
          setSrcdoc(buildSourceSrcdoc({
            js: fixedJs,
            css: c.css,
            reactVersion: (c.deps?.react || '18.3.1').replace(/^[~^>=<\s]+/, '').split(/[,\s|]+/)[0] || '18.3.1',
            reactDomVersion: (c.deps?.['react-dom'] || c.deps?.react || '18.3.1').replace(/^[~^>=<\s]+/, '').split(/[,\s|]+/)[0] || '18.3.1',
            title,
            tailwind: (c as any)?.tailwind === 3 || (c as any)?.tailwind === 4 ? (c as any).tailwind : null,
            fonts: Array.isArray((c as any)?.fonts) ? (c as any).fonts : [],
          }));
        });
      })
      .catch((e: any) => {
        if (!live) return;
        setError(e?.name === 'AbortError' ? 'انتهت مهلة تحميل الحاوية — تحقق من الاتصال وحاول مجدداً' : (e?.message || 'تعذّر فتح الحاوية المبنية'));
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, active, attempt]);
  return { active, srcdoc, meta, notes, loading, error, retry: () => setAttempt((a) => a + 1) };
}

/** حجم تقريبي للنص بالكيلوبايت (العربية = 2 بايت للحرف غالباً) */
function htmlKb(s?: string | null): number {
  if (!s) return 0;
  return Math.round((s.length * 2) / 1024);
}

function ExtHtmlViewer({ url, fill }: { url: string; fill?: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const bundle = useBundleHtml(url);
  const source = useSourceContainer(isSourceBundleUrl(url) ? url : null);
  useEffect(() => {
    if (bundle.active || source.active) return;
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
  }, [url, bundle.active, source.active]);
  if (source.active) {
    if (source.error) {
      return (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm font-bold text-destructive">
          {source.error}
          <button type="button" onClick={source.retry} className="mr-2 underline">إعادة المحاولة</button>
        </div>
      );
    }
    if (!source.srcdoc) {
      return (
        <div className="flex items-center gap-3 rounded-xl bg-secondary/60 p-5 text-sm font-bold text-primary">
          <RefreshCw size={17} className="animate-spin" /> جارٍ تجهيز الكود المبني...
        </div>
      );
    }
    return <iframe title="المحتوى التفاعلي" sandbox={SOURCE_FRAME_SANDBOX} srcDoc={source.srcdoc} loading="lazy" referrerPolicy="no-referrer" className={fill ? 'h-full w-full bg-white' : 'h-[480px] w-full bg-white'} data-testid="iframe-lesson-html-ext" />;
  }
  if (bundle.active) {
    if (bundle.error) {
      return (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm font-bold text-destructive">
          {bundle.error}
          <button type="button" onClick={bundle.retry} className="mr-2 underline">إعادة المحاولة</button>
        </div>
      );
    }
    if (!bundle.html) {
      return (
        <div className="flex items-center gap-3 rounded-xl bg-secondary/60 p-5 text-sm font-bold text-primary">
          <RefreshCw size={17} className="animate-spin" /> جارٍ فك ضغط الموقع وتجهيزه...
        </div>
      );
    }
    return <iframe title="المحتوى التفاعلي" sandbox={HTML_FRAME_SANDBOX} srcDoc={bundle.html} loading="lazy" referrerPolicy="no-referrer" className={fill ? 'h-full w-full bg-white' : 'h-[480px] w-full bg-white'} data-testid="iframe-lesson-html-ext" />;
  }
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
  return <iframe title="المحتوى التفاعلي" sandbox={HTML_FRAME_SANDBOX} srcDoc={html} loading="lazy" referrerPolicy="no-referrer" className={fill ? 'h-full w-full bg-white' : 'h-[480px] w-full bg-white'} data-testid="iframe-lesson-html-ext" />;
}

/* =========================================================================
   كتلة HTML المدمجة — 6 مميزات احترافية:
   تكبير/ملء شاشة/طباعة/تبويب جديد/تقدم القراءة/اختبار النهاية
========================================================================= */

/* ═══════════════════════════════ عارض المستندات العام (PDF / بوربوينت / وورد / دوكس) ═══════════════════════════════
   يعرض المستندات مباشرة وبشكل سلس ومتجاوب داخل الصفحة (على الهاتف والكمبيوتر) دون إشعار الطالب بنوع القارئ:
   - PDF: عرض تفاعلي مباشر داخل الصفحة مع خيارات التكبير والملء والتحميل
   - بوربوينت (PPTX/PPT) ووورد (DOCX/DOC): عرض مضمن تفاعلي بالكامل عبر قارئ المستندات السحابي
   - ضغط وتكيف كامل مع مساحة الشاشة
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
function detectDocType(url?: string, hint?: string): 'pdf' | 'pptx' | 'docx' | 'doc' | 'unknown' {
  if (hint && ['pdf', 'pptx', 'docx', 'doc'].includes(hint)) return hint as any;
  const raw = String(url || '').toLowerCase().split('?')[0];
  if (raw.endsWith('.pdf') || raw.includes('/pdf') || raw.includes('.pdf?')) return 'pdf';
  if (raw.endsWith('.pptx') || raw.includes('.pptx?')) return 'pptx';
  if (raw.endsWith('.ppt') || raw.includes('.ppt?')) return 'pptx';
  if (raw.endsWith('.docx') || raw.includes('.docx?')) return 'docx';
  if (raw.endsWith('.doc') || raw.includes('.doc?')) return 'doc';
  return 'unknown';
}

const DOC_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  pdf: { label: 'PDF', color: '#c62828', icon: '📄' },
  pptx: { label: 'بوربوينت', color: '#d84315', icon: '📊' },
  docx: { label: 'وورد', color: '#1565c0', icon: '📝' },
  doc: { label: 'وورد', color: '#1565c0', icon: '📝' },
  unknown: { label: 'مستند', color: '#37474f', icon: '📎' },
};

function DocumentViewer({ url, name, docType: hintType }: { url: string; name?: string; docType?: string }) {
  const docUrl = String(url || '').trim();
  if (!docUrl) return null;
  const dtype = detectDocType(docUrl, hintType);
  const meta = DOC_TYPE_META[dtype] || DOC_TYPE_META.unknown;
  const fileName = name || docUrl.split('/').pop()?.split('?')[0] || 'مستند تعليمي';
  const [expanded, setExpanded] = useState(true);
  const [useFallback, setUseFallback] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  // PDF: عرض مباشر داخل iframe أو عبر Google Docs Viewer
  // بوربوينت ووورد: Microsoft Office Online Viewer أو Google Docs Viewer
  const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(docUrl)}`;
  const gdocsViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(docUrl)}&embedded=true`;

  const primarySrc = dtype === 'pdf' ? docUrl : officeViewerUrl;
  const secondarySrc = gdocsViewerUrl;
  const currentSrc = useFallback ? secondarySrc : primarySrc;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all" data-testid="document-viewer">
      {/* شريط أدوات المستند الأنيق */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/30 px-5 py-3.5 sm:px-6">
        <div className="flex min-w-[200px] flex-1 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg text-white shadow-sm" style={{ background: meta.color }}>
            {meta.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-extrabold text-primary sm:text-base">{fileName}</p>
            <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
              <span className="rounded-md px-1.5 py-0.5 text-white" style={{ background: meta.color }}>{meta.label}</span>
              <span>مستند تفاعلي مضمن</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* تبديل العرض/الطي */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 text-xs font-bold text-primary transition-colors hover:bg-secondary active:scale-95"
            title={expanded ? 'طي المستند' : 'عرض المستند'}
          >
            {expanded ? <><EyeOff size={14} /> طي</> : <><Eye size={14} /> عرض</>}
          </button>

          {/* تبديل محرك العرض إن لم يظهر */}
          {expanded && dtype !== 'pdf' ? (
            <button
              type="button"
              onClick={() => setUseFallback((f) => !f)}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary active:scale-95"
              title="التبديل بين قارئ مايكروسوفت وقارئ جوجل"
            >
              <RefreshCw size={12} /> {useFallback ? 'قارئ مايكروسوفت' : 'قارئ بديل'}
            </button>
          ) : null}

          {/* فتح وتبويب جديد */}
          <a
            href={docUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground transition-colors hover:text-primary active:scale-95"
            title="فتح المستند في تبويب مستقل"
          >
            <ExternalLink size={14} />
          </a>

          {/* تحميل */}
          <a
            href={docUrl}
            target="_blank"
            rel="noreferrer"
            download={fileName}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold text-white shadow-sm transition-transform hover:scale-105 active:scale-95"
            style={{ background: meta.color }}
            title="تحميل الملف"
          >
            <Download size={14} /> تحميل
          </a>
        </div>
      </div>

      {/* شاشة العرض المضمنة */}
      {expanded ? (
        <div className="relative w-full bg-[#f8f9fa] dark:bg-[#121212]">
          <iframe
            key={currentSrc}
            src={currentSrc}
            title={fileName}
            className="w-full border-0 transition-opacity"
            style={{ height: 'min(82vh, 750px)', minHeight: '440px' }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            loading="lazy"
          />
          {/* شريط المساعدة السفلي */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/60 px-4 py-2 text-[11px] text-muted-foreground">
            <span>إذا كان المستند لا يظهر على جهازك، يمكنك النقر على الزر بالأعلى للتحميل أو التبديل.</span>
            <div className="flex items-center gap-3">
              <a href={gdocsViewerUrl.replace('&embedded=true', '')} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">عرض عبر Google Docs ←</a>
              {dtype !== 'pdf' ? (
                <a href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(docUrl)}`} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">عرض عبر Office ←</a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** محرر كتلة المستند في صفحة إعداد التأسيس (الأستاذ) */
function DocumentBlockEditor({ block, onPatch }: { block: LessonBlock; onPatch: (p: Partial<LessonBlock>) => void }) {
  const [uploading, setUploading] = useState(false);
  const ACCEPT = '.pdf,.pptx,.ppt,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword';

  const handleUpload = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowed = ['pdf', 'pptx', 'ppt', 'docx', 'doc'];
    if (!allowed.includes(ext)) {
      alert('صيغة غير مدعومة — يرجى اختيار PDF أو بوربوينت (PPTX/PPT) أو وورد (DOCX/DOC)');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadFileToCloud(file, '/ard-al-lughah/documents');
      if (res?.url) {
        const docType = ext === 'ppt' ? 'pptx' : ext as any;
        onPatch({ docUrl: res.url, docName: file.name, docType });
      }
    } catch (err: any) {
      alert(err?.message || 'تعذر رفع المستند');
    } finally {
      setUploading(false);
    }
  };

  const dtype = block.docType || detectDocType(block.docUrl || '');
  const meta = DOC_TYPE_META[dtype] || DOC_TYPE_META.unknown;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-6 text-center">
        {block.docUrl ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg text-white shadow-md" style={{ background: meta.color }}>{meta.icon}</span>
            <div className="text-right">
              <p className="truncate text-sm font-extrabold text-primary">{block.docName || 'مستند مرفوع'}</p>
              <p className="text-xs font-bold" style={{ color: meta.color }}>{meta.label} — معتمد في الدرس</p>
            </div>
            <button type="button" onClick={() => onPatch({ docUrl: '', docName: '', docType: undefined })} className="rounded-xl px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10">إزالة</button>
          </div>
        ) : (
          <div>
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#c62828]/10 text-2xl">📄</span>
            <p className="font-display text-base font-bold text-primary">ارفع مستنداً للدرس</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF · عرض تقديمي بوربوينت (PPTX/PPT) · وورد (DOCX/DOC)</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <label className={`inline-flex min-h-[50px] cursor-pointer items-center gap-2 rounded-2xl px-6 text-sm font-extrabold text-white shadow-md transition-all hover:-translate-y-0.5 active:scale-95 ${uploading ? 'opacity-60 pointer-events-none' : ''}`} style={{ background: '#c62828' }}>
            {uploading ? <><RefreshCw size={16} className="animate-spin" /> جارٍ الرفع السحابي...</> : <><Upload size={16} /> {block.docUrl ? 'استبدال المستند' : 'اختيار ملف من الجهاز'}</>}
            <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {/* معاينة المستند المباشرة في لوحة الأستاذ */}
      {block.docUrl ? <DocumentViewer url={block.docUrl} name={block.docName} docType={block.docType} /> : null}
    </div>
  );
}

function LessonHtmlBlock({ lesson, exam, onStartExam, onReachEnd }: {
  lesson: any; exam?: any; onStartExam?: () => void; onReachEnd?: () => void;
}) {
  // إذا كان المحتوى المرفق مستنداً (PDF / بوربوينت / وورد) يُعرض عبر قارئ المستندات المدمج المباشر
  if (detectDocType(lesson?.htmlFileUrl) !== 'unknown') {
    return (
      <div className="my-4">
        <DocumentViewer url={lesson.htmlFileUrl} name={lesson.title} />
      </div>
    );
  }
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [extHtml, setExtHtml] = useState<string | null>(null);
  const [extFailed, setExtFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fluidH, setFluidH] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [htmlSize, setHtmlSize] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const endedRef = useRef(false);
  const scrollBoundRef = useRef(false);
  // القرار المركزي: رابط الحزمة يفوز على اللصق (بقايا ثنائية في اللصق كانت تسمّمه)
  const resolved = resolveLessonHtml(lesson);
  const inline = resolved.mode === 'inline';
  // حزمة مضغوطة (ZIP/TAR): تُفك محلياً في المتصفح بدل جلب نص HTML
  const bundleUrl = resolved.mode === 'bundle' ? resolved.url : null;
  const bundle = useBundleHtml(bundleUrl);
  // حاوية كود مصدري مبني (.srcbundle.gz): srcdoc معزول بلا same-origin
  const sourceUrl = resolved.mode === 'source' ? resolved.url : null;
  const source = useSourceContainer(sourceUrl, lesson?.title);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  // ارتفاع وتقدم يبلّغهما الإطار المعزول (لا يمكن قراءته من الخارج بدون same-origin)
  const [srcHeight, setSrcHeight] = useState<number | null>(null);
  const [srcProgress, setSrcProgress] = useState<number | null>(null);
  const [sourceNotes, setSourceNotes] = useState<string[]>([]);
  useEffect(() => setSourceNotes(source.notes || []), [source.notes]);

  // جسر رسائل الإطار المعزول: أخطاء + ارتفاع + تقدم القراءة
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (!ev?.data || ev.data.__srcbundle !== 1) return;
      try {
        if (!sourceUrl || ev.source !== iframeRef.current?.contentWindow) return;
      } catch {
        return;
      }
      const d = ev.data;
      if (d.type === 'size' && typeof d.height === 'number' && d.height > 120) {
        setSrcHeight((old) => (old == null ? Math.min(d.height, 8000) : Math.abs(d.height - old) > 4 ? Math.min(Math.max(d.height, old), 8000) : old));
      } else if (d.type === 'progress' && typeof d.pct === 'number') {
        const pct = Math.max(0, Math.min(100, Math.round(d.pct)));
        setSrcProgress((old) => (old === pct ? old : pct));
        if (pct >= 92 && !endedRef.current) {
          endedRef.current = true;
          onReachEnd?.();
        }
      } else if (d.type === 'error') {
        const kind = d.source === 'resource' ? 'مورد' : 'تشغيل';
        const text = `خطأ ${kind}: ${String(d.message || 'غير معروف').slice(0, 200)}`;
        setSourceErrors((arr) => (arr.includes(text) ? arr : [...arr, text].slice(-3)));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [sourceUrl, onReachEnd]);

  useEffect(() => {
    setExtHtml(null);
    setExtFailed(false);
    setProgress(0);
    setFluidH(null);
    setHtmlSize(0);
    endedRef.current = false;
    scrollBoundRef.current = false;
    if (inline) {
      setHtmlSize(htmlKb(lesson?.htmlContent));
      return;
    }
    if (bundleUrl) return; // الحزمة لها خطافها الخاص — لا جلب نصي هنا
    if (sourceUrl) {
      // الحاوية لها خطافها الخاص — نمسح أخطاء التشغيل ونبدأ من الصفر
      setSourceErrors([]);
      setSrcHeight(null);
      setSrcProgress(null);
      endedRef.current = false;
      return;
    }
    if (!lesson?.htmlFileUrl) return;
    let live = true;
    const ctrl = new AbortController();
    // مهلة 30 ثانية للملفات الكبيرة — بعدها فشل واضح مع زر إعادة بدل التعليق الأبدي
    const timer = window.setTimeout(() => ctrl.abort(), 30000);
    fetch(lesson.htmlFileUrl, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error('http-' + r.status); return r.text(); })
      .then((t) => {
        window.clearTimeout(timer);
        if (!live) return;
        const decoded = t.startsWith('ARDB64') ? decodeArdB64(t) : t;
        setHtmlSize(htmlKb(decoded));
        setExtHtml(decoded);
      })
      .catch(() => { window.clearTimeout(timer); if (live) setExtFailed(true); });
    return () => { live = false; window.clearTimeout(timer); ctrl.abort(); };
  }, [lesson, inline, bundleUrl, sourceUrl, attempt]);

  const html: string | null = inline && resolved.mode === 'inline' ? resolved.inline : sourceUrl ? source.srcdoc : bundleUrl ? bundle.html : extHtml;
  const bundleMeta = bundleUrl ? bundle.meta : null;
  const sourceMeta = sourceUrl ? source.meta : null;

  const trackProgress = () => {
    // الوضع المعزول (بلا same-origin): الارتفاع والتقدمة يبلّغهما الجسر من الداخل
    if (sourceUrl) return;
    try {
      const win = iframeRef.current?.contentWindow;
      const doc = iframeRef.current?.contentDocument;
      if (!win || !doc || !doc.body) return;
      const h = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0);
      // ارتفاع مرن يتوسع مع المحتوى الديناميكي (أكورديون/تبويبات) ولا يتقلص فجأة
      if (h > 120) {
        setFluidH((old) => {
          const next = Math.min(h + 48, 8000);
          if (old == null) return next;
          return next > old + 300 ? next : old;
        });
      }
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

  const bindFrameScroll = () => {
    if (sourceUrl) return; // المعزول يتابع التمرير عبر الجسر
    try {
      const win = iframeRef.current?.contentWindow;
      if (!win || scrollBoundRef.current) return;
      scrollBoundRef.current = true;
      win.addEventListener('scroll', trackProgress, { passive: true });
    } catch { /* cross-origin */ }
  };

  // إعادة القياس دورياً للمحتوى الديناميكي الذي يتغير ارتفاعه بعد التحميل
  useEffect(() => {
    if (!html) return;
    const id = window.setInterval(trackProgress, 1500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, attempt]);

  const openNewTab = () => {
    const src = inline && resolved.mode === 'inline' ? resolved.inline : sourceUrl ? source.srcdoc : bundleUrl ? bundle.html : extHtml;
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

  // الارتفاع المرئي: المعزول يبلّغ ارتفاعه، وإلا نقيس مباشرة.
// نستخدم style بالوحدات لأن سمة height لا تقبل وحدات CSS.
  const reportedH = sourceUrl ? srcHeight : null;
  const measuredH = fluidH;
  const visibleH = reportedH || measuredH || null;
  const frameH = visibleH ? `${visibleH}px` : '62vh';
  const shownProgress = sourceUrl ? (srcProgress ?? 0) : progress;

  if (isDoc) {
    return (
      <div className="my-4">
        <DocumentViewer url={lesson?.htmlFileUrl} name={lesson?.title} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-md">
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-gradient-to-l from-secondary/80 to-card px-3 py-2.5 sm:px-4">
        <span className="flex items-center gap-1.5 rounded-xl bg-primary px-2.5 py-1.5 text-xs font-extrabold text-primary-foreground">
          <FileCode2 size={14} /> المحتوى التفاعلي
        </span>
        {sourceMeta ? (
          <span className="rounded-lg bg-secondary px-2.5 py-1.5 text-[11px] font-bold tabular-nums text-muted-foreground" title={`بُني من: ${sourceMeta.entry}`}>
            ⚛️ كود مبني · {Math.max(1, Math.round((sourceMeta.sizes?.gz || 0) / 1024))} ك.ب
          </span>
        ) : bundleMeta ? (
          <span className="rounded-lg bg-secondary px-2.5 py-1.5 text-[11px] font-bold tabular-nums text-muted-foreground" title={`صفحة الدخول: ${bundleMeta.entry}`}>
            📦 موقع مضغوط · {bundleMeta.totalKB} ك.ب · {bundleMeta.fileCount} ملفات
          </span>
        ) : htmlSize > 0 ? (
          <span className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold tabular-nums ${htmlSize > 600 ? 'bg-amber-500/15 text-amber-800' : 'bg-secondary text-muted-foreground'}`} title={htmlSize > 600 ? 'ملف كبير — قد يكون بطيئاً على الأجهزة الضعيفة، فضّل ملء الشاشة' : 'حجم المحتوى'}>
            {htmlSize > 600 ? 'ملف كبير ' : ''}{htmlSize} ك.ب
          </span>
        ) : null}
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
        <div className="h-full rounded-l-full bg-gradient-to-l from-primary via-accent to-accent transition-[width] duration-300" style={{ width: `${shownProgress}%` }} />
      </div>
      {/* أخطاء وقت التشغيل من التطبيق المعزول — بدل الشاشة البيضاء */}
      {sourceUrl && sourceErrors.length > 0 ? (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[11px] font-bold leading-6 text-amber-800">
          <span className="flex items-center justify-between gap-2">
            <span>⚠ تعثّر التطبيق أثناء التشغيل:</span>
            <button type="button" onClick={() => setSourceErrors([])} className="rounded-lg px-2 py-0.5 text-amber-800 hover:bg-amber-500/20">إخفاء</button>
          </span>
          {sourceErrors.map((m, i) => <span key={i} className="mt-1 block rounded-lg bg-background/60 px-2.5 py-1" dir="auto">{m}</span>)}
          <span className="mt-1 block font-normal">أخبر الأستاذ بهذه الرسالة — وغالباً السبب مكتبة تحتاج شبكة أو ميزة غير مدعومة.</span>
        </div>
      ) : null}
      {/* رسائل الشفاء التلقائي (استبدال نسخة مكتبة معطوبة على CDN) */}
      {sourceUrl && source.notes.length > 0 ? (
        <div className="border-b border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-[11px] font-bold leading-6 text-emerald-900">
          <span className="flex items-center justify-between gap-2">
            <span>🔧 تم إصلاح تلقائي قبل العرض:</span>
            <button type="button" onClick={() => setSourceNotes([])} className="rounded-lg px-2 py-0.5 text-emerald-900 hover:bg-emerald-500/20">إخفاء</button>
          </span>
          {source.notes.map((m, i) => <span key={i} className="mt-1 block rounded-lg bg-background/60 px-2.5 py-1">{m}</span>)}
        </div>
      ) : null}
      {/* المحتوى المدمج */}
      <div className="bg-white">
        {!inline && (sourceUrl ? !!source.error : bundleUrl ? !!bundle.error : extFailed) ? (
          <div className="p-6 text-center">
            <p className="text-sm font-bold text-destructive">تعذر تحميل المحتوى التفاعلي</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{sourceUrl && source.error ? source.error : bundleUrl && bundle.error ? bundle.error : 'تحقق من الاتصال — للملفات الكبيرة جداً جرّب فتحها في تبويب جديد أو أخبر الأستاذ لتقسيمها.'}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={() => { if (sourceUrl) source.retry(); else if (bundleUrl) bundle.retry(); else setAttempt((a) => a + 1); }} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:scale-105"><RefreshCw size={14} /> إعادة المحاولة</button>
              {!bundleUrl && !sourceUrl ? (
              <a href={lesson.htmlFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-xs font-bold text-primary">فتح الملف مباشرة <ArrowLeft size={14} /></a>
              ) : null}
            </div>
          </div>
        ) : !html ? (
          <div className="flex items-center gap-3 p-6 text-sm font-bold text-primary">
            <RefreshCw size={17} className="animate-spin" /> {sourceUrl ? 'جارٍ تجهيز الكود المبني...' : bundleUrl ? 'جارٍ فك ضغط الموقع وتجهيزه...' : 'جارٍ تحميل المحتوى التفاعلي...'}
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            title={`محتوى ${lesson.title}`}
            sandbox={sourceUrl ? SOURCE_FRAME_SANDBOX : HTML_FRAME_SANDBOX}
            srcDoc={html}
            onLoad={() => { trackProgress(); bindFrameScroll(); }}
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{ zoom, height: frameH }}
            className="w-full bg-white"
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
              <iframe title={`محتوى ${lesson.title}`} sandbox={sourceUrl ? SOURCE_FRAME_SANDBOX : HTML_FRAME_SANDBOX} srcDoc={html} loading="lazy" referrerPolicy="no-referrer" style={{ zoom }} className="h-full w-full" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** معاينة HTML في لوحة المعلم — تعمل مع الكود الملصق ومع الملف المرفوع (تفك ARDB64 مثله مثل العارض) ومع الحزم المضغوطة */
function HtmlPreviewFrame({ content, fileUrl }: { content?: string; fileUrl?: string }) {
  const isDoc = Boolean(fileUrl && detectDocType(fileUrl) !== 'unknown');
  const [text, setText] = useState<string | null>(content || null);
  const [failed, setFailed] = useState(false);
  // نفس القرار المركزي: رابط الحزمة يفوز على اللصق حتى في المعاينة
  const previewResolved = resolveLessonHtml({ htmlContent: content, htmlFileUrl: fileUrl });
  const bundleActive = previewResolved.mode === 'bundle';
  const bundle = useBundleHtml(bundleActive ? previewResolved.url : null);
  const sourceActive = previewResolved.mode === 'source';
  const source = useSourceContainer(sourceActive ? previewResolved.url : null);
  useEffect(() => {
    if (isDoc) return;
    if (bundleActive || sourceActive) return; // الحزم عبر خطافاتها — لا جلب نصي
    if (content) { setText(content); setFailed(false); return; }
    if (!fileUrl) { setText(null); setFailed(false); return; }
    let live = true;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 25000);
    fetch(fileUrl, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then((t) => {
        window.clearTimeout(timer);
        if (live) { setText(t.startsWith('ARDB64') ? decodeArdB64(t) : t); setFailed(false); }
      })
      .catch(() => { window.clearTimeout(timer); if (live) setFailed(true); });
    return () => { live = false; window.clearTimeout(timer); ctrl.abort(); };
  }, [content, fileUrl, isDoc]);

  if (isDoc) {
    return (
      <div className="mt-3">
        <DocumentViewer url={fileUrl!} />
      </div>
    );
  }
  if (bundleActive) {
    if (bundle.error) return (
      <div className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-xs font-bold leading-6 text-destructive">
        {bundle.error}
        <button type="button" onClick={bundle.retry} className="mr-2 underline">إعادة المحاولة</button>
      </div>
    );
    if (!bundle.html) return <p className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/50 px-4 py-3 text-xs font-bold text-primary"><RefreshCw size={14} className="animate-spin" /> جارٍ فك ضغط الموقع وتجهيز المعاينة...</p>;
    return (
      <div>
        <p className="mt-3 rounded-xl bg-green-600/10 px-4 py-2.5 text-[11px] font-bold leading-5 text-green-800">
          📦 معاينة الموقع المضغوط — الدخول: <span dir="ltr" className="font-mono">{bundle.meta?.entry}</span> · {bundle.meta?.fileCount} ملفات · {bundle.meta?.totalKB} ك.ب
          {(bundle.meta?.warnings?.length || 0) > 0 ? <span className="mt-1 block text-amber-800">⚠ {bundle.meta!.warnings.slice(0, 2).join(' — ')}</span> : null}
        </p>
        <iframe title="معاينة HTML" sandbox={HTML_FRAME_SANDBOX} srcDoc={bundle.html} loading="lazy" referrerPolicy="no-referrer" className="mt-3 h-80 w-full rounded-xl border border-border bg-white" />
      </div>
    );
  }
  if (sourceActive) {
    if (source.error) return (
      <div className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-xs font-bold leading-6 text-destructive">
        {source.error}
        <button type="button" onClick={source.retry} className="mr-2 underline">إعادة المحاولة</button>
      </div>
    );
    if (!source.srcdoc) return <p className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/50 px-4 py-3 text-xs font-bold text-primary"><RefreshCw size={14} className="animate-spin" /> جارٍ تجهيز الكود المبني للمعاينة...</p>;
    return (
      <div>
        <p className="mt-3 rounded-xl bg-green-600/10 px-4 py-2.5 text-[11px] font-bold leading-5 text-green-800">
          ⚛️ معاينة الكود المبني — الدخول: <span dir="ltr" className="font-mono">{source.meta?.entry}</span> · المخزَّن: {Math.max(1, Math.round((source.meta?.sizes?.gz || 0) / 1024))}KB · البصمة: <span dir="ltr" className="font-mono">{source.meta?.hash?.slice(0, 12)}</span>
          {(source.meta?.warnings?.length || 0) > 0 ? <span className="mt-1 block text-amber-800">⚠ {source.meta!.warnings.slice(0, 2).join(' — ')}</span> : null}
        </p>
        <iframe title="معاينة الكود المبني" sandbox={SOURCE_FRAME_SANDBOX} srcDoc={source.srcdoc} loading="lazy" referrerPolicy="no-referrer" className="mt-3 h-80 w-full rounded-xl border border-border bg-white" />
      </div>
    );
  }
  if (failed) return <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-xs font-bold text-destructive">تعذر تحميل المعاينة — تحقق من الملف أو أعد رفعه.</p>;
  if (!text) return <p className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/50 px-4 py-3 text-xs font-bold text-primary"><RefreshCw size={14} className="animate-spin" /> جارٍ تجهيز المعاينة...</p>;
  return <iframe title="معاينة HTML" sandbox={HTML_FRAME_SANDBOX} srcDoc={text} loading="lazy" referrerPolicy="no-referrer" className="mt-3 h-80 w-full rounded-xl border border-border bg-white" />;
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

/* =========================================================================
   رفع واجب مباشر — نافذة سريعة تُفتح من داخل الوحدة دون مغادرتها
========================================================================= */
function HwQuickSubmitModal({ hw, onClose, onSubmitted }: { hw: any; onClose: () => void; onSubmitted: () => void }) {
  const [answer, setAnswer] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [mine, setMine] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/assignments/${hw.id}/mine`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setMine(d);
          setAnswer(d.answer || '');
          setPhotos(Array.isArray(d.photos) ? d.photos : []);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [hw.id]);

  const lockedForReview = !!(mine && mine.score == null && mine.status !== 'تم التقييم');

  const pick = (files: File[]) => {
    if (!files.length || uploading) return;
    setUploading(files.length);
    (async () => {
      for (const f of files) {
        try {
          const res = await uploadStudentPhoto(f);
          if (res?.url) setPhotos((p) => [...p, res.url]);
        } catch { /* تجاهل */ }
        finally { setUploading((n) => Math.max(n - 1, 0)); }
      }
    })();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || lockedForReview) return;
    if (!answer.trim() && !photos.length) { setOk(false); setMsg('اكتب حلّك أو أرفق صورة واحدة على الأقل'); return; }
    setSubmitting(true);
    setMsg(''); setOk(true);
    try {
      const res = await fetch(`/api/assignments/${hw.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, photos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'تعذر الإرسال');
      setOk(true);
      setMsg(data.message || 'تم التسليم بنجاح! ✓');
      onSubmitted();
      setTimeout(onClose, 1800);
    } catch (e: any) {
      setOk(false);
      setMsg(e?.message || 'تعذر الإرسال');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal title={hw.title} eyebrow={`رفع الواجب · ${hw.unit || ''}`} onClose={onClose} maxWidth="max-w-xl">
      {loading ? <StateNotice type="loading" /> : (
        <form onSubmit={submit} className="space-y-4" dir="rtl">
          {lockedForReview ? (
            <p className="flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-extrabold text-amber-800">
              <Lock size={15} /> تسليمك قيد مراجعة الأستاذ — لا يمكن التعديل حتى يقيّمه.
            </p>
          ) : null}
          {mine && (mine.score != null || mine.status === 'تم التقييم') ? (
            <p className="flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-extrabold text-green-800">
              <Award size={15} /> تمت مراجعتك{mine.score != null ? ` · علامتك: ${mine.score}` : ''}{mine.feedback ? ` — ${mine.feedback}` : ''}
            </p>
          ) : null}
          <label className="block text-sm font-semibold">
            <span className="mb-2 block">حلّك:</span>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={lockedForReview} rows={4} placeholder="اكتب الحل هنا..." className="w-full resize-none rounded-2xl border border-input bg-background p-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20 disabled:opacity-60" />
          </label>
          <div className="rounded-2xl border border-dashed border-border p-4">
            <p className="mb-3 text-sm font-bold text-primary">صور الحل ({photos.length})</p>
            {photos.length ? (
              <div className="mb-3 grid grid-cols-3 gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="group relative overflow-hidden rounded-xl border border-border">
                    <img src={src} alt={`صورة ${i + 1}`} className="h-20 w-full object-cover" />
                    {!lockedForReview ? (
                      <button type="button" onClick={() => setPhotos((p) => p.filter((_, x) => x !== i))} className="absolute left-1 top-1 rounded-lg bg-black/60 p-1 text-white"><X size={12} /></button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {!lockedForReview ? (
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-primary hover:bg-accent/40 ${uploading ? 'opacity-60' : ''}`}>
                {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Camera size={14} />} {uploading ? `جارٍ الرفع (${uploading})...` : 'التقط / اختر صور الحل'}
                <input type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; pick(f); }} />
              </label>
            ) : null}
          </div>
          {msg ? <p className={`rounded-xl p-3 text-center text-sm font-bold ${ok ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/10 text-destructive'}`}>{msg}</p> : null}
          <div className="flex items-center justify-end gap-3">
            <Button onClick={onClose} variant="ghost">إغلاق</Button>
            <Button type="submit" disabled={submitting || lockedForReview} variant="primary" className="px-6 py-2.5">
              {submitting ? 'جارٍ الإرسال...' : mine ? 'إعادة الإرسال' : 'إرسال الحل'} <ArrowLeft size={15} />
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function StudentCoursesPage() {
  const { grade: effectiveGrade, school, term, split, gender, student } = useStudentGradeTerm();
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
  // مهام الوحدة المطلوبة: واجبات + دفتر + اختبارات مرتبطة بالوحدة
  const [hwList, setHwList] = useState<any[]>([]);
  const [examList, setExamList] = useState<any[]>([]);
  const [nbList, setNbList] = useState<any[]>([]);
  // أسهم المهام: مطوية افتراضياً، تُفتح تلقائياً عند وجود معلَّق
  const [expandedLessons, setExpandedLessons] = useState<Record<string, boolean>>({});
  const [expandedGeneral, setExpandedGeneral] = useState(false);
  const [quickHw, setQuickHw] = useState<any | null>(null);
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
    loadUnitTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveGrade, term, student?.id]);

  // تحميل المهام المرتبطة بالوحدات (واجبات مطلوبة + دفتر مطلوب + اختبارات)
  const loadUnitTasks = async () => {
    try {
      const aq = new URLSearchParams({ grade: effectiveGrade, term, student: '1' });
      const nq = new URLSearchParams({ grade: effectiveGrade, term });
      if (student?.id) { aq.set('student_id', student.id); nq.set('student_id', student.id); }
      const [hw, ex, nb] = await Promise.all([
        jsonFetch('/api/assignments').catch(() => []),
        jsonFetch(`/api/curriculum/assessments?${aq.toString()}`).catch(() => []),
        jsonFetch(`/api/curriculum/notebooks?${nq.toString()}`).catch(() => []),
      ]);
      setHwList(Array.isArray(hw) ? hw : []);
      setExamList(Array.isArray(ex) ? ex : []);
      setNbList(Array.isArray(nb) ? nb : []);
    } catch { setHwList([]); setExamList([]); setNbList([]); }
  };

  /* ────────────────────────────────────────────────────────────────────────
     المهلة: بند انتهت مهلته لا يظهر هنا أبداً.
     الطالب يبقى يراه في قسمه المخصّص (واجباتي/دفتري/اختباراتي) بشارة
     "انتهت المهلة — مغلق"، لكن هنا (الوحدات والتلخيص) يختفي حتى لا يظن
     أن عليه شيئاً يفعله وهو عاجز عنه.
     ──────────────────────────────────────────────────────────────────────── */
  const itemExpiredLocal = itemExpired;
  // قوائم حيّة: بلا بنود منتهية — مرة واحدة بدل التصفية في كل مكان
  const hwLive = useMemo(() => hwList.filter((h) => !itemExpiredLocal(h)), [hwList]);
  const nbLive = useMemo(() => nbList.filter((t) => !itemExpiredLocal(t)), [nbList]);
  const exLive = useMemo(() => examList.filter((e) => !itemExpiredLocal(e)), [examList]);

  // ربط المهمة بالوحدة: عبر courseId المضمون، أو مطابقة اسم الوحدة للواجبات القديمة
  const matchCourse = (x: any, course: any) =>
    (x.courseId && x.courseId === course.id) ||
    ((x.unit || x.unitTitle) && (x.unit || x.unitTitle) === course.title);
  const hwFor = (course: any) => hwLive.filter((h) => matchCourse(h, course));
  const examsFor = (course: any) => exLive.filter((e) => matchCourse(e, course));
  const nbFor = (course: any) => nbLive.filter((t) => matchCourse(t, course));
  const hwPending = (h: any) => !h.status || h.status === 'لم يبدأ';
  const nbPending = (t: any) => !t.myStatus;

  /* ────────────────────────────────────────────────────────────────────────
     ربط المهمة بالدرس الصحيح — الطلب: "لازم تحت الدرس اللي فيه الواجب".
     الأولوية للمعرّف (lessonId)، وعند غيابه نطابق باسم الدرس المطبّع.
     المطابقة بالنوع تمنع التصادم: درس ت.called بنفس الاسم لا يلتقط other's.
     ──────────────────────────────────────────────────────────────────────── */
  const itemBelongsToLesson = (x: any, lesson: any) => {
    if (!lesson) return false;
    const lid = String(x?.lessonId || '').trim();
    if (lid) return lid === String(lesson.id);
    // بلا معرّف: نطابق بالاسم فقط، وبنفس نوع المحتوى
    const xt = foldName(x?.lessonTitle || '');
    const lt = foldName(lesson?.title || '');
    if (!xt || !lt || xt !== lt) return false;
    const xk = x?.kind || (x?.questions !== undefined ? 'exam' : x?.myStatus !== undefined ? 'notebook' : 'hw');
    const lk = String(lesson?.lessonType || '');
    if (xk === 'exam' && !lk.includes('اختبار')) return false;
    if (xk === 'notebook' && !lk.includes('دفتر')) return false;
    return true;
  };
  const hwForLesson = (lesson: any) => hwLive.filter((h) => itemBelongsToLesson(h, lesson));
  const examsForLesson = (lesson: any) => exLive.filter((e) => itemBelongsToLesson(e, lesson));
  const nbForLesson = (lesson: any) => nbLive.filter((t) => itemBelongsToLesson(t, lesson));
  const lessonTasksCount = (lesson: any) => hwForLesson(lesson).length + examsForLesson(lesson).length + nbForLesson(lesson).length;
  const lessonHasPending = (lesson: any) => hwForLesson(lesson).some(hwPending) || nbForLesson(lesson).some(nbPending);
  const toggleLessonTasks = (id: string) => setExpandedLessons((m) => ({ ...m, [id]: !m[id] }));
  // مهام عامة للوحدة: مرتبطة بالوحدة بلا درس محدد — فلا تظهر تحت أي درس
  const generalHw = (course: any) => hwFor(course).filter((h) => !String(h.lessonId || '').trim());
  const generalExams = (course: any) => examsFor(course).filter((e) => !String(e.lessonId || '').trim());
  const generalNb = (course: any) => nbFor(course).filter((t) => !String(t.lessonId || '').trim());
  // فتح تلقائي لأسهم الدروس المعلَّقة حتى ينتبه الطالب (لا تُغلق ما فتحه يدوياً)
  useEffect(() => {
    if (!selectedCourse || loadingLessons || !lessons.length) return;
    setExpandedLessons((m) => {
      const n = { ...m };
      for (const l of lessons) {
        if (lessonHasPending(l)) n[l.id] = true;
      }
      return n;
    });
    const gPend = generalHw(selectedCourse).some(hwPending) || generalNb(selectedCourse).some(nbPending);
    if (gPend) setExpandedGeneral(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourse, lessons, loadingLessons, hwLive, nbLive]);

  const openCourse = async (course: any) => {
    if (course.locked || course.isEmpty) return;
    setSelectedCourse(course);
    setLoadingLessons(true);
    try {
      // قائمة خفيفة (brief) توفيراً للباقة — المحتوى الكامل يُجلب عند فتح الدرس فقط
      const data = await jsonFetch(`/api/curriculum/courses/${course.id}/lessons?student=1&brief=1`);
      setLessons(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLessons(false);
    }
  };

  // العرض السريع: يجلب المحتوى الكامل للدرس المطلوب فقط
  const openLessonQuick = async (lesson: any) => {
    if (lesson.locked) return;
    setActiveLesson({ ...lesson, _loadingFull: true });
    try {
      const full = await jsonFetch(`/api/curriculum/lessons/${lesson.id}`);
      setActiveLesson({ ...lesson, ...(full && typeof full === 'object' ? full : {}) });
    } catch {
      setActiveLesson(lesson);
    }
  };

  const { courseId = '' } = useParams();
  const courseOpened = useRef(false);

  // رابط مباشر: /student/courses/:courseId يفتح الوحدة ودروسها فوراً
  useEffect(() => {
    if (!courseId || courseOpened.current || !courses.length) return;
    const hit = courses.find((c: any) => String(c.id) === courseId);
    if (hit && !hit.locked && !hit.isEmpty) { courseOpened.current = true; void openCourse(hit); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, courses]);
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

  // مصدر واحد للحقيقة: أي قفل (زر القفل/الحالة/إخفاء/فارغة) = مقفلة عند الطالب
  const isUnitLocked = (c: any) =>
    !!c.locked || !!c.manualLocked || !!c.isLocked ||
    c.status === 'locked' || c.status === 'hidden' ||
    !!c.isEmpty || c.isVisible === false || c.published === false;
  const lockReasonText = (c: any) => {
    if (c.isEmpty || c.status === 'empty' || (c.lessons ?? 0) === 0) return 'ستُنشر قريباً — يجهزها الأستاذ';
    if (c.isVisible === false || c.published === false || c.status === 'hidden') return 'مخفية حالياً من الأستاذ';
    if (c.status === 'locked' || c.lockReason === 'manual' || c.isLocked) return 'مقفلة من الأستاذ 🔒';
    if (c.locked) return 'مقفلة حالياً';
    return 'متاحة الآن';
  };
  const baseVisible = courses.filter((c) => c.isVisible !== false && c.published !== false);
  const visibleCourses = showLocked ? baseVisible : baseVisible.filter((c) => !isUnitLocked(c));
  const openCount = baseVisible.filter((c) => !isUnitLocked(c)).length;
  const lockedCount = baseVisible.filter((c) => isUnitLocked(c) && !c.isEmpty).length;
  const soonCount = baseVisible.filter((c) => !!c.isEmpty).length;
  // كل المهام المطلوبة المعلقة في الوحدات المفتوحة (واجبات لم تُسلَّم + دفتر لم يُسلَّم)
  const requiredPending = baseVisible
    .filter((c) => !isUnitLocked(c))
    .reduce((n, c) => n + hwFor(c).filter(hwPending).length + nbFor(c).filter(nbPending).length, 0);

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow="المنهاج الفلسطيني المعتمد"
        title="الوحدات التعليمية"
        body={`وحدات ${effectiveGrade} · ${term} — تظهر لك فقط الوحدات التي وصلتم إليها مع الأستاذ، وأي وحدة يفتحها الأستاذ تظهر لك فوراً.`}
        tone="light"
        stats={[
          { value: openCount, label: 'وحدات مفتوحة' },
          { value: requiredPending, label: 'مهام مطلوبة عليك' },
          { value: courses.length, label: 'إجمالي الوحدات' },
        ]}
      />
      <GradeTermBadge grade={effectiveGrade} term={term} split={split} gender={gender} school={school} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { loadCourses(); loadUnitTasks(); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> تحديث الوحدات
          </button>
          <Link
            href="/student/summaries"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#17413f] to-[#2a7a72] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <FileText size={14} /> الملخصات وأوراق العمل ↗
          </Link>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary">
          <input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} className="h-4 w-4 accent-primary" /> عرض الوحدات المقفلة أيضاً
        </label>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse overflow-hidden rounded-3xl border border-border bg-card">
              <div className="h-40 bg-muted" />
              <div className="space-y-3 p-6">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted/70" />
                <div className="h-9 w-28 rounded-xl bg-muted/70" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <StateNotice type="error" onRetry={loadCourses} />
      ) : !visibleCourses.length ? (
        <div className="relative overflow-hidden rounded-[2rem] border border-dashed border-border bg-gradient-to-b from-card to-secondary/30 px-6 py-14 text-center shadow-sm">
          <span className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
          <span className="pointer-events-none absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <span className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[#17413f] to-[#2a7a72] text-white shadow-xl"><Lock size={26} /></span>
          <p className="relative font-display text-xl font-extrabold text-primary">
            {courses.length && !openCount ? `كل وحدات ${effectiveGrade} · ${term} بانتظار فتح الأستاذ` : `لا توجد وحدات مفتوحة بعد في ${effectiveGrade} · ${term}`}
          </p>
          <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {courses.length
              ? `يوجد ${courses.length} وحدات في المنهاج — الأستاذ فتح ${openCount} منها. فعّل «عرض الوحدات المقفلة أيضاً» لرؤية خارطة الطريق، أو اضغط تحديث بعد حصة الأستاذ.`
              : 'سيفتحها لك الأستاذ تباعاً كلما تقدمتم في المنهاج — تابع حصة الأستاذ.'}
          </p>
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => { loadCourses(); loadUnitTasks(); }} variant="primary" className="px-6 py-3"><RefreshCw size={15} /> تحديث الآن</Button>
            {!showLocked && courses.length > 0 ? (
              <Button onClick={() => setShowLocked(true)} variant="soft" className="px-6 py-3"><Eye size={15} /> عرض خارطة الوحدات</Button>
            ) : null}
          </div>
          {soonCount > 0 ? <p className="relative mt-4 text-xs font-bold text-muted-foreground">منها {soonCount} وحدات قيد التجهيز «ستُنشر قريباً»</p> : null}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleCourses.map((course, index) => {
            const locked = isUnitLocked(course);
            const progress = typeof course.progress === 'number' ? Math.max(0, Math.min(100, course.progress)) : 0;
            const cHw = hwFor(course);
            const cNb = nbFor(course);
            const cEx = examsFor(course);
            const cHwPend = cHw.filter(hwPending).length;
            const cNbPend = cNb.filter(nbPending).length;
            return (
              <div key={course.id} className={`group relative overflow-hidden rounded-3xl border bg-card shadow-sm transition-all duration-300 animate-fade-up ${locked ? 'border-border opacity-95' : 'border-accent/40 hover:-translate-y-1.5 hover:shadow-2xl hover:border-accent'}`} style={{ animationDelay: `${Math.min(index, 8) * 0.05}s` }} data-testid={`card-course-detail-${course.id}`}>
                {!locked ? <span className="pointer-events-none absolute inset-x-8 -top-px h-1 rounded-full bg-gradient-to-l from-accent via-accent/60 to-transparent" /> : null}
                <div className="relative h-44 overflow-hidden" style={{ background: `linear-gradient(135deg, ${course.color || '#1a5c57'}, ${(course.color || '#1a5c57')}aa)` }}>
                  {course.coverUrl ? (
                    <img src={course.coverUrl} alt={course.title} loading="lazy" className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${locked ? 'grayscale-[35%]' : ''}`} />
                  ) : (
                    <div className="absolute -left-5 -top-12 select-none font-display text-[10rem] leading-none text-white/10">ض</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <div className="absolute right-4 top-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-black/35 px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur-md">الوحدة {String(course.sort_order || index + 1).padStart(2, '0')}</span>
                    {course.isEmpty ? (
                      <span className="rounded-lg bg-white/95 px-3 py-1.5 text-xs font-extrabold text-muted-foreground shadow">قريباً ✨</span>
                    ) : locked ? (
                      <span className="flex items-center gap-1.5 rounded-lg bg-black/55 px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur-md"><Lock size={12} /> مقفلة</span>
                    ) : (
                      <span className="flex items-center gap-1.5 rounded-lg bg-green-500/90 px-3 py-1.5 text-xs font-extrabold text-white shadow">متاحة الآن ✓</span>
                    )}
                  </div>
                  {locked ? (
                    <span className="absolute inset-0 grid place-items-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-black/45 text-white backdrop-blur-md"><Lock size={22} /></span></span>
                  ) : null}
                  <div className="absolute bottom-3 right-4 left-4 flex items-end justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {course.avatarUrl ? (
                        <img src={course.avatarUrl} alt="" className="h-11 w-11 rounded-2xl border-2 border-white/60 object-cover shadow-lg" />
                      ) : (
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 text-white shadow backdrop-blur-md"><BookOpen size={20} /></span>
                      )}
                      <span className="text-xs font-bold text-white/90">{course.grade} · {course.term}</span>
                    </div>
                    {progress > 0 ? (
                      <span className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-extrabold text-accent-foreground shadow">{progress}% منجز</span>
                    ) : null}
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-extrabold leading-tight text-primary">{course.title}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground line-clamp-2">{course.description || 'وحدة تفاعلية من المنهاج المعتمد — افتحها وابدأ الدروس.'}</p>
                  <div className="mt-4 flex items-center justify-between text-xs font-bold text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Library size={13} /> {course.lessons} دروس تفاعلية</span>
                    <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {course.duration || 'حسب الحصة'}</span>
                  </div>
                  {(cHw.length || cNb.length || cEx.length) ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {cHw.length ? (
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${cHwPend ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-800'}`}>
                          <ClipboardCheck size={12} /> {cHw.length} واجب مطلوب{cHwPend ? ` · ${cHwPend} معلق` : ' ✓'}
                        </span>
                      ) : null}
                      {cNb.length ? (
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${cNbPend ? 'bg-amber-500/15 text-amber-800' : 'bg-green-500/10 text-green-800'}`}>
                          <NotebookPen size={12} /> دفتر مطلوب{cNbPend ? ` · ${cNbPend} معلق` : ' ✓'}
                        </span>
                      ) : null}
                      {cEx.length ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#0d47a1]/10 px-2.5 py-1 text-[11px] font-extrabold text-[#0d47a1]">
                          <Target size={12} /> {cEx.length} اختبارات
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {progress > 0 ? (
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold"><span className="text-muted-foreground">تقدمك</span><span className="text-primary">{progress}%</span></div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-gradient-to-l from-[#17413f] to-[#2a9d8f] transition-all duration-700" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-5 flex items-center justify-between gap-2 rounded-2xl bg-secondary/40 px-4 py-3">
                    <span className={`text-xs font-extrabold ${locked ? 'text-muted-foreground' : 'text-green-800'}`}>{locked ? lockReasonText(course) : 'جاهزة — ادخل الدروس وابدأ 🎯'}</span>
                    <Button onClick={() => openCourse(course)} disabled={locked} variant={locked ? 'ghost' : 'primary'} className="shrink-0 px-4 py-2.5 text-xs shadow-sm" data-testid={`link-open-course-${course.id}`}>
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
        <Modal title={selectedCourse.title} eyebrow={`دروس الوحدة · ${selectedCourse.grade}`} onClose={() => { setSelectedCourse(null); setActiveLesson(null); }} maxWidth="max-w-3xl">
          {loadingLessons ? (
            <StateNotice type="loading" />
          ) : !lessons.length ? (
            <StateNotice type="empty" />
          ) : (
            <div className="space-y-3">
              <p className="mb-4 text-xs leading-6 text-muted-foreground">{selectedCourse.description}</p>
              {(() => {
                const mHw = generalHw(selectedCourse);
                const mNb = generalNb(selectedCourse);
                const mEx = generalExams(selectedCourse);
                if (!mHw.length && !mNb.length && !mEx.length) return null;
                const pendCount = mHw.filter(hwPending).length + mNb.filter(nbPending).length;
                return (
                  <div className="mb-5 overflow-hidden rounded-3xl border-2 border-accent/40 bg-gradient-to-b from-accent/15 to-card">
                    <button
                      type="button"
                      onClick={() => setExpandedGeneral((v) => !v)}
                      className="flex w-full items-center gap-2 bg-accent/20 px-5 py-3.5 text-sm font-extrabold text-primary transition-colors hover:bg-accent/30"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent text-[#3a2c07]">⭐</span>
                      <span className="truncate">مهام عامة للوحدة (بلا درس محدد)</span>
                      {pendCount ? <span className="shrink-0 animate-pulse rounded-full bg-destructive px-3 py-1 text-[11px] font-extrabold text-white">{pendCount} معلقة!</span> : null}
                      <span className="mr-auto flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-card px-3 py-1 text-[11px] font-bold text-muted-foreground">{mHw.length + mNb.length + mEx.length} مهام</span>
                        <ChevronLeft size={18} className={`text-primary transition-transform duration-300 ${expandedGeneral ? '-rotate-90' : ''}`} />
                      </span>
                    </button>
                    {expandedGeneral ? (
                    <div className="space-y-2.5 p-3 sm:p-4">
                      {mHw.map((h: any) => {
                        const pend = hwPending(h);
                        return (
                          <TaskCard
                            key={`hw-${h.id}`} tone="hw" icon={<ClipboardCheck size={17} />}
                            title={h.title}
                            meta={`ÙˆØ§Ø¬Ø¨ Ù„Ù„ÙˆØ­Ø¯Ø©${h.dueDate ? ` Â· Ø­ØªÙ‰ ${h.dueDate}` : ''} Â· ${h.points} Ù†Ù‚Ø§Ø·`}
                            status={pend ? 'Ù„Ù… ÙŠÙØ³Ù„ÙŽÙ‘Ù… Ø¨Ø¹Ø¯' : (h.status || 'ØªÙ…')}
                            statusTone={pend ? 'bg-destructive/12 text-destructive' : 'bg-green-500/15 text-green-800'}
                          >
                            {pend ? (
                              <button type="button" onClick={() => setQuickHw(h)} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-all active:scale-[.97]"><Upload size={14} /> Ø±ÙØ¹ Ø§Ù„ÙˆØ§Ø¬Ø¨</button>
                            ) : null}
                            <Link href="/student/assignments" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-extrabold text-primary transition-colors hover:bg-accent/40">Ø§Ù„Ù‚Ø³Ù… <ArrowLeft size={13} /></Link>
                          </TaskCard>
                        );
                      })}
                      {mNb.map((t: any) => {
                        const pend = nbPending(t);
                        return (
                          <TaskCard
                            key={`nb-${t.id}`} tone="nb" icon={<NotebookPen size={17} />}
                            title={t.title}
                            meta={`Ù…Ù‡Ù…Ø© Ø¯ÙØªØ± Ù„Ù„ÙˆØ­Ø¯Ø©${t.dueDate ? ` Â· Ø­ØªÙ‰ ${t.dueDate}` : ''}${t.points ? ` Â· ${t.points} Ù†Ù‚Ø§Ø·` : ''}`}
                            status={pend ? 'Ù„Ù… ÙŠÙØ³Ù„ÙŽÙ‘Ù… Ø¨Ø¹Ø¯' : (t.myStatus || 'ØªÙ…')}
                            statusTone={pend ? 'bg-amber-500/15 text-amber-800' : 'bg-green-500/15 text-green-800'}
                          >
                            {pend ? (
                              <Link href={`/student/notebook?task=${t.id}`} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-all active:scale-[.97]"><Upload size={14} /> ØªØ³Ù„ÙŠÙ… Ø§Ù„Ø¯ÙØªØ±</Link>
                            ) : null}
                            <Link href="/student/notebook" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-extrabold text-primary transition-colors hover:bg-accent/40">Ø§Ù„Ù‚Ø³Ù… <ArrowLeft size={13} /></Link>
                          </TaskCard>
                        );
                      })}
                      {mEx.map((e: any) => (
                        <TaskCard
                          key={`ex-${e.id}`} tone="ex" icon={<Target size={17} />}
                          title={e.title}
                          meta={`Ø§Ø®ØªØ¨Ø§Ø± Ø§Ù„ÙˆØ­Ø¯Ø© Â· ${e.questions} Ø£Ø³Ø¦Ù„Ø© Â· ${e.duration}`}
                          status="Ù…ØªØ§Ø­ Ø§Ù„Ø¢Ù†" statusTone="bg-[#0d47a1]/10 text-[#0d47a1]"
                        >
                          <Link href="/student/assessments" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#0d47a1] px-4 py-2 text-xs font-extrabold text-white shadow-sm transition-all active:scale-[.97]">Ø§Ø¨Ø¯Ø£ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø± <ArrowLeft size={13} /></Link>
                          <Link href="/student/assessments" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-extrabold text-primary transition-colors hover:bg-accent/40">Ø§Ù„Ù‚Ø³Ù… <ArrowLeft size={13} /></Link>
                        </TaskCard>
                      ))}
                    </div>
                    ) : null}
                  </div>
                );
              })()}
              {lessons.filter((l) => l.isVisible).map((lesson) => {
                const TypeIcon = lessonTypeIcon(lesson.lessonType);
                const locked = lesson.locked;
                const tHw = hwForLesson(lesson);
                const tEx = examsForLesson(lesson);
                const tNb = nbForLesson(lesson);
                const tCount = tHw.length + tEx.length + tNb.length;
                const tPend = tHw.some(hwPending) || tNb.some(nbPending);
                const tOpen = !!expandedLessons[lesson.id];
                return (
                  <div key={lesson.id} className={`overflow-hidden rounded-2xl border bg-background transition-colors ${tOpen ? 'border-accent shadow-md' : 'border-border'} ${locked ? 'opacity-70' : ''}`}>
                    {/* الصف الأول: هوية الدرس فقط — بلا أزرار، فلا فيض شيء خارج الإطار */}
                    <div className={`flex items-center gap-3 p-4 pb-3 ${!locked ? 'hover:border-primary/40' : ''}`}>
                      {lesson.coverUrl ? (
                        <img src={lesson.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><TypeIcon size={17} /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-bold text-primary">
                          <span className="truncate">{lesson.title}</span>
                          {locked ? <Lock size={13} className="shrink-0 text-muted-foreground" /> : null}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 font-bold text-primary">{lesson.lessonType}</span>
                          <span className="truncate">{lesson.description || 'شرح الدرس والتدريبات المرافقة'}</span>
                        </p>
                      </div>
                    </div>

                    {/* الصف الثاني: الأزرار في سطر مستقل يلتفّ ولا يفيض أبداً.
                        إن وُجبت مهام، يأخذ زر "مهام الدرس" السطر كاملاً وينزل
                        الباقي تحته — لا يزاحم ولا يخرج عن الإطار. */}
                    <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
                      {tCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleLessonTasks(lesson.id)}
                          title={tOpen ? 'إخفاء مهام الدرس' : 'عرض مهام الدرس (واجبات ودفتر واختبارات)'}
                          className={`relative inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold shadow-sm transition-all active:scale-[.97] sm:w-auto ${tOpen ? 'bg-primary text-primary-foreground' : tPend ? 'animate-pulse bg-destructive text-white' : 'bg-accent text-[#3a2c07]'}`}
                        >
                          <ChevronLeft size={15} className={`transition-transform duration-300 ${tOpen ? '-rotate-90' : ''}`} />
                          مهام الدرس
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${tOpen || tPend ? 'bg-white/25 text-white' : 'bg-black/15 text-[#3a2c07]'}`}>{tCount}</span>
                          {tPend && !tOpen ? <span className="absolute -left-1 -top-1 h-3 w-3 animate-ping rounded-full bg-destructive" /> : null}
                          {tPend && !tOpen ? <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-destructive" /> : null}
                        </button>
                      ) : null}
                      {!locked ? (
                        <Link
                          href={`/student/courses/${selectedCourse.id}/lessons/${lesson.id}`}
                          className={`inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-all active:scale-[.97] ${tCount > 0 ? 'flex-1 sm:flex-none' : 'flex-1'}`}
                          data-testid={`link-lesson-page-${lesson.id}`}
                        >
                          صفحة كاملة <ArrowUpLeft size={14} />
                        </Link>
                      ) : null}
                      <Button
                        onClick={() => !locked && openLessonQuick(lesson)}
                        disabled={locked}
                        variant="outline"
                        className={`min-h-[44px] flex-1 px-3 py-2 text-xs sm:flex-none`}
                      >
                        {locked ? 'مقفل' : (<>عرض سريع <BookOpen size={14} /></>)}
                      </Button>
                    </div>
                    {tOpen && tCount > 0 ? (
                      <div className="space-y-2.5 border-t border-dashed border-border bg-gradient-to-b from-secondary/40 to-secondary/20 p-3">
                        {tHw.map((h: any) => {
                          const pend = hwPending(h);
                          return (
                            <TaskCard
                              key={`lh-${h.id}`}
                              tone="hw"
                              icon={<ClipboardCheck size={17} />}
                              title={h.title}
                              meta={`واجب مطلوب${h.dueDate ? ` · حتى ${h.dueDate}` : ''} · ${h.points} نقاط`}
                              status={pend ? 'لم يُسلَّم بعد' : (h.status || 'تم')}
                              statusTone={pend ? 'bg-destructive/12 text-destructive' : 'bg-green-500/15 text-green-800'}
                            >
                              {pend ? (
                                <button type="button" onClick={() => setQuickHw(h)} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-all active:scale-[.97]">
                                  <Upload size={14} /> رفع الواجب
                                </button>
                              ) : null}
                              <Link href="/student/assignments" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-extrabold text-primary transition-colors hover:bg-accent/40">
                                القسم <ArrowLeft size={13} />
                              </Link>
                            </TaskCard>
                          );
                        })}
                        {tNb.map((t: any) => {
                          const pend = nbPending(t);
                          return (
                            <TaskCard
                              key={`ln-${t.id}`}
                              tone="nb"
                              icon={<NotebookPen size={17} />}
                              title={t.title}
                              meta={`دفتر مطلوب${t.dueDate ? ` · حتى ${t.dueDate}` : ''}${t.points ? ` · ${t.points} نقاط` : ''}`}
                              status={pend ? 'لم يُسلَّم بعد' : (t.myStatus || 'تم')}
                              statusTone={pend ? 'bg-amber-500/15 text-amber-800' : 'bg-green-500/15 text-green-800'}
                            >
                              {pend ? (
                                <Link href={`/student/notebook?task=${t.id}`} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-all active:scale-[.97]">
                                  <Upload size={14} /> تسليم الدفتر
                                </Link>
                              ) : null}
                              <Link href="/student/notebook" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-extrabold text-primary transition-colors hover:bg-accent/40">
                                القسم <ArrowLeft size={13} />
                              </Link>
                            </TaskCard>
                          );
                        })}
                        {tEx.map((e: any) => (
                          <TaskCard
                            key={`le-${e.id}`}
                            tone="ex"
                            icon={<Target size={17} />}
                            title={e.title}
                            meta={`اختبار · ${e.questions} أسئلة · ${e.duration}`}
                            status="متاح الآن"
                            statusTone="bg-[#0d47a1]/10 text-[#0d47a1]"
                          >
                            <Link href="/student/assessments" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#0d47a1] px-4 py-2 text-xs font-extrabold text-white shadow-sm transition-all active:scale-[.97]">
                              <PlayCircle size={14} /> ابدأ الاختبار
                            </Link>
                            <Link href="/student/assessments" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-extrabold text-primary transition-colors hover:bg-accent/40">
                              القسم <ArrowLeft size={13} />
                            </Link>
                          </TaskCard>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {quickHw && (
        <HwQuickSubmitModal
          hw={quickHw}
          onClose={() => setQuickHw(null)}
          onSubmitted={() => { loadUnitTasks(); loadCourses(); }}
        />
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
   (الصفوف × الوحدات × الدروس × الاختبارات)
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

type ManagerTab = 'units' | 'exams' | 'assignments' | 'notes';

function CurriculumManagerPage({ onlyTab, hero }: {
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
  onlyTab?: ManagerTab;
  hero?: { eyebrow: string; title: string; body: string };
}) {
  const [grade, setGrade] = useState('الصف العاشر');
  const term = usePlatformTerm();
  const [tab, setTab] = useState<ManagerTab>(onlyTab || 'units');
  const splitMap = useSplitMap();
  const gradeSplit = splitMap[grade] === true;
  // تبويب واحد فقط عند التضمين في صفحة مستقلة، وإلا: تبويب الوحدات والدروس
  const visibleTabIds: ManagerTab[] = onlyTab ? [onlyTab] : ['units'];
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
  const [uploadingBundle, setUploadingBundle] = useState<number | false>(false);
  const [bundleStage, setBundleStage] = useState('');
  const [bundleInfo, setBundleInfo] = useState<any>(null);
  const [uploadDiag, setUploadDiag] = useState<UploadDiag | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);
  const [previewLesson, setPreviewLesson] = useState<any | null>(null);

  const [exams, setExams] = useState<any[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [hwItems, setHwItems] = useState<any[]>([]);
  const [loadingHw, setLoadingHw] = useState(false);
  const [hwModal, setHwModal] = useState<null | { mode: 'create' } | { mode: 'edit'; item: any }>(null);
  const [hwForm, setHwForm] = useState<any>({});
  const [savingHw, setSavingHw] = useState(false);
  const [hwImages, setHwImages] = useState<string[]>([]);
  const [hwNewImageUrl, setHwNewImageUrl] = useState('');
  const [uploadingHw, setUploadingHw] = useState(false);
  const [hwImagesErr, setHwImagesErr] = useState('');
  const [hwLessons, setHwLessons] = useState<any[]>([]);
  const [hwReview, setHwReview] = useState<any | null>(null);
  const [hwSubs, setHwSubs] = useState<any[]>([]);
  const [loadingHwSubs, setLoadingHwSubs] = useState(false);
  const [hwGrading, setHwGrading] = useState<Record<string, { score: string; feedback: string }>>({});
  const [examModal, setExamModal] = useState(false);
  const [examForm, setExamForm] = useState<any>({ title: '', description: '', courseId: '', lessonId: '', duration: '20 دقيقة', published: true, isVisible: true });
  const [examLessons, setExamLessons] = useState<any[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLevel, setAiLevel] = useState('متوسط');
  const [aiCount, setAiCount] = useState(10);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDrafts, setAiDrafts] = useState<any[]>([]);
  const [aiMsg, setAiMsg] = useState('');
  const [aiOk, setAiOk] = useState(true);
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
    const want = Math.min(Math.max(Number(aiCount) || 10, 1), 40);
    setAiLoading(true);
    setAiMsg('');
    setAiOk(true);
    try {
      const res = await jsonFetch('/api/teacher/curriculum/assessments/generate', {
        method: 'POST',
        body: { prompt, count: want, level: aiLevel, grade, unitTitle: course?.title || '', lessonTitle: lesson?.title || '' },
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
        setAiOk(false);
        setAiMsg('لم يولّد الذكاء أسئلة — جرّب صياغة أخرى أو قلل العدد');
      } else {
        setAiOk(true);
        const short = qs.length < want ? ` (طلبت ${want} لكن المتاح غير المكرر ${qs.length} — ولّد دفعة أخرى للإكمال)` : '';
        if (filled.length) {
          setAiMsg(`تم توليد ${qs.length} أسئلة حقيقية ✓${short} وتعبئة (${filled.join(' + ')}) تلقائياً ✓`);
        } else {
          setAiMsg(`تم توليد ${qs.length} أسئلة بنجاح ✓${short} — راجعها واعتمدها`);
        }
      }
    } catch (e: any) {
      setAiOk(false);
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

  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [noteForm, setNoteForm] = useState<any>({ title: '', body: '', type: 'إرشاد', audience: 'الجميع', targetGrade: 'الجميع', targetSchool: '', section: 'الجميع', published: true });
  const [savingNote, setSavingNote] = useState(false);

  const [msg, setMsg] = useState('');

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || null;

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

  const loadNotes = async () => {
    setLoadingNotes(true);
    try {
      const data = await jsonFetch('/api/curriculum/announcements');
      setNotes(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); } finally { setLoadingNotes(false); }
  };

  const loadHw = async () => {
    setLoadingHw(true);
    try {
      const data = await jsonFetch(`/api/teacher/curriculum/assignments?grade=${encodeURIComponent(grade)}`);
      setHwItems(Array.isArray(data) ? data : []);
    } catch { setHwItems([]); } finally { setLoadingHw(false); }
  };

  useEffect(() => { loadCourses(); loadExams(); loadNotes(); loadHw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grade, term]);

  /* ---------- الواجبات ---------- */
  const openHwCreate = () => {
    setHwForm({ title: '', description: '', courseId: courses[0]?.id || '', lessonId: '', unit: courses[0]?.title || '', images: [], dueDate: '', points: 20, published: true, section: 'الجميع', school: '' });
    setHwImages([]);
    setHwNewImageUrl('');
    setHwImagesErr('');
    setHwModal({ mode: 'create' });
  };
  const openHwEdit = (item: any) => {
    const linked = courses.find((c: any) => c.id === item.courseId || (item.unit && c.title === item.unit));
    setHwForm({ title: item.title, description: item.description, courseId: item.courseId || linked?.id || '', lessonId: item.lessonId || '', unit: item.unit, dueDate: item.dueDate, points: item.points, published: item.published, section: item.section || 'الجميع', school: item.school || '' });
    setHwImages(Array.isArray(item.images) ? [...item.images] : []);
    setHwNewImageUrl('');
    setHwImagesErr('');
    setHwModal({ mode: 'edit', item });
  };
  // دروس الوحدة المختارة لربط الواجب بدرس محدد (اختياري)
  useEffect(() => {
    if (!hwModal || !hwForm.courseId) { setHwLessons([]); return; }
    jsonFetch(`/api/curriculum/courses/${hwForm.courseId}/lessons`)
      .then((d) => setHwLessons(Array.isArray(d) ? d : []))
      .catch(() => setHwLessons([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hwModal, hwForm.courseId]);
  const saveHw = async (e: FormEvent) => {
    e.preventDefault();
    setSavingHw(true);
    try {
      const body = { ...hwForm, images: hwImages, grade, section: gradeSplit ? (hwForm.section || 'الجميع') : 'الجميع', school: hwForm.school || '' };
      if (hwModal?.mode === 'create') {
        await jsonFetch('/api/teacher/assignments', { method: 'POST', body });
        flash('تمت إضافة الواجب بنجاح!');
      } else if (hwModal?.mode === 'edit') {
        await jsonFetch(`/api/teacher/curriculum/assignments/${hwModal.item.id}`, { method: 'PATCH', body });
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
  const openHwReview = async (item: any) => {
    setHwReview(item);
    setHwSubs([]);
    setLoadingHwSubs(true);
    try {
      const data = await jsonFetch(`/api/teacher/curriculum/assignments/${item.id}/submissions`);
      const list = Array.isArray(data) ? data : [];
      setHwSubs(list);
      const g: Record<string, { score: string; feedback: string }> = {};
      for (const s of list) g[s.id] = { score: s.score ?? '', feedback: s.feedback || '' };
      setHwGrading(g);
    } catch { setHwSubs([]); } finally { setLoadingHwSubs(false); }
  };
  const saveHwGrade = async (sub: any) => {
    try {
      const g = hwGrading[sub.id] || { score: '', feedback: '' };
      await jsonFetch(`/api/teacher/curriculum/assignment-submissions/${sub.id}`, {
        method: 'PATCH',
        body: { score: g.score === '' ? null : Number(g.score), feedback: g.feedback },
      });
      flash(`تم تقييم ${sub.student?.name || 'الطالب'} ✓`);
      openHwReview(hwReview);
      loadHw();
    } catch (e: any) { flash(e?.message || 'تعذر حفظ التقييم'); }
  };

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(''), 3000); };

  /* ---------- الوحدات ---------- */
  const openUnitCreate = () => {
    setUnitForm({ title: '', description: '', color: UNIT_COLORS[courses.length % UNIT_COLORS.length], icon: 'book-open', sortOrder: courses.length + 1, duration: '', coverUrl: '', avatarUrl: '', status: 'published', isLocked: false, isVisible: true, section: 'الجميع', school: '' });
    setUnitModal({ mode: 'create' });
  };
  const openUnitEdit = (course: any) => {
    setUnitForm({ title: course.title, description: course.description, color: course.color, icon: course.icon, sortOrder: course.sort_order, duration: course.duration, coverUrl: course.coverUrl || '', avatarUrl: course.avatarUrl || '', status: course.status || 'published', isLocked: !!course.isLocked, isVisible: course.isVisible !== false, section: course.section || 'الجميع', school: course.school || '' });
    setUnitModal({ mode: 'edit', course });
  };
  const saveUnit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingUnit(true);
    try {
      const payload = { ...unitForm, grade, term, section: gradeSplit ? (unitForm.section || 'الجميع') : 'الجميع', school: unitForm.school || '' };
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
      if (patch?.isLocked === false) flash(`تم فتح «${course.title}» للطلاب ✓`);
      else if (patch?.isLocked === true) flash(`تم قفل «${course.title}» عن الطلاب 🔒`);
      loadCourses();
    } catch (e) { console.error(e); }
  };

  /* ---------- الدروس ---------- */
  const openLessonCreate = (courseId: string) => {
    setLessonForm({ title: '', lessonType: 'مطالعة', description: '', position: lessons.length + 1, coverUrl: '', htmlContent: '', htmlFileUrl: '', introduction: '', mainText: '', grammarRule: '', summary: '', status: 'published', isLocked: false, isVisible: true, examId: '', school: '' });
    setLessonImages([]);
    setNewImageUrl('');
    setShowHtmlPreview(false);
    setBundleInfo(null);
    setUploadingBundle(false);
    setBundleStage('');
    setUploadDiag(null);
    setLessonModal({ mode: 'create', courseId });
  };
  const openLessonEdit = (lesson: any) => {
    const linked = exams.find((e: any) => e.lessonId === lesson.id);
    setLessonForm({ title: lesson.title, lessonType: lesson.lessonType || 'مطالعة', description: lesson.description || '', position: lesson.position || 1, coverUrl: lesson.coverUrl || '', htmlContent: lesson.htmlContent || '', htmlFileUrl: lesson.htmlFileUrl || '', introduction: lesson.content?.introduction || '', mainText: lesson.content?.mainText || '', grammarRule: lesson.content?.grammarRule || '', summary: lesson.content?.summary || '', status: lesson.status || 'published', isLocked: !!lesson.isLocked, isVisible: lesson.isVisible !== false, examId: linked?.id || '', school: lesson.school || '' });
    setLessonImages(Array.isArray(lesson.images) ? [...lesson.images] : []);
    setNewImageUrl('');
    setShowHtmlPreview(false);
    setBundleInfo(lesson.htmlFileUrl && (isBundleUrl(lesson.htmlFileUrl) || isSourceBundleUrl(lesson.htmlFileUrl)) ? { url: lesson.htmlFileUrl, existing: true } : null);
    setUploadingBundle(false);
    setBundleStage('');
    setUploadDiag(null);
    setLessonModal({ mode: 'edit', lesson });
  };
  const saveLesson = async (e: FormEvent) => {
    e.preventDefault();
    setSavingLesson(true);
    try {
      const baseContent = lessonModal?.mode === 'edit' ? (lessonModal.lesson.content || {}) : {};
      // شفاء تلقائي: رابط الحزمة يغني عن اللصق — أي بقايا ثنائية في اللصق تُمسح عند الحفظ
      const formUrl = (lessonForm.htmlFileUrl || '').trim();
      const richUrl = formUrl && (isBundleUrl(formUrl) || isSourceBundleUrl(formUrl));
      const payload = {
        title: lessonForm.title,
        lessonType: lessonForm.lessonType,
        description: lessonForm.description,
        position: Number(lessonForm.position) || 1,
        coverUrl: lessonForm.coverUrl,
        images: lessonImages,
        htmlContent: richUrl ? '' : lessonForm.htmlContent,
        htmlFileUrl: lessonForm.htmlFileUrl,
        content: { ...baseContent, introduction: lessonForm.introduction, mainText: lessonForm.mainText, grammarRule: lessonForm.grammarRule, summary: lessonForm.summary },
        status: lessonForm.status,
        isLocked: !!lessonForm.isLocked,
        isVisible: !!lessonForm.isVisible,
        grade, term,
        school: lessonForm.school || '',
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
    setExamForm({ title: '', description: '', courseId: selectedCourseId || courses[0]?.id || '', lessonId: '', duration: '20 دقيقة', published: true, isVisible: true, section: 'الجميع', school: '' });
    setAiPrompt(''); setAiDrafts([]); setAiMsg(''); setAiOk(true); setAiLevel('متوسط'); setAiCount(10);
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
      await jsonFetch('/api/teacher/curriculum/assessments', { method: 'POST', body: { ...examForm, grade, term, section: gradeSplit ? (examForm.section || 'الجميع') : 'الجميع', school: examForm.school || '', questions: clean } });
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

  // ══ مراجعة الاختبار: من اجتاز ومن لم يجرّب (نفسه الواجب والدفتر) ══
  const [examReview, setExamReview] = useState<any | null>(null);
  const [examAttempts, setExamAttempts] = useState<any[]>([]);
  const openExamReview = async (exam: any) => {
    setExamReview(exam);
    try {
      const data = await jsonFetch(`/api/teacher/curriculum/assessments/${exam.id}/attempts`);
      setExamAttempts(Array.isArray(data) ? data : []);
    } catch { setExamAttempts([]); }
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
    setNoteForm({ title: '', body: '', type: 'إرشاد', audience: 'الجميع', targetGrade: grade, section: 'الجميع', published: true, targetSchool: '', school: '' });
    setNoteModal(true);
  };
  const saveNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!noteForm.title.trim() || !noteForm.body.trim()) { flash('عنوان الإعلان ونصه مطلوبان'); return; }
    setSavingNote(true);
    try {
      const noteGrade = noteForm.targetGrade || 'الجميع';
      const noteSplit = noteGrade !== 'الجميع' && splitMap[noteGrade] === true;
      const noteSchool = String(noteForm.targetSchool || noteForm.school || '').trim();
      const body = {
        ...noteForm,
        grade: noteGrade,
        section: noteSplit ? (noteForm.section || 'الجميع') : 'الجميع',
        school: noteSchool,
      };
      // تعديل إعلان قائم أو نشر جديد
      const r: any = noteForm.id
        ? await jsonFetch(`/api/teacher/curriculum/announcements/${noteForm.id}`, { method: 'PATCH', body })
        : await jsonFetch('/api/teacher/curriculum/announcements', { method: 'POST', body });
      setNoteModal(false);
      loadNotes();
      flash(r?.partial
        ? (r?.message || 'حُفظ — لكن حقلا الصف والمدرسة غير مفعّلين، فعّل sql_announcements_scope.sql')
        : (r?.message || (noteForm.id ? 'تم حفظ التعديل!' : 'تم نشر الإعلان بنجاح!')));
    } catch (e: any) { flash(e?.message || 'تعذر الحفظ'); } finally { setSavingNote(false); }
  };
  /* فتح نافذة التعديل معبّأة بالإعلان الحالي */
  const editNote = (note: any) => {
    setNoteForm({
      id: note.id,
      title: note.title || '',
      body: note.body || '',
      type: note.type || 'إرشاد',
      audience: note.audience || 'الجميع',
      targetGrade: note.grade || 'الجميع',
      targetSchool: note.school || '',
      school: note.school || '',
      section: note.section || 'الجميع',
      published: note.published !== false,
    });
    setNoteModal(true);
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
  // الإعلانات: فلترة بالصف والمدرسة معاً — بدونها يرى الأستاذ إعلانات
  // صفٍّ آخر ويظنّها موجّهة لصفّه. "الجميع" يعني الكل صراحةً.
  const [noteScope, setNoteScope] = useState<'grade' | 'all'>('grade');
  const shownNotes = notes.filter((n) => {
    if (!matchSection(n.section)) return false;
    if (noteScope === 'all') return true;
    const ng = foldName(n.grade || 'الجميع');
    const g = foldName(grade);
    return !ng || ng === 'الجميع' || ng === g;
  });

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow={hero?.eyebrow || 'مكتبة المنهاج الكاملة'}
        title={hero?.title || 'إدارة المنهاج والوحدات'}
        body={hero?.body || 'الوحدات بأغلفتها والدروس بصورها وملفات HTML — ما تفتحه هنا يظهر للطلاب فوراً.'}
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {GRADES.map((g) => (
          <button key={g} type="button" onClick={() => { setGrade(g); setSelectedCourseId(null); setLessons([]); setSectionFilter('الجميع'); }} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${grade === g ? 'bg-primary text-primary-foreground shadow-sm' : 'border border-border bg-card text-muted-foreground hover:text-primary'}`} data-testid={`button-grade-${g}`}>{g}</button>
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
              <button key={s.id} type="button" onClick={() => setSectionFilter(s.id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${sectionFilter === s.id ? s.cls : s.idle}`} data-testid={`button-section-${s.id}`}>
                {s.label} <span className="mr-1 font-mono text-xs opacity-75">({sectionCount(s.id)})</span>
              </button>
            ))}
          </>
        )}
      </div>

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
                        {(() => {
                          const visibleToStudents = !course.isLocked && (course.status || 'published') === 'published' && course.isVisible !== false && (course.lessons ?? 0) > 0;
                          return (
                            <p className={`mt-1.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${visibleToStudents ? 'bg-green-500/10 text-green-800' : 'bg-secondary/60 text-muted-foreground'}`}>
                              {visibleToStudents ? (<><Eye size={12} /> الطلاب يرونها مفتوحة ✓</>) : (course.isLocked || course.status === 'locked') ? (<><Lock size={12} /> مقفلة عن الطلاب 🔒</>) : (<><EyeOff size={12} /> تحقق من الظهور والدروس</>)}
                            </p>
                          );
                        })()}
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{course.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                          <span>ترتيب {course.sort_order}</span>·<span>{course.lessons} دروس</span>·<span>{course.duration || 'بدون مدة'}</span>
                          {course.section && course.section !== 'الجميع' ? <span className="rounded-full bg-[#6a1b9a]/15 px-2 py-0.5 font-bold text-[#6a1b9a]">{course.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}
                          {course.avatarUrl ? <span className="text-green-700">· يوجد أفاتار</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/30 px-4 py-3">
                      <Button onClick={() => { setSelectedCourseId(course.id); loadLessons(course.id); }} variant="soft" className="px-3.5 py-2 text-xs" data-testid={`button-lessons-${course.id}`}>
                        <Library size={14} /> {`الدروس (${course.lessons})`}
                      </Button>
                      <button type="button" onClick={() => {
                        // توحيد القفل: الزر والحالة معاً حتى يعمل القفل دائماً عند الطلاب
                        const locking = !course.isLocked;
                        const patch: any = { isLocked: locking };
                        if (locking && course.status !== 'empty') patch.status = 'locked';
                        if (!locking && course.status === 'locked') patch.status = 'published';
                        quickToggleCourse(course, patch);
                      }} title={course.isLocked ? 'فتح الوحدة للطلاب' : 'قفل الوحدة عن الطلاب'} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition-all ${course.isLocked ? 'bg-green-600 text-white shadow hover:bg-green-700' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'}`} data-testid={`button-lock-${course.id}`}>
                        {course.isLocked ? <><LockOpen size={15} /> فتح للطلاب</> : <><Lock size={15} /> قفل</>}
                      </button>
                      <button type="button" onClick={() => quickToggleCourse(course, { isVisible: !course.isVisible })} title={course.isVisible ? 'إخفاء عن الطلاب' : 'إظهار للطلاب'} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted" data-testid={`button-visible-${course.id}`}>
                        {course.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <span className="mr-auto flex items-center gap-1">
                      <CopyLinkButton path={`/student/courses/${course.id}`} testId={`button-copy-course-${course.id}`} title="نسخ رابط الوحدة للطلاب" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" />
                        <Button onClick={() => openUnitEdit(course)} variant="ghost" className="px-2" data-testid={`button-edit-content-${course.id}`}><Pencil size={16} /></Button>
                        <Button onClick={() => deleteUnit(course)} variant="ghost" className="px-2 text-destructive" data-testid={`button-delete-${course.id}`}><Trash2 size={16} /></Button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------- نافذة دروس الوحدة (منبثقة جميلة بدل التوسعة تحت البطاقة) ---------- */}
      {selectedCourse && (
        <Modal title={`دروس ${selectedCourse.title}`} eyebrow={`${grade} · ${term} · ${lessons.length} دروس`} onClose={() => { setSelectedCourseId(null); setLessons([]); }} maxWidth="max-w-3xl">
          <div className="relative mb-5 overflow-hidden rounded-3xl shadow-lg" style={{ background: `linear-gradient(135deg, ${selectedCourse.color || '#1a5c57'}, ${(selectedCourse.color || '#1a5c57')}bb)` }}>
            {selectedCourse.coverUrl ? <img src={selectedCourse.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="pointer-events-none absolute -left-4 -top-10 select-none font-display text-[7rem] leading-none text-white/10">ض</span>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
            <div className="relative flex flex-wrap items-center gap-4 p-5">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-white shadow-xl backdrop-blur-md"><Library size={26} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-extrabold text-white">{selectedCourse.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white/85">
                  <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">ترتيب {selectedCourse.sort_order}</span>
                  <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">{lessons.length} دروس</span>
                  {(selectedCourse.isLocked || selectedCourse.status === 'locked') ? <span className="rounded-lg bg-destructive/80 px-2 py-0.5 text-white">مقفلة 🔒</span> : <span className="rounded-lg bg-green-500/85 px-2 py-0.5 text-white">مفتوحة ✓</span>}
                </p>
              </div>
              <Button onClick={() => openLessonCreate(selectedCourse.id)} variant="soft" className="shrink-0 bg-white/95 px-4 py-2.5 text-xs font-extrabold shadow-lg" data-testid="button-add-lesson"><Plus size={15} /> إضافة درس</Button>
            </div>
          </div>
          {loadingLessons ? <StateNotice type="loading" /> : !lessons.length ? (
            <div className="rounded-3xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><BookOpen size={24} /></span>
              <p className="font-display text-base font-bold text-primary">الوحدة فارغة بعد</p>
              <p className="mt-1 text-sm text-muted-foreground">أضف الدرس الأول (مطالعة / قواعد / بلاغة...) بزر «إضافة درس» بالأعلى.</p>
              <Button onClick={() => openLessonCreate(selectedCourse.id)} variant="primary" className="mt-4 px-6 py-3"><Plus size={16} /> إضافة أول درس</Button>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {lessons.map((lesson) => {
                const TypeIcon = lessonTypeIcon(lesson.lessonType);
                return (
                  <div key={lesson.id} title={lesson.description || lesson.title} className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary font-display text-xs font-extrabold text-primary-foreground">{lesson.position}</span>
                    {lesson.coverUrl ? <img src={lesson.coverUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><TypeIcon size={16} /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-extrabold leading-5 text-primary">{lesson.title || 'بدون عنوان'}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="rounded bg-secondary px-1.5 py-px font-bold text-primary">{lesson.lessonType}</span>
                        {lesson.isLocked ? <span className="font-bold text-destructive">🔒 مقفل</span> : null}
                        {!lesson.isVisible ? <span className="font-bold text-destructive">مخفي</span> : null}
                        {lesson.images?.length ? <span>· {lesson.images.length}📷</span> : null}
                        {lesson.htmlFileUrl && isSourceBundleUrl(lesson.htmlFileUrl) ? <span className="font-bold text-[#6a1b9a]">· ⚛️ مصدر مبني</span> : lesson.htmlFileUrl && isBundleUrl(lesson.htmlFileUrl) ? <span className="font-bold text-[#6a1b9a]">· 📦 موقع</span> : lesson.htmlContent || lesson.htmlFileUrl ? <span>· HTML</span> : null}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => setPreviewLesson(lesson)} title="معاينة سريعة للدرس" className="rounded-xl bg-secondary/70 p-2.5 text-primary transition-colors hover:bg-secondary active:scale-95"><Eye size={16} /></button>
                      <button type="button" onClick={() => openLessonEdit(lesson)} title="تعديل الدرس" className="rounded-xl bg-secondary/70 p-2.5 text-primary transition-colors hover:bg-secondary active:scale-95"><Pencil size={16} /></button>
                      <CopyLinkButton path={`/student/courses/${selectedCourse?.id || ''}/lessons/${lesson.id}`} testId={`button-copy-lesson-${lesson.id}`} title="نسخ رابط الدرس للطلاب" className="rounded-xl bg-secondary/70 p-2.5 text-primary transition-colors hover:bg-secondary active:scale-95" />
                      <button type="button" onClick={() => deleteLesson(lesson)} title="حذف الدرس" className="rounded-xl bg-destructive/10 p-2.5 text-destructive transition-colors hover:bg-destructive/20 active:scale-95"><Trash2 size={16} /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
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
                      <Button onClick={() => openExamReview(exam)} variant="primary" className="px-3 py-2 text-xs shadow-sm" title="من اجتاز ومن لم يجرّب" data-testid={`button-exam-review-${exam.id}`}>
                        <UsersRound size={14} /> من اجتاز
                      </Button>
                      <Button onClick={() => openExamDetail(exam)} variant="primary" className="px-4 py-2 text-xs shadow-sm">عرض التفاصيل <ArrowLeft size={14} /></Button>
                      <CopyLinkButton path={`/student/assessments/${exam.id}`} testId={`button-copy-exam-${exam.id}`} title="نسخ رابط الاختبار للطلاب" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-primary hover:bg-accent/40" />
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
                <div key={hw.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid={`row-hw-${hw.id}`}>
                  <div className="flex items-center gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><ClipboardCheck size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-bold text-primary">{hw.title}</p>
                        {(hw.submissionsCount || 0) > 0 ? (
                          <span className="rounded-full bg-accent/25 px-2.5 py-0.5 text-[11px] font-extrabold text-accent-foreground">{hw.submissionsCount} تسليمات</span>
                        ) : null}
                        {hw.section && hw.section !== 'الجميع' ? <span className="rounded-full bg-[#6a1b9a]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#6a1b9a]">{hw.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${hw.school ? 'bg-[#17413f]/12 text-[#17413f]' : 'bg-muted text-muted-foreground'}`} title={hw.school ? 'هذا الواجب لطلاب هذه المدرسة فقط' : 'يظهر لكل مدارس هذا الصف'}>
                          <Landmark size={11} /> {hw.school || 'كل المدارس'}
                        </span>
                        {!hw.published ? <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">مسودة</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{hw.unit || 'عام'} {hw.dueDate ? `· حتى ${hw.dueDate}` : ''} · {hw.points} نقاط{Array.isArray(hw.images) && hw.images.length ? ` · ${hw.images.length}📷` : ''}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    <Button onClick={() => openHwReview(hw)} variant="primary" className="px-4 py-2 text-xs" data-testid={`button-hw-review-${hw.id}`}>
                      <Eye size={14} /> مراجعة التسليمات ({hw.submissionsCount || 0})
                    </Button>
                    <span className="mr-auto flex items-center gap-1">
                      <Button onClick={() => openHwEdit(hw)} variant="soft" className="px-3 py-2 text-xs"><Pencil size={14} /></Button>
                      <CopyLinkButton path={`/student/assignments/${hw.id}`} testId={`button-copy-hw-${hw.id}`} title="نسخ رابط الواجب للطلاب" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-primary hover:bg-accent/40" />
                      <Button onClick={() => deleteHw(hw)} variant="ghost" className="px-2 text-destructive"><Trash2 size={16} /></Button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'notes' && (
        <>
          {/* مفتاح النطاق: هل أرى إعلانات هذا الصف أم كل الإعلانات؟
              بدونه كانت إعلانات الصف التاسع تظهر فوق تبويب الصف الثامن. */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
            <div className="flex gap-1.5 rounded-xl bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => setNoteScope('grade')}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-extrabold transition-all ${noteScope === 'grade' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
                data-testid="button-note-scope-grade"
              >
                <GraduationCap size={14} /> {grade} فقط
              </button>
              <button
                type="button"
                onClick={() => setNoteScope('all')}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-extrabold transition-all ${noteScope === 'all' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
                data-testid="button-note-scope-all"
              >
                <LayoutGrid size={14} /> كل الإعلانات
              </button>
            </div>
            <p className="min-w-0 flex-1 text-xs font-semibold leading-relaxed text-muted-foreground">
              {noteScope === 'grade'
                ? `تعرض إعلانات ${grade} والإعلانات العامة فقط.`
                : `تعرض كل الإعلانات بلا استثناء — بما فيها إعلانات صفوف ومدارس أخرى.`}
            </p>
            {/* عدّاد مفصّل: منشور / مسودة / معروض — يمنع ظنّ الإعلان المختفي */}
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-green-600/12 px-2.5 py-1.5 text-[11px] font-extrabold tabular-nums text-green-800">
                {notes.filter((n: any) => n.published).length} منشور
              </span>
              {notes.some((n: any) => !n.published) ? (
                <span className="rounded-full bg-amber-500/18 px-2.5 py-1.5 text-[11px] font-extrabold tabular-nums text-amber-800">
                  {notes.filter((n: any) => !n.published).length} مسودة
                </span>
              ) : null}
              <span className="rounded-full bg-primary/10 px-2.5 py-1.5 text-[11px] font-extrabold tabular-nums text-primary">
                معروض {shownNotes.length}
              </span>
            </span>
          </div>

          {loadingNotes ? <StateNotice type="loading" /> : !shownNotes.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="font-semibold">
                {noteScope === 'grade' && notes.length ? `لا توجد إعلانات لـ ${grade}` : 'لا توجد إعلانات منشورة بعد'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {noteScope === 'grade' && notes.length
                  ? `يوجد ${notes.length} إعلاناً لكنّه لصفوف أو مدارس أخرى — بدّل إلى «كل الإعلانات» لتظهر.`
                  : 'انشر أول إعلان لطلابك — يمكن توجيهه لصف معين أو للجميع.'}
              </p>
              {noteScope === 'grade' && notes.length ? (
                <Button onClick={() => setNoteScope('all')} variant="soft" className="mt-4"><LayoutGrid size={16} /> عرض كل الإعلانات ({notes.length})</Button>
              ) : (
                <Button onClick={openNoteCreate} variant="soft" className="mt-4"><Plus size={16} /> نشر أول إعلان</Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {shownNotes.map((note) => {
                const ng = foldName(note.grade || 'الجميع');
                const g = foldName(grade);
                const isOtherGrade = ng && ng !== 'الجميع' && ng !== g;
                return (
                <div
                  key={note.id}
                  className={`group relative overflow-hidden rounded-[1.35rem] border bg-card p-4 shadow-sm transition-all duration-300 hover:shadow-md ${note.published ? 'border-border' : 'border-dashed border-muted-foreground/30 opacity-80'} ${isOtherGrade ? 'border-r-4 border-r-[#6a1b9a]/50' : ''}`}
                  data-testid={`row-note-${note.id}`}
                >
                  {/* شريط جانبي ملوّن حسب نوع الإعلان */}
                  <span className={`absolute inset-y-0 right-0 w-1 ${note.type === 'اختبار تقييمي' ? 'bg-[#0d47a1]' : note.type === 'تهنئة' ? 'bg-pink-500' : 'bg-accent'}`} />
                  <div className="flex items-start gap-3.5 pr-1.5">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${note.type === 'اختبار تقييمي' ? 'bg-[#0d47a1]/10 text-[#0d47a1]' : 'bg-accent/20 text-accent-foreground'}`}>
                      <Bell size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-bold text-primary">{note.title}</p>
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{note.type}</span>
                        {/* الصف والمدرسة: قلب الفهم — هنا يُرى لمن went الإعلان فعلاً */}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${note.grade && note.grade !== 'الجميع' ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          <GraduationCap size={11} /> {note.grade || 'الجميع'}
                        </span>
                        {note.school ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#6a1b9a]/12 px-2.5 py-0.5 text-[11px] font-extrabold text-[#6a1b9a]">
                            <Landmark size={11} /> {note.school}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">كل المدارس</span>
                        )}
                        {note.section && note.section !== 'الجميع' ? <span className="rounded-full bg-[#6a1b9a]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#6a1b9a]">{note.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}</span> : null}
                        {!note.published ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800 ring-1 ring-amber-500/40">
                            <EyeOff size={11} /> مسودة — لا يراها الطالب
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{note.body}</p>
                      <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">{note.date} · {note.audience}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => editNote(note)} title="تعديل الإعلان" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" data-testid={`button-edit-note-${note.id}`}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => toggleNotePublish(note)} title={note.published ? 'سحب النشر' : 'نشر'} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary">{note.published ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                      <button type="button" onClick={() => deleteNote(note)} title="حذف الإعلان" className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={15} /></button>
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </>
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
                    <span className="rounded-lg bg-accent px-2 py-0.5 text-[#3a2c07]">{unitForm.status === 'empty' ? 'قريباً' : (unitForm.isLocked || unitForm.status === 'locked' || unitForm.status === 'hidden') ? 'مقفلة 🔒' : 'مفتوحة ✓'}</span>
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
              <SchoolTargetField grade={grade} value={unitForm.school || ''} onChange={(v) => setUnitForm({ ...unitForm, school: v })} />
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
                    {(lessonForm.htmlContent || lessonForm.htmlFileUrl) ? <span className="rounded-lg bg-black/30 px-2 py-0.5 backdrop-blur-sm">{lessonForm.htmlFileUrl && isSourceBundleUrl(lessonForm.htmlFileUrl) ? '⚛️ كود مبني' : lessonForm.htmlFileUrl && isBundleUrl(lessonForm.htmlFileUrl) ? '📦 موقع مضغوط' : 'تفاعلي HTML'}</span> : null}
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
                    <div className="flex flex-wrap items-center gap-2">
                      {/* زر رفع مستند: PDF / بوربوينت / وورد */}
                      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#c62828] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-110 ${uploadingHtml ? 'opacity-60 pointer-events-none' : ''}`} title="ارفع مستنداً (PDF أو بوربوينت PPTX أو وورد DOCX/DOC) ليُعرض مباشرة داخل الدرس">
                        {uploadingHtml ? <RefreshCw size={13} className="animate-spin" /> : <FileText size={13} />} ارفع مستند (PDF / بوربوينت / وورد)
                        <input type="file" accept=".pdf,.pptx,.ppt,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" className="hidden" onChange={(e) => {
                          const f = e.target.files?.[0];
                          const target = e.target;
                          if (!f || uploadingHtml) return;
                          setUploadingHtml(true);
                          uploadFileToCloud(f, '/ard-al-lughah/documents')
                            .then((res) => {
                              if (res?.url) {
                                setLessonForm((lf: any) => ({ ...lf, htmlFileUrl: res.url, htmlContent: '' }));
                                setBundleInfo(null);
                                setShowHtmlPreview(true);
                                flash(`تم رفع المستند «${f.name}» سحابياً بنجاح ✓ — المعاينة ظهرت بالأسفل`);
                              }
                            })
                            .catch((err: Error) => flash(err?.message || 'تعذر رفع المستند'))
                            .finally(() => { setUploadingHtml(false); target.value = ''; });
                        }} />
                      </label>
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
                              return uploadFileToCloud(txt, '/ard-al-lughah/html').then((res) => ({ res, kb: htmlKb(text) }));
                            })
                            .then(({ res, kb }) => {
                              if (res?.url) {
                                setLessonForm((lf: any) => ({ ...lf, htmlFileUrl: res.url, htmlContent: '' }));
                                setBundleInfo(null);
                                setShowHtmlPreview(true);
                                flash(`تم رفع ملف HTML (${kb} ك.ب) سحابياً ✓ — المعاينة ظهرت بالأسفل، تأكد أن التصميم يعمل قبل الحفظ${kb > 600 ? ' — ملاحظة: ملف كبير قد يكون بطيئاً على الأجهزة الضعيفة' : ''}`);
                              }
                            })
                            .catch((err: Error) => flash(err?.message || 'تعذر رفع ملف HTML'))
                            .finally(() => { setUploadingHtml(false); target.value = ''; });
                        }} />
                      </label>
                      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-l from-[#6a1b9a] to-[#8a508f] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-110 ${uploadingBundle !== false || uploadingHtml ? 'opacity-60' : ''}`} title="ارفع موقعاً كاملاً — الأفضل TAR (أو TAR.GZ لحجم أصغر): html + css + js + json + صور — يُرفع مباشرة إلى التخزين حتى 100MB. وZIP مدعوم أيضاً.">
                        {uploadingBundle !== false ? <RefreshCw size={13} className="animate-spin" /> : <Package size={13} />} {uploadingBundle !== false ? (bundleStage || `جارٍ الرفع المباشر ${uploadingBundle}%...`) : '📦 ارفع موقعاً (TAR مفضّل)'}
                        <input type="file" accept=".tar,.tar.gz,.tgz,.zip,application/x-tar,application/zip" className="hidden" data-testid="input-lesson-bundle" onChange={(e) => {
                          const f = e.target.files?.[0];
                          const target = e.target;
                          if (!f || uploadingBundle !== false || uploadingHtml) return;
                          if (!isArchiveFileName(f.name)) {
                            flash('اختر ملفاً بصيغة TAR أو TAR.GZ (الأفضل) أو ZIP — وملف HTML المفرد له زرّه الخاص');
                            target.value = '';
                            return;
                          }
                          (async () => {
                            setUploadingBundle(0);
                            setUploadDiag(null);
                            let stage = 'فك الضغط وفحص الأرشيف';
                            const setStage = (s: string) => { stage = s; setBundleStage(s); };
                            setStage('فك الضغط وفحص الأرشيف');
                            const prevUrl: string = lessonForm.htmlFileUrl || '';
                            const dropOld = async (newUrl: string) => {
                              // استبدال النسخة القديمة بدل تكديس النسخ + حذف اليتيم من التخزين
                              if (prevUrl && prevUrl !== newUrl && (isBundleUrl(prevUrl) || isSourceBundleUrl(prevUrl))) {
                                setStage('حذف النسخة القديمة من التخزين');
                                await deleteStoredUrl(prevUrl);
                              }
                            };
                            try {
                              const buf = await f.arrayBuffer();
                              const raw = await extractRawArchive(buf, f.name);
                              const prep = classifyAndPrepare(raw.files, raw.warnings);
                              if (prep.kind === 'site') {
                                // ——— موقع جاهز (index.html + assets): يُرفع كما هو ———
                                const entry = findSiteEntry(prep.files);
                                setBundleInfo({
                                  mode: 'site', name: f.name, sizeKB: Math.round(f.size / 1024),
                                  files: prep.files.size, entry, warnings: prep.warnings, ignored: prep.ignored,
                                });
                                setStage('رفع الموقع الجاهز مباشرة');
                                const res = await uploadBundleDirect(f, '/ard-al-lughah/bundles', (p) => setUploadingBundle(p), (file) => uploadFileToCloud(file, '/ard-al-lughah/bundles'));
                                await dropOld(res.url);
                                setLessonForm((lf: any) => ({ ...lf, htmlFileUrl: res.url, htmlContent: '' }));
                                setUploadDiag(null);
                                setShowHtmlPreview(true);
                                flash(`تم رفع الموقع الجاهز ✓ (${prep.files.size} ملفات · الدخول: ${entry}) — المعاينة بالأسفل، تأكد أن الموقع يعمل كاملاً قبل الحفظ${prep.warnings.length ? ' — ⚠ ' + prep.warnings.slice(0, 2).join(' — ') : ''}${res.viaFallback ? ' — (رُفع بالمسار البديل لأن المباشر متعطل: أضف IMAGEKIT_*_PUBLIC_KEY في .env للملفات الكبيرة)' : ''}`);
                              } else {
                                // ——— كود مصدري React/TS: بناء كامل داخل المتصفح ———
                                setBundleInfo({
                                  mode: 'source', name: f.name, sizeKB: Math.round(f.size / 1024),
                                  files: prep.files.size, entry: prep.entry, warnings: prep.warnings, ignored: prep.ignored,
                                });
                                setStage('تحميل محرك البناء (أول مرة فقط)');
                                await ensureSourceEngine({ wasmURL: ESBUILD_WASM_CDN }, { worker: true });
                                setStage('بناء المشروع داخل المتصفح');
                                const built = await buildSourceBundle(prep, (m) => setStage(m));
                                setStage('ضغط الناتج وفحص الحجم');
                                const packed = await packSourceContainer(built);
                                const gzKB = Math.round(packed.bytes.length / 1024);
                                // نفس المحتوى محفوظ مسبقاً؟ قارن البصمة مع النسخة القديمة بدل إعادة الرفع
                                if (isSourceBundleUrl(prevUrl)) {
                                  try {
                                    const oldBuf = await (await fetch(prevUrl)).arrayBuffer();
                                    const old = await unpackSourceContainer(new Uint8Array(oldBuf));
                                    if (old.hash === packed.hash) {
                                      setBundleInfo((b: any) => ({ ...b, gzKB, hash: packed.hash.slice(0, 12), skipped: true }));
                                      flash('المحتوى مطابق للمحفوظ تماماً (نفس البصمة) — لم يُرفع شيء ✓');
                                      return;
                                    }
                                  } catch { /* تعذّرت المقارنة — تابع الرفع */ }
                                }
                                setBundleInfo((b: any) => ({
                                  ...b, mode: 'source',
                                  jsKB: Math.round(packed.container.sizes.js / 1024),
                                  cssKB: Math.round(packed.container.sizes.css / 1024),
                                  gzKB, hash: packed.hash.slice(0, 12),
                                  buildWarnings: built.warnings,
                                }));
                                setStage(`رفع الحاوية المضغوطة (${gzKB}KB)`);
                                const up = await uploadSourceContainer(packed.bytes, f.name, (p) => setUploadingBundle(p), (file) => uploadFileToCloud(file, '/ard-al-lughah/bundles'));
                                await dropOld(up.url);
                                setLessonForm((lf: any) => ({ ...lf, htmlFileUrl: up.url, htmlContent: '' }));
                                setUploadDiag(null);
                                setShowHtmlPreview(true);
                                flash(`تم بناء المشروع ورفعه ✓ — الأرشيف ${Math.round(f.size / 1024)}KB ← المخزَّن ${gzKB}KB فقط (توفير ${Math.max(0, Math.round((1 - packed.bytes.length / Math.max(f.size, 1)) * 100))}%) — المعاينة بالأسفل قبل الحفظ${built.warnings.length ? ' — ⚠ ' + built.warnings.slice(0, 2).join(' — ') : ''}${up.viaFallback ? ' — (رُفع بالمسار البديل: أضف IMAGEKIT_*_PUBLIC_KEY في .env)' : ''}`);
                              }
                            } catch (err: any) {
                              const diag = buildUploadDiag(err, stage, f);
                              setUploadDiag(diag);
                              flash(`${err?.message || 'تعذر رفع الموقع المضغوط'} (كود: ${diag.code} — انسخ تقرير التشخيص بالأسفل والصقه للمطور)`);
                            } finally {
                              setUploadingBundle(false);
                              setBundleStage('');
                              target.value = '';
                            }
                          })();
                        }} />
                      </label>
                      {(lessonForm.htmlContent || lessonForm.htmlFileUrl) ? (
                        <button type="button" onClick={() => setShowHtmlPreview((v) => !v)} className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-primary">{showHtmlPreview ? 'إخفاء المعاينة' : 'معاينة'}</button>
                      ) : null}
                    </div>
                  </div>
                  {bundleInfo && !bundleInfo.existing ? (
                    <div className="mt-3 rounded-xl border border-[#6a1b9a]/30 bg-[#6a1b9a]/5 px-4 py-3 text-[11px] font-bold leading-6 text-primary">
                      {bundleInfo.mode === 'source' ? '⚛️ كود مصدري (يُبنى داخل المتصفح)' : '📦 موقع جاهز'} <span dir="ltr" className="font-mono">{bundleInfo.name}</span> · {bundleInfo.sizeKB} ك.ب · {bundleInfo.files} ملفات · الدخول: <span dir="ltr" className="font-mono">{bundleInfo.entry}</span>
                      {bundleInfo.gzKB != null ? <span className="mt-1 block text-green-800">✓ المخزَّن بعد البناء والضغط: {bundleInfo.gzKB}KB فقط (JS: {bundleInfo.jsKB}KB + CSS: {bundleInfo.cssKB}KB) · البصمة: <span dir="ltr" className="font-mono">{bundleInfo.hash}</span></span> : null}
                      {bundleInfo.skipped ? <span className="mt-1 block text-green-800">✓ مطابق للمحفوظ — لم يُرفع شيء</span> : null}
                      {(() => {
                        const all = [...new Set([...(bundleInfo.buildWarnings || []), ...(bundleInfo.warnings || [])])].slice(0, 3);
                        return all.length ? <span className="mt-1 block font-bold text-amber-800">⚠ {all.join(' — ')}</span> : null;
                      })()}
                      {(bundleInfo.ignored?.length || 0) > 0 ? <span className="mt-1 block font-normal text-muted-foreground">تُجاهل أثناء الفحص ({bundleInfo.ignored.length}): <span dir="ltr" className="font-mono">{bundleInfo.ignored.slice(0, 3).join('، ')}</span>{bundleInfo.ignored.length > 3 ? '…' : ''}</span> : null}
                    </div>
                  ) : null}
                  {uploadDiag ? (
                    <div className="mt-3 rounded-xl border-2 border-dashed border-destructive/50 bg-destructive/5 px-4 py-3" data-testid="upload-diag-panel">
                      <p className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-extrabold text-destructive">
                        <span>🔍 فشل الرفع — كود التشخيص: <span dir="ltr" className="rounded-lg bg-destructive px-2 py-0.5 font-mono text-white">{uploadDiag.code}</span></span>
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const txt = formatUploadDiag(uploadDiag);
                              if (navigator.clipboard?.writeText) {
                                navigator.clipboard.writeText(txt).then(
                                  () => flash('تم نسخ تقرير التشخيص ✓ — الصقه للمطور'),
                                  () => flash('تعذّر النسخ التلقائي — انسخ النص من الصندوق يدوياً'),
                                );
                              } else {
                                flash('انسخ النص من الصندوق يدوياً');
                              }
                            }}
                            className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground shadow-sm hover:brightness-110"
                            data-testid="button-copy-diag"
                          >
                            📋 نسخ التقرير
                          </button>
                          <button type="button" onClick={() => setUploadDiag(null)} className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted" title="إخفاء">✕</button>
                        </span>
                      </p>
                      <pre dir="auto" className="mt-2 max-h-40 select-all overflow-auto whitespace-pre-wrap rounded-lg bg-background/80 p-3 font-mono text-[11px] leading-6 text-primary">{formatUploadDiag(uploadDiag)}</pre>
                      <p className="mt-1.5 text-[11px] font-bold text-muted-foreground">انسخ التقرير بالزر والصقه للمطور — الكود يحدد مكان الخلل بالضبط.</p>
                    </div>
                  ) : null}
                  {(lessonForm.htmlFileUrl && (isBundleUrl(lessonForm.htmlFileUrl) || isSourceBundleUrl(lessonForm.htmlFileUrl))) ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input value={lessonForm.htmlFileUrl || ''} readOnly dir="ltr" className={`${inputCls} font-mono text-xs opacity-80`} data-testid="input-lesson-html-url" title="رابط الحزمة المخزنة — يُملأ تلقائياً عند الرفع" />
                      <button type="button" onClick={() => { setLessonForm({ ...lessonForm, htmlFileUrl: '' }); setBundleInfo(null); }} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/10" title="إزالة الموقع المضغوط">إزالة</button>
                    </div>
                  ) : null}
                  {(() => {
                    const m = resolveLessonHtml(lessonForm);
                    if (m.mode === 'bundle' || m.mode === 'source') {
                      return (
                        <div className="mt-2 rounded-xl border border-[#6a1b9a]/30 bg-[#6a1b9a]/5 px-4 py-3 text-[11px] font-bold leading-6 text-primary">
                          <p>
                            {m.mode === 'source' ? '⚛️ هذا الدرس يستخدم كوداً مبنياً — مربع اللصق معطّل لمنع التعارض.' : '📦 هذا الدرس يستخدم موقعاً مضغوطاً — مربع اللصق معطّل لمنع التعارض.'}
                            <span className="mt-0.5 block font-normal text-muted-foreground">للعودة إلى اللصق اليدوي: اضغط «إزالة» بجانب رابط الحزمة أعلاه.</span>
                          </p>
                          {(lessonForm.htmlContent || '').length > 0 ? (
                            <button
                              type="button"
                              disabled={repairing}
                              onClick={async () => {
                                if (!lessonModal || lessonModal.mode !== 'edit') return;
                                setRepairing(true);
                                try {
                                  await jsonFetch(`/api/teacher/curriculum/lessons/${lessonModal.lesson.id}`, {
                                    method: 'PATCH',
                                    body: { htmlContent: '', htmlFileUrl: m.url },
                                  });
                                  setLessonForm((lf: any) => ({ ...lf, htmlContent: '' }));
                                  loadLessons();
                                  flash('تم تنظيف الحقل الملوث من قاعدة البيانات ✓');
                                } catch (e: any) {
                                  flash(e?.message || 'تعذر التنظيف');
                                } finally {
                                  setRepairing(false);
                                }
                              }}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
                              data-testid="button-repair-html"
                            >
                              {repairing ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={12} />} تنظيف الحقل الملوث في القاعدة ({htmlKb(lessonForm.htmlContent)} ك.ب)
                            </button>
                          ) : null}
                        </div>
                      );
                    }
                    return (
                      <>
                        <textarea value={lessonForm.htmlContent || ''} onChange={(e) => setLessonForm({ ...lessonForm, htmlContent: e.target.value })} rows={3} dir="ltr" placeholder="<h1>... كود HTML مضمّن (اختياري — يُحفظ كنص) ..." className={`${inputCls} font-mono text-xs`} />
                        {(lessonForm.htmlContent || '').length > 0 ? (
                          <p className={`mt-2 text-[11px] font-bold leading-5 ${(lessonForm.htmlContent || '').length * 2 / 1024 > 250 ? 'text-amber-800' : 'text-muted-foreground'}`}>
                            حجم الكود الملصق: {htmlKb(lessonForm.htmlContent)} ك.ب
                            {(lessonForm.htmlContent || '').length * 2 / 1024 > 250 ? ' — كبير نسبياً: الأفضل رفعه كملف بزر «ارفع ملف HTML» بدل اللصق.' : ''}
                          </p>
                        ) : null}
                      </>
                    );
                  })()}
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    ملف HTML مفرد يُرمَّز ويُرفع كنص مشفّر — يعمل دائماً بلا 403 وبلا أي استهلاك من Supabase.
                    <span className="mt-1 block rounded-lg bg-[#6a1b9a]/5 px-2.5 py-1.5 font-bold text-primary">
                      📦 الموقع المضغوط — <b>الأفضل TAR</b> (أو TAR.GZ لحجم أصغر): اضغط مجلد موقعك (وفي جذره index.html مع css/js/json/الصور) وارفعه — يُفحص على جهازك أولاً ثم يُرفع مباشرة حتى 100MB. طريقة سريعة على ويندوز: افتح التيرمنال في مجلد الموقع ونفّذ <span dir="ltr" className="font-mono">tar -cf site.tar .</span> — وZIP يعمل أيضاً لكن TAR أضمن.
                      <span className="mt-1 block">⚛️ الكود المصدري (React/TypeScript): ارفع TAR أو ZIP المشروع نفسه (package.json + src) وسيُبنى تلقائياً داخل المتصفح — يُخزَّن الناتج المضغوط فقط (حد 1MB)، والمكتبات تُجلب من CDN وقت العرض فلا تستهلك مساحتك.</span>
                    </span>
                  </p>
                  {!(lessonForm.htmlFileUrl && (isBundleUrl(lessonForm.htmlFileUrl) || isSourceBundleUrl(lessonForm.htmlFileUrl))) ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input value={lessonForm.htmlFileUrl || ''} onChange={(e) => setLessonForm({ ...lessonForm, htmlFileUrl: e.target.value })} placeholder="رابط خارجي فقط (مثال: Google Sites) — اتركه فارغاً للمحتوى الداخلي" dir="ltr" className={`${inputCls} font-mono text-xs`} data-testid="input-lesson-html-url" />
                  </div>
                  ) : null}
                  {showHtmlPreview && (lessonForm.htmlContent || lessonForm.htmlFileUrl) ? <HtmlPreviewFrame content={lessonForm.htmlContent} fileUrl={lessonForm.htmlFileUrl} /> : null}
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
                  <label className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary">عدد الأسئلة:
                    <input type="number" min={1} max={40} value={aiCount} onChange={(e) => setAiCount(Math.min(Math.max(Number(e.target.value) || 1, 1), 40))} className="w-14 rounded-md border border-input bg-background px-1.5 py-1 text-center text-xs font-extrabold outline-none" data-testid="input-ai-count" />
                    <span className="font-normal text-muted-foreground">(1-40)</span>
                  </label>
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
                    <RefreshCw size={16} className="animate-spin" /> يكتب الذكاء الاصطناعي أسئلتك... الأعداد الكبيرة تُولَّد على دفعات وقد تستغرق حتى دقيقة — لا تغلق النافذة.
                  </div>
                ) : null}
                {aiMsg ? <p className={`rounded-xl px-4 py-2.5 text-xs font-bold ${aiOk ? 'bg-green-500/15 text-green-800' : 'bg-destructive/10 text-destructive'}`}>{aiMsg}</p> : null}
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
              <SchoolTargetField grade={grade} value={examForm.school || ''} onChange={(v) => setExamForm({ ...examForm, school: v })} />
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

      {/* ---------- مراجعة الاختبار: من اجتاز + من لم يجرّب + خصم جماعي ---------- */}
      {examReview && (
        <ExamReviewModal
          exam={examReview}
          attempts={examAttempts}
          onClose={() => setExamReview(null)}
          onReload={() => examReview && openExamReview(examReview)}
        />
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
                <div className="rounded-2xl border border-dashed border-border p-4">
                  <p className="mb-3 text-sm font-semibold">صور الواجب التوضيحية ({hwImages.length}) — تظهر للطالب مع التعليمات</p>
                  {hwImages.length ? (
                    <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {hwImages.map((src, i) => (
                        <div key={i} className="group relative overflow-hidden rounded-xl border border-border">
                          <img src={src} alt={`صورة ${i + 1}`} className="h-20 w-full object-cover" />
                          <button type="button" onClick={() => setHwImages((imgs) => imgs.filter((_, x) => x !== i))} className="absolute left-1 top-1 rounded-lg bg-black/60 p-1 text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"><X size={13} /></button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {hwImagesErr ? <p className="mb-2 text-xs font-bold text-destructive">{hwImagesErr}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={hwNewImageUrl} onChange={(e) => setHwNewImageUrl(e.target.value)} placeholder="الصق رابط صورة ثم اضغط إضافة" dir="ltr" className={`${inputCls} font-mono text-xs`} />
                    <Button type="button" onClick={() => { if (hwNewImageUrl.trim()) { setHwImages((imgs) => [...imgs, hwNewImageUrl.trim()]); setHwNewImageUrl(''); } }} variant="soft" className="px-3 py-2 text-xs"><Plus size={14} /> إضافة الرابط</Button>
                    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary hover:bg-accent/40 ${uploadingHw ? 'opacity-60' : ''}`}>
                      {uploadingHw ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} {uploadingHw ? 'جارٍ الرفع...' : 'رفع من الجهاز'}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        const target = e.target;
                        if (!f || uploadingHw) return;
                        setHwImagesErr('');
                        setUploadingHw(true);
                        uploadFileToCloud(f, '/ard-al-lughah/assignments')
                          .then((res) => { if (res?.url) setHwImages((imgs) => [...imgs, res.url]); })
                          .catch((err: any) => setHwImagesErr(err?.message || 'تعذر رفع الصورة'))
                          .finally(() => { setUploadingHw(false); target.value = ''; });
                      }} />
                    </label>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field2 label="الوحدة المرتبطة (يظهر الواجب تحتها كتكليف مطلوب)">
                    <select
                      value={hwForm.courseId || ''}
                      onChange={(e) => {
                        const c = courses.find((x: any) => x.id === e.target.value);
                        setHwForm({ ...hwForm, courseId: e.target.value, lessonId: '', unit: c ? c.title : '' });
                      }}
                      className={inputCls}
                      data-testid="select-hw-unit"
                    >
                      <option value="">عام — بلا وحدة محددة</option>
                      {courses.map((c: any) => <option key={c.id} value={c.id}>الوحدة {c.sort_order}: {c.title}</option>)}
                    </select>
                  </Field2>
                  <Field2 label="الدرس المستهدف (اختياري — يظهر الواجب تحت هذا الدرس بسهم)">
                    <select
                      value={hwForm.lessonId || ''}
                      onChange={(e) => setHwForm({ ...hwForm, lessonId: e.target.value })}
                      className={inputCls}
                      disabled={!hwForm.courseId}
                      data-testid="select-hw-lesson"
                    >
                      <option value="">{hwForm.courseId ? 'كل دروس الوحدة' : 'اختر الوحدة أولاً'}</option>
                      {hwLessons.map((l: any) => <option key={l.id} value={l.id}>{l.position}. {l.title}</option>)}
                    </select>
                  </Field2>
                  <Field2 label="آخر موعد"><input type="date" value={hwForm.dueDate || ''} onChange={(e) => setHwForm({ ...hwForm, dueDate: e.target.value })} className={inputCls} /></Field2>
                  <Field2 label="النقاط"><input type="number" min={1} value={hwForm.points || 20} onChange={(e) => setHwForm({ ...hwForm, points: Number(e.target.value) })} className={inputCls} /></Field2>
                </div>
              </div>
              <div className="space-y-4 rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-card p-5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-primary"><Settings size={16} /> النشر والاستهداف</p>
                {gradeSplit ? <SectionField value={hwForm.section || 'الجميع'} onChange={(v) => setHwForm({ ...hwForm, section: v })} /> : <p className="rounded-xl bg-secondary/50 px-4 py-2.5 text-xs text-muted-foreground">هذا الصف غير مقسّم — الواجب سيظهر للجميع.</p>}
              <SchoolTargetField grade={grade} value={hwForm.school || ''} onChange={(v) => setHwForm({ ...hwForm, school: v })} />
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

      {/* ---------- نافذة مراجعة تسليمات الواجب (حلول الطلاب + العلامات) ---------- */}
      {hwReview && (
        <HwReviewModal
          hw={hwReview}
          subs={hwSubs}
          grading={hwGrading}
          setGrading={setHwGrading}
          saveGrade={saveHwGrade}
          onClose={() => setHwReview(null)}
          onReload={() => openHwReview(hwReview)}
        />
      )}

      {/* ---------- نافذة نشر إعلان (عريضة + معاينة) ---------- */}
      {noteModal && (
        <Modal
          title={noteForm.id ? 'تعديل الإعلان' : 'نشر إعلان جديد'}
          eyebrow={noteForm.id ? 'تعديل الاستهداف والنص' : 'رسائل المعلم للطلاب'}
          onClose={() => setNoteModal(false)}
          maxWidth="max-w-4xl"
        >
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
                <SchoolTargetField grade={noteForm.targetGrade || 'الجميع'} value={noteForm.targetSchool || noteForm.school || ''} onChange={(v) => setNoteForm({ ...noteForm, targetSchool: v, school: v })} />
                {/* خلاصة الاستهداف: الصف والمدرسة معاً — يمنع الالتباس */}
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/6 px-4 py-3 text-xs leading-6 text-primary">
                  <HelpCircle size={15} className="mt-0.5 shrink-0 text-primary/70" />
                  <span>
                    <strong className="font-extrabold">سيصل الإعلان إلى:</strong>{' '}
                    {noteForm.targetGrade && noteForm.targetGrade !== 'الجميع' ? noteForm.targetGrade : 'كل الصفوف'}
                    {' · '}
                    {(noteForm.targetSchool || noteForm.school) ? noteForm.targetSchool || noteForm.school : 'كل المدارس'}
                    {noteForm.section && noteForm.section !== 'الجميع' && splitMap[noteForm.targetGrade] ? ` · ${noteForm.section === 'طالب' ? 'الطلاب فقط' : 'الطالبات فقط'}` : ''}
                    {' — لا يظهر لغير ذلك إطلاقاً.'}
                  </span>
                </div>
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
              <Button onClick={() => setNoteModal(false)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={savingNote} variant="primary" className="px-8 py-3 shadow-md" data-testid="button-save-note">
                {savingNote ? 'جارٍ الحفظ...' : noteForm.id ? 'حفظ التعديل ✓' : 'نشر الإعلان ✓'}
              </Button>
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
    if (dashId) {
      jsonFetch(`/api/curriculum/notebooks?grade=${encodeURIComponent(dashGrade)}&student_id=${dashId}`)
        // العدّاد للمعلّق فقط: بند انتهت مهلته لا يُحسب على الطالب
        .then((d) => { if (Array.isArray(d)) setNbPending(d.filter((t: any) => !t.myStatus && !itemExpired(t)).length); })
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
        body="خطوة جادة اليوم تصنع تفوقك — وحداتك ودفترك وواجباتك واختباراتك كلها في مكان واحد."
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
            <QuickTile icon={NotebookPen} title="دفتري" body="صوّر دفترك وسلّمه للأستاذ" href="/student/notebook" badge={nbPending ? `${nbPending} بانتظارك` : 'محدّث'} color="#b7791f" />
            <QuickTile icon={Target} title="اختباراتي" body="قياس فهمك أولاً بأول" href="/student/assessments" badge={`${(assessmentsQuery.data ?? []).filter((e: any) => !itemExpired(e)).length} اختبارات`} color="#0d47a1" />
            <QuickTile icon={ClipboardCheck} title="واجباتي" body="تكليفات الأستاذ المطلوبة منك" href="/student/assignments" badge="مطلوبة" color="#2f7772" />
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
  const identity = usePlatformIdentity();
  const meIdentity = useStaffIdentity();
  const greeting = staffDisplayName(meIdentity, identity);

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow="لوحة المتابعة الإدارية"
        title={`مرحباً بـ${greeting}`}
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
            <QuickTile icon={Library} title="المنهاج والوحدات" body="الوحدات والدروس والتحكم بظهورها للطلاب" href="/teacher/content" badge={`${d.stats.units} وحدات`} color="#17413f" />
            <QuickTile icon={Target} title="الاختبارات" body="بنك الاختبارات وباني الأسئلة" href="/teacher/exams" badge={`${d.stats.assessments} اختبارات`} color="#0d47a1" />
            <QuickTile icon={ClipboardCheck} title="الواجبات" body="تكليفات الصفوف ومواعيدها" href="/teacher/assignments" badge={`${d.stats.assignments} واجبات`} color="#2f7772" />
            <QuickTile icon={Bell} title="الإعلانات" body="رسائلك وتوجيهاتك للطلاب" href="/teacher/announcements" badge="نشر" color="#b7791f" />
            <QuickTile icon={NotebookPen} title="مهام الدفتر" body="اطلب تصوير الدفاتر وقيّمها" href="/teacher/notebooks" badge="جديد" color="#a85d3d" />
<QuickTile icon={Sprout}          title="إعداد التأسيس"   body="أقسام خاصة لمجموعة تختارها — دروس وصور وفيديو وتفاعلي" href="/teacher/foundation" badge="خاص" color="#2a7a72" />
            <QuickTile icon={UsersRound}     title="الطلاب"         body="السجل والنسب والمتابعة" href="/teacher/students" badge={`${d.stats.students} طلاب`} color="#5d4037" />
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
              <ActivityChart points={d.weeklyActivity ?? []} />
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
   مهام الدفتر — طالب ومعلم
========================================================================= */

function summaryTypeColor(type: string) {
  switch (type) {
    case 'خريطة ذهنية': return '#8a508f';
    case 'ورقة عمل': return '#0d47a1';
    case 'بطاقة مراجعة': return '#b7791f';
    default: return '#2e7d32';
  }
}


/* ═══════════════════════════════════════════════════════════════════════
   صفحة ملخصات الطالب — بطاقات التفوق وأوراق العمل والمستندات (PDF / بوربوينت / وورد)
═══════════════════════════════════════════════════════════════════════ */
function StudentSummariesPage() {
  const { grade: effectiveGrade, term, split, gender } = useStudentGradeTerm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('الكل');
  const [previewItem, setPreviewItem] = useState<any | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ grade: effectiveGrade, term });
    jsonFetch(`/api/curriculum/summaries?${params.toString()}`)
      .then((data) => {
        if (!live) return;
        setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => { if (live) setItems([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [effectiveGrade, term]);

  const types = ['الكل', ...SUMMARY_TYPES];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (typeFilter !== 'الكل' && it.summaryType !== typeFilter) return false;
      if (split && it.section && it.section !== 'الجميع') {
        const expected = gender === 'female' ? 'طالبة' : 'طالب';
        if (it.section !== expected) return false;
      }
      if (!needle) return true;
      return (
        String(it.title || '').toLowerCase().includes(needle) ||
        String(it.unitTitle || '').toLowerCase().includes(needle) ||
        String(it.description || '').toLowerCase().includes(needle)
      );
    });
  }, [items, q, typeFilter, split, gender]);

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow={`${effectiveGrade} · ${term}`}
        title="الملخصات وأوراق العمل"
        body="خرائط ذهنية، بطاقات تفوق، مراجعات شاملة، وأوراق عمل بصيغ PDF وبوربوينت ووورد مع إمكانية القراءة المباشرة والتحميل."
        tone="emerald"
        action={
          <div className="flex items-center gap-2">
            <span className="rounded-2xl bg-white/10 px-4 py-2.5 text-xs font-extrabold text-white ring-1 ring-white/20">
              {filtered.length} مادة دراسية متاحة
            </span>
          </div>
        }
      />

      {/* البحث والفلترة */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالعنوان أو اسم الوحدة..."
            className="w-full rounded-2xl border-2 border-border bg-card pr-11 pl-4 py-3 text-sm font-semibold outline-none transition-colors focus:border-primary"
            data-testid="input-search-student-summaries"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`min-h-[44px] rounded-xl px-4 text-xs font-extrabold transition-all active:scale-95 ${typeFilter === t ? 'bg-primary text-primary-foreground shadow-sm' : 'border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-primary'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <StateNotice type="loading" />
      ) : !filtered.length ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary">
            <FileText size={32} />
          </span>
          <p className="font-display text-xl font-bold text-primary">لا توجد ملخصات بعد</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
            {q || typeFilter !== 'الكل' ? 'لا توجد نتائج تطابق بحثك — جرب كلمات أخرى.' : `سيضيف الأستاذ ملخصات وأوراق عمل ${effectiveGrade} قريباً.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {filtered.map((s) => {
            const hasDoc = !!s.fileUrl;
            const dtype = detectDocType(s.fileUrl);
            const dmeta = DOC_TYPE_META[dtype] || DOC_TYPE_META.unknown;
            return (
              <div key={s.id} className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/35 hover:shadow-lg">
                <div>
                  <div className="flex items-start gap-4">
                    {s.coverUrl ? (
                      <img src={s.coverUrl} alt="" className="h-24 w-20 shrink-0 rounded-2xl object-cover shadow-sm" />
                    ) : (
                      <span className="grid h-24 w-20 shrink-0 place-items-center rounded-2xl text-2xl text-white shadow-sm" style={{ background: summaryTypeColor(s.summaryType) }}>
                        {dmeta.icon}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-lg px-2.5 py-0.5 text-[11px] font-extrabold text-white" style={{ background: summaryTypeColor(s.summaryType) }}>
                          {s.summaryType}
                        </span>
                        {s.unitTitle ? (
                          <span className="rounded-lg bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                            {s.unitTitle}
                          </span>
                        ) : null}
                        {hasDoc ? (
                          <span className="rounded-lg px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: dmeta.color }}>
                            {dmeta.label}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-2 font-display text-base font-extrabold text-primary group-hover:text-primary">
                        {s.title}
                      </h3>
                      {s.description ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {s.description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {s.content ? (
                    <div className="mt-4 rounded-2xl border border-border bg-secondary/30 p-4 font-serif text-sm leading-7 text-primary/90">
                      {s.content}
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
                  {hasDoc ? (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(s)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform active:scale-95"
                      data-testid={`btn-view-summary-${s.id}`}
                    >
                      <Eye size={15} /> عرض المستند بالصفحة
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">ملخص نصي</span>
                  )}

                  {hasDoc ? (
                    <a
                      href={s.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      download={s.title}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-xs font-bold text-muted-foreground transition-colors hover:text-primary active:scale-95"
                      title="تحميل الملف"
                    >
                      <Download size={15} /> تحميل
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* نافذة عرض المستند المباشر للطالب */}
      {previewItem && (
        <Modal
          title={previewItem.title}
          eyebrow={`${previewItem.summaryType} · ${previewItem.unitTitle || effectiveGrade}`}
          onClose={() => setPreviewItem(null)}
          maxWidth="max-w-5xl"
        >
          <div className="space-y-4">
            {previewItem.description ? (
              <p className="text-sm font-semibold text-muted-foreground">{previewItem.description}</p>
            ) : null}
            {previewItem.fileUrl ? (
              <DocumentViewer url={previewItem.fileUrl} name={previewItem.title} />
            ) : null}
            {previewItem.content ? (
              <div className="rounded-2xl border border-border bg-secondary/30 p-4 font-serif text-sm leading-7 text-primary">
                {previewItem.content}
              </div>
            ) : null}
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function TeacherSummariesPage() {
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
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
    setForm({ title: '', summaryType: 'ملخص', unitTitle: '', description: '', content: '', coverUrl: '', fileUrl: '', sortOrder: items.length + 1, published: true, section: 'الجميع', school: '' });
    setModal({ mode: 'create' });
  };
  const openEdit = (item: any) => {
    setForm({ title: item.title, summaryType: item.summaryType, unitTitle: item.unitTitle, description: item.description, content: item.content, coverUrl: item.coverUrl, fileUrl: item.fileUrl, sortOrder: item.sortOrder, published: item.published, section: item.section || 'الجميع', school: item.school || '' });
    setModal({ mode: 'edit', item });
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, grade, term, section: gradeSplit ? (form.section || 'الجميع') : 'الجميع', school: form.school || '' };
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
                  {s.fileUrl ? (
                    <Button onClick={() => openEdit(s)} variant="soft" className="px-3 py-1.5 text-xs text-[#c62828]"><Eye size={13} /> عرض المرفق</Button>
                  ) : null}
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
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold">ملف المرفق (PDF · بوربوينت · وورد · صورة) {isCloudUrl(form.fileUrl) ? <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-800">سحابي ✓</span> : null}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary hover:bg-accent/40 ${uploadingFile ? 'opacity-60' : ''}`}>
                      {uploadingFile ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} {uploadingFile ? 'جارٍ الرفع...' : 'ارفع المرفق'}
                      <input type="file" accept=".pdf,.pptx,.ppt,.docx,.doc,image/*,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" className="hidden" onChange={(e) => {
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
                    {form.fileUrl ? <a href={form.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline">فتح المرفق ↗</a> : null}
                    {form.fileUrl ? <button type="button" onClick={() => setForm({ ...form, fileUrl: '' })} className="text-xs font-bold text-destructive hover:underline">إزالة</button> : null}
                  </div>
                  {form.fileUrl && detectDocType(form.fileUrl) !== 'unknown' ? (
                    <div className="mt-4">
                      <DocumentViewer url={form.fileUrl} />
                    </div>
                  ) : null}
                </div>
              </div>
              <Field2 label="الترتيب"><input type="number" min={1} value={form.sortOrder || 1} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className={inputCls} /></Field2>
              <label className="flex cursor-pointer items-end gap-2 pb-1 text-sm font-semibold"><input type="checkbox" checked={form.published !== false} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="accent-primary" /> منشور للطلاب</label>
              {gradeSplit ? <div className="sm:col-span-2"><SectionField value={form.section || 'الجميع'} onChange={(v) => setForm({ ...form, section: v })} /></div> : <p className="text-xs text-muted-foreground sm:col-span-2">هذا الصف غير مقسّم — الملخص سيظهر للجميع.</p>}
              <SchoolTargetField grade={grade} value={form.school || ''} onChange={(v) => setForm({ ...form, school: v })} />
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

/* =========================================================================
   إعلانات الأستاذ — صفحة الطالب الكاملة (كل ما ينشره الأستاذ)
========================================================================= */
function StudentAnnouncementsPage() {
  const { grade: effectiveGrade, school, term, split, gender, student } = useStudentGradeTerm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('الكل');

  const load = async () => {
    setLoading(true);
    try {
      // بلا معطيات: الخادم يحلّ الطالب من الجلسة ويفلتر بالصف والمدرسة
      const data = await jsonFetch('/api/curriculum/announcements');
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const types = ['الكل', ...([...new Set(items.map((a: any) => a.type).filter(Boolean))] as string[])];
  const shown = typeFilter === 'الكل' ? items : items.filter((a) => a.type === typeFilter);
  const typeColor = (t: string) =>
    t.includes('اختبار') ? 'bg-[#0d47a1]/10 text-[#0d47a1]'
    : t.includes('تكليف') || t.includes('واجب') ? 'bg-amber-500/15 text-amber-800'
    : t.includes('محتوى') || t.includes('جديد') ? 'bg-green-500/15 text-green-800'
    : 'bg-secondary text-primary';

  return (
    <Shell mode="student">
      <SectionHero
        eyebrow="رسائل الأستاذ إليك"
        title="الإعلانات والتوجيهات"
        body={`كل ما ينشره الأستاذ لصفك في ${effectiveGrade} — مواعيد، تذكيرات، ومحتوى جديد أولاً بأول.`}
        tone="light"
        stats={[
          { value: items.length, label: 'إعلانات' },
          { value: types.length - 1, label: 'تصنيفات' },
        ]}
      />
      <GradeTermBadge grade={effectiveGrade} term={term} split={split} gender={gender} school={school} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {types.map((t) => (
          <button key={t} type="button" onClick={() => setTypeFilter(t)} className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${typeFilter === t ? 'bg-primary text-primary-foreground shadow-md' : 'bg-secondary text-muted-foreground hover:text-primary'}`}>{t}</button>
        ))}
        <button type="button" onClick={load} className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-primary shadow-sm hover:shadow-md">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>
      {loading ? <StateNotice type="loading" /> : !shown.length ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><Bell size={24} /></span>
          <p className="font-display text-lg font-bold text-primary">لا إعلانات هنا بعد</p>
          <p className="mt-1 text-sm text-muted-foreground">عندما ينشر الأستاذ شيئاً سيصلك تنبيه بالجرس أعلى الصفحة.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((a: any, i: number) => (
            <div key={a.id} className="group relative overflow-hidden rounded-[1.8rem] border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }} data-testid={`card-announcement-${a.id}`}>
              <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-accent/15 blur-2xl" />
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${typeColor(a.type || '')}`}>{a.type || 'إعلان'}</span>
                <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-bold text-muted-foreground">{a.grade || effectiveGrade}</span>
                <span className="mr-auto text-[11px] font-bold text-muted-foreground">{a.date}</span>
              </div>
              <h3 className="mt-3 font-display text-lg font-bold leading-snug text-primary">{a.title}</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

function StudentNotebookPage() {
  const { grade: effectiveGrade, school, term, split, gender, student } = useStudentGradeTerm();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(true);
  const [mine, setMine] = useState<any | null>(null);
  const [deepOpened, setDeepOpened] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

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

  // فتح مهمة محددة من رابط الوحدة: /student/notebook?task=ID
  useEffect(() => {
    if (deepOpened || loading || !tasks.length || active) return;
    try {
      const tid = new URLSearchParams(window.location.search).get('task');
      if (tid) {
        const t = tasks.find((x: any) => x.id === tid);
        if (t) openTask(t);
      }
    } catch { /* تجاهل */ }
    setDeepOpened(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, loading]);

  const openTask = (task: any) => {
    setActive(task);
    setPhotos([]);
    setNote('');
    setMsg('');
    setNeedLogin(false);
    setMine(null);
    if (task.myStatus && student?.id) {
      jsonFetch(`/api/notebooks/${task.id}/mine?user_id=${student.id}`)
        .then((d) => { if (d) setMine(d); })
        .catch(() => undefined);
    }
  };

  const pickPhotos = (files: File[]) => {
    if (!files.length || uploading) return;
    setMsg(''); setMsgOk(true);
    setUploading(files.length);
    (async () => {
      for (const f of files) {
        try {
          const res = await uploadStudentPhoto(f);
          if (res?.url) setPhotos((p) => [...p, res.url]);
          else { setMsgOk(false); setMsg('تعذر رفع صورة — تحقق من الاتصال وحاول مجدداً'); }
        } catch (e: any) {
          setMsgOk(false);
          setMsg(e?.message || 'تعذر رفع الصورة — تحقق من الاتصال وحاول مجدداً');
        } finally {
          setUploading((n) => Math.max(n - 1, 0));
        }
      }
    })();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!active || !photos.length || !student?.id) return;
    // تحقّق فوري قبل أي رفع: لا نضيّع وقت الطالب إن كانت المهلة قد انتهت
    if (deadlineInfo(active.dueDate)?.passed) {
      setMsgOk(false);
      setMsg('انتهت مهلة تسليم الدفتر — التسليم مغلق');
      return;
    }
    setSubmitting(true);
    try {
      const res = await jsonFetch(`/api/notebooks/${active.id}/submit`, {
        method: 'POST',
        body: { userId: student.id, photos, note },
      });
      setMsgOk(true);
      setMsg(res.message || 'تم التسليم!');
      load();
      setTimeout(() => { setActive(null); setMsg(''); }, 2000);
    } catch (e: any) {
      setMsgOk(false);
      if ((e as any)?.status === 401) {
        // انتهت الجلسة أثناء التجهيز — بوابة دخول واضحة بدل رسالة مبهمة
        setNeedLogin(true);
        setMsg('');
      } else {
        setMsg(e?.message || 'تعذر التسليم');
      }
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
      <GradeTermBadge grade={effectiveGrade} term={term} split={split} gender={gender} school={school} />

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
                {(() => { const d = deadlineInfo(task.dueDate); return d ? <span className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 ${d.tone}`}>{d.passed ? <Lock size={12} /> : <Clock3 size={12} />} {d.label}</span> : null; })()}
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
                  <input type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => {
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
              {msg ? <p className={`rounded-xl px-4 py-2.5 text-center text-sm font-bold ${msgOk ? 'bg-accent/20 text-accent-foreground' : 'bg-destructive/10 text-destructive'}`}>{msg}</p> : null}
              {(() => { const d = deadlineInfo(active?.dueDate); return d?.passed ? <p className="flex items-center justify-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-center text-sm font-extrabold text-destructive"><Lock size={15} /> {d.label} — التسليم مغلق</p> : null; })()}
              {needLogin ? <LoginGate compact title="انتهت جلستك أثناء التجهيز" /> : null}
              <div className="flex items-center justify-end gap-3">
                <Button onClick={() => setActive(null)} variant="ghost">إغلاق</Button>
                <Button type="submit" disabled={submitting || !photos.length || !!deadlineInfo(active?.dueDate)?.passed} variant="primary" className="px-6 py-2.5" data-testid="button-submit-notebook">
                  {submitting ? 'جارٍ التسليم...' : deadlineInfo(active?.dueDate)?.passed ? (<><Lock size={15} /> انتهت المهلة — مغلق</>) : 'تسليم الدفتر للأستاذ'} <ArrowLeft size={16} />
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   حالة المهلة — نفس منطق السيرفر: ننتهي في آخر لحظة من يوم الموعد.
   ═══════════════════════════════════════════════════════════════════════ */
function deadlineInfo(due: string | undefined | null): { passed: boolean; label: string; tone: string; daysLeft: number } | null {
  const raw = String(due || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const end = new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59.999`);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.ceil((end.getTime() - startOfToday.getTime()) / 86400000);
  if (now.getTime() > end.getTime()) {
    return { passed: true, daysLeft, label: 'انتهت المهلة — التسليم مغلق', tone: 'bg-destructive/12 text-destructive border-destructive/25' };
  }
  if (daysLeft === 0) return { passed: false, daysLeft, label: 'التسليم اليوم — آخر يوم!', tone: 'bg-destructive/10 text-destructive border-destructive/20' };
  if (daysLeft === 1) return { passed: false, daysLeft, label: 'باقٍ يوم واحد', tone: 'bg-amber-500/15 text-amber-800 border-amber-500/25' };
  if (daysLeft <= 3) return { passed: false, daysLeft, label: `باقٍ ${daysLeft} أيام`, tone: 'bg-amber-500/12 text-amber-800 border-amber-500/20' };
  return { passed: false, daysLeft, label: `باقٍ ${daysLeft} يوماً`, tone: 'bg-secondary text-muted-foreground border-border' };
}

/* ═══════════════════════════════════════════════════════════════════════
   الخصم الجماعي — خصم نقاط أو نسبة من كل طلاب بند واحد دفعة واحدة.
   يعمل للواجبات والدفاتر والاختبارات معاً (نفس الـ endpoint).
   ═══════════════════════════════════════════════════════════════════════ */
function BulkDeductBar({ kind, itemId, gradedCount, onDone }: {
  kind: 'assignments' | 'notebooks' | 'assessments';
  itemId: string;
  gradedCount: number;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'points' | 'percent'>('points');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const run = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setMsg('اكتب رقماً أكبر من صفر'); return; }
    setBusy(true); setMsg('');
    try {
      const body: any = mode === 'percent'
        ? { percent: Math.min(100, n), floorAtZero: true }
        : { points: n, floorAtZero: true };
      const r = await jsonFetch(`/api/teacher/curriculum/${kind}/${itemId}/deduct`, { method: 'POST', body });
      setMsg(r?.message || 'تم الخصم');
      setAmount('');
      onDone?.();
      window.setTimeout(() => setMsg(''), 3500);
    } catch (e: any) {
      setMsg(e?.message || 'تعذر تنفيذ الخصم');
    } finally { setBusy(false); }
  };

  if (!itemId) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card" data-testid="bulk-deduct-bar">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-sm font-extrabold text-primary transition-colors hover:bg-secondary/40"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/12 text-destructive"><MinusCircle size={17} /></span>
        <span className="flex-1 text-right">خصم جماعي على الجميع</span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">{gradedCount} مُقيَّم</span>
        <ChevronLeft size={16} className={`text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="animate-rise border-t border-border bg-background/60 p-4">
          <div className="mb-3 flex gap-2 rounded-xl bg-muted/50 p-1">
            <button type="button" onClick={() => setMode('points')} className={`flex-1 rounded-lg py-2 text-xs font-extrabold transition-colors ${mode === 'points' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>خصم نقاط</button>
            <button type="button" onClick={() => setMode('percent')} className={`flex-1 rounded-lg py-2 text-xs font-extrabold transition-colors ${mode === 'percent' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>خصم نسبة %</button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="number" min={1} max={mode === 'percent' ? 100 : undefined}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={mode === 'percent' ? 'مثال: 10' : 'مثال: 3'}
              className="h-12 w-28 rounded-xl border border-input bg-card px-3 text-center font-display text-base font-extrabold tabular-nums outline-none focus:border-primary"
              data-testid="input-deduct-amount"
            />
            <span className="text-xs font-bold text-muted-foreground">
              {mode === 'percent' ? 'نسبة تُخصم من كل علامة' : 'نقطة تُخصم من كل علامة'}
            </span>
            <Button onClick={run} disabled={busy || !amount} variant="primary" className="mr-auto px-5 py-2.5 text-xs" data-testid="button-run-deduct">
              {busy ? <><RefreshCw size={14} className="animate-spin" /> جارٍ الخصم...</> : <><MinusCircle size={14} /> نفّذ الخصم</>}
            </Button>
          </div>
          <p className="mt-2.5 text-[11px] font-bold text-muted-foreground">لا تجعل العلامة سالبة — تتوقف عند الصفر.</p>
          {msg && <p className="mt-2 rounded-lg bg-accent/15 px-3 py-2 text-xs font-extrabold text-accent-foreground">{msg}</p>}
        </div>
      )}
    </div>
  );
}

/** تطبيع للمقارنة العربية — الهمزات والتاء المربوطة والمسافات */
function foldName(v: unknown): string {
  return String(v ?? '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[\s_\-]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** بند انتهت مهلته — لا يُعرض في الوحدات ولا يُحسب على الطالب.
 *  يبقى مرئياً في قسمه المخصّص بشارة "انتهت المهلة — مغلق". */
function itemExpired(x: any): boolean {
  return !!deadlineInfo(x?.dueDate ?? x?.date)?.passed;
}

/* ═══════════════════════════════════════════════════════════════════════
   بطاقة مهمة واحدة — مصمّمة للهاتف أولاً.
   السبب: التخطيط القديم كان صفاً أفقياً بـ flex-wrap وأزرار كثيرة،
   فيتنفضّ على الشاشة الضيقة ويتكدّس بشكل عشوائي.
   الآن: صف علوي (أيقونة + عنوان + حالة) ثم صف أزرار كامل العرض.
   ═══════════════════════════════════════════════════════════════════════ */
function TaskCard({ tone, icon, title, meta, status, statusTone, children }: {
  tone: 'hw' | 'nb' | 'ex';
  icon: ReactNode;
  title: string;
  meta: string;
  status: string;
  statusTone: string;
  children?: ReactNode;
}) {
  const tones = {
    hw: { chip: 'bg-primary/10 text-primary', bar: 'bg-primary' },
    nb: { chip: 'bg-amber-500/15 text-amber-800', bar: 'bg-amber-500' },
    ex: { chip: 'bg-[#0d47a1]/10 text-[#0d47a1]', bar: 'bg-[#0d47a1]' },
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-3.5 shadow-sm" style={{ ['--tw' as any]: 1 }}>
      <span className={`absolute inset-y-0 right-0 w-1 ${tones.bar}`} />
      <div className="flex items-start gap-3 pr-1.5">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones.chip}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold leading-snug text-primary">{title}</p>
          <p className="mt-1 text-[11px] font-bold leading-relaxed text-muted-foreground">{meta}</p>
        </div>
        <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold sm:inline-block ${statusTone}`}>{status}</span>
      </div>
      {/* الحالة على الهاتف سطر مستقل حتى لا تنضغط مع العنوان */}
      <span className={`mt-2.5 inline-block rounded-full px-2.5 py-1 text-[10px] font-extrabold sm:hidden ${statusTone}`}>{status}</span>
      {children ? <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   نافذة مراجعة الواجب: المسلّمون + من لم يسلّم (الصف والمدرسة نفسها)
   مع عدّادات وتسجيل سريع لعلامة من لم يسلّم.
   ═══════════════════════════════════════════════════════════════════════ */
function HwReviewModal({ hw, subs, grading, setGrading, saveGrade, onClose, onReload }: {
  hw: any;
  subs: any[];
  grading: Record<string, { score: string; feedback: string }>;
  setGrading: (updater: any) => void;
  saveGrade: (sub: any) => void;
  onClose: () => void;
  onReload?: () => void;
}) {
  const [rosterTab, setRosterTab] = useState<'done' | 'missing'>('done');
  const [recordingId, setRecordingId] = useState('');
  const [search, setSearch] = useState('');

  const { students: roster, loading: rosterLoading } = useGradeRoster(hw?.grade, hw?.school);
  const submittedIds = useMemo(() => new Set(subs.map((s) => s.student?.id).filter(Boolean)), [subs]);
  const missing = useMemo(() => {
    const needle = String(search || '').trim();
    return roster.filter((s) => !submittedIds.has(s.id) && (!needle || (s.name || '').includes(needle)));
  }, [roster, submittedIds, search]);

  const recordManual = async (userId: string, score: string) => {
    if (!hw?.id || !userId || recordingId) return;
    setRecordingId(userId);
    try {
      await jsonFetch(`/api/teacher/curriculum/assignments/${hw.id}/record`, {
        method: 'POST',
        body: { userId, score: score === '' ? null : Number(score) },
      });
      onReload?.();
    } finally {
      setRecordingId('');
    }
  };

  return (
    <Modal title={hw?.title || 'مراجعة الواجب'} eyebrow={`حل ${subs.length} · لم يحل ${missing.length}`} onClose={onClose} maxWidth="max-w-5xl">
      {/* العدّادات */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-3 rounded-2xl bg-green-600/10 px-4 py-3">
          <span className="font-display text-2xl font-extrabold tabular-nums text-green-800">{subs.length}</span>
          <span className="text-xs font-extrabold text-green-800">حلّوا<br />الواجب</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 px-4 py-3">
          <span className="font-display text-2xl font-extrabold tabular-nums text-destructive">{missing.length}</span>
          <span className="text-xs font-extrabold text-destructive">لم يحلوا<br />بعد</span>
        </div>
      </div>

      <BulkDeductBar
        kind="assignments"
        itemId={hw?.id || ''}
        gradedCount={subs.length}
        onDone={onReload}
      />

      <div className="mb-4 flex gap-2 rounded-2xl border border-border bg-card p-1.5" data-testid="hw-review-tabs">
        <button
          type="button"
          onClick={() => setRosterTab('done')}
          data-testid="button-hw-tab-done"
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${rosterTab === 'done' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
        >
          المسلّمون ({subs.length})
        </button>
        <button
          type="button"
          onClick={() => setRosterTab('missing')}
          data-testid="button-hw-tab-missing"
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${rosterTab === 'missing' ? 'bg-destructive text-white shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
        >
          لم يسلّموا ({missing.length})
        </button>
      </div>

      {rosterTab === 'missing' ? (
        rosterLoading ? <StateNotice type="loading" /> : !missing.length ? (
          <div className="rounded-3xl border border-green-500/30 bg-green-500/8 px-6 py-12 text-center">
            <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-green-600/15 text-green-800"><CheckCircle2 size={30} /></span>
            <p className="font-display text-xl font-bold text-green-800">الكل سلّم — لا متأخرين</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم الطالب..."
                className="w-full rounded-xl border border-input bg-card py-2.5 pl-3 pr-9 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              />
            </div>
            <p className="rounded-2xl bg-destructive/8 px-4 py-3 text-sm font-extrabold text-destructive">
              {missing.length} طالب لم يسلّموا — ضع العلامة لمن يستحق فيُنشأ تسليمه ويُقيَّم فوراً
            </p>
            {missing.map((st) => (
              <MissingStudentRow
                key={st.id}
                student={st}
                points={Number(hw?.points) || 20}
                onRecord={recordManual}
                saving={recordingId === st.id}
              />
            ))}
          </div>
        )
      ) : !subs.length ? (
        <p className="rounded-2xl bg-secondary/50 px-4 py-8 text-center text-sm text-muted-foreground">لا تسليمات على هذا الواجب بعد — ستظهر أسماء الطلاب هنا فور تسليمهم.</p>
      ) : (
        <div className="space-y-4">
          {subs.map((sub) => (
            <div key={sub.id} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                <Avatar name={sub.student?.name} src={sub.student?.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-primary">{sub.student?.name || 'طالب'}</p>
                  <p className="text-xs text-muted-foreground">{[sub.student?.grade, sub.student?.school].filter(Boolean).join(' · ')}{sub.submittedAt ? ` · سلّم ${String(sub.submittedAt).slice(0, 10)}` : ''}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${sub.status === 'تم التقييم' ? 'bg-green-500/15 text-green-800' : 'bg-accent/25 text-accent-foreground'}`}>{sub.status}</span>
              </div>
              {sub.answer ? (
                <p className="mt-3 whitespace-pre-line rounded-xl bg-secondary/40 p-3.5 text-sm leading-7 text-primary">{sub.answer}</p>
              ) : null}
              {Array.isArray(sub.photos) && sub.photos.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {sub.photos.map((src: string, i: number) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border" title="فتح الصورة بحجم أكبر">
                      <img src={src} alt={`حل ${sub.student?.name} - صورة ${i + 1}`} loading="lazy" className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 rounded-2xl bg-secondary/40 p-3 sm:grid-cols-[110px_1fr_auto]">
                <input type="number" min={0} max={hw?.points || 100} value={grading[sub.id]?.score ?? ''} onChange={(e) => setGrading((g: any) => ({ ...g, [sub.id]: { score: e.target.value, feedback: g[sub.id]?.feedback ?? '' } }))} placeholder={`العلامة / ${hw?.points}`} className={`${inputCls} py-2 text-sm`} />
                <input value={grading[sub.id]?.feedback ?? ''} onChange={(e) => setGrading((g: any) => ({ ...g, [sub.id]: { score: g[sub.id]?.score ?? '', feedback: e.target.value } }))} placeholder="ملاحظة للطالب..." className={`${inputCls} py-2 text-sm`} />
                <Button onClick={() => saveGrade(sub)} variant="primary" className="px-4 py-2 text-xs"><Save size={14} /> حفظ التقييم</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
/* ═══════════════════════════════════════════════════════════════════════
   نافذة مراجعة الدفاتر — مصممة للآيباد أولاً.
   ───────────────────────────────────────────────────────────────────────
   • طالب واحد في كل مرة + قائمة الطلاب للتنقل السريع (تتحمل 50 وأكثر).
   • عارض صور كبير يحترم الطولي والعرضي + مصغرات بالترتيب + تنقل.
   • الضغط على الصورة يفتحها ملء الشاشة مع تنقل وتكبير.
   • حفظ، وحفظ والتالي (ينتقل لأول غير مُقيَّم تلقائياً).
   ═══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   قائمة الصف والمدرسة لبندٍ ما (واجب/دفتر/اختبار): من حله ومن لم يحله.
   القاعدة حرفياً كما طلب الأستاذ: نفس الصف ونفس المدرسة فقط.
   - صف البند فارغ أو "الجميع" = كل الصفوف.
   - مدرسة البند فارغة = كل المدارس.
   ═══════════════════════════════════════════════════════════════════════ */
function useGradeRoster(grade?: string, school?: string) {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    jsonFetch('/api/teacher/students')
      .then((d) => {
        if (!live) return;
        const list = Array.isArray(d) ? d : [];
        const g = String(grade || '').trim();
        const sc = String(school || '').trim();
        setStudents(list.filter((s: any) => {
          if (g && g !== 'الجميع' && String(s.grade || '') !== g) return false;
          if (sc && String(s.school || '') !== sc) return false;
          return true;
        }));
      })
      .catch(() => { if (live) setStudents([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [grade, school]);
  return { students, loading };
}

/* ═══════════════════════════════════════════════════════════════════════
   نافذة مراجعة الاختبار: من اجتاز (مع علامته ومحاولاته) + من لم يجرّب.
   تسجيل يدوي لعلامة من لم يجرّب، وخصم جماعي على المجتازين.
   ═══════════════════════════════════════════════════════════════════════ */
function ExamReviewModal({ exam, attempts, onClose, onReload }: {
  exam: any;
  attempts: any[];
  onClose: () => void;
  onReload?: () => void;
}) {
  const [rosterTab, setRosterTab] = useState<'done' | 'missing'>('done');
  const [recordingId, setRecordingId] = useState('');
  const [search, setSearch] = useState('');

  const { students: roster, loading: rosterLoading } = useGradeRoster(exam?.grade, exam?.school);
  const attemptedIds = useMemo(() => new Set(attempts.map((a) => a.userId || a.student?.id).filter(Boolean)), [attempts]);
  const missing = useMemo(() => {
    const needle = String(search || '').trim();
    return roster.filter((s) => !attemptedIds.has(s.id) && (!needle || (s.name || '').includes(needle)));
  }, [roster, attemptedIds, search]);

  const recordManual = async (userId: string, score: string) => {
    if (!exam?.id || !userId || recordingId) return;
    setRecordingId(userId);
    try {
      await jsonFetch(`/api/teacher/curriculum/assessments/${exam.id}/record`, {
        method: 'POST',
        body: { userId, score: score === '' ? null : Number(score) },
      });
      onReload?.();
    } finally { setRecordingId(''); }
  };

  const dl = deadlineInfo(exam?.date);

  return (
    <Modal title={exam?.title || 'مراجعة الاختبار'} eyebrow={`اجتاز ${attempts.length} · لم يجرّب ${missing.length}`} onClose={onClose} maxWidth="max-w-4xl">
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-3 rounded-2xl bg-green-600/10 px-4 py-3">
          <span className="font-display text-2xl font-extrabold tabular-nums text-green-800">{attempts.length}</span>
          <span className="text-xs font-extrabold text-green-800">اجتازوا<br />الاختبار</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 px-4 py-3">
          <span className="font-display text-2xl font-extrabold tabular-nums text-destructive">{missing.length}</span>
          <span className="text-xs font-extrabold text-destructive">لم يجرّبو<br />بعد</span>
        </div>
      </div>

      {dl && (
        <p className={`mb-4 flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-extrabold ${dl.tone}`}>
          <Clock3 size={14} /> {dl.label} — {exam?.date || ''}
        </p>
      )}

      <BulkDeductBar kind="assessments" itemId={exam?.id || ''} gradedCount={attempts.length} onDone={onReload} />

      <div className="mb-4 flex gap-2 rounded-2xl border border-border bg-card p-1.5" data-testid="exam-review-tabs">
        <button
          type="button" onClick={() => setRosterTab('done')} data-testid="button-exam-tab-done"
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${rosterTab === 'done' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
        >
          اجتازوا ({attempts.length})
        </button>
        <button
          type="button" onClick={() => setRosterTab('missing')} data-testid="button-exam-tab-missing"
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${rosterTab === 'missing' ? 'bg-destructive text-white shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
        >
          لم يجرّبو ({missing.length})
        </button>
      </div>

      {rosterTab === 'missing' ? (
        rosterLoading ? <StateNotice type="loading" /> : !missing.length ? (
          <div className="rounded-3xl border border-green-500/30 bg-green-500/8 px-6 py-12 text-center">
            <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-green-600/15 text-green-800"><CheckCircle2 size={30} /></span>
            <p className="font-display text-xl font-bold text-green-800">الكل اجتاز — لا متأخرين</p>
            <p className="mt-2 text-sm text-muted-foreground">كل طلاب هذا الصف والمدرسة اجتازوا الاختبار.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم الطالب..."
                className="w-full rounded-xl border border-input bg-card py-2.5 pl-3 pr-9 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              />
            </div>
            <p className="rounded-2xl bg-destructive/8 px-4 py-3 text-sm font-extrabold text-destructive">
              {missing.length} طالب لم يجرّب — ضع العلامة لمن يستحق فيُسجَّل نتيجته فوراً
            </p>
            {missing.map((st) => (
              <MissingStudentRow
                key={st.id} student={st} points={100}
                onRecord={recordManual} saving={recordingId === st.id}
              />
            ))}
          </div>
        )
      ) : !attempts.length ? (
        <p className="rounded-3xl border border-border bg-muted/40 px-6 py-12 text-center text-sm font-bold text-muted-foreground">
          لا محاولات بعد — ستظهر نتائج الطلاب هنا فور اجتيازهم.
        </p>
      ) : (
        <div className="space-y-2.5">
          {attempts.map((a) => (
            <div key={a.userId || a.student?.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background p-4">
              <Avatar name={a.student?.name} src={a.student?.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-primary">{a.student?.name || 'طالب'}</p>
                <p className="text-xs text-muted-foreground">{[a.student?.grade, a.student?.school].filter(Boolean).join(' · ')}{a.completedAt ? ` · ${String(a.completedAt).slice(0, 10)}` : ''}</p>
              </div>
              <span className="rounded-xl bg-[#0d47a1]/10 px-3 py-1.5 font-display text-sm font-extrabold tabular-nums text-[#0d47a1]">{a.score ?? 0}%</span>
              {a.attempts > 1 && <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-extrabold text-muted-foreground">{a.attempts} محاولات</span>}
              <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${a.status === 'مكتمل' ? 'bg-green-500/15 text-green-800' : 'bg-accent/25 text-accent-foreground'}`}>{a.status}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* صف طالب لم يسلّم + تسجيل سريع لعلامته (ينشئ التسليم ويقيّمه دفعة واحدة) */
function MissingStudentRow({ student, points, onRecord, saving }: {
  student: any;
  points: number;
  onRecord: (userId: string, score: string) => void;
  saving: boolean;
}) {
  const [score, setScore] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-3" data-testid={`missing-row-${student.id}`}>
      <Avatar name={student.name} src={student.avatarUrl} size="sm" />
      <div className="min-w-[140px] flex-1">
        <p className="truncate text-sm font-extrabold text-primary">{student.name}</p>
        <p className="mt-0.5 text-[11px] font-bold text-destructive">لم يسلّم بعد</p>
      </div>
      <input
        type="number" min={0} max={points || undefined}
        value={score}
        onChange={(e) => setScore(e.target.value)}
        placeholder={`العلامة / ${points || '؟'}`}
        className="h-12 w-28 rounded-xl border border-input bg-background px-3 text-center font-display text-base font-extrabold tabular-nums outline-none focus:border-primary"
        data-testid={`input-record-${student.id}`}
      />
      <button
        type="button"
        onClick={() => onRecord(student.id, score)}
        disabled={saving}
        className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground shadow-sm transition-all active:scale-[.97] disabled:opacity-50"
        data-testid={`button-record-${student.id}`}
      >
        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} تسجيل
      </button>
    </div>
  );
}

function NotebookReviewModal({ task, submissions, grading, setGrading, saveGrade, onClose, onReload }: {
  task: any;
  submissions: any[];
  grading: Record<string, { score: string; feedback: string; checks: { label: string; done: boolean }[] }>;
  setGrading: (updater: any) => void;
  saveGrade: (sub: any) => Promise<boolean>;
  onClose: () => void;
  onReload?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(submissions[0]?.id || '');
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [search, setSearch] = useState('');
  const [savingNext, setSavingNext] = useState(false);
  const [rosterTab, setRosterTab] = useState<'done' | 'missing'>('done');
  const [recordingId, setRecordingId] = useState('');

  // قائمة الصف والمدرسة نفسها — من سلّم ومن لم يسلّم
  const { students: roster, loading: rosterLoading } = useGradeRoster(task?.grade, task?.school);
  const submittedIds = useMemo(() => new Set(submissions.map((s) => s.student?.id).filter(Boolean)), [submissions]);
  const missing = useMemo(() => roster.filter((s) => !submittedIds.has(s.id)), [roster, submittedIds]);

  // المحدد يبقى صالحاً بعد إعادة التحميل (الحفظ يعيد الجلب)
  useEffect(() => {
    if (!submissions.length) { setSelectedId(''); return; }
    if (!submissions.some((s) => s.id === selectedId)) setSelectedId(submissions[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions.map((s) => s.id).join(',')]);
  useEffect(() => { setPhotoIdx(0); setLightbox(false); }, [selectedId]);

  const isGraded = (s: any) =>
    (s.score !== null && s.score !== undefined && String(s.score) !== '') ||
    s.status === 'تم التقييم';
  const reviewedCount = submissions.filter(isGraded).length;
  const reviewPct = submissions.length ? Math.round((reviewedCount / submissions.length) * 100) : 0;

  const filtered = useMemo(() => {
    const needle = String(search || '').trim();
    if (!needle) return submissions;
    return submissions.filter((s) => (s.student?.name || '').includes(needle));
  }, [submissions, search]);

  const selected = submissions.find((s) => s.id === selectedId) || filtered[0] || submissions[0] || null;
  const photos: string[] = selected && Array.isArray(selected.photos) ? selected.photos.filter(Boolean) : [];
  const safePhotoIdx = photos.length ? Math.min(photoIdx, photos.length - 1) : 0;
  const g = selected ? (grading[selected.id] || { score: '', feedback: '', checks: [] }) : { score: '', feedback: '', checks: [] };

  const goStudent = (dir: 1 | -1) => {
    const list = filtered.length ? filtered : submissions;
    if (!selected || !list.length) return;
    const i = list.findIndex((s) => s.id === selected.id);
    const next = list[(i + dir + list.length) % list.length];
    if (next) setSelectedId(next.id);
  };

  const saveAndNext = async () => {
    if (!selected || savingNext) return;
    setSavingNext(true);
    try {
      const ok = await saveGrade(selected);
      if (ok) {
        const list = filtered.length ? filtered : submissions;
        const i = list.findIndex((s) => s.id === selected.id);
        // أول غير مُقيَّم بعد الحالي — وإلا التالي في القائمة
        const rest = [...list.slice(i + 1), ...list.slice(0, i + 1)];
        const next = rest.find((s) => s.id !== selected.id && !isGraded(s)) || rest.find((s) => s.id !== selected.id);
        if (next) setSelectedId(next.id);
      }
    } finally {
      setSavingNext(false);
    }
  };
  /* تسجيل يدوي: ينشئ تسليماً للطالب الذي لم يسلّم ويقيّمه فوراً */
  const recordManual = async (userId: string, score: string) => {
    if (!task?.id || !userId || recordingId) return;
    setRecordingId(userId);
    try {
      await jsonFetch(`/api/teacher/curriculum/notebooks/${task.id}/record`, {
        method: 'POST',
        body: { userId, score: score === '' ? null : Number(score) },
      });
      onReload?.();
    } catch (e: any) {
      // الخطأ يظهر من زر الحفظ العام عبر flash الأب — هنا تنبيه محلي بسيط
    } finally {
      setRecordingId('');
    }
  };

  return (
    <Modal
      title={task?.title || 'مراجعة الدفاتر'}
      eyebrow={`حل ${submissions.length} · لم يحل ${missing.length} — ${task?.grade || ''}`}
      onClose={onClose}
      maxWidth="max-w-6xl"
    >
      {/* شريط الحل: كم حل وكم لم يحل من الصف والمدرسة نفسها */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-3 rounded-2xl bg-green-600/10 px-4 py-3">
          <span className="font-display text-2xl font-extrabold tabular-nums text-green-800">{submissions.length}</span>
          <span className="text-xs font-extrabold text-green-800">حلّوا<br />الواجب</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 px-4 py-3">
          <span className="font-display text-2xl font-extrabold tabular-nums text-destructive">{missing.length}</span>
          <span className="text-xs font-extrabold text-destructive">لم يحلوا<br />بعد</span>
        </div>
      </div>
      {/* شريط التقدم — يرى الأستاذ أين وصل من الـ 50 */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3">
        <span className="text-sm font-extrabold tabular-nums text-primary">{reviewedCount}/{submissions.length}</span>
        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-background">
          <span className="block h-full rounded-full bg-gradient-to-l from-[#b7791f] to-[#d7b65e] transition-[width] duration-500" style={{ width: `${reviewPct}%` }} />
        </span>
        <span className="text-xs font-extrabold tabular-nums text-muted-foreground">{reviewPct}%</span>
      </div>

      <BulkDeductBar
        kind="notebooks"
        itemId={task?.id || ''}
        gradedCount={submissions.length}
        onDone={onReload}
      />

      {/* تبويبا القائمتين */}
      <div className="mb-4 flex gap-2 rounded-2xl border border-border bg-card p-1.5" data-testid="review-tabs">
        <button
          type="button"
          onClick={() => setRosterTab('done')}
          data-testid="button-tab-done"
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${rosterTab === 'done' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
        >
          المسلّمون ({submissions.length})
        </button>
        <button
          type="button"
          onClick={() => setRosterTab('missing')}
          data-testid="button-tab-missing"
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${rosterTab === 'missing' ? 'bg-destructive text-white shadow-sm' : 'text-muted-foreground hover:text-primary'}`}
        >
          لم يسلّموا ({missing.length})
        </button>
      </div>

      {rosterTab === 'missing' ? (
        rosterLoading ? <StateNotice type="loading" /> : !missing.length ? (
          <div className="rounded-3xl border border-green-500/30 bg-green-500/8 px-6 py-12 text-center">
            <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-green-600/15 text-green-800"><CheckCircle2 size={30} /></span>
            <p className="font-display text-xl font-bold text-green-800">الكل سلّم — لا متأخرين</p>
            <p className="mt-2 text-sm text-muted-foreground">كل طلاب هذا الصف والمدرسة سلّموا المهمة.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="rounded-2xl bg-destructive/8 px-4 py-3 text-sm font-extrabold text-destructive">
              {missing.length} طالب لم يسلّموا — ضع العلامة لمن يستحق فيُنشأ تسليمه ويُقيَّم فوراً
            </p>
            {missing.map((st) => (
              <MissingStudentRow
                key={st.id}
                student={st}
                points={Number(task?.points) || 10}
                onRecord={recordManual}
                saving={recordingId === st.id}
              />
            ))}
          </div>
        )
      ) : !submissions.length ? (
          <p className="rounded-3xl border border-border bg-muted/40 px-6 py-12 text-center text-sm font-bold text-muted-foreground">
            لا تسليمات على هذه المهمة بعد — ستظهر أسماء الطلاب هنا فور تسليمهم.
          </p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[250px_minmax(0,1fr)]">
          {/* ── قائمة الطلاب ── */}
          <aside className="overflow-hidden rounded-3xl border border-border bg-background">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث باسم الطالب..."
                  className="w-full rounded-xl border border-input bg-card py-2.5 pl-3 pr-9 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary"
                  data-testid="input-review-search"
                />
              </div>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto p-2 md:max-h-[62vh]" data-testid="review-student-list">
              {filtered.map((s, i) => {
                const graded = isGraded(s);
                const active = selected?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    data-testid={`button-review-student-${s.id}`}
                    className={`flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-right transition-colors ${active ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-secondary active:bg-secondary'}`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-extrabold tabular-nums ${active ? 'bg-white/20' : 'bg-secondary text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <Avatar name={s.student?.name} src={s.student?.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] font-extrabold ${active ? '' : 'text-primary'}`}>{s.student?.name}</span>
                      <span className={`mt-0.5 flex items-center gap-1.5 text-[10px] font-bold ${active ? 'text-white/75' : 'text-muted-foreground'}`}>
                        {graded ? (
                          <><CheckCircle2 size={11} /> {s.score ?? ''}</>
                        ) : (
                          <><Clock3 size={11} /> بانتظار</>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
              {!filtered.length ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">لا نتائج لهذا البحث</p>
              ) : null}
            </div>
          </aside>

          {/* ── بطاقة المراجعة ── */}
          {selected ? (
            <article className="min-w-0 overflow-hidden rounded-3xl border border-border bg-background" data-testid="review-card">
              {/* رأس الطالب + تنقل */}
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-gradient-to-l from-secondary/70 to-card p-4">
                <Avatar name={selected.student?.name} src={selected.student?.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-extrabold text-primary">{selected.student?.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                    {[selected.student?.grade, selected.student?.section, selected.student?.school].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${isGraded(selected) ? 'bg-green-500/15 text-green-800' : 'bg-accent/25 text-accent-foreground'}`}>
                  {isGraded(selected) ? `مُقيَّم ${selected.score ?? ''}` : selected.status || 'مُسلَّم'}
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => goStudent(-1)} className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card text-muted-foreground active:bg-secondary" aria-label="الطالب السابق" data-testid="button-review-prev-student">
                    <ChevronRight size={19} />
                  </button>
                  <button type="button" onClick={() => goStudent(1)} className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card text-muted-foreground active:bg-secondary" aria-label="الطالب التالي" data-testid="button-review-next-student">
                    <ChevronLeft size={19} />
                  </button>
                </span>
              </div>

              <div className="space-y-4 p-4">
                {selected.note ? (
                  <p className="rounded-2xl border-r-4 border-accent bg-secondary/50 px-4 py-3 text-[13px] font-semibold leading-7 text-primary">
                    ملاحظة الطالب: {selected.note}
                  </p>
                ) : null}

                {/* ── عارض الصور: كبير + مصغرات بالترتيب + تكبير ── */}
                {photos.length ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-extrabold text-muted-foreground">
                        صور الحل بالترتيب ({safePhotoIdx + 1} / {photos.length})
                      </p>
                      <span className="text-[11px] font-bold text-muted-foreground">اضغط الصورة للتكبير</span>
                    </div>
                    <div className="relative overflow-hidden rounded-3xl border border-border bg-[#101515]">
                      <button
                        type="button"
                        onClick={() => setLightbox(true)}
                        className="block max-h-[46vh] min-h-[240px] w-full cursor-zoom-in md:max-h-[56vh]"
                        data-testid="button-photo-enlarge"
                        aria-label="تكبير الصورة"
                      >
                        <img
                          key={photos[safePhotoIdx]}
                          src={photos[safePhotoIdx]}
                          alt={`حل ${selected.student?.name} — صورة ${safePhotoIdx + 1}`}
                          className="mx-auto max-h-[46vh] min-h-[240px] w-full object-contain md:max-h-[56vh]"
                          loading="lazy"
                        />
                      </button>
                      {photos.length > 1 ? (
                        <>
                          <button type="button" onClick={() => setPhotoIdx((v) => Math.max(0, v - 1))} disabled={safePhotoIdx === 0} className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-black/55 text-white backdrop-blur-sm transition-all active:scale-95 disabled:opacity-30" aria-label="الصورة السابقة" data-testid="button-photo-prev">
                            <ChevronRight size={24} />
                          </button>
                          <button type="button" onClick={() => setPhotoIdx((v) => Math.min(photos.length - 1, v + 1))} disabled={safePhotoIdx === photos.length - 1} className="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-2xl bg-black/55 text-white backdrop-blur-sm transition-all active:scale-95 disabled:opacity-30" aria-label="الصورة التالية" data-testid="button-photo-next">
                            <ChevronLeft size={24} />
                          </button>
                          <span className="absolute bottom-2.5 left-1/2 grid h-8 min-w-14 -translate-x-1/2 place-items-center rounded-full bg-black/60 px-3 text-xs font-extrabold tabular-nums text-white backdrop-blur-sm">
                            {safePhotoIdx + 1} / {photos.length}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {/* شريط المصغرات بالترتيب */}
                    {photos.length > 1 ? (
                      <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1" data-testid="photo-thumbnails">
                        {photos.map((src, i) => (
                          <button
                            key={`${src}-${i}`}
                            type="button"
                            onClick={() => setPhotoIdx(i)}
                            data-testid={`button-photo-thumb-${i}`}
                            aria-label={`صورة ${i + 1}`}
                            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all ${i === safePhotoIdx ? 'border-accent shadow-md' : 'border-border opacity-70 hover:opacity-100'}`}
                          >
                            <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                            <span className={`absolute bottom-0.5 right-0.5 grid h-5 min-w-5 place-items-center rounded-md px-1 text-[10px] font-extrabold tabular-nums ${i === safePhotoIdx ? 'bg-accent text-[#3a2c07]' : 'bg-black/60 text-white'}`}>
                              {i + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-2xl bg-secondary/50 px-4 py-6 text-center text-xs text-muted-foreground">لا صور مرفقة في هذا التسليم</p>
                )}

                {/* متطلبات المهمة */}
                {(g.checks || []).length ? (
                  <div className="rounded-2xl border border-accent/30 bg-accent/[0.07] p-3.5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <p className="text-xs font-extrabold text-primary">بنود المهمة — علّم ما تحقق منها:</p>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-extrabold tabular-nums text-primary">
                        {(g.checks || []).filter((c) => c.done).length}/{(g.checks || []).length} متحقق
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(g.checks || []).map((c, ci) => (
                        <button
                          key={ci}
                          type="button"
                          onClick={() => setGrading((gg: any) => ({ ...gg, [selected.id]: { ...gg[selected.id], checks: (gg[selected.id]?.checks || []).map((x: any, j: number) => j === ci ? { ...x, done: !x.done } : x) } }))}
                          className={`flex min-h-[52px] items-center gap-2.5 rounded-xl border-2 p-2.5 text-right text-xs font-bold transition-all active:scale-[0.98] ${c.done ? 'border-green-600 bg-green-500/10 text-green-800' : 'border-border bg-card text-muted-foreground hover:border-accent/60'}`}
                        >
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg font-extrabold ${c.done ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                            {c.done ? <Check size={16} /> : <span>{ci + 1}</span>}
                          </span>
                          <span className="min-w-0 flex-1 leading-5">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* العلامة + الملاحظة + الحفظ */}
                <div className="rounded-2xl bg-secondary/40 p-3.5">
                  <div className="grid gap-2.5 sm:grid-cols-[130px_1fr]">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-extrabold text-primary">
                        العلامة {task?.points ? <span className="text-muted-foreground">/ {task.points}</span> : null}
                      </span>
                      <input
                        type="number" min={0} max={task?.points || undefined}
                        value={g.score ?? ''}
                        onChange={(e) => setGrading((gg: any) => ({ ...gg, [selected.id]: { ...gg[selected.id], score: e.target.value } }))}
                        placeholder="0"
                        className={`${inputCls} py-3 text-center font-display text-lg font-extrabold tabular-nums`}
                        data-testid="input-review-score"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-extrabold text-primary">ملاحظة للطالب</span>
                      <input
                        value={g.feedback ?? ''}
                        onChange={(e) => setGrading((gg: any) => ({ ...gg, [selected.id]: { ...gg[selected.id], feedback: e.target.value } }))}
                        placeholder="أحسنت، انتبه للهمزة..."
                        className={`${inputCls} py-3 text-sm`}
                        data-testid="input-review-feedback"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    <Button onClick={() => saveGrade(selected)} variant="primary" className="min-h-[52px] flex-1 px-5 text-sm" data-testid="button-review-save">
                      <Save size={16} /> حفظ التقييم
                    </Button>
                    <Button onClick={saveAndNext} variant="soft" className="min-h-[52px] flex-1 px-5 text-sm" data-testid="button-review-save-next" disabled={savingNext}>
                      {savingNext ? <RefreshCw size={16} className="animate-spin" /> : <ArrowLeft size={16} />}
                      {savingNext ? 'جارٍ الحفظ...' : 'حفظ والتالي'}
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ) : null}
        </div>
      )}

      {/* ملء الشاشة — نفس ترتيب الصور، طولي أو عرضي يُعرض كاملاً */}
      {lightbox && photos.length ? (
        <FoundationLightbox key={`${selected?.id}-${safePhotoIdx}`} images={photos} start={safePhotoIdx} onClose={() => setLightbox(false)} />
      ) : null}
    </Modal>
  );
}

function TeacherNotebooksPage() {
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
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
    setForm({ title: '', description: '', unitTitle: '', courseId: '', lessonId: '', requirements: [], dueDate: '', points: 10, published: true, section: 'الجميع', school: '' });
    setNewReq({ label: '', kind: 'كتابة', place: '' });
    setModal({ mode: 'create' });
  };
  const openEdit = (item: any) => {
    setForm({ title: item.title, description: item.description, unitTitle: item.unitTitle, courseId: item.courseId || '', lessonId: item.lessonId || '', requirements: Array.isArray(item.requirements) ? [...item.requirements] : [], dueDate: item.dueDate, points: item.points, published: item.published, section: item.section || 'الجميع', school: item.school || '' });
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
      const payload = { ...form, grade, term, section: gradeSplitNb ? (form.section || 'الجميع') : 'الجميع', school: form.school || '' };
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

  const saveGrade = async (sub: any): Promise<boolean> => {
    const g = grading[sub.id] || { score: '', feedback: '', checks: [] };
    try {
      await jsonFetch(`/api/teacher/curriculum/notebook-submissions/${sub.id}`, {
        method: 'PATCH',
        body: { score: g.score === '' ? null : Number(g.score), feedback: g.feedback, checks: g.checks || [] },
      });
      const data = await jsonFetch(`/api/teacher/curriculum/notebooks/${reviewTask.id}/submissions`);
      setSubmissions(Array.isArray(data) ? data : []);
      load();
      flash(`Ï¬┘à Ï¬┘é┘è┘è┘à Ï»┘üÏ¬Ï▒ ${sub.student.name}!`);
      return true;
    } catch (e: any) { flash(e?.message || 'Ï¬Ï╣Ï░Ï▒ Ïº┘äÏ¡┘üÏ©');  return false; }
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
                <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${task.school ? 'bg-[#17413f]/12 text-[#17413f]' : 'bg-muted text-muted-foreground'}`} title={task.school ? 'هذه المهمة لطلاب هذه المدرسة فقط' : 'تظهر لكل مدارس هذا الصف'}>
                  <Landmark size={12} /> {task.school || 'كل المدارس'}
                </span>
              </div>
              <p className="mt-2.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{task.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={() => openReview(task)} variant="primary" className="px-4 py-2 text-xs" data-testid={`button-review-${task.id}`}>
                  <Camera size={14} /> مراجعة التسليمات ({task.submissionsCount || 0})
                </Button>
                <CopyLinkButton path={`/student/notebook?task=${task.id}`} testId={`button-copy-notebook-${task.id}`} title="نسخ رابط المهمة للطلاب" className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-primary hover:bg-accent/40" />
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
              <SchoolTargetField grade={grade} value={form.school || ''} onChange={(v) => setForm({ ...form, school: v })} />
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
        <NotebookReviewModal
          task={reviewTask}
          submissions={submissions}
          grading={grading}
          setGrading={setGrading}
          saveGrade={saveGrade}
          onClose={() => setReviewTask(null)}
          onReload={() => { if (reviewTask) openReview(reviewTask); }}
        />
      )}
    </Shell>
  );
}

/* =========================================================================
   الكتب المدرسية — الإداري يحدد كل شيء: الصف/الفصل/الغلاف/ملف PDF
========================================================================= */
function TeacherBooksPage() {
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; item: any }>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState<'cover' | 'pdf' | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await jsonFetch('/api/teacher/books');
      setItems(Array.isArray(d) ? d : []);
    } catch { setItems([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ title: '', grade: 'الصف الثامن', term: 'الفصل الأول', coverUrl: '', pdfUrl: '', sortOrder: items.length + 1 });
    setModal({ mode: 'create' });
  };
  const openEdit = (item: any) => {
    setForm({ title: item.title, grade: item.grade, term: item.term, coverUrl: item.coverUrl || '', pdfUrl: item.pdfUrl || '', sortOrder: item.sortOrder ?? 1 });
    setModal({ mode: 'edit', item });
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal?.mode === 'create') await jsonFetch('/api/teacher/books', { method: 'POST', body: form });
      else if (modal?.mode === 'edit') await jsonFetch(`/api/teacher/books/${modal.item.id}`, { method: 'PATCH', body: form });
      setModal(null);
      load();
      setMsg('تم حفظ الكتاب ✓ — ظهر فوراً في الرئيسية');
      setTimeout(() => setMsg(''), 3000);
    } catch (e: any) { setMsg(e?.message || 'تعذر الحفظ'); } finally { setSaving(false); }
  };
  const remove = async (item: any) => {
    if (!window.confirm(`حذف كتاب "${item.title}"؟`)) return;
    try {
      await jsonFetch(`/api/teacher/books/${item.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) { setMsg(e?.message || 'تعذر الحذف'); }
  };
  const uploadPdf = (f: File | undefined) => {
    if (!f || uploading) return;
    if (f.size > 3_200_000) {
      setMsg('ملف PDF كبير للرفع المباشر — ارفعه على استضافة خارجية والصق رابطه، أو صغّره أولاً');
      return;
    }
    setUploading('pdf');
    uploadFileToCloud(f, '/ard-al-lughah/books')
      .then((res) => { if (res?.url) setForm((x: any) => ({ ...x, pdfUrl: res.url })); })
      .catch((e: any) => setMsg(e?.message || 'تعذر رفع الملف'))
      .finally(() => setUploading(null));
  };

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow="المكتبة الرقمية"
        title="الكتب المدرسية"
        body="أنت تحدد كل شيء: الصف والفصل والغلاف وملف PDF — ما تحفظه يظهر فوراً في الصفحة الرئيسية."
        tone="light"
        action={<Button onClick={openCreate} data-testid="button-add-book"><Plus size={17} /> إضافة كتاب</Button>}
      />
      {msg ? <p className="mb-4 rounded-xl bg-accent/20 px-4 py-3 text-sm font-bold text-accent-foreground">{msg}</p> : null}
      {loading ? <StateNotice type="loading" /> : !items.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="font-semibold">لا توجد كتب بعد</p>
          <p className="mt-1 text-sm text-muted-foreground">اضغط «إضافة كتاب» وأدخل الصف والفصل والملف.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm" data-testid={`row-book-${b.id}`}>
              <div className="flex gap-4 p-4">
                {b.coverUrl ? (
                  <img src={b.coverUrl} alt="" className="h-28 w-20 shrink-0 rounded-2xl border border-border object-cover" />
                ) : (
                  <span className="grid h-28 w-20 shrink-0 place-items-center rounded-2xl bg-secondary text-muted-foreground"><BookOpen size={26} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-primary">{b.title}</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">{b.grade} · {b.term}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
                    {b.pdfUrl ? <span className="rounded-full bg-green-500/15 px-2.5 py-0.5 text-green-800">PDF جاهز ✓</span> : <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-amber-800">بلا ملف — ارفع PDF</span>}
                    {b.coverUrl ? null : <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground">بلا غلاف</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/30 px-4 py-3">
                {b.pdfUrl ? <a href={b.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3.5 py-2 text-xs font-bold text-primary hover:bg-accent/40"><Eye size={14} /> عرض</a> : null}
                <span className="mr-auto flex items-center gap-1">
                  <Button onClick={() => openEdit(b)} variant="soft" className="px-3 py-2 text-xs"><Pencil size={14} /></Button>
                  <Button onClick={() => remove(b)} variant="ghost" className="px-2 text-destructive"><Trash2 size={16} /></Button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === 'create' ? 'إضافة كتاب جديد' : 'تعديل الكتاب'} eyebrow="المكتبة الرقمية" onClose={() => setModal(null)} maxWidth="max-w-3xl">
          <form onSubmit={save} className="space-y-4">
            <Field2 label="عنوان الكتاب"><input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="مثال: كتاب اللغة العربية - الصف الثامن" className={inputCls} data-testid="input-book-title" /></Field2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field2 label="الصف">
                <select value={form.grade || 'الصف الثامن'} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={inputCls}>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field2>
              <Field2 label="الفصل">
                <select value={form.term || 'الفصل الأول'} onChange={(e) => setForm({ ...form, term: e.target.value })} className={inputCls}>
                  <option value="الفصل الأول">الفصل الأول</option>
                  <option value="الفصل الثاني">الفصل الثاني</option>
                </select>
              </Field2>
              <Field2 label="الترتيب"><input type="number" min={0} value={form.sortOrder ?? 1} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className={inputCls} /></Field2>
            </div>
            <ImageUrlField label="غلاف الكتاب" value={form.coverUrl || ''} onChange={(v) => setForm({ ...form, coverUrl: v })} testId="input-book-cover" folder="/ard-al-lughah/books" />
            <div className="rounded-2xl border border-dashed border-border p-4">
              <p className="mb-2 text-sm font-semibold">ملف PDF {form.pdfUrl ? <span className="mr-2 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-bold text-green-800">مرفوع ✓</span> : null}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input value={form.pdfUrl || ''} onChange={(e) => setForm({ ...form, pdfUrl: e.target.value })} placeholder="الصق رابط PDF أو ارفع ملفاً صغيراً" dir="ltr" className={`${inputCls} font-mono text-xs`} data-testid="input-book-pdf" />
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary hover:bg-accent/40 ${uploading ? 'opacity-60' : ''}`}>
                  {uploading === 'pdf' ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} {uploading === 'pdf' ? 'جارٍ الرفع...' : 'رفع PDF'}
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    uploadPdf(f);
                  }} />
                </label>
                {form.pdfUrl ? <a href={form.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-primary"><Eye size={13} /> عرض</a> : null}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">الملفات الكبيرة (&gt;3MB) ارفعها على استضافة خارجية والصق رابطها هنا.</p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button onClick={() => setModal(null)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={saving} variant="primary" className="px-8 py-3" data-testid="button-save-book">{saving ? 'جارٍ الحفظ...' : 'حفظ الكتاب ✓'}</Button>
            </div>
          </form>
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
   ═══════════════════════════════════════════════════════════════════════
   قسم "التأسيس" — قسم خاص لمجموعة يختارها الأستاذ بالاسم
   دروس فقط: نص / صورة / فيديو / HTML / مختلط — بلا وحدات ولا واجبات.

   التصميم مُعدّ من الأساس لآيباد باللمس (لا ماوس):
   • كل هدف كبير = 52px على الأقل (معيار Apple HIG)
   • النصوص المدخلة 16px+ حتى لا يكبّر الآيباد الصفحة تلقائياً
   • لا شيء يعتمد على تمرير الفأرة — كل حالة لها :active واضح
   • النوافذ تمرّر بالإصبع (overscroll-contain) والأزرار على هوامش مريحة
   ═══════════════════════════════════════════════════════════════════════
========================================================================= */

const FOUNDATION_COLORS = [
  '#17413f', '#0d47a1', '#6a1b9a', '#a85d3d', '#b7791f',
  '#2f7772', '#5d4037', '#00695c', '#8a508f', '#37474f',
];

const FOUNDATION_KINDS: Record<string, { label: string; hint: string; Icon: any; tone: string }> = {
  text:     { label: 'درس نصي',     hint: 'عنوان ونصّ',                 Icon: BookOpen,  tone: '#17413f' },
  image:    { label: 'صور الدرس',   hint: 'غلاف ومعرض صور',              Icon: ImagePlus, tone: '#a85d3d' },
  video:    { label: 'فيديو',       hint: 'يوتيوب أو ملف فيديو',         Icon: Video,     tone: '#0d47a1' },
  html:     { label: 'صفحة HTML',   hint: 'محتوى تفاعلي',                Icon: FileCode2, tone: '#6a1b9a' },
  document: { label: 'مستند',       hint: 'PDF · بوربوينت · وورد',       Icon: FileText,  tone: '#c62828' },
  mixed:    { label: 'مختلط',       hint: 'نص + صور + فيديو + HTML + مستند', Icon: Layers,    tone: '#2f7772' },
};

const FOUNDATION_KIND_ORDER = ['text', 'image', 'video', 'html', 'document', 'mixed'] as const;

/** حقول الإدخال للّمس: 16px+ (حتى لا يكبّر الآيباد الصفحة) وحدود سميكة */
const touchCls =
  'w-full rounded-2xl border-2 border-input bg-background px-4 py-3.5 text-base outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-accent/20';

/** الأزرار كبيرة ومسطّحة — الضغط يعطي ارتداداً مرئياً ولا يعتمد على الفأرة */
const touchBtn =
  'inline-flex min-h-[52px] select-none items-center justify-center gap-2 rounded-2xl px-6 text-base font-extrabold transition-all active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50';
const touchBtnPrimary = `${touchBtn} bg-primary text-primary-foreground shadow-md shadow-primary/20`;
const touchBtnSoft = `${touchBtn} border-2 border-border bg-secondary/70 text-primary active:bg-secondary`;
const touchBtnGhost = `${touchBtn} border-2 border-border bg-card text-muted-foreground active:bg-secondary/60`;
const touchBtnAccent = `${touchBtn} bg-accent text-[#3a2c07] shadow-md shadow-accent/30`;

/** يوحّد الهمزات والتاء المربوطة — للبحث في أسماء الطلاب */
function foundationFold(s: string): string {
  return String(s || '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** يحوّل أي رابط فيديو إلى رابط تشغيل: يوتيوب/ Vimeo مضمّن، أو ملف مباشر */
function foundationVideo(url?: string): { src: string; embed: boolean; label: string } | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const yt = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
  if (yt) return { src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1`, embed: true, label: 'يوتيوب' };
  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}`, embed: true, label: 'Vimeo' };
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)([?#]|$)/i.test(raw)) return { src: raw, embed: false, label: 'ملف فيديو' };
  return { src: raw, embed: false, label: 'رابط فيديو' };
}

/* ─────────────────────────── عارض الصور (لمس) ─────────────────────────── */
function FoundationLightbox({ images, start = 0, onClose }: { images: string[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const touchX = useRef<number | null>(null);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  const go = (d: number) => setI((v) => Math.min(images.length - 1, Math.max(0, v + d)));
  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-[#05100f]/[0.97] backdrop-blur-sm" dir="rtl" data-testid="foundation-lightbox">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <button type="button" onClick={onClose} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 active:bg-white/20" aria-label="إغلاق"><X size={22} /></button>
        <span className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-extrabold tabular-nums text-white ring-1 ring-white/15">{i + 1} / {images.length}</span>
        <button type="button" onClick={() => setZoom((z) => !z)} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 active:bg-white/20" aria-label="تكبير">
          {zoom ? <EyeOff size={20} /> : <Maximize2 size={20} />}
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        }}
      >
        <img src={images[i]} alt={`صورة ${i + 1}`} className={`max-h-full w-full select-none rounded-2xl bg-white/5 object-contain ${zoom ? 'max-w-none' : ''}`} style={zoom ? { width: '200%' } : undefined} data-testid="img-lightbox" />
        {images.length > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} disabled={i === 0} className="absolute right-2 grid h-14 w-14 place-items-center rounded-2xl bg-black/50 text-white ring-1 ring-white/20 disabled:opacity-25" aria-label="السابق"><ChevronRight size={26} /></button>
            <button type="button" onClick={() => go(1)} disabled={i === images.length - 1} className="absolute left-2 grid h-14 w-14 place-items-center rounded-2xl bg-black/50 text-white ring-1 ring-white/20 disabled:opacity-25" aria-label="التالي"><ChevronLeft size={26} /></button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────── مشغّل الفيديو (أزرار كبيرة) ───────────────────── */
function FoundationVideoPlayer({ url, caption }: { url: string; caption?: string }) {
  const info = foundationVideo(url);
  const ref = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [full, setFull] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => { setPlaying(false); setCurrent(0); setTotal(0); }, [url]);

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => setPlaying(false)); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };
  const seek = (val: number) => {
    const v = ref.current;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = val;
    setCurrent(val);
  };
  const goFull = () => {
    const el = wrapRef.current;
    if (!el) return;
    setFull((f) => {
      if (!f && el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
      else if (f && document.exitFullscreen) document.exitFullscreen().catch(() => undefined);
      return !f;
    });
  };

  if (!info) return null;

  if (info.embed) {
    return (
      <div className="overflow-hidden rounded-3xl border border-border bg-black shadow-md">
        <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d2926] px-4 py-2.5 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-extrabold"><Video size={14} /> {info.label}</span>
          <span className="mr-auto text-[11px] font-bold text-white/60">مقطع الأستاذ</span>
        </div>
        <div className="relative w-full bg-black" style={{ paddingTop: '56.25%' }}>
          <iframe
            title={caption || 'فيديو الدرس'}
            src={info.src}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
            data-testid="iframe-foundation-video"
          />
        </div>
        {caption ? <p className="border-t border-border bg-secondary/40 px-4 py-3 text-sm font-semibold leading-6 text-primary">{caption}</p> : null}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="overflow-hidden rounded-3xl border border-border bg-black shadow-md">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d2926] px-4 py-2.5 text-white">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-extrabold"><Video size={14} /> {info.label}</span>
        <span className="mr-auto text-[11px] font-bold text-white/60">اضغط للتشغيل</span>
      </div>
      <video
        ref={ref}
        src={info.src}
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onLoadedMetadata={(e: any) => setTotal(e.currentTarget.duration || 0)}
        onTimeUpdate={(e: any) => setCurrent(e.currentTarget.currentTime || 0)}
        onEnded={() => setPlaying(false)}
        className="block max-h-[62vh] w-full bg-black"
        data-testid="video-foundation-lesson"
      />
      {/* شريط تحكم كبير الإصبع */}
      <div className="space-y-2 border-t border-white/10 bg-[#0a1c1b] p-3 pb-4">
        <input
          type="range"
          min={0}
          max={total || 0}
          step={0.5}
          value={current}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!total}
          aria-label="شريط التقدّم"
          className="h-11 w-full accent-[#d7b65e]"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggle} className="inline-flex min-h-[52px] min-w-[52px] items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-extrabold text-[#3a2c07] shadow-md active:scale-95" data-testid="button-foundation-video-play">
            {waiting ? <RefreshCw size={20} className="animate-spin" /> : playing ? <Pause size={20} /> : <Play size={20} />}
            {playing ? 'إيقاف' : 'تشغيل'}
          </button>
          <span className="rounded-xl bg-white/10 px-3 py-2 text-xs font-extrabold tabular-nums text-white">{fmt(current)} / {fmt(total)}</span>
          <span className="mr-auto" />
          <button type="button" onClick={() => { const v = ref.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10); }} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 active:bg-white/20" aria-label="رجوع 10 ثوانٍ"><ArrowRight size={19} /></button>
          <button type="button" onClick={() => { const v = ref.current; if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); }} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 active:bg-white/20" aria-label="تقدّم 10 ثوانٍ"><ArrowLeft size={19} /></button>
          <button type="button" onClick={goFull} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15 active:bg-white/20" aria-label="ملء الشاشة"><Maximize2 size={19} /></button>
        </div>
      </div>
      {caption ? <p className="border-t border-border bg-secondary/40 px-4 py-3 text-sm font-semibold leading-6 text-primary">{caption}</p> : null}
    </div>
  );
}

/* ──────────────────── عارض HTML مع ملء شاشة ───────────────────────────── */
function FoundationHtmlView({ content, fileUrl, title }: { content?: string; fileUrl?: string; title?: string }) {
  const [text, setText] = useState<string | null>(content || null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);

  // الحزم المضغوطة (موقع كامل) تُبنى داخل المتصفح قبل العرض — نفس محرك المعاينة
  const resolved = resolveLessonHtml({ htmlContent: content, htmlFileUrl: fileUrl });
  const bundleOn = !content && resolved.mode === 'bundle';
  const bundle = useBundleHtml(bundleOn ? resolved.url : null);
  const sourceOn = !content && resolved.mode === 'source';
  const source = useSourceContainer(sourceOn ? resolved.url : null);

  useEffect(() => {
    if (bundleOn) {
      setLoading(bundle.loading);
      if (bundle.error) { setFailed(true); return; }
      setFailed(false);
      if (bundle.html) setText(bundle.html);
      return;
    }
    if (sourceOn) {
      setLoading(!source.srcdoc && !source.error);
      if (source.error) { setFailed(true); return; }
      setFailed(false);
      if (source.srcdoc) setText(source.srcdoc);
      return;
    }
    if (content) { setText(content); setFailed(false); return; }
    if (!fileUrl) { setText(null); setFailed(false); return; }
    let live = true;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 25000);
    setLoading(true);
    fetch(fileUrl, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.text(); })
      .then((t) => { window.clearTimeout(timer); if (live) { setText(t.startsWith('ARDB64') ? decodeArdB64(t) : t); setFailed(false); } })
      .catch(() => { window.clearTimeout(timer); if (live) setFailed(true); })
      .finally(() => { window.clearTimeout(timer); if (live) setLoading(false); });
    return () => { live = false; window.clearTimeout(timer); ctrl.abort(); };
  }, [content, fileUrl, bundleOn, sourceOn, bundle.html, bundle.loading, bundle.error, source.srcdoc, source.error]);

  const body = failed
    ? <p className="p-8 text-center text-sm font-bold text-destructive">تعذر تحميل المحتوى — أعد رفع الملف أو الصق الكود مباشرة.</p>
    : loading || !text
      ? <p className="flex items-center justify-center gap-2.5 p-10 text-sm font-bold text-primary"><RefreshCw size={18} className="animate-spin" /> جارٍ تجهيز المحتوى...</p>
      : (
        <iframe
          title={title || 'محتوى الدرس التفاعلي'}
          sandbox={HTML_FRAME_SANDBOX}
          srcDoc={text}
          referrerPolicy="no-referrer"
          className="h-[62vh] min-h-[380px] w-full bg-white"
          style={{ zoom }}
        />
      );

  return (
    <>
      <div className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-md">
        <div className="flex items-center gap-2 border-b border-border bg-gradient-to-l from-secondary/80 to-card px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground"><FileCode2 size={14} /> المحتوى التفاعلي</span>
          <span className="mr-auto" />
          <span className="flex items-center gap-1 rounded-xl bg-background p-1 ring-1 ring-border">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))} className="grid h-10 w-10 place-items-center rounded-lg text-sm font-extrabold text-primary active:bg-secondary">أ-</button>
            <button type="button" onClick={() => setZoom(1)} className="min-w-12 rounded-lg px-1 text-xs font-extrabold tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))} className="grid h-10 w-10 place-items-center rounded-lg text-sm font-extrabold text-primary active:bg-secondary">أ+</button>
          </span>
          <button type="button" onClick={() => setFull(true)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground active:scale-95"><Maximize2 size={16} /> ملء الشاشة</button>
        </div>
        <div className="bg-white">{body}</div>
      </div>

      {full && text ? (
        <div className="fixed inset-0 z-[95] flex flex-col bg-gradient-to-b from-[#0d2926] to-[#081a19]" dir="rtl">
          <div className="flex items-center gap-2 px-3 py-3 sm:px-6">
            <button type="button" onClick={() => setFull(false)} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-extrabold text-white ring-1 ring-white/20 active:bg-white/20"><ChevronRight size={20} /> رجوع</button>
            <p className="mr-auto truncate text-sm font-extrabold text-white sm:text-base">{title || 'محتوى الدرس'}</p>
            <button type="button" onClick={() => setFull(false)} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 active:bg-white/20" aria-label="إغلاق"><X size={21} /></button>
          </div>
          <div className="min-h-0 flex-1 px-2 pb-2 sm:px-5 sm:pb-5">
            <div className="h-full overflow-hidden rounded-2xl bg-white shadow-2xl">
              <iframe title={title || 'محتوى الدرس'} sandbox={HTML_FRAME_SANDBOX} srcDoc={text} referrerPolicy="no-referrer" className="h-full w-full" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ══════════════ محتوى الدرس كما يراه الطالب (نفسه في معاينة الأستاذ) ══════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   عرض عنصر واحد من عناصر الدرس (طالب ومعاينة المعلم) — نفس الشكل هنا وهناك.
   ═══════════════════════════════════════════════════════════════════════ */

function FoundationBlockView({ block, lesson, compact = false, onOpenImages }: {
  block: LessonBlock;
  lesson: any;
  compact?: boolean;
  onOpenImages?: (images: string[], index: number) => void;
}) {
  if (block.type === 'text' && String(block.text || '').trim()) {
    return (
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="whitespace-pre-line font-serif text-[17px] font-medium leading-[2.1] text-primary">{String(block.text).trim()}</div>
      </div>
    );
  }
  if (block.type === 'images' && (block.images || []).filter(Boolean).length) {
    const images = (block.images || []).filter(Boolean);
    return (
      <div className="rounded-3xl border border-border p-5 shadow-sm">
        <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {images.map((src, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onOpenImages?.(images, idx)}
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-secondary active:scale-[.98]"
            >
              <img src={src} alt={`صورة ${idx + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-active:scale-105" />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-xl bg-black/55 px-2.5 py-1 text-[10px] font-extrabold text-white backdrop-blur-sm">
                <Maximize2 size={12} /> تكبير
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (block.type === 'video' && String(block.url || '').trim()) {
    return <FoundationVideoPlayer url={String(block.url).trim()} caption={block.caption} />;
  }
  if (block.type === 'html' && (String(block.html || '').trim() || String(block.fileUrl || '').trim())) {
    return <FoundationHtmlView content={String(block.html || '')} fileUrl={String(block.fileUrl || '')} title={lesson?.title} />;
  }
  if (block.type === 'document' && String(block.docUrl || '').trim()) {
    return <DocumentViewer url={String(block.docUrl)} name={block.docName} docType={block.docType} />;
  }
  return null;
}

function FoundationLessonBody({ lesson, compact = false }: { lesson: any; compact?: boolean }) {
  const [box, setBox] = useState<{ images: string[]; index: number } | null>(null);
  if (!lesson) return null;
  const images: string[] = Array.isArray(lesson.images) ? lesson.images.filter(Boolean) : [];
  const text = String(lesson.bodyText || '').trim();
  const video = String(lesson.videoUrl || '').trim();
  const html = String(lesson.htmlContent || '').trim();
  const htmlFile = String(lesson.htmlFileUrl || '').trim();
  const blocks = parseLessonBlocks(lesson.bodyText);

  // درس بالعناصر: يُعرض كل عنصر بترتيبه — نص، صور، فيديو، HTML/موقع
  if (blocks) {
    const hasVisible = blocks.some((b) =>
      (b.type === 'text' && String(b.text || '').trim()) ||
      (b.type === 'images' && (b.images || []).some(Boolean)) ||
      (b.type === 'video' && String(b.url || '').trim()) ||
      (b.type === 'html' && (String(b.html || '').trim() || String(b.fileUrl || '').trim())) ||
      (b.type === 'document' && String(b.docUrl || '').trim()),
    );
    return (
      <div className="space-y-6">
        {lesson.coverUrl ? (
          <div className="overflow-hidden rounded-3xl border border-border shadow-md">
            <img src={lesson.coverUrl} alt={lesson.title} className="max-h-[46vh] w-full object-cover" data-testid="img-foundation-cover" />
          </div>
        ) : null}

        {lesson.description ? (
          <p className="rounded-3xl border-r-4 border-accent bg-secondary/50 p-5 text-[15px] font-semibold leading-8 text-primary">{lesson.description}</p>
        ) : null}

        {blocks.map((b, i) => (
          <FoundationBlockView key={b.id || i} block={b} lesson={lesson} compact={compact} onOpenImages={(images, index) => setBox({ images, index })} />
        ))}

        {!hasVisible ? (
          <p className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            هذا الدرس لم يُملأ بعد — أنتظر الأستاذ.
          </p>
        ) : null}

        {box ? <FoundationLightbox images={box.images} start={box.index} onClose={() => setBox(null)} /> : null}
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {lesson.coverUrl ? (
        <div className="overflow-hidden rounded-3xl border border-border shadow-md">
          <img src={lesson.coverUrl} alt={lesson.title} className="max-h-[46vh] w-full object-cover" data-testid="img-foundation-cover" />
        </div>
      ) : null}

      {lesson.description ? (
        <p className="rounded-3xl border-r-4 border-accent bg-secondary/50 p-5 text-[15px] font-semibold leading-8 text-primary">{lesson.description}</p>
      ) : null}

      {text ? (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-primary"><BookOpen size={17} className="text-accent-foreground" /> نصّ الدرس</h3>
          <div className="whitespace-pre-line font-serif text-[17px] font-medium leading-[2.1] text-primary">{text}</div>
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="rounded-3xl border border-border p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-primary">
            <ImagePlus size={17} className="text-accent-foreground" /> صور الدرس
            <span className="rounded-lg bg-secondary px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-muted-foreground">{images.length}</span>
          </h3>
          <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
            {images.map((src, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setBox({ images, index: idx })}
                className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-secondary active:scale-[.98]"
                data-testid={`btn-foundation-img-${idx}`}
              >
                <img src={src} alt={`صورة ${idx + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-active:scale-105" />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-xl bg-black/55 px-2.5 py-1 text-[10px] font-extrabold text-white backdrop-blur-sm">
                  <Maximize2 size={12} /> تكبير
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {video ? <FoundationVideoPlayer url={video} caption={lesson.videoCaption} /> : null}

      {html || htmlFile ? <FoundationHtmlView content={html} fileUrl={htmlFile} title={lesson.title} /> : null}

      {!text && !images.length && !video && !html && !htmlFile ? (
        <p className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          هذا الدرس لم يُملأ بعد — أنتظر الأستاذ.
        </p>
      ) : null}

      {box ? <FoundationLightbox images={box.images} start={box.index} onClose={() => setBox(null)} /> : null}
    </div>
  );
}

/* ═══════════════════════ لوحة الأستاذ — إنشاء الأقسام ═══════════════════════ */
/** رسالة عائمة مثبّتة — لا تختفي مهما كان موضع التمرير على الآيباد */
function FoundationToast({ msg }: { msg: { text: string; tone: 'ok' | 'err' } | null }) {
  if (!msg) return null;
  const ok = msg.tone === 'ok';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[99] flex justify-center px-4 lg:bottom-8 lg:right-72" role="status" aria-live="assertive">
      <div className={`pointer-events-auto flex max-w-2xl items-start gap-3 rounded-2xl px-5 py-4 text-sm font-extrabold shadow-2xl animate-rise ${ok ? 'bg-primary text-primary-foreground' : 'border-2 border-white/20 bg-destructive text-destructive-foreground'}`} data-testid="foundation-toast">
        {ok ? <CheckCircle2 size={19} className="mt-0.5 shrink-0" /> : <CircleAlert size={19} className="mt-0.5 shrink-0" />}
        <span className="leading-6">{msg.text}</span>
      </div>
    </div>
  );
}

/** رسالة عائمة عامة — تُستخدم في كل صفحات الأستاذ بدل الشريط الصامت */
function Toast({ msg }: { msg: { text: string; tone: 'ok' | 'err' } | null }) {
  return <FoundationToast msg={msg} />;
}

/* ═══════════════════════════════════════════════════════════════════════
   لوحة الأستاذ — "إعداد التأسيس" كتدفّق واحد متصل
   ليس أقساماً منفصلة ولا كرتات: كل ما تضيفه ينزل في قائمة واحدة بالترتيب
   الذي تريده تماماً — نص تحت نص، صورة تحت صورة، فيديو تحتهم.
   ═══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   كتل الدرس: عناصر متعددة مرتبة داخل الدرس الواحد.
   ───────────────────────────────────────────────────────────────────────
   التخزين في body_text نفسه كمغلف JSON — بلا أعمدة جديدة:
     {"v":1,"blocks":[{"id":"b1","type":"text","text":"..."}, ...]}
   الدرس القديم (نص عادي لا يبدأ بـ {) يُقرأ كما كان. والمعاينة والقوائم
   تفهم المغلف تلقائياً.
   ═══════════════════════════════════════════════════════════════════════ */
type LessonBlock = {
  id: string;
  type: 'text' | 'images' | 'video' | 'html' | 'document';
  text?: string;
  images?: string[];
  url?: string;
  caption?: string;
  html?: string;
  fileUrl?: string;
  /** document block: رابط الملف المرفوع (PDF/PPTX/DOCX/DOC) */
  docUrl?: string;
  /** document block: اسم الملف الأصلي */
  docName?: string;
  /** document block: نوع المستند */
  docType?: 'pdf' | 'pptx' | 'docx' | 'doc';
};

function parseLessonBlocks(bodyText: unknown): LessonBlock[] | null {
  try {
    const raw = String(bodyText ?? '');
    if (!raw || raw[0] !== '{') return null;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1 || !Array.isArray(o.blocks)) return null;
    const out = (o.blocks as any[]).filter((b) => b && typeof b.type === 'string');
    return out.length ? (out as LessonBlock[]) : null;
  } catch {
    return null;
  }
}

function lessonBlocksEnvelope(blocks: LessonBlock[]): string {
  return JSON.stringify({ v: 1, blocks });
}

function newBlockId(): string {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** درس قديم أحادي المحتوى → كتل (بنفس ترتيب عرضه القديم) */
function legacyLessonToBlocks(l: any): LessonBlock[] {
  const blocks: LessonBlock[] = [];
  if (!parseLessonBlocks(l?.bodyText)) {
    const text = String(l?.bodyText || '').trim();
    if (text) blocks.push({ id: newBlockId(), type: 'text', text });
  }
  const images = Array.isArray(l?.images) ? (l.images as string[]).filter(Boolean) : [];
  if (images.length) blocks.push({ id: newBlockId(), type: 'images', images });
  if (String(l?.videoUrl || '').trim()) {
    blocks.push({ id: newBlockId(), type: 'video', url: String(l.videoUrl).trim(), caption: String(l?.videoCaption || '') });
  }
  if (String(l?.htmlContent || '').trim() || String(l?.htmlFileUrl || '').trim()) {
    blocks.push({ id: newBlockId(), type: 'html', html: String(l?.htmlContent || ''), fileUrl: String(l?.htmlFileUrl || '') });
  }
  return blocks;
}

const LESSON_BLOCK_TYPES = [
  { id: 'text', label: 'نص', hint: 'فقرة شرح', Icon: FileText, tone: '#17413f' },
  { id: 'images', label: 'صور', hint: 'معرض صور', Icon: ImagePlus, tone: '#a85d3d' },
  { id: 'video', label: 'فيديو', hint: 'رفع أو رابط', Icon: Video, tone: '#0d47a1' },
  { id: 'html', label: 'HTML / موقع', hint: 'كود أو ملف أو حزمة', Icon: FileCode2, tone: '#6a1b9a' },
  { id: 'document', label: 'مستند', hint: 'PDF · بوربوينت · وورد', Icon: FileText, tone: '#c62828' },
] as const;

/* ═══════════════════════════════════════════════════════════════════════
   صفحة الدرس (المعلم): يفتح الدرس لحاله، ويضيف فيه عناصر متعددة
   (نص، صور، فيديو، HTML/موقع مضغوط) ويرتبها ويعدلها — ثم يحفظ مرة واحدة.
   تحت المحرر معاينة حية كما سيراها الطالب تماماً.
   ═══════════════════════════════════════════════════════════════════════ */
function TeacherFoundationLessonPage() {
  const [, setLocation] = useLocation();
  const { lessonId = '' } = useParams();
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [blocks, setBlocks] = useState<LessonBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [readingHtml, setReadingHtml] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const full = await jsonFetch(`/api/teacher/foundation/lessons/${lessonId}`);
      setLesson(full);
      setTitle(String(full.title || ''));
      setDescription(String(full.description || ''));
      setIsVisible(full.isVisible !== false);
      setIsLocked(!!full.isLocked);
      setBlocks(parseLessonBlocks(full.bodyText) || legacyLessonToBlocks(full));
      setDirty(false);
    } catch (e: any) {
      setErr(e?.message || 'تعذر فتح الدرس');
      setLesson(null);
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => { void load(); }, [load]);

  const touch = () => setDirty(true);
  const patchBlock = (id: string, patch: Partial<LessonBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    touch();
  };
  const moveBlock = (id: string, dir: 1 | -1) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    touch();
  };
  const removeBlock = (id: string) => {
    if (!window.confirm('حذف هذا العنصر من الدرس؟')) return;
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    touch();
  };
  const duplicateBlock = (id: string) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      if (i < 0) return prev;
      const copy = { ...prev[i], id: newBlockId(), images: prev[i].images ? [...prev[i].images!] : undefined };
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
    touch();
  };
  const addBlock = (type: LessonBlock['type']) => {
    const base: LessonBlock = { id: newBlockId(), type };
    if (type === 'images') base.images = [];
    setBlocks((prev) => [...prev, base]);
    setShowAdd(false);
    touch();
  };

  const addImagesToBlock = async (id: string, files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/')).slice(0, 10);
    if (!list.length) return;
    setUploadingImg(true);
    try {
      for (const f of list) {
        const r = await uploadFileToCloud(f, '/ard-al-lughah/lessons');
        if (r?.url) setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, images: [...(b.images || []), r.url] } : b)));
      }
      touch();
    } finally {
      setUploadingImg(false);
    }
  };

  const readHtmlIntoBlock = async (id: string, file?: File | null) => {
    if (!file) return;
    setReadingHtml(true);
    try {
      const text = await readTextFile(file);
      patchBlock(id, { html: text, fileUrl: '' });
    } finally {
      setReadingHtml(false);
    }
  };

  const save = async () => {
    const t = title.trim();
    if (!t) { setErr('اكتب عنوان الدرس أولاً.'); return; }
    setSaving(true);
    setErr('');
    try {
      const types = [...new Set(blocks.map((b) => b.type))];
      await jsonFetch(`/api/teacher/foundation/lessons/${lessonId}`, {
        method: 'PATCH',
        body: {
          title: t,
          description: description.trim(),
          bodyText: lessonBlocksEnvelope(blocks),
          kind: types.length === 1 ? types[0] : types.length ? 'mixed' : 'text',
          isVisible,
          isLocked,
        },
      });
      setDirty(false);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'تعذر حفظ الدرس');
    } finally {
      setSaving(false);
    }
  };

  const draftLesson = lesson
    ? { ...lesson, title: title || lesson.title, bodyText: lessonBlocksEnvelope(blocks) }
    : null;

  return (
    <Shell mode="teacher">
      {/* مسار + حفظ */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => setLocation('/teacher/foundation')} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-extrabold text-muted-foreground transition-colors hover:text-primary" data-testid="button-back-foundation">
          <ArrowRight size={16} /> التأسيس
        </button>
        <span className="text-sm font-bold text-muted-foreground">صفحة الدرس — أضف عناصره ورتبها ثم احفظ</span>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {dirty ? (
            <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-[11px] font-extrabold text-amber-800">تغييرات غير محفوظة</span>
          ) : null}
          <button type="button" onClick={save} disabled={saving || loading} className={`${touchBtnPrimary} px-6`} data-testid="button-save-lesson-page">
            {saving ? <><RefreshCw size={17} className="animate-spin" /> جارٍ الحفظ...</> : <><Save size={17} /> حفظ الدرس</>}
          </button>
        </span>
      </div>

      {loading ? <StateNotice type="loading" /> : err && !lesson ? (
        <StateNotice type="error" onRetry={() => load()} />
      ) : (
        <>
          {err ? (
            <p className="mb-4 flex items-start gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-extrabold text-destructive">
              <CircleAlert size={17} className="mt-0.5 shrink-0" /> {err}
            </p>
          ) : null}

          {/* عنوان الدرس + ظهور/قفل */}
          <div className="rounded-[2rem] border border-border bg-card p-5 shadow-sm">
            <label className="block">
              <span className="mb-2 block text-sm font-extrabold text-primary">عنوان الدرس</span>
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); touch(); }}
                placeholder="مثال: أقسام الكلمة"
                className={`${touchCls} font-display text-lg font-extrabold`}
                data-testid="input-lesson-page-title"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-extrabold text-primary">وصف قصير (اختياري)</span>
              <input
                value={description}
                onChange={(e) => { setDescription(e.target.value); touch(); }}
                placeholder="سطر يظهر تحت العنوان عند الطالب"
                className={touchCls}
              />
            </label>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <button type="button" onClick={() => { setIsVisible((v) => !v); touch(); }} className={`flex min-h-[56px] items-center gap-2.5 rounded-2xl border-2 p-3.5 text-right ${isVisible ? 'border-primary bg-primary/8' : 'border-border bg-background'}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${isVisible ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {isVisible ? <Check size={16} /> : <EyeOff size={15} />}
                </span>
                <span className="text-sm font-extrabold text-primary">{isVisible ? 'ظاهر للطلاب' : 'مخفي عن الكل'}</span>
              </button>
              <button type="button" onClick={() => { setIsLocked((v) => !v); touch(); }} className={`flex min-h-[56px] items-center gap-2.5 rounded-2xl border-2 p-3.5 text-right ${isLocked ? 'border-[#b7791f] bg-[#b7791f]/10' : 'border-border bg-background'}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${isLocked ? 'bg-[#b7791f] text-white' : 'bg-muted text-muted-foreground'}`}>
                  {isLocked ? <Lock size={15} /> : <LockOpen size={15} />}
                </span>
                <span className="text-sm font-extrabold text-primary">{isLocked ? 'مقفل مؤقتاً' : 'مفتوح'}</span>
              </button>
            </div>
          </div>

          {/* العناصر */}
          <div className="mb-3 mt-7 flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-primary">
              <Layers size={20} /> عناصر الدرس
            </h2>
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-extrabold tabular-nums text-primary" data-testid="lesson-block-count">
              {blocks.length}
            </span>
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className={`${touchBtnAccent} mr-auto px-5 text-sm`}
              data-testid="button-add-lesson-block"
            >
              <Plus size={18} /> ➕ إضافة عنصر في الدرس
            </button>
          </div>

          {showAdd ? (
            <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="add-block-menu">
              {LESSON_BLOCK_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addBlock(t.id)}
                  data-testid={`button-add-block-${t.id}`}
                  className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[.98]"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm" style={{ background: t.tone }}>
                    <t.Icon size={19} />
                  </span>
                  <span className="text-sm font-extrabold text-primary">{t.label}</span>
                  <span className="text-[10px] font-bold text-muted-foreground">{t.hint}</span>
                </button>
              ))}
            </div>
          ) : null}

          {!blocks.length ? (
            <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-14 text-center">
              <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><Layers size={30} /></span>
              <p className="font-display text-xl font-bold text-primary">الدرس فارغ — أضف أول عنصر</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
                نصاً للشرح، صوراً، فيديو، أو صفحة HTML/موقعاً مضغوطاً — رتبها كما تريد وستظهر للطالب بنفس الترتيب.
              </p>
              <button type="button" onClick={() => setShowAdd(true)} className={`${touchBtnPrimary} mt-6 px-6`}>
                <Plus size={18} /> إضافة عنصر
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {blocks.map((b, i) => (
                <LessonBlockCard
                  key={b.id}
                  block={b}
                  index={i}
                  total={blocks.length}
                  onPatch={(p) => patchBlock(b.id, p)}
                  onMove={(d) => moveBlock(b.id, d)}
                  onRemove={() => removeBlock(b.id)}
                  onDuplicate={() => duplicateBlock(b.id)}
                  onAddImages={(files) => addImagesToBlock(b.id, files)}
                  onReadHtml={(f) => readHtmlIntoBlock(b.id, f)}
                  uploadingImg={uploadingImg}
                  readingHtml={readingHtml}
                />
              ))}
            </div>
          )}

          {/* معاينة حية كما سيراها الطالب */}
          {draftLesson ? (
            <div className="mt-8">
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold text-primary">
                <Eye size={20} /> معاينة حية — كما سيراها الطالب
              </h2>
              <div className="rounded-[2rem] border border-border bg-background p-4 sm:p-6">
                <FoundationLessonBody lesson={{ ...draftLesson, id: `${draftLesson.id}-preview` }} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </Shell>
  );
}

/** بطاقة عنصر واحد داخل صفحة الدرس: محرره + ترتيبه */
function LessonBlockCard({ block, index, total, onPatch, onMove, onRemove, onDuplicate, onAddImages, onReadHtml, uploadingImg, readingHtml }: {
  block: LessonBlock;
  index: number;
  total: number;
  onPatch: (p: Partial<LessonBlock>) => void;
  onMove: (d: 1 | -1) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onAddImages: (files: FileList | null) => void;
  onReadHtml: (f?: File | null) => void;
  uploadingImg: boolean;
  readingHtml: boolean;
}) {
  const meta = LESSON_BLOCK_TYPES.find((t) => t.id === block.type) || LESSON_BLOCK_TYPES[0];
  const images = block.images || [];
  return (
    <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm" data-testid={`lesson-block-${block.id}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/40 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold tabular-nums text-white" style={{ background: meta.tone }}>
          {index + 1}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-primary">
          <meta.Icon size={16} style={{ color: meta.tone }} /> عنصر {meta.label}
        </span>
        <span className="ms-auto flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary active:bg-secondary disabled:opacity-25" aria-label="تقديم العنصر" data-testid={`button-block-up-${block.id}`}>
            <ArrowUp size={17} />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary active:bg-secondary disabled:opacity-25" aria-label="تأخير العنصر" data-testid={`button-block-down-${block.id}`}>
            <ArrowDown size={17} />
          </button>
          <button type="button" onClick={onDuplicate} className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary" aria-label="تكرار العنصر" title="تكرار">
            <Copy size={16} />
          </button>
          <button type="button" onClick={onRemove} className="grid h-10 w-10 place-items-center rounded-xl text-destructive hover:bg-destructive/10" aria-label="حذف العنصر" data-testid={`button-block-del-${block.id}`}>
            <Trash2 size={16} />
          </button>
        </span>
      </div>

      <div className="p-4">
        {block.type === 'text' ? (
          <textarea
            value={block.text || ''}
            onChange={(e) => onPatch({ text: e.target.value })}
            rows={6}
            placeholder="اكتب فقرة الشرح هنا..."
            className={`${touchCls} resize-y font-serif text-[17px] leading-9`}
            data-testid={`input-block-text-${block.id}`}
          />
        ) : null}

        {block.type === 'images' ? (
          <div>
            {images.length ? (
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((src, i) => (
                  <div key={`${src}-${i}`} className="group relative overflow-hidden rounded-xl border border-border">
                    <img src={src} alt={`صورة ${i + 1}`} loading="lazy" className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => onPatch({ images: images.filter((_, x) => x !== i) })}
                      className="absolute left-1 top-1 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white active:bg-destructive"
                      aria-label={`حذف الصورة ${i + 1}`}
                    >
                      <X size={14} />
                    </button>
                    <span className="absolute bottom-1 right-1 grid h-6 min-w-6 place-items-center rounded-md bg-black/60 px-1 text-[10px] font-extrabold tabular-nums text-white">{i + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-3 rounded-xl bg-secondary/50 px-4 py-4 text-center text-xs text-muted-foreground">لا صور بعد — ارفع من جهازك</p>
            )}
            <label className={`inline-flex min-h-[52px] cursor-pointer items-center gap-2 rounded-2xl bg-secondary px-5 text-sm font-extrabold text-primary transition-colors hover:bg-accent/40 ${uploadingImg ? 'pointer-events-none opacity-60' : ''}`}>
              {uploadingImg ? <RefreshCw size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {uploadingImg ? 'جارٍ الرفع...' : 'رفع صور من الجهاز'}
              <input
                type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { onAddImages(e.target.files); e.target.value = ''; }}
              />
            </label>
          </div>
        ) : null}

        {block.type === 'video' ? (
          <div className="space-y-3">
            <FoundationVideoUploader
              value={block.url || ''}
              onUploaded={(url) => onPatch({ url })}
            />
            <Field2 label="أو الصق رابطاً" hint="يوتيوب أو Vimeo أو mp4 مباشر">
              <input
                value={block.url || ''}
                onChange={(e) => onPatch({ url: e.target.value })}
                dir="ltr" placeholder="https://..."
                className={`${touchCls} font-mono text-sm`}
                data-testid={`input-block-video-${block.id}`}
              />
            </Field2>
            <Field2 label="تعليق تحت الفيديو (اختياري)">
              <input
                value={block.caption || ''}
                onChange={(e) => onPatch({ caption: e.target.value })}
                placeholder="سطر يظهر تحت الفيديو"
                className={touchCls}
              />
            </Field2>
            {block.url ? <FoundationVideoPlayer url={block.url} caption={block.caption} /> : null}
          </div>
        ) : null}

        {block.type === 'document' ? (
          <DocumentBlockEditor block={block} onPatch={onPatch} />
        ) : null}

        {block.type === 'html' ? (
          <div className="space-y-3">
            <Field2 label="كود HTML مباشر (اختياري)" hint="الصقه هنا إن كان عندك">
              <textarea
                value={block.html || ''}
                onChange={(e) => onPatch({ html: e.target.value, fileUrl: '' })}
                rows={5} dir="ltr" spellCheck={false}
                placeholder="<html>...</html>"
                className={`${touchCls} resize-y font-mono text-xs leading-6`}
                data-testid={`input-block-html-${block.id}`}
              />
            </Field2>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`inline-flex min-h-[52px] cursor-pointer items-center gap-2 rounded-2xl bg-secondary px-5 text-sm font-extrabold text-primary hover:bg-accent/40 ${readingHtml ? 'pointer-events-none opacity-60' : ''}`}>
                {readingHtml ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                {readingHtml ? 'جارٍ القراءة...' : 'قراءة ملف HTML من الجهاز'}
                <input
                  type="file" accept=".html,.htm,text/html" className="hidden"
                  onChange={(e) => { onReadHtml(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>
            <FoundationBundleUploader
              value={block.fileUrl || ''}
              onUploaded={(url) => onPatch({ fileUrl: url, html: '' })}
            />
            {(block.html || block.fileUrl) ? (
              <div>
                <p className="mb-2 text-xs font-extrabold text-primary">معاينة الصفحة</p>
                <HtmlPreviewFrame content={block.html} fileUrl={block.fileUrl} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TeacherFoundationPage() {
  // الصفوف والمدارس تأتي من قاعدة البيانات — يشترك هنا ليعيد الرسم فور تغيّرها
  useCatalog();
  const [sections, setSections] = useState<any[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const [activeSection, setActiveSection] = useState<string>('');
  const [showMembers, setShowMembers] = useState(false);

  const [sectionModal, setSectionModal] = useState<null | { mode: 'create' } | { mode: 'edit'; section: any }>(null);
  const [sectionForm, setSectionForm] = useState<any>({});
  const [savingSection, setSavingSection] = useState(false);
  const [formError, setFormError] = useState('');

  const [, setLocation] = useLocation();

  // درس جديد: عنوان فقط هنا، والمحتوى (عناصره) داخل صفحته
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createForSection, setCreateForSection] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState('');
  const flash = (text: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast((prev) => (prev?.text === text ? null : prev)), tone === 'err' ? 6000 : 3000);
  };

  /** تحديث صامت بعد أول تحميل: لا نُخفي الصفحة ولا نقفز بمكان التمرير */
  const reload = (silent = true) => {
    if (!silent) setBootLoading(true);
    return jsonFetch('/api/teacher/foundation/stream')
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setSections(list);
        setActiveSection((prev) => (prev && list.some((s: any) => s.id === prev) ? prev : (list[0]?.id || '')));
        return list;
      })
      .catch((e) => {
        setSections([]);
        flash(e?.message || 'تعذر تحميل محتوى التأسيس — تحقّق من تسجيل الدخول', 'err');
        return [] as any[];
      })
      .finally(() => setBootLoading(false));
  };
  useEffect(() => { reload(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const totalLessons = sections.reduce((a, s) => a + (s.lessonsCount || 0), 0);
  const current = sections.find((s) => s.id === activeSection) || null;
  // دروس المستوى كلّها بترتيبها — بلا طبقة وسطى، فالطالب يراها هكذا أيضاً
  const visibleLessons: any[] = current
    ? (Array.isArray(current.units) && current.units.length
        ? current.units.flatMap((u: any) => (Array.isArray(u.lessons) ? u.lessons : []))
        : (Array.isArray(current.lessons) ? current.lessons : [])
      ).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    : [];

  const moveSection = async (s: any, dir: 'up' | 'down') => {
    try { await jsonFetch('/api/teacher/foundation/sections/reorder', { method: 'POST', body: { id: s.id, dir } }); await reload(); }
    catch (err: any) { flash(err?.message || 'تعذرت إعادة ترتيب الأقسام', 'err'); }
  };

  /* ── المستويات: القسم الجديد سرّي افتراضياً — لا يراه أحد حتى تفتحه ── */
  const openSectionCreate = () => {
    setSectionForm({
      title: '', subtitle: '', description: '',
      color: FOUNDATION_COLORS[sections.length % FOUNDATION_COLORS.length],
      icon: 'sparkles', isLocked: false, isVisible: false, isPublished: true,
    });
    setFormError('');
    setSectionModal({ mode: 'create' });
  };
  const openSectionEdit = (s: any) => {
    setSectionForm({ title: s.title, subtitle: s.subtitle, description: s.description, color: s.color, icon: s.icon, isLocked: s.isLocked, isVisible: s.isVisible, isPublished: s.isPublished });
    setFormError('');
    setSectionModal({ mode: 'edit', section: s });
  };
  const saveSection = async (e: FormEvent) => {
    e.preventDefault();
    const title = String(sectionForm.title || '').trim();
    if (!title) { setFormError('اكتب عنوان الفاصل أولاً — بلا عنوان لا نعرف أين يوضع.'); return; }
    setSavingSection(true);
    setFormError('');
    try {
      if (sectionModal?.mode === 'create') {
        const r = await jsonFetch('/api/teacher/foundation/sections', { method: 'POST', body: { ...sectionForm, title } });
        const newId = r?.section?.id;
        if (newId) {
          setActiveSection(newId);
          flash(`تم إنشاء «${title}» — ابدأ أضف الدروس تحته`);
        } else {
          const list = await reload();
          const hit = list.find((s: any) => s.title === title);
          if (hit) setActiveSection(hit.id);
          flash('تم إنشاء الفاصل');
        }
      } else if (sectionModal?.mode === 'edit') {
        await jsonFetch(`/api/teacher/foundation/sections/${sectionModal.section.id}`, { method: 'PATCH', body: { ...sectionForm, title } });
        await reload();
        flash('تم حفظ الفاصل');
      }
      setSectionModal(null);
      await reload();
    } catch (err: any) {
      const m = err?.message || 'تعذر الحفظ';
      setFormError(m);
      flash(m, 'err');
    } finally { setSavingSection(false); }
  };
  const quickSection = async (s: any, patch: any) => {
    try { await jsonFetch(`/api/teacher/foundation/sections/${s.id}`, { method: 'PATCH', body: patch }); await reload(); flash('تم التحديث'); }
    catch (err: any) { flash(err?.message || 'تعذر التعديل', 'err'); }
  };
  const removeSection = async (s: any) => {
    if (!window.confirm(`حذف الفاصل «${s.title}» وكل دروسه (${s.lessonsCount})؟`)) return;
    try { await jsonFetch(`/api/teacher/foundation/sections/${s.id}`, { method: 'DELETE' }); await reload(); flash('تم الحذف'); }
    catch (err: any) { flash(err?.message || 'تعذر الحذف', 'err'); }
  };

  /* ── الدروس: كل درس له صفحة مستقلة — الدخول من عنوانه أو قلمه ── */
  const openLessonPage = (l: any) => {
    if (!l?.id) return;
    setLocation(`/teacher/foundation/lesson/${l.id}`);
  };

  /* ── درس جديد: العنوان فقط هنا، ثم تُفتح صفحته لإضافة عناصره ── */
  const openLessonCreate = (sectionId?: string) => {
    // لا نهاية ميتة: إن لم يوجد قسم ننشئ واحداً فوراً بدل رسالة "أنشئ قسماً"
    const target = sectionId || activeSection || sections[0]?.id || '';
    if (!target) {
      setSectionForm({ title: 'التأسيس', color: FOUNDATION_COLORS[0], isLocked: false, isVisible: true });
      setFormError('');
      setSectionModal({ mode: 'create' });
      flash('أنشئ قسماً أولاً — بعد حفظه ستنتقل مباشرة لإضافة الدروس', 'err');
      return;
    }
    setCreateTitle('');
    setCreateError('');
    setCreateForSection(target);
    setCreatingLesson(true);
  };

  const submitLessonCreate = async (e: FormEvent) => {
    e.preventDefault();
    const title = createTitle.trim();
    if (!title) { setCreateError('اكتب عنوان الدرس أولاً.'); return; }
    setSavingCreate(true);
    setCreateError('');
    try {
      const created = await jsonFetch('/api/teacher/foundation/lessons', {
        method: 'POST',
        body: { title, sectionId: createForSection },
      });
      const newId = created?.lesson?.id;
      setCreatingLesson(false);
      await reload();
      if (newId) {
        flash(`تم إنشاء «${title}» — أضف عناصره الآن`);
        setLocation(`/teacher/foundation/lesson/${newId}`);
      } else {
        flash(`تم إنشاء «${title}»`);
      }
    } catch (err: any) {
      const m = err?.message || 'تعذر إنشاء الدرس';
      setCreateError(m);
      flash(m, 'err');
    } finally {
      setSavingCreate(false);
    }
  };

  return (
    <Shell mode="teacher">
      <SectionHero
        eyebrow="المستوى ثم مواضيعه ثم الدرس"
        title="إعداد التأسيس"
        body="الطالب يفتح المستوى فيرى مواضيعه مرقّمة، ويفتح الموضوع فيقرأ الدرس في صفحة مستقلة. أنت تتحكّم بالترتيب بالأسهم، وتحرّر كل درس بما تريد — نصاً أو صوراً أو فيديو أو HTML."
        action={
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={openSectionCreate} className={touchBtnSoft} data-testid="button-add-foundation-section"><Layers size={18} /> مستوى جديد</button>
            <button type="button" onClick={() => openLessonCreate()} className={touchBtnAccent} data-testid="button-add-foundation-lesson"><Plus size={20} /> أضف درساً</button>
          </div>
        }
        stats={[
          { value: sections.length, label: 'مستوى' },
          { value: totalLessons, label: 'موضوع ودرس' },
          { value: sections.reduce((a, s) => a + (s.memberCount || 0), 0), label: 'عضو في المستويات' },
          { value: sections.filter((s) => s.isVisible).length, label: 'ظاهر للطالب' },
        ]}
      />

      <FoundationToast msg={toast} />

      {bootLoading ? <StateNotice type="loading" /> : (
        <div className="space-y-6">
          {/* ═══ شريط المستويات — زر «من يرى التأسيس؟» يفتح النافذة ═══ */}
          {sections.length ? (
            <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
              <div className="flex flex-col gap-3 bg-gradient-to-l from-primary to-[#2a7a72] p-5 text-white sm:flex-row sm:items-center sm:p-6">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 shadow-lg backdrop-blur-sm"><Layers size={28} /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-extrabold sm:text-2xl">المستويات</h2>
                  <p className="mt-1 text-sm leading-6 text-white/85">
                    اختر المستوى لترى مواضيعه وتحرّر دروسه — ورتّب المستويات بالأسهم.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMembers(true)}
                  className="inline-flex min-h-[56px] shrink-0 items-center justify-center gap-2.5 rounded-2xl bg-white px-6 text-base font-extrabold text-[#16383c] shadow-lg transition-all hover:-translate-y-0.5 active:scale-[.97]"
                  data-testid="button-toggle-foundation-members"
                >
                  <UsersRound size={20} />
                  من يرى التأسيس؟
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 p-4">
                {sections.map((s: any, si: number) => {
                  const hidden = s.isVisible === false;
                  const locked = !!s.isLocked;
                  return (
                  <span key={s.id} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setActiveSection(s.id)}
                      data-testid={`button-pick-section-${s.id}`}
                      title={hidden ? 'مخفي عن الكل — لا يراه أي طالب' : locked ? 'مقفل — يرى الطلاب الاسم فقط' : 'ظاهر للطلاب الأعضاء'}
                      className={`inline-flex min-h-[56px] items-center gap-2.5 rounded-2xl px-5 text-sm font-extrabold transition-all active:scale-[.97] ${
                        activeSection === s.id
                          ? 'text-white shadow-lg'
                          : 'border-2 bg-card hover:border-primary/35'
                      } ${hidden ? 'border-dashed border-muted-foreground/50 text-muted-foreground' : 'border-border text-muted-foreground'}`}
                      style={activeSection === s.id ? { background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)` } : undefined}
                    >
                      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="text-right leading-tight">
                        <span className="block text-[11px] opacity-85">{s.subtitle || `م${si + 1}`}</span>
                        <span className="block">{s.title}</span>
                      </span>
                      {/* شارة الحالة — تُقرأ بنظرة واحدة */}
                      {hidden ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[10px] font-extrabold text-muted-foreground">
                          <EyeOff size={12} /> مخفي
                        </span>
                      ) : locked ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#b7791f]/15 px-2 py-1 text-[10px] font-extrabold text-[#b7791f]">
                          <Lock size={12} /> مقفل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-green-600/12 px-2 py-1 text-[10px] font-extrabold text-green-800">
                          <Eye size={12} /> ظاهر
                        </span>
                      )}
                      <span className="rounded-lg bg-black/10 px-2 py-0.5 text-[10px] font-extrabold tabular-nums opacity-80">{s.lessonsCount}</span>
                    </button>
                    {/* الإخفاء/القفل بضغطة واحدة — بلا نافذة وبلا حفظ */}
                    <span className="ms-1 flex flex-col items-center gap-0.5">
                      <span className="flex">
                        <button type="button" onClick={() => moveSection(s, 'up')} disabled={si === 0} className="grid h-5 w-6 place-items-center rounded text-muted-foreground disabled:opacity-20" aria-label="تقديم المستوى"><ArrowUp size={12} /></button>
                        <button type="button" onClick={() => quickSection(s, { isVisible: !s.isVisible })} className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${hidden ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary'}`} aria-label={hidden ? 'إظهار المستوى' : 'إخفاء المستوى عن الكل'} title={hidden ? 'إظهار' : 'إخفاء عن الكل'}>
                          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </span>
                      <span className="flex">
                        <button type="button" onClick={() => moveSection(s, 'down')} disabled={si === sections.length - 1} className="grid h-5 w-7 place-items-center rounded text-muted-foreground disabled:opacity-20" aria-label="تأخير المستوى"><ArrowDown size={12} /></button>
                        <button type="button" onClick={() => quickSection(s, { isLocked: !s.isLocked })} className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${locked ? 'bg-[#b7791f]/20 text-[#b7791f]' : 'text-muted-foreground hover:bg-secondary'}`} aria-label={locked ? 'فتح القفل' : 'قفل المستوى'} title={locked ? 'فتح' : 'قفل'}>
                          {locked ? <LockOpen size={14} /> : <Lock size={14} />}
                        </button>
                      </span>
                    </span>
                  </span>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ═══ المواضيع: العشرة دروس التي يراها الطالب تحت المستوى ═══ */}
          <section>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-primary">
                <NotebookPen size={20} />
                {current ? `مواضيع «${current.subtitle || current.title}»` : 'المواضيع'}
              </h2>
              <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-extrabold tabular-nums text-primary">{visibleLessons.length}</span>
              <button type="button" onClick={() => openLessonCreate(activeSection)} className={`${touchBtnAccent} mr-auto px-5 text-sm`} data-testid="button-add-lesson-here">
                <Plus size={18} /> أضف درساً
              </button>
            </div>

            {!sections.length ? (
              <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
                <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-primary to-[#2a7a72] text-primary-foreground shadow-lg"><NotebookPen size={30} /></span>
                <p className="font-display text-xl font-bold text-primary">ابدأ أول مستوى</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">المستوى هو الصفحة الأولى التي يراها الطالب. أنشئ واحداً ثم ضع فيه مواضيعه ودروسه.</p>
                <button type="button" onClick={openSectionCreate} className={`${touchBtnPrimary} mt-6`}><Plus size={20} /> أنشئ مستوىً</button>
              </div>
            ) : !visibleLessons.length ? (
              <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
                <p className="font-display text-xl font-bold text-primary">لا مواضيع في هذا المستوى بعد</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
                  الدرس يحوي نصاً وصوراً وفيديو وHTML — اكتب ما تريد فيه وستظهر للطالب كما هي.
                </p>
                <button type="button" onClick={() => openLessonCreate(activeSection)} className={`${touchBtnSoft} mt-6 px-6 text-sm`}>
                  <Plus size={18} /> أضف أول درس
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
                <ol className="divide-y divide-border">
                  {visibleLessons.map((l: any, idx: number) => {
                    const meta = FOUNDATION_KINDS[l.kind] || FOUNDATION_KINDS.text;
                    const KIcon = meta.Icon;
                    return (
                      <li key={l.id} className={`flex items-center gap-3 px-3 py-3 transition-colors active:bg-secondary/40 sm:gap-4 sm:px-5 ${l.isVisible ? '' : 'opacity-55'}`}>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold text-white" style={{ background: meta.tone }}>{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => openLessonPage(l)}
                          className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border active:scale-95"
                          style={{ background: l.coverUrl ? undefined : `${meta.tone}18` }}
                          aria-label="معاينة"
                        >
                          {l.coverUrl
                            ? <img src={l.coverUrl} alt="" className="h-full w-full object-cover" />
                            : <KIcon size={20} style={{ color: meta.tone }} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-lg px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: meta.tone }}>{meta.label}</span>
                            {l.htmlContent || l.htmlFileUrl ? <span className="rounded-lg bg-[#6a1b9a]/12 px-2 py-0.5 text-[10px] font-extrabold text-[#6a1b9a]">HTML</span> : null}
                            {l.isLocked ? <span className="rounded-lg bg-[#b7791f]/15 px-2 py-0.5 text-[10px] font-extrabold text-[#b7791f]">مقفل</span> : null}
                            {!l.isVisible ? <span className="rounded-lg bg-muted px-2 py-0.5 text-[10px] font-extrabold text-muted-foreground">مخفي</span> : null}
                          </div>
                          <button type="button" onClick={() => openLessonPage(l)} className="mt-1 block max-w-full truncate text-right text-[15px] font-extrabold text-primary underline-offset-4 hover:underline" title="ادخل للدرس وعدل محتواه">{l.title}</button>
                          {l.textPreview ? <p className="mt-0.5 line-clamp-1 text-[11px] leading-5 text-muted-foreground">{l.textPreview}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-center gap-0.5">
                          <button type="button" onClick={() => move(l, 'up')} disabled={idx === 0} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary disabled:opacity-25" aria-label="تقديم"><ArrowUp size={15} /></button>
                          <button type="button" onClick={() => move(l, 'down')} disabled={idx === visibleLessons.length - 1} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground active:bg-secondary disabled:opacity-25" aria-label="تأخير"><ArrowDown size={15} /></button>
                        </div>
                        <div className="grid shrink-0 grid-cols-2 gap-1">
                          <button type="button" onClick={() => openLessonPage(l)} className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary active:bg-accent/40" aria-label="معاينة"><Eye size={16} /></button>
                          <button type="button" onClick={() => openLessonPage(l)} className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary active:bg-accent/40" aria-label="تعديل" data-testid={`button-edit-lesson-${l.id}`}><Pencil size={16} /></button>
                          <button type="button" onClick={() => quickLesson(l, { isLocked: !l.isLocked })} className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-muted-foreground active:bg-accent/40" aria-label="قفل">{l.isLocked ? <LockOpen size={16} /> : <Lock size={16} />}</button>
                          <button type="button" onClick={() => removeLesson(l)} className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-destructive active:bg-destructive/10" aria-label="حذف"><Trash2 size={16} /></button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </section>
        </div>
      )}

      {/* نافذة «من يرى التأسيس؟» — الزر الوحيد يفتحها، والحفظ فوري */}
      <FoundationMembersModal open={showMembers} onClose={() => setShowMembers(false)} flash={flash} />

      {sectionModal ? (
        <Modal title={sectionModal.mode === 'create' ? 'فاصل جديد في التدفّق' : 'تعديل الفاصل'} eyebrow="فاصل تنظيمي فقط — الطالب لا يفتحه" onClose={() => setSectionModal(null)} maxWidth="max-w-3xl">
          <form onSubmit={saveSection} className="space-y-5 pb-4">
            <div className="relative overflow-hidden rounded-3xl p-5 shadow-lg" style={{ background: `linear-gradient(135deg, ${sectionForm.color || '#17413f'}, ${sectionForm.color || '#17413f'}bb)` }}>
              <div className="pointer-events-none absolute -left-6 -top-8 select-none font-display text-[6rem] leading-none text-white/15">ف</div>
              <div className="relative flex items-center gap-4">
                <span className="h-14 w-2 rounded-full bg-white/60" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-extrabold text-white">{sectionForm.title || 'عنوان الفاصل...'}</p>
                  <p className="mt-0.5 truncate text-xs font-bold text-white/85">{sectionForm.subtitle || 'العنوان الفرعي...'}</p>
                </div>
              </div>
              <span className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-md">معاينة حية</span>
            </div>

            {formError ? (
              <p className="flex items-start gap-2.5 rounded-2xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3.5 text-sm font-extrabold leading-6 text-destructive" data-testid="foundation-form-error">
                <CircleAlert size={19} className="mt-0.5 shrink-0" /> {formError}
              </p>
            ) : null}

            <Field2 label="عنوان الفاصل *"><input value={sectionForm.title || ''} onChange={(e) => setSectionForm({ ...sectionForm, title: e.target.value })} placeholder="مثال: الحروف والمقاطع" className={touchCls} data-testid="input-foundation-title" /></Field2>
            <Field2 label="العنوان الفرعي" hint="سطر قصير يظهر تحت العنوان"><input value={sectionForm.subtitle || ''} onChange={(e) => setSectionForm({ ...sectionForm, subtitle: e.target.value })} placeholder="المرحلة الأولى" className={touchCls} /></Field2>
            <Field2 label="تعريف الفاصل" hint="يشرح للطالب لماذا وصل إلى هنا"><textarea value={sectionForm.description || ''} onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })} rows={3} placeholder="نتأسّس هنا لنُحكم قواعد القراءة من أولها." className={`${touchCls} resize-none leading-7`} /></Field2>

            <div>
              <p className="mb-2 block text-sm font-semibold">لون الفاصل</p>
              <div className="flex flex-wrap gap-2.5">
                {FOUNDATION_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setSectionForm({ ...sectionForm, color: c })} className={`h-12 w-12 rounded-2xl transition-transform active:scale-90 ${sectionForm.color === c ? 'ring-4 ring-primary' : 'ring-1 ring-border'}`} style={{ background: c }} aria-label={`لون ${c}`} />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setSectionForm({ ...sectionForm, isVisible: !sectionForm.isVisible })} data-testid="button-section-visible" className={`flex min-h-[60px] items-center gap-3 rounded-2xl border-2 p-4 text-right transition-colors ${sectionForm.isVisible !== false ? 'border-primary bg-primary/8' : 'border-destructive/50 bg-destructive/5'}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${sectionForm.isVisible !== false ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{sectionForm.isVisible !== false ? <Check size={16} /> : <EyeOff size={15} />}</span>
                <span><span className="block text-sm font-extrabold text-primary">{sectionForm.isVisible !== false ? 'ظاهر للطلاب الأعضاء' : 'مخفي عن الكل — سرّي'}</span><span className="block text-[11px] text-muted-foreground">{sectionForm.isVisible !== false ? 'يراه كل عضو في مستوياته' : 'لا يراه أي طالب إطلاقاً حتى تفتحه'}</span></span>
              </button>
              <button type="button" onClick={() => setSectionForm({ ...sectionForm, isLocked: !sectionForm.isLocked })} data-testid="button-section-locked" className={`flex min-h-[60px] items-center gap-3 rounded-2xl border-2 p-4 text-right transition-colors ${sectionForm.isLocked ? 'border-[#b7791f] bg-[#b7791f]/10' : 'border-border bg-card'}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${sectionForm.isLocked ? 'bg-[#b7791f] text-white' : 'bg-muted text-muted-foreground'}`}>{sectionForm.isLocked ? <Lock size={15} /> : null}</span>
                <span><span className="block text-sm font-extrabold text-primary">مقفل مؤقتاً</span><span className="block text-[11px] text-muted-foreground">يرى الطلاب الاسم فقط</span></span>
              </button>
            </div>


            <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-card/95 px-4 pb-2 pt-4 backdrop-blur sm:-mx-7 sm:px-7">
              <button type="submit" disabled={savingSection} className={`${touchBtnPrimary} flex-1`}><Save size={18} /> {savingSection ? 'جارٍ الحفظ...' : 'حفظ الفاصل'}</button>
              <button type="button" onClick={() => setSectionModal(null)} className={touchBtnSoft}>إلغاء</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {creatingLesson ? (
        <Modal title="درس جديد" eyebrow="العنوان فقط هنا — والمحتوى داخل صفحته" onClose={() => setCreatingLesson(false)} maxWidth="max-w-xl">
          <form onSubmit={submitLessonCreate} className="space-y-4 pb-2">
            <label className="block">
              <span className="mb-2 block text-sm font-extrabold text-primary">عنوان الدرس *</span>
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                autoFocus
                placeholder="مثال: أقسام الكلمة"
                className={touchCls}
                data-testid="input-new-lesson-title"
              />
            </label>
            {createError ? (
              <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-extrabold text-destructive">{createError}</p>
            ) : (
              <p className="rounded-2xl bg-secondary/60 px-4 py-3 text-xs font-semibold leading-6 text-muted-foreground">
                بعد الإنشاء تُفتح صفحة الدرس مباشرة لتضيف فيها عناصره (نص، صور، فيديو، HTML/موقع) وترتبها.
              </p>
            )}
            <div className="flex gap-3">
              <button type="submit" disabled={savingCreate} className={`${touchBtnPrimary} flex-1`} data-testid="button-create-lesson">
                {savingCreate ? <><RefreshCw size={17} className="animate-spin" /> جارٍ الإنشاء...</> : <><Plus size={17} /> أنشئ وادخل للدرس</>}
              </button>
              <button type="button" onClick={() => setCreatingLesson(false)} className={touchBtnSoft}>إلغاء</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </Shell>
  );
}
/* ═══════════════════════════════════════════════════════════════════════
   نافذة «من يرى التأسيس؟»
   ───────────────────────────────────────────────────────────────────────
   مصفوفة (طالب × مستوى): تحت كل طالب زر «كل المستويات» ثم زر لكل مستوى.
   الضغط يبدّل مستويات الطالب حالاً ويحفظ فوراً — بلا زر حفظ إضافي، فيرى
   الأستاذ أثره قبل أن يطوي نافذة.
   ═══════════════════════════════════════════════════════════════════════ */
function FoundationMembersModal({ open, onClose, flash }: {
  open: boolean;
  onClose: () => void;
  flash: (t: string, tone?: 'ok' | 'err') => void;
}) {
  const [sections, setSections] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [gradeFilter, setGradeFilter] = useState('الكل');
  const [busyUser, setBusyUser] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await jsonFetch('/api/teacher/foundation/members');
      setSections(Array.isArray(d?.sections) ? d.sections : []);
      setStudents(Array.isArray(d?.students) ? d.students : []);
    } catch (err: any) {
      setSections([]);
      setStudents([]);
      flash(err?.message || 'تعذر تحميل الطلاب', 'err');
    } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { if (open) { void load(); } }, [open, load]);

  const grades = useMemo(
    () => ['الكل', ...Array.from(new Set(students.map((s) => s.grade).filter(Boolean)))],
    [students],
  );

  const shown = useMemo(() => {
    const needle = foundationFold(q);
    return students.filter((s) => {
      if (gradeFilter !== 'الكل' && s.grade !== gradeFilter) return false;
      if (!needle) return true;
      return foundationFold(s.name).includes(needle)
        || foundationFold(s.grade).includes(needle)
        || foundationFold(s.school || '').includes(needle);
    });
  }, [students, q, gradeFilter]);

  /** حفظ فوري: نحدّث الشاشة أولاً ثم نرسل — فلا ينتظر الأستاذ ثانية */
  const apply = async (student: any, nextIds: string[]) => {
    const before = students;
    setBusyUser(student.id);
    setStudents((prev) => prev.map((s) => (s.id === student.id ? { ...s, sectionIds: nextIds } : s)));
    try {
      await jsonFetch('/api/teacher/foundation/members', { method: 'PUT', body: { userId: student.id, sectionIds: nextIds } });
    } catch (err: any) {
      setStudents(before);
      flash(`${student.name}: ${err?.message || 'تعذر الحفظ'}`, 'err');
    } finally {
      setBusyUser('');
    }
  };

  const toggleLevel = (student: any, sectionId: string) => {
    const has = student.sectionIds.includes(sectionId);
    const next = has
      ? student.sectionIds.filter((id: string) => id !== sectionId)
      : [...student.sectionIds, sectionId];
    void apply(student, next);
  };
  const toggleAll = (student: any) => {
    const allOn = sections.length > 0 && sections.every((s) => student.sectionIds.includes(s.id));
    void apply(student, allOn ? [] : sections.map((s) => s.id));
  };

  /** أدوات جماعية — على الطلاب الظاهرين فقط فلا تفتحFoundation لمن لا تراه */
  const bulk = (mode: 'all' | 'none') => {
    const ids = shown.map((s) => s.id);
    if (!ids.length) return;
    const target = mode === 'all' ? sections.map((s) => s.id) : [];
    void (async () => {
      setBusyUser('__bulk__');
      setStudents((prev) => prev.map((s) => (ids.includes(s.id) ? { ...s, sectionIds: [...target] } : s)));
      const results = await Promise.allSettled(
        ids.map((id) => jsonFetch('/api/teacher/foundation/members', { method: 'PUT', body: { userId: id, sectionIds: target } })),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      setBusyUser('');
      if (failed) {
        await load();
        flash(`تعذّر الحفظ لـ ${failed} طالب`, 'err');
      } else {
        flash(mode === 'all' ? `فُتح التأسيس لـ ${ids.length} طالب` : `أُغلق التأسيس لـ ${ids.length} طالب`);
      }
    })();
  };

  if (!open) return null;

  return (
    <Modal
      title="من يرى التأسيس؟"
      eyebrow="لكل طالب تختار مستوياته — أو تفتح له الكل بضغطة واحدة"
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-4 pb-2">
        {/* ── البحث ── */}
        <div className="relative">
          <Search size={19} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث باسم الطالب أو صفه أو مدرسته..."
            className={`${touchCls} pr-12`}
            data-testid="input-foundation-member-search"
          />
          {q ? (
            <button type="button" onClick={() => setQ('')} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground active:bg-secondary" aria-label="مسح البحث">
              <X size={18} />
            </button>
          ) : null}
        </div>

        {/* ── الفلاتر + الأدوات الجماعية ── */}
        <div className="flex flex-wrap items-center gap-2">
          {grades.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGradeFilter(g)}
              data-testid={`button-member-grade-${g}`}
              className={`min-h-[44px] rounded-xl px-4 text-xs font-extrabold transition-colors ${gradeFilter === g ? 'bg-primary text-primary-foreground shadow-sm' : 'border-2 border-border bg-card text-muted-foreground active:bg-secondary'}`}
            >
              {g}
            </button>
          ))}
          <span className="ms-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => bulk('all')} disabled={busyUser === '__bulk__' || !shown.length} className={`${touchBtnSoft} px-4 py-2.5 text-xs`} data-testid="button-open-all">
              <Sprout size={15} /> فتح للكل
            </button>
            <button type="button" onClick={() => bulk('none')} disabled={busyUser === '__bulk__' || !shown.length} className={`${touchBtnGhost} px-4 py-2.5 text-xs`} data-testid="button-close-all">
              <Lock size={15} /> إغلاق للكل
            </button>
          </span>
        </div>

        {loading ? <StateNotice type="loading" /> : !students.length ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><UsersRound size={30} /></span>
            <p className="font-display text-lg font-bold text-primary">لا يوجد طلاب بعد</p>
            <p className="mt-2 text-sm text-muted-foreground">كل حساب يسجّل نفسه يظهر هنا تلقائياً.</p>
          </div>
        ) : !shown.length ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <p className="font-semibold text-primary">لا نتائج</p>
            <p className="mt-1 text-sm text-muted-foreground">جرّب اسماً آخر أو غيّر الصف.</p>
          </div>
        ) : (
          /* ── صف لكل طالب ── */
          <div className="space-y-2.5">
            {shown.map((s) => {
              const allOn = sections.length > 0 && sections.every((x) => s.sectionIds.includes(x.id));
              const noneOn = s.sectionIds.length === 0;
              const busy = busyUser === s.id;
              const openNames = sections.filter((x) => s.sectionIds.includes(x.id)).map((x) => x.subtitle || x.title);
              return (
                <div
                  key={s.id}
                  data-testid={`member-row-${s.id}`}
                  className={`overflow-hidden rounded-3xl border bg-card transition-all ${noneOn ? 'border-border opacity-75' : 'border-[#6a1b9a]/35'} ${busy ? 'opacity-60' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-3 p-3 sm:gap-4 sm:p-4">
                    <div className="flex min-w-[190px] flex-1 items-center gap-3">
                      <Avatar name={s.name} src={s.avatarUrl} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-primary">{s.name}</p>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">
                          {[s.grade, s.section, s.school].filter(Boolean).join(' · ') || 'بلا بيانات'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleAll(s)}
                      aria-pressed={allOn}
                      data-testid={`button-toggle-all-${s.id}`}
                      className={`inline-flex min-h-[52px] shrink-0 items-center gap-2 rounded-2xl px-5 text-sm font-extrabold transition-all active:scale-[.97] ${
                        allOn
                          ? 'bg-gradient-to-l from-[#6a1b9a] to-[#8a508f] text-white shadow-lg shadow-[#6a1b9a]/30'
                          : 'border-2 border-border bg-card text-muted-foreground'
                      }`}
                    >
                      {allOn ? <Check size={17} /> : <Sprout size={17} />}
                      كل المستويات
                    </button>

                    <div className="flex flex-wrap gap-2">
                      {sections.map((sec, i) => {
                        const on = s.sectionIds.includes(sec.id);
                        return (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => toggleLevel(s, sec.id)}
                            aria-pressed={on}
                            data-testid={`button-toggle-${s.id}-${sec.id}`}
                            title={sec.title}
                            className={`inline-flex min-h-[52px] min-w-[78px] flex-col items-center justify-center rounded-2xl px-3 text-center transition-all active:scale-[.97] ${
                              on ? 'text-white shadow-md' : 'border-2 border-border bg-card text-muted-foreground'
                            }`}
                            style={on ? { background: `linear-gradient(135deg, ${sec.color}, ${sec.color}bb)` } : undefined}
                          >
                            <span className="text-[10px] font-extrabold leading-none opacity-85">
                              {sec.subtitle || `م${i + 1}`}
                            </span>
                            <span className="mt-1 text-[11px] font-extrabold leading-tight">
                              {on ? 'مفتوح' : 'مغلق'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* سطر النتيجة — يقول بالحرف ما الذي يرى الطالب */}
                  <div className="flex items-center gap-2 border-t border-border bg-secondary/40 px-4 py-2 text-[11px] font-bold">
                    {busy ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <RefreshCw size={12} className="animate-spin" /> جارٍ الحفظ...
                      </span>
                    ) : noneOn ? (
                      <span className="text-muted-foreground">لا يرى التأسيس — مخفي عنه بالكامل</span>
                    ) : allOn ? (
                      <span className="inline-flex items-center gap-1.5 text-[#6a1b9a]">
                        <CheckCircle2 size={13} /> يرى كل المستويات ({s.sectionIds.length})
                      </span>
                    ) : (
                      <span className="truncate text-muted-foreground">
                        يرى {s.sectionIds.length} من {sections.length} · {openNames.join('، ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="pt-1 text-center text-[11px] font-bold text-muted-foreground">
          {shown.length} طالب · {sections.length} مستوى — التغيير يُحفظ فور الضغط بلا زر حفظ.
        </p>
      </div>
    </Modal>
  );
}
/* ══════════════════ نموذج الدرس (لمس) ══════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   رافع فيديو الدرس — زر + شريط تقدم + شارة الحساب.
   يعرض أثناء الرفع: النسبة، والميجا المرفوعة من الأصل، والحساب المستخدم
   (الأول/الثاني)، وبعده ملاحظة أن العرض بنسخة مضغوطة. عند فشل حساب
   ينتقل للثاني تلقائياً ويُكمل — والأستاذ يرى التبديل مكتوباً.
   ═══════════════════════════════════════════════════════════════════════ */
function FoundationVideoUploader({ value, onUploaded }: {
  value: string; onUploaded: (url: string, info: { accountLabel: string; bytes: number }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [total, setTotal] = useState(0);
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    jsonFetch('/api/teacher/cloudinary/status')
      .then((d) => { if (live) setStatus(d); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  const pick = () => {
    if (busy) return;
    setError('');
    inputRef.current?.click();
  };

  const start = async (file: File | undefined) => {
    if (!file || busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setSent(0);
    setTotal(file.size);
    setAccount('');
    setError('');
    try {
      const r = await uploadVideoToCloudinary(
        file,
        (s, t, label) => { setSent(s); setTotal(t); setAccount(label); },
        ctrl.signal,
      );
      onUploaded(r.url, { accountLabel: r.accountLabel, bytes: r.bytes });
    } catch (err: any) {
      if (!ctrl.signal.aborted) setError(err?.message || 'تعذر رفع الفيديو');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  const activeLabel = status?.active === 1 ? 'الأول' : status?.active === 2 ? 'الثاني' : '—';

  return (
    <div className="mt-3 rounded-2xl border border-[#0d47a1]/25 bg-[#0d47a1]/[0.04] p-4">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void start(f); }}
        data-testid="input-foundation-video-file"
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-[#0d47a1] px-5 text-sm font-extrabold text-white shadow-md transition-all hover:-translate-y-0.5 active:scale-[.97] disabled:opacity-60"
          data-testid="button-upload-foundation-video"
        >
          <Upload size={17} />
          {busy ? 'جارٍ الرفع...' : value ? 'استبدال بفيديو مرفوع' : 'ارفع فيديو من جهازك'}
        </button>
        {busy ? (
          <button type="button" onClick={cancel} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl border-2 border-border bg-card px-4 text-sm font-extrabold text-muted-foreground">
            <X size={16} /> إلغاء
          </button>
        ) : null}
        <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-extrabold text-muted-foreground" title="الحساب الذي سيُرفع عليه هذا الفيديو">
          <Video size={12} /> التخزين: {activeLabel}
        </span>
      </div>

      {busy ? (
        <div className="mt-3" data-testid="video-upload-progress">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-extrabold">
            <span className="text-primary tabular-nums">{pct}% · {formatMega(sent)} / {formatMega(total)}</span>
            {account ? <span className="rounded-full bg-[#0d47a1]/10 px-2.5 py-0.5 text-[#0d47a1]">عبر {account}</span> : null}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-gradient-to-l from-[#0d47a1] to-[#5b9bd5] transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] font-semibold leading-5 text-muted-foreground">
            الملفات الكبيرة تُرفع بالمقاطع — لا تغلق الصفحة. عند الامتلاء ينتقل للآخر تلقائياً.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-xs font-extrabold leading-6 text-destructive" data-testid="video-upload-error">
          <CircleAlert size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {!busy && !error ? (
        <p className="mt-2.5 text-[11px] font-semibold leading-5 text-muted-foreground">
          يُرفع الفيديو بأصله إلى تخزين الفيديو، ويُعرض للطالب بنسخة مضغوطة خفيفة (جودة مناسبة للشرح) — فيديو 20 دقيقة بعشرات الميجا.
        </p>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   رافع الموقع المضغوط لدرس التأسيس — نفس ميزة المناهج نسخاً.
   ───────────────────────────────────────────────────────────────────────
   يقبل ملف TAR (مفضّل) أو TAR.GZ أو ZIP يحوي موقعاً كاملاً (html + css +
   js + صور). إن كان موقعاً جاهزاً رُفع مباشرة، وإن كان مشروع React/TS
   بُني داخل المتصفح ثم رُفع. الناتج رابط يُحفظ في htmlFileUrl ويعرضه
   الطالب كصفحة تفاعلية داخل الدرس.
   ═══════════════════════════════════════════════════════════════════════ */
function FoundationBundleUploader({ value, onUploaded }: {
  value: string; onUploaded: (url: string) => void;
}) {
  const [progress, setProgress] = useState<number | false>(false);
  const [stage, setStage] = useState('');
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');

  const busy = progress !== false;

  const start = async (f: File | undefined, resetInput: () => void) => {
    if (!f || busy) return;
    if (!isArchiveFileName(f.name)) {
      setError('الملف ليس أرشيفاً: اختر TAR أو TAR.GZ (مفضل) أو ZIP.');
      resetInput();
      return;
    }
    setProgress(0);
    setError('');
    setInfo(null);
    let stageText = 'قراءة الملف المضغوط';
    const setStage = (s: string) => { stageText = s; setStage(s); };
    try {
      const prevUrl: string = value || '';
      const dropOld = async (newUrl: string) => {
        if (prevUrl && prevUrl !== newUrl && (isBundleUrl(prevUrl) || isSourceBundleUrl(prevUrl))) {
          setStage('حذف النسخة القديمة من التخزين');
          await deleteStoredUrl(prevUrl);
        }
      };
      setStage('قراءة الملف المضغوط');
      const buf = await f.arrayBuffer();
      const raw = await extractRawArchive(buf, f.name);
      const prep = classifyAndPrepare(raw.files, raw.warnings);
      if (prep.kind === 'site') {
        const entry = findSiteEntry(prep.files);
        setInfo({ mode: 'site', name: f.name, sizeKB: Math.round(f.size / 1024), files: prep.files.size, entry, warnings: prep.warnings });
        setStage('رفع الموقع المضغوط');
        const res = await uploadBundleDirect(f, '/ard-al-lughah/bundles', (p) => setProgress(p), (file) => uploadFileToCloud(file, '/ard-al-lughah/bundles'));
        await dropOld(res.url);
        onUploaded(res.url);
        setStage('');
      } else {
        setInfo({ mode: 'source', name: f.name, sizeKB: Math.round(f.size / 1024), files: prep.files.size, entry: prep.entry, warnings: prep.warnings });
        setStage('تجهيز محرك البناء (أول مرة فقط)');
        await ensureSourceEngine({ wasmURL: ESBUILD_WASM_CDN }, { worker: true });
        setStage('بناء الموقع داخل المتصفح');
        const built = await buildSourceBundle(prep, (m) => setStage(m));
        setStage('ضغط النسخة النهائية');
        const packed = await packSourceContainer(built);
        const gzKB = Math.round(packed.bytes.length / 1024);
        setInfo((b: any) => ({ ...b, gzKB, hash: packed.hash.slice(0, 12) }));
        setStage(`رفع النسخة المضغوطة (${gzKB}KB)`);
        const up = await uploadSourceContainer(packed.bytes, f.name, (p) => setProgress(p), (file) => uploadFileToCloud(file, '/ard-al-lughah/bundles'));
        await dropOld(up.url);
        onUploaded(up.url);
        setStage('');
      }
    } catch (err: any) {
      const diag = buildUploadDiag(err, stageText, f);
      setError(`${err?.message || 'تعذر رفع الموقع المضغوط'} (رمز: ${diag.code})`);
    } finally {
      setProgress(false);
      setStage('');
      resetInput();
    }
  };

  return (
    <div className="mt-3 rounded-2xl border-2 border-dashed border-[#6a1b9a]/40 bg-[#6a1b9a]/[0.05] p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className={`inline-flex min-h-[52px] cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-l from-[#6a1b9a] to-[#8a508f] px-5 text-sm font-extrabold text-white shadow-md transition-all hover:brightness-110 active:scale-[.98] ${busy ? 'pointer-events-none opacity-60' : ''}`} title="ارفع موقعاً كاملاً مضغوطاً — TAR أو TAR.GZ مفضل، أو ZIP: html + css + js + صور">
          {busy ? <RefreshCw size={17} className="animate-spin" /> : <Package size={17} />}
          {busy ? (stage || `جارٍ الرفع ${progress}%...`) : '📦 ارفع موقعاً (TAR مفضّل)'}
          <input
            type="file"
            accept=".tar,.tar.gz,.tgz,.zip,application/x-tar,application/zip"
            className="hidden"
            data-testid="input-foundation-bundle"
            onChange={(e) => {
              const f = e.target.files?.[0];
              const t = e.target;
              void start(f, () => { t.value = ''; });
            }}
          />
        </label>
        {value && (isBundleUrl(value) || isSourceBundleUrl(value)) ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-600/10 px-3 py-1.5 text-[11px] font-extrabold text-green-800">
            <Check size={13} /> موقع مرفوع وجاهز
          </span>
        ) : null}
      </div>

      {busy ? (
        <div className="mt-3" data-testid="foundation-bundle-progress">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-extrabold">
            <span className="text-primary">{stage || 'جارٍ الرفع...'}</span>
            {typeof progress === 'number' ? <span className="tabular-nums text-primary">{progress}%</span> : null}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-l from-[#6a1b9a] to-[#b06ab3] transition-[width] duration-200"
              style={{ width: `${typeof progress === 'number' ? progress : 50}%` }}
            />
          </div>
        </div>
      ) : null}

      {info ? (
        <p className="mt-3 rounded-xl border border-[#6a1b9a]/25 bg-card px-4 py-2.5 text-[11px] font-bold leading-6 text-primary">
          {info.mode === 'source' ? 'مشروع React/TS (يُبنى داخل المتصفح)' : 'موقع جاهز'} · <span dir="ltr" className="font-mono">{info.name}</span> · {info.sizeKB}KB · {info.files} ملف
          {info.gzKB != null ? <span className="mt-0.5 block text-green-800">مضغوط إلى {info.gzKB}KB</span> : null}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-xs font-extrabold leading-6 text-destructive" data-testid="foundation-bundle-error">
          <CircleAlert size={15} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : (
        <p className="mt-2.5 text-[11px] font-semibold leading-5 text-muted-foreground">
          موقعك الكبير ارفعه مضغوطاً: كل الملفات في أرشيف واحد، ورابطه يُحفظ في الدرس ويُعرض للطالب صفحة تفاعلية.
        </p>
      )}
    </div>
  );
}



/* ═══════════════════════════════════════════════════════════════════════
   واجهة الطالب — التأسيس بثلاثة مستويات
   ───────────────────────────────────────────────────────────────────────
   القسم (المستوى) ← القسم الفرعي ← الدرس ← صفحة الدرس.
   كل خطوة صفحة مستقلة فيها مربعات كبيرة: يفتح الطالب المستوى فيرى
   أقسامه، ويفتح القسم فيرى دروسه، ويفتح الدرس فيقرأه ويعلّمه منجزاً.
   ═══════════════════════════════════════════════════════════════════════ */

/** ذاكرة واحدة للجسر: التنقّل بين الصفحات لا يعيد الطلب في كل مرة */
let foundationStreamCache: { at: number; data: any } | null = null;
const FOUNDATION_STREAM_TTL = 60 * 1000;

function useFoundationStream(opts: { fresh?: boolean } = {}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setErr('');
    try {
      if (!force && foundationStreamCache && Date.now() - foundationStreamCache.at < FOUNDATION_STREAM_TTL) {
        setData(foundationStreamCache.data);
        return foundationStreamCache.data;
      }
      const d = await jsonFetch('/api/foundation/stream');
      foundationStreamCache = { at: Date.now(), data: d };
      setData(d);
      return d;
    } catch (e: any) {
      setErr(e?.message || 'تعذر تحميل التأسيس');
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(opts.fresh === true); }, [load, opts.fresh]);

  return { data, loading, err, reload: load };
}

/** شريط المسار: أين أنا الآن — القسم ← القسم الفرعي ← الدرس */
function FoundationCrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="مسار التأسيس" data-testid="foundation-crumbs" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm font-bold">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <ChevronLeft size={14} className="text-muted-foreground/50" /> : null}
          {it.href ? (
            <Link href={it.href} className="rounded-lg px-2 py-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary" data-testid={`crumb-${i}`}>
              {it.label}
            </Link>
          ) : (
            <span className="rounded-lg bg-secondary px-2.5 py-1 text-primary" data-testid={`crumb-${i}`}>{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** ترويسة صفحة داخلية: أيقونة المستوى + عنوانه + شريط تقدّمه */
function FoundationPageHead({ color, icon: Icon, eyebrow, title, description, done, total, extra }: {
  color: string; icon: any; eyebrow: string; title: string; description?: string; done?: number; total?: number; extra?: ReactNode;
}) {
  const pct = total && total > 0 ? Math.round(((done || 0) / total) * 100) : 0;
  return (
    <header className="relative mb-7 overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#0c2725] via-[#17413f] to-[#2a7a72] p-6 text-white shadow-xl sm:p-8">
      <div className="pointer-events-none absolute -left-16 -top-16 h-52 w-52 rounded-full blur-3xl" style={{ background: `${color}88` }} />
      <div className="pointer-events-none absolute -bottom-20 right-1/3 h-44 w-44 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative flex flex-wrap items-start gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl shadow-lg ring-1 ring-white/20" style={{ background: color }}>
          <Icon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-accent">{eyebrow}</p>
          <h1 className="mt-1 font-display text-2xl font-bold leading-snug sm:text-3xl">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">{description}</p> : null}
          {total ? (
            <div className="mt-5 max-w-md">
              <div className="mb-2 flex items-center justify-between text-xs font-extrabold text-white/85">
                <span className="inline-flex items-center gap-2"><Sparkles size={14} className="text-accent" /> تقدّمك</span>
                <span className="tabular-nums">{done} من {total} · {pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-gradient-to-l from-accent to-[#f3d68a] transition-[width] duration-700" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
        {extra}
      </div>
    </header>
  );
}

/** مربعات الأقسام — التأسيس كله شبكة: مستوى → أقسام → دروس */
function FoundationTileGrid({ items, onOpen, emptyText }: {
  items: any[]; onOpen: (item: any) => void; emptyText: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
        <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><NotebookPen size={30} /></span>
        <p className="font-display text-xl font-bold text-primary">لا يوجد شيء هنا بعد</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => <FoundationTile key={item.id} item={item} onOpen={onOpen} />)}
    </div>
  );
}

function FoundationTile({ item, onOpen }: { item: any; onOpen: (item: any) => void }) {
  const Icon = (UNIT_ICONS as any)[item.icon] || Sparkles;
  const color = item.color || '#17413f';
  const total = Number(item.totalCount ?? item.lessonsCount ?? 0);
  const done = Number(item.doneCount ?? 0);
  const children: any[] = Array.isArray(item.units) ? item.units : [];
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  // المستويات تحمل اسمين: «المستوى الأول» و«أساسيات النحو والتركيب» —
  // كلاهما على المربع نفسه فلا يضغط الطالب مرتين ليعرف وين هو.
  const eyebrow = item.subtitle || '';
  const headline = item.title || '';

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      data-testid={`tile-${item.id}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card text-right shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/35 hover:shadow-2xl"
    >
      {/* رأس ملوّن — لون المستوى أو وراثته */}
      <span className="relative block h-28 overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}>
        <span className="absolute -left-8 -top-10 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
        <span className="absolute -bottom-12 right-6 h-24 w-24 rounded-full bg-black/10 blur-xl" />
        {item.coverUrl ? <img src={item.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className="absolute bottom-3 right-4 grid h-11 w-11 place-items-center rounded-2xl bg-white/25 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-sm">
          <Icon size={22} />
        </span>
        {item.isLocked ? (
          <span className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px]">
            <span className="inline-flex items-center gap-2 rounded-2xl bg-black/55 px-4 py-2.5 text-xs font-extrabold text-white ring-1 ring-white/25">
              <Lock size={15} /> مقفل مؤقتاً
            </span>
          </span>
        ) : null}
      </span>

      <span className="flex flex-1 flex-col p-5">
        {/* الاسمان على بطاقة واحدة: المستوى ثم موضوعه */}
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-accent-foreground">{eyebrow}</span>
        <span className="mt-1 font-display text-xl font-extrabold leading-snug text-primary">{headline}</span>
        {item.description ? (
          <span className="mt-2 line-clamp-2 text-[13px] font-semibold leading-6 text-muted-foreground">{item.description}</span>
        ) : null}

        {/* شريط التقدّم داخل المربع — هو الكلام الوحيد الذي يهمّ الطالب هنا */}
        <span className="mt-auto pt-5">
          <span className="mb-2 flex items-center justify-between text-xs font-extrabold">
            <span className="text-muted-foreground">
              {children.length ? `${children.length} أقسام · ${total} درس` : `${total} درس`}
            </span>
            <span className={pct === 100 && total > 0 ? 'text-green-700' : 'text-primary'}>{done}/{total}</span>
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full transition-[width] duration-700"
              style={{ width: `${pct}%`, background: pct === 100 && total > 0 ? '#16a34a' : color }}
            />
          </span>
        </span>

        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-primary transition-transform group-hover:-translate-x-1">
          ادخل <ArrowLeft size={15} />
        </span>
      </span>
    </button>
  );
}


/* ═══════════════════ الصفحة 1: المستويات (مربعات الأقسام) ═══════════════════ */
function StudentFoundationPage() {
  const [, setLocation] = useLocation();
  const { data, loading, err, reload } = useFoundationStream();
  const sections: any[] = Array.isArray(data?.sections) ? data.sections : [];
  const stats = data?.stats || { sections: 0, units: 0, lessons: 0, done: 0, percent: 0 };

  return (

    <Shell mode="student">
      <FoundationPageHead
        color="#17413f" icon={Sprout}
        eyebrow="عشرة مستويات · مئة وأربعة وعشرون درساً"
        title="إعداد التأسيس"
        description="من المهارات الأولى والحروف إلى النحو والصرف والإملاء والبلاغة والعروض والأدب والنصوص. اختر المستوى ثم الدرس."
        done={stats.done} total={stats.lessons}
      />

      {loading ? <StateNotice type="loading" /> : err && !sections.length ? (
        <StateNotice type="error" onRetry={() => reload(true)} />
      ) : !sections.length ? (
        <div className="relative overflow-hidden rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><ShieldCheck size={30} /></span>
          <p className="font-display text-xl font-bold text-primary">لم يُفتح لك التأسيس بعد</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
            هذا القسم خاص — يظهر فقط لمن يختاره الأستاذ بالاسم. تواصل مع الأستاذ لتُضاف إليه.
          </p>
        </div>
      ) : (
        <FoundationTileGrid
          items={sections}
          onOpen={(s) => setLocation(`/student/foundation/section/${s.id}`)}
          emptyText="الأستاذ يحضّر المستويات الآن. عد قريباً."
        />
      )}
    </Shell>
  );
}

/* ═══════════════════ الصفحة 2: مواضيع المستوى (1..10) ═══════════════════ */
function FoundationSectionPage() {
  const [, setLocation] = useLocation();
  const { sectionId = '' } = useParams();
  const { data, loading, err, reload } = useFoundationStream();
  const sections: any[] = Array.isArray(data?.sections) ? data.sections : [];
  const section = sections.find((s) => s.id === sectionId) || null;

  // المواضيع = كل دروس المستوى بترتيبها، أياً كان تقسيمها داخلياً.
  // نقرأ من units إن وُجدت ومن lessons مباشرةً كحل احتياطي — فالصفحة
  // واحدة تعرض العشرة دروس دائماً بلا طبقة وسطى على الطالب.
  const topics: any[] = section
    ? (Array.isArray(section.units) && section.units.length
        ? section.units.flatMap((u: any) => (Array.isArray(u.lessons) ? u.lessons : []))
        : (Array.isArray(section.lessons) ? section.lessons : [])
      ).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    : [];
  const Icon = section ? ((UNIT_ICONS as any)[section.icon] || Sparkles) : Layers;

  return (
    <Shell mode="student">
      <FoundationCrumbs
        items={[
          { label: 'التأسيس', href: '/student/foundation' },
          { label: section ? `${section.subtitle || ''} — ${section.title || ''}`.trim() : 'المستوى' },
        ]}
      />

      {loading ? <StateNotice type="loading" /> : err ? (
        <StateNotice type="error" onRetry={() => reload(true)} />
      ) : !section ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="font-display text-xl font-bold text-primary">هذا المستوى غير متاح لحسابك</p>
          <Link href="/student/foundation" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground">
            <ArrowLeft size={16} /> رجع للتأسيس
          </Link>
        </div>
      ) : (
        <>
          <FoundationPageHead
            color={section.color} icon={Icon}
            eyebrow={section.subtitle || 'المستوى'}
            title={section.title}
            description={section.description}
            done={section.doneCount} total={section.totalCount}
          />

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-primary">
              <NotebookText size={20} /> قائمة المواضيع الرئيسية
            </h2>
            <span className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-extrabold tabular-nums text-primary">{topics.length}</span>
          </div>

          {topics.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {topics.map((l: any, i: number) => (
                <FoundationLessonCard
                  key={l.id} lesson={l} index={i + 1} color={section.color}
                  onOpen={() => setLocation(`/student/foundation/lesson/${l.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
              <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><NotebookPen size={30} /></span>
              <p className="font-display text-xl font-bold text-primary">مواضيع هذا المستوى لم تُنشر بعد</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">الأستاذ يحضّرها الآن. عد قريباً وستجدها هنا مرقّمة.</p>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

/** بطاقة درس في القائمة — رقم + نوع + عنوان + حالة الإنجاز */
function FoundationLessonCard({ lesson, index, color, onOpen }: {
  lesson: any; index: number; color: string; onOpen: () => void;
}) {
  const meta = FOUNDATION_KINDS[lesson.kind] || FOUNDATION_KINDS.text;
  const KIcon = meta.Icon;

  if (lesson.isLocked) {
    return (
      <div className="flex items-center gap-4 rounded-3xl border border-dashed border-[#b7791f]/40 bg-[#b7791f]/6 p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground"><Lock size={19} /></span>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-extrabold text-muted-foreground">{lesson.title}</p>
          <p className="mt-0.5 text-xs font-extrabold text-[#b7791f]">مقفل — يفتحه الأستاذ حين يجهّزه.</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`lesson-card-${lesson.id}`}
      className={`group relative flex items-start gap-4 overflow-hidden rounded-3xl border bg-card p-5 text-right shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-xl ${lesson.done ? 'border-green-500/35' : 'border-border'}`}
    >
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-md"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
      >
        <span className="text-sm font-extrabold tabular-nums">{index}</span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold text-white" style={{ background: meta.tone }}>
            {meta.label}
          </span>
          {lesson.done ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-600/12 px-2.5 py-0.5 text-[10px] font-extrabold text-green-800">
              <CheckCircle2 size={11} /> منجز
            </span>
          ) : null}
        </span>
        <span className="mt-2 block font-display text-base font-extrabold leading-snug text-primary">{lesson.title}</span>
        {lesson.description ? (
          <span className="mt-1 block line-clamp-2 text-xs font-semibold leading-6 text-muted-foreground">{lesson.description}</span>
        ) : null}
        <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-primary opacity-0 transition-opacity group-hover:opacity-100">
          افتح الدرس <ArrowLeft size={14} />
        </span>
      </span>
    </button>
  );
}

/* ═══════════════════ الصفحة 4: الدرس بمحتواه ═══════════════════ */
function FoundationLessonPage() {
  const [, setLocation] = useLocation();
  const { lessonId = '' } = useParams();
  const { data, loading, err, reload } = useFoundationStream();
  const [saving, setSaving] = useState(false);

  const sections: any[] = Array.isArray(data?.sections) ? data.sections : [];

  // الدرس يُبحث فيه في كل أقسام المستوى — ونجمع شقيقاته من المستوى كله
  // (لا من قسم فرعي) فالسابق/التالي يمرّان على العشرة بالترتيب نفسه
  // الذي يراه الطالب في صفحة المواضيع.
  const flatLessons = (s: any): any[] =>
    (Array.isArray(s.units) && s.units.length
      ? s.units.flatMap((u: any) => (Array.isArray(u.lessons) ? u.lessons : []))
      : (Array.isArray(s.lessons) ? s.lessons : [])
    ).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

  let section: any = null;
  let lesson: any = null;
  let index = 0;
  for (const s of sections) {
    const list = flatLessons(s);
    const at = list.findIndex((l: any) => l.id === lessonId);
    if (at !== -1) { section = s; lesson = list[at]; index = at + 1; break; }
  }
  const siblings: any[] = section ? flatLessons(section) : [];
  const prev = index > 1 ? siblings[index - 2] : null;
  const next = index > 0 && index < siblings.length ? siblings[index] : null;
  const color = section?.color || '#17413f';

  const markDone = async () => {
    if (!lesson || saving || lesson.done) return;
    setSaving(true);
    try {
      await jsonFetch(`/api/foundation/lessons/${lesson.id}/complete`, { method: 'POST' });
      foundationStreamCache = null;
      await reload(true);
    } catch { /* نُبقي الحالة كما هي */ }
    finally { setSaving(false); }
  };

  if (loading) {
    return <Shell mode="student"><StateNotice type="loading" /></Shell>;
  }

  if (err) {
    return <Shell mode="student"><StateNotice type="error" onRetry={() => reload(true)} /></Shell>;
  }

  if (!lesson) {
    return (
      <Shell mode="student">
        <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-secondary text-primary"><Lock size={30} /></span>
          <p className="font-display text-xl font-bold text-primary">هذا الدرس غير متاح لك</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">قد يكون مقفلاً أو نُقل إلى قسم آخر. عُد إلى التأسيس واختر من جديد.</p>
          <Link href="/student/foundation" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground">
            <ArrowLeft size={16} /> رجع للتأسيس
          </Link>
        </div>
      </Shell>
    );
  }

  const meta = FOUNDATION_KINDS[lesson.kind] || FOUNDATION_KINDS.text;

  return (
    <Shell mode="student">
      <FoundationCrumbs
        items={[
          { label: 'التأسيس', href: '/student/foundation' },
          { label: section ? `${section.subtitle || ''} — ${section.title || ''}`.trim() : 'المستوى', href: section ? `/student/foundation/section/${section.id}` : undefined },
          { label: lesson.title },
        ]}
      />

      {/* رأس الدرس */}
      <header className="relative mb-6 overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#0c2725] via-[#17413f] to-[#2a7a72] p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -left-14 -top-14 h-48 w-48 rounded-full blur-3xl" style={{ background: `${color}88` }} />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-extrabold ring-1 ring-white/20">
            <meta.Icon size={13} /> {meta.label}
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold leading-snug sm:text-3xl">{lesson.title}</h1>
          <p className="mt-1.5 text-sm font-bold text-accent">
            {section ? `${section.subtitle || ''} — ${section.title || ''} · `.trim() : ''}
            الموضوع {index} من {siblings.length}
          </p>
          {lesson.description ? <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">{lesson.description}</p> : null}
        </div>
      </header>

      {/* محتوى الدرس */}
      <FoundationLessonBody lesson={lesson} />

      {/* الإنجاز ثم التنقّل بين الدروس — أسفل الدرس لا فوقه */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={markDone}
          disabled={saving || lesson.done}
          data-testid="button-lesson-done"
          className={`${touchBtn} ${lesson.done ? 'border-2 border-green-600/30 bg-green-600/10 text-green-800' : touchBtnPrimary} px-6`}
        >
          {lesson.done ? <CheckCircle2 size={18} /> : <Check size={18} />}
          {lesson.done ? 'أنجزتَه' : saving ? 'جارٍ الحفظ...' : 'أنهيت هذا الدرس'}
        </button>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
          {prev ? (
            <Link href={`/student/foundation/lesson/${prev.id}`} className={`${touchBtn} ${touchBtnGhost} px-5 text-sm`} data-testid="button-lesson-prev">
              <ArrowRight size={16} /> السابق
            </Link>
          ) : null}
          {next ? (
            <Link href={`/student/foundation/lesson/${next.id}`} className={`${touchBtn} ${touchBtnPrimary} px-5 text-sm`} data-testid="button-lesson-next">
              التالي <ArrowLeft size={16} />
            </Link>
          ) : (
            <Link href={`/student/foundation/section/${section?.id}`} className={`${touchBtn} ${touchBtnSoft} px-5 text-sm`} data-testid="button-lesson-back">
              رجع لمواضيع المستوى <ArrowLeft size={16} />
            </Link>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* =========================================================================
   ROUTING & ROOT APP
   ========================================================================= */

function Router() {
  const [location] = useLocation();
  useIdentityHead();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/auth/verify" component={LegacyVerifyRedirect} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/auth/complete" component={CompleteProfilePage} />
        <Route path="/student" component={StudentDashboardNew} />
        <Route path="/student/courses" component={StudentCoursesPage} />
        <Route path="/student/courses/:courseId" component={StudentCoursesPage} />
        <Route path="/student/summaries" component={StudentSummariesPage} />
        <Route path="/student/courses/:courseId/lessons/:lessonId" component={StudentLessonPage} />
        <Route path="/student/foundation" component={StudentFoundationPage} />
        <Route path="/student/foundation/section/:sectionId" component={FoundationSectionPage} />
        <Route path="/student/foundation/lesson/:lessonId" component={FoundationLessonPage} />
        <Route path="/student/notebook" component={StudentNotebookPage} />
        <Route path="/student/profile" component={ProfilePage} />
        <Route path="/student/assignments" component={AssignmentsPage} />
        <Route path="/student/assignments/:assignmentId" component={AssignmentsPage} />
        <Route path="/student/announcements" component={StudentAnnouncementsPage} />
        <Route path="/student/assessments" component={AssessmentsPage} />
        <Route path="/student/assessments/:assessmentId" component={AssessmentsPage} />
        <Route path="/teacher" component={TeacherDashboardNew} />
        <Route path="/teacher/students" component={StudentsPage} />
        <Route path="/teacher/students/grade/:grade" component={GradeStudentsRoute} />
        <Route path="/teacher/foundation" component={TeacherFoundationPage} />
        <Route path="/teacher/foundation/lesson/:lessonId" component={TeacherFoundationLessonPage} />
        <Route path="/teacher/content" component={CurriculumManagerPage} />
        <Route path="/teacher/summaries" component={TeacherSummariesPage} />
        <Route path="/teacher/exams" component={TeacherExamsPage} />
        <Route path="/teacher/assignments" component={TeacherAssignmentsPage} />
        <Route path="/teacher/announcements" component={TeacherAnnouncementsPage} />
        <Route path="/teacher/notebooks" component={TeacherNotebooksPage} />
        <Route path="/teacher/report" component={TeacherReportPage} />
        <Route path="/teacher/books" component={TeacherBooksPage} />
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
