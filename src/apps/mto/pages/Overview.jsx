// 일정 현황: 최종 MTO · 요약 수치 · 병목 분석 · 추천 · 시나리오 · 간트
import { Stat, Pill, Icon } from '../../../shared/ui.jsx';
import { QuickControls } from '../components/Controls.jsx';
import Gantt, { GanttLegend } from '../components/Gantt.jsx';
import { Bottlenecks, CriticalPath, Recommendations, Risks, Scenarios } from '../components/Insights.jsx';
import { fmtLong, fmtShort } from '../lib/dates.js';
import { EXAMPLE_GDS, EXAMPLE_LAYERS } from '../lib/layers.js';

export function loadExample(state, dispatch, notify) {
  dispatch({ type: 'layers', layers: EXAMPLE_LAYERS, keepUndo: state.layers.length > 0 });
  if (!state.gds) dispatch({ type: 'gds', value: EXAMPLE_GDS });
  notify?.('예시 30개 Layer를 불러왔어요', state.layers.length ? { label: '되돌리기', run: () => dispatch({ type: 'undoLayers' }) } : null);
}

export function EmptyCard({ state, dispatch, notify, go }) {
  return (
    <section className="panel mto-empty">
      <h2>Layer List를 넣으면 바로 계산해요</h2>
      <p className="muted">Part A GDS 입고일과 Layer(No · Part · Layer · Type)를 넣으면 Layer별 STEP2 시작일과 MTO 날짜, 병목을 보여 줍니다. 엑셀에서 표를 복사해 붙여 넣어도 됩니다.</p>
      <div className="head-actions">
        <button type="button" className="btn primary" onClick={() => go('layers')}>
          <Icon name="layers" size={16} /> Layer List 입력
        </button>
        <button type="button" className="btn" onClick={() => loadExample(state, dispatch, notify)}>예시 30장 불러오기</button>
      </div>
    </section>
  );
}

export function IssueBanner({ issues, go }) {
  return (
    <div className="banner warn-banner" role="alert">
      <span>
        <b>입력 확인 {issues.length}건</b> · {issues.slice(0, 2).map((i) => i.msg).join(' / ')}
        {issues.length > 2 && ' …'}
      </span>
      {go && <button type="button" className="btn small-btn" onClick={() => go('layers')}>Layer List 고치기</button>}
    </div>
  );
}

