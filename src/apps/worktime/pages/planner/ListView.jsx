// List: 표에서 바로 고치기 + 오른쪽 서랍 (GUIDE-ui-window §4, SPEC-list-v2)
import { Fragment, useEffect, useMemo, useState } from 'react';
import { isFixedPin } from '../../lib/goal.js';
import { LEAVE_ORDER } from '../../lib/rules.js';
import { toMin, weekKeyOf, parseYmd } from '../../lib/time.js';
import { Tag, TimeCell, Stepper } from './ui.jsx';
import { DayPinEditor } from './DayPanel.jsx';
import { tryPin, bulkResult } from './model.js';
import { clock, dur, signed, md, mdw } from './format.js';
import { useGoalLevel } from './CalendarView.jsx';
import { goalTitle } from './model.js';

const PAST_KEY = 'worktime.planPastOpen';
const readPast = () => {
  try {
    return localStorage.getItem(PAST_KEY) === '1';
  } catch {
    return false;
  }
};

function MonthCard({ summary }) {
  const max = Math.max(summary.possible, summary.projected) * 1.02 || 1;
  const pct = (m) => `${Math.max(0, Math.min(100, (m / max) * 100))}%`;
  const done = summary.doneReq;
  const today = summary.today?.isWorkday ? summary.today.recognized : 0;
  const plan = Math.max(0, summary.projectedReq - done - today);
  return (
    <div className="pl2-card pl2-monthcard">
      <span className="pl2-lbl">월말 예상</span>
      <div className="pl2-monthcard-big">
        <b>{dur(summary.projectedReq)}</b>
        <span>초과 {signed(summary.projectedDiff)}</span>
      </div>
      <div className="pl2-bullet" aria-hidden="true">
        <i className="is-done" style={{ width: pct(done) }} />
        <i className="is-today" style={{ left: pct(done), width: pct(today) }} />
        <i className="is-plan" style={{ left: pct(done + today), width: pct(plan) }} />
        <i className="is-req" style={{ left: pct(summary.required) }} />
        <i className="is-max" style={{ left: pct(summary.possible) }} />
      </div>
      <span className="pl2-bullet-l">
        <span>인정 · 오늘 · 남은 계획</span>
        <span>
          필수 {Math.round(summary.required / 60)} | 최대 {Math.round(summary.possible / 60)}
        </span>
      </span>
    </div>
  );
}

