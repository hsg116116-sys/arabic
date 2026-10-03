/* ============================================================================
   بناء مشاريع React/TypeScript الخام داخل المتصفح — بلا سيرفر بناء.
   ----------------------------------------------------------------------------
   خط الأنابيب:  ZIP/TAR.GZ ← فك محلي ← تصفية ← اكتشاف (جاهز dist؟ أم مصدر؟)
   ← بناء esbuild-wasm (نظام ملفات وهمي + حزم npm عبر esm.sh)
   ← حاوية {js, css, meta} مضغوطة gzip للتخزين ← عارض معزول.

   ملاحظة: esbuild يُستورد ديناميكياً (import) حتى يعمل في المتصفح (Vite)
   وفي Node (الاختبارات) معاً دون مشاكل CJS/ESM.
   ============================================================================ */

import type * as esbuildTypes from 'esbuild-wasm/esm/browser.js';
import {
  parseZip,
  parseTar,
  gunzipBuffer,
  detectKind,
  uploadBundleDirect,
  isSourceBundleUrl as isSourceBundleUrlBase,
  type BundleKind,
} from './site-bundle';

/** هل هذا الرابط حاوية كود مصدري مبني؟ (إعادة تصدير للتوافق) */
export const isSourceBundleUrl = isSourceBundleUrlBase;

type Esbuild = typeof esbuildTypes;
let esbuildMod: Esbuild | null = null;
async function getEsbuild(): Promise<Esbuild> {
  // غراء esbuild-wasm للمتصفح يفترض وجود self — عرّفه في Node (الاختبارات) إن غاب
  if (typeof (globalThis as any).self === 'undefined') (globalThis as any).self = globalThis;
  if (!esbuildMod) esbuildMod = (await import('esbuild-wasm/esm/browser.js')) as Esbuild;
  return esbuildMod;
}

export const SOURCE_LIMITS = {
  // الأرشيف المرفوع: TAR غير مضغوط يكبر بسرعة (صور/فيديو) — 64MB للفحص المحلي،
  // والرفع المباشر نفسه حتى 100MB. من تجاوز الحد: TAR.GZ يصغّر 3-5 أضعاف عادة.
  maxArchiveBytes: 64 * 1024 * 1024,
  maxFiles: 2000,
  maxScanFileBytes: 2 * 1024 * 1024, // ملفات أكبر من 2MB تُتجاهل مع تنبيه
  maxInlineAssetBytes: 512 * 1024, // وسائط أكبر من 512KB تُستبعد مع تحذير
  maxContainerBytes: 1 * 1024 * 1024, // 1MB صارم للحاوية بعد الضغط
} as const;

export type PreparedArchive =
  | {
      kind: 'site';
      files: Map<string, Uint8Array>;
      ignored: string[];
      warnings: string[];
    }
  | {
      kind: 'source';
      files: Map<string, Uint8Array>;
      ignored: string[];
      warnings: string[];
      entry: string;
      packageJson: Record<string, any>;
      tsPaths: Array<{ prefix: string; suffix: string; star: boolean; targets: string[] }>;
      baseUrl: string;
    };

export type SourceBuildResult = {
  js: string;
  css: string;
  entry: string;
  deps: Record<string, string>;
  reactVersion: string;
  reactDomVersion: string;
  warnings: string[];
  sizes: { js: number; css: number; total: number };
  tailwind: 3 | 4 | null;
  fonts: string[];
  autoEntry: boolean;
  strippedCssImports: string[];
};

export type SourceContainer = {
  v: 1;
  kind: 'src';
  entry: string;
  js: string;
  css: string;
  deps: Record<string, string>;
  hash: string;
  builtAt: string;
  sizes: { js: number; css: number; total: number; gz: number };
  warnings: string[];
  tailwind: 3 | 4 | null;
  fonts: string[];
};

/* ---------------- فك الأرشيف الخام (مشترك للجاهز والمصدر) ---------------- */

export async function extractRawArchive(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<{ files: Map<string, Uint8Array>; kind: BundleKind; warnings: string[] }> {
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) throw new Error('الملف فارغ — أعد رفعه');
  if (bytes.length > SOURCE_LIMITS.maxArchiveBytes) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1);
    throw new Error(
      `حجم الأرشيف ${mb(bytes.length)}MB يتجاوز حد الفحص المحلي (${SOURCE_LIMITS.maxArchiveBytes / 1024 / 1024}MB) — اضغطه بصيغة TAR.GZ (تصغّر الحجم كثيراً) ثم أعد الرفع، أو أخرج الصور الكبيرة منه`,
    );
  }
  const warnings: string[] = [];
  const kind = detectKind(bytes, fileName);
  if (!kind) throw new Error('صيغة غير مدعومة — ارفع TAR أو TAR.GZ (الأفضل) أو ZIP فقط');
  let raw: Map<string, Uint8Array>;
  if (kind === 'zip') raw = await parseZip(bytes, warnings);
  else if (kind === 'tgz') {
    let tar: Uint8Array;
    try {
      tar = await gunzipBuffer(bytes);
    } catch {
      throw new Error('تعذّر فك ضغط GZIP — الملف تالف أو ليس gzip حقيقياً');
    }
    try {
      raw = parseTar(tar, warnings);
    } catch {
      throw new Error('ملف GZIP سليم لكنه ليس أرشيف TAR — اضغط مجلد الموقع كاملاً بصيغة TAR.GZ لا ملفاً واحداً');
    }
  } else raw = parseTar(bytes, warnings);
  return { files: raw, kind, warnings };
}

/* ---------------- التصفية وإعادة التأسيس والتصنيف ---------------- */

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage',
  '.cache', '.vercel', '.turbo', '.expo', '__MACOSX',
]);
const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'thumbs.db',
]);

function isSkippedPath(p: string): boolean {
  const lower = p.toLowerCase();
  if (lower.endsWith('.ds_store') || lower.startsWith('._')) return true;
  const segs = lower.split('/');
  if (segs.some((s) => SKIP_DIRS.has(s))) return true;
  const base = segs[segs.length - 1]!;
  if (SKIP_FILES.has(base)) return true;
  if (base.startsWith('.env')) return true;
  if (base.endsWith('.log')) return true;
  return false;
}

const ENTRY_BASENAME_SCORE: Record<string, number> = {
  'main.tsx': 0, 'main.ts': 1, 'index.tsx': 2, 'index.ts': 3,
  'app.tsx': 4, 'main.jsx': 5, 'index.jsx': 6, 'page.tsx': 7,
  'index.js': 8, 'main.js': 9, 'app.jsx': 10, 'app.ts': 11,
  'root.tsx': 12, 'client.tsx': 13, 'bootstrap.tsx': 14,
};

const ENTRY_EXTS = new Set(['tsx', 'ts', 'jsx', 'js', 'mjs']);

function isTestOrStoryPath(p: string): boolean {
  const b = p.split('/').pop()!.toLowerCase();
  return b.includes('.test.') || b.includes('.spec.') || b.includes('.stories.') || b.includes('.cy.');
}

/** أقضح ملف JSON (package.json/tsconfig) — يتقبل أي عمق */
function shallowestJsonPath(files: Map<string, Uint8Array>, name: string): string | null {
  let best: string | null = null;
  let bestDepth = Infinity;
  for (const p of files.keys()) {
    if (p !== name && !p.endsWith('/' + name)) continue;
    const d = p.split('/').length;
    if (d < bestDepth || (d === bestDepth && (best === null || p < best))) {
      bestDepth = d;
      best = p;
    }
  }
  return best;
}

