// Revision Reference: 이 Revision이 무엇을 기준으로 하는지 — 기존 Product의 Layer 또는 다른 Revision.
// 고른 Reference가 아래 Layer 고르기의 출처가 된다.
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort } from '../lib/dates.js';
import { CHANGE_KINDS, changesGds } from './RevisionChanges.jsx';
import { KindTag, projectStatus } from './ProjectBar.jsx';

/** Reference 대상 (Product 또는 다른 Revision). 정하지 않았으면 딸린 Product */
export function referenceOf(state, project) {
  const ref = project.reference || {};
  const find = (id, kind) => state.projects.find((p) => p.id === id && p.kind === kind && p.id !== project.id);
  if (ref.kind === 'revision') return find(ref.id, 'revision') || null;
  return find(ref.id, 'product') || find(project.parentId, 'product') || null;
}

export default function RevisionReference({ state, dispatch, project, calcs }) {
  const ref = project.reference || {};
  const kind = ref.kind === 'revision' ? 'revision' : 'product';
  const target = referenceOf(state, project);
  const products = state.projects.filter((p) => p.kind === 'product');
  const revisions = state.projects.filter((p) => p.kind === 'revision' && p.id !== project.id);
  const save = (patch) => dispatch({ type: 'updateProject', id: project.id, patch: { reference: { ...ref, kind, ...patch } } });
  const nameOf = (id) => products.find((p) => p.id === id)?.name || 'Product 없음';
  const st = target ? projectStatus(calcs[target.id]) : null;

  return (
    <section className="panel ref">
      <div className="chg-title"><h2>Reference</h2></div>
      <div className="ref-grid">
        <div className="ref-pick">
          <div className="seg" role="group" aria-label="Reference 종류">
            <button type="button" aria-pressed={kind === 'product'} onClick={() => save({ kind: 'product', id: ref.kind === 'product' ? ref.id : project.parentId })}>Product</button>
            <button type="button" aria-pressed={kind === 'revision'} onClick={() => save({ kind: 'revision', id: ref.kind === 'revision' ? ref.id : revisions.find((r) => r.parentId === project.parentId)?.id || revisions[0]?.id })} disabled={!revisions.length}>Revision</button>
          </div>
          {kind === 'product' ? (
            <label className="field">
              <span>Product</span>
              <select className="input" value={target?.id || ''} onChange={(e) => save({ id: e.target.value })}>
                {!target && <option value="">Product 고르기</option>}
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.layers.length}장</option>)}
              </select>
            </label>
          ) : (
            <label className="field">
              <span>Revision</span>
              <select className="input" value={target?.id || ''} onChange={(e) => save({ id: e.target.value })}>
                {!target && <option value="">Revision 고르기</option>}
                {products.map((pr) => {
                  const its = revisions.filter((r) => r.parentId === pr.id);
                  return its.length ? (
                    <optgroup key={pr.id} label={pr.name}>
                      {its.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.layers.length}장</option>)}
                    </optgroup>
                  ) : null;
                })}
                {revisions.filter((r) => !products.some((p) => p.id === r.parentId)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}
          <textarea className="input" rows={2} value={ref.note || ''} placeholder="메모" onChange={(e) => save({ note: e.target.value })} aria-label="Reference 메모" />
        </div>
        <div className="ref-card">
          {target ? (
            <>
              <div className="ref-card-h">
                <KindTag kind={target.kind} />
                <b>{target.name}</b>
                {target.kind === 'revision' && <span className="small muted">{nameOf(target.parentId)}</span>}
                <span className={`pb-st ${st.tone} num`}>{st.text}</span>
              </div>
              <div className="ref-kv small"><span className="muted">Layer</span><span>{target.layers.length}장</span></div>
              {target.kind === 'revision' && (
                <>
                  <div className="ref-kv small"><span className="muted">GDS</span><span className="num">{fmtShort(changesGds(target.changes) || target.gds)}</span></div>
                  <div className="ref-kv small">
                    <span className="muted">변경점</span>
                    <span className="ref-chg">
                      {CHANGE_KINDS.filter(([k]) => target.changes?.[k]?.on).map(([k, label]) => <span key={k} className={`ref-chip ${k}`}>{label}</span>)}
                      {!CHANGE_KINDS.some(([k]) => target.changes?.[k]?.on) && <span className="muted">없음</span>}
                    </span>
                  </div>
                  {target.reference?.note && <div className="ref-note small">“{target.reference.note}”</div>}
                </>
              )}
            </>
          ) : (
            <div className="small muted"><Icon name="layers" size={14} /> -</div>
          )}
        </div>
      </div>
    </section>
  );
}
