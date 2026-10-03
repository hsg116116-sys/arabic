/* ============================================================================
   منظومة المواقع المضغوطة — ZIP / TAR / TAR.GZ / TGZ
   ----------------------------------------------------------------------------
   الفكرة: المعلم يرفع أرشيفاً (موقع كامل: html + css + js + json + صور) إلى
   ImageKit كملف واحد، والطالب يفكّه متصفحُه محلياً ويعرضه — بلا أي استهلاك
   من قاعدة البيانات وبلا حاجة لاستضافة خارجية.

   بلا اعتماديات خارجية: فك ZIP (stored/deflated) وفك TAR وفك GZIP يعتمد على
   محلّل مكتوب يدوياً + DecompressionStream الأصلية في المتصفح.
   ============================================================================ */

export type BundleKind = 'zip' | 'tar' | 'tgz';

export type BundleFile = {
  data: Uint8Array;
  size: number;
  isText: boolean;
  textCache?: string;
};

export type SiteBundle = {
  kind: BundleKind;
  files: Map<string, BundleFile>;
  entry: string;
  warnings: string[];
  totalBytes: number;
};

export type BuiltSite = {
  html: string;
  entry: string;
  kind: BundleKind;
  fileCount: number;
  totalKB: number;
  warnings: string[];
  revoke: () => void;
};

export const BUNDLE_LIMITS = {
  maxFiles: 2000,
  maxTotalBytes: 100 * 1024 * 1024, // 100MB بعد الفك
  maxSingleBytes: 30 * 1024 * 1024, // 30MB للملف الواحد
  maxDirectMB: 100, // الرفع المباشر إلى ImageKit
} as const;

const TEXT_EXTS = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'jsx', 'tsx', 'ts',
  'json', 'svg', 'xml', 'txt', 'md', 'csv', 'map', 'webmanifest', 'vtt', 'srt',
]);

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html;charset=utf-8',
  htm: 'text/html;charset=utf-8',
  css: 'text/css;charset=utf-8',
  js: 'text/javascript;charset=utf-8',
  mjs: 'text/javascript;charset=utf-8',
  cjs: 'text/javascript;charset=utf-8',
  json: 'application/json;charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  pdf: 'application/pdf',
  xml: 'application/xml',
  txt: 'text/plain;charset=utf-8',
  webmanifest: 'application/manifest+json',
  map: 'application/json;charset=utf-8',
};

/** مسار الملف بلا استعلام/ frag */
function urlPath(url: string): string {
  return String(url).split('?')[0]!.split('#')[0]!;
}

/** اسم الملف الأخير من الرابط (بدون المجلدات) */
function urlFileName(url: string): string {
  const p = urlPath(url);
  return p.slice(p.lastIndexOf('/') + 1);
}

/**
 * هل هذا الرابط حزمة موقع مضغوطة؟ (امتداد zip/tar/tgz في اسم الملف)
 * ملاحظة: ImageKit يُلحق رمزاً فريداً قبل الامتداد (site.tar_XXXX) —
 * لذلك نتحقق من وجود الامتداد في أي موضع من الاسم لا في نهايته فقط.
 */
export function isBundleUrl(url?: string | null): boolean {
  if (!url) return false;
  if (isSourceBundleUrl(url)) return false;
  // الامتداد يجب أن يكون في آخر اسم الملف (معAllowance لرمز ImageKit قبل .gz)
  return /\.(zip|tar|tgz)([._-][\w-]*)?(\.gz)?$/i.test(urlFileName(url));
}

/**
 * هل هذا الرابط حاوية كود مصدري مبني؟
 * مهم: ImageKit يُلحق رمزاً فريداً قبل الامتداد، فالاسم الحقيقي يصبح
 * «app.srcbundle_XXXX.gz» لا «app.srcbundle.gz» — لذلك نتحقق من وجود
 * الوسم srcbundle في اسم الملف مع انتهاء .gz.
 */
export function isSourceBundleUrl(url?: string | null): boolean {
  if (!url) return false;
  const file = urlFileName(url);
  if (!/\.gz$/i.test(file)) return false;
  return /\.srcbundle(?:[._-][\w-]*)?\.gz$/i.test(file) || /srcbundle/i.test(file);
}

export function extOf(path: string): string {
  const base = path.split('?')[0]!.split('#')[0]!;
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function mimeFor(path: string): string {
  return MIME_BY_EXT[extOf(path)] || 'application/octet-stream';
}

function isTextPath(path: string): boolean {
  return TEXT_EXTS.has(extOf(path));
}

/* ---------------- تنقية المسارات داخل الأرشيف (حماية من Zip-Slip) ---------------- */

function sanitizePath(raw: string): string | null {
  let p = raw.replace(/\\/g, '/').trim();
  p = p.replace(/^\/+/, '').replace(/^\.\/+/, '');
  if (!p || p === '.' || p === '/') return null;
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!parts.pop()) return null; // خروج فوق الجذر — مرفوض
      continue;
    }
    parts.push(seg);
  }
  if (!parts.length) return null;
  return parts.join('/');
}

