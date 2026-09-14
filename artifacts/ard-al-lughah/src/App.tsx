// @ts-nocheck
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
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
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  Library,
  Lightbulb,
  LogOut,
  Medal,
  Menu,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
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
  { href: '/student/assignments', label: 'الواجبات', icon: ClipboardCheck },
  { href: '/student/assessments', label: 'التقييمات', icon: Target },
  { href: '/student/profile', label: 'ملفي الشخصي', icon: UserRound },
];

const navTeacher = [
  { href: '/teacher', label: 'لوحة المتابعة', icon: LayoutDashboard },
  { href: '/teacher/students', label: 'الطلاب', icon: UsersRound },
  { href: '/teacher/content', label: 'المحتوى التعليمي', icon: Library },
  { href: '/teacher/settings', label: 'هوية المنصة', icon: Settings },
];

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
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-primary/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button aria-label="إغلاق" className="absolute inset-0 cursor-default" onClick={onClose} data-testid="button-close-modal-overlay" />
      <div className={`relative z-10 max-h-[92dvh] w-full ${maxWidth} overflow-auto rounded-3xl border border-border bg-card p-6 shadow-2xl animate-rise sm:p-7`}>
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            {eyebrow && <p className="mb-1 text-xs font-bold text-accent-foreground">{eyebrow}</p>}
            <h2 className="font-display text-2xl font-bold text-primary">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" aria-label="إغلاق" data-testid="button-close-modal">
            <X size={20} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
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
          <SelectField name="school" label="المدرسة" options={['مدرسة وايلد', 'مبادرة أهرامات الأمل', 'مدرسة المتفوقين الثانوية']} testId="select-school" />
          <SelectField name="grade" label="الصف الدراسي" options={['الصف التاسع', 'الصف العاشر']} testId="select-grade" />
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
          <SelectField name="grade" label="الصف الدراسي" options={['الصف التاسع', 'الصف العاشر']} testId="select-complete-grade" />
          <SelectField name="school" label="المدرسة" options={['مدرسة وايلد', 'مبادرة أهرامات الأمل', 'مدرسة المتفوقين الثانوية']} testId="select-complete-school" />
          <SelectField name="section" label="الشعبة (اختياري)" options={['أ', 'ب', 'ج']} testId="select-complete-section" optional />
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
  const logout = useLogoutAccount();
  const studentDash = useGetStudentDashboard();

  useEffect(() => {
    if (mode !== 'student') return;
    let cancelled = false;
    fetchAuthMe()
      .then((me) => {
        if (cancelled) return;
        if (me.authenticated && me.needsSetup) setLocation('/auth/complete');
        else if (me.role === 'admin') setLocation('/teacher');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [mode, setLocation]);

  useEffect(() => {
    if (mode !== 'teacher') return;
    let cancelled = false;
    fetchAuthMe()
      .then((me) => {
        if (cancelled) return;
        if (!me.authenticated) { setLocation('/login'); return; }
        if (me.role !== 'admin') setLocation('/student');
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
        className={`fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-sidebar-border bg-sidebar px-5 py-6 text-sidebar-foreground shadow-2xl transition-transform duration-300 ${
          mobileMenu ? 'translate-x-0' : 'translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={() => setMobileMenu(false)} className="rounded-lg p-2 text-sidebar-foreground/60 lg:hidden" data-testid="button-close-menu">
            <X size={19} />
          </button>
        </div>
        <div className="mt-10 rounded-2xl bg-sidebar-accent p-4">
          <div className="flex items-center gap-3">
            <Avatar name={mode === 'student' ? studentName : 'أ'} src={mode === 'teacher' ? teacherImageUrl : undefined} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{mode === 'student' ? studentName : 'المعلم أحمد يحيى الأسطل'}</p>
              <p className="mt-0.5 truncate text-xs text-sidebar-foreground/60">{mode === 'student' ? studentSubtitle : 'إدارة ومتابعة المنصة'}</p>
            </div>
          </div>
        </div>
        <nav className="mt-8 space-y-1.5">
          {links.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenu(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`}
                data-testid={`link-nav-${item.href.replaceAll('/', '-').replace(/^-/, '')}`}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {isActive && <ChevronLeft size={16} className="mr-auto" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-sidebar-border p-4 bg-sidebar-accent/50">
          <p className="text-xs leading-6 text-sidebar-foreground/65">
            تقدمك اليوم يصنع
            <br />
            <strong className="text-sidebar-foreground font-bold">فصاحتك وعلو شأنك في لغة القرآن.</strong>
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sidebar-accent">
            <div className="h-full w-[70%] rounded-full bg-sidebar-primary" />
          </div>
        </div>
      </aside>

      {mobileMenu && <button aria-label="إغلاق القائمة الجانبية" onClick={() => setMobileMenu(false)} className="fixed inset-0 z-40 bg-primary/45 backdrop-blur-[2px] lg:hidden" data-testid="button-close-menu-backdrop" />}

      <div className="lg:mr-72">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenu(true)} aria-expanded={mobileMenu} className="rounded-xl border border-border p-2 text-primary lg:hidden" data-testid="button-open-menu">
              <Menu size={20} />
            </button>
            <div>
              <p className="hidden text-xs text-muted-foreground sm:block">أرض اللغة / {mode === 'student' ? 'بوابة الطالب' : 'بوابة المعلم'}</p>
              <h1 className="text-lg font-bold text-primary">{active}</h1>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <button className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" data-testid="button-notifications">
              <Bell size={19} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
            </button>
            <button onClick={() => setProfileMenu((open) => !open)} className="hidden items-center gap-2.5 rounded-xl p-1.5 pl-3 transition-colors hover:bg-muted sm:flex" data-testid="button-profile-menu">
              <Avatar name={mode === 'student' ? studentName : 'أ'} src={mode === 'teacher' ? teacherImageUrl : undefined} size="sm" />
              <span className="text-sm font-semibold">{mode === 'student' ? studentName.split(' ')[0] : 'الأستاذ أحمد'}</span>
              <ChevronLeft size={15} className={`transition-transform ${profileMenu ? 'rotate-90' : '-rotate-90'}`} />
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
        <main className="animate-fade px-5 py-7 pb-24 sm:px-8 lg:px-10">{children}</main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur lg:hidden">
        {links.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`grid min-w-14 place-items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold ${location === item.href ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} data-testid={`link-mobile-${item.href.replaceAll('/', '-').replace(/^-/, '')}`}>
              <Icon size={18} />
              <span>{item.label.split(' ')[0]}</span>
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
  const data = query.data ? { ...query.data, announcements: query.data.announcements?.length ? query.data.announcements : announcementsQuery.data ?? [] } : undefined;
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
              <p className="text-sm font-medium text-muted-foreground">{a.unit}</p>
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

function AssessmentsPage() {
  const query = useListAssessments();
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<any | null>(null);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);

  const startAssessment = async (assessment: any) => {
    setActiveQuiz(assessment);
    setLoadingQuiz(true);
    setQuizResult(null);
    setUserAnswers({});
    try {
      const res = await fetch(`/api/assessments/${assessment.id}/questions`);
      const questions = await res.json();
      setQuizQuestions(questions);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingQuiz(false);
    }
  };

  const submitQuiz = async () => {
    if (!activeQuiz) return;
    setSubmittingQuiz(true);
    try {
      const res = await fetch(`/api/assessments/${activeQuiz.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: userAnswers }),
      });
      const result = await res.json();
      setQuizResult(result);
      query.refetch();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingQuiz(false);
    }
  };

  return (
    <Shell mode="student">
      <PageHeading eyebrow="قياس الفهم والإتقان" title="التقييمات والاختبارات" body="اختبارات تفاعلية حية متعددة الخيارات تقيس فهمك للنحو والبلاغة وأحكام التلاوة والتجويد." />
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <StateNotice type="empty" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {query.data.map((assessment) => (
            <div key={assessment.id} className="rounded-3xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow" data-testid={`card-assessment-${assessment.id}`}>
              <div className="flex items-start justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
                  <Target size={22} />
                </span>
                <span className="rounded-full bg-accent/25 px-3 py-1 text-xs font-bold text-accent-foreground">
                  {assessment.status}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-primary leading-tight">{assessment.title}</h3>
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs text-muted-foreground font-medium">
                <span>
                  <strong className="block text-lg font-bold text-primary">{assessment.questions}</strong>أسئلة تقييمية
                </span>
                <span>
                  <strong className="block text-lg font-bold text-primary">{assessment.duration}</strong>المدة المحددة
                </span>
                <span>
                  <strong className="block text-lg font-bold text-primary">100%</strong>الدرجة الكاملة
                </span>
              </div>
              <Button onClick={() => startAssessment(assessment)} variant="primary" className="mt-5 w-full py-3" data-testid={`button-assessment-${assessment.id}`}>
                ابدأ الاختبار التفاعلي الآن <ArrowLeft size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Quiz Modal */}
      {activeQuiz && (
        <Modal title={activeQuiz.title} eyebrow="اختبار تفاعلي مباشر" onClose={() => setActiveQuiz(null)} maxWidth="max-w-2xl">
          {loadingQuiz ? (
            <StateNotice type="loading" />
          ) : quizResult ? (
            /* Quiz Result Screen */
            <div className="space-y-6 text-center">
              <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-accent/20 text-primary">
                <Award size={46} className="text-accent-foreground" />
              </div>
              <div>
                <h3 className="text-3xl font-display font-bold text-primary">{quizResult.score}%</h3>
                <p className="mt-1 font-semibold text-accent-foreground">{quizResult.message}</p>
                <p className="mt-2 text-xs text-muted-foreground font-medium">
                  أجبت بشكل صحيح على {quizResult.correctAnswers} من أصل {quizResult.totalQuestions} أسئلة.
                </p>
              </div>

              {/* Review answers */}
              <div className="space-y-4 text-right border-t border-border pt-5">
                <h4 className="font-bold text-primary text-sm">مراجعة الإجابات النموذجية والشروحات:</h4>
                {quizResult.review?.map((r: any, idx: number) => (
                  <div key={idx} className={`rounded-2xl p-4 text-xs border ${r.isCorrect ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    <p className="font-bold text-primary text-sm mb-2">{idx + 1}. {r.question}</p>
                    <p className="text-muted-foreground mb-1 leading-5">
                      <span className="font-semibold">تفسير الإجابة:</span> {r.explanation}
                    </p>
                    <span className={`inline-block font-bold mt-1 ${r.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                      {r.isCorrect ? '✓ إجابة صحيحة' : '✗ لم تصب الإجابة'}
                    </span>
                  </div>
                ))}
              </div>

              <Button onClick={() => setActiveQuiz(null)} variant="primary" className="w-full py-3">
                إنهاء ومتابعة الوحدات
              </Button>
            </div>
          ) : (
            /* Quiz Questions Form */
            <div className="space-y-6 text-right">
              <div className="flex items-center justify-between rounded-xl bg-secondary/50 p-3 text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5"><Clock3 size={15} /> المدة: {activeQuiz.duration}</span>
                <span>عدد الأسئلة: {quizQuestions.length}</span>
              </div>

              <div className="space-y-6">
                {quizQuestions.map((q, qIndex) => (
                  <div key={q.id} className="rounded-2xl border border-border p-5 bg-card">
                    <p className="font-bold text-primary text-sm mb-4 leading-6">
                      {qIndex + 1}. {q.question}
                    </p>
                    <div className="space-y-2.5">
                      {q.options.map((opt: string, optIndex: number) => {
                        const selected = userAnswers[q.id] === optIndex;
                        return (
                          <label
                            key={optIndex}
                            className={`flex items-center gap-3 rounded-xl border p-3 text-xs font-semibold cursor-pointer transition-colors ${
                              selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:bg-secondary/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              checked={selected}
                              onChange={() => setUserAnswers((prev) => ({ ...prev, [q.id]: optIndex }))}
                              className="accent-primary"
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  تمت الإجابة على {Object.keys(userAnswers).length} من أصل {quizQuestions.length}
                </span>
                <Button onClick={submitQuiz} disabled={submittingQuiz || Object.keys(userAnswers).length < quizQuestions.length} variant="primary" className="py-2.5 px-6">
                  {submittingQuiz ? 'جارٍ التصحيح...' : 'تسليم الإجابات'} <ArrowLeft size={16} />
                </Button>
              </div>
            </div>
          )}
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
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState({ name: '', school: '', branch: '', grade: '', section: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const openEdit = () => {
    if (s) {
      setForm({
        name: s.name || '',
        school: s.school || '',
        branch: s.branch || '',
        grade: s.grade || '',
        section: s.section || '',
        phone: s.phone || '',
      });
    }
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
        body: JSON.stringify({ id: s?.id, ...form }),
      });
      query.refetch();
      setMsg('تم حفظ البيانات بنجاح!');
      setTimeout(() => {
        setShowEdit(false);
        setMsg('');
      }, 1500);
    } catch (e) {
      setMsg('تعذر حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell mode="student">
      <PageHeading eyebrow="بياناتي التعليمية" title="الملف الشخصي" action={<Button onClick={openEdit} variant="outline" data-testid="button-edit-profile"><Pencil size={16} /> تعديل البيانات</Button>} />
      {query.isLoading ? (
        <StateNotice type="loading" />
      ) : query.isError ? (
        <StateNotice type="error" onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
          <div className="rounded-3xl bg-primary p-8 text-primary-foreground shadow-md">
            <Avatar name={s?.name ?? 'م'} src={s?.avatarUrl} size="lg" />
            <h3 className="mt-6 font-display text-2xl font-bold">{s?.name || ''}</h3>
            <p className="mt-1 text-sm text-primary-foreground/70">{s?.email || ''}</p>
            <div className="mt-8 border-t border-primary-foreground/15 pt-5">
              <p className="text-xs text-primary-foreground/60 font-semibold">مستوى الإنجاز العام</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2.5 flex-1 rounded-full bg-primary-foreground/20">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${s?.progress ?? 70}%` }} />
                </div>
                <span className="text-sm font-bold">{s?.progress ?? 70}%</span>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
            <h3 className="text-lg font-bold text-primary">البيانات الأكاديمية الرسمية</h3>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {[
                ['المدرسة المعتمدة', s?.school],
                ['المسار الأكاديمي', s?.branch],
                ['الصف الدراسي', s?.grade],
                ['الشعبة', s?.section],
                ['الجنس', s?.gender],
                ['حالة الحساب', s?.status],
              ].map(([label, value]) => (
                <div key={label as string} className="border-b border-border/50 pb-3">
                  <p className="text-xs text-muted-foreground font-semibold">{label}</p>
                  <p className="mt-1 text-sm font-bold text-primary">{value || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEdit && (
        <Modal title="تعديل الملف الشخصي" eyebrow="البيانات الشخصية" onClose={() => setShowEdit(false)} maxWidth="max-w-md">
          <form onSubmit={handleSave} className="space-y-4">
            <label className="block text-sm font-semibold">
              <span className="mb-2 block">الاسم الكامل</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                <span className="mb-2 block">المدرسة</span>
                <input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" />
              </label>
              <label className="block text-sm font-semibold">
                <span className="mb-2 block">الصف</span>
                <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" />
              </label>
              <label className="block text-sm font-semibold">
                <span className="mb-2 block">الشعبة</span>
                <input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" />
              </label>
              <label className="block text-sm font-semibold">
                <span className="mb-2 block">رقم الهاتف</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" />
              </label>
            </div>
            {msg && <p className="text-sm font-bold text-accent-foreground">{msg}</p>}
            <div className="flex items-center justify-end gap-3 pt-3">
              <Button onClick={() => setShowEdit(false)} variant="ghost">إلغاء</Button>
              <Button type="submit" disabled={saving} variant="primary">
                {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
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
  const [showAdd, setShowAdd] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', school: 'مدرسة وايلد', grade: 'الصف العاشر', section: 'أ', gender: 'طالب', phone: '' });
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  const students = useMemo(
    () => (query.data ?? []).filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.school.toLowerCase().includes(search.toLowerCase())),
    [query.data, search]
  );

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
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 sm:max-w-md shadow-sm">
        <Search size={18} className="text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الطالب أو المدرسة..." className="w-full bg-transparent text-sm outline-none" data-testid="input-search-students" />
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
            <span>الصف والشعبة</span>
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
              <p className="text-sm text-muted-foreground font-medium">{s.grade} · شعبة {s.section}</p>
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

  const change = (key: keyof typeof form, value: string) => {
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

  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => change('teacherImageUrl', String(reader.result));
    reader.readAsDataURL(file);
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
            <div className="mt-8 border-t border-border pt-6">
              <p className="font-bold text-primary text-sm">صورة المعلم</p>
              <p className="mt-1 text-xs text-muted-foreground">تظهر في الصفحة الرئيسية ومساحات الطلاب.</p>
              <label className="mt-4 flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-border p-4 transition-colors hover:bg-secondary/40">
                <Avatar name={values.teacherName || 'أ'} src={values.teacherImageUrl || teacherImageUrl} />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-primary">تغيير صورة المعلم</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">PNG أو JPG، حتى 5 ميجابايت</span>
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
        <Route path="/student" component={StudentDashboard} />
        <Route path="/student/courses" component={CoursesPage} />
        <Route path="/student/assignments" component={AssignmentsPage} />
        <Route path="/student/assessments" component={AssessmentsPage} />
        <Route path="/student/profile" component={ProfilePage} />
        <Route path="/teacher" component={TeacherDashboard} />
        <Route path="/teacher/students" component={StudentsPage} />
        <Route path="/teacher/content" component={ContentPage} />
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