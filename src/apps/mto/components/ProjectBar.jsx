// 묶음 고르기: Product 탭은 Product 칩, Revision 탭은 Product별로 묶인 ITEM 칩 + 추가 · 이름 · 복제 · 삭제 · 순서
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort } from '../lib/dates.js';
import { activeFeolOptionsOf, beolOptionsOf, feolOptionOf, feolOptionsOf } from '../lib/process.js';

export function KindTag({ kind }) {
  return <span className={`kind-tag ${kind}`}>{kind === 'revision' ? 'ITEM' : 'P'}</span>;
}

export function projectStatus(calc) {
  if (!calc) return { tone: 'none', text: '-' };
  if (calc.result) return { tone: 'ok', text: `MTO ${fmtShort(calc.result.finalMto)}` };
  if (calc.issues) return { tone: 'warn', text: `확인 ${calc.issues.length}` };
  return { tone: 'none', text: 'Layer 없음' };
}

/** Revision ITEM 추가: 딸릴 Product를 고르고 추가 (Product가 없으면 못 만듦) */
export function AddItem({ state, dispatch, defaultParent, compact }) {
  const products = state.projects.filter((p) => p.kind === 'product');
  const [parent, setParent] = useState(defaultParent || products[0]?.id || '');
  const pid = products.some((p) => p.id === parent) ? parent : products[0]?.id;
  if (!products.length) {
    return (
      <span className="pb-add">
        <span className="small muted">Revision ITEM은 Product가 있어야 만들 수 있어요</span>
        <button type="button" className="btn small-btn" onClick={() => dispatch({ type: 'section', section: 'product' })}>Product 탭으로</button>
      </span>
    );
  }
  return (
    <span className="pb-add">
      {!compact && <span className="small muted">Product</span>}
      <select className="input pb-parent" value={pid} onChange={(e) => setParent(e.target.value)} aria-label="ITEM이 딸릴 Product">
        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" className="btn small-btn" onClick={() => dispatch({ type: 'addProject', kind: 'revision', patch: { parentId: pid } })}><Icon name="plus" size={14} /> ITEM</button>
    </span>
  );
}

