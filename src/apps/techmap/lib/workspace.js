// 작업공간 만들기 · 바꾸기 (불변 갱신). 화면은 store.js가 이 함수들을 불러 저장만 한다.
import { DEMO_MASTERS } from './demoMasters.js';
import { filterSet, newOption } from './options.js';
import { loadSet } from './model.js';
import { computeRevision, dkFileNames, processOf } from './revision.js';
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

/** 데모 작업공간: SF3 · SF2 Master, SF3_DK v1.0.0.0 (승인) + exp 작업 1건 */
export function seedWorkspace(settings) {
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
  r = newRevision(ws, { kind: 'dk', process: 'SF3', dk: 'SF3_DK', ver: 'v1.0.0.0_exp_20261020', ref: first }, settings);
  return { ws: r.ws, current: r.rev.id };
}
