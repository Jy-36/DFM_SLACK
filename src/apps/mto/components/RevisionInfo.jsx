// Revision 기본 정보: MTO Target · 요청자 · Comment. 평소엔 보기, [수정] → 저장 (live면 바로 반영)
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort, diffDays } from '../lib/dates.js';
import DateField from './DateField.jsx';

export function TargetGap({ target, result }) {
  if (!result) return <span className="small muted">예상 MTO -</span>;
  if (!target) return <span className="small muted">예상 MTO {fmtShort(result.finalMto)}</span>;
  const gap = diffDays(target, result.finalMto);
  return (
    <span className={`rv-gap-in ${gap >= 0 ? 'ok' : 'late'}`}>
      <span className="small">예상 {fmtShort(result.finalMto)}</span>
      <b className="num">{gap >= 0 ? `여유 ${gap}일` : `${-gap}일 늦음`}</b>
    </span>
  );
}

export default function RevisionInfo({ project, result, dispatch, live }) {
  const meta = project.meta || {};
  const [draft, setDraft] = useState(null);
  const editing = live || !!draft;
  const m = live ? meta : draft || meta;
  const set = (patch) => (live ? dispatch({ type: 'updateProject', id: project.id, patch: { meta: { ...meta, ...patch } } }) : setDraft({ ...m, ...patch }));
  const save = () => {
    dispatch({ type: 'updateProject', id: project.id, patch: { meta: draft } });
    setDraft(null);
  };

  if (!editing) {
    return (
      <section className="panel rv-info view">
        <div className="rv-cell">
          <span className="rv-k">MTO Target</span>
          <span className="rv-v num">{meta.target ? fmtShort(meta.target) : <span className="muted">-</span>}</span>
        </div>
        <div className="rv-cell"><TargetGap target={meta.target} result={result} /></div>
        <div className="rv-cell"><span className="rv-k">요청자</span><span className="rv-v">{meta.requester || <span className="muted">-</span>}</span></div>
        <div className="rv-cell grow"><span className="rv-k">Comment</span><span className="rv-v">{meta.comment || <span className="muted">-</span>}</span></div>
        <button type="button" className="btn small-btn rv-edit" onClick={() => setDraft({ ...meta })}><Icon name="settings" size={13} /> 수정</button>
      </section>
    );
  }
  return (
    <section className={`panel rv-info ${live ? 'live' : 'editing'}`}>
      <label className="field rv-target">
        <span>MTO Target</span>
        <DateField value={m.target} onChange={(target) => set({ target })} label="MTO Target" />
      </label>
      {!live && <span className="rv-gap"><TargetGap target={m.target} result={result} /></span>}
      <label className="field rv-req">
        <span>요청자</span>
        <input className="input" value={m.requester || ''} placeholder="이름" onChange={(e) => set({ requester: e.target.value })} />
      </label>
      <label className="field rv-comment">
        <span>Comment</span>
        <input className="input" value={m.comment || ''} onChange={(e) => set({ comment: e.target.value })} />
      </label>
      {!live && (
        <span className="rv-actions">
          <button type="button" className="btn small-btn ghost" onClick={() => setDraft(null)}>취소</button>
          <button type="button" className="btn small-btn primary" onClick={save}>저장</button>
        </span>
      )}
    </section>
  );
}
