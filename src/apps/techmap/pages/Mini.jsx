// App Mode (휴대폰 폭 요약): 최근 Request 묶음 상태 · 검토할 것 · 바로 올리기
import { useRef, useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { STATUS, TYPE_LABEL } from '../lib/view.js';
import { uploadRequestFile } from './UploadPage.jsx';

export default function Mini({ store, batch, baseline, res, expand, notify, select }) {
  const inputRef = useRef(null);
  const [err, setErr] = useState('');
  const latest = store.baselines[store.baselines.length - 1];
  const take = async (file) => {
    if (!file) return;
    setErr('');
    try {
      const b = await uploadRequestFile(file, latest.id, store);
      select(b.id);
      notify(`Request ${b.requests.length}건 검토 시작`);
    } catch (e) {
      setErr(e.message);
    }
  };
  const todo = res ? res.items.filter((i) => i.status !== 'READY') : [];
  return (
    <div className="mini tm-mini fade-in">
      {store.batches.length > 1 && (
        <div className="tm-mini-pick" role="tablist" aria-label="Request 묶음">
          {store.batches.slice(0, 6).map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={b.id === batch?.id} className="tm-chip" onClick={() => select(b.id)}>
              # {b.name}
            </button>
          ))}
        </div>
      )}

      {batch && res ? (
        <section className="mini-card">
          <div className="mini-card-head">
            <h3># {batch.name}</h3>
            {batch.promoted ? <Pill tone="good">{batch.promoted} 반영</Pill> : <Pill tone="accent">기준 {baseline.id}</Pill>}
          </div>
          <div className="tm-mini-nums">
            <div><b className="num tone-good">{res.counts.READY}</b><span>READY</span></div>
            <div><b className="num tone-warn">{res.counts.NEEDS_REVIEW}</b><span>검토 필요</span></div>
            <div><b className="num tone-bad">{res.counts.ERROR}</b><span>ERROR</span></div>
            <div><b className="num">{res.applied.length}</b><span>반영 예정</span></div>
          </div>
          {todo.length > 0 ? (
            <ul className="tm-mini-list">
              {todo.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <span className="tm-rid">{i.id}</span>
                  <span className="tm-mini-lpp">{TYPE_LABEL[i.type] || i.type} · {i.lpp}</span>
                  <Pill tone={STATUS[i.status].tone}>{i.included ? '승인' : STATUS[i.status].label}</Pill>
                  <span className="tm-mini-msg small muted">{(i.checks.find((c) => c.level !== 'info') || i.checks[0])?.msg}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">사람이 볼 항목이 없어요. 모두 READY예요.</p>
          )}
          <div className="mini-btns tm-mini-btns">
            <button type="button" className="btn primary" onClick={() => expand({ page: 'batch', id: batch.id })}><Icon name="windowMode" size={15} /> 검토 · 파일 받기</button>
          </div>
        </section>
      ) : (
        <section className="mini-card">
          <div className="mini-card-head"><h3>Techmap</h3></div>
          <p className="small muted">Site Request 엑셀을 올리면 techfile · layermap · drf를 같이 검토하고, 바뀔 줄을 보여 줘요.</p>
        </section>
      )}

      <section className="mini-card">
        <div className="mini-card-head">
          <h3>Request 올리기</h3>
          <span className="small muted">기준 {latest?.id}</span>
        </div>
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}><Icon name="plus" size={15} /> 엑셀 고르기 (.xlsx · .csv)</button>
        <input ref={inputRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => { take(e.target.files[0]); e.target.value = ''; }} />
        {err && <p className="small tone-bad">{err}</p>}
        <div className="tm-mini-links">
          <a href="/techmap/techmap_request_template.xlsx" download className="small">빈 양식</a>
          <a href="/techmap/techmap_request_sample.xlsx" download className="small">예시 9건</a>
          <button type="button" className="link-btn small" onClick={() => expand({ page: 'baseline', id: latest?.id })}>baseline {latest?.id} 보기</button>
        </div>
      </section>
    </div>
  );
}
