// Revision 변경점: DB · Runset · SPEC 중 바뀌는 것을 고르고, 고른 것마다 내용 · 준비 날짜 · 코멘트를 적는다.
// GDS 입고일은 따로 넣지 않고, 고른 변경점의 준비 날짜 중 가장 늦은 날로 정한다.
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtLong } from '../lib/dates.js';

export const CHANGE_KINDS = [
  ['db', 'DB', 'DB 파일 중 바뀌는 것'],
  ['runset', 'Runset', '바뀌는 Runset STEP'],
  ['spec', 'SPEC', 'SPEC 변경'],
];
const DB_PARTS = ['A', 'B', 'C'];

/** 고른 변경점의 준비 날짜 중 가장 늦은 날 (없으면 null) */
export function changesGds(changes) {
  const dates = CHANGE_KINDS.map(([k]) => changes?.[k]).filter((c) => c?.on && c.date).map((c) => c.date);
  return dates.length ? dates.sort().at(-1) : null;
}

function Chips({ items, picked, onToggle, label }) {
  return (
    <div className="chg-chips" role="group" aria-label={label}>
      {items.map((x) => (
        <button key={x} type="button" className={`chg-chip ${picked.includes(x) ? 'on' : ''}`} aria-pressed={picked.includes(x)} onClick={() => onToggle(x)}>
          {picked.includes(x) && <Icon name="check" size={12} />}
          {x}
        </button>
      ))}
    </div>
  );
}

function DateComment({ c, set }) {
  return (
    <>
      <label className="field chg-date">
        <span>준비 날짜</span>
        <input type="date" className="input num" value={c.date || ''} onChange={(e) => set({ date: e.target.value })} />
      </label>
      <label className="field chg-comment">
        <span>코멘트</span>
        <input className="input" value={c.comment || ''} placeholder="예: Fab 확인 후 확정" onChange={(e) => set({ comment: e.target.value })} />
      </label>
    </>
  );
}

export default function RevisionChanges({ project, state, dispatch, notify }) {
  const changes = project.changes || {};
  const steps = state.runsetSteps || [];
  const [newStep, setNewStep] = useState('');
  const [adding, setAdding] = useState(false);

  const save = (kind, patch) => {
    const next = { ...changes, [kind]: { ...(changes[kind] || {}), ...patch } };
    const gds = changesGds(next);
    dispatch({ type: 'updateProject', id: project.id, patch: { changes: next, ...(gds ? { gds } : {}) } });
  };
  const toggleList = (kind, key, x) => {
    const cur = changes[kind]?.[key] || [];
    save(kind, { [key]: cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x] });
  };
  const addStep = () => {
    const v = newStep.trim();
    if (!v) return;
    if (!steps.includes(v)) dispatch({ type: 'runsetSteps', steps: [...steps, v] });
    toggleList('runset', 'steps', v);
    setNewStep('');
    setAdding(false);
    notify?.(`Runset STEP '${v}'을 추가했어요`);
  };
  const on = CHANGE_KINDS.filter(([k]) => changes[k]?.on);
  const gds = changesGds(changes);

  return (
    <section className="panel chg">
      <h2>
        변경점
        <span className="small muted">바뀌는 것을 고르면 아래에 적는 칸이 생겨요</span>
      </h2>
      <div className="chg-kinds" role="group" aria-label="변경점 고르기">
        {CHANGE_KINDS.map(([k, label, desc]) => (
          <button key={k} type="button" className={`chg-kind ${k} ${changes[k]?.on ? 'on' : ''}`} aria-pressed={!!changes[k]?.on} onClick={() => save(k, { on: !changes[k]?.on })}>
            <span className="chg-box">{changes[k]?.on && <Icon name="check" size={13} />}</span>
            <b>{label}</b>
            <span className="small muted">{desc}</span>
          </button>
        ))}
      </div>

      {on.length > 0 && (
        <div className="chg-areas">
          {changes.db?.on && (
            <div className="chg-area db">
              <div className="chg-area-h"><b>DB</b><span className="small muted">바뀌는 DB</span></div>
              <div className="chg-row">
                <div className="field"><span>바뀌는 것</span><Chips items={DB_PARTS} picked={changes.db.parts || []} onToggle={(x) => toggleList('db', 'parts', x)} label="바뀌는 DB" /></div>
                <DateComment c={changes.db} set={(p) => save('db', p)} />
              </div>
            </div>
          )}
          {changes.runset?.on && (
            <div className="chg-area runset">
              <div className="chg-area-h"><b>Runset</b><span className="small muted">변경 STEP</span></div>
              <div className="chg-row">
                <div className="field">
                  <span>변경 STEP</span>
                  <div className="chg-step-line">
                    <Chips items={steps} picked={changes.runset.steps || []} onToggle={(x) => toggleList('runset', 'steps', x)} label="변경 STEP" />
                    {adding ? (
                      <span className="chg-add">
                        <input className="input" value={newStep} autoFocus placeholder="STEP 이름" onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addStep(); if (e.key === 'Escape') setAdding(false); }} aria-label="새 Runset STEP" />
                        <button type="button" className="btn small-btn primary" onClick={addStep}>추가</button>
                        <button type="button" className="btn small-btn ghost" onClick={() => setAdding(false)}>취소</button>
                      </span>
                    ) : (
                      <button type="button" className="chg-chip add" onClick={() => setAdding(true)} title="STEP 추가" aria-label="Runset STEP 추가"><Icon name="plus" size={12} /> STEP</button>
                    )}
                  </div>
                </div>
                <DateComment c={changes.runset} set={(p) => save('runset', p)} />
              </div>
            </div>
          )}
          {changes.spec?.on && (
            <div className="chg-area spec">
              <div className="chg-area-h"><b>SPEC</b><span className="small muted">SPEC 변경</span></div>
              <div className="chg-row">
                <DateComment c={changes.spec} set={(p) => save('spec', p)} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="chg-foot small">
        {gds ? (
          <>GDS 입고 <b className="num">{fmtLong(gds)}</b> <span className="muted">— 고른 변경점의 준비 날짜 중 가장 늦은 날로 일정을 계산해요</span></>
        ) : (
          <span className="muted">변경점을 고르고 준비 날짜를 넣으면 그 날짜 중 가장 늦은 날을 GDS 입고로 보고 일정을 계산해요.{project.gds ? ` 지금은 이전에 넣은 GDS ${fmtLong(project.gds)} 기준이에요.` : ''}</span>
        )}
      </div>
    </section>
  );
}
