// 근무 계획 계산 (v3.2). 순수 함수만 — 화면·store 를 import 하지 않는다.
//
// 데이터
//   plans      { [ymd]: 분 }               자동 날의 실근무 (출근만 정한 날 포함)
//   planPins   { [ymd]: { in?, out?, net? } } 그날 직접 정한 값, 최대 두 개 (전이표 resolvePinTransition)
//   planLeaves { [ymd]: { leave, leaveMin? } } 계획 휴가 (근무기록 records 에는 쓰지 않음)
//   planGoal   DEFAULT_GOAL 모양            월말 목표 + 전체 근무 시간대
//
// 우선순위: 사이트 기록 > 직접 입력 기록 > 날짜 고정(pin·계획 휴가) > 전체 근무 시간대 > 설정 기본값
import { capacityOf, dailyCapOf, projectedOf, netFromGross, grossForNet, waterFill, summarizeMonth } from './engine.js';
import { toMin, fmtClock, weekKeyOf, parseYmd } from './time.js';

/** 목표 설정 기본값 (store 의 state.planGoal 초기값) */
export const DEFAULT_GOAL = {
  target: 'ot0', // 'required' | 'ot0' | 'ot14' | 'max' | 'custom'
  customExcessMin: 0, // target === 'custom' 일 때 원하는 '초과 근무' 분 (OT 아님)
  startIn: '08:30', // 전체 출근 시각. null 이면 설정의 기본 출근(rules.planDefaultIn)
  cutoff: '19:00', // 퇴근 마지노선. null = 제한 없음 → 인정 시간대 끝(rules.recognizeTo)
  earlyDays: [5], // 일찍 퇴근할 요일 (0=일 … 6=토). 기본: 금요일
  earlyOut: '17:00', // 그 요일의 퇴근 시각
  minDailyMin: 360, // 하루 최소 실근무 (0이면 안 씀)
};

export const GOAL_IDS = ['required', 'ot0', 'ot14', 'max', 'custom'];

// ─────────────────────────────────────────────────────────────
// 하루 고정 (pin)
// ─────────────────────────────────────────────────────────────

/** 기록이 있는가 (출근·퇴근·근태 중 하나라도). 빈 객체는 기록 아님 */
export const hasRecord = (rec) => !!rec && !rec.planLeave && !!(rec.in || rec.out || rec.leave);

/** pin 종류: 'none' | 'in' | 'net' | 'out' | 'in+out' | 'in+net' | 'out+net' */
export function pinKind(pin) {
  if (!pin) return 'none';
  const a = [];
  if (pin.in != null) a.push('in');
  if (pin.out != null) a.push('out');
  if (pin.net != null) a.push('net');
  return a.length ? a.join('+') : 'none';
}

/** 직접 정한 날인가 (퇴근 또는 실근무를 정함). 출근만 정한 날은 자동 */
export const isFixedPin = (pin) => !!pin && (pin.out != null || pin.net != null);

/** 그날 상태 태그 글자 (GUIDE-ui-window §3.3) */
export function pinTagText(pin) {
  switch (pinKind(pin)) {
    case 'out':
    case 'out+net':
      return '퇴근 고정';
    case 'net':
    case 'in+net':
      return '시간 고정';
    case 'in+out':
      return '출퇴근 고정';
    case 'in':
      return `출근 ${pin.in}`;
    default:
      return null;
  }
}

export const BLOCK_BOTH = '출근·퇴근을 모두 정한 날이에요. 출근이나 퇴근을 바꿔 주세요.';

/**
 * 전이표 (GUIDE-plan-mechanism §2.3). field = 'in' | 'out' | 'net', value = 'HH:MM' 또는 분
 * → 새 pin, 또는 { blocked: 이유 }
 */
export function resolvePinTransition(pin, field, value) {
  const p = pin || {};
  const has = { in: p.in != null, out: p.out != null, net: p.net != null };
  if (field === 'in') {
    if (has.out) return { in: value, out: p.out }; // in+out, out+net → in+out
    if (has.net) return { in: value, net: p.net }; // net, in+net → in+net
    return { in: value };
  }
  if (field === 'out') {
    if (has.out && has.net) return { out: value, net: p.net }; // out+net → out+net (출근이 움직임)
    if (has.in) return { in: p.in, out: value }; // in, in+out, in+net → in+out
    return { out: value }; // none, net, out → out
  }
  if (field === 'net') {
    if (has.in && has.out) return { blocked: BLOCK_BOTH };
    if (has.out) return { out: p.out, net: value }; // out → out+net (출근이 움직임)
    if (has.in) return { in: p.in, net: value };
    return { net: value };
  }
  return p;
}

