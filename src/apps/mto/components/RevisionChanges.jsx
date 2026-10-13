// Revision Changes: DB · Runset · SPEC 중 바뀌는 것을 고르고 줄마다 준비 날짜 · 코멘트 · 담당자를 적는다.
// DB(A · B · C)와 Runset STEP은 끌어서 한 날짜로 묶을 수 있고, DB에는 Step X(대상 A · B · C) 줄이 있다.
// 항목마다 오른쪽 위에 가장 늦은 날짜, GDS 입고일은 전체에서 가장 늦은 날. 저장해야 일정에 반영된다.
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort, todayIso } from '../lib/dates.js';
import DateField from './DateField.jsx';

export const CHANGE_KINDS = [
  ['db', 'DB'],
  ['runset', 'Runset'],
  ['spec', 'SPEC'],
];
const DB_PARTS = ['A', 'B', 'C'];
const gid = () => `g${Math.random().toString(36).slice(2, 8)}`;
const latest = (dates) => dates.filter(Boolean).sort().at(-1) || null;

/** 예전 저장 형태(parts/steps + date 하나)를 날짜 묶음으로 */
export function groupsOf(c, listKey) {
  if (Array.isArray(c?.groups)) return c.groups;
  const items = c?.[listKey] || [];
  return items.length ? [{ id: 'g0', items, date: c.date || '' }] : [];
}

/** 항목별 가장 늦은 준비 날짜 */
export function kindLatest(changes, kind) {
  const c = changes?.[kind];
  if (!c?.on) return null;
  if (kind === 'db') return latest([...groupsOf(c, 'parts').map((g) => g.date), c.stepX?.on ? c.stepX.date : null]);
  if (kind === 'runset') return latest(groupsOf(c, 'steps').map((g) => g.date));
  return c.date || null;
}

/** 그날 기준 준비 상태: 직접 '준비 완료'로 정했거나, 날짜가 다 있고 가장 늦은 날이 지났으면 완료 */
export function kindReady(changes, kind, day) {
  const c = changes?.[kind];
  if (!c?.on) return true;
  if (c.ready) return true;
  const d = kindLatest(changes, kind);
  return !!d && d <= day;
}
/** 아직 준비 중인 항목: [['db','DB'], …] */
export function pendingKinds(changes, day) {
  return CHANGE_KINDS.filter(([k]) => changes?.[k]?.on && !kindReady(changes, k, day));
}
/** 준비 상태 한 줄: 'DB 준비중' · '2/3 준비중' · '준비 완료' */
export function prepText(changes, day) {
  const on = CHANGE_KINDS.filter(([k]) => changes?.[k]?.on);
  const pend = pendingKinds(changes, day);
  if (!on.length) return null;
  if (!pend.length) return '준비 완료';
  if (pend.length === 1) return `${pend[0][1]} 준비중`;
  return `${pend.length}/${on.length} 준비중`;
}

/** 고른 변경점의 준비 날짜 중 가장 늦은 날 = GDS 입고 (없으면 null) */
export function changesGds(changes) {
  return latest(CHANGE_KINDS.map(([k]) => kindLatest(changes, k)));
}

/** 줄 오른쪽: 코멘트 · 담당자 (편집) */
function NoteInputs({ row, set }) {
  return (
    <>
      <input className="input gd-comment" value={row.comment || ''} placeholder="코멘트" onChange={(e) => set({ comment: e.target.value })} aria-label="코멘트" />
      <input className="input gd-owner" value={row.owner || ''} placeholder="담당자" onChange={(e) => set({ owner: e.target.value })} aria-label="담당자" />
    </>
  );
}

