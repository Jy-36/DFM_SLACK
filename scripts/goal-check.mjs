// 근무 계획 계산 확인: node scripts/goal-check.mjs  (npm run test:goal)
import { summarizeMonth, grossForNet, netFromGross, capacityOf } from '../src/apps/worktime/lib/engine.js';
import {
  distributeByGoal, DEFAULT_GOAL, excessForGoal, goalPreview, goalCapOf, goalStartOf, resolvePinTransition, resolveDay, checkResolved,
  withPlanLeaves, planSummary, spreadDelta, monthDrift, todayAdvice, isValidNet, isFixedPin, migrateV32, dropPast, BLOCK_BOTH,
  autoReflow, protectedKeysOf, pinViolations, describePlan,
} from '../src/apps/worktime/lib/goal.js';
import { DEFAULT_RULES as R } from '../src/apps/worktime/lib/rules.js';
import { generateMockRecords } from '../src/apps/worktime/lib/mockData.js';
import { toMin, fmtDur, fmtClock } from '../src/apps/worktime/lib/time.js';

let fail = 0;
let count = 0;
const ok = (name, cond, info = '') => {
  count++;
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`);
};
const hm = (m) => fmtClock(m);

const now = new Date(2026, 9, 6, 10, 5); // engine-check 와 같은 기준 시각
const recs = generateMockRecords(now);
const s = summarizeMonth(2026, 9, recs, R, {}, now);
const endOf = (d, net, pins = {}) => goalStartOf(d, R, { ...DEFAULT_GOAL, startIn: R.planDefaultIn }, pins) + grossForNet(net, R) + (d.isToday ? 0 : d.plannedExclude || 0);
const G = { ...DEFAULT_GOAL, startIn: R.planDefaultIn };

console.log('— 목표대로 채우기');
const g1 = { ...G, target: 'ot0' };
const r1 = distributeByGoal(s, R, {}, {}, g1);
ok('OT 0h: 목표 달성', r1.feasible, `초과 ${fmtDur(r1.reached)} / 원함 ${fmtDur(r1.wanted)}`);
ok('OT 0h: 초과 근무 = 포괄 14h (±10분)', Math.abs(r1.reached - excessForGoal(g1, R)) <= 10);
const after1 = summarizeMonth(2026, 9, recs, R, r1.plans, now);
ok('OT 0h: 반영 후 summarize 결과와 일치', Math.abs(after1.projectedDiff - r1.reached) <= 10, `projectedDiff ${fmtDur(after1.projectedDiff, { sign: true })}`);
let lateOk = true;
let friOk = true;
let minOk = true;
for (const d of s.upcoming) {
  if (!(d.key in r1.plans)) continue;
  const end = endOf(d, r1.plans[d.key]);
  if (end > toMin(g1.cutoff)) lateOk = false;
  if (d.dow === 5 && end > toMin(g1.earlyOut)) friOk = false;
  if (r1.plans[d.key] < Math.min(g1.minDailyMin, 360) && !d.isToday) minOk = false;
}
ok('OT 0h: 모든 날 19:00 전 퇴근', lateOk);
ok('OT 0h: 금요일은 17:00 전 퇴근', friOk);
ok('OT 0h: 하루 최소 6시간', minOk);
ok('결과에 출근(ins)을 돌려주지 않음', !('ins' in r1));

const keys = s.upcoming.filter((d) => d.dow === 2 && !d.isToday).map((d) => d.key);
const r3 = distributeByGoal(s, R, {}, {}, g1, keys);
ok('선택한 날에만 나눔', Object.keys(r3.plans).every((k) => keys.includes(k)), `${Object.keys(r3.plans).length}일`);

const g4 = { ...G, target: 'ot14', cutoff: '17:30' };
const r4 = distributeByGoal(s, R, {}, {}, g4);
ok('OT 14h · 17:30 마지노선: 못 채움으로 판단', !r4.feasible, `가능 ${fmtDur(r4.reached)} / 원함 ${fmtDur(r4.wanted)}`);
ok('해결안이 2개 이상', r4.suggestions.length >= 2, r4.suggestions.map((x) => x.label).join(' · '));
const cut = r4.suggestions.find((x) => x.kind === 'cutoff');
if (cut) ok('마지노선 해결안은 실제로 채워짐', distributeByGoal(s, R, {}, {}, cut.goal).feasible, cut.goal.cutoff);

const r5 = distributeByGoal(s, R, {}, {}, { ...G, target: 'max', cutoff: '22:00', earlyDays: [] });
const after5 = summarizeMonth(2026, 9, recs, R, r5.plans, now);
ok('최대: 월 Max 이하', after5.projected <= after5.possible, `${fmtDur(after5.projected)} / ${fmtDur(after5.possible)}`);

const g6 = { ...G, cutoff: '21:00', earlyDays: [] };
const pv = goalPreview(s, R, {}, {}, g6);
console.log('     ' + Object.entries(pv.options).map(([k, o]) => `${k}: 평균 ${fmtDur(o.avgNet)} · 퇴근 ${hm(o.avgOut)} · ${o.level}`).join('\n     '));
ok('미리보기: 모든 선택지의 가장 늦은 퇴근 ≤ 마지노선', Object.values(pv.options).every((o) => o.latestOut <= toMin(g6.cutoff)));
ok('미리보기: 필수만 ≤ OT 0h ≤ 최대 (평균 실근무)', pv.options.required.avgNet <= pv.options.ot0.avgNet && pv.options.ot0.avgNet <= pv.options.max.avgNet);
ok('미리보기: 못 채우면 fail 등급', Object.values(pv.options).every((o) => o.feasible || o.level === 'fail' || o.level === 'max'));
ok('미리보기: 나눌 날 = 계획이 들어간 날 수', pv.header.freeDays === pv.options.ot0.days, `${pv.header.freeDays}일`);

const g7 = { ...G, target: 'ot14', startIn: '07:30', cutoff: null, earlyDays: [] };
const r7 = distributeByGoal(s, R, {}, {}, g7);
let in7 = true;
for (const d of s.upcoming) if (d.key in r7.plans && goalStartOf(d, R, g7) + grossForNet(r7.plans[d.key], R) + (d.isToday ? 0 : d.plannedExclude || 0) > toMin(R.recognizeTo)) in7 = false;
ok('마지노선 제한 없음 = 인정 시간대 끝(22:00)을 넘지 않음', in7);
const same = distributeByGoal(s, R, {}, {}, { ...g7, cutoff: R.recognizeTo });
ok('제한 없음과 22:00 결과가 같음', JSON.stringify(same.plans) === JSON.stringify(r7.plans));
const R24 = { ...R, recognizeTo: '24:00' };
const s24 = summarizeMonth(2026, 9, recs, R24, {}, now);
const pv24 = goalPreview(s24, R24, {}, {}, { ...G, cutoff: null, earlyDays: [] });
ok('인정 끝 24:00: 최대한의 가장 늦은 퇴근이 22:00 넘고 24:00 이하', pv24.options.max.latestOut > 22 * 60 && pv24.options.max.latestOut <= 24 * 60, hm(pv24.options.max.latestOut));
const early = distributeByGoal(s, R, {}, {}, { ...G, target: 'ot14', startIn: '08:30', cutoff: '19:00', earlyDays: [] });
ok('출근 앞당기기 해결안이 나옴', early.feasible || early.suggestions.some((x) => x.kind === 'start'), early.suggestions.map((x) => x.label).join(' · '));

// ─────────── GUIDE-plan-mechanism §8.7 ───────────
const future = s.upcoming.filter((d) => !d.isToday && capacityOf(d, R) > 0);
const [dA, dB, dC, dD] = future;
const base = distributeByGoal(s, R, {}, {}, G).plans;

console.log('\n— §8.7-1 직접 정한 날은 안 바뀜');
{
  const pins = { [dA.key]: { out: '18:00' }, [dB.key]: { net: 600 } };
  const ss = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans: base, pins, goal: G, now });
  const r = distributeByGoal(ss, R, base, pins, G);
  ok('distributeByGoal 결과에 직접 정한 날이 없음', !(dA.key in r.plans) && !(dB.key in r.plans));
  const sp = spreadDelta(ss, R, base, pins, G, { amount: 300, mode: 'even' });
  ok('spreadDelta 결과에 직접 정한 날이 없음', !(dA.key in sp.plans) && !(dB.key in sp.plans), `${sp.changes.length}일 변경`);
  ok('계산용 실근무에 pin 값이 들어감', ss.effPlans[dB.key] === 600 && ss.effPlans[dA.key] === netFromGross(toMin('18:00') - toMin(G.startIn), R), fmtDur(ss.effPlans[dA.key]));
}

console.log('\n— §8.7-2 전체 출근이 바뀌면');
{
  const g800 = { ...G, startIn: '08:00' };
  const outBefore = resolveDay(dA, { out: '18:30' }, R, G);
  const outAfter = resolveDay(dA, { out: '18:30' }, R, g800);
  ok('out 날: 실근무 +30, 퇴근 그대로', outAfter.net - outBefore.net === 30 && outAfter.out === outBefore.out, `${fmtDur(outBefore.net)} → ${fmtDur(outAfter.net)}`);
  const netBefore = resolveDay(dA, { net: 540 }, R, G);
  const netAfter = resolveDay(dA, { net: 540 }, R, g800);
  ok('net 날: 퇴근 −30, 실근무 그대로', netBefore.out - netAfter.out === 30 && netAfter.net === 540, `${hm(netBefore.out)} → ${hm(netAfter.out)}`);
}

console.log('\n— §8.7-3 출근만 정한 날');
{
  const pins = { [dA.key]: { in: '10:00' } };
  ok('in 만 = 자동 날', !isFixedPin(pins[dA.key]));
  const cap = goalCapOf(dA, R, G, pins);
  const want = netFromGross(toMin(dA.dow === 5 ? G.earlyOut : G.cutoff) - toMin('10:00'), R);
  ok('상한 = 10:00 ~ 마지노선', cap === want, `${fmtDur(cap)} (기대 ${fmtDur(want)})`);
  const ss = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans: {}, pins, goal: G, now });
  const r = distributeByGoal(ss, R, {}, pins, G);
  ok('배분 대상에 들어가고 상한을 넘지 않음', dA.key in r.plans && r.plans[dA.key] <= cap, fmtDur(r.plans[dA.key]));
}

console.log('\n— §8.7-4 전이표 21칸');
{
  const P = { none: {}, in: { in: '10:00' }, net: { net: 540 }, out: { out: '18:30' }, 'in+out': { in: '10:00', out: '18:30' }, 'in+net': { in: '10:00', net: 540 }, 'out+net': { out: '18:30', net: 540 } };
  const want = {
    none: ['in', 'out', 'net'],
    in: ['in', 'in+out', 'in+net'],
    net: ['in+net', 'out', 'net'],
    out: ['in+out', 'out', 'out+net'],
    'in+out': ['in+out', 'in+out', 'blocked'],
    'in+net': ['in+net', 'in+out', 'in+net'],
    'out+net': ['in+out', 'out+net', 'out+net'],
  };
  const kind = (p) => (p.blocked ? 'blocked' : ['in', 'out', 'net'].filter((f) => p[f] != null).join('+'));
  let bad = [];
  for (const [from, exp] of Object.entries(want)) {
    ['in', 'out', 'net'].forEach((field, i) => {
      const v = field === 'net' ? 600 : field === 'in' ? '09:00' : '19:00';
      const got = kind(resolvePinTransition(P[from], field, v));
      if (got !== exp[i]) bad.push(`${from}/${field}: ${got} (기대 ${exp[i]})`);
    });
  }
  ok('21칸 모두 표대로', bad.length === 0, bad.join(', '));
  const t = resolvePinTransition({ out: '18:30' }, 'net', 600);
  const r = resolveDay(dA, t, R, G);
  ok('out + 실근무 변경 → out+net, 출근이 움직임', t.out === '18:30' && t.net === 600 && r.out === toMin('18:30') && r.in < toMin(G.startIn), `출근 ${hm(r.in)}`);
  ok('in+out + 실근무 변경 → blocked', resolvePinTransition({ in: '10:00', out: '18:30' }, 'net', 600).blocked === BLOCK_BOTH);
}

console.log('\n— §8.7-5 인정 시간대 밖은 막음');
{
  const r = resolveDay(dA, { out: '18:00', net: 720 }, R, G);
  ok('계산된 출근 < 인정 시작 → blocked', /이전 출근/.test(checkResolved(r, R) || ''), `출근 ${hm(r.in)}`);
  const r2 = resolveDay(dA, { in: '14:00', net: 600 }, R, G);
  ok('계산된 퇴근 > 인정 끝 → blocked', /이후는/.test(checkResolved(r2, R) || ''), `퇴근 ${hm(r2.out)}`);
  ok('정상 값은 통과', checkResolved(resolveDay(dA, { out: '18:30' }, R, G), R) === null);
}

console.log('\n— §8.7-6 spreadDelta');
{
  const ss = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans: base, pins: {}, goal: G, now });
  const allValid = (sp) => sp.changes.every((c) => isValidNet(c.to, R));
  const underCap = (sp) => sp.changes.every((c) => c.to <= goalCapOf(ss.days.find((d) => d.key === c.key), R, G, {}));
  const ev = spreadDelta(ss, R, base, {}, G, { amount: -120, mode: 'even' });
  ok('even: 줄이기 양 맞춤', ev.absorbed === -120 && ev.leftover === 0, `${ev.changes.length}일`);
  ok('even: 오늘·지난 날 제외', ev.changes.every((c) => c.key > ss.todayKey));
  const nr = spreadDelta(ss, R, base, {}, { ...G, cutoff: '22:00' }, { amount: 90, mode: 'near' });
  ok('near: 첫 자동 날부터 채움', nr.changes[0]?.key === nr.targets[0], `${nr.changes.map((c) => `${c.key.slice(5)} +${c.to - c.from}`).join(', ')}`);
  const wk = spreadDelta(ss, R, base, {}, G, { amount: 600, mode: 'week', fromKey: dA.key });
  const wkOf = (k) => ss.days.find((d) => d.key === k).date;
  const sameWeek = wk.targets.every((k) => Math.abs(wkOf(k) - dA.date) < 7 * 864e5);
  ok('week: 그 주 날만, 못 넣은 양은 leftover', sameWeek && wk.absorbed + wk.leftover === 600, `흡수 ${fmtDur(wk.absorbed)} · 남음 ${fmtDur(wk.leftover)}`);
  ok('모든 값 isValidNet', allValid(ev) && allValid(nr) && allValid(wk));
  ok('늘린 값 ≤ goalCapOf', underCap(wk) && underCap(ev));
}

console.log('\n— §8.7-7 동기화');
{
  const plans = base;
  const leaves = { [dC.key]: { leave: 'annual' } };
  const before = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans, leaves, goal: G, now });
  const synced = { ...recs, [dC.key]: { in: '08:40', out: '18:00', source: 'portal' } };
  const after = planSummary({ year: 2026, month: 9, records: synced, rules: R, plans, leaves, goal: G, now });
  ok('자동 값(plans) 그대로', JSON.stringify(after.effPlans) === JSON.stringify({ ...before.effPlans }) || Object.keys(plans).every((k) => after.effPlans[k] === plans[k]));
  ok('monthDrift 만 변함', monthDrift(after, R, G) !== monthDrift(before, R, G), `${fmtDur(monthDrift(before, R, G), { sign: true })} → ${fmtDur(monthDrift(after, R, G), { sign: true })}`);
  ok('동기화 기록이 있는 날은 계획 휴가를 쓰지 않음', after.days.find((d) => d.key === dC.key).leave == null);
}

console.log('\n— §8.7-8 withPlanLeaves');
{
  const recs2 = { [dA.key]: { leave: 'trip', source: 'portal' } };
  const w = withPlanLeaves(recs2, { [dA.key]: { leave: 'annual' }, [dB.key]: { leave: 'hourly', leaveMin: 120 } });
  ok('기록 있는 날은 무시', w[dA.key].leave === 'trip');
  ok('없는 날만 반영', w[dB.key].leave === 'hourly' && w[dB.key].leaveMin === 120 && w[dB.key].planLeave);
  ok('원본 records 는 그대로', !recs2[dB.key]);
}

console.log('\n— §8.7-9 todayAdvice 5가지');
{
  const at = (h, m) => new Date(2026, 9, 6, h, m);
  const tk = '2026-10-06';
  const mk = (rec, t = at(15, 0)) => {
    const r2 = { ...recs, [tk]: rec };
    if (rec == null) delete r2[tk];
    const ss = planSummary({ year: 2026, month: 9, records: r2, rules: R, plans: { [tk]: 540 }, goal: G, now: t });
    return todayAdvice(ss, R, {}, G);
  };
  ok('출근 기록 전 → beforeIn', mk(null, at(7, 50))?.state === 'beforeIn');
  const w = mk({ in: '08:12' });
  ok('근무 중 → working, 4칸 중 계획 1칸', w?.state === 'working' && w.options.filter((o) => o.isPlan).length === 1, `계획 퇴근 ${hm(w?.plan.out)} · ${w?.options.map((o) => hm(o.out)).join(' ')}`);
  ok('계획 다 채움 → done', mk({ in: '06:30' }, at(17, 0))?.state === 'done');
  ok('퇴근 기록 있음 → out', mk({ in: '08:12', out: '17:00' })?.state === 'out');
  ok('휴가 → leave', mk({ leave: 'annual', source: 'portal' })?.state === 'leave');
  ok('월말 변화: −30분 칸 = −0:30', w.options.find((o) => o.out === w.plan.out - 30)?.monthDelta === -30);
}

console.log('\n— §8.7-10 prunePast');
{
  const tk = s.todayKey;
  const past = s.days.find((d) => d.isPast && d.isWorkday).key;
  const plans = { ...base, [past]: 600 };
  const pins = { [past]: { out: '20:00' } };
  const leaves = { [past]: { leave: 'annual' } };
  const a = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans, pins, leaves, goal: G, now });
  const b = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans: dropPast(plans, tk), pins: dropPast(pins, tk), leaves: dropPast(leaves, tk), goal: G, now });
  ok('정리 전후 월 계산 같음', a.projectedReq === b.projectedReq && a.projected === b.projected && a.recognizedReq === b.recognizedReq, fmtDur(a.projectedReq));
  ok('지난 키가 지워짐', !(past in dropPast(plans, tk)) && !(past in dropPast(pins, tk)));
}

console.log('\n— §8.7-11 자동 날 ≤ goalCapOf');
{
  const gMax = { ...G, target: 'max' };
  const r = distributeByGoal(s, R, {}, {}, gMax);
  const over = s.upcoming.filter((d) => d.key in r.plans && r.plans[d.key] > goalCapOf(d, R, gMax, {}));
  const maxDay = Math.max(...Object.values(r.plans));
  ok('최대한이어도 상한을 넘는 날 없음', over.length === 0, `가장 긴 날 ${fmtDur(maxDay)}`);
  ok('19:00 마지노선에서 하루 11시간 넘는 계획 없음', maxDay <= 11 * 60);
}

console.log('\n— §8.7-12 이전 규칙');
{
  const tk = s.todayKey;
  const k1 = dA.key;
  const k2 = dB.key;
  const k3 = dC.key;
  const k4 = dD.key;
  const old = {
    plans: { [k1]: 600 },
    planLocks: { [k1]: true },
    planIns: { [k2]: '10:00' },
    records: {
      [k3]: { leave: 'annual', edited: true },
      [k4]: { leave: 'annual', edited: true, source: 'portal' },
    },
  };
  const m = migrateV32(old, tk);
  ok('고정 → net pin', m.planPins[k1]?.net === 600);
  ok('날짜별 출근 → in pin', m.planPins[k2]?.in === '10:00');
  ok('계획 화면 휴가 → planLeaves', m.planLeaves[k3]?.leave === 'annual' && !m.records[k3] && m.moved === 1);
  ok('portal 기록은 옮기지 않음', m.records[k4]?.leave === 'annual' && !m.planLeaves[k4]);
  ok('옮긴 records 원본을 backup 으로 돌려줌 (0.23 복구용)', m.backup?.[k3]?.leave === 'annual' && !m.backup[k4]);
}

console.log('— 자동 날 다시 맞추기 (v3.3 §6.6)');
{
  const G0 = { ...G, target: 'ot0' };
  const s0 = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans: {}, goal: G0, now });
  const first = autoReflow(s0, R, {}, {}, G0);
  ok('자동 값이 없으면 처음 채우기', first?.first === true && Object.keys(first.plans).length > 0);
  const P1 = first.plans;
  const s1 = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans: P1, goal: G0, now });
  ok('채운 직후엔 다시 맞출 것 없음', autoReflow(s1, R, P1, {}, G0) === null, `차이 ${fmtDur(monthDrift(s1, R, G0), { sign: true })}`);
  // 기록이 바뀐 것처럼 자동 날 하나를 1시간 줄임 → 다른 날이 늘어남
  const keep = protectedKeysOf(s1, R);
  const victim = s1.upcoming.filter((d) => !d.isToday && d.key in P1 && !keep.includes(d.key)).at(-1).key;
  const P2 = { ...P1, [victim]: P1[victim] - 60 };
  const s2 = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans: P2, goal: G0, now });
  const rf = autoReflow(s2, R, P2, {}, G0);
  ok('목표 −1:00 → 다시 맞춤', !!rf && !rf.first && rf.changes.length > 0, rf ? `${rf.changes.length}일` : '');
  ok('오늘과 다음 근무일은 건드리지 않음', rf && keep.length === 1 && !rf.changes.some((c) => c.key === keep[0] || c.key === s2.todayKey));
  const s3 = planSummary({ year: 2026, month: 9, records: recs, rules: R, plans: { ...P2, ...rf.plans }, goal: G0, now });
  ok('맞춘 뒤 목표와 10분 안', Math.abs(monthDrift(s3, R, G0)) <= 10, fmtDur(monthDrift(s3, R, G0), { sign: true }));
  ok('최대한 목표는 맞출 것 없음', autoReflow(s2, R, P2, {}, { ...G0, target: 'max' }) === null);
  // 설정과 안 맞는 pin
  const day = s1.upcoming.find((d) => !d.isToday && capacityOf(d, R) > 0);
  const badPins = { [day.key]: { out: '23:00' } };
  const v = pinViolations(s1, R, badPins, G0);
  ok('설정과 안 맞는 직접 정한 날 찾기', v.length === 1 && v[0].key === day.key, v[0]?.why);
  ok('맞는 pin 은 문제 없음', pinViolations(s1, R, { [day.key]: { out: '18:00' } }, G0).length === 0);
  // 못 채우는 목표: 모자란 양
  const g4b = { ...G, target: 'ot14', cutoff: '17:30' };
  const d4 = describePlan(s, R, g4b, {}, distributeByGoal(s, R, {}, {}, g4b, null, true));
  ok('못 채우면 모자란 양(gap)을 알려 줌', d4.level === 'fail' && d4.gap > 0, fmtDur(d4.gap));
}

console.log(fail ? `\n${count - fail} 통과 · ${fail} 실패` : `\n${count} 통과 · 0 실패`);
process.exit(fail ? 1 : 0);
