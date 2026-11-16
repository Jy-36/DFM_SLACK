// 근무 계획 화면용 표기 도우미 (GUIDE-ui-window §7 시간 표기)
import { fmtClock, fmtDur, toMin, WEEKDAY_KO, parseYmd } from '../../lib/time.js';

export const clock = (m) => (m == null ? '--:--' : fmtClock(m));
export const dur = (m) => (m == null ? '-' : fmtDur(m));
export const signed = (m) => fmtDur(m, { sign: true }); // +0:10 / −1:10 (U+2212)
export const md = (key) => {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
};
export const mdw = (key) => `${md(key)} ${WEEKDAY_KO[parseYmd(key).getDay()]}`;
export const mdLong = (key) => `${md(key)} ${WEEKDAY_KO[parseYmd(key).getDay()]}요일`;

/** "9:30" "0930" "930" "9" → 분 (시각) */
export function parseClockInput(text) {
  const t = String(text ?? '').trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) return toMin(t);
  if (/^\d{3,4}$/.test(t)) return Number(t.slice(0, -2)) * 60 + Number(t.slice(-2));
  if (/^\d{1,2}$/.test(t)) return Number(t) * 60;
  return null;
}

/** 사람이 읽는 길이 (aria-label): 510 → "8시간 30분" */
export function durKo(m) {
  const a = Math.abs(Math.round(m || 0));
  const h = Math.floor(a / 60);
  const mm = a % 60;
  if (h && mm) return `${h}시간 ${mm}분`;
  if (h) return `${h}시간`;
  return `${mm}분`;
}

export const clockKo = (m) => {
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  const mm = v % 60;
  return mm ? `${h}시 ${mm}분` : `${h}시`;
};

/** 월말 차이 문구: −1:20 → "1:20 모자람", +0:40 → "0:40 넘음" */
export const gapText = (drift) => (drift < 0 ? `${dur(-drift)} 모자람` : `${dur(drift)} 넘음`);