/** 항목 고르기 + 줄마다 날짜 · 코멘트 · 담당자. 칩이나 ⋮⋮를 다른 줄에 끌어 놓으면 묶기, '따로' 칸에 놓으면 떼기 */
function GroupDates({ options, groups, setGroups, tone, addSlot, extraRow }) {
  const [drag, setDrag] = useState(null);
  const picked = groups.flatMap((g) => g.items);
  const toggleItem = (x) => {
    if (picked.includes(x)) setGroups(groups.map((g) => ({ ...g, items: g.items.filter((y) => y !== x) })).filter((g) => g.items.length));
    else setGroups([...groups, { id: gid(), items: [x], date: '' }]);
  };
  const split = (g) => {
    const i = groups.indexOf(g);
    setGroups([...groups.slice(0, i), ...g.items.map((x) => ({ ...g, id: gid(), items: [x] })), ...groups.slice(i + 1)]);
  };
  const setRow = (g, patch) => setGroups(groups.map((x) => (x.id === g.id ? { ...x, ...patch } : x)));
  const order = (g) => [...g.items].sort((a, b) => options.indexOf(a) - options.indexOf(b));

  const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-gd-drop]')?.getAttribute('data-gd-drop') || null;
  const start = (e, kind, g, item) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({ kind, gid: g.id, item, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, over: null });
    const move = (ev) => setDrag((d) => d && { ...d, x: ev.clientX, y: ev.clientY, moved: d.moved || Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) > 4, over: targetAt(ev.clientX, ev.clientY) });
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const over = targetAt(ev.clientX, ev.clientY);
      setDrag(null);
      const src = groups.find((q) => q.id === g.id);
      if (!over || over === g.id || !src) return;
      if (over === 'solo') {
        if (kind !== 'item' || src.items.length < 2) return;
        const i = groups.indexOf(src);
        const next = [...groups];
        next.splice(i, 1, { ...src, items: src.items.filter((x) => x !== item) }, { id: gid(), items: [item], date: src.date });
        setGroups(next);
        return;
      }
      const moving = kind === 'row' ? src.items : [item];
      setGroups(groups
        .map((q) => (q.id === over ? { ...q, items: [...q.items, ...moving], date: q.date || src.date } : q.id === src.id ? { ...q, items: q.items.filter((x) => !moving.includes(x)) } : q))
        .filter((q) => q.items.length));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const canDrag = (g) => groups.length > 1 || g.items.length > 1;

  return (
    <div className={`gd ${tone} ${drag?.moved ? 'dragging' : ''}`}>
      <div className="chg-step-line">
        {options.map((x) => (
          <button key={x} type="button" className={`chg-chip ${picked.includes(x) ? 'on' : ''}`} aria-pressed={picked.includes(x)} onClick={() => toggleItem(x)}>
            {picked.includes(x) && <Icon name="check" size={12} />}
            {x}
          </button>
        ))}
        {addSlot}
      </div>
      {(groups.length > 0 || extraRow) && (
        <div className="gd-rows">
          {groups.map((g) => (
            <div key={g.id} data-gd-drop={g.id} className={`gd-row ${drag?.moved && drag.over === g.id && drag.gid !== g.id ? 'drop' : ''} ${drag?.moved && drag.gid === g.id && drag.kind === 'row' ? 'src' : ''}`}>
              <span className="gd-handle" onPointerDown={groups.length > 1 ? (e) => start(e, 'row', g) : undefined} style={groups.length > 1 ? undefined : { visibility: 'hidden' }} aria-label="끌어서 묶기">⋮⋮</span>
              <span className="gd-items">
                {order(g).map((x) => (
                  <span key={x} className={`gd-item ${canDrag(g) ? 'grab' : ''} ${drag?.moved && drag.kind === 'item' && drag.item === x ? 'src' : ''}`} onPointerDown={canDrag(g) ? (e) => start(e, 'item', g, x) : undefined}>{x}</span>
                ))}
              </span>
              <DateField value={g.date} onChange={(date) => setRow(g, { date })} label={`${g.items.join(', ')} 준비 날짜`} warnEmpty />
              <NoteInputs row={g} set={(p) => setRow(g, p)} />
              <span className="gd-split">{g.items.length > 1 && <button type="button" className="btn small-btn ghost" onClick={() => split(g)}>풀기</button>}</span>
            </div>
          ))}
          {extraRow}
          {drag?.moved && drag.kind === 'item' && groups.find((q) => q.id === drag.gid)?.items.length > 1 && (
            <div data-gd-drop="solo" className={`gd-solo ${drag.over === 'solo' ? 'drop' : ''}`}>따로</div>
          )}
        </div>
      )}
      {drag?.moved && (
        <div className={`gd-ghost ${tone}`} style={{ left: drag.x + 10, top: drag.y + 10 }}>
          {(drag.kind === 'row' ? groups.find((q) => q.id === drag.gid)?.items || [] : [drag.item]).map((x) => <span key={x} className="gd-item">{x}</span>)}
        </div>
      )}
    </div>
  );
}