/**
 * بحث تراجعي عن نقطة الدخول في أي عمق وبأي اسم:
 * 1) أسماء الإقلاع المعروفة (main/index/app/page…) 2) ملفات تستدعي createRoot/render
 * 3) الملفات المساعدة البحتة (util/helpers…) لا تُعتبر دخولاً أبداً.
 */
function findSourceEntry(files: Map<string, Uint8Array>): string | null {
  const dec = new TextDecoder('utf-8');
  type Cand = { p: string; score: number };
  const cands: Cand[] = [];
  for (const p of files.keys()) {
    const ext = p.split('.').pop()!.toLowerCase();
    if (!ENTRY_EXTS.has(ext)) continue;
    if (isTestOrStoryPath(p)) continue;
    const base = p.split('/').pop()!.toLowerCase();
    const depth = p.split('/').length;
    const known = ENTRY_BASENAME_SCORE[base];
    if (known === undefined) continue; // ليس اسم إقلاع — قد يُرفع لاحقاً عبر إشارة المحتوى
    cands.push({ p, score: known * 100 + depth * 5 });
  }
  // إشارات المحتوى: أي ملف يقلع تطبيقاً (بأي اسم) مرشح قوي
  for (const p of files.keys()) {
    if (cands.some((c) => c.p === p)) continue;
    const ext = p.split('.').pop()!.toLowerCase();
    if (!ENTRY_EXTS.has(ext)) continue;
    if (isTestOrStoryPath(p)) continue;
    const data = files.get(p)!;
    if (data.length > 300_000) continue;
    let src = '';
    try {
      src = dec.decode(data.subarray(0, 8192));
    } catch {
      continue;
    }
    if (/createRoot|hydrateRoot|ReactDOM\s*\.\s*render/.test(src)) {
      cands.push({ p, score: -500 + p.split('/').length * 5 });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.score - b.score || (a.p < b.p ? -1 : 1));
  return cands[0]!.p;
}

function listSourceFiles(files: Map<string, Uint8Array>, max = 8): string[] {
  const src = [...files.keys()].filter(
    (p) => /\.(tsx|ts|jsx|js|mjs|json)$/i.test(p) && !isTestOrStoryPath(p),
  );
  return (src.length ? src : [...files.keys()]).slice(0, max);
}

function parseTsPaths(tsconfig: any): { baseUrl: string; paths: Array<{ prefix: string; suffix: string; star: boolean; targets: string[] }> } {
  const out = { baseUrl: '', paths: [] as Array<{ prefix: string; suffix: string; star: boolean; targets: string[] }> };
  try {
    const co = tsconfig?.compilerOptions || {};
    if (typeof co.baseUrl === 'string') out.baseUrl = co.baseUrl.replace(/\\/g, '/').replace(/\/+$/, '');
    const paths = co.paths || {};
    for (const [key, targets] of Object.entries(paths)) {
      if (!Array.isArray(targets)) continue;
      const star = String(key).indexOf('*');
      if (star < 0) {
        out.paths.push({ prefix: String(key), suffix: '', star: false, targets: (targets as string[]).map(String) });
      } else {
        out.paths.push({
          prefix: String(key).slice(0, star),
          suffix: String(key).slice(star + 1),
          star: true,
          targets: (targets as string[]).map(String),
        });
      }
    }
  } catch {
    /* تجاهل */
  }
  return out;
}

function readJsonFile(files: Map<string, Uint8Array>, path: string): any | null {
  const b = files.get(path);
  if (!b) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8').decode(b));
  } catch {
    return null;
  }
}

/**
 * يصفّي ملفات الأرشيف، يعيد التأسيس لجذر المشروع، ويصنّفه:
 * 'site' (فيه index.html — يُعامل كموقع جاهز) أو 'source' (كود خام يُبنى).
 */
export function classifyAndPrepare(
  raw: Map<string, Uint8Array>,
  priorWarnings: string[] = [],
): PreparedArchive {
  const ignored: string[] = [];
  const warnings: string[] = [...priorWarnings];
  // 1) تصفية الضجيج والملفات الضخمة
  const kept = new Map<string, Uint8Array>();
  for (const [p, data] of raw) {
    if (isSkippedPath(p)) {
      ignored.push(p);
      continue;
    }
    if (data.length > SOURCE_LIMITS.maxScanFileBytes) {
      ignored.push(`${p} (${Math.round(data.length / 1024)}KB — أكبر من 2MB)`);
      continue;
    }
    if (kept.size >= SOURCE_LIMITS.maxFiles) {
      warnings.push(`تجاوز عدد الملفات ${SOURCE_LIMITS.maxFiles} — أُهملت بقية الملفات`);
      break;
    }
    if (!kept.has(p)) kept.set(p, data);
  }
  if (!kept.size) {
    throw new Error('الأرشيف فارغ بعد التصفية — تأكد أنك ضغطت مجلد المشروع نفسه لا مجلداً فارغاً');
  }
  // 2) إعادة التأسيس: مجلد واحد يغلّف المشروع (my-app/package.json) ← جرّده
  let files = kept;
  const roots = new Set([...kept.keys()].map((p) => p.split('/')[0]!));
  if (!kept.has('package.json') && roots.size === 1) {
    const top = [...roots][0]!;
    if ([...kept.keys()].some((p) => p === `${top}/package.json`)) {
      const rebased = new Map<string, Uint8Array>();
      for (const [p, data] of kept) {
        if (p === top || !p.startsWith(top + '/')) continue;
        rebased.set(p.slice(top.length + 1), data);
      }
      if (rebased.size) {
        files = rebased;
        warnings.push(`جُرّد المجلد المغلّف «${top}/» تلقائياً — اعتبرنا ما بداخله جذر المشروع`);
      }
    }
  }
  // 3) التصنيف: موقع جاهز؟
  const htmls = [...files.keys()].filter((p) => {
    const e = p.split('.').pop()!.toLowerCase();
    return (e === 'html' || e === 'htm') && !p.includes('/node_modules/');
  });
  const rootIndex = htmls.find((p) => {
    const base = p.split('/').pop()!.toLowerCase();
    return base === 'index.html' && p.split('/').length <= 2;
  });
  if (rootIndex || (htmls.length > 0 && !files.has('package.json'))) {
    return { kind: 'site', files, ignored, warnings };
  }
  // 4) مصدر؟ (package.json أو tsconfig أو ملفات src — بأي عمق)
  const pkgPath = shallowestJsonPath(files, 'package.json');
  const pkg = (pkgPath && readJsonFile(files, pkgPath)) || null;
  const tsPath = shallowestJsonPath(files, 'tsconfig.json');
  const hasSrc = [...files.keys()].some((p) => /\.(tsx|ts|jsx)$/i.test(p));
  if (!pkg && !tsPath && !hasSrc) {
    const sample = [...files.keys()].slice(0, 6).join('، ');
    throw new Error(
      `تعذّر التعرّف على المشروع — لا index.html (موقع جاهز) ولا package.json/src (كود مصدري). وجدنا: ${sample}. اضغط مجلد المشروع نفسه بصيغة TAR (الأفضل) أو ZIP.`,
    );
  }
  const packageJson = pkg || {};
  const tsconfig = (tsPath && readJsonFile(files, tsPath)) || {};
  const tsDir = tsPath ? dirOf(tsPath) : '';
  const { baseUrl, paths } = parseTsPaths(tsconfig);
  // مسارات tsconfig نسبية لمجلد tsconfig نفسه (أو لـ baseUrl داخله)
  const effectiveBase = baseUrl ? (tsDir ? `${tsDir}/${baseUrl}` : baseUrl) : tsDir;
  const entry = findSourceEntry(files);
  if (!entry) {
    const sample = listSourceFiles(files).join('، ');
    throw new Error(
      `تعذّر العثور على ملف الدخول — ملفات الكود الموجودة: ${sample}. ضع نقطة البداية باسم واضح (main.tsx أو index.tsx داخل src، بأي عمق) ثم أعد الضغط`,
    );
  }
  if (/(^|\/)app\/page\.[jt]sx?$/.test(entry) || /(^|\/)pages\/index\.[jt]sx?$/.test(entry)) {
    warnings.push('مشروع Next.js — سيُبنى كصفحة عميلة (روابط/صور/خطوط Next تُحاكى تلقائياً، وهيئات السيرفر غير مدعومة)');
  }
  return { kind: 'source', files, ignored, warnings, entry, packageJson, tsPaths: paths, baseUrl: effectiveBase };
}

