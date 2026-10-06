import { useMemo, useState } from 'react';
import { fmtDur, fmtClock, monthLabel, dayLabel, WEEKDAY_KO, ymd, parseYmd } from '../lib/time.js';
import { summarizeMonth, projectedOf, defaultPlanFor } from '../lib/engine.js';
import { LEAVE_ORDER } from '../lib/rules.js';
import { Icon, Pill, StatusPill, InfoTip } from '../../../shared/ui.jsx';
import { TimeField, PRESETS } from '../../../shared/TimeField.jsx';
import { LeaveSelect } from '../components/LeaveSelect.jsx';
import { MonthEnd } from '../components/Targets.jsx';

const HEAD = [1, 2, 3, 4, 5, 6, 0]; // 월요일 시작
// 비교할 때 표시용 필드는 빼고 본다
const strip = (r) => {
  const { edited, source, ...rest } = r || {};
  if (!rest.leave) delete rest.leave;
  if (!rest.excludes?.length) delete rest.excludes;
  for (const k of Object.keys(rest)) if (rest[k] == null || rest[k] === '') delete rest[k];
  return Object.keys(rest).sort().reduce((a, k) => ((a[k] = rest[k]), a), {});
};

export default function Records({ state, dispatch, now, view, setView, draft, setDraft, notify }) {
  const { rules, plans } = state;
  const { y, m } = view;
  // 수정은 draft에 모았다가 [변경 내용 반영]을 눌러야 저장된다. 화면은 draft를 합친 결과로 미리 보여준다
  const records = useMemo(() => {
    const r = { ...state.records };
    for (const [k, v] of Object.entries(draft)) {
      if (v == null) delete r[k];
      else r[k] = v;
    }
    return r;
  }, [state.records, draft]);
  const s = useMemo(() => summarizeMonth(y, m, records, rules, plans, now), [y, m, records, rules, plans, now]);
  const dirty = Object.keys(draft);
  const editDay = (key, patch) => {
    setDraft((prev) => {
      const base = key in prev ? prev[key] || {} : state.records[key] || {};
      const next = { ...base, ...patch };
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      // 원래 기록과 같아지면 수정 목록에서 뺀다
      const orig = state.records[key] || {};
      const same = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));
      const out = { ...prev };
      if (same(next, orig)) delete out[key];
      else out[key] = next;
      return out;
    });
  };
  const clearDay = (key) => setDraft((prev) => (state.records[key] ? { ...prev, [key]: null } : (({ [key]: _, ...rest }) => rest)(prev)));
  const apply = () => {
    dispatch({ type: 'records/apply', changes: draft });
    setDraft({});
    notify?.(`${dirty.length}일 수정을 반영했습니다.`);
  };
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
          <h1>
            근무기록 <InfoTip text="날짜를 눌러 출퇴근·휴가·제외시간을 고친 뒤 아래 [변경 내용 반영]을 눌러야 저장됩니다. 달력에 '수정' 표시가 있는 날이 반영 전입니다." />
          </h1>
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
                  <DayCell key={d.key} d={d} plans={plans} rules={rules} selected={d.key === sel} dirty={d.key in draft} onClick={() => setSel(d.key)} family={rules.familyDayOn && d.key === s.familyKey} />
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
            <InfoTip text="칸 아래 숫자: 지난 날은 인정 시간, 앞으로는 계획(예정) 시간" />
          </div>
          <div className="month-total">
            <span>필수 <b>{fmtDur(s.required)}</b></span>
            <span>실제 근무 시간 <b>{fmtDur(monthDone)}</b></span>
            {holidayDone > 0 && <span>휴일 근무 <b>{fmtDur(holidayDone)}</b> <InfoTip text="주말·공휴일 근무는 최대 근무 시간에서만 빠지고 필수 근무 시간은 줄여주지 않습니다." /></span>}
            {isCurrent ? (
              <span className="month-end-line">예상 초과 근무 시간 <MonthEnd s={s} rules={rules} compact /></span>
            ) : (
              <span>정산 <b className={monthDone - s.required < 0 ? 'tone-bad' : 'tone-good'}>{fmtDur(monthDone - s.required, { sign: true })}</b></span>
            )}
            <span className="muted">확인 필요 {s.warnings.filter((w) => !w.week).length}건</span>
          </div>
        </section>

        <DayDetail key={selDay.key} d={selDay} rec={records[selDay.key] || {}} orig={state.records[selDay.key]} dirty={selDay.key in draft} rules={rules} plans={plans} set={(patch) => editDay(selDay.key, patch)} clear={() => clearDay(selDay.key)} revert={() => setDraft(({ [selDay.key]: _, ...rest }) => rest)} />
      </div>

      {dirty.length > 0 && (
        <div className="apply-bar" role="region" aria-label="반영 안 한 수정">
          <span className="apply-dot" />
          <span>
            <b>{dirty.length}일</b> 수정됨 <span className="muted">· 아직 저장 안 됨</span>
          </span>
          <span className="apply-days small muted">
            {dirty.slice().sort().slice(0, 6).map((k) => `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`).join(', ')}
            {dirty.length > 6 ? ' …' : ''}
          </span>
          <button className="btn" onClick={() => setDraft({})}>모두 되돌리기</button>
          <button className="btn primary" onClick={apply}>변경 내용 반영</button>
        </div>
      )}
    </div>
  );
}

