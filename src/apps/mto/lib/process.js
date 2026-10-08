// Process Layer Set: Process → Part(FEOL · BEOL) → Layer, Layer마다 Type(STEP2 TAT)과 SPEC 값.
// FEOL: Module로 나누고, Module마다 Module Option(변형)을 둘 수 있다. FEOL Concept(POR 등)은 Module마다 어떤 Module Option을 쓸지 정한 조합.
//       Layer의 Module Option이 비어 있으면 그 Module 공통 Layer (모든 FEOL Concept에 들어감).
// BEOL: 여러 BEOL Option(예: 15M, 11M) 중 하나. Option마다 컨셉 설명과 Metal · Via 쌓는 순서(stack)를 둔다.
// Product Set List = 고른 FEOL Concept의 FEOL Layer + 고른 BEOL Option의 Layer (BEOL은 stack 순서).
import { EXAMPLE_LAYERS } from './layers.js';

let seq = 0;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** 기본 SPEC 열 (이름 바꾸기·추가·삭제 가능) */
export const DEFAULT_SPEC_COLUMNS = ['Mask Type', 'Grade', 'Tone', 'Pellicle', '비고'];

export function newProcess(processes = [], patch = {}) {
  return {
    id: uid('pr'),
    name: `Process ${processes.length + 1}`,
    desc: '',
    parts: [
      { name: 'FEOL', gdsOffset: 0, step1Tat: 5 },
      { name: 'BEOL', gdsOffset: 14, step1Tat: 3 },
    ],
    beolOptions: ['기본'],
    beolMeta: {}, // { [BEOL Option]: { concept, stack: [rowId…] } }
    feolOptions: [{ id: 'por', name: 'POR', por: true, modules: {} }], // modules: { [Module]: Module Option }
    feolModules: [], // Layer가 아직 없는 Module도 목록에 두기 위해
    moduleOptions: {}, // { [Module]: [Module Option…] } (첫 번째가 기본)
    columns: [...DEFAULT_SPEC_COLUMNS],
    rows: [], // { id, part, module, modOpt?, layer, type, spec: { [column]: value } }
    ...patch,
  };
}

/** 예시 공정: mto-scheduling-agent 예시 30장 — FEOL(FEOL·MOL Module) 15장 + BEOL Option 15M(15장) / 11M(11장) */
export function exampleProcess(processes = []) {
  const feol = EXAMPLE_LAYERS.filter((l) => l.part === 'FEOL').map((l) => ({ id: uid('ly'), part: 'FEOL', module: l.no <= 8 ? 'FEOL' : 'MOL', modOpt: l.layer === 'A-13' ? 'Base' : '', layer: l.layer, type: l.type, spec: {} }));
  // MOL Module에 HD 변형 예시: A-13 대신 A-13H를 쓰는 Module Option
  const i13 = feol.findIndex((r) => r.layer === 'A-13');
  feol.splice(i13 + 1, 0, { id: uid('ly'), part: 'FEOL', module: 'MOL', modOpt: 'HD', layer: 'A-13H', type: 'Z', spec: {} });
  const beol = EXAMPLE_LAYERS.filter((l) => l.part === 'BEOL');
  const opt = (name, n) => beol.slice(0, n).map((l) => ({ id: uid('ly'), part: 'BEOL', module: name, layer: l.layer, type: l.type, spec: {} }));
  return newProcess(processes, {
    name: '예시 공정',
    desc: 'mto-scheduling-agent 예시 — FEOL 15장 (FEOL · MOL, FEOL Concept POR · HD) / BEOL Option 15M · 11M',
    beolOptions: ['15M', '11M'],
    beolMeta: { '15M': { concept: '15층 (예시)', stack: [] }, '11M': { concept: '11층 (예시)', stack: [] } },
    feolOptions: [{ id: 'por', name: 'POR', por: true, modules: { MOL: 'Base' } }, { id: uid('fo'), name: 'HD', por: false, modules: { MOL: 'HD' } }],
    moduleOptions: { MOL: ['Base', 'HD'] },
    rows: [...feol, ...opt('15M', 15), ...opt('11M', 11)],
  });
}

