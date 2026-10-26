// Techmap: DFM Slack 안의 탭. Process Master(번호의 원본) → DK(All Layer) → Option(Metal/Via Stack)을
// Ver · 작업날짜 단위로 관리하고, Site Request로 tf · layermap · drf · history를 검토 · 수정해 VWP 폴더 구조로 내보낸다.
// 계산은 lib/ (순수 함수, scripts/techmap-check.mjs로 확인). 왼쪽 메뉴는 Slack 채널처럼.
import { useEffect, useMemo, useState } from 'react';
import { NavTools, useNavHistory } from '../../shared/navHistory.jsx';
import { BrandMark, Icon, Pill } from '../../shared/ui.jsx';
import { useTechmapStore } from './lib/store.js';
import { computeRevision } from './lib/revision.js';
import { compareVer } from './lib/version.js';
import RevisionPage from './pages/RevisionPage.jsx';
import NewRevisionPage from './pages/NewRevisionPage.jsx';
import RegistryPage from './pages/RegistryPage.jsx';
import ComparePage from './pages/ComparePage.jsx';
import ClassesPage from './pages/ClassesPage.jsx';
import GraphPage from './pages/GraphPage.jsx';
import RulesPage from './pages/RulesPage.jsx';
import { MasterFilesPanel, NewProcessPage } from './pages/ProcessPage.jsx';
import Mini from './pages/Mini.jsx';
import Widget from './pages/Widget.jsx';
import './techmap.css';

export const TECHMAP_VERSION = '0.4.0';
const LOC_KEY = 'techmap.loc2';
const MINI_KEY = 'techmap.navMini';
const PROC_KEY = 'techmap.proc';
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null') ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 저장 불가 */
  }
};

