// Revision 일정 현황: 날짜 기준으로 여러 ITEM을 한 화면에 — 준비(Changes) → GDS → STEP1 → STEP2 → MTO를 ITEM마다 한 줄로 잇고,
// 날짜를 누르면 그날 ITEM마다 어느 단계인지 보여 준다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { makeCalendar } from '../lib/scheduler.js';
import { addDays, fmtShort, fromDay, toDay, todayIso, weekdayOf } from '../lib/dates.js';
import { CHANGE_KINDS, groupsOf } from '../components/RevisionChanges.jsx';
import { referenceOf } from '../components/RevisionReference.jsx';

const LABEL_W = 200;
const TOP = 44;
const ROW = 46;
const GROUP = 26;
const PAD_R = 70;

/** ITEM의 준비 날짜들: [{date, kind, label}] */
export function prepMarks(p) {
  const c = p.changes || {};
  const out = [];
  if (c.db?.on) for (const g of groupsOf(c.db, 'parts')) if (g.date) out.push({ date: g.date, kind: 'db', label: `DB ${g.items.join('·')}` });
  if (c.db?.on && c.db.stepX?.on && c.db.stepX.date) out.push({ date: c.db.stepX.date, kind: 'stepx', label: 'Step X' });
  if (c.runset?.on) for (const g of groupsOf(c.runset, 'steps')) if (g.date) out.push({ date: g.date, kind: 'runset', label: `Runset ${g.items.join('·')}` });
  if (c.spec?.on && c.spec.date) out.push({ date: c.spec.date, kind: 'spec', label: 'SPEC' });
  return out;
}

const minD = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
const maxD = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/** 그날 이 ITEM은 어느 단계인지 */
export function stageOn(item, d) {
  const { result: r, marks } = item;
  if (!r) return { key: 'none', text: '계산 전' };
  const L = r.layers;
  const pendingPrep = marks.filter((m) => m.date > d && m.kind !== 'stepx');
  if (d < r.partAGds) return { key: 'prep', text: pendingPrep.length ? `준비 중 · ${pendingPrep.map((m) => m.label).join(', ')}` : 'GDS 대기' };
  const s1End = L.reduce((m, l) => maxD(m, l.step1End), null);
  if (d <= s1End) return { key: 'step1', text: 'STEP1' };
  const inS2 = L.filter((l) => l.step2Start <= d && d <= l.step2End).length;
  const s2Done = L.filter((l) => l.step2End < d).length;
  const mtoDone = L.filter((l) => l.mtoDate <= d).length;
  if (mtoDone >= L.length) return { key: 'done', text: `MTO 완료 (${fmtShort(r.finalMto)})` };
  if (inS2 || s2Done < L.length) return { key: 'step2', text: `STEP2 ${inS2}장 진행 · ${s2Done}/${L.length} 완료${mtoDone ? ` · MTO ${mtoDone}장` : ''}` };
  return { key: 'mto', text: `MTO ${mtoDone}/${L.length}` };
}

