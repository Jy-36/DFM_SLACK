// 월 기준 시간 패널: 최대 근무 시간 · 필수 근무 시간 · 필요 시간 · 평일 누적초과 · 월말 예상
// 설명 문구는 화면에 늘어놓지 않고 각 항목의 (i)에 넣는다.
import { fmtDur, fmtDurKo } from '../lib/time.js';
import { MonthMeter, InfoTip } from '../../../shared/ui.jsx';

/** 월말 예상: 필수 근무 시간 대비 ± (OT · 주말) */
export function MonthEnd({ s, compact = false }) {
  const tone = (v) => (v < 0 ? 'tone-bad' : v > 0 ? 'tone-good' : '');
  return (
    <span className={`month-end ${compact ? 'compact' : ''}`}>
      <b className={`num ${tone(s.projectedTotalDiff)}`}>{fmtDur(s.projectedTotalDiff, { sign: true })}</b>
      <span className="month-end-sub num">
        (OT <b className={tone(s.projectedDiff)}>{fmtDur(s.projectedDiff, { sign: true })}</b>
        {s.weekendTotal > 0 && (
          <>
            {' · '}주말 <b className="tone-hw">+{fmtDur(s.weekendTotal)}</b>
          </>
        )}
        )
      </span>
    </span>
  );
}

export function TargetsPanel({ s, rules, title = '이번 달 기준 시간', reachable = null }) {
  const t = s.targets;
  const pastPart = s.recognizedReq; // 근무일 인정 (오늘 포함)
  const holidayPart = s.holidayDone + s.holidayPlanned; // 주말·공휴일 근무 — 최대 근무 시간에서만 차감
  const planPart = Math.max(0, s.projectedReq - s.recognizedReq);
  const overMax = s.projected > s.possible;
  const wk = (min) => `${Math.round(min / 60)}h`;

  const tips = {
    max: (
      <>
        <b>최대 근무 시간</b> = 주 {wk(rules.maxWeeklyMin)} ÷ 7 × {t.monthDays}일, 시간 단위 버림.
        <br />주말·공휴일 근무도 여기서 빠집니다.
        {reachable != null && reachable < s.possible && <><br />한도 설정 때문에 이번 달 실제로 채울 수 있는 최대는 {fmtDur(reachable)}입니다.</>}
        <br />지금 계획으로는 {overMax ? <b className="tone-bad">{fmtDur(s.projected - s.possible)} 초과</b> : <>{fmtDur(s.possibleLeft)} 여유</>}.
      </>
    ),
    req: (
      <>
        <b>필수 근무 시간</b> = min(근무일 {t.workdays}일 × {fmtDurKo(rules.dailyStdMin)} = {fmtDur(t.byWorkdays)}, 주 {wk(rules.stdWeeklyMin)} ÷ 7 × {t.monthDays}일 = {fmtDur(t.byWeekly)}) − 비근무근태 {fmtDur(t.offTotal)}
        <br />주말·공휴일 근무는 필수 근무 시간을 줄여주지 않습니다.
      </>
    ),
    need: (
      <>
        <b>필요 시간</b> = 필수 근무 시간 {fmtDur(s.required)} − 현재 근무 시간 {fmtDur(s.recognizedReq)}
        <br />이번 달 근무일에 앞으로 더 일해야 하는 시간입니다 (오늘 일한 시간 포함, 주말 근무 제외).
      </>
    ),
    ot: (
      <>
        <b>평일 누적초과</b> = 전일까지 평일 실적 {fmtDur(s.weekdayDoneSoFar)} − 전일까지 평일 필수근무 {fmtDur(s.weekdayRequiredSoFar)}
        <br />주말·공휴일 근무는 넣지 않습니다.
      </>
    ),
    end: (
      <>
        <b>월말 예상</b> = 지금 계획대로 일했을 때 월말 근무 시간 − 필수 근무 시간
        <br /><b>OT</b> = 평일(근무일)만 계산한 초과·부족
        <br /><b>주말</b> = 주말·공휴일 근무 (실적 + 계획), OT와 따로 표시
      </>
    ),
  };

  return (
    <section className="panel targets">
      <h2>
        {title}
        <span className="small muted">
          {t.monthDays}일 · 근무일 {t.workdays}일
        </span>
      </h2>
      <div className="target-grid five">
        <div className="target">
          <span className="label">최대 근무 시간 <InfoTip text={tips.max} /></span>
          <b className="num">{fmtDur(s.possible)}</b>
          {overMax && <span className="foot tone-bad">{fmtDur(s.projected - s.possible)} 초과</span>}
        </div>
        <div className="target strong">
          <span className="label">필수 근무 시간 <InfoTip text={tips.req} /></span>
          <b className="num">{fmtDur(s.required)}</b>
        </div>
        <div className="target">
          <span className="label">필요 시간 <InfoTip text={tips.need} /></span>
          <b className="num">{fmtDur(s.needLeft)}</b>
        </div>
        <div className="target">
          <span className="label">평일 누적초과 <InfoTip text={tips.ot} /></span>
          <b className={`num ${s.weekdayOvertime < 0 ? 'tone-bad' : s.weekdayOvertime > 0 ? 'tone-good' : ''}`}>{fmtDur(s.weekdayOvertime, { sign: true })}</b>
        </div>
        <div className="target">
          <span className="label">월말 예상 <InfoTip text={tips.end} align="right" /></span>
          <MonthEnd s={s} />
        </div>
      </div>
      <div style={{ paddingTop: 22 }}>
        <MonthMeter work={pastPart} plan={planPart} leave={holidayPart} total={s.possible} marker={s.required} markerLabel={`필수 ${fmtDur(s.required)}`} />
      </div>
      <div className="legend" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span><i style={{ background: 'var(--accent)' }} />현재 근무 {fmtDur(pastPart)}</span>
          <span><i style={{ background: 'var(--sky)' }} />남은 계획 {fmtDur(planPart)}</span>
          {holidayPart > 0 && <span><i style={{ background: 'var(--leave)' }} />주말 근무 {fmtDur(holidayPart)}</span>}
        </span>
        <span>최대 {fmtDur(s.possible)}</span>
      </div>
    </section>
  );
}
