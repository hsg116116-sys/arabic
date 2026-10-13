// ============================================================================
// مُرسِل بريد عبر SMTP (Brevo) بدون أي حزمة خارجية.
// السبب: الحزمة المبنية (api/index.mjs) تُشحن إلى Vercel، وكل حزمة غير مبنية
// تحتاج node_modules عند التشغيل — أي انقطاع في التثبيت يعني أن svc يفشل.
// لذا نكتب المحادثة على node:net / node:tls مباشرة.
// يدعم: الاتصال المشفّر سلفاً (465) و STARTTLS (587)، والمصادقة LOGIN أو PLAIN.
// ============================================================================
import { connect as tcpConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { loadLocalEnvOnce } from "./env";
import { logger } from "./logger";

loadLocalEnvOnce();

/** يُرفع إن كان الإرسال مفعّلاً لكن مفاتيحه غير موجودة (إعداد ناقص). */
export class MailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailNotConfiguredError";
  }
}

/** فشل الإرسال فعلياً: شبكة، مصادقة، أو رفض من المزوّد. */
export class MailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailSendError";
  }
}

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  login: string;
  pass: string;
  from: string;
  fromName: string;
  helo: string;
};

const DEFAULT_HOST = "smtp-relay.brevo.com";
const DEFAULT_PORT = 587;
const REPLY_TIMEOUT_MS = 25_000;

/** أول قيمة موجودة في قائمة أسماء المتغيرات. */
function firstEnv(...names: string[]): string {
  for (const name of names) {
    const raw = process.env[name];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) return value;
  }
  return "";
}

/** إعدادات البريد — تُقرأ عند كل إرسال فتتغير بلا إعادة تشغيل. */
export function readMailConfig(): MailConfig {
  const host = firstEnv("BREVO_SMTP_HOST", "SMTP_HOST") || DEFAULT_HOST;
  const rawPort = firstEnv("BREVO_SMTP_PORT", "SMTP_PORT");
  const parsedPort = rawPort ? Number(rawPort) : Number.NaN;
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;
  const rawLogin = firstEnv("BREVO_SMTP_LOGIN", "SMTP_LOGIN", "SMTP_USER", "SMTP_USERNAME");
  const rawFrom = firstEnv("BREVO_MAIL_FROM", "SMTP_FROM", "MAIL_FROM");
  // المرسل يغيب عن الإعداد فنسقط على اسم الدخول —Sending attempt فقط، ورفض
  // Brevo لمرسل غير موثّق يظهر كرسالة عربية واضحة بدل "غير مفعّل" ambiguously.
  const login = rawLogin || rawFrom;
  const from = rawFrom || rawLogin;
  return {
    host,
    port,
    secure: firstEnv("BREVO_SMTP_SECURE", "SMTP_SECURE").toLowerCase() === "true" || port === 465,
    login,
    pass: firstEnv(
      "BREVO_SMTP_KEY",
      "SMTP_KEY",
      "BREVO_SMTP_PASSWORD",
      "SMTP_PASSWORD",
      "SMTP_PASS",
    ),
    from,
    fromName: firstEnv("BREVO_MAIL_FROM_NAME", "MAIL_FROM_NAME", "SMTP_FROM_NAME") || "أرض اللغة",
    helo: firstEnv("BREVO_SMTP_HELO", "SMTP_HELO") || "ard-al-lughah",
  };
}

/** هل البريد مفعّل ومفاتيحه كاملة؟ */
export function isMailConfigured(): boolean {
  const cfg = readMailConfig();
  return Boolean(cfg.pass && cfg.from && cfg.login);
}

/** وصف للإعداد بدون كشف المفتاح — للتشخيص في السجل فقط. */
export function describeMailSetup(): string {
  const cfg = readMailConfig();
  const resend = firstEnv("RESEND_API_KEY", "RESEND_KEY");
  return `resend=${resend ? "موجود" : "مفقود"}${firstEnv("RESEND_FROM") ? ` from=${firstEnv("RESEND_FROM")}` : ""} | smtp=${cfg.host}:${cfg.port} from=${cfg.from || "-"} key=${cfg.pass ? "موجود" : "مفقود"}`;
}

