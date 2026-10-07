// MTO 탭 상태: GDS 입고일 · Layer List · 규칙. WorkTime과 같이 localStorage에 저장한다.
import { useEffect, useReducer } from 'react';
import { DEFAULT_CONFIG, normalizeConfig } from './scheduler.js';

const KEY = 'mto.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function init() {
  const s = load();
  return {
    gds: s?.gds || '',
    layers: Array.isArray(s?.layers) ? s.layers : [],
    config: normalizeConfig(s?.config || DEFAULT_CONFIG),
    prevLayers: null, // 순서 재배열 되돌리기용 (저장 안 함)
  };
}

function reducer(state, a) {
  switch (a.type) {
    case 'gds':
      return { ...state, gds: a.value };
    case 'layers':
      return { ...state, layers: a.layers, prevLayers: a.keepUndo ? state.layers : null };
    case 'undoLayers':
      return state.prevLayers ? { ...state, layers: state.prevLayers, prevLayers: null } : state;
    case 'config':
      return { ...state, config: normalizeConfig({ ...state.config, ...a.patch }) };
    case 'resetConfig':
      return { ...state, config: normalizeConfig(DEFAULT_CONFIG) };
    default:
      return state;
  }
}

export function useMtoStore() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  useEffect(() => {
    try {
      const { gds, layers, config } = state;
      localStorage.setItem(KEY, JSON.stringify({ gds, layers, config }));
    } catch {
      /* 저장 불가 환경에서는 메모리에만 유지 */
    }
  }, [state]);
  return [state, dispatch];
}