/* ---------------- محرك esbuild-wasm ---------------- */

export type EsbuildWasmSource = { wasmURL: string } | { wasmModule: WebAssembly.Module };

let engineReady: Promise<void> | null = null;

export function ensureSourceEngine(src: EsbuildWasmSource, opts?: { worker?: boolean }): Promise<void> {
  if (!engineReady) {
    engineReady = (async () => {
      const esbuild = await getEsbuild();
      await esbuild.initialize({
        ...(('wasmURL' in src) ? { wasmURL: src.wasmURL } : { wasmModule: src.wasmModule }),
        worker: opts?.worker ?? false,
      });
    })().catch((e) => {
      engineReady = null;
      throw e;
    });
  }
  return engineReady;
}

const TRY_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json', '.css'];
const INDEX_FILES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];

const TEXT_LOADER: Record<string, string> = {
  tsx: 'tsx', ts: 'ts', jsx: 'jsx', js: 'jsx', mjs: 'js', cjs: 'js',
  json: 'json', css: 'css', txt: 'text',
};
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg',
  'mp3', 'ogg', 'wav', 'm4a', 'mp4', 'webm', 'ogv',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'pdf',
]);
const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'child_process', 'stream', 'util', 'events',
  'buffer', 'http', 'https', 'url', 'querystring', 'assert', 'zlib', 'net',
  'tls', 'dgram', 'dns', 'cluster', 'worker_threads', 'perf_hooks',
  'fs/promises', 'path/posix', 'path/win32', 'stream/promises', 'util/types',
]);

function cleanVersion(raw: unknown, fallback: string): string {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  const first = s.split(/[,\s|]+/)[0]!;
  const cleaned = first.replace(/^[~^>=<v\s]+/, '');
  if (!cleaned || cleaned === '*' || cleaned.toLowerCase() === 'latest') return fallback;
  return cleaned;
}

function splitBare(spec: string): { name: string; rest: string } {
  if (spec.startsWith('@')) {
    const i = spec.indexOf('/', 1);
    const j = i >= 0 ? spec.indexOf('/', i + 1) : -1;
    if (i < 0) return { name: spec, rest: '' };
    if (j < 0) return { name: spec, rest: '' };
    return { name: spec.slice(0, j), rest: spec.slice(j) };
  }
  const i = spec.indexOf('/');
  if (i < 0) return { name: spec, rest: '' };
  return { name: spec.slice(0, i), rest: spec.slice(i) };
}

function isBareSpecifier(spec: string): boolean {
  if (!spec) return false;
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('#')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(spec)) return false; // data:, https:, blob: ...
  return true;
}

function dirOf(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) : '';
}

function normalizeRel(p: string): string | null {
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!parts.pop()) return null;
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
}

const DIST_ADVICE = 'الحل المضمون 100%: نفّذ npm run build على جهازك وارفع مجلد dist الناتج مضغوطاً بزر الموقع الجاهز.';

