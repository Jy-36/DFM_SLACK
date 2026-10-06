import { useMemo } from 'react';
import { fmtDur, fmtClock, fmtDurKo, monthLabel, dayLabel, parseYmd } from '../lib/time.js';
import { summarizeMonth, checkoutFor, grossForNet, capacityOf } from '../lib/engine.js';
import { Stat, Pill } from '../../../shared/ui.jsx';
import { TargetsPanel } from '../components/Targets.jsx';

export default function Dashboard({ state, summary, now, go }) {
  const { rules, plans, records } = state;
  const s = summary;
  const t = s.today;

  const prev = useMemo(() => {
    const y = s.month === 0 ? s.year - 1 : s.year;
    const m = s.month === 0 ? 11 : s.month - 1;
    return summarizeMonth(y, m, records, rules, {}, now);
  }, [records, rules, s.year, s.month, now]);

  const workSoFar = s.days.filter((d) => d.isPast || d.isToday).reduce((a, d) => a + d.actual, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{monthLabel(s.year, s.month)} 근무 현황</h1>
          <p>선택근무제 월 정산 · {s.targets.monthDays}일 · 근무일 {s.workdayCount}일</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => go('plan')}>남은 기간 계획하기</button>
        </div>
      </div>

      <TodayCard s={s} t={t} rules={rules} plans={plans} />

      <section className="panel stats" aria-label="이번 달 진행">
        <Stat
          label="현재까지 인정"
          value={fmtDur(s.recognizedNow)}
          unit="h"
          foot={s.recognizedNow > workSoFar ? `실근무 ${fmtDur(workSoFar)} · 출장·교육 ${fmtDur(s.recognizedNow - workSoFar)}` : '오늘 근무 포함'}
        />
        <Stat label="남은 필요" value={fmtDur(s.remainingNeed)} unit="h" foot={`필요 ${fmtDur(s.required)} 기준`} />
        <Stat label="Max까지 남은" value={fmtDur(s.remainingPossible)} unit="h" foot={`Max ${fmtDur(s.possible)} 기준`} />
        <Stat
          label="평일 누적초과"
          value={fmtDur(s.weekdayOvertime, { sign: true })}
          unit="h"
          tone={s.weekdayOvertime < 0 ? 'bad' : s.weekdayOvertime > 0 ? 'good' : undefined}
          foot={`전일까지 필수 ${fmtDur(s.weekdayRequiredSoFar)} 대비`}
        />
      </section>

      <TargetsPanel s={s} rules={rules} title="월 기준 시간" showFormula={false} />

      <div className="grid-2">
        <section className="panel">
          <h2>
            주간 근무시간
            <span className="small muted">{rules.weeklyLimitOn ? `주 ${Math.round(rules.maxWeeklyMin / 60)}시간 한도` : '주 제한 없음 · 월 정산'}</span>
          </h2>
          <WeekBars weeks={s.weeks} rules={rules} />
        </section>

        <section className="panel">
          <h2>
            확인 필요
            {s.warnings.length > 0 && <Pill tone="warn">{s.warnings.length}건</Pill>}
          </h2>
          {s.warnings.length === 0 ? (
            <p className="empty">이번 달 기록에 문제가 없습니다.</p>
          ) : (
            <ul className="alerts">
              {s.warnings.map((w, i) => (
                <li key={i}>
                  <span>{w.text}</span>
                  <span className="when">{w.week ? `${dayLabel(w.date)} 주` : dayLabel(w.date)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="kv" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <span className="muted">지난달({prev.month + 1}월) 정산</span>
            <span className={`v ${prev.done - prev.required < 0 ? 'tone-bad' : 'tone-good'}`}>
              {fmtDur(prev.done - prev.required, { sign: true })}
            </span>
          </div>
          {prev.warnings.length > 0 && (
            <button className="btn ghost small" style={{ padding: '6px 0' }} onClick={() => go('records', { y: prev.year, m: prev.month })}>
              지난달 확인 필요 {prev.warnings.length}건 보기 →
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function TodayCard({ s, t, rules, plans }) {
  if (!t || !t.isWorkday) {
    return (
      <section className="panel">
        <span className="label">오늘</span>
        <p style={{ margin: '6px 0 0', fontSize: 16 }}>
          {t?.holiday ? `${t.holiday} — 근무일이 아닙니다.` : '오늘은 근무일이 아닙니다.'}
        </p>
      </section>
    );
  }
  const stdNet = capacityOf(t, rules);
  const planNet = plans[t.key];
  const targetNet = planNet ?? s.todayTarget;
  const outTarget = checkoutFor(t, targetNet, rules);
  const outStd = checkoutFor(t, stdNet, rules);
  const breakMin = grossForNet(targetNet, rules) - targetNet;

  return (
    <section className="panel today">
      <div className="today-main">
        <div className="kv">
          <span className="label">오늘 {dayLabel(t.date)}</span>
          {t.live ? (
            <Pill tone="good"><span className="live-dot" /> 근무 중</Pill>
          ) : t.inMin == null ? (
            <Pill tone="neutral">출근 전</Pill>
          ) : (
            <Pill tone="accent">퇴근 완료</Pill>
          )}
        </div>
        {t.inMin == null ? (
          <p style={{ margin: 0, fontSize: 16 }}>아직 출근 기록이 없습니다. 동기화하면 사내 기록을 가져옵니다.</p>
        ) : (
          <>
            <div>
              <div className="muted small">{planNet != null ? '내 계획대로면' : '이번 달 목표를 맞추려면'}</div>
              <div className="clock-big">
                {fmtClock(outTarget)}
                <span className="sub">퇴근</span>
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>
                실근무 {fmtDurKo(targetNet)} + 휴게 {fmtDurKo(breakMin)}
                {t.leaveLabel ? ` · ${t.leaveLabel} ${fmtDurKo(t.credit)} 인정` : ''}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="today-side">
        <div className="kv"><span className="muted">출근</span><span className="v">{fmtClock(t.inMin)}</span></div>
        <div className="kv">
          <span className="muted">지금까지 실근무</span>
          <span className="v">{fmtDur(t.actual)}</span>
        </div>
        <div className="kv">
          <span className="muted">{fmtDurKo(stdNet)} 채우는 퇴근</span>
          <span className="v">{fmtClock(outStd)}</span>
        </div>
        <div className="kv sep" style={{ paddingTop: 12 }}>
          <span className="muted">남은 근무일</span>
          <span className="v">{s.daysToWork}일</span>
        </div>
        <div className="kv">
          <span className="muted">하루 평균 필요</span>
          <span className={`v ${s.avgPerDay > rules.dailyStdMin ? 'tone-bad' : ''}`}>{fmtDur(s.avgPerDay)}</span>
        </div>
      </div>
    </section>
  );
}

function WeekBars({ weeks, rules }) {
  const scale = Math.max(rules.maxWeeklyMin + 8 * 60, ...weeks.map((w) => Math.max(w.projected, w.recognized) + 60));
  const pct = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div className="weeks">
      {weeks.map((w) => {
        const mon = parseYmd(w.key);
        return (
          <div className="week-row" key={w.key}>
            <span className="small muted num">{mon.getMonth() + 1}/{mon.getDate()} 주</span>
            <div className="week-track" aria-label={`인정 ${fmtDur(w.recognized)}, 예상 ${fmtDur(w.projected)}`}>
              <i className="proj" style={{ width: pct(w.projected) }} />
              <i className="done" style={{ width: pct(w.recognized) }} />
              <span className="std" style={{ left: pct(rules.dailyStdMin * 5) }} />
              {rules.weeklyLimitOn && <span className="limit" style={{ left: pct(rules.maxWeeklyMin) }} />}
            </div>
            <span className={`small num ${w.over ? 'tone-bad' : ''}`} style={{ textAlign: 'right' }}>
              {fmtDur(w.projected > w.recognized ? w.projected : w.recognized)}
              {w.projected > w.recognized && <span className="muted"> 예상</span>}
            </span>
          </div>
        );
      })}
      <div className="legend">
        <span><i style={{ background: 'var(--accent)' }} />인정</span>
        <span><i style={{ background: 'var(--sky)' }} />계획 포함 예상</span>
        <span><i style={{ background: 'var(--muted)', width: 2 }} />40h</span>
        {rules.weeklyLimitOn && <span><i style={{ background: 'var(--bad)', width: 2 }} />{Math.round(rules.maxWeeklyMin / 60)}h</span>}
      </div>
    </div>
  );
}
