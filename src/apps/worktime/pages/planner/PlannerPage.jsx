// 근무 계획 (Window 모드 전용). 화면: GUIDE-ui-window.md, 동작: GUIDE-plan-mechanism.md
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planSummary, todayAdvice, distributeByGoal, autoDaysOf, monthDrift, excessForGoal } from '../../lib/goal.js';
import { monthLabel } from '../../lib/time.js';
import { dayView, bulkResult, buildSuggestion, goalTitle } from './model.js';
import { md, dur, signed, gapText } from './format.js';
import { Seg, useWidth } from './ui.jsx';
import CalendarView from './CalendarView.jsx';
import ListView from './ListView.jsx';
import FillPreview from './FillPreview.jsx';
import { SuggestBar } from './Suggest.jsx';

const VIEW_KEY = 'worktime.planView';
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'calendar';
  } catch {
    return 'calendar';
  }
};


export default function PlannerPage({ state, dispatch, now, go }) {
  const { rules, records, plans, planPins: pins, planLeaves: leaves, planGoal: goal } = state;
  const rootRef = useRef(null);
  const width = useWidth(rootRef);
  const [view, setViewRaw] = useState(readView);
  const [month, setMonth] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [sel, setSel] = useState([]); // 선택한 날 (순서 = 고른 순서)
  const [anchor, setAnchor] = useState(null);
  const [sug, setSug] = useState(null); // { baseDiff, keys, label, fromKey, panelKey, forced }
  const [hover, setHover] = useState(null); // 제안 버튼에 올렸을 때 바뀔 날 { [key]: 변화 }
  const [fill, setFill] = useState(null); // 채우기 미리보기 { goal }
  const [toast, setToast] = useState(null); // { text, undo }
  const [bulk, setBulk] = useState({});

  const setView = (v) => {
    setViewRaw(v);
    setBulk({});
    if (v === 'calendar') setSel((s) => (s.length ? s.slice(-1) : [summary.todayKey]));
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 저장 불가 */
    }
  };

  const curY = now.getFullYear();
  const curM = now.getMonth();
  const isCurrent = month.y === curY && month.m === curM;
  const isNextMonth = month.y * 12 + month.m > curY * 12 + curM;
  const isPastMonth = month.y * 12 + month.m < curY * 12 + curM;

  const summary = useMemo(
    () => planSummary({ year: month.y, month: month.m, records, rules, plans, pins, leaves, goal, now }),
    [month.y, month.m, records, rules, plans, pins, leaves, goal, now],
  );
  const advice = useMemo(() => (isCurrent ? todayAdvice(summary, rules, pins, goal) : null), [isCurrent, summary, rules, pins, goal]);
  const ctx = useMemo(
    () => ({ records, rules, goal, pins, leaves, plans, summary, advice, isNextMonth, isPastMonth, now, recentOuts: state.planRecentOuts }),
    [records, rules, goal, pins, leaves, plans, summary, advice, isNextMonth, isPastMonth, now, state.planRecentOuts],
  );
  const views = useMemo(() => summary.days.map((d) => dayView(d, ctx)), [summary, ctx]);
  const viewOf = useMemo(() => Object.fromEntries(views.map((v) => [v.key, v])), [views]);
  const drift = isCurrent ? monthDrift(summary, rules, goal) : 0;
  const suggestion = useMemo(() => (isCurrent ? buildSuggestion(sug, ctx) : null), [isCurrent, sug, ctx]);

  // 처음 열 때 이번 달에 자동 값이 하나도 없으면 묻지 않고 채움 (GUIDE §4.3)
  useEffect(() => {
    if (!isCurrent) return;
    const autos = autoDaysOf(summary, rules, pins);
    if (autos.length && autos.every((d) => plans[d.key] == null)) {
      const r = distributeByGoal(summary, rules, plans, pins, goal);
      dispatch({ type: 'plan/fill', plans: r.plans, history: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrent]);

  // 화면에 들어오면 오늘(주말이면 다음 근무일) 선택
  useEffect(() => {
    if (sel.length) return;
    const first = views.find((v) => v.state === 'today') || views.find((v) => v.key >= summary.todayKey && v.selectable) || views[0];
    if (first) setSel([first.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.y, month.m]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), toast.undo ? 6000 : 2800);
    return () => clearTimeout(id);
  }, [toast]);

  // 동기화로 계획 휴가가 사이트 기록으로 바뀐 알림
  useEffect(() => {
    if (state.planNotices?.length) {
      setToast({ text: state.planNotices.join(' · ') });
      dispatch({ type: 'plan/noticesClear' });
    }
  }, [state.planNotices, dispatch]);

  const undo = useCallback(
    (restoreSug) => {
      dispatch({ type: 'plan/undo' });
      setToast({ text: '되돌렸어요' });
      if (restoreSug) setSug(restoreSug);
    },
    [dispatch],
  );

  /** 편집 하나를 제안에 쌓는다 (이번 변경은 제안이 뜨기 전 값 대비 누적) */
  const track = (keys, label, panelKey) => {
    if (!isCurrent) return;
    setSug((s) =>
      s && !s.forced
        ? { ...s, keys: [...new Set([...s.keys, ...keys])], label, fromKey: keys[keys.length - 1], panelKey }
        : { baseDiff: summary.projectedDiff, keys, label, fromKey: keys[keys.length - 1], panelKey },
    );
  };

  const applyPin = (key, pin, label) => {
    track([key], `${md(key)} ${label}`, key);
    dispatch({ type: 'plan/pin', key, pin, label });
    setToast({ text: `${md(key)} ${label}`, undo: () => undo() });
  };

  const applyLeave = (keys, leave, leaveMin) => {
    const def = leave ? rules.leaveTypes[leave] : null;
    const label = leave ? `${def.label}${def.variable ? ` ${Math.round((leaveMin ?? def.credit) / 60)}h` : ''} · 계획` : '휴가 취소';
    track(keys, keys.length > 1 ? label : `${md(keys[0])} ${label}`, null);
    dispatch({ type: 'plan/leave', keys, leave, leaveMin, fullDay: !!def && !def.variable, label });
    setToast({ text: `${keys.length > 1 ? `${keys.length}일` : md(keys[0])} ${label}`, undo: () => undo() });
  };

  const selectedViews = sel.map((k) => viewOf[k]).filter(Boolean);
  const applyBulk = () => {
    const targets = selectedViews.filter((v) => v.selectable && v.r);
    if (bulk.leave) {
      const lt = bulk.leave === 'none' ? null : bulk.leave;
      applyLeave(targets.map((v) => v.key), lt, lt === 'hourly' ? rules.leaveTypes.hourly.credit : undefined);
    } else {
      const res = bulkResult(targets, bulk, ctx);
      const keys = Object.keys(res.pins);
      if (keys.length) {
        track(keys, `${keys.length}일을 바꿨어요`, null);
        dispatch({ type: 'plan/pinMany', pins: res.pins, label: `${keys.length}일 바꿈` });
      }
      setToast({
        text: `${keys.length}일을 바꿨어요${res.blocked.length ? ` · ${res.blocked.length}일은 못 바꿈 (${res.blocked[0].why})` : ''}`,
        undo: keys.length ? () => undo() : null,
      });
    }
    setBulk({});
    setSel(view === 'list' ? [] : sel.slice(-1));
  };

  const applySpread = (opt) => {
    const saved = sug;
    dispatch({ type: 'plan/applySpread', plans: opt.spread.plans, label: opt.title });
    dispatch({ type: 'plan/spreadMode', mode: opt.mode });
    setSug(null);
    setHover(null);
    const left = opt.spread.leftover && Math.abs(opt.spread.leftover) >= 10 ? ` · ${dur(Math.abs(opt.spread.leftover))}은 월말 칩으로 남았어요` : '';
    setToast({ text: `${opt.title} · ${opt.spread.changes.length}일 맞췄어요${left}`, undo: () => undo(saved) });
  };

  const dismissSug = () => {
    setSug(null);
    setHover(null);
  };

  const fitGoal = () => setSug({ baseDiff: summary.projectedDiff, keys: [], label: '목표에 맞추기', forced: true, panelKey: null });

  const applyFill = (r, draftGoal) => {
    dispatch({ type: 'plan/fill', plans: r.plans, goal: draftGoal, label: '조건대로 채움' });
    const n = Object.keys(r.plans).filter((k) => r.plans[k] !== (summary.effPlans[k] ?? null)).length;
    setFill(null);
    setSug(null);
    setToast({ text: `${n}일을 채웠어요`, undo: () => undo() });
  };

  const rebuild = () => {
    const r = distributeByGoal(summary, rules, plans, pins, goal);
    dispatch({ type: 'plan/fill', plans: r.plans, label: '처음부터 다시 짬' });
    setSug(null);
    setToast({ text: '자동 날을 처음부터 다시 짰어요 (직접 정한 날은 그대로)', undo: () => undo() });
  };

  /** 날짜 선택: 클릭 · Shift(이어서) · Ctrl(골라서) */
  const select = (key, e = {}) => {
    const v = viewOf[key];
    if (!v) return;
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && v.selectable && sel.length) {
      if (e.shiftKey && anchor) {
        const a = views.findIndex((x) => x.key === anchor);
        const b = views.findIndex((x) => x.key === key);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = views.slice(lo, hi + 1).filter((x) => x.selectable && !x.weekend).map((x) => x.key);
        setSel([...new Set([...sel.filter((k) => viewOf[k]?.selectable), ...range])]);
      } else {
        const base = sel.filter((k) => viewOf[k]?.selectable);
        setSel(base.includes(key) ? base.filter((k) => k !== key) : [...base, key]);
        setAnchor(key);
      }
      return;
    }
    setSel([key]);
    setAnchor(key);
    setBulk({});
  };

  // 키보드: Ctrl+Z 되돌리기(입력칸 밖에서만), Esc
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !typing) {
        if (!state.planHistory.length) return;
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape' && !typing) {
        if (fill) setFill(null);
        else if (view === 'list' && sel.length) {
          setSel([]);
          setBulk({});
        } else if (sel.length > 1) {
          setSel(sel.slice(-1));
          setBulk({});
        } else if (sug) dismissSug();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const moveMonth = (delta) => {
    const t = month.y * 12 + month.m + delta;
    setMonth({ y: Math.floor(t / 12), m: t % 12 });
    setSel([]);
    setSug(null);
    setFill(null);
  };

  const wantedExcess = excessForGoal(goal, rules);
  const common = {
    ctx, views, viewOf, sel, select, setSel, summary, rules, goal, dispatch, go, width, isCurrent, isNextMonth, isPastMonth,
    applyPin, applyLeave, applyBulk, bulk, setBulk, selectedViews, suggestion, sug, applySpread, dismissSug, hover, setHover,
    openFill: () => setFill({ goal: { ...goal } }), rebuild, setToast, wantedExcess, advice, lastMode: state.planSpreadMode,
  };

  // 제안 위치: 상세 패널·서랍 안 (그날이 열려 있을 때) 또는 아래 막대 (GUIDE §6.4)
  const panelShows = view === 'calendar' ? width >= 880 && sel.length === 1 && sug?.panelKey && sel[0] === sug.panelKey : width >= 1100 && !!sug?.panelKey;
  const inBar = suggestion && !fill && !panelShows && !(view === 'calendar' && sel.length > 1);
  const narrowClass = width >= 1180 ? 'pl2--w3' : width >= 880 ? 'pl2--w2' : 'pl2--w1';
  const listNarrow = width < 1100;

  return (
    <div className={`pl2 ${narrowClass} ${listNarrow ? 'pl2--list-narrow' : ''} ${inBar ? 'pl2--hasbar' : ''}`} ref={rootRef}>
      <header className="pl2-head">
        <h1 className="pl2-title">
          근무 계획
          <span className="pl2-month">
            <button type="button" className="pl2-mnav" onClick={() => moveMonth(-1)} aria-label="지난 달">
              ‹
            </button>
            {monthLabel(month.y, month.m)}
            <button type="button" className="pl2-mnav" onClick={() => moveMonth(1)} aria-label="다음 달">
              ›
            </button>
          </span>
        </h1>
        <Seg label="보기" items={[{ value: 'calendar', label: 'Calendar' }, { value: 'list', label: 'List' }]} value={view} onChange={setView} className="pl2-viewseg" />
        {!isCurrent && (
          <button type="button" className="pl2-chip" onClick={() => moveMonth((curY * 12 + curM) - (month.y * 12 + month.m))}>
            이번 달로
          </button>
        )}
        <span className="pl2-sp" />
        {isPastMonth && <span className="pl2-headnote">지난 달은 근무기록만 보여요 (읽기 전용)</span>}
        {isNextMonth && <span className="pl2-headnote">다음 달은 [조건 바꾸고 다시 채우기] 전까지 미리보기예요</span>}
        {isCurrent && (view === 'calendar' || listNarrow) && (
          <span className="pl2-headsum">
            월말 예상 <b>{dur(summary.projectedReq)}</b> · 초과 <b>{signed(summary.projectedDiff)}</b>
          </span>
        )}
        {isCurrent && Math.abs(drift) > 10 && !fill && (
          <button type="button" className="pl2-chip is-warn" onClick={fitGoal}>
            목표보다 {gapText(drift)} · <u>맞추기</u>
          </button>
        )}
        {view === 'list' && !fill && !isPastMonth && (
          <button type="button" className="pl2-chip" onClick={common.openFill} aria-haspopup="dialog">
            목표 {goalTitle(goal, rules)} · {goal.startIn || rules.planDefaultIn} – {goal.cutoff || '제한 없음'} ▾
          </button>
        )}
        {fill && <span className="pl2-tag pl2-tag--accent pl2-filltag">조건 바꾸고 다시 채우기 · 미리보기</span>}
      </header>

      {fill ? (
        <FillPreview {...common} draft={fill.goal} setDraft={(g) => setFill({ goal: g })} onCancel={() => setFill(null)} onApply={applyFill} layout={view} />
      ) : view === 'calendar' ? (
        <CalendarView {...common} />
      ) : (
        <ListView {...common} listNarrow={listNarrow} />
      )}

      {inBar && <SuggestBar suggestion={suggestion} onApply={applySpread} onDismiss={dismissSug} onHover={setHover} lastMode={state.planSpreadMode} />}

      {toast && (
        <div className="pl2-toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                const u = toast.undo;
                setToast(null);
                u();
              }}
            >
              되돌리기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

