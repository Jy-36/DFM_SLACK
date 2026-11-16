// 앱 상태. 프로토타입은 localStorage에 저장하고, 실제 앱에서는 Tauri SQLite 플러그인으로 교체한다.
import { useReducer, useEffect } from 'react';
import { generateMockRecords } from './mockData.js';
import { mergeRules, DEFAULT_RULES, migrateRecord } from './rules.js';
import { DEFAULT_SYNC_CONFIG } from './sync.js';
import { DEFAULT_GOAL, migrateV32, dropPast, hasRecord } from './goal.js';
import { ymd } from './time.js';

const STORAGE_KEY = 'worktime.v1';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

// 되돌리기 기록·알림은 앱을 다시 열면 비운다 (GUIDE §8.3)
const NOT_SAVED = ['planHistory', 'planNotices'];

function saveState(state) {
  try {
    const out = { ...state };
    for (const k of NOT_SAVED) delete out[k];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* 저장 불가 환경에서는 메모리에만 유지 */
  }
}

const migrateAll = (records) => Object.fromEntries(Object.entries(records).map(([k, r]) => [k, migrateRecord(r)]));

function initialState() {
  const saved = loadState();
  const todayKey = ymd(new Date());
  const base = {
    records: migrateAll(saved?.records || generateMockRecords(new Date())),
    rules: mergeRules(saved?.rules),
    plans: saved?.plans || {},
    planIns: saved?.planIns || {}, // 날짜별 계획 출근 시각
    planLocks: saved?.planLocks || {}, // 배분할 때 건드리지 않는(고정한) 날
    planLast: saved?.planLast || null, // 마지막으로 반영한 배분 방식 {kind, at, target?}
    // 근태 매핑은 앱 기본값을 쓴다 (예전 반차 매핑 정리), 열 번호는 사용자가 바꾼 값 유지
    syncConfig: { ...DEFAULT_SYNC_CONFIG, ...(saved?.syncConfig || {}), typeMap: DEFAULT_SYNC_CONFIG.typeMap, cols: { ...DEFAULT_SYNC_CONFIG.cols, ...(saved?.syncConfig?.cols || {}) } },
    lastSync: saved?.lastSync || null,
    dataMode: saved?.dataMode || 'mock',
    // 근무 계획 v3.2 (GUIDE-plan-mechanism §8.1)
    planGoal: { ...DEFAULT_GOAL, ...(saved?.planGoal || {}) },
    planPins: saved?.planPins || {}, // { [ymd]: { in?, out?, net? } } 그날 직접 정한 값, 최대 두 개
    planLeaves: saved?.planLeaves || {}, // { [ymd]: { leave, leaveMin? } } 계획 휴가 (records 아님)
    planRecentOuts: saved?.planRecentOuts || ['18:00', '18:30', '19:00'],
    planSpreadMode: saved?.planSpreadMode || 'even',
    planV32Migrated: !!saved?.planV32Migrated,
    planMigratedLeaves: saved?.planMigratedLeaves || 0,
    planV32Backup: saved?.planV32Backup || null, // 이전 때 옮긴 records 원본 (0.23 으로 되돌릴 때 복구용)
    planHistory: [],
    planNotices: [],
  };
  if (!base.planV32Migrated) {
    const m = migrateV32(base, todayKey);
    Object.assign(base, { planPins: m.planPins, planLeaves: m.planLeaves, records: m.records, planV32Migrated: true, planMigratedLeaves: m.moved });
    if (m.moved) base.planV32Backup = { at: new Date().toISOString(), records: m.backup };
    if (m.moved) console.info(`[근무 계획] 계획 화면 휴가 ${m.moved}건을 planLeaves 로 옮겼습니다`);
  }
  return pruneState(base, todayKey);
}

/** 어제 이전 날의 계획 데이터 정리 (GUIDE §8.4). 정리 전후 월 계산은 같다 */
function pruneState(state, todayKey) {
  const next = {
    ...state,
    plans: dropPast(state.plans, todayKey),
    planPins: dropPast(state.planPins, todayKey),
    planLeaves: dropPast(state.planLeaves, todayKey),
    planIns: dropPast(state.planIns, todayKey),
    planLocks: dropPast(state.planLocks, todayKey),
  };
  const same = ['plans', 'planPins', 'planLeaves', 'planIns', 'planLocks'].every((k) => next[k] === state[k]);
  return same ? state : next;
}

const HISTORY_MAX = 20;
/** 계획을 바꾸는 액션 직전 상태를 되돌리기 기록에 남긴다 */
const withHistory = (state, label) => ({
  ...state,
  planHistory: [...state.planHistory, { label, plans: state.plans, planPins: state.planPins, planLeaves: state.planLeaves, planGoal: state.planGoal }].slice(-HISTORY_MAX),
});

