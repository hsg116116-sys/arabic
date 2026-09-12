// @ts-nocheck
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
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
import type { LucideIcon } from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const teacherImageUrl = '/teacher-ahmed.jpg';
const platformLogoUrl = '/ard-al-lughah-logo.png';
const platformBannerUrl = '/ard-al-lughah-banner.jpeg';
const bookNineUrl = '/arab-9.jpg';
const bookTenUrl = '/arab-10.jpg';

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

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
      <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm">
        <img src={platformLogoUrl} alt="شعار أرض اللغة" className="h-full w-full object-contain p-0.5" />
      </span>
      {!compact && <span className="font-display text-xl font-bold tracking-tight">أرض اللغة</span>}
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
    <button type={type} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function StateNotice({ type, onRetry }: { type: 'loading' | 'empty' | 'error'; onRetry?: () => void }) {
  if (type === 'loading') {
    return <div className="space-y-3 rounded-2xl border border-border bg-card p-6"><div className="h-4 w-1/3 animate-pulse rounded-full bg-muted" /><div className="h-4 w-2/3 animate-pulse rounded-full bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /></div>;
  }
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">{type === 'error' ? <X size={20} /> : <Sparkles size={20} />}</span>
      <p className="font-semibold">{type === 'error' ? 'تعذر تحميل البيانات حالياً' : 'لا توجد بيانات بعد'}</p>
      <p className="mt-1 text-sm text-muted-foreground">{type === 'error' ? 'حاول التحديث مرة أخرى بعد قليل.' : 'ستظهر هنا أولى خطواتك عند إضافة المحتوى.'}</p>
      {type === 'error' && onRetry && <Button onClick={onRetry} variant="soft" className="mt-4">إعادة المحاولة</Button>}
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  children,
  onClose,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-primary/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button aria-label="إغلاق" className="absolute inset-0 cursor-default" onClick={onClose} data-testid="button-close-modal-overlay" />
      <div className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-auto rounded-3xl border border-border bg-card p-6 shadow-lg animate-rise sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow && <p className="mb-2 text-xs font-bold text-accent-foreground">{eyebrow}</p>}
            <h2 className="font-display text-2xl font-bold text-primary">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" aria-label="إغلاق" data-testid="button-close-modal">
            <X size={18} />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function Feedback({ message, tone = 'info' }: { message: string; tone?: 'info' | 'error' }) {
  return (
    <div className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm leading-6 ${tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`} role="status" data-testid="status-feedback">
      {tone === 'error' ? <CircleAlert size={17} className="mt-1 shrink-0" /> : <CheckCircle2 size={17} className="mt-1 shrink-0" />}
      <span>{message}</span>
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
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--accent))" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - circumference * Math.min(value, 100) / 100} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-bold text-primary">{value}%</span>
    </div>
  );
}

function Avatar({ name = 'أ', src, size = 'md' }: { name?: string; src?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-20 w-20 text-2xl' };
  return src ? <img src={src} alt={name} className={`${sizes[size]} rounded-2xl object-cover`} data-testid="img-avatar" /> : <span className={`${sizes[size]} grid place-items-center rounded-2xl bg-secondary font-bold text-primary`} data-testid="avatar-fallback">{name.slice(0, 1)}</span>;
}

function PublicHeader() {
  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
      <Logo />
      <nav className="hidden items-center gap-8 text-sm font-semibold text-muted-foreground md:flex">
        <a href="#books" className="transition-colors hover:text-primary" data-testid="link-journey">الكتب التعليمية</a>
        <a href="#teacher" className="transition-colors hover:text-primary" data-testid="link-teacher">مع الأستاذ أحمد</a>
        <a href="#numbers" className="transition-colors hover:text-primary" data-testid="link-numbers">عن المنصة</a>
      </nav>
      <div className="flex items-center gap-2">
        <Link href="/login" className="hidden px-3 py-2 text-sm font-semibold text-primary sm:block" data-testid="link-login">تسجيل الدخول</Link>
        <Link href="/register" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="link-register">ابدأ التعلم</Link>
      </div>
    </header>
  );
}

function Home() {
  const overview = useGetPlatformOverview();
  const platform = overview.data;
  const stats = platform?.stats;
  return (
    <div className="min-h-[100dvh] overflow-hidden bg-background">
      <PublicHeader />
      <main>
         <section className="surface-grid relative mx-auto max-w-7xl px-5 pb-20 pt-10 lg:px-8 lg:pb-28 lg:pt-16">
          <div className="pointer-events-none absolute -left-48 top-10 h-[34rem] w-[34rem] rounded-full bg-accent/20 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.03fr_.97fr]">
            <div className="order-2 animate-rise lg:order-1">
               <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/45 bg-card/75 px-3.5 py-2 text-xs font-bold text-primary shadow-sm"><Sparkles size={14} className="text-accent-foreground" /> منصة عربية للتعلّم من قلب فلسطين</div>
               <h1 className="max-w-2xl text-balance font-display text-[2.75rem] font-bold leading-[1.45] text-primary sm:text-5xl lg:text-[4.35rem]">أرض اللغة<br /><span className="text-accent-foreground">تقرّبك من العربية.</span></h1>
               <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">{platform?.tagline ?? 'تعلّم العربية بثقة، خطوة بعد خطوة، مع منهج واضح ومتابعة إنسانية.'}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid="link-hero-register">ابدأ رحلتك <ArrowLeft size={18} /></Link>
                <a href="#books" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3.5 font-semibold text-primary transition-colors hover:bg-secondary" data-testid="link-hero-books">تصفح الكتب <BookOpen size={18} /></a>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
                <div className="flex -space-x-2 space-x-reverse">{['س','م','ر'].map((letter) => <Avatar key={letter} name={letter} size="sm" />)}</div>
                <span>محتوى مرتب للصفين التاسع والعاشر</span>
                <span className="hidden h-1 w-1 rounded-full bg-accent sm:block" />
                <span className="flex items-center gap-1.5 font-semibold text-primary"><CheckCircle2 size={16} className="text-accent-foreground" /> تعلّم بثقة</span>
              </div>
            </div>
             <div className="relative order-1 animate-rise [animation-delay:120ms] lg:order-2">
               <div className="relative overflow-hidden rounded-[1.75rem] border border-primary/10 bg-primary p-2.5 shadow-[0_24px_70px_hsl(var(--primary)/.2)] sm:p-3">
                 <div className="overflow-hidden rounded-[1.25rem] bg-[#fffdf9]">
                   <img src={platformBannerUrl} alt="بانر أرض اللغة مع كتاب اللغة العربية والمعلم أحمد يحيى الأسطل" className="block aspect-[15/11] w-full object-cover" data-testid="img-platform-banner" />
                 </div>
               </div>
             </div>
          </div>
        </section>
        <section id="books" className="border-y border-border bg-card/60 py-16 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-8">
            <div>
               <p className="text-sm font-bold text-accent-foreground">كتب ترافقك في كل خطوة</p>
               <h2 className="mt-3 font-display text-3xl font-bold leading-[1.55] text-primary sm:text-4xl">كتب واضحة،<br />تستحق أن تُفتح كل يوم.</h2>
               <p className="mt-5 max-w-md text-base leading-8 text-muted-foreground">سلسلة اللغة العربية للصفين التاسع والعاشر، مرتبة لتقرأ وتفهم وتطبّق بثقة.</p>
              <Link href="/register" className="mt-7 inline-flex items-center gap-2 font-semibold text-primary hover:text-accent-foreground" data-testid="link-books-register">ابدأ مع كتبك <ArrowLeft size={17} /></Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <BookCover image={bookNineUrl} grade="الجزء الأول · ٠٩" title="اللغة العربية" subtitle="المسار الأكاديمي" tone="purple" />
              <BookCover image={bookTenUrl} grade="الجزء الأول · ١٠" title="اللغة العربية" subtitle="المسار الأكاديمي" tone="rose" />
            </div>
          </div>
        </section>
        <section id="journey" className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
          <div className="max-w-xl"><p className="text-sm font-bold text-accent-foreground">طريق واضح، أثر دائم</p><h2 className="mt-3 font-display text-4xl font-bold text-primary">كل درس يقرّبك من صوتك العربي</h2></div>
          <div className="mt-12 grid gap-4 md:grid-cols-3"><FeatureCard number="01" icon={Library} title="تعلم على مهل" body="وحدات قصيرة ومركزة، مصممة لتناسب يومك وتحافظ على فضولك." /><FeatureCard number="02" icon={Target} title="اعرف تقدمك" body="ترى ما أنجزته وما ينتظرك، فتتحول الخطوات الصغيرة إلى إنجاز ملموس." /><FeatureCard number="03" icon={Award} title="احتفل بالنمو" body="تقييمات هادئة وشهادات تعكس رحلة حقيقية، لا مجرد أرقام عابرة." /></div>
        </section>
        <section id="teacher" className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-8 lg:py-24">
          <div className="relative mx-auto w-full max-w-sm"><div className="absolute -inset-4 rotate-3 rounded-[2rem] bg-accent/25" /><div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-primary text-primary-foreground shadow-lg"><img src={teacherImageUrl} alt="الأستاذ أحمد يحيى الأسطل" className="h-full w-full object-cover object-[center_18%]" data-testid="img-teacher-public" /><div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/25 to-transparent" /><div className="absolute bottom-7 right-7 left-7"><p className="text-sm text-primary-foreground/70">المعلم الذي يمشي معك</p><h2 className="mt-1 font-display text-3xl font-bold">{platform?.teacherName ?? 'أحمد يحيى الأسطل'}</h2></div><div className="absolute left-7 top-7 h-3 w-3 rounded-full bg-accent shadow-[0_0_0_6px_hsl(var(--accent)/.18)]" /></div></div>
          <div><p className="text-sm font-bold text-accent-foreground">تعلم إنساني</p><h2 className="mt-3 max-w-xl font-display text-4xl font-bold leading-tight text-primary">منهج يعرف أن لكل طالب إيقاعه.</h2><p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{platform?.description ?? 'مع الأستاذ أحمد، تتحول العربية من مادة دراسية إلى مساحة للتعبير والفهم والثقة.'}</p><div className="mt-8 flex items-center gap-5"><div className="h-px w-16 bg-accent" /><span className="font-display text-xl text-primary">أحمد يحيى الأسطل</span></div></div>
        </section>
        <section id="numbers" className="bg-primary py-14 text-primary-foreground"><div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-8 px-5 lg:grid-cols-5 lg:px-8">{[['students','طالباً'],['units','وحدة تعليمية'],['assessments','تقييماً'],['assignments','واجباً'],['certificates','شهادة']].map(([key,label]) => <div key={key} className="text-center lg:border-l lg:border-primary-foreground/15 last:lg:border-0"><p className="font-display text-4xl font-bold text-accent">{stats?.[key as keyof typeof stats] ?? '—'}</p><p className="mt-2 text-sm text-primary-foreground/65">{label}</p></div>)}</div></section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8"><Logo /><p>لغة تنمو بك، وبك تنمو.</p></footer>
    </div>
  );
}

function FeatureCard({ number, icon: Icon, title, body }: { number: string; icon: typeof BookOpen; title: string; body: string }) {
  return <div className="group rounded-3xl border border-border bg-background p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md"><div className="flex items-center justify-between"><span className="font-mono text-xs text-muted-foreground">{number}</span><span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-primary transition-colors group-hover:bg-accent"><Icon size={20} /></span></div><h3 className="mt-8 text-xl font-bold text-primary">{title}</h3><p className="mt-3 leading-7 text-muted-foreground">{body}</p></div>;
}

function BookCover({ image, grade, title, subtitle, tone }: { image: string; grade: string; title: string; subtitle: string; tone: 'purple' | 'rose' }) {
  return (
    <Link href="/register" className="group relative overflow-hidden rounded-[1.7rem] border border-primary/10 bg-primary p-3 shadow-md transition-all duration-300 hover:-translate-y-2 hover:shadow-xl" data-testid={`card-book-${grade}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-[1.25rem] bg-muted">
        <img src={image} alt={`${title} ${grade}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className={`absolute inset-0 bg-gradient-to-t ${tone === 'rose' ? 'from-[#3d263f]/70 via-transparent' : 'from-[#2d2040]/70 via-transparent'} to-transparent`} />
        <div className="absolute right-4 top-4 rounded-full border border-white/30 bg-black/20 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm">{grade}</div>
        <div className="absolute inset-x-4 bottom-4 text-white"><p className="text-lg font-bold">{title}</p><p className="mt-1 text-xs text-white/75">{subtitle}</p></div>
      </div>
      <div className="flex items-center justify-between px-2 pb-1 pt-4 text-primary-foreground"><span className="text-sm font-bold">عرض الكتاب</span><ArrowLeft size={17} className="transition-transform group-hover:-translate-x-1" /></div>
    </Link>
  );
}

function AuthLayout({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow: string }) {
  return <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[.9fr_1.1fr]"><div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex"><Logo /><div><p className="mb-5 text-sm text-primary-foreground/60">{eyebrow}</p><h1 className="max-w-md font-display text-6xl font-bold leading-tight">العربية<br />تسكنك.</h1><p className="mt-6 max-w-sm leading-8 text-primary-foreground/65">مساحة شخصية تساعدك أن تتعلم بهدوء، وتتكلم بثقة، وتحتفل بكل تقدم.</p></div><p className="text-sm text-primary-foreground/45">أرض اللغة · معك في كل خطوة</p></div><div className="flex flex-col px-5 py-6 sm:px-10 lg:px-24 lg:py-10"><div className="flex items-center justify-between"><div className="lg:hidden"><Logo compact /></div><Link href="/" className="mr-auto inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-auth-home"><ArrowRightIcon /> العودة للرئيسية</Link></div><div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12"><p className="text-sm font-semibold text-accent-foreground">{eyebrow}</p><h1 className="mt-3 font-display text-4xl font-bold text-primary">{title}</h1>{children}</div></div></div>;
}
function ArrowRightIcon() { return <ArrowLeft size={16} />; }

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
    login.mutate({ data: { email: String(data.get('email') ?? ''), password: String(data.get('password') ?? '') } }, {
      onSuccess: () => setLocation('/student'),
      onError: (error) => setMessage(error?.message || 'تعذر تسجيل الدخول. راجع البيانات وحاول مرة أخرى.'),
    });
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
    reset.mutate({ data: { email } }, { onSuccess: (result) => setMessage(result.message), onError: () => setMessage('تعذر إرسال رسالة الاستعادة الآن.') });
  };
  const continueWithGoogle = async () => {
    const result = await google.refetch();
    if (result.data?.url) window.location.assign(result.data.url);
    else setMessage('تعذر تجهيز تسجيل الدخول عبر Google الآن.');
  };
  return <AuthLayout title="مرحباً بعودتك" eyebrow="مساحتك التعليمية"><form onSubmit={submit} className="mt-9 space-y-5"><Field name="email" label="البريد الإلكتروني" type="email" placeholder="name@example.com" testId="input-email" /><Field name="password" label="كلمة المرور" type="password" placeholder="••••••••" testId="input-password" /><div className="flex items-center justify-between text-sm"><label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" className="accent-primary" /> تذكرني</label><button type="button" onClick={requestReset} className="font-semibold text-primary" data-testid="button-forgot">نسيت كلمة المرور؟</button></div>{showForgot && <p className="rounded-xl bg-secondary px-4 py-3 text-xs leading-6 text-muted-foreground">سيتم إرسال رابط الاستعادة إلى البريد المكتوب أعلاه.</p>}{message && <p className="rounded-xl bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground">{message}</p>}<Button type="submit" disabled={login.isPending} className="mt-2 w-full py-3.5" data-testid="button-login">{login.isPending ? 'جارٍ الدخول...' : 'دخول إلى مساحتي'} <ArrowLeft size={17} /></Button></form><button type="button" onClick={continueWithGoogle} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-secondary" data-testid="button-google-login"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">G</span> المتابعة باستخدام Google</button><p className="mt-8 text-center text-sm text-muted-foreground">ليس لديك حساب؟ <Link href="/register" className="font-bold text-primary" data-testid="link-register-auth">أنشئ حساباً</Link></p></AuthLayout>;
}

function Register() {
  const [, setLocation] = useLocation();
  const register = useRegisterAccount();
  const [message, setMessage] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setMessage('');
    register.mutate({ data: {
      fullName: String(data.get('fullName') ?? ''),
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
      studentNumber: String(data.get('studentNumber') ?? ''),
      school: String(data.get('school') ?? ''),
      branch: String(data.get('branch') ?? ''),
      grade: String(data.get('grade') ?? ''),
      section: String(data.get('section') ?? ''),
      gender: String(data.get('gender') ?? ''),
      phone: String(data.get('phone') ?? ''),
    } }, {
      onSuccess: () => setLocation('/student'),
      onError: (error) => setMessage(error?.message || 'تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.'),
    });
  };
  return <AuthLayout title="ابدأ من هنا" eyebrow="حساب طالب جديد"><form onSubmit={submit} className="mt-8 space-y-4"><Field name="fullName" label="الاسم الكامل" placeholder="اكتب اسمك كما تحب أن يظهر" testId="input-name" /><div className="grid gap-4 sm:grid-cols-2"><Field name="email" label="البريد الإلكتروني" type="email" placeholder="name@example.com" testId="input-register-email" /><Field name="studentNumber" label="رقم الطالب أو الرقم السري" placeholder="مثال: 1024" testId="input-student-number" /></div><Field name="password" label="كلمة المرور" type="password" placeholder="أنشئ كلمة مرور آمنة" testId="input-register-password" /><div className="grid gap-4 sm:grid-cols-2"><SelectField name="school" label="المدرسة" options={['مدرسة وايلد', 'مبادرة أهرامات الأمل']} testId="select-school" /><Field name="branch" label="الفرع" placeholder="مثال: مدينتي أو الشروق" testId="input-branch" /><SelectField name="grade" label="الصف" options={['الصف التاسع', 'الصف العاشر']} testId="select-grade" /><Field name="section" label="الشعبة" placeholder="مثال: أ" testId="input-section" /><SelectField name="gender" label="الجنس" options={['طالب', 'طالبة']} testId="select-gender" /><Field name="phone" label="رقم الهاتف (اختياري)" placeholder="01xxxxxxxxx" testId="input-phone" /></div><label className="flex items-start gap-2 pt-1 text-xs leading-5 text-muted-foreground"><input type="checkbox" required className="mt-1 accent-primary" /> أوافق على أن أتعلم بانتظام وأحترم وقتي في هذه الرحلة.</label>{message && <p className="rounded-xl bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground">{message}</p>}<Button type="submit" disabled={register.isPending} className="mt-2 w-full py-3.5" data-testid="button-register">{register.isPending ? 'جارٍ إنشاء الحساب...' : 'إنشاء حسابي'} <ArrowLeft size={17} /></Button></form><p className="mt-7 text-center text-sm text-muted-foreground">لديك حساب؟ <Link href="/login" className="font-bold text-primary" data-testid="link-login-auth">سجل دخولك</Link></p></AuthLayout>;
}
function Field({ name, label, type = 'text', placeholder, testId }: { name?: string; label: string; type?: string; placeholder: string; testId: string }) { return <label className="block text-sm font-semibold text-foreground"><span className="mb-2 block">{label}</span><input name={name} required={type !== 'tel' && !label.includes('اختياري')} type={type} placeholder={placeholder} data-testid={testId} className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-accent/20" /></label>; }
function SelectField({ name, label, options, testId }: { name: string; label: string; options: string[]; testId: string }) { return <label className="block text-sm font-semibold text-foreground"><span className="mb-2 block">{label}</span><select name={name} required data-testid={testId} className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20"><option value="">اختر</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; }

function AuthCallback() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hash.get('access_token');
    if (accessToken) window.localStorage.setItem('supabase_access_token', accessToken);
    setLocation('/student');
  }, [setLocation]);
  return <AuthLayout title="نجهّز مساحتك" eyebrow="تسجيل الدخول"><div className="mt-8 rounded-2xl bg-secondary p-5 text-sm leading-7 text-muted-foreground">تم التحقق من حسابك. لحظات وننقلك إلى مساحة التعلم.</div></AuthLayout>;
}

function Shell({ mode, children }: { mode: 'student' | 'teacher'; children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const logout = useLogoutAccount();
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
  return <div className="min-h-[100dvh] bg-background"><aside className={`fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-sidebar-border bg-sidebar px-5 py-6 text-sidebar-foreground shadow-2xl transition-transform duration-300 ${mobileMenu ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0`}><div className="flex items-center justify-between"><Logo /><button onClick={() => setMobileMenu(false)} className="rounded-lg p-2 text-sidebar-foreground/60 lg:hidden" data-testid="button-close-menu"><X size={19} /></button></div><div className="mt-12 rounded-2xl bg-sidebar-accent p-4"><div className="flex items-center gap-3"><Avatar name={mode === 'student' ? 'س' : 'أ'} /><div><p className="text-sm font-bold">{mode === 'student' ? 'سارة أحمد' : 'أحمد يحيى الأسطل'}</p><p className="mt-0.5 text-xs text-sidebar-foreground/55">{mode === 'student' ? 'طالبة · الصف العاشر' : 'مساحة المعلم'}</p></div></div></div><nav className="mt-8 space-y-1">{links.map((item) => { const Icon = item.icon; const isActive = location === item.href; return <Link key={item.href} href={item.href} onClick={() => setMobileMenu(false)} className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${item.href.replaceAll('/', '-').replace(/^-/, '')}`}><Icon size={18} /><span>{item.label}</span>{isActive && <ChevronLeft size={16} className="mr-auto" />}</Link>; })}</nav><div className="mt-auto rounded-2xl border border-sidebar-border p-4"><p className="text-xs leading-6 text-sidebar-foreground/55">تقدمك اليوم يصنع<br /><strong className="text-sidebar-foreground">نسختك الأقرب من اللغة.</strong></p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sidebar-accent"><div className="h-full w-[68%] rounded-full bg-sidebar-primary" /></div></div></aside>{mobileMenu && <button aria-label="إغلاق القائمة الجانبية" onClick={() => setMobileMenu(false)} className="fixed inset-0 z-40 bg-primary/45 backdrop-blur-[2px] lg:hidden" data-testid="button-close-menu-backdrop" />}<div className="lg:mr-72"><header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md sm:px-8"><div className="flex items-center gap-3"><button onClick={() => setMobileMenu(true)} aria-expanded={mobileMenu} className="rounded-xl border border-border p-2 text-primary lg:hidden" data-testid="button-open-menu"><Menu size={20} /></button><div><p className="hidden text-xs text-muted-foreground sm:block">أرض اللغة /</p><h1 className="text-lg font-bold text-primary">{active}</h1></div></div><div className="relative flex items-center gap-2"><button className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary" data-testid="button-notifications"><Bell size={19} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" /></button><button onClick={() => setProfileMenu((open) => !open)} className="hidden items-center gap-2 rounded-xl p-1.5 pl-3 transition-colors hover:bg-muted sm:flex" data-testid="button-profile-menu"><Avatar name={mode === 'student' ? 'س' : 'أ'} size="sm" /><span className="text-sm font-semibold">{mode === 'student' ? 'سارة أحمد' : 'أحمد يحيى'}</span><ChevronLeft size={15} className={`transition-transform ${profileMenu ? 'rotate-90' : '-rotate-90'}`} /></button>{profileMenu && <div className="absolute left-0 top-14 z-50 w-52 rounded-2xl border border-border bg-card p-2 shadow-lg animate-rise"><Link href={mode === 'student' ? '/student/profile' : '/teacher/settings'} onClick={() => setProfileMenu(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-primary hover:bg-secondary" data-testid="link-profile-dropdown"><UserRound size={16} /> {mode === 'student' ? 'ملفي الشخصي' : 'إعدادات المنصة'}</Link><button onClick={signOut} disabled={logout.isPending} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10" data-testid="button-logout"><LogOut size={16} /> {logout.isPending ? 'جارٍ الخروج...' : 'تسجيل الخروج'}</button></div>}</div></header><main className="animate-fade px-5 py-7 pb-24 sm:px-8 lg:px-10">{children}</main></div><nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur lg:hidden">{links.slice(0, 4).map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={`grid min-w-14 place-items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold ${location === item.href ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} data-testid={`link-mobile-${item.href.replaceAll('/', '-').replace(/^-/, '')}`}><Icon size={18} /><span>{item.label.split(' ')[0]}</span></Link>; })}</nav></div>;
}

function PageHeading({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body?: string; action?: ReactNode }) { return <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">{<div>{eyebrow && <p className="mb-2 text-sm font-semibold text-accent-foreground">{eyebrow}</p>}<h2 className="font-display text-4xl font-bold text-primary">{title}</h2>{body && <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{body}</p>}</div>}{action}</div>; }
function Kpi({ label, value, icon: Icon, tone = 'default' }: { label: string; value: string | number; icon: typeof UsersRound; tone?: 'default' | 'warm' }) { return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone === 'warm' ? 'bg-accent/30 text-accent-foreground' : 'bg-secondary text-primary'}`}><Icon size={19} /></span><MoreHorizontal size={18} className="text-muted-foreground/60" /></div><p className="mt-5 text-3xl font-bold tracking-tight text-primary">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></div>; }

function StudentDashboard() {
  const query = useGetStudentDashboard();
  const announcementsQuery = useListAnnouncements();
  const data = query.data ? { ...query.data, announcements: query.data.announcements?.length ? query.data.announcements : announcementsQuery.data ?? [] } : undefined;
  const [, setLocation] = useLocation();
  useEffect(() => {
    const button = document.querySelector('[data-testid="button-learning-plan"]');
    if (!button) return;
    const goToPlan = () => setLocation('/student/courses');
    button.addEventListener('click', goToPlan);
    return () => button.removeEventListener('click', goToPlan);
  }, [setLocation]);
  return <Shell mode="student"><PageHeading eyebrow="صباح الخير يا سارة" title="نواصل من حيث توقفنا" body="خطوة صغيرة اليوم، تصنع فرقاً كبيراً في رحلتك مع العربية." action={<Button variant="soft" data-testid="button-learning-plan"><CalendarDays size={17} /> خطة التعلم</Button>} />{query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : !data ? <StateNotice type="empty" /> : <><section className="grid gap-5 xl:grid-cols-[1.4fr_.8fr]"><div className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-md sm:p-8"><div className="relative z-10 max-w-lg"><p className="text-sm text-primary-foreground/65">رحلتك حتى الآن</p><h3 className="mt-2 font-display text-3xl font-bold">أنت تبني شيئاً جميلاً.</h3><p className="mt-3 text-sm leading-7 text-primary-foreground/70">أنجزتِ {data.completedLessons} درساً. الدرس التالي ينتظرك عندما تكونين مستعدة.</p><Link href="/student/courses" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground" data-testid="link-continue-learning">متابعة التعلم <ArrowLeft size={17} /></Link></div><div className="absolute -left-8 -top-16 font-display text-[16rem] leading-none text-primary-foreground/5">ض</div><div className="absolute -bottom-12 -right-12 h-40 w-40 rounded-full border-[18px] border-accent/20" /></div><div className="flex items-center gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm"><ProgressRing value={data.progress} size={106} /><div><p className="text-sm text-muted-foreground">التقدم الإجمالي</p><p className="mt-1 text-xl font-bold text-primary">بداية موفقة</p><p className="mt-2 text-xs leading-5 text-muted-foreground">بقيت لك خطوات لتصلي إلى الشارة القادمة.</p></div></div></section><section className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">الخطوة التالية</p><h3 className="mt-1 text-xl font-bold text-primary">وحداتك المقترحة</h3></div><Link href="/student/courses" className="text-sm font-semibold text-primary" data-testid="link-all-courses">عرض الكل</Link></div><div className="mt-5 space-y-3">{data.nextUp?.length ? data.nextUp.slice(0, 3).map((course) => <CourseRow key={course.id} course={course} />) : <StateNotice type="empty" />}</div></div><AnnouncementPanel announcements={data.announcements} /></section></>}</Shell>;
}

function CourseRow({ course }: { course: any }) { return <Link href="/student/courses" className="group flex items-center gap-4 rounded-2xl border border-border p-3 transition-colors hover:bg-secondary/40" data-testid={`card-course-${course.id}`}><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-primary-foreground" style={{ backgroundColor: course.color || 'hsl(var(--primary))' }}><BookOpen size={20} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-primary">{course.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{course.lessons} دروس · {course.duration}</span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-accent" style={{ width: `${course.progress}%` }} /></span></span><span className="text-xs font-bold text-muted-foreground">{course.progress}%</span><ChevronLeft size={16} className="text-muted-foreground transition-transform group-hover:-translate-x-1" /></Link>; }
function AnnouncementPanel({ announcements }: { announcements?: any[] }) { return <div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">من المساحة التعليمية</p><h3 className="mt-1 text-xl font-bold text-primary">إعلانات مهمة</h3></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary"><Bell size={17} /></span></div><div className="mt-5 space-y-4">{announcements?.length ? announcements.slice(0, 3).map((a) => <div key={a.id} className="border-b border-border pb-4 last:border-0 last:pb-0"><p className="font-semibold text-primary">{a.title}</p><p className="mt-1 line-clamp-2 text-xs leading-6 text-muted-foreground">{a.body}</p><p className="mt-2 text-[11px] text-muted-foreground">{a.date}</p></div>) : <StateNotice type="empty" />}</div></div>; }

function CoursesPage() {
  const query = useListCourses();
  return <Shell mode="student"><PageHeading eyebrow="تعلم منظم" title="الوحدات التعليمية" body="مسارات صغيرة، متتابعة، تساعدك أن ترى الصورة كاملة دون أن تثقل عليك." />{query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : !query.data?.length ? <StateNotice type="empty" /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{query.data.map((course, index) => <div key={course.id} className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-md" data-testid={`card-course-detail-${course.id}`}><div className="relative h-32 p-5" style={{ backgroundColor: course.color || 'hsl(var(--primary))' }}><div className="absolute -left-5 -top-12 font-display text-[10rem] leading-none text-white/10">{index % 2 ? 'ع' : 'ض'}</div><div className="relative flex items-start justify-between text-primary-foreground"><span className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold">الوحدة {String(index + 1).padStart(2, '0')}</span><BookOpen size={21} /></div></div><div className="p-5"><h3 className="text-lg font-bold text-primary">{course.title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{course.description}</p><div className="mt-5 flex items-center justify-between text-xs text-muted-foreground"><span>{course.lessons} دروس</span><span>{course.duration}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${course.progress}%` }} /></div><div className="mt-2 flex items-center justify-between text-xs font-semibold"><span className="text-primary">{course.progress}% مكتمل</span><Link href="/student/courses" className="text-primary hover:underline" data-testid={`link-open-course-${course.id}`}>{course.progress ? 'متابعة' : 'ابدأ الوحدة'}</Link></div></div></div>)}</div>}</Shell>;
}