function isJunkPath(p: string): boolean {
  const lower = p.toLowerCase();
  return (
    lower.startsWith('__macosx/') ||
    lower.includes('/__macosx/') ||
    lower.endsWith('.ds_store') ||
    lower === 'thumbs.db' ||
    lower.endsWith('/thumbs.db') ||
    lower.startsWith('._')
  );
}

/* ---------------- فك الضغط الأصلي ---------------- */

function getDecompressionStream(): any {
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error('المتصفح الحالي لا يدعم فك ضغط الحزم — حدّث المتصفح (Chrome/Edge/Firefox/Safari الحديثة) وحاول مجدداً');
  return DS;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = getDecompressionStream();
  const buf = await new Response(
    new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DS('deflate-raw')),
  ).arrayBuffer();
  return new Uint8Array(buf);
}

/** فك GZIP — مُصدَّرة لخط أنابيب الكود المصدري (source-build). */
export async function gunzipBuffer(data: Uint8Array): Promise<Uint8Array> {
  const DS = getDecompressionStream();
  const buf = await new Response(
    new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DS('gzip')),
  ).arrayBuffer();
  return new Uint8Array(buf);
}

/* ---------------- محلّل ZIP (central directory + دعم stored/deflated) ---------------- */

function readU16LE(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8)) >>> 0;
}
function readU32LE(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

/** محلّل ZIP — مُصدَّر لخط أنابيب الكود المصدري (source-build). */
export async function parseZip(data: Uint8Array, warnings: string[]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder('utf-8');
  // البحث عن EOCD من النهاية (تعليق الأرشيف حتى 64KB)
  let eocd = -1;
  const scanStart = Math.max(0, data.length - 22 - 65535);
  for (let i = data.length - 22; i >= scanStart; i--) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ملف ZIP تالف — تعذّر العثور على نهايته (أعد ضغط المجلد بصيغة ZIP عادية)');
  const totalEntries = readU16LE(data, eocd + 10);
  const cdOffset = readU32LE(data, eocd + 16);
  if (cdOffset >= data.length) throw new Error('ملف ZIP تالف — جدول الملفات خارج النطاق');

  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < totalEntries; n++) {
    if (p + 46 > data.length) break;
    if (readU32LE(data, p) !== 0x02014b50) break; // ليس مدخل دليل مركزي — توقف
    const flags = readU16LE(data, p + 8);
    const method = readU16LE(data, p + 10);
    const compSize = readU32LE(data, p + 20);
    let uncompSize = readU32LE(data, p + 24);
    const nameLen = readU16LE(data, p + 28);
    const extraLen = readU16LE(data, p + 30);
    const commentLen = readU16LE(data, p + 32);
    const localOff = readU32LE(data, p + 42);
    const rawName = dec.decode(data.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (compSize === 0xffffffff || uncompSize === 0xffffffff) {
      throw new Error('الأرشيف بصيغة ZIP64 غير مدعومة — أعد الضغط بأداة عادية (كليك يمين ← ضغط) بدون خيار ZIP64');
    }
    const clean = sanitizePath(rawName);
    if (!clean || rawName.endsWith('/')) continue;
    if (isJunkPath(clean)) continue;
    if (out.has(clean)) continue;
    if (out.size >= BUNDLE_LIMITS.maxFiles) {
      warnings.push(`تجاوز عدد الملفات ${BUNDLE_LIMITS.maxFiles} — أُهملت بقية الملفات`);
      break;
    }
    if (uncompSize > BUNDLE_LIMITS.maxSingleBytes) {
      warnings.push(`أُهمل الملف الضخم: ${clean} (أكبر من 30MB)`);
      continue;
    }
    if (flags & 0x1) {
      warnings.push(`أُهمل الملف المشفّر بكلمة سر: ${clean} (ارفع أرشيفاً بلا كلمة سر)`);
      continue;
    }
    if (localOff + 30 > data.length || readU32LE(data, localOff) !== 0x04034b50) {
      warnings.push(`أُهمل مدخل تالف: ${clean}`);
      continue;
    }
    const lhNameLen = readU16LE(data, localOff + 26);
    const lhExtraLen = readU16LE(data, localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const comp = data.subarray(dataStart, dataStart + compSize);
    if (comp.length < compSize) {
      warnings.push(`أُهمل مدخل ناقص: ${clean}`);
      continue;
    }
    let raw: Uint8Array;
    if (method === 0) raw = comp.slice();
    else if (method === 8) {
      try {
        raw = await inflateRaw(comp);
      } catch {
        warnings.push(`تعذّر فك ضغط: ${clean}`);
        continue;
      }
    } else {
      warnings.push(`أُهمل بضغط غير مدعوم: ${clean} (أعد الضغط بطريقة Deflate العادية)`);
      continue;
    }
    total += raw.length;
    if (total > BUNDLE_LIMITS.maxTotalBytes) throw new Error('حجم الموقع بعد الفك يتجاوز 100MB — قسّمه إلى درسين أو صغّر الصور/الفيديو');
    out.set(clean, raw);
  }
  if (!out.size) throw new Error('الأرشيف فارغ أو بلا ملفات صالحة — تأكد أنك ضغطت محتويات الموقع نفسه');
  return out;
}

/* ---------------- محلّل TAR (ustar / gnu + أسماء طويلة) ---------------- */

/** محلّل TAR — مُصدَّر لخط أنابيب الكود المصدري (source-build). */
export function parseTar(data: Uint8Array, warnings: string[]): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder('utf-8');
  const isZeroBlock = (o: number) => {
    for (let i = 0; i < 512; i++) if (data[o + i] !== 0) return false;
    return true;
  };
  let pendingLongName: string | null = null;
  let total = 0;
  let o = 0;
  while (o + 512 <= data.length) {
    if (isZeroBlock(o)) break; // نهاية الأرشيف
    const nameRaw = dec.decode(data.subarray(o, o + 100)).split('\0')[0]!;
    const sizeRaw = dec.decode(data.subarray(o + 124, o + 136)).split('\0')[0]!.trim();
    const typeflag = String.fromCharCode(data[o + 156]!);
    const prefix = dec.decode(data.subarray(o + 345, o + 500)).split('\0')[0]!;
    const size = sizeRaw ? parseInt(sizeRaw, 8) : 0;
    if (Number.isNaN(size) || size < 0) throw new Error('ملف TAR تالف — ترويسة غير صالحة (أعد إنشاء الأرشيف)');
    const dataStart = o + 512;
    const dataEnd = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd > data.length + 512) throw new Error('ملف TAR ناقص أو تالف — أعد رفعه كاملاً');
    const content = data.subarray(dataStart, Math.min(dataStart + size, data.length));
    o = dataEnd;

    if (typeflag === 'L' || typeflag === 'K') {
      // اسم طويل GNU — ينطبق على المدخل التالي
      pendingLongName = dec.decode(content).split('\0')[0]!;
      continue;
    }
    if (typeflag === 'x' || typeflag === 'g') continue; // ترويسة pax الموسعة — تُتجاهل
    const fullName = pendingLongName || (prefix ? `${prefix}/${nameRaw}` : nameRaw);
    pendingLongName = null;
    if (typeflag === '5' || fullName.endsWith('/')) continue; // مجلد
    if (typeflag === '2' || typeflag === '1') {
      warnings.push(`أُهمل رابط رمزي: ${fullName} (غير مدعوم داخل الحزم)`);
      continue;
    }
    const clean = sanitizePath(fullName);
    if (!clean) continue;
    if (isJunkPath(clean)) continue;
    if (out.has(clean)) continue;
    if (out.size >= BUNDLE_LIMITS.maxFiles) {
      warnings.push(`تجاوز عدد الملفات ${BUNDLE_LIMITS.maxFiles} — أُهملت بقية الملفات`);
      break;
    }
    if (content.length > BUNDLE_LIMITS.maxSingleBytes) {
      warnings.push(`أُهمل الملف الضخم: ${clean} (أكبر من 30MB)`);
      continue;
    }
    total += content.length;
    if (total > BUNDLE_LIMITS.maxTotalBytes) throw new Error('حجم الموقع بعد الفك يتجاوز 100MB — قسّمه إلى درسين أو صغّر الصور/الفيديو');
    out.set(clean, content.slice());
  }
  if (!out.size) throw new Error('الأرشيف فارغ أو تالف أو ليس TAR حقيقياً — أعد إنشاء الأرشيف بصيغة TAR من مجلد الموقع');
  return out;
}

