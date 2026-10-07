// MTO: DFM Slack 안의 탭. Part A GDS 입고일 + Layer List → Layer별 STEP2 시작일·MTO 날짜, 간트, 병목 분석.
// 계산은 lib/scheduler.js (mto-scheduling-agent 규칙 엔진을 옮긴 것), 입력이 바뀌면 바로 다시 계산한다.
import { useEffect, useMemo, useState } from 'react';
import { useMtoStore } from './lib/store.js';
import { buildSchedule } from './lib/scheduler.js';
import { validateLayers } from './lib/layers.js';
import { analyze } from './lib/insights.js';
import { BrandMark, Icon, Pill } from '../../shared/ui.jsx';
import Overview from './pages/Overview.jsx';
import LayerList from './pages/LayerList.jsx';
import ScheduleTable from './pages/ScheduleTable.jsx';
import Rules from './pages/Rules.jsx';
import Mini from './pages/Mini.jsx';
import Widget from './pages/Widget.jsx';
import './mto.css';

export const MTO_VERSION = '0.1.0';

const NAV = [
  ['overview', '일정 현황', 'gantt'],
  ['layers', 'Layer List', 'layers'],
  ['table', 'Layer별 일정표', 'table'],
  ['rules', '규칙', 'settings'],
];

/** 입력 → 계산 결과. 입력에 문제가 있으면 { issues } 만 */
export function useSchedule(state) {
  return useMemo(() => {
    const { gds, layers, config } = state;
    if (!layers.length) return { empty: true };
    const issues = validateLayers(layers, Object.keys(config.step2Tat));
    if (!gds) issues.unshift({ index: -1, field: 'gds', msg: 'Part A GDS 입고일을 입력하세요.' });
    if (issues.length) return { issues };
    try {
      const result = buildSchedule(gds, layers, config);
      return { result, analysis: analyze(result, layers) };
    } catch (e) {
      return { issues: [{ index: -1, msg: e.message }] };
    }
  }, [state.gds, state.layers, state.config]);
}

export default function Mto({ mode, setMode, widget, setWidget }) {
  const [state, dispatch] = useMtoStore();
  const calc = useSchedule(state);
  const [tab, setTab] = useState('overview');
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
  const go = (next) => setTab(next);
  const expand = (next = 'overview') => {
    setTab(next);
    setMode('full');
  };
  const props = { state, dispatch, calc, go, notify };
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
  return (
    <div className={`app mto fade-in ${navMini ? 'nav-mini' : ''}`}>
      <nav className="nav" aria-label="MTO 메뉴">
        <div className="brand">
          <BrandMark icon="mask" />
          <div className="brand-text">
            <div className="brand-name">MTO</div>
            <div className="brand-sub">STEP2 · MTO 일정 · v{MTO_VERSION}</div>
          </div>
        </div>
        <button type="button" className="nav-collapse" onClick={toggleNav} title={navMini ? '메뉴 펼치기' : '메뉴 접기'} aria-label={navMini ? '메뉴 펼치기' : '메뉴 접기'} aria-expanded={!navMini}>
          <Icon name={navMini ? 'navOpen' : 'navClose'} size={15} />
        </button>
        {NAV.map(([key, label, icon]) => (
          <button key={key} className="nav-btn" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)} title={navMini ? label : undefined}>
            <Icon name={icon} />
            <span className="nav-label">{label}</span>
            {key === 'layers' && issueCount > 0 && <span className="nav-dot" title={`입력 확인 ${issueCount}건`}>{issueCount}</span>}
          </button>
        ))}
        <div className="nav-foot">
          <span>
            {calc.result ? <Pill tone="accent">최종 MTO {calc.result.finalMto.slice(5).replace('-', '/')}</Pill> : <Pill tone="neutral">계산 전</Pill>}
          </span>
          <span className="num">
            Layer {state.layers.length}장 · MTO {state.config.mtoPerDay}장/일 · STEP2 {state.config.step2Concurrency ?? '무제한'}
          </span>
        </div>
      </nav>

      <main className="main">
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'layers' && <LayerList {...props} />}
        {tab === 'table' && <ScheduleTable {...props} />}
        {tab === 'rules' && <Rules {...props} />}
      </main>
      {toastEl}
    </div>
  );
}
