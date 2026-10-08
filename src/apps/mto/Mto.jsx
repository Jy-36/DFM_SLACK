// MTO: DFM Slack 안의 탭. 여러 Product(Part A/B)와 Revision(Product와 별개, 몇 장만)의 STEP2·MTO 일정을 묶음별로 계산한다.
// 계산은 lib/scheduler.js (mto-scheduling-agent 규칙 엔진을 옮긴 것), 입력이 바뀌면 바로 다시 계산한다.
import { useEffect, useMemo, useState } from 'react';
import { useMtoStore } from './lib/store.js';
import { computeProject } from './lib/projects.js';
import { BrandMark, Icon, Pill } from '../../shared/ui.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Overview from './pages/Overview.jsx';
import LayerList from './pages/LayerList.jsx';
import ScheduleTable from './pages/ScheduleTable.jsx';
import Rules from './pages/Rules.jsx';
import ProcessSheet from './pages/ProcessSheet.jsx';
import ProcessLayerList from './pages/ProcessLayerList.jsx';
import ItemLayerList from './pages/ItemLayerList.jsx';
import { NoneCard } from './pages/Overview.jsx';
import Mini from './pages/Mini.jsx';
import Widget from './pages/Widget.jsx';
import './mto.css';

export const MTO_VERSION = '0.4.0';

// Product · Revision 탭마다 메뉴 이름이 다르고, 공정·규칙은 같이 쓴다
const NAV = {
  product: [
    ['all', '전체 Product', 'dashboard'],
    ['overview', '일정 현황', 'gantt'],
    ['layers', 'Set List', 'layers'],
    ['table', 'Layer별 일정표', 'table'],
  ],
  revision: [
    ['all', '전체 Revision', 'dashboard'],
    ['overview', 'ITEM 일정 현황', 'gantt'],
    ['layers', 'ITEM Layer', 'layers'],
    ['table', 'Layer별 일정표', 'table'],
  ],
};
const SHARED_NAV = [
  ['process', '공정 · Layer SPEC', 'apps'],
  ['rules', '규칙', 'settings'],
];

/** 모든 묶음의 계산 결과: { [id]: calc } */
export function useCalcs(state) {
  return useMemo(() => Object.fromEntries(state.projects.map((p) => [p.id, computeProject(p, state.config, state.processes)])), [state.projects, state.processes, state.config]);
}

