// Revision Dashboard: ITEM 목록(필터: Product · ITEM · MTO Target) + 걸러진 ITEM의 일정 타임라인.
// ITEM을 누르면 오른쪽에 Concept 정보가 열리고, + ITEM은 Concept 정보를 한 번에 넣는 창.
import { useEffect, useMemo, useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { fmtShort, todayIso } from '../lib/dates.js';
import DateField from '../components/DateField.jsx';
import AddItemModal from '../components/AddItemModal.jsx';
import RevisionTimeline, { TimelineLegend, prepMarks, stageOn } from './RevisionTimeline.jsx';
import { CHANGE_KINDS, kindLatest } from '../components/RevisionChanges.jsx';
import { TargetGap } from '../components/RevisionInfo.jsx';
import { openIssues } from '../components/RevisionIssues.jsx';
import RevisionInfo from '../components/RevisionInfo.jsx';
import RevisionChanges from '../components/RevisionChanges.jsx';
import RevisionReference from '../components/RevisionReference.jsx';
import RevisionIssues from '../components/RevisionIssues.jsx';
import RevisionLinks from '../components/RevisionLinks.jsx';
import { LayerListPanel } from './ItemLayerList.jsx';

const STAGE_LABEL = { prep: '준비', step1: 'STEP1', step2: 'STEP2', mto: 'MTO', done: '완료', none: '-' };

/** 오른쪽 패널: 고른 ITEM의 Concept 정보 */
function ItemDrawer({ state, dispatch, project, calc, calcs, go, notify, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const parent = state.projects.find((x) => x.id === project.parentId);
  const r = calc?.result;
  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={`${project.name} Concept`}>
        <div className="drawer-head">
          <div>
            <div className="small muted">{parent?.name || 'Product 없음'}</div>
            <h2>{project.name}</h2>
          </div>
          <span className="chg-head-r">
            <button type="button" className="btn small-btn primary" onClick={() => go('layers', project.id)}>Concept 열기</button>
            <button type="button" className="icon-btn sm" onClick={onClose} aria-label="닫기"><Icon name="close" size={15} /></button>
          </span>
        </div>
        <div className="drawer-stats">
          <span><span className="small muted">GDS</span><b className="num">{r ? fmtShort(r.partAGds) : '-'}</b></span>
          <span><span className="small muted">최종 MTO</span><b className="num">{r ? fmtShort(r.finalMto) : '-'}</b></span>
          <span><span className="small muted">리드타임</span><b className="num">{r ? `${r.leadTimeDays}일` : '-'}</b></span>
          <span><span className="small muted">Layer</span><b className="num">{project.layers.length}장</b></span>
        </div>
        <div className="drawer-body">
          <RevisionInfo key={`i${project.id}`} project={project} result={r} dispatch={dispatch} />
          <RevisionChanges key={`c${project.id}`} project={project} state={state} dispatch={dispatch} notify={notify} />
          <RevisionReference key={`r${project.id}`} state={state} dispatch={dispatch} project={project} calcs={calcs} />
          <LayerListPanel key={`l${project.id}`} state={state} dispatch={dispatch} project={project} calc={calc} go={go} notify={notify} />
          <RevisionIssues project={project} dispatch={dispatch} />
          <RevisionLinks project={project} dispatch={dispatch} notify={notify} />
        </div>
      </aside>
    </div>
  );
}

export default function RevisionDashboard({ state, dispatch, calcs, go, notify }) {
  const products = state.projects.filter((p) => p.kind === 'product');
  const all = useMemo(
    () => [...products.flatMap((pr) => state.projects.filter((p) => p.kind === 'revision' && p.parentId === pr.id)), ...state.projects.filter((p) => p.kind === 'revision' && !products.some((pr) => pr.id === p.parentId))],
    [state.projects],
  );
  const [fProduct, setFProduct] = useState('');
  const [fText, setFText] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [day, setDay] = useState(todayIso());
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const q = fText.trim().toLowerCase();
  const list = all.filter((p) => {
    if (fProduct && p.parentId !== fProduct) return false;
    if (q && !p.name.toLowerCase().includes(q) && !(p.meta?.requester || '').toLowerCase().includes(q)) return false;
    const t = p.meta?.target;
    if ((fFrom || fTo) && !t) return false;
    if (fFrom && t < fFrom) return false;
    if (fTo && t > fTo) return false;
    return true;
  });
  const filtered = fProduct || q || fFrom || fTo;
  const parentName = (p) => products.find((x) => x.id === p.parentId)?.name;
  const pick = (id) => {
    dispatch({ type: 'select', id });
    setOpen(id);
  };
  const openP = open && state.projects.find((p) => p.id === open);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Dashboard</h1></div>
        <div className="head-actions">
          <button type="button" className="btn primary" onClick={() => setAdding(true)} disabled={!products.length} title={products.length ? '' : 'Product를 먼저 만드세요'}><Icon name="plus" size={15} /> ITEM</button>
        </div>
      </div>

      <section className="panel rd-list">
        <div className="rd-filters">
          <label className="field">
            <span>Product</span>
            <select className="input" value={fProduct} onChange={(e) => setFProduct(e.target.value)}>
              <option value="">전체</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field rd-search">
            <span>ITEM</span>
            <input className="input" value={fText} placeholder="이름 · 요청자" onChange={(e) => setFText(e.target.value)} />
          </label>
          <div className="field">
            <span>MTO Target</span>
            <span className="rd-range">
              <DateField value={fFrom} onChange={setFFrom} label="Target 시작" placeholder="부터" />
              <span className="muted">~</span>
              <DateField value={fTo} onChange={setFTo} label="Target 끝" placeholder="까지" />
            </span>
          </div>
          <span className="rd-count small muted">{list.length}/{all.length}</span>
          {filtered && <button type="button" className="btn small-btn ghost" onClick={() => { setFProduct(''); setFText(''); setFFrom(''); setFTo(''); }}>초기화</button>}
        </div>
        {all.length ? (
          <div className="table-wrap">
            <table className="data-table rd-table">
              <thead>
                <tr>
                  <th>Product</th><th>ITEM</th><th>MTO Target</th><th>예상 MTO</th><th>Changes</th><th className="r">Layer</th><th>{fmtShort(day)} 단계</th><th className="r">Issue</th><th>요청자</th><th />
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const c = calcs[p.id];
                  const st = stageOn({ result: c?.result, marks: prepMarks(p) }, day);
                  const iss = openIssues(p).length;
                  return (
                    <tr key={p.id} className={open === p.id ? 'cur' : ''} onClick={() => pick(p.id)}>
                      <td className="small">{parentName(p) || <span className="tone-warn">Product 없음</span>}</td>
                      <td><b>{p.name}</b></td>
                      <td className="num">{p.meta?.target ? fmtShort(p.meta.target) : <span className="muted">-</span>}</td>
                      <td><TargetGap target={p.meta?.target} result={c?.result} /></td>
                      <td>
                        <span className="rd-chg">
                          {CHANGE_KINDS.filter(([k]) => p.changes?.[k]?.on).map(([k, label]) => (
                            <span key={k} className={`ref-chip ${k}`} title={kindLatest(p.changes, k) ? fmtShort(kindLatest(p.changes, k)) : ''}>{label}</span>
                          ))}
                          {!CHANGE_KINDS.some(([k]) => p.changes?.[k]?.on) && <span className="muted">-</span>}
                        </span>
                      </td>
                      <td className="num r">{p.layers.length}</td>
                      <td><span className={`rt-st ${st.key}`} title={st.text}>{STAGE_LABEL[st.key]}</span></td>
                      <td className="num r">{iss ? <Pill tone="warn">{iss}</Pill> : <span className="muted">-</span>}</td>
                      <td className="small">{p.meta?.requester || <span className="muted">-</span>}</td>
                      <td className="row-act-cell" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="icon-btn sm" onClick={() => go('layers', p.id)} title="Concept 열기" aria-label="Concept 열기"><Icon name="layers" size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
                {!list.length && <tr><td colSpan={10} className="muted small">조건에 맞는 ITEM이 없어요</td></tr>}
              </tbody>
            </table>
          </div>
        ) : <div className="chg-empty small muted">ITEM이 없어요</div>}
      </section>

      {list.length > 0 && (
        <section className="panel">
          <h2>
            <span className="layer-sum">
              일정
              <span className="rd-day"><DateField small value={day} onChange={(v) => v && setDay(v)} label="기준일" /><button type="button" className="btn small-btn ghost" onClick={() => setDay(todayIso())}>오늘</button></span>
            </span>
            <TimelineLegend />
          </h2>
          <RevisionTimeline state={state} calcs={calcs} projects={list} day={day} setDay={setDay} onPick={pick} selected={open} />
        </section>
      )}

      {openP && <ItemDrawer state={state} dispatch={dispatch} project={openP} calc={calcs[openP.id]} calcs={calcs} go={go} notify={notify} onClose={() => setOpen(null)} />}
      {adding && <AddItemModal state={state} dispatch={dispatch} calcs={calcs} defaultParent={fProduct || undefined} onClose={() => setAdding(false)} onCreated={(name) => notify(`${name}을 만들었어요`)} />}
    </div>
  );
}
