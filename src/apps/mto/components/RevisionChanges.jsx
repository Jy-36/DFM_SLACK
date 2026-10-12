// Revision 변경점: DB · Runset · SPEC 중 바뀌는 것을 고르고 날짜를 적는다.
// DB(A · B · C)와 Runset STEP은 하나씩 준비 날짜를 갖고, 여러 개를 한 날짜로 묶을 수 있다.
// GDS 입고일은 따로 넣지 않고, 고른 변경점의 준비 날짜 중 가장 늦은 날로 정한다.
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort, todayIso } from '../lib/dates.js';

export const CHANGE_KINDS = [
  ['db', 'DB'],
  ['runset', 'Runset'],
  ['spec', 'SPEC'],
];
const DB_PARTS = ['A', 'B', 'C'];
const gid = () => `g${Math.random().toString(36).slice(2, 8)}`;

/** 예전 저장 형태(parts/steps + date 하나)를 날짜 묶음으로 */
export function groupsOf(c, listKey) {
  if (Array.isArray(c?.groups)) return c.groups;
  const items = c?.[listKey] || [];
  return items.length ? [{ id: 'g0', items, date: c.date || '' }] : [];
}

/** 고른 변경점의 준비 날짜 중 가장 늦은 날 (없으면 null) */
export function changesGds(changes) {
  const dates = [];
  if (changes?.db?.on) for (const g of groupsOf(changes.db, 'parts')) if (g.date) dates.push(g.date);
  if (changes?.runset?.on) for (const g of groupsOf(changes.runset, 'steps')) if (g.date) dates.push(g.date);
  if (changes?.spec?.on && changes.spec.date) dates.push(changes.spec.date);
  return dates.length ? dates.sort().at(-1) : null;
}

