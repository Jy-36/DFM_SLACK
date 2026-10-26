// 작업공간 만들기 · 바꾸기 (불변 갱신). 화면은 store.js가 이 함수들을 불러 저장만 한다.
import { DEMO_MASTERS } from './demoMasters.js';
import { filterSet, newOption } from './options.js';
import { loadSet } from './model.js';
import { computeRevision, dkFileNames, processOf } from './revision.js';
import { isAncestor, mergeBase, replayPath } from './graph.js';
import { folderName, parseVer, today8 } from './version.js';

export const now = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const withLog = (rev, kind, text) => ({ ...rev, log: [...(rev.log || []), { at: now(), kind, text }] });

function renameFiles(files, names) {
  return { tf: { ...files.tf, name: names.tf }, layermap: { ...files.layermap, name: names.layermap }, drf: { ...files.drf, name: names.drf } };
}

export function emptyWorkspace() {
  return { version: 2, processes: [], dks: [], revisions: [] };
}

export function addProcess(ws, id, files, label = '') {
  if (ws.processes.some((p) => p.id === id)) throw new Error(`Process '${id}'가 이미 있어요`);
  loadSet(files); // 파싱 확인
  return { ...ws, processes: [...ws.processes, { id, label, classes: {}, master: { files, updated: now(), history: `${'='.repeat(72)}\n[${id} MASTER] 등록 ${now()} (${label || '업로드'})\n${'='.repeat(72)}\n\n` } }] };
}

export function setClass(ws, procId, layer, patch) {
  return {
    ...ws,
    processes: ws.processes.map((p) => {
      if (p.id !== procId) return p;
      const cur = { ...(p.classes[layer] || {}), ...patch };
      for (const k of Object.keys(cur)) if (cur[k] === '' || cur[k] == null) delete cur[k];
      const classes = { ...p.classes };
      if (Object.keys(cur).length) classes[layer] = cur;
      else delete classes[layer];
      return { ...p, classes };
    }),
  };
}

export function addDk(ws, id, process) {
  if (ws.dks.some((d) => d.id === id)) return ws;
  return { ...ws, dks: [...ws.dks, { id, process }] };
}

/** 새 작업(리비전). ref: 'master' | 리비전 id. layers: Master에서 시작할 때 가져올 Layer (없으면 전부) */
export function newRevision(ws, { kind, process, dk, ver, workDate, ref, layers }, settings) {
  const proc = processOf(ws, process);
  if (!proc) throw new Error('Process를 골라 주세요');
  let base;
  let options = [];
  let refInfo;
  if (kind === 'master') {
    base = { files: proc.master.files, history: proc.master.history || '' };
    refInfo = { kind: 'master', id: process, label: `${process} MASTER (${proc.master.updated})` };
    ver = ver || 'master';
  } else {
    if (!dk) throw new Error('DK 이름이 필요해요');
    const pv = parseVer(ver);
    if (!pv.valid) throw new Error(`Ver 형식: ${pv.error || ver}`);
    if (ref === 'master') {
      const keep = layers ? new Set(layers) : new Set(loadSet(proc.master.files).tf.layerByName().keys());
      const files = renameFiles(filterSet(proc.master.files, keep).files, dkFileNames(dk));
      base = { files, history: `${'='.repeat(72)}\n[${dk}] 생성 — ${process} MASTER에서 ${keep.size} Layer\n${'='.repeat(72)}\n\n` };
      refInfo = { kind: 'master', id: process, label: `${process} MASTER (${proc.master.updated})` };
    } else {
      const r = ws.revisions.find((x) => x.id === ref);
      if (!r) throw new Error('Reference 작업을 찾지 못했어요');
      const out = r.output || (() => {
        const c = computeRevision(ws, r, settings);
        if (c.error) throw new Error(c.error);
        return { files: c.allFiles, history: c.history };
      })();
      base = { files: out.files, history: out.history };
      options = (r.options || []).map((o) => ({ ...o, plus: [...o.plus], minus: [...o.minus] }));
      refInfo = { kind: 'revision', id: r.id, label: r.folder + (r.status === 'approved' ? '' : ' (미승인 상태에서 가져옴)') };
    }
  }
  const wd = workDate || today8();
  const taken = ws.revisions.map((r) => r.folder);
  const folder = kind === 'master' ? folderName(`${process}_MASTER`, 'rev', wd, taken).replace('_rev_', '_') : folderName(dk, ver, wd, taken);
  const rev = {
    id: uid(), kind, process, dk: kind === 'dk' ? dk : null, ver, workDate: wd, folder, ref: refInfo, created: now(),
    base, options, requests: [], include: null, log: [{ at: now(), kind: 'system', text: `작업 시작 · Reference ${refInfo.label}` }], status: 'draft', approvedAt: null, output: null,
  };
  let next = kind === 'dk' ? addDk(ws, dk, process) : ws;
  next = { ...next, revisions: [rev, ...next.revisions] };
  return { ws: next, rev };
}

