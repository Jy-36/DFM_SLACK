import { useMemo, useRef, useState } from 'react';
import { fmtDur, fmtClock, toMin, dayLabel, monthLabel, weekKeyOf, parseYmd, parseDurInput } from '../lib/time.js';
import { defaultPlanFor, projectedOf, distributeEvenly, distributeAmong, distributeToMax, summarizeMonth, grossForNet, netFromGross, capacityOf, dailyCapOf, earlierStarts } from '../lib/engine.js';
import { LEAVE_ORDER } from '../lib/rules.js';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { TimeField, PRESETS } from '../../../shared/TimeField.jsx';
import { LeaveSelect } from '../components/LeaveSelect.jsx';
import { TargetsPanel } from '../components/Targets.jsx';

export default function Planner({ state, dispatch, summary, notify, now }) {
  const { rules, plans, records } = state;
  const planIns = state.planIns || {};
  const locks = state.planLocks || {};
  const s = summary;
  // 남은 근무일 + 계획·실적이 있는 휴일(주말·공휴일) 근무
  const holidayRows = s.holidayDays.filter((d) => plans[d.key] != null || d.actual > 0);
  const rows = [...s.upcoming, ...holidayRows].sort((a, b) => (a.key < b.key ? -1 : 1));
  const addableHolidays = s.holidayDays.filter((d) => plans[d.key] == null && d.actual === 0);
  const [holidayPick, setHolidayPick] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const lockedCount = rows.filter((d) => locks[d.key]).length;

  // (제한을 켠 경우) 1일·주 한도를 지키며 이번 달 실제로 채울 수 있는 최대
  const reachable = useMemo(
    () => summarizeMonth(s.year, s.month, records, rules, { ...plans, ...distributeToMax(s, rules, plans, null, locks) }, now).projected,
    [s, records, rules, plans, locks, now],
  );

  const edited = rows.filter((d) => plans[d.key] != null || planIns[d.key]).length;
  // Shift를 누른 채 누르면 마지막으로 누른 날부터 여기까지 한 번에 선택(또는 해제)
  const anchor = useRef(null);
  const toggle = (key, shift) =>
    setSel((prev) => {
      const next = new Set(prev);
      const turnOn = !prev.has(key);
      const from = anchor.current ? rows.findIndex((d) => d.key === anchor.current) : -1;
      const to = rows.findIndex((d) => d.key === key);
      if (shift && from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from];
        for (const d of rows.slice(a, b + 1)) {
          if (turnOn) next.add(d.key);
          else next.delete(d.key);
        }
      } else if (turnOn) next.add(key);
      else next.delete(key);
      anchor.current = key;
      return next;
    });
  const selectWhere = (fn) => setSel(new Set(rows.filter(fn).map((d) => d.key)));

  const thisWeek = weekKeyOf(parseYmd(s.todayKey));
  const weekKeys = [...new Set(rows.map((d) => weekKeyOf(d.date)))];
  const nextWeek = weekKeys.find((k) => k > thisWeek);

  const groups = [];
  for (const d of rows) {
    const wk = weekKeyOf(d.date);
    let g = groups[groups.length - 1];
    if (!g || g.key !== wk) {
      g = { key: wk, days: [] };
      groups.push(g);
    }
    g.days.push(d);
  }
  const weekProjected = (key) => s.weeks.find((w) => w.key === key)?.projected ?? 0;
  const allSelected = rows.length > 0 && rows.every((d) => sel.has(d.key));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>근무 계획</h1>
          <p>{monthLabel(s.year, s.month)} 남은 근무일에 일할 시간을 정하면 필요시간·Max 대비 결과가 바로 계산됩니다.</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => { dispatch({ type: 'plan/replace', plans: {}, clearLocks: true }); setSel(new Set()); }} disabled={!edited && !lockedCount}>
            계획 초기화
          </button>
          <button
            className="btn"
            title="남은 근무일에 고르게 나눠 월 Max까지 채웁니다"
            onClick={() => {
              const next = distributeToMax(s, rules, plans, null, locks);
              const ins = earlierStarts(s, rules, next, planIns);
              dispatch({ type: 'plan/merge', plans: next, ins });
              notify(`${lockedCount ? `고정한 ${lockedCount}일은 그대로 두고 ` : ''}월 Max까지 채웠습니다.${Object.keys(ins).length ? ` ${Object.keys(ins).length}일은 22시 전에 끝나도록 출근을 앞당겼습니다.` : ''}`);
            }}
          >
            Max까지 채우기
          </button>
          <button
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'plan/merge', plans: distributeEvenly(s, rules, plans, locks) });
              notify(lockedCount ? `고정한 ${lockedCount}일은 그대로 두고 나머지 날에 나눴습니다.` : '남은 필요시간을 근무일에 고르게 나눴습니다.');
            }}
          >
            남은 필요시간 균등 배분
          </button>
        </div>
      </div>

      <TargetsPanel s={s} rules={rules} reachable={reachable} />

      <FamilyDayCard s={s} rules={rules} plans={plans} locks={locks} dispatch={dispatch} notify={notify} />

      <section className="panel">
        <h2>
          <span>
            남은 근무일 {rows.length}일{' '}
            {rows.length - s.daysToWork > 0 && <span className="small muted" style={{ fontWeight: 500 }}>· 종일 휴가 {rows.length - s.daysToWork}일 포함</span>}
          </span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {lockedCount > 0 && <Pill tone="accent"><Icon name="lock" size={12} /> {lockedCount}일 고정</Pill>}
            {edited > 0 && <Pill tone="plan">{edited}일 직접 조정</Pill>}
          </span>
        </h2>

        <div className="holiday-add">
          <span className="small muted">휴일 근무</span>
          <select className="input" id="pl-holiday-pick" value={holidayPick} onChange={(e) => setHolidayPick(e.target.value)} style={{ width: 190 }} aria-label="휴일 근무할 날짜">
            <option value="">주말·공휴일 선택</option>
            {addableHolidays.map((d) => (
              <option key={d.key} value={d.key}>{dayLabel(d.date)}{d.holiday ? ` ${d.holiday}` : ''}</option>
            ))}
          </select>
          <button
            className="btn"
            disabled={!holidayPick}
            onClick={() => {
              dispatch({ type: 'plan/set', key: holidayPick, minutes: rules.dailyStdMin, lock: true });
              notify(`${dayLabel(parseYmd(holidayPick))} 휴일 근무 ${fmtDur(rules.dailyStdMin)}를 넣었습니다. Max에서만 차감되고 필요시간은 그대로입니다.`);
              setHolidayPick('');
            }}
          >
            <Icon name="plus" size={14} /> 휴일 근무 추가
          </button>
          <span className="small muted">
            {s.holidayPlanned > 0 ? `남은 휴일 근무 ${fmtDur(s.holidayPlanned)} · ` : ''}Max에서만 차감되고 필요시간은 줄지 않아요
          </span>
        </div>

        <div className="quick-select" role="group" aria-label="날짜 빠른 선택">
          <span className="small muted">빠른 선택</span>
          <button className="chip" onClick={() => selectWhere(() => true)}>전체</button>
          <button className="chip" onClick={() => selectWhere((d) => capacityOf(d, rules) >= rules.dailyStdMin)}>휴가 없는 날</button>
          <button className="chip" onClick={() => selectWhere((d) => weekKeyOf(d.date) === thisWeek)}>이번 주</button>
          {nextWeek && <button className="chip" onClick={() => selectWhere((d) => weekKeyOf(d.date) === nextWeek)}>다음 주</button>}
          {[1, 2, 3, 4, 5].map((dow) => (
            <button key={dow} className="chip" onClick={() => selectWhere((d) => d.dow === dow)}>
              매주 {'일월화수목금토'[dow]}
            </button>
          ))}
          {sel.size > 0 && <button className="chip ghost" onClick={() => setSel(new Set())}>선택 해제</button>}
        </div>

        <div className="plan-table-wrap">
          <table className="plan-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    id="pl-all"
                    checked={allSelected}
                    onChange={() => setSel(allSelected ? new Set() : new Set(rows.map((d) => d.key)))}
                    aria-label="모두 선택"
                  />
                </th>
                <th>날짜</th>
                <th>근태</th>
                <th>실근무 계획</th>
                <th className="r">인정 예정</th>
                <th>예상 출근 → 퇴근</th>
                {rules.dailyLimitOn && <th title="1일 최대 근무를 채울 때의 퇴근 시각">Max 퇴근</th>}
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <WeekGroup
                  key={g.key}
                  g={g}
                  rules={rules}
                  plans={plans}
                  planIns={planIns}
                  records={records}
                  dispatch={dispatch}
                  sel={sel}
                  toggle={toggle}
                  locks={locks}
                  weekTotal={weekProjected(g.key)}
                  familyKey={s.familyKey}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Shift를 누른 채 체크하면 구간을 한 번에 고를 수 있습니다. 시간을 직접 바꾼 날은 자물쇠로 고정되어 균등 배분·Max 채우기에서 그대로 유지됩니다. 자물쇠를 누르면 고정을 풀 수 있습니다. 예상 퇴근 = 출근 시각(기본 {rules.planDefaultIn}, 오늘은 실제 출근) + 실근무 + 휴게.
        </p>
      </section>

      {sel.size > 0 && (
        <BulkBar keys={[...sel]} s={s} rules={rules} plans={plans} planIns={planIns} locks={locks} dispatch={dispatch} notify={notify} clear={() => setSel(new Set())} />
      )}
    </div>
  );
}