/** 그날 출근 시각 (분): 오늘 출근 기록 → 그날 정한 출근 → 전체 출근 → 설정 기본. 인정 시작 전이면 인정 시작으로 */
export function goalStartOf(d, rules, goal, pins = {}) {
  if (d.isToday && d.inMin != null) return d.inMin;
  const t = toMin(pins[d.key]?.in || goal?.startIn || rules.planDefaultIn);
  return Math.max(t, toMin(rules.recognizeFrom));
}

/** 그날 퇴근 한계 (분): 일찍 퇴근 요일 → 그 시각, 아니면 마지노선(없으면 인정 시간대 끝) */
export function goalEndOf(d, rules, goal) {
  const end = toMin(rules.recognizeTo);
  if (goal?.earlyDays?.includes(d.dow)) return Math.min(end, toMin(goal.earlyOut));
  return goal?.cutoff ? Math.min(end, toMin(goal.cutoff)) : end;
}

/** 자동 날 실근무 상한 = 그날 출근 ~ 퇴근 한계 (인정 시간대·제외시간 반영). 상한은 이것으로만 계산 */
export function goalCapOf(d, rules, goal, pins = {}) {
  const start = goalStartOf(d, rules, goal, pins);
  const limit = goalEndOf(d, rules, goal);
  const exclude = d.isToday ? 0 : d.plannedExclude || 0;
  const byClock = netFromGross(Math.max(0, limit - start - exclude), rules);
  return Math.max(d.isToday ? d.actual : 0, Math.min(dailyCapOf(d, rules), byClock));
}

/**
 * 그날 출근·퇴근·실근무 (분). 출근 = 오늘 기록 > pin.in > (out+net 계산) > 전체 출근 > 설정 기본
 * autoNet = 자동 날 실근무 (plans[key])
 * → { in, out, net, kind, fixed: { in, out, net } }  fixed.in = 'record' | true | false
 */
export function resolveDay(d, pin, rules, goal, autoNet) {
  const p = pin || {};
  const ex = d.plannedExclude || 0;
  const from = toMin(rules.recognizeFrom);
  const recIn = d.isToday && d.inMin != null ? d.inMin : null;
  const pinIn = recIn == null && p.in != null ? toMin(p.in) : null;
  const defIn = Math.max(toMin(goal?.startIn || rules.planDefaultIn), from);
  let inM;
  let outM;
  let net;
  const fixed = { in: recIn != null ? 'record' : pinIn != null, out: p.out != null, net: false };
  if (p.out != null && p.net != null && recIn == null && pinIn == null) {
    outM = toMin(p.out);
    net = p.net;
    inM = outM - grossForNet(net, rules) - ex;
    fixed.net = true;
  } else {
    inM = recIn ?? pinIn ?? defIn;
    if (p.out != null) {
      outM = toMin(p.out);
      net = netFromGross(Math.max(0, outM - inM - ex), rules);
    } else {
      net = p.net ?? autoNet ?? capacityOf(d, rules);
      fixed.net = p.net != null;
      outM = inM + grossForNet(net, rules) + ex;
    }
  }
  return { in: inM, out: outM, net, kind: pinKind(p), fixed };
}

/** pin 을 바꿨을 때 막아야 하는 이유 (없으면 null) */
export function checkResolved(r, rules) {
  if (r.in < toMin(rules.recognizeFrom)) return `${rules.recognizeFrom} 이전 출근은 인정되지 않아요`;
  if (r.out > toMin(rules.recognizeTo)) return `${rules.recognizeTo} 이후는 인정되지 않아요`;
  if (r.out <= r.in || r.net <= 0) return '출근이 퇴근보다 늦어요';
  return null;
}

/** 배분·스테퍼가 쓰는 실근무 값 규칙 (GUIDE §4.4) */
export function isValidNet(v, rules) {
  if (v == null || v < 0 || v % 10 !== 0) return false;
  return netFromGross(grossForNet(v, rules), rules) === v && grossForNet(v + 10, rules) >= grossForNet(v, rules);
}

// ─────────────────────────────────────────────────────────────
// 계획 휴가 · 계산용 계획
// ─────────────────────────────────────────────────────────────