const PART_MAP = { A: 'FEOL', B: 'BEOL' };
export const isBeol = (r) => r.part === 'BEOL';

/** BEOL Option 목록 (정해 둔 순서 + 시트에만 있는 Option) */
export function beolOptionsOf(proc) {
  const out = [...(proc?.beolOptions || [])];
  for (const r of proc?.rows || []) if (isBeol(r) && r.module && !out.includes(r.module)) out.push(r.module);
  return out;
}

/** FEOL Concept 목록 (POR이 맨 앞) */
export function feolOptionsOf(proc) {
  const list = proc?.feolOptions?.length ? proc.feolOptions : [{ id: 'por', name: 'POR', por: true, modules: {} }];
  return [...list.filter((o) => o.por), ...list.filter((o) => !o.por)];
}
export const porOf = (proc) => feolOptionsOf(proc)[0];
export const feolOptionOf = (proc, id) => feolOptionsOf(proc).find((o) => o.id === id) || porOf(proc);

/** FEOL Module 목록 (시트 순서 + 아직 Layer 없는 Module) */
export function modulesOf(proc) {
  const out = [];
  for (const r of proc?.rows || []) if (!isBeol(r) && r.module && !out.includes(r.module)) out.push(r.module);
  for (const m of proc?.feolModules || []) if (!out.includes(m)) out.push(m);
  return out;
}
/** Module의 Module Option (첫 번째가 기본). 시트에만 있는 Option도 포함 */
export function moduleOptionsOf(proc, module) {
  const out = [...(proc?.moduleOptions?.[module] || [])];
  for (const r of proc?.rows || []) if (!isBeol(r) && r.module === module && r.modOpt && !out.includes(r.modOpt)) out.push(r.modOpt);
  return out;
}
/** FEOL Concept이 이 Module에서 쓰는 Module Option (정하지 않았으면 첫 번째) */
export const chosenModOpt = (proc, fo, module) => fo?.modules?.[module] ?? moduleOptionsOf(proc, module)[0] ?? '';

/** FEOL Concept에 들어가는 FEOL Layer (공통 Layer + 고른 Module Option Layer) */
export function feolRowsOf(proc, feolOptionId) {
  const fo = feolOptionOf(proc, feolOptionId);
  return (proc?.rows || []).filter((r) => !isBeol(r) && (!r.modOpt || r.modOpt === chosenModOpt(proc, fo, r.module)));
}

/** BEOL Option의 컨셉 · 쌓는 순서 */
export const beolMetaOf = (proc, option) => ({ concept: '', stack: [], ...(proc?.beolMeta?.[option] || {}) });
/** BEOL Option Layer: 정한 순서(stack)가 있으면 그 순서, 나머지는 시트 순서로 뒤에 */
export function beolRowsOf(proc, option) {
  const rows = (proc?.rows || []).filter((r) => isBeol(r) && r.module === option);
  const stack = beolMetaOf(proc, option).stack.filter((id) => rows.some((r) => r.id === id));
  return [...stack.map((id) => rows.find((r) => r.id === id)), ...rows.filter((r) => !stack.includes(r.id))];
}
/** Layer 이름으로 Metal / Via 구분 (M1, Mx, V1, Via…) */
export const layerKind = (name) => (/^(v|via)\s*\d*/i.test(name || '') ? 'via' : /^(m|metal)\s*\d*/i.test(name || '') ? 'metal' : 'etc');

/** Product Set List에 들어갈 공정 Layer: FEOL Concept의 FEOL + BEOL Option (BEOL은 쌓는 순서) */
export function setRowsOf(proc, option, feolOptionId) {
  if (!proc) return [];
  const opt = option ?? beolOptionsOf(proc)[0];
  return [...feolRowsOf(proc, feolOptionId), ...beolRowsOf(proc, opt)];
}