export default function Mto({ mode, setMode, widget, setWidget }) {
  const [state, dispatch] = useMtoStore();
  const calcs = useCalcs(state);
  const section = state.section;
  const project = state.projects.find((p) => p.id === state.activeId && p.kind === section) || null;
  const calc = project ? calcs[project.id] : null;
  const [tab, setTab] = useState(() => (state.projects.filter((p) => p.kind === section).length > 1 ? 'all' : 'overview'));
  const [toast, setToast] = useState(null);
  const [navMini, setNavMini] = useState(() => {
    try {
      return localStorage.getItem('mto.navMini') === '1';
    } catch {
      return false;
    }
  });
  const toggleNav = () =>
    setNavMini((v) => {
      try {
        localStorage.setItem('mto.navMini', v ? '0' : '1');
      } catch {
        /* 저장 불가 */
      }
      return !v;
    });

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), toast.action ? 6000 : 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const notify = (text, action) => setToast({ text, action });
  const go = (next, id) => {
    if (id) dispatch({ type: 'select', id });
    setTab(next);
  };
  const expand = (next = 'overview', id) => {
    go(next, id);
    setMode('full');
  };
  const props = { state, dispatch, project, calc, calcs, go, notify, section };
  const toastEl = toast && (
    <div className="toast" role="status">
      {toast.text}
      {toast.action && (
        <button type="button" className="toast-act" onClick={() => { toast.action.run(); setToast(null); }}>
          {toast.action.label}
        </button>
      )}
    </div>
  );

  // 요약·위젯은 지금 탭에 묶음이 없으면 다른 묶음이라도 보여 준다
  const anyProject = project || state.projects.find((p) => p.id === state.activeByKind.product) || state.projects[0] || null;
  const smallProps = { ...props, project: anyProject, calc: anyProject ? calcs[anyProject.id] : null };
  if ((mode === 'widget' || mode === 'compact') && !anyProject) {
    return (
      <div className="mini mto-mini fade-in">
        <section className="mini-card">
          <div className="mini-card-head"><h3>MTO</h3></div>
          <p className="small muted">아직 Product가 없어요. Window Mode에서 Product를 추가하세요.</p>
          <button type="button" className="btn primary" onClick={() => expand('all')}><Icon name="plus" size={15} /> Product 추가</button>
        </section>
      </div>
    );
  }
  if (mode === 'widget') return <Widget {...smallProps} setMode={setMode} widget={widget} setWidget={setWidget} />;

  if (mode === 'compact') {
    return (
      <>
        <Mini {...smallProps} expand={expand} />
        {toastEl}
      </>
    );
  }

  const issueCount = calc?.issues?.length || 0;
  const ofKind = state.projects.filter((p) => p.kind === section);
  const done = ofKind.filter((p) => calcs[p.id].result);
  const products = state.projects.filter((p) => p.kind === 'product');
  const items = state.projects.filter((p) => p.kind === 'revision');
  const nav = NAV[section];
  const perProject = ['overview', 'layers', 'table'].includes(tab);
  return (
    <div className={`app mto fade-in ${navMini ? 'nav-mini' : ''}`}>
      <nav className="nav" aria-label="MTO 메뉴">
        <div className="brand">
          <BrandMark icon="mask" />
          <div className="brand-text">
            <div className="brand-name">MTO</div>
            <div className="brand-sub">Product · Revision 일정 · v{MTO_VERSION}</div>
          </div>
        </div>
        <button type="button" className="nav-collapse" onClick={toggleNav} title={navMini ? '메뉴 펼치기' : '메뉴 접기'} aria-label={navMini ? '메뉴 펼치기' : '메뉴 접기'} aria-expanded={!navMini}>
          <Icon name={navMini ? 'navOpen' : 'navClose'} size={15} />
        </button>
        <div className={`sec-switch ${navMini ? 'mini' : ''}`} role="tablist" aria-label="Product · Revision">
          {[['product', 'Product', products.length], ['revision', 'Revision', items.length]].map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={section === k} className={k} onClick={() => { dispatch({ type: 'section', section: k }); if (tab === 'process' || tab === 'rules') setTab('all'); }} title={label}>
              {navMini ? label[0] : label}
              {!navMini && <span className="num">{n}</span>}
            </button>
          ))}
        </div>
        {nav.map(([key, label, icon], i) => (
          <div key={key} className="nav-item-wrap">
            {i === 1 && !navMini && <div className="nav-sec">선택 · {project ? project.name : '없음'}</div>}
            <button className="nav-btn" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)} title={navMini ? label : undefined}>
              <Icon name={icon} />
              <span className="nav-label">{label}</span>
              {key === 'layers' && issueCount > 0 && <span className="nav-dot" title={`입력 확인 ${issueCount}건`}>{issueCount}</span>}
              {key === 'all' && <span className="nav-count num">{ofKind.length}</span>}
            </button>
          </div>
        ))}
        {SHARED_NAV.map(([key, label, icon], i) => (
          <div key={key} className="nav-item-wrap">
            {i === 0 && !navMini && <div className="nav-sec">기준 정보 (Product · Revision 공통)</div>}
            <button className="nav-btn" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)} title={navMini ? label : undefined}>
              <Icon name={icon} />
              <span className="nav-label">{label}</span>
              {key === 'process' && <span className="nav-count num">{state.processes.length}</span>}
            </button>
          </div>
        ))}
        <div className="nav-foot">
          <span>
            <Pill tone="accent">Product {products.length} · ITEM {items.length}</Pill>
          </span>
          <span className="num">{section === 'product' ? 'Product' : 'ITEM'} 계산 완료 {done.length}/{ofKind.length}</span>
        </div>
      </nav>

      <main className="main">
        {tab === 'all' && <Portfolio {...props} />}
        {perProject && !project && <NoneCard {...props} />}
        {project && tab === 'overview' && <Overview {...props} />}
        {project && tab === 'layers' && (section === 'revision' ? <ItemLayerList key={project.id} {...props} /> : project.processId && state.processes.some((x) => x.id === project.processId) ? <ProcessLayerList key={project.id} {...props} /> : <LayerList key={project.id} {...props} />)}
        {project && tab === 'table' && <ScheduleTable {...props} />}
        {tab === 'process' && <ProcessSheet {...props} />}
        {tab === 'rules' && <Rules {...props} />}
      </main>
      {toastEl}
    </div>
  );
}
