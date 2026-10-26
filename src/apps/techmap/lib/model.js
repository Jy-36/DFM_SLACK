// techfile · layermap · drf 를 읽어 색인을 만든다. 모든 행은 원래 줄 번호(0부터)를 갖는다.
import { atomsOf, entriesOf, findAll, parse } from './sexpr.js';

// techPurposes에 적지 않아도 Virtuoso가 아는 purpose
export const RESERVED_PURPOSES = new Set([
  'drawing', 'pin', 'net', 'label', 'boundary', 'blockage', 'grid', 'fill', 'slot', 'fillOPC', 'OPCSerif',
  'OPCAntiSerif', 'annotation', 'gapFill', 'redundant', 'customFill', 'warning', 'tool0', 'tool1', 'track', 'dummy',
]);
// packet 이름 추정용 약어
export const RESERVED_ABBR = { drawing: 'drw', pin: 'pin', net: 'net', label: 'lbl', boundary: 'bnd', blockage: 'blk', fill: 'fil', dummy: 'dmy', slot: 'slt', grid: 'grd' };

export const lppKey = (layer, purpose) => `${layer}/${purpose}`;

/** 줄 단위로 나누되 줄 끝(\n, \r\n)을 그대로 붙여 둔다 */
export function splitLines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

function table(root, name) {
  const node = findAll(root, name)[0];
  if (!node) return null;
  const rows = entriesOf(node).map((e) => ({ tokens: atomsOf(e), start: e.start, end: e.end }));
  return { name, start: node.start, end: node.end, rows, get lastRowLine() { return rows.length ? rows[rows.length - 1].end : node.start; } };
}

const mapBy = (rows, keyFn, min = 1) => {
  const m = new Map();
  for (const r of rows || []) if (r.tokens.length >= min) m.set(keyFn(r), r);
  return m;
};

export function loadTechFile(name, text) {
  const root = parse(text);
  const tf = {
    name,
    lines: splitLines(text),
    purposes: table(root, 'techPurposes'),
    layers: table(root, 'techLayers'),
    priorities: table(root, 'techLayerPurposePriorities'),
    displays: table(root, 'techDisplays'),
  };
  tf.layerByName = () => mapBy(tf.layers?.rows, (r) => r.tokens[0]);
  tf.layerNumbers = () => new Map((tf.layers?.rows || []).filter((r) => r.tokens.length > 1).map((r) => [r.tokens[1], r.tokens[0]]));
  tf.purposeNames = () => new Set([...(tf.purposes?.rows || []).filter((r) => r.tokens.length).map((r) => r.tokens[0]), ...RESERVED_PURPOSES]);
  tf.priorityRows = () => mapBy(tf.priorities?.rows, (r) => lppKey(r.tokens[0], r.tokens[1]), 2);
  tf.displayRows = () => mapBy(tf.displays?.rows, (r) => lppKey(r.tokens[0], r.tokens[1]), 3);
  /** layerDefinitions 표 밖에서 layer 이름이 나오는 줄 */
  tf.references = (layer, exclude) => {
    const esc = layer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pat = new RegExp(`(^|[^\\w"])"?${esc}"?(?![\\w"])`);
    const hits = [];
    tf.lines.forEach((ln, i) => {
      if (exclude.has(i)) return;
      if (pat.test(ln.split(';')[0])) hits.push(i);
    });
    return hits;
  };
  return tf;
}

export function loadLayerMap(name, text) {
  const lines = splitLines(text);
  const rows = [];
  lines.forEach((ln, i) => {
    const code = ln.split('#')[0].trim();
    if (!code) return;
    const t = code.split(/\s+/);
    if (t.length >= 4) rows.push({ layer: t[0], purpose: t[1], stream: t[2], datatype: t[3], line: i });
  });
  return {
    name,
    lines,
    rows,
    byLpp: () => new Map(rows.map((r) => [lppKey(r.layer, r.purpose), r])),
  };
}

