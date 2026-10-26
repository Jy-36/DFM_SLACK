// App Mode (휴대폰 폭 요약): 지금 작업 · 사람이 볼 것 · 요청 바로 올리기 · Process 번호 점검
import { useRef } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { readRequestFile } from '../lib/requests.js';
import { addRequests } from '../lib/workspace.js';
import { STATUS, TYPE_LABEL, pname } from '../lib/view.js';

export default function Mini({ ws, store, rev, c, expand, notify, select }) {
  const inputRef = useRef(null);
  const open = ws.revisions.filter((r) => r.status !== 'approved');
  const take = async (file) => {
    if (!file || !rev) return;
    try {
      const reqs = await readRequestFile(file.name, new Uint8Array(await file.arrayBuffer()));
      store.update((w) => addRequests(w, rev.id, reqs, file.name));
      notify(`${rev.folder}에 요청 ${reqs.length}건`);
    } catch (e) {
      notify(e.message);
    }
  };
  const todo = c && !c.error ? c.res.items.filter((i) => i.status !== 'READY') : [];
  const errs = c && !c.error ? c.checks.filter((x) => x.level === 'error') : [];
  return (
    <div className="mini tm-mini fade-in">
      {open.length > 1 && (
        <div className="tm-mini-pick" role="tablist" aria-label="작업">
          {open.slice(0, 6).map((r) => (
            <button key={r.id} type="button" role="tab" aria-selected={r.id === rev?.id} className="tm-chip" onClick={() => select(r.id)}>{r.kind === 'dk' ? r.ver : `${r.process} Master`}</button>
          ))}
        </div>
      )}
      {rev && c && !c.error ? (
        <section className="mini-card">
          <div className="mini-card-head">
            <h3>{pname(ws, rev.process)} · {rev.kind === 'dk' ? rev.dk : 'MASTER'}</h3>
            <Pill tone={rev.status === 'approved' ? 'good' : 'warn'}>{rev.status === 'approved' ? '승인' : '작업중'}</Pill>
          </div>
          <span className="mono small muted tm-mini-folder">{rev.folder}</span>
          <div className="tm-mini-nums">
            <div><b className="num tone-good">{c.counts.READY}</b><span>READY</span></div>
            <div><b className="num tone-warn">{c.counts.NEEDS_REVIEW}</b><span>검토 필요</span></div>
            <div><b className="num tone-bad">{c.counts.ERROR}</b><span>ERROR</span></div>
            <div><b className={`num ${errs.length ? 'tone-bad' : ''}`}>{errs.length}</b><span>점검 ERROR</span></div>
          </div>
          {todo.length > 0 && (
            <ul className="tm-mini-list">
              {todo.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <span className="tm-rid">{i.id}</span>
                  <span className="tm-mini-lpp">{TYPE_LABEL[i.type] || i.type} · {i.optionOp ? `${i.fields.option} ${i.fields.layer}` : i.lpp}</span>
                  <Pill tone={STATUS[i.status].tone}>{i.included ? '승인' : STATUS[i.status].label}</Pill>
                  <span className="tm-mini-msg small muted">{(i.checks.find((x) => x.level !== 'info') || i.checks[0])?.msg}</span>
                </li>
              ))}
            </ul>
          )}
          {errs.slice(0, 2).map((x, k) => <p key={k} className="small tone-bad">{x.scope} · {x.msg}</p>)}
          <div className="mini-btns tm-mini-btns">
            <button type="button" className="btn primary" onClick={() => expand({ page: 'rev', id: rev.id })}><Icon name="windowMode" size={15} /> 검토 · 출력</button>
            {rev.status !== 'approved' && <button type="button" className="btn" onClick={() => inputRef.current?.click()}><Icon name="plus" size={15} /> 요청</button>}
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.csv,.json" hidden onChange={(e) => { take(e.target.files[0]); e.target.value = ''; }} />
        </section>
      ) : (
        <section className="mini-card">
          <div className="mini-card-head"><h3>Techmap</h3></div>
          <p className="small muted">진행 중인 작업이 없어요. Window Mode에서 새 작업을 만드세요.</p>
          <button type="button" className="btn primary" onClick={() => expand({ page: 'new' })}><Icon name="plus" size={15} /> 새 작업</button>
        </section>
      )}
      <section className="mini-card">
        <div className="mini-card-head"><h3>노드</h3></div>
        <div className="tm-mini-links">
          {ws.processes.map((p) => (
            <button key={p.id} type="button" className="tm-chip" onClick={() => expand({ page: 'registry', proc: p.id })}>{p.name}{p.master ? '' : ' (미등록)'}</button>
          ))}
        </div>
      </section>
    </div>
  );
}