function setPin(planPins, key, pin) {
  const next = { ...planPins };
  if (!pin || !Object.keys(pin).some((f) => pin[f] != null)) delete next[key];
  else next[key] = pin;
  return next;
}

const rememberOut = (list, t) => (t ? [t, ...list.filter((x) => x !== t)].slice(0, 3) : list);

function reducer(state, action) {
  switch (action.type) {
    case 'record/set': {
      const prev = state.records[action.key] || {};
      const next = { ...prev, ...action.patch, edited: true };
      return { ...state, records: { ...state.records, [action.key]: next } };
    }
    case 'records/apply': {
      // 근무기록에서 모아 둔 수정을 한 번에 반영. null = 그 날 기록 지우기
      const records = { ...state.records };
      for (const [key, rec] of Object.entries(action.changes)) {
        if (rec == null) {
          delete records[key];
          continue;
        }
        const next = { ...rec, edited: true };
        if (!next.in || !next.excludes?.length) delete next.excludes; // 제외시간은 출근한 날만
        records[key] = next;
      }
      return { ...state, records };
    }
    case 'record/clear': {
      const records = { ...state.records };
      delete records[action.key];
      return { ...state, records };
    }
    case 'records/merge': {
      // 동기화 기록이 무조건 이긴다: 그 날의 계획 휴가 삭제(다르면 알림 1회), 오늘이면 출근 pin 삭제 (GUIDE §8.5)
      const incoming = migrateAll(action.records);
      const todayKey = ymd(new Date());
      const planLeaves = { ...state.planLeaves };
      const planPins = { ...state.planPins };
      const planNotices = [...state.planNotices];
      for (const [key, rec] of Object.entries(incoming)) {
        if (!hasRecord(rec)) continue;
        const pl = planLeaves[key];
        if (pl) {
          if (pl.leave !== rec.leave) {
            const [, mm, dd] = key.split('-');
            planNotices.push({ text: `${Number(mm)}/${Number(dd)} 계획 휴가 대신 사이트 기록(${rec.leave ? '근태' : '근무'})을 반영했어요` });
          }
          delete planLeaves[key];
        }
        if (key === todayKey && rec.in && planPins[key]?.in) {
          const { in: _drop, ...rest } = planPins[key];
          if (Object.keys(rest).length) planPins[key] = rest;
          else delete planPins[key];
        }
      }
      return {
        ...state,
        records: { ...state.records, ...incoming },
        planLeaves,
        planPins,
        planNotices,
        lastSync: new Date().toISOString(),
        dataMode: action.mode,
      };
    }
    case 'records/resetMock':
      return { ...state, records: generateMockRecords(new Date()), plans: {}, planIns: {}, planLocks: {}, planPins: {}, planLeaves: {}, planHistory: [], lastSync: null, dataMode: 'mock' };
    case 'plan/set': {
      const plans = { ...state.plans };
      const planLocks = { ...state.planLocks };
      if (action.minutes == null) delete plans[action.key];
      else plans[action.key] = action.minutes;
      if (action.lock === true) planLocks[action.key] = true;
      if (action.lock === false || action.minutes == null) delete planLocks[action.key];
      return { ...state, plans, planLocks };
    }
    case 'plan/lock': {
      const planLocks = { ...state.planLocks };
      for (const key of action.keys) {
        if (action.locked) planLocks[key] = true;
        else delete planLocks[key];
      }
      return { ...state, planLocks };
    }
    case 'plan/replace':
      return {
        ...state,
        plans: action.plans,
        planIns: { ...(action.keepIns ? state.planIns : {}), ...(action.ins || {}) },
        planLocks: action.clearLocks ? {} : state.planLocks,
      };
    case 'plan/merge':
      return { ...state, plans: { ...state.plans, ...action.plans }, planIns: { ...state.planIns, ...(action.ins || {}) } };
    case 'plan/bulk': {
      // keys에 실근무(minutes)·출근 시각(inTime)·근태(leave)를 한 번에 적용. undefined는 변경 안 함
      const plans = { ...state.plans };
      const planIns = { ...state.planIns };
      const records = { ...state.records };
      const planLocks = { ...state.planLocks };
      for (const key of action.keys) {
        if (action.lock === true) planLocks[key] = true;
        if (action.lock === false || action.minutes === null) delete planLocks[key];
        if (action.minutes !== undefined) {
          if (action.minutes == null) delete plans[key];
          else plans[key] = action.minutes;
        }
        if (action.inTime !== undefined) {
          if (action.inTime == null) delete planIns[key];
          else planIns[key] = action.inTime;
        }
        if (action.leave !== undefined) {
          const r = { ...(records[key] || {}), leave: action.leave || null, edited: true };
          if (action.leave === 'hourly') r.leaveMin = action.leaveMin ?? r.leaveMin ?? 120;
          else delete r.leaveMin;
          records[key] = r;
        }
      }
      return { ...state, plans, planIns, records, planLocks };
    }
    case 'plan/last':
      return { ...state, planLast: action.last };

    // ── 근무 계획 v3.2 ──────────────────────────────────────
    // pin 은 화면에서 전이표(resolvePinTransition)·범위 검사를 마친 값을 그대로 받는다
    case 'plan/pin': {
      const h = withHistory(state, action.label || '하루 정함');
      return { ...h, planPins: setPin(state.planPins, action.key, action.pin), planRecentOuts: rememberOut(state.planRecentOuts, action.pin?.out) };
    }
    case 'plan/pinMany': {
      const h = withHistory(state, action.label || '여러 날 정함');
      let planPins = state.planPins;
      let planRecentOuts = state.planRecentOuts;
      for (const [key, pin] of Object.entries(action.pins)) {
        planPins = setPin(planPins, key, pin);
        planRecentOuts = rememberOut(planRecentOuts, pin?.out);
      }
      const planLeaves = { ...state.planLeaves };
      for (const key of action.clearLeaves || []) delete planLeaves[key];
      return { ...h, planPins, planRecentOuts, planLeaves };
    }
    case 'plan/leave': {
      // 계획 휴가는 planLeaves 에만. 근무기록(records)은 건드리지 않는다
      const h = withHistory(state, action.label || '계획 휴가');
      const planLeaves = { ...state.planLeaves };
      let planPins = state.planPins;
      for (const key of action.keys || [action.key]) {
        if (!action.leave) delete planLeaves[key];
        else planLeaves[key] = { leave: action.leave, ...(action.leaveMin != null ? { leaveMin: action.leaveMin } : {}) };
        if (action.leave && action.fullDay) planPins = setPin(planPins, key, null); // 종일 휴가 → 그날 고정 해제
      }
      return { ...h, planLeaves, planPins };
    }
    case 'plan/applySpread': {
      // history:false = 바로 앞 편집(pin 등)과 한 번에 되돌림. base = 이 plans 위에 덮어씀 (방식 바꾸기)
      const h = action.history === false ? state : withHistory(state, action.label || '나머지 날 맞춤');
      return { ...h, plans: { ...(action.base || state.plans), ...action.plans } };
    }
    case 'plan/reflow': {
      // 기록·날짜·설정 변화로 생긴 차이를 자동 날에 반영 (GUIDE §6.6). first = 처음 채우기 (기록·알림 없음)
      if (action.first) return { ...state, plans: { ...state.plans, ...action.plans } };
      const h = withHistory(state, '기록 반영');
      const notices = [...state.planNotices];
      if (action.text) notices.push({ text: action.text, undoAt: h.planHistory.length });
      for (const t of action.extra || []) notices.push({ text: t });
      return { ...h, plans: { ...state.plans, ...action.plans }, planNotices: notices };
    }
    case 'plan/notice':
      return { ...state, planNotices: [...state.planNotices, { text: action.text }] };
    case 'plan/fill': {
      // 조건대로 채우기 · 처음부터 다시 짜기 · 처음 열 때: plans 만 바꿈 (출근은 저장하지 않음)
      const h = action.history === false ? state : withHistory(state, action.label || '조건대로 채움');
      return { ...h, plans: { ...state.plans, ...action.plans }, planGoal: action.goal ? { ...state.planGoal, ...action.goal } : state.planGoal };
    }
    case 'plan/spreadMode':
      return { ...state, planSpreadMode: action.mode };
    case 'plan/undo': {
      const last = state.planHistory[state.planHistory.length - 1];
      if (!last) return state;
      return { ...state, plans: last.plans, planPins: last.planPins, planLeaves: last.planLeaves, planGoal: last.planGoal, planHistory: state.planHistory.slice(0, -1) };
    }
    case 'plan/prunePast':
      return pruneState(state, action.today);
    case 'plan/noticesClear':
      return state.planNotices.length ? { ...state, planNotices: [] } : state;
    case 'rules/set':
      return { ...state, rules: { ...state.rules, ...action.patch } };
    case 'rules/reset':
      return { ...state, rules: structuredClone(DEFAULT_RULES) };
    case 'sync/config':
      return { ...state, syncConfig: { ...state.syncConfig, ...action.patch } };
    default:
      return state;
  }
}

export function useAppStore() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  useEffect(() => saveState(state), [state]);
  return [state, dispatch];
}
