// 근무 계획 (Window 모드 전용). 화면: GUIDE-ui-window.md, 동작: GUIDE-plan-mechanism.md
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planSummary, todayAdvice, distributeByGoal, monthDrift, excessForGoal } from '../../lib/goal.js';
import { monthLabel } from '../../lib/time.js';
import { dayView, bulkResult, buildSuggestion, goalTitle } from './model.js';
import { md, dur, signed, gapText } from './format.js';
import { Seg, useWidth, Kbd } from './ui.jsx';
import CalendarView from './CalendarView.jsx';
import ListView from './ListView.jsx';
import FillPreview from './FillPreview.jsx';

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
  const [sug, setSug] = useState(null); // 방금 한 편집 { baseDiff, keys, label, fromKey, forced } → 다음 렌더에서 바로 맞춤
  const [hover, setHover] = useState(null); // 방식 메뉴에 올렸을 때 바뀔 날 { [key]: 변화 }
  const [fill, setFill] = useState(null); // 채우기 미리보기 { goal }
  const [toast, setToastRaw] = useState(null); // { text, undo, alts?, mode?, prePlans?, head? }
  const [toastHold, setToastHold] = useState(false); // 마우스를 올렸거나 방식 메뉴를 연 동안 안 닫힘
  const [altOpen, setAltOpen] = useState(false);
  const [help, setHelp] = useState(false);
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

  // 처음 채우기 · 기록 반영은 WorkTime 이 한다 (lib/goal.js autoReflow, GUIDE §6.6)

  // 화면에 들어오면 오늘(주말이면 다음 근무일) 선택
  useEffect(() => {
    if (sel.length) return;
    const first = views.find((v) => v.state === 'today') || views.find((v) => v.key >= summary.todayKey && v.selectable) || views[0];
    if (first) setSel([first.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.y, month.m]);

  const setToast = useCallback((t) => {
    setToastRaw(t);
    setAltOpen(false);
    setToastHold(false);
    setHover(null);
  }, []);
  useEffect(() => {
    if (!altOpen) setHover(null); // 방식 메뉴를 닫으면 칸 미리보기도 지움
  }, [altOpen]);
  useEffect(() => {
    if (!toast) setAltOpen(false);
  }, [toast]);
  useEffect(() => {
    if (!toast || toastHold || altOpen) return undefined;
    const id = setTimeout(() => setToastRaw(null), toast.alts ? 9000 : toast.undo ? 6000 : 3000);
    return () => clearTimeout(id);
  }, [toast, toastHold, altOpen]);

  // 기록 반영 · 계획 휴가가 사이트 기록으로 바뀜 · 설정과 안 맞는 날 알림 (되돌리기는 그 기록이 맨 위일 때만)
  useEffect(() => {
    const list = state.planNotices || [];
    if (!list.length) return;
    const u = [...list].reverse().find((n) => n.undoAt);
    const canUndo = u && state.planHistory.length === u.undoAt;
    setToast({ text: list.slice(-2).map((n) => n.text).join(' · '), undo: canUndo ? () => undo() : null });
    dispatch({ type: 'plan/noticesClear' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.planNotices, dispatch]);

  const undo = useCallback(() => {
    dispatch({ type: 'plan/undo' });
    setToast({ text: '되돌렸어요' });
  }, [dispatch, setToast]);

  /**
   * 편집 하나 → 다음 렌더에서 마지막에 쓴 방식으로 남은 날을 바로 맞춘다 (GUIDE §6.1 v3.3).
   * 이번 달이 아니면 맞추지 않고 토스트만. → true 면 토스트는 맞춘 뒤에 띄움
   */
  const track = (keys, label) => {
    if (!isCurrent) return false;
    setSug({ baseDiff: summary.projectedDiff, keys, label, fromKey: keys[keys.length - 1], pending: true });
    return true;
  };

  const applyPin = (key, pin, label) => {
    const text = `${md(key)} ${label}`;
    dispatch({ type: 'plan/pin', key, pin, label });
    if (!track([key], text)) setToast({ text, undo: () => undo() });
  };

  const applyLeave = (keys, leave, leaveMin) => {
    const def = leave ? rules.leaveTypes[leave] : null;
    const label = leave ? `${def.label}${def.variable ? ` ${Math.round((leaveMin ?? def.credit) / 60)}h` : ''} · 계획` : '휴가 취소';
    const text = `${keys.length > 1 ? `${keys.length}일` : md(keys[0])} ${label}`;
    dispatch({ type: 'plan/leave', keys, leave, leaveMin, fullDay: !!def && !def.variable, label });
    if (!track(keys, text)) setToast({ text, undo: () => undo() });
  };

  // 방금 한 편집의 차이를 바로 맞추고, 토스트에 [방식 바꾸기] [되돌리기]
  useEffect(() => {
    if (!sug?.pending) return;
    const head = sug.label;
    setSug(null);
    const s = suggestion;
    if (!s || s.matched) {
      if (!sug.forced) setToast({ text: head, undo: () => undo() });
      return;
    }
    const usable = s.options.filter((o) => !o.disabled);
    if (!usable.length) {
      setToast({ text: `${head} · 바꿀 수 있는 자동 날이 없어 목표와 ${gapText(s.drift)}`, undo: sug.forced ? null : () => undo() });
      return;
    }
    const pick = usable.find((o) => o.mode === state.planSpreadMode) || usable[0];
    dispatch({ type: 'plan/applySpread', plans: pick.spread.plans, history: sug.forced ? undefined : false, label: head });
    const keep = { mode: 'keep', title: '그대로 두기', detail: `남은 날은 그대로 · 목표와 ${gapText(s.drift)}`, short: `남은 날 그대로 · 목표와 ${gapText(s.drift)}`, spread: { plans: {}, changes: [] } };
    setToast({ head, text: `${head} · ${pick.short}`, mode: pick.mode, alts: [...s.options, ...(sug.forced ? [] : [keep])], prePlans: plans, warn: pick.warn, undo: () => undo() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  /** 토스트 [방식 바꾸기] — 맞추기 전 plans 위에 다른 방식을 다시 얹는다 (되돌리기 기록은 그대로 하나) */
  const switchMode = (a) => {
    if (a.disabled) return;
    dispatch({ type: 'plan/applySpread', plans: a.spread.plans, base: toast.prePlans, history: false });
    if (a.mode !== 'keep') dispatch({ type: 'plan/spreadMode', mode: a.mode });
    setToastRaw({ ...toast, mode: a.mode, text: `${toast.head} · ${a.short}`, warn: a.warn });
    setAltOpen(false);
    setHover(null);
  };
  /** 방식 메뉴에 올리면 지금 값 대비 바뀔 양을 칸에 미리 보여 줌 */
  const altHover = (a) => {
    if (!toast?.prePlans) return null;
    const keys = new Set([...Object.keys(a.spread.plans), ...Object.keys(plans).filter((k) => plans[k] !== toast.prePlans[k])]);
    const out = {};
    for (const k of keys) {
      const target = a.spread.plans[k] ?? toast.prePlans[k];
      if (target != null && plans[k] != null && target !== plans[k]) out[k] = target - plans[k];
    }
    return out;
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
      const text = `${keys.length}일을 바꿨어요${res.blocked.length ? ` · ${res.blocked.length}일은 못 바꿈 (${res.blocked[0].why})` : ''}`;
      if (keys.length) dispatch({ type: 'plan/pinMany', pins: res.pins, label: `${keys.length}일 바꿈` });
      if (!keys.length || !track(keys, text)) setToast({ text, undo: keys.length ? () => undo() : null });
    }
    setBulk({});
    setSel(view === 'list' ? [] : sel.slice(-1));
  };

  const fitGoal = () => setSug({ baseDiff: summary.projectedDiff, keys: [], label: '목표에 맞춤', forced: true, pending: true });

  const applyFill = (r, draftGoal) => {
    dispatch({ type: 'plan/fill', plans: r.plans, goal: draftGoal, label: '조건대로 채움' });
    const n = Object.keys(r.plans).filter((k) => r.plans[k] !== (summary.effPlans[k] ?? null)).length;
    setFill(null);
    setToast({ text: `${n}일을 채웠어요`, undo: () => undo() });
  };

  const rebuild = () => {
    const r = distributeByGoal(summary, rules, plans, pins, goal);
    dispatch({ type: 'plan/fill', plans: r.plans, label: '처음부터 다시 짬' });
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
      } else if (e.key === '?' && !typing) {
        setHelp((h) => !h);
      } else if (e.key === 'Escape' && !typing) {
        if (help) setHelp(false);
        else if (altOpen) setAltOpen(false);
        else if (fill) setFill(null);
        else if (view === 'list' && sel.length) {
          setSel([]);
          setBulk({});
        } else if (sel.length > 1) {
          setSel(sel.slice(-1));
          setBulk({});
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const moveMonth = (delta) => {
    const t = month.y * 12 + month.m + delta;
    setMonth({ y: Math.floor(t / 12), m: t % 12 });
    setSel([]);
    setFill(null);
  };

  const wantedExcess = excessForGoal(goal, rules);
  const common = {
    ctx, views, viewOf, sel, select, setSel, summary, rules, goal, dispatch, go, width, isCurrent, isNextMonth, isPastMonth,
    applyPin, applyLeave, applyBulk, bulk, setBulk, selectedViews, hover, setHover,
    openFill: () => {
      setToastRaw(null);
      setFill({ goal: { ...goal } });
    },
    rebuild, setToast, wantedExcess, advice, lastMode: state.planSpreadMode,
  };

  const narrowClass = width >= 1180 ? 'pl2--w3' : width >= 880 ? 'pl2--w2' : 'pl2--w1';
  const listNarrow = width < 1100;

  return (
    <div className={`pl2 ${narrowClass} ${listNarrow ? 'pl2--list-narrow' : ''}`} ref={rootRef}>
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
        <button type="button" className="pl2-help-btn" onClick={() => setHelp(!help)} aria-expanded={help} title="단축키 (?)" aria-label="단축키 보기">
          ?
        </button>
        <span className="pl2-sp" />
        {isPastMonth && <span className="pl2-headnote">지난 달은 근무기록만 보여요 (읽기 전용)</span>}
        {isNextMonth && <span className="pl2-headnote">다음 달은 [조건 바꾸고 다시 채우기] 전까지 미리보기예요</span>}
        {isCurrent && !fill && (
          <span className="pl2-headsum">
            월말 <b>{dur(summary.projectedReq)}</b>
            {wantedExcess === Infinity ? ' · 목표 최대한' : <> · 목표 <b>{dur(summary.required + wantedExcess)}</b></>}
          </span>
        )}
        {isCurrent && !fill && wantedExcess !== Infinity &&
          (Math.abs(drift) > 10 ? (
            <button type="button" className="pl2-chip is-warn" onClick={fitGoal} title="남은 자동 날에 나눠서 목표에 맞춰요">
              {signed(drift)} · <u>맞추기</u>
            </button>
          ) : (
            <span className="pl2-tag pl2-tag--ok pl2-headok">✓ 목표대로</span>
          ))}
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

      {help && <KeyHelp view={view} onClose={() => setHelp(false)} />}

      {toast && (
        <div className="pl2-toast" role="status" onMouseEnter={() => setToastHold(true)} onMouseLeave={() => setToastHold(false)}>
          <span>
            {toast.text}
            {toast.warn ? <em className="pl2-toast-warn"> · {toast.warn}</em> : null}
          </span>
          {toast.alts && (
            <button type="button" aria-haspopup="menu" aria-expanded={altOpen} onClick={() => setAltOpen(!altOpen)}>
              방식 바꾸기
            </button>
          )}
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                const u = toast.undo;
                setToastRaw(null);
                u();
              }}
            >
              되돌리기
            </button>
          )}
          {altOpen && toast.alts && (
            <div className="pl2-toast-menu" role="menu" aria-label="남은 날 맞추는 방식">
              {toast.alts.map((a) => (
                <button
                  key={a.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={a.mode === toast.mode}
                  disabled={a.disabled}
                  className={a.mode === toast.mode ? 'is-on' : ''}
                  onClick={() => switchMode(a)}
                  onMouseEnter={() => setHover(altHover(a))}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(altHover(a))}
                  onBlur={() => setHover(null)}
                >
                  <b>
                    {a.mode === toast.mode ? '✓ ' : ''}
                    {a.title}
                  </b>
                  <span className={a.warn ? 'is-warn' : ''}>{a.warn || a.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


const KEYS = {
  calendar: [
    [['←', '→', '↑', '↓'], '날짜 이동'],
    [['Enter'], '그날 고치기'],
    [['Space'], '여러 날 고르기'],
    [['Shift', '클릭'], '이어서 고르기'],
    [['Ctrl', '클릭'], '골라서 고르기'],
    [['Ctrl', 'Z'], '되돌리기'],
    [['Esc'], '선택 해제 · 닫기'],
  ],
  list: [
    [['↑', '↓'], '줄 이동'],
    [['Tab'], '출근 → 퇴근 → 실근무'],
    [['Enter'], '고치기'],
    [['Space'], '줄 고르기'],
    [['Del'], '자동으로'],
    [['Ctrl', 'Z'], '되돌리기'],
    [['Esc'], '취소 · 선택 해제'],
  ],
};

function KeyHelp({ view, onClose }) {
  return (
    <div className="pl2-keyhelp" role="dialog" aria-label="단축키">
      <div className="pl2-keyhelp-h">
        <b>단축키</b>
        <span className="pl2-sp" />
        <button type="button" className="pl2-x" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      {KEYS[view].map(([ks, t]) => (
        <div key={t} className="pl2-keyhelp-r">
          <span>
            {ks.map((k, i) => (
              <span key={k}>
                {i > 0 && (ks.length === 4 ? ' ' : '+')}
                <Kbd>{k}</Kbd>
              </span>
            ))}
          </span>
          <span>{t}</span>
        </div>
      ))}
      <span className="pl2-hint">
        <Kbd>?</Kbd> 로 열고 닫아요
      </span>
    </div>
  );
}
