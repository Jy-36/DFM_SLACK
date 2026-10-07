// 분석 화면 조각: 최종 MTO 경로, 병목, 추천 일정, 리스크, 시나리오 비교
import { Pill, InfoTip } from '../../../shared/ui.jsx';
import { diffDays, fmtShort } from '../lib/dates.js';

/** 최종 MTO Layer가 어디서 시간을 썼는지: 가로 누적 막대 */
export function CriticalPath({ critical, result }) {
  const total = critical.steps.reduce((a, s) => a + s.days, 0) || 1;
  const l = critical.layer;
  return (
    <div className="crit">
      <div className="crit-head">
        <span className="label">최종 MTO 경로</span>
        <span className="small muted">
          <b className="crit-layer">{l.no}. {l.layer}</b> · Part {l.part} · Type {l.type} · MTO {fmtShort(l.mtoDate)} · Part A GDS부터 {result.leadTimeDays}일
        </span>
      </div>
      <div className="crit-bar" role="img" aria-label={critical.steps.map((s) => `${s.label} ${s.days}일`).join(', ')}>
        {critical.steps.map((s) => (
          <i key={s.key} className={`cp-${s.key}`} style={{ flexGrow: s.days }} title={`${s.label} ${s.days}일 · ${s.note}`}>
            {s.days / total > 0.07 && <span className="num">{s.days}</span>}
          </i>
        ))}
      </div>
      <div className="crit-legend">
        {critical.steps.map((s) => (
          <span key={s.key}>
            <i className={`cp-${s.key}`} />
            {s.label} <b className="num">{s.days}일</b>
            <span className="muted"> · {s.note}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Bottlenecks({ items }) {
  if (!items.length) return <p className="empty">대기 없이 진행됩니다.</p>;
  return (
    <ol className="bn-list">
      {items.map((b, i) => (
        <li key={b.key} className={i === 0 ? 'top' : ''}>
          <div className="bn-row">
            <strong>{b.title}</strong>
            <span className="bn-val num">누적 {b.value}</span>
          </div>
          <div className="bn-track"><i style={{ width: `${Math.max(3, b.share * 100)}%` }} /></div>
          <p className="small muted">{b.detail}</p>
        </li>
      ))}
    </ol>
  );
}

export function Recommendations({ recs, onApplyOrder, onApplyScenario }) {
  if (!recs.length) return <p className="empty">규칙 안에서 더 당길 수 있는 조합을 찾지 못했습니다.</p>;
  return (
    <ul className="rec-list">
      {recs.map((r) => (
        <li key={r.key}>
          <div className="rec-gain num">{r.gainDays > 0 ? `−${r.gainDays}일` : '대기↓'}</div>
          <div className="rec-body">
            <strong>{r.title}</strong>
            <span className="small muted">{r.detail}</span>
            {r.agreement && <span className="rec-note">규칙·운영 협의 필요</span>}
          </div>
          {r.key === 'reorder' && onApplyOrder && (
            <button type="button" className="btn small-btn" onClick={() => onApplyOrder(r.order)}>순서 적용</button>
          )}
          {r.key === 'scenario' && onApplyScenario && (
            <button type="button" className="btn small-btn" onClick={() => onApplyScenario(r)}>이 조건으로 보기</button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Risks({ risks }) {
  if (!risks.length) return <p className="empty">특별한 리스크가 없습니다.</p>;
  return (
    <ul className="risk-list">
      {risks.map((r) => (
        <li key={r.key}>
          <strong>{r.title}</strong>
          <span className="small muted">{r.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** 하루 MTO 2·3장 × STEP2 동시 4·5장. 행을 누르면 그 조건으로 바꾼다 */
export function Scenarios({ grid, result, onPick, compact = false }) {
  const cur = result.config;
  const best = grid.reduce((m, g) => (g.finalMto < m.finalMto ? g : m), grid[0]);
  if (compact) {
    return (
      <div className="scen-grid">
        <span />
        {[4, 5].map((c) => <span key={c} className="scen-h">STEP2 {c}</span>)}
        {[2, 3].map((m) => (
          <Row key={m} m={m} />
        ))}
      </div>
    );
  }
  function Row({ m }) {
    return (
      <>
        <span className="scen-h">MTO {m}</span>
        {[4, 5].map((c) => {
          const g = grid.find((x) => x.mtoPerDay === m && x.step2Concurrency === c);
          const isCur = cur.mtoPerDay === m && cur.step2Concurrency === c;
          return (
            <button key={c} type="button" className={`scen-cell ${isCur ? 'cur' : ''} ${g === best ? 'best' : ''}`} onClick={() => onPick?.(g)}>
              <b className="num">{fmtShort(g.finalMto)}</b>
              <span className="num">{g.leadTimeDays}일</span>
            </button>
          );
        })}
      </>
    );
  }
  return (
    <div className="table-wrap">
      <table className="data-table scen-table">
        <thead>
          <tr>
            <th>MTO/일</th>
            <th>STEP2 동시</th>
            <th>최종 MTO</th>
            <th className="r">리드타임</th>
            <th className="r">STEP2 대기 <InfoTip text="Layer별 STEP2 슬롯 대기 일수를 모두 더한 값" align="right" /></th>
            <th className="r">MTO 대기</th>
            <th className="r">현재 대비</th>
          </tr>
        </thead>
        <tbody>
          {grid.map((g) => {
            const isCur = cur.mtoPerDay === g.mtoPerDay && cur.step2Concurrency === g.step2Concurrency;
            const d = diffDays(g.finalMto, result.finalMto);
            return (
              <tr key={`${g.mtoPerDay}x${g.step2Concurrency}`} className={isCur ? 'cur' : ''} onClick={() => onPick?.(g)} title="눌러서 이 조건으로 보기">
                <td className="num">{g.mtoPerDay}장</td>
                <td className="num">{g.step2Concurrency}장</td>
                <td className={`num ${g === best ? 'tone-good strong' : ''}`}>{fmtShort(g.finalMto)}</td>
                <td className="num r">{g.leadTimeDays}일</td>
                <td className="num r">{g.step2WaitTotal}일</td>
                <td className="num r">{g.mtoWaitTotal}일</td>
                <td className="num r">{isCur ? <Pill tone="accent">현재</Pill> : d === 0 ? '같음' : <span className={d < 0 ? 'tone-good' : 'tone-bad'}>{d > 0 ? '+' : ''}{d}일</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
