import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { supabaseQuery } from "../lib/supabase";
import {
  ACCESS_COOKIE,
  buildAuthorizeUrl,
  buildLogoutUrl,
  clearSessionCookies,
  createPkce,
  createState,
  describeKindeSetup,
  exchangeCode,
  fetchKindeUser,
  isKindeConfigured,
  readKindeConfig,
  readPkceCookies,
  resolveKindeIdentity,
  setPkceCookies,
  setSessionCookies,
  type KindeUser,
} from "../lib/kinde";
import { findProfileByAuthId, resolveAuth, toAuthInfo, trySilentRefresh } from "../middlewares/auth";
import { getAdminEmails } from "./platform";

// ============================================================================
//  المصادقة عبر Kinde — BFF كامل.
//
//  لا كلمة سر ولا كود تحقق يصل هذه الشيفرة: Kinde يتكفّل بالتحقق من البريد
//  وتأكيد الهوية. ما على السيرفر سوى:
//    · بناء رابط التصريح (مع PKCE وحالة عشوائية)
//    · تبادل الكود مرة واحدة على الخادم
//    · خزن التوكنات في كوكيز httpOnly
//    · ترجمة هوية Kinde إلى صف في profiles
// ============================================================================

const router: IRouter = Router();

const authUnavailableMessage = "خدمة تسجيل الدخول غير مهيأة على الخادم بعد.";

// القيم الافتراضية لطالب جديد — الحقول الفارغة عمداً فيروّجه لإكمال ملفه
const NEW_STUDENT_DEFAULTS = {
  school: "",
  grade: "",
  section: "",
  gender: "",
  branch: "المسار الأكاديمي",
  status: "نشط",
} as const;

/** هل ينقص الملف الشخصي بيانات لا يمكن تجاوزها؟ */
function profileNeedsSetup(profile: any): boolean {
  if (!profile) return true;
  return !profile.full_name || !profile.gender || !profile.grade || !profile.school;
}

function livePlatformName(): Promise<string> {
  return supabaseQuery<any[]>("platform_settings?select=platform_name&limit=1").then(({ data }) =>
    String(data?.[0]?.platform_name || "أرض اللغة"),
  );
}

/** يخفي بوصلة البريد في الرسائل المعروضة. */
function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  if (!domain) return email;
  const head = name.slice(0, 1);
  const tail = name.length > 2 ? name.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(3, Math.min(6, name.length - 2)))}${tail}@${domain}`;
}

/**
 * يضمن وجود صف في profiles لكل هوية Kinde:
 *   · بريد الإدارة يُرقّى إلى admin تلقائياً — نفس سلوك تسجيل Google السابق.
 *   · بريد طالب جديد يُنشأ بحقول الجنس والصف والمدرسة فارغة، فيمرّ على
 *     شاشة إكمال الملف بدل الدخول إلى لوحة ناقصة.
 */
async function provisionProfile(
  user: KindeUser,
): Promise<{ profile: any; created: boolean; promoted: boolean } | null> {
  const authId = user.id;
  const existing = await findProfileByAuthId(authId, user.email);
  const adminEmails = await getAdminEmails();
  const isAdmin = Boolean(user.email && adminEmails.includes(user.email));

  if (existing) {
    if (isAdmin && existing.role !== "admin") {
      const promoted = await supabaseQuery<any[]>(
        `profiles?id=eq.${encodeURIComponent(existing.id)}`,
        { method: "PATCH", body: { role: "admin", status: "نشط", updated_at: new Date().toISOString() } },
      );
      if (promoted.error) logger.warn({ error: promoted.error }, "Admin promotion failed");
      return { profile: { ...existing, role: "admin" }, created: false, promoted: true };
    }
    // صورة Kinde تُزامَن مرة واحدة فقط إن كان الحقل فارغاً
    if (!existing.avatar_url && user.picture) {
      await supabaseQuery(`profiles?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: { avatar_url: user.picture },
      });
      existing.avatar_url = user.picture;
    }
    return { profile: existing, created: false, promoted: false };
  }

  const body: Record<string, unknown> = {
    auth_id: authId,
    email: user.email,
    full_name: user.fullName || "",
    role: isAdmin ? "admin" : "student",
    student_number: "",
    phone: "",
    avatar_url: user.picture || "",
    ...(isAdmin
      ? { grade: "الصف العاشر", school: "", gender: "طالب", section: "أ", status: "نشط" }
      : NEW_STUDENT_DEFAULTS),
  };
  const created = await supabaseQuery("profiles", { method: "POST", body: [body] });
  if (created.error) {
    logger.error({ error: created.error }, "Failed to create profile for Kinde user");
    return null;
  }
  const profile = Array.isArray(created.data) ? created.data[0] : body;
  return { profile, created: true, promoted: isAdmin };
}

