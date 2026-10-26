// 작업공간 모델과 리비전 계산 (화면 · 테스트 · codemate 구현이 같이 쓰는 순수 함수)
//
// workspace = {
//   version: 2,
//   processes: [{ id: 'SF3', master: { files, updated, history: [{at, text}] }, classes: { [layer]: {cls, level, key} } }],
//   dks:       [{ id: 'SF3_DK', process: 'SF3' }],
//   revisions: [{
//     id, kind: 'dk' | 'master', process, dk, ver, workDate, folder,
//     ref: { kind: 'master' | 'revision', id, label },
//     base: { files, history },      // Reference에서 가져온 시작점 (All Layer 파일 + 누적 history)
//     options: [{ name, metals, tops, plus, minus }],
//     requests, include, log, status: 'draft' | 'approved', approvedAt,
//     output: { files, history, options: {name: files} } | null   // 승인할 때 고정 (다음 Reference의 시작점)
//   }],
// }
import { loadSet } from './model.js';
import { plan } from './planner.js';
import { crossMaster, dkVsMaster } from './registry.js';
import { checkOption, filterSet, optionLayers } from './options.js';
import { historyBlock } from './history.js';

const tsCache = new WeakMap();
export function techSetOf(files) {
  if (!files) return null;
  if (!tsCache.has(files)) {
    try {
      tsCache.set(files, { ts: loadSet(files) });
    } catch (e) {
      tsCache.set(files, { error: e.message });
    }
  }
  return tsCache.get(files);
}

export const processOf = (ws, id) => ws.processes.find((p) => p.id === id) || null;

/** DK 파일 이름: Reference가 Master면 DK 이름으로 바꾼다 */
export function dkFileNames(dk) {
  return { tf: `${dk}.tf`, layermap: `${dk}.layermap`, drf: 'display.drf' };
}

/** 리비전 계산: 요청 반영 → All Layer → Option들 → 점검 → history */
export function computeRevision(ws, rev, settings) {
  const proc = processOf(ws, rev.process);
  const master = techSetOf(proc?.master.files);
  const base = techSetOf(rev.base.files);
  if (!base || base.error) return { error: `시작 파일을 읽지 못했어요: ${base?.error || '없음'}` };
  if (!master || master.error) return { error: `Master 파일을 읽지 못했어요: ${master?.error || '없음'}` };
  const isDk = rev.kind === 'dk';
  const res = plan(base.ts, rev.requests, rev.include, { ...settings, master: isDk ? master.ts : null, optionNames: (rev.options || []).map((o) => o.name) });
  const counts = { READY: 0, NEEDS_REVIEW: 0, ERROR: 0 };
  for (const it of res.items) counts[it.status]++;
  const applied = res.items.filter((i) => i.included).map((i) => i.id);
  const allFiles = {
    tf: { name: res.names.tf, text: res.files.tf },
    layermap: { name: res.names.layermap, text: res.files.layermap },
    drf: { name: res.names.drf, text: res.files.drf },
  };
  let all;
  try {
    all = loadSet(allFiles);
  } catch (e) {
    return { error: `수정본을 다시 읽지 못했어요: ${e.message}` };
  }
  const allLayers = [...all.tf.layerByName().keys()];

  // Option: 정의 + 반영한 OPTION_ADD/REMOVE 요청
  const options = isDk
    ? (rev.options || []).map((def0) => {
        const def = { ...def0, plus: [...(def0.plus || [])], minus: [...(def0.minus || [])] };
        for (const it of res.items) {
          const o = it.included && it.optionOp;
          if (!o || o.option !== def.name) continue;
          if (o.op === 'add') {
            def.minus = def.minus.filter((x) => x !== o.layer);
            if (!def.plus.includes(o.layer)) def.plus.push(o.layer);
          } else {
            def.plus = def.plus.filter((x) => x !== o.layer);
            if (!def.minus.includes(o.layer)) def.minus.push(o.layer);
          }
        }
        const set = optionLayers(allLayers, proc.classes, def);
        const check = checkOption(def, set, allLayers);
        const keep = new Set([...set].filter(([, v]) => v.in).map(([k]) => k));
        const out = filterSet(allFiles, keep);
        return { def, set, check, files: out.files, refs: out.refs };
      })
    : [];

  // 점검
  const checks = [];
  if (isDk) {
    for (const i of dkVsMaster(all, master.ts)) checks.push({ ...i, scope: 'All ↔ Master' });
    for (const o of options) for (const i of o.check.issues) checks.push({ ...i, scope: `Option ${o.def.name}` });
    for (const o of options) for (const [l, n] of o.refs) checks.push({ level: 'info', scope: `Option ${o.def.name}`, msg: `빠진 Layer ${l}을 techfile 다른 곳(룰 등)에서 ${n}번 참조 — 사내 규칙대로 정리 필요` });
  } else {
    // Master 변경: 다른 Process Master와 기능키 번호 비교 (새로 생긴 불일치만)
    for (const other of ws.processes.filter((p) => p.id !== proc.id)) {
      const o = techSetOf(other.master.files);
      if (!o || o.error) continue;
      const before = crossMaster({ ts: master.ts, classes: proc.classes }, { ts: o.ts, classes: other.classes });
      const after = crossMaster({ ts: all, classes: proc.classes }, { ts: o.ts, classes: other.classes });
      const was = new Set(before.rows.filter((r) => r.status === 'mismatch').map((r) => r.key));
      for (const r of after.rows) if (r.status === 'mismatch' && !was.has(r.key)) checks.push({ level: 'error', scope: `Master ↔ ${other.id}`, msg: `${r.key}: ${proc.id} ${r.a.layer} ${r.a.gds} ≠ ${other.id} ${r.b.layer} ${r.b.gds}` });
    }
  }
  const history = (rev.base.history || '') + historyBlock(rev, res, options, applied);
  return { res, counts, applied, allFiles, all, options, checks, history, master: master.ts };
}

/** 리비전 → 출력 폴더 항목 [{ path, data }] (VWP에 그대로 복사할 구조) */
export function revisionFolder(ws, rev, c) {
  const root = rev.kind === 'dk' ? `${rev.process}/${rev.dk}/${rev.folder}` : `${rev.process}/_MASTER/${rev.folder}`;
  const out = [];
  const add = (path, data) => out.push({ path: `${root}/${path}`, data });
  const histName = rev.kind === 'dk' ? `${rev.dk}_history.txt` : `${rev.process}_master_history.txt`;
  if (rev.kind === 'dk') {
    for (const k of ['tf', 'layermap', 'drf']) add(`All/${c.allFiles[k].name}`, c.allFiles[k].text);
    add(`All/${histName}`, c.history);
    for (const o of c.options) for (const k of ['tf', 'layermap', 'drf']) add(`Options/${o.def.name}/${o.files[k].name}`, o.files[k].text);
  } else {
    for (const k of ['tf', 'layermap', 'drf']) add(c.allFiles[k].name, c.allFiles[k].text);
    add(histName, c.history);
  }
  add('_techmap/revision.json', JSON.stringify({
    id: rev.id, kind: rev.kind, process: rev.process, dk: rev.dk, ver: rev.ver, workDate: rev.workDate, folder: rev.folder,
    ref: rev.ref, status: rev.status, approvedAt: rev.approvedAt || null,
    options: c.options.map((o) => ({ ...o.def, layers: [...o.set].filter(([, v]) => v.in).map(([k]) => k) })),
    applied: c.applied,
    requests: rev.requests,
  }, null, 2));
  return out;
}