/** 보기용 한 줄 */
function ViewRow({ items, tone, label, row }) {
  return (
    <div className="cv-line">
      <span className="cv-items">
        {label && <span className="cv-label">{label}</span>}
        {items.map((x) => <span key={x} className={`gd-item ${tone}`}>{x}</span>)}
      </span>
      <span className={`cv-date num ${row.date ? '' : 'tone-warn'}`}>{row.date ? fmtShort(row.date) : '날짜 없음'}</span>
      <span className="cv-comment">{row.comment || <span className="muted">-</span>}</span>
      <span className="cv-owner">{row.owner || <span className="muted">-</span>}</span>
    </div>
  );
}

/** 접었을 때 한 줄 요약 */
function Brief({ kind, c }) {
  if (kind === 'spec') return <span className="cv-group"><span className={`num ${c.date ? '' : 'tone-warn'}`}>{c.date ? fmtShort(c.date) : '날짜 없음'}</span></span>;
  const groups = groupsOf(c, kind === 'db' ? 'parts' : 'steps');
  return (
    <>
      {groups.map((g) => (
        <span key={g.id} className="cv-group">
          {g.items.map((x) => <span key={x} className={`gd-item ${kind}`}>{x}</span>)}
          <span className={`num ${g.date ? '' : 'tone-warn'}`}>{g.date ? fmtShort(g.date) : '-'}</span>
        </span>
      ))}
      {kind === 'db' && c.stepX?.on && (
        <span className="cv-group"><span className="cv-label">Step X</span>{(c.stepX.targets || []).map((x) => <span key={x} className="gd-item stepx">{x}</span>)}<span className="num">{c.stepX.date ? fmtShort(c.stepX.date) : '-'}</span></span>
      )}
      {!groups.length && !(kind === 'db' && c.stepX?.on) && <span className="muted small">고른 것 없음</span>}
    </>
  );
}

