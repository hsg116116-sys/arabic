// ============================================================================
//  Kinde — عميل OAuth2/OIDC بلا اعتماديات خارجية.
//
//  المعمارية: BFF (backend-for-frontend). المتصفح لا يرى أي توكن ولا سرّ.
//  السيرفر يتبادل الكود مع Kinde ثم يخزّن التوكنات في كوكيز httpOnly،
//  تماماً كما كان يفعل مع Supabase — فبقية النظام لا تتغيّر.
//
//  ثلاثة مسؤوليات هنا:
//    1) توليد رابط التصريح مع PKCE (S256) — يُثبت أن الطلب جاء من عندنا.
//    2) تبادل الكود / التحديث الصامت عند نقطة /oauth2/token.
//    3) التحقق من صحة توكن الوصول محلياً عبر JWKS (RS256) — بلا اتصال
//      شبكي لكل طلب، وهو ما يجعل البوابة سريعة.
// ============================================================================
import {
  createHash,
  createPublicKey,
  createVerify,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import type { Request, Response } from "express";
import { logger } from "./logger";

export const ACCESS_COOKIE = "kinde_access_token";
export const REFRESH_COOKIE = "kinde_refresh_token";
export const VERIFIER_COOKIE = "kinde_pkce_verifier";
export const STATE_COOKIE = "kinde_oauth_state";

// عمر الكوكيز — التوكن القصير يُجدَّد صامتاً والطويل يبقي الجلسة حيّة
const ACCESS_MAX_AGE_MS = 60 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFIER_MAX_AGE_MS = 10 * 60 * 1000;

export class KindeError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "KindeError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// الإعدادات
// ---------------------------------------------------------------------------

export type KindeConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  siteUrl: string;
  logoutRedirectUri: string;
  domain: string;
};

function env(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

/** نطاق Kinde بلا مسار لاحق — ex: https://arabic.kinde.com */
export function kindeIssuer(): string {
  return (env("KINDE_ISSUER_URL", "KINDE_DOMAIN") || "https://arabic.kinde.com").replace(/\/+$/, "");
}

/** الإعدادات المحسوبة للطلب الحالي — الروابط تُشتق من الدومين الحقيقي.
 *  المتغيّرات تجاوز اختياري عند الحاجة لتثبيت دومين محدّد (Preview مثلاً). */
export function readKindeConfig(req?: Request): KindeConfig {
  const issuer = kindeIssuer();
  const origin = requestOrigin(req);
  const redirectUri = env("KINDE_REDIRECT_URI") || `${origin}/callback`;
  const siteUrl = env("KINDE_SITE_URL") || origin;
  const logoutRedirectUri =
    env("KINDE_LOGOUT_REDIRECT_URI", "KINDE_POST_LOGOUT_REDIRECT_URL") || siteUrl;
  return {
    issuer,
    domain: issuer,
    clientId: env("KINDE_CLIENT_ID"),
    clientSecret: env("KINDE_CLIENT_SECRET"),
    redirectUri,
    siteUrl,
    logoutRedirectUri,
  };
}

export function isKindeConfigured(cfg: KindeConfig): boolean {
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.redirectUri);
}

/**
 * أصل الطلب الفعلي — نستخدمه ليطابق redirect_uri مع الدومين الذي يفتح منه
 * المستخدم. هذا ما يجعل نفس البناء يعمل على localhost وعلى الدومين الرسمي
 * دون تعديل الإعدادات: المتغيّرات مجرد تجاوز اختياري لما يُشتق من الطلب.
 *
 * الترجيح: Origin ثم ترويسات التوجيه الأمامي ثم Host. لا نقرأ Referer عمداً
 * — أي رابط خارجي يضعه، وKinde سيرفض أي redirect_uri خارج قائمته على أي حال.
 */
export function requestOrigin(req?: Request): string {
  const fallback = env("KINDE_SITE_URL") || "http://localhost:3000";
  if (!req) return fallback.replace(/\/+$/, "");
  const headers = req.headers || {};

  // Origin أنقى إشارة: المتصفح وحده يضعها ولا يسمح لجافاسكربت بتزويرها.
  const origin = String(headers.origin || "").trim();
  if (/^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, "");

  const xfProto = String(headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const xfHost = String(headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = xfHost || String(headers.host || "");
  if (!host) return fallback.replace(/\/+$/, "");
  const proto = xfProto || req.protocol || "http";
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** حالة عشوائية تمنع تبديل الكود بين جلستين (CSRF على مسار OAuth). */
export function createState(): string {
  return base64Url(randomBytes(24));
}

// ---------------------------------------------------------------------------
// الكوكيز
// ---------------------------------------------------------------------------

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/** يكتب توكنات الجلسة. تُستدعى بعد أي تبادل أو تجديد. */
export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken?: string },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieBase(),
    maxAge: ACCESS_MAX_AGE_MS,
  });
  if (tokens.refreshToken) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...cookieBase(),
      maxAge: REFRESH_MAX_AGE_MS,
    });
  }
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
  res.clearCookie(VERIFIER_COOKIE, { path: "/" });
  res.clearCookie(STATE_COOKIE, { path: "/" });
}

