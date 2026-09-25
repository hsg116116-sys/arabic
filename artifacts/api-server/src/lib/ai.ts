import { logger } from "./logger";
import { loadLocalEnvOnce } from "./imagekit";

loadLocalEnvOnce();

// ============================================================================
// توليد أسئلة الاختبارات بالذكاء الاصطناعي — سلسلة مزودين بالترتيب:
// 1) مفاتيح GROQ (حتى 5: GROQ_API_KEY_1..5) — الأول ثم التالي عند الفشل
// 2) مزود OpenAI-compatible خاص (AI_API_KEY) إن وُجد
// 3) Pollinations المجاني (بدون مفاتيح) — يعمل فوراً
// الناتج دائماً: [{ question, options[4], correctAnswer, explanation }]
// ============================================================================

export type GeneratedQuestion = {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
};

function buildPrompt(opts: {
  prompt: string;
  count?: number;
  level: string;
  grade?: string;
  unitTitle?: string;
  lessonTitle?: string;
}): string {
  const ctx = [
    opts.grade ? `الصف: ${opts.grade}` : "",
    opts.unitTitle ? `الوحدة: ${opts.unitTitle}` : "",
    opts.lessonTitle ? `الدرس: ${opts.lessonTitle}` : "",
  ]
    .filter(Boolean)
    .join(" — ");
  const countLine = opts.count
    ? `عدد الأسئلة: ${opts.count}`
    : `عدد الأسئلة: اختر أنت العدد المناسب لتغطية الموضوع (بين 5 و 8 أسئلة)`;
  return `أنت خبير في المنهاج الفلسطيني للغة العربية. أنشئ اختبار اختيار من متعدد.
${ctx ? `السياق: ${ctx}.\n` : ""}موضوع الاختبار: ${opts.prompt}
${countLine} — المستوى: ${opts.level}.

شروط صارمة:
- كل سؤال له 4 خيارات بالضبط، خيار واحد صحيح فقط.
- correctAnswer هو رقم الخيار الصحيح (0-3).
- explanation شرح مختصر للإجابة الصحيحة.
- اللغة: عربية فصيحة سليمة، والشواهد من المنهاج الفلسطيني.
- أعد كائن JSON خام فقط (بدون markdown) بهذا الشكل بالضبط:
{"description":"سطر أو سطران يصفان الاختبار للطالب بأسلوب محفز","durationMinutes":20,"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":0,"explanation":"..."}]}
- اختر durationMinutes من [10,15,20,30,45,60] بما يناسب عدد الأسئلة ومستواها (نحو دقيقتين للسؤال).`;
}

function tryParseQuestions(json: string): GeneratedQuestion[] | null {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const valid = parsed.filter(
      (q) =>
        q &&
        typeof q.question === "string" &&
        q.question.trim() &&
        Array.isArray(q.options) &&
        q.options.length >= 2,
    );
    if (!valid.length) return null;
    return valid.map((q) => ({
      question: String(q.question).slice(0, 500),
      options: q.options.slice(0, 4).map((o: any) => String(o).slice(0, 200)),
      correctAnswer: Math.min(Math.max(Number(q.correctAnswer) || 0, 0), 3),
      explanation: String(q.explanation || "").slice(0, 500),
    }));
  } catch {
    return null;
  }
}

export type AiExamPayload = {
  questions: GeneratedQuestion[];
  description: string;
  durationMinutes: number | null;
};

function tryPayload(s: string): AiExamPayload | null {
  try {
    const p = JSON.parse(s);
    if (Array.isArray(p)) {
      const questions = tryParseQuestions(JSON.stringify(p));
      return questions ? { questions, description: "", durationMinutes: null } : null;
    }
    if (p && Array.isArray(p.questions)) {
      const questions = tryParseQuestions(JSON.stringify(p.questions));
      if (!questions) return null;
      return {
        questions,
        description: String(p.description || "").slice(0, 300),
        durationMinutes: Number(p.durationMinutes) || null,
      };
    }
  } catch { /* التالي */ }
  return null;
}

/** يستخرج حمولة الاختبار من رد الموديل مهما خالطه شرح — يجرب كل المرشحات */
function extractQuestions(text: string): AiExamPayload {
  const candidates: string[] = [];
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)) {
    candidates.push(m[1]);
  }
  candidates.push(text);
  // أكبر مقاطع {...} و [...] (الحمولة الكاملة غالباً الأطول)
  const spans: string[] = [];
  for (const re of [/\{[\s\S]*\}/g, /\[[\s\S]*\]/g]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) spans.push(m[0]);
  }
  spans.sort((a, b) => b.length - a.length);
  candidates.push(...spans.slice(0, 6));

  for (const c of candidates) {
    const t = c.trim();
    const direct = tryPayload(t);
    if (direct) return direct;
    const bs = t.indexOf("[");
    const be = t.lastIndexOf("]");
    if (bs >= 0 && be > bs) {
      const arr = tryPayload(t.slice(bs, be + 1));
      if (arr) return arr;
    }
    const os = t.indexOf("{");
    const oe = t.lastIndexOf("}");
    if (os >= 0 && oe > os) {
      const obj = tryPayload(t.slice(os, oe + 1));
      if (obj) return obj;
    }
  }
  throw new Error("bad shape");
}

