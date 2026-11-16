// 근무 계획 화면 모델: 날짜마다 보여줄 상태·글자를 한 곳에서 만든다 (Calendar · List 같은 값)
import { capacityOf, netFromGross } from '../../lib/engine.js';
import {
  resolveDay, resolvePinTransition, checkResolved, isFixedPin, pinKind, pinTagText, hasRecord, goalEndOf, goalStartOf,
  monthDrift, spreadDelta, BLOCK_BOTH,
} from '../../lib/goal.js';
import { toMin } from '../../lib/time.js';
import { clock, dur, signed, md, mdLong, durKo, clockKo } from './format.js';

/**
 * 하루 보기 모델
 * state: 'rec' 기록 · 'recNone' 기록 없음 · 'auto' · 'pin' 직접 정함 · 'leavePlan' 계획 휴가 · 'leaveRec' 사이트 휴가(미래)
 *        'today' · 'weekend' · 'holiday' 휴일 근무 · 'preview' 다음 달 미리보기
 */
export function dayView(d, ctx) {
  const { records, rules, goal, pins, leaves, summary, advice, isNextMonth } = ctx;
  const P = summary.effPlans || {};
  const v = {
    key: d.key,
    d,
    n: d.date.getDate(),
    dow: d.dow,
    weekend: !d.isWorkday,
    state: 'auto',
    tag: null,
    tagTone: 'neutral',
    main: '',
    sub: '',
    note: null,
    noteTone: 'normal',
    r: null,
    pin: pins[d.key] || null,
    leavePlan: leaves[d.key] || null,
    editable: false,
    selectable: false,
    label: '',
  };
  const rec = records[d.key];
  const recShown = summary.recs?.[d.key];

  // 지난 날 · 퇴근 기록이 있는 오늘 → 근무기록 값만
  if (d.isPast || (d.isToday && d.outMin != null && !d.live)) {
    const worked = d.inMin != null || d.recognized > 0 || d.credit > 0 || d.isRest;
    if (!d.isWorkday && !worked) return finish({ ...v, state: 'weekend' });
    if (!worked && d.isWorkday) return finish({ ...v, state: 'recNone', tag: '기록 없음', tagTone: 'rec', main: '—', note: '근무기록에서 입력' });
    return finish({
      ...v,
      state: 'rec',
      tag: d.isToday ? '오늘' : '기록',
      tagTone: d.isToday ? 'today' : 'rec',
      main: dur(d.recognized),
      sub: d.inMin != null ? `${clock(d.inMin)}–${clock(d.outMin)}` : d.leaveLabel || '',
      note: d.inMin != null && d.leaveLabel ? d.leaveLabel : !d.isWorkday && d.recognized ? '휴일 근무' : null,
    });
  }

  // 사이트·직접 입력 기록이 있는 미래 날 (근태 등) → 기록 상태
  if (!d.isToday && hasRecord(rec)) {
    return finish({ ...v, state: 'leaveRec', tag: d.leaveLabel ? `${d.leaveLabel} · 기록` : '기록', tagTone: 'rec', main: d.credit ? dur(d.credit) : '', sub: '사이트 근태' });
  }

  // 종일 계획 휴가 (또는 패밀리데이 쉼)
  if (recShown?.planLeave && capacityOf(d, rules) === 0 && d.isWorkday) {
    return finish({
      ...v,
      state: 'leavePlan',
      tag: `${d.leaveLabel} · 계획`,
      tagTone: 'leave',
      main: d.offCredit ? dur(d.offCredit) : d.workCredit ? dur(d.workCredit) : '',
      sub: d.isRest ? '쉬는 날 (필수 시간 유지)' : '휴가로 인정',
      editable: true,
    });
  }

  // 주말·공휴일
  if (!d.isWorkday) {
    if (v.pin && v.pin.net != null) {
      const r = resolveDay(d, v.pin, rules, goal, P[d.key]);
      return finish({ ...v, state: 'holiday', r, tag: '휴일 근무', tagTone: 'pin', main: dur(r.net), sub: `${clock(r.in)}–${clock(r.out)}`, editable: true, selectable: true });
    }
    return finish({ ...v, state: 'weekend', note: d.holiday || null, editable: !isNextMonth || true });
  }

  // 오늘
  if (d.isToday) {
    const a = advice;
    const r = resolveDay(d, v.pin, rules, goal, P[d.key]);
    const base = { ...v, state: 'today', r, tag: '오늘', tagTone: 'today', editable: true, selectable: false };
    if (!a || a.state === 'leave') return finish({ ...base, main: d.leaveLabel || '휴가', sub: '' });
    if (a.state === 'beforeIn') return finish({ ...base, main: `→ ${clock(a.plan.out)}`, sub: `출근 전 · ${clock(a.inMin)} 기준`, ...driftNote(a.drift) });
    if (a.state === 'done') return finish({ ...base, main: '지금 나가도 돼요 ✓', mainSmall: true, sub: `${clock(d.inMin)} · ${dur(a.soFar)}` });
    return finish({ ...base, main: `→ ${clock(a.plan.out)}`, sub: `${clock(d.inMin)} · ${dur(a.soFar)}`, ...driftNote(a.drift) });
  }

  // 앞으로의 근무일
  const r = resolveDay(d, v.pin, rules, goal, P[d.key]);
  const fixed = isFixedPin(v.pin);
  const out = {
    ...v,
    state: isNextMonth && P[d.key] == null && !fixed ? 'preview' : fixed ? 'pin' : 'auto',
    r,
    main: dur(r.net),
    sub: `${clock(r.in)}–${clock(r.out)}`,
    editable: true,
    selectable: true,
  };
  if (fixed) {
    out.tag = pinTagText(v.pin);
    out.tagTone = 'pin';
  } else if (pinKind(v.pin) === 'in') {
    out.tag = pinTagText(v.pin);
    out.tagTone = 'neutral';
  }
  if (out.state === 'preview') out.tag = '미리보기';
  // 알림 한 줄: 범위 밖(주황) > 근태 · 패밀리데이 · 일찍 퇴근
  const end = goalEndOf(d, rules, goal);
  const start = Math.max(toMin(goal.startIn || rules.planDefaultIn), toMin(rules.recognizeFrom));
  if (r.out > end) {
    out.note = `${clock(end)} 넘음`;
    out.noteTone = 'warn';
  } else if (r.in < start) {
    out.note = `${clock(start)}보다 이름`;
    out.noteTone = 'warn';
  } else if (d.leaveLabel && recShown?.planLeave) out.note = `${d.leaveLabel} · 계획`;
  else if (d.leaveLabel) out.note = d.leaveLabel;
  else if (rules.familyDayOn && d.key === summary.familyKey) out.note = '패밀리데이';
  else if (!fixed && goal.earlyDays?.includes(d.dow)) out.note = '일찍 퇴근';
  return finish(out);
}