/* ---------------- كشف النوع + استخراج الحزمة ---------------- */

/** كشف نوع الأرشيف من البصمة السحرية ثم الامتداد — مُصدَّر لخط الكود المصدري. */
export function detectKind(buf: Uint8Array, fileName: string): BundleKind | null {
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return 'tgz'; // gzip السحري
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tgz') || lower.endsWith('.tar.gz')) return 'tgz';
  if (lower.endsWith('.tar')) return 'tar';
  // بصمة tar: حقل ustar عند 257
  if (buf.length >= 262) {
    const magic = String.fromCharCode(...buf.subarray(257, 262));
    if (magic === 'ustar') return 'tar';
  }
  return null;
}

function toBundleFiles(raw: Map<string, Uint8Array>): Map<string, BundleFile> {
  const files = new Map<string, BundleFile>();
  for (const [path, data] of raw) {
    files.set(path, { data, size: data.length, isText: isTextPath(path) });
  }
  return files;
}

const depthOf = (p: string) => p.split('/').length - 1;

/** اختيار صفحة الدخول: index.html الأقرب للجذر، وإلا أول html */
function findEntry(files: Map<string, BundleFile>): string {
  const htmls = [...files.keys()].filter((p) => {
    const e = extOf(p);
    return e === 'html' || e === 'htm';
  });
  if (!htmls.length) {
    if (files.has('package.json')) {
      const hasSrc = [...files.keys()].some((p) => /\.(jsx|tsx|ts)$/i.test(p));
      throw new Error(
        'هذه حزمة كود مصدري (React/TypeScript) وليست موقعاً جاهزاً — افتح المشروع على جهازك ونفّذ: npm run build ثم اضغط مجلد dist (أو build) الناتج بصيغة ZIP وارفعه هنا.' +
          (hasSrc ? '' : ' (لم يُعثر على أي صفحة html داخل الأرشيف)'),
      );
    }
    const sample = [...files.keys()].slice(0, 8).join('، ');
    throw new Error(`لا توجد صفحة index.html داخل الأرشيف — ضع ملف index.html في جذر المجلد المضغوط ثم أعد الرفع. (وجدنا: ${sample}${files.size > 8 ? '…' : ''})`);
  }
  const scored = htmls.map((p) => {
    const base = p.split('/').pop()!.toLowerCase();
    return { p, score: (base === 'index.html' ? 0 : base === 'index.htm' ? 1 : 2) * 100 + depthOf(p) };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]!.p;
}

export async function extractSiteBundle(buffer: ArrayBuffer, fileName: string): Promise<SiteBundle> {
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) throw new Error('الملف فارغ — أعد رفعه');
  // نفس حد الفحص المحلي في source-build (مكرر هنا لتفادي استيراد دائري)
  if (bytes.length > 64 * 1024 * 1024) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1);
    throw new Error(
      `حجم الأرشيف ${mb(bytes.length)}MB يتجاوز حد الفحص المحلي (64MB) — اضغطه بصيغة TAR.GZ ثم أعد الرفع`,
    );
  }
  const warnings: string[] = [];
  const kind = detectKind(bytes, fileName);
  if (!kind) {
    throw new Error('صيغة غير مدعومة — ارفع TAR أو TAR.GZ (الأفضل) أو ZIP فقط (ملف HTML المفرد يُرفع بزر ملف HTML)');
  }
  let raw: Map<string, Uint8Array>;
  if (kind === 'zip') {
    raw = await parseZip(bytes, warnings);
  } else if (kind === 'tgz') {
    let tar: Uint8Array;
    try {
      tar = await gunzipBuffer(bytes);
    } catch {
      throw new Error('تعذّر فك ضغط GZIP — الملف تالف أو ليس tar.gz حقيقياً');
    }
    try {
      raw = parseTar(tar, warnings);
    } catch {
      throw new Error('ملف GZIP سليم لكنه ليس أرشيف TAR — اضغط مجلد الموقع كاملاً بصيغة TAR.GZ لا ملفاً واحداً');
    }
  } else {
    raw = parseTar(bytes, warnings);
  }
  const files = toBundleFiles(raw);
  const entry = findEntry(files);
  let totalBytes = 0;
  for (const f of files.values()) totalBytes += f.size;
  return { kind, files, entry, warnings, totalBytes };
}