function toArabicBuildError(rawText: string, entry: string): Error {
  const t = rawText || '';
  const serverDep = t.match(/SERVER_DEP:([^\s"']+)/);
  if (serverDep) {
    return new Error(
      `المشروع يعتمد على «${serverDep[1]}» وهي مكتبة سيرفر (قاعدة بيانات/مصادقة/ملفات) لا تعمل في المتصفح أبداً. ` +
        `الحل: ابنِ نسخة لا تستوردها في الصفحة المعروضة، أو ارفع موقعاً لا يحتاج سيرفراً. ${DIST_ADVICE}`,
    );
  }
  if (/No matching export/i.test(t)) {
    const nm = t.match(/No matching export in "([^"]+)" for import "([^"]+)"/);
    const file = (nm?.[1] || '').replace(/^vfs:/, '');
    const name = nm?.[2] || '';
    if (/reactcomponent/i.test(name)) {
      return new Error(`استيراد غير مدعوم (SVG كمكوّن ReactComponent — يحتاج إضافة Vite). استخدم الصور كروابط <img src={...}> بدل المكوّنات. ${DIST_ADVICE}`);
    }
    return new Error(
      `«${file || entry}» يستورد «${name || 'اسماً'}» وهو غير مصدَّر من الملف المقصود — تحقق من اسم الاستيراد، ` +
        `وإن كانت صفحة الدخول بلا export default فصدّر المكوّن الرئيسي افتراضياً ثم أعد الضغط. ${DIST_ADVICE}`,
    );
  }
  if (/Could not resolve ["']([^"']+)["']/.test(t)) {
    const m = t.match(/Could not resolve ["']([^"']+)["']/);
    const miss = m?.[1] || '';
    if (NODE_BUILTINS.has(miss) || miss.startsWith('node:')) {
      return new Error(`المشروع يستخدم واجهة Node (‎${miss}‎) وهي لا تعمل في المتصفح. ${DIST_ADVICE}`);
    }
    return new Error(`تعذّر العثور على الملف/الحزمة «${miss}» — تحقق أن الملف موجود داخل الأرشيف وأن الحزمة مذكورة في package.json. ${DIST_ADVICE}`);
  }
  if (/import\.meta\.glob|import\.meta\.env\.\w+\(|["']\?raw["']|["']\?url["']/.test(t)) {
    return new Error(`المشروع يستخدم ميزة خاصة بـ Vite (glob/?raw/?url) لا تعمل خارج Vite. ${DIST_ADVICE}`);
  }
  if (/ERROR.*\(.*\.s[ac]ss\)|\.s[ac]ss/.test(t) && /No loader|Could not resolve|ERROR/.test(t)) {
    return new Error(`ملفات SCSS/SASS تحتاج معالجاً خاصاً — حوّلها إلى CSS عادي ثم أعد الرفع. ${DIST_ADVICE}`);
  }
  const first = t.split('\n').slice(0, 4).join('\n');
  return new Error(`فشل بناء المشروع:\n${first}\n${DIST_ADVICE}`);
}

/* ---------------- طبقة توافق Next.js (صفحات عميلة فقط) ---------------- */

/** اعتماديات سيرفر خالص — وجودها يعني المشروع لا يعمل بلا سيرفر */
const SERVER_ONLY_MODULES = new Set([
  'server-only', '@prisma/client', 'prisma', 'sharp', 'next-auth', '@auth/core',
  '@auth/prisma-adapter', 'next/headers', 'next/cache', 'next/og',
  'pg', 'mysql2', 'better-sqlite3', 'ioredis', 'nodemailer',
]);

const NEXT_CLIENT_SHIMS: Record<string, string> = {
  'next/link': `import React from "react";
export default function Link(p) {
  const { href, children, ...rest } = p || {};
  const to = typeof href === "string" ? href : (href && (href.pathname || href.href)) || "#";
  return React.createElement("a", { href: to, ...rest }, children);
}`,
  'next/image': `import React from "react";
export default function Image(p) {
  const { src, alt, fill, priority, loader, quality, placeholder, blurDataURL, ...rest } = p || {};
  const realSrc = typeof src === "string" ? src : (src && (src.src || "")) || "";
  const style = { ...(rest.style || {}) };
  if (fill) { style.position = "absolute"; style.width = "100%"; style.height = "100%"; style.objectFit = style.objectFit || "cover"; }
  return React.createElement("img", { src: realSrc, alt: alt || "", ...rest, style });
}`,
  'next/navigation': `export function useRouter() {
  return {
    push: (u) => { try { window.location.hash = ""; window.location.assign(String(u)); } catch (e) {} },
    replace: (u) => { try { window.location.replace(String(u)); } catch (e) {} },
    back: () => { try { window.history.back(); } catch (e) {} },
    forward: () => { try { window.history.forward(); } catch (e) {} },
    refresh: () => { try { window.location.reload(); } catch (e) {} },
    prefetch: () => {},
  };
}
export function usePathname() { return "/"; }
export function useSearchParams() { return new URLSearchParams(""); }
export function useParams() { return {}; }
export function redirect() { throw new Error("redirect()‎ تحتاج سيرفر Next.js"); }
export function notFound() { throw new Error("notFound()‎ تحتاج سيرفر Next.js"); }
export function permanentRedirect() { throw new Error("permanentRedirect()‎ تحتاج سيرفر Next.js"); }`,
  'next/dynamic': `import { lazy, Suspense, createElement } from "react";
export default function dynamic(factory, opts) {
  const C = lazy(factory);
  return function Dynamic(p) {
    const fb = opts && opts.loading ? opts.loading() : null;
    return createElement(Suspense, { fallback: fb }, createElement(C, p));
  };
}`,
  'next/script': `import { useEffect } from "react";
export default function Script(p) {
  const { src, children, ...rest } = p || {};
  useEffect(() => {
    if (!src) return;
    if (document.querySelector('script[data-next-shim="' + src + '"]')) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.setAttribute("data-next-shim", src);
    document.head.appendChild(s);
  }, [src]);
  return null;
}`,
  'next/head': `import { createPortal } from "react-dom";
export default function Head(p) {
  try {
    return createPortal(p && p.children, document.head);
  } catch (e) {
    return null;
  }
}`,
  'next': `export default {};
export const version = "client-shim";`,
};

/** يولّد shim لخطوط next/font بالأسماء المستوردة فعلاً في المشروع كله */
function fontShimForSpec(names: string[]): { code: string; families: string[] } {
  const uniq = [...new Set(names.filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && n !== 'default' && n !== 'React'))];
  const use = uniq.length ? uniq : ['Inter'];
  const lines = use.map(
    (n) => `export const ${n} = (...a) => ({ className: "", variable: "--font-${n.toLowerCase()}", style: {} });`,
  );
  lines.push(`export default (...a) => ({ className: "", variable: "--font-default", style: {} });`);
  return { code: lines.join('\n'), families: use };
}

/** يمسح كل ملفات الكود مرة واحدة: { 'next/font/google': { exports: Set, families: Set } } */
function collectFontImports(files: Map<string, Uint8Array>): Map<string, { exports: Set<string>; families: Set<string> }> {
  const out = new Map<string, { exports: Set<string>; families: Set<string> }>();
  const dec = new TextDecoder('utf-8');
  const ensure = (spec: string) => {
    let e = out.get(spec);
    if (!e) {
      e = { exports: new Set(), families: new Set() };
      out.set(spec, e);
    }
    return e;
  };
  for (const [p, data] of files) {
    if (!/\.(tsx|ts|jsx|js|mjs)$/i.test(p) || data.length > 300_000) continue;
    let src = '';
    try {
      src = dec.decode(data.subarray(0, 60000));
    } catch {
      continue;
    }
    const re = /import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*from\s*['"]((?:next\/font\/\w+))['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const spec = m[3]!;
      const e = ensure(spec);
      if (m[1] && m[1] !== 'React') e.exports.add(m[1]);
      if (m[2]) {
        for (const part of m[2].split(',')) {
          const [orig, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
          if (orig && /^[A-Za-z_$][\w$]*$/.test(orig)) {
            e.families.add(orig);
            if (alias && /^[A-Za-z_$][\w$]*$/.test(alias) && alias !== 'default') e.exports.add(alias);
            else if (orig !== 'default') e.exports.add(orig);
          }
        }
      }
    }
  }
  return out;
}

function googleFontsLink(families: string[]): string | null {
  const clean = [...new Set(families.map((f) => f.trim()).filter(Boolean))].slice(0, 6);
  if (!clean.length) return null;
  const q = clean.map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700;800`).join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

const TAILWIND_BROWSER_V4 = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
const TAILWIND_PLAY_V3 = 'https://cdn.tailwindcss.com';

/** يكشف Tailwind (v3/v4) من الاعتماديات أو محتوى CSS */
function detectTailwind(
  files: Map<string, Uint8Array>,
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): 3 | 4 | null {
  const ver = (v: unknown) => String(v || '');
  const raw = ver(deps['tailwindcss']) + ' ' + ver(devDeps['tailwindcss']);
  if (/(^|[^0-9])4(\.|$|[^0-9])/.test(raw)) return 4;
  if (/(^|[^0-9])3(\.|$|[^0-9])/.test(raw)) return 3;
  if (raw.trim() && raw.trim() !== '') return 4; // مذكور بلا إصدار واضح — الأحدث هو الغالب
  // احتياط: ابحث في CSS عن توجيهات Tailwind
  const dec = new TextDecoder('utf-8');
  for (const [p, data] of files) {
    if (!p.endsWith('.css') || data.length > 300_000) continue;
    const head = dec.decode(data.subarray(0, 4000));
    if (/@import\s+["']tailwindcss["']|@tailwind\s+\w|@theme\b/.test(head)) return 4;
  }
  return null;
}

/**
 * ينزع من CSS ما لا يعمل في المتصفح (استيرادات حزم عارية وتوجيهات البناء)،
 * ويعيد قائمة ما نُزع للتحذير. النسبي يُترك لـ esbuild.
 */
function stripUnbundeledCss(css: string): { css: string; stripped: string[] } {
  const stripped: string[] = [];
  const lines = css.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*@import\s+["']([^"']+)["']/);
    if (m && !/^(.N?\/|~|#|https?:|data:|blob:)/.test(m[1]!) && !m[1]!.endsWith('.css')) {
      stripped.push(m[1]!);
      continue;
    }
    if (/^\s*@tailwind\s+\w+\s*;?\s*$/.test(line)) {
      stripped.push('@tailwind');
      continue;
    }
    kept.push(line);
  }
  return { css: kept.join('\n'), stripped: [...new Set(stripped)] };
}

function hasServerDirective(src: string): boolean {
  const lines = src.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('import ') || t.startsWith('export ') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
    return /^["']use server["']/.test(t);
  }
  return false;
}

/** سلسلة layout regressively من مجلد الدخول صعوداً (الأبعد أولاً) */
function layoutChain(files: Map<string, Uint8Array>, entryDir: string): string[] {
  const chain: string[] = [];
  let dir = entryDir;
  for (let i = 0; i < 6; i++) {
    for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
      const cand = dir ? `${dir}/layout${ext}` : `layout${ext}`;
      if (files.has(cand)) {
        chain.unshift(cand);
        break;
      }
    }
    if (!dir) break;
    const cut = dir.lastIndexOf('/');
    dir = cut >= 0 ? dir.slice(0, cut) : '';
  }
  return chain;
}

/**
 * معامل esm.sh: نُبقي React خارجياً (استيراد مجرد يلتقطه importmap ← نسخة واحدة)
 * بدل ?deps الذي يعيد بناء الحزمة ونسخها فيكسر التصديرات في بعض الإصدارات.
 */
const CDN_EXTERNAL_PARAM = 'external=react,react-dom,react/jsx-runtime&target=es2020';

/**
 * نسخ بديلة مرشحة لنسخة معطوبة — بالترتيب من الأقرب للأبعد:
 * نفس الإصدار الرئيسي (آخر تصحيح داخله) ثم الأرقام التي تسبقه، وأخيراً الأحدث.
 * الهدف: أقرب نسخة سليمة ممكنة حتى لا تتغير واجهات المكتبة على كود المعلم.
 */
function fallbackVersions(pinned: string): string[] {
  const out: string[] = [];
  const m = /^(\d+)/.exec(pinned);
  const major = m ? Number(m[1]) : NaN;
  if (Number.isFinite(major) && major >= 1) {
    out.push(String(major));
    for (let k = major - 1; k >= Math.max(1, major - 3); k--) out.push(String(k));
  }
  out.push('latest');
  return [...new Set(out)];
}

/**
 * فحص سلامة إصدار على esm.sh.
 * نستخدم ?bundle كفحص: esm.sh يبني الحزمة كاملة فيفشل بخطأ 500 صراحةً إن كان
 * هناك استيراد غير مصدَّر (مثل framer-motion v12 و motion-dom) — بينما الطلب
 * العادي قد يعيد 200 ثم ينهار وقت التشغيل في المتصفح.
 */
export async function urlWorks(url: string, timeoutMs = 20000): Promise<boolean> {
  const probe = url.includes('?') ? `${url}&bundle` : `${url}?bundle`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(probe, { signal: ctrl.signal, headers: { Accept: 'text/javascript,*/*' } });
    if (!res.ok) return false;
    const txt = (await res.text()).slice(0, 300);
    return !/No matching export|Internal Server Error|^\s*$/i.test(txt);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * يفحص روابط CDN ويبدّل أي رابط معطوب (مثل framer-motion v12 الذي يفشل
 * تصديره على esm.sh) بأحدث نسخة سليمة — تلقائياً ودون تدخل من المعلم.
 */
async function healExternalUrls(
  js: string,
  specs: Map<string, { name: string; rest: string; ver: string }>,
  note: (m: string) => void,
): Promise<string> {
  const urls = [...specs.keys()].filter((u) => js.includes(u));
  if (!urls.length) return js;
  const checks = await Promise.all(urls.map(async (u) => ({ u, ok: await urlWorks(u) })));
  let out = js;
  const fixed: string[] = [];
  const broken = new Set<string>();
  for (const { u, ok } of checks) {
    if (ok) continue;
    const meta = specs.get(u)!;
    let healed = false;
    for (const cand of fallbackVersions(meta.ver)) {
      const candidate = `https://esm.sh/${meta.name}@${cand}${meta.rest}?${CDN_EXTERNAL_PARAM}`;
      if (candidate === u) continue;
      if (await urlWorks(candidate)) {
        out = out.split(u).join(candidate);
        fixed.push(`${meta.name}@${meta.ver} ← ${cand}`);
        healed = true;
        break;
      }
    }
    if (!healed) broken.add(meta.name);
  }
  if (fixed.length) note(`استُبدلت نسخ مكتبات معطوبة على CDN تلقائياً: ${fixed.join('، ')}`);
  if (broken.size) note(`تعذّر إيجاد نسخة سليمة على CDN لـ: ${[...broken].join('، ')} — قد يفشل جزء من الموقع`);
  return out;
}

function isPageEntry(entry: string): boolean {
  return /(^|\/)(page|index)\.[jt]sx?$/.test(entry) || /(^|\/)pages\/[^/]+\.[jt]sx?$/.test(entry);
}

/**
 * شفاء روابط الحاويات القديمة عند العرض: بعض إصدارات npm نُشرت معطوبة على
 * esm.sh، والحاوية المحفوظة تحوي الروابط القديمة — نستبدلها في الذاكرة فقط
 * (دون إعادة رفع) فيعمل الدرس مباشرة.
 */
export async function healSourceJs(js: string, note?: (m: string) => void): Promise<string> {
  const urls = [...new Set([...js.matchAll(/https:\/\/esm\.sh\/[A-Za-z0-9@._\-/]+/g)].map((m) => m[0]))];
  if (!urls.length) return js;
  const specs = new Map<string, { name: string; rest: string; ver: string }>();
  for (const u of urls) {
    const m = /^https:\/\/esm\.sh\/(.+?)@([^/?]+)([^?]*)/.exec(u);
    if (!m) continue;
    specs.set(u, { name: m[1]!, rest: m[3] || '', ver: m[2]! });
  }
  if (!specs.size) return js;
  return healExternalUrls(js, specs, (m) => note?.(m));
}

/**
 * يبني الكود المصدري إلى JS+CSS. يتطلب ensureSourceEngine أولاً.
 * أي import لحزمة npm يُعاد توجيهه إلى esm.sh بالإصدار من package.json.
 */
export async function buildSourceBundle(
  prep: Extract<PreparedArchive, { kind: 'source' }>,
  onLog?: (msg: string) => void,
): Promise<SourceBuildResult> {
  const esbuild = await getEsbuild();
  const { files, entry, packageJson } = prep;
  const log = (m: string) => onLog?.(m);
  const deps: Record<string, string> = {
    ...((packageJson.dependencies || {}) as Record<string, string>),
    ...((packageJson.peerDependencies || {}) as Record<string, string>),
  };
  const reactVersion = cleanVersion(deps['react'], '18.3.1');
  const reactDomVersion = cleanVersion(deps['react-dom'], reactVersion);
  if (!deps['react']) {
    prep.warnings.push('لم تُذكر react في dependencies — استُخدمت 18.3.1 افتراضياً');
  }
  const dec = new TextDecoder('utf-8');
  const enc = new TextEncoder();
  const textOf = (p: string): string | null => {
    const b = files.get(p);
    return b ? dec.decode(b) : null;
  };

  // فحص مبكر: Server Actions لا تعمل في المتصفح أبداً
  for (const [p, data] of files) {
    if (!/\.(tsx|ts|jsx|js)$/i.test(p) || data.length > 300_000) continue;
    let head = '';
    try {
      head = dec.decode(data.subarray(0, 4000));
    } catch {
      continue;
    }
    if (hasServerDirective(head)) {
      throw new Error(
        `الملف ${p} يستخدم "use server" (Server Actions) — تُنفَّذ على سيرفر Next.js فقط ولا تعمل في المتصفح أبداً. الحل: انقل المنطق التفاعلي إلى مكوّن عميل ("use client") أو ارفع نسخة لا تعتمد على السيرفر.`,
      );
    }
  }

  // تحذير مبكر: متغيرات VITE_* لن تُعرَّف
  const viteVars = new Set<string>();
  for (const [p, data] of files) {
    if (!/\.(tsx|ts|jsx|js)$/i.test(p) || data.length > 300_000) continue;
    const src = dec.decode(data);
    const re = /import\.meta\.env\.(VITE_[A-Za-z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) viteVars.add(m[1]!);
  }
  if (viteVars.size) {
    prep.warnings.push(`متغيرات البيئة لن تعمل (${[...viteVars].slice(0, 3).join('، ')}) — ضع قيمها مباشرة في الكود`);
  }

  // Tailwind: يُكتشف هنا ويُعالَج CSS لاحقاً ويُحقن محركه في صفحة العرض
  const devDeps = (packageJson.devDependencies || {}) as Record<string, string>;
  const tailwind = detectTailwind(files, deps, devDeps);
  const strippedCssImports: string[] = [];
  const collectedFonts: string[] = [];
  const fontImportMap = collectFontImports(files);

  // نقطة الدخول: صفحة Next لا تستدعي render بنفسها — نغلّفها تلقائياً
  // (مع سلسلة layout للآثار الجانبية: CSS والخطوط) وإلا تُستخدم كما هي.
  const vfs = new Map(files);
  const entrySrc = textOf(entry) || '';
  const selfRendering = /createRoot|hydrateRoot|ReactDOM\s*\.\s*render/.test(entrySrc);
  let buildEntry = entry;
  let autoEntry = false;
  if (!selfRendering && isPageEntry(entry)) {
    const layouts = layoutChain(files, dirOf(entry));
    const lines = layouts.map((l) => `import "./${l}";`);
    lines.push(`import Page from "./${entry}";`);
    lines.push(`import React from "react";`);
    lines.push(`import { createRoot } from "react-dom/client";`);
    lines.push(`createRoot(document.getElementById("root")).render(React.createElement(Page));`);
    vfs.set('__srcbundle_auto_entry__.tsx', enc.encode(lines.join('\n')));
    buildEntry = '__srcbundle_auto_entry__.tsx';
    autoEntry = true;
    if (layouts.length) {
      prep.warnings.push(`أُدرجت سلسلة الهيكل تلقائياً (${layouts.join(' ← ')}) للأنماط والخطوط`);
    }
  }

  const tryResolveFile = (base: string): string | null => {
    for (const ext of TRY_EXTS) {
      const cand = normalizeRel(base + ext);
      if (cand && vfs.has(cand)) return cand;
    }
    for (const idx of INDEX_FILES) {
      const cand = normalizeRel(base + '/' + idx);
      if (cand && vfs.has(cand)) return cand;
    }
    return null;
  };

  const resolveTsPath = (spec: string): string | null => {
    for (const rule of prep.tsPaths) {
      let rest: string | null = null;
      if (!rule.star) {
        if (spec !== rule.prefix) continue;
        rest = '';
      } else {
        if (!spec.startsWith(rule.prefix)) continue;
        if (rule.suffix && !spec.endsWith(rule.suffix)) continue;
        rest = spec.slice(rule.prefix.length, rule.suffix ? spec.length - rule.suffix.length : spec.length);
      }
      for (const target of rule.targets) {
        const mapped = target.replace(/\*/g, rest).replace(/\\/g, '/');
        const base = prep.baseUrl ? `${prep.baseUrl}/${mapped}` : mapped;
        const hit = tryResolveFile(base);
        if (hit) return hit;
      }
    }
    return null;
  };

  const warnings = [...prep.warnings];

/**
   * روابط CDN: react تُترك مجردة (importmap) لضمان نسخة واحدة، وباقي الحزم
   * تُبنى بنسخة موحّدة مع external لـ react.
   */
  const EXTERNAL_REACT_PARAM = CDN_EXTERNAL_PARAM;
  const externalSpecs = new Map<string, { name: string; rest: string; ver: string }>();

  const esmUrlFor = (spec: string): string => {
    const { name, rest } = splitBare(spec);
    const ver = cleanVersion(deps[name], name === 'react' ? reactVersion : name === 'react-dom' ? reactDomVersion : 'latest');
    if (name === 'react') return `https://esm.sh/react@${ver}${rest}`;
    if (name === 'react-dom') {
      return `https://esm.sh/react-dom@${ver}${rest}${rest ? `?${EXTERNAL_REACT_PARAM}` : ''}`;
    }
    if (!deps[name]) warnings.push(`الحزمة «${name}» غير مذكورة في dependencies — استُخدمت أحدث نسخة وقد تختلف عن مشروعك`);
    const url = `https://esm.sh/${name}@${ver}${rest}?${EXTERNAL_REACT_PARAM}`;
    externalSpecs.set(url, { name, rest, ver });
    return url;
  };

  const plugin: esbuildTypes.Plugin = {
    name: 'vfs-source',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args: any) => {
        const spec: string = args.path;
        // نقطة الدخول
        if (args.kind === 'entry-point' || !args.importer) {
          const hit = tryResolveFile(spec.replace(/^vfs:/, ''));
          if (hit) return { path: hit, namespace: 'vfs' };
          return { errors: [{ text: `تعذّر العثور على ملف الدخول «${entry}»` }] };
        }
        // نسبي
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const importerPath = String(args.importer).replace(/^vfs:/, '');
          const base = dirOf(importerPath);
          const joined = normalizeRel((base ? base + '/' : '') + spec);
          const hit = joined ? tryResolveFile(joined) : null;
          if (hit) return { path: hit, namespace: 'vfs' };
          return { errors: [{ text: `Could not resolve "${spec}"` }] };
        }
        // مطلق من الجذر
        if (spec.startsWith('/')) {
          const hit = tryResolveFile(spec.slice(1));
          if (hit) return { path: hit, namespace: 'vfs' };
          return { errors: [{ text: `Could not resolve "${spec}"` }] };
        }
        // خارجي (روابط/بيانات)
        if (!isBareSpecifier(spec)) return { path: spec, external: true };
        // مسارات tsconfig (@/...)
        const mapped = resolveTsPath(spec);
        if (mapped) return { path: mapped, namespace: 'vfs' };
        // مكتبات السيرفر الخالص ← خطأ عربي واضح بدل فشل غامض
        const { name } = splitBare(spec);
        if (NODE_BUILTINS.has(name) || name.startsWith('node:')) {
          return { errors: [{ text: `Node builtin "${spec}" لا يعمل في المتصفح` }] };
        }
        if (SERVER_ONLY_MODULES.has(name) || SERVER_ONLY_MODULES.has(spec)) {
          return { errors: [{ text: `SERVER_DEP:${spec}` }] };
        }
        // محاكيات Next العميلة ← تُقدَّم محلياً بلا شبكة
        if (
          spec === 'next' || spec === 'next/link' || spec === 'next/image' ||
          spec === 'next/navigation' || spec === 'next/dynamic' ||
          spec === 'next/script' || spec === 'next/head' ||
          spec.startsWith('next/font/')
        ) {
          return { path: spec, namespace: 'next-shim' };
        }
        // حزمة npm ← esm.sh
        return { path: esmUrlFor(spec), external: true };
      });

      build.onLoad({ filter: /.*/, namespace: 'next-shim' }, (args: any) => {
        const spec: string = String(args.path);
        if (spec.startsWith('next/font/')) {
          // ملاحظة: onLoad لا يستقبل المستورِد — الأسماء جُمعت مسبقاً من كل الملفات
          const found = fontImportMap.get(spec);
          const { code, families } = fontShimForSpec([
            ...(found ? [...found.exports] : []),
            ...(spec === 'next/font/google' && !found ? ['Inter'] : []),
          ]);
          const fams = found && found.families.size ? [...found.families] : families;
          for (const fam of fams) {
            if (!collectedFonts.includes(fam)) collectedFonts.push(fam);
          }
          if (spec !== 'next/font/google') {
            warnings.push(`خطوط محلية (${spec}) استُبدلت بفراغ — ارفع الخط كملف أو استخدم Google Fonts`);
          }
          return { contents: code, loader: 'jsx' as any };
        }
        const shim = NEXT_CLIENT_SHIMS[spec];
        if (shim) return { contents: shim, loader: 'jsx' as any };
        return { errors: [{ text: `وحدة Next غير مدعومة في المتصفح: ${spec}` }] };
      });

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args: any) => {
        const p: string = String(args.path).replace(/^vfs:/, '');
        const data = vfs.get(p);
        if (!data) return { errors: [{ text: `الملف غير موجود في الحزمة: ${p}` }] };
        const ext = (p.split('.').pop() || '').toLowerCase();
        if (ext === 'css' && p.endsWith('.module.css')) {
          if (tailwind && /@apply|@tailwind/.test(dec.decode(data.subarray(0, 8000)))) {
            warnings.push(`ملف ${p} يستخدم @apply — عُولج جزئياً فقط`);
          }
          return { contents: data, loader: 'local-css' as any };
        }
        if (ext === 'css' && tailwind) {
          let text = dec.decode(data);
          const stripped = stripUnbundeledCss(text);
          text = stripped.css;
          for (const s of stripped.stripped) {
            if (!strippedCssImports.includes(s)) strippedCssImports.push(s);
          }
          return { contents: text, loader: 'css' as any };
        }
        const loader = TEXT_LOADER[ext];
        if (loader) {
          return { contents: dec.decode(data), loader: loader as any };
        }
        if (BINARY_EXTS.has(ext)) {
          if (data.length > SOURCE_LIMITS.maxInlineAssetBytes) {
            warnings.push(`الملف الكبير أُستبعد: ${p} (${Math.round(data.length / 1024)}KB) — صغّره لأقل من 512KB`);
            return { contents: 'export default "";', loader: 'js' as any };
          }
          return { contents: data, loader: 'dataurl' as any };
        }
        if (ext === 'scss' || ext === 'sass' || ext === 'less') {
          return { errors: [{ text: `ملفات ${ext.toUpperCase()} تحتاج معالجاً خاصاً: ${p} — حوّلها إلى CSS` }] };
        }
        if (ext === 'wasm') {
          return { errors: [{ text: `ملفات WASM الثنائية غير مدعومة في هذا الوضع: ${p}` }] };
        }
        return { errors: [{ text: `امتداد غير مدعوم: ${p}` }] };
      });
    },
  };

  log(autoEntry ? 'بدء البناء (بتغليف تلقائي للصفحة)…' : 'بدء البناء…');
  let result: esbuildTypes.BuildResult;
  try {
    result = await esbuild.build({
      entryPoints: [buildEntry],
      bundle: true,
      format: 'esm',
      minify: true,
      jsx: 'automatic',
      target: 'es2020',
      platform: 'browser',
      write: false,
      outfile: 'app.bundle.js', // اسم وهمي ليعرف أين يضع CSS — لا يُكتب شيء (write:false)
      logLevel: 'silent',
      define: {
        'process.env.NODE_ENV': '"production"',
        'import.meta.env.MODE': '"production"',
        'import.meta.env.PROD': 'true',
        'import.meta.env.DEV': 'false',
        'import.meta.env.SSR': 'false',
        global: 'globalThis',
      },
      loader: {
        '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl',
        '.gif': 'dataurl', '.webp': 'dataurl', '.avif': 'dataurl',
        '.svg': 'dataurl', '.ico': 'dataurl',
        '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl',
        '.otf': 'dataurl', '.eot': 'dataurl',
        '.mp3': 'dataurl', '.ogg': 'dataurl', '.wav': 'dataurl',
        '.mp4': 'dataurl', '.webm': 'dataurl',
      },
      plugins: [plugin],
    });
  } catch (e: any) {
    const texts = Array.isArray(e?.errors) ? e.errors.map((x: any) => x?.text || '').join('\n') : String(e?.message || e);
    throw toArabicBuildError(texts, entry);
  }
  const jsFile = (result.outputFiles || []).find((f) => f.path.endsWith('.js'));
  const cssFile = (result.outputFiles || []).find((f) => f.path.endsWith('.css'));
  if (!jsFile) throw new Error(`فشل البناء: لا ناتج JS. ${DIST_ADVICE}`);
  const js = new TextDecoder('utf-8').decode(jsFile.contents);
  const css = cssFile ? new TextDecoder('utf-8').decode(cssFile.contents) : '';
  // استيرادات ديناميكية لحزم عارية ستنكسر وقت التشغيل — نبّه مبكراً
  const dynBare = [...js.matchAll(/import\(\s*["']([^"'./][^"']*)["']\s*\)/g)].map((m) => m[1]);
  if (dynBare.length) {
    warnings.push(`استيرادات ديناميكية لحزم (${[...new Set(dynBare)].slice(0, 3).join('، ')}) قد لا تعمل — الأفضل استيراد ثابت`);
  }
  if (strippedCssImports.length) {
    warnings.push(`حُذف من CSS ما يحتاج بناءً خارجياً (${strippedCssImports.slice(0, 3).join('، ')}) — التصميم الأساسي يعمل وبعض الإضافات قد تغيب`);
  }
  // شفاء روابط CDN المعطوبة (نسخة منشورة خاطئة) باستبدالها بنسخة سليمة
  const healedJs = await healExternalUrls(js, externalSpecs, (m) => warnings.push(m));
  const sizes = {
    js: jsFile.contents.length,
    css: cssFile ? cssFile.contents.length : 0,
    total: jsFile.contents.length + (cssFile ? cssFile.contents.length : 0),
  };
  log('اكتمل البناء ✓');
  return { js: healedJs, css, entry, deps, reactVersion, reactDomVersion, warnings, sizes, tailwind, fonts: collectedFonts, autoEntry, strippedCssImports };
}

/* ---------------- الحاوية المضغوطة للتخزين ---------------- */

async function gzipBytes(data: Uint8Array): Promise<Uint8Array> {
  const gz = (globalThis as any).CompressionStream
    ? new (globalThis as any).CompressionStream('gzip')
    : null;
  if (!gz) throw new Error('المتصفح لا يدعم الضغط — حدّث المتصفح وحاول مجدداً');
  const buf = await new Response(
    new Blob([data as unknown as BlobPart]).stream().pipeThrough(gz),
  ).arrayBuffer();
  return new Uint8Array(buf);
}

export async function gunzipBytes(data: Uint8Array): Promise<Uint8Array> {
  return gunzipBuffer(data);
}

function fallbackHashHex(data: Uint8Array): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i]!;
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, '0');
}

