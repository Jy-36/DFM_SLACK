// 일정 간트 (SVG): STEP1(Part) · STEP2 슬롯 대기 · STEP2 · MTO 대기 · MTO, 휴일 열, 위쪽에 일자별 STEP2 동시 진행 수
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { makeCalendar, partLabel } from '../lib/scheduler.js';
import { addDays, diffDays, fmtShort, fromDay, toDay, todayIso, weekdayOf } from '../lib/dates.js';

const LOAD_H = 30;
const LABEL_W = 150;
const TOP = 44 + LOAD_H;
const ROW = 25;
const PAD_R = 12;

export const LEGEND = [
  ['step1', 'STEP1 (Part)'],
  ['step2', 'STEP2 (Layer)'],
  ['s2wait', 'STEP2 슬롯 대기'],
  ['wait', 'MTO 대기'],
  ['mto', 'MTO'],
  ['hol', '공휴일'],
  ['we', '주말'],
];

export function GanttLegend() {
  return (
    <div className="legend gantt-legend">
      {LEGEND.map(([k, label]) => (
        <span key={k}>
          <i className={`sw ${k}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

export default function Gantt({ result, highlight }) {
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

  const geo = useMemo(() => {
    const t0 = toDay(result.partAGds);
    const nDays = diffDays(result.finalMto, result.partAGds) + 4;
    const colW = Math.max(14, Math.min(30, Math.floor((width - LABEL_W - PAD_R) / nDays)));
    const parts = Object.keys(result.step1);
    const W = LABEL_W + colW * nDays + PAD_R;
    const H = TOP + ROW * (result.layers.length + parts.length) + 14;
    const cal = makeCalendar(result.config);
    const off = new Map(cal.holidaysBetween(result.partAGds, addDays(result.partAGds, nDays - 1), false).map((h) => [h.date, h.name]));
    return { t0, nDays, colW, parts, W, H, off };
  }, [result, width]);

  const { t0, nDays, colW, parts, W, H, off } = geo;
  const x = (iso) => LABEL_W + (toDay(iso) - t0) * colW;
  const xEnd = (iso) => x(iso) + colW;
  const cfg = result.config;
  const loads = Object.values(result.step2Load);
  const scale = Math.max(cfg.step2Concurrency || 0, ...loads, 1);

  const showTip = (e, t) => setTip({ ...t, x: e.clientX, y: e.clientY });
  const bar = (key, cls, bx, by, bw, bh, t) => (
    <g key={key} className="g-bar" tabIndex={0} onPointerMove={(e) => showTip(e, t)} onPointerLeave={() => setTip(null)}
      onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ ...t, x: r.left + r.width / 2, y: r.bottom }); }} onBlur={() => setTip(null)}>
      <rect className={`bar ${cls}`} x={bx} y={by} width={Math.max(bw, 2)} height={bh} rx={4} fill={cls === 's2wait' ? `url(#h2-${uid})` : cls === 'wait' ? `url(#h1-${uid})` : undefined} />
      <rect className="hit" x={bx - 2} y={by - 4} width={Math.max(bw, 2) + 4} height={bh + 8} />
    </g>
  );

  // 배경: 휴일 열, 날짜, 월 구분, STEP2 동시 진행 수
  const bg = [];
  for (let i = 0; i < nDays; i++) {
    const ds = fromDay(t0 + i);
    const cx = LABEL_W + i * colW;
    const d = Number(ds.slice(8));
    const w = weekdayOf(t0 + i);
    const nm = off.get(ds);
    if (nm) bg.push(<rect key={`h${i}`} className={nm === '주말' ? 'col-we' : 'col-hol'} x={cx} y={TOP} width={colW} height={H - TOP - 14} />);
    bg.push(<line key={`g${i}`} className="grid" x1={cx} x2={cx} y1={TOP} y2={H - 14} />);
    if (colW >= 18 || d % 2 === 1) bg.push(<text key={`d${i}`} className={`day ${w === 0 || w === 6 || (nm && nm !== '주말') ? 'off' : ''}`} x={cx + colW / 2} y={TOP - LOAD_H - 8}>{d}</text>);
    if (d === 1 || i === 0) {
      bg.push(<line key={`m${i}`} className="month-line" x1={cx} x2={cx} y1={4} y2={H - 14} />);
      bg.push(<text key={`mt${i}`} className="month" x={cx + 4} y={16}>{`${ds.slice(0, 4)}.${ds.slice(5, 7)}`}</text>);
    }
    const n = result.step2Load[ds] || 0;
    if (n) {
      const full = cfg.step2Concurrency && n >= cfg.step2Concurrency;
      const h = Math.max(2, Math.round(((LOAD_H - 13) * n) / scale));
      bg.push(<rect key={`l${i}`} className={`load ${full ? 'full' : ''}`} x={cx + 2} y={TOP - 5 - h} width={colW - 4} height={h} rx={2} />);
      if (colW >= 14) bg.push(<text key={`ll${i}`} className={`load-lbl ${full ? 'full' : ''}`} x={cx + colW / 2} y={TOP - LOAD_H + 5}>{n}</text>);
    }
  }

  const rows = [];
  let y = TOP;
  const bh = ROW - 9;
  for (const part of parts) {
    const s1 = result.step1[part];
    const gds = s1.gds;
    rows.push(<rect key={`pb${part}`} className="rowband" x={0} y={y} width={W} height={ROW} />);
    rows.push(<text key={`pl${part}`} className="lbl strong" x={10} y={y + ROW / 2 + 4}>{partLabel(part)}</text>);
    rows.push(<text key={`pg${part}`} className="lbl sub" x={part === "R" ? 76 : 60} y={y + ROW / 2 + 4}>{`GDS ${fmtShort(gds)}`}</text>);
    rows.push(<path key={`pa${part}`} className="gds-mark" d={`M${x(gds) + colW / 2 - 5},${y + 3} l5,7 l5,-7 z`} />);
    rows.push(bar(`s1${part}`, 'step1', x(s1.start), y + 4, xEnd(s1.end) - x(s1.start), bh, {
      cls: 'step1', title: `${partLabel(part)} · STEP1 (TAT ${cfg.step1Tat[part]}일)`, rows: [['GDS 입고', fmtShort(gds)], ['시작', fmtShort(s1.start)], ['종료', fmtShort(s1.end)]],
    }));
    y += ROW;
    for (const l of result.layers.filter((v) => v.part === part)) {
      const hi = highlight && highlight === l.no;
      rows.push(<line key={`r${l.no}`} className="grid" x1={0} x2={W} y1={y + ROW} y2={y + ROW} />);
      if (hi) rows.push(<rect key={`hi${l.no}`} className="row-hi" x={0} y={y} width={W} height={ROW} />);
      rows.push(<text key={`t${l.no}`} className="lbl" x={10} y={y + ROW / 2 + 4}>{`${l.no}. ${l.layer}`}</text>);
      rows.push(<text key={`ty${l.no}`} className={`lbl type t-${l.type}`} x={LABEL_W - 24} y={y + ROW / 2 + 4}>{l.type}</text>);
      if (l.step2WaitDays > 0) {
        rows.push(bar(`sw${l.no}`, 's2wait', x(l.step2Ready), y + 7, x(l.step2Start) - x(l.step2Ready), bh - 6, {
          cls: 's2wait', title: `${l.layer} · STEP2 슬롯 대기 ${l.step2WaitDays}일`, rows: [['STEP2 가능', fmtShort(l.step2Ready)], ['실제 시작', fmtShort(l.step2Start)], ['사유', `동시 진행 ${cfg.step2Concurrency}장 제한`]],
        }));
      }
      rows.push(bar(`s2${l.no}`, 'step2', x(l.step2Start), y + 4, xEnd(l.step2End) - x(l.step2Start), bh, {
        cls: 'step2', title: `${l.layer} · STEP2 (Type ${l.type}, TAT ${l.step2Tat}일)`, rows: [['STEP2 가능', fmtShort(l.step2Ready)], ['시작', fmtShort(l.step2Start)], ['종료', fmtShort(l.step2End)], ['MTO 가능', fmtShort(l.mtoEarliest)]],
      }));
      if (l.mtoWaitDays > 0) {
        rows.push(bar(`mw${l.no}`, 'wait', x(l.mtoEarliest), y + 7, x(l.mtoDate) - x(l.mtoEarliest), bh - 6, {
          cls: 'wait', title: `${l.layer} · MTO 대기 ${l.mtoWaitDays}일`, rows: [['MTO 가능', fmtShort(l.mtoEarliest)], ['실제 MTO', fmtShort(l.mtoDate)], ['사유', `순차 MTO ${cfg.mtoPerDay}장/일`]],
        }));
      }
      rows.push(bar(`m${l.no}`, 'mto', x(l.mtoDate) + 2, y + 4, colW - 4, bh, {
        cls: 'mto', title: `${l.layer} · MTO`, rows: [['MTO 날짜', fmtShort(l.mtoDate)], ['대기', `${l.mtoWaitDays}일`], ...(l.notes.length ? [['비고', l.notes.join(' · ')]] : [])],
      }));
      y += ROW;
    }
  }

  const today = todayIso();
  const tIdx = toDay(today) - t0;
  const showToday = tIdx >= 0 && tIdx < nDays;

  return (
    <div className="gantt-wrap" ref={wrapRef}>
      <svg className="gantt" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="MTO 일정 간트 차트">
        <defs>
          <pattern id={`h1-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="hatch-bg wait" />
            <rect width="2.4" height="6" className="hatch wait" />
          </pattern>
          <pattern id={`h2-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="hatch-bg s2wait" />
            <rect width="2.4" height="6" className="hatch s2wait" />
          </pattern>
        </defs>
        <g>{bg}</g>
        <text className="lbl sub" x={10} y={TOP - 9}>{`STEP2 동시 진행${cfg.step2Concurrency ? ` (최대 ${cfg.step2Concurrency})` : ''}`}</text>
        <g>{rows}</g>
        {showToday && (
          <g className="today-mark">
            <line x1={x(today) + colW / 2} x2={x(today) + colW / 2} y1={TOP - 18} y2={H - 14} />
            <text x={x(today) + colW / 2 + 4} y={TOP - 20}>오늘</text>
          </g>
        )}
      </svg>
      {tip && <GanttTip tip={tip} />}
    </div>
  );
}

function GanttTip({ tip }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: tip.x + 14, top: tip.y + 14 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 14;
    let left = tip.x + pad;
    let top = tip.y + pad;
    if (left + el.offsetWidth > window.innerWidth - 8) left = tip.x - el.offsetWidth - pad;
    if (top + el.offsetHeight > window.innerHeight - 8) top = tip.y - el.offsetHeight - pad;
    setPos({ left, top });
  }, [tip]);
  return (
    <div className="gantt-tip" ref={ref} style={pos} role="status">
      <div className="t">{tip.title}</div>
      {tip.rows.map(([k, v]) => (
        <div className="r" key={k}>
          <span><i className={`sw ${tip.cls}`} />{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}
