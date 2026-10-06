import { useMemo, useState } from 'react';
import { fmtDur, fmtClock, monthLabel, dayLabel, WEEKDAY_KO, ymd, parseYmd } from '../lib/time.js';
import { summarizeMonth, projectedOf, defaultPlanFor } from '../lib/engine.js';
import { LEAVE_ORDER } from '../lib/rules.js';
import { Icon, Pill, StatusPill } from '../../../shared/ui.jsx';

const HEAD = [1, 2, 3, 4, 5, 6, 0]; // 월요일 시작

export default function Records({ state, dispatch, now, view, setView }) {
  const { records, rules, plans } = state;
  const { y, m } = view;
  const s = useMemo(() => summarizeMonth(y, m, records, rules, plans, now), [y, m, records, rules, plans, now]);
  const [sel, setSel] = useState(() => (s.today ? s.today.key : ymd(new Date(y, m, 1))));
  const selDay = s.days.find((d) => d.key === sel) || s.days[0];

  const lead = (s.days[0].dow + 6) % 7;
  const cells = [...Array(lead).fill(null), ...s.days];
  while (cells.length % 7) cells.push(null);

  const move = (delta) => {
    const d = new Date(y, m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setSel(ymd(d));
  };

  const monthDone = s.days.filter((d) => !d.isFuture).reduce((a, d) => a + d.recognized, 0);
  const isCurrent = s.today != null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>근무기록</h1>
          <p>날짜를 눌러 출퇴근·휴가를 확인하고 직접 보정할 수 있습니다.</p>
        </div>
        <div className="head-actions">
          <button className="btn icon" onClick={() => move(-1)} aria-label="이전 달"><Icon name="left" /></button>
          <strong className="num" style={{ minWidth: 110, textAlign: 'center' }}>{monthLabel(y, m)}</strong>
          <button className="btn icon" onClick={() => move(1)} aria-label="다음 달"><Icon name="right" /></button>
          {!isCurrent && (
            <button className="btn" onClick={() => { setView({ y: now.getFullYear(), m: now.getMonth() }); setSel(ymd(now)); }}>
              이번 달
            </button>
          )}
        </div>
      </div>

      <div className="records-layout">
        <section className="panel">
          <div className="cal-scroll">
            <div className="cal">
              {HEAD.map((dow) => (
                <div key={dow} className={`cal-h ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}`}>{WEEKDAY_KO[dow]}</div>
              ))}
              {cells.map((d, i) =>
                d ? (
                  <DayCell key={d.key} d={d} plans={plans} rules={rules} selected={d.key === sel} onClick={() => setSel(d.key)} family={rules.familyDayOn && d.key === s.familyKey} />
                ) : (
                  <div key={`x${i}`} className="cal-d out" aria-hidden="true" />
                ),
              )}
            </div>
          </div>
          <div className="cal-legend" aria-label="달력 색 설명">
            <span><i className="sw holiday" />공휴일</span>
            <span><i className="sw weekend" />주말</span>
            <span><i className="sw family" />패밀리데이</span>
            <span><i className="sw holiday-work" />휴일 근무</span>
          </div>
          <div className="month-total">
            <span>필요 <b>{fmtDur(s.required)}</b></span>
            <span>{isCurrent ? '현재까지 인정' : '인정'} <b>{fmtDur(monthDone)}</b></span>
            {isCurrent ? (
              <span>계획 포함 예상 <b className={s.projectedDiff < 0 ? 'tone-bad' : 'tone-good'}>{fmtDur(s.projectedDiff, { sign: true })}</b></span>
            ) : (
              <span>정산 <b className={monthDone - s.required < 0 ? 'tone-bad' : 'tone-good'}>{fmtDur(monthDone - s.required, { sign: true })}</b></span>
            )}
            <span className="muted">확인 필요 {s.warnings.filter((w) => !w.week).length}건</span>
          </div>
        </section>

        <DayDetail key={selDay.key} d={selDay} rec={records[selDay.key] || {}} rules={rules} plans={plans} dispatch={dispatch} />
      </div>
    </div>
  );
}

