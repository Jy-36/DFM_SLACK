// MTO 탭 상태: Product·Revision 목록 + 규칙(전체 기본값). WorkTime과 같이 localStorage에 저장한다.
// 목록 순서 = 화면에 보이는 순서(우선순위). 묶음마다 따로 계산한다.
import { useEffect, useReducer } from 'react';
import { DEFAULT_CONFIG, normalizeConfig } from './scheduler.js';
import { newProject } from './projects.js';
import { exampleProcess, isBeol, migrateProcess } from './process.js';
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
  const processes = (Array.isArray(s?.processes) ? s.processes : [exampleProcess()]).map(migrateProcess);
  // 예전 규칙의 Part A/B TAT는 FEOL/BEOL로 옮긴다
  const rawCfg = s?.config || readJson(LEGACY)?.config || DEFAULT_CONFIG;
  const st1 = rawCfg.step1Tat || {};
  const config = normalizeConfig({ ...rawCfg, step1Tat: { FEOL: st1.FEOL ?? st1.A ?? 5, BEOL: st1.BEOL ?? st1.B ?? 3 } });
  config.step1Tat = { FEOL: config.step1Tat.FEOL, BEOL: config.step1Tat.BEOL };
  let projects = s?.projects;
  if (!projects) {
    // 예전 버전에서 넘어오면 기존 입력을 Product 1로 옮긴다
    const old = readJson(LEGACY);
    projects = old ? [newProject('product', [], { gds: old.gds || '', layers: Array.isArray(old.layers) ? old.layers : [] })] : [];
  }
  projects = projects.map((p) => migrateProject(p, processes));
  const firstOf = (k) => projects.find((p) => p.kind === k)?.id || null;
  const valid = (id, k) => (projects.some((p) => p.id === id && p.kind === k) ? id : firstOf(k));
  const prevActive = projects.find((p) => p.id === s?.activeId);
  const activeByKind = {
    product: valid(s?.activeByKind?.product ?? (prevActive?.kind === 'product' ? prevActive.id : null), 'product'),
    revision: valid(s?.activeByKind?.revision ?? (prevActive?.kind === 'revision' ? prevActive.id : null), 'revision'),
  };
  const section = s?.section === 'revision' ? 'revision' : 'product';
  const productColumns = Array.isArray(s?.productColumns) ? s.productColumns : ['Code', '고객', '담당', '비고'];
  return { projects, processes, config, section, activeByKind, activeId: activeByKind[section], productColumns, prevLayers: null };
}

/** 예전 Product: Part A/B → FEOL/BEOL, 공정 기준이면 담은 BEOL Layer로 BEOL Option을 정한다 */
function migrateProject(p, processes) {
  const map = { A: 'FEOL', B: 'BEOL' };
  let out = p.layers.some((l) => map[l.part]) ? { ...p, layers: p.layers.map((l) => (map[l.part] ? { ...l, part: map[l.part] } : l)) } : p;
  if (out.kind === 'product' && out.processId && out.beolOption === undefined) {
    const proc = processes.find((x) => x.id === out.processId);
    const rowOf = new Map((proc?.rows || []).map((r) => [r.id, r]));
    const first = out.layers.map((l) => rowOf.get(l.ref)).find((r) => r && isBeol(r));
    out = { ...out, beolOption: first?.module ?? proc?.beolOptions?.[0] ?? null };
  }
  return out;
}

export function useMtoStore() {
  const [state, dispatch] = useReducer(mtoReducer, undefined, init);
  useEffect(() => {
    try {
      const { projects, processes, activeId, activeByKind, section, config, productColumns } = state;
      localStorage.setItem(KEY, JSON.stringify({ projects, processes, activeId, activeByKind, section, config, productColumns }));
    } catch {
      /* 저장 불가 환경에서는 메모리에만 유지 */
    }
  }, [state.projects, state.processes, state.activeId, state.section, state.config, state.productColumns]);
  return [state, dispatch];
}