export default function ProjectBar({ state, dispatch, calcs, notify, showSettings = true }) {
  const section = state.section;
  const list = state.projects.filter((x) => x.kind === section);
  const p = list.find((x) => x.id === state.activeId) || list[0];
  const products = state.projects.filter((x) => x.kind === 'product');
  const [editing, setEditing] = useState(false);
  if (!p) return null;
  const idx = list.indexOf(p);
  const children = p.kind === 'product' ? state.projects.filter((x) => x.parentId === p.id) : [];
  const remove = () => {
    dispatch({ type: 'removeProject', id: p.id });
    notify?.(`${p.name}을(를) 지웠어요${children.length ? ` · 딸린 ITEM ${children.length}개도 함께` : ''}`, { label: '되돌리기', run: () => dispatch({ type: 'restoreProject' }) });
  };
  const chip = (x) => {
    const st = projectStatus(calcs[x.id]);
    return (
      <button key={x.id} type="button" role="tab" aria-selected={x.id === p.id} className={`pb-chip ${x.kind}`} onClick={() => dispatch({ type: 'select', id: x.id })}>
        <KindTag kind={x.kind} />
        <span className="pb-name">{x.name}</span>
        <span className={`pb-st ${st.tone} num`}>{st.text}</span>
      </button>
    );
  };
  const parentOf = (x) => products.find((q) => q.id === x.parentId);
  const proc = state.processes.find((x) => x.id === p.processId);

  return (
    <section className="panel project-bar">
      {section === 'product' ? (
        <div className="pb-row" role="tablist" aria-label="Product">
          {list.map(chip)}
          <span className="pb-add">
            <button type="button" className="btn small-btn" onClick={() => dispatch({ type: 'addProject', kind: 'product' })}><Icon name="plus" size={14} /> Product</button>
          </span>
        </div>
      ) : (
        <div className="pb-groups">
          {[...products, null].map((prod) => {
            const its = list.filter((x) => (prod ? x.parentId === prod.id : !parentOf(x)));
            if (!its.length) return null;
            return (
              <div key={prod?.id || 'none'} className="pb-group" role="tablist" aria-label={prod?.name || 'Product 없음'}>
                <span className={`pb-group-h ${prod ? '' : 'warn'}`}>{prod ? prod.name : 'Product 없음'}</span>
                {its.map(chip)}
              </div>
            );
          })}
          <div className="pb-row"><AddItem state={state} dispatch={dispatch} defaultParent={p.parentId} /></div>
        </div>
      )}

      {showSettings && (
        <div className="pb-settings">
          <label className="field pb-title">
            <span>{p.kind === 'revision' ? 'ITEM 이름' : 'Product 이름'}</span>
            <input className="input" value={p.name} onChange={(e) => dispatch({ type: 'project', patch: { name: e.target.value } })} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} />
          </label>
          {p.kind === 'product' && proc && (
            <label className="field pb-opt">
              <span>FEOL Concept</span>
              <select className={`input ${feolOptionOf(proc, p.feolOption).por ? 'por-sel' : ''}`} value={feolOptionOf(proc, p.feolOption).id} onChange={(e) => {
                const o = feolOptionsOf(proc).find((x) => x.id === e.target.value);
                dispatch({ type: 'setFeolOption', option: e.target.value });
                notify?.(`FEOL ${o?.name}로 바꿨어요 · BEOL은 그대로, FEOL Layer만 바뀌었어요${children.length ? ` · ITEM ${children.length}개 확인 필요` : ''}`);
              }}>
                {activeFeolOptionsOf(proc, feolOptionOf(proc, p.feolOption).id).map((o) => <option key={o.id} value={o.id}>{o.name}{o.por && o.name !== 'POR' ? ' (POR)' : ''}</option>)}
              </select>
            </label>
          )}
          {p.kind === 'product' && proc && (
            <label className="field pb-opt">
              <span>BEOL Option</span>
              <select className="input" value={p.beolOption || ''} onChange={(e) => {
                dispatch({ type: 'setBeolOption', option: e.target.value });
                notify?.(`BEOL ${e.target.value}로 바꿨어요 · FEOL은 그대로, BEOL Layer만 바뀌었어요${children.length ? ` · ITEM ${children.length}개 확인 필요` : ''}`);
              }}>
                {!beolOptionsOf(proc).includes(p.beolOption) && <option value="">{p.beolOption || '고르기'}</option>}
                {beolOptionsOf(proc).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          )}
          {p.kind === 'product' ? (
            <label className="field pb-proc">
              <span>기준 공정</span>
              <select className="input" value={p.processId || ''} onChange={(e) => {
                const id = e.target.value || null;
                const had = p.layers.length > 0;
                dispatch({ type: 'setProcess', processId: id });
                if (had) notify?.(id ? `기준 공정을 바꿨어요 · Set List를 새 공정 전체로 담았어요${children.length ? ` · ITEM ${children.length}개는 Layer를 다시 골라 주세요` : ''}` : '직접 입력으로 바꿨어요', { label: '되돌리기', run: () => dispatch({ type: 'undoProcess' }) });
              }}>
                <option value="">직접 입력 (공정 없음)</option>
                {(state.processes || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label className="field pb-proc">
                <span>Product <small className="muted">(필수)</small></span>
                <select className={`input ${parentOf(p) ? '' : 'bad'}`} value={parentOf(p)?.id || ''} onChange={(e) => {
                  dispatch({ type: 'project', patch: { parentId: e.target.value } });
                  notify?.('Product를 바꿨어요 · 공정이 다르면 Layer를 다시 골라 주세요');
                }}>
                  {!parentOf(p) && <option value="">Product 고르기</option>}
                  {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <span className="field pb-ro">
                <span>기준 공정</span>
                <span className="small">{proc ? proc.name : '직접 입력'} <span className="muted">(Product 따라감)</span></span>
              </span>
              <label className="field pb-num">
                <span>STEP1 TAT</span>
                <div className="num-field">
                  <input className="input num" type="number" min={1} max={60} value={p.step1Tat ?? ''} placeholder={String(state.config.revisionStep1Tat)}
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                      if (v == null || (v >= 1 && v <= 60)) dispatch({ type: 'project', patch: { step1Tat: v } });
                    }} />
                  <span className="muted">일</span>
                </div>
              </label>
            </>
          )}
          <span className="pb-tools">
            <button type="button" className="icon-btn sm" disabled={idx === 0} onClick={() => dispatch({ type: 'moveProject', id: p.id, dir: -1 })} title="앞으로" aria-label="앞으로"><Icon name="left" size={15} /></button>
            <button type="button" className="icon-btn sm" disabled={idx === list.length - 1} onClick={() => dispatch({ type: 'moveProject', id: p.id, dir: 1 })} title="뒤로" aria-label="뒤로"><Icon name="right" size={15} /></button>
            <button type="button" className="btn small-btn" onClick={() => dispatch({ type: 'duplicateProject', id: p.id })}><Icon name="copy" size={14} /> 복제</button>
            <button type="button" className="btn small-btn ghost danger" onClick={remove}><Icon name="trash" size={14} /> 삭제</button>
          </span>
          {editing && <span className="small muted pb-hint">이름은 바로 저장돼요</span>}
          {p.kind === 'product' && children.length > 0 && <span className="small muted pb-hint">Revision ITEM {children.length}개: {children.map((c) => c.name).join(', ')}</span>}
        </div>
      )}
    </section>
  );
}
