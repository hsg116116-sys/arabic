import { logger } from "./logger";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://zjxotgcsbsfwrfqtximw.supabase.co";
const SERVICE_ROLE =
  process.env.service_role ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_kPG7zfG0FFZpRTkNnHhO1Q_oXoOq8fg";

const baseHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
};

/** جلب المستخدم الحالي من Supabase Auth عبر رمز الوصول (auth/v1/user) */
export async function getSupabaseUser(
  accessToken: string,
): Promise<Record<string, unknown> | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/user`,
      {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  } catch (err) {
    logger.error({ err }, "getSupabaseUser failed");
    return null;
  }
}

export async function supabaseQuery<T = any>(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<{ data: T | null; error: any; count?: number | null }> {
  try {
    const url = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${endpoint.replace(/^\/+/, "")}`;
    const fetchHeaders = {
      ...baseHeaders,
      ...options.headers,
    };

    const res = await fetch(url, {
      method: options.method || "GET",
      headers: fetchHeaders,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error({ endpoint, status: res.status, errText }, "Supabase query error");
      return { data: null, error: errText || `Status ${res.status}` };
    }

    const contentRange = res.headers.get("content-range");
    let count: number | null = null;
    if (contentRange) {
      const parts = contentRange.split("/");
      if (parts[1] && parts[1] !== "*") {
        count = parseInt(parts[1], 10);
      }
    }

    if (res.status === 204) {
      return { data: null, error: null };
    }

    const data = await res.json().catch(() => null);
    return { data: data as T, error: null, count };
  } catch (err: any) {
    logger.error({ err, endpoint }, "Supabase fetch threw exception");
    return { data: null, error: err.message };
  }
}