/** 기록이 없는 날에만 계획 휴가를 겹친 records 사본 (기록이 있으면 무조건 기록) */
export function withPlanLeaves(records, planLeaves = {}) {
  const keys = Object.keys(planLeaves || {});
  if (!keys.length) return records;
  const out = { ...records };
  for (const k of keys) {
    if (hasRecord(records[k])) continue;
    const pl = planLeaves[k];
    if (!pl?.leave) continue;
    out[k] = { ...(records[k] || {}), leave: pl.leave, ...(pl.leaveMin != null ? { leaveMin: pl.leaveMin } : {}), planLeave: true };
  }
  return out;
}

/** 앞으로의 날 중 계획을 쓰지 않는 날 (사이트·직접 입력 기록이 있는 미래 날) */
export const isRecordFuture = (d, records) => !d.isPast && !d.isToday && hasRecord(records?.[d.key]);

/** 계산에 쓰는 실근무 = 자동 날은 plans, 직접 정한 날은 pin 으로 계산한 값 */
export function effectivePlans(days, records, rules, plans = {}, pins = {}, goal = DEFAULT_GOAL) {
  const eff = { ...plans };
  for (const d of days) {
    if (d.isPast || isRecordFuture(d, records)) continue;
    const pin = pins[d.key];
    if (!pin) continue;
    if (isFixedPin(pin) || (d.isToday && pin.out != null)) eff[d.key] = Math.max(0, resolveDay(d, pin, rules, goal, plans[d.key]).net);
  }
  return eff;
}

/**
 * 계획까지 반영한 월 요약. WorkTime 의 공통 summary 와 Planner 가 같이 쓴다.
 * summary.effPlans = 계산에 쓴 실근무, summary.recs = 계획 휴가를 겹친 기록
 */
export function planSummary({ year, month, records, rules, plans = {}, pins = {}, leaves = {}, goal = DEFAULT_GOAL, now = new Date() }) {
  const recs = withPlanLeaves(records, leaves);
  const s0 = summarizeMonth(year, month, recs, rules, plans, now);
  const eff = effectivePlans(s0.days, records, rules, plans, pins, goal);
  const s = summarizeMonth(year, month, recs, rules, eff, now);
  s.effPlans = eff;
  s.recs = recs;
  return s;
}

/** 그날 계획 실근무 (출장·교육 인정 제외) */
const plannedWork = (d, P, rules) => projectedOf(d, P, rules) - d.workCredit;

/** 자동으로 짜는 날: 남은 근무일 중 일할 수 있고, 직접 정하지 않은 날 (출근만 정한 날 포함) */
export const autoDaysOf = (summary, rules, pins = {}) => summary.upcoming.filter((d) => capacityOf(d, rules) > 0 && !isFixedPin(pins[d.key]));

// ─────────────────────────────────────────────────────────────
// 목표대로 채우기
// ─────────────────────────────────────────────────────────────

/** 목표 → 원하는 '초과 근무'(= 월말 평일 근무 − 필수) 분. max 는 Infinity */
export function excessForGoal(goal, rules) {
  const inc = rules.inclusiveOtMin ?? 840;
  switch (goal.target) {
    case 'required':
      return 0;
    case 'ot0':
      return inc;
    case 'ot14':
      return inc + 840;
    case 'custom':
      return Math.max(0, goal.customExcessMin || 0);
    case 'max':
      return Infinity;
    default:
      return inc;
  }
}

/** 목표 대비 = 월말 예상 초과 − 목표 초과 (최대한은 목표가 없어 0) */
export function monthDrift(summary, rules, goal) {
  const want = excessForGoal(goal, rules);
  if (want === Infinity) return 0;
  return summary.projectedDiff - want;
}

/**
 * 목표·조건을 지키며 자동 날에 시간을 나눈다. 직접 정한 날은 고정분으로 빼고 건드리지 않는다.
 * summary = planSummary(...) 결과. keys = 이 날들에만 (null 이면 자동 날 전체)
 * → { plans, wanted, reached, feasible, capped, suggestions }  (출근은 돌려주지 않음 — resolveDay 로 계산)
 */
