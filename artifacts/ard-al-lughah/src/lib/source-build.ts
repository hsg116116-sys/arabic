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
  type BundleKind,
} from './site-bundle';

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

const ENTRY_CANDIDATES = [
  'src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts',
  'src/App.tsx', 'main.tsx', 'main.ts', 'index.tsx', 'index.ts', 'App.tsx',
  'src/main.jsx', 'src/index.jsx', 'main.jsx', 'index.jsx',
];

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
  // 4) مصدر؟ (package.json أو tsconfig أو ملفات src)
  const pkg = readJsonFile(files, 'package.json');
  const hasTsConfig = files.has('tsconfig.json');
  const hasSrc = [...files.keys()].some((p) => /\.(tsx|ts|jsx)$/i.test(p));
  if (!pkg && !hasTsConfig && !hasSrc) {
    const sample = [...files.keys()].slice(0, 6).join('، ');
    throw new Error(
      `تعذّر التعرّف على المشروع — لا index.html (موقع جاهز) ولا package.json/src (كود مصدري). وجدنا: ${sample}. اضغط مجلد المشروع نفسه بصيغة TAR (الأفضل) أو ZIP.`,
    );
  }
  const packageJson = pkg || {};
  const tsconfig = readJsonFile(files, 'tsconfig.json') || {};
  const { baseUrl, paths } = parseTsPaths(tsconfig);
  const entry = ENTRY_CANDIDATES.find((c) => files.has(c));
  if (!entry) {
    throw new Error(
      'تعذّر العثور على ملف الدخول — ضع نقطة البداية في src/main.tsx أو src/index.tsx (أو index.tsx في الجذر) ثم أعد الضغط',
    );
  }
  return { kind: 'source', files, ignored, warnings, entry, packageJson, tsPaths: paths, baseUrl };
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
  if (/Could not resolve ["']([^"']+)["']/.test(t)) {
    const m = t.match(/Could not resolve ["']([^"']+)["']/);
    const miss = m?.[1] || '';
    if (NODE_BUILTINS.has(miss) || miss.startsWith('node:')) {
      return new Error(`المشروع يستخدم واجهة Node (‎${miss}‎) وهي لا تعمل في المتصفح. ${DIST_ADVICE}`);
    }
    return new Error(`تعذّر العثور على الملف/الحزمة «${miss}» — تحقق أن الملف موجود داخل الأرشيف وأن الحزمة مذكورة في package.json. ${DIST_ADVICE}`);
  }
  if (/No matching export/.test(t)) {
    return new Error(`استيراد غير مدعوم (غالباً SVG كمكوّن ReactComponent — يحتاج إضافة Vite). استخدم الصور كروابط <img src={...}> بدل المكوّنات. ${DIST_ADVICE}`);
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
  const textOf = (p: string): string | null => {
    const b = files.get(p);
    return b ? dec.decode(b) : null;
  };

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

  const tryResolveFile = (base: string): string | null => {
    for (const ext of TRY_EXTS) {
      const cand = normalizeRel(base + ext);
      if (cand && files.has(cand)) return cand;
    }
    for (const idx of INDEX_FILES) {
      const cand = normalizeRel(base + '/' + idx);
      if (cand && files.has(cand)) return cand;
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

  const esmUrlFor = (spec: string): string => {
    const { name, rest } = splitBare(spec);
    const ver = cleanVersion(deps[name], name === 'react' ? reactVersion : name === 'react-dom' ? reactDomVersion : 'latest');
    const fam = name === 'react' || name === 'react-dom';
    if (name === 'react') return `https://esm.sh/react@${ver}${rest}`;
    if (name === 'react-dom') return `https://esm.sh/react-dom@${ver}${rest}?deps=react@${reactVersion}`;
    if (!deps[name]) warnings.push(`الحزمة «${name}» غير مذكورة في dependencies — استُخدمت أحدث نسخة وقد تختلف عن مشروعك`);
    const pin = `?deps=react@${reactVersion},react-dom@${reactDomVersion}`;
    return `https://esm.sh/${name}@${ver}${rest}${pin}`;
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
        // Node المدمجة ← خطأ واضح
        const { name } = splitBare(spec);
        if (NODE_BUILTINS.has(name) || name.startsWith('node:')) {
          return { errors: [{ text: `Node builtin "${spec}" لا يعمل في المتصفح` }] };
        }
        // حزمة npm ← esm.sh
        return { path: esmUrlFor(spec), external: true };
      });

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args: any) => {
        const p: string = String(args.path).replace(/^vfs:/, '');
        const data = files.get(p);
        if (!data) return { errors: [{ text: `الملف غير موجود في الحزمة: ${p}` }] };
        const ext = (p.split('.').pop() || '').toLowerCase();
        if (ext === 'css' && p.endsWith('.module.css')) {
          return { contents: data, loader: 'local-css' as any };
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

  log('بدء البناء…');
  let result: esbuildTypes.BuildResult;
  try {
    result = await esbuild.build({
      entryPoints: [entry],
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
  const sizes = {
    js: jsFile.contents.length,
    css: cssFile ? cssFile.contents.length : 0,
    total: jsFile.contents.length + (cssFile ? cssFile.contents.length : 0),
  };
  log('اكتمل البناء ✓');
  return { js, css, entry, deps, reactVersion, reactDomVersion, warnings, sizes };
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
 * يبني صفحة srcdoc كاملة: جسر الأخطاء + importmap مثبّت + CSS + JS.
 * تُعرض داخل iframe بخاصية sandbox="allow-scripts" فقط.
 */
export function buildSourceSrcdoc(input: {
  js: string;
  css: string;
  reactVersion: string;
  reactDomVersion?: string;
  title?: string;
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
  return (
    '<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${title}</title>\n` +
    `<script>${ERROR_BRIDGE}</script>\n` +
    `<script type="importmap">${JSON.stringify(map)}</script>\n` +
    (input.css ? `<style>${escapeForScript(input.css, 'style')}</style>\n` : '') +
    '</head>\n<body>\n<div id="root"></div>\n' +
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

/** هل هذا الرابط حاوية كود مصدري مبني؟ */
export function isSourceBundleUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.srcbundle\.gz(\?|#|$)/i.test(url);
}

/* ---------------- عمليات التخزين (رفع/حذف/حصة) ---------------- */

/** اسم ملف الحاوية من اسم الأرشيف الأصلي */
export function sourceContainerName(archiveName: string): string {
  const base = archiveName.replace(/\.(zip|tar\.gz|tgz|tar)$/i, '').replace(/[^\w.\-()\[\] ]+/g, '_').slice(0, 80) || 'source-app';
  return `${base}.srcbundle.gz`;
}

/**
 * رفع الحاوية المضغوطة (ثنائية — بلا base64) رفعاً مباشراً إلى ImageKit.
 * يُعيد رابط التخزين الدائم.
 */
export function uploadSourceContainer(
  bytes: Uint8Array,
  archiveName: string,
  onProgress?: (percent: number) => void,
): Promise<{ url: string; fileId: string }> {
  const file = new File([bytes as unknown as BlobPart], sourceContainerName(archiveName), { type: 'application/gzip' });
  return uploadBundleDirect(file, '/ard-al-lughah/bundles', onProgress);
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
