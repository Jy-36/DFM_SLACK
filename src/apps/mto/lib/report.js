// 결과 정리: 요약 수치, 표/CSV/엑셀 붙여넣기용 텍스트 (mto_agent/report.py)

export const COLUMNS = [
  ['No', (l) => l.no],
  ['Part', (l) => l.part],
  ['Layer', (l) => l.layer],
  ['Type', (l) => l.type],
  ['GDS', (l) => l.gds],
  ['STEP1', (l) => `${l.step1Start}~${l.step1End}`],
  ['STEP2_TAT', (l) => l.step2Tat],
  ['STEP2_ready', (l) => l.step2Ready],
  ['STEP2_start', (l) => l.step2Start],
  ['STEP2_wait', (l) => l.step2WaitDays],
  ['STEP2_end', (l) => l.step2End],
  ['MTO_earliest', (l) => l.mtoEarliest],
  ['MTO_date', (l) => l.mtoDate],
  ['MTO_wait', (l) => l.mtoWaitDays],
  ['비고', (l) => l.notes.join(' · ')],
];

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(result) {
  const head = COLUMNS.map(([k]) => k).join(',');
  const body = result.layers.map((l) => COLUMNS.map(([, f]) => csvCell(f(l))).join(','));
  return [head, ...body].join('\n') + '\n';
}

/** 엑셀에 바로 붙여 넣을 수 있는 탭 구분 텍스트 */
export function toTsv(result) {
  const head = COLUMNS.map(([k]) => k).join('\t');
  const body = result.layers.map((l) => COLUMNS.map(([, f]) => String(f(l)).replace(/\t|\n/g, ' ')).join('\t'));
  return [head, ...body].join('\n');
}

const count = (arr) => arr.reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {});

/** 병목 분석에 쓰는 핵심 수치 (report.summary) */
export function summarize(result) {
  const { layers, config: cfg } = result;
  const byPart = {};
  for (const part of [...new Set(layers.map((l) => l.part))].sort()) {
    const ls = layers.filter((l) => l.part === part);
    const min = (k) => ls.reduce((m, l) => (l[k] < m ? l[k] : m), ls[0][k]);
    const max = (k) => ls.reduce((m, l) => (l[k] > m ? l[k] : m), ls[0][k]);
    byPart[part] = {
      layers: ls.length,
      typeMix: count(ls.map((l) => l.type)),
      gds: ls[0].gds,
      step1Start: ls[0].step1Start,
      step1End: ls[0].step1End,
      step2Ready: ls[0].step2Ready,
      step2FirstStart: min('step2Start'),
      step2LastStart: max('step2Start'),
      step2WaitTotal: ls.reduce((a, l) => a + l.step2WaitDays, 0),
      firstMto: min('mtoDate'),
      lastMto: max('mtoDate'),
      mtoWaitTotal: ls.reduce((a, l) => a + l.mtoWaitDays, 0),
    };
  }
  const loads = Object.values(result.step2Load);
  const peak = loads.length ? Math.max(...loads) : 0;
  const maxBy = (k) => layers.reduce((m, l) => (l[k] > m[k] ? l : m), layers[0]);
  return {
    finalMto: result.finalMto,
    leadTimeDays: result.leadTimeDays,
    step2PeakLoad: peak,
    step2DaysAtCapacity: cfg.step2Concurrency ? loads.filter((n) => n >= cfg.step2Concurrency).length : 0,
    layersWithStep2Wait: layers.filter((l) => l.step2WaitDays > 0).length,
    layersWithMtoWait: layers.filter((l) => l.mtoWaitDays > 0).length,
    step2WaitTotal: layers.reduce((a, l) => a + l.step2WaitDays, 0),
    mtoWaitTotal: layers.reduce((a, l) => a + l.mtoWaitDays, 0),
    maxStep2Wait: maxBy('step2WaitDays'),
    maxMtoWait: maxBy('mtoWaitDays'),
    byPart,
  };
}

/** 일자별 MTO 묶음: [{ date, layers: [...] }] */
export function mtoByDate(result) {
  const map = new Map();
  for (const l of result.layers) {
    if (!map.has(l.mtoDate)) map.set(l.mtoDate, []);
    map.get(l.mtoDate).push(l);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, ls]) => ({ date, layers: ls }));
}