export function distributeByGoal(summary, rules, plans = {}, pins = {}, goal = DEFAULT_GOAL, keys = null, _noSuggest = false) {
  const P = summary.effPlans || plans;
  const sel = keys ? new Set(keys) : null;
  const free = autoDaysOf(summary, rules, pins).filter((d) => !sel || sel.has(d.key));
  const freeKeys = new Set(free.map((d) => d.key));
  const fixed = summary.upcoming.filter((d) => !freeKeys.has(d.key)).reduce((s, d) => s + plannedWork(d, P, rules), 0);
  const wanted = excessForGoal(goal, rules);

  const caps = free.map((d) => goalCapOf(d, rules, goal, pins));
  const floors = free.map((d, i) => Math.min(caps[i], Math.max(d.isToday ? d.actual : 0, goal.minDailyMin || 0)));
  const sumFloors = floors.reduce((a, b) => a + b, 0);
  const need = wanted === Infinity ? Infinity : Math.max(0, summary.workToGo + wanted - fixed);
  const room0 = need === Infinity ? caps.reduce((a, b) => a + b, 0) : need;
  let alloc = waterFill(room0 - sumFloors, caps.map((c, i) => c - floors[i])).map((v, i) => v + floors[i]);

  // 월 최대 근무 시간(주말·휴일 포함)을 넘지 않게
  const others = summary.days.filter((d) => !freeKeys.has(d.key)).reduce((s, d) => s + projectedOf(d, P, rules), 0);
  const room = summary.possible - others - free.reduce((s, d) => s + d.workCredit, 0);
  let capped = false;
  if (alloc.reduce((a, b) => a + b, 0) > room) {
    alloc = waterFill(room - sumFloors, alloc.map((v, i) => v - floors[i])).map((v, i) => v + floors[i]);
    capped = true;
  }

  const out = {};
  free.forEach((d, i) => (out[d.key] = alloc[i]));
  const projectedReq = summary.days
    .filter((d) => d.isWorkday)
    .reduce((s, d) => s + (freeKeys.has(d.key) ? out[d.key] + d.workCredit : projectedOf(d, P, rules)), 0);
  const reached = projectedReq - summary.required;
  const feasible = wanted === Infinity || reached >= wanted - 10;

  let suggestions = [];
  if (!feasible && !_noSuggest) suggestions = suggestFixes(summary, rules, plans, pins, goal, keys, reached);
  return { plans: out, wanted, reached, feasible, capped, suggestions };
}

const hhmm = (m) => fmtClock(m);

/** 목표를 못 채울 때 해결안: 마지노선 늦추기 / 출근 앞당기기 / 일찍 퇴근 끄기 / 목표 낮추기 */
export function suggestFixes(summary, rules, plans, pins, goal, keys, reached) {
  const run = (g) => distributeByGoal(summary, rules, plans, pins, g, keys, true);
  const list = [];
  if (goal.cutoff) {
    for (let t = toMin(goal.cutoff) + 30; t <= toMin(rules.recognizeTo); t += 30) {
      const g = { ...goal, cutoff: hhmm(t) };
      const r = run(g);
      if (r.feasible) {
        list.push({ kind: 'cutoff', label: `마지노선 ${g.cutoff}으로`, goal: g, reached: r.reached });
        break;
      }
    }
  }
  const s0 = toMin(goal.startIn || rules.planDefaultIn);
  for (let t = s0 - 30; t >= toMin(rules.recognizeFrom); t -= 30) {
    const g = { ...goal, startIn: hhmm(t) };
    const r = run(g);
    if (r.feasible) {
      list.push({ kind: 'start', label: `출근 ${g.startIn}으로 앞당기기`, goal: g, reached: r.reached });
      break;
    }
  }
  if (goal.earlyDays?.length) {
    const g = { ...goal, earlyDays: [] };
    const r = run(g);
    list.push({ kind: 'early', label: '일찍 퇴근 요일 끄기', goal: g, reached: r.reached });
  }
  const can = Math.max(0, Math.floor(reached / 60) * 60);
  list.push({ kind: 'target', label: '가능한 만큼으로 목표 낮추기', goal: { ...goal, target: 'custom', customExcessMin: can }, reached: can });
  return list;
}

export const TIGHT_OUT = 20 * 60; // 평균 퇴근이 이 시각 이후면 '빡빡'
export const TIGHT_NET = 11 * 60; // 하루라도 이 이상이면 '빡빡'

