// 일정 분석 (규칙 기반): 원본의 LLM 분석과 같은 항목 — 요약 · 병목 · 추천 일정 · 리스크.
// 날짜는 다시 계산하지 않고 엔진 결과만 해석한다. 대안 일정은 엔진을 다시 돌려 비교한다.
import { HOLIDAY_YEARS } from '../../../shared/holidays.js';
import { addDays, diffDays, fmtShort } from './dates.js';
import { buildSchedule, normalizeConfig, partLabel, REVISION_PART, scenarioGrid } from './scheduler.js';
import { summarize } from './report.js';

/** 최종 MTO Layer가 거친 경로: GDS → STEP1 → (휴일) → STEP2 대기 → STEP2 → (휴일) → MTO 대기 */
function criticalPath(result) {
  const last = result.layers.reduce((m, l) => (l.mtoDate >= m.mtoDate ? l : m), result.layers[0]);
  const cfg = result.config;
  const s1Hold = diffDays(last.step1Start, last.gds);
  const s2Hold = diffDays(last.step2Ready, addDays(last.step1End, 1));
  const mtoHold = diffDays(last.mtoEarliest, addDays(last.step2End, cfg.mtoGapDays));
  const steps = [
    { key: 'step1', label: 'STEP1', days: diffDays(last.step1End, last.step1Start) + 1 + s1Hold, note: s1Hold ? `GDS 휴일로 ${s1Hold}일 늦게 시작` : `${partLabel(last.part)} TAT ${cfg.step1Tat[last.part]}일` },
    { key: 'hold', label: '휴일 대기', days: s2Hold, note: 'STEP2는 휴일에 시작 불가' },
    { key: 's2wait', label: 'STEP2 슬롯 대기', days: last.step2WaitDays, note: `동시 ${cfg.step2Concurrency ?? '무제한'}장` },
    { key: 'step2', label: 'STEP2', days: last.step2Tat, note: `Type ${last.type} TAT ${last.step2Tat}일` },
    { key: 'gap', label: 'MTO 준비', days: cfg.mtoGapDays + mtoHold, note: mtoHold ? `+휴일 ${mtoHold}일` : `STEP2 + ${cfg.mtoGapDays}일` },
    { key: 'wait', label: 'MTO 순차 대기', days: last.mtoWaitDays, note: `${cfg.mtoPerDay}장/일 · No 순서` },
  ].filter((s) => s.days > 0);
  // Part B면 GDS 자체가 늦게 들어온다
  const gdsLag = diffDays(last.gds, result.partAGds);
  if (gdsLag > 0) steps.unshift({ key: 'gds', label: `${partLabel(last.part)} GDS`, days: gdsLag, note: `Part A + ${gdsLag}일` });
  return { layer: last, steps };
}

/** 순차 MTO 대기를 원인별로 나눈다: 앞 번호 Layer가 늦게 준비돼서(순서) / 하루 장수 제한(용량) */
function mtoWaitCauses(result) {
  let blocker = null;
  const byBlocker = new Map();
  let orderDays = 0;
  let capDays = 0;
  for (const l of result.layers) {
    if (l.mtoWaitDays > 0) {
      const order = blocker && blocker.mtoEarliest > l.mtoEarliest ? Math.min(l.mtoWaitDays, diffDays(blocker.mtoEarliest, l.mtoEarliest)) : 0;
      orderDays += order;
      capDays += l.mtoWaitDays - order;
      if (order > 0) {
        const b = byBlocker.get(blocker.layer) || { layer: blocker, count: 0, days: 0 };
        b.count += 1;
        b.days += order;
        byBlocker.set(blocker.layer, b);
      }
    }
    if (!blocker || l.mtoEarliest > blocker.mtoEarliest) blocker = l;
  }
  const blockers = [...byBlocker.values()].sort((a, b) => b.days - a.days);
  return { orderDays, capDays, blockers };
}

/** STEP2가 꽉 찬 날을 구간으로 묶는다 */
function capacityRanges(result) {
  const cap = result.config.step2Concurrency;
  if (!cap) return [];
  const days = Object.entries(result.step2Load).filter(([, n]) => n >= cap).map(([d]) => d);
  const out = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && diffDays(d, last.to) === 1) last.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}

/** Part 안에서만 Layer 순서를 바꿔 본다 (Part가 차지한 No 자리는 그대로) */
function reorderWithinParts(layers, cmp) {
  const sorted = [...layers].sort((a, b) => a.no - b.no);
  const byPart = {};
  for (const l of sorted) (byPart[l.part] ||= []).push(l);
  for (const p of Object.keys(byPart)) byPart[p] = [...byPart[p]].sort(cmp);
  const idx = {};
  return sorted.map((slot) => {
    const i = (idx[slot.part] = (idx[slot.part] ?? -1) + 1);
    return { ...byPart[slot.part][i], no: slot.no };
  });
}