function Row({ v, ctx, selected, onToggle, applyPin, focusRow, idx, expanded, setExpanded, selectingOthers, hoverDelta, go }) {
  const [err, setErr] = useState(null);
  const d = v.d;
  const isPlanable = v.r && (v.state === 'auto' || v.state === 'pin' || v.state === 'today' || v.state === 'holiday' || v.state === 'preview');
  const change = (field, value) => {
    const t = tryPin(d, v.pin, field, value, ctx);
    if (t.blocked) {
      setErr(t.blocked);
      return;
    }
    setErr(null);
    applyPin(v.key, t.pin, `${{ in: '출근', out: '퇴근', net: '실근무' }[field]} ${field === 'net' ? dur(value) : clock(value)}으로 정함`);
  };
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT' && !(e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (e.target.tagName === 'INPUT' && (e.altKey || e.ctrlKey)) return;
      e.preventDefault();
      focusRow(idx + (e.key === 'ArrowDown' ? 1 : -1), e.target.dataset.col);
    } else if (e.key === ' ' && e.target === e.currentTarget && v.selectable) {
      e.preventDefault();
      onToggle(v.key, e);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === e.currentTarget && v.pin) {
      e.preventDefault();
      applyPin(v.key, null, '자동으로 되돌림');
    } else if (e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      e.currentTarget.querySelector('input:not([disabled])')?.focus();
    }
  };
  const cls = ['pl2-row', `pl2-row--${v.state}`];
  if (selected) cls.push('is-selected');
  if (selectingOthers && !selected) cls.push('is-dim');
  if (v.weekend && v.state === 'weekend') cls.push('pl2-row--wk');
  const recIn = v.state === 'today' && d.inMin != null;
  const both = v.pin?.in != null && v.pin?.out != null;
  let memo = v.note;
  let memoTone = v.noteTone === 'warn' ? 'warn' : '';
  if (v.state === 'today' && ctx.advice?.state === 'working') {
    memo = `근무 중 · 지금까지 ${dur(ctx.advice.soFar)}`;
    memoTone = 'ink';
  }
  if (v.state === 'leavePlan') memo = '회사 기록이 들어오면 그 값으로 바뀌어요';
  if (v.state === 'pin' && v.pin?.out != null && v.pin?.net == null && v.pin?.in == null && !v.note) memo = '퇴근을 정해서 출근이 맞춰 움직여요';
  if (v.state === 'pin' && both && !v.note) memo = '출근·퇴근을 정해서 실근무는 계산돼요';
  if (err) {
    memo = err;
    memoTone = 'warn';
  }

  return (
    <>
      <div
        className={cls.join(' ')}
        role="row"
        tabIndex={0}
        data-row={idx}
        aria-selected={selected}
        aria-label={v.label}
        onKeyDown={onKey}
      >
        <span role="gridcell" className="pl2-row-cb">
          {v.selectable && !(v.weekend && v.state === 'weekend') && (
            <input type="checkbox" checked={selected} onChange={(e) => onToggle(v.key, { ctrlKey: true, shiftKey: e.nativeEvent?.shiftKey })} aria-label={`${md(v.key)} 선택`} tabIndex={-1} />
          )}
        </span>
        <span role="gridcell" className="pl2-row-date">
          {mdw(v.key)}
        </span>
        <span role="gridcell">{v.tag && v.state !== 'weekend' && <Tag tone={v.tagTone}>{v.tag}</Tag>}</span>
        <span role="gridcell" className="pl2-row-times">
          {isPlanable ? (
            <>
              <TimeCell label={`${md(v.key)} 출근`} value={v.r.in} record={recIn} pinned={!!v.r.fixed.in && v.r.fixed.in !== 'record'} onChange={(x) => change('in', x)} disabled={selectingOthers} />
              <span className="pl2-dash">–</span>
              <TimeCell label={`${md(v.key)} 퇴근`} value={v.r.out} pinned={v.r.fixed.out} onChange={(x) => change('out', x)} disabled={selectingOthers} />
              <span className="pl2-row-br">휴게 {dur(Math.max(0, v.r.out - v.r.in - (d.plannedExclude || 0) - v.r.net))}</span>
            </>
          ) : v.state === 'rec' && d.inMin != null ? (
            <span className="pl2-t2">
              {clock(d.inMin)} – {clock(d.outMin)}
            </span>
          ) : null}
        </span>
        <span role="gridcell" className="pl2-row-net">
          {isPlanable ? (
            v.state === 'today' ? (
              <>
                <span className="pl2-row-nl">계산</span>
                <b>{dur(v.r.net)}</b>
              </>
            ) : (
              <span className="pl2-netwrap">
                <span className="pl2-row-nl">{v.r.fixed.net ? '정함' : both ? '계산' : '자동'}</span>
                <Stepper kind="dur" label={`${md(v.key)} 실근무`} value={hoverDelta != null ? v.r.net + hoverDelta : v.r.net} pinned={v.r.fixed.net} disabled={both || selectingOthers} disabledReason="출근·퇴근을 모두 정한 날이에요. 출근이나 퇴근을 바꿔 주세요." onChange={(x) => change('net', x)} />
                {hoverDelta != null && <span className="pl2-row-delta">{signed(hoverDelta)}</span>}
              </span>
            )
          ) : v.state === 'leavePlan' || v.state === 'leaveRec' ? (
            <>
              <span className="pl2-row-nl">휴가</span>
              <b className="pl2-t2">{v.main}</b>
            </>
          ) : v.state === 'rec' ? (
            <>
              <span className="pl2-row-nl">인정</span>
              <b className="pl2-t2">{v.main}</b>
            </>
          ) : null}
        </span>
        <span role="gridcell" className={`pl2-row-memo ${memoTone ? `is-${memoTone}` : ''}`}>
          {v.state === 'weekend' && !ctx.isPastMonth ? (
            <button type="button" className="pl2-linkbtn" onClick={() => applyPin(v.key, { net: ctx.rules.dailyStdMin }, '휴일 근무 넣음')}>
              + 휴일 근무 넣기
            </button>
          ) : v.state === 'rec' || v.state === 'recNone' ? (
            <button type="button" className="pl2-linkbtn" onClick={() => go('records', { y: d.date.getFullYear(), m: d.date.getMonth() })}>
              {v.state === 'recNone' ? '근무기록에서 입력' : memo || '근무기록에서 보기'}
            </button>
          ) : (
            memo
          )}
        </span>
        <span role="gridcell">
          {(isPlanable || v.state === 'leavePlan') && !selectingOthers && v.state !== 'today' && (
            <button type="button" className="pl2-more" aria-expanded={expanded} aria-label={`${md(v.key)} 더 보기`} onClick={() => setExpanded(expanded ? null : v.key)}>
              ⋯
            </button>
          )}
        </span>
      </div>
      {expanded && (isPlanable || v.state === 'leavePlan') && (
        <div className="pl2-rowedit">
          {v.state === 'leavePlan' ? (
            <div className="pl2-chips">
              <span className="pl2-t2">{v.tag}</span>
              <button type="button" className="pl2-chip" onClick={() => ctx.applyLeave([v.key], null)}>
                휴가 취소
              </button>
            </div>
          ) : (
            <DayPinEditor v={v} ctx={ctx} applyPin={applyPin} applyLeave={ctx.applyLeave} compact />
          )}
        </div>
      )}
    </>
  );
}

