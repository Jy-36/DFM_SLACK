// 요약 모드: 휴대폰 폭 창에서 오늘·이번 달·이번 주만 한눈에
import { fmtDur, fmtClock, fmtDurKo, dayLabel, monthLabel, ymd, addDays, parseYmd, WEEKDAY_KO } from '../lib/time.js';
import { evalDay, projectedOf, checkoutFor, grossForNet } from '../lib/engine.js';
import { Icon, MonthMeter, Pill } from '../../../shared/ui.jsx';
import { leaveText } from '../lib/rules.js';

export default function Mini({ state, summary, now, expand }) {
  const { rules, plans, records } = state;
  const s = summary;
  const t = s.today;


  return (
    <div className="mini fade-in">
      <Hero t={t} s={s} rules={rules} plans={plans} records={records} now={now} />

      <section className="mini-card" aria-label="이번 달 정산">
        <div className="mini-card-head">
          <h3>{monthLabel(s.year, s.month).replace(/^\d+년 /, '')} 정산</h3>
          <button className="link-btn" onClick={() => expand('plan')}>
            근무 계획 <Icon name="chevron" size={14} />
          </button>
        </div>
        <div style={{ paddingTop: 18 }}>
          <MonthMeter work={s.recognizedReq} leave={s.holidayDone + s.holidayPlanned} plan={Math.max(0, s.projectedReq - s.recognizedReq)} total={s.possible} marker={s.required} markerLabel="필수" />
        </div>
        <div className="mini-nums">
          <div><span>필수</span><b>{fmtDur(s.required)}</b></div>
          <div><span>최대</span><b>{fmtDur(s.possible)}</b></div>
          <div><span>인정</span><b>{fmtDur(s.recognizedReq)}</b></div>
        </div>
        <div className="mini-diff">
          <span className="muted">
            평일 누적초과{' '}
            <b className={`num ${s.weekdayOvertime < 0 ? 'tone-bad' : 'tone-good'}`}>{fmtDur(s.weekdayOvertime, { sign: true })}</b>
          </span>
          <Pill tone={s.projectedTotalDiff < 0 ? 'bad' : 'good'}>월말 {fmtDur(s.projectedTotalDiff, { sign: true })} (OT {fmtDur(s.projectedDiff, { sign: true })}{s.weekendTotal > 0 ? ` · 주말 +${fmtDur(s.weekendTotal)}` : ''})</Pill>
        </div>
        <div className="mini-diff small">
          <span className="muted">
            필요 <b className="num" style={{ color: 'var(--fg)' }}>{fmtDur(s.remainingNeed)}</b> · {s.daysToWork}일 · 하루 평균{' '}
            <b className="num" style={{ color: 'var(--fg)' }}>{fmtDur(s.avgPerDay)}</b>
          </span>
        </div>
      </section>

      <WeekCard s={s} rules={rules} plans={plans} records={records} now={now} expand={expand} />

      <UpcomingCard s={s} records={records} rules={rules} now={now} expand={expand} />

      <button className="btn primary expand-cta" onClick={() => expand('dashboard')}>
        <Icon name="expand" size={16} /> 전체 화면으로 보기
      </button>
      <div className="mini-foot">
        <span>
          {state.dataMode === 'portal' ? '사내 데이터' : state.dataMode === 'manual' ? '붙여넣은 데이터' : '가짜 데이터'} · 동기화{' '}
          {state.lastSync ? new Date(state.lastSync).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '안 함'}
        </span>
        <button className="link-btn" onClick={() => expand('sync')}>동기화하기</button>
      </div>
    </div>
  );
}

function Hero({ t, s, rules, plans }) {
  if (!t || !t.isWorkday) {
    const next = s.upcoming.find((d) => !d.isToday && d.credit < rules.dailyStdMin);
    return (
      <section className="mini-hero">
        <span className="label">오늘 {t ? dayLabel(t.date) : ''}</span>
        <div>
          <div className="mini-clock" style={{ fontSize: 34 }}>{t?.holiday || '쉬는 날'}</div>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {next ? `다음 근무일은 ${dayLabel(next.date)}입니다.` : '이번 달 남은 근무일이 없습니다.'}
          </p>
        </div>
      </section>
    );
  }

  const targetNet = plans[t.key] ?? s.todayTarget;
  const out = checkoutFor(t, targetNet, rules);
  const breakMin = grossForNet(targetNet, rules) - targetNet;
  const left = Math.max(0, targetNet - t.actual);
  const pct = targetNet ? Math.min(1, t.actual / targetNet) : 0;
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <section className="mini-hero" aria-label="오늘 근무">
      <div className="mini-card-head">
        <span className="label" style={{ fontSize: 12 }}>오늘 {dayLabel(t.date)}</span>
        {t.live ? (
          <Pill><span className="live-dot" /> 근무 중</Pill>
        ) : t.inMin == null ? (
          <Pill>출근 전</Pill>
        ) : (
          <Pill>퇴근 완료</Pill>
        )}
      </div>

      <div className="mini-hero-row">
        <div style={{ minWidth: 0 }}>
          <div className="muted small">{t.inMin == null ? '출근하면 퇴근 목표를 계산합니다' : plans[t.key] != null ? '계획대로면 퇴근' : '이번 달 목표 기준 퇴근'}</div>
          <div className="mini-clock">{t.inMin == null ? '--:--' : fmtClock(out)}</div>
          <div className="muted small" style={{ marginTop: 6 }}>
            실근무 {fmtDurKo(targetNet)} + 휴게 {fmtDurKo(breakMin)}
          </div>
        </div>
        <div className="ring" role="img" aria-label={`오늘 목표의 ${Math.round(pct * 100)}% 근무`}>
          <svg width="112" height="112" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r={R} fill="none" stroke="var(--hero-track)" strokeWidth="10" />
            <circle cx="56" cy="56" r={R} fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} />
          </svg>
          <div className="ring-label">
            <b>{Math.round(pct * 100)}%</b>
            <span>오늘 진행</span>
          </div>
        </div>
      </div>

      <div className="mini-facts">
        <div><span>출근</span><b>{fmtClock(t.inMin)}</b></div>
        <div><span>실근무</span><b>{fmtDur(t.actual)}</b></div>
        <div><span>남은</span><b>{fmtDur(left)}</b></div>
      </div>
    </section>
  );
}