// ---------------------------------------------------------------------------
//  1) رابط التصريح — نقطة الانطلاق من الواجهة
// ---------------------------------------------------------------------------

router.get("/auth/kinde/authorize", (req, res): void => {
  const cfg = readKindeConfig(req);
  if (!isKindeConfigured(cfg)) {
    logger.error({ kinde: describeKindeSetup() }, "Kinde is not configured");
    res.status(503).json({ error: authUnavailableMessage, setup: describeKindeSetup() });
    return;
  }
  try {
    const { verifier, challenge } = createPkce();
    const state = createState();
    setPkceCookies(res, verifier, state);
    res.json({ url: buildAuthorizeUrl(cfg, challenge, state) });
  } catch (err) {
    logger.error({ err }, "Failed to build the Kinde authorize URL");
    res.status(500).json({ error: authUnavailableMessage });
  }
});

// ---------------------------------------------------------------------------
//  2) تبادل الكود — بعد عودة المستخدم من Kinde
// ---------------------------------------------------------------------------

router.post("/auth/kinde/exchange", async (req, res): Promise<void> => {
  const code = String((req.body as any)?.code || "");
  if (!code) {
    res.status(400).json({ error: "رمز الدخول مفقود. أعد المحاولة." });
    return;
  }
  const cfg = readKindeConfig(req);
  if (!isKindeConfigured(cfg)) {
    res.status(503).json({ error: authUnavailableMessage, setup: describeKindeSetup() });
    return;
  }

  const { verifier, state } = readPkceCookies(req);
  if (!verifier) {
    res.status(400).json({ error: "انتهت صلاحية محاولة الدخول. ابدأ من جديد." });
    return;
  }
  const returnedState = String((req.body as any)?.state || "");
  if (returnedState && state && returnedState !== state) {
    logger.warn({ kinde: "oauth state mismatch" }, "Rejected an OAuth state mismatch");
    res.status(400).json({ error: "تعذّر تأكيد مصدر الطلب. ابدأ من جديد." });
    return;
  }

  try {
    const tokens = await exchangeCode(cfg, code, verifier);
    clearSessionCookies(res);
    setSessionCookies(res, tokens);

    const identity = await resolveKindeIdentity(tokens.accessToken, cfg);
    if (!identity) {
      clearSessionCookies(res);
      res.status(401).json({ error: "تعذّر قراءة حسابك من Kinde. أعد المحاولة." });
      return;
    }

    const provisioned = await provisionProfile(identity.user);
    if (!provisioned) {
      clearSessionCookies(res);
      res.status(500).json({ error: "تعذّر تجهيز ملفك الشخصي. راجع الإعداد." });
      return;
    }

    const auth = toAuthInfo(provisioned.profile, identity.claims.sub);
    res.json({
      authenticated: true,
      needsSetup: !auth.role || auth.role === "student" ? profileNeedsSetup(provisioned.profile) : false,
      role: auth.role,
      user: {
        id: auth.userId,
        email: auth.email || identity.user.email,
        fullName: provisioned.profile.full_name || identity.user.fullName,
        avatarUrl: provisioned.profile.avatar_url || identity.user.picture || "",
        role: auth.role,
      },
    });
  } catch (err) {
    clearSessionCookies(res);
    logger.error({ err, kinde: describeKindeSetup() }, "Kinde code exchange failed");
    res.status(502).json({
      error:
        err instanceof Error && /redirect_uri|invalid_grant|invalid_request/i.test(err.message)
          ? "رابط العودة المسجّل في Kinde لا يطابق هذا السيرفر. راجع Allowed callback URLs."
          : "تعذّر إكمال تسجيل الدخول. حاول مرة أخرى.",
    });
  }
});

// ---------------------------------------------------------------------------
//  3) حالة الجلسة — نقطة الارتكاز التي تسأل عنها الواجهة
// ---------------------------------------------------------------------------

