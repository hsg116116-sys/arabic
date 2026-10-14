// ============================================================================
// سياسة بريد التسجيل.
// لا يوجد تأكيد بالبريد: التسجيل يفتح الحساب مباشرة بكلمة المرور.
// المتبقي هنا هو القيد الوحيد — أي مزوّد بريد يُسمح بإنشاء حساب طالب عبره.
// السيرفر هو المرجع في هذا القيد، والواجهة تعرضه للطالب مبكراً فقط.
// ============================================================================

/** مزوّدو البريد المسموحون للتسجيل: Gmail و Hotmail و Outlook فقط. */
export const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
] as const;

export const ALLOWED_PROVIDERS_LABEL = "Gmail أو Hotmail أو Outlook";

const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
}

/** نطاق مسموح؟ Gmail و Hotmail و Outlook بكل نطاقاتها الإقليمية. */
function isAllowedDomain(domain: string): boolean {
  if (ALLOWED_EMAIL_DOMAINS.includes(domain as (typeof ALLOWED_EMAIL_DOMAINS)[number])) return true;
  // نطاقات إقليمية: hotmail.co.uk، outlook.ae، live.fr ... كلها عائلة المزوّد نفسه
  return ["hotmail.", "outlook.", "live.", "msn."].some((prefix) => domain.startsWith(prefix));
}

export function checkEmailAllowed(raw: unknown):
  | { ok: true; email: string }
  | { ok: false; error: string } {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, error: "اكتب بريدك الإلكتروني أولاً." };
  if (!EMAIL_SHAPE.test(email)) {
    return { ok: false, error: "صيغة البريد غير صحيحة. مثال صحيح: name@gmail.com" };
  }
  if (!isAllowedDomain(emailDomain(email))) {
    return {
      ok: false,
      error: `هذا النطاق غير مسموح بالتسجيل. استخدم بريد ${ALLOWED_PROVIDERS_LABEL} فقط.`,
    };
  }
  return { ok: true, email };
}
