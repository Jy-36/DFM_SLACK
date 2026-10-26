// 화면 공통 라벨 · 색 견본
import { parseRgb } from './planner.js';

/** Fill_Color 입력값(이름 · #RRGGBB · R,G,B) → CSS 색 */
export function cssColor(value, colors) {
  if (!value) return null;
  if (colors?.[value]) return colors[value];
  const rgb = parseRgb(value);
  return rgb ? `rgb(${rgb.join(',')})` : null;
}

/** 수정본 drf 색 이름 → '#rrggbb' */
export const colorsOf = (ts) => (ts ? ts.drf.rgbMap() : {});

export const STATUS = {
  READY: { label: 'READY', tone: 'good' },
  NEEDS_REVIEW: { label: '검토 필요', tone: 'warn' },
  ERROR: { label: 'ERROR', tone: 'bad' },
};
export const TYPE_LABEL = { ADD: '추가', CHANGE_DISPLAY: '표시 변경', RETIRE: '폐기', HIDE: '숨김', SHOW: '보이기', OPTION_ADD: 'Option +', OPTION_REMOVE: 'Option −' };
export const FILE_LABEL = { tf: 'techfile', layermap: 'layermap', drf: 'drf' };
export const LEVEL_TONE = { error: 'bad', warn: 'warn', info: 'neutral' };
