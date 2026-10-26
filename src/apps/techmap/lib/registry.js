// 번호 대장 · 점검
//   numberRegistry: Process Master의 Layer × Purpose(datatype) 격자 — 같은 번호 관리가 한눈에 보이게
//   crossMaster:    다른 Process Master와 기능키 기준으로 GDS layer/datatype 비교
//   dkVsMaster:     DK(All · Option)가 Master의 부분집합이고 번호가 같은지
import { classOf, lppFnKey } from './classify.js';
import { lppKey } from './model.js';

const mode = (arr) => {
  const c = new Map();
  for (const x of arr) c.set(x, (c.get(x) || 0) + 1);
  let best = null;
  for (const [k, n] of c) if (best == null || n > c.get(best)) best = k;
  return best;
};

export function numberRegistry(ts, classes = {}) {
  const lm = ts.lm.byLpp();
  const disp = ts.tf.displayRows();
  const purposeNo = Object.fromEntries((ts.tf.purposes?.rows || []).map((r) => [r.tokens[0], r.tokens[1]]));
  const purposes = [];
  for (const k of disp.keys()) {
    const p = k.split('/')[1];
    if (!purposes.includes(p)) purposes.push(p);
  }
  // purpose마다 가장 많이 쓰는 datatype = 이 Process의 관례. 벗어나면 표시
  const typical = {};
  for (const p of purposes) typical[p] = mode(ts.lm.rows.filter((r) => r.purpose === p).map((r) => r.datatype));
  const rows = [...ts.tf.layerByName()].map(([layer, r]) => {
    const c = classOf(layer, classes);
    const cells = {};
    for (const p of purposes) {
      const d = disp.get(lppKey(layer, p));
      if (!d) continue;
      const m = lm.get(lppKey(layer, p));
      const flags = { vis: d.tokens[3] !== 'nil', sel: d.tokens[4] !== 'nil' };
      cells[p] = {
        gds: m ? `${m.stream}/${m.datatype}` : '',
        stream: m?.stream, datatype: m?.datatype,
        packet: d.tokens[2],
        hidden: !flags.vis || !flags.sel,
        flags,
        offStream: m && m.stream !== r.tokens[1], // GDS layer ≠ Layer#
        offType: m && typical[p] != null && m.datatype !== typical[p],
        noMap: !m,
      };
    }
    return { layer, num: r.tokens[1], abbrev: r.tokens[2], ...c, cells };
  }).sort((a, b) => Number(a.num) - Number(b.num));
  // 점검
  const issues = [];
  const byNum = new Map();
  for (const r of rows) {
    if (byNum.has(r.num)) issues.push({ level: 'error', msg: `Layer# ${r.num}: ${byNum.get(r.num)} · ${r.layer} 중복` });
    byNum.set(r.num, r.layer);
  }
  const byGds = new Map();
  for (const m of ts.lm.rows) {
    const k = `${m.stream}/${m.datatype}`;
    if (byGds.has(k)) issues.push({ level: 'error', msg: `GDS ${k}: ${byGds.get(k)} · ${m.layer}/${m.purpose} 중복` });
    byGds.set(k, `${m.layer}/${m.purpose}`);
  }
  for (const r of rows) for (const [p, c] of Object.entries(r.cells)) {
    if (c.noMap) issues.push({ level: 'warn', msg: `${r.layer}/${p}: layermap 행 없음` });
    else if (c.offType) issues.push({ level: 'info', msg: `${r.layer}/${p}: datatype ${c.datatype} (이 Process의 ${p} 관례는 ${typical[p]})` });
    if (c.offStream) issues.push({ level: 'info', msg: `${r.layer}/${p}: GDS layer ${c.stream} ≠ Layer# ${r.num}` });
  }
  return { rows, purposes, purposeNo, typical, issues };
}

/** 기능키별 { key, layer, purpose, gds } */
function fnIndex(ts, classes) {
  const out = new Map();
  for (const r of ts.lm.rows) out.set(lppFnKey(r.layer, r.purpose, classes), { layer: r.layer, purpose: r.purpose, gds: `${r.stream}/${r.datatype}` });
  return out;
}

/** 두 Master 비교: same | mismatch(같은 기능, 다른 번호) | clash(같은 번호, 다른 기능) | onlyA | onlyB */
export function crossMaster(a, b) {
  const A = fnIndex(a.ts, a.classes);
  const B = fnIndex(b.ts, b.classes);
  const rows = [];
  for (const key of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(key);
    const y = B.get(key);
    const status = !y ? 'onlyA' : !x ? 'onlyB' : x.gds === y.gds ? 'same' : 'mismatch';
    rows.push({ key, a: x || null, b: y || null, status });
  }
  // 같은 GDS 번호를 서로 다른 기능이 쓰는 경우
  const gdsB = new Map([...B].map(([k, v]) => [v.gds, k]));
  for (const r of rows) {
    if (r.a && r.status !== 'same') {
      const other = gdsB.get(r.a.gds);
      if (other && other !== r.key) r.clash = other;
    }
  }
  const order = { mismatch: 0, onlyA: 1, onlyB: 2, same: 3 };
  rows.sort((p, q) => order[p.status] - order[q.status] || p.key.localeCompare(q.key, 'en', { numeric: true }));
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { rows, counts: { same: count('same'), mismatch: count('mismatch'), onlyA: count('onlyA'), onlyB: count('onlyB'), clash: rows.filter((r) => r.clash).length } };
}

/** DK 파일 세트가 Master의 부분집합이고 번호가 같은지 */
export function dkVsMaster(dk, master) {
  const issues = [];
  const mLayers = master.tf.layerByName();
  const mLm = master.lm.byLpp();
  const mDisp = master.tf.displayRows();
  const mPurp = Object.fromEntries((master.tf.purposes?.rows || []).map((r) => [r.tokens[0], r.tokens[1]]));
  for (const [layer, r] of dk.tf.layerByName()) {
    const m = mLayers.get(layer);
    if (!m) issues.push({ level: 'error', msg: `${layer}: Master에 없는 Layer` });
    else if (m.tokens[1] !== r.tokens[1]) issues.push({ level: 'error', msg: `${layer}: Layer# ${r.tokens[1]} ≠ Master ${m.tokens[1]}` });
  }
  for (const r of dk.tf.purposes?.rows || []) if (mPurp[r.tokens[0]] && mPurp[r.tokens[0]] !== r.tokens[1]) issues.push({ level: 'error', msg: `Purpose ${r.tokens[0]}: 번호 ${r.tokens[1]} ≠ Master ${mPurp[r.tokens[0]]}` });
  for (const k of dk.tf.displayRows().keys()) if (!mDisp.has(k)) issues.push({ level: 'error', msg: `${k}: Master에 없는 LPP` });
  for (const r of dk.lm.rows) {
    const m = mLm.get(lppKey(r.layer, r.purpose));
    if (!m) issues.push({ level: 'error', msg: `${r.layer}/${r.purpose}: Master layermap에 없음` });
    else if (m.stream !== r.stream || m.datatype !== r.datatype) issues.push({ level: 'error', msg: `${r.layer}/${r.purpose}: GDS ${r.stream}/${r.datatype} ≠ Master ${m.stream}/${m.datatype}` });
  }
  return issues;
}
