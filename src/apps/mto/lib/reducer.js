// MTO 상태 변경 (React 없이 테스트할 수 있게 따로 둔다)
import { DEFAULT_CONFIG, normalizeConfig } from './scheduler.js';
import { newProject } from './projects.js';
import { beolOptionsOf, beolRowsOf, exampleProcess, feolRowsOf, isBeol, newProcess, porOf, setRowsOf } from './process.js';

const refs = (rows, start = 1) => rows.map((r, i) => ({ no: start + i, ref: r.id }));

const mapActive = (state, fn) => ({ ...state, projects: state.projects.map((p) => (p.id === state.activeId ? fn(p) : p)) });
const kindOf = (state, id) => state.projects.find((p) => p.id === id)?.kind;
const withActive = (state, id) => {
  const kind = kindOf(state, id);
  if (!kind) return state;
  return { ...state, section: kind, activeByKind: { ...state.activeByKind, [kind]: id }, activeId: id };
};

export function mtoReducer(state, a) {
  switch (a.type) {
    case 'section': {
      const id = state.activeByKind[a.section] && kindOf(state, state.activeByKind[a.section]) ? state.activeByKind[a.section] : state.projects.find((p) => p.kind === a.section)?.id || null;
      return { ...state, section: a.section, activeId: id, activeByKind: { ...state.activeByKind, [a.section]: id }, prevLayers: null };
    }
    case 'select':
      return { ...withActive(state, a.id), prevLayers: null };
    case 'addProject': {
      let patch = a.patch || {};
      if (a.kind === 'product' && patch.processId === undefined) {
        // Product는 Set List가 거의 다 나가므로 기준 공정의 Layer를 모두 담고 시작
        const proc = state.processes.find((x) => x.id === (state.lastProcessId || '')) || state.processes[0];
        if (proc) {
          const option = beolOptionsOf(proc)[0] || null;
          patch = { processId: proc.id, beolOption: option, feolOption: porOf(proc).id, layers: refs(setRowsOf(proc, option, porOf(proc).id)), ...patch };
        }
      }
      if (a.kind === 'revision') {
        // Revision ITEM은 Product가 있어야 만든다
        const parent = state.projects.find((x) => x.id === patch.parentId && x.kind === 'product');
        if (!parent) return state;
        const n = state.projects.filter((x) => x.kind === 'revision' && x.parentId === parent.id).length + 1;
        patch = { name: `${parent.name} REV${String(n).padStart(2, '0')}`, processId: parent.processId || null, ...patch };
      }
      const p = newProject(a.kind, state.projects, patch);
      return { ...withActive({ ...state, projects: [...state.projects, p] }, p.id), prevLayers: null };
    }
    case 'duplicateProject': {
      const src = state.projects.find((p) => p.id === a.id);
      if (!src) return state;
      const copy = { ...structuredClone(src), id: newProject(src.kind).id, name: `${src.name} 복사` };
      const i = state.projects.indexOf(src);
      return withActive({ ...state, projects: [...state.projects.slice(0, i + 1), copy, ...state.projects.slice(i + 1)] }, copy.id);
    }
    case 'removeProject': {
      // Product를 지우면 거기 딸린 Revision ITEM도 같이 지운다 (되돌리기 가능)
      const target = state.projects.find((p) => p.id === a.id);
      if (!target) return state;
      const gone = new Set([a.id, ...(target.kind === 'product' ? state.projects.filter((p) => p.parentId === a.id).map((p) => p.id) : [])]);
      const projects = state.projects.filter((p) => !gone.has(p.id));
      const pick = (k) => (gone.has(state.activeByKind[k]) ? projects.find((p) => p.kind === k)?.id || null : state.activeByKind[k]);
      const activeByKind = { product: pick('product'), revision: pick('revision') };
      return { ...state, projects, activeByKind, activeId: activeByKind[state.section], removed: { projects: state.projects, activeByKind: state.activeByKind, activeId: state.activeId }, prevLayers: null };
    }
    case 'restoreProject': {
      if (!state.removed) return state;
      return { ...state, ...state.removed, removed: null };
    }
    case 'moveProject': {
      // 같은 종류(Product끼리, ITEM끼리) 안에서 한 칸 옮긴다
      const i = state.projects.findIndex((p) => p.id === a.id);
      if (i < 0) return state;
      let j = i + a.dir;
      while (j >= 0 && j < state.projects.length && state.projects[j].kind !== state.projects[i].kind) j += a.dir;
      if (j < 0 || j >= state.projects.length) return state;
      const projects = [...state.projects];
      [projects[i], projects[j]] = [projects[j], projects[i]];
      return { ...state, projects };
    }
    case 'project': {
      // 선택한 묶음의 이름·GDS·Revision 설정. ITEM의 Product를 바꾸면 기준 공정도 Product를 따라감
      if (a.patch.parentId) {
        const parent = state.projects.find((x) => x.id === a.patch.parentId);
        return mapActive(state, (p) => ({ ...p, ...a.patch, processId: parent?.processId || null, layers: parent?.processId === p.processId ? p.layers : [] }));
      }
      return mapActive(state, (p) => ({ ...p, ...a.patch }));
    }
    case 'gds':
      return mapActive(state, (p) => ({ ...p, gds: a.value }));
    case 'override': // 선택한 묶음의 하루 MTO 수 · STEP2 동시 진행 수
      return mapActive(state, (p) => ({ ...p, override: { ...(p.override || {}), ...a.patch } }));
    case 'clearOverride':
      return mapActive(state, (p) => ({ ...p, override: {} }));
    case 'layers': {
      const cur = state.projects.find((p) => p.id === state.activeId);
      return { ...mapActive(state, (p) => ({ ...p, layers: a.layers })), prevLayers: a.keepUndo ? cur?.layers || [] : null };
    }
    case 'undoLayers':
      return state.prevLayers ? { ...mapActive(state, (p) => ({ ...p, layers: state.prevLayers })), prevLayers: null } : state;
    case 'setProcess': {
      // 기준 공정을 바꾸면 Layer는 새 공정에서 다시 고른다 (되돌리기 가능)
      const cur = state.projects.find((p) => p.id === (a.id || state.activeId));
      if (!cur) return state;
      const keep = !a.processId && !cur.layers.some((l) => l.ref);
      // Product는 새 공정의 Layer를 모두 담고 시작 (Set List 전체)
      const proc = state.processes.find((x) => x.id === a.processId);
      const option = proc ? beolOptionsOf(proc)[0] || null : null;
      const feolOption = proc ? porOf(proc).id : null;
      const full = proc && cur.kind === 'product' ? refs(setRowsOf(proc, option, feolOption)) : [];
      const next = { ...state, projects: state.projects.map((p) => (p.id === cur.id ? { ...p, processId: a.processId || null, beolOption: option, feolOption, layers: keep ? p.layers : full } : p)) };
      // 이 Product의 ITEM도 같은 공정을 따른다 (담은 Layer는 다시 골라야 함)
      if (cur.kind === 'product') next.projects = next.projects.map((p) => (p.parentId === cur.id && p.processId !== (a.processId || null) ? { ...p, processId: a.processId || null, layers: [] } : p));
      return { ...next, prevLayers: keep ? null : cur.layers, prevProcessId: cur.processId, lastProcessId: a.processId || state.lastProcessId };
    }
    case 'pickAllFromProcess': {
      const cur = state.projects.find((p) => p.id === state.activeId);
      const proc = state.processes.find((x) => x.id === cur?.processId);
      if (!proc) return state;
      return { ...mapActive(state, (p) => ({ ...p, layers: refs(setRowsOf(proc, p.beolOption, p.feolOption)) })), prevLayers: cur.layers };
    }
    case 'setBeolOption': {
      // BEOL Option을 바꾸면 FEOL은 그대로 두고 BEOL Layer만 새 Option으로 바꾼다
      const cur = state.projects.find((p) => p.id === (a.id || state.activeId));
      const proc = state.processes.find((x) => x.id === cur?.processId);
      if (!cur || !proc) return state;
      const rowOf = new Map(proc.rows.map((r) => [r.id, r]));
      const feol = cur.layers.filter((l) => !(rowOf.get(l.ref) && isBeol(rowOf.get(l.ref))));
      const start = feol.reduce((m, l) => Math.max(m, Number.isFinite(l.no) ? l.no : 0), 0) + 1;
      const beol = refs(beolRowsOf(proc, a.option), start);
      return { ...state, projects: state.projects.map((p) => (p.id === cur.id ? { ...p, beolOption: a.option, layers: [...feol, ...beol] } : p)), prevLayers: cur.id === state.activeId ? cur.layers : state.prevLayers };
    }
    case 'setFeolOption': {
      // FEOL Option을 바꾸면 BEOL은 그대로 두고 FEOL Layer만 새 Option 조합으로 바꾼다
      const cur = state.projects.find((p) => p.id === (a.id || state.activeId));
      const proc = state.processes.find((x) => x.id === cur?.processId);
      if (!cur || !proc) return state;
      const rowOf = new Map(proc.rows.map((r) => [r.id, r]));
      const beol = cur.layers.filter((l) => rowOf.get(l.ref) && isBeol(rowOf.get(l.ref)));
      const feol = refs(feolRowsOf(proc, a.option));
      const shift = feol.length;
      return { ...state, projects: state.projects.map((p) => (p.id === cur.id ? { ...p, feolOption: a.option, layers: [...feol, ...beol.map((l, i) => ({ ...l, no: shift + i + 1 }))] } : p)), prevLayers: cur.id === state.activeId ? cur.layers : state.prevLayers };
    }
    case 'updateProject': // 목록 화면(Product 정보)에서 아무 Product나 고칠 때
      return { ...state, projects: state.projects.map((p) => (p.id === a.id ? { ...p, ...a.patch, info: a.patch.info ? { ...(p.info || {}), ...a.patch.info } : p.info } : p)) };
    case 'productColumns':
      return { ...state, productColumns: a.columns };
    case 'renameBeolOption': {
      const { id, from, to } = a;
      return {
        ...state,
        processes: state.processes.map((x) => {
          if (x.id !== id) return x;
          const { [from]: meta, ...restMeta } = x.beolMeta || {};
          return { ...x, beolOptions: beolOptionsOf(x).map((o) => (o === from ? to : o)), beolMeta: meta ? { ...restMeta, [to]: meta } : restMeta, rows: x.rows.map((r) => (isBeol(r) && r.module === from ? { ...r, module: to } : r)) };
        }),
        projects: state.projects.map((p) => (p.processId === id && p.beolOption === from ? { ...p, beolOption: to } : p)),
      };
    }
    case 'undoProcess': {
      return { ...mapActive(state, (p) => ({ ...p, processId: state.prevProcessId ?? null, layers: state.prevLayers || p.layers })), prevLayers: null };
    }
    case 'addProcess': {
      // Reference Copy: 기존 공정을 그대로 복사해서 시작 / 새로 Setting: 빈 공정 (FEOL · BEOL, POR, BEOL Option 하나)
      const src = a.copyFrom && state.processes.find((x) => x.id === a.copyFrom);
      const pr = a.example
        ? exampleProcess(state.processes)
        : src
          ? { ...structuredClone(src), id: newProcess().id, name: a.name || `${src.name} 복사`, desc: a.desc ?? src.desc }
          : newProcess(state.processes, a.patch);
      return { ...state, processes: [...state.processes, pr], lastProcessId: pr.id };
    }
    case 'updateProcess':
      return { ...state, processes: state.processes.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) };
    case 'duplicateProcess': {
      const src = state.processes.find((x) => x.id === a.id);
      if (!src) return state;
      const copy = { ...structuredClone(src), id: newProcess().id, name: `${src.name} 복사` };
      return { ...state, processes: [...state.processes, copy], lastProcessId: copy.id };
    }
    case 'removeProcess': {
      const i = state.processes.findIndex((x) => x.id === a.id);
      return { ...state, processes: state.processes.filter((x) => x.id !== a.id), removedProcess: { process: state.processes[i], index: i } };
    }
    case 'restoreProcess': {
      if (!state.removedProcess) return state;
      const processes = [...state.processes];
      processes.splice(state.removedProcess.index, 0, state.removedProcess.process);
      return { ...state, processes, removedProcess: null, lastProcessId: state.removedProcess.process.id };
    }
    case 'config':
      return { ...state, config: normalizeConfig({ ...state.config, ...a.patch }) };
    case 'resetConfig':
      return { ...state, config: normalizeConfig(DEFAULT_CONFIG) };
    default:
      return state;
  }
}