/* ---------------- بناء صفحة مستقلة قابلة للعرض عبر srcDoc ---------------- */

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i) : '';
}

function normalizeRel(ref: string): string {
  const parts: string[] = [];
  for (const seg of ref.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** يحوّل مرجعاً نسبياً إلى مسار داخل الحزمة — أو null إن كان خارجياً */
export function resolveBundleRef(baseDir: string, ref: string): string | null {
  let s = ref.split('#')[0]!.split('?')[0]!.trim();
  if (!s) return null;
  if (/^(data:|blob:|https?:|wss?:|ftp:|mailto:|tel:|sms:|javascript:|about:|#)/i.test(s)) return null;
  if (s.startsWith('//')) return null;
  if (s.startsWith('/')) s = s.slice(1); // مسار مطلق = من جذر الموقع
  else s = baseDir ? `${baseDir}/${s}` : s;
  s = s.replace(/^\.\//, '');
  const norm = normalizeRel(s);
  if (!norm) return null;
  if (norm === '..' || norm.startsWith('../')) return null;
  return norm;
}

function fileText(f: BundleFile): string {
  if (f.textCache === undefined) f.textCache = new TextDecoder('utf-8').decode(f.data);
  return f.textCache;
}

/** إعادة كتابة url(...) داخل CSS إلى روابط blob */
function rewriteCssUrls(css: string, cssDir: string, getUrl: (path: string) => string | null): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q: string, ref: string) => {
    const target = resolveBundleRef(cssDir, ref);
    if (!target) return m;
    const url = getUrl(target);
    return url ? `url("${url}")` : m;
  });
}

const INTERCEPTOR_TEMPLATE = `(function(){var M=__MAP__,D="__DIR__";function strip(u){return String(u).split("#")[0].split("?")[0].trim()}function norm(p){var o=[];var parts=String(p).split("/");for(var i=0;i<parts.length;i++){var s=parts[i];if(!s||s===".")continue;if(s===".."){o.pop()}else o.push(s)}return o.join("/")}function find(u){try{if(u==null)return null;var s=strip(u);if(!s)return null;if(/^(data:|blob:|https?:|wss?:|ftp:|mailto:|tel:|sms:|javascript:|about:)/i.test(s))return null;if(s.charAt(0)==="#")return null;if(s.slice(0,2)==="//")return null;var c;if(s.charAt(0)==="/"){c=norm(s.slice(1));if(M[c])return M[c]}else{c=norm(s);if(M[c])return M[c];if(D){c=norm(D+"/"+s);if(M[c])return M[c]}}return null}catch(e){return null}}try{var of=window.fetch;window.fetch=function(i,n){try{var u=typeof i==="string"?i:(i&&i.url);var h=find(u);if(h){if(typeof i==="string")return of.call(this,h,n);return of.call(this,new Request(h,i),n)}}catch(e){}return of.apply(this,arguments)}}catch(e){}try{var oo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{var h=find(u);if(h)u=h}catch(e){}return oo.call(this,m,u)}}catch(e){}})();`;

export type BundleBuildOptions = {
  onProgress?: (done: number, total: number) => void;
};

/**
 * يبني نسخة مستقلة من الموقع: سكربتات وCSS الداخلية تُدمج داخل الصفحة،
 * والوسائط (صور/فيديو/خطوط) تتحول إلى blob، وطلبات fetch النسبية (json…)
 * تُعترض وتُوجَّه لملفات الحزمة — فيعمل الموقع كاملاً داخل iframe واحد.
 */
export function buildSiteStandalone(bundle: SiteBundle, _opts?: BundleBuildOptions): BuiltSite {
  const { files, entry } = bundle;
  const warnings = [...bundle.warnings];
  const blobUrls: string[] = [];
  const urlByPath = new Map<string, string>();
  const pageCache = new Map<string, string>();

  const makeBlobUrl = (path: string, data: Uint8Array, mime: string): string => {
    const hit = urlByPath.get(path);
    if (hit) return hit;
    const blob = new Blob([data as unknown as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    urlByPath.set(path, url);
    return url;
  };

  /** رابط أصل (blob) لملف وسائط أو CSS بعد إعادة كتابة مساراته */
  const assetUrl = (path: string): string | null => {
    const f = files.get(path);
    if (!f) return null;
    const hit = urlByPath.get(path);
    if (hit) return hit;
    if (extOf(path) === 'css') {
      const rewritten = rewriteCssUrls(fileText(f), dirOf(path), assetUrl);
      return makeBlobUrl(path, new TextEncoder().encode(rewritten), mimeFor(path));
    }
    return makeBlobUrl(path, f.data, mimeFor(path));
  };

  const rewriteSrcset = (value: string, baseDir: string): string => {
    return value
      .split(',')
      .map((part) => {
        const tokens = part.trim().split(/\s+/);
        const u = tokens[0];
        if (!u) return part;
        const target = resolveBundleRef(baseDir, u);
        const url = target ? assetUrl(target) : null;
        return url ? [url, ...tokens.slice(1)].join(' ') : part;
      })
      .join(', ');
  };

  /** إعادة كتابة سمات الموارد في مستند (تُستخدم للصفحات الثانوية كما هي) */
  const rewriteDocAssets = (doc: Document, baseDir: string): void => {
    const singles: Array<[string, string]> = [
      ['img[src]', 'src'],
      ['source[src]', 'src'],
      ['video[src]', 'src'],
      ['audio[src]', 'src'],
      ['track[src]', 'src'],
      ['embed[src]', 'src'],
      ['video[poster]', 'poster'],
      ['input[type="image"][src]', 'src'],
      ['object[data]', 'data'],
    ];
    for (const [sel, attr] of singles) {
      doc.querySelectorAll(sel).forEach((el) => {
        const v = el.getAttribute(attr);
        if (!v) return;
        const target = resolveBundleRef(baseDir, v);
        if (!target) return;
        const f = files.get(target);
        if (!f) return;
        if (f.isText && extOf(target) !== 'svg') return; // نصوص تُدمج لا تُربط
        el.setAttribute(attr, assetUrl(target)!);
      });
    }
    doc.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
      const v = el.getAttribute('srcset');
      if (v) el.setAttribute('srcset', rewriteSrcset(v, baseDir));
    });
    doc.querySelectorAll('link[rel]').forEach((el) => {
      const rel = (el.getAttribute('rel') || '').toLowerCase();
      if (rel.includes('stylesheet')) return; // تُدمج لاحقاً
      const href = el.getAttribute('href');
      if (!href) return;
      const target = resolveBundleRef(baseDir, href);
      if (!target || !files.get(target)) return;
      el.setAttribute('href', assetUrl(target)!);
    });
  };

  const inlineIntoDoc = (doc: Document, pagePath: string): void => {
    const baseDir = dirOf(pagePath);
    // 1) CSS داخلية ← <style>
    doc.querySelectorAll('link[rel="stylesheet"][href], link[rel="StyleSheet"][href]').forEach((el) => {
      const href = el.getAttribute('href') || '';
      const target = resolveBundleRef(baseDir, href);
      const f = target ? files.get(target) : undefined;
      if (!f || !f.isText) return; // خارجي أو مفقود — يُترك كما هو (CDN يعمل بالشبكة)
      const css = rewriteCssUrls(fileText(f), dirOf(target!), assetUrl);
      const style = doc.createElement('style');
      style.setAttribute('data-bundled', target!);
      style.textContent = css;
      el.replaceWith(style);
    });
    // <style> الموجودة أصلاً: أعد كتابة url(...) فيها
    doc.querySelectorAll('style').forEach((el) => {
      if (el.hasAttribute('data-bundled')) return;
      el.textContent = rewriteCssUrls(el.textContent || '', baseDir, assetUrl);
    });
    // 2) سكربتات داخلية ← تضمين مباشر (يحافظ على الترتيب والتنفيذ)
    doc.querySelectorAll('script[src]').forEach((el) => {
      const src = el.getAttribute('src') || '';
      const target = resolveBundleRef(baseDir, src);
      const f = target ? files.get(target) : undefined;
      if (!f || !f.isText) return; // خارجي (CDN) — يُترك
      const code = fileText(f);
      const inline = doc.createElement('script');
      const type = el.getAttribute('type');
      if (type) inline.setAttribute('type', type);
      if (el.getAttribute('nomodule') != null) inline.setAttribute('nomodule', '');
      inline.textContent = `\n/* bundled: ${target} */\n${code}\n`;
      el.replaceWith(inline);
      // تنبيه: استيرادات نسبية داخل موديول مضمّن لن تعمل — اكتشاف مبكر
      if (type === 'module' && /(^|\n)\s*import\s+[^;]*from\s*['"]\.[^'"]*['"]/.test(code)) {
        warnings.push('تنبيه: سكربت مقسّم يستورد ملفات نسبية — الأفضل بناء الموقع كملف واحد (Vite: vite-plugin-singlefile)');
      }
    });
  };

  const buildPage = (pagePath: string, stack: string[]): string => {
    const cached = pageCache.get(pagePath);
    if (cached) return cached;
    if (stack.includes(pagePath)) {
      // دورة روابط دائرية — رابط blob خام بدل التكرار اللانهائي
      return assetUrl(pagePath) || pagePath;
    }
    const f = files.get(pagePath);
    if (!f) return pagePath;
    const parser = new DOMParser();
    const doc = parser.parseFromString(fileText(f), 'text/html');
    const baseDir = dirOf(pagePath);
    inlineIntoDoc(doc, pagePath);
    rewriteDocAssets(doc, baseDir);
    // روابط الصفحات الداخلية ← بناء مستقل لكل صفحة (مع حماية من الدورات)
    doc.querySelectorAll('a[href]').forEach((el) => {
      const href = el.getAttribute('href') || '';
      if (!href || href.startsWith('#')) return;
      const target = resolveBundleRef(baseDir, href);
      if (!target) return;
      const tf = files.get(target);
      if (!tf) return;
      const e = extOf(target);
      if (e === 'html' || e === 'htm') {
        el.setAttribute('href', buildPageStandaloneBlob(target, [...stack, pagePath]));
      } else if (!tf.isText) {
        el.setAttribute('href', assetUrl(target)!);
      }
    });
    // معترض fetch/XHR لملفات البيانات (json…) — يُزرع أول <head>
    const map: Record<string, string> = {};
    for (const [p] of files) {
      if (urlByPath.has(p)) map[p] = urlByPath.get(p)!;
    }
    // تأكد أن كل ملفات البيانات لها روابط جاهزة للمعترض
    for (const [p, bf] of files) {
      if (!bf.isText && map[p]) continue;
      if (['json', 'txt', 'csv', 'xml', 'webmanifest', 'map'].includes(extOf(p))) {
        map[p] = assetUrl(p)!;
      }
    }
    const interceptor = doc.createElement('script');
    interceptor.setAttribute('data-bundle-interceptor', '1');
    interceptor.textContent = INTERCEPTOR_TEMPLATE.replace('__MAP__', JSON.stringify(map)).replace(
      '__DIR__',
      baseDir.replace(/"/g, ''),
    );
    const head = doc.head || doc.documentElement;
    head.insertBefore(interceptor, head.firstChild);
    const out = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    pageCache.set(pagePath, out);
    return out;
  };

  const buildPageStandaloneBlob = (pagePath: string, stack: string[]): string => {
    const html = buildPage(pagePath, stack);
    return makeBlobUrl(pagePath, new TextEncoder().encode(html), 'text/html;charset=utf-8');
  };

  const html = buildPage(entry, []);
  const revoke = () => {
    for (const u of blobUrls) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* تجاهل */
      }
    }
    blobUrls.length = 0;
    urlByPath.clear();
    pageCache.clear();
  };

  return {
    html,
    entry,
    kind: bundle.kind,
    fileCount: files.size,
    totalKB: Math.round(bundle.totalBytes / 1024),
    warnings,
    revoke,
  };
}

/* ---------------- الجلب + البناء الكامل من رابط ---------------- */

export async function loadBundleHtml(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<BuiltSite> {
  const timeoutMs = opts?.timeoutMs ?? 90000;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`تعذّر تحميل ملف الموقع (خطأ ${res.status}) — تحقق من الرابط أو أعد الرفع`);
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error('ملف الموقع فارغ — أعد الرفع');
    const bundle = await extractSiteBundle(buf, url);
    return buildSiteStandalone(bundle);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('انتهت مهلة تحميل الموقع (ملف كبير أو اتصال بطيء) — حاول مجدداً أو صغّر الحزمة');
    throw e instanceof Error ? e : new Error('تعذّر فتح الموقع المضغوط');
  } finally {
    window.clearTimeout(timer);
  }
}