function AssignmentsPage() {
  const query = useListAssignments();
  return <Shell mode="student"><PageHeading eyebrow="تطبيق عملي" title="الواجبات" body="الممارسة تمنح المعرفة صوتاً. راجعي واجباتك القادمة بهدوء." /><div className="mb-5 flex gap-2 overflow-auto"><Button variant="soft" data-testid="button-filter-all">الكل</Button><Button variant="ghost" data-testid="button-filter-pending">قيد الإنجاز</Button><Button variant="ghost" data-testid="button-filter-done">مكتمل</Button></div>{query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : !query.data?.length ? <StateNotice type="empty" /> : <div className="overflow-hidden rounded-3xl border border-border bg-card"><div className="hidden grid-cols-[1.5fr_1fr_.7fr_.6fr] gap-4 border-b border-border bg-secondary/40 px-6 py-4 text-xs font-bold text-muted-foreground sm:grid"><span>الواجب</span><span>الوحدة</span><span>التسليم</span><span>الحالة</span></div>{query.data.map((a) => <div key={a.id} className="grid gap-3 border-b border-border px-5 py-5 last:border-0 sm:grid-cols-[1.5fr_1fr_.7fr_.6fr] sm:items-center sm:gap-4 sm:px-6" data-testid={`row-assignment-${a.id}`}><div><p className="font-bold text-primary">{a.title}</p><p className="mt-1 text-xs text-muted-foreground">{a.description}</p></div><p className="text-sm text-muted-foreground">{a.unit}</p><p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Clock3 size={15} /> {a.dueDate}</p><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${a.status === 'completed' || a.status === 'مكتمل' ? 'bg-green-100 text-green-800' : 'bg-accent/30 text-accent-foreground'}`}>{a.status}</span></div>)}</div>}</Shell>;
}

function AssessmentsPage() {
  const query = useListAssessments();
  return <Shell mode="student"><PageHeading eyebrow="قياس النمو" title="التقييمات" body="كل اختبار مرآة لطريقك، وليس حكماً عليك." />{query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : !query.data?.length ? <StateNotice type="empty" /> : <div className="grid gap-4 md:grid-cols-2">{query.data.map((assessment) => <div key={assessment.id} className="rounded-3xl border border-border bg-card p-6 shadow-sm" data-testid={`card-assessment-${assessment.id}`}><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary"><Target size={20} /></span><span className={`rounded-full px-3 py-1 text-xs font-bold ${assessment.status === 'completed' || assessment.status === 'مكتمل' ? 'bg-green-100 text-green-800' : 'bg-accent/30 text-accent-foreground'}`}>{assessment.status}</span></div><h3 className="mt-5 text-lg font-bold text-primary">{assessment.title}</h3><div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs text-muted-foreground"><span><strong className="block text-base text-primary">{assessment.questions}</strong>سؤالاً</span><span><strong className="block text-base text-primary">{assessment.duration}</strong>المدة</span><span><strong className="block text-base text-primary">{assessment.score || '—'}</strong>النتيجة</span></div><Button variant={assessment.score ? 'soft' : 'primary'} className="mt-5 w-full" data-testid={`button-assessment-${assessment.id}`}>{assessment.score ? 'عرض النتيجة' : 'ابدأ التقييم'} <ArrowLeft size={16} /></Button></div>)}</div>}</Shell>;
}

function ProfilePage() {
  const query = useGetStudentDashboard();
  const s = query.data?.student;
  return <Shell mode="student"><PageHeading eyebrow="مساحتي" title="ملفي الشخصي" action={<Button variant="outline" data-testid="button-edit-profile"><Pencil size={16} /> تعديل البيانات</Button>} />{query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : <div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><div className="rounded-3xl bg-primary p-7 text-primary-foreground"><Avatar name={s?.name ?? 'س'} src={s?.avatarUrl} size="lg" /><h3 className="mt-5 font-display text-2xl font-bold">{s?.name ?? 'سارة أحمد'}</h3><p className="mt-1 text-sm text-primary-foreground/60">{s?.email ?? 'sara@example.com'}</p><div className="mt-8 border-t border-primary-foreground/15 pt-5"><p className="text-xs text-primary-foreground/55">التقدم العام</p><div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-primary-foreground/15"><div className="h-full w-[68%] rounded-full bg-accent" /></div><span className="text-sm font-bold">68%</span></div></div></div><div className="rounded-3xl border border-border bg-card p-7"><h3 className="text-lg font-bold text-primary">بيانات الدراسة</h3><div className="mt-6 grid gap-5 sm:grid-cols-2">{[['المدرسة',s?.school],['الفرع',s?.branch],['الصف',s?.grade],['الشعبة',s?.section],['الجنس',s?.gender],['الحالة',s?.status]].map(([label,value]) => <div key={label as string}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold text-primary">{value || '—'}</p></div>)}</div></div></div>}</Shell>;
}

function TeacherDashboard() {
  const query = useGetTeacherDashboard();
  const d = query.data;
  return <Shell mode="teacher"><PageHeading eyebrow="مساحة المعلم" title="صباح الخير يا أحمد" body="هذه صورة هادئة لما يحدث في أرض اللغة هذا الأسبوع." action={<Button data-testid="button-teacher-action"><Plus size={17} /> إضافة محتوى</Button>} />{query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : !d ? <StateNotice type="empty" /> : <><div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><Kpi label="إجمالي الطلاب" value={d.stats.students} icon={UsersRound} /><Kpi label="طلاب نشطون" value={d.stats.activeStudents} icon={TrendingUp} tone="warm" /><Kpi label="متوسط الدرجات" value={`${d.stats.averageScore}%`} icon={Target} /><Kpi label="الشهادات" value={d.stats.certificates} icon={Award} tone="warm" /></div><div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">نبض المنصة</p><h3 className="mt-1 text-xl font-bold text-primary">نشاط التعلم الأسبوعي</h3></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">هذا الأسبوع</span></div><div className="mt-8 flex h-52 items-end gap-2 sm:gap-5">{(d.weeklyActivity ?? []).map((point) => <div key={point.label} className="group flex flex-1 flex-col items-center gap-2"><div className="relative w-full max-w-10 rounded-t-lg bg-secondary transition-all group-hover:bg-accent" style={{ height: `${Math.max(point.value, 7)}%` }}><span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-md bg-primary px-2 py-1 text-[10px] text-primary-foreground group-hover:block">{point.value}</span></div><span className="text-[11px] text-muted-foreground">{point.label}</span></div>)}</div></div><div className="rounded-3xl border border-border bg-card p-6"><p className="text-sm text-muted-foreground">نظرة سريعة</p><h3 className="mt-1 text-xl font-bold text-primary">محتوى المنصة</h3><div className="mt-6 space-y-5">{[['الوحدات التعليمية',d.stats.units,BookOpen],['الواجبات',d.stats.assignments,FileText],['التقييمات',d.stats.assessments,ClipboardCheck],['المدارس',d.stats.schools,GraduationCap]].map(([label,value,Icon]) => <div key={label as string} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">{Icon && <Icon size={16} />}</span><span className="flex-1 text-sm">{label}</span><strong className="text-primary">{value as number}</strong></div>)}</div></div></div><div className="mt-6 grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-bold text-primary">طلاب انضموا مؤخراً</h3><Link href="/teacher/students" className="text-sm font-semibold text-primary" data-testid="link-teacher-students">عرض الكل</Link></div><div className="mt-5 space-y-2">{d.recentStudents?.length ? d.recentStudents.slice(0,4).map((s) => <div key={s.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-secondary/40"><Avatar name={s.name} src={s.avatarUrl} size="sm" /><div className="flex-1"><p className="text-sm font-semibold text-primary">{s.name}</p><p className="text-xs text-muted-foreground">{s.school}</p></div><span className="text-xs font-bold text-primary">{s.progress}%</span></div>) : <StateNotice type="empty" />}</div></div><div className="rounded-3xl border border-border bg-card p-6"><div className="flex items-center justify-between"><h3 className="text-lg font-bold text-primary">واجبات تحتاج مراجعة</h3><Link href="/teacher/content" className="text-sm font-semibold text-primary" data-testid="link-teacher-content">إدارة المحتوى</Link></div><div className="mt-5 space-y-3">{d.pendingAssignments?.length ? d.pendingAssignments.slice(0,3).map((a) => <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/30 text-accent-foreground"><FileText size={16} /></span><div className="flex-1"><p className="text-sm font-semibold text-primary">{a.title}</p><p className="text-xs text-muted-foreground">{a.unit}</p></div><Button variant="ghost" className="px-2" data-testid={`button-review-${a.id}`}><ArrowLeft size={16} /></Button></div>) : <StateNotice type="empty" />}</div></div></div></>}</Shell>;
}

function StudentsPage() {
  const query = useListStudents();
  const [search, setSearch] = useState('');
  const students = useMemo(() => (query.data ?? []).filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.school.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  return <Shell mode="teacher"><PageHeading eyebrow="متابعة فردية" title="الطلاب" body="كل طالب قصة تعلم مختلفة. ابدأ من بياناته، ثم امنحه المساحة." action={<Button data-testid="button-add-student"><Plus size={17} /> إضافة طالب</Button>} /><div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 sm:max-w-sm"><Search size={18} className="text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الطالب أو المدرسة" className="w-full bg-transparent text-sm outline-none" data-testid="input-search-students" /></div>{query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : !students.length ? <StateNotice type="empty" /> : <div className="overflow-hidden rounded-3xl border border-border bg-card"><div className="hidden grid-cols-[1.4fr_1fr_.65fr_.65fr_.5fr] gap-4 border-b border-border bg-secondary/40 px-6 py-4 text-xs font-bold text-muted-foreground md:grid"><span>الطالب</span><span>المدرسة</span><span>الصف</span><span>التقدم</span><span /></div>{students.map((s) => <div key={s.id} className="grid gap-3 border-b border-border px-5 py-4 last:border-0 md:grid-cols-[1.4fr_1fr_.65fr_.65fr_.5fr] md:items-center md:gap-4 md:px-6" data-testid={`row-student-${s.id}`}><div className="flex items-center gap-3"><Avatar name={s.name} src={s.avatarUrl} size="sm" /><div><p className="font-semibold text-primary">{s.name}</p><p className="text-xs text-muted-foreground">{s.email}</p></div></div><p className="text-sm text-muted-foreground">{s.school}</p><p className="text-sm text-muted-foreground">{s.grade} · {s.section}</p><div><div className="flex items-center justify-between text-xs"><span>{s.progress}%</span><span className="text-muted-foreground">تقدم</span></div><div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${s.progress}%` }} /></div></div><Button variant="ghost" className="px-2" data-testid={`button-student-menu-${s.id}`}><MoreHorizontal size={18} /></Button></div>)}</div>}</Shell>;
}