export async function hashBytes(data: Uint8Array): Promise<string> {
  try {
    const subtle = (globalThis as any)?.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest('SHA-256', data as unknown as BufferSource);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* احتياطي */
  }
  return 'fnv1a-' + fallbackHashHex(data);
}

/**
 * يغلّف الناتج في حاوية واحدة مضغوطة gzip (ثنائية — بلا base64).
 * يرفض ما تجاوز 1MB بعد الضغط مع شرح الحجم وطرق التقليل.
 */
export async function packSourceContainer(res: SourceBuildResult): Promise<{
  bytes: Uint8Array;
  hash: string;
  container: SourceContainer;
}> {
  const enc = new TextEncoder();
  const hash = await hashBytes(enc.encode(res.js + ' ' + res.css));
  const container: SourceContainer = {
    v: 1,
    kind: 'src',
    entry: res.entry,
    js: res.js,
    css: res.css,
    deps: res.deps,
    hash,
    builtAt: new Date().toISOString(),
    sizes: { js: res.sizes.js, css: res.sizes.css, total: res.sizes.total, gz: 0 },
    warnings: res.warnings.slice(0, 5),
    tailwind: res.tailwind,
    fonts: res.fonts.slice(0, 6),
  };
  const bytes = await gzipBytes(enc.encode(JSON.stringify(container)));
  container.sizes.gz = bytes.length;
  if (bytes.length > SOURCE_LIMITS.maxContainerBytes) {
    const kb = (n: number) => Math.round(n / 1024);
    throw new Error(
      `الناتج بعد الضغط ${kb(bytes.length)}KB يتجاوز الحد ${SOURCE_LIMITS.maxContainerBytes / 1024}KB ` +
        `(JS: ${kb(container.sizes.js)}KB، CSS: ${kb(container.sizes.css)}KB). ` +
        'قلّصه: احذف الصور الكبيرة من الكود، قلّل المكتبات الخارجية، أو ارفع dist المبني بدل الخام.',
    );
  }
  return { bytes, hash, container };
}