export const updateRevision = (ws, id, fn) => ({ ...ws, revisions: ws.revisions.map((r) => (r.id === id ? fn(r) : r)) });
export const deleteRevision = (ws, id) => ({ ...ws, revisions: ws.revisions.filter((r) => r.id !== id) });

export function addRequests(ws, id, requests, file) {
  return updateRevision(ws, id, (r) => {
    const seen = new Set(r.requests.map((x) => x.id));
    const fresh = requests.filter((x) => !seen.has(x.id));
    const dup = requests.length - fresh.length;
    return withLog({ ...r, requests: [...r.requests, ...fresh], include: r.include }, 'system', `${file}: 요청 ${fresh.length}건 추가${dup ? ` (이미 있는 Req_ID ${dup}건 건너뜀)` : ''}`);
  });
}

export const setInclude = (ws, id, defaults, reqId, on) =>
  updateRevision(ws, id, (r) => {
    const inc = new Set(r.include || defaults);
    if (on) inc.add(reqId);
    else inc.delete(reqId);
    return withLog({ ...r, include: [...inc] }, 'decision', `${reqId} ${on ? '반영 승인' : '반영 제외'}`);
  });

export const freezeInclude = (ws, id, ids) => updateRevision(ws, id, (r) => (r.include ? r : { ...r, include: ids }));
export const logRevision = (ws, id, kind, text) => updateRevision(ws, id, (r) => withLog(r, kind, text));
export const setOptions = (ws, id, options, note) => updateRevision(ws, id, (r) => (note ? withLog({ ...r, options }, 'decision', note) : { ...r, options }));
export const addOption = (ws, id, name, metals, tops) => setOptions(ws, id, [...(ws.revisions.find((r) => r.id === id).options || []), newOption(name, metals, tops)], `Option ${name} 추가`);

/** Merge: source 쪽에만 있는 작업들의 반영 요청을 target에 다시 적용한다 (git rebase처럼 요청을 재생).
 *  - 같은 번호 · LPP를 이미 바꿨으면 엔진이 ERROR로 보여 준다 (= 충돌, 사람이 정리)
 *  - Option 정의는 3-way: 공통 조상 대비 source가 바꾼 것만 target에 반영, 양쪽이 다르게 바꾼 값은 target 유지 + 충돌 기록
 *  반환 { ws, added, conflicts } */