export default function RevisionChanges({ project, state, dispatch, notify, live }) {
  const saved = project.changes || {};
  const [draft, setDraft] = useState(null); // null = 보기, 객체 = 수정 중
  // live: 새 ITEM 만들기 창처럼 바로바로 반영 (수정/저장 없이)
  const editing = live || !!draft;
  const changes = live ? saved : draft || saved;
  const steps = state.runsetSteps || [];
  const [newStep, setNewStep] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState({}); // { 'view:db': true, 'edit:db': false }
  const isOpen = (k) => open[`${editing ? 'edit' : 'view'}:${k}`] ?? editing;
  const toggleOpen = (k) => setOpen((o) => ({ ...o, [`${editing ? 'edit' : 'view'}:${k}`]: !isOpen(k) }));

  // 준비 완료 표시는 보기 화면에서도 바로 저장
  const toggleReady = (k) => {
    const cur = changes[k] || {};
    const patch = { ...cur, ready: !cur.ready };
    if (live || draft) save(k, { ready: !cur.ready });
    else dispatch({ type: 'updateProject', id: project.id, patch: { changes: { ...saved, [k]: { ...(saved[k] || {}), ready: !cur.ready } } } });
    void patch;
  };
  const save = (kind, patch) => {
    const next = { ...changes, [kind]: { ...(changes[kind] || {}), ...patch } };
    if (live) dispatch({ type: 'updateProject', id: project.id, patch: { changes: next } });
    else setDraft(next);
  };
  const commit = () => {
    const gds = changesGds(draft);
    dispatch({ type: 'updateProject', id: project.id, patch: { changes: draft, ...(gds ? { gds } : {}) } });
    setDraft(null);
    notify?.(gds ? `Changes 저장 · GDS ${fmtShort(gds)}` : 'Changes 저장');
  };
  const dbGroups = groupsOf(changes.db, 'parts');
  const rsGroups = groupsOf(changes.runset, 'steps');
  const stepX = changes.db?.stepX || {};
  const setStepX = (patch) => save('db', { stepX: { ...stepX, ...patch } });
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
  const onKinds = CHANGE_KINDS.filter(([k]) => changes[k]?.on);

  const stepXRow = (
    <div className={`gd-row stepx ${stepX.on ? 'on' : ''}`}>
      <span className="gd-handle" style={{ visibility: 'hidden' }}>⋮⋮</span>
      <span className="gd-items">
        <button type="button" className={`chg-toggle ${stepX.on ? 'on' : ''}`} aria-pressed={!!stepX.on} onClick={() => setStepX({ on: !stepX.on })}>
          <span className="chg-box sm">{stepX.on && <Icon name="check" size={11} />}</span>
          Step X
        </button>
        {stepX.on && DB_PARTS.map((x) => {
          const on = (stepX.targets || []).includes(x);
          return <button key={x} type="button" className={`sx-target ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setStepX({ targets: on ? stepX.targets.filter((y) => y !== x) : [...(stepX.targets || []), x].sort() })}>{x}</button>;
        })}
      </span>
      {stepX.on ? (
        <>
          <DateField value={stepX.date} onChange={(date) => setStepX({ date })} label="Step X 적용 날짜" warnEmpty />
          <NoteInputs row={stepX} set={setStepX} />
        </>
      ) : <span className="gd-off" />}
      <span className="gd-split" />
    </div>
  );

  const block = (k, label, body, viewBody) => {
    const c = changes[k];
    const d = kindLatest(changes, k);
    const o = isOpen(k);
    return (
      <div key={k} className={`chg-area ${k} ${o ? 'open' : 'closed'}`}>
        <div className="chg-area-top">
        <button type="button" className="chg-area-h" onClick={() => toggleOpen(k)} aria-expanded={o}>
          <Icon name="chevron" size={13} />
          <b>{label}</b>
          {!o && <span className="cv-brief"><Brief kind={k} c={c} /></span>}
          <span className={`chg-latest num ${d ? '' : 'none'}`}>{d ? fmtShort(d) : '날짜 없음'}</span>
        </button>
        <button type="button" className={`chg-ready ${kindReady(changes, k, todayIso()) ? 'on' : ''} ${c.ready ? 'manual' : ''}`} onClick={() => toggleReady(k)}
          title={c.ready ? '눌러서 준비중으로' : kindReady(changes, k, todayIso()) ? '날짜가 지나 자동 완료 · 눌러서 완료로 고정' : '눌러서 준비 완료로'}>
          {kindReady(changes, k, todayIso()) ? <><Icon name="check" size={12} /> 준비 완료</> : '준비중'}
        </button>
        </div>
        {o && <div className="chg-area-b">{editing ? body : viewBody}</div>}
      </div>
    );
  };

  const viewGroups = (groups, tone) => groups.map((g) => <ViewRow key={g.id} items={[...g.items]} tone={tone} row={g} />);
  const legacy = (c) => c?.comment && <div className="cv-legacy small muted">{c.comment}</div>;

  return (
    <section className={`panel chg ${editing ? 'editing' : ''}`}>
      <div className="chg-title">
        <h2>Changes</h2>
        <span className="chg-head-r">
          {prepText(changes, todayIso()) && <span className={`prep-st ${pendingKinds(changes, todayIso()).length ? '' : 'ok'}`}>{prepText(changes, todayIso())}</span>}
          <span className={`chg-gds ${gds ? 'on' : ''}`}>
            <span className="small">GDS</span>
            <b className="num">{gds ? fmtShort(gds) : '-'}</b>
            {editing && gds !== savedGds && <span className="small">저장 전</span>}
          </span>
          {live ? null : editing ? (
            <>
              <button type="button" className="btn small-btn ghost" onClick={() => setDraft(null)}>취소</button>
              <button type="button" className="btn small-btn primary" disabled={!dirty} onClick={commit}>저장</button>
            </>
          ) : (
            <button type="button" className="btn small-btn" onClick={() => setDraft(structuredClone(saved))}><Icon name="settings" size={13} /> 수정</button>
          )}
        </span>
      </div>

      {editing && (
        <div className="chg-kinds" role="group" aria-label="변경점 고르기">
          {CHANGE_KINDS.map(([k, label]) => (
            <button key={k} type="button" className={`chg-kind ${k} ${changes[k]?.on ? 'on' : ''}`} aria-pressed={!!changes[k]?.on} onClick={() => save(k, { on: !changes[k]?.on })}>
              <span className="chg-box">{changes[k]?.on && <Icon name="check" size={12} />}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      {!onKinds.length ? (!editing && <div className="chg-empty small muted">없음</div>) : (
        <div className="chg-areas">
          {changes.db?.on && block('db', 'DB',
            <GroupDates options={DB_PARTS} groups={dbGroups} setGroups={(groups) => save('db', { groups })} tone="db" extraRow={stepXRow} />,
            <>
              {viewGroups(dbGroups, 'db')}
              {stepX.on && <ViewRow label="Step X" items={stepX.targets || []} tone="stepx" row={stepX} />}
              {legacy(changes.db)}
            </>)}
          {changes.runset?.on && block('runset', 'Runset',
            <GroupDates options={[...new Set([...steps, ...rsGroups.flatMap((g) => g.items)])]} groups={rsGroups} setGroups={(groups) => save('runset', { groups })} tone="runset"
              addSlot={adding ? (
                <span className="chg-add">
                  <input className="input" value={newStep} autoFocus placeholder="STEP" onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addStep(); if (e.key === 'Escape') setAdding(false); }} aria-label="새 Runset STEP" />
                  <button type="button" className="btn small-btn primary" onClick={addStep}>추가</button>
                  <button type="button" className="btn small-btn ghost" onClick={() => setAdding(false)}>취소</button>
                </span>
              ) : (
                <button type="button" className="chg-chip add" onClick={() => setAdding(true)} aria-label="Runset STEP 추가"><Icon name="plus" size={12} /> STEP</button>
              )} />,
            <>
              {viewGroups(rsGroups, 'runset')}
              {legacy(changes.runset)}
            </>)}
          {changes.spec?.on && block('spec', 'SPEC',
            <div className="gd-rows">
              <div className="gd-row">
                <span className="gd-handle" style={{ visibility: 'hidden' }}>⋮⋮</span>
                <span className="gd-items"><span className="gd-item spec">SPEC</span></span>
                <DateField value={changes.spec.date} onChange={(date) => save('spec', { date })} label="SPEC 준비 날짜" warnEmpty />
                <NoteInputs row={changes.spec} set={(p) => save('spec', p)} />
                <span className="gd-split" />
              </div>
            </div>,
            <ViewRow items={['SPEC']} tone="spec" row={changes.spec} />)}
        </div>
      )}
    </section>
  );
}
