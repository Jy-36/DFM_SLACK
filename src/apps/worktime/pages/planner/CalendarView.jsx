// Calendar: 왼쪽 목표 요약 · 가운데 달력 · 오른쪽 상세 패널 (GUIDE-ui-window §3)
import { useEffect, useMemo, useRef, useState } from 'react';
import { distributeByGoal, describePlan, excessForGoal } from '../../lib/goal.js';
import { LEAVE_ORDER } from '../../lib/rules.js';
import { toMin } from '../../lib/time.js';
import { Tag } from './ui.jsx';
import DayPanel from './DayPanel.jsx';
import { clock, dur, signed } from './format.js';
import { goalTitle } from './model.js';

export const HEADS = ['월', '화', '수', '목', '금', '토', '일'];
const CAL_PAST_KEY = 'worktime.calPastOpen';
const readCalPast = () => {
  try {
    return localStorage.getItem(CAL_PAST_KEY) === '1';
  } catch {
    return false;
  }
};
/** 접힌 지난 주 한 줄: 11/1 – 11/8 · 근무 5일 · 인정 46:08 / 필수 40:00 */
function pastSummary(list) {
  const work = list.filter((v) => v.d.isWorkday);
  const rec = list.reduce((s, v) => s + (v.d.recognized || 0), 0);
  const req = work.reduce((s, v) => s + (v.d.dayRequired || 0), 0);
  const [a, b] = [list[0].key, list[list.length - 1].key].map((k) => k.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/'));
  return `${a} – ${b} · 근무 ${work.length}일 · 인정 ${dur(rec)} / 필수 ${dur(req)} (${signed(rec - req)})`;
}
const LEVEL = { ok: ['✓ 여유', 'ok'], tight: ['빡빡해요', 'warn'], fail: ['못 채워요', 'bad'], max: ['최대한', 'acc'] };

export function useGoalLevel(summary, rules, plans, pins, goal) {
  return useMemo(() => {
    const r = distributeByGoal(summary, rules, plans, pins, goal, null, true);
    return describePlan(summary, rules, goal, pins, r);
  }, [summary, rules, plans, pins, goal]);
}

function RangeView({ goal, rules }) {
  const from = toMin(rules.recognizeFrom);
  const to = toMin(rules.recognizeTo);
  const a = toMin(goal.startIn || rules.planDefaultIn);
  const b = goal.cutoff ? toMin(goal.cutoff) : to;
  const pct = (m) => `${((m - from) / (to - from)) * 100}%`;
  return (
    <div className="pl2-range" aria-hidden="true">
      <i className="pl2-range-track" />
      <i className="pl2-range-fill" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />
      <i className="pl2-range-knob" style={{ left: pct(a) }} />
      <i className="pl2-range-knob" style={{ left: pct(b) }} />
    </div>
  );
}

function GoalSide({ summary, rules, goal, ctx, openFill, isPastMonth }) {
  const lv = useGoalLevel(summary, rules, ctx.plans, ctx.pins, goal);
  const want = excessForGoal(goal, rules);
  const dayMax = Math.max(0, (goal.cutoff ? toMin(goal.cutoff) : toMin(rules.recognizeTo)) - toMin(goal.startIn || rules.planDefaultIn));
  const [lvText, lvTone] = LEVEL[lv.level];
  const early = goal.earlyDays?.length ? `${goal.earlyDays.map((x) => '일월화수목금토'[x]).join('·')}요일 ${goal.earlyOut}` : '없음';
  return (
    <aside className="pl2-card pl2-goalside" aria-label="이번 달 목표">
      <div className="pl2-stack">
        <span className="pl2-lbl">이번 달 목표</span>
        <button type="button" className="pl2-goalbig" onClick={openFill} disabled={isPastMonth}>
          {goalTitle(goal, rules)}
        </button>
        <span className="pl2-t2 pl2-small">
          {want === Infinity ? '월 최대까지' : `초과 ${dur(want)}까지`} · 필수 {dur(summary.required)}
        </span>
      </div>
      <button type="button" className="pl2-stack pl2-rangebtn" onClick={openFill} disabled={isPastMonth} aria-label="근무 시간대 바꾸기">
        <span className="pl2-lbl">근무 시간대</span>
        <RangeView goal={goal} rules={rules} />
        <span className="pl2-rangelabels">
          <b>{goal.startIn || rules.planDefaultIn}</b>
          <span className="pl2-lbl">하루 최대 {dur(Math.max(0, dayMax - 60))}</span>
          <b>{goal.cutoff || '제한 없음'}</b>
        </span>
      </button>
      <div className="pl2-kv">
        <span className="pl2-lbl">일찍 퇴근</span>
        <b>{early}</b>
      </div>
      <div className={`pl2-level pl2-level--${lvTone}`}>
        <b>{lvText}</b>
        <span>
          {lv.days ? `목표까지 남은 자동 ${lv.days}일을 평균 ${dur(lv.avgNet)}씩. 가장 늦은 퇴근 ${clock(lv.latestOut)}.` : '자동으로 짤 날이 없어요.'}
        </span>
      </div>
      <button type="button" className="pl2-btn pl2-btn--primary pl2-btn--block" onClick={openFill} disabled={isPastMonth}>
        조건 바꾸고 다시 채우기
      </button>
      <div className="pl2-legend" aria-label="칸 색 안내">
        <span className="pl2-lbl">칸 색</span>
        <span>
          <i className="pl2-sw pl2-sw--rec" />
          기록 · 회사 사이트
        </span>
        <span>
          <i className="pl2-sw pl2-sw--auto" />
          자동 · 표시 없음
        </span>
        <span>
          <i className="pl2-sw pl2-sw--pin" />
          직접 정함
        </span>
        <span>
          <i className="pl2-sw pl2-sw--leave" />
          계획한 휴가
        </span>
      </div>
    </aside>
  );
}

function GoalStrip({ summary, rules, goal, ctx, openFill, isPastMonth }) {
  const lv = useGoalLevel(summary, rules, ctx.plans, ctx.pins, goal);
  const [lvText, lvTone] = LEVEL[lv.level];
  return (
    <div className="pl2-card pl2-goalstrip">
      <span className="pl2-lbl">목표</span>
      <b>{goalTitle(goal, rules)}</b>
      <i className="pl2-vsep" />
      <span className="pl2-lbl">시간대</span>
      <b>
        {goal.startIn || rules.planDefaultIn} – {goal.cutoff || '제한 없음'}
      </b>
      <i className="pl2-vsep" />
      <span className="pl2-lbl">일찍 퇴근</span>
      <b>{goal.earlyDays?.length ? `${goal.earlyDays.map((x) => '일월화수목금토'[x]).join('·')} ${goal.earlyOut}` : '없음'}</b>
      <Tag tone={lvTone === 'ok' ? 'rec' : lvTone}>
        {lvText} · 평균 {dur(lv.avgNet)}
      </Tag>
      <span className="pl2-sp" />
      <button type="button" className="pl2-btn pl2-btn--primary pl2-btn--sm" onClick={openFill} disabled={isPastMonth}>
        조건 바꾸고 다시 채우기
      </button>
    </div>
  );
}

export function Cell({ v, selected, focused, preview, dim, onClick, onDoubleClick, onKeyDown, cellRef }) {
  const cls = ['pl2-cell', `pl2-cell--${v.state}`];
  if (v.weekend && v.state === 'weekend') cls.push('pl2-cell--wk');
  if (selected) cls.push('is-selected');
  if (preview) cls.push('is-preview');
  if (dim) cls.push('is-dim');
  const sunday = v.dow === 0;
  return (
    <div
      ref={cellRef}
      role="gridcell"
      aria-selected={selected}
      aria-label={v.label}
      tabIndex={onClick ? (focused ? 0 : -1) : undefined}
      className={cls.join(' ')}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <div className="pl2-cell-top">
        <span className={`pl2-cell-n ${sunday || v.d.holiday ? 'is-sun' : ''}`}>{v.n}</span>
        {v.tag && v.state !== 'weekend' && (
          <span className={`pl2-tag pl2-tag--${v.tagTone}`} title={v.tag}>
            {v.tag}
          </span>
        )}
      </div>
      {v.state === 'weekend' && v.d.holiday && v.dow >= 1 && v.dow <= 5 && <span className="pl2-cell-hol">{v.d.holiday}</span>}
      {v.state !== 'weekend' && (
        <div className="pl2-cell-body">
          {preview ? (
            <>
              <span className="pl2-cell-main is-acc">{preview.main}</span>
              <span className="pl2-cell-sub">{v.sub}</span>
              <span className="pl2-cell-note is-acc">
                {signed(preview.delta)} · {preview.from}에서
              </span>
            </>
          ) : (
            <>
              <span className={`pl2-cell-main ${v.mainSmall ? 'is-small' : ''}`}>{v.main}</span>
              {v.sub && <span className="pl2-cell-sub">{v.sub}</span>}
              {v.note && <span className={`pl2-cell-note ${v.noteTone === 'warn' ? 'is-warn' : ''}`}>{v.note}</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 이번 달 칸 42개 (월요일 시작). 이번 달이 아닌 칸은 null */
export function gridOf(views) {
  if (!views.length) return [];
  const first = views[0].d.date;
  const lead = (first.getDay() + 6) % 7;
  const cells = Array(lead).fill(null).concat(views);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function BulkBar({ bulk, setBulk, onApply, onClear, count, ctx }) {
  const { rules, goal, recentOuts } = ctx;
  const times = (from, to, step) => {
    const out = [];
    for (let m = toMin(from); m <= toMin(to); m += step) out.push(clock(m));
    return out;
  };
  const outs = [...new Set([...(goal.earlyOut ? [goal.earlyOut] : []), ...(recentOuts || []), ...times('16:00', rules.recognizeTo, 30)])];
  const sel = (field, label, options, fmt = (x) => x) => (
    <label className={`pl2-bf ${bulk[field] != null ? 'is-on' : ''}`}>
      {label}{' '}
      <select
        aria-label={`${label} 한 번에`}
        value={bulk[field] == null ? '' : bulk[field]}
        onChange={(e) => {
          const raw = e.target.value;
          const val = raw === '' ? null : field === 'leave' ? raw : Number(raw);
          setBulk({ ...bulk, [field]: val, ...(field === 'leave' ? { in: null, out: null, net: null, auto: false } : { leave: null, auto: false }) });
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {fmt(o)}
          </option>
        ))}
      </select>
    </label>
  );
  const ready = ['in', 'out', 'net', 'leave'].some((f) => bulk[f] != null) || bulk.auto;
  return (
    <div className="pl2-bulk" role="toolbar" aria-label="여러 날 한 번에">
      <b>{count}일 선택</b>
      <span className="pl2-sp" />
      {sel('in', '출근', times('07:00', '11:00', 30).map((t) => ({ value: toMin(t), label: t })), (o) => o.label)}
      {sel('out', '퇴근', outs.map((t) => ({ value: toMin(t), label: t === goal.earlyOut ? `일찍 퇴근 ${t}` : t })), (o) => o.label)}
      {sel('net', '실근무', [360, 420, 480, 510, 540, 570, 600].map((m) => ({ value: m, label: dur(m) })), (o) => o.label)}
      {sel('leave', '휴가', [...LEAVE_ORDER.filter((k) => rules.leaveTypes[k]).map((k) => ({ value: k, label: rules.leaveTypes[k].label })), { value: 'none', label: '휴가 취소' }], (o) => o.label)}
      <button type="button" className={`pl2-bf ${bulk.auto ? 'is-on' : ''}`} onClick={() => setBulk({ auto: !bulk.auto })}>
        자동으로
      </button>
      <button type="button" className="pl2-btn pl2-btn--primary pl2-btn--sm" onClick={onApply} disabled={!ready}>
        적용
      </button>
      <button type="button" className="pl2-bulk-x" onClick={onClear} aria-label="선택 해제">
        ×
      </button>
    </div>
  );
}

export default function CalendarView(p) {
  const { views, viewOf, sel, select, setSel, summary, rules, goal, ctx, width, go, selectedViews, hover, isCurrent } = p;
  const cells = useMemo(() => gridOf(views), [views]);
  // 이번 달: 다 지난 주는 한 줄로 접는다 (GUIDE-ui-window §3.3 v1.1)
  const [pastOpen, setPastOpenRaw] = useState(readCalPast);
  const setPastOpen = (on) => {
    setPastOpenRaw(on);
    try {
      localStorage.setItem(CAL_PAST_KEY, on ? '1' : '0');
    } catch {
      /* 저장 불가 */
    }
  };
  const pastRows = useMemo(() => {
    if (!isCurrent) return 0;
    let n = 0;
    for (let i = 0; i < cells.length; i += 7) {
      const row = cells.slice(i, i + 7).filter(Boolean);
      if (row.length && row.every((v) => v.d.isPast)) n += 1;
      else break;
    }
    return n;
  }, [cells, isCurrent]);
  const pastKeys = useMemo(() => new Set(cells.slice(0, pastRows * 7).filter(Boolean).map((v) => v.key)), [cells, pastRows]);
  const collapsed = pastRows > 0 && !pastOpen && !sel.some((k) => pastKeys.has(k));
  const [focusKey, setFocusKey] = useState(null);
  const refs = useRef({});
  const panelRef = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const narrow = width < 1180;
  const overlay = width < 880;
  const fk = focusKey || sel[sel.length - 1] || views.find((v) => v.state === 'today')?.key || views[0]?.key;

  useEffect(() => {
    if (focusKey && refs.current[focusKey] && document.activeElement?.getAttribute('role') === 'gridcell') refs.current[focusKey].focus();
  }, [focusKey]);

  const moveFocus = (key, delta) => {
    const i = views.findIndex((v) => v.key === key);
    const j = Math.max(0, Math.min(views.length - 1, i + delta));
    if (collapsed && pastKeys.has(views[j].key)) return; // 접힌 지난 주로는 가지 않음
    setFocusKey(views[j].key);
  };
  const onKey = (v) => (e) => {
    const dowMon = (v.d.date.getDay() + 6) % 7;
    if (e.key === 'ArrowRight') moveFocus(v.key, 1);
    else if (e.key === 'ArrowLeft') moveFocus(v.key, -1);
    else if (e.key === 'ArrowDown') moveFocus(v.key, 7);
    else if (e.key === 'ArrowUp') moveFocus(v.key, -7);
    else if (e.key === 'Home') moveFocus(v.key, -dowMon);
    else if (e.key === 'End') moveFocus(v.key, 4 - dowMon);
    else if (e.key === 'Enter') {
      select(v.key, {});
      setDrawerOpen(true);
      setTimeout(() => panelRef.current?.querySelector('input:not([readonly]), button')?.focus(), 0);
    } else if (e.key === ' ') {
      select(v.key, { ctrlKey: true });
    } else return;
    e.preventDefault();
  };

  const single = sel.length === 1 ? viewOf[sel[0]] : null;
  const navDay = (dl) => {
    if (!single) return;
    const i = views.findIndex((v) => v.key === single.key);
    const n = views[Math.max(0, Math.min(views.length - 1, i + dl))];
    if (n) select(n.key, {});
  };

  const panel = (
    <DayPanel
      v={single}
      ctx={ctx}
      go={go}
      applyPin={p.applyPin}
      applyLeave={p.applyLeave}
      selectedViews={selectedViews}
      onNav={navDay}
      bulk={p.bulk}
      onClose={overlay ? () => setDrawerOpen(false) : null}
    />
  );

  return (
    <>
      {narrow && <GoalStrip summary={summary} rules={rules} goal={goal} ctx={ctx} openFill={p.openFill} isPastMonth={p.isPastMonth} />}
      <div className="pl2-calgrid">
        {!narrow && <GoalSide summary={summary} rules={rules} goal={goal} ctx={ctx} openFill={p.openFill} isPastMonth={p.isPastMonth} />}
        <section className="pl2-card pl2-calcard">
          <div className="pl2-month-grid" role="grid" aria-label="이번 달 근무 계획">
            {HEADS.map((h, i) => (
              <div key={h} className={`pl2-dow ${i === 6 ? 'is-sun' : ''}`} role="columnheader">
                {h}
              </div>
            ))}
            {pastRows > 0 && (
              <button type="button" className="pl2-pastrow" aria-expanded={!collapsed} onClick={() => setPastOpen(collapsed)}>
                <span className="pl2-t3">{collapsed ? '▸' : '▾'}</span>
                <b>지난 {pastRows === 1 ? '주' : `${pastRows}주`}</b>
                <span className="pl2-t2">
                  {pastSummary(cells.slice(0, pastRows * 7).filter(Boolean))}
                </span>
                <span className="pl2-sp" />
                <span className="pl2-lbl">{collapsed ? '펼치기' : '접기'}</span>
              </button>
            )}
            {cells.map((v, i) =>
              collapsed && i < pastRows * 7 ? null : v ? (
                <Cell
                  key={v.key}
                  v={v}
                  cellRef={(el) => (refs.current[v.key] = el)}
                  selected={sel.includes(v.key)}
                  focused={v.key === fk}
                  preview={hover && hover[v.key] != null && v.r ? { delta: hover[v.key], from: v.main, main: dur(v.r.net + hover[v.key]) } : null}
                  onClick={(e) => {
                    setFocusKey(v.key);
                    select(v.key, e);
                    setDrawerOpen(true);
                  }}
                  onDoubleClick={() => (v.state === 'rec' || v.state === 'recNone') && go('records', { y: v.d.date.getFullYear(), m: v.d.date.getMonth() })}
                  onKeyDown={onKey(v)}
                />
              ) : (
                <div key={`e${i}`} className="pl2-cell pl2-cell--empty" aria-hidden="true" />
              ),
            )}
          </div>
          {selectedViews.length > 1 ? (
            <BulkBar bulk={p.bulk} setBulk={p.setBulk} onApply={p.applyBulk} onClear={() => setSel(sel.slice(-1))} count={selectedViews.filter((x) => x.selectable).length} ctx={ctx} />
          ) : null}
        </section>
        {(!overlay || drawerOpen) && (
          <aside ref={panelRef} className={`pl2-card pl2-ins ${overlay ? 'pl2-ins--drawer' : ''}`} aria-label="선택한 날">
            {panel}
          </aside>
        )}
      </div>
    </>
  );
}