function DayCell({ d, plans, rules, selected, onClick, family }) {
  const isFamily = d.isRest || (family && !d.leave && d.isWorkday);
  const cls = [
    'cal-d',
    selected && 'sel',
    d.isToday && 'today',
    d.holiday && 'holiday',
    !d.holiday && !d.isWorkday && 'weekend',
    isFamily && 'family',
    !d.isWorkday && (d.actual > 0 || (!d.isPast && plans[d.key] != null)) && 'holiday-work',
  ]
    .filter(Boolean)
    .join(' ');
  const showPlan = (d.isFuture || d.isToday) && (d.isWorkday || plans[d.key] != null);
  const planVal = showPlan ? projectedOf(d, plans, rules) : null;
  return (
    <button className={cls} onClick={onClick} aria-pressed={selected} aria-label={dayLabel(d.date)}>
      <div className="top">
        <span className={`dnum ${d.dow === 0 ? 'sun' : d.dow === 6 ? 'sat' : ''}`}>{d.date.getDate()}</span>
        {d.leaveLabel && <Pill tone="leave">{d.leaveLabel}</Pill>}
      </div>
      {d.holiday && <span className="hol">{d.holiday}</span>}
      {family && !d.leave && d.isWorkday && <span className="fam">패밀리데이 후보</span>}
      {d.inMin != null && (
        <span className="times">
          {fmtClock(d.inMin)}–{d.live ? '근무중' : d.outMin != null ? fmtClock(d.outMin) : '??'}
        </span>
      )}
      {d.isPast && d.recognized > 0 && <span className="rec num">{fmtDur(d.recognized)}</span>}
      {d.isToday && d.live && <span className="rec num tone-good">{fmtDur(d.recognized)}</span>}
      {showPlan && !d.live && <span className="rec plan num">{fmtDur(planVal)}</span>}
      {d.warnings.length > 0 && <span className="flag" title={d.warnings.join(', ')} />}
    </button>
  );
}

function DayDetail({ d, rec, rules, plans, dispatch }) {
  const set = (patch) => dispatch({ type: 'record/set', key: d.key, patch });
  const breakMin = d.gross - d.actual;
  return (
    <aside className="panel detail">
      <div className="kv">
        <h2 style={{ margin: 0 }}>{dayLabel(parseYmd(d.key))}</h2>
        <StatusPill day={d} />
      </div>
      {d.holiday && <p className="muted" style={{ margin: 0 }}>{d.holiday} (공휴일)</p>}

      <div className="form">
        <label className="field">
          <span>출근</span>
          <input className="input num" type="time" id={`in-${d.key}`} value={rec.in || ''} onChange={(e) => set({ in: e.target.value || null })} />
        </label>
        <label className="field">
          <span>퇴근</span>
          <input className="input num" type="time" id={`out-${d.key}`} value={rec.out || ''} onChange={(e) => set({ out: e.target.value || null })} />
        </label>
        <label className="field wide">
          <span>근태 구분</span>
          <select className="input" id={`leave-${d.key}`} value={rec.leave || ''} onChange={(e) => set({ leave: e.target.value || null })}>
            <option value="">정상 근무</option>
            {LEAVE_ORDER.map((k) => (
              <option key={k} value={k}>
                {rules.leaveTypes[k].label} ({rules.leaveTypes[k].kind === 'work' ? `근무 ${fmtDur(rules.leaveTypes[k].credit)}` : rules.leaveTypes[k].kind === 'rest' ? '필요시간 유지' : `필요 −${fmtDur(rules.leaveTypes[k].credit)}`})
              </option>
            ))}
          </select>
        </label>
        <label className="field wide">
          <span>메모</span>
          <input className="input" id={`note-${d.key}`} value={rec.note || ''} placeholder="예: 출하 대응 야근" onChange={(e) => set({ note: e.target.value })} />
        </label>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div className="kv"><span className="muted">체류</span><span className="v">{fmtDur(d.gross)}</span></div>
        <div className="kv"><span className="muted">휴게 차감</span><span className="v">−{fmtDur(breakMin)}</span></div>
        <div className="kv"><span className="muted">실근무</span><span className="v">{fmtDur(d.actual)}</span></div>
        {d.offCredit > 0 && <div className="kv"><span className="muted">비근무근태 (필요시간 차감)</span><span className="v">{fmtDur(d.offCredit)}</span></div>}
        {d.workCredit > 0 && <div className="kv"><span className="muted">출장·교육 근무 인정</span><span className="v">+{fmtDur(d.workCredit)}</span></div>}
        {d.isRest && <div className="kv"><span className="muted">{d.leaveLabel} · 필요시간 유지</span><span className="v">다른 날에 채움</span></div>}
        {d.isWorkday && <div className="kv"><span className="muted">이날 필수근무</span><span className="v">{fmtDur(d.dayRequired)}</span></div>}
        <div className="kv" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <strong>인정 합계</strong>
          <span className="v" style={{ fontSize: 18 }}>{fmtDur(d.recognized)}</span>
        </div>
        {(d.isFuture || d.isToday) && d.isWorkday && (
          <div className="kv"><span className="muted">계획</span><span className="v tone-plan">{fmtDur(plans[d.key] ?? defaultPlanFor(d, rules))} 실근무</span></div>
        )}
      </div>

      {d.warnings.length > 0 && (
        <div className="banner" style={{ background: 'var(--warn-soft)' }}>
          <span>{d.warnings.join(' · ')}</span>
        </div>
      )}

      <div className="small muted">
        출처: {rec.source === 'portal' ? '사내 근태 사이트' : rec.source === 'mock' ? '가짜 데이터' : rec.in || rec.leave ? '직접 입력' : '기록 없음'}
        {rec.edited ? ' · 직접 보정함' : ''}
      </div>
      {(rec.in || rec.out || rec.leave) && (
        <button className="btn" onClick={() => dispatch({ type: 'record/clear', key: d.key })}>이 날 기록 지우기</button>
      )}
    </aside>
  );
}
