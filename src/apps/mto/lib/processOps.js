// 공정 편집 (순수 함수): 바뀐 공정 객체를 돌려준다. 화면에서는 updateProcess로 그대로 저장.
import { beolMetaOf, feolOptionsOf, isBeol, moduleOptionsOf, modulesOf, uid } from './process.js';

const feolOpts = (proc) => (proc.feolOptions?.length ? proc.feolOptions : feolOptionsOf(proc));

// ── FEOL Module
export function addModule(proc, name) {
  if (!name || modulesOf(proc).includes(name)) return proc;
  return { ...proc, feolModules: [...(proc.feolModules || []), name] };
}
export function renameModule(proc, from, to) {
  if (!to || from === to || modulesOf(proc).includes(to)) return proc;
  const { [from]: mo, ...restMo } = proc.moduleOptions || {};
  return {
    ...proc,
    rows: proc.rows.map((r) => (!isBeol(r) && r.module === from ? { ...r, module: to } : r)),
    feolModules: (proc.feolModules || []).map((m) => (m === from ? to : m)),
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
