/* ============================================================================
   تصدير Excel حقيقي (.xlsx) بلا أي اعتمادية خارجية.
   ----------------------------------------------------------------------------
   نبني ملف ZIP مكتوباً يدوياً (Store — بلا ضغط، فالنصوص أصلاً مضغوطة gzip),
   وبداخله بنية OOXML القياسية. كل ورقة Excel = ورقة عمل، والحقول العربية
   تُكتب UTF-8 مباشرة مع اتجاه RTL وفك تجميد الرأس.
   ============================================================================ */

export type Cell = string | number | null | undefined;

export type SheetSpec = {
  name: string;
  rows: Cell[][];
  /** عرض الأعمدة بالأحرف (اختياري) */
  widths?: number[];
};

export type BuildOptions = {
  /** عنوان يظهر في أعلى كل ورقة (سطر مدمج) */
  title?: string;
  /** عنوان الموضوع في خصائص الملف */
  subject?: string;
  creator?: string;
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

function dosDateTime(d: Date): { time: number; date: number } {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

/** كاتب ZIP بسيط (Method 0 = Store) */
function zipStore(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const now = dosDateTime(new Date());
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameB = enc.encode(e.name);
    const crc = crc32(e.data);
    const lh = new Uint8Array(30);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, now.time, true);
    lv.setUint16(12, now.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, nameB.length, true);
    lv.setUint16(28, 0, true);
    locals.push(lh, nameB, e.data);

    const ch = new Uint8Array(46);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, now.time, true);
    cv.setUint16(14, now.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    centrals.push(ch, nameB);
    offset += lh.length + nameB.length + e.data.length;
  }
  const cdSize = centrals.reduce((a, p) => a + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of [...locals, ...centrals, eocd]) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/* ---------------- XML helpers ---------------- */

function xmlEscape(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // محارف تحكّم غير مسموحة في XML
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** إزالة المحارف غير المسموحة في أسماء أوراق Excel + سقف 31 محرفاً */
export function safeSheetName(name: string, used: Set<string>): string {
  let base = String(name || 'ورقة').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim() || 'ورقة';
  if (base.length > 31) base = base.slice(0, 31).trim();
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${i++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function colLetter(n: number): string {
  // 1 -> A
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function cellXml(ref: string, value: Cell, styleId: number): string {
  if (value === null || value === undefined || value === '') {
    return styleId ? `<c r="${ref}" s="${styleId}"/>` : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${styleId ? ` s="${styleId}"` : ''}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${styleId ? ` s="${styleId}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function sheetXml(spec: SheetSpec, title?: string): string {
  const rows = spec.rows.filter((r) => Array.isArray(r));
  const maxCols = rows.reduce((a, r) => Math.max(a, r.length), 1);
  const cols = spec.widths?.length
    ? `<cols>${spec.widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';
  const body: string[] = [];
  let r = 0;
  if (title) {
    r = 1;
    body.push(
      `<row r="1" ht="22" customHeight="1"><c r="A1" s="2" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(title)}</t></is></c></row>`,
    );
  }
  const headerOffset = title ? 2 : 1;
  for (const row of rows) {
    r++;
    const isHeader = title ? r === headerOffset : r === 1;
    const cells = row
      .map((v, ci) => cellXml(`${colLetter(ci + 1)}${r}`, v, isHeader ? 1 : 0))
      .join('');
    body.push(`<row r="${r}"${isHeader ? ' ht="20" customHeight="1"' : ''}>${cells}</row>`);
  }
  const lastRef = `A${Math.max(r, 1)}`;
  const lastCol = colLetter(maxCols);
  const filterRef = `A${headerOffset}:${lastCol}${Math.max(r, headerOffset)}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${lastRef.startsWith('A') ? `${lastCol}${Math.max(r, 1)}` : lastRef}"/>` +
    `<sheetViews><sheetView rightToLeft="1" tabSelected="0" workbookViewId="0">` +
    `<pane ySplit="${headerOffset}" topLeftCell="A${headerOffset + 1}" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="16"/>` +
    cols +
    `<sheetData>${body.join('')}</sheetData>` +
    `<autoFilter ref="${filterRef}"/>` +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="3">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="13"/><color rgb="FF0D2926"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF17413F"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** يبني ملف xlsx كامل (Uint8Array) من عدة أوراق */
export function buildWorkbook(sheets: SheetSpec[], opts: BuildOptions = {}): Uint8Array {
  const usable = sheets.filter((s) => s && Array.isArray(s.rows));
  const used = new Set<string>();
  const named = usable.map((s) => ({ spec: s, name: safeSheetName(s.name, used) }));
  if (!named.length) named.push({ spec: { name: 'ورقة', rows: [[]] }, name: 'ورقة' });

  const files: Array<{ name: string; data: Uint8Array }> = [];
  const contentOverrides = named
    .map(
      (_n, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  files.push({
    name: '[Content_Types].xml',
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        contentOverrides +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `</Types>`,
    ),
  });
  files.push({
    name: '_rels/.rels',
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`,
    ),
  });
  files.push({
    name: 'docProps/core.xml',
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        `<dc:title>${xmlEscape(opts.title || 'كشف الطلاب')}</dc:title>` +
        `<dc:subject>${xmlEscape(opts.subject || '')}</dc:subject>` +
        `<dc:creator>${xmlEscape(opts.creator || 'أرض اللغة')}</dc:creator>` +
        `<cp:lastModifiedBy>${xmlEscape(opts.creator || 'أرض اللغة')}</cp:lastModifiedBy>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created>` +
        `</cp:coreProperties>`,
    ),
  });
  files.push({
    name: 'xl/workbook.xml',
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<workbookPr/>` +
        named
          .map(
            (n, i) =>
              `<sheet name="${xmlEscape(n.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join('') +
        `</workbook>`,
    ),
  });
  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        named
          .map(
            (_n, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
  });
  files.push({ name: 'xl/styles.xml', data: enc.encode(STYLES_XML) });
  named.forEach((n, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(n.spec, opts.title)) });
  });
  return zipStore(files);
}

/** تنزيل Blob في المتصفح باسم ملف */
export function downloadBytes(data: Uint8Array, fileName: string, mime: string) {
  const blob = new Blob([data as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadWorkbook(fileName: string, sheets: SheetSpec[], opts: BuildOptions = {}) {
  const bytes = buildWorkbook(sheets, opts);
  downloadBytes(
    bytes,
    fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  return bytes.length;
}

/* ---------------- CSV كبديل خفيف ---------------- */

export function toCsv(rows: Cell[][]): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM حتى تفتح العربية صح في Excel
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadCsv(fileName: string, rows: Cell[][]) {
  downloadBytes(enc.encode(toCsv(rows)), fileName.endsWith('.csv') ? fileName : `${fileName}.csv`, 'text/csv;charset=utf-8');
}