export async function unpackSourceContainer(bytes: Uint8Array): Promise<SourceContainer> {
  const raw = await gunzipBytes(bytes);
  const parsed = JSON.parse(new TextDecoder('utf-8').decode(raw));
  if (!parsed || parsed.v !== 1 || parsed.kind !== 'src' || typeof parsed.js !== 'string') {
    throw new Error('ملف الحاوية تالف — أعد رفع المشروع');
  }
  return parsed as SourceContainer;
}

/* ---------------- قالب العرض المعزول (srcdoc) ---------------- */

function escapeForScript(s: string, tag: 'script' | 'style'): string {
  return tag === 'script'
    ? s.replace(/<\/script/gi, '<\\/script')
    : s.replace(/<\/style/gi, '<\\/style');
}

const ERROR_BRIDGE = `(function(){function send(m,s){try{parent.postMessage({__srcbundle:1,type:'error',message:String(m).slice(0,500),source:String(s||'').slice(0,200)},'*')}catch(e){}}window.addEventListener('error',function(e){var t=e&&e.target;if(t&&t!==window&&(t.src||t.href)){send('تعذر تحميل مورد: '+((t.src||t.href)||''),'resource');return}send((e&&(e.message||(e.error&&e.error.message)))||'خطأ غير معروف','runtime')},true);window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;send((r&&(r.message||r))||'وعد مرفوض','promise')});window.__srcReady=false;})();`;

