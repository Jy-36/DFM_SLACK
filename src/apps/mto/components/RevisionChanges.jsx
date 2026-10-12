// Revision 변경점: DB · Runset · SPEC 중 바뀌는 것을 고르고 날짜를 적는다.
// DB(A · B · C)와 Runset STEP은 하나씩 준비 날짜를 갖고, 여러 개를 한 날짜로 묶을 수 있다.
// GDS 입고일은 따로 넣지 않고, 고른 변경점의 준비 날짜 중 가장 늦은 날로 정한다.
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtLong, todayIso } from '../lib/dates.js';

export const CHANGE_KINDS = [
  ['db', 'DB', 'A · B · C 중 바뀌는 DB'],
  ['runset', 'Runset', '바뀌는 Runset STEP'],
  ['spec', 'SPEC', 'SPEC 변경'],
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
                {g.items.length > 1 && <span className="small muted">묶음</span>}
              </span>
              <label className="gd-date">
                <span className="small muted">준비 날짜</span>
                <input type="date" className={`input num ${g.date ? '' : 'empty'}`} value={g.date || ''} onChange={(e) => setDate(g, e.target.value)} aria-label={`${g.items.join(', ')} 준비 날짜`} />
              </label>
              {g.items.length > 1 && <button type="button" className="btn small-btn ghost" onClick={() => split(g)}>풀기</button>}
            </div>
          ))}
          {groups.length > 1 && (
            <div className="gd-merge small">
              <button type="button" className="btn small-btn" disabled={checked.length < 2} onClick={merge}>
                <Icon name="layers" size={13} /> 체크한 {checked.length || ''}개 한 날짜로 묶기
              </button>
              <span className="muted">예: A · B는 같은 날, C는 따로</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RevisionChanges({ project, state, dispatch, notify }) {
  const changes = project.changes || {};
  const steps = state.runsetSteps || [];
  const [newStep, setNewStep] = useState('');
  const [adding, setAdding] = useState(false);

  const saveAll = (next) => {
    const gds = changesGds(next);
    dispatch({ type: 'updateProject', id: project.id, patch: { changes: next, ...(gds ? { gds } : {}) } });
  };
  const save = (kind, patch) => saveAll({ ...changes, [kind]: { ...(changes[kind] || {}), ...patch } });
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
    notify?.(`Runset STEP '${v}'을 추가했어요`);
  };
  const gds = changesGds(changes);
  const onCount = CHANGE_KINDS.filter(([k]) => changes[k]?.on).length;

  return (
    <section className="panel chg">
      <div className="chg-title">
        <div>
          <h2>이번 Revision, 뭐가 바뀌나요?</h2>
          <p className="small muted">바뀌는 것을 켜면 아래에 준비 날짜를 적는 칸이 열려요. 가장 늦게 준비되는 날이 GDS 입고일이 돼요.</p>
        </div>
        <span className={`chg-gds ${gds ? 'on' : ''}`}>
          <span className="small">GDS 입고</span>
          <b className="num">{gds ? fmtLong(gds) : '날짜 대기'}</b>
        </span>
      </div>
      <div className="chg-kinds" role="group" aria-label="변경점 고르기">
        {CHANGE_KINDS.map(([k, label, desc]) => (
          <button key={k} type="button" className={`chg-kind ${k} ${changes[k]?.on ? 'on' : ''}`} aria-pressed={!!changes[k]?.on} onClick={() => save(k, { on: !changes[k]?.on })}>
            <span className="chg-box">{changes[k]?.on && <Icon name="check" size={13} />}</span>
            <b>{label}</b>
            <span className="small muted">{desc}</span>
          </button>
        ))}
      </div>

      {onCount > 0 && (
        <div className="chg-areas">
          {changes.db?.on && (
            <div className="chg-area db">
              <div className="chg-area-h">
                <b>DB</b><span className="small muted">바뀌는 DB를 고르고 각각 준비 날짜</span>
                <span className="chg-stepx">
                  <button type="button" className={`chg-toggle ${stepX.on ? 'on' : ''}`} aria-pressed={!!stepX.on} onClick={() => save('db', { stepX: stepX.on ? { on: false, date: stepX.date } : { on: true, date: stepX.date || todayIso() } })}>
                    <span className="chg-box sm">{stepX.on && <Icon name="check" size={11} />}</span>
                    Step X 적용
                  </button>
                  {stepX.on && <input type="date" className="input num" value={stepX.date || ''} onChange={(e) => save('db', { stepX: { on: true, date: e.target.value } })} aria-label="Step X 적용 날짜" />}
                </span>
              </div>
              <GroupDates options={DB_PARTS} groups={dbGroups} setGroups={(groups) => save('db', { groups })} tone="db" />
              <label className="field chg-comment"><span>코멘트</span><input className="input" value={changes.db.comment || ''} placeholder="예: A/C DB 갱신, B는 Fab 확인 후" onChange={(e) => save('db', { comment: e.target.value })} /></label>
            </div>
          )}
          {changes.runset?.on && (
            <div className="chg-area runset">
              <div className="chg-area-h"><b>Runset</b><span className="small muted">변경 STEP을 고르고 각각 준비 날짜 · 여러 STEP을 한 날짜로 묶을 수 있어요</span></div>
              <GroupDates options={[...new Set([...steps, ...rsGroups.flatMap((g) => g.items)])]} groups={rsGroups} setGroups={(groups) => save('runset', { groups })} tone="runset"
                addSlot={adding ? (
                  <span className="chg-add">
                    <input className="input" value={newStep} autoFocus placeholder="STEP 이름" onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addStep(); if (e.key === 'Escape') setAdding(false); }} aria-label="새 Runset STEP" />
                    <button type="button" className="btn small-btn primary" onClick={addStep}>추가</button>
                    <button type="button" className="btn small-btn ghost" onClick={() => setAdding(false)}>취소</button>
                  </span>
                ) : (
                  <button type="button" className="chg-chip add" onClick={() => setAdding(true)} aria-label="Runset STEP 추가"><Icon name="plus" size={12} /> STEP</button>
                )} />
              <label className="field chg-comment"><span>코멘트</span><input className="input" value={changes.runset.comment || ''} placeholder="예: OPC Recipe 변경" onChange={(e) => save('runset', { comment: e.target.value })} /></label>
            </div>
          )}
          {changes.spec?.on && (
            <div className="chg-area spec">
              <div className="chg-area-h"><b>SPEC</b><span className="small muted">SPEC 변경</span></div>
              <div className="chg-row">
                <label className="field chg-date"><span>준비 날짜</span><input type="date" className="input num" value={changes.spec.date || ''} onChange={(e) => save('spec', { date: e.target.value })} /></label>
                <label className="field chg-comment"><span>코멘트</span><input className="input" value={changes.spec.comment || ''} placeholder="예: CD Target 변경" onChange={(e) => save('spec', { comment: e.target.value })} /></label>
              </div>
            </div>
          )}
        </div>
      )}
      {!gds && project.gds && <div className="chg-foot small muted">준비 날짜가 없어서 이전에 넣은 GDS {fmtLong(project.gds)} 기준으로 계산하고 있어요.</div>}
    </section>
  );
}