export function mergeInto(ws, targetId, sourceId, settings) {
  const target = ws.revisions.find((r) => r.id === targetId);
  const source = ws.revisions.find((r) => r.id === sourceId);
  if (!target || !source) throw new Error('작업을 찾지 못했어요');
  if (target.status === 'approved') throw new Error('승인된 작업에는 합칠 수 없어요 — 새 작업을 만들어 합치세요');
  if (target.id === source.id) throw new Error('같은 작업이에요');
  if (target.process !== source.process) throw new Error('다른 Process의 작업은 합칠 수 없어요');
  if (isAncestor(ws, source.id, target.id)) throw new Error(`${source.folder}의 변경은 이미 이 작업에 들어 있어요`);
  const path = replayPath(ws, source.id, target.id);
  // 반영할 요청: 각 작업에서 실제로 반영된 것 (승인본은 고정된 include, 작업중은 지금 계산)
  const taken = new Set(target.requests.map((r) => r.id));
  const added = [];
  for (const r of path) {
    const applied = r.status === 'approved' && r.include ? new Set(r.include) : new Set(computeRevision(ws, r, settings).applied || []);
    for (const q of r.requests) {
      // Merge로 들어온 요청은 원래 작업도 path(또는 target 조상)에 있으니 원본만 재생한다
      if (!applied.has(q.id) || q.f.merged_from) continue;
      let id = q.id;
      if (taken.has(id)) id = `${q.id}@${r.ver}`;
      if (taken.has(id)) continue;
      taken.add(id);
      added.push({ ...q, id, f: { ...q.f, req_id: id, merged_from: r.folder } });
    }
  }
  // Option 3-way
  const baseId = mergeBase(ws, source.id, target.id);
  const baseRev = baseId ? ws.revisions.find((r) => r.id === baseId) : null;
  const baseOpts = new Map((baseRev?.options || []).map((o) => [o.name, o]));
  const srcOpts = source.options || [];
  const conflicts = [];
  const minus = (a, b) => (a || []).filter((x) => !(b || []).includes(x));
  let options = (target.options || []).map((o) => ({ ...o, plus: [...o.plus], minus: [...o.minus], tops: [...o.tops] }));
  for (const so of srcOpts) {
    const bo = baseOpts.get(so.name);
    const to = options.find((o) => o.name === so.name);
    if (!to) {
      if (!bo) options.push({ ...so, plus: [...so.plus], minus: [...so.minus], tops: [...so.tops] });
      continue; // 공통 조상엔 있었는데 target이 지운 Option은 그대로 둔다
    }
    const b = bo || { metals: to.metals, tops: to.tops, plus: [], minus: [] };
    const set = (k, arr) => {
      to[k] = [...new Set([...minus(to[k], minus(b[k], arr)), ...minus(arr, b[k])])];
    };
    set('plus', so.plus);
    set('minus', so.minus);
    set('tops', so.tops);
    if (so.metals !== b.metals) {
      if (to.metals === b.metals) to.metals = so.metals;
      else if (to.metals !== so.metals) conflicts.push(`${so.name} Metal 수: 이 작업 ${to.metals} · ${source.ver} ${so.metals} — 이 작업 값 유지`);
    }
  }
  const next = updateRevision(ws, targetId, (t) => {
    const defaults = t.include || computeRevision(ws, t, settings).applied || [];
    return withLog({
      ...t,
      requests: [...t.requests, ...added],
      include: [...new Set([...defaults, ...added.map((q) => q.id)])],
      options,
      merges: [...(t.merges || []), { id: source.id, label: source.folder, count: added.length, at: now() }],
    }, 'system', `Merge ← ${source.folder}: 요청 ${added.length}건${conflicts.length ? ` · Option 충돌 ${conflicts.length}` : ''}`);
  });
  return { ws: next, added, conflicts };
}

/** 승인: 결과를 고정 (다음 작업의 Reference가 됨). Master 변경이면 Process Master를 바꾼다 */
export function approveRevision(ws, id, settings) {
  const rev = ws.revisions.find((r) => r.id === id);
  const at = now();
  const r2 = { ...rev, status: 'approved', approvedAt: at };
  const c = computeRevision(ws, r2, settings);
  if (c.error) throw new Error(c.error);
  const output = { files: c.allFiles, history: c.history, options: Object.fromEntries(c.options.map((o) => [o.def.name, o.files])) };
  let next = updateRevision(ws, id, () => withLog({ ...r2, output, options: c.options.map((o) => o.def) }, 'system', `승인 · 반영 ${c.applied.length}건`));
  if (rev.kind === 'master') {
    next = { ...next, processes: next.processes.map((p) => (p.id === rev.process ? { ...p, master: { files: c.allFiles, updated: at, history: c.history } } : p)) };
  }
  return next;
}

