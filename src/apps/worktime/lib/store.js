// 앱 상태. 프로토타입은 localStorage에 저장하고, 실제 앱에서는 Tauri SQLite 플러그인으로 교체한다.
import { useReducer, useEffect } from 'react';
import { generateMockRecords } from './mockData.js';
import { mergeRules, DEFAULT_RULES, migrateRecord } from './rules.js';
import { DEFAULT_SYNC_CONFIG } from './sync.js';

const STORAGE_KEY = 'worktime.v1';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 저장 불가 환경에서는 메모리에만 유지 */
  }
}

const migrateAll = (records) => Object.fromEntries(Object.entries(records).map(([k, r]) => [k, migrateRecord(r)]));

function initialState() {
  const saved = loadState();
  return {
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
  };
}

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
    case 'records/merge':
      return {
        ...state,
        records: { ...state.records, ...migrateAll(action.records) },
        lastSync: new Date().toISOString(),
        dataMode: action.mode,
      };
    case 'records/resetMock':
      return { ...state, records: generateMockRecords(new Date()), plans: {}, planIns: {}, planLocks: {}, lastSync: null, dataMode: 'mock' };
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
