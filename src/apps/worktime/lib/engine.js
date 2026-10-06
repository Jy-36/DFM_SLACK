// 선택근무제 정산 엔진. 순수 함수만 있으며 화면과 분리되어 있어 단독 테스트가 가능하다.
import { toMin, ymd, monthDates, weekKeyOf, parseYmd, addDays, fmtClock } from './time.js';
import { holidayName } from './holidays.js';

const sortedBreaks = (rules) => [...(rules.breaks || [])].sort((a, b) => a.at - b.at);

/** 체류시간(gross) → 휴게 차감 후 실근무(net). "실근무 at분마다 minutes분 휴게" 방식 */
export function netFromGross(gross, rules) {
  let net = 0;
  let left = Math.max(0, gross);
  for (const b of sortedBreaks(rules)) {
    const work = b.at - net;
    if (left <= work) return net + left;
    net = b.at;
    left -= work;
    left = Math.max(0, left - b.minutes);
    if (left === 0) return net;
  }
  return net + left;
}

/** 실근무 net분을 채우는 데 필요한 최소 체류시간 */
export function grossForNet(net, rules) {
  if (net <= 0) return 0;
  let gross = net;
  for (const b of sortedBreaks(rules)) if (b.at < net) gross += b.minutes;
  return gross;
}

/** 패밀리데이 후보: 그 달 21일이 있는 주(월~일)의 금요일 */
export function familyDayKey(year, month) {
  const d21 = new Date(year, month, 21);
  const mon = addDays(d21, d21.getDay() === 0 ? -6 : 1 - d21.getDay());
  return ymd(addDays(mon, 4));
}

/** 그날 실근무로 넣을 수 있는 최대 (하루 제한을 끄면 근로 인정 시간대 전체) */
export function dailyCapOf(day, rules) {
  const from = toMin(rules.recognizeFrom);
  // 오늘은 이미 출근한 시각부터 인정 시간대 끝까지만 가능
  const start = day?.isToday && day.inMin != null ? Math.max(from, day.inMin) : from;
  const windowNet = netFromGross(Math.max(0, toMin(rules.recognizeTo) - start), rules);
  if (rules.dailyLimitOn) return Math.min(windowNet, Math.max(0, rules.maxDailyMin - (day?.workCredit || 0)));
  return windowNet;
}

/** 계획대로 일하면 인정 시간대 끝을 넘는 날 → 그 시각에 끝나도록 앞당긴 출근 시각 */
export function earlierStarts(summary, rules, plans, planIns = {}) {
  const out = {};
  const end = toMin(rules.recognizeTo);
  for (const d of summary.upcoming) {
    if (d.isToday || plans[d.key] == null) continue;
    const gross = grossForNet(plans[d.key], rules) + (d.plannedExclude || 0);
    const start = toMin(planIns[d.key] || rules.planDefaultIn);
    if (start + gross > end) out[d.key] = fmtClock(Math.max(toMin(rules.recognizeFrom), Math.floor((end - gross) / 5) * 5)); // 5분 단위로 당김
  }
  return out;
}
const capDay = (v, rules) => (rules.dailyLimitOn ? Math.min(v, rules.maxDailyMin) : v);

/** 제외시간 한 건의 길이(분). 구간(from~to) 또는 분(min)으로 적는다 */
export function excludeLen(x) {
  if (x == null) return 0;
  if (x.min != null) return Math.max(0, Number(x.min) || 0);
  const a = toMin(x.from);
  const b = toMin(x.to);
  return a != null && b != null && b > a ? b - a : 0;
}

/** 그날 제외시간 합계 (계획용: 전체 길이) */
export const excludeTotal = (rec) => (rec?.excludes || []).reduce((s, x) => s + excludeLen(x), 0);

/** 실제 근무 구간 [start, end] 안에 들어간 제외시간 (구간은 겹친 만큼, 분 단위는 전부) */
export function excludeWithin(rec, start, end) {
  let sum = 0;
  for (const x of rec?.excludes || []) {
    if (x.min != null) {
      sum += excludeLen(x);
      continue;
    }
    const a = toMin(x.from);
    const b = toMin(x.to);
    if (a == null || b == null) continue;
    sum += Math.max(0, Math.min(b, end) - Math.max(a, start));
  }
  return Math.min(sum, Math.max(0, end - start));
}

