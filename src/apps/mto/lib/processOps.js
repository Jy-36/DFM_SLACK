// 공정 편집 (순수 함수): 바뀐 공정 객체를 돌려준다. 화면에서는 updateProcess로 그대로 저장.
import { beolMetaOf, beolOptionsOf, chosenModOpt, feolOptionsOf, feolRowsOf, isBeol, moduleOptionsOf, modulesOf, porOf, uid } from './process.js';

const feolOpts = (proc) => (proc.feolOptions?.length ? proc.feolOptions : feolOptionsOf(proc));

// ── FEOL Module
export function addModule(proc, name, options = []) {
  if (!name || modulesOf(proc).includes(name)) return proc;
  const opts = [...new Set(options.map((x) => x.trim()).filter(Boolean))];
  return {
    ...proc,
    feolModules: [...(proc.feolModules || []), name],
    moduleOrder: [...modulesOf(proc), name],
    moduleOptions: opts.length ? { ...(proc.moduleOptions || {}), [name]: opts } : proc.moduleOptions || {},
  };
}
/** Module 순서 바꾸기: 목록 순서와 시트의 FEOL Layer 순서를 같이 바꾼다 (BEOL 자리는 그대로) */
export function moveModule(proc, name, d) {
  const order = modulesOf(proc);
  const i = order.indexOf(name);
  const j = i + d;
  if (i < 0 || j < 0 || j >= order.length) return proc;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...proc, moduleOrder: order, rows: sortFeolRows(proc.rows, order) };
}
function sortFeolRows(rows, order) {
  const at = [];
  const feol = [];
  rows.forEach((r, k) => { if (!isBeol(r)) { at.push(k); feol.push(r); } });
  const rank = (r) => { const x = order.indexOf(r.module); return x < 0 ? order.length : x; };
  const sorted = feol.map((r, k) => [r, k]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([r]) => r);
  const out = [...rows];
  at.forEach((k, n) => { out[k] = sorted[n]; });
  return out;
}
export function renameModule(proc, from, to) {
  if (!to || from === to || modulesOf(proc).includes(to)) return proc;
  const { [from]: mo, ...restMo } = proc.moduleOptions || {};
  return {
    ...proc,
    rows: proc.rows.map((r) => (!isBeol(r) && r.module === from ? { ...r, module: to } : r)),
    feolModules: (proc.feolModules || []).map((m) => (m === from ? to : m)),
    moduleOrder: (proc.moduleOrder || []).map((m) => (m === from ? to : m)),
    moduleOptions: mo ? { ...restMo, [to]: mo } : restMo,
    feolOptions: feolOpts(proc).map((o) => {
      if (!o.modules || !(from in o.modules)) return o;
      const { [from]: v, ...rest } = o.modules;
      return { ...o, modules: { ...rest, [to]: v } };
    }),
  };
}
export function deleteModule(proc, name) {
  if (proc.rows.some((r) => !isBeol(r) && r.module === name)) return proc;
  const { [name]: _, ...restMo } = proc.moduleOptions || {};
  return {
    ...proc,
    feolModules: (proc.feolModules || []).filter((m) => m !== name),
    moduleOrder: (proc.moduleOrder || []).filter((m) => m !== name),
    moduleOptions: restMo,
    feolOptions: feolOpts(proc).map((o) => {
      const { [name]: __, ...rest } = o.modules || {};
      return { ...o, modules: rest };
    }),
  };
}

// ── Module Option (Module 안의 변형)
export function addModOpt(proc, module, name) {
  const list = moduleOptionsOf(proc, module);
  if (!name || list.includes(name)) return proc;
  // 처음 만들 때는 기본(Base)을 먼저 둔다
  const next = list.length ? [...list, name] : name === 'Base' ? ['Base'] : ['Base', name];
  return { ...proc, moduleOptions: { ...(proc.moduleOptions || {}), [module]: next } };
}
export function renameModOpt(proc, module, from, to) {
  const list = moduleOptionsOf(proc, module);
  if (!to || from === to || list.includes(to)) return proc;
  return {
    ...proc,
    moduleOptions: { ...(proc.moduleOptions || {}), [module]: list.map((x) => (x === from ? to : x)) },
    rows: proc.rows.map((r) => (!isBeol(r) && r.module === module && r.modOpt === from ? { ...r, modOpt: to } : r)),
    feolOptions: feolOpts(proc).map((o) => (o.modules?.[module] === from ? { ...o, modules: { ...o.modules, [module]: to } } : o)),
  };
}
export function deleteModOpt(proc, module, name) {
  if (proc.rows.some((r) => !isBeol(r) && r.module === module && r.modOpt === name)) return proc;
  return {
    ...proc,
    moduleOptions: { ...(proc.moduleOptions || {}), [module]: moduleOptionsOf(proc, module).filter((x) => x !== name) },
    feolOptions: feolOpts(proc).map((o) => {
      if (o.modules?.[module] !== name) return o;
      const { [module]: _, ...rest } = o.modules;
      return { ...o, modules: rest };
    }),
  };
}