function WeekCard({ s, rules, plans, records, now, expand }) {
  const todayKey = s.todayKey;
  const base = parseYmd(todayKey);
  const mon = addDays(base, base.getDay() === 0 ? -6 : 1 - base.getDay());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const days = Array.from({ length: 5 }, (_, i) => evalDay(addDays(mon, i), records[ymd(addDays(mon, i))], rules, { todayKey, nowMin }));
  const week = s.weeks.find((w) => w.key === ymd(mon));
  const total = week ? week.projected : days.reduce((a, d) => a + projectedOf(d, plans, rules), 0);
  const scale = Math.max(12 * 60, ...days.map((d) => projectedOf(d, plans, rules) + d.offCredit));
  const h = (v) => `${Math.min(100, (Math.max(0, v) / scale) * 100)}%`;

  return (
    <section className="mini-card" aria-label="이번 주">
      <div className="mini-card-head">
        <h3>이번 주</h3>
        <span className="small muted">
          예상 <b className={`num ${rules.weeklyLimitOn && total > rules.maxWeeklyMin ? 'tone-bad' : ''}`} style={{ color: rules.weeklyLimitOn && total > rules.maxWeeklyMin ? undefined : 'var(--fg)' }}>{fmtDur(total)}</b>
          {rules.weeklyLimitOn && ` / ${Math.round(rules.maxWeeklyMin / 60)}h`}
        </span>
      </div>
      <div className="wk">
        {days.map((d) => {
          const proj = projectedOf(d, plans, rules);
          const off = !d.isWorkday && !d.actual;
          const shown = d.isFuture ? proj : d.isToday ? proj : d.recognized;
          return (
            <button
              key={d.key}
              type="button"
              className={`wk-col ${d.isToday ? 'is-today' : ''} ${off ? 'off' : ''}`}
              style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
              onClick={() => expand('records')}
              aria-label={`${dayLabel(d.date)} ${off ? d.holiday || '휴일' : fmtDur(shown)}`}
            >
              <span className="wk-val">{off ? (d.holiday ? '휴일' : '') : fmtDur(shown)}</span>
              <span className="wk-bar">
                {!off && (d.isFuture || d.isToday) && <i className="plan" style={{ height: h(proj) }} />}
                {d.credit > 0 && <i className="leave" style={{ height: h(d.actual + d.credit) }} />}
                {d.actual > 0 && <i className="done" style={{ height: h(d.actual) }} />}
                <span className="line8" style={{ bottom: h(rules.dailyStdMin) }} />
              </span>
              <span className="wk-day">{WEEKDAY_KO[d.dow]}</span>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--accent)' }} />실근무</span>
        <span><i style={{ background: 'var(--leave)' }} />휴가</span>
        <span><i style={{ background: 'var(--sky)' }} />계획</span>
      </div>
    </section>
  );
}

function UpcomingCard({ s, records, rules, expand }) {
  const leaves = Object.entries(records)
    .filter(([k, r]) => k > s.todayKey && r.leave && rules.leaveTypes[r.leave])
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(0, 3)
    .map(([k, r]) => ({ key: k, text: `${leaveText(rules, r)}${rules.leaveTypes[r.leave].kind === 'rest' ? ' · 필수 근무 시간 유지' : ''}${r.note ? ` · ${r.note}` : ''}`, tone: rules.leaveTypes[r.leave].kind === 'rest' ? 'accent' : 'leave', badge: rules.leaveTypes[r.leave].kind === 'rest' ? '쉼' : '휴가' }));
  const warns = s.warnings.slice(0, 2).map((w) => ({ key: w.key, text: w.text, tone: 'warn' }));
  const fd = s.familyDay;
  const family =
    rules.familyDayOn && fd && fd.isWorkday && !fd.isPast && !fd.leave
      ? [{ key: fd.key, text: '패밀리데이 후보 · 쉬려면 근무 계획에서 선택', tone: 'plan' }]
      : [];
  const items = [...warns, ...[...family, ...leaves].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(0, 3)];

  return (
    <section className="mini-card" aria-label="다가오는 일정">
      <div className="mini-card-head">
        <h3>다가오는 일정</h3>
        <button className="link-btn" onClick={() => expand('records')}>
          근무기록 <Icon name="chevron" size={14} />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="empty" style={{ margin: 0, padding: 0 }}>예정된 휴가나 확인할 기록이 없습니다.</p>
      ) : (
        <ul className="mini-list">
          {items.map((it, i) => (
            <li key={i}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                <Pill tone={it.tone}>{it.badge || (it.tone === 'warn' ? '확인' : it.tone === 'plan' ? '후보' : '휴가')}</Pill>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.text}</span>
              </span>
              <span className="when">{dayLabel(parseYmd(it.key))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