export type LessonHtmlMode =
  | { mode: 'source'; url: string }
  | { mode: 'bundle'; url: string }
  | { mode: 'inline'; inline: string }
  | { mode: 'external'; url: string }
  | { mode: 'none' };

/**
 * القرار المركزي الوحيد لمحتوى HTML الدرس.
 * القاعدة: رابط الحزمة (مضغوطة/مبنية) يفوز دائماً على الكود الملصق — لأن بقايا
 * ثنائية في حقل اللصق كانت تسمّم العرض (تظهر بدل الموقع وتُعطّل المعاينة).
 * الروابط الخارجية القديمة + اللصق يحتفظان بالسلوك الأصلي (اللصق يفوز).
 */
export function resolveLessonHtml(lesson?: {
  htmlContent?: string | null;
  htmlFileUrl?: string | null;
} | null): LessonHtmlMode {
  const url = (lesson?.htmlFileUrl || '').trim();
  if (url && isSourceBundleUrl(url)) return { mode: 'source', url };
  if (url && isBundleUrl(url)) return { mode: 'bundle', url };
  if ((lesson?.htmlContent || '').trim()) return { mode: 'inline', inline: String(lesson?.htmlContent) };
  if (url) return { mode: 'external', url };
  return { mode: 'none' };
}

/* ---------------- أكواد تشخيص الرفع (للمعلم: انسخ التقرير والصقه للمطور) ---------------- */

