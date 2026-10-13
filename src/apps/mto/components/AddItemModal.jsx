// 새 Revision ITEM: Concept 정보(Product · 이름 · Target · 요청자 · Comment · Changes · Reference · Layer)를 한 번에 넣고 만든다.
// 창 안에서는 임시 ITEM을 고치고, [만들기]를 눌러야 실제로 추가된다.
import { useMemo, useState } from 'react';
import { Modal } from './Modal.jsx';
import DateField from './DateField.jsx';
import RevisionChanges, { changesGds } from './RevisionChanges.jsx';
import RevisionReference, { referenceOf } from './RevisionReference.jsx';
import { ItemLayerPicker } from '../pages/ItemLayerList.jsx';
import { computeProject } from '../lib/projects.js';

export default function AddItemModal({ state, dispatch, calcs, onClose, onCreated, defaultParent }) {
  const products = state.projects.filter((p) => p.kind === 'product');
  const [d, setD] = useState(() => ({ id: '__draft', kind: 'revision', name: '', parentId: defaultParent || products[0]?.id || null, gds: '', layers: [], override: {}, step1Tat: null, meta: {}, changes: {}, reference: {}, issues: [], links: [] }));
  const parent = products.find((p) => p.id === d.parentId);
  const draft = useMemo(() => ({ ...d, processId: parent?.processId || null, gds: changesGds(d.changes) || '' }), [d, parent]);
  const calc = useMemo(() => computeProject(draft, state.config, state.processes), [draft, state.config, state.processes]);
  const n = state.projects.filter((x) => x.kind === 'revision' && x.parentId === d.parentId).length + 1;
  const autoName = parent ? `${parent.name} REV${String(n).padStart(2, '0')}` : '';
  const dupName = state.projects.some((x) => x.kind === 'revision' && x.name === (d.name.trim() || autoName));
  // 임시 ITEM에만 반영 (Runset STEP 목록은 공용이라 바로 저장)
  const fake = (a) => {
    if (a.type === 'updateProject') setD((x) => ({ ...x, ...a.patch }));
    else if (a.type === 'layers') setD((x) => ({ ...x, layers: a.layers }));
    else if (a.type === 'runsetSteps') dispatch(a);
  };
  const meta = d.meta;
  const setMeta = (patch) => setD((x) => ({ ...x, meta: { ...x.meta, ...patch } }));
  const create = () => {
    const gds = changesGds(d.changes);
    dispatch({
      type: 'addProject',
      kind: 'revision',
      patch: { parentId: d.parentId, ...(d.name.trim() ? { name: d.name.trim() } : {}), ...(gds ? { gds } : {}), meta: d.meta, changes: d.changes, reference: d.reference, layers: d.layers, issues: [], links: [] },
    });
    onCreated?.(d.name.trim() || autoName);
    onClose();
  };

  return (
    <Modal
      title="새 Revision ITEM"
      width={980}
      onClose={onClose}
      footer={
        <>
          <span className="small muted ai-sum">{parent ? `${parent.name} · ${d.name.trim() || autoName}` : 'Product를 고르세요'} · Layer {d.layers.length}장{draft.gds ? ` · GDS ${draft.gds.slice(5).replace('-', '/')}` : ''}</span>
          <button type="button" className="btn ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn primary" disabled={!parent || dupName} onClick={create}>만들기</button>
        </>
      }
    >
      <div className="ai-body">
        <section className="panel ai-basic">
          <label className="field">
            <span>Product</span>
            <select className={`input ${parent ? '' : 'bad'}`} value={d.parentId || ''} onChange={(e) => setD((x) => ({ ...x, parentId: e.target.value, layers: [], reference: {} }))}>
              {!parent && <option value="">Product 고르기</option>}
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>ITEM 이름</span>
            <input className={`input ${dupName ? 'bad' : ''}`} value={d.name} placeholder={autoName} onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))} />
          </label>
          <label className="field">
            <span>MTO Target</span>
            <DateField value={meta.target} onChange={(target) => setMeta({ target })} label="MTO Target" />
          </label>
          <label className="field">
            <span>요청자</span>
            <input className="input" value={meta.requester || ''} placeholder="이름" onChange={(e) => setMeta({ requester: e.target.value })} />
          </label>
          <label className="field ai-comment">
            <span>Comment</span>
            <input className="input" value={meta.comment || ''} onChange={(e) => setMeta({ comment: e.target.value })} />
          </label>
        </section>
        {parent && (
          <>
            <RevisionChanges live project={draft} state={state} dispatch={fake} />
            <RevisionReference live state={state} dispatch={fake} project={draft} calcs={calcs} />
            <ItemLayerPicker state={state} dispatch={fake} project={draft} calc={calc} go={() => {}} notify={() => {}} from={referenceOf(state, draft)}
              title={<>Layer List <span className="small muted">{referenceOf(state, draft)?.name || ''}</span></>} />
          </>
        )}
      </div>
    </Modal>
  );
}
