// 작업(리비전) 그래프 — git처럼 갈라지고(Reference = 부모) 합쳐지는(merges = 둘째 부모) 관계.
//   parentsOf(rev): [Reference 작업, ...Merge한 작업]
//   isAncestor(ws, a, b): a가 b의 조상(또는 같음)인지
//   replayPath(ws, source, target): source 쪽에만 있는 작업들(target이 아직 안 가진 것) — 오래된 순
//   dkGraph(ws, dk): lane(정식 = 0번, exp · incr Ver마다 하나) · row(위가 최신) · edge(분기 · Merge)
import { parseVer } from './version.js';

const byId = (ws) => new Map(ws.revisions.map((r) => [r.id, r]));
export const parentsOf = (rev) => [...(rev.ref?.kind === 'revision' ? [rev.ref.id] : []), ...(rev.merges || []).map((m) => m.id)];

/** 만든 순서 (ws.revisions는 새것이 앞) → 오래된 것이 0 */
export const orderOf = (ws) => new Map(ws.revisions.map((r, i) => [r.id, ws.revisions.length - 1 - i]));

export function ancestors(ws, id) {
  const m = byId(ws);
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const x = stack.pop();
    if (seen.has(x) || !m.has(x)) continue;
    seen.add(x);
    stack.push(...parentsOf(m.get(x)));
  }
  return seen; // 자기 자신 포함
}

export const isAncestor = (ws, a, b) => ancestors(ws, b).has(a);

/** source에만 있는 작업들 (target 조상이 아닌 source 조상), 오래된 순 */
export function replayPath(ws, sourceId, targetId) {
  const have = ancestors(ws, targetId);
  const order = orderOf(ws);
  const m = byId(ws);
  return [...ancestors(ws, sourceId)].filter((x) => !have.has(x)).map((x) => m.get(x)).sort((a, b) => order.get(a.id) - order.get(b.id));
}

/** 두 작업의 공통 조상 중 가장 최근 것 (없으면 null = Master에서 각자 시작) */
export function mergeBase(ws, a, b) {
  const A = ancestors(ws, a);
  const order = orderOf(ws);
  let best = null;
  for (const x of ancestors(ws, b)) if (A.has(x) && (best == null || order.get(x) > order.get(best))) best = x;
  return best;
}

export const laneKey = (rev) => (parseVer(rev.ver).kind === 'release' ? 'main' : rev.ver);

/** DK 한 개의 그래프 배치 */
export function dkGraph(ws, dk) {
  const order = orderOf(ws);
  const revs = ws.revisions.filter((r) => r.kind === 'dk' && r.dk === dk).sort((a, b) => order.get(a.id) - order.get(b.id));
  const lanes = [];
  if (revs.some((r) => laneKey(r) === 'main')) lanes.push('main');
  for (const r of revs) if (!lanes.includes(laneKey(r))) lanes.push(laneKey(r));
  const n = revs.length;
  const nodes = revs.map((r, i) => ({ rev: r, lane: lanes.indexOf(laneKey(r)), row: n - 1 - i, kind: parseVer(r.ver).kind }));
  const at = new Map(nodes.map((x) => [x.rev.id, x]));
  const root = { row: n, lane: 0 }; // 맨 아래: Process MASTER
  const edges = [];
  for (const x of nodes) {
    const r = x.rev;
    if (r.ref?.kind === 'revision' && at.has(r.ref.id)) edges.push({ from: at.get(r.ref.id), to: x, kind: 'parent' });
    else if (r.ref?.kind === 'revision') edges.push({ from: root, to: x, kind: 'external', label: r.ref.label });
    else edges.push({ from: root, to: x, kind: 'master' });
    for (const m of r.merges || []) if (at.has(m.id)) edges.push({ from: at.get(m.id), to: x, kind: 'merge' });
  }
  return { nodes, edges, lanes, root, rows: n + 1 };
}