export type UploadDiag = {
  code: string;
  message: string;
  stage: string;
  fileName: string;
  fileSizeKB: number;
  time: string;
  host: string;
  detail?: string;
};

/** خطأ رفع يحمل كود تشخيص ثابتاً + تفاصيل اختيارية */
export function codedUploadError(code: string, message: string, detail?: string): Error {
  const e = new Error(message) as Error & { code: string; detail?: string };
  e.code = code;
  if (detail) e.detail = detail;
  return e;
}

/** تخمين الكود من المرحلة عندما لا يحمل الخطأ كوداً (أخطاء الفحص/البناء المحلية) */
export function diagCodeForStage(stage: string, err?: any): string {
  if (err?.code) return err.code;
  if (stage.includes('فحص') || stage.includes('فك') || stage.includes('تصنيف')) return 'LOCAL-01';
  if (stage.includes('محرك') || stage.includes('بناء')) return 'BUILD-01';
  if (stage.includes('ضغط')) return 'PACK-01';
  if (stage.includes('قديمة') || stage.includes('تنظيف')) return 'CLEANUP-01';
  if (stage.includes('رفع')) return 'UPLOAD-01';
  return 'UNKNOWN-01';
}

/** يبني تقرير التشخيص الجاهز للنسخ */
export function buildUploadDiag(err: any, stage: string, file?: { name?: string; size?: number } | null): UploadDiag {
  let host = '';
  try {
    host = window.location.host;
  } catch {
    host = 'unknown';
  }
  return {
    code: diagCodeForStage(stage, err),
    message: err?.message || 'خطأ غير معروف',
    stage,
    fileName: file?.name || '—',
    fileSizeKB: Math.round((file?.size || 0) / 1024),
    time: new Date().toISOString(),
    host,
    detail: err?.detail || undefined,
  };
}

