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
  breakAlertOn: true, // 체류 8:30~9:00 사이면 휴게 조정 추천 알림
  inclusiveOtMin: 840, // 포괄로 이미 반영된 초과 근무 14h → OT = 초과 근무 − 이 값
  // kind: off  = 비근무근태 → 필요시간에서 차감
  //       work = 근무로 인정 → 인정시간에 더함
  //       rest = 쉬지만 필요시간은 그대로 → 다른 날 근무로 채움 (패밀리데이)
  // variable: 날마다 시간을 고르는 근태 (시간 연차: step 단위, 최대 max)
  leaveTypes: {
    annual: { label: '연차', credit: 480, kind: 'off' },
    hourly: { label: '시간 연차', credit: 120, kind: 'off', variable: true, step: 120, max: 360 },
    trip: { label: '출장', credit: 480, kind: 'work' },
    edu: { label: '교육', credit: 480, kind: 'work' },
    family: { label: '패밀리데이', credit: 0, kind: 'rest' },
  },
  familyDayOn: true, // 매달 21일이 있는 주 금요일을 패밀리데이 후보로 표시
};

export const LEAVE_ORDER = ['annual', 'hourly', 'family', 'trip', 'edu'];

// 예전 반차·반반차 기록 → 시간 연차로 바꾸는 표
export const LEGACY_LEAVES = { half_am: 240, half_pm: 240, quarter: 120 };

/** 기록 하나를 지금 규칙에 맞게 바꾼다 (예전 반차 → 시간 연차 4h) */
export function migrateRecord(rec) {
  if (!rec || !rec.leave || !(rec.leave in LEGACY_LEAVES)) return rec;
  return { ...rec, leave: 'hourly', leaveMin: LEGACY_LEAVES[rec.leave] };
}

/** 근태 이름 (시간 연차는 시간까지) */
export function leaveText(rules, rec) {
  const def = rec?.leave ? rules.leaveTypes[rec.leave] : null;
  if (!def) return null;
  if (def.variable) return `${def.label} ${Math.round((rec.leaveMin ?? def.credit) / 60)}h`;
  return def.label;
}

export function mergeRules(saved) {
  const base = structuredClone(DEFAULT_RULES);
  if (!saved) return base;
  const leaveTypes = { ...base.leaveTypes };
  for (const [k, v] of Object.entries(saved.leaveTypes || {})) {
    if (k in LEGACY_LEAVES) continue; // 없앤 근태
    leaveTypes[k] = { ...(base.leaveTypes[k] || {}), ...v };
  }
  return { ...base, ...saved, leaveTypes };
}
