// Revision ITEM Layer: 딸린 Product의 Set List에서 이번 ITEM에 들어오는 Layer(보통 1~5장)를 고른다.
// Product가 공정 기준이면 공정 Layer를 가리키고(이름·Type은 공정 시트를 따라감), 직접 입력 Product면 Layer를 복사해 둔다.
import { useMemo } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { fmtShort } from '../lib/dates.js';
import { projectLayers } from '../lib/projects.js';
import ProjectBar from '../components/ProjectBar.jsx';
import { referenceOf } from '../components/RevisionReference.jsx';

const keyOf = (l) => (l.ref ? `r:${l.ref}` : `m:${l.layer}`);
const ITEM_TYPICAL = 5;

/** Revision Layer 고르기: source(Reference의 Layer)에서 이번 ITEM Layer를 고르고 순서를 정한다 */
export function ItemLayerPicker({ state, dispatch, project, calc, go, notify, from, title }) {
  const source = useMemo(() => (from ? projectLayers(from, state.processes).filter((l) => !l.missing).sort((a, b) => a.no - b.no) : []), [from, state.processes]);
  const mine = useMemo(() => projectLayers(project, state.processes), [project, state.processes]);
  const picked = new Set(mine.map(keyOf));
  const mtoOf = useMemo(() => new Map((calc.result?.layers || []).map((l) => [l.no, l])), [calc.result]);

  const set = (layers, undoMsg) => {
    dispatch({ type: 'layers', layers, keepUndo: !!undoMsg });
    if (undoMsg) notify(undoMsg, { label: '되돌리기', run: () => dispatch({ type: 'undoLayers' }) });
  };
  const nextNo = () => (project.layers.length ? Math.max(...project.layers.map((l) => (Number.isFinite(l.no) ? l.no : 0))) + 1 : 1);
  const toggle = (l) => {
    const k = keyOf(l);
    if (picked.has(k)) set(project.layers.filter((x, i) => keyOf(mine[i]) !== k));
    else set([...project.layers, l.ref ? { no: nextNo(), ref: l.ref } : { no: nextNo(), part: 'R', layer: l.layer, type: l.type }]);
  };
  const groups = useMemo(() => {
    const g = [];
    for (const l of source) {
      const name = [l.part && /^[A-Z0-9]{1,2}$/.test(l.part) ? `Part ${l.part}` : l.part, l.module].filter(Boolean).join(' › ') || 'Layer';
      let x = g.find((y) => y.name === name);
      if (!x) g.push((x = { name, layers: [] }));
      x.layers.push(l);
    }
    return g;
  }, [source]);
  const rows = mine.map((l, i) => ({ ...l, _i: i })).sort((a, b) => a.no - b.no);
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const a = rows[i]._i;
    const b = rows[j]._i;
    set(project.layers.map((l, k) => (k === a ? { ...l, no: project.layers[b].no } : k === b ? { ...l, no: project.layers[a].no } : l)));
  };
  const n = project.layers.length;
  const takeAll = () => set(source.map((l, i) => (l.ref ? { no: i + 1, ref: l.ref } : { no: i + 1, part: 'R', layer: l.layer, type: l.type })), `${from.name}의 Layer ${source.length}장을 그대로 담았어요`);

  return (
    <>
      {!from ? (
        <section className="panel mto-empty">
          <h2>Layer를 고를 곳이 없어요</h2>
          <p className="muted">Reference에서 Product나 다른 Revision을 고르세요.</p>
        </section>
      ) : (
        <section className="panel picker">
          <h2>
            <span className="layer-sum">
              {title || `${from.name} Set List`}
              <Pill tone={n > ITEM_TYPICAL ? 'warn' : 'accent'}>{n}장</Pill>
            </span>
            <span className="head-actions">
              {from.kind === 'revision' && source.length > 0 && <button type="button" className="btn small-btn" onClick={takeAll}><Icon name="copy" size={14} /> 전부 담기</button>}
              {n > 0 && <button type="button" className="btn small-btn ghost danger" onClick={() => set([], '선택을 모두 뺐어요')}><Icon name="trash" size={14} /> 비우기</button>}
            </span>
          </h2>
          {source.length ? (
            <div className="pick-grid">
              {groups.map((g) => (
                <div key={g.name} className="pick-mod flat">
                  <span className="mod-name">{g.name}</span>
                  <div className="pick-layers">
                    {g.layers.map((l) => (
                      <label key={keyOf(l)} className={`pick-layer ${picked.has(keyOf(l)) ? 'on' : ''}`}>
                        <input type="checkbox" checked={picked.has(keyOf(l))} onChange={() => toggle(l)} />
                        {l.layer}
                        <span className={`type-chip t-${l.type}`}>{l.type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">{from.name}에 Layer가 없어요.{from.kind === 'product' && <> <button type="button" className="link-btn" onClick={() => go('layers', from.id)}>Set List 채우기</button></>}</p>
          )}
        </section>
      )}
      <PickedTable {...{ calc, rows, n, mtoOf, move, set, project }} />
    </>
  );
}

function PickedTable({ calc, rows, n, mtoOf, move, set, project }) {
  return (
    <>
      {calc.issues && calc.issues.some((i) => i.field !== 'gds') && (
        <div className="banner warn-banner" role="alert"><span><b>입력 확인</b> · {calc.issues.filter((i) => i.field !== 'gds').slice(0, 3).map((i) => i.msg).join(' / ')}</span></div>
      )}

      {n > 0 && (
        <section className="panel">
          <h2>선택 {n}장</h2>
          <div className="table-wrap">
            <table className="data-table layer-edit">
              <thead>
                <tr><th style={{ width: 84 }}>No</th><th>Layer</th><th>Type</th><th className="r">STEP2 TAT</th><th>STEP2 시작</th><th>MTO</th><th style={{ width: 120 }} /></tr>
              </thead>
              <tbody>
                {rows.map((l, i) => {
                  const r = mtoOf.get(l.no);
                  return (
                    <tr key={keyOf(l)} className={l.missing ? 'missing' : ''}>
                      <td><input className="input num cell" type="number" value={Number.isFinite(l.no) ? l.no : ''} onChange={(e) => set(project.layers.map((x, k) => (k === l._i ? { ...x, no: parseInt(e.target.value, 10) } : x)))} aria-label="No" /></td>
                      <td><b>{l.missing ? '(공정에서 지워짐)' : l.layer}</b></td>
                      <td>{l.type && <span className={`type-chip t-${l.type}`}>{l.type}</span>}</td>
                      <td className="num r">{calc.config.step2Tat[l.type] ? `${calc.config.step2Tat[l.type]}일` : '-'}</td>
                      <td className="num">{r ? <>{fmtShort(r.step2Start)}{r.step2WaitDays > 0 && <span className="tone-warn small"> +{r.step2WaitDays}</span>}</> : '-'}</td>
                      <td className="num">{r ? <>{fmtShort(r.mtoDate)}{r.mtoWaitDays > 0 && <span className="tone-warn small"> +{r.mtoWaitDays}</span>}</> : '-'}</td>
                      <td><div className="row-act">
                        <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로"><Icon name="chevron" size={14} /></button>
                        <button type="button" className="icon-btn sm down" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="아래로"><Icon name="chevron" size={14} /></button>
                        <button type="button" className="icon-btn sm" onClick={() => set(project.layers.filter((_, k) => k !== l._i))} aria-label="빼기"><Icon name="close" size={14} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export default function ItemLayerList({ state, dispatch, project, calc, calcs, go, notify }) {
  const parent = state.projects.find((p) => p.id === project.parentId && p.kind === 'product');
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{project.name} · Revision Concept</h1>
          <p>
            {parent ? <><b>{parent.name}</b>의 Set List에서</> : 'Product를 먼저 고르고'} 이번 ITEM에 들어오는 Layer를 고르세요. 보통 1~5장이 한 Set로 들어와요. Part 구분 없이 GDS → STEP1 → STEP2 → MTO로 계산합니다.
          </p>
        </div>
        {parent && (
          <div className="head-actions">
            <button type="button" className="btn" onClick={() => go('layers', parent.id)}>{parent.name} Set List 보기</button>
          </div>
        )}
      </div>

      <ProjectBar state={state} dispatch={dispatch} calcs={calcs} notify={notify} />


      <ItemLayerPicker state={state} dispatch={dispatch} project={project} calc={calc} go={go} notify={notify} from={referenceOf(state, project)} />
    </div>
  );
}
