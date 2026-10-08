// 일정 묶음: Product(Part A/B, 전체 Layer)와 Revision(Product와 별개로 몇 장만, Part 없음).
// 묶음마다 따로 계산한다 — STEP2 동시 진행·하루 MTO 장수도 묶음별로 따로 적용.
import { buildSchedule, REVISION_PART } from './scheduler.js';
import { validateLayers } from './layers.js';
import { analyze } from './insights.js';

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
    override: {}, // 묶음별 하루 MTO 수 · STEP2 동시 진행 수 (없으면 규칙의 기본값)
    ...patch,
  };
}

/** 규칙(전체 기본값) + 묶음별 설정 → 엔진에 넘길 설정 */
export function effectiveConfig(config, project) {
  const c = { ...config, ...(project.override || {}) };
  if (project.kind === 'revision') c.step1Tat = { [REVISION_PART]: project.step1Tat ?? config.revisionStep1Tat };
  return c;
}

const engineLayers = (project) => (project.kind === 'revision' ? project.layers.map((l) => ({ ...l, part: REVISION_PART })) : project.layers);

/** 묶음 하나 계산: { empty } | { issues } | { result, analysis } */
export function computeProject(project, config) {
  const cfg = effectiveConfig(config, project);
  if (!project.layers.length) return { empty: true, config: cfg };
  const issues = validateLayers(project.layers, Object.keys(cfg.step2Tat), { revision: project.kind === 'revision' });
  if (!project.gds) issues.unshift({ index: -1, field: 'gds', msg: 'GDS 입고일을 입력하세요.' });
  if (issues.length) return { issues, config: cfg };
  try {
    const layers = engineLayers(project);
    const result = buildSchedule(project.gds, layers, cfg);
    return { result, analysis: analyze(result, layers), config: cfg };
  } catch (e) {
    return { issues: [{ index: -1, msg: e.message }], config: cfg };
  }
}