// ── FEOL Concept (Module Option 조합, POR 하나)
export function addFeolOption(proc, name, copyFrom) {
  if (!name || feolOptionsOf(proc).some((o) => o.name === name)) return { proc, id: null };
  const base = feolOptionsOf(proc).find((o) => o.id === copyFrom) || feolOptionsOf(proc)[0];
  const id = uid('fo');
  return { proc: { ...proc, feolOptions: [...feolOpts(proc), { id, name, por: false, modules: { ...(base?.modules || {}) } }] }, id };
}
export const updateFeolOption = (proc, id, patch) => ({ ...proc, feolOptions: feolOpts(proc).map((o) => (o.id === id ? { ...o, ...patch } : o)) });
export const setPor = (proc, id) => ({ ...proc, feolOptions: feolOpts(proc).map((o) => ({ ...o, por: o.id === id })) });
export const setFeolModOpt = (proc, id, module, modOpt) => ({ ...proc, feolOptions: feolOpts(proc).map((o) => (o.id === id ? { ...o, modules: { ...(o.modules || {}), [module]: modOpt } } : o)) });
export function deleteFeolOption(proc, id) {
  const list = feolOpts(proc).filter((o) => o.id !== id);
  if (!list.length) return proc;
  if (!list.some((o) => o.por)) list[0] = { ...list[0], por: true };
  return { ...proc, feolOptions: list };
}

// ── BEOL Option 컨셉 · 쌓는 순서
export const setBeolMeta = (proc, option, patch) => ({ ...proc, beolMeta: { ...(proc.beolMeta || {}), [option]: { ...beolMetaOf(proc, option), ...patch } } });

/** Module Option을 기본(POR)으로: POR Concept이 이 Option을 쓰고, 목록 맨 앞으로 */
export function setDefaultModOpt(proc, module, opt) {
  const list = moduleOptionsOf(proc, module);
  if (!list.includes(opt)) return proc;
  const next = { ...proc, moduleOptions: { ...(proc.moduleOptions || {}), [module]: [opt, ...list.filter((x) => x !== opt)] } };
  return setFeolModOpt(next, porOf(proc).id, module, opt);
}

/** Concept의 Module Option을 바꾸면 빠지고 들어오는 Layer */
export function modOptChange(proc, foId, module, to) {
  const fo = feolOptionsOf(proc).find((o) => o.id === foId);
  const from = chosenModOpt(proc, fo, module);
  const rows = proc.rows.filter((r) => !isBeol(r) && r.module === module && r.modOpt);
  return { from, to, out: rows.filter((r) => r.modOpt === from && from !== to), in: rows.filter((r) => r.modOpt === to && from !== to) };
}

/** BEOL Option 추가: 빈 Option 또는 기존 Option의 Layer를 복사 */
export function addBeolOption(proc, name, { concept = '', copyFrom } = {}) {
  if (!name || beolOptionsOf(proc).includes(name)) return proc;
  let rows = proc.rows;
  let stack = [];
  if (copyFrom) {
    const map = new Map();
    const copies = proc.rows.filter((r) => isBeol(r) && r.module === copyFrom).map((r) => {
      const id = uid('ly');
      map.set(r.id, id);
      return { ...structuredClone(r), id, module: name };
    });
    rows = [...proc.rows, ...copies];
    stack = beolMetaOf(proc, copyFrom).stack.map((id) => map.get(id)).filter(Boolean);
  }
  return { ...proc, rows, beolOptions: [...beolOptionsOf(proc), name], beolMeta: { ...(proc.beolMeta || {}), [name]: { concept, stack } } };
}

/** FEOL Concept 추가 (기준 Concept의 Module Option 조합에서 시작) — feolRowsOf 미리보기용 export */
export const conceptRows = (proc, foId) => feolRowsOf(proc, foId);
