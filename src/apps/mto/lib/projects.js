// 일정 묶음: Product(Part A/B, 전체 Layer)와 Revision(Product와 별개로 몇 장만, Part 없음).
// 묶음마다 따로 계산한다 — STEP2 동시 진행·하루 MTO 장수도 묶음별로 따로 적용.
import { buildSchedule, REVISION_PART } from './scheduler.js';
import { validateLayers } from './layers.js';
import { analyze } from './insights.js';
import { processConfig, resolveLayers } from './process.js';

export const KIND = { product: 'Product', revision: 'Revision' };

let seq = 0;
export const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newProject(kind, projects = [], patch = {}) {
  const n = projects.filter((p) => p.kind === kind).length + 1;
  return {
    id: newId(),
    kind,
    name: kind === 'revision' ? `Revision ${n}` : `Product ${n}`,
    gds: '',
    layers: [],
    base: '', // Revision: 참고용 원래 Product 이름 (계산에는 안 씀)
    step1Tat: null, // Revision: STEP1 TAT (비우면 규칙의 기본값)
    processId: null, // 기준 공정 (있으면 Layer는 공정 시트에서 골라 담고 Part 설정도 공정을 따름)
    override: {}, // 묶음별 하루 MTO 수 · STEP2 동시 진행 수 (없으면 규칙의 기본값)
    ...patch,
  };
}

/** 규칙(전체 기본값) + 묶음별 설정 → 엔진에 넘길 설정 */
export function effectiveConfig(config, project, proc = null) {
  const c = { ...config, ...(proc && project.kind !== 'revision' ? processConfig(proc) : {}), ...(project.override || {}) };
  if (project.kind === 'revision') c.step1Tat = { [REVISION_PART]: project.step1Tat ?? config.revisionStep1Tat };
  return c;
}

/** 화면·계산에 쓰는 Layer: 공정 Layer는 이름·Part·Type을 공정 시트에서 가져온다 */
export const projectLayers = (project, processes = []) => {
  const proc = project.processId ? processes.find((x) => x.id === project.processId) : null;
  return proc ? resolveLayers(project.layers, proc) : project.layers;
};
const engineLayers = (layers, project) => (project.kind === 'revision' ? layers.map((l) => ({ ...l, part: REVISION_PART })) : layers);

/** 묶음 하나 계산: { empty } | { issues } | { result, analysis } */
export function computeProject(project, config, processes = []) {
  const proc = project.processId ? processes.find((x) => x.id === project.processId) || null : null;
  const cfg = effectiveConfig(config, project, proc);
  if (!project.layers.length) return { empty: true, config: cfg, proc };
  const resolved = projectLayers(project, processes);
  const issues = [];
  if (project.processId && !proc) issues.push({ index: -1, field: 'process', msg: '기준 공정이 지워졌습니다. 다른 공정을 고르세요.' });
  resolved.forEach((l, i) => l.missing && issues.push({ index: i, field: 'layer', msg: `No ${l.no}: 공정 시트에서 지워진 Layer입니다.` }));
  issues.push(...validateLayers(resolved.filter((l) => !l.missing), Object.keys(cfg.step2Tat), { revision: project.kind === 'revision', parts: project.kind === 'revision' ? null : Object.keys(cfg.step1Tat) }));
  if (!project.gds) issues.unshift({ index: -1, field: 'gds', msg: 'GDS 입고일을 입력하세요.' });
  if (issues.length) return { issues, config: cfg, proc };
  try {
    const layers = engineLayers(resolved, project);
    const result = buildSchedule(project.gds, layers, cfg);
    return { result, analysis: analyze(result, layers), config: cfg, proc };
  } catch (e) {
    return { issues: [{ index: -1, msg: e.message }], config: cfg, proc };
  }
}
