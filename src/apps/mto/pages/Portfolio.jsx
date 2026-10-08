// 전체 일정: 모든 Product · Revision을 한눈에 — 요약 표, 묶음별 간트, 날짜별 MTO(전체)
// 묶음은 서로 독립 계산 (STEP2 슬롯·하루 MTO 장수 공유 안 함). 목록 순서 = 화면 순서.
import { useMemo } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { fmtShort, todayIso } from '../lib/dates.js';
import { COLUMNS } from '../lib/report.js';
import PortfolioGantt from '../components/PortfolioGantt.jsx';
import { AddItem, KindTag } from '../components/ProjectBar.jsx';
import { copyText } from './ScheduleTable.jsx';

export default function Portfolio({ state, dispatch, calcs, go, notify, section }) {
  const rev = section === 'revision';
  const products = state.projects.filter((p) => p.kind === 'product');
  // Revision 탭: Product 순서대로 ITEM을 묶어서 보여 준다
  const projects = rev
    ? [...products.flatMap((pr) => state.projects.filter((p) => p.kind === 'revision' && p.parentId === pr.id)), ...state.projects.filter((p) => p.kind === 'revision' && !products.some((pr) => pr.id === p.parentId))]
    : products;
  const parentName = (p) => products.find((pr) => pr.id === p.parentId)?.name;
  const items = projects.filter((p) => calcs[p.id].result).map((p) => ({ project: p, ...calcs[p.id] }));
  const today = todayIso();

  // 날짜별 MTO (모든 묶음)
  const byDate = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      for (const l of it.result.layers) {
        if (!m.has(l.mtoDate)) m.set(l.mtoDate, []);
        m.get(l.mtoDate).push({ p: it.project, l });
      }
    }
    return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [items]);
  const upcoming = byDate.filter(([d]) => d >= today);
  const shown = (upcoming.length ? upcoming : byDate).slice(0, 24);
  const colorOf = Object.fromEntries(projects.map((p, i) => [p.id, i % 6]));

  const copyAll = async () => {
    const head = [rev ? 'Product' : '', rev ? 'ITEM' : 'Product', ...COLUMNS.map(([k]) => k)].filter((x, i) => rev || i > 0).join('\t');
    const body = items.flatMap((it) => it.result.layers.map((l) => [...(rev ? [parentName(it.project) || ''] : []), it.project.name, ...COLUMNS.map(([, f]) => String(f(l)).replace(/\t|\n/g, ' '))].join('\t')));
    notify((await copyText([head, ...body].join('\n'))) ? `${items.length}개 묶음 일정을 복사했어요 · 엑셀에 붙여 넣으세요` : '복사하지 못했어요');
  };
  const add = (kind) => {
    dispatch({ type: 'addProject', kind });
    go('layers');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{rev ? '전체 Revision' : '전체 Product'}</h1>
          <p>{rev ? `Revision ITEM ${projects.length}개 · Product별로 묶음 · ITEM 단위(보통 1~5장 Set)로 따로 계산` : `Product ${projects.length}개 — Set List 전체(또는 중간부터) · Product마다 따로 계산 (STEP2 슬롯·MTO 장수 공유 안 함)`}</p>
        </div>
        <div className="head-actions">
          {rev ? <AddItem state={state} dispatch={dispatch} /> : <button type="button" className="btn" onClick={() => add('product')}><Icon name="plus" size={15} /> Product</button>}
          <button type="button" className="btn" onClick={copyAll} disabled={!items.length}><Icon name="copy" size={15} /> 전체 엑셀용 복사</button>
        </div>
      </div>

      <section className="panel">
        <h2>{rev ? 'Revision ITEM' : 'Product'} <span className="small muted">행을 누르면 그 묶음의 일정 현황 · 화살표로 순서 바꾸기</span></h2>
        <div className="table-wrap">
          <table className="data-table pf-table">
            <thead>
              <tr>
                {rev && <th>Product</th>}
                <th>{rev ? 'ITEM' : '이름'}</th>
                <th>GDS</th>
                <th className="r">Layer</th>
                <th>조건</th>
                <th>MTO 기간</th>
                <th>최종 MTO</th>
                <th className="r">리드타임</th>
                <th>가장 큰 대기</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => {
                const c = calcs[p.id];
                const r = c.result;
                const top = c.analysis?.bottlenecks[0];
                const first = r ? r.layers.reduce((m, l) => (l.mtoDate < m ? l.mtoDate : m), r.layers[0].mtoDate) : null;
                return (
                  <tr key={p.id} className={p.id === state.activeId ? 'cur' : ''} onClick={() => go('overview', p.id)} title="눌러서 일정 현황 보기">
                    {rev && <td className="small">{parentName(p) || <span className="tone-warn">Product 없음</span>}</td>}
                    <td>
                      <span className="pf-name">
                        <KindTag kind={p.kind} />
                        <b>{p.name}</b>
                        {!rev && state.projects.some((x) => x.parentId === p.id) && <span className="small muted">ITEM {state.projects.filter((x) => x.parentId === p.id).length}</span>}
                      </span>
                    </td>
                    <td className="num">{p.gds ? fmtShort(p.gds) : <span className="muted">-</span>}{r && r.step1.B && <span className="small muted"> · B {fmtShort(r.partBGds)}</span>}</td>
                    <td className="num r">{p.layers.length}</td>
                    <td className="num small">MTO {c.config.mtoPerDay} · STEP2 {c.config.step2Concurrency ?? '∞'}{p.kind === 'revision' && ` · STEP1 ${c.config.step1Tat.R}일`}</td>
                    <td className="num">{r ? `${fmtShort(first)} ~` : ''}</td>
                    <td className="num">{r ? <b>{fmtShort(r.finalMto)}</b> : c.issues ? <Pill tone="warn">입력 확인 {c.issues.length}</Pill> : <span className="muted">Layer 없음</span>}</td>
                    <td className="num r">{r ? `${r.leadTimeDays}일` : ''}</td>
                    <td className="small">{top ? `${top.title} (${Math.round(top.share * 100)}%)` : r ? '대기 없음' : ''}</td>
                    <td className="row-act-cell" onClick={(e) => e.stopPropagation()}>
                      <div className="row-act">
                        <button type="button" className="icon-btn sm" disabled={i === 0} onClick={() => dispatch({ type: 'moveProject', id: p.id, dir: -1 })} title="위로" aria-label="위로"><Icon name="chevron" size={14} /></button>
                        <button type="button" className="icon-btn sm down" disabled={i === projects.length - 1} onClick={() => dispatch({ type: 'moveProject', id: p.id, dir: 1 })} title="아래로" aria-label="아래로"><Icon name="chevron" size={14} /></button>
                        <button type="button" className="icon-btn sm" onClick={() => go('layers', p.id)} title="Layer List" aria-label="Layer List"><Icon name="layers" size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {items.length > 0 && (
        <section className="panel">
          <h2>
            묶음별 일정
            <span className="legend gantt-legend">
              <span><i className="sw step1" />STEP1</span>
              <span><i className="sw step2" />STEP2 (첫 시작~마지막 종료)</span>
              <span><i className="sw mto" />MTO 기간</span>
              <span><i className="sw final" />최종 MTO</span>
              <span><i className="sw hol" />공휴일</span>
              <span><i className="sw we" />주말</span>
            </span>
          </h2>
          <PortfolioGantt items={items} config={state.config} onPick={(id) => go('overview', id)} />
        </section>
      )}

      {shown.length > 0 && (
        <section className="panel">
          <h2>날짜별 MTO (전체) <span className="small muted">{upcoming.length ? '오늘 이후' : '모든 MTO가 지난 일정'} · 묶음별 색</span></h2>
          <div className="pf-days">
            {shown.map(([d, list]) => (
              <div key={d} className={`pf-day ${d === today ? 'is-today' : ''}`}>
                <div className="pf-day-h">
                  <span className="num when">{d === today ? '오늘' : fmtShort(d)}</span>
                  <span className="num cnt">{list.length}장</span>
                </div>
                <div className="chips">
                  {list.map(({ p, l }) => (
                    <span key={`${p.id}-${l.no}`} className={`pf-chip c${colorOf[p.id]}`} title={`${p.name} · ${l.layer}`}>
                      <b>{p.name}</b> {l.layer}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!items.length && (
        <section className="panel mto-empty">
          <h2>아직 계산된 묶음이 없어요</h2>
          <p className="muted">Product나 Revision을 추가하고 GDS 입고일과 Layer List를 넣으면 여기서 한눈에 볼 수 있어요.</p>
        </section>
      )}
    </div>
  );
}