export function analyze(result, layersInput) {
  const cfg = normalizeConfig(result.config);
  const s = summarize(result);
  const crit = criticalPath(result);
  const causes = mtoWaitCauses(result);
  const caps = capacityRanges(result);
  const n = result.layers.length;

  // 휴일 때문에 밀린 일수 (Layer별 합)
  let holidayDays = 0;
  for (const l of result.layers) {
    holidayDays += diffDays(l.step2Ready, addDays(l.step1End, 1));
    holidayDays += diffDays(l.mtoEarliest, addDays(l.step2End, cfg.mtoGapDays));
  }

  // 제약이 없을 때의 하한 (STEP2 무제한, 하루 MTO 무제한)
  const free = buildSchedule(result.partAGds, layersInput, { ...cfg, step2Concurrency: null, mtoPerDay: 999 });
  const constraintCost = diffDays(result.finalMto, free.finalMto);

  // ── 병목
  const bottlenecks = [];
  if (s.step2WaitTotal > 0) {
    bottlenecks.push({
      key: 's2wait',
      title: `STEP2 동시 ${cfg.step2Concurrency}장 제한`,
      value: `${s.step2WaitTotal}일`,
      weight: s.step2WaitTotal,
      detail: `${s.layersWithStep2Wait}/${n} Layer가 슬롯을 기다림 · 최대 ${s.maxStep2Wait.layer} ${s.maxStep2Wait.step2WaitDays}일 · 꽉 찬 날 ${s.step2DaysAtCapacity}일`,
    });
  }
  if (causes.orderDays > 0) {
    const top = causes.blockers.slice(0, 3).map((b) => `${b.layer.layer}(${b.layer.type}) → 뒤 ${b.count}장`).join(', ');
    bottlenecks.push({
      key: 'order',
      title: '앞 번호 Layer가 늦게 끝나 순서 대기',
      value: `${causes.orderDays}일`,
      weight: causes.orderDays,
      detail: `MTO는 No 순서라 STEP2가 긴 Layer가 앞에 있으면 뒤가 막힘 · ${top}`,
    });
  }
  if (causes.capDays > 0) {
    bottlenecks.push({
      key: 'cap',
      title: `하루 MTO ${cfg.mtoPerDay}장 제한`,
      value: `${causes.capDays}일`,
      weight: causes.capDays,
      detail: `준비는 끝났지만 그날 MTO 자리가 없어 다음 근무일로 넘어감 · ${s.layersWithMtoWait}/${n} Layer가 MTO 대기`,
    });
  }
  if (holidayDays > 0) {
    bottlenecks.push({
      key: 'holiday',
      title: '휴일에 시작·MTO 불가',
      value: `${holidayDays}일`,
      weight: holidayDays,
      detail: result.holidaysInWindow.length
        ? `기간 안 공휴일: ${result.holidaysInWindow.map((h) => `${fmtShort(h.date)} ${h.name}`).join(', ')}`
        : '주말에 걸려 STEP2 시작·MTO가 다음 근무일로 밀림',
    });
  }
  bottlenecks.sort((a, b) => b.weight - a.weight);
  const total = bottlenecks.reduce((a, b) => a + b.weight, 0) || 1;
  bottlenecks.forEach((b) => (b.share = b.weight / total));

  // ── 추천 일정
  const recs = [];
  const grid = scenarioGrid(result.partAGds, layersInput, cfg);
  const cur = result.finalMto;
  const bestGrid = grid.reduce((m, g) => (g.finalMto < m.finalMto ? g : m), grid[0]);
  if (bestGrid.finalMto < cur) {
    recs.push({
      key: 'scenario',
      title: `하루 MTO ${bestGrid.mtoPerDay}장 · STEP2 동시 ${bestGrid.step2Concurrency}장 운영`,
      gainDays: diffDays(cur, bestGrid.finalMto),
      detail: `최종 MTO ${fmtShort(cur)} → ${fmtShort(bestGrid.finalMto)}`,
      agreement: true,
    });
  }
  const cands = [
    ['short', 'STEP2가 짧은 Type을 Part 안에서 앞 번호로', (a, b) => cfg.step2Tat[a.type] - cfg.step2Tat[b.type] || a.no - b.no],
    ['long', 'STEP2가 긴 Type을 Part 안에서 앞 번호로', (a, b) => cfg.step2Tat[b.type] - cfg.step2Tat[a.type] || a.no - b.no],
  ];
  let bestOrder = null;
  for (const [key, title, cmp] of cands) {
    const ls = reorderWithinParts(layersInput, cmp);
    const r = buildSchedule(result.partAGds, ls, cfg);
    const better = r.finalMto < cur || (r.finalMto === cur && r.layers.reduce((a, l) => a + l.mtoWaitDays + l.step2WaitDays, 0) < s.mtoWaitTotal + s.step2WaitTotal - 2);
    if (better && (!bestOrder || r.finalMto < bestOrder.result.finalMto)) bestOrder = { key, title, layers: ls, result: r };
  }
  if (bestOrder) {
    const gain = diffDays(cur, bestOrder.result.finalMto);
    const waitNow = s.mtoWaitTotal + s.step2WaitTotal;
    const waitNew = bestOrder.result.layers.reduce((a, l) => a + l.mtoWaitDays + l.step2WaitDays, 0);
    recs.push({
      key: 'reorder',
      title: `Layer 순서 재배열 — ${bestOrder.title}`,
      gainDays: gain,
      detail: `${gain > 0 ? `최종 MTO ${fmtShort(cur)} → ${fmtShort(bestOrder.result.finalMto)}` : '최종 MTO는 같음'} · 대기 합계 ${waitNow}일 → ${waitNew}일`,
      agreement: true,
      order: bestOrder.layers,
    });
  }
  // GDS 하루 당기기 효과 (휴일에 걸리면 하루 이상 차이 날 수 있음)
  for (const k of [1, 2, 3]) {
    const r = buildSchedule(addDays(result.partAGds, -k), layersInput, cfg);
    const g = diffDays(cur, r.finalMto);
    if (g > k) {
      recs.push({
        key: 'gds',
        title: `${result.step1[REVISION_PART] ? '' : 'Part A '}GDS ${k}일 앞당기기 (${fmtShort(addDays(result.partAGds, -k))})`,
        gainDays: g,
        detail: `휴일을 피해 최종 MTO가 ${g}일 당겨짐 (${fmtShort(r.finalMto)}) — 앞당긴 일수보다 효과가 큼`,
        agreement: true,
      });
      break;
    }
  }
  recs.sort((a, b) => b.gainDays - a.gainDays);

  // ── 리스크
  const risks = [];
  if (caps.length) {
    const longest = caps.reduce((m, r) => (diffDays(r.to, r.from) > diffDays(m.to, m.from) ? r : m), caps[0]);
    risks.push({
      key: 'full',
      title: 'STEP2 슬롯이 꽉 차는 구간',
      detail: `${caps.length}개 구간 · 가장 긴 구간 ${fmtShort(longest.from)} ~ ${fmtShort(longest.to)} (${diffDays(longest.to, longest.from) + 1}일). 이때 재작업·지연이 생기면 뒤 Layer가 바로 밀림`,
    });
  }
  const zeroSlack = result.layers.filter((l) => l.mtoWaitDays === 0 && l.step2WaitDays === 0);
  if (zeroSlack.length) {
    risks.push({
      key: 'slack',
      title: `여유 없는 Layer ${zeroSlack.length}장`,
      detail: `STEP2·MTO 대기가 0일이라 하루만 늦어도 MTO가 밀림: ${zeroSlack.slice(0, 8).map((l) => l.layer).join(', ')}${zeroSlack.length > 8 ? ' …' : ''}`,
    });
  }
  const nearHol = result.holidaysInWindow.filter((h) => result.layers.some((l) => Math.abs(diffDays(l.mtoDate, h.date)) <= 1));
  if (nearHol.length) {
    risks.push({
      key: 'hol',
      title: 'MTO 날짜 바로 앞뒤에 공휴일',
      detail: `${nearHol.map((h) => `${fmtShort(h.date)} ${h.name}`).join(', ')} — 하루 밀리면 연휴만큼 더 밀릴 수 있음`,
    });
  }
  const yearsUsed = [...new Set([result.partAGds, result.finalMto].map((d) => Number(d.slice(0, 4))))];
  const missing = yearsUsed.filter((y) => !HOLIDAY_YEARS.includes(y));
  if (missing.length) {
    risks.push({ key: 'table', title: `${missing.join(', ')}년 공휴일 표 없음`, detail: '이 해는 주말만 휴일로 계산했습니다. [규칙]의 추가 휴무일에 공휴일을 넣어 주세요.' });
  }

  const dominant = bottlenecks[0];
  const capText = `STEP2 ${cfg.step2Concurrency ?? '무제한'}장 · MTO ${cfg.mtoPerDay}장/일`;
  const headline = [
    `최종 MTO ${fmtShort(result.finalMto)} (리드타임 ${result.leadTimeDays}일).`,
    constraintCost > 0 ? `제약(${capText})이 없으면 ${fmtShort(free.finalMto)} — 제약 때문에 ${constraintCost}일 늦어집니다.` : '제약 때문에 늦어지는 날은 없습니다.',
    dominant ? `누적 대기가 가장 큰 원인은 ${dominant.title} (${Math.round(dominant.share * 100)}%).` : '',
  ].filter(Boolean).join(' ');

  return { summary: s, headline, critical: crit, constraintCost, freeFinal: free.finalMto, bottlenecks, recs, risks, grid, capRanges: caps };
}
