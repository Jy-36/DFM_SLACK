// 월 기준 시간 패널: Max · 필요시간 · 평일 누적초과 · 월말 예상
import { fmtDur, fmtDurKo } from '../lib/time.js';
import { MonthMeter } from '../../../shared/ui.jsx';

export function TargetsPanel({ s, rules, title = '이번 달 기준 시간', showFormula = true, reachable = null }) {
  const t = s.targets;
  const pastPart = s.recognizedReq; // 근무일 인정 (오늘 포함) — 필요시간에 쳐주는 부분
  const holidayPart = s.holidayDone + s.holidayPlanned; // 휴일 근무 실적·계획 — Max에서만 차감
  const planPart = Math.max(0, s.projectedReq - s.recognizedReq);
  const overMax = s.projected > s.possible;
  const wk = (min) => `${Math.round(min / 60)}h`;

  return (
    <section className="panel targets">
      <h2>
        {title}
        <span className="small muted">
          {t.monthDays}일 · 근무일 {t.workdays}일
        </span>
      </h2>
      <div className="target-grid">
        <div className="target">
          <span className="label">Max</span>
          <b className="num">{fmtDur(s.possible)}</b>
          <span className="foot">
            {wk(rules.maxWeeklyMin)} ÷ 7 × {t.monthDays}일
            {reachable != null && reachable < s.possible && ` · 이번 달 실제 최대 ${fmtDur(reachable)}`}
          </span>
        </div>
        <div className="target strong">
          <span className="label">필요시간</span>
          <b className="num">{fmtDur(s.required)}</b>
          <span className="foot">
            {t.baseBy === 'workdays' ? `근무일 ${t.workdays}일 × ${fmtDurKo(rules.dailyStdMin)}` : `${wk(rules.stdWeeklyMin)} ÷ 7 × ${t.monthDays}일`}
            {t.offTotal > 0 && ` − 휴가 ${fmtDur(t.offTotal)}`}
          </span>
        </div>
        <div className="target">
          <span className="label">평일 누적초과</span>
          <b className={`num ${s.weekdayOvertime < 0 ? 'tone-bad' : s.weekdayOvertime > 0 ? 'tone-good' : ''}`}>{fmtDur(s.weekdayOvertime, { sign: true })}</b>
          <span className="foot">
            전일까지 필수 {fmtDur(s.weekdayRequiredSoFar)} 대비
            {s.holidayDone > 0 && ` · 휴일 근무 +${fmtDur(s.holidayDone)} 별도`}
          </span>
        </div>
        <div className="target">
          <span className="label">월말 예상</span>
          <b className={`num ${s.projectedDiff < 0 ? 'tone-bad' : 'tone-good'}`}>{fmtDur(s.projectedDiff, { sign: true })}</b>
          <span className={`foot ${overMax ? 'tone-bad' : ''}`}>
            {overMax ? `Max ${fmtDur(s.projected - s.possible)} 초과` : `Max까지 ${fmtDur(s.possibleLeft)} 여유`}
          </span>
        </div>
      </div>
      <div style={{ paddingTop: 22 }}>
        <MonthMeter work={pastPart} plan={planPart} leave={holidayPart} total={s.possible} marker={s.required} markerLabel={`필요 ${fmtDur(s.required)}`} />
      </div>
      <div className="legend" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span><i style={{ background: 'var(--accent)' }} />인정 {fmtDur(pastPart)}</span>
          <span><i style={{ background: 'var(--sky)' }} />남은 계획 {fmtDur(planPart)}</span>
          {holidayPart > 0 && <span><i style={{ background: 'var(--leave)' }} />휴일 근무 {fmtDur(holidayPart)} (Max에만 반영)</span>}
        </span>
        <span>Max {fmtDur(s.possible)}</span>
      </div>
      {showFormula && (
        <p className="small muted" style={{ margin: 0 }}>
          필요시간 = min(근무일 {t.workdays}일 × {fmtDurKo(rules.dailyStdMin)} = {fmtDur(t.byWorkdays)}, {wk(rules.stdWeeklyMin)} ÷ 7 × {t.monthDays}일 = {fmtDur(t.byWeekly)}) − 비근무근태 {fmtDur(t.offTotal)}
          {(s.holidayDone > 0 || s.holidayPlanned > 0) && ` · 휴일 근무(실적 ${fmtDur(s.holidayDone)}, 계획 ${fmtDur(s.holidayPlanned)})는 Max에서만 차감되고 필요시간·평일 누적초과에는 들어가지 않음`}
        </p>
      )}
    </section>
  );
}
