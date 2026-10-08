// Common · Product 정보: 모든 Product의 기준 정보(공정 · BEOL Option · 정보 열)를 한 표에서 관리.
// 일정(GDS · MTO 조건)은 Product 탭에서, 여기서는 Product가 "무엇인지"를 관리한다.
import { useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { fmtShort } from '../lib/dates.js';
import { activeFeolOptionsOf, beolOptionsOf, feolOptionOf, feolOptionsOf } from '../lib/process.js';

export default function ProductInfo({ state, dispatch, calcs, go, notify }) {
  const products = state.projects.filter((p) => p.kind === 'product');
  const cols = state.productColumns || [];
  const [newCol, setNewCol] = useState('');
  const upd = (id, patch) => dispatch({ type: 'updateProject', id, patch });
  const itemsOf = (id) => state.projects.filter((p) => p.parentId === id);

  const addCol = () => {
    const c = newCol.trim();
    if (!c || cols.includes(c) || ['이름', '공정', 'BEOL Option'].includes(c)) return;
    dispatch({ type: 'productColumns', columns: [...cols, c] });
    setNewCol('');
  };
  const renameCol = (old, name) => {
    if (!name || cols.includes(name)) return;
    dispatch({ type: 'productColumns', columns: cols.map((c) => (c === old ? name : c)) });
    for (const p of products) {
      if (p.info && old in p.info) {
        const { [old]: v, ...rest } = p.info;
        dispatch({ type: 'updateProject', id: p.id, patch: { info: { ...rest, [name]: v } } });
      }
    }
  };
  const remove = (p) => {
    const n = itemsOf(p.id).length;
    dispatch({ type: 'removeProject', id: p.id });
    notify(`${p.name}을(를) 지웠어요${n ? ` · 딸린 ITEM ${n}개도 함께` : ''}`, { label: '되돌리기', run: () => dispatch({ type: 'restoreProject' }) });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Product 정보</h1>
          <p>Product의 기준 공정 · FEOL Concept · BEOL Option과 정보(Code · 고객 등)를 한곳에서 관리해요. 공정이나 Option을 바꾸면 Set List가 그에 맞게 다시 담겨요. 일정(GDS · MTO 조건)은 Product 탭에서 정해요.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn primary" onClick={() => { dispatch({ type: 'addProject', kind: 'product' }); notify('Product를 추가했어요 · 기준 공정 Set List 전체가 담겼어요'); }}><Icon name="plus" size={15} /> Product</button>
        </div>
      </div>

      <section className="panel">
        <h2>
          <span className="layer-sum">Product {products.length}개</span>
          <span className="small muted">열 이름을 눌러 바꾸고, 마지막 칸에 이름을 넣어 열을 추가해요</span>
        </h2>
        {products.length ? (
          <div className="table-wrap sheet-wrap">
            <table className="data-table sheet pinfo">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>기준 공정</th>
                  <th>FEOL Concept</th>
                  <th>BEOL Option</th>
                  {cols.map((c) => (
                    <th key={c} className="spec-h">
                      <span className="spec-h-in">
                        <input className="col-name" defaultValue={c} onBlur={(e) => e.target.value.trim() !== c && renameCol(c, e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label={`정보 열 ${c}`} />
                        <button type="button" className="col-del" onClick={() => dispatch({ type: 'productColumns', columns: cols.filter((x) => x !== c) })} title="열 숨기기" aria-label={`${c} 열 숨기기`}><Icon name="close" size={11} /></button>
                      </span>
                    </th>
                  ))}
                  <th className="spec-add"><span className="spec-h-in"><input className="col-name" value={newCol} placeholder="+ 정보 열" onChange={(e) => setNewCol(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCol()} aria-label="새 정보 열" /></span></th>
                  <th className="r">Set List</th>
                  <th className="r">ITEM</th>
                  <th>최종 MTO</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const proc = state.processes.find((x) => x.id === p.processId);
                  const opts = beolOptionsOf(proc);
                  const c = calcs[p.id];
                  const its = itemsOf(p.id);
                  return (
                    <tr key={p.id}>
                      <td><input className="input cell layer-in" value={p.name} onChange={(e) => upd(p.id, { name: e.target.value })} aria-label="Product 이름" /></td>
                      <td>
                        <select className="input cell" value={p.processId || ''} onChange={(e) => {
                          dispatch({ type: 'setProcess', id: p.id, processId: e.target.value || null });
                          notify(`${p.name}: 기준 공정을 바꿨어요 · Set List를 새로 담았어요`, { label: '되돌리기', run: () => dispatch({ type: 'undoProcess' }) });
                        }} aria-label="기준 공정">
                          <option value="">직접 입력</option>
                          {state.processes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </td>
                      <td>
                        {proc ? (
                          <select className={`input cell ${feolOptionOf(proc, p.feolOption).por ? 'por-sel' : ''}`} value={feolOptionOf(proc, p.feolOption).id} onChange={(e) => {
                            const o = feolOptionsOf(proc).find((x) => x.id === e.target.value);
                            dispatch({ type: 'setFeolOption', id: p.id, option: e.target.value });
                            notify(`${p.name}: FEOL ${o?.name}로 바꿨어요 · BEOL은 그대로, FEOL Layer만 바뀌었어요${its.length ? ` · ITEM ${its.length}개 확인 필요` : ''}`);
                          }} aria-label="FEOL Concept">
                            {activeFeolOptionsOf(proc, feolOptionOf(proc, p.feolOption).id).map((o) => <option key={o.id} value={o.id}>{o.name}{o.por && o.name !== 'POR' ? ' (POR)' : ''}</option>)}
                          </select>
                        ) : <span className="muted small">-</span>}
                      </td>
                      <td>
                        {proc ? (
                          <select className="input cell" value={p.beolOption || ''} onChange={(e) => {
                            dispatch({ type: 'setBeolOption', id: p.id, option: e.target.value });
                            notify(`${p.name}: BEOL ${e.target.value}로 바꿨어요 · FEOL은 그대로, BEOL Layer만 바뀌었어요${its.length ? ` · ITEM ${its.length}개 확인 필요` : ''}`);
                          }} aria-label="BEOL Option">
                            {!opts.includes(p.beolOption) && <option value="">{p.beolOption || '고르기'}</option>}
                            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : <span className="muted small">-</span>}
                      </td>
                      {cols.map((col) => (
                        <td key={col}><input className="input cell spec-in" value={p.info?.[col] ?? ''} onChange={(e) => upd(p.id, { info: { [col]: e.target.value } })} aria-label={`${p.name} ${col}`} /></td>
                      ))}
                      <td />
                      <td className="num r"><button type="button" className="link-btn" onClick={() => go('layers', p.id)}>{p.layers.length}장</button></td>
                      <td className="num r">{its.length ? <span title={its.map((x) => x.name).join(', ')}><Pill tone="leave">{its.length}</Pill></span> : <span className="muted">-</span>}</td>
                      <td className="num">{c?.result ? <button type="button" className="link-btn" onClick={() => go('overview', p.id)}>{fmtShort(c.result.finalMto)}</button> : <span className="muted small">{c?.issues ? `확인 ${c.issues.length}` : '-'}</span>}</td>
                      <td><div className="row-act">
                        <button type="button" className="icon-btn sm" onClick={() => remove(p)} title="Product 지우기" aria-label="지우기"><Icon name="trash" size={14} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">아직 Product가 없어요. [Product]로 추가하세요.</p>
        )}
      </section>
    </div>
  );
}