export function setPkceCookies(
  res: Response,
  verifier: string,
  state: string,
): void {
  res.cookie(VERIFIER_COOKIE, verifier, { ...cookieBase(), maxAge: VERIFIER_MAX_AGE_MS });
  res.cookie(STATE_COOKIE, state, { ...cookieBase(), maxAge: VERIFIER_MAX_AGE_MS });
}

export function readPkceCookies(req: Request): { verifier: string; state: string } {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies || {};
  return {
    verifier: String(cookies[VERIFIER_COOKIE] || ""),
    state: String(cookies[STATE_COOKIE] || ""),
  };
}

// ---------------------------------------------------------------------------
// نقاط النهاية
// ---------------------------------------------------------------------------

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/** Kinde يعتمد client_secret_post — السر في جسم الطلب لا في ترويسة Basic. */
async function tokenRequest(cfg: KindeConfig, body: Record<string, string>): Promise<TokenSet> {
  const payload = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    ...body,
  });
  const response = await fetch(`${cfg.issuer}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new KindeError(
      `تعذّر الحصول على توكن من Kinde (${response.status}): ${
        data.error_description || data.error || response.statusText
      }`,
      502,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresIn: data.expires_in,
  };
}

export async function exchangeCode(
  cfg: KindeConfig,
  code: string,
  verifier: string,
): Promise<TokenSet> {
  return tokenRequest(cfg, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: cfg.redirectUri,
  });
}

export async function refreshSession(
  cfg: KindeConfig,
  refreshToken: string,
): Promise<TokenSet> {
  return tokenRequest(cfg, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

// ---------------------------------------------------------------------------
// التحقق من التوكن — RS256 عبر JWKS
// ---------------------------------------------------------------------------

export type KindeClaims = {
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  [key: string]: unknown;
};

let jwksCache: { keys: Map<string, KeyObject>; at: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function loadJwks(cfg: KindeConfig, force = false): Promise<Map<string, KeyObject>> {
  const now = Date.now();
  if (!force && jwksCache && now - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const response = await fetch(`${cfg.issuer}/.well-known/jwks`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new KindeError(`تعذّر تحميل مفاتيح توقيع Kinde (${response.status})`, 502);
  }
  const body = (await response.json().catch(() => ({}))) as {
    keys?: { kid?: string; kty?: string; alg?: string; n?: string; e?: string }[];
  };
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== "RSA" || !jwk.kid || !jwk.n || !jwk.e) continue;
    try {
      keys.set(jwk.kid, createPublicKey({ key: { ...jwk, alg: "RS256" } as never, format: "jwk" }));
    } catch {
      /* مفتاح غير صالح — نتخطاه */
    }
  }
  if (!keys.size) throw new KindeError("لم يطّلع Kinde على أي مفتاح توقيع صالح", 502);
  jwksCache = { keys, at: now };
  return keys;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * يتحقق من توقيع توكن الوصول وصلاحيته، محلياً بلا أي طلب شبكة بعد تحميل
 * المفاتيح. يُرجع المطالبات أو null إن كان التوكن مزيفاً أو منتهياً.
 */
export async function verifyAccessToken(
  token: string,
  cfg?: KindeConfig,
): Promise<KindeClaims | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSignature] = parts;
  const header = decodeSegment(rawHeader);
  const claims = decodeSegment(rawPayload);
  if (!header || !claims) return null;
  if (String(header.alg || "") !== "RS256") return null;

  const config = cfg || readKindeConfig();
  if (!config.clientId) return null;

  const kid = String(header.kid || "");
  let keys = await loadJwks(config);
  let key = kid ? keys.get(kid) : undefined;
  if (!key) {
    // تدوير المفاتيح: مفتاح جديد لم يُحمل بعد
    keys = await loadJwks(config, true);
    key = kid ? keys.get(kid) : undefined;
  }
  if (!key) return null;

  try {
    const valid = createVerify("RSA-SHA256")
      .update(`${rawHeader}.${rawPayload}`)
      .verify(key, Buffer.from(rawSignature, "base64url"));
    if (!valid) return null;
  } catch (err) {
    logger.warn({ err }, "Kinde token signature check failed");
    return null;
  }

  const issuer = config.issuer.replace(/\/+$/, "");
  if (claims.iss && String(claims.iss).replace(/\/+$/, "") !== issuer) return null;

  const aud = claims.aud;
  const audMatches = Array.isArray(aud)
    ? aud.some((a) => String(a) === config.clientId)
    : String(aud || "") === config.clientId;
  if (aud !== undefined && !audMatches) return null;

  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;

  const sub = String(claims.sub || "");
  return sub ? { ...claims, sub } : null;
}

// ---------------------------------------------------------------------------
// ملف المستخدم
// ---------------------------------------------------------------------------

export type KindeUser = {
  id: string;
  email: string;
  fullName: string;
  givenName: string;
  familyName: string;
  picture: string;
};

type RawUserProfile = {
  id?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
};

/**
 * يقرأ ملف المستخدم من نقطة userinfo. التوكن وحده لا يحمل البريد —
 * المطالبات المعلنة في Kinde هي (sub, aud, iss, exp…) فقط — فالبريد يحتاج
 * نداءً واحداً، ونخزّنه مؤقتاً بالرمز كي لا يتكرر مع كل طلب.
 */
const userCache = new Map<string, { user: KindeUser; at: number }>();
const USER_CACHE_TTL_MS = 60 * 1000;
const USER_CACHE_MAX = 2000;

export function clearUserCache(): void {
  userCache.clear();
}

export async function fetchKindeUser(
  accessToken: string,
  cfg?: KindeConfig,
): Promise<KindeUser | null> {
  if (!accessToken) return null;
  const now = Date.now();
  const hit = userCache.get(accessToken);
  if (hit && now - hit.at < USER_CACHE_TTL_MS) return hit.user;

  const config = cfg || readKindeConfig();
  try {
    const response = await fetch(`${config.issuer}/oauth2/v2/user_profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const raw = (await response.json().catch(() => ({}))) as RawUserProfile;
    const id = String(raw.id || raw.sub || "");
    if (!id) return null;
    const givenName = String(raw.given_name || "");
    const familyName = String(raw.family_name || "");
    const fullName = String(raw.name || `${givenName} ${familyName}`.trim()).trim();
    const user: KindeUser = {
      id,
      email: String(raw.email || "").trim().toLowerCase(),
      fullName,
      givenName,
      familyName,
      picture: String(raw.picture || ""),
    };
    if (userCache.size >= USER_CACHE_MAX) {
      const oldest = userCache.keys().next();
      if (!oldest.done) userCache.delete(oldest.value);
    }
    userCache.set(accessToken, { user, at: now });
    return user;
  } catch (err) {
    logger.warn({ err }, "fetchKindeUser failed");
    return null;
  }
}