/** 예전 공정(Part A/B) → FEOL/BEOL, BEOL Module → BEOL Option */
export function migrateProcess(proc) { // eslint-disable-line no-param-reassign
  const rename = (n) => PART_MAP[n] || n;
  const parts = (proc.parts || []).map((p) => ({ ...p, name: rename(p.name) }));
  if (!parts.some((p) => p.name === 'FEOL')) parts.unshift({ name: 'FEOL', gdsOffset: 0, step1Tat: 5 });
  if (!parts.some((p) => p.name === 'BEOL')) parts.push({ name: 'BEOL', gdsOffset: 14, step1Tat: 3 });
  // 0.17~0.18의 예시 공정은 BEOL을 BEOL-1 · BEOL-2 Module로 나눠 둠 → 한 Option(15M)으로 합친다
  const oldExample = proc.name === '예시 공정' && !proc.beolOptions && (proc.rows || []).some((r) => r.module === 'BEOL-1');
  const rows = (proc.rows || []).map((r) => {
    const part = rename(r.part);
    const module = part === 'BEOL' && oldExample && /^BEOL-[12]$/.test(r.module) ? '15M' : r.module;
    return { ...r, part, module: part === 'BEOL' && !module ? '기본' : module };
  });
  if (oldExample) proc = { ...proc, desc: 'mto-scheduling-agent 예시 — FEOL 15장 (FEOL · MOL) / BEOL Option 15M' };
  const out = { ...proc, parts, rows };
  out.beolOptions = beolOptionsOf({ ...out, beolOptions: proc.beolOptions || [] });
  if (!out.beolOptions.length) out.beolOptions = ['기본'];
  out.beolMeta = proc.beolMeta || {};
  out.feolOptions = proc.feolOptions?.length ? proc.feolOptions : [{ id: 'por', name: 'POR', por: true, modules: {} }];
  out.feolModules = proc.feolModules || [];
  out.moduleOptions = proc.moduleOptions || {};
  return out;
}

/** Part → Module → rows 트리 (시트 순서 유지) */
export function processTree(proc) {
  const parts = proc.parts.map((p) => ({ ...p, modules: [] }));
  const byName = new Map(parts.map((p) => [p.name, p]));
  for (const r of proc.rows) {
    let p = byName.get(r.part);
    if (!p) {
      p = { name: r.part || '(Part 없음)', gdsOffset: 0, step1Tat: 0, modules: [], orphan: true };
      byName.set(r.part, p);
      parts.push(p);
    }
    let m = p.modules.find((x) => x.name === (r.module || ''));
    if (!m) p.modules.push((m = { name: r.module || '', rows: [] }));
    m.rows.push(r);
  }
  // BEOL은 Option 순서대로, 아직 Layer가 없는 Option도 보여 준다
  const beol = byName.get('BEOL');
  if (beol) {
    const opts = beolOptionsOf(proc);
    for (const o of opts) if (!beol.modules.some((m) => m.name === o)) beol.modules.push({ name: o, rows: [] });
    beol.modules.sort((x, y) => opts.indexOf(x.name) - opts.indexOf(y.name));
  }
  return parts;
}

/** 공정의 Part 설정 → 엔진 설정 (Part별 STEP1 TAT · GDS 간격 · 순서) */
export function processConfig(proc) {
  return {
    step1Tat: Object.fromEntries(proc.parts.map((p) => [p.name, p.step1Tat])),
    partOffsets: Object.fromEntries(proc.parts.map((p) => [p.name, p.gdsOffset])),
    partOrder: proc.parts.map((p) => p.name),
  };
}

/**
 * Product Layer(공정 Layer를 가리키는 ref) → 계산용 Layer.
 * 공정에서 지워진 Layer는 missing 으로 표시한다.
 */
