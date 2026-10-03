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

async function trySilentRefresh(
  req: Request,
  res: Parameters<RequestHandler>[1],
): Promise<string | null> {
  try {
    const refreshToken = (req as any)?.cookies?.supabase_refresh_token;
    if (typeof refreshToken !== "string" || !refreshToken) return null;
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
    const secure = process.env.NODE_ENV === "production";
    if (typeof data.access_token === "string") {
      res.cookie("supabase_access_token", data.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 1000,
      });
    }
    if (typeof data.refresh_token === "string") {
      res.cookie("supabase_refresh_token", data.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
    return data.access_token as string;
  } catch (err) {
    logger.warn({ err }, "Middleware silent refresh failed");
    return null;
  }
}

async function resolveAuth(req: Request, res?: Parameters<RequestHandler>[1]): Promise<AuthInfo | null> {
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
  if (auth.role !== "admin") {
    res.status(403).json({ error: "هذه الصلاحية للإدارة فقط." });
    return;
  }
  (req as AuthedRequest).auth = auth;
  next();
};
