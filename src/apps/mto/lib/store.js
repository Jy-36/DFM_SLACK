// MTO 탭 상태: Product·Revision 목록 + 규칙(전체 기본값). WorkTime과 같이 localStorage에 저장한다.
// 목록 순서 = 화면에 보이는 순서(우선순위). 묶음마다 따로 계산한다.
import { useEffect, useReducer } from 'react';
import { DEFAULT_CONFIG, normalizeConfig } from './scheduler.js';
import { newProject } from './projects.js';

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
  if (s?.projects?.length) {
    return { projects: s.projects, activeId: s.projects.some((p) => p.id === s.activeId) ? s.activeId : s.projects[0].id, config: normalizeConfig(s.config || DEFAULT_CONFIG), prevLayers: null };
  }
  // 예전 버전에서 넘어오면 기존 입력을 Product 1로 옮긴다
  const old = readJson(LEGACY);
  const config = normalizeConfig(old?.config || DEFAULT_CONFIG);
  const first = newProject('product', [], { gds: old?.gds || '', layers: Array.isArray(old?.layers) ? old.layers : [] });
  return { projects: [first], activeId: first.id, config, prevLayers: null };
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
      const { projects, activeId, config } = state;
      localStorage.setItem(KEY, JSON.stringify({ projects, activeId, config }));
    } catch {
      /* 저장 불가 환경에서는 메모리에만 유지 */
    }
  }, [state.projects, state.activeId, state.config]);
  return [state, dispatch];
}
