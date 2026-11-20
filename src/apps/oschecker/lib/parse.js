// OS Size Checker 계산 (순수 함수 — scripts/oschecker-check.mjs 로 확인)
//
// A = Layer Information (Structure 표): 줄마다 맨 왼쪽이 항목 이름, 오른쪽으로 Structure마다 값이 한 칸씩.
//   Module / Blockcount / MaskVersion / LowerLeftX / LowerLeftY / UpperRightX / UpperRightY / Polarity / Select / Structure
//   구분자(Key) = Structure, Size = UpperRightX × UpperRightY
//   같은 항목 이름이 다시 나오면 새 묶음으로 본다 (세로로 한 건씩 붙여 넣어도, 여러 묶음이어도 됨).
// B = DWR (Struct 목록): 머리줄 + 한 줄에 한 건.
//   No / Struct Name / DB Class / GDS File / Chip Size / Cust.Nick / GDS ID / EBEAM Prefix / Place.X / Place.Y
//   구분자(Key) = Struct Name, Size = (Chip X × 0.98) × (Chip Y × 0.98)
// SCRIBE · BLIND · SC1 · OOB Structure는 비교하지 않는다 (EXCLUDE).

export const A_FIELDS = ['Module', 'Blockcount', 'MaskVersion', 'LowerLeftX', 'LowerLeftY', 'UpperRightX', 'UpperRightY', 'Polarity', 'Select', 'Structure'];
export const B_FIELDS = ['No', 'Struct Name', 'DB Class', 'GDS File', 'Chip Size', 'Cust.Nick', 'GDS ID', 'EBEAM Prefix', 'Place.X', 'Place.Y'];

export const DEFAULTS = { shrink: 0.98 };

const norm = (s) => String(s || '').toLowerCase().replace(/[\s._:\-()]/g, '');
const A_INDEX = new Map(A_FIELDS.map((f) => [norm(f), f]));
const B_INDEX = new Map(B_FIELDS.map((f) => [norm(f), f]));

export function toNum(s) {
  if (s == null) return NaN;
  const t = String(s).trim().replace(/,/g, '');
  if (!t) return NaN;
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
}

// 한 줄을 칸으로 나눈다: 탭이 있으면 탭, 없으면 공백 2칸 이상, 그래도 하나면 공백
function cells(line) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  const two = line.trim().split(/\s{2,}/);
  if (two.length > 1) return two.map((c) => c.trim());
  return line.trim().split(/\s+/);
}

// "10230.5 x 8120" · "10230.5x8120" · "10230.5 X 8120" · "10230.5*8120" · "10230.5,8120"(콤마 하나만)
export function parseChipSize(s) {
  const t = String(s || '').trim();
  const m = t.match(/^\(?\s*([-+]?[\d.,]+)\s*(?:[xX×*]|\s)\s*([-+]?[\d.,]+)\s*\)?$/) || t.match(/^([-+]?[\d.]+)\s*,\s*([-+]?[\d.]+)$/);
  if (!m) return null;
  const x = toNum(m[1]);
  const y = toNum(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

// ── A ────────────────────────────────────────────────────────────────
export function parseA(text) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let cur = null;
  const warnings = [];
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const cs = cells(raw);
    let label = cs[0];
    let vals = cs.slice(1);
    // "Module: X" / "Module=X" 모양도 받기
    const kv = !A_INDEX.has(norm(label)) && raw.match(/^\s*([A-Za-z][A-Za-z ._]*?)\s*[:=]\s*(.*)$/);
    if (kv && A_INDEX.has(norm(kv[1]))) {
      label = kv[1];
      vals = cells(kv[2]);
    }
    const field = A_INDEX.get(norm(label));
    if (!field) {
      warnings.push(`${i + 1}번째 줄: 항목 이름 '${label}' 을 몰라서 건너뜀`);
      return;
    }
    if (!cur || cur.rows[field]) {
      cur = { line: i + 1, rows: {} };
      blocks.push(cur);
    }
    cur.rows[field] = vals;
  });

  const items = [];
  blocks.forEach((b, bi) => {
    const n = Math.max(0, ...Object.values(b.rows).map((v) => v.length));
    const keys = b.rows.Structure;
    if (!keys) {
      warnings.push(`${b.line}번째 줄부터 묶음: Structure 줄이 없어서 건너뜀`);
      return;
    }
    for (const f of A_FIELDS) if (b.rows[f] && b.rows[f].length !== n) warnings.push(`${b.line}번째 줄부터 묶음: ${f} 값이 ${b.rows[f].length}개 (다른 줄은 ${n}개)`);
    for (let c = 0; c < n; c++) {
      const rec = {};
      for (const f of A_FIELDS) rec[f] = b.rows[f]?.[c] ?? '';
      const w = toNum(rec.UpperRightX);
      const h = toNum(rec.UpperRightY);
      items.push({
        key: String(rec.Structure).trim(),
        w,
        h,
        ok: Number.isFinite(w) && Number.isFinite(h),
        raw: rec,
        src: blocks.length > 1 ? `묶음 ${bi + 1} · ${c + 1}열` : `${c + 1}열`,
      });
    }
  });
  const missing = A_FIELDS.filter((f) => !blocks.some((b) => b.rows[f]));
  return { items, warnings, missing };
}