export default function Overview({ state, dispatch, calc, go, notify }) {
  const { result, analysis: an } = calc;
  const pickScenario = (g) => dispatch({ type: 'config', patch: { mtoPerDay: g.mtoPerDay, step2Concurrency: g.step2Concurrency } });
  const applyOrder = (order) => {
    dispatch({ type: 'layers', layers: order, keepUndo: true });
    notify('추천 순서로 Layer No를 바꿨어요', { label: '되돌리기', run: () => dispatch({ type: 'undoLayers' }) });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>MTO 일정 현황</h1>
          <p>Part A GDS + Layer List → Layer별 STEP2 시작일 · MTO 날짜 · 병목</p>
        </div>
      </div>

      <section className="panel mto-bar">
        <QuickControls state={state} dispatch={dispatch} />
        <div className="mto-bar-rules small muted">
          STEP1 {Object.entries(state.config.step1Tat).map(([k, v]) => `${k} ${v}일`).join(' · ')} / STEP2 {Object.entries(state.config.step2Tat).map(([k, v]) => `${k} ${v}일`).join(' · ')} / Part B = A + {state.config.partBOffsetDays}일
          <button type="button" className="link-btn" onClick={() => go('rules')}>규칙 바꾸기</button>
        </div>
      </section>

      {calc.empty && <EmptyCard state={state} dispatch={dispatch} notify={notify} go={go} />}
      {calc.issues && <IssueBanner issues={calc.issues} go={go} />}

      {result && an && (
        <>
          <section className="panel today mto-hero">
            <div className="today-main">
              <span className="label">최종 MTO</span>
              <div className="clock-big">
                {fmtShort(result.finalMto).replace(/\(.\)/, '')}
                <span className="sub">{fmtLong(result.finalMto)}</span>
              </div>
              <div className="hero-pills">
                <Pill tone="neutral">리드타임 {result.leadTimeDays}일</Pill>
                <Pill tone="neutral">Layer {result.layers.length}장</Pill>
                <Pill tone="neutral">MTO {result.config.mtoPerDay}장/일 · STEP2 동시 {result.config.step2Concurrency ?? '무제한'}</Pill>
              </div>
              <p className="hero-line">{an.headline}</p>
            </div>
            <div className="today-side">
              {Object.entries(an.summary.byPart).map(([p, b]) => (
                <div key={p} className="hero-part">
                  <div className="kv"><span className="label">Part {p} · {b.layers}장</span><span className="v">GDS {fmtShort(b.gds)}</span></div>
                  <div className="kv"><span className="muted">STEP1</span><span className="v">{fmtShort(b.step1Start)} ~ {fmtShort(b.step1End)}</span></div>
                  <div className="kv"><span className="muted">MTO</span><span className="v">{fmtShort(b.firstMto)} ~ {fmtShort(b.lastMto)}</span></div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel stats" aria-label="대기 요약">
            <Stat label="STEP2 슬롯 대기" value={an.summary.layersWithStep2Wait} unit={`/ ${result.layers.length}장`}
              foot={an.summary.step2WaitTotal ? `누적 ${an.summary.step2WaitTotal}일 · 최대 ${an.summary.maxStep2Wait.layer} ${an.summary.maxStep2Wait.step2WaitDays}일` : '대기 없음'}
              tone={an.summary.layersWithStep2Wait ? 'warn' : undefined} />
            <Stat label="순차 MTO 대기" value={an.summary.layersWithMtoWait} unit={`/ ${result.layers.length}장`}
              foot={an.summary.mtoWaitTotal ? `누적 ${an.summary.mtoWaitTotal}일 · 최대 ${an.summary.maxMtoWait.layer} ${an.summary.maxMtoWait.mtoWaitDays}일` : '대기 없음'}
              tone={an.summary.layersWithMtoWait ? 'warn' : undefined} />
            <Stat label="STEP2 동시 피크" value={an.summary.step2PeakLoad} unit={result.config.step2Concurrency ? `/ ${result.config.step2Concurrency}장` : '장'}
              foot={result.config.step2Concurrency ? `꽉 찬 날 ${an.summary.step2DaysAtCapacity}일` : '제한 없음'} />
            <Stat label="제약 때문에 늦어진 날" value={an.constraintCost > 0 ? `+${an.constraintCost}` : '0'} unit="일"
              foot={`제약 없으면 ${fmtShort(an.freeFinal)}`} tone={an.constraintCost > 0 ? 'bad' : 'good'} />
          </section>

          <div className="grid-2 mto-analysis">
            <section className="panel">
              <h2>병목 분석 <span className="small muted">Layer별 대기를 더한 누적 일수</span></h2>
              <CriticalPath critical={an.critical} result={result} />
              <Bottlenecks items={an.bottlenecks} />
            </section>
            <section className="panel">
              <h2>추천 일정</h2>
              <Recommendations recs={an.recs} onApplyOrder={applyOrder} onApplyScenario={(r) => {
                const g = an.grid.reduce((m, x) => (x.finalMto < m.finalMto ? x : m), an.grid[0]);
                pickScenario(g);
              }} />
              <h2 className="sub-h">리스크</h2>
              <Risks risks={an.risks} />
            </section>
          </div>

          <section className="panel">
            <h2>시나리오 비교 <span className="small muted">하루 MTO 수 × STEP2 동시 진행 수 · 행을 누르면 그 조건으로 바뀝니다</span></h2>
            <Scenarios grid={an.grid} result={result} onPick={pickScenario} />
          </section>

          <section className="panel">
            <h2>
              일정 간트
              <GanttLegend />
            </h2>
            <Gantt result={result} />
          </section>
        </>
      )}
    </div>
  );
}
