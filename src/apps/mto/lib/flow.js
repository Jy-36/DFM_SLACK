// Revision ITEM 진행 Step: Changes 준비 → (Step X) → DWR 작성 → DP → EBEAM Review → MTO 완료
// 완료한 Step은 project.flow[key] = { date, comment } 로 남고, EBEAM Review를 끝내면 그 날짜에 MTO 완료.
import { CHANGE_KINDS, effDate, kindLatest, pendingKinds, prepText, rowsOf } from '../components/RevisionChanges.jsx';

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
  // Step X는 Changes(DB)의 최종 전달로 들어가서 따로 Step을 두지 않는다
  void p;
  return ['prep', 'dwr', 'dp', 'ebeam', 'mto'];
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

/** Revision 계획 · 실적 일정 줄
 *  - Changes 항목(DB · Step X · Runset · SPEC): 계획일 ◇ · 실적일 ◆ (전달일만 있는 항목)
 *  - DWR · DP · EBEAM Review: 앞 단계가 끝난 날부터 계획 막대 · 실적 막대 (계획이 없으면 기본 기간)
 *  - MTO 완료: 계획(EBEAM 계획 끝) ◇ · 실적 ◆, Target 세로선 */
export function stepSchedule(p, _changeDates, today) {
  const c = p.changes || {};
  const f = p.flow || {};
  const plan = p.flowPlan || {};
  const cur = currentStep(p, today).key;
  const rows = [];
  for (const [k, label] of CHANGE_KINDS) {
    if (!c[k]?.on) continue;
    if (k === 'db') {
      const rs = rowsOf(c, 'db');
      const groups = rs.filter((r) => !r.stepx);
      if (groups.length) rows.push({ key: 'db', label: 'DB', ms: true, plan: latest(groups.map((r) => r.date)), actual: groups.every((r) => r.actual) ? latest(groups.map((r) => r.actual)) : '', partial: groups.filter((r) => r.actual).length });
      const sx = rs.find((r) => r.stepx);
      if (sx) rows.push({ key: 'stepx', label: `Step X${sx.items.length ? ` (${sx.items.join('·')})` : ''}`, ms: true, plan: sx.date || '', actual: sx.actual || '' });
    } else {
      rows.push({ key: k, label, ms: true, plan: kindLatest(c, k, 'plan') || '', actual: kindLatest(c, k, 'actual') || '' });
    }
  }
  // GDS: 계획 = 계획 중 가장 늦은 날, 실적 = 모든 항목이 끝난 날
  const gdsPlan = latest(rows.map((r) => r.plan)) || today;
  const allDone = rows.length && rows.every((r) => r.actual);
  const gdsAct = allDone ? latest(rows.map((r) => r.actual)) : '';
  let pPrev = gdsPlan;
  let aPrev = gdsAct;
  for (const k of ['dwr', 'dp', 'ebeam']) {
    const pl = plan[k] || '';
    const pEnd = pl && pl >= pPrev ? pl : addD(pPrev, STEP_DAYS[k]);
    const act = f[k]?.date || '';
    rows.push({ key: k, label: STEPS[k].name, plan: { start: pPrev, end: pEnd, auto: !pl }, actual: act && aPrev ? { start: aPrev <= act ? aPrev : act, end: act } : act ? { start: act, end: act } : null, now: cur === k, nowFrom: !act && cur === k ? aPrev || today : null });
    pPrev = pEnd;
    aPrev = act || '';
  }
  const done = p.status === 'done';
  rows.push({ key: 'mto', label: 'MTO 완료', ms: true, plan: pPrev, actual: done ? p.doneAt || f.ebeam?.date || '' : '', target: p.meta?.target || '' });
  return rows;
}
const latest = (ds) => ds.filter(Boolean).sort().at(-1) || '';
void effDate;
