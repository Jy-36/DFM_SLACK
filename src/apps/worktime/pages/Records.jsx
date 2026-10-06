import { useMemo, useState } from 'react';
import { fmtDur, fmtClock, monthLabel, dayLabel, WEEKDAY_KO, ymd, parseYmd } from '../lib/time.js';
import { summarizeMonth, projectedOf, defaultPlanFor } from '../lib/engine.js';
import { LEAVE_ORDER } from '../lib/rules.js';
import { Icon, Pill, StatusPill } from '../../../shared/ui.jsx';
import { TimeField, PRESETS } from '../../../shared/TimeField.jsx';
import { LeaveSelect } from '../components/LeaveSelect.jsx';

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

  // 필요시간에 쳐주는 건 근무일 실적만, 휴일 근무는 따로 (Max에만 반영)
  const monthDone = s.days.filter((d) => !d.isFuture && d.isWorkday).reduce((a, d) => a + d.recognized, 0);
  const holidayDone = s.days.filter((d) => !d.isFuture && !d.isWorkday).reduce((a, d) => a + d.recognized, 0);
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
            <span><i className="sw today" />오늘</span>
            <span className="muted">아래 숫자: 지난 날 = 인정 · 앞으로 = 예정</span>
          </div>
          <div className="month-total">
            <span>필요 <b>{fmtDur(s.required)}</b></span>
            <span>{isCurrent ? '현재까지 인정' : '인정'} <b>{fmtDur(monthDone)}</b></span>
            {holidayDone > 0 && <span>휴일 근무 <b>{fmtDur(holidayDone)}</b> <span className="muted">(Max에만 반영)</span></span>}
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
  const holidayWork = !d.isWorkday && (d.actual > 0 || (!d.isPast && plans[d.key] != null));
  const cls = [
    'cal-d',
    selected && 'sel',
    d.isToday && 'today',
    d.isFuture && 'future',
    d.holiday && 'holiday',
    !d.holiday && !d.isWorkday && 'weekend',
    isFamily && 'family',
    holidayWork && 'holiday-work',
  ]
    .filter(Boolean)
    .join(' ');
  const showPlan = (d.isFuture || d.isToday) && (d.isWorkday || plans[d.key] != null);
  const planVal = showPlan ? projectedOf(d, plans, rules) : null;

  // 아래쪽 큰 숫자: 지난 날은 인정, 오늘은 근무 중, 앞으로는 계획
  let foot = null;
  if (d.live) foot = { label: '근무 중', value: fmtDur(d.recognized), tone: 'live' };
  else if (d.isPast && d.recognized > 0) foot = { label: holidayWork ? '휴일 근무' : '인정', value: fmtDur(d.recognized), tone: holidayWork ? 'hw' : '' };
  else if (showPlan && planVal > 0) foot = { label: holidayWork ? '휴일 예정' : '예정', value: fmtDur(planVal), tone: 'plan' };
  else if (d.isPast && d.isWorkday && d.credit === 0 && !d.isRest) foot = { label: '기록 없음', value: '', tone: 'none' };

  const tag = d.holiday
    ? { text: d.holiday, tone: 'hol' }
    : d.leaveLabel
      ? { text: d.leaveLabel, tone: d.isRest ? 'fam' : 'leave' }
      : isFamily
        ? { text: '패밀리데이 후보', tone: 'fam' }
        : null;

  return (
    <button className={cls} onClick={onClick} aria-pressed={selected} aria-label={dayLabel(d.date)}>
      <div className="cd-head">
        <span className={`dnum ${d.dow === 0 || d.holiday ? 'sun' : d.dow === 6 ? 'sat' : ''}`}>{d.date.getDate()}</span>
        {d.isToday && <span className="cd-today">오늘</span>}
        {d.warnings.length > 0 && <span className="cd-warn" title={d.warnings.join(', ')}>!</span>}
      </div>
      {tag && <span className={`cd-tag ${tag.tone}`} title={tag.text}>{tag.text}</span>}
      {d.inMin != null && (
        <span className="cd-times num">
          <span>{fmtClock(d.inMin)}</span>
          {!d.live && <span className={d.outMin == null ? 'missing' : ''}>{d.outMin != null ? fmtClock(d.outMin) : '퇴근 ?'}</span>}
        </span>
      )}
      {(d.excluded > 0 || (d.inMin == null && d.plannedExclude > 0)) && (
        <span className="cd-ex num" title="제외시간">제외 −{fmtDur(d.inMin != null ? d.excluded : d.plannedExclude)}</span>
      )}
      {foot && (
        <span className={`cd-foot ${foot.tone}`}>
          <span className="cd-label">{foot.label}</span>
          {foot.value && <b className="num">{foot.value}</b>}
        </span>
      )}
    </button>
  );
}

