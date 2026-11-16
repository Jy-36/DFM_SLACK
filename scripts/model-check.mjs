// 근무 계획 화면 모델 확인: node scripts/model-check.mjs  (npm run test:model)
// 화면에 무엇을 어떻게 보여 줄지(pages/planner/model.js)를 브라우저 없이 확인한다.
import { generateMockRecords } from '../src/apps/worktime/lib/mockData.js';
import { DEFAULT_RULES as R } from '../src/apps/worktime/lib/rules.js';
import { capacityOf } from '../src/apps/worktime/lib/engine.js';
import { planSummary, todayAdvice, autoReflow, DEFAULT_GOAL, monthDrift } from '../src/apps/worktime/lib/goal.js';
import { fmtClock, toMin } from '../src/apps/worktime/lib/time.js';
import { dayView, hourChip, buildSuggestion, tryPin, fieldHints } from '../src/apps/worktime/pages/planner/model.js';

let fail = 0;
let count = 0;
const ok = (name, cond, info = '') => {
  count++;
  if (!cond) fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`);
};

const now = new Date(2026, 10, 10, 15, 23); // 2026-11-10 화 15:23 (화면 확인과 같은 시각)
const records = generateMockRecords(now);
const goal = { ...DEFAULT_GOAL };
const make = (plans = {}, pins = {}, leaves = {}, rules = R) => {
  const summary = planSummary({ year: 2026, month: 10, records, rules, plans, pins, leaves, goal, now });
  const advice = todayAdvice(summary, rules, pins, goal);
  const ctx = { records, rules, goal, pins, leaves, plans, summary, advice, isNextMonth: false, isPastMonth: false, now, recentOuts: [] };
  const views = summary.days.map((d) => dayView(d, ctx));
  return { summary, ctx, views, of: (k) => views.find((v) => v.key === k) };
};

const first = autoReflow(make().summary, R, {}, {}, goal);
const plans = first.plans;
const A = make(plans);
const futureAuto = A.views.filter((v) => v.state === 'auto');
const fk = futureAuto[1].key;

console.log('— 날짜 칸');
const today = A.views.find((v) => v.state === 'today');
ok('오늘 칸이 있음', !!today, today?.label);
ok('오늘 칸에 목표 차이를 붙이지 않음', !today.note || !/목표/.test(today.note), today.note || '알림 없음');
ok('지난 날은 기록 상태', A.views.filter((v) => v.d.isPast && v.d.isWorkday).every((v) => v.state === 'rec' || v.state === 'recNone'));
ok('aria-label 은 "11월 n일 요일, …" 형식', /^11월 \d+일 [월화수목금토일]요일/.test(futureAuto[0].label), futureAuto[0].label);
const lr = A.views.find((v) => v.state === 'leaveRec');
if (lr) ok('사이트 근태 날 태그는 근태 이름만 (칸에서 안 잘리게)', !/기록/.test(lr.tag) && lr.sub === '사이트 근태', lr.tag);

console.log('— 설정과 안 맞는 직접 정한 날');
const B = make(plans, { [fk]: { out: '23:00' } });
ok('주황 알림 "설정과 안 맞음"', B.of(fk).note === '설정과 안 맞음' && B.of(fk).noteTone === 'warn');
ok('이유를 패널에 넘김', /22:00/.test(B.of(fk).violation || ''), B.of(fk).violation);
ok('맞는 날은 violation 없음', !A.of(fk).violation);

console.log('— ±1시간 칩');
const v0 = A.of(fk);
const up = hourChip(v0.d, null, v0.r, 60, A.ctx);
ok('자동 날 +1시간 → 퇴근이 1시간 늦어짐', up.apply.r.out === v0.r.out + 60 && /퇴근/.test(up.label), up.label);
const outPin = { out: fmtClock(v0.r.out) };
const C = make(plans, { [fk]: outPin });
const v1 = C.of(fk);
const up2 = hourChip(v1.d, outPin, v1.r, 60, C.ctx);
ok('퇴근 정한 날 +1시간 → 출근은 그대로, 퇴근만 이동', up2.apply.r.in === v1.r.in && up2.apply.r.out === v1.r.out + 60, up2.label);
const late = { out: '18:30' };
const D = make(plans, { [fk]: late });
const up3 = hourChip(D.of(fk).d, late, D.of(fk).r, 60, D.ctx);
ok('마지노선(19:00)을 넘기면 경고', !!up3.warn, up3.warn);
ok('퇴근 정한 날 실근무 칸 설명이 짧음', fieldHints(outPin, false)[2].length <= 16, fieldHints(outPin, false)[2]);

console.log('— 편집 뒤 바로 맞추기 (§6.1)');
const t = tryPin(v0.d, null, 'out', toMin('17:00'), A.ctx);
const E = make(plans, { [fk]: t.pin });
const sug = buildSuggestion({ baseDiff: A.summary.projectedDiff, keys: [fk], label: 'x', fromKey: fk }, E.ctx);
ok('줄이면 제안이 생김', !!sug && !sug.matched && sug.options.length >= 2, `차이 ${sug && sug.drift}`);
const even = sug.options.find((o) => o.mode === 'even');
ok('방식마다 토스트용 짧은 문구', sug.options.every((o) => typeof o.short === 'string' && o.short.length < 40), even.short);
ok('바꾼 날은 다시 건드리지 않음', !even.spread.changes.some((c) => c.key === fk));
const F = make({ ...plans, ...even.spread.plans }, { [fk]: t.pin });
ok('고르게 적용 뒤 목표와 10분 안', Math.abs(monthDrift(F.summary, R, goal)) <= 10, `${monthDrift(F.summary, R, goal)}분`);
ok('일할 수 있는 날만 바꿈', even.spread.changes.every((c) => capacityOf(A.of(c.key).d, R) > 0));

console.log(fail ? `\n${count - fail} 통과 · ${fail} 실패` : `\n${count} 통과 · 0 실패`);
process.exit(fail ? 1 : 0);