/** ينزّل التقرير كنص للنسخ واللصق */
export function formatUploadDiag(d: UploadDiag): string {
  return [
    '[تقرير تشخيص الرفع]',
    `الكود: ${d.code}`,
    `المرحلة: ${d.stage}`,
    `الملف: ${d.fileName} (${d.fileSizeKB}KB)`,
    `الوقت: ${d.time}`,
    `المضيف: ${d.host}`,
    `الرسالة: ${d.message}`,
    d.detail ? `التفاصيل: ${d.detail}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/* ---------------- الرفع المباشر من المتصفح إلى ImageKit ---------------- */

export type DirectUploadResult = {
  url: string;
  fileId: string;
  name: string;
  size: number;
  /** true عندما تم الرفع عبر مسار السيرفر البديل (لأن المباشر تعذّر) */
  viaFallback?: boolean;
  /** رسالة فشل المسار المباشر — للتنبيه الإداري */
  directError?: string;
};

const ARCHIVE_EXTS = ['.zip', '.tar', '.tar.gz', '.tgz'];

export function isArchiveFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTS.some((e) => lower.endsWith(e));
}

export function isHtmlFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.html') || lower.endsWith('.htm');
}

/**
 * رفع حزمة مباشرة إلى ImageKit بدون المرور بالسيرفر (يتجاوز حد Vercel).
 * يُستخدم لملفات ZIP/TAR الكبيرة حتى ~100MB.
 *
 * + تعقيم اسم الملف (عربي/مسافات/رموز كانت تفشل الرفع أحياناً).
 * + رسالة السيرفر الأصلية تُمرَّر كما هي عند فشل التجهيز (مثل نقص PUBLIC_KEY).
 * + مسار بديل اختياري: إن فشل المباشر وكان الملف صغيراً (≤2.5MB) يُرفع عبر
 *   السيرفر بنفس طريقة ملف HTML — فيعمل حتى لو كان الرفع المباشر معطلاً.
 */
export function uploadBundleDirect(
  file: File,
  folder = '/ard-al-lughah/bundles',
  onProgress?: (percent: number) => void,
  fallbackUploader?: (file: File) => Promise<{ url: string }>,
): Promise<DirectUploadResult> {
  const safeName = (file.name || `bundle-${Date.now()}`).replace(/[^\w.\-()\[\] ]+/g, '_').slice(0, 120) || 'bundle';
  const FALLBACK_MAX = Math.floor(2.5 * 1024 * 1024);
  const tryFallback = async (directErr: Error): Promise<DirectUploadResult> => {
    if (fallbackUploader && file.size <= FALLBACK_MAX) {
      const fbFile = new File([file], safeName, { type: file.type || 'application/octet-stream' });
      try {
        const r = await fallbackUploader(fbFile);
        return { url: r.url, fileId: '', name: safeName, size: file.size, viaFallback: true, directError: directErr.message };
      } catch (fbErr: any) {
        throw codedUploadError(
          'FALLBACK-FAIL',
          `فشل الرفع المباشر (${directErr.message}) وفشل البديل (${fbErr?.message || 'خطأ'}) — تحقق من مفاتيح ImageKit في .env`,
          `direct=${(directErr as any)?.code || '?'} fallback=${fbErr?.message || '?'}`,
        );
      }
    }
    throw directErr;
  };
  const fail = (e: unknown, resolve: (v: DirectUploadResult) => void, reject: (e: Error) => void) => {
    const err = e instanceof Error ? e : codedUploadError('UPLOAD-01', 'تعذّر الرفع المباشر');
    tryFallback(err).then(resolve, reject);
  };
  return new Promise((resolve, reject) => {
    if (file.size > BUNDLE_LIMITS.maxDirectMB * 1024 * 1024) {
      reject(new Error(`حجم الملف يتجاوز ${BUNDLE_LIMITS.maxDirectMB}MB — صغّر الصور والفيديو داخل الموقع ثم أعد الضغط`));
      return;
    }
    fetch(`/api/teacher/upload-auth?folder=${encodeURIComponent(folder)}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          const serverMsg = (body && (body.error || body.message)) || '';
          const code = /PUBLIC_KEY/.test(serverMsg) ? 'AUTH-NOKEY' : `AUTH-HTTP-${r.status}`;
          throw codedUploadError(
            code,
            serverMsg || 'تعذّر تجهيز الرفع المباشر — سجّل الدخول كمعلم وحاول مجدداً',
            `status=${r.status}`,
          );
        }
        return r.json();
      })
      .then((auth: any) => {
        if (!auth?.signature) throw codedUploadError('AUTH-BAD', 'رد غير صالح من خادم الرفع', 'missing signature');
        const form = new FormData();
        form.append('file', file, safeName);
        form.append('fileName', safeName);
        form.append('folder', auth.folder || folder);
        form.append('publicKey', auth.publicKey);
        form.append('signature', auth.signature);
        form.append('expire', String(auth.expire));
        form.append('token', auth.token);
        form.append('useUniqueFileName', 'true');
        form.append('tags', 'ard-al-lughah,bundle');
        const xhr = new XMLHttpRequest();
        xhr.open('POST', auth.uploadUrl);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300 && data.url) {
              resolve({ url: data.url, fileId: data.fileId, name: data.name, size: data.size || file.size });
            } else {
              fail(codedUploadError(
                `DIRECT-HTTP-${xhr.status}`,
                data?.message || `رفض ImageKit الرفع (${xhr.status}) — تحقق من مساحة التخزين والمفاتيح`,
                String(data?.message || '').slice(0, 200) || `status=${xhr.status}`,
              ), resolve, reject);
            }
          } catch (e) {
            fail(e, resolve, reject);
          }
        };
        xhr.onerror = () => fail(codedUploadError('DIRECT-NET', 'انقطع الاتصال أثناء الرفع — تحقق من الإنترنت وحاول مجدداً'), resolve, reject);
        xhr.ontimeout = () => fail(codedUploadError('DIRECT-TIMEOUT', 'انتهت مهلة الرفع — الملف كبير والاتصال بطيء، حاول مجدداً'), resolve, reject);
        xhr.timeout = 10 * 60 * 1000;
        xhr.send(form);
      })
      .catch((e) => fail(e instanceof Error ? e : codedUploadError('AUTH-NET', 'تعذّر الوصول لخادم الرفع — تحقق أن السيرفر يعمل'), resolve, reject));
  });
}