/** 하루 평가 */
export function evalDay(date, rec, rules, ctx = {}) {
  const key = ymd(date);
  const dow = date.getDay();
  const holiday = holidayName(key);
  const isWeekend = dow === 0 || dow === 6;
  const isWorkday = !isWeekend && !holiday;
  const { todayKey, nowMin } = ctx;
  const isToday = key === todayKey;
  const isPast = todayKey ? key < todayKey : true;
  const isFuture = todayKey ? key > todayKey : false;

  const leaveDef = rec?.leave ? rules.leaveTypes[rec.leave] : null;
  // 비근무근태는 근무일에만 필요시간을 줄인다
  const leaveMin = leaveDef ? (leaveDef.variable ? rec.leaveMin ?? leaveDef.credit : leaveDef.credit) : 0;
  const offCredit = leaveDef && leaveDef.kind === 'off' && isWorkday ? leaveMin : 0;
  const isRest = !!leaveDef && leaveDef.kind === 'rest' && isWorkday; // 쉬지만 필요시간 유지
  const workCredit = leaveDef && leaveDef.kind === 'work' ? leaveMin : 0;
  const credit = offCredit + workCredit;

  const inMin = toMin(rec?.in);
  let outMin = toMin(rec?.out);
  let live = false;
  if (inMin != null && outMin == null && isToday && nowMin != null && nowMin > inMin) {
    outMin = nowMin;
    live = true;
  }

  let gross = 0;
  let actual = 0;
  let excluded = 0;
  if (inMin != null && outMin != null && outMin > inMin) {
    const from = Math.max(inMin, toMin(rules.recognizeFrom));
    const to = Math.min(outMin, toMin(rules.recognizeTo));
    gross = Math.max(0, to - from);
    // 제외시간(외출 등)은 체류시간에서 빼고, 남은 시간에 휴게 규칙을 적용한다
    excluded = excludeWithin(rec, from, to);
    actual = netFromGross(gross - excluded, rules);
  }
  // 제외시간은 출근 기록이 있는(근무한) 날에만 반영
  const plannedExclude = inMin != null ? excludeTotal(rec) : 0;
  const recognized = capDay(actual + workCredit, rules);
  const dayRequired = isWorkday ? Math.max(0, rules.dailyStdMin - offCredit) : 0; // 그날 필수근무

  const warnings = [];
  if (inMin != null && toMin(rec?.out) == null && !isToday && !isFuture) warnings.push('퇴근 기록 누락');
  if (isPast && isWorkday && inMin == null && credit === 0 && !isRest) warnings.push('근무 기록 없음');
  if (isPast && isWorkday && rules.minDailyMin > 0 && actual > 0 && actual + credit < rules.minDailyMin)
    warnings.push('최소 근무 미달');
  if (rules.dailyLimitOn && actual + workCredit > rules.maxDailyMin) warnings.push('1일 최대 초과');

  let status = 'work';
  if (holiday && !actual) status = 'holiday';
  else if (isWeekend && !actual) status = 'weekend';
  else if (isFuture) status = credit ? 'leave' : 'future';
  else if (live) status = 'live';
  else if ((credit >= rules.dailyStdMin || isRest) && !actual) status = 'leave';
  else if (warnings.length) status = 'warn';

  return {
    key,
    date,
    dow,
    holiday,
    isWorkday,
    isToday,
    isPast,
    isFuture,
    leave: rec?.leave || null,
    leaveLabel: leaveDef ? (leaveDef.variable ? `${leaveDef.label} ${Math.round(leaveMin / 60)}h` : leaveDef.label) : null,
    leaveMin,
    excluded,
    plannedExclude,
    leaveKind: leaveDef?.kind || null,
    isRest,
    credit,
    offCredit,
    workCredit,
    dayRequired,
    inMin,
    outMin: live ? null : outMin,
    nowMin: live ? outMin : null,
    gross,
    actual,
    recognized,
    live,
    warnings,
    status,
    note: rec?.note || '',
  };
}

/** 그날 일할 수 있는 기본 계획(실근무, 분) */
export const capacityOf = (day, rules) =>
  day.isWorkday && !day.isRest ? Math.max(0, rules.dailyStdMin - day.offCredit - day.workCredit) : 0;
export const defaultPlanFor = capacityOf;

/** 그날 예상 인정시간: 지난 날은 실적, 오늘·미래는 계획 */
export function projectedOf(day, plans, rules) {
  if (day.isPast) return day.recognized;
  // 종일 비근무근태(연차 등)인 날은 계획이 남아 있어도 일하지 않는 것으로 본다
  const planned = day.offCredit >= rules.dailyStdMin || day.isRest ? 0 : plans[day.key] ?? defaultPlanFor(day, rules);
  const work = day.isToday ? Math.max(planned, day.actual) : planned;
  return capDay(work + day.workCredit, rules);
}

