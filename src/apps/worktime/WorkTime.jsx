// WorkTime: DFM Slack 안의 탭 하나. 요약(휴대폰 크기)·확장 화면 전환은 셸이 정한 mode를 따른다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from './lib/store.js';
import { planSummary, autoReflow, pinViolations } from './lib/goal.js';
import { signed, md, dur } from './pages/planner/format.js';
import { fmtClock, minutesOfDay, ymd } from './lib/time.js';
import { BrandMark, Icon, Pill } from '../../shared/ui.jsx';
import Mini from './pages/Mini.jsx';
import Widget from './pages/Widget.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Records from './pages/Records.jsx';
import Planner from './pages/Planner.jsx';
import Sync from './pages/Sync.jsx';
import Settings from './pages/Settings.jsx';

export const WORKTIME_VERSION = '0.24.0';

const NAV = [
  ['dashboard', '현황'],
  ['records', '근무기록'],
  ['plan', '근무 계획'],
  ['sync', '동기화'],
  ['settings', '설정'],
];

export default function WorkTime({ mode, setMode, widget, setWidget }) {
  const [state, dispatch] = useAppStore();
  const [tab, setTab] = useState('dashboard');
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [toast, setToast] = useState(null);
  // 근무기록에서 아직 반영하지 않은 수정 (다른 메뉴에 다녀와도 유지)
  const [recDraft, setRecDraft] = useState({});
  const draftCount = Object.keys(recDraft).length;
  // 왼쪽 메뉴 접기 (확장 화면에서 달력을 넓게)
  const [navMini, setNavMini] = useState(() => {
    try {
      return localStorage.getItem('worktime.navMini') === '1';
    } catch {
      return false;
    }
  });
  const toggleNav = () =>
    setNavMini((v) => {
      try {
        localStorage.setItem('worktime.navMini', v ? '0' : '1');
      } catch {
        /* 저장 불가 */
      }
      return !v;
    });

  // 근무 중 시간은 30초마다 갱신
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // 공통 summary: 계획 휴가(planLeaves)와 직접 정한 날(planPins)까지 반영 (GUIDE-plan-mechanism §2.5)
  const summary = useMemo(
    () =>
      planSummary({
        year: now.getFullYear(),
        month: now.getMonth(),
        records: state.records,
        rules: state.rules,
        plans: state.plans,
        pins: state.planPins,
        leaves: state.planLeaves,
        goal: state.planGoal,
        now,
      }),
    [state.records, state.rules, state.plans, state.planPins, state.planLeaves, state.planGoal, now],
  );

  // 날짜가 바뀌면 어제 이전 계획 데이터 정리 (GUIDE-plan-mechanism §8.4)
  const todayKey = ymd(now);
  useEffect(() => {
    dispatch({ type: 'plan/prunePast', today: todayKey });
  }, [todayKey, dispatch]);

  // 자동 날 다시 맞추기: 기록·날짜·설정이 바뀌면 (사용자가 직접 바꾼 건 근무 계획 화면이 처리) — GUIDE §6.6
  const prevRef = useRef(null);
  useEffect(() => {
    const prev = prevRef.current;
    if (prev && prev.records === state.records && prev.rules === state.rules && prev.todayKey === todayKey) return; // StrictMode 두 번 실행
    prevRef.current = { records: state.records, rules: state.rules, todayKey };
    const r = autoReflow(summary, state.rules, state.plans, state.planPins, state.planGoal);
    const rulesChanged = prev && prev.rules !== state.rules;
    const extra = [];
    if (rulesChanged) {
      const bad = pinViolations(summary, state.rules, state.planPins, state.planGoal);
      if (bad.length) extra.push(`설정이 바뀌어 직접 정한 ${bad.length}일이 인정 시간대를 벗어났어요 (주황 표시) — 그날을 고쳐 주세요`);
    }
    if (!r) {
      for (const t of extra) dispatch({ type: 'plan/notice', text: t });
      return;
    }
    if (r.first) {
      dispatch({ type: 'plan/reflow', first: true, plans: r.plans });
      return;
    }
    const why = !prev ? '목표에 맞게' : rulesChanged ? '설정이 바뀌어' : prev.todayKey !== todayKey ? '날짜가 넘어가' : '기록이 바뀌어';
    const n = r.changes.length;
    const per = Math.round(r.changes.reduce((s, c) => s + (c.to - c.from), 0) / n / 10) * 10;
    const keep = r.keep.length ? ` · ${md(r.keep[0])}은 그대로` : '';
    const left = Math.abs(r.leftover) >= 10 ? ` · 목표와 ${dur(Math.abs(r.leftover))} 차이는 남음` : '';
    dispatch({ type: 'plan/reflow', plans: r.plans, text: `${why} 남은 ${n}일을 ${per ? `${signed(per)}씩` : '조금씩'} 맞췄어요${keep}${left}`, extra });
    // summary 는 records·rules·todayKey 에서 같이 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.records, state.rules, todayKey]);

  const go = (next, nextView) => {
    if (nextView) setView(nextView);
    else if (next === 'records') setView({ y: now.getFullYear(), m: now.getMonth() });
    setTab(next);
  };

  const expand = (next = 'dashboard') => {
    go(next);
    setMode('full');
  };

  const props = { state, dispatch, summary, now, go, notify: setToast };
  const toastEl = toast && <div className="toast" role="status">{toast}</div>;

  if (mode === 'widget') {
    return <Widget {...props} setMode={setMode} widget={widget} setWidget={setWidget} />;
  }

  if (mode === 'compact') {
    return (
      <>
        <Mini {...props} expand={expand} />
        {toastEl}
      </>
    );
  }

  return (
    <div className={`app fade-in ${navMini ? 'nav-mini' : ''}`}>
      <nav className="nav" aria-label="WorkTime 메뉴">
        <div className="brand">
          <BrandMark />
          <div className="brand-text">
            <div className="brand-name">WorkTime</div>
            <div className="brand-sub">선택근무제 근무시간 · v{WORKTIME_VERSION}</div>
          </div>
        </div>
        <button type="button" className="nav-collapse" onClick={toggleNav} title={navMini ? '메뉴 펼치기' : '메뉴 접기'} aria-label={navMini ? '메뉴 펼치기' : '메뉴 접기'} aria-expanded={!navMini}>
          <Icon name={navMini ? 'navOpen' : 'navClose'} size={15} />
        </button>
        {NAV.map(([key, label]) => (
          <button key={key} className="nav-btn" aria-current={tab === key ? 'page' : undefined} onClick={() => go(key)} title={navMini ? label : undefined}>
            <Icon name={key} />
            <span className="nav-label">{label}</span>
            {key === 'records' && draftCount > 0 && <span className="nav-dot" title={`반영 안 한 수정 ${draftCount}건`}>{draftCount}</span>}
          </button>
        ))}
        <div className="nav-foot">
          <span>
            <Pill tone={state.dataMode === 'portal' ? 'accent' : 'plan'}>
              {state.dataMode === 'portal' ? '사내 데이터' : state.dataMode === 'manual' ? '붙여넣은 데이터' : '가짜 데이터'}
            </Pill>
          </span>
          <span className="num">
            지금 {fmtClock(minutesOfDay(now))} · 동기화{' '}
            {state.lastSync ? new Date(state.lastSync).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '안 함'}
          </span>
        </div>
      </nav>

      <main className="main">
        {tab === 'dashboard' && <Dashboard {...props} />}
        {tab === 'records' && <Records {...props} view={view} setView={setView} draft={recDraft} setDraft={setRecDraft} />}
        {tab === 'plan' && <Planner {...props} />}
        {tab === 'sync' && <Sync {...props} />}
        {tab === 'settings' && <Settings {...props} />}
      </main>

      {toastEl}
    </div>
  );
}