/**
 * يبني صفحة srcdoc كاملة: جسر الأخطاء + خطوط Google + Tailwind + importmap + CSS + JS.
 * تُعرض داخل iframe بخاصية sandbox="allow-scripts" فقط.
 */
export function buildSourceSrcdoc(input: {
  js: string;
  css: string;
  reactVersion: string;
  reactDomVersion?: string;
  title?: string;
  tailwind?: 3 | 4 | null;
  fonts?: string[];
}): string {
  const rv = input.reactVersion || '18.3.1';
  const dv = input.reactDomVersion || rv;
  const map = {
    imports: {
      react: `https://esm.sh/react@${rv}`,
      'react/jsx-runtime': `https://esm.sh/react@${rv}/jsx-runtime`,
      'react-dom': `https://esm.sh/react-dom@${dv}?deps=react@${rv}`,
      'react-dom/client': `https://esm.sh/react-dom@${dv}/client?deps=react@${rv}`,
      scheduler: 'https://esm.sh/scheduler',
    },
  };
  const title = (input.title || 'المحتوى التفاعلي').replace(/</g, '‹');
  const fontsLink = googleFontsLink(input.fonts || []);
  const tw = input.tailwind === 3 || input.tailwind === 4 ? input.tailwind : null;
  const twScript = tw === 4 ? TAILWIND_BROWSER_V4 : tw === 3 ? TAILWIND_PLAY_V3 : null;
  const bodyFont =
    input.fonts && input.fonts.length
      ? ` style="font-family:'${input.fonts.slice(0, 2).join("','")}',system-ui,sans-serif"`
      : '';
  return (
    '<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${title}</title>\n` +
    (fontsLink ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="${fontsLink}">\n` : '') +
    (twScript ? `<script src="${twScript}"></script>\n` : '') +
    `<script>${ERROR_BRIDGE}</script>\n` +
    `<script type="importmap">${JSON.stringify(map)}</script>\n` +
    (input.css
      ? tw
        ? `<style type="text/tailwindcss">${escapeForScript(input.css, 'style')}</style>\n`
        : `<style>${escapeForScript(input.css, 'style')}</style>\n`
      : '') +
    '</head>\n' +
    `<body${bodyFont}>\n<div id="root"></div>\n` +
    `<script type="module">${escapeForScript(input.js, 'script')}</script>\n` +
    '</body>\n</html>'
  );
}

export const ESBUILD_WASM_CDN = 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.28.2/esbuild.wasm';

/** صفحة دخول الموقع الجاهز (الأقرب للجذر) — لعرض معلومات حزمة dist */
export function findSiteEntry(files: Map<string, Uint8Array>): string {
  const htmls = [...files.keys()].filter((p) => {
    const e = p.split('.').pop()!.toLowerCase();
    return e === 'html' || e === 'htm';
  });
  const scored = htmls.map((p) => {
    const base = p.split('/').pop()!.toLowerCase();
    return { p, score: (base === 'index.html' ? 0 : 1) * 100 + (p.split('/').length - 1) };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.p || '';
}

/* ---------------- عمليات التخزين (رفع/حذف/حصة) ---------------- */

/** اسم ملف الحاوية من اسم الأرشيف الأصلي */
export function sourceContainerName(archiveName: string): string {
  const base = archiveName.replace(/\.(zip|tar\.gz|tgz|tar)$/i, '').replace(/[^\w.\-()\[\] ]+/g, '_').slice(0, 80) || 'source-app';
  return `${base}.srcbundle.gz`;
}

/**
 * رفع الحاوية المضغوطة (ثنائية — بلا base64) رفعاً مباشراً إلى ImageKit.
 * يُعيد رابط التخزين الدائم. يقبل مساراً بديلاً عبر السيرفر للملفات الصغيرة.
 */
export function uploadSourceContainer(
  bytes: Uint8Array,
  archiveName: string,
  onProgress?: (percent: number) => void,
  fallbackUploader?: (file: File) => Promise<{ url: string }>,
): Promise<{ url: string; fileId: string; viaFallback?: boolean; directError?: string }> {
  const file = new File([bytes as unknown as BlobPart], sourceContainerName(archiveName), { type: 'application/gzip' });
  return uploadBundleDirect(file, '/ard-al-lughah/bundles', onProgress, fallbackUploader);
}

/** حذف ملف مخزّن قديم (يتيم) — الأفضل فقط، لا يفشل التدفق إن تعذّر */
export async function deleteStoredUrl(url?: string | null): Promise<boolean> {
  if (!url) return true;
  try {
    const res = await fetch('/api/teacher/upload', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type StorageUsageEntry = {
  accountId: string;
  supported: boolean;
  usedBytes?: number;
  limitBytes?: number;
};

/** قراءة حصة التخزين (استشارية — قد لا تدعمها الخطة) */
export async function fetchStorageUsage(): Promise<StorageUsageEntry[]> {
  try {
    const res = await fetch('/api/teacher/storage-usage', { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return Array.isArray(data?.usage) ? data.usage : [];
  } catch {
    return [];
  }
}