/** 월 기준 시간 (Max·필요) */
export function monthTargets(days, rules) {
  const monthDays = days.length;
  const workdays = days.filter((d) => d.isWorkday).length;
  // 회사 기준: 주 단위 환산값은 시간 단위 버림 (230.28h → 230:00, 177.14h → 177:00). 설정에서 분 단위로 바꿀 수 있음
  const cut = (min) => (rules.maxRounding === 'minute' ? Math.floor(min) : Math.floor(min / 60) * 60);
  const possible = cut((rules.maxWeeklyMin / 7) * monthDays);
  const byWorkdays = workdays * rules.dailyStdMin;
  const byWeekly = cut((rules.stdWeeklyMin / 7) * monthDays);
  const base = Math.min(byWorkdays, byWeekly);
  const offTotal = days.reduce((s, d) => s + d.offCredit, 0);
  const required = Math.max(0, base - offTotal);
  return { monthDays, workdays, possible, byWorkdays, byWeekly, base, baseBy: byWorkdays <= byWeekly ? 'workdays' : 'weekly', offTotal, required };
}

/** 월 정산 요약 */
export function summarizeMonth(year, month, records, rules, plans = {}, now = new Date()) {
  const todayKey = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const days = monthDates(year, month).map((d) => evalDay(d, records[ymd(d)], rules, { todayKey, nowMin }));

  const targets = monthTargets(days, rules);
  const { required, possible } = targets;

  const done = days.filter((d) => d.isPast).reduce((s, d) => s + d.recognized, 0);
  const today = days.find((d) => d.isToday) || null;
  const todaySoFar = today ? today.recognized : 0;
  const recognizedNow = done + todaySoFar;

  const upcoming = days.filter((d) => !d.isPast && d.isWorkday); // 오늘 포함
  const upcomingWorkCredit = upcoming.reduce((s, d) => s + d.workCredit, 0);
  const capacity = upcoming.reduce((s, d) => s + capacityOf(d, rules), 0);
  // 휴일(주말·공휴일) 근무는 Max에서는 차감되지만 필요시간은 덜어주지 않는다
  const holidayDays = days.filter((d) => !d.isPast && !d.isWorkday);
  const holidayPlanned = holidayDays.reduce((s, d) => s + projectedOf(d, plans, rules), 0);
  const doneReq = days.filter((d) => d.isPast && d.isWorkday).reduce((s, d) => s + d.recognized, 0); // 필요시간에 쳐주는 실적
  const workToGo = Math.max(0, required - doneReq - upcomingWorkCredit); // 오늘부터 근무일에 일해야 하는 시간
  const daysToWork = upcoming.filter((d) => capacityOf(d, rules) > 0).length;
  const ratio = capacity ? workToGo / capacity : 0;
  const avgPerDay = Math.round(ratio * rules.dailyStdMin);
  const todayTarget = today && today.isWorkday ? Math.round(ratio * capacityOf(today, rules)) : 0;

  // 평일 누적초과: 전일까지 평일(근무일) 실적 − 전일까지 평일 필수근무 누적
  const pastWork = days.filter((d) => d.isPast && d.isWorkday);
  const weekdayRequiredSoFar = pastWork.reduce((s, d) => s + d.dayRequired, 0);
  const weekdayDoneSoFar = pastWork.reduce((s, d) => s + d.recognized, 0);
  const weekdayOvertime = weekdayDoneSoFar - weekdayRequiredSoFar;
  const holidayWork = days.filter((d) => d.isPast && !d.isWorkday).reduce((s, d) => s + d.recognized, 0);

  const projected = days.reduce((s, d) => s + projectedOf(d, plans, rules), 0); // 휴일 근무 포함 (Max 비교용)
  const projectedReq = days.filter((d) => d.isWorkday).reduce((s, d) => s + projectedOf(d, plans, rules), 0); // 필요시간 비교용
  const recognizedReq = doneReq + (today && today.isWorkday ? today.recognized : 0);
  const holidayDone = recognizedNow - recognizedReq; // 지난·오늘 휴일 근무 실적

  const weeks = [];
  const byKey = new Map();
  for (const d of days) {
    const wk = weekKeyOf(d.date);
    if (!byKey.has(wk)) {
      const w = { key: wk, days: [], recognized: 0, projected: 0 };
      byKey.set(wk, w);
      weeks.push(w);
    }
    byKey.get(wk).days.push(d);
  }
  for (const w of weeks) {
    const mon = parseYmd(w.key);
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i);
      const ev = w.days.find((x) => x.key === ymd(d)) || evalDay(d, records[ymd(d)], rules, { todayKey, nowMin });
      w.recognized += ev.isPast || ev.isToday ? ev.recognized : 0;
      w.projected += projectedOf(ev, plans, rules);
    }
    w.over = !!rules.weeklyLimitOn && w.projected > rules.maxWeeklyMin;
  }

  const warnings = days
    .filter((d) => d.warnings.length)
    .flatMap((d) => d.warnings.map((w) => ({ key: d.key, date: d.date, text: w })));
  for (const w of weeks) {
    if (w.over) warnings.push({ key: w.key, date: parseYmd(w.key), text: `주 ${Math.round(rules.maxWeeklyMin / 60)}시간 초과 예상`, week: true });
  }
  if (projected > possible) warnings.push({ key: todayKey, date: now, text: '계획이 최대 근무 시간을 넘습니다', week: false });

  const familyKey = familyDayKey(year, month);
  const familyDay = days.find((d) => d.key === familyKey) || null;

  return {
    year,
    month,
    familyKey,
    familyDay,
    todayKey,
    nowMin,
    days,
    targets,
    workdayCount: targets.workdays,
    required,
    possible,
    done,
    today,
    todaySoFar,
    recognizedNow,
    upcoming,
    upcomingWorkCredit,
    capacity,
    workToGo,
    daysToWork,
    ratio,
    avgPerDay,
    todayTarget,
    weekdayRequiredSoFar,
    weekdayDoneSoFar,
    weekdayOvertime,
    holidayWork,
    holidayDays,
    holidayPlanned,
    paceDiff: weekdayOvertime,
    projected,
    projectedReq,
    projectedDiff: projectedReq - required, // OT: 평일(근무일) 기준, 주말·공휴일 근무 제외
    projectedTotalDiff: projected - required, // 월말 예상: 주말 근무 포함
    weekendTotal: projected - projectedReq, // 주말·공휴일 근무 (실적 + 계획)
    needLeft: Math.max(0, required - recognizedReq), // 필요 시간 = 필수 근무 시간 − 현재 근무 시간
    possibleLeft: possible - projected,
    recognizedReq,
    holidayDone,
    doneReq,
    remainingNeed: Math.max(0, required - recognizedReq - (upcomingWorkCredit - (today?.isWorkday ? today.workCredit : 0))),
    remainingPossible: Math.max(0, possible - recognizedNow),
    weeks,
    warnings,
  };
}