// ── B ────────────────────────────────────────────────────────────────
function splitB(line, nCols) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  let cs = line.trim().split(/\s{2,}/);
  if (cs.length >= nCols - 1) return cs;
  // 공백 하나로만 나뉜 경우: "100 x 200" 을 한 칸으로 다시 붙인다
  const t = line.trim().split(/\s+/);
  cs = [];
  for (let i = 0; i < t.length; i++) {
    if (/^[xX×*]$/.test(t[i + 1] || '') && Number.isFinite(toNum(t[i])) && Number.isFinite(toNum(t[i + 2]))) {
      cs.push(`${t[i]} x ${t[i + 2]}`);
      i += 2;
    } else cs.push(t[i]);
  }
  return cs;
}

export function parseB(text, shrink = DEFAULTS.shrink) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  const warnings = [];
  let col = null;
  let start = 0;
  // 머리줄 찾기: Struct Name 과 Chip Size 가 들어 있는 첫 줄
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cs = splitB(lines[i], B_FIELDS.length).map(norm);
    const si = cs.indexOf(norm('Struct Name'));
    const ci = cs.indexOf(norm('Chip Size'));
    if (si >= 0 && ci >= 0) {
      col = {};
      cs.forEach((c, k) => {
        const f = B_INDEX.get(c);
        if (f && col[f] == null) col[f] = k;
      });
      start = i + 1;
      break;
    }
    // 공백 하나로 나뉜 머리줄: 칸 위치는 모르지만 머리줄이니 건너뛰고 기본 순서로
    if (norm(lines[i]).includes('structname') && norm(lines[i]).includes('chipsize')) {
      start = i + 1;
      break;
    }
  }
  const headerless = !col;
  if (headerless) {
    col = Object.fromEntries(B_FIELDS.map((f, k) => [f, k]));
    if (lines.length) {
      warnings.push(start
        ? '머리줄이 공백 한 칸으로 나뉘어 있어 칸 위치를 기본 순서(No, Struct Name, DB Class, GDS File, Chip Size, …)로 읽었어요 — 엑셀에서 그대로 복사하면 정확해요'
        : '머리줄(Struct Name · Chip Size)을 못 찾아서 기본 순서(No, Struct Name, DB Class, GDS File, Chip Size, …)로 읽었어요');
    }
  }
  const items = [];
  for (let i = start; i < lines.length; i++) {
    const cs = splitB(lines[i], B_FIELDS.length);
    const rec = {};
    for (const f of B_FIELDS) rec[f] = col[f] != null ? cs[col[f]] ?? '' : '';
    const key = String(rec['Struct Name']).trim();
    if (!key) continue;
    let size = parseChipSize(rec['Chip Size']);
    if (!size) {
      // 칸이 밀렸을 때: 줄 안에서 "숫자 x 숫자" 를 찾아 본다
      const hit = lines[i].match(/([-+]?[\d.,]+)\s*[xX×*]\s*([-+]?[\d.,]+)/);
      if (hit) {
        size = parseChipSize(`${hit[1]} x ${hit[2]}`);
        if (size) warnings.push(`${i + 1}번째 줄(${key}): Chip Size 칸이 비어 줄 안의 '${hit[0].trim()}' 를 썼어요`);
      }
    }
    items.push({
      key,
      chipX: size?.x ?? NaN,
      chipY: size?.y ?? NaN,
      w: size ? size.x * shrink : NaN,
      h: size ? size.y * shrink : NaN,
      ok: !!size,
      raw: rec,
      src: `${i + 1}번째 줄`,
    });
  }
  return { items, warnings, headerless };
}

// ── 비교 ──────────────────────────────────────────────────────────────
// 이름은 그대로(대소문자 구분) 맞추고, Size는 오차 없이 같아야 일치.
// (0.98 곱셈의 부동소수점 찌꺼기만 지우려고 소수 6자리에서 반올림해 비교)
// status: match | diff | onlyA | onlyB | bad(숫자를 못 읽음) · diff 중 가로·세로만 바뀐 건 swapped 표시
export const EXCLUDE = ['SCRIBE', 'BLIND', 'SC1', 'OOB'];
const r6 = (n) => Math.round(n * 1e6) / 1e6;
export const isExcluded = (key) => EXCLUDE.includes(String(key).trim().toUpperCase());