/** كل مفاتيح GROQ المهيأة بالترتيب (1 ثم 2 ثم 3...) */
function groqKeys(): string[] {
  const list: string[] = [];
  const push = (k?: string) => {
    const t = (k || "").trim();
    if (t && !list.includes(t)) list.push(t);
  };
  push(process.env.GROQ_API_KEY);
  for (let i = 1; i <= 5; i++) push(process.env[`GROQ_API_KEY_${i}`]);
  const csv = process.env.GROQ_API_KEYS;
  if (csv) for (const k of csv.split(",")) push(k);
  return list;
}

async function chatComplete(
  url: string,
  key: string,
  model: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "أنت مولّد اختبارات عربية. أعد JSON خام فقط." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error?.message || `AI error ${res.status}`);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty AI response");
  return text;
}

/** الموديلات المرشحة بالترتيب — الأول من .env ثم بدائل مثبتة (ضد تقاعد الموديلات) */
function groqModels(): string[] {
  const list = [
    process.env.GROQ_MODEL,
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "allam-2-7b",
  ].filter(Boolean) as string[];
  return [...new Set(list)];
}

async function viaGroq(prompt: string, key: string): Promise<string> {
  let lastErr: any = null;
  for (const model of groqModels()) {
    try {
      return await chatComplete("https://api.groq.com/openai/v1/chat/completions", key, model, prompt);
    } catch (err: any) {
      const msg = String(err?.message || err);
      // خطأ صلاحية المفتاح → ننتقل للمفتاح التالي فوراً
      if (/401|invalid_api_key|unauthorized/i.test(msg)) throw err;
      logger.warn({ model, err: msg.slice(0, 160) }, "GROQ model failed, trying next model");
      lastErr = err;
    }
  }
  throw lastErr || new Error("GROQ failed");
}

async function viaOpenAICompatible(prompt: string): Promise<string> {
  const key = process.env.AI_API_KEY!;
  const base = (process.env.AI_API_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  return chatComplete(`${base}/chat/completions`, key, model, prompt);
}

async function viaPollinations(prompt: string): Promise<string> {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages: [
        { role: "system", content: "أنت مولّد اختبارات عربية. أعد JSON خام فقط." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`Pollinations error ${res.status}`);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty AI response");
  return text;
}

const PRESET_DURATIONS = ["10 دقائق", "15 دقيقة", "20 دقيقة", "30 دقيقة", "45 دقيقة", "60 دقيقة"];

/** عنوان ومدة مقترحان تلقائياً حسب الدرس/الوحدة وعدد الأسئلة */
export function suggestExamMeta(opts: {
  prompt: string;
  lessonTitle?: string;
  unitTitle?: string;
  questionsCount: number;
}): { suggestedTitle: string; suggestedDuration: string } {
  const clean = (s?: string) => (s || "").replace(/^(المطالعة|الشعر|القواعد|البلاغة|العروض|الإملاء|التعبير|التقويم)\s*:\s*/, "").trim();
  const lesson = clean(opts.lessonTitle);
  const unit = clean(opts.unitTitle);
  const suggestedTitle = lesson
    ? `اختبار درس ${lesson}`
    : unit
      ? `اختبار ${unit}`
      : `اختبار: ${opts.prompt.slice(0, 45)}`;
  const n = opts.questionsCount;
  const suggestedDuration =
    n <= 3 ? PRESET_DURATIONS[0] : n <= 5 ? PRESET_DURATIONS[1] : n <= 8 ? PRESET_DURATIONS[2] : n <= 10 ? PRESET_DURATIONS[3] : PRESET_DURATIONS[4];
  return { suggestedTitle, suggestedDuration };
}

export { PRESET_DURATIONS };

export async function generateQuestions(opts: {
  prompt: string;
  count?: number;
  level: string;
  grade?: string;
  unitTitle?: string;
  lessonTitle?: string;
}): Promise<{ questions: GeneratedQuestion[]; description: string; durationMinutes: number | null; provider: string }> {
  const auto = !opts.count || Number(opts.count) <= 0;
  const count = auto ? 10 : Math.min(Math.max(Number(opts.count), 1), 15);
  const full = buildPrompt({ ...opts, count: auto ? undefined : count });

  const finish = (payload: AiExamPayload, provider: string) => ({
    questions: payload.questions.slice(0, count),
    description: payload.description,
    durationMinutes: payload.durationMinutes,
    provider,
  });

  // 1) مفاتيح GROQ بالترتيب: الأول، فإن فشل فالثاني، وهكذا
  const keys = groqKeys();
  for (let i = 0; i < keys.length; i++) {
    try {
      return finish(extractQuestions(await viaGroq(full, keys[i])), `GROQ #${i + 1}`);
    } catch (err: any) {
      logger.warn({ keyIndex: i + 1, err: err?.message }, "GROQ key failed, rotating to next");
    }
  }

  // 2) مزود خاص إن وُجد
  if (process.env.AI_API_KEY) {
    try {
      return finish(extractQuestions(await viaOpenAICompatible(full)), "custom");
    } catch (err: any) {
      logger.warn({ err }, "custom AI failed, falling back to free provider");
    }
  }

  // 3) المجاني الاحتياطي
  try {
    return finish(extractQuestions(await viaPollinations(full)), "free");
  } catch (err: any) {
    logger.error({ err }, "AI generation failed on all providers");
    throw new Error("تعذر توليد الأسئلة الآن على كل المزودين — تحقق من الاتصال والمفاتيح وحاول مجدداً (يمكنك دائماً إضافة الأسئلة يدوياً).");
  }
}