/** 데모 작업공간: SF3 · SF2 Master, SF3_DK v1.0.0.0 (승인) + exp 작업 1건. rich면 exp → v1.0.0.1 Merge · incr 가지도 */
export function seedWorkspace(settings, { rich = false } = {}) {
  let ws = emptyWorkspace();
  ws = addProcess(ws, 'SF3', DEMO_MASTERS.SF3, 'DEMO');
  ws = addProcess(ws, 'SF2', DEMO_MASTERS.SF2, 'DEMO');
  ws = setClass(ws, 'SF2', 'RDL', { key: 'AP' }); // SF2의 RDL = SF3의 AP (이름이 다른 같은 목적 Layer)
  const all = [...loadSet(DEMO_MASTERS.SF3).tf.layerByName().keys()].filter((l) => l !== 'DMEXCL');
  let r = newRevision(ws, { kind: 'dk', process: 'SF3', dk: 'SF3_DK', ver: 'v1.0.0.0', workDate: '20261012', ref: 'master', layers: all }, settings);
  ws = r.ws;
  const first = r.rev.id;
  // DK에 없는 LPP 몇 개 (M11 fillDummy · AP pin) — 이번 작업에서 ADD 해 볼 수 있게
  ws = updateRevision(ws, first, (x) => {
    const lines = x.base.files.tf.text.split('\n').filter((l) => !/^\s*\(\s*(M11\s+fillDummy|AP\s+pin)\b/.test(l));
    const lm = x.base.files.layermap.text.split('\n').filter((l) => !/^(M11\s+fillDummy|AP\s+pin)\b/.test(l));
    return { ...x, base: { ...x.base, files: { ...x.base.files, tf: { ...x.base.files.tf, text: lines.join('\n') }, layermap: { ...x.base.files.layermap, text: lm.join('\n') } } } };
  });
  ws = setOptions(ws, first, [newOption('1P9M_6X1Z', 9, ['AP']), newOption('1P11M_8X2Z', 11, ['AP', 'PAD'])]);
  ws = addRequests(ws, first, [{ id: 'REQ-001', type: 'HIDE', row: 3, f: { req_id: 'REQ-001', type: 'HIDE', layer: 'prBoundary', purpose: 'drawing', requester: 'DK팀', reason: '사용자 선택 막기' } }], '초기 구성');
  ws = approveRevision(ws, first, settings);
  if (rich) {
    // 그래프가 보이게: exp 가지 → 정식 v1.0.0.1에 Merge, incr 가지
    const Q = (id, type, f) => ({ id, type, row: 0, f: { req_id: id, type, requester: 'DEMO', ...f } });
    let b = newRevision(ws, { kind: 'dk', process: 'SF3', dk: 'SF3_DK', ver: 'v1.0.0.0_exp_20261015', workDate: '20261015', ref: first }, settings);
    ws = addRequests(b.ws, b.rev.id, [Q('EXP-01', 'ADD', { layer: 'AP', purpose: 'pin', reason: 'AP pin 시험 제공' })], 'DEMO');
    ws = approveRevision(ws, b.rev.id, settings);
    const c = newRevision(ws, { kind: 'dk', process: 'SF3', dk: 'SF3_DK', ver: 'v1.0.0.1', workDate: '20261020', ref: first }, settings);
    ws = addRequests(c.ws, c.rev.id, [Q('REL-01', 'CHANGE_DISPLAY', { layer: 'M7', purpose: 'drawing', stipple: 'dots', reason: 'M7 패턴 구분' })], 'DEMO');
    ws = mergeInto(ws, c.rev.id, b.rev.id, settings).ws;
    ws = approveRevision(ws, c.rev.id, settings);
    const d = newRevision(ws, { kind: 'dk', process: 'SF3', dk: 'SF3_DK', ver: 'v1.0.0.0_incr20261022', workDate: '20261022', ref: first }, settings);
    ws = addRequests(d.ws, d.rev.id, [Q('INC-01', 'HIDE', { layer: 'M11', purpose: 'pin', reason: '고객사 요청으로 M11 pin 숨김' })], 'DEMO');
    ws = approveRevision(ws, d.rev.id, settings);
  }
  r = newRevision(ws, { kind: 'dk', process: 'SF3', dk: 'SF3_DK', ver: 'v1.0.0.0_exp_20261020', ref: first }, settings);
  return { ws: r.ws, current: r.rev.id };
}