function ContentPage() {
  const courses = useListCourses();
  const assignments = useListAssignments();
  const assessments = useListAssessments();
  const [tab, setTab] = useState<'courses' | 'assignments' | 'assessments'>('courses');
  const tabs = [{ id: 'courses' as const, label: 'الوحدات', count: courses.data?.length }, { id: 'assignments' as const, label: 'الواجبات', count: assignments.data?.length }, { id: 'assessments' as const, label: 'التقييمات', count: assessments.data?.length }];
  const items = tab === 'courses' ? courses.data : tab === 'assignments' ? assignments.data : assessments.data;
  const loading = tab === 'courses' ? courses.isLoading : tab === 'assignments' ? assignments.isLoading : assessments.isLoading;
  return <Shell mode="teacher"><PageHeading eyebrow="مكتبة أرض اللغة" title="المحتوى التعليمي" body="نظّم ما تقدمه، واترك للطلاب مساحة التركيز." action={<Button data-testid="button-add-content"><Plus size={17} /> إضافة {tab === 'courses' ? 'وحدة' : tab === 'assignments' ? 'واجب' : 'تقييم'}</Button>} /><div className="mb-6 flex gap-1 overflow-auto rounded-2xl bg-muted p-1 sm:w-fit">{tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`} data-testid={`button-content-tab-${t.id}`}>{t.label} <span className="mr-1 text-xs opacity-60">{t.count ?? '—'}</span></button>)}</div>{loading ? <StateNotice type="loading" /> : !items?.length ? <StateNotice type="empty" /> : <div className="grid gap-3">{items.map((item: any) => <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary/30" data-testid={`row-content-${item.id}`}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">{tab === 'courses' ? <BookOpen size={19} /> : tab === 'assignments' ? <FileText size={19} /> : <Target size={19} />}</span><div className="min-w-0 flex-1"><p className="truncate font-bold text-primary">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{tab === 'courses' ? `${item.lessons} دروس · ${item.duration}` : tab === 'assignments' ? `${item.unit} · ${item.points} نقطة` : `${item.questions} سؤالاً · ${item.duration}`}</p></div><span className="hidden rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary sm:block">{tab === 'courses' ? `${item.progress}%` : item.status}</span><Button variant="ghost" className="px-2" data-testid={`button-edit-content-${item.id}`}><Pencil size={17} /></Button></div>)}</div>}</Shell>;
}

function SettingsPage() {
  const query = useGetTeacherSettings();
  const mutation = useUpdateTeacherSettings();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({ platformName: '', teacherName: '', teacherBio: '', teacherImageUrl: '', signatureUrl: '', accentColor: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const current = query.data;
  const values = {
    platformName: touched.platformName ? form.platformName : current?.platformName || '',
    teacherName: touched.teacherName ? form.teacherName : current?.teacherName || '',
    teacherBio: touched.teacherBio ? form.teacherBio : current?.teacherBio || '',
    teacherImageUrl: touched.teacherImageUrl ? form.teacherImageUrl : current?.teacherImageUrl || teacherImageUrl,
    signatureUrl: touched.signatureUrl ? form.signatureUrl : current?.signatureUrl || '',
    accentColor: touched.accentColor ? form.accentColor : current?.accentColor || '',
  };
  const change = (key: keyof typeof form, value: string) => { setSaved(false); setSaveError(''); setTouched((old) => ({ ...old, [key]: true })); setForm((old) => ({ ...old, [key]: value })); };
  const save = () => { setSaveError(''); mutation.mutate({ data: values }, { onSuccess: () => setSaved(true), onError: () => setSaveError('تعذر حفظ التغييرات. تحقق من الاتصال وحاول مرة أخرى.') }); };
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => change('teacherImageUrl', String(reader.result)); reader.readAsDataURL(file); };
  return <Shell mode="teacher"><PageHeading eyebrow="صوت المنصة وشكلها" title="هوية المنصة" body="اجعل أرض اللغة تحمل نبرة تشبهك وتشبه طلابك." action={saved ? <span className="flex items-center gap-2 text-sm font-semibold text-green-700"><Check size={17} /> تم الحفظ</span> : <Button onClick={save} disabled={mutation.isPending} data-testid="button-save-settings"><Save size={17} /> {mutation.isPending ? 'يحفظ...' : 'حفظ التغييرات'}</Button>} />{query.isLoading ? <StateNotice type="loading" /> : query.isError ? <StateNotice type="error" onRetry={() => query.refetch()} /> : <div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><div className="settings-preview relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground sm:p-7"><div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem]"><img src={values.teacherImageUrl || teacherImageUrl} alt={values.teacherName || 'صورة المعلم'} className="h-full w-full object-cover object-[center_18%]" data-testid="img-teacher-settings-preview" /><div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/20 to-transparent" /><div className="absolute right-5 top-5 rounded-full border border-primary-foreground/20 bg-primary/45 px-3 py-1.5 text-[11px] font-semibold backdrop-blur-md">المعاينة العامة</div><div className="absolute bottom-5 right-5 left-5"><p className="text-xs text-primary-foreground/65">{values.platformName || 'أرض اللغة'}</p><h3 className="mt-1 font-display text-2xl font-bold">{values.teacherName || 'اسم المعلم'}</h3><p className="mt-3 text-sm leading-7 text-primary-foreground/75">{values.teacherBio || 'نبذة قصيرة عن المعلم والمنصة.'}</p></div></div><div className="mt-5 flex items-center justify-between border-t border-primary-foreground/15 pt-5"><span className="text-xs text-primary-foreground/60">لون الهوية</span><span className="flex items-center gap-2 text-sm"><span className="h-7 w-7 rounded-full border-2 border-primary-foreground/30" style={{ backgroundColor: values.accentColor || '#d7b65e' }} />{values.accentColor || '#d7b65e'}</span></div></div><div className="rounded-3xl border border-border bg-card p-7"><h3 className="text-lg font-bold text-primary">البيانات الأساسية</h3><div className="mt-6 grid gap-5 sm:grid-cols-2"><SettingsField label="اسم المنصة" value={values.platformName} onChange={(v) => change('platformName', v)} testId="input-platform-name" /><SettingsField label="اسم المعلم" value={values.teacherName} onChange={(v) => change('teacherName', v)} testId="input-teacher-name" /><div className="sm:col-span-2"><SettingsField label="نبذة عن المعلم" value={values.teacherBio} onChange={(v) => change('teacherBio', v)} multiline testId="input-teacher-bio" /></div><SettingsField label="لون الهوية" value={values.accentColor} onChange={(v) => change('accentColor', v)} testId="input-accent-color" /></div><div className="mt-8 border-t border-border pt-6"><p className="font-semibold text-primary">صورة المعلم</p><p className="mt-1 text-xs text-muted-foreground">تظهر في الصفحة الرئيسية ومساحات الطلاب.</p><label className="mt-4 flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-border p-4 transition-colors hover:bg-secondary/40"><Avatar name={values.teacherName || 'أ'} src={values.teacherImageUrl || teacherImageUrl} /><span className="flex-1"><span className="block text-sm font-semibold text-primary">تغيير الصورة</span><span className="mt-1 block text-xs text-muted-foreground">PNG أو JPG، حتى 5 ميجابايت</span></span><Upload size={19} className="text-primary" /><input type="file" accept="image/png,image/jpeg" onChange={upload} className="hidden" data-testid="input-teacher-image" /></label></div></div></div>}</Shell>;
}
function SettingsField({ label, value, onChange, testId, multiline = false }: { label: string; value?: string; onChange: (value: string) => void; testId: string; multiline?: boolean }) { return <label className="block text-sm font-semibold"><span className="mb-2 block">{label}</span>{multiline ? <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={4} className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" data-testid={testId} /> : <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-accent/20" data-testid={testId} />}</label>; }

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route path="/login" component={Login} /><Route path="/register" component={Register} /><Route path="/auth/callback" component={AuthCallback} /><Route path="/student" component={StudentDashboard} /><Route path="/student/courses" component={CoursesPage} /><Route path="/student/assignments" component={AssignmentsPage} /><Route path="/student/assessments" component={AssessmentsPage} /><Route path="/student/profile" component={ProfilePage} /><Route path="/teacher" component={TeacherDashboard} /><Route path="/teacher/students" component={StudentsPage} /><Route path="/teacher/content" component={ContentPage} /><Route path="/teacher/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;