/** 오늘 예상 퇴근 시각 (목표 실근무 net분 기준) */
export function checkoutFor(day, targetNet, rules) {
  if (!day || day.inMin == null) return null;
  return day.inMin + grossForNet(Math.max(0, targetNet), rules) + (day.plannedExclude || 0);
}

/** need분을 days에 일할 수 있는 시간 비율로 나눠 담는다 (10분 단위, 마지막 날이 나머지) */
function spread(days, need, rules, minOf = () => 0) {
  const plans = {};
  const caps = days.map((d) => capacityOf(d, rules));
  const cap = caps.reduce((a, b) => a + b, 0);
  if (!cap) return plans;
  let left = need;
  days.forEach((d, i) => {
    let v = i === days.length - 1 ? left : Math.round((need * caps[i]) / cap / 10) * 10;
    v = Math.max(minOf(d), Math.min(v, dailyCapOf(d, rules)));
    plans[d.key] = v;
    left -= v;
  });
  return plans;
}

/** 그날 계획된 실근무 (출장·교육 인정 제외) */
const plannedWork = (d, plans, rules) => projectedOf(d, plans, rules) - d.workCredit;

/** 남은 필요시간을 오늘~월말 근무일에 균등 배분. locks로 고정한 날은 그대로 두고 나머지에만 나눈다 */
export function distributeEvenly(summary, rules, plans = {}, locks = {}) {
  const free = summary.upcoming.filter((d) => capacityOf(d, rules) > 0 && !locks[d.key]);
  const fixed = summary.upcoming.filter((d) => locks[d.key]).reduce((s, d) => s + plannedWork(d, plans, rules), 0);
  return spread(free, Math.max(0, summary.workToGo - fixed), rules, (d) => (d.isToday ? d.actual : 0));
}

