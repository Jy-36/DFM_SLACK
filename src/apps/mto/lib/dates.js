// 날짜 유틸: 엔진은 'YYYY-MM-DD' 문자열을 주고받고, 안에서는 정수 일(1970-01-01 기준, UTC)로 계산한다.
const DAY = 86400000;

/** '2026-09-21' → 20717 */
export const toDay = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
/** 20717 → '2026-09-21' */
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
/** 0=일 … 6=토 */
export const weekdayOf = (n) => new Date(n * DAY).getUTCDay();
export const addDays = (iso, k) => fromDay(toDay(iso) + k);
export const diffDays = (a, b) => toDay(a) - toDay(b);
export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDay(toDay(s)) === s;

const WD = '일월화수목금토';
/** '9/21(월)' */
export const fmtShort = (iso) => {
  if (!iso) return '-';
  const n = toDay(iso);
  const d = new Date(n * DAY);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`;
};
/** '2026.09.21 (월)' */
export const fmtLong = (iso) => {
  if (!iso) return '-';
  return `${iso.replaceAll('-', '.')} (${WD[weekdayOf(toDay(iso))]})`;
};
/** 오늘 (PC 시간대 기준) */
export const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
