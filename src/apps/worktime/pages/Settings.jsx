import { useState } from 'react';
import { fmtDur } from '../lib/time.js';
import { LEAVE_ORDER } from '../lib/rules.js';
import { TimeField, PRESETS } from '../../../shared/TimeField.jsx';

const toH = (min) => Math.round((min / 60) * 100) / 100;
const fromH = (h) => Math.round(Number(h) * 60);

export default function Settings({ state, dispatch, notify }) {
  const r = state.rules;
  const set = (patch) => dispatch({ type: 'rules/set', patch });
  const [confirmReset, setConfirmReset] = useState(false);

  const hoursField = (key, label, hint) => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input num"
        type="number"
        step="0.5"
        min="0"
        id={`rule-${key}`}
        value={toH(r[key])}
        onChange={(e) => set({ [key]: fromH(e.target.value) })}
      />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );

  const toggleField = (key, label, hint) => (
    <label className="field">
      <span>{label}</span>
      <span className="toggle-row">
        <input type="checkbox" id={`rule-${key}`} checked={!!r[key]} onChange={(e) => set({ [key]: e.target.checked })} />
        <span>{r[key] ? '사용' : '사용 안 함'}</span>
      </span>
      {hint && <small className="muted">{hint}</small>}
    </label>
  );

  const setBreak = (i, patch) => set({ breaks: r.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setLeave = (k, patch) => set({ leaveTypes: { ...r.leaveTypes, [k]: { ...r.leaveTypes[k], ...patch } } });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>근무 규칙 설정</h1>
          <p>회사 선택근무제 규정에 맞게 바꾸면 모든 계산에 바로 반영됩니다.</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => { dispatch({ type: 'rules/reset' }); notify('규칙을 기본값으로 되돌렸습니다.'); }}>
            규칙 기본값으로
          </button>
        </div>
      </div>

      <section className="panel">
        <h2>정산 기준 (시간 단위)</h2>
        <div className="settings-grid">
          <label className="field">
            <span>정산 단위</span>
            <select className="input" id="rule-unit" value={r.settlementUnit} onChange={(e) => set({ settlementUnit: e.target.value })}>
              <option value="month">1개월</option>
            </select>
            <small className="muted">2주·분기 단위는 다음 단계에서 지원</small>
          </label>
          {hoursField('dailyStdMin', '1일 소정근로', '필수 근무 시간 후보 ① 근무일 × 이 값')}
          {hoursField('stdWeeklyMin', '주 소정근로', '필수 근무 시간 후보 ② 이 값 ÷ 7 × 월 일수')}
          {hoursField('maxWeeklyMin', '최대 근무 시간 계산용 주 시간', '최대 근무 시간 = 이 값 ÷ 7 × 월 일수')}
          {toggleField('weeklyLimitOn', '주마다 이 시간 제한', '끄면 월 정산만 봄 (회사 기준)')}
          <label className="field">
            <span>주 환산 시간 버림 단위</span>
            <select className="input" id="rule-max-round" value={r.maxRounding || 'hour'} onChange={(e) => set({ maxRounding: e.target.value })}>
              <option value="hour">시간 단위 버림 (최대 230:17 → 230:00, 177:08 → 177:00)</option>
              <option value="minute">분 단위 (230:17, 177:08)</option>
            </select>
          </label>
          {hoursField('minDailyMin', '근무일 최소 인정', '0이면 검사하지 않음')}
          {toggleField('familyDayOn', '패밀리데이 표시', '21일이 있는 주 금요일을 후보로 표시')}
          {toggleField('dailyLimitOn', '하루 최대 근무 제한', '끄면 제한 없음 (회사 기준)')}
          {r.dailyLimitOn && hoursField('maxDailyMin', '하루 최대 근무', '초과분은 인정하지 않음')}
          <div className="field">
            <span>계획 기본 출근 시각</span>
            <TimeField id="rule-planin" value={r.planDefaultIn} presets={PRESETS.in} allowEmpty={false} ariaLabel="계획 기본 출근 시각" onChange={(v) => set({ planDefaultIn: v })} />
          </div>
          <div className="field">
            <span>근로 인정 시작</span>
            <TimeField id="rule-from" value={r.recognizeFrom} presets={['05:00', '06:00', '07:00', '08:00']} allowEmpty={false} ariaLabel="근로 인정 시작" onChange={(v) => set({ recognizeFrom: v })} />
          </div>
          <div className="field">
            <span>근로 인정 끝</span>
            <TimeField id="rule-to" value={r.recognizeTo} presets={['20:00', '21:00', '22:00', '23:00']} allowEmpty={false} ariaLabel="근로 인정 끝" onChange={(v) => set({ recognizeTo: v })} />
            <small className="muted">이 시간대 밖의 체류는 근무로 치지 않음</small>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <h2>휴게시간 자동 차감</h2>
          {r.breaks.map((b, i) => (
            <div className="break-row" key={i}>
              <span>실근무</span>
              <input className="input num" type="number" step="0.5" min="0" id={`break-at-${i}`} value={toH(b.at)} onChange={(e) => setBreak(i, { at: fromH(e.target.value) })} aria-label="실근무 시간" />
              <span>시간 지나면</span>
              <input className="input num" type="number" step="5" min="0" id={`break-min-${i}`} value={b.minutes} onChange={(e) => setBreak(i, { minutes: Number(e.target.value) })} aria-label="휴게 분" />
              <span>분 휴게</span>
              <button className="btn ghost" onClick={() => set({ breaks: r.breaks.filter((_, j) => j !== i) })} aria-label="삭제">삭제</button>
            </div>
          ))}
          <div>
            <button className="btn" onClick={() => set({ breaks: [...r.breaks, { at: 720, minutes: 30 }] })}>휴게 규칙 추가</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            예: 08:30 출근, 실근무 8시간이면 휴게 {fmtDur(r.breaks.filter((b) => b.at < 480).reduce((a, b) => a + b.minutes, 0))} 차감
          </p>
        </section>

        <section className="panel">
          <h2>근태별 처리</h2>
          <p className="small muted" style={{ marginTop: -6 }}>연차·반차 같은 비근무근태는 필수 근무 시간을 줄이고, 출장·교육은 그날 근무시간으로 인정합니다.</p>
          <table className="data-table">
            <thead>
              <tr><th>구분</th><th>처리</th><th>시간</th></tr>
            </thead>
            <tbody>
              {LEAVE_ORDER.map((k) => (
                <tr key={k}>
                  <td>{r.leaveTypes[k].label}</td>
                  <td>
                    <select className="input" style={{ width: 150 }} id={`leave-kind-${k}`} value={r.leaveTypes[k].kind || 'off'} onChange={(e) => setLeave(k, { kind: e.target.value })} aria-label={`${r.leaveTypes[k].label} 처리 방식`}>
                      <option value="off">필수 근무 시간에서 차감</option>
                      <option value="work">근무로 인정</option>
                      <option value="rest">쉼 (필수 근무 시간 유지)</option>
                    </select>
                  </td>
                  <td>
                    {r.leaveTypes[k].variable ? (
                      <span className="small muted">{toH(r.leaveTypes[k].step)}시간 단위 · 최대 {toH(r.leaveTypes[k].max)}시간 (날마다 고름)</span>
                    ) : (
                      <input className="input num" style={{ width: 80 }} type="number" step="0.5" min="0" id={`leave-credit-${k}`} value={toH(r.leaveTypes[k].credit)} onChange={(e) => setLeave(k, { credit: fromH(e.target.value) })} aria-label={`${r.leaveTypes[k].label} 시간`} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel" style={{ display: 'grid', gap: 10 }}>
        <h2>데이터</h2>
        <p className="muted" style={{ margin: 0 }}>
          지금은 가짜 데이터로 동작합니다. 다시 만들면 지난달 1일부터 오늘까지의 기록과 계획이 새로 생성됩니다.
        </p>
        <div className="head-actions">
          {confirmReset ? (
            <>
              <span>직접 보정한 기록과 계획이 모두 지워집니다.</span>
              <button className="btn primary" onClick={() => { dispatch({ type: 'records/resetMock' }); setConfirmReset(false); notify('가짜 데이터를 새로 만들었습니다.'); }}>
                지우고 다시 만들기
              </button>
              <button className="btn" onClick={() => setConfirmReset(false)}>취소</button>
            </>
          ) : (
            <button className="btn" onClick={() => setConfirmReset(true)}>가짜 데이터 다시 만들기</button>
          )}
        </div>
      </section>
    </div>
  );
}
