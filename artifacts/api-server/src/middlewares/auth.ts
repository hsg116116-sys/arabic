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

async function resolveAuth(req: Request): Promise<AuthInfo | null> {
  try {
    const token = (req as any)?.cookies?.supabase_access_token;
    if (!token) return null;
    const user = (await getSupabaseUser(token)) as Record<string, unknown> | null;
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
  const auth = await resolveAuth(req);
  if (!auth) {
    res.status(401).json({ error: "سجل الدخول أولاً للمتابعة." });
    return;
  }
  (req as AuthedRequest).auth = auth;
  next();
};

/** المعلم/الإدارة فقط */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const auth = await resolveAuth(req);
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