function driftNote(drift) {
  if (drift == null || Math.abs(drift) <= 10) return {};
  return { note: `목표 ${signed(drift)}`, noteTone: 'warn' };
}

function finish(v) {
  const [, mm, dd] = v.key.split('-');
  const parts = [`${Number(mm)}월 ${Number(dd)}일 ${mdLong(v.key).split(' ')[1]}`];
  if (v.tag) parts.push(v.tag);
  if (v.r && (v.state === 'pin' || v.state === 'auto' || v.state === 'holiday')) {
    parts.push(`${clockKo(v.r.in)}부터 ${clockKo(v.r.out)}까지`, `실근무 ${durKo(v.r.net)}`);
  } else if (v.main) parts.push(v.main);
  if (v.note) parts.push(v.note);
  v.label = parts.join(', ');
  return v;
}

/** 오른쪽 상세 패널 세 줄의 설명 (GUIDE-ui-window §3.5 표) */
export function fieldHints(pin, isToday) {
  const k = pinKind(pin);
  const set = '직접 정함';
  const t = {
    none: ['자동', '자동', '자동'],
    in: [set, '자동', '자동'],
    out: ['자동', set, '자동 · 바꾸면 출근이 움직여요'],
    net: ['자동', '자동', set],
    'in+out': [set, set, '계산됨'],
    'in+net': [set, '계산됨', set],
    'out+net': ['계산됨', set, set],
  }[k];
  if (isToday) return ['기록 · 회사 사이트', '계획 · 다르게 나가면 바꿔요', '출근 + 퇴근으로 계산'];
  return t;
}

/**
 * 하루 값 바꾸기 시도 → { pin, r } 또는 { blocked }
 * field: 'in' | 'out' | 'net', value: 분
 */
export function tryPin(d, pin, field, value, ctx) {
  const { rules, goal, summary } = ctx;
  const val = field === 'net' ? value : clock(value);
  const next = resolvePinTransition(pin, field, val);
  if (next.blocked) return { blocked: next.blocked };
  const r = resolveDay(d, next, rules, goal, summary.effPlans?.[d.key]);
  const why = checkResolved(r, rules);
  if (why) return { blocked: why };
  return { pin: next, r };
}

/** 퇴근 빠르게 4칸: 일찍 퇴근 시각(그 요일일 때) + 최근 쓴 퇴근 */
export function quickOuts(d, goal, recentOuts) {
  const list = [];
  if (goal.earlyDays?.includes(d.dow) && goal.earlyOut) list.push(goal.earlyOut);
  for (const t of recentOuts || []) if (!list.includes(t)) list.push(t);
  for (const t of ['18:00', '18:30', '19:00', '17:00']) if (list.length < 4 && !list.includes(t)) list.push(t);
  return list.slice(0, 4).sort();
}

/** ±1시간 칩 라벨 (퇴근 정한 날은 출근이 움직임) */
export function hourChip(d, pin, r, delta, ctx) {
  if (pin?.in != null && pin?.out != null) return null;
  const t = tryPin(d, pin, 'net', r.net + delta, ctx);
  const sign = delta > 0 ? '+1시간' : '−1시간';
  if (t.blocked) return { label: `${sign}`, blocked: t.blocked };
  if (pin?.out != null) return { label: `${sign} → 출근 ${clock(t.r.in)}`, apply: t };
  return { label: `${sign} → 퇴근 ${clock(t.r.out)}`, apply: t };
}

