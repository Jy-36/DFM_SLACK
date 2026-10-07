// App Mode (휴대폰 폭 요약): 최종 MTO · 빠른 조건 변경 · 다음 MTO · 병목 · 시나리오
import { Icon, Pill } from '../../../shared/ui.jsx';
import { QuickControls } from '../components/Controls.jsx';
import { Scenarios } from '../components/Insights.jsx';
import { diffDays, fmtLong, fmtShort, todayIso } from '../lib/dates.js';
import { mtoByDate } from '../lib/report.js';
import { loadExample } from './Overview.jsx';

export default function Mini({ state, dispatch, calc, notify, expand }) {
  const { result, analysis: an } = calc;
  const today = todayIso();
  const days = result ? mtoByDate(result) : [];
  const upcoming = days.filter((d) => d.date >= today).slice(0, 4);
  const done = result ? result.layers.filter((l) => l.mtoDate < today).length : 0;

  return (
    <div className="mini mto-mini fade-in">
      {result && an ? (
        <section className="mini-hero">
          <div className="mini-hero-row">
            <div style={{ display: 'grid', gap: 6 }}>
              <span className="label">최종 MTO</span>
              <b className="mini-clock num">{fmtShort(result.finalMto).replace(/\(.\)/, '')}</b>
              <span className="muted small">{fmtLong(result.finalMto)}</span>
            </div>
            <div className="mini-lead">
              <b className="num">{result.leadTimeDays}</b>
              <span>일 리드타임</span>
              {an.constraintCost > 0 && <Pill tone="neutral">제약 +{an.constraintCost}일</Pill>}
            </div>
          </div>
          <div className="mini-facts">
            <div><span>Part A GDS</span><b className="num">{fmtShort(result.partAGds)}</b></div>
            <div><span>Part B GDS</span><b className="num">{fmtShort(result.partBGds)}</b></div>
            <div><span>MTO 완료</span><b className="num">{done}/{result.layers.length}</b></div>
          </div>
        </section>
      ) : (
        <section className="mini-card">
          <div className="mini-card-head"><h3>MTO 일정</h3></div>
          {calc.issues ? (
            <p className="small tone-warn">입력 확인 {calc.issues.length}건 · {calc.issues[0].msg}</p>
          ) : (
            <p className="small muted">Part A GDS 입고일과 Layer List를 넣으면 최종 MTO와 병목을 보여 줘요.</p>
          )}
          <div className="mini-btns">
            <button type="button" className="btn primary" onClick={() => expand('layers')}><Icon name="layers" size={15} /> Layer List 입력</button>
            <button type="button" className="btn" onClick={() => loadExample(state, dispatch, notify)}>예시 30장</button>
          </div>
        </section>
      )}

      <section className="mini-card">
        <QuickControls state={state} dispatch={dispatch} compact />
      </section>

      {result && an && (
        <>
          <section className="mini-card">
            <div className="mini-card-head">
              <h3>다음 MTO</h3>
              <button type="button" className="link-btn" onClick={() => expand('table')}>일정표 <Icon name="chevron" size={14} /></button>
            </div>
            {upcoming.length ? (
              <ul className="mini-list">
                {upcoming.map((d) => (
                  <li key={d.date}>
                    <span className="chips">{d.layers.map((l) => <Pill key={l.no} tone={l.part === 'A' ? 'accent' : 'leave'}>{l.layer}</Pill>)}</span>
                    <span className="when">{d.date === today ? '오늘' : `${fmtShort(d.date)} · D-${diffDays(d.date, today)}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">{days.length && days[days.length - 1].date < today ? '모든 MTO가 지난 일정입니다.' : '예정된 MTO가 없습니다.'}</p>
            )}
          </section>

          <section className="mini-card">
            <div className="mini-card-head">
              <h3>병목</h3>
              <button type="button" className="link-btn" onClick={() => expand('overview')}>분석 <Icon name="chevron" size={14} /></button>
            </div>
            {an.bottlenecks.length ? (
              <ul className="mini-bn">
                {an.bottlenecks.slice(0, 3).map((b) => (
                  <li key={b.key}>
                    <div className="bn-row"><span>{b.title}</span><b className="num">{Math.round(b.share * 100)}%</b></div>
                    <div className="bn-track"><i style={{ width: `${Math.max(3, b.share * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">대기 없이 진행됩니다.</p>
            )}
            {an.recs[0] && (
              <div className="mini-rec">
                <span className="label">추천</span>
                <span className="small"><b>{an.recs[0].title}</b> · {an.recs[0].detail}</span>
              </div>
            )}
          </section>

          <section className="mini-card">
            <div className="mini-card-head">
              <h3>시나리오</h3>
              <span className="small muted">누르면 그 조건으로</span>
            </div>
            <Scenarios compact grid={an.grid} result={result} onPick={(g) => dispatch({ type: 'config', patch: { mtoPerDay: g.mtoPerDay, step2Concurrency: g.step2Concurrency } })} />
          </section>
        </>
      )}

      <button className="btn primary expand-cta" onClick={() => expand('overview')}>
        <Icon name="expand" size={16} /> Window Mode에서 간트 보기
      </button>
    </div>
  );
}
