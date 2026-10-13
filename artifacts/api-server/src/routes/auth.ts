import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "node:crypto";
import {
  LoginAccountBody,
  LoginAccountResponse,
  LogoutAccountResponse,
  RegisterAccountBody,
  RegisterAccountResponse,
  RequestPasswordResetBody,
  RequestPasswordResetResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { getSupabaseUser, supabaseQuery } from "../lib/supabase";
import {
  ALLOWED_EMAIL_DOMAINS,
  ALLOWED_PROVIDERS_LABEL,
  MAX_CODE_TRIES,
  RESEND_COOLDOWN_MS,
  VERIFY_COOKIE,
  VERIFY_TTL_MS,
  checkEmailAllowed,
  codeMatches,
  createState,
  maskEmail,
  newCode,
  openState,
  resendWaitSeconds,
  sealState,
  verificationEmailContent,
  type VerifyState,
} from "../lib/email-verification";
import { MailNotConfiguredError, MailSendError, describeMailSetup, sendMail } from "../lib/smtp";
import { getAdminEmails } from "./platform";

const router: IRouter = Router();
const authUnavailableMessage = "خدمة المصادقة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.";

type CookieReq = { cookies?: Record<string, unknown>; body?: any };
type CookieRes = Parameters<Parameters<IRouter["post"]>[1]>[1];

/** كوكي التحقق: مشفّر، httpOnly، ولا يُقرأ إلا من السيرفر. */
function writeVerifyCookie(res: CookieRes, state: VerifyState): void {
  res.cookie(VERIFY_COOKIE, sealState(state), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VERIFY_TTL_MS,
  });
}

function clearVerifyCookie(res: CookieRes): void {
  res.clearCookie(VERIFY_COOKIE, { path: "/" });
}

function readVerifyState(req: CookieReq): VerifyState | null {
  const state = openState(req.cookies?.[VERIFY_COOKIE]);
  if (!state) return null;
  if (!state.expiresAt || state.expiresAt < Date.now()) return null;
  return state;
}

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zjxotgcsbsfwrfqtximw.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "sb_publishable_kPG7zfG0FFZpRTkNnHhO1Q_oXoOq8fg";