/** 일괄 적용 결과 미리 계산 → { pins, blocked:[{key, why}], delta } */
export function bulkResult(views, draft, ctx) {
  const pins = {};
  const blocked = [];
  let delta = 0;
  for (const v of views) {
    if (!v.r) continue;
    let pin = v.pin;
    let r = v.r;
    let why = null;
    if (draft.auto) {
      pins[v.key] = null;
      continue;
    }
    for (const f of ['in', 'out', 'net']) {
      if (draft[f] == null) continue;
      const t = tryPin(v.d, pin, f, draft[f], ctx);
      if (t.blocked) {
        why = t.blocked;
        break;
      }
      pin = t.pin;
      r = t.r;
    }
    if (why) blocked.push({ key: v.key, why });
    else if (pin !== v.pin) {
      pins[v.key] = pin;
      delta += r.net - v.r.net;
    }
  }
  return { pins, blocked, delta };
}

/**
 * 제안 내용 (GUIDE §6). sug = { baseDiff, keys, label, fromKey }
 * → null(띄우지 않음) | { change, drift, text, options:[{mode, title, detail, warn, spread}], matched, ahead }
 */
export function buildSuggestion(sug, ctx) {
  if (!sug) return null;
  const { summary, rules, plans, pins, goal } = ctx;
  const change = summary.projectedDiff - sug.baseDiff;
  const drift = monthDrift(summary, rules, goal);
  if (Math.abs(change) < 10 && Math.abs(drift) < 10 && !sug.forced) return null;
  const head = `${sug.keys.length > 1 ? `${sug.keys.length}일을 바꿨어요` : sug.label || ''}`;
  const res = { change, drift, head, options: [] };
  if (Math.abs(drift) <= 10) {
    res.matched = true;
    return res;
  }
  if (Math.sign(change) !== Math.sign(drift) && Math.abs(change) >= 10 && !sug.forceFit) {
    res.ahead = true;
  }
  if (Math.abs(drift) > Math.abs(change) * 3 && Math.abs(change) >= 10) res.before = drift - change;
  const ex = sug.keys;
  const mk = (mode, amount, title) => {
    const sp = spreadDelta(summary, rules, plans, pins, goal, { amount, mode, fromKey: sug.fromKey || ex[ex.length - 1], exclude: ex });
    let detail = '';
    const n = sp.changes.length;
    if (!n) detail = '바꿀 수 있는 날이 없어요';
    else if (mode === 'near') detail = sp.changes.slice(0, 2).map((c) => `${md(c.key)} ${signed(c.to - c.from)}`).join(', ') + (n > 2 ? ` 외 ${n - 2}일` : '');
    else {
      const per = Math.round(Math.abs(sp.absorbed) / n / 10) * 10;
      const latest = Math.max(...sp.changes.map((c) => resolveDay(summary.days.find((d) => d.key === c.key), pins[c.key], rules, goal, c.to).out));
      detail = `${mode === 'week' ? '그 주 ' : '자동 '}${n}일에 ${dur(per)}씩 ${sp.absorbed > 0 ? '늘려요' : '줄여요'} · 가장 늦은 퇴근 ${clock(latest)}`;
    }
    const warn = sp.leftover && Math.abs(sp.leftover) >= 10 ? `${dur(Math.abs(sp.absorbed))}만 채울 수 있어요` : null;
    return { mode, title, detail: warn && !n ? detail : detail, warn, spread: sp, disabled: !n };
  };
  res.options.push(mk('even', -drift, '남은 날 고르게'));
  res.options.push(mk('near', -drift, '내일부터 차례로'));
  if (sug.keys.length && Math.abs(change) >= 10) res.options.push(mk('week', -change, '그 주 안에서'));
  return res;
}

/** 하루 근무 시간대 바깥 값 (List 알림 칸) */
export function rangeNote(d, r, ctx) {
  const { rules, goal } = ctx;
  if (!r) return null;
  const end = goalEndOf(d, rules, goal);
  if (r.out > end) return `${clock(end)} 넘음`;
  if (r.in < goalStartOf({ ...d, isToday: false }, rules, goal, {})) return `${clock(goalStartOf({ ...d, isToday: false }, rules, goal, {}))}보다 이름`;
  return null;
}

export { BLOCK_BOTH, netFromGross };

export const GOAL_LABEL = { required: '필수만', ot0: 'OT 0h', ot14: 'OT 14h', max: '최대한', custom: '직접' };
/** 목표 이름 (직접은 OT 시간으로) */
export const goalTitle = (goal, rules) =>
  goal.target === 'custom' ? `OT ${Math.round((goal.customExcessMin - (rules.inclusiveOtMin ?? 840)) / 60)}h` : GOAL_LABEL[goal.target];