function DayCell({ d, plans, rules, selected, dirty, onClick, family }) {
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
    dirty && 'dirty',
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
        {dirty && <span className="cd-dirty" title="수정됨 · 반영 전">수정</span>}
        {d.warnings.length > 0 && <span className="cd-warn" title={d.warnings.join(', ')}>!</span>}
      </div>
      {tag && <span className={`cd-tag ${tag.tone}`} title={tag.text}>{tag.text}</span>}
      {d.inMin != null && (
        <span className="cd-times num">
          <span>{fmtClock(d.inMin)}</span>
          {!d.live && <span className={d.outMin == null ? 'missing' : ''}>{d.outMin != null ? fmtClock(d.outMin) : '퇴근 ?'}</span>}
        </span>
      )}
      {d.inMin != null && d.plannedExclude > 0 && (
        <span className="cd-ex num" title="제외시간">제외 −{fmtDur(d.live ? d.plannedExclude : d.excluded)}</span>
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

const REASONS = ['개인 용무', '점심 시간', '은행', '병원', '외출'];

/** 제외시간 사유: 자주 쓰는 사유는 고르고, 없으면 직접 입력 */
function ReasonPick({ id, value, onChange }) {
  const [custom, setCustom] = useState(() => !!value && !REASONS.includes(value));
  if (custom) {
    return (
      <span className="reason-custom">
        <input className="input" id={id} value={value} placeholder="사유 직접 입력" autoFocus onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="link-btn" title="목록에서 고르기" onClick={() => { setCustom(false); if (!REASONS.includes(value)) onChange(''); }}>
          목록
        </button>
      </span>
    );
  }
  return (
    <select
      className="input"
      id={id}
      value={REASONS.includes(value) ? value : ''}
      aria-label="제외 사유"
      onChange={(e) => {
        if (e.target.value === '__custom') setCustom(true);
        else onChange(e.target.value);
      }}
    >
      <option value="">사유 선택</option>
      {REASONS.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
      <option value="__custom">직접 입력…</option>
    </select>
  );
}

function DayDetail({ d, rec, orig, dirty, rules, plans, set, clear, revert }) {
  const worked = !!rec.in; // 제외시간은 출근 기록이 있는 날만
  const breakMin = Math.max(0, d.gross - d.excluded - d.actual);
  const excludes = rec.excludes || [];
  const setEx = (list) => set({ excludes: list.length ? list : undefined });
  return (
    <aside className="panel detail">
      <div className="kv">
        <h2 style={{ margin: 0 }}>{dayLabel(parseYmd(d.key))}</h2>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {dirty && <Pill tone="warn">반영 전</Pill>}
          <StatusPill day={d} />
        </span>
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
            제외시간 <InfoTip text="외출 등 근무에서 뺄 시간. 출근 기록이 있는 날에만 넣을 수 있고, 체류시간에서 먼저 뺀 뒤 휴게 규칙을 적용합니다." />
            {worked && (
              <button
                type="button"
                className="link-btn"
                onClick={() => setEx([...excludes, { from: '12:00', to: '13:00', reason: '' }])}
              >
                <Icon name="plus" size={13} /> 추가
              </button>
            )}
          </span>
          {!worked ? (
            <span className="small muted">출근 기록이 있는 날에만 넣을 수 있어요</span>
          ) : excludes.length === 0 ? (
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
                  <ReasonPick
                    id={`ex-reason-${d.key}-${i}`}
                    value={x.reason || ''}
                    onChange={(v) => setEx(excludes.map((y, j) => (j === i ? { ...y, reason: v } : y)))}
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
        {worked && excludes.length > 0 && (
          <div className="kv"><span className="muted">제외시간</span><span className="v">−{fmtDur(d.live ? d.plannedExclude : d.excluded)}</span></div>
        )}
        <div className="kv"><span className="muted">휴게 차감</span><span className="v">−{fmtDur(breakMin)}</span></div>
        <div className="kv"><span className="muted">실근무</span><span className="v">{fmtDur(d.actual)}</span></div>
        {d.offCredit > 0 && <div className="kv"><span className="muted">{d.leaveLabel} (필수 근무 시간 차감)</span><span className="v">{fmtDur(d.offCredit)}</span></div>}
        {d.workCredit > 0 && <div className="kv"><span className="muted">출장·교육 근무 인정</span><span className="v">+{fmtDur(d.workCredit)}</span></div>}
        {d.isRest && <div className="kv"><span className="muted">{d.leaveLabel} · 필수 근무 시간 유지</span><span className="v">다른 날에 채움</span></div>}
        {d.isWorkday && <div className="kv"><span className="muted">이날 필수근무</span><span className="v">{fmtDur(d.dayRequired)}</span></div>}
        <div className="kv" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <strong>인정 합계</strong>
          <span className="v" style={{ fontSize: 18 }}>{fmtDur(d.recognized)}</span>
        </div>
        {(d.isFuture || d.isToday) && d.isWorkday && (
          <div className="kv"><span className="muted">계획</span><span className="v tone-plan">{fmtDur(plans[d.key] ?? defaultPlanFor(d, rules))} 실근무</span></div>
        )}
      </div>

      {d.breakAlert && d.breakWindow && (
        <div className="break-alert" role="alert">
          <b>휴게 시간 조정 추천</b>
          <span>
            체류 {fmtDur(d.gross - d.excluded)} → 회사 기록은 휴게 30분 · 근무 {fmtDur(d.gross - d.excluded - 30)}로 잡혀 8시간을 넘깁니다.
            8시간 넘게 일하면 휴게 1시간이 필요하니 휴게를 1시간으로 조정하거나, 퇴근을 {fmtClock(d.breakWindow.from)}까지 또는 {fmtClock(d.breakWindow.to)} 이후로 맞추세요.
          </span>
        </div>
      )}
      {d.warnings.length > 0 && (
        <div className="banner" style={{ background: 'var(--warn-soft)' }}>
          <span>{d.warnings.join(' · ')}</span>
        </div>
      )}

      <div className="small muted">
        출처: {rec.source === 'portal' ? '사내 근태 사이트' : rec.source === 'mock' ? '가짜 데이터' : rec.in || rec.leave ? '직접 입력' : '기록 없음'}
        {orig?.edited ? ' · 직접 보정함' : ''}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {dirty && <button className="btn" onClick={revert}>이 날 수정 되돌리기</button>}
        {(rec.in || rec.out || rec.leave || excludes.length > 0) && (
          <button className="btn ghost" onClick={clear}>이 날 기록 지우기</button>
        )}
      </div>
    </aside>
  );
}
