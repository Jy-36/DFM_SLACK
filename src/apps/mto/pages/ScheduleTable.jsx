// Layer별 일정표: 표 · 엑셀용 복사 · CSV 저장 · 날짜별 MTO 묶음
import { useMemo, useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { fmtShort } from '../lib/dates.js';
import { mtoByDate, toCsv, toTsv } from '../lib/report.js';
import { EmptyCard, IssueBanner } from './Overview.jsx';
import ProjectBar from '../components/ProjectBar.jsx';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function saveCsv(text, filename) {
  const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }); // 엑셀에서 한글이 깨지지 않게 BOM
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function ScheduleTable({ state, dispatch, project, calc, calcs, go, notify }) {
  const rev = project.kind === 'revision';
  const { result } = calc;
  const [part, setPart] = useState('all');
  const rows = useMemo(() => (result ? result.layers.filter((l) => rev || part === 'all' || l.part === part) : []), [result, part, rev]);
  const days = useMemo(() => (result ? mtoByDate(result) : []), [result]);
  const maxWait = result ? Math.max(0, ...result.layers.map((l) => l.mtoWaitDays)) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{project.name} · Layer별 일정표</h1>
          <p>STEP2 가능일 → 실제 시작(슬롯 대기) → MTO 가능일 → 실제 MTO(순차 대기)</p>
        </div>
        {result && (
          <div className="head-actions">
            <button type="button" className="btn" onClick={async () => notify((await copyText(toTsv(result))) ? '표를 복사했어요 · 엑셀에 붙여 넣으세요' : '복사하지 못했어요')}>
              <Icon name="copy" size={15} /> 엑셀용 복사
            </button>
            <button type="button" className="btn" onClick={() => saveCsv(toCsv(result), `mto_${project.name.replace(/[\\/:*?"<>|\s]+/g, '_')}_${result.partAGds}.csv`)}>
              <Icon name="download" size={15} /> CSV 저장
            </button>
          </div>
        )}
      </div>

      <ProjectBar state={state} dispatch={dispatch} calcs={calcs} notify={notify} showSettings={false} />

      {calc.empty && <EmptyCard project={project} dispatch={dispatch} notify={notify} go={go} />}
      {calc.issues && <IssueBanner issues={calc.issues} go={go} />}

      {result && (
        <>
          <section className="panel">
            <h2>
              날짜별 MTO
              <span className="small muted">{days.length}일 · 하루 최대 {result.config.mtoPerDay}장</span>
            </h2>
            <div className="mto-days">
              {days.map((d) => (
                <div key={d.date} className="mto-day">
                  <span className="num when">{fmtShort(d.date)}</span>
                  <span className="chips">{d.layers.map((l) => <Pill key={l.no} tone={l.part === 'BEOL' || l.part === 'B' ? 'leave' : 'accent'}>{l.layer}</Pill>)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>
              Layer {rows.length}장
              {!rev && <div className="seg" role="group" aria-label="Part 거르기">
                {[['all', '전체'], ['FEOL', 'FEOL'], ['BEOL', 'BEOL']].map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={part === k} onClick={() => setPart(k)}>{label}</button>
                ))}
              </div>}
            </h2>
            <div className="table-wrap">
              <table className="data-table sched">
                <thead>
                  <tr>
                    <th>No</th><th>Part</th><th>Layer</th><th>Type</th><th>STEP1</th>
                    <th>STEP2 가능</th><th>STEP2 시작</th><th className="r">S2 대기</th><th>STEP2 종료</th>
                    <th>MTO 가능</th><th>MTO 날짜</th><th className="r">MTO 대기</th><th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.no}>
                      <td className="num">{l.no}</td>
                      <td>{l.part === 'R' ? 'Rev' : l.part}</td>
                      <td><b>{l.layer}</b></td>
                      <td><span className={`type-chip t-${l.type}`}>{l.type}</span></td>
                      <td className="num">{fmtShort(l.step1Start)} ~ {fmtShort(l.step1End)}</td>
                      <td className="num">{fmtShort(l.step2Ready)}</td>
                      <td className="num">{fmtShort(l.step2Start)}</td>
                      <td className={`num r ${l.step2WaitDays ? 'tone-warn strong' : 'muted'}`}>{l.step2WaitDays ? `+${l.step2WaitDays}일` : '0'}</td>
                      <td className="num">{fmtShort(l.step2End)}</td>
                      <td className="num">{fmtShort(l.mtoEarliest)}</td>
                      <td className="num"><b>{fmtShort(l.mtoDate)}</b></td>
                      <td className={`num r ${l.mtoWaitDays ? (l.mtoWaitDays >= maxWait * 0.75 ? 'tone-bad strong' : 'tone-warn strong') : 'muted'}`}>{l.mtoWaitDays ? `+${l.mtoWaitDays}일` : '0'}</td>
                      <td className="note small muted">{l.notes.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
