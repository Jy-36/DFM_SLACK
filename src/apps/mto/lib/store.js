// MTO 탭 상태: Product·Revision 목록 + 규칙(전체 기본값). WorkTime과 같이 localStorage에 저장한다.
// 목록 순서 = 화면에 보이는 순서(우선순위). 묶음마다 따로 계산한다.
import { useEffect, useReducer } from 'react';
import { DEFAULT_CONFIG, normalizeConfig } from './scheduler.js';
import { newProject } from './projects.js';
import { exampleProcess, newProcess } from './process.js';

const KEY = 'mto.v2';
const LEGACY = 'mto.v1'; // 0.15.x: Product 하나 { gds, layers, config }

const readJson = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};

function init() {
  const s = readJson(KEY);
  // 공정 마스터가 없으면 예시 공정 하나로 시작 (지워도 됨)
  const processes = Array.isArray(s?.processes) ? s.processes : [exampleProcess()];
  if (s?.projects?.length) {
    return { projects: s.projects, processes, activeId: s.projects.some((p) => p.id === s.activeId) ? s.activeId : s.projects[0].id, config: normalizeConfig(s.config || DEFAULT_CONFIG), prevLayers: null };
  }
  // 예전 버전에서 넘어오면 기존 입력을 Product 1로 옮긴다
  const old = readJson(LEGACY);
  const config = normalizeConfig(old?.config || DEFAULT_CONFIG);
  const first = newProject('product', [], { gds: old?.gds || '', layers: Array.isArray(old?.layers) ? old.layers : [] });
  return { projects: [first], processes, activeId: first.id, config, prevLayers: null };
}

const mapActive = (state, fn) => ({ ...state, projects: state.projects.map((p) => (p.id === state.activeId ? fn(p) : p)) });

function reducer(state, a) {
  switch (a.type) {
    case 'select':
      return { ...state, activeId: a.id, prevLayers: null };
    case 'addProject': {
      const p = newProject(a.kind, state.projects, a.patch);
      return { ...state, projects: [...state.projects, p], activeId: p.id, prevLayers: null };
    }
    case 'duplicateProject': {
      const src = state.projects.find((p) => p.id === a.id);
      if (!src) return state;
      const copy = { ...structuredClone(src), id: newProject(src.kind).id, name: `${src.name} 복사` };
      const i = state.projects.indexOf(src);
      return { ...state, projects: [...state.projects.slice(0, i + 1), copy, ...state.projects.slice(i + 1)], activeId: copy.id };
    }
    case 'removeProject': {
      const rest = state.projects.filter((p) => p.id !== a.id);
      const projects = rest.length ? rest : [newProject('product')];
      const i = state.projects.findIndex((p) => p.id === a.id);
      const activeId = state.activeId === a.id ? projects[Math.max(0, Math.min(i, projects.length - 1))].id : state.activeId;
      return { ...state, projects, activeId, removed: { project: state.projects[i], index: i }, prevLayers: null };
    }
    case 'restoreProject': {
      if (!state.removed) return state;
      const { project, index } = state.removed;
      const projects = [...state.projects];
      projects.splice(index, 0, project);
      return { ...state, projects, activeId: project.id, removed: null };
    }
    case 'moveProject': {
      const i = state.projects.findIndex((p) => p.id === a.id);
      const j = i + a.dir;
      if (i < 0 || j < 0 || j >= state.projects.length) return state;
      const projects = [...state.projects];
      [projects[i], projects[j]] = [projects[j], projects[i]];
      return { ...state, projects };
    }
    case 'project': // 선택한 묶음의 이름·GDS·Revision 설정
      return mapActive(state, (p) => ({ ...p, ...a.patch }));
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
      const cur = state.projects.find((p) => p.id === state.activeId);
      const keep = !a.processId && !cur.layers.some((l) => l.ref);
      return { ...mapActive(state, (p) => ({ ...p, processId: a.processId || null, layers: keep ? p.layers : [] })), prevLayers: keep ? null : cur.layers, prevProcessId: cur.processId };
    }
    case 'pickAllFromProcess': {
      const cur = state.projects.find((p) => p.id === state.activeId);
      const proc = state.processes.find((x) => x.id === cur?.processId);
      if (!proc) return state;
      return { ...mapActive(state, (p) => ({ ...p, layers: proc.rows.map((r, i) => ({ no: i + 1, ref: r.id })) })), prevLayers: cur.layers };
    }
    case 'undoProcess': {
      return { ...mapActive(state, (p) => ({ ...p, processId: state.prevProcessId ?? null, layers: state.prevLayers || p.layers })), prevLayers: null };
    }
    case 'addProcess': {
      const pr = a.example ? exampleProcess(state.processes) : newProcess(state.processes, a.patch);
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

export function useMtoStore() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  useEffect(() => {
    try {
      const { projects, processes, activeId, config } = state;
      localStorage.setItem(KEY, JSON.stringify({ projects, processes, activeId, config }));
    } catch {
      /* 저장 불가 환경에서는 메모리에만 유지 */
    }
  }, [state.projects, state.processes, state.activeId, state.config]);
  return [state, dispatch];
}
