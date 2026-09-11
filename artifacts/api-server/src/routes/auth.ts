import { Router, type IRouter } from "express";
import {
  GetGoogleAuthUrlResponse,
  LoginAccountBody,
  LoginAccountResponse,
  LogoutAccountResponse,
  RegisterAccountBody,
  RegisterAccountResponse,
  RequestPasswordResetBody,
  RequestPasswordResetResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase authentication is not configured.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseRequest(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ response: Response; data: Record<string, unknown> }> {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

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
  };
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

  const { fullName, ...account } = parsed.data;
  const { response, data } = await supabaseRequest("signup", {
    ...account,
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
  const { url, key } = getSupabaseConfig();
  const redirectTo = `${req.protocol}://${req.get("host")}/auth/callback`;
  const authUrl = new URL(`${url}/auth/v1/authorize`);
  authUrl.searchParams.set("provider", "google");
  authUrl.searchParams.set("redirect_to", redirectTo);
  authUrl.searchParams.set("apikey", key);
  res.json(GetGoogleAuthUrlResponse.parse({ url: authUrl.toString() }));
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("supabase_access_token");
  res.clearCookie("supabase_refresh_token");
  res.json(LogoutAccountResponse.parse({ message: "تم تسجيل الخروج." }));
});

export default router;