async function supabaseRequest(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ response: Response; data: Record<string, unknown> }> {
  let response: Response;
  try {
    const targetUrl = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/${path}`;
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    logger.error({ err }, "Supabase request failed");
    response = new Response(
      JSON.stringify({ message: authUnavailableMessage }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { response, data };
}

function authUser(data: Record<string, unknown>) {
  const user = (data.user ?? {}) as Record<string, unknown>;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(user.id ?? ""),
    email: String(user.email ?? ""),
    fullName: String(metadata.full_name ?? metadata.name ?? ""),
    avatarUrl: String(metadata.avatar_url ?? metadata.picture ?? ""),
  };
}

/** مزامنة صورة Google إلى بروفايل الطالب (مرة واحدة عند الدخول) */
async function syncGoogleAvatar(userId: string, metadata: Record<string, unknown>): Promise<string> {
  const pic = String(metadata.avatar_url ?? metadata.picture ?? "");
  if (!userId || !pic) return pic;
  try {
    const { data } = await supabaseQuery<any[]>(`profiles?id=eq.${userId}&select=avatar_url&limit=1`);
    if (!data?.[0]?.avatar_url) {
      await supabaseQuery(`profiles?id=eq.${userId}`, {
        method: "PATCH",
        body: { avatar_url: pic },
      });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to sync Google avatar");
  }
  return pic;
}

// ============================================================================
// Google OAuth (PKCE) - التدفق الآمن لتسجيل الدخول عبر حساب Google
// ============================================================================

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function generateCodeVerifier(): string {
  return base64url(randomBytes(48));
}

function generateCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

function callbackUrlFromRequest(req: { headers: Record<string, unknown> }): string {
  const headers = req.headers as Record<string, string | undefined>;
  // الأولوية لأصل الواجهة الأمامية (Origin/Referer) لأن وسيط Vite يغيّر Host
  let origin: string | null = null;
  if (headers.origin) {
    origin = String(headers.origin).trim().replace(/\/+$/, "");
  } else if (headers.referer) {
    try {
      origin = new URL(String(headers.referer)).origin;
    } catch {
      origin = null;
    }
  }
  if (origin) return `${origin}/auth/callback`;
  const forwardedProto = headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : "http";
  const host = headers.host || "localhost:5173";
  return `${proto}://${host}/auth/callback`;
}

/** هل ملف المستخدم ناقص ويحتاج إكمال الحساب؟ (الاسم، الجنس، الصف، المدرسة) */
function profileNeedsSetup(profile: any): boolean {
  if (!profile) return true;
  return !profile.full_name || !profile.gender || !profile.grade || !profile.school;
}

async function fetchProfileById(userId: string): Promise<any | null> {
  const { data } = await supabaseQuery<any[]>(
    `profiles?select=*&id=eq.${userId}&limit=1`,
  );
  return data?.[0] || null;
}

function setSessionCookies(
  res: Parameters<Parameters<IRouter["post"]>[1]>[1],
  data: Record<string, unknown>,
) {
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  if (typeof accessToken === "string") {
    res.cookie("supabase_access_token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 1000,
    });
  }
  if (typeof refreshToken === "string") {
    res.cookie("supabase_refresh_token", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

/** تجديد الجلسة صامتاً عبر refresh_token (تدوير تلقائي من Supabase).
 *  يُبقي المستخدم مسجلاً حتى 30 يوماً دون إعادة تسجيل الدخول. */
async function trySilentRefresh(
  req: { cookies?: Record<string, unknown> },
  res: Parameters<Parameters<IRouter["post"]>[1]>[1],
): Promise<string | null> {
  try {
    const refreshToken = req.cookies?.supabase_refresh_token;
    if (typeof refreshToken !== "string" || !refreshToken) return null;
    const { response, data } = await supabaseRequest("token?grant_type=refresh_token", {
      refresh_token: refreshToken,
    });
    if (!response.ok || typeof data.access_token !== "string") return null;
    setSessionCookies(res, data);
    return data.access_token;
  } catch (err) {
    logger.warn({ err }, "Silent session refresh failed");
    return null;
  }
}

// ============================================================================
// التحقق من البريد قبل إنشاء الحساب.
// القاعدة الذهبية: /auth/register لا ينشئ شيئاً بلا كود صحيح، فإن ترك الطالب
// الصفحة بلا إدخال الكود فلا حساب له إطلاقاً — لا في Supabase ولا في profiles.
// ============================================================================

/** اسم المنصة الحيّ لرسالة البريد — falls back إلى الاسم الافتراضي. */
async function livePlatformName(): Promise<string> {
  try {
    const { data } = await supabaseQuery<any[]>("platform_settings?select=platform_name&limit=1");
    return String(data?.[0]?.platform_name || "أرض اللغة");
  } catch {
    return "أرض اللغة";
  }
}

/** هل البريد مقيَّد بحساب طالب سابق؟ (يمنع أكثر من حساب على نفس الإيميل) */
async function emailAlreadyRegistered(email: string): Promise<boolean> {
  try {
    const { data } = await supabaseQuery<any[]>(
      `profiles?select=id&email=eq.${encodeURIComponent(email)}&limit=1`,
    );
    return Array.isArray(data) && data.length > 0;
  } catch {
    // تعذّر الفحص لا يعني منع — التسجيل نفسه يبقى الحَكَم في النهاية
    return false;
  }
}

/** حالة طلب التحقق — الواجهة用它 لتحميل الصفحة ومعرفة المهلة المتبقية. */
router.get("/auth/verify/status", (req, res) => {
  const state = readVerifyState(req);
  res.json({
    pending: Boolean(state),
    providers: ALLOWED_EMAIL_DOMAINS.slice(0, 3),
    providersLabel: ALLOWED_PROVIDERS_LABEL,
    ...(state
      ? {
          email: maskEmail(state.email),
          resendIn: resendWaitSeconds(state),
          expiresIn: Math.max(0, Math.round((state.expiresAt - Date.now()) / 1000)),
        }
      : {}),
  });
});

/** إرسال الكود — وأعادته بعد اكتمال الدقيقة، لا قبل ذلك. */
router.post("/auth/verify/send", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const allowed = checkEmailAllowed(body.email);
  if (!allowed.ok) {
    res.status(400).json({ error: allowed.error });
    return;
  }

  // بريد الإدارة محجوز — لا حساب طالب عليه
  try {
    const adminList = await getAdminEmails().catch(() => [] as string[]);
    if (adminList.includes(allowed.email)) {
      res.status(400).json({ error: "هذا البريد محجوز لحساب الإدارة — سجل الدخول به عبر Google." });
      return;
    }
  } catch { /* تجاهل */ }

  // إيميل واحد = حساب واحد. يُمنع قبل إرسال الكود حتى لا يضيع وقت الطالب.
  if (await emailAlreadyRegistered(allowed.email)) {
    res.status(409).json({
      error: "هذا البريد مسجّل عندنا مسبقاً — لا يمكن إنشاء حساب ثانٍ لنفس الإيميل.",
      hasAccount: true,
    });
    return;
  }

  // إعادة الإرسال قبل مرور دقيقة ممنوعة حتى لا نستنزف حساب البريد
  const existing = readVerifyState(req);
  if (existing && existing.email === allowed.email) {
    const wait = resendWaitSeconds(existing);
    if (wait > 0) {
      res.status(429).json({ error: `انتظر ${wait} ثانية قبل طلب كود جديد.`, resendIn: wait });
      return;
    }
  }

  const name = String(body.name ?? "").trim();
  const state =
    existing && existing.email === allowed.email
      ? { ...createState(allowed.email, name || existing.name), tries: 0 }
      : createState(allowed.email, name);

  try {
    const content = verificationEmailContent({
      code: state.code,
      name: state.name,
      minutes: Math.round(VERIFY_TTL_MS / 60_000),
      platformName: await livePlatformName(),
    });
    await sendMail({ to: state.email, ...content });
  } catch (err) {
    if (err instanceof MailNotConfiguredError) {
      // تفاصيل السبب للمشغّل في السجل فقط — الطالب يرى رسالة محايدة
      logger.error({ err, mail: describeMailSetup() }, "Verification email is not configured");
      res.status(503).json({ error: "خدمة إرسال الكود غير مفعّلة على الخادم. راجع إعدادات البريد." });
      return;
    }
    logger.error({ err, mail: describeMailSetup() }, "Failed to send the verification code");
    res.status(502).json({
      error: "تعذّر إرسال الكود إلى بريدك الآن. حاول بعد قليل.",
    });
    return;
  }

  writeVerifyCookie(res, state);
  res.json({
    ok: true,
    email: maskEmail(state.email),
    resendIn: Math.round(RESEND_COOLDOWN_MS / 1000),
    expiresIn: Math.round(VERIFY_TTL_MS / 1000),
    message: `أرسلنا كوداً إلى ${maskEmail(state.email)} — أدخله لإنشاء حسابك.`,
  });
});

/** إلغاء الطلب — يمسح الكوكي فلا يبقى كود معلّق على المتصفح. */
router.post("/auth/verify/cancel", (_req, res) => {
  clearVerifyCookie(res);
  res.json({ ok: true, message: "تم إلغاء طلب التأكيد." });
});

/** يؤكّد البريد من لوحة إدارة Supabase ثم يعيد جلسة — حين يطلب Supabase تأكيداً إضافياً. */
async function confirmVerifiedEmail(
  email: string,
  password: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY;
  if (!secretKey) return null;
  try {
    await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/admin/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({ email_confirm: true }),
    });
    const { response, data } = await supabaseRequest("token?grant_type=password", { email, password });
    return response.ok && typeof data.access_token === "string" ? data : null;
  } catch (err) {
    logger.warn({ err }, "Could not open a session right after email verification");
    return null;
  }
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // ── بوابة التحقق: بلا كود صحيح لا يُنشأ حساب مهما كان الطلب ──
  const emailCheck = checkEmailAllowed(parsed.data.email);
  if (!emailCheck.ok) {
    res.status(400).json({ error: emailCheck.error });
    return;
  }
  const state = readVerifyState(req);
  if (!state) {
    res.status(400).json({
      error: "انتهت صلاحية طلب التأكيد أو لم يبدأ بعد. عُد إلى صفحة التسجيل لطلب كود جديد.",
    });
    return;
  }
  if (state.email !== emailCheck.email) {
    res.status(400).json({ error: "البريد المؤكَّد لا يطابق البريد المطلوب إنشاء الحساب به." });
    return;
  }
  const submittedCode = String((req.body ?? {}).code ?? "").trim();
  if (!codeMatches(state.code, submittedCode)) {
    state.tries += 1;
    writeVerifyCookie(res, state);
    const triesLeft = Math.max(0, MAX_CODE_TRIES - state.tries);
    res.status(400).json({
      error:
        triesLeft > 0
          ? `الكود غير صحيح. بقيت لك ${triesLeft} محاولات.`
          : "انتهت محاولات التحقق. ابدأ التسجيل من جديد للحصول على كود جديد.",
      triesLeft,
    });
    return;
  }
  clearVerifyCookie(res);

  // بريد الإدارة محجوز — لا يُنشأ به حساب طالب
  try {
    const adminList = await getAdminEmails().catch(() => [] as string[]);
    if (adminList.includes(emailCheck.email)) {
      res.status(400).json({ error: "هذا البريد محجوز لحساب الإدارة — سجل الدخول به عبر Google." });
      return;
    }
  } catch { /* تجاهل */ }

  const { fullName } = parsed.data;
  // نستعمل البريد المُطبَّع (نفس الذي تأكّد) حتى لا يختلف بين الحساب والملف
  const email = emailCheck.email;
  const { response, data } = await supabaseRequest("signup", {
    email,
    password: parsed.data.password,
    data: {
      full_name: fullName,
      student_number: parsed.data.studentNumber,
      school: parsed.data.school,
      branch: parsed.data.branch,
      grade: parsed.data.grade,
      section: parsed.data.section,
      gender: parsed.data.gender,
      phone: parsed.data.phone,
    },
  });

  if (!response.ok) {
    const supabaseMessage = String(data.msg ?? data.error_description ?? data.message ?? "تعذر إنشاء الحساب");
    // إيميل واحد = حساب واحد: Supabase يرفض التكرار، ونترجمها للطالب
    const alreadyThere = /already|registered|exists/i.test(supabaseMessage);
    res.status(alreadyThere ? 409 : response.status === 422 ? 400 : response.status).json({
      error: alreadyThere
        ? "هذا البريد مسجّل عندنا مسبقاً — لا يمكن إنشاء حساب ثانٍ لنفس الإيميل."
        : supabaseMessage,
      ...(alreadyThere ? { hasAccount: true } : {}),
    });
    return;
  }

  // إنشاء صف في جدول profiles للمستخدم الجديد
  // (محفز handle_new_user سيقوم بذلك تلقائياً عند تطبيق ملف SQL، لكن هذا ضمان إضافي)
  const newUserId = typeof data.user === "object" && data.user !== null
    ? String((data.user as Record<string, unknown>).id ?? "")
    : "";
  const profilePayload = {
    id: newUserId,
    email,
    full_name: fullName,
    role: "student",
    student_number: parsed.data.studentNumber || "",
    school: parsed.data.school || "مدرسة وايلد",
    branch: parsed.data.branch || "المسار الأكاديمي",
    grade: parsed.data.grade || "الصف العاشر",
    section: parsed.data.section || "أ",
    gender: parsed.data.gender || "طالب",
    phone: parsed.data.phone || "",
    status: "نشط",
  };
  if (newUserId) {
    try {
      await supabaseQuery("profiles", {
        method: "POST",
        body: [profilePayload],
        headers: { Prefer: "resolution=merge-duplicates" },
      });
    } catch (err) {
      logger.error({ err }, "Failed to create profile after signup");
    }
  }

  // تحقّقنا من البريد بكود مرسل من عندنا، فإن كان Supabase يطلب تأكيداً إضافياً
  // فنؤكّده من لوحة الإدارة ثم نفتح الجلسة — وإلا بقي الطالب بلا دخول بعد التأكيد.
  let session = data;
  if (!session.access_token && newUserId) {
    const forced = await confirmVerifiedEmail(email, parsed.data.password, newUserId);
    if (forced) session = forced;
  }

  setSessionCookies(res, session);
  res.json(
    RegisterAccountResponse.parse({
      message: session.access_token
        ? "تم تأكيد بريدك وإنشاء حسابك بنجاح."
        : "تم إنشاء الحساب بعد تأكيد بريدك. سجّل دخولك بكلمة المرور.",
      user: authUser(session),
    }),
  );
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { response, data } = await supabaseRequest(
    "token?grant_type=password",
    parsed.data,
  );
  if (!response.ok) {
    res.status(response.status === 400 ? 401 : response.status).json({
      error: String(data.error_description ?? data.msg ?? data.message ?? "بيانات الدخول غير صحيحة"),
    });
    return;
  }

  setSessionCookies(res, data);
  res.json(
    LoginAccountResponse.parse({
      message: "تم تسجيل الدخول بنجاح.",
      user: authUser(data),
    }),
  );
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = RequestPasswordResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { response, data } = await supabaseRequest("recover", {
    email: parsed.data.email,
  });
  if (!response.ok) {
    res.status(response.status).json({
      error: String(data.msg ?? data.error_description ?? data.message ?? "تعذر إرسال رسالة الاستعادة"),
    });
    return;
  }

  res.json(
    RequestPasswordResetResponse.parse({
      message: "إذا كان البريد مسجلاً، ستصلك رسالة لاستعادة كلمة المرور.",
    }),
  );
});