/** 여러 ITEM 타임라인 (Product별 묶음). projects: 보여 줄 Revision ITEM, onPick(id): ITEM을 눌렀을 때 */
export default function RevisionTimeline({ state, calcs, projects, day, setDay, onPick, selected }) {
  const go = (_, id) => onPick?.(id);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(1000);
  const [tip, setTip] = useState(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const products = state.projects.filter((p) => p.kind === 'product');
  const revs = projects;
  // Product별로 묶어서 줄 만들기
  const lines = useMemo(() => {
    const out = [];
    const groups = [...products.map((pr) => [pr, revs.filter((r) => r.parentId === pr.id)]), [null, revs.filter((r) => !products.some((pr) => pr.id === r.parentId))]];
    for (const [pr, its] of groups) {
      if (!its.length) continue;
      out.push({ type: 'group', name: pr ? pr.name : 'Product 없음', n: its.length });
      for (const p of its) out.push({ type: 'item', project: p, result: calcs[p.id]?.result || null, marks: prepMarks(p), target: p.meta?.target || '' });
    }
    return out;
  }, [state.projects, projects, calcs]);
  const items = lines.filter((l) => l.type === 'item');

  const geo = useMemo(() => {
    let lo = null;
    let hi = null;
    for (const it of items) {
      for (const m of it.marks) { lo = minD(lo, m.date); hi = maxD(hi, m.date); }
      if (it.result) { lo = minD(lo, it.result.partAGds); hi = maxD(hi, it.result.finalMto); }
      if (it.target) { lo = minD(lo, it.target); hi = maxD(hi, it.target); }
    }
    if (!lo) return null;
    lo = minD(lo, addDays(day, 0));
    hi = maxD(hi, day);
    const start = addDays(lo, -2);
    const t0 = toDay(start);
    const nDays = toDay(hi) - t0 + 5;
    const colW = Math.max(8, Math.min(30, Math.floor((width - LABEL_W - PAD_R) / nDays)));
    const off = new Map(makeCalendar(state.config).holidaysBetween(start, addDays(start, nDays - 1), false).map((h) => [h.date, h.name]));
    let y = TOP;
    const ys = lines.map((l) => { const v = y; y += l.type === 'group' ? GROUP : ROW; return v; });
    return { t0, nDays, colW, off, ys, W: LABEL_W + colW * nDays + PAD_R, H: y + 12 };
  }, [lines, width, day, state.config]);

  let svg = null;
  if (geo) {
    const { t0, nDays, colW, off, ys, W, H } = geo;
    const x = (iso) => LABEL_W + (toDay(iso) - t0) * colW;
    const cx = (iso) => x(iso) + colW / 2;
    const xEnd = (iso) => x(iso) + colW;
    const bg = [];
    for (let i = 0; i < nDays; i++) {
      const ds = fromDay(t0 + i);
      const px = LABEL_W + i * colW;
      const d = Number(ds.slice(8));
      const w = weekdayOf(t0 + i);
      const nm = off.get(ds);
      if (nm) bg.push(<rect key={`h${i}`} className={nm === '주말' ? 'col-we' : 'col-hol'} x={px} y={TOP} width={colW} height={H - TOP - 12} />);
      if (colW >= 12 && (colW >= 18 || d % 2 === 1)) bg.push(<text key={`d${i}`} className={`day ${w === 0 || w === 6 || (nm && nm !== '주말') ? 'off' : ''}`} x={px + colW / 2} y={TOP - 8}>{d}</text>);
      if (d === 1 || i === 0) {
        bg.push(<line key={`m${i}`} className="month-line" x1={px} x2={px} y1={4} y2={H - 12} />);
        bg.push(<text key={`mt${i}`} className="month" x={px + 4} y={16}>{`${ds.slice(0, 4)}.${ds.slice(5, 7)}`}</text>);
      }
      bg.push(<rect key={`c${i}`} className="day-hit" x={px} y={0} width={colW} height={H} onClick={() => setDay(ds)} />);
    }
    const tipOn = (title, rows) => ({ onPointerMove: (e) => setTip({ title, rows, x: e.clientX, y: e.clientY }), onPointerLeave: () => setTip(null) });
    const rowY = new Map();
    const rows = lines.map((l, k) => {
      const y = ys[k];
      if (l.type === 'group') {
        return (
          <g key={`g${k}`}>
            <rect className="rt-group" x={0} y={y} width={W} height={GROUP} />
            <text className="lbl strong" x={10} y={y + GROUP / 2 + 4}>{l.name}</text>
            <text className="lbl sub" x={LABEL_W - 10} y={y + GROUP / 2 + 4} textAnchor="end">ITEM {l.n}</text>
          </g>
        );
      }
      const { project: p, result: r, marks, target } = l;
      const mid = y + ROW / 2;
      rowY.set(p.id, mid);
      // 이 ITEM의 모든 날짜를 한 줄로 잇는다
      const pts = [...marks.map((m) => m.date), r?.partAGds, r?.finalMto].filter(Boolean).sort();
      const L = r?.layers || [];
      const s1 = r && { from: L.reduce((m, q) => minD(m, q.step1Start), null), to: L.reduce((m, q) => maxD(m, q.step1End), null) };
      const s2 = r && { from: L.reduce((m, q) => minD(m, q.step2Start), null), to: L.reduce((m, q) => maxD(m, q.step2End), null) };
      const mt = r && { from: L.reduce((m, q) => minD(m, q.mtoDate), null), to: r.finalMto };
      const late = r && target && r.finalMto > target;
      const name = p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name;
      return (
        <g key={p.id} className={`rt-row ${selected === p.id ? 'sel' : ''}`}>
          <rect className={selected === p.id ? 'row-hi' : k % 2 ? 'rowband' : 'rowband-0'} x={0} y={y} width={W} height={ROW} />
          <text className="lbl strong link" x={14} y={mid - 3} onClick={() => go('layers', p.id)}>{name}</text>
          <text className="lbl sub" x={14} y={mid + 12}>{r ? `${L.length}장 · MTO ${fmtShort(r.finalMto)}` : '계산 전'}</text>
          {pts.length > 1 && <line className="rt-link" x1={cx(pts[0])} x2={cx(pts.at(-1))} y1={mid} y2={mid} />}
          {s1 && <rect className="bar step1" x={x(s1.from)} y={mid - 5} width={Math.max(xEnd(s1.to) - x(s1.from), 2)} height={10} rx={4} {...tipOn(`${p.name} · STEP1`, [['기간', `${fmtShort(s1.from)} ~ ${fmtShort(s1.to)}`]])} />}
          {s2 && <rect className="bar step2 soft" x={x(s2.from)} y={mid - 5} width={Math.max(xEnd(s2.to) - x(s2.from), 2)} height={10} rx={4} {...tipOn(`${p.name} · STEP2`, [['기간', `${fmtShort(s2.from)} ~ ${fmtShort(s2.to)}`]])} />}
          {mt && <rect className="bar mto" x={x(mt.from)} y={mid - 4} width={Math.max(xEnd(mt.to) - x(mt.from), 2)} height={8} rx={4} {...tipOn(`${p.name} · MTO`, [['첫 MTO', fmtShort(mt.from)], ['최종 MTO', fmtShort(mt.to)]])} />}
          {marks.map((m, i) => (
            <g key={`m${i}`} {...tipOn(`${p.name} · 준비`, [[m.label, fmtShort(m.date)]])}>
              <circle className={`rt-prep ${m.kind}`} cx={cx(m.date)} cy={mid} r={5.5} />
            </g>
          ))}
          {r && <g {...tipOn(`${p.name} · GDS`, [['GDS 입고', fmtShort(r.partAGds)]])}><path className="gds-mark" d={`M${cx(r.partAGds) - 6},${mid - 12} l6,8 l6,-8 z`} /></g>}
          {r && <g {...tipOn(`${p.name} · 최종 MTO`, [['최종 MTO', fmtShort(r.finalMto)], ...(target ? [['Target', `${fmtShort(target)}${late ? ' · 늦음' : ''}`]] : [])])}><path className={`final-mark ${late ? 'late' : ''}`} d={`M${cx(r.finalMto)},${mid - 8} l7,8 l-7,8 l-7,-8 z`} /></g>}
          {target && (
            <g {...tipOn(`${p.name} · MTO Target`, [['Target', fmtShort(target)]])}>
              <line className={`rt-target ${late ? 'late' : ''}`} x1={cx(target)} x2={cx(target)} y1={y + 4} y2={y + ROW - 4} />
              <path className={`rt-flag ${late ? 'late' : ''}`} d={`M${cx(target)},${y + 4} l9,4 l-9,4 z`} />
            </g>
          )}
          {r && <text className={`lbl final ${late ? 'late' : ''}`} x={xEnd(maxD(r.finalMto, target)) + 8} y={mid + 4}>{fmtShort(r.finalMto)}</text>}
        </g>
      );
    });
    // Reference로 이어진 ITEM끼리 곡선으로
    const refs = items
      .map((it) => {
        const ref = referenceOf(state, it.project);
        if (!ref || ref.kind !== 'revision' || !rowY.has(ref.id) || !it.result) return null;
        const from = calcs[ref.id]?.result?.finalMto;
        if (!from) return null;
        const x1 = cx(from);
        const y1 = rowY.get(ref.id);
        const x2 = cx(it.result.partAGds);
        const y2 = rowY.get(it.project.id);
        const mx = (x1 + x2) / 2;
        return <path key={`r${it.project.id}`} className="rt-ref" d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} />;
      })
      .filter(Boolean);
    const di = toDay(day) - t0;
    svg = (
      <svg className="gantt pf rt" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revision 일정 현황">
        <g>{bg}</g>
        <g>{rows}</g>
        <g>{refs}</g>
        {di >= 0 && di < nDays && (
          <g className="rt-day">
            <rect x={x(day)} y={TOP - 4} width={colW} height={H - TOP - 8} />
            <text x={cx(day)} y={H - 1} textAnchor="middle">{fmtShort(day)}</text>
          </g>
        )}
      </svg>
    );
  }

  return (
    <div className="gantt-wrap" ref={wrapRef}>
      {svg || <p className="empty">날짜가 있는 ITEM이 없어요.</p>}
      {tip && (
        <div className="gantt-tip" style={{ left: tip.x + 14, top: tip.y + 14 }} role="status">
          <div className="t">{tip.title}</div>
          {tip.rows.map(([k, v]) => <div className="r" key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
      )}
    </div>
  );
}

export function TimelineLegend() {
  return (
    <span className="rt-legend small">
      {CHANGE_KINDS.map(([k, label]) => <span key={k}><i className={`rt-dot ${k}`} />{label}</span>)}
      <span><i className="rt-dot stepx" />Step X</span>
      <span><i className="sw step1" />STEP1</span>
      <span><i className="sw step2" />STEP2</span>
      <span><i className="sw mto" />MTO</span>
      <span><i className="rt-flag-sw" />Target</span>
    </span>
  );
}
