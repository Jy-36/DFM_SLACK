// Revision Step 간트: Changes 준비 → Step X → DWR 작성 → DP → EBEAM Review → MTO 완료
// 완료(진한 색) · 진행 중(파랑) · 예상(연한 색) · 자동 예상(빗금) 막대, 오늘 · MTO Target 세로선
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { makeCalendar } from '../lib/scheduler.js';
import { addDays, fmtShort, fromDay, toDay, todayIso, weekdayOf } from '../lib/dates.js';
import { STEP_DAYS } from '../lib/flow.js';

const LABEL_W = 150;
const TOP = 44;
const ROW = 32;
const PAD_R = 90;

export function StepGanttLegend() {
  return (
    <span className="legend gantt-legend sg-legend">
      <span><i className="sw sg done" />완료</span>
      <span><i className="sw sg now" />진행 중</span>
      <span><i className="sw sg plan" />예상</span>
      <span><i className="sw sg auto" />기본 기간</span>
      <span><i className="sg-tline" />MTO Target</span>
    </span>
  );
}

export default function StepGantt({ rows, config }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(1000);
  const [tip, setTip] = useState(null);
  const uid = useId().replace(/:/g, '');
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const today = todayIso();
  const target = rows.find((r) => r.key === 'mto')?.target;

  const geo = useMemo(() => {
    let lo = today;
    let hi = today;
    for (const r of rows) for (const d of [r.start, r.end, r.target]) if (d) { if (d < lo) lo = d; if (d > hi) hi = d; }
    const start = addDays(lo, -1);
    const t0 = toDay(start);
    const nDays = toDay(hi) - t0 + 3;
    const colW = Math.max(12, Math.min(34, Math.floor((width - LABEL_W - PAD_R) / nDays)));
    const off = new Map(makeCalendar(config).holidaysBetween(start, addDays(start, nDays - 1), false).map((h) => [h.date, h.name]));
    return { t0, nDays, colW, off, W: LABEL_W + colW * nDays + PAD_R, H: TOP + ROW * rows.length + 14 };
  }, [rows, width, config, today]);
  const { t0, nDays, colW, off, W, H } = geo;
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
    if (nm) bg.push(<rect key={`h${i}`} className={nm === '주말' ? 'col-we' : 'col-hol'} x={px} y={TOP} width={colW} height={H - TOP - 14} />);
    bg.push(<line key={`g${i}`} className="grid" x1={px} x2={px} y1={TOP} y2={H - 14} />);
    if (colW >= 18 || d % 2 === 1) bg.push(<text key={`d${i}`} className={`day ${w === 0 || w === 6 || (nm && nm !== '주말') ? 'off' : ''}`} x={px + colW / 2} y={TOP - 8}>{d}</text>);
    if (d === 1 || i === 0) {
      bg.push(<line key={`m${i}`} className="month-line" x1={px} x2={px} y1={4} y2={H - 14} />);
      bg.push(<text key={`mt${i}`} className="month" x={px + 4} y={16}>{`${ds.slice(0, 4)}.${ds.slice(5, 7)}`}</text>);
    }
  }

  const stateText = { done: '완료', now: '진행 중', plan: '예상', auto: `기본 기간` };
  const body = rows.map((r, k) => {
    const y = TOP + k * ROW;
    const mid = y + ROW / 2;
    const t = {
      title: r.label,
      rows: r.milestone
        ? [['MTO', r.state === 'done' ? `완료 ${fmtShort(r.end)}` : `예상 ${fmtShort(r.end)}`], ...(r.target ? [['Target', fmtShort(r.target)]] : [])]
        : [['기간', `${fmtShort(r.start)} ~ ${fmtShort(r.end)}`], ['상태', r.auto ? `${stateText.auto} ${STEP_DAYS[r.key] ?? ''}일` : stateText[r.state]], ...(r.plan && r.actual ? [['예상', fmtShort(r.plan)]] : [])],
    };
    const tipProps = { onPointerMove: (e) => setTip({ ...t, x: e.clientX, y: e.clientY }), onPointerLeave: () => setTip(null) };
    const late = r.milestone && r.target && r.end > r.target;
    return (
      <g key={r.key}>
        <rect className={k % 2 ? 'rowband' : 'rowband-0'} x={0} y={y} width={W} height={ROW} />
        <text className={`lbl strong sg-lbl ${r.state}`} x={12} y={mid + 4}>{r.label}</text>
        {r.milestone ? (
          <g {...tipProps}>
            <path className={`sg-ms ${r.state} ${late ? 'late' : ''}`} d={`M${cx(r.end)},${mid - 9} l9,9 l-9,9 l-9,-9 z`} />
            <text className={`lbl final ${late ? 'late' : ''}`} x={xEnd(r.end) + 8} y={mid + 4}>{fmtShort(r.end)}{r.state === 'done' ? '' : ' 예상'}</text>
          </g>
        ) : (
          <g {...tipProps}>
            <rect className={`sg-bar ${r.state} ${r.auto ? 'auto' : ''} ${r.key}`} x={x(r.start)} y={mid - 8} width={Math.max(xEnd(r.end) - x(r.start), 4)} height={16} rx={5}
              fill={r.auto && r.state !== 'now' ? `url(#sg-h-${uid})` : undefined} />
            <text className="lbl sub" x={xEnd(r.end) + 6} y={mid + 4}>{fmtShort(r.end)}</text>
          </g>
        )}
      </g>
    );
  });

  const ti = toDay(today) - t0;
  return (
    <div className="gantt-wrap" ref={wrapRef}>
      <svg className="gantt sg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revision Step 일정">
        <defs>
          <pattern id={`sg-h-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="sg-hatch-bg" />
            <rect width="2.4" height="6" className="sg-hatch" />
          </pattern>
        </defs>
        <g>{bg}</g>
        <g>{body}</g>
        {target && (
          <g className="sg-target">
            <line x1={cx(target)} x2={cx(target)} y1={TOP - 4} y2={H - 14} />
            <text x={cx(target) + 4} y={TOP - 20}>Target {fmtShort(target)}</text>
          </g>
        )}
        {ti >= 0 && ti < nDays && (
          <g className="today-mark">
            <line x1={cx(today)} x2={cx(today)} y1={TOP - 4} y2={H - 14} />
            <text x={cx(today) + 4} y={H - 2}>오늘</text>
          </g>
        )}
      </svg>
      {tip && (
        <div className="gantt-tip" style={{ left: tip.x + 14, top: tip.y + 14 }} role="status">
          <div className="t">{tip.title}</div>
          {tip.rows.map(([k, v]) => <div className="r" key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
      )}
    </div>
  );
}