router.get("/auth/google", (req, res) => {
  try {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const callbackUrl = callbackUrlFromRequest(req);

    res.cookie("supabase_pkce_verifier", verifier, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      provider: "google",
      redirect_to: callbackUrl,
      flow_type: "pkce",
      code_challenge: challenge,
      code_challenge_method: "s256",
      access_type: "offline",
    });
    const url = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/authorize?${params.toString()}`;

    res.json({ url });
  } catch (err) {
    logger.error({ err }, "Google OAuth URL generation failed");
    res.status(500).json({ error: "تعذر إنشاء رابط الدخول عبر Google. حاول مرة أخرى." });
  }
});

/** استبدال رمز التأكيد (auth code) بجلسة فعلية بعد عودة المستخدم من Google */
router.post("/auth/exchange", async (req, res): Promise<void> => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!code) {
    res.status(400).json({ error: "رمز التأكيد مفقود. أعد المحاولة." });
    return;
  }

  const verifier =
    typeof req.cookies?.supabase_pkce_verifier === "string"
      ? req.cookies.supabase_pkce_verifier
      : "";
  res.clearCookie("supabase_pkce_verifier", { path: "/" });

  const callbackUrl = callbackUrlFromRequest(req);

  try {
    const response = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/token?grant_type=pkce`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          auth_code: code,
          code_verifier: verifier,
          redirect_to: callbackUrl,
          gotrue_meta_security: {},
        }),
      },
    );

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok || !data.access_token) {
      res.status(response.status).json({
        error: String(
          data.msg ?? data.error_description ?? data.message ?? "تعذر تأكيد الجلسة عبر Google. أعد المحاولة.",
        ),
      });
      return;
    }

    setSessionCookies(res, data);

    const userId = String((data.user as Record<string, unknown>)?.id ?? "");
    const userEmail = String((data.user as Record<string, unknown>)?.email ?? "").trim().toLowerCase();
    // بريد الإدارة (Gmail المعتمد) يدخل كمعلم دائماً — ولو كان مسجلاً طالباً سابقاً يُرقّى
    const adminList = await getAdminEmails().catch(() => [] as string[]);
    const isAdminEmail = !!userEmail && adminList.includes(userEmail);
    if (userId) {
      const profile = await fetchProfileById(userId);
      const meta = ((data.user as Record<string, unknown>)?.user_metadata ?? {}) as Record<string, unknown>;
      await syncGoogleAvatar(userId, meta);
      if (isAdminEmail && profile?.role !== "admin") {
        if (profile) {
          await supabaseQuery(`profiles?id=eq.${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: { role: "admin", status: "نشط", updated_at: new Date().toISOString() },
          });
        } else {
          await supabaseQuery("profiles", {
            method: "POST",
            body: [{
              id: userId,
              email: userEmail,
              full_name: String(meta.full_name ?? meta.name ?? "المعلم"),
              role: "admin",
              grade: "الصف العاشر",
              school: "",
              status: "نشط",
            }],
            headers: { Prefer: "resolution=merge-duplicates" },
          });
        }
        res.json({ authenticated: true, needsSetup: false, user: authUser(data) });
        return;
      }
      res.json({
        authenticated: true,
        needsSetup: isAdminEmail ? false : profileNeedsSetup(profile),
        user: authUser(data),
      });
    } else {
      res.json({
        authenticated: true,
        needsSetup: true,
        user: authUser(data),
      });
    }
  } catch (err) {
    logger.error({ err }, "Google OAuth exchange failed");
    res.status(500).json({ error: "تعذر تأكيد الجلسة عبر Google. حاول مرة أخرى." });
  }
});

/** حالة الجلسة الحالية + هل يحتاج إكمال الحساب (مع تجديد صامت عند انتهاء التوكن) */
router.get("/auth/me", async (req, res) => {
  let accessToken = req.cookies?.supabase_access_token;
  if (!accessToken) {
    accessToken = await trySilentRefresh(req, res);
    if (!accessToken) {
      res.json({ authenticated: false });
      return;
    }
  }

  let user = await getSupabaseUser(accessToken);
  if (!user) {
    // التوكن منتهٍ؟ جرّب التجديد الصامت قبل رمي الجلسة
    const refreshed = await trySilentRefresh(req, res);
    if (refreshed) {
      accessToken = refreshed;
      user = await getSupabaseUser(accessToken);
    }
  }
  if (!user) {
    res.clearCookie("supabase_access_token", { path: "/" });
    res.clearCookie("supabase_refresh_token", { path: "/" });
    res.json({ authenticated: false });
    return;
  }

  const userId = String(user.id ?? "");
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const profile = userId ? await fetchProfileById(userId) : null;
  const syncedPic = await syncGoogleAvatar(userId, metadata);

  res.json({
    authenticated: true,
    needsSetup: profileNeedsSetup(profile),
    role: String(profile?.role || (metadata.role as string) || "student"),
    user: {
      id: userId,
      email: String(user.email ?? ""),
      fullName: String(metadata.full_name ?? metadata.name ?? profile?.full_name ?? ""),
      avatarUrl: syncedPic || String(profile?.avatar_url ?? ""),
      role: String(profile?.role || (metadata.role as string) || "student"),
    },
  });
});

/** إكمال بيانات الحساب الإلزامية قبل دخول الطالب إلى مساحته */
router.post("/auth/complete-profile", async (req, res): Promise<void> => {
  const accessToken = req.cookies?.supabase_access_token;
  const user = accessToken ? await getSupabaseUser(accessToken) : null;
  if (!user) {
    res.status(401).json({ error: "انتهت صلاحية الجلسة. سجل الدخول من جديد." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, any>;
  const profile = {
    id: String(user.id ?? ""),
    email: String(user.email ?? ""),
    full_name: String(body.fullName ?? "").trim(),
    role: "student",
    student_number: String(body.studentNumber ?? ""),
    school: String(body.school ?? "").trim(),
    branch: String(body.branch ?? "المسار الأكاديمي"),
    grade: String(body.grade ?? "").trim(),
    section: String(body.section ?? "أ"),
    gender: String(body.gender ?? ""),
    phone: String(body.phone ?? ""),
    status: "نشط",
  };

  if (!profile.full_name || !profile.grade || !profile.school || !profile.gender) {
    res.status(400).json({ error: "الاسم الكامل والجنس والصف والمدرسة حقول مطلوبة." });
    return;
  }

  const { error } = await supabaseQuery("profiles", {
    method: "POST",
    body: [profile],
    headers: { Prefer: "resolution=merge-duplicates" },
  });
  if (error) {
    logger.error({ error }, "Failed to upsert profile in complete-profile");
    res.status(500).json({ error: "تعذر حفظ بيانات الحساب. حاول مرة أخرى." });
    return;
  }

  try {
    await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        data: {
          full_name: profile.full_name,
          gender: profile.gender,
          grade: profile.grade,
          school: profile.school,
          section: profile.section,
          branch: profile.branch,
          phone: profile.phone,
        },
      }),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to sync auth user_metadata after completing profile");
  }

  res.json({
    authenticated: true,
    needsSetup: false,
    message: "تم حفظ بياناتك بنجاح، أهلاً بك في مساحتك!",
    user: { id: profile.id, email: profile.email, fullName: profile.full_name, avatarUrl: "" },
  });
});

/** تجديد صريح للجلسة — تناديه الواجهة دورياً (كل ~45 دقيقة) لإبقاء الدخول */
router.post("/auth/refresh", async (req, res): Promise<void> => {
  const accessToken = await trySilentRefresh(req, res);
  if (!accessToken) {
    res.status(401).json({ authenticated: false, error: "انتهت الجلسة. سجل الدخول من جديد." });
    return;
  }
  res.json({ authenticated: true });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("supabase_access_token", { path: "/" });
  res.clearCookie("supabase_refresh_token", { path: "/" });
  res.clearCookie("supabase_pkce_verifier", { path: "/" });
  res.json(LogoutAccountResponse.parse({ message: "تم تسجيل الخروج." }));
});

export default router;