// ---------------------------------------------------------------------------
// محادثة SMTP: قارئ أسطر + التحقق من رموز الرد
// ---------------------------------------------------------------------------

type Waiter = { resolve: (line: string) => void; reject: (err: Error) => void };
type LineReader = { read: () => Promise<string>; release: () => void };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new MailSendError(`انتهت مهلة الرد من سيرفر البريد أثناء ${label}.`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

function attachReader(socket: Socket | TLSSocket): LineReader {
  let buffer = "";
  const lines: string[] = [];
  const waiters: Waiter[] = [];

  const pump = () => {
    while (lines.length > 0 && waiters.length > 0) {
      const waiter = waiters.shift() as Waiter;
      waiter.resolve(lines.shift() as string);
    }
  };

  const onData = (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let index = buffer.indexOf("\r\n");
    while (index !== -1) {
      lines.push(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf("\r\n");
    }
    pump();
  };

  const onError = (err: Error) => {
    const waiter = waiters.shift();
    if (waiter) waiter.reject(err);
  };

  socket.on("data", onData);
  socket.on("error", onError);

  return {
    read: () =>
      new Promise<string>((resolve, reject) => {
        waiters.push({ resolve, reject });
        pump();
      }),
    // يفكّ المستمعين دون إغلاق المقبس — لازم قبل ترقية STARTTLS
    release: () => {
      socket.off("data", onData);
      socket.off("error", onError);
      for (const waiter of waiters.splice(0)) waiter.reject(new MailSendError("أُغلقت جلسة البريد."));
    },
  };
}

/** يقرأ رداً كاملاً (سطر أو أكثر) ويتأكد من رمز النجاح المتوقع. */
async function expectCode(reader: LineReader, expected: number, label: string): Promise<string[]> {
  const collected: string[] = [];
  for (let guard = 0; guard < 64; guard += 1) {
    const line = await withTimeout(reader.read(), REPLY_TIMEOUT_MS, label);
    collected.push(line);
    const status = Number.parseInt(line.slice(0, 3), 10);
    if (!Number.isFinite(status)) {
      throw new MailSendError(`رد غير مفهوم من سيرفر البريد أثناء ${label}: ${line}`);
    }
    // رد متعدد الأسطر: "250-SIZE" يتبعه سطر أخير "250 انتهى"
    if (line.length > 3 && line[3] === "-") continue;
    if (status !== expected) {
      const detail = line.slice(4).trim() || line;
      throw new MailSendError(`فشل ${label} عند سيرفر البريد (${status}): ${detail}`);
    }
    return collected;
  }
  throw new MailSendError(`رد طويل بشكل غير متوقع من سيرفر البريد أثناء ${label}.`);
}

function openSocket(cfg: MailConfig): Promise<Socket | TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = cfg.secure
      ? tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: true })
      : tcpConnect({ host: cfg.host, port: cfg.port });
    const onError = (err: Error) => {
      socket.destroy();
      reject(new MailSendError(`تعذّر الوصول إلى سيرفر البريد (${cfg.host}:${cfg.port}): ${err.message}`));
    };
    socket.once("error", onError);
    socket.once(cfg.secure ? "secureConnect" : "connect", () => {
      socket.off("error", onError);
      socket.setTimeout(REPLY_TIMEOUT_MS, () => {
        socket.destroy();
        reject(new MailSendError("انتهت مهلة الاتصال بسيرفر البريد."));
      });
      resolve(socket);
    });
  });
}