export default function Techmap({ mode, setMode, widget, setWidget }) {
  const store = useTechmapStore();
  const { ws, settings } = store;
  const [loc, setLoc] = useState(() => read(LOC_KEY, { page: 'home' }));
  const [procId, setProcId] = useState(() => read(PROC_KEY, 'SF3'));
  const [toast, setToast] = useState(null);
  const [navMini, setNavMini] = useState(() => read(MINI_KEY, false));
  const nav = useNavHistory({ ...loc, proc: procId }, (e) => { setLoc(e); if (e.proc) setProcId(e.proc); }, mode === 'full');
  useEffect(() => write(LOC_KEY, loc), [loc]);
  useEffect(() => write(PROC_KEY, procId), [procId]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);
  // 처음 실행(DEMO)이면 진행 중 작업을 연다
  useEffect(() => {
    if (store.firstRev) setLoc({ page: 'rev', id: store.firstRev });
  }, [store.firstRev]);

  const procPick = ws ? ws.processes.find((p) => p.id === (loc.proc || procId)) || ws.processes.find((p) => p.master) || ws.processes[0] : null;
  const openRevs = ws ? ws.revisions.filter((r) => r.status !== 'approved') : [];
  const rev = ws
    ? (loc.page === 'rev' && ws.revisions.find((r) => r.id === loc.id)) || (mode !== 'full' ? openRevs.find((r) => r.id === loc.id) || openRevs[0] || ws.revisions[0] : null) || null
    : null;
  const c = useMemo(() => (rev ? computeRevision(ws, rev, settings) : null), [rev, ws, settings]);

  const go = (next) => {
    if (next.proc) setProcId(next.proc);
    setLoc(next);
  };
  const expand = (next) => {
    if (next) go(next);
    setMode('full');
  };
  const notify = (text) => setToast(text);
  const toggleNav = () => setNavMini((v) => (write(MINI_KEY, !v), !v));
  const toastEl = toast && <div className="toast" role="status">{toast}</div>;

  if (!ws) return <div className="mini fade-in"><section className="mini-card"><p className="small muted">Techmap 불러오는 중…</p></section></div>;
  if (mode === 'widget') return <Widget rev={rev} c={c} setMode={setMode} widget={widget} setWidget={setWidget} />;
  if (mode === 'compact') return <><Mini ws={ws} store={store} rev={rev} c={c} expand={expand} notify={notify} select={(id) => setLoc({ page: 'rev', id })} />{toastEl}</>;

  const page = loc.page === 'home' ? (rev ? 'rev' : 'registry') : loc.page;
  // 작업 · 그래프를 열면 왼쪽 노드도 그 작업의 노드로
  const viewProc = page === 'rev' && rev ? rev.process : page === 'graph' ? ws.dks.find((d) => d.id === loc.dk)?.process : null;
  const proc = (viewProc && ws.processes.find((p) => p.id === viewProc)) || procPick;
  // 왼쪽 메뉴: 이 노드의 DK → Ver → 작업
  const dks = ws.dks.filter((d) => d.process === proc?.id);
  const masterRevs = ws.revisions.filter((r) => r.kind === 'master' && r.process === proc?.id);
  const counts = (r) => {
    if (r.status === 'approved') return null;
    const x = r === rev ? c : computeRevision(ws, r, settings);
    return x && !x.error ? x.counts : null;
  };
  const chan = (r) => {
    const n = counts(r);
    return (
      <button key={r.id} className="nav-btn tm-chan" aria-current={page === 'rev' && rev?.id === r.id ? 'page' : undefined} onClick={() => go({ page: 'rev', id: r.id })} title={r.folder}>
        <span className="tm-hash">#</span>
        <span className="nav-label">{r.kind === 'dk' ? `${r.ver} · ${r.workDate.slice(4)}` : `Master · ${r.workDate.slice(4)}`}</span>
        {r.status === 'approved' ? <span className="tm-pip done">✓</span> : n && (
          <>
            {n.NEEDS_REVIEW > 0 && <span className="tm-pip rev">{n.NEEDS_REVIEW}</span>}
            {n.ERROR > 0 && <span className="tm-pip err">{n.ERROR}</span>}
            {!n.NEEDS_REVIEW && !n.ERROR && <span className="tm-pip new">작업</span>}
          </>
        )}
      </button>
    );
  };

  return (
    <div className={`app techmap fade-in ${navMini ? 'nav-mini' : ''}`}>
      <nav className="nav" aria-label="Techmap 메뉴">
        <div className="brand">
          <BrandMark icon="techmap" />
          <div className="brand-text">
            <div className="brand-name">Techmap</div>
            <div className="brand-sub">v{TECHMAP_VERSION}</div>
          </div>
          <NavTools nav={nav} navMini={navMini} toggleNav={toggleNav} />
        </div>

        {!navMini && (
          <div className="tm-proc-switch" role="tablist" aria-label="노드">
            {ws.processes.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={p.id === proc?.id} className={p.master ? '' : 'empty'} title={p.master ? `${p.name} · DK ${ws.dks.filter((d) => d.process === p.id).length}` : `${p.name} · Master 미등록`} onClick={() => go({ page: loc.page === 'rev' || loc.page === 'home' || loc.page === 'graph' ? 'registry' : loc.page, proc: p.id })}>{p.name}</button>
            ))}
            <button type="button" className="add" onClick={() => go({ page: 'process-new' })} title="노드 추가" aria-label="노드 추가"><Icon name="plus" size={13} /></button>
          </div>
        )}

        <button className="nav-btn" aria-current={page === 'new' ? 'page' : undefined} onClick={() => go({ page: 'new' })} title={navMini ? '새 작업' : undefined}>
          <Icon name="plus" />
          <span className="nav-label">새 작업</span>
        </button>

        {!navMini && <div className="tm-nav-sec">{proc?.name} Master{proc && !proc.master ? ' · 미등록' : ''}</div>}
        {[['registry', '번호 대장', 'table'], ['compare', 'Master 비교', 'layers'], ['classes', '분류 · 기능키', 'apps']].map(([k, label, icon]) => (
          <button key={k} className="nav-btn" aria-current={page === k ? 'page' : undefined} onClick={() => go({ page: k })} title={navMini ? label : undefined}>
            <Icon name={icon} />
            <span className="nav-label">{label}</span>
          </button>
        ))}
        {masterRevs.length > 0 && <div className="tm-chan-list short">{masterRevs.map(chan)}</div>}

        <div className="tm-chan-list">
          {dks.map((d) => {
            const revs = ws.revisions.filter((r) => r.kind === 'dk' && r.dk === d.id).sort((a, b) => compareVer(b.ver, a.ver) || b.workDate.localeCompare(a.workDate));
            return (
              <div key={d.id} className="tm-dk">
                <button className="nav-btn tm-dk-head" aria-current={page === 'graph' && loc.dk === d.id ? 'page' : undefined} onClick={() => go({ page: 'graph', dk: d.id })} title={`${d.id} 버전 그래프`}>
                  <Icon name="gantt" />
                  <span className="nav-label">{d.id} 그래프</span>
                  <span className="tm-nav-count">{revs.length}</span>
                </button>
                {revs.map(chan)}
              </div>
            );
          })}
          {!dks.length && !navMini && <p className="tm-nav-empty">{proc?.master ? `${proc.name} 아래 DK가 아직 없어요 — 새 작업` : `${proc?.name} Master를 먼저 등록하세요`}</p>}
        </div>

        <div className="tm-nav-common">
          <button className="nav-btn" aria-current={page === 'rules' ? 'page' : undefined} onClick={() => go({ page: 'rules' })} title={navMini ? '처리 규칙 · 작업공간' : undefined}>
            <Icon name="settings" />
            <span className="nav-label">처리 규칙 · 작업공간</span>
          </button>
        </div>
        <div className="nav-foot">
          <span><Pill tone="accent">작업중 {openRevs.length} · 전체 {ws.revisions.length}</Pill></span>
        </div>
      </nav>

      <main className="main">
        {page === 'rev' && rev && c && <RevisionPage key={rev.id} ws={ws} rev={rev} c={c} store={store} notify={notify} go={go} />}
        {page === 'rev' && !rev && <div className="page"><div className="banner">작업을 찾지 못했어요. 왼쪽에서 고르거나 새 작업을 만드세요.</div></div>}
        {page === 'new' && proc?.master && <NewRevisionPage key={`${proc.id}-${loc.kind}-${loc.ref}-${loc.ver}`} ws={ws} proc={proc} store={store} notify={notify} go={go} initial={loc} />}
        {['registry', 'compare', 'classes', 'new'].includes(page) && proc && !proc.master && <NewProcessPage key={proc.id} proc={proc} store={store} notify={notify} go={go} />}
        {page === 'registry' && proc?.master && <><RegistryPage proc={proc} go={go} /><div className="page tm-after"><MasterFilesPanel proc={proc} /></div></>}
        {page === 'compare' && proc?.master && <ComparePage ws={ws} proc={proc} go={go} />}
        {page === 'graph' && <GraphPage key={loc.dk} ws={ws} dk={loc.dk} store={store} notify={notify} go={go} />}
        {page === 'classes' && proc?.master && <ClassesPage proc={proc} store={store} notify={notify} />}
        {page === 'process-new' && <NewProcessPage store={store} notify={notify} go={go} />}
        {page === 'rules' && <RulesPage store={store} notify={notify} />}
      </main>
      {toastEl}
    </div>
  );
}
