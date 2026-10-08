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
import Mini from './pages/Mini.jsx';
import Widget from './pages/Widget.jsx';
import './mto.css';

export const MTO_VERSION = '0.2.0';

const NAV = [
  ['all', '전체 일정', 'dashboard'],
  ['overview', '일정 현황', 'gantt'],
  ['layers', 'Layer List', 'layers'],
  ['table', 'Layer별 일정표', 'table'],
  ['rules', '규칙', 'settings'],
];

/** 모든 묶음의 계산 결과: { [id]: calc } */
export function useCalcs(state) {
  return useMemo(() => Object.fromEntries(state.projects.map((p) => [p.id, computeProject(p, state.config)])), [state.projects, state.config]);
}

export default function Mto({ mode, setMode, widget, setWidget }) {
  const [state, dispatch] = useMtoStore();
  const calcs = useCalcs(state);
  const project = state.projects.find((p) => p.id === state.activeId) || state.projects[0];
  const calc = calcs[project.id];
  const [tab, setTab] = useState(() => (state.projects.length > 1 ? 'all' : 'overview'));
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
  const props = { state, dispatch, project, calc, calcs, go, notify };
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

  if (mode === 'widget') return <Widget {...props} setMode={setMode} widget={widget} setWidget={setWidget} />;

  if (mode === 'compact') {
    return (
      <>
        <Mini {...props} expand={expand} />
        {toastEl}
      </>
    );
  }

  const issueCount = calc.issues?.length || 0;
  const done = state.projects.filter((p) => calcs[p.id].result);
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
        {NAV.map(([key, label, icon], i) => (
          <div key={key} className="nav-item-wrap">
            {i === 1 && !navMini && <div className="nav-sec">선택한 묶음 · {project.name}</div>}
            <button className="nav-btn" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)} title={navMini ? label : undefined}>
              <Icon name={icon} />
              <span className="nav-label">{label}</span>
              {key === 'layers' && issueCount > 0 && <span className="nav-dot" title={`입력 확인 ${issueCount}건`}>{issueCount}</span>}
              {key === 'all' && <span className="nav-count num">{state.projects.length}</span>}
            </button>
          </div>
        ))}
        <div className="nav-foot">
          <span>
            <Pill tone="accent">Product {state.projects.filter((p) => p.kind === 'product').length} · Revision {state.projects.filter((p) => p.kind === 'revision').length}</Pill>
          </span>
          <span className="num">계산 완료 {done.length}/{state.projects.length}</span>
        </div>
      </nav>

      <main className="main">
        {tab === 'all' && <Portfolio {...props} />}
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'layers' && <LayerList {...props} />}
        {tab === 'table' && <ScheduleTable {...props} />}
        {tab === 'rules' && <Rules {...props} />}
      </main>
      {toastEl}
    </div>
  );
}