export function loadDrf(name, text) {
  const root = parse(text);
  const drf = {
    name,
    lines: splitLines(text),
    colors: table(root, 'drDefineColor'),
    stipples: table(root, 'drDefineStipple'),
    linestyles: table(root, 'drDefineLineStyle'),
    packets: table(root, 'drDefinePacket'),
  };
  drf.colorRows = () => mapBy(drf.colors?.rows, (r) => r.tokens[1], 5);
  drf.stippleNames = () => new Set((drf.stipples?.rows || []).filter((r) => r.tokens.length >= 2).map((r) => r.tokens[1]));
  drf.linestyleNames = () => new Set((drf.linestyles?.rows || []).filter((r) => r.tokens.length >= 2).map((r) => r.tokens[1]));
  drf.packetRows = () => mapBy(drf.packets?.rows, (r) => r.tokens[1], 6);
  /** 색 이름 → '#rrggbb' */
  drf.rgbMap = () => {
    const out = {};
    for (const [n, r] of drf.colorRows()) {
      const v = r.tokens.slice(2, 5).map(Number);
      if (v.every((x) => Number.isInteger(x))) out[n] = '#' + v.map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    return out;
  };
  return drf;
}

/** files: { tf:{name,text}, layermap:{name,text}, drf:{name,text} } */
export function loadSet(files) {
  const ts = {
    tf: loadTechFile(files.tf.name, files.tf.text),
    lm: loadLayerMap(files.layermap.name, files.layermap.text),
    drf: loadDrf(files.drf.name, files.drf.text),
  };
  ts.packetUsers = () => {
    const u = new Map();
    for (const [k, r] of ts.tf.displayRows()) {
      if (!u.has(r.tokens[2])) u.set(r.tokens[2], []);
      u.get(r.tokens[2]).push(k);
    }
    return u;
  };
  return ts;
}

/** 세 파일 사이 점검: 불러올 때 · baseline 화면에 보여 준다 */
export function consistency(ts) {
  const issues = [];
  const prio = ts.tf.priorityRows();
  const disp = ts.tf.displayRows();
  const packets = ts.drf.packetRows();
  const layers = ts.tf.layerByName();
  for (const [k, r] of prio) if (!disp.has(k)) issues.push({ level: 'warn', file: 'tf', line: r.start + 1, msg: `${k}: techDisplays 항목 없음` });
  for (const [k, r] of disp) if (!packets.has(r.tokens[2])) issues.push({ level: 'error', file: 'tf', line: r.start + 1, msg: `${k}: packet '${r.tokens[2]}'이 drf에 없음` });
  for (const r of ts.lm.rows) if (!layers.has(r.layer)) issues.push({ level: 'warn', file: 'layermap', line: r.line + 1, msg: `${r.layer}/${r.purpose}: techLayers에 없는 layer` });
  const seen = new Map();
  for (const r of ts.lm.rows) {
    const k = `${r.stream}/${r.datatype}`;
    if (seen.has(k)) issues.push({ level: 'error', file: 'layermap', line: r.line + 1, msg: `GDS ${k} 중복 (${seen.get(k).layer}/${seen.get(k).purpose}와 충돌)` });
    seen.set(k, r);
  }
  return issues;
}

/** baseline 화면용 LPP 표 */
export function lppTable(ts) {
  const lm = ts.lm.byLpp();
  const packets = ts.drf.packetRows();
  const users = ts.packetUsers();
  const layers = ts.tf.layerByName();
  return [...ts.tf.displayRows()].map(([k, r]) => {
    const [layer, purpose, packet] = r.tokens;
    const p = packets.get(packet);
    const m = lm.get(k);
    return {
      key: k, layer, purpose, packet,
      layerNo: layers.get(layer)?.tokens[1] || '',
      shared: (users.get(packet) || []).length > 1,
      stipple: p?.tokens[2] || '', linestyle: p?.tokens[3] || '', fill: p?.tokens[4] || '', outline: p?.tokens[5] || '', fillStyle: p?.tokens[6] || '',
      gds: m ? `${m.stream}/${m.datatype}` : '',
      line: r.start + 1,
    };
  });
}