/** يتحقق من التوكن ثم يعيد الهوية — الطريق المعتاد لقارئات الطلبات. */
export async function resolveKindeIdentity(
  accessToken: string,
  cfg?: KindeConfig,
): Promise<{ claims: KindeClaims; user: KindeUser } | null> {
  const config = cfg || readKindeConfig();
  const claims = await verifyAccessToken(accessToken, config);
  if (!claims) return null;
  const user = await fetchKindeUser(accessToken, config);
  if (!user) return null;
  return { claims, user };
}

// ---------------------------------------------------------------------------
// روابط التصريح والخروج
// ---------------------------------------------------------------------------

/** رابط تسجيل الدخول/الإنشاء في Kinde مع PKCE. */
export function buildAuthorizeUrl(cfg: KindeConfig, challenge: string, state: string): string {
  const url = new URL(`${cfg.issuer}/oauth2/auth`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", "openid profile email offline");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

/** رابط إنهاء الجلسة في Kinde — يُرجع المستخدم للصفحة الرئيسية. */
export function buildLogoutUrl(cfg: KindeConfig): string {
  const url = new URL(`${cfg.issuer}/logout`);
  url.searchParams.set("redirect", cfg.logoutRedirectUri);
  return url.toString();
}

/** توصيف بدون كشف السرّ — للتشخيص في السجل فقط. */
export function describeKindeSetup(): string {
  const cfg = readKindeConfig();
  return `issuer=${cfg.issuer || "-"} client=${cfg.clientId ? "موجود" : "مفقود"} secret=${
    cfg.clientSecret ? "موجود" : "مفقود"
  } redirect=${cfg.redirectUri || "-"}`;
}