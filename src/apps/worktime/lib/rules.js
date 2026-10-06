// 선택근무제 규칙. 화면의 [설정]에서 바꿀 수 있고, 계산 엔진은 이 값만 본다.
//
// 월 Max = 주 최대(52h) ÷ 7 × 월 일수
// 월 필요시간 = min(근로일수 × 1일 소정, 주 소정(40h) ÷ 7 × 월 일수) − 비근무근태 시간
// 평일 누적초과 = 전일까지 평일 실적 − 전일까지 평일 필수근무 누적

export const DEFAULT_RULES = {
  settlementUnit: 'month',
  dailyStdMin: 480, // 1일 소정근로 8h
  stdWeeklyMin: 2400, // 주 소정근로 40h
  maxWeeklyMin: 3120, // 월 Max 계산용 주 시간 52h
  weeklyLimitOn: false, // 주 52h를 주마다 지켜야 하는지 (회사 기준: 월 정산만 → 끔)
  maxRounding: 'hour', // 주 단위 환산(Max, 40h÷7×일수) 버림 단위: hour(회사 기준) | minute
  recognizeFrom: '06:00',
  recognizeTo: '22:00',
  minDailyMin: 240, // 근무일 최소 (0이면 검사 안 함)
  dailyLimitOn: false, // 하루 최대 근무 제한 (회사 기준: 없음 → 끔)
  maxDailyMin: 720, // 하루 최대 (dailyLimitOn일 때만 적용)
  breaks: [
    { at: 240, minutes: 30 },
    { at: 480, minutes: 30 },
  ],
  planDefaultIn: '08:30',
  // kind: off  = 비근무근태 → 필요시간에서 차감
  //       work = 근무로 인정 → 인정시간에 더함
  //       rest = 쉬지만 필요시간은 그대로 → 다른 날 근무로 채움 (패밀리데이)
  leaveTypes: {
    annual: { label: '연차', credit: 480, kind: 'off' },
    half_am: { label: '오전반차', credit: 240, kind: 'off' },
    half_pm: { label: '오후반차', credit: 240, kind: 'off' },
    quarter: { label: '반반차', credit: 120, kind: 'off' },
    trip: { label: '출장', credit: 480, kind: 'work' },
    edu: { label: '교육', credit: 480, kind: 'work' },
    family: { label: '패밀리데이', credit: 0, kind: 'rest' },
  },
  familyDayOn: true, // 매달 21일이 있는 주 금요일을 패밀리데이 후보로 표시
};

export const LEAVE_ORDER = ['annual', 'half_am', 'half_pm', 'quarter', 'family', 'trip', 'edu'];

export function mergeRules(saved) {
  const base = structuredClone(DEFAULT_RULES);
  if (!saved) return base;
  const leaveTypes = { ...base.leaveTypes };
  for (const [k, v] of Object.entries(saved.leaveTypes || {})) leaveTypes[k] = { ...(base.leaveTypes[k] || {}), ...v };
  return { ...base, ...saved, leaveTypes };
}
