import type { Request, RequestHandler } from "express";
import { supabaseQuery, getSupabaseUser } from "../lib/supabase";
import { logger } from "../lib/logger";

// ============================================================================
// بوابة الحماية — موقع حقيقي: لا وصول إداري دون جلسة معلم، ولا كتابة دون دخول
// ============================================================================

export type AuthInfo = {
  userId: string;
  email: string;
  role: string;
  grade: string;
  gender: string | null;
};

export type AuthedRequest = Request & { auth?: AuthInfo };

/* ============================================================================
   حساب «الرقابة» — يدخل بوابة الإدارة ويرى كل شيء ولا يلمس شيئاً.
   دور profiles.role = "observer": يمرّ على requireAdmin (قراءة) ويرفض كل كتابة.
   ============================================================================ */
export const OBSERVER_ROLE = "observer";

/** دور من يقف في بوابة الإدارة: المعلم الكامل أو حساب الرقابة */
export function isStaffRole(role: unknown): boolean {
  return role === "admin" || role === OBSERVER_ROLE;
}

/** حساب الرقابة: اطّلاع فقط بلا أي صلاحية كتابة */
export function isObserverRole(role: unknown): boolean {
  return role === OBSERVER_ROLE;
}

/** استدعاء Supabase للتجديد — بلا كوكيز: النتيجة تُشارك بين الطلبات المتوازية */
async function performRefresh(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string } | null> {
  const base = (
    process.env.SUPABASE_URL || "https://zjxotgcsbsfwrfqtximw.supabase.co"
  ).replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    "sb_publishable_kPG7zfG0FFZpRTkNnHhO1Q_oXoOq8fg";
  const response = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") return null;
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
  };
}

// صفحة واحدة تُطلق عدة طلبات في نفس اللحظة، وكلها تجدّد بنفس كوكي التحديث.
// والتجديد يدوّره: الطلب الثاني يفشل ويُبطِل الجلسة كلها، فتفرغ قوائم الطالب
// على الهاتف (الواجبات والدفاتر) بينما تبقى الوحدات ظاهرة. تجديد واحد لكل توكن.
const refreshInFlight = new Map<string, Promise<{ accessToken: string; refreshToken?: string } | null>>();

function refreshOnce(refreshToken: string) {
  const running = refreshInFlight.get(refreshToken);
  if (running) return running;
  const p = performRefresh(refreshToken).finally(() => {
    refreshInFlight.delete(refreshToken);
  });
  refreshInFlight.set(refreshToken, p);
  return p;
}

export async function trySilentRefresh(
  req: Request,
  res: Parameters<RequestHandler>[1],
): Promise<string | null> {
  try {
    const refreshToken = (req as any)?.cookies?.supabase_refresh_token;
    if (typeof refreshToken !== "string" || !refreshToken) return null;
    const session = await refreshOnce(refreshToken);
    if (!session) return null;
    const secure = process.env.NODE_ENV === "production";
    res.cookie("supabase_access_token", session.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 1000,
    });
    if (session.refreshToken) {
      res.cookie("supabase_refresh_token", session.refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
    return session.accessToken;
  } catch (err) {
    logger.warn({ err }, "Middleware silent refresh failed");
    return null;
  }
}

export async function resolveAuth(req: Request, res?: Parameters<RequestHandler>[1]): Promise<AuthInfo | null> {
  // نتيججة واحدة للطلب: حين يسبقنا حارس الرقابة لا نكرّر جلب البروفايل
  const cached = (req as AuthedRequest).auth;
  if (cached) return cached;
  try {
    let token = (req as any)?.cookies?.supabase_access_token;
    if (!token && res) {
      const refreshed = await trySilentRefresh(req, res);
      if (refreshed) token = refreshed;
    }
    if (!token) return null;
    const user = (await getSupabaseUser(token)) as Record<string, unknown> | null;
    if ((!user || !(user as any)?.id) && res) {
      // التوكن منتهٍ؟ جدّد صامتاً وأعد المحاولة بدل رمي المستخدم لصفحة الدخول
      const refreshed = await trySilentRefresh(req, res);
      if (refreshed) {
        const retry = (await getSupabaseUser(refreshed)) as Record<string, unknown> | null;
        if (retry?.id) {
          (req as any).cookies = { ...((req as any)?.cookies || {}), supabase_access_token: refreshed };
          return await resolveAuth(req);
        }
      }
      return null;
    }
    const userId = String((user as any)?.id || "");
    if (!userId) return null;
    const { data } = await supabaseQuery<any[]>(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,role,grade,gender&limit=1`,
    );
    const profile = data?.[0];
    if (!profile) return null;
    const gender = profile.gender === "طالب" || profile.gender === "طالبة" ? profile.gender : null;
    return {
      userId: profile.id,
      email: profile.email || "",
      role: profile.role || "student",
      grade: profile.grade || "",
      gender,
    };
  } catch (err) {
    logger.warn({ err }, "resolveAuth failed");
    return null;
  }
}

/** أي مستخدم مسجل (طالب أو معلم) */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const auth = await resolveAuth(req, res);
  if (!auth) {
    res.status(401).json({ error: "سجل الدخول أولاً للمتابعة." });
    return;
  }
  (req as AuthedRequest).auth = auth;
  next();
};

/** المعلم/الإدارة فقط */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const auth = await resolveAuth(req, res);
  if (!auth) {
    res.status(401).json({ error: "سجل الدخول أولاً للمتابعة." });
    return;
  }
  if (!isStaffRole(auth.role)) {
    res.status(403).json({ error: "هذه الصلاحية للإدارة فقط." });
    return;
  }
  (req as AuthedRequest).auth = auth;
  next();
};

/* ============================================================================
   حارس الرقابة — يُركَّب على كل /api قبل المسارات.
   ١) أي طلب كتابة (POST/PUT/PATCH/DELETE) من حساب الرقابة يُرفض هنا،
      فتبقى الواجهة وحدها تجمّل «إخفاء الأزرار» والخادم هو الضمان الحقيقي:
      لا إضافة ولا تعديل ولا حذف ولا ترقية بيانات من هذا الحساب إطلاقاً.
   ٢) قسمان لا يفتحان له أصلاً — لا قراءة ولا كتابة:
      «إعداد التأسيس» (/teacher/foundation) و«إدارة المنصة» (/teacher/settings).
   استثناء: مسارات /auth — الدخول والخروج وتحديث الجلسة يجب أن تمر.
   ============================================================================ */
const OBSERVER_HIDDEN_PREFIXES = ["/teacher/foundation", "/teacher/settings"];

export const blockObserverWrites: RequestHandler = async (req, res, next) => {
  if (req.path.startsWith("/auth/")) {
    next();
    return;
  }
  const isWrite = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  if (!isWrite) {
    next();
    return;
  }
  const auth = await resolveAuth(req, res);
  if (!auth) {
    next();
    return;
  }
  if (isObserverRole(auth.role)) {
    res.status(403).json({
      error: "حساب الرقابة للاطلاع فقط — لا صلاحية له بالتعديل أو الإضافة أو الحذف.",
    });
    return;
  }
  next();
};

/** القسمان المحجوبان عن حساب الرقابة — يُرفضان قراءتهما أيضاً */
export const blockObserverHiddenSections: RequestHandler = async (req, res, next) => {
  if (!OBSERVER_HIDDEN_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
    next();
    return;
  }
  const auth = await resolveAuth(req, res);
  if (!auth) {
    next();
    return;
  }
  if (isObserverRole(auth.role)) {
    res.status(403).json({ error: "هذا القسم غير متاح لحساب الرقابة." });
    return;
  }
  next();
};
