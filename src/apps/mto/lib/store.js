// MTO 탭 상태: Product·Revision 목록 + 규칙(전체 기본값). WorkTime과 같이 localStorage에 저장한다.
// 목록 순서 = 화면에 보이는 순서(우선순위). 묶음마다 따로 계산한다.
import { useEffect, useReducer } from 'react';
import { DEFAULT_CONFIG, normalizeConfig } from './scheduler.js';
import { newProject } from './projects.js';
import { exampleProcess } from './process.js';
import { mtoReducer } from './reducer.js';

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
  const config = normalizeConfig(s?.config || readJson(LEGACY)?.config || DEFAULT_CONFIG);
  let projects = s?.projects;
  if (!projects) {
    // 예전 버전에서 넘어오면 기존 입력을 Product 1로 옮긴다
    const old = readJson(LEGACY);
    projects = old ? [newProject('product', [], { gds: old.gds || '', layers: Array.isArray(old.layers) ? old.layers : [] })] : [];
  }
  const firstOf = (k) => projects.find((p) => p.kind === k)?.id || null;
  const valid = (id, k) => (projects.some((p) => p.id === id && p.kind === k) ? id : firstOf(k));
  const prevActive = projects.find((p) => p.id === s?.activeId);
  const activeByKind = {
    product: valid(s?.activeByKind?.product ?? (prevActive?.kind === 'product' ? prevActive.id : null), 'product'),
    revision: valid(s?.activeByKind?.revision ?? (prevActive?.kind === 'revision' ? prevActive.id : null), 'revision'),
  };
  const section = s?.section === 'revision' ? 'revision' : 'product';
  return { projects, processes, config, section, activeByKind, activeId: activeByKind[section], prevLayers: null };
}

export function useMtoStore() {
  const [state, dispatch] = useReducer(mtoReducer, undefined, init);
  useEffect(() => {
    try {
      const { projects, processes, activeId, activeByKind, section, config } = state;
      localStorage.setItem(KEY, JSON.stringify({ projects, processes, activeId, activeByKind, section, config }));
    } catch {
      /* 저장 불가 환경에서는 메모리에만 유지 */
    }
  }, [state.projects, state.processes, state.activeId, state.section, state.config]);
  return [state, dispatch];
}