/** 항목 고르기 + 항목마다 날짜 (여러 개를 한 날짜로 묶기 · 풀기) */
function GroupDates({ options, groups, setGroups, tone, addSlot }) {
  const [checked, setChecked] = useState([]);
  const picked = groups.flatMap((g) => g.items);
  const toggleItem = (x) => {
    if (picked.includes(x)) setGroups(groups.map((g) => ({ ...g, items: g.items.filter((y) => y !== x) })).filter((g) => g.items.length));
    else setGroups([...groups, { id: gid(), items: [x], date: '' }]);
    setChecked([]);
  };
  const merge = () => {
    const sel = groups.filter((g) => checked.includes(g.id));
    if (sel.length < 2) return;
    const merged = { id: gid(), items: sel.flatMap((g) => g.items), date: sel.find((g) => g.date)?.date || '' };
    const first = groups.findIndex((g) => checked.includes(g.id));
    const rest = groups.filter((g) => !checked.includes(g.id));
    rest.splice(first, 0, merged);
    setGroups(rest);
    setChecked([]);
  };
  const split = (g) => {
    const i = groups.indexOf(g);
    setGroups([...groups.slice(0, i), ...g.items.map((x) => ({ id: gid(), items: [x], date: g.date })), ...groups.slice(i + 1)]);
  };
  const setDate = (g, date) => setGroups(groups.map((x) => (x.id === g.id ? { ...x, date } : x)));
  const order = (g) => [...g.items].sort((a, b) => options.indexOf(a) - options.indexOf(b));

  return (
    <div className={`gd ${tone}`}>
      <div className="chg-step-line">
        {options.map((x) => (
          <button key={x} type="button" className={`chg-chip ${picked.includes(x) ? 'on' : ''}`} aria-pressed={picked.includes(x)} onClick={() => toggleItem(x)}>
            {picked.includes(x) && <Icon name="check" size={12} />}
            {x}
          </button>
        ))}
        {addSlot}
      </div>
      {groups.length > 0 && (
        <div className="gd-rows">
          {groups.map((g) => (
            <div key={g.id} className={`gd-row ${checked.includes(g.id) ? 'sel' : ''}`}>
              {groups.length > 1 && (
                <input type="checkbox" checked={checked.includes(g.id)} onChange={() => setChecked(checked.includes(g.id) ? checked.filter((x) => x !== g.id) : [...checked, g.id])} aria-label={`${g.items.join(', ')} 묶기 선택`} title="체크해서 한 날짜로 묶기" />
              )}
              <span className="gd-items">
                {order(g).map((x) => <span key={x} className="gd-item">{x}</span>)}
              </span>
              <label className="gd-date">
                <input type="date" className={`input num ${g.date ? '' : 'empty'}`} value={g.date || ''} onChange={(e) => setDate(g, e.target.value)} aria-label={`${g.items.join(', ')} 준비 날짜`} />
              </label>
              <span className="gd-split">{g.items.length > 1 && <button type="button" className="btn small-btn ghost" onClick={() => split(g)}>풀기</button>}</span>
            </div>
          ))}
          {groups.length > 1 && (
            <div className="gd-merge small">
              <button type="button" className="btn small-btn" disabled={checked.length < 2} onClick={merge}>
                <Icon name="layers" size={13} /> 날짜 묶기{checked.length ? ` (${checked.length})` : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 저장된 변경점 보기 (한 줄씩) */
function ChangesView({ changes }) {
  const on = CHANGE_KINDS.filter(([k]) => changes[k]?.on);
  if (!on.length) return <div className="chg-empty small muted">없음</div>;
  const Groups = ({ groups, tone }) => groups.map((g) => (
    <span key={g.id} className="cv-group">
      {g.items.map((x) => <span key={x} className={`gd-item ${tone}`}>{x}</span>)}
      <span className={`num ${g.date ? '' : 'tone-warn'}`}>{g.date ? fmtShort(g.date) : '날짜 없음'}</span>
    </span>
  ));
  return (
    <div className="cv">
      {changes.db?.on && (
        <div className="cv-row db">
          <b>DB</b>
          <span className="cv-body">
            <Groups groups={groupsOf(changes.db, 'parts')} tone="db" />
            {changes.db.stepX?.on && <span className="cv-stepx">Step X <span className="num">{changes.db.stepX.date ? fmtShort(changes.db.stepX.date) : '-'}</span></span>}
          </span>
          {changes.db.comment && <span className="cv-comment small muted">{changes.db.comment}</span>}
        </div>
      )}
      {changes.runset?.on && (
        <div className="cv-row runset">
          <b>Runset</b>
          <span className="cv-body"><Groups groups={groupsOf(changes.runset, 'steps')} tone="runset" /></span>
          {changes.runset.comment && <span className="cv-comment small muted">{changes.runset.comment}</span>}
        </div>
      )}
      {changes.spec?.on && (
        <div className="cv-row spec">
          <b>SPEC</b>
          <span className="cv-body"><span className={`num ${changes.spec.date ? '' : 'tone-warn'}`}>{changes.spec.date ? fmtShort(changes.spec.date) : '날짜 없음'}</span></span>
          {changes.spec.comment && <span className="cv-comment small muted">{changes.spec.comment}</span>}
        </div>
      )}
    </div>
  );
}

export default function RevisionChanges({ project, state, dispatch, notify }) {
  const saved = project.changes || {};
  const [draft, setDraft] = useState(null); // null = 보기, 객체 = 수정 중
  const editing = !!draft;
  const changes = draft || saved;
  const steps = state.runsetSteps || [];
  const [newStep, setNewStep] = useState('');
  const [adding, setAdding] = useState(false);

  const save = (kind, patch) => setDraft({ ...changes, [kind]: { ...(changes[kind] || {}), ...patch } });
  const commit = () => {
    const gds = changesGds(draft);
    dispatch({ type: 'updateProject', id: project.id, patch: { changes: draft, ...(gds ? { gds } : {}) } });
    setDraft(null);
    notify?.(gds ? `Changes 저장 · GDS ${fmtShort(gds)}` : 'Changes 저장');
  };
  const dbGroups = groupsOf(changes.db, 'parts');
  const rsGroups = groupsOf(changes.runset, 'steps');
  const stepX = changes.db?.stepX || {};
  const addStep = () => {
    const v = newStep.trim();
    if (!v) return;
    if (!steps.includes(v)) dispatch({ type: 'runsetSteps', steps: [...steps, v] });
    if (!rsGroups.some((g) => g.items.includes(v))) save('runset', { groups: [...rsGroups, { id: gid(), items: [v], date: '' }] });
    setNewStep('');
    setAdding(false);
  };
  const gds = changesGds(changes);
  const savedGds = changesGds(saved);
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <section className={`panel chg ${editing ? 'editing' : ''}`}>
      <div className="chg-title">
        <h2>Changes</h2>
        <span className="chg-head-r">
          <span className={`chg-gds ${gds ? 'on' : ''}`}>
            <span className="small">GDS</span>
            <b className="num">{gds ? fmtShort(gds) : '-'}</b>
            {editing && gds !== savedGds && <span className="small">저장 전</span>}
          </span>
          {editing ? (
            <>
              <button type="button" className="btn small-btn ghost" onClick={() => setDraft(null)}>취소</button>
              <button type="button" className="btn small-btn primary" disabled={!dirty} onClick={commit}>저장</button>
            </>
          ) : (
            <button type="button" className="btn small-btn" onClick={() => setDraft(structuredClone(saved))}><Icon name="settings" size={13} /> 수정</button>
          )}
        </span>
      </div>

      {!editing ? <ChangesView changes={saved} /> : (
        <>
          <div className="chg-kinds" role="group" aria-label="변경점 고르기">
            {CHANGE_KINDS.map(([k, label]) => (
              <button key={k} type="button" className={`chg-kind ${k} ${changes[k]?.on ? 'on' : ''}`} aria-pressed={!!changes[k]?.on} onClick={() => save(k, { on: !changes[k]?.on })}>
                <span className="chg-box">{changes[k]?.on && <Icon name="check" size={13} />}</span>
                <b>{label}</b>
              </button>
            ))}
          </div>
          <div className="chg-areas">
            {changes.db?.on && (
              <div className="chg-area db">
                <div className="chg-area-h">
                  <b>DB</b>
                  <span className="chg-stepx">
                    <button type="button" className={`chg-toggle ${stepX.on ? 'on' : ''}`} aria-pressed={!!stepX.on} onClick={() => save('db', { stepX: stepX.on ? { on: false, date: stepX.date } : { on: true, date: stepX.date || todayIso() } })}>
                      <span className="chg-box sm">{stepX.on && <Icon name="check" size={11} />}</span>
                      Step X
                    </button>
                    {stepX.on && <input type="date" className="input num" value={stepX.date || ''} onChange={(e) => save('db', { stepX: { on: true, date: e.target.value } })} aria-label="Step X 적용 날짜" />}
                  </span>
                </div>
                <GroupDates options={DB_PARTS} groups={dbGroups} setGroups={(groups) => save('db', { groups })} tone="db" />
                <input className="input chg-comment" value={changes.db.comment || ''} placeholder="코멘트" onChange={(e) => save('db', { comment: e.target.value })} aria-label="DB 코멘트" />
              </div>
            )}
            {changes.runset?.on && (
              <div className="chg-area runset">
                <div className="chg-area-h"><b>Runset</b></div>
                <GroupDates options={[...new Set([...steps, ...rsGroups.flatMap((g) => g.items)])]} groups={rsGroups} setGroups={(groups) => save('runset', { groups })} tone="runset"
                  addSlot={adding ? (
                    <span className="chg-add">
                      <input className="input" value={newStep} autoFocus placeholder="STEP" onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addStep(); if (e.key === 'Escape') setAdding(false); }} aria-label="새 Runset STEP" />
                      <button type="button" className="btn small-btn primary" onClick={addStep}>추가</button>
                      <button type="button" className="btn small-btn ghost" onClick={() => setAdding(false)}>취소</button>
                    </span>
                  ) : (
                    <button type="button" className="chg-chip add" onClick={() => setAdding(true)} aria-label="Runset STEP 추가"><Icon name="plus" size={12} /> STEP</button>
                  )} />
                <input className="input chg-comment" value={changes.runset.comment || ''} placeholder="코멘트" onChange={(e) => save('runset', { comment: e.target.value })} aria-label="Runset 코멘트" />
              </div>
            )}
            {changes.spec?.on && (
              <div className="chg-area spec">
                <div className="chg-area-h"><b>SPEC</b></div>
                <div className="chg-row">
                  <input type="date" className="input num chg-date" value={changes.spec.date || ''} onChange={(e) => save('spec', { date: e.target.value })} aria-label="SPEC 준비 날짜" />
                  <input className="input chg-comment" value={changes.spec.comment || ''} placeholder="코멘트" onChange={(e) => save('spec', { comment: e.target.value })} aria-label="SPEC 코멘트" />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