function upgradeToTls(socket: Socket, host: string): Promise<TLSSocket> {
  return new Promise<TLSSocket>((resolve, reject) => {
    const secure = tlsConnect({ socket, servername: host, rejectUnauthorized: true });
    const onError = (err: Error) => {
      secure.destroy();
      reject(new MailSendError(`تعذّر تشفير الاتصال بسيرفر البريد: ${err.message}`));
    };
    secure.once("error", onError);
    secure.once("secureConnect", () => {
      secure.off("error", onError);
      resolve(secure);
    });
  });
}

// ---------------------------------------------------------------------------
// بناء الرسالة
// ---------------------------------------------------------------------------

/** ASCII يمرّ كما هو، والنص العربي يُرمَّز base64 بترويسة RFC 2047. */
function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildMessage(cfg: MailConfig, msg: MailMessage, boundary: string): string {
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `From: ${encodeHeaderValue(cfg.fromName)} <${cfg.from}>`,
    `To: <${msg.to}>`,
    `Subject: ${encodeHeaderValue(msg.subject)}`,
    `Message-ID: <${randomBytes(16).toString("hex")}@${hostname()}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(msg.text ?? "", "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(msg.html, "utf8").toString("base64"),
    `--${boundary}--`,
  ];
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n`;
}

/** SMTP يقتطع سطراً يبدأ بنقطة، فنضاعفها (RFC 5321 §4.5.2). */
function dotStuff(payload: string): string {
  return payload.replace(/(^|\r\n)\./g, "$1..");
}

// ---------------------------------------------------------------------------
// الإرسال
// ---------------------------------------------------------------------------

/** يرسل رسالة واحدة. يرمي MailNotConfiguredError إن كان الإعداد ناقصاً. */
export async function sendMail(msg: MailMessage): Promise<void> {
  const failures: string[] = [];
  const providers: string[] = [];

  // المزوّد الأول: Resend عبر HTTP
  const resendKey = firstEnv("RESEND_API_KEY", "RESEND_KEY");
  if (resendKey) {
    providers.push("resend");
    try {
      await sendViaResend(msg, resendKey);
      return;
    } catch (err) {
      failures.push(`resend: ${(err as Error)?.message || "فشل غير معروف"}`);
      logger.warn({ err }, "Resend send failed — trying the next provider");
    }
  }

  // الثاني: Brevo عبر SMTP
  if (isMailConfigured()) {
    providers.push("brevo");
    try {
      await sendViaBrevo(msg);
      return;
    } catch (err) {
      if (err instanceof MailNotConfiguredError) throw err;
      failures.push(`brevo: ${(err as Error)?.message || "فشل غير معروف"}`);
      logger.warn({ err }, "Brevo send failed — trying the next provider");
    }
  }

  // الاحتياطي: MessageBird عبر HTTP (بلا قيود IP)
  const birdKey = firstEnv("BIRD_API_KEY", "MESSAGEBIRD_API_KEY");
  if (birdKey) {
    providers.push("messagebird");
    try {
      await sendViaMessageBird(msg, birdKey);
      return;
    } catch (err) {
      failures.push(`messagebird: ${(err as Error)?.message || "فشل غير معروف"}`);
      logger.warn({ err }, "MessageBird send failed");
    }
  }

  if (providers.length === 0) {
    throw new MailNotConfiguredError("لم تُضبط أي خدمة بريد على الخادم (RESEND_API_KEY / BREVO_SMTP_KEY / BIRD_API_KEY).");
  }
  logger.error({ failures }, "Every mail provider failed");
  throw new MailSendError(failures.join(" | "));
}

/** Resend عبر REST — بلا حزم ولا قيود IP. */
async function sendViaResend(msg: MailMessage, key: string): Promise<void> {
  const from = firstEnv("RESEND_FROM", "RESEND_MAIL_FROM") || "onboarding@resend.dev";
  const fromName = firstEnv("RESEND_FROM_NAME", "RESEND_MAIL_FROM_NAME") || "أرض اللغة";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${from}>`,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text ?? "",
    }),
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new MailSendError(`Resend رفض الإرسال (${response.status}): ${text.slice(0, 220)}`);
  }
}

/** MessageBird عبر REST — يُستعمل احتياطاً حين يرفض Brevo الاتصال. */
async function sendViaMessageBird(msg: MailMessage, key: string): Promise<void> {
  const from = firstEnv("BIRD_FROM", "MESSAGEBIRD_FROM") || "messagebird@messagebird.com";
  const response = await fetch("https://rest.messagebird.com/messages", {
    method: "POST",
    headers: {
      Authorization: `AccessKey ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      body: msg.text ?? "",
    }),
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new MailSendError(`MessageBird رفض الإرسال (${response.status}): ${text.slice(0, 200)}`);
  }
}

