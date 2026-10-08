// Module Option 비교: 한 Module 안에서 Module Option(예: Base / HD)마다 들어가는 Layer와 SPEC을 나란히 본다.
// 공통 Layer는 한 줄로 묶고, Option마다 갈리는 자리(변형)는 Layer · Type · SPEC을 칸마다 비교해 다른 값을 표시한다.
import { useState } from 'react';
import { chosenModOpt, feolOptionsOf, isBeol, moduleOptionsOf } from '../lib/process.js';

/** Module의 Layer를 시트 순서대로 '공통 묶음'과 '변형 자리'로 나눈다 */
export function compareSlots(proc, module) {
  const slots = [];
  for (const r of proc.rows) {
    if (isBeol(r) || r.module !== module) continue;
    const last = slots[slots.length - 1];
    if (!r.modOpt) {
      if (last?.kind === 'common') last.rows.push(r);
      else slots.push({ kind: 'common', rows: [r] });
    } else {
      if (last?.kind === 'variant') (last.by[r.modOpt] ||= []).push(r);
      else slots.push({ kind: 'variant', by: { [r.modOpt]: [r] } });
    }
  }
  return slots;
}

function ModuleCompare({ proc, module, step2Tat, onlyDiff, onPick }) {
  const all = moduleOptionsOf(proc, module);
  const [picked, setPicked] = useState(all);
  const opts = all.filter((o) => picked.includes(o));
  const slots = compareSlots(proc, module);
  const common = slots.filter((s) => s.kind === 'common').reduce((a, s) => a + s.rows.length, 0);
  const countOf = (o) => common + slots.filter((s) => s.kind === 'variant').reduce((a, s) => a + (s.by[o]?.length || 0), 0);
  const conceptsOf = (o) => feolOptionsOf(proc).filter((fo) => chosenModOpt(proc, fo, module) === o).map((fo) => fo.name);
  const attrs = [
    ['Layer', (r) => r.layer],
    ['Type', (r) => (r.type ? `${r.type}${step2Tat[r.type] ? ` · ${step2Tat[r.type]}일` : ''}` : '')],
    ...proc.columns.map((c) => [c, (r) => r.spec?.[c] ?? '']),
  ];
  const cell = (rows, f) => (rows?.length ? rows.map(f).map((v) => v || '-').join(' / ') : null);
  let vNo = 0;

  return (
    <div className="moc">
      <div className="moc-head">
        <b>{module}</b>
        <span className="small muted">비교할 Module Option</span>
        <span className="name-chips">
          {all.map((o) => (
            <button key={o} type="button" className={`nchip pick ${picked.includes(o) ? 'on' : ''}`} aria-pressed={picked.includes(o)} onClick={() => setPicked(picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o])}>{o}</button>
          ))}
        </span>
      </div>
      {opts.length < 2 ? (
        <div className="stack-empty small">Module Option을 2개 이상 고르면 나란히 비교해요.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table moc-table">
            <thead>
              <tr>
                <th className="moc-slot">자리</th>
                <th className="moc-attr">항목</th>
                {opts.map((o) => (
                  <th key={o}>
                    <button type="button" className="link-btn strong" onClick={() => onPick?.(module, o)} title="이 Module Option Layer만 시트에서 보기">{o}</button>
                    <div className="small muted moc-sub">{countOf(o)}장 · Concept {conceptsOf(o).join(', ') || '-'}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((s, si) => {
                if (s.kind === 'common') {
                  if (onlyDiff) return null;
                  return (
                    <tr key={si} className="moc-common">
                      <td className="small muted">공통</td>
                      <td className="small muted">{s.rows.length}장</td>
                      <td colSpan={opts.length}>
                        <span className="moc-layers">{s.rows.map((r) => <span key={r.id} className="stack-chip">{r.layer || '-'}</span>)}</span>
                      </td>
                    </tr>
                  );
                }
                vNo += 1;
                const rowsAttr = attrs
                  .map(([label, f]) => {
                    const vals = opts.map((o) => cell(s.by[o], f));
                    const diff = new Set(vals.map((v) => v ?? '∅')).size > 1;
                    return { label, vals, diff };
                  })
                  .filter((a, i) => i < 2 || !onlyDiff || a.diff);
                return rowsAttr.map((a, i) => (
                  <tr key={`${si}-${a.label}`} className={`moc-var ${i === 0 ? 'first' : ''}`}>
                    {i === 0 && <td rowSpan={rowsAttr.length} className="moc-slot-cell"><span className="opt-tag">변형 {vNo}</span></td>}
                    <td className="small muted">{a.label}</td>
                    {a.vals.map((v, k) => (
                      <td key={opts[k]} className={`${a.diff ? 'diff' : ''} ${v == null ? 'none' : ''} ${i === 0 ? 'strong' : ''}`}>{v ?? '없음'}</td>
                    ))}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** modules: 비교할 Module 목록 */
export default function ModOptCompare({ proc, modules, step2Tat, onPick }) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const list = modules.filter((m) => moduleOptionsOf(proc, m).length > 0);
  if (!list.length) {
    return <div className="stack-empty small">Module Option이 있는 Module이 없어요. 왼쪽 Module에서 [편집]으로 Module Option을 추가하고, 시트의 Module Option 칸에서 Layer마다 지정하세요.</div>;
  }
  return (
    <div className="moc-wrap">
      <div className="moc-tools small">
        <label className="check"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> 다른 값만 보기</label>
        <span className="muted">· <span className="diff-dot" /> 표시는 Option끼리 값이 다른 칸 · Option 이름을 누르면 그 Layer만 시트로</span>
      </div>
      {list.map((m) => <ModuleCompare key={m} proc={proc} module={m} step2Tat={step2Tat} onlyDiff={onlyDiff} onPick={onPick} />)}
    </div>
  );
}