function WeekGroup({ g, rules, plans, planIns, records, dispatch, sel, toggle, weekTotal, familyKey, locks }) {
  const over = rules.weeklyLimitOn && weekTotal > rules.maxWeeklyMin;
  const mon = parseYmd(g.key);
  return (
    <>
      {g.days.map((d) => {
        const isHoliday = !d.isWorkday;
        const locked = !!locks[d.key];
        const planned = plans[d.key] ?? defaultPlanFor(d, rules);
        const inMin = d.isToday && d.inMin != null ? d.inMin : toMin(planIns[d.key] || rules.planDefaultIn);
        const outMin = inMin + grossForNet(planned, rules) + (d.isToday ? 0 : d.plannedExclude);
        const fullOff = !isHoliday && capacityOf(d, rules) === 0 && d.workCredit === 0;
        const late = outMin > toMin(rules.recognizeTo);
        const checked = sel.has(d.key);
        return (
          <tr key={d.key} className={[d.isToday && 'today-row', checked && 'sel-row', isHoliday && 'holiday-row'].filter(Boolean).join(' ')}>
            <td>
              <input
                type="checkbox"
                id={`pl-sel-${d.key}`}
                checked={checked}
                readOnly
                onClick={(e) => toggle(d.key, e.shiftKey)}
                aria-label={`${dayLabel(d.date)} 선택 (Shift: 구간 선택)`}
              />
            </td>
            <td className="num" style={{ whiteSpace: 'nowrap' }}>
              {dayLabel(d.date)} {d.isToday && <Pill tone="accent">오늘</Pill>}
            </td>
            <td>
              {isHoliday ? (
                <Pill tone="bad">휴일 근무{d.holiday ? ` · ${d.holiday}` : ''}</Pill>
              ) : (
              <LeaveSelect
                id={`pl-leave-${d.key}`}
                rules={rules}
                leave={records[d.key]?.leave || null}
                leaveMin={records[d.key]?.leaveMin}
                width={118}
                ariaLabel={`${dayLabel(d.date)} 근태`}
                onChange={(leave, leaveMin) => dispatch({ type: 'plan/bulk', keys: [d.key], leave: leave ?? null, leaveMin })}
              />
              )}
            </td>
            <td>
              {fullOff ? (
                <span className="muted">—</span>
              ) : (
                <span className="plan-cell">
                  <PlanStepper
                    id={`pl-${d.key}`}
                    value={planned}
                    edited={plans[d.key] != null}
                    locked={locked}
                    min={d.isToday ? d.actual : 0}
                    max={dailyCapOf(d, rules)}
                    onChange={(v) => dispatch({ type: 'plan/set', key: d.key, minutes: v, lock: true })}
                  />
                  <button
                    type="button"
                    className={`lock-btn ${locked ? 'on' : ''}`}
                    onClick={() => dispatch({ type: 'plan/lock', keys: [d.key], locked: !locked })}
                    title={locked ? '고정 풀기 (배분할 때 이 날도 바뀜)' : '이 시간으로 고정 (배분할 때 그대로 둠)'}
                    aria-label={locked ? `${dayLabel(d.date)} 고정 풀기` : `${dayLabel(d.date)} 시간 고정`}
                    aria-pressed={locked}
                  >
                    <Icon name={locked ? 'lock' : 'unlock'} size={15} />
                  </button>
                  {isHoliday && !d.isPast && d.actual === 0 && (
                    <button
                      type="button"
                      className="lock-btn"
                      onClick={() => dispatch({ type: 'plan/set', key: d.key, minutes: null })}
                      title="휴일 근무 빼기"
                      aria-label={`${dayLabel(d.date)} 휴일 근무 빼기`}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </span>
              )}
            </td>
            <td className="r num">{fmtDur(projectedOf(d, plans, rules))}</td>
            <td className="num" style={{ whiteSpace: 'nowrap' }}>
              {fullOff || planned === 0 ? (
                <span className="muted">—</span>
              ) : (
                <>
                  <span className={planIns[d.key] ? 'tone-plan' : ''}>{fmtClock(inMin)}</span> → <b className={late ? 'tone-bad' : ''}>{fmtClock(outMin)}</b>
                </>
              )}
            </td>
            {rules.dailyLimitOn && (
              <td className="num muted" style={{ whiteSpace: 'nowrap' }}>
                {fullOff ? '—' : fmtClock(Math.min(inMin + grossForNet(rules.maxDailyMin - d.workCredit, rules), toMin(rules.recognizeTo)))}
              </td>
            )}
            <td className="small">
              {d.isToday && d.actual > 0 && <span className="muted">지금까지 {fmtDur(d.actual)} </span>}
              {isHoliday && <span className="muted">Max에서 차감 · 필요시간은 그대로 </span>}
              {d.plannedExclude > 0 && <span className="muted">제외 −{fmtDur(d.plannedExclude)} </span>}
              {d.isRest && <span className="muted">필요시간 유지 · 다른 날에 채움 </span>}
              {rules.familyDayOn && !d.leave && d.key === familyKey && <Pill tone="plan">패밀리데이 후보</Pill>}
              {d.leaveKind === 'off' && <span className="muted">필요시간 −{fmtDur(d.offCredit)} </span>}
              {d.note && <span className="muted">{d.note} </span>}
              {late && <Pill tone="bad">인정시간대 초과</Pill>}
              {!fullOff && rules.minDailyMin > 0 && planned > 0 && planned + d.credit < rules.minDailyMin && <Pill tone="warn">최소 미달</Pill>}
            </td>
          </tr>
        );
      })}
      <tr className="week-sum">
        <td />
        <td colSpan={3}>{mon.getMonth() + 1}/{mon.getDate()} 주 합계 (월~일, 이미 일한 시간 포함)</td>
        <td className={`r num ${over ? 'tone-bad' : ''}`}>{fmtDur(weekTotal)}</td>
        <td colSpan={rules.dailyLimitOn ? 3 : 2}>
          {!rules.weeklyLimitOn ? null : over ? <Pill tone="bad">주 {Math.round(rules.maxWeeklyMin / 60)}시간 초과</Pill> : <span>한도 {fmtDur(rules.maxWeeklyMin)}</span>}
        </td>
      </tr>
    </>
  );
}

/** 패밀리데이: 21일이 있는 주 금요일. 쉬면 필요시간은 그대로라 그날 몫을 다른 날에 채운다 */
function FamilyDayCard({ s, rules, plans, locks, dispatch, notify }) {
  const fd = s.familyDay;
  if (!rules.familyDayOn || !fd || !fd.isWorkday || fd.isPast) return null;
  const chosen = fd.leave === 'family';
  const busy = fd.leave && !chosen; // 이미 다른 근태가 있는 날
  const share = rules.dailyStdMin;
  const redistribute = () => {
    dispatch({ type: 'plan/merge', plans: distributeEvenly(s, rules, plans, locks) });
    notify('패밀리데이 몫을 남은 근무일에 나눠 넣었습니다.');
  };
  return (
    <section className={`family-card ${chosen ? 'on' : ''}`} aria-label="패밀리데이">
      <div className="family-main">
        <span className="label">패밀리데이 · {dayLabel(fd.date)}</span>
        <strong>
          {chosen ? '이날은 쉬는 것으로 계획했어요' : busy ? `이날은 이미 ${fd.leaveLabel}(으)로 등록되어 있어요` : '이날 쉬고 다른 날에 채울 수 있어요'}
        </strong>
        <span className="small muted">
          {chosen
            ? `필요시간은 줄지 않아서 ${fmtDur(share)}를 다른 근무일에 더 일해야 해요.${s.projectedDiff < 0 ? ` 지금 계획은 ${fmtDur(-s.projectedDiff)} 부족해요.` : ''}`
            : `쉬어도 필요시간(${fmtDur(s.required)})은 그대로예요. 대신 ${fmtDur(share)}를 다른 날에 나눠 채워야 해요.`}
        </span>
      </div>
      <div className="family-actions">
        {chosen ? (
          <>
            {s.projectedDiff < 0 && (
              <button className="btn primary" onClick={redistribute}>다른 날에 나눠 채우기</button>
            )}
            <button
              className="btn"
              onClick={() => {
                dispatch({ type: 'plan/bulk', keys: [fd.key], leave: null });
                notify('패밀리데이를 취소하고 근무로 되돌렸습니다.');
              }}
            >
              근무하기로 되돌리기
            </button>
          </>
        ) : (
          !busy && (
            <button
              className="btn primary"
              onClick={() => {
                dispatch({ type: 'plan/bulk', keys: [fd.key], leave: 'family', minutes: null, inTime: null });
                notify(`${dayLabel(fd.date)}을 패밀리데이로 쉬는 것으로 바꿨습니다.`);
              }}
            >
              패밀리데이로 쉬기
            </button>
          )
        )}
      </div>
    </section>
  );
}

/** 선택한 날에 일괄 적용 */
function BulkBar({ keys, s, rules, plans, planIns, locks, dispatch, notify, clear }) {
  const [how, setHow] = useState('hours'); // hours | clock
  const [hours, setHours] = useState('8:00');
  const [inTime, setInTime] = useState('');
  const [clockIn, setClockIn] = useState(rules.planDefaultIn);
  const [clockOut, setClockOut] = useState('18:00');
  const [leave, setLeave] = useState(undefined); // undefined = 바꾸지 않음
  const [leaveMin, setLeaveMin] = useState(undefined);

  const clockNet = (() => {
    const a = toMin(clockIn);
    const b = toMin(clockOut);
    if (a == null || b == null || b <= a) return null;
    const from = Math.max(a, toMin(rules.recognizeFrom));
    const to = Math.min(b, toMin(rules.recognizeTo));
    return netFromGross(Math.max(0, to - from), rules);
  })();
  const hoursMin = parseDurInput(hours);

  const apply = () => {
    const payload = { type: 'plan/bulk', keys, lock: true };
    if (how === 'hours') {
      if (hoursMin == null) return notify('실근무 시간을 9:30처럼 입력하세요.');
      payload.minutes = rules.dailyLimitOn ? Math.min(hoursMin, rules.maxDailyMin) : hoursMin;
      if (inTime) payload.inTime = inTime;
    } else {
      if (clockNet == null) return notify('퇴근 시각이 출근 시각보다 늦어야 합니다.');
      payload.minutes = clockNet;
      payload.inTime = clockIn;
    }
    if (leave !== undefined) {
      payload.leave = leave || null;
      payload.leaveMin = leaveMin;
    }
    dispatch(payload);
    notify(`${keys.length}일에 적용하고 고정했습니다.`);
  };

  const fillMax = () => {
    const next = distributeToMax(s, rules, plans, keys, locks);
    if (!Object.keys(next).length) return notify('선택한 날 중 일할 수 있는 날이 없습니다.');
    dispatch({ type: 'plan/merge', plans: next, ins: earlierStarts(s, rules, next, planIns) });
    notify(`선택한 ${Object.keys(next).length}일에 나눠 월 Max까지 채웠습니다.`);
  };

  const fillNeed = () => {
    const next = distributeAmong(s, rules, plans, keys, locks);
    if (!Object.keys(next).length) return notify('선택한 날 중 일할 수 있는 날이 없습니다.');
    dispatch({ type: 'plan/merge', plans: next });
    notify(`남은 필요시간을 선택한 ${Object.keys(next).length}일에 나눠 넣었습니다.`);
  };

  return (
    <section className="bulk-bar" aria-label="일괄 변경">
      <div className="bulk-head">
        <strong>{keys.length}일 선택</strong>
        <div className="seg" role="group" aria-label="입력 방식">
          <button type="button" aria-pressed={how === 'hours'} onClick={() => setHow('hours')}>실근무 시간</button>
          <button type="button" aria-pressed={how === 'clock'} onClick={() => setHow('clock')}>출퇴근 시각</button>
        </div>
        <button className="btn ghost small" onClick={clear}>닫기</button>
      </div>

      <div className="bulk-body">
        {how === 'hours' ? (
          <>
            <label className="field">
              <span>실근무</span>
              <input className="input num" id="bulk-hours" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="8:00" style={{ width: 90 }} />
            </label>
            <div className="presets">
              {['6:00', '8:00', '9:00', '10:00'].map((p) => (
                <button key={p} type="button" className={`chip ${hours === p ? 'on' : ''}`} onClick={() => setHours(p)}>{p}</button>
              ))}
            </div>
            <label className="field">
              <span>출근 시각 (선택)</span>
              <TimeField id="bulk-in" value={inTime} presets={PRESETS.in} ariaLabel="출근 시각" onChange={(v) => setInTime(v || '')} />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>출근</span>
              <TimeField id="bulk-clock-in" value={clockIn} presets={PRESETS.in} allowEmpty={false} ariaLabel="출근" onChange={(v) => setClockIn(v)} />
            </label>
            <label className="field">
              <span>퇴근</span>
              <TimeField id="bulk-clock-out" value={clockOut} presets={PRESETS.out} allowEmpty={false} ariaLabel="퇴근" onChange={(v) => setClockOut(v)} />
            </label>
            <div className="field">
              <span>= 실근무</span>
              <b className="num" style={{ fontSize: 18, lineHeight: '38px' }}>{clockNet == null ? '—' : fmtDur(clockNet)}</b>
            </div>
          </>
        )}
        <div className="field">
          <span>근태</span>
          <LeaveSelect
            id="bulk-leave"
            rules={rules}
            allowKeep
            leave={leave}
            leaveMin={leaveMin}
            width={140}
            ariaLabel="근태 일괄 변경"
            onChange={(l, m) => { setLeave(l); setLeaveMin(m); }}
          />
        </div>
      </div>

      <div className="bulk-actions">
        <button className="btn primary" onClick={apply}>{keys.length}일에 적용</button>
        <button className="btn" onClick={fillNeed} title="선택하지 않은 날의 계획은 그대로 두고, 모자란 필요시간을 선택한 날에 나눕니다">
          남은 필요시간 나눠 넣기
        </button>
        <button className="btn" onClick={fillMax} title="선택하지 않은 날 계획은 그대로 두고, 월 Max까지 남은 시간을 선택한 날에 나눕니다">
          Max까지 채우기
        </button>
        <button className="btn" onClick={() => { dispatch({ type: 'plan/lock', keys, locked: true }); notify(`${keys.length}일을 고정했습니다.`); }}>
          <Icon name="lock" size={14} /> 고정
        </button>
        <button className="btn" onClick={() => { dispatch({ type: 'plan/lock', keys, locked: false }); notify(`${keys.length}일 고정을 풀었습니다.`); }}>
          <Icon name="unlock" size={14} /> 고정 풀기
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            dispatch({ type: 'plan/bulk', keys, minutes: null, inTime: null });
            notify('선택한 날의 계획을 기본값으로 되돌렸습니다.');
          }}
        >
          기본값으로
        </button>
      </div>
    </section>
  );
}

function PlanStepper({ id, value, edited, locked, min = 0, max, onChange }) {
  const [text, setText] = useState(null);
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const commit = (raw) => {
    setText(null);
    const v = parseDurInput(raw);
    if (v != null) onChange(clamp(v));
  };
  return (
    <span className={`stepper ${edited ? 'edited' : ''} ${locked ? 'locked' : ''}`}>
      <button type="button" onClick={() => onChange(clamp(value - 30))} aria-label="30분 줄이기">−</button>
      <input
        id={id}
        value={text ?? fmtDur(value)}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="실근무 계획 (시:분)"
      />
      <button type="button" onClick={() => onChange(clamp(value + 30))} aria-label="30분 늘리기">+</button>
    </span>
  );
}
