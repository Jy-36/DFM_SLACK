// 시간·날짜 유틸. 모든 시간은 "분" 단위 정수로 다룬다.

export const pad2 = (n) => String(n).padStart(2, '0');

export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** "08:12" 또는 "08:12:30" → 492 */
export function toMin(hhmm) {
  if (hhmm == null || hhmm === '') return null;
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 492 → "08:12" (하루를 넘으면 다음날 시각으로 표시) */
export function fmtClock(min) {
  if (min == null || Number.isNaN(min)) return '--:--';
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
}

/** 근무시간 표기: 9150 → "152:30" */
export function fmtDur(min, { sign = false } = {}) {
  if (min == null || Number.isNaN(min)) return '-';
  const r = Math.round(min);
  const s = r < 0 ? '−' : sign && r > 0 ? '+' : '';
  const a = Math.abs(r);
  return `${s}${Math.floor(a / 60)}:${pad2(a % 60)}`;
}

/** 사람이 읽는 표기: 90 → "1시간 30분" */
export function fmtDurKo(min) {
  const a = Math.abs(Math.round(min || 0));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/** m은 0부터 시작 */
export function monthDates(y, m) {
  return Array.from({ length: daysInMonth(y, m) }, (_, i) => new Date(y, m, i + 1));
}

/** 그 주 월요일의 ymd (주간 집계 키) */
export function weekKeyOf(d) {
  const dow = d.getDay();
  return ymd(addDays(d, dow === 0 ? -6 : 1 - dow));
}

export const minutesOfDay = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

export const monthLabel = (y, m) => `${y}년 ${m + 1}월`;

export const dayLabel = (d) => `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY_KO[d.getDay()]})`;

/** "9:30", "9", "9.5" → 분. 못 읽으면 null */
export function parseDurInput(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60);
  return null;
}