export function resolveLayers(layers, proc) {
  const map = new Map((proc?.rows || []).map((r) => [r.id, r]));
  return layers.map((l) => {
    if (!l.ref) return l;
    const r = map.get(l.ref);
    if (!r) return { ...l, missing: true };
    return { ...l, part: r.part, module: r.module, layer: r.layer, type: r.type };
  });
}

/** Product에 담을 때: 고른 공정 Layer들 → [{ no, ref }] (시트 순서) */
export function layersFromRows(rows, startNo = 1) {
  return rows.map((r, i) => ({ no: startNo + i, ref: r.id }));
}

const HEAD = { part: /^(part|파트)$/i, module: /^(module|모듈|option|beol ?option|옵션)$/i, layer: /^(layer|레이어|name)$/i, type: /^(type|타입)$/i };

/** 엑셀 붙여넣기: 머리줄이 있으면 열 이름으로(SPEC 열 포함), 없으면 Part · Module · Layer · Type · SPEC… 순서 */
export function parseProcessRows(text, columns) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], newColumns: [] };
  const split = (line) => (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim().replace(/^"|"$/g, ''));
  const first = split(lines[0]);
  const idx = Object.fromEntries(Object.entries(HEAD).map(([k, re]) => [k, first.findIndex((c) => re.test(c))]));
  let specIdx = [];
  let newColumns = [];
  if (idx.layer >= 0) {
    lines.shift();
    first.forEach((c, i) => {
      if (Object.values(idx).includes(i) || !c || /^(no|번호|#)$/i.test(c)) return;
      specIdx.push([c, i]);
      if (!columns.includes(c)) newColumns.push(c);
    });
  } else {
    Object.assign(idx, { part: 0, module: 1, layer: 2, type: 3 });
    specIdx = columns.map((c, i) => [c, 4 + i]);
  }
  const rows = lines
    .map(split)
    .map((c) => ({
      id: uid('ly'),
      part: (() => { const v = String(c[idx.part] ?? '').toUpperCase().trim(); return PART_MAP[v] || v; })(),
      module: c[idx.module] ?? '',
      layer: c[idx.layer] ?? '',
      type: String(c[idx.type] ?? '').toUpperCase().trim(),
      spec: Object.fromEntries(specIdx.map(([k, i]) => [k, c[i] ?? '']).filter(([, v]) => v !== '')),
    }))
    .filter((r) => r.layer);
  return { rows, newColumns };
}

/** 시트 → 엑셀용 텍스트 */
export function processToTsv(proc) {
  const head = ['Part', 'Module', 'Layer', 'Type', ...proc.columns];
  const body = proc.rows.map((r) => [r.part, r.module, r.layer, r.type, ...proc.columns.map((c) => r.spec?.[c] ?? '')].map((v) => String(v).replace(/\t|\n/g, ' ')).join('\t'));
  return [head.join('\t'), ...body].join('\n');
}

/** 시트 확인: Part가 공정에 없거나, Type을 모르거나, Layer 이름이 겹치는 줄 */
export function checkProcess(proc, types) {
  const out = [];
  const partNames = new Set(proc.parts.map((p) => p.name));
  const seen = new Map();
  proc.rows.forEach((r, i) => {
    if (!partNames.has(r.part)) out.push({ id: r.id, field: 'part', msg: `${i + 1}행 ${r.layer || ''}: Part '${r.part}'가 공정에 없습니다.` });
    if (!types.includes(r.type)) out.push({ id: r.id, field: 'type', msg: `${i + 1}행 ${r.layer || ''}: Type '${r.type}'를 모릅니다 (${types.join('/')}).` });
    if (!r.layer) out.push({ id: r.id, field: 'layer', msg: `${i + 1}행: Layer 이름이 비어 있습니다.` });
    const k = `${r.part}/${r.layer}`;
    if (r.layer && seen.has(k)) out.push({ id: r.id, field: 'layer', msg: `${r.part} · ${r.layer}가 두 번 있습니다.` });
    seen.set(k, true);
  });
  return out;
}