/** 선택한 날에만 남은 필요시간을 나눠 넣고, 나머지 날은 지금 계획을 유지 */
export function distributeAmong(summary, rules, plans, keys, locks = {}) {
  const sel = new Set(keys);
  const chosen = summary.upcoming.filter((d) => sel.has(d.key) && capacityOf(d, rules) > 0 && !locks[d.key]);
  const chosenKeys = new Set(chosen.map((d) => d.key));
  const others = summary.upcoming.filter((d) => !chosenKeys.has(d.key));
  const fixed = others.reduce((s, d) => s + plannedWork(d, plans, rules), 0);
  const need = Math.max(0, summary.workToGo - fixed);
  return spread(chosen, need, rules, (d) => (d.isToday ? d.actual : 0));
}

/** 남은 양 room을 days에 고르게 채우되 하루 상한(caps)을 넘지 않게 (10분 단위 내림) */
function waterFill(room, caps) {
  const out = caps.map(() => 0);
  let left = Math.max(0, room);
  let open = caps.map((c, i) => i).filter((i) => caps[i] > 0);
  while (left >= 10 && open.length) {
    const share = Math.floor(left / open.length / 10) * 10;
    if (share === 0) break;
    const next = [];
    for (const i of open) {
      const add = Math.min(share, caps[i] - out[i]);
      out[i] += add;
      left -= add;
      if (out[i] < caps[i]) next.push(i);
    }
    open = next;
  }
  // 남은 시간은 앞쪽 날부터 10분씩 한 번 더, 마지막 몇 분은 첫 날에 붙인다
  for (const i of open) {
    if (left <= 0) break;
    const add = Math.min(left >= 10 ? 10 : left, caps[i] - out[i]);
    out[i] += add;
    left -= add;
  }
  if (left > 0 && open.length) out[open[0]] += Math.min(left, caps[open[0]] - out[open[0]]);
  return out;
}

/**
 * Max까지 채우는 계획: 오늘~월말(또는 keys로 고른 날)의 실근무를
 * 1일 최대 · 주 최대(52h) · 월 Max 안에서 가능한 만큼 늘린다.
 */
export function distributeToMax(summary, rules, plans = {}, keys = null, locks = {}) {
  const sel = keys ? new Set(keys) : null;
  const targets = summary.upcoming.filter((d) => capacityOf(d, rules) > 0 && !locks[d.key] && (!sel || sel.has(d.key)));
  if (!targets.length) return {};
  const tKeys = new Set(targets.map((d) => d.key));
  const dayCap = (d) => Math.max(d.isToday ? d.actual : 0, dailyCapOf(d, rules));

  // 1) 주 단위 (주 제한을 켰을 때만): 주 최대 − (대상이 아닌 날 예상 + 대상 날 출장·교육 인정)
  const alloc = new Map();
  if (!rules.weeklyLimitOn) targets.forEach((d) => alloc.set(d.key, dayCap(d)));
  else for (const w of summary.weeks) {
    const inWeek = targets.filter((d) => weekKeyOf(d.date) === w.key);
    if (!inWeek.length) continue;
    const targetProjected = inWeek.reduce((s, d) => s + projectedOf(d, plans, rules), 0);
    const fixed = w.projected - targetProjected + inWeek.reduce((s, d) => s + d.workCredit, 0);
    const filled = waterFill(rules.maxWeeklyMin - fixed, inWeek.map(dayCap));
    inWeek.forEach((d, i) => alloc.set(d.key, filled[i]));
  }

  // 2) 월 단위: Max − 대상이 아닌 날 예상 − 대상 날 출장·교육 인정 을 넘으면 고르게 깎는다
  const others = summary.days.filter((d) => !tKeys.has(d.key)).reduce((s, d) => s + projectedOf(d, plans, rules), 0);
  const monthRoom = summary.possible - others - targets.reduce((s, d) => s + d.workCredit, 0);
  const total = [...alloc.values()].reduce((a, b) => a + b, 0);
  if (total > monthRoom) {
    const capped = waterFill(monthRoom, targets.map((d) => alloc.get(d.key) || 0));
    targets.forEach((d, i) => alloc.set(d.key, capped[i]));
  }

  const result = {};
  for (const d of targets) result[d.key] = Math.max(d.isToday ? d.actual : 0, alloc.get(d.key) || 0);
  return result;
}
