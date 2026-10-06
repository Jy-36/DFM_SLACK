// 정산 엔진 계산 확인: node scripts/engine-check.mjs
import { evalDay, familyDayKey, netFromGross, grossForNet, summarizeMonth, checkoutFor, otInfo, breakZone, projectedOf, distributeEvenly, distributeAmong, distributeToMax, earlierStarts } from '../src/apps/worktime/lib/engine.js';
import { DEFAULT_RULES as R, migrateRecord } from '../src/apps/worktime/lib/rules.js';
import { parseAttendanceHtml } from '../src/apps/worktime/lib/sync.js';
import { generateMockRecords } from '../src/apps/worktime/lib/mockData.js';
import { fmtDur, fmtClock } from '../src/apps/worktime/lib/time.js';

let fail = 0;
const eq = (name, got, want) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got}${ok ? '' : ` (기대 ${want})`}`); };

eq('휴게: 체류 8:30 → 실근무', fmtDur(netFromGross(510, R)), '8:00');
eq('휴게: 실근무 8:00 → 최소 체류', fmtDur(grossForNet(480, R)), '8:30');

const now = new Date(2026, 9, 6, 10, 5);
const recs = generateMockRecords(now);
const sep = summarizeMonth(2026, 8, recs, R, {}, now);
eq('9월 Max (52/7×30 = 222.86h → 시간 버림)', fmtDur(sep.possible), '222:00');
eq('9월 필요 기준 (근무일 19×8=152 vs 40/7×30=171:00 중 작은 값)', fmtDur(sep.targets.base), '152:00');
eq('9월 비근무근태 (연차8 + 시간연차4h)', fmtDur(sep.targets.offTotal), '12:00');
eq('9월 필요', fmtDur(sep.required), '140:00');

const oct = summarizeMonth(2026, 9, recs, R, {}, now);
eq('10월 Max (52/7×31 = 230.29h → 시간 버림)', fmtDur(oct.possible), '230:00');
eq('10월 Max 분 단위 설정', fmtDur(summarizeMonth(2026, 9, recs, { ...R, maxRounding: 'minute' }, {}, now).possible), '230:17');
eq('10월 필요', fmtDur(oct.required), '146:00');
console.log('     10월 평일 누적초과', fmtDur(oct.weekdayOvertime, { sign: true }), '(전일까지 필수', fmtDur(oct.weekdayRequiredSoFar), '/ 실적', fmtDur(oct.weekdayDoneSoFar) + ')');
console.log('     오늘 목표 퇴근', fmtClock(checkoutFor(oct.today, oct.todayTarget, R)), '· 하루 평균', fmtDur(oct.avgPerDay), '· 남은', fmtDur(oct.workToGo));

const even = summarizeMonth(2026, 9, recs, R, distributeEvenly(oct, R), now);
eq('균등 배분 후 월말 차이', fmtDur(even.projectedDiff), '0:00');
const pick = oct.upcoming.filter((d) => d.dow === 2 || d.dow === 4).map((d) => d.key);
const amongPlans = distributeAmong(oct, R, {}, pick);
const among = summarizeMonth(2026, 9, recs, R, amongPlans, now);
eq('선택한 날에만 나눠 넣은 뒤 차이', fmtDur(among.projectedDiff), '0:00');

// 2026-07: 평일 23일 − 제헌절(7/17) = 근무일 22일 → min(176:00, 40/7×31 = 177:00) = 176:00
const jul = summarizeMonth(2026, 6, {}, R, {}, now);
eq('2026-07 근무일 (제헌절 반영)', jul.workdayCount, 22);
eq('2026-07 필요', fmtDur(jul.required), '176:00');
// 주 환산값이 더 작은 경우 확인 (주 소정 36h로 가정): 36/7×31 = 159.43h → 시간 버림 159:00
eq('주 환산값 시간 버림 (36h/7×31)', fmtDur(summarizeMonth(2026, 6, {}, { ...R, stdWeeklyMin: 2160 }, {}, now).required), '159:00');
eq('주 환산값 분 단위 설정', fmtDur(summarizeMonth(2026, 6, {}, { ...R, stdWeeklyMin: 2160, maxRounding: 'minute' }, {}, now).required), '159:25');
// 패밀리데이: 21일이 있는 주 금요일, 쉬어도 필요시간은 그대로 → 다른 날에 채움
eq('패밀리데이 2026-10 (21일 수 → 23일 금)', familyDayKey(2026, 9), '2026-10-23');
eq('패밀리데이 2026-11 (21일 토 → 20일 금)', familyDayKey(2026, 10), '2026-11-20');
eq('패밀리데이 2026-12 (21일 월 → 25일 금)', familyDayKey(2026, 11), '2026-12-25');
const famRecs = { ...recs, '2026-10-23': { leave: 'family' } };
const fam = summarizeMonth(2026, 9, famRecs, R, {}, now);
eq('패밀리데이 선택해도 필요시간 그대로', fmtDur(fam.required), fmtDur(oct.required));
eq('패밀리데이 선택 시 기본 계획은 8h 부족', fmtDur(fam.projectedDiff), fmtDur(oct.projectedDiff - 480));
const famEven = distributeEvenly(fam, R);
const famAfter = summarizeMonth(2026, 9, famRecs, R, famEven, now);
eq('균등 배분이 패밀리데이 8h를 다른 날로 채움', fmtDur(famAfter.projectedDiff), '0:00');
eq('패밀리데이에는 계획 0', famAfter.days.find((d) => d.key === '2026-10-23').isRest && !('2026-10-23' in famEven), true);

// 시간 고정: 10/7을 10시간으로 고정하면 나머지 날만 줄어들고 합계는 필요시간과 같다
const lockPlans = { '2026-10-07': 600 };
const locks = { '2026-10-07': true };
const lockEven = { ...lockPlans, ...distributeEvenly(oct, R, lockPlans, locks) };
const lockAfter = summarizeMonth(2026, 9, recs, R, lockEven, now);
eq('고정한 날은 그대로', lockEven['2026-10-07'], 600);
eq('고정 후 균등 배분 합계 = 필요시간', fmtDur(lockAfter.projectedDiff), '0:00');
const lockMax = { ...lockPlans, ...distributeToMax(oct, R, lockPlans, null, locks) };
eq('고정 후 Max 채우기도 고정한 날 유지', lockMax['2026-10-07'], 600);
eq('고정 후 Max 채우기 합계 = Max', fmtDur(summarizeMonth(2026, 9, recs, R, lockMax, now).projected), '230:00');

// 휴일 근무: 10/10(토) 5시간 계획 → Max에서는 차감, 필요시간은 그대로
const hol = summarizeMonth(2026, 9, recs, R, { '2026-10-10': 300 }, now);
eq('휴일 근무는 필요시간 대비 예상에 안 들어감', fmtDur(hol.projectedDiff), fmtDur(oct.projectedDiff));
eq('휴일 근무만큼 Max 여유 감소', fmtDur(oct.possibleLeft - hol.possibleLeft), '5:00');
eq('휴일 근무가 있어도 근무일 필요분은 그대로', fmtDur(hol.workToGo), fmtDur(oct.workToGo));
const holEven = summarizeMonth(2026, 9, recs, R, { '2026-10-10': 300, ...distributeEvenly(hol, R, { '2026-10-10': 300 }) }, now);
eq('휴일 근무 있어도 균등 배분은 필요시간을 근무일로 채움', fmtDur(holEven.projectedDiff), '0:00');
const holMax = summarizeMonth(2026, 9, recs, R, { '2026-10-10': 300, ...distributeToMax(hol, R, { '2026-10-10': 300 }) }, now);
eq('휴일 근무 포함 Max 채우기 합계 = Max', fmtDur(holMax.projected), '230:00');
const holPast = summarizeMonth(2026, 9, { ...recs, '2026-10-03': { in: '09:00', out: '13:30' } }, R, {}, now);
eq('지난 휴일 근무 실적 인정 (10/3 토 4:30 체류)', fmtDur(holPast.holidayWork), '4:00');
eq('지난 휴일 근무는 남은 필요시간을 줄이지 않음', fmtDur(holPast.remainingNeed), fmtDur(oct.remainingNeed));
eq('지난 휴일 근무는 Max까지 남은 시간을 줄임', fmtDur(oct.remainingPossible - holPast.remainingPossible), '4:00');
eq('지난 휴일 근무는 평일 누적초과에서 제외', holPast.weekdayOvertime, oct.weekdayOvertime);

// Max까지 채우기 (회사 기준: 하루·주 제한 없음, 월 Max만) → 월 예상이 정확히 Max
const maxPlans = distributeToMax(oct, R, {});
const mx = summarizeMonth(2026, 9, recs, R, maxPlans, now);
eq('Max 배분 후 월 예상 = Max', fmtDur(mx.projected), fmtDur(mx.possible));
const ins = earlierStarts(oct, R, maxPlans, {});
const todayOut = oct.today.inMin + grossForNet(maxPlans[oct.todayKey], R);
eq('오늘 Max 계획이 22:00 안에 끝남', todayOut <= 22 * 60, true);
eq('출근을 앞당긴 날은 모두 22:00 이전 퇴근', Object.entries(ins).every(([k, t]) => { const [h, m] = t.split(':').map(Number); return h * 60 + m + grossForNet(maxPlans[k], R) <= 22 * 60; }), true);
console.log('     앞당긴 출근:', [...new Set(Object.values(ins))].join(', '));
console.log('     Max 배분: 날짜별', [...new Set(Object.values(maxPlans).map((v) => fmtDur(v)))].join(', '), '· 주별', mx.weeks.map((w) => fmtDur(w.projected)).join(' '));
// 제한을 켠 경우: 1일 12h · 주 52h 를 지킴
const RL = { ...R, dailyLimitOn: true, weeklyLimitOn: true };
const octL = summarizeMonth(2026, 9, recs, RL, {}, now);
const mxL = summarizeMonth(2026, 9, recs, RL, distributeToMax(octL, RL, {}), now);
eq('[제한 켬] 주 52h 초과 없음', mxL.weeks.every((w) => w.projected <= RL.maxWeeklyMin), true);
eq('[제한 켬] 1일 12h 초과 없음', Object.values(distributeToMax(octL, RL, {})).every((v) => v <= RL.maxDailyMin), true);
eq('[제한 끔] 13시간 근무도 그대로 인정', summarizeMonth(2026, 9, { ...recs, '2026-10-01': { in: '07:00', out: '21:00' } }, R, {}, now).days[0].recognized, 780);
// 시간 연차: 2시간 단위로 필요시간 차감
const d1 = new Date(2026, 9, 7);
eq('시간 연차 2h → 필요시간 −2h', evalDay(d1, { leave: 'hourly', leaveMin: 120 }, R).offCredit, 120);
eq('시간 연차 6h → 그날 기본 계획 2h', evalDay(d1, { leave: 'hourly', leaveMin: 360 }, R, { todayKey: '2026-10-06' }).dayRequired, 120);
eq('예전 오전반차 → 시간 연차 4h', JSON.stringify(migrateRecord({ leave: 'half_am' })), JSON.stringify({ leave: 'hourly', leaveMin: 240 }));
eq('예전 반반차 → 시간 연차 2h', migrateRecord({ leave: 'quarter' }).leaveMin, 120);

// 제외시간: 09:00~18:30 체류, 외출 14:00~15:00 → 체류 8:30 → 실근무 8:00
const ex = evalDay(d1, { in: '09:00', out: '18:30', excludes: [{ from: '14:00', to: '15:00' }] }, R);
eq('제외시간(구간) 빼고 실근무', fmtDur(ex.actual), '8:00');
const ex2 = evalDay(d1, { in: '09:00', out: '18:30', excludes: [{ min: 30 }] }, R);
eq('제외시간(분) 빼고 실근무 (체류 9:30 − 30분 = 9:00 → 휴게 1h)', fmtDur(ex2.actual), '8:00');
const ex3 = evalDay(d1, { in: '09:00', out: '12:00', excludes: [{ from: '13:00', to: '14:00' }] }, R);
eq('근무 구간 밖 제외시간은 안 뺌', fmtDur(ex3.actual), '3:00');
const ex4 = evalDay(d1, { leave: 'annual', excludes: [{ from: '13:00', to: '14:00' }] }, R);
eq('출근 안 한 날 제외시간 무시', ex4.plannedExclude + ex4.excluded, 0);
eq('제외시간만큼 예상 퇴근 늦어짐', fmtClock(checkoutFor({ inMin: 540, plannedExclude: 60 }, 480, R)), '18:30');

// 사내 표 읽기: 시간 연차 시간·제외시간 열
if (typeof DOMParser !== 'undefined') {
  const html = '<table id="attTable"><tbody><tr><td>2026.10.07</td><td>홍</td><td>09:00</td><td>13:00</td><td>시간연차(4h)</td><td>0:30</td></tr></tbody></table>';
  const r = parseAttendanceHtml(html).records['2026-10-07'];
  eq('표: 시간 연차 4h', r.leaveMin, 240);
  eq('표: 제외시간 30분', r.excludes[0].min, 30);
}
// 출장·교육: 8시간 고정
const pastD = new Date(2026, 8, 7);
const trip = evalDay(pastD, { leave: 'trip', in: '08:00', out: '20:00' }, R, { todayKey: '2026-10-06' });
eq('출장: 체류와 상관없이 8:00', fmtDur(trip.recognized), '8:00');
const tripF = evalDay(new Date(2026, 9, 20), { leave: 'edu' }, R, { todayKey: '2026-10-06' });
eq('교육 계획: 계획이 있어도 8:00', fmtDur(projectedOf(tripF, { '2026-10-20': 480 }, R)), '8:00');
// 휴게 조정 추천: 체류 8:30 초과 ~ 9:00 미만
eq('휴게 구간', JSON.stringify(breakZone(R)), JSON.stringify({ from: 510, to: 540 }));
eq('8:45 체류 → 휴게 조정 추천', evalDay(pastD, { in: '09:00', out: '17:45' }, R, { todayKey: '2026-10-06' }).breakAlert, true);
eq('9:00 체류 → 알림 없음', evalDay(pastD, { in: '09:00', out: '18:00' }, R, { todayKey: '2026-10-06' }).breakAlert, false);
eq('8:30 체류 → 알림 없음', evalDay(pastD, { in: '09:00', out: '17:30' }, R, { todayKey: '2026-10-06' }).breakAlert, false);
// OT = 초과 − 14h, 구간
eq('초과 10h → 호구왕', otInfo(600, R).zone.label, '호구왕');
eq('초과 18h → 실질 단가 22%', Math.round(otInfo(1080, R).rate * 100), 22);
eq('초과 28h → 50% 해피존', `${Math.round(otInfo(1680, R).rate * 100)} ${otInfo(1680, R).zone.label}`, '50 해피존');
eq('초과 40h → 65% 부자존', `${Math.round(otInfo(2400, R).rate * 100)} ${otInfo(2400, R).zone.label}`, '65 부자존');
process.exit(fail ? 1 : 0);