/** 계획 하나(distributeByGoal 결과)를 사람이 보는 숫자로 요약 */
export function describePlan(summary, rules, goal, pins, r) {
  const rows = summary.upcoming
    .filter((d) => d.key in r.plans)
    .map((d) => {
      const net = r.plans[d.key];
      const start = goalStartOf(d, rules, goal, pins);
      const out = start + grossForNet(net, rules) + (d.isToday ? 0 : d.plannedExclude || 0);
      return { key: d.key, net, start, out };
    });
  const n = rows.length || 1;
  const avgNet = Math.round(rows.reduce((s, x) => s + x.net, 0) / n);
  const avgOut = Math.round(rows.reduce((s, x) => s + x.out, 0) / n);
  const latestOut = rows.reduce((m, x) => Math.max(m, x.out), 0);
  const ot = r.reached - (rules.inclusiveOtMin ?? 840);
  let level = 'ok';
  if (goal.target === 'max') level = 'max';
  else if (!r.feasible) level = 'fail';
  else if (avgOut >= TIGHT_OUT || rows.some((x) => x.net >= TIGHT_NET)) level = 'tight';
  return { rows, days: rows.length, avgNet, avgOut, latestOut, reached: r.reached, ot, level, feasible: r.feasible, capped: r.capped };
}

/** 목표 선택지 전체 미리보기 → { header, options: { required|ot0|ot14|max|custom } } */
export function goalPreview(summary, rules, plans = {}, pins = {}, goal = DEFAULT_GOAL) {
  const options = {};
  for (const id of GOAL_IDS) {
    const g = { ...goal, target: id };
    const r = distributeByGoal(summary, rules, plans, pins, g, null, true);
    options[id] = describePlan(summary, rules, g, pins, r);
  }
  const P = summary.effPlans || plans;
  const fixedDays = summary.upcoming.filter((d) => isFixedPin(pins[d.key]));
  return {
    header: {
      workToGo: summary.workToGo,
      fixedDays: fixedDays.length,
      fixedMin: fixedDays.reduce((s, d) => s + projectedOf(d, P, rules), 0),
      freeDays: autoDaysOf(summary, rules, pins).length,
    },
    options,
  };
}

// ─────────────────────────────────────────────────────────────
// 나머지 날 맞추기 (제안)
// ─────────────────────────────────────────────────────────────

/**
 * 양 amount(분, +면 늘림)를 자동 날에 나눈다 (GUIDE §6.3)
 * mode: 'even' 남은 날 고르게 · 'near' 내일부터 차례로 · 'week' 그 주 안에서
 * → { plans, changes:[{key, from, to}], absorbed, leftover, targets }
 */
export function spreadDelta(summary, rules, plans = {}, pins = {}, goal = DEFAULT_GOAL, { amount = 0, mode = 'even', fromKey = null, exclude = [] } = {}) {
  const P = summary.effPlans || plans;
  const ex = new Set(exclude);
  const week = mode === 'week' && fromKey ? weekKeyOf(parseYmd(fromKey)) : null;
  const targets = autoDaysOf(summary, rules, pins).filter(
    (d) => !d.isToday && d.key > summary.todayKey && !ex.has(d.key) && (!week || weekKeyOf(d.date) === week),
  );
  const sign = amount < 0 ? -1 : 1;
  const need = Math.abs(Math.round(amount));
  const cur = targets.map((d) => plannedWork(d, P, rules));
  const rooms = targets.map((d, i) => {
    if (sign > 0) return Math.max(0, goalCapOf(d, rules, goal, pins) - cur[i]);
    const floor = Math.min(cur[i], goal.minDailyMin || 0);
    return Math.max(0, cur[i] - floor);
  });
  let alloc;
  if (mode === 'near') {
    let left = need;
    alloc = rooms.map((r) => {
      const take = Math.min(left, Math.floor(r / 10) * 10);
      left -= take;
      return take;
    });
    if (left > 0 && left < 10) {
      const i = alloc.findIndex((a, j) => rooms[j] - a >= left);
      if (i >= 0) alloc[i] += left;
    }
  } else {
    alloc = waterFill(need, rooms);
  }
  const out = {};
  const changes = [];
  let absorbed = 0;
  targets.forEach((d, i) => {
    if (!alloc[i]) return;
    let to = cur[i] + sign * alloc[i];
    // 휴게 경계 값 규칙: 맞지 않으면 늘릴 땐 줄이고 줄일 땐 늘려서 맞춘다
    let guard = 0;
    while (!isValidNet(to, rules) && guard++ < 6) to -= sign * 10;
    if (to === cur[i]) return;
    out[d.key] = to;
    changes.push({ key: d.key, from: cur[i], to });
    absorbed += Math.abs(to - cur[i]);
  });
  return { plans: out, changes, absorbed: sign * absorbed, leftover: sign * Math.max(0, need - absorbed), targets: targets.map((d) => d.key) };
}

