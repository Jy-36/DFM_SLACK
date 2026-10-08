// 전체 일정 간트: 묶음(Product·Revision)마다 한 줄 — STEP1 · STEP2 · MTO 구간, GDS ▼, 최종 MTO ◆
import { useEffect, useMemo, useRef, useState } from 'react';
import { makeCalendar } from '../lib/scheduler.js';
import { addDays, fmtShort, fromDay, toDay, todayIso, weekdayOf } from '../lib/dates.js';

const LABEL_W = 190;
const TOP = 44;
const ROW = 40;
const PAD_R = 80; // 최종 MTO 날짜 글자 자리

const span = (layers, a, b) => ({ from: layers.reduce((m, l) => (l[a] < m ? l[a] : m), layers[0][a]), to: layers.reduce((m, l) => (l[b] > m ? l[b] : m), layers[0][b]) });

export default function PortfolioGantt({ items, config, onPick }) {
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

  const geo = useMemo(() => {
    const rs = items.map((it) => it.result);
    const start = rs.reduce((m, r) => (r.partAGds < m ? r.partAGds : m), rs[0].partAGds);
    const end = rs.reduce((m, r) => (r.finalMto > m ? r.finalMto : m), rs[0].finalMto);
    const t0 = toDay(start);
    const nDays = toDay(end) - t0 + 4;
    const colW = Math.max(8, Math.min(30, Math.floor((width - LABEL_W - PAD_R) / nDays)));
    const off = new Map(makeCalendar(config).holidaysBetween(start, addDays(start, nDays - 1), false).map((h) => [h.date, h.name]));
    return { t0, nDays, colW, off, W: LABEL_W + colW * nDays + PAD_R, H: TOP + ROW * items.length + 12 };
  }, [items, config, width]);
  const { t0, nDays, colW, off, W, H } = geo;
  const x = (iso) => LABEL_W + (toDay(iso) - t0) * colW;
  const xEnd = (iso) => x(iso) + colW;

  const bg = [];
  for (let i = 0; i < nDays; i++) {
    const ds = fromDay(t0 + i);
    const cx = LABEL_W + i * colW;
    const d = Number(ds.slice(8));
    const w = weekdayOf(t0 + i);
    const nm = off.get(ds);
    if (nm) bg.push(<rect key={`h${i}`} className={nm === '주말' ? 'col-we' : 'col-hol'} x={cx} y={TOP} width={colW} height={H - TOP - 12} />);
    if (colW >= 12 && (colW >= 18 || d % 2 === 1)) bg.push(<text key={`d${i}`} className={`day ${w === 0 || w === 6 || (nm && nm !== '주말') ? 'off' : ''}`} x={cx + colW / 2} y={TOP - 8}>{d}</text>);
    if (d === 1 || i === 0) {
      bg.push(<line key={`m${i}`} className="month-line" x1={cx} x2={cx} y1={4} y2={H - 12} />);
      bg.push(<text key={`mt${i}`} className="month" x={cx + 4} y={16}>{`${ds.slice(0, 4)}.${ds.slice(5, 7)}`}</text>);
    }
  }

  const rows = items.map((it, k) => {
    const { project: p, result: r } = it;
    const y = TOP + k * ROW;
    const L = r.layers;
    const s1 = span(L, 'step1Start', 'step1End');
    const s2 = span(L, 'step2Start', 'step2End');
    const mt = span(L, 'mtoDate', 'mtoDate');
    const mid = y + ROW / 2;
    const t = (title, rowsArr, cls) => ({ title: `${p.name} · ${title}`, rows: rowsArr, cls });
    const bar = (key, cls, a, b, cy, h, tipObj) => (
      <g key={key} className="g-bar" onPointerMove={(e) => setTip({ ...tipObj, x: e.clientX, y: e.clientY })} onPointerLeave={() => setTip(null)}>
        <rect className={`bar ${cls}`} x={x(a)} y={cy - h / 2} width={Math.max(xEnd(b) - x(a), 2)} height={h} rx={4} />
        <rect className="hit" x={x(a) - 2} y={cy - h / 2 - 3} width={Math.max(xEnd(b) - x(a), 2) + 4} height={h + 6} />
      </g>
    );
    const gdsList = Object.values(r.step1).map((v) => v.gds);
    return (
      <g key={p.id} className="pf-row" onClick={() => onPick?.(p.id)}>
        <rect className={k % 2 ? 'rowband' : 'rowband-0'} x={0} y={y} width={W} height={ROW} />
        <text className={`lbl kind ${p.kind}`} x={10} y={mid + 4}>{p.kind === 'revision' ? 'ITEM' : 'P'}</text>
        <text className="lbl strong" x={44} y={mid + 4}>{p.name.length > 16 ? `${p.name.slice(0, 15)}…` : p.name}</text>
        <text className="lbl sub" x={LABEL_W - 10} y={mid + 4} textAnchor="end">{`${L.length}장`}</text>
        {gdsList.map((g, i) => <path key={`g${i}`} className="gds-mark" d={`M${x(g) + colW / 2 - 4},${y + 2} l4,6 l4,-6 z`} />)}
        {bar('s1', 'step1', s1.from, s1.to, mid - 6, 9, t('STEP1', [['시작', fmtShort(s1.from)], ['종료', fmtShort(s1.to)]], 'step1'))}
        {bar('s2', 'step2 soft', s2.from, s2.to, mid - 6, 9, t('STEP2', [['첫 시작', fmtShort(s2.from)], ['마지막 종료', fmtShort(s2.to)], ['STEP2 대기 누적', `${it.analysis.summary.step2WaitTotal}일`]], 'step2'))}
        {bar('mt', 'mto', mt.from, mt.to, mid + 7, 7, t('MTO', [['첫 MTO', fmtShort(mt.from)], ['최종 MTO', fmtShort(mt.to)], ['조건', `${r.config.mtoPerDay}장/일 · STEP2 ${r.config.step2Concurrency ?? '무제한'}`]], 'mto'))}
        <path className="final-mark" d={`M${x(r.finalMto) + colW / 2},${mid + 7 - 7} l6,7 l-6,7 l-6,-7 z`} />
        <text className="lbl final" x={xEnd(r.finalMto) + 6} y={mid + 11}>{fmtShort(r.finalMto)}</text>
      </g>
    );
  });

  const today = todayIso();
  const ti = toDay(today) - t0;
  return (
    <div className="gantt-wrap" ref={wrapRef}>
      <svg className="gantt pf" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="전체 Product · Revision 일정">
        <g>{bg}</g>
        <g>{rows}</g>
        {ti >= 0 && ti < nDays && (
          <g className="today-mark">
            <line x1={x(today) + colW / 2} x2={x(today) + colW / 2} y1={TOP - 4} y2={H - 12} />
          </g>
        )}
      </svg>
      {tip && (
        <div className="gantt-tip" style={{ left: tip.x + 14, top: tip.y + 14 }} role="status">
          <div className="t">{tip.title}</div>
          {tip.rows.map(([k, v]) => (
            <div className="r" key={k}><span><i className={`sw ${tip.cls}`} />{k}</span><b>{v}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
