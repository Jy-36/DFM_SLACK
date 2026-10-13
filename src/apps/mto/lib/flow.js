// Revision ITEM 진행 Step: Changes 준비 → (Step X) → DWR 작성 → DP → EBEAM Review → MTO 완료
// 완료한 Step은 project.flow[key] = { date, comment } 로 남고, EBEAM Review를 끝내면 그 날짜에 MTO 완료.
import { pendingKinds, prepText } from '../components/RevisionChanges.jsx';

export const STEPS = {
  prep: { name: 'Changes 준비', now: '준비중', done: 'Changes 준비 완료' },
  stepx: { name: 'Step X', now: 'Step X 진행중', act: 'Step X 완료', done: 'Step X 완료' },
  dwr: { name: 'DWR 작성', now: 'DWR 작성 필요', act: 'DWR 작성 완료', done: 'DWR 작성' },
  dp: { name: 'DP', now: 'DP 진행중', act: 'DP 완료', done: 'DP 완료' },
  ebeam: { name: 'EBEAM Review', now: 'EBEAM Review 요청 필요', act: 'EBEAM Review 완료', done: 'EBEAM Review 완료' },
  mto: { name: 'MTO 완료', now: 'MTO 완료', done: 'MTO 완료' },
};
/** 사용자가 눌러서 끝내는 Step (순서대로) */
export const ACT_STEPS = ['stepx', 'dwr', 'dp', 'ebeam'];

export const hasStepX = (p) => !!(p.changes?.db?.on && p.changes.db.stepX?.on);

/** 이 ITEM에 해당하는 Step 목록 */
export function stepsOf(p) {
  return ['prep', ...(hasStepX(p) ? ['stepx'] : []), 'dwr', 'dp', 'ebeam', 'mto'];
}

/** 지금 Step: { key, text, index, steps } */
export function currentStep(p, today) {
  const steps = stepsOf(p);
  const f = p.flow || {};
  let key = 'mto';
  if (pendingKinds(p.changes, today).length) key = 'prep';
  else key = steps.find((k) => ACT_STEPS.includes(k) && !f[k]?.date) || 'mto';
  const text = key === 'prep' ? prepText(p.changes, today) : STEPS[key].now;
  return { key, text, index: steps.indexOf(key), steps };
}

/** Step 하나 끝내기 (EBEAM Review면 MTO 완료까지) */
export function completeStep(p, key, date, comment) {
  const flow = { ...(p.flow || {}), [key]: { date, comment: comment || '' } };
  return key === 'ebeam' ? { flow, status: 'done', doneAt: date } : { flow };
}

/** 한 단계 뒤로: 마지막으로 끝낸 Step을 되돌린다 */
export function stepBack(p) {
  const f = { ...(p.flow || {}) };
  const done = stepsOf(p).filter((k) => ACT_STEPS.includes(k) && f[k]?.date);
  const last = done.at(-1);
  if (!last) return null;
  delete f[last];
  return { patch: { flow: f, ...(last === 'ebeam' ? { status: 'active', doneAt: null } : {}) }, key: last };
}

/** 간트 위쪽 Step 줄: Changes 준비(기간) · 각 Step 예상/실제 · MTO(Target/완료) */
export function flowMilestones(p, changeDates = []) {
  const f = p.flow || {};
  const plan = p.flowPlan || {};
  const ds = changeDates.filter(Boolean).sort();
  const out = [];
  if (ds.length) out.push({ key: 'prep', label: 'Changes 준비', span: [ds[0], ds.at(-1)] });
  for (const k of stepsOf(p).filter((x) => ACT_STEPS.includes(x))) out.push({ key: k, label: STEPS[k].name, plan: plan[k] || '', actual: f[k]?.date || '' });
  out.push({ key: 'mto', label: 'MTO 완료', plan: p.meta?.target || '', actual: p.status === 'done' ? p.doneAt || f.ebeam?.date || '' : '' });
  return out;
}

/** 예상 날짜를 안 넣은 Step의 기본 기간 (달력 일) */
export const STEP_DAYS = { stepx: 3, dwr: 2, dp: 5, ebeam: 2 };
const addD = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Revision Step 일정: [{ key, label, start, end, state: 'done'|'plan'|'auto'|'now', ... }] + mto
 *  Changes 준비(준비 날짜 기간) → 각 Step은 앞 Step이 끝난 날부터 완료일 · 예상일 · (없으면) 기본 기간까지 */
export function stepSchedule(p, changeDates = [], today) {
  const f = p.flow || {};
  const plan = p.flowPlan || {};
  const ds = changeDates.filter(Boolean).sort();
  const cur = currentStep(p, today).key;
  const rows = [];
  const prepEnd = ds.at(-1) || today;
  rows.push({ key: 'prep', label: 'Changes 준비', start: ds[0] || today, end: prepEnd, state: cur === 'prep' ? 'now' : 'done' });
  let prev = prepEnd;
  for (const k of stepsOf(p).filter((x) => ACT_STEPS.includes(x))) {
    const actual = f[k]?.date || '';
    const pl = plan[k] || '';
    let end = actual || pl || addD(prev > today || actual ? prev : today, STEP_DAYS[k]);
    if (end < prev) end = prev;
    const state = actual ? 'done' : k === cur ? 'now' : pl ? 'plan' : 'auto';
    rows.push({ key: k, label: STEPS[k].name, start: prev, end, state, plan: pl, actual, auto: !actual && !pl });
    prev = end;
  }
  const done = p.status === 'done';
  rows.push({ key: 'mto', label: 'MTO 완료', start: prev, end: done ? p.doneAt || prev : prev, state: done ? 'done' : 'plan', target: p.meta?.target || '', milestone: true });
  return rows;
}
