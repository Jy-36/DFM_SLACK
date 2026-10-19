// Revision 진행 Step: 단계 표시줄 + 지금 Step 처리(날짜 · 코멘트) + 끝낸 Step 기록(날짜 · 코멘트 수정) + 한 단계 뒤로
import { useEffect, useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort, todayIso } from '../lib/dates.js';
import { ACT_STEPS, STEPS, completeStep, currentStep, stepBack, stepSchedule } from '../lib/flow.js';
import { pendingKinds } from './RevisionChanges.jsx';
import DateField from './DateField.jsx';

export function StepChip({ project, today = todayIso() }) {
  const cur = currentStep(project, today);
  return <span className={`flow-chip ${cur.key}`} title={STEPS[cur.key].name}>{cur.text}</span>;
}

export default function RevisionFlow({ project, dispatch, notify, compact }) {
  const today = todayIso();
  const cur = currentStep(project, today);
  const f = project.flow || {};
  const plan = project.flowPlan || {};
  // 계획 날짜를 안 넣은 Step은 기본 기간으로 잡은 날짜를 흐리게 보여 준다
  const sched = Object.fromEntries(stepSchedule(project, [], today).filter((r) => !r.ms).map((r) => [r.key, r.plan.end]));
  const [date, setDate] = useState(today);
  const [comment, setComment] = useState('');
  useEffect(() => { setDate(today); setComment(''); }, [cur.key, project.id, today]);
  const upd = (patch) => dispatch({ type: 'updateProject', id: project.id, patch });
  const done = (k) => (k === 'prep' ? cur.key !== 'prep' : k === 'mto' ? project.status === 'done' : !!f[k]?.date);
  const finish = () => {
    upd(completeStep(project, cur.key, date || today, comment.trim()));
    notify?.(`${STEPS[cur.key].done} · ${fmtShort(date || today)}${cur.key === 'ebeam' ? ' → MTO 완료' : ''}`);
  };
  const back = () => {
    const r = stepBack(project);
    if (!r) return;
    const prev = { flow: project.flow, status: project.status, doneAt: project.doneAt };
    upd(r.patch);
    notify?.(`${STEPS[r.key].name}을 되돌렸어요`, { label: '취소', run: () => upd(prev) });
  };
  const editRec = (k, patch) => {
    const flow = { ...f, [k]: { ...f[k], ...patch } };
    upd(k === 'ebeam' && patch.date ? { flow, doneAt: patch.date } : { flow });
  };
  const records = cur.steps.filter((k) => ACT_STEPS.includes(k) && f[k]?.date);
  const pend = pendingKinds(project.changes, today);

  return (
    <section className={`panel flow ${compact ? 'compact' : ''}`}>
      <div className="chg-title">
        <h2>Step <span className={`flow-chip ${cur.key}`}>{cur.text}</span></h2>
        {records.length > 0 && <button type="button" className="btn small-btn ghost" onClick={back} title="마지막으로 끝낸 Step을 되돌리기"><Icon name="left" size={13} /> 이전 Step으로</button>}
      </div>
      <ol className="flow-bar">
        {cur.steps.map((k, i) => {
          const st = done(k) && (k !== cur.key || k === 'mto') ? 'done' : k === cur.key ? 'now' : 'todo';
          const d = k === 'mto' ? project.doneAt : f[k]?.date;
          return (
            <li key={k} className={`flow-step ${st} ${k}`}>
              <span className="flow-dot">{st === 'done' ? <Icon name="check" size={11} /> : i + 1}</span>
              <span className="flow-name">{STEPS[k].name}</span>
              {d && st !== 'todo' && <span className={`flow-date num act ${plan[k] && d > plan[k] ? 'late' : ''}`}>실적 {fmtShort(d)}</span>}
              {d && st !== 'todo' && plan[k] && <span className="flow-date num">계획 {fmtShort(plan[k])}</span>}
              {ACT_STEPS.includes(k) && st !== 'done' && (
                <span className="flow-plan" title="계획 날짜">
                  <DateField small value={plan[k]} onChange={(v) => upd({ flowPlan: { ...plan, [k]: v } })} label={`${STEPS[k].name} 계획 날짜`} placeholder={sched[k] ? `계획 ≈ ${fmtShort(sched[k])}` : '계획'} />
                </span>
              )}
              {k === 'mto' && st !== 'done' && project.meta?.target && <span className="flow-date num">Target {fmtShort(project.meta.target)}</span>}
            </li>
          );
        })}
      </ol>

      {cur.key === 'prep' && (
        <div className="flow-act prep">
          <span className="small"><b>{pend.map(([, l]) => l).join(' · ')}</b> 준비중 · Changes 줄마다 [준비 완료]를 누르면 다음 Step</span>
        </div>
      )}
      {ACT_STEPS.includes(cur.key) && (
        <div className={`flow-act ${cur.key}`}>
          <b className="flow-act-t">{STEPS[cur.key].name}</b>
          <DateField value={date} onChange={(v) => setDate(v || today)} label={`${STEPS[cur.key].name} 날짜`} />
          <input className="input" value={comment} placeholder="코멘트" onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && finish()} aria-label="코멘트" />
          <button type="button" className="btn small-btn primary" onClick={finish}><Icon name="check" size={13} /> {STEPS[cur.key].act}</button>
        </div>
      )}
      {cur.key === 'mto' && (
        <div className="flow-act mto">
          <b className="flow-act-t">MTO 완료</b>
          <DateField value={project.doneAt || f.ebeam?.date} onChange={(v) => v && editRec('ebeam', { date: v })} label="MTO 완료 날짜" />
        </div>
      )}

      {records.length > 0 && !compact && (
        <div className="flow-log">
          {records.map((k) => (
            <div key={k} className="flow-rec">
              <span className={`flow-rec-k ${k}`}>{STEPS[k].done}</span>
              <DateField small value={f[k].date} onChange={(v) => v && editRec(k, { date: v })} label={`${STEPS[k].name} 날짜`} />
              <input className="input ghost-in" defaultValue={f[k].comment || ''} placeholder="코멘트" onBlur={(e) => e.target.value !== (f[k].comment || '') && editRec(k, { comment: e.target.value })} aria-label={`${STEPS[k].name} 코멘트`} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
