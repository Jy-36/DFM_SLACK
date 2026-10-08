// 묶음 고르기: Product · Revision 칩 목록 + 추가 · 이름 바꾸기 · 복제 · 삭제 · 순서
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort } from '../lib/dates.js';

export function KindTag({ kind }) {
  return <span className={`kind-tag ${kind}`}>{kind === 'revision' ? 'Rev' : 'P'}</span>;
}

export function projectStatus(calc) {
  if (calc.result) return { tone: 'ok', text: `MTO ${fmtShort(calc.result.finalMto)}` };
  if (calc.issues) return { tone: 'warn', text: `확인 ${calc.issues.length}` };
  return { tone: 'none', text: 'Layer 없음' };
}

export default function ProjectBar({ state, dispatch, calcs, notify, showSettings = true }) {
  const { projects, activeId } = state;
  const p = projects.find((x) => x.id === activeId) || projects[0];
  const [editing, setEditing] = useState(false);
  const idx = projects.indexOf(p);
  const remove = () => {
    dispatch({ type: 'removeProject', id: p.id });
    notify?.(`${p.name}을(를) 지웠어요`, { label: '되돌리기', run: () => dispatch({ type: 'restoreProject' }) });
  };

  return (
    <section className="panel project-bar">
      <div className="pb-row" role="tablist" aria-label="Product · Revision">
        {projects.map((x) => {
          const st = projectStatus(calcs[x.id]);
          return (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === p.id} className={`pb-chip ${x.kind}`} onClick={() => dispatch({ type: 'select', id: x.id })}>
              <KindTag kind={x.kind} />
              <span className="pb-name">{x.name}</span>
              <span className={`pb-st ${st.tone} num`}>{st.text}</span>
            </button>
          );
        })}
        <span className="pb-add">
          <button type="button" className="btn small-btn" onClick={() => dispatch({ type: 'addProject', kind: 'product' })}><Icon name="plus" size={14} /> Product</button>
          <button type="button" className="btn small-btn" onClick={() => dispatch({ type: 'addProject', kind: 'revision' })}><Icon name="plus" size={14} /> Revision</button>
        </span>
      </div>

      {showSettings && (
        <div className="pb-settings">
          <label className="field pb-title">
            <span>{p.kind === 'revision' ? 'Revision 이름' : 'Product 이름'}</span>
            <input className="input" value={p.name} onChange={(e) => dispatch({ type: 'project', patch: { name: e.target.value } })} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} />
          </label>
          {p.kind === 'revision' && (
            <>
              <label className="field">
                <span>원래 Product <small className="muted">(참고용, 선택)</small></span>
                <input className="input" value={p.base || ''} placeholder="없어도 됨" onChange={(e) => dispatch({ type: 'project', patch: { base: e.target.value } })} />
              </label>
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
            <button type="button" className="icon-btn sm" disabled={idx === projects.length - 1} onClick={() => dispatch({ type: 'moveProject', id: p.id, dir: 1 })} title="뒤로" aria-label="뒤로"><Icon name="right" size={15} /></button>
            <button type="button" className="btn small-btn" onClick={() => dispatch({ type: 'duplicateProject', id: p.id })}><Icon name="copy" size={14} /> 복제</button>
            <button type="button" className="btn small-btn ghost danger" onClick={remove}><Icon name="trash" size={14} /> 삭제</button>
          </span>
          {editing && <span className="small muted pb-hint">이름은 바로 저장돼요</span>}
        </div>
      )}
    </section>
  );
}
