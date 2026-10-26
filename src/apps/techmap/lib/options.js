// DK Option(Metal/Via Stack): "분류 규칙 + 예외 표"로 Layer 구성을 정하고, All Layer 파일에서 Option 파일을 만든다.
// 정의: { name, metals: 9, tops: ['AP'], plus: [Layer], minus: [Layer] }
//   규칙: FEOL · MARKER는 모두, METAL은 1~metals, VIA는 1~(metals-1) (Via n = Metal n ↔ n+1), TOP은 tops에 고른 것
//   예외: plus(규칙 밖이지만 넣기) · minus(규칙 안이지만 빼기)
import { classOf } from './classify.js';
import { loadSet } from './model.js';
import { Patch } from './patcher.js';

export const newOption = (name, metals = 9, tops = []) => ({ name, metals, tops, plus: [], minus: [] });

/** All Layer 이름 목록 → Map(layer → { in, why: 'rule'|'plus'|'minus'|'out', cls, level }) */
export function optionLayers(allLayers, classes, def) {
  const out = new Map();
  for (const layer of allLayers) {
    const c = classOf(layer, classes);
    let rule;
    if (c.cls === 'METAL') rule = c.level != null && c.level <= def.metals;
    else if (c.cls === 'VIA') rule = c.level != null && c.level < def.metals;
    else if (c.cls === 'TOP') rule = (def.tops || []).includes(layer);
    else rule = true;
    let inn = rule;
    let why = rule ? 'rule' : 'out';
    if ((def.plus || []).includes(layer)) {
      inn = true;
      why = 'plus';
    }
    if ((def.minus || []).includes(layer)) {
      inn = false;
      why = 'minus';
    }
    out.set(layer, { in: inn, why, ruleIn: rule, ...c });
  }
  return out;
}

/** Option 점검: Via 스택 끊김, 빠진 Metal, All에 없는 예외 */
export function checkOption(def, set, allLayers) {
  const issues = [];
  const has = (cls, n) => [...set].some(([, v]) => v.in && v.cls === cls && v.level === n);
  for (const [layer, v] of set) {
    if (!v.in) continue;
    if (v.cls === 'VIA' && (!has('METAL', v.level) || !has('METAL', v.level + 1))) issues.push({ level: 'error', msg: `${layer}: 위아래 Metal(${v.level}, ${v.level + 1}) 중 빠진 게 있어 Via 스택이 끊김` });
    if (v.cls === 'METAL' && v.level > 1 && !has('METAL', v.level - 1)) issues.push({ level: 'warn', msg: `${layer}: 아래 Metal ${v.level - 1}이 빠져 있음` });
    if (v.cls === 'METAL' && v.level > 1 && !has('VIA', v.level - 1)) issues.push({ level: 'warn', msg: `${layer}: 아래 Via ${v.level - 1}이 빠져 있음` });
  }
  for (const l of [...(def.plus || []), ...(def.minus || [])]) if (!allLayers.includes(l)) issues.push({ level: 'error', msg: `예외 Layer '${l}'이 All Layer에 없음` });
  const metals = [...set].filter(([, v]) => v.in && v.cls === 'METAL').length;
  const vias = [...set].filter(([, v]) => v.in && v.cls === 'VIA').length;
  return { issues, metals, vias, count: [...set].filter(([, v]) => v.in).length };
}

/** All Layer 파일에서 keep에 없는 Layer 행을 지워 Option 파일을 만든다 (drf는 그대로 — 표시 정의만 있음) */
export function filterSet(files, keep) {
  const ts = loadSet(files);
  const tfp = new Patch(ts.tf.lines, ';');
  const lmp = new Patch(ts.lm.lines, '#');
  let removed = 0;
  for (const t of [ts.tf.layers, ts.tf.priorities, ts.tf.displays]) {
    for (const r of t?.rows || []) {
      if (r.tokens[0] && !keep.has(r.tokens[0])) {
        for (let i = r.start; i <= r.end; i++) tfp.remove(i);
        removed++;
      }
    }
  }
  for (const r of ts.lm.rows) if (!keep.has(r.layer)) lmp.remove(r.line);
  // layerDefinitions 밖(룰 · 함수 정의 등)에서 빠진 Layer를 쓰는 줄 수 — 사내 규칙에 맞춰 처리 필요
  const tableLines = new Set();
  for (const t of [ts.tf.purposes, ts.tf.layers, ts.tf.priorities, ts.tf.displays]) for (const r of t?.rows || []) for (let i = r.start; i <= r.end; i++) tableLines.add(i);
  const dropped = [...ts.tf.layerByName().keys()].filter((l) => !keep.has(l));
  const refs = dropped.map((l) => [l, ts.tf.references(l, tableLines).length]).filter(([, n]) => n);
  return {
    files: { tf: { name: files.tf.name, text: tfp.apply().join('') }, layermap: { name: files.layermap.name, text: lmp.apply().join('') }, drf: files.drf },
    removed,
    refs,
  };
}
