// Revision 기본 정보: MTO Target · 요청자 · Comment (바로 저장)
import { fmtShort, diffDays } from '../lib/dates.js';

export default function RevisionInfo({ project, result, dispatch }) {
  const meta = project.meta || {};
  const set = (patch) => dispatch({ type: 'updateProject', id: project.id, patch: { meta: { ...meta, ...patch } } });
  const gap = result && meta.target ? diffDays(meta.target, result.finalMto) : null;
  return (
    <section className="panel rv-info">
      <label className="field rv-target">
        <span>MTO Target</span>
        <input type="date" className="input num" value={meta.target || ''} onChange={(e) => set({ target: e.target.value })} />
      </label>
      <span className="rv-gap">
        {gap == null ? <span className="small muted">예상 MTO {result ? fmtShort(result.finalMto) : '-'}</span> : (
          <span className={`rv-gap-in ${gap >= 0 ? 'ok' : 'late'}`}>
            <span className="small">예상 {fmtShort(result.finalMto)}</span>
            <b className="num">{gap >= 0 ? `여유 ${gap}일` : `${-gap}일 늦음`}</b>
          </span>
        )}
      </span>
      <label className="field rv-req">
        <span>요청자</span>
        <input className="input" value={meta.requester || ''} placeholder="이름" onChange={(e) => set({ requester: e.target.value })} />
      </label>
      <label className="field rv-comment">
        <span>Comment</span>
        <input className="input" value={meta.comment || ''} placeholder="" onChange={(e) => set({ comment: e.target.value })} />
      </label>
    </section>
  );
}
