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

const router: IRouter = Router();
const authUnavailableMessage = "خدمة المصادقة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.";

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
    avatarUrl: String(metadata.avatar_url ?? ""),
  };
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
      maxAge: 60 * 60 * 1000,
    });
  }
  if (typeof refreshToken === "string") {
    res.cookie("supabase_refresh_token", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fullName } = parsed.data;
  const { response, data } = await supabaseRequest("signup", {
    email: parsed.data.email,
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
    res.status(response.status === 422 ? 400 : response.status).json({
      error: String(data.msg ?? data.error_description ?? data.message ?? "تعذر إنشاء الحساب"),
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
    email: parsed.data.email,
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

  setSessionCookies(res, data);
  res.json(
    RegisterAccountResponse.parse({
      message: data.access_token
        ? "تم إنشاء حسابك وتسجيل دخولك."
        : "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لإكمال التسجيل.",
      user: authUser(data),
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
    if (userId) {
      const profile = await fetchProfileById(userId);
      res.json({
        authenticated: true,
        needsSetup: profileNeedsSetup(profile),
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

/** حالة الجلسة الحالية + هل يحتاج إكمال الحساب */
router.get("/auth/me", async (req, res) => {
  const accessToken = req.cookies?.supabase_access_token;
  if (!accessToken) {
    res.json({ authenticated: false });
    return;
  }

  const user = await getSupabaseUser(accessToken);
  if (!user) {
    res.clearCookie("supabase_access_token");
    res.clearCookie("supabase_refresh_token");
    res.json({ authenticated: false });
    return;
  }

  const userId = String(user.id ?? "");
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const profile = userId ? await fetchProfileById(userId) : null;

  res.json({
    authenticated: true,
    needsSetup: profileNeedsSetup(profile),
    role: String(profile?.role || (metadata.role as string) || "student"),
    user: {
      id: userId,
      email: String(user.email ?? ""),
      fullName: String(metadata.full_name ?? metadata.name ?? profile?.full_name ?? ""),
      avatarUrl: String(metadata.avatar_url ?? profile?.avatar_url ?? ""),
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

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("supabase_access_token");
  res.clearCookie("supabase_refresh_token");
  res.clearCookie("supabase_pkce_verifier");
  res.json(LogoutAccountResponse.parse({ message: "تم تسجيل الخروج." }));
});

export default router;