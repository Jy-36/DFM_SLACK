// 다른 Process Master와 비교: 이름이 달라도 기능키가 같으면 같은 목적 → GDS layer/datatype이 같아야 한다
import { useMemo, useState } from 'react';
import { Pill } from '../../../shared/ui.jsx';
import { crossMaster } from '../lib/registry.js';
import { techSetOf } from '../lib/revision.js';

const STATUS = {
  mismatch: ['번호 다름', 'bad'],
  onlyA: ['이쪽에만', 'leave'],
  onlyB: ['저쪽에만', 'plan'],
  same: ['같음', 'good'],
};

export default function ComparePage({ ws, proc, go }) {
  const others = ws.processes.filter((p) => p.id !== proc.id);
  const [otherId, setOther] = useState(others[0]?.id);
  const [filter, setFilter] = useState('diff');
  const other = others.find((p) => p.id === otherId);
  const a = techSetOf(proc.master.files);
  const b = other ? techSetOf(other.master.files) : null;
  const cmp = useMemo(() => (a?.ts && b?.ts ? crossMaster({ ts: a.ts, classes: proc.classes }, { ts: b.ts, classes: other.classes }) : null), [a, b, proc.classes, other]);
  if (!others.length) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>Master 비교</h1><p>비교할 다른 Process가 없어요.</p></div></div>
        <button type="button" className="btn primary" onClick={() => go({ page: 'process-new' })}>Process 추가</button>
      </div>
    );
  }
  const rows = cmp ? cmp.rows.filter((r) => filter === 'all' || (filter === 'diff' ? r.status !== 'same' : r.status === filter)) : [];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{proc.id} ↔ {other?.id} Master 비교</h1>
          <p>기능키(목적) 기준으로 GDS layer/datatype을 맞춰 봐요. 이름이 다른 같은 Layer는 [분류 · 기능키]에서 기능키를 같게 지정하세요.</p>
        </div>
        <div className="head-actions">
          <div className="seg" role="group" aria-label="비교 대상">
            {others.map((p) => <button key={p.id} type="button" aria-pressed={p.id === otherId} onClick={() => setOther(p.id)}>{p.id}</button>)}
          </div>
          <button type="button" className="btn" onClick={() => go({ page: 'classes' })}>분류 · 기능키</button>
        </div>
      </div>
      {cmp && (
        <>
          <section className="panel stats tm-stats">
            <div className="stat"><span className="label">번호 다름</span><span className={`value ${cmp.counts.mismatch ? 'tone-bad' : 'tone-good'}`}>{cmp.counts.mismatch}</span><span className="foot">같은 기능 · 다른 GDS</span></div>
            <div className="stat"><span className="label">같음</span><span className="value tone-good">{cmp.counts.same}</span></div>
            <div className="stat"><span className="label">{proc.id}에만</span><span className="value">{cmp.counts.onlyA}</span></div>
            <div className="stat"><span className="label">{other.id}에만</span><span className="value">{cmp.counts.onlyB}</span><span className="foot">{cmp.counts.clash ? `번호 겹침 ${cmp.counts.clash}` : ''}</span></div>
          </section>
          <div className="tm-bar">
            <div className="seg" role="group" aria-label="거르기">
              {[['diff', '다른 것만'], ['mismatch', '번호 다름'], ['onlyA', `${proc.id}에만`], ['onlyB', `${other.id}에만`], ['all', '전체']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
          </div>
          <section className="panel">
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>기능키</th><th>{proc.id} LPP</th><th>{proc.id} GDS</th><th>{other.id} LPP</th><th>{other.id} GDS</th><th>상태</th><th>참고</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="mono">{r.key}</td>
                      <td>{r.a ? <b>{r.a.layer}/{r.a.purpose}</b> : <span className="muted">-</span>}</td>
                      <td className="num">{r.a?.gds || ''}</td>
                      <td>{r.b ? <b>{r.b.layer}/{r.b.purpose}</b> : <span className="muted">-</span>}</td>
                      <td className="num">{r.b?.gds || ''}</td>
                      <td><Pill tone={STATUS[r.status][1]}>{r.status === 'onlyA' ? `${proc.id}에만` : r.status === 'onlyB' ? `${other.id}에만` : STATUS[r.status][0]}</Pill></td>
                      <td className="small muted tm-wrap">{r.clash ? `${other.id}에서 ${r.a.gds}는 ${r.clash}가 사용` : r.a && r.b && r.a.layer !== r.b.layer ? '이름 다름 · 기능키로 연결' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <p className="empty">해당하는 항목이 없어요.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
