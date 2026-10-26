// DK 작업 그래프 (git log --graph 처럼): 위가 최신, 정식 Ver = 왼쪽 줄기, exp · incr Ver는 각자 가지.
// 실선 = Reference(분기), 점선 = Merge. 채운 점 = 승인, 빈 점 = 작업중. 맨 아래 = Process MASTER.
import { Pill } from '../../../shared/ui.jsx';
import { dkGraph, isAncestor } from '../lib/graph.js';
import { KIND_LABEL } from '../lib/version.js';

const ROW = 56;
const LANE = 30;
const PAD = 20;
const COLOR = { release: 'var(--accent)', exp: 'var(--sky)', incr: 'var(--leave)', other: 'var(--warn)' };

export default function RevGraph({ ws, dk, process, current, target, counts, onOpen, onBranch, onMerge }) {
  const g = dkGraph(ws, dk);
  const lanes = Math.max(1, g.lanes.length);
  const W = PAD * 2 + (lanes - 1) * LANE;
  const H = g.rows * ROW;
  const x = (lane) => PAD + lane * LANE;
  const y = (row) => row * ROW + ROW / 2;
  const laneColor = (lane) => {
    const key = g.lanes[lane];
    const n = g.nodes.find((v) => v.lane === lane);
    return key === 'main' || !n ? COLOR.release : COLOR[n.kind] || COLOR.other;
  };
  const path = (a, b) => {
    const [ax, ay, bx, by] = [x(a.lane), y(a.row), x(b.lane), y(b.row)];
    if (ax === bx) return `M${ax},${ay} L${bx},${by}`;
    // 부모 줄에서 위로 올라오다 자식 바로 아래에서 꺾어 들어간다
    const turn = by + ROW * 0.62;
    return `M${ax},${ay} L${ax},${turn} C${ax},${by + ROW * 0.25} ${bx},${by + ROW * 0.35} ${bx},${by}`;
  };
  const targetRev = target ? ws.revisions.find((r) => r.id === target) : null;
  return (
    <div className="tm-graph" style={{ '--tm-graph-w': `${W}px`, '--tm-row': `${ROW}px` }}>
      <svg className="tm-graph-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {g.edges.map((e, i) => (
          <path key={i} d={path(e.from, e.to)} fill="none" stroke={e.kind === 'merge' ? laneColor(e.from.lane) : laneColor(e.to.lane)}
            strokeWidth={e.kind === 'merge' ? 2 : 2.5} strokeDasharray={e.kind === 'merge' ? '5 4' : e.kind === 'external' ? '2 4' : undefined} strokeLinecap="round" opacity={e.kind === 'merge' ? 0.9 : 1} />
        ))}
        <rect x={x(0) - 7} y={y(g.root.row) - 7} width="14" height="14" rx="3" fill="var(--surface-3)" stroke="var(--faint)" strokeWidth="2" />
        {g.nodes.map((n) => {
          const c = COLOR[n.kind] || COLOR.other;
          const done = n.rev.status === 'approved';
          return (
            <g key={n.rev.id}>
              {n.rev.id === current && <circle cx={x(n.lane)} cy={y(n.row)} r="12" fill="none" stroke={c} strokeWidth="2" opacity="0.35" />}
              <circle cx={x(n.lane)} cy={y(n.row)} r="7" fill={done ? c : 'var(--surface)'} stroke={c} strokeWidth="2.5" />
            </g>
          );
        })}
      </svg>
      <ol className="tm-graph-rows">
        {g.nodes.map((n) => {
          const r = n.rev;
          const k = counts?.[r.id];
          const canMerge = targetRev && r.id !== targetRev.id && !isAncestor(ws, r.id, targetRev.id);
          return (
            <li key={r.id} className={`tm-graph-row ${r.id === current ? 'cur' : ''}`} style={{ top: n.row * ROW }}>
              <button type="button" className="tm-graph-main" onClick={() => onOpen(r.id)} title={r.folder}>
                <span className="tm-graph-ver" style={{ color: COLOR[n.kind] || COLOR.other }}>{r.ver}</span>
                <Pill tone={n.kind === 'release' ? 'accent' : n.kind === 'incr' ? 'leave' : 'plan'}>{KIND_LABEL[n.kind]}</Pill>
                <span className="small muted num">작업 {r.workDate}</span>
                <Pill tone={r.status === 'approved' ? 'good' : 'warn'}>{r.status === 'approved' ? '승인' : '작업중'}</Pill>
                {k && k.NEEDS_REVIEW > 0 && <span className="tm-pip rev">{k.NEEDS_REVIEW}</span>}
                {k && k.ERROR > 0 && <span className="tm-pip err">{k.ERROR}</span>}
                {(r.merges || []).length > 0 && <span className="small muted">⟵ {r.merges.map((m) => m.label.replace(`${dk}_`, '')).join(', ')}</span>}
              </button>
              <span className="tm-graph-acts">
                <button type="button" className="btn small" onClick={() => onBranch(r)} title="이 작업을 Reference로 새 작업">분기</button>
                {canMerge && <button type="button" className="btn small" onClick={() => onMerge(r)} title={`${r.folder}의 변경을 ${targetRev.folder}에 합치기`}>→ 합치기</button>}
              </span>
            </li>
          );
        })}
        <li className="tm-graph-row root" style={{ top: g.root.row * ROW }}>
          <span className="tm-graph-main static"><b>{process} MASTER</b><span className="small muted">Reference = Master로 시작한 작업의 뿌리</span></span>
        </li>
      </ol>
      <div style={{ height: H }} />
    </div>
  );
}
