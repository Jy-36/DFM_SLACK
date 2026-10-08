// 일정 현황: 최종 MTO · 요약 수치 · 병목 분석 · 추천 · 시나리오 · 간트
import { Stat, Pill, Icon } from '../../../shared/ui.jsx';
import { QuickControls } from '../components/Controls.jsx';
import Gantt, { GanttLegend } from '../components/Gantt.jsx';
import { Bottlenecks, CriticalPath, Recommendations, Risks, Scenarios } from '../components/Insights.jsx';
import { fmtLong, fmtShort } from '../lib/dates.js';
import { EXAMPLE_GDS, EXAMPLE_LAYERS, EXAMPLE_REVISION } from '../lib/layers.js';
import { partLabel } from '../lib/scheduler.js';
import ProjectBar, { AddItem } from '../components/ProjectBar.jsx';

export function loadExample(project, dispatch, notify) {
  const rev = project.kind === 'revision';
  if (project.processId) {
    // 공정 기준이면 공정의 Layer를 모두 담는다
    dispatch({ type: 'pickAllFromProcess' });
    if (!project.gds) dispatch({ type: 'gds', value: rev ? '2026-10-12' : EXAMPLE_GDS });
    notify?.('공정의 Layer를 모두 담았어요', { label: '되돌리기', run: () => dispatch({ type: 'undoLayers' }) });
    return;
  }
  dispatch({ type: 'layers', layers: rev ? EXAMPLE_REVISION : EXAMPLE_LAYERS, keepUndo: project.layers.length > 0 });
  if (!project.gds) dispatch({ type: 'gds', value: rev ? '2026-10-12' : EXAMPLE_GDS });
  notify?.(`예시 ${rev ? 5 : 30}개 Layer를 불러왔어요`, project.layers.length ? { label: '되돌리기', run: () => dispatch({ type: 'undoLayers' }) } : null);
}

export function EmptyCard({ project, dispatch, notify, go }) {
  const rev = project.kind === 'revision';
  return (
    <section className="panel mto-empty">
      <h2>{project.name} · {rev ? 'ITEM Layer를 고르면' : 'Set List를 넣으면'} 바로 계산해요</h2>
      <p className="muted">
        {rev
          ? 'Product의 Layer 중 이번 ITEM에 들어오는 Layer(보통 1~5장)를 고르고 GDS 입고일을 넣으면 STEP1 → STEP2 → MTO 일정을 계산합니다. Part 구분은 없습니다.'
          : 'GDS 입고일과 Set List(No · Part · Layer · Type)를 넣으면 Layer별 STEP2 시작일과 MTO 날짜, 병목을 보여 줍니다.'}{' '}
        {!rev && '엑셀에서 표를 복사해 붙여 넣어도 됩니다.'}
      </p>
      <div className="head-actions">
        <button type="button" className="btn primary" onClick={() => go('layers')}>
          <Icon name="layers" size={16} /> {rev ? 'ITEM Layer 고르기' : 'Set List 입력'}
        </button>
        {!rev && <button type="button" className="btn" onClick={() => loadExample(project, dispatch, notify)}>{project.processId ? '공정 Set List 모두 담기' : '예시 30장 불러오기'}</button>}
      </div>
    </section>
  );
}

/** 지금 탭(Product / Revision)에 묶음이 하나도 없을 때 */
export function NoneCard({ state, dispatch, section }) {
  const products = state.projects.filter((p) => p.kind === 'product');
  if (section === 'product') {
    return (
      <div className="page">
        <section className="panel mto-empty">
          <h2>Product가 없어요</h2>
          <p className="muted">Product를 만들면 기준 공정의 Set List 전체가 담겨요. 중간부터 나가는 경우는 Set List에서 시작 Layer를 고르면 돼요.</p>
          <div className="head-actions">
            <button type="button" className="btn primary" onClick={() => dispatch({ type: 'addProject', kind: 'product' })}><Icon name="plus" size={15} /> Product 추가</button>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="page">
      <section className="panel mto-empty">
        <h2>Revision ITEM이 없어요</h2>
        <p className="muted">Revision은 Product에 딸린 ITEM 단위(보통 1~5장 Set)로 들어와요. {products.length ? 'ITEM이 딸릴 Product를 고르고 추가하세요.' : '먼저 Product를 만들어야 ITEM을 추가할 수 있어요.'}</p>
        <div className="head-actions">
          <AddItem state={state} dispatch={dispatch} />
        </div>
      </section>
    </div>
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

export default function Overview({ state, dispatch, project, calc, calcs, go, notify }) {
  const { result, analysis: an } = calc;
  const rev = project.kind === 'revision';
  const cfg = calc.config;
  const pickScenario = (g) => dispatch({ type: 'override', patch: { mtoPerDay: g.mtoPerDay, step2Concurrency: g.step2Concurrency } });
  const applyOrder = (order) => {
    dispatch({ type: 'layers', layers: order, keepUndo: true });
    notify('추천 순서로 Layer No를 바꿨어요', { label: '되돌리기', run: () => dispatch({ type: 'undoLayers' }) });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{project.name} 일정 현황</h1>
          <p>{rev ? 'Revision · GDS → STEP1 → STEP2 → MTO (Part 구분 없음)' : 'Product · GDS + Set List(FEOL + BEOL Option) → Layer별 STEP2 시작일 · MTO 날짜 · 병목'}</p>
        </div>
      </div>

      <ProjectBar state={state} dispatch={dispatch} calcs={calcs} notify={notify} />

      <section className="panel mto-bar">
        <QuickControls project={project} cfg={cfg} dispatch={dispatch} />
        <div className="mto-bar-rules small muted">
          {rev
            ? <>STEP1 {cfg.step1Tat.R}일</>
            : <>STEP1 FEOL {cfg.step1Tat.FEOL}일 · BEOL {cfg.step1Tat.BEOL}일</>}
          {' '}/ STEP2 {Object.entries(cfg.step2Tat).map(([k, v]) => `${k} ${v}일`).join(' · ')}
          {!rev && <> / BEOL GDS = FEOL + {cfg.partOffsets?.BEOL ?? cfg.partBOffsetDays}일</>}
          <span> · 이 {rev ? 'Revision' : 'Product'}만 따로 계산 (STEP2 슬롯·MTO 장수 공유 안 함)</span>
          <button type="button" className="link-btn" onClick={() => go('rules')}>규칙 바꾸기</button>
        </div>
      </section>

      {calc.empty && <EmptyCard project={project} dispatch={dispatch} notify={notify} go={go} />}
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
                  <div className="kv"><span className="label">{partLabel(p)} · {b.layers}장</span><span className="v">GDS {fmtShort(b.gds)}</span></div>
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
