// 이슈: 한 줄에 상태 · 내용 · 담당자 · 기한. 상태 칩을 누르면 Open → 진행 → 완료 순서로 바뀐다.
// 맨 위 입력 줄에서 Enter로 바로 추가, 완료된 것은 접어 두고 필요할 때 펼친다.
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort, todayIso } from '../lib/dates.js';
import DateField from './DateField.jsx';

const STATUS = [
  ['open', 'Open'],
  ['doing', '진행'],
  ['done', '완료'],
];
const next = (s) => STATUS[(STATUS.findIndex(([k]) => k === s) + 1) % STATUS.length][0];
const iid = () => `i${Math.random().toString(36).slice(2, 8)}`;

export function openIssues(project) {
  return (project.issues || []).filter((i) => i.status !== 'done');
}

export default function RevisionIssues({ project, dispatch, notify }) {
  const issues = project.issues || [];
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [editId, setEditId] = useState(null);
  const today = todayIso();
  const set = (list) => dispatch({ type: 'updateProject', id: project.id, patch: { issues: list } });
  const upd = (id, patch) => set(issues.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const add = () => {
    const t = text.trim();
    if (!t) return;
    set([{ id: iid(), status: 'open', text: t, owner: owner.trim(), due, created: today }, ...issues]);
    setText('');
    setDue('');
  };
  const live = issues.filter((i) => i.status !== 'done');
  const done = issues.filter((i) => i.status === 'done');
  const rows = showDone ? [...live, ...done] : live;

  return (
    <section className="panel issues">
      <div className="chg-title">
        <h2>Issues {live.length > 0 && <span className="is-count">{live.length}</span>}</h2>
        {done.length > 0 && (
          <button type="button" className="btn small-btn ghost" onClick={() => setShowDone((v) => !v)}>완료 {done.length} {showDone ? '숨기기' : '보기'}</button>
        )}
      </div>
      <div className="is-add" onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && add()}>
        <input className="input is-text" value={text} placeholder="이슈 내용" onChange={(e) => setText(e.target.value)} aria-label="이슈 내용" />
        <input className="input is-owner" value={owner} placeholder="담당자" onChange={(e) => setOwner(e.target.value)} aria-label="담당자" />
        <DateField value={due} onChange={setDue} label="기한" placeholder="기한" />
        <button type="button" className="btn small-btn primary" disabled={!text.trim()} onClick={add}><Icon name="plus" size={13} /> 추가</button>
      </div>
      {rows.length > 0 && (
        <div className="is-list">
          {rows.map((i) => {
            const over = i.due && i.status !== 'done' && i.due < today;
            return (
              <div key={i.id} className={`is-row ${i.status}`}>
                <button type="button" className={`is-st ${i.status}`} onClick={() => upd(i.id, { status: next(i.status), ...(next(i.status) === 'done' ? { closed: today } : {}) })} title="눌러서 상태 바꾸기">
                  {STATUS.find(([k]) => k === i.status)?.[1]}
                </button>
                {editId === i.id ? (
                  <input className="input is-text" autoFocus defaultValue={i.text} onBlur={(e) => { upd(i.id, { text: e.target.value.trim() || i.text }); setEditId(null); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditId(null); }} aria-label="이슈 내용 수정" />
                ) : (
                  <span className="is-body" onDoubleClick={() => setEditId(i.id)} title="두 번 눌러 수정">{i.text}</span>
                )}
                <input className="input is-owner ghost-in" value={i.owner || ''} placeholder="담당자" onChange={(e) => upd(i.id, { owner: e.target.value })} aria-label="담당자" />
                <span className={over ? 'is-over' : ''}><DateField small value={i.due} onChange={(d) => upd(i.id, { due: d })} label="기한" placeholder="기한" /></span>
                <span className="is-meta small muted num">{fmtShort(i.created)}{i.status === 'done' && i.closed ? ` → ${fmtShort(i.closed)}` : ''}</span>
                <button type="button" className="icon-btn sm" onClick={() => { const prev = issues; set(issues.filter((x) => x.id !== i.id)); notify?.('이슈를 지웠어요', { label: '되돌리기', run: () => set(prev) }); }} aria-label="이슈 지우기"><Icon name="close" size={13} /></button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
