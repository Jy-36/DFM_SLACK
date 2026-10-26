// 화면 계산 도우미: baseline 파싱 캐시 · Request 묶음 결과 · 색 견본
import { consistency, loadSet, lppTable } from './model.js';
import { plan } from './planner.js';
import { parseRgb } from './planner.js';

const tsCache = new WeakMap();
/** baseline 객체당 한 번만 파싱 (실패하면 { error }) */
export function techSet(baseline) {
  if (!baseline) return null;
  if (!tsCache.has(baseline)) {
    try {
      const ts = loadSet(baseline.files);
      tsCache.set(baseline, { ts, issues: consistency(ts), lpps: lppTable(ts), colors: ts.drf.rgbMap() });
    } catch (e) {
      tsCache.set(baseline, { error: e.message });
    }
  }
  return tsCache.get(baseline);
}

export function batchResult(batch, baseline, settings) {
  const t = techSet(baseline);
  if (!t || t.error) return null;
  const res = plan(t.ts, batch.requests, batch.include, settings);
  const counts = { READY: 0, NEEDS_REVIEW: 0, ERROR: 0 };
  for (const it of res.items) counts[it.status]++;
  // 이 묶음이 새로 만드는 색도 견본을 그릴 수 있게
  const colors = { ...t.colors };
  for (const it of res.items) {
    for (const c of it.changes) {
      if (c.where !== 'drDefineColor') continue;
      const tok = c.text.split(';')[0].replace(/[()]/g, ' ').trim().split(/\s+/);
      const rgb = tok.slice(2, 5).map(Number);
      if (rgb.length === 3 && rgb.every(Number.isInteger)) colors[tok[1]] = '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
    }
  }
  return { ...res, counts, colors, applied: res.items.filter((i) => i.included).map((i) => i.id) };
}

/** Fill_Color 입력값(이름 · #RRGGBB · R,G,B) → CSS 색 */
export function cssColor(value, colors) {
  if (!value) return null;
  if (colors[value]) return colors[value];
  const rgb = parseRgb(value);
  return rgb ? `rgb(${rgb.join(',')})` : null;
}

export const STATUS = {
  READY: { label: 'READY', tone: 'good' },
  NEEDS_REVIEW: { label: '검토 필요', tone: 'warn' },
  ERROR: { label: 'ERROR', tone: 'bad' },
};
export const TYPE_LABEL = { ADD: '추가', CHANGE_DISPLAY: '표시 변경', RETIRE: '폐기' };
export const FILE_LABEL = { tf: 'techfile', layermap: 'layermap', drf: 'drf' };