export function compare(aItems, bItems) {
  const excluded = new Set();
  const group = (items) => {
    const m = new Map();
    for (const it of items) {
      if (isExcluded(it.key)) {
        excluded.add(it.key);
        continue;
      }
      if (!m.has(it.key)) m.set(it.key, []);
      m.get(it.key).push(it);
    }
    return m;
  };
  const ga = group(aItems);
  const gb = group(bItems);
  const keys = [...new Set([...ga.keys(), ...gb.keys()])];
  const rows = [];
  for (const kk of keys) {
    const as = ga.get(kk) || [];
    const bs = gb.get(kk) || [];
    const a = as[0] || null;
    const b = bs[0] || null;
    const row = { key: kk, a, b, dupA: as.length, dupB: bs.length, dw: NaN, dh: NaN, swapped: false };
    if (!a) row.status = 'onlyB';
    else if (!b) row.status = 'onlyA';
    else if (!a.ok || !b.ok) row.status = 'bad';
    else {
      row.dw = r6(a.w - b.w);
      row.dh = r6(a.h - b.h);
      if (r6(a.w) === r6(b.w) && r6(a.h) === r6(b.h)) row.status = 'match';
      else {
        row.status = 'diff';
        row.swapped = r6(a.w) === r6(b.h) && r6(a.h) === r6(b.w);
      }
    }
    rows.push(row);
  }
  const order = { diff: 0, bad: 1, onlyA: 2, onlyB: 3, match: 4 };
  rows.sort((x, y) => order[x.status] - order[y.status] || x.key.localeCompare(y.key, undefined, { numeric: true }));
  const counts = { match: 0, diff: 0, bad: 0, onlyA: 0, onlyB: 0 };
  rows.forEach((r) => counts[r.status]++);
  const dups = rows.filter((r) => r.dupA > 1 || r.dupB > 1).length;
  return { rows, counts, dups, total: rows.length, excluded: [...excluded] };
}

export const A_NAME = 'Layer Information';
export const B_NAME = 'DWR';
export const STATUS_LABEL = { match: '일치', diff: '불일치', bad: '숫자 못 읽음', onlyA: `${A_NAME}에만`, onlyB: `${B_NAME}에만` };

// 소수점 끝 0 정리 (최대 6자리)
export function fmt(n, d = 6) {
  if (!Number.isFinite(n)) return '-';
  const s = n.toFixed(d).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}
export const fmtSize = (w, h) => (Number.isFinite(w) && Number.isFinite(h) ? `${fmt(w)} × ${fmt(h)}` : '-');
export const fmtDelta = (n) => (!Number.isFinite(n) ? '' : Math.abs(n) < 1e-9 ? '0' : `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`);

export function resultTsv(res) {
  const head = ['Structure', '결과', 'LayerInfo UR X', 'LayerInfo UR Y', 'DWR Chip X', 'DWR Chip Y', 'DWR ×0.98 X', 'DWR ×0.98 Y', 'ΔX (LayerInfo−DWR)', 'ΔY (LayerInfo−DWR)', 'Module', 'GDS File'];
  const lines = [head.join('\t')];
  for (const r of res.rows) {
    lines.push([
      r.key,
      STATUS_LABEL[r.status] + (r.swapped ? ' (가로·세로 바뀜)' : '') + (r.dupA > 1 || r.dupB > 1 ? ` (중복 A${r.dupA}/B${r.dupB})` : ''),
      r.a ? fmt(r.a.w) : '',
      r.a ? fmt(r.a.h) : '',
      r.b ? fmt(r.b.chipX) : '',
      r.b ? fmt(r.b.chipY) : '',
      r.b ? fmt(r.b.w) : '',
      r.b ? fmt(r.b.h) : '',
      fmtDelta(r.dw),
      fmtDelta(r.dh),
      r.a?.raw.Module || '',
      r.b?.raw['GDS File'] || '',
    ].join('\t'));
  }
  return lines.join('\n');
}

export const SAMPLE_A = [
  ['Module', 'M01', 'M01', 'M02', 'M03'],
  ['Blockcount', '1', '1', '1', '1'],
  ['MaskVersion', 'A0', 'A0', 'A0', 'B0'],
  ['LowerLeftX', '0', '0', '0', '0'],
  ['LowerLeftY', '0', '0', '0', '0'],
  ['UpperRightX', '9800', '4900.49', '12250', '7840'],
  ['UpperRightY', '7840', '2450', '9310', '9800'],
  ['Polarity', 'P', 'P', 'N', 'P'],
  ['Select', 'Y', 'Y', 'Y', 'Y'],
  ['Structure', 'TOP_CHIP_A', 'TEG_01', 'TOP_CHIP_B', 'TEG_02'],
].map((r) => r.join('\t')).join('\n');

export const SAMPLE_B = [
  B_FIELDS,
  ['1', 'TOP_CHIP_A', 'MAIN', 'chip_a.gds', '10000 x 8000', 'AAA', 'G001', 'EA', '0', '0'],
  ['2', 'TEG_01', 'TEG', 'teg01.gds', '5000.5 x 2500', 'AAA', 'G002', 'EB', '100', '0'],
  ['3', 'TOP_CHIP_B', 'MAIN', 'chip_b.gds', '12500 x 9600', 'BBB', 'G003', 'EC', '0', '0'],
  ['4', 'TEG_02', 'TEG', 'teg02.gds', '10000 x 8000', 'BBB', 'G004', 'ED', '0', '200'],
  ['5', 'TEG_03', 'TEG', 'teg03.gds', '3000 x 3000', 'BBB', 'G005', 'EE', '0', '0'],
  ['6', 'SCRIBE', 'SCRIBE', 'scribe.gds', '80 x 80', 'BBB', 'G006', 'EF', '0', '0'],
].map((r) => r.join('\t')).join('\n');