// ─────────────────────────────────────────────────────────────
// 오늘
// ─────────────────────────────────────────────────────────────

/**
 * 오늘 칸·오늘 패널 (GUIDE §7)
 * → { state: 'beforeIn'|'working'|'done'|'out'|'leave', inMin, soFar, plan:{net,out,left}, options:[{out, net, monthDelta, isPlan}], drift }
 */
export function todayAdvice(summary, rules, pins = {}, goal = DEFAULT_GOAL) {
  const d = summary.today;
  if (!d || !d.isWorkday) return null;
  const drift = monthDrift(summary, rules, goal);
  if (d.outMin != null && !d.live) return { state: 'out', drift };
  if (capacityOf(d, rules) === 0) return { state: 'leave', drift };
  const P = summary.effPlans || {};
  const r = resolveDay(d, pins[d.key], rules, goal, P[d.key]);
  const ex = d.plannedExclude || 0;
  const soFar = d.inMin != null ? d.actual : 0;
  const left = Math.max(0, r.net - soFar);
  let state = 'working';
  if (d.inMin == null) state = 'beforeIn';
  else if (left <= 0) state = 'done';
  const endMax = toMin(rules.recognizeTo);
  const nowMin = summary.nowMin ?? 0;
  const offsets = [-60, -30, 0, 30];
  const outs = offsets.map((o) => r.out + o);
  if (goal?.earlyDays?.includes(d.dow)) {
    const e = toMin(goal.earlyOut);
    if (!outs.includes(e) && e > r.in) outs[0] = e;
  }
  const options = [...new Set(outs)]
    .sort((a, b) => a - b)
    .filter((o) => o > r.in && o <= endMax && (o === r.out || d.inMin == null || o > nowMin - 1))
    .map((o) => {
      const net = netFromGross(Math.max(0, o - r.in - ex), rules);
      return { out: o, net, monthDelta: net - r.net, isPlan: o === r.out };
    });
  return { state, inMin: r.in, soFar, plan: { net: r.net, out: r.out, left }, options, drift };
}

// ─────────────────────────────────────────────────────────────
// 저장 데이터 정리
// ─────────────────────────────────────────────────────────────

/** 이전 규칙 (GUIDE §8.2). 앱 시작 시 1회 → { planPins, planLeaves, records, moved } */
export function migrateV32(state, todayKey) {
  const planPins = { ...(state.planPins || {}) };
  const planLeaves = { ...(state.planLeaves || {}) };
  const records = { ...state.records };
  for (const [k, locked] of Object.entries(state.planLocks || {})) {
    if (locked && state.plans?.[k] != null && k >= todayKey && !planPins[k]) planPins[k] = { net: state.plans[k] };
  }
  for (const [k, t] of Object.entries(state.planIns || {})) {
    if (k >= todayKey && t) planPins[k] = { ...(planPins[k] || {}), in: t };
  }
  for (const k of Object.keys(planPins)) if (planPins[k].in && planPins[k].out && planPins[k].net != null) delete planPins[k].net; // 최대 두 개
  let moved = 0;
  for (const [k, rec] of Object.entries(state.records || {})) {
    if (k < todayKey || !rec) continue;
    if (rec.edited && rec.source !== 'portal' && rec.leave && !rec.in && !rec.out) {
      planLeaves[k] = { leave: rec.leave, ...(rec.leaveMin != null ? { leaveMin: rec.leaveMin } : {}) };
      const rest = { ...rec };
      delete rest.leave;
      delete rest.leaveMin;
      delete rest.edited;
      if (Object.keys(rest).some((x) => rest[x] != null && rest[x] !== '')) records[k] = rest;
      else delete records[k];
      moved += 1;
    }
  }
  return { planPins, planLeaves, records, moved };
}

/** key < todayKey 인 항목을 뺀 사본 */
export function dropPast(obj, todayKey) {
  if (!obj) return obj;
  let changed = false;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k < todayKey) changed = true;
    else out[k] = v;
  }
  return changed ? out : obj;
}