function DayDetail({ d, rec, rules, plans, dispatch }) {
  const set = (patch) => dispatch({ type: 'record/set', key: d.key, patch });
  const breakMin = Math.max(0, d.gross - d.excluded - d.actual);
  const excludes = rec.excludes || [];
  const setEx = (list) => set({ excludes: list.length ? list : undefined });
  return (
    <aside className="panel detail">
      <div className="kv">
        <h2 style={{ margin: 0 }}>{dayLabel(parseYmd(d.key))}</h2>
        <StatusPill day={d} />
      </div>
      {d.holiday && <p className="muted" style={{ margin: 0 }}>{d.holiday} (공휴일)</p>}

      <div className="form">
        <div className="field">
          <span>출근</span>
          <TimeField id={`in-${d.key}`} value={rec.in || ''} presets={PRESETS.in} showNow={d.isToday} ariaLabel="출근 시각" onChange={(v) => set({ in: v })} />
        </div>
        <div className="field">
          <span>퇴근</span>
          <TimeField id={`out-${d.key}`} value={rec.out || ''} presets={PRESETS.out} showNow={d.isToday} ariaLabel="퇴근 시각" onChange={(v) => set({ out: v })} />
        </div>
        <div className="field wide">
          <span>근태 구분</span>
          <LeaveSelect
            id={`leave-${d.key}`}
            rules={rules}
            leave={rec.leave || null}
            leaveMin={rec.leaveMin}
            width={150}
            ariaLabel="근태 구분"
            onChange={(leave, leaveMin) => set({ leave, leaveMin: leave === 'hourly' ? leaveMin : undefined })}
          />
        </div>

        <div className="field wide">
          <span className="ex-head">
            제외시간 <small className="muted">외출 등 근무에서 뺄 시간</small>
            <button
              type="button"
              className="link-btn"
              onClick={() => setEx([...excludes, { from: '12:00', to: '13:00', reason: '' }])}
            >
              <Icon name="plus" size={13} /> 추가
            </button>
          </span>
          {excludes.length === 0 ? (
            <span className="small muted">없음</span>
          ) : (
            <div className="ex-list">
              {excludes.map((x, i) => (
                <div className="ex-row" key={i}>
                  {x.min != null ? (
                    <span className="ex-min num">{fmtDur(x.min)}</span>
                  ) : (
                    <span className="ex-range">
                      <TimeField id={`ex-from-${d.key}-${i}`} value={x.from} allowEmpty={false} presets={PRESETS.any} ariaLabel="제외 시작" onChange={(v) => setEx(excludes.map((y, j) => (j === i ? { ...y, from: v } : y)))} />
                      <span className="muted">~</span>
                      <TimeField id={`ex-to-${d.key}-${i}`} value={x.to} allowEmpty={false} presets={PRESETS.any} ariaLabel="제외 끝" onChange={(v) => setEx(excludes.map((y, j) => (j === i ? { ...y, to: v } : y)))} />
                    </span>
                  )}
                  <input
                    className="input"
                    id={`ex-reason-${d.key}-${i}`}
                    value={x.reason || ''}
                    placeholder="사유 (외출, 병원 등)"
                    onChange={(e) => setEx(excludes.map((y, j) => (j === i ? { ...y, reason: e.target.value } : y)))}
                  />
                  <button type="button" className="lock-btn" title="빼기" aria-label="제외시간 빼기" onClick={() => setEx(excludes.filter((_, j) => j !== i))}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="field wide">
          <span>메모</span>
          <input className="input" id={`note-${d.key}`} value={rec.note || ''} placeholder="예: 출하 대응 야근" onChange={(e) => set({ note: e.target.value })} />
        </label>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div className="kv"><span className="muted">체류</span><span className="v">{fmtDur(d.gross)}</span></div>
        {(d.excluded > 0 || excludes.length > 0) && (
          <div className="kv"><span className="muted">제외시간</span><span className="v">−{fmtDur(d.inMin != null ? d.excluded : d.plannedExclude)}</span></div>
        )}
        <div className="kv"><span className="muted">휴게 차감</span><span className="v">−{fmtDur(breakMin)}</span></div>
        <div className="kv"><span className="muted">실근무</span><span className="v">{fmtDur(d.actual)}</span></div>
        {d.offCredit > 0 && <div className="kv"><span className="muted">{d.leaveLabel} (필요시간 차감)</span><span className="v">{fmtDur(d.offCredit)}</span></div>}
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
      {(rec.in || rec.out || rec.leave || excludes.length > 0) && (
        <button className="btn" onClick={() => dispatch({ type: 'record/clear', key: d.key })}>이 날 기록 지우기</button>
      )}
    </aside>
  );
}