async function sendViaBrevo(msg: MailMessage): Promise<void> {
  const cfg = readMailConfig();
  if (!cfg.pass) {
    throw new MailNotConfiguredError("لم يُضبط مفتاح بريد Brevo (BREVO_SMTP_KEY) على الخادم.");
  }
  if (!cfg.from || !cfg.login) {
    throw new MailNotConfiguredError("لم تُضبط بيانات دخول البريد (BREVO_SMTP_LOGIN / BREVO_MAIL_FROM) على الخادم.");
  }

  const boundary = `----=_ard_${randomBytes(12).toString("hex")}`;
  const payload = dotStuff(buildMessage(cfg, msg, boundary));

  let socket = await openSocket(cfg);
  let reader = attachReader(socket);

  const write = (line: string) => socket.write(`${line}\r\n`);

  try {
    await expectCode(reader, 220, "الترحيب");

    write(`EHLO ${cfg.helo}`);
    let caps = (await expectCode(reader, 250, "تعريف الخادم")).join("\n").toUpperCase();

    // STARTTLS إلا إذا كان الاتصال مشفّراً سلفاً (المنفذ 465)
    if (!cfg.secure) {
      if (!caps.includes("STARTTLS")) {
        throw new MailSendError("سيرفر البريد لا يدعم STARTTLS — لا نرسل كلمة المرور بلا تشفير.");
      }
      write("STARTTLS");
      await expectCode(reader, 220, "تفعيل التشفير");
      reader.release();
      socket = await upgradeToTls(socket as Socket, cfg.host);
      reader = attachReader(socket);
      // بعد الترقية يُعاد تعريف الخادم على القناة المشفّرة
      write(`EHLO ${cfg.helo}`);
      caps = (await expectCode(reader, 250, "تعريف الخادم بعد التشفير")).join("\n").toUpperCase();
    }

    // المصادقة: PLAIN إن كان الخادم يعرضها وحدها، وإلا LOGIN القياسي
    if (caps.includes("AUTH") && caps.includes("PLAIN") && !caps.includes("LOGIN")) {
      write(`AUTH PLAIN ${Buffer.from(`\u0000${cfg.login}\u0000${cfg.pass}`, "utf8").toString("base64")}`);
    } else {
      write("AUTH LOGIN");
      await expectCode(reader, 334, "اسم المستخدم");
      write(Buffer.from(cfg.login, "utf8").toString("base64"));
      await expectCode(reader, 334, "كلمة المرور");
      write(Buffer.from(cfg.pass, "utf8").toString("base64"));
    }
    await expectCode(reader, 235, "مصادقة البريد");

    write(`MAIL FROM:<${cfg.from}>`);
    await expectCode(reader, 250, "مرسل الرسالة");
    write(`RCPT TO:<${msg.to}>`);
    await expectCode(reader, 250, "مستلم الرسالة");
    write("DATA");
    await expectCode(reader, 354, "بداية المحتوى");
    write(`${payload}\r\n.`);
    await expectCode(reader, 250, "إرسال المحتوى");
    write("QUIT");
  } catch (err) {
    logger.error({ err }, "SMTP send failed");
    throw err instanceof MailSendError || err instanceof MailNotConfiguredError
      ? err
      : new MailSendError((err as Error)?.message || "تعذّر إرسال البريد.");
  } finally {
    socket.destroy();
  }
}
