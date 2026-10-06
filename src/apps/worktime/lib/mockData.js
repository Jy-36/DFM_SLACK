// 가짜 근태 데이터. 사내 사이트 수집이 붙기 전까지 화면 확인용.
// 지난달 1일 ~ 어제까지는 출퇴근 기록, 오늘은 출근만, 앞으로는 예정 휴가 1건.
import { ymd, addDays, toMin, fmtClock, minutesOfDay } from './time.js';
import { holidayName } from './holidays.js';

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isWorkday = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !holidayName(ymd(d));

export function generateMockRecords(now = new Date(), seed = 20261006) {
  const rnd = mulberry32(seed);
  const pick = (lo, hi, step = 1) => lo + Math.floor((rnd() * (hi - lo)) / step) * step;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const recs = {};

  const pastWorkdays = [];
  for (let d = new Date(start); d < today; d = addDays(d, 1)) if (isWorkday(d)) pastWorkdays.push(new Date(d));

  pastWorkdays.forEach((d, i) => {
    const inMin = pick(7 * 60 + 25, 9 * 60 + 35, 1);
    let gross = pick(8 * 60 + 10, 10 * 60 + 50, 1);
    if (rnd() < 0.12) gross = pick(11 * 60, 12 * 60 + 40, 1); // 가끔 야근
    if (d.getDay() === 5 && rnd() < 0.5) gross = pick(6 * 60, 8 * 60, 1); // 금요일 일찍 퇴근
    recs[ymd(d)] = { in: fmtClock(inMin), out: fmtClock(inMin + gross), source: 'mock' };
  });

  // 지난달 특수 케이스: 연차, 오후반차, 출장, 퇴근 누락
  const prevMonth = pastWorkdays.filter((d) => d.getMonth() !== today.getMonth());
  const setCase = (idx, patch) => {
    const d = prevMonth[idx];
    if (!d) return;
    const key = ymd(d);
    recs[key] = { ...recs[key], ...patch };
  };
  setCase(4, { in: null, out: null, leave: 'annual', note: '개인 연차' });
  setCase(9, { in: '08:05', out: '12:40', leave: 'half_pm' });
  setCase(12, { in: null, out: null, leave: 'trip', note: '기흥 캠퍼스 출장' });
  setCase(15, { out: null, note: '퇴근 태깅 누락' });

  // 지난달 토요일 1회 특근
  const sat = [];
  for (let d = new Date(start); d.getMonth() === start.getMonth(); d = addDays(d, 1))
    if (d.getDay() === 6 && !holidayName(ymd(d))) sat.push(new Date(d));
  if (sat[1]) recs[ymd(sat[1])] = { in: '10:00', out: '14:30', note: '마스크 출하 대응', source: 'mock' };

  // 이번 달 지난 근무일 중 하나는 반반차
  const thisMonthPast = pastWorkdays.filter((d) => d.getMonth() === today.getMonth());
  if (thisMonthPast.length >= 2) {
    const key = ymd(thisMonthPast[thisMonthPast.length - 1]);
    recs[key] = { ...recs[key], leave: 'quarter', out: fmtClock(toMin(recs[key].in) + 6 * 60 + 30) };
  }

  // 오늘: 출근만 찍힌 상태
  const nowMin = minutesOfDay(now);
  if (isWorkday(today)) {
    const inMin = Math.min(8 * 60 + 12, Math.max(6 * 60, nowMin - 10));
    recs[ymd(today)] = { in: fmtClock(inMin), out: null, source: 'mock' };
  }

  // 앞으로: 8일 뒤 이후 첫 근무일에 연차 예정, 그다음 주에 오전반차 예정
  let f = addDays(today, 8);
  while (!isWorkday(f)) f = addDays(f, 1);
  recs[ymd(f)] = { leave: 'annual', note: '예정 연차', source: 'mock' };
  let g = addDays(f, 5);
  while (!isWorkday(g)) g = addDays(g, 1);
  recs[ymd(g)] = { leave: 'half_am', note: '병원 예약', source: 'mock' };

  return recs;
}

/** 동기화 미리보기용 사내 근태 화면 HTML 샘플 */
export function sampleAttendanceHtml(records, limit = 6) {
  const typeLabel = { annual: '연차', half_am: '오전반차', half_pm: '오후반차', quarter: '반반차', trip: '출장', edu: '교육' };
  const rows = Object.entries(records)
    .filter(([, r]) => r.in || r.leave)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, limit)
    .map(
      ([k, r]) =>
        `    <tr><td>${k.replaceAll('-', '.')}</td><td>홍길동</td><td>${r.in || ''}</td><td>${r.out || ''}</td><td>${r.leave ? typeLabel[r.leave] : '정상'}</td></tr>`,
    )
    .join('\n');
  return `<table id="attTable">
  <thead><tr><th>일자</th><th>성명</th><th>출근</th><th>퇴근</th><th>근태구분</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}