router.get("/auth/me", async (req, res): Promise<void> => {
  try {
    const accessToken = req.cookies?.[ACCESS_COOKIE];
    const user = accessToken ? await fetchKindeUser(String(accessToken)) : null;
    const auth = await resolveAuth(req, res);
    if (!auth || !user) {
      if (res.headersSent) return;
      clearSessionCookies(res);
      res.json({ authenticated: false });
      return;
    }
    const { data } = await supabaseQuery<any[]>(
      `profiles?id=eq.${encodeURIComponent(auth.userId)}&select=full_name,gender,grade,school,avatar_url&limit=1`,
    );
    const profile = data?.[0];
    res.json({
      authenticated: true,
      needsSetup: auth.role === "student" && profileNeedsSetup(profile),
      role: auth.role,
      user: {
        id: auth.userId,
        email: auth.email || user.email,
        fullName: profile?.full_name || user.fullName,
        avatarUrl: profile?.avatar_url || user.picture || "",
        role: auth.role,
      },
    });
  } catch (err) {
    logger.error({ err }, "GET /auth/me failed");
    res.status(500).json({ authenticated: false });
  }
});

// ---------------------------------------------------------------------------
//  4) التجديد الصامت
// ---------------------------------------------------------------------------

router.post("/auth/refresh", async (req, res): Promise<void> => {
  try {
    const token = await trySilentRefresh(req, res);
    if (!token) {
      clearSessionCookies(res);
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true });
  } catch (err) {
    logger.warn({ err }, "POST /auth/refresh failed");
    clearSessionCookies(res);
    res.status(401).json({ authenticated: false });
  }
});

// ---------------------------------------------------------------------------
//  5) الخروج — يمسح الكوكيز ويعيد المستخدم إلى صفحة إنهاء جلسة Kinde
// ---------------------------------------------------------------------------

router.post("/auth/logout", async (_req, res): Promise<void> => {
  try {
    clearSessionCookies(res);
    res.json({ message: "تم تسجيل الخروج." });
  } catch (err) {
    logger.error({ err }, "POST /auth/logout failed");
    res.status(500).json({ error: "تعذّر تسجيل الخروج." });
  }
});

/** رابط إنهاء الجلسة في Kinde — الواجهة تنتقل إليه بعد مسح الكوكيز. */
router.get("/auth/kinde/logout", (req, res): void => {
  clearSessionCookies(res);
  res.json({ url: buildLogoutUrl(readKindeConfig(req)) });
});

// ---------------------------------------------------------------------------
//  6) إكمال الملف الشخصي
// ---------------------------------------------------------------------------

router.post("/auth/complete-profile", async (req, res): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) {
    res.status(401).json({ error: "انتهت صلاحية الجلسة. سجل الدخول من جديد." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, any>;
  const fullName = String(body.fullName ?? "").trim();
  const grade = String(body.grade ?? "").trim();
  const school = String(body.school ?? "").trim();
  const gender = String(body.gender ?? "").trim();

  if (!fullName || !grade || !school || !gender) {
    res.status(400).json({ error: "الاسم الكامل والجنس والصف والمدرسة حقول مطلوبة." });
    return;
  }

  const profile = {
    id: auth.userId,
    auth_id: auth.authId,
    email: auth.email,
    full_name: fullName,
    role: auth.role,
    student_number: String(body.studentNumber ?? ""),
    school,
    branch: String(body.branch ?? NEW_STUDENT_DEFAULTS.branch),
    grade,
    section: String(body.section ?? "أ"),
    gender,
    phone: String(body.phone ?? ""),
    status: "نشط",
    updated_at: new Date().toISOString(),
  };

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

  res.json({
    authenticated: true,
    needsSetup: false,
    message: "تم حفظ بياناتك. أهلاً بك في المنصة.",
    user: {
      id: auth.userId,
      email: auth.email,
      fullName,
      avatarUrl: "",
      role: auth.role,
    },
  });
});

// ---------------------------------------------------------------------------
//  7) إعدادات المنصة — يستهلكهاWelcome قبل أول تسجيل دخول
// ---------------------------------------------------------------------------

router.get("/auth/platform-name", async (_req, res): Promise<void> => {
  try {
    res.json({ platformName: await livePlatformName() });
  } catch {
    res.json({ platformName: "أرض اللغة" });
  }
});

export default router;