// DK 버전 그래프: 정식 · exp · incr가 갈라지고 합쳐지는 흐름. 노드에서 열기 · 분기 · 합치기
import { useState } from 'react';
import { Pill } from '../../../shared/ui.jsx';
import RevGraph from '../components/RevGraph.jsx';
import { computeRevision } from '../lib/revision.js';
import { mergeInto } from '../lib/workspace.js';
import { today8 } from '../lib/version.js';

export default function GraphPage({ ws, dk, store, notify, go }) {
  const d = ws.dks.find((x) => x.id === dk);
  const revs = ws.revisions.filter((r) => r.kind === 'dk' && r.dk === dk);
  const drafts = revs.filter((r) => r.status !== 'approved');
  const [target, setTarget] = useState(drafts[0]?.id || '');
  if (!d) return <div className="page"><div className="banner">DK를 찾지 못했어요.</div></div>;
  const counts = Object.fromEntries(revs.filter((r) => r.status !== 'approved').map((r) => {
    const c = computeRevision(ws, r, store.settings);
    return [r.id, c.error ? null : c.counts];
  }));
  const branch = (r) => {
    const base = r.ver.replace(/_(exp|incr)_?\d{8}.*$/i, '');
    go({ page: 'new', kind: 'dk', ref: r.id, ver: `${base}_exp_${today8()}` });
  };
  const merge = (r) => {
    const t = ws.revisions.find((x) => x.id === target);
    if (!window.confirm(`${r.folder}의 변경(반영된 요청 · Option 예외)을 ${t.folder}에 합칠까요?\n같은 LPP를 양쪽에서 바꿨으면 합친 요청이 ERROR로 보여요.`)) return;
    try {
      const out = store.update((w) => mergeInto(w, target, r.id, store.settings));
      notify(`요청 ${out.added.length}건 합침${out.conflicts.length ? ` · Option 충돌 ${out.conflicts.length}건` : ''}`);
      if (out.conflicts.length) window.alert(out.conflicts.join('\n'));
    } catch (e) {
      notify(e.message);
    }
  };
  const kinds = new Set(revs.map((r) => (/_incr/i.test(r.ver) ? 'incr' : /_exp/i.test(r.ver) ? 'exp' : 'release')));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{dk} 버전 그래프</h1>
          <p>위가 최신. 실선은 Reference(분기), 점선은 Merge. 채운 점 = 승인, 빈 점 = 작업중. 정식 Ver는 왼쪽 줄기, exp · incr Ver는 각자 가지로 그려져요.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn primary" onClick={() => go({ page: 'new', kind: 'dk' })}>새 작업</button>
        </div>
      </div>
      <section className="panel">
        <div className="tm-graph-bar">
          <span className="small muted">작업 {revs.length} · 승인 {revs.length - drafts.length} · 작업중 {drafts.length}</span>
          <span className="tm-graph-legend">
            {kinds.has('release') && <Pill tone="accent">정식</Pill>}
            {kinds.has('exp') && <Pill tone="plan">exp</Pill>}
            {kinds.has('incr') && <Pill tone="leave">incr</Pill>}
          </span>
          {drafts.length > 0 ? (
            <label className="tm-graph-target small">
              합칠 대상
              <select className="input tm-mini-input" value={target} onChange={(e) => setTarget(e.target.value)}>
                {drafts.map((r) => <option key={r.id} value={r.id}>{r.folder}</option>)}
              </select>
              <span className="muted">→ 다른 작업의 [→ 합치기]</span>
            </label>
          ) : <span className="small muted">작업중인 작업이 없어서 합치기는 꺼져 있어요 — [분기]로 새 작업을 만드세요</span>}
        </div>
        {revs.length ? (
          <RevGraph ws={ws} dk={dk} process={d.process} target={target} counts={counts} onOpen={(id) => go({ page: 'rev', id })} onBranch={branch} onMerge={merge} />
        ) : <p className="empty">아직 작업이 없어요.</p>}
      </section>
    </div>
  );
}
