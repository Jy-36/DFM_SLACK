// Request 묶음 검토: 요약 · Request 카드(검토 스레드) · 파일 변경 · 메모 · 출력
import { useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import RequestCard from '../components/RequestCard.jsx';
import DiffView from '../components/DiffView.jsx';
import { bundleZip, reviewCsv, saveFile } from '../lib/report.js';

const FILTERS = [
  ['ALL', '전체'],
  ['READY', 'READY'],
  ['NEEDS_REVIEW', '검토 필요'],
  ['ERROR', 'ERROR'],
];

export default function BatchPage({ batch, baseline, res, store, notify, go }) {
  const [view, setView] = useState('thread');
  const [filter, setFilter] = useState('ALL');
  const [memo, setMemo] = useState('');
  const { actions } = store;
  const locked = !!batch.promoted;
  const c = res.counts;
  const items = res.items.filter((i) => filter === 'ALL' || i.status === filter);
  const notes = (batch.log || []).filter((l) => l.kind === 'comment');

  const toggle = (id, on) => {
    actions.setInclude(batch, res.applied, id, on);
    notify(`${id} ${on ? '반영 승인' : '반영 제외'}`);
  };
  const download = () => {
    saveFile(bundleZip(batch, baseline, res), `techmap_${batch.id}.zip`, 'application/zip');
    actions.log(batch, `수정 파일 묶음 저장 (반영 ${res.applied.length}건)`);
    notify('수정 파일 묶음을 다운로드 폴더에 저장했어요');
  };
  const promote = () => {
    if (!window.confirm(`${res.applied.length}건을 반영한 파일을 새 baseline으로 등록할까요?\n기존 ${baseline.id}는 그대로 남아요.`)) return;
    const b = actions.promote(batch, res, res.applied);
    notify(`새 baseline ${b.id} 등록`);
  };
  const sendMemo = () => {
    const t = memo.trim();
    if (!t) return;
    actions.comment(batch, t);
    setMemo('');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1># {batch.name}</h1>
          <p>
            기준 {baseline.id} · {baseline.label} · 업로드 {batch.created}
            {locked && <> · <b>{batch.promoted}</b>로 반영 완료</>}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn primary" onClick={download}><Icon name="download" size={15} /> 수정 파일 묶음 (.zip)</button>
          <button type="button" className="btn" onClick={() => saveFile(reviewCsv(batch, baseline, res), `techmap_review_${batch.id}.csv`, 'text/csv;charset=utf-8')}>리포트 CSV</button>
          <button type="button" className="btn" onClick={promote} disabled={locked || !res.applied.length}>
            <Icon name="check" size={15} /> {locked ? `${batch.promoted}로 반영됨` : `새 baseline으로 반영 (${res.applied.length})`}
          </button>
        </div>
      </div>

      <section className="panel stats tm-stats">
        <div className="stat"><span className="label">READY</span><span className="value tone-good">{c.READY}</span><span className="foot">기본 반영</span></div>
        <div className="stat"><span className="label">검토 필요</span><span className="value tone-warn">{c.NEEDS_REVIEW}</span><span className="foot">체크해야 반영</span></div>
        <div className="stat"><span className="label">ERROR</span><span className="value tone-bad">{c.ERROR}</span><span className="foot">반영 불가</span></div>
        <div className="stat"><span className="label">반영 예정</span><span className="value">{res.applied.length}<small>/ {res.items.length}</small></span><span className="foot">{res.applied.join(', ') || '-'}</span></div>
      </section>

      <div className="tm-bar">
        <div className="seg" role="group" aria-label="보기">
          <button type="button" aria-pressed={view === 'thread'} onClick={() => setView('thread')}>검토 스레드</button>
          <button type="button" aria-pressed={view === 'diff'} onClick={() => setView('diff')}>파일 변경</button>
        </div>
        {view === 'thread' && (
          <div className="seg" role="group" aria-label="상태 거르기">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label} <span className="num">{k === 'ALL' ? res.items.length : c[k]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'diff' ? (
        <DiffView res={res} />
      ) : (
        <div className="tm-thread">
          {items.length ? items.map((it) => <RequestCard key={it.id} item={it} colors={res.colors} locked={locked} onToggle={toggle} />) : <p className="empty">이 상태의 Request가 없어요.</p>}
        </div>
      )}

      <section className="panel">
        <h2>검토 메모 · 활동 <span className="small muted">이 PC에만 저장</span></h2>
        <div className="tm-memo">
          <input className="input" value={memo} placeholder="판단 근거, 담당자 확인 내용 등을 남겨 두세요 · Enter" onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && sendMemo()} />
          <button type="button" className="btn" onClick={sendMemo}>남기기</button>
        </div>
        <ul className="tm-log">
          {[...(batch.log || [])].reverse().slice(0, 40).map((l, i) => (
            <li key={i} className={l.kind}>
              <span className="num muted">{l.at.slice(5)}</span>
              {l.kind === 'comment' ? <b>{l.text}</b> : <span>{l.text}</span>}
            </li>
          ))}
        </ul>
        {notes.length === 0 && <p className="small muted">메모는 리포트에는 들어가지 않고, 이 Request 묶음 활동 기록에 남아요.</p>}
      </section>

      <div className="tm-foot-actions">
        <button type="button" className="btn ghost" onClick={() => go({ page: 'upload' })}><Icon name="plus" size={15} /> 고친 엑셀 다시 올리기</button>
        <button type="button" className="btn ghost" onClick={() => { if (window.confirm(`'${batch.name}' 검토 기록을 지울까요? baseline은 남아요.`)) { actions.deleteBatch(batch.id); go({ page: 'home' }); } }}>
          <Icon name="trash" size={15} /> 이 묶음 지우기
        </button>
        <Pill tone="neutral">{batch.file}</Pill>
      </div>
    </div>
  );
}
