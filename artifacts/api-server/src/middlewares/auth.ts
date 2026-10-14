import type { Request, RequestHandler, Response } from "express";
import { supabaseQuery } from "../lib/supabase";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  fetchKindeUser,
  readKindeConfig,
  refreshSession,
  resolveKindeIdentity,
  setSessionCookies,
} from "../lib/kinde";
import { logger } from "../lib/logger";

// ============================================================================
//  بوابة الحماية — هوية Kinde تُترجم إلى ملف شخصي في Supabase.
//  لا وصول إداري دون دور admin مخزّن، ولا كتابة دون جلسة صالحة.
// ============================================================================

export type AuthInfo = {
  /** معرّف الملف الشخصي الداخلي (UUID) — هو ما تستخدمه كل الجداول الأخرى */
  userId: string;
  /** معرّف Kinde — للمتابعة وربط الحسابات */
  authId: string;
  email: string;
  role: string;
  grade: string;
  gender: string | null;
};

export type AuthedRequest = Request & { auth?: AuthInfo };

type ProfileRow = {
  id: string;
  auth_id?: string | null;
  email?: string | null;
  role?: string | null;
  grade?: string | null;
  gender?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

const PROFILE_COLUMNS = "id,auth_id,email,role,grade,gender,full_name,avatar_url";

function cookiesOf(req: Request): Record<string, unknown> {
  return (req as Request & { cookies?: Record<string, unknown> }).cookies || {};
}

/** يجدّد الجلسة صامتاً ويكتب الكوكيز الجديدة. يُرجع التوكن أو null. */
export async function trySilentRefresh(
  req: Request,
  res?: Response,
): Promise<string | null> {
  try {
    const refreshToken = String(cookiesOf(req)[REFRESH_COOKIE] || "");
    if (!refreshToken) return null;
    const cfg = readKindeConfig(req);
    if (!cfg.clientId || !cfg.clientSecret) return null;
    const tokens = await refreshSession(cfg, refreshToken);
    if (res) setSessionCookies(res, tokens);
    return tokens.accessToken;
  } catch (err) {
    logger.warn({ err }, "Kinde silent refresh failed");
    return null;
  }
}

/**
 * يربط هوية Kinde بملف شخصي:
 *   1) بحث مباشر بمعرّف Kinde (auth_id) — المسار الساخن بعد أول دخول.
 *   2) بحث بالبريد ثم ربط auth_id — ينقل الحسابات المنشأة قبل التبديل
 *      أو التي أنشأها المعلم يدوياً، فلا تضيع بياناتها.
 *   3) لا ملف ولا سجل — يُرجع null ويتحول الطلب إلى 401.
 */
export async function findProfileByAuthId(
  authId: string,
  email: string,
): Promise<ProfileRow | null> {
  if (!authId) return null;
  const byAuth = await supabaseQuery<ProfileRow[]>(
    `profiles?auth_id=eq.${encodeURIComponent(authId)}&select=${PROFILE_COLUMNS}&limit=1`,
  );
  if (byAuth.data?.[0]) return byAuth.data[0];

  if (!email) return null;
  const byEmail = await supabaseQuery<ProfileRow[]>(
    `profiles?email=eq.${encodeURIComponent(email)}&select=${PROFILE_COLUMNS}&limit=1`,
  );
  const match = byEmail.data?.[0];
  if (!match) return null;

  const linked = await supabaseQuery<ProfileRow[]>(
    `profiles?id=eq.${encodeURIComponent(match.id)}`,
    { method: "PATCH", body: { auth_id: authId } },
  );
  if (linked.error) {
    logger.warn({ error: linked.error }, "Failed to link auth_id to existing profile");
    return match;
  }
  return { ...match, auth_id: authId };
}

/** يبني معلومات البوابة من صف الملف الشخصي. */
export function toAuthInfo(profile: ProfileRow, authId: string): AuthInfo {
  const gender =
    profile.gender === "طالب" || profile.gender === "طالبة" ? profile.gender : null;
  return {
    userId: String(profile.id),
    authId,
    email: profile.email || "",
    role: profile.role || "student",
    grade: profile.grade || "",
    gender,
  };
}

/** يحل الجلسة الكاملة: كوكي ← تجديد صامت ← تحقق من التوكن ← ملف الشخصي. */
export async function resolveAuth(req: Request, res?: Response): Promise<AuthInfo | null> {
  try {
    let token = String(cookiesOf(req)[ACCESS_COOKIE] || "");
    if (!token && res) token = (await trySilentRefresh(req, res)) || "";
    if (!token) return null;

    let identity = await resolveKindeIdentity(token);
    if (!identity && res) {
      // التوكن منتهٍ؟ جدّد صامتاً وأعد المحاولة بدل رمي المستخدم لصفحة الدخول
      const refreshed = await trySilentRefresh(req, res);
      if (refreshed) {
        identity = await resolveKindeIdentity(refreshed);
        if (identity) {
          (req as Request & { cookies?: Record<string, unknown> }).cookies = {
            ...cookiesOf(req),
            [ACCESS_COOKIE]: refreshed,
          };
          token = refreshed;
        }
      }
    }
    if (!identity) {
      if (res) clearSessionCookies(res);
      return null;
    }

    const profile = await findProfileByAuthId(identity.claims.sub, identity.user.email);
    if (!profile) return null;
    return toAuthInfo(profile, identity.claims.sub);
  } catch (err) {
    logger.warn({ err }, "resolveAuth failed");
    return null;
  }
}

/** أي مستخدم مسجّل (طالب أو معلم) */
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
  if (auth.role !== "admin") {
    res.status(403).json({ error: "هذه الصلاحية للإدارة فقط." });
    return;
  }
  (req as AuthedRequest).auth = auth;
  next();
};

/** الهوية الخام من توكن.Kinde — للإداري الذي يحتاج بيانات الحساب لا الملف. */
export async function kindeIdentityOf(req: Request): Promise<{
  sub: string;
  email: string;
  fullName: string;
  picture: string;
} | null> {
  const token = String(cookiesOf(req)[ACCESS_COOKIE] || "");
  if (!token) return null;
  const user = await fetchKindeUser(token);
  if (!user) return null;
  return {
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    picture: user.picture,
  };
}