export default function ListView(p) {
  const { views, summary, sel, select, setSel, ctx, listNarrow, hover, isCurrent, rules, goal, go, selectedViews, bulk, setBulk } = p;
  const [pastOpen, setPastOpenRaw] = useState(readPast);
  const [expanded, setExpanded] = useState(null);
  const [folded, setFolded] = useState({});
  const lv = useGoalLevel(summary, rules, ctx.plans, ctx.pins, goal);
  const ctx2 = useMemo(() => ({ ...ctx, applyLeave: p.applyLeave }), [ctx, p.applyLeave]);

  const setPastOpen = (v) => {
    setPastOpenRaw(v);
    try {
      localStorage.setItem(PAST_KEY, v ? '1' : '0');
    } catch {
      /* 저장 불가 */
    }
  };

  const past = views.filter((v) => v.d.isPast);
  const pastWork = past.filter((v) => v.d.isWorkday);
  const pastRec = pastWork.reduce((s, v) => s + v.d.recognized, 0);
  const pastReq = pastWork.reduce((s, v) => s + v.d.dayRequired, 0);
  const ahead = pastRec - pastReq;
  const rest = views.filter((v) => !v.d.isPast);
  const remainWork = rest.filter((v) => v.d.isWorkday && (v.state === 'auto' || v.state === 'pin' || v.state === 'today' || v.state === 'preview'));

  // 주별로 묶기 (이번 달 안쪽만)
  const weeks = useMemo(() => {
    const out = [];
    for (const v of rest) {
      const wk = weekKeyOf(v.d.date);
      let w = out[out.length - 1];
      if (!w || w.key !== wk) {
        w = { key: wk, rows: [] };
        out.push(w);
      }
      w.rows.push(v);
    }
    return out;
  }, [rest]);
  const weekSum = (w) => w.rows.reduce((s, v) => s + (v.r ? v.r.net : v.d.isPast ? v.d.recognized : v.d.credit || 0), 0);
  const weekReq = (w) => w.rows.reduce((s, v) => s + v.d.dayRequired, 0);
  const curWeek = weekKeyOf(parseYmd(summary.todayKey));

  // List 는 체크박스로만 고름: 하나라도 고르면 일괄 막대 (화면에 들어오면 선택 없음)
  useEffect(() => {
    setSel([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selecting = selectedViews.filter((x) => x.selectable).length >= 1;
  const toggle = (key, e) => select(key, e?.shiftKey ? { shiftKey: true } : { ctrlKey: true });

  const focusRow = (i, col) => {
    const el = document.querySelector(`.pl2-list [data-row="${i}"]`);
    if (!el) return;
    if (col) el.querySelector(`[data-col="${col}"]`)?.focus();
    else el.focus();
  };

  let rowIdx = 0;
  const res = selecting ? bulkResult(selectedViews.filter((x) => x.r), bulk, ctx) : null;
  const anyDraft = ['in', 'out', 'net'].some((f) => bulk[f] != null) || bulk.auto;

  const quickSel = (kind) => {
    const keys = remainWork
      .filter((v) => v.state !== 'today' && (kind === 'all' || (kind === 'auto' && !isFixedPin(v.pin)) || (typeof kind === 'number' && v.dow === kind)))
      .map((v) => v.key);
    setSel(keys.length ? keys : sel);
  };

  const avgText =
    goal.target === 'max'
      ? `하루 평균 ${dur(lv.avgNet)}로 월 최대까지`
      : ahead >= 0
        ? `이미 ${dur(ahead)} 앞서 있어서, 하루 평균 ${dur(lv.avgNet)}이면 ${goalTitle(goal, rules)}`
        : `지금 ${dur(-ahead)} 밀려 있어서, 하루 평균 ${dur(lv.avgNet)} 필요`;

  return (
    <div className="pl2-listgrid">
      <section className="pl2-card pl2-list" role="grid" aria-label="근무 계획 목록">
        {past.length > 0 && (
          <div className="pl2-past">
            <button type="button" className="pl2-past-h" aria-expanded={pastOpen} onClick={() => setPastOpen(!pastOpen)}>
              <span className="pl2-t3">{pastOpen ? '▾' : '▸'}</span>
              <b>지난 기간</b>
              <span className="pl2-t2">
                {md(past[0].key)} – {md(past[past.length - 1].key)} · {pastWork.length}일 · 인정 <b className="pl2-ink">{dur(pastRec)}</b> / 필수 몫 {dur(pastReq)}
              </span>
              <Tag tone="rec">{ahead >= 0 ? `${dur(ahead)} 앞섬` : `${dur(-ahead)} 밀림`}</Tag>
              <span className="pl2-sp" />
              <span className="pl2-linktext">{pastOpen ? '접기' : '날짜별로 보기'}</span>
            </button>
            {pastOpen && (
              <div className="pl2-past-b">
                {past
                  .filter((v) => v.state !== 'weekend')
                  .map((v) => (
                    <button key={v.key} type="button" className="pl2-past-row" onClick={() => go('records', { y: v.d.date.getFullYear(), m: v.d.date.getMonth() })}>
                      <span>{mdw(v.key)}</span>
                      <span>{v.d.leaveLabel || '정상'}</span>
                      <span>{v.d.inMin != null ? `${clock(v.d.inMin)} – ${clock(v.d.outMin)}` : '—'}</span>
                      <b>{v.main}</b>
                      <span className="pl2-t3">{v.d.note}</span>
                    </button>
                  ))}
                <span className="pl2-hint">지난 날은 계획에서 고치지 않습니다 · 출퇴근을 고치려면 근무기록</span>
              </div>
            )}
          </div>
        )}

        {selecting ? (
          <div className="pl2-tb pl2-tb--batch" role="toolbar" aria-label="여러 날 한 번에">
            <b>{selectedViews.filter((x) => x.selectable).length}일 선택</b>
            <span className="pl2-tb-sum">
              합계 {dur(selectedViews.reduce((s, x) => s + (x.r?.net || 0), 0))}
              {res && anyDraft ? ` → ${dur(selectedViews.reduce((s, x) => s + (x.r?.net || 0), 0) + res.delta)}` : ''}
            </span>
            <span className="pl2-sp" />
            <BatchFields bulk={bulk} setBulk={setBulk} ctx={ctx} />
            <button type="button" className="pl2-btn pl2-btn--primary pl2-btn--sm" onClick={p.applyBulk} disabled={!(['in', 'out', 'net', 'leave'].some((f) => bulk[f] != null) || bulk.auto)}>
              적용
            </button>
            <button type="button" className="pl2-bulk-x" onClick={() => setSel([])} aria-label="선택 해제">
              ×
            </button>
          </div>
        ) : (
          <div className="pl2-tb">
            <b>남은 근무일 {remainWork.length}일</b>
            {isCurrent && <span className="pl2-bubble">{avgText}</span>}
            <span className="pl2-sp" />
            <span className="pl2-lbl">선택</span>
            <button type="button" className="pl2-chip pl2-chip--sm" onClick={() => quickSel('all')}>
              전체
            </button>
            <button type="button" className="pl2-chip pl2-chip--sm" onClick={() => quickSel('auto')}>
              자동인 날
            </button>
            <label className="pl2-chip pl2-chip--sm pl2-chip--select">
              요일 ▾
              <select aria-label="요일로 선택" value="" onChange={(e) => e.target.value && quickSel(Number(e.target.value))}>
                <option value="">요일</option>
                {[1, 2, 3, 4, 5].map((x) => (
                  <option key={x} value={x}>
                    {'일월화수목금토'[x]}요일
                  </option>
                ))}
              </select>
            </label>
            <MoreMenu onRebuild={p.rebuild} disabled={!isCurrent} />
          </div>
        )}

        <div className="pl2-row pl2-row--head" role="row">
          <span role="columnheader" />
          <span role="columnheader">날짜</span>
          <span role="columnheader">상태</span>
          <span role="columnheader">출근 – 퇴근</span>
          <span role="columnheader">실근무</span>
          <span role="columnheader">알림</span>
          <span role="columnheader" />
        </div>

        {weeks.map((w, wi) => {
          const isFold = folded[w.key] ?? (wi > 1 && w.key !== curWeek);
          const first = w.rows[0].key;
          const last = w.rows[w.rows.length - 1].key;
          const label = w.key === curWeek ? '이번 주' : wi === 1 || (weeks[0].key === curWeek && wi === 1) ? '다음 주' : '';
          const fixedN = w.rows.filter((v) => v.state === 'pin').length;
          const warnN = w.rows.filter((v) => v.noteTone === 'warn').length;
          return (
            <Fragment key={w.key}>
              <button type="button" className="pl2-weeksep" aria-expanded={!isFold} onClick={() => setFolded({ ...folded, [w.key]: !isFold })}>
                <b>
                  {isFold ? '▸ ' : ''}
                  {label ? `${label} ` : ''}
                  {md(first)} – {md(last)}
                </b>
                <span className="pl2-lbl">
                  {isFold ? `${w.rows.filter((v) => v.d.isWorkday).length}일 · ` : ''}예상 {dur(weekSum(w))} · 필수 몫 {dur(weekReq(w))}
                  {isFold && fixedN ? ` · 직접 정함 ${fixedN}일` : ''}
                  {isFold && warnN ? ` · 범위 밖 ${warnN}건` : ''}
                </span>
              </button>
              {!isFold &&
                w.rows.map((v) => {
                  const i = rowIdx++;
                  return (
                    <Row
                      key={v.key}
                      v={v}
                      idx={i}
                      ctx={ctx2}
                      go={go}
                      selected={selecting && sel.includes(v.key)}
                      selectingOthers={selecting}
                      onToggle={toggle}
                      applyPin={p.applyPin}
                      focusRow={focusRow}
                      expanded={expanded === v.key}
                      setExpanded={setExpanded}
                      hoverDelta={hover && hover[v.key] != null ? hover[v.key] : null}
                    />
                  );
                })}
            </Fragment>
          );
        })}
      </section>

      {!listNarrow && (
        <aside className="pl2-drawer">
          <MonthCard summary={summary} />
          {selecting ? (
            <div className="pl2-card pl2-sidecard">
              <b>{anyDraft ? '이렇게 바꾸면' : '여러 날 선택'}</b>
              <span className="pl2-t2">{anyDraft && res ? `합계 ${signed(res.delta)}${res.blocked.length ? ` · ${res.blocked.length}일은 못 바꿈` : ''}` : '위 막대에서 출근·퇴근·실근무·휴가를 골라 한 번에 바꿔요.'}</span>
              <span className="pl2-hint">[적용]하면 달라진 양은 남은 자동 날에서 맞춰요. 선택하는 동안 줄 안의 칸은 잠시 멈춰요.</span>
            </div>
          ) : (
            <div className="pl2-card pl2-sidecard">
              <b>남은 날</b>
              <div className="pl2-facts">
                <span>근무일</span>
                <b>
                  {remainWork.length}일{remainWork.length ? ` · ${md(remainWork[0].key)} – ${md(remainWork[remainWork.length - 1].key)}` : ''}
                </b>
                <span>하루 평균</span>
                <b>{remainWork.length ? dur(Math.round(remainWork.reduce((s, v) => s + v.r.net, 0) / remainWork.length)) : '-'}</b>
                <span>가장 늦은 퇴근</span>
                <b>{remainWork.length ? clock(Math.max(...remainWork.map((v) => v.r.out))) : '-'}</b>
                <span>직접 정한 날</span>
                <b>{remainWork.filter((v) => v.state === 'pin').length}일</b>
                <span>계획한 휴가</span>
                <b>{rest.filter((v) => v.state === 'leavePlan').length}일</b>
              </div>
              <span className="pl2-hint">한 날을 바꾸면 남은 자동 날이 바로 맞춰지고, 아래 알림에서 방식을 바꾸거나 되돌릴 수 있어요.</span>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function BatchFields({ bulk, setBulk, ctx }) {
  const { rules, goal, recentOuts } = ctx;
  const times = (from, to, step) => {
    const out = [];
    for (let m = toMin(from); m <= toMin(to); m += step) out.push(m);
    return out;
  };
  const outs = [...new Set([...(goal.earlyOut ? [toMin(goal.earlyOut)] : []), ...(recentOuts || []).map(toMin), ...times('16:00', rules.recognizeTo, 30)])];
  const f = (field, label, opts, fmt) => (
    <label className={`pl2-bf ${bulk[field] != null ? 'is-on' : ''}`}>
      {label}{' '}
      <select
        aria-label={`${label} 한 번에`}
        value={bulk[field] ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          const val = raw === '' ? null : field === 'leave' ? raw : Number(raw);
          setBulk({ ...bulk, [field]: val, ...(field === 'leave' ? { in: null, out: null, net: null, auto: false } : { leave: null, auto: false }) });
        }}
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {fmt(o)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      {f('in', '출근', times('07:00', '11:00', 30), clock)}
      {f('out', '퇴근', outs, (m) => (clock(m) === goal.earlyOut ? `일찍 퇴근 ${clock(m)}` : clock(m)))}
      {f('net', '실근무', [360, 420, 480, 510, 540, 570, 600], dur)}
      {f('leave', '휴가', [...LEAVE_ORDER.filter((k) => rules.leaveTypes[k]), 'none'], (k) => (k === 'none' ? '휴가 취소' : rules.leaveTypes[k].label))}
      <button type="button" className={`pl2-bf ${bulk.auto ? 'is-on' : ''}`} onClick={() => setBulk({ auto: !bulk.auto })}>
        자동으로
      </button>
    </>
  );
}

function MoreMenu({ onRebuild, disabled }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <span className="pl2-menu">
      <button type="button" className="pl2-btn pl2-btn--ghost pl2-btn--sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} aria-label="더 보기" disabled={disabled}>
        ⋯
      </button>
      {open && (
        <span className="pl2-menu-pop" role="menu">
          {confirm ? (
            <>
              <span className="pl2-hint">직접 정한 날은 그대로 두고 자동 날을 다시 짜요.</span>
              <button
                type="button"
                role="menuitem"
                className="pl2-btn pl2-btn--primary pl2-btn--sm"
                onClick={() => {
                  onRebuild();
                  setOpen(false);
                  setConfirm(false);
                }}
              >
                다시 짜기
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" className="pl2-menu-item" onClick={() => setConfirm(true)}>
              처음부터 다시 짜기
            </button>
          )}
        </span>
      )}
    </span>
  );
}
