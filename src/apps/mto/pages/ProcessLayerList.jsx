// 공정 기준 Layer List: 기준 공정의 Part → Module → Layer 트리에서 골라 담고, No(=STEP2 투입·MTO 순서)만 정한다.
// Layer 이름·Part·Type은 공정 시트를 따라가므로 여기서는 바꾸지 않는다.
import { useMemo, useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { fmtShort } from '../lib/dates.js';
import { feolOptionOf, feolRowsOf, processTree, resolveLayers, setRowsOf } from '../lib/process.js';
import ProjectBar from '../components/ProjectBar.jsx';

export default function ProcessLayerList({ state, dispatch, project, calc, calcs, go, notify }) {
  const proc = state.processes.find((x) => x.id === project.processId);
  const rev = project.kind === 'revision';
  // Product는 FEOL 전체 + 고른 BEOL Option만 보여 준다
  // Product는 고른 FEOL Option의 Layer + 고른 BEOL Option만 보여 준다
  const tree = useMemo(() => {
    if (rev) return processTree(proc);
    const feolIds = new Set(feolRowsOf(proc, project.feolOption).map((r) => r.id));
    return processTree(proc).map((p) =>
      p.name === 'BEOL' ? { ...p, modules: p.modules.filter((m) => m.name === project.beolOption) }
        : p.name === 'FEOL' ? { ...p, modules: p.modules.map((m) => ({ ...m, rows: m.rows.filter((r) => feolIds.has(r.id)) })).filter((m) => m.rows.length) } : p,
    );
  }, [proc, rev, project.beolOption, project.feolOption]);
  const picked = new Set(project.layers.map((l) => l.ref));
  const resolved = useMemo(() => resolveLayers(project.layers, proc), [project.layers, proc]);
  const mtoOf = useMemo(() => new Map((calc.result?.layers || []).map((l) => [l.no, l])), [calc.result]);
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState({}); // 접은 Part
  const firstPicked = proc.rows.find((r) => picked.has(r.id));
  const [startId, setStartId] = useState(() => firstPicked?.id || proc.rows[0]?.id || '');

  const set = (layers, undoMsg) => {
    dispatch({ type: 'layers', layers, keepUndo: !!undoMsg });
    if (undoMsg) notify(undoMsg, { label: '되돌리기', run: () => dispatch({ type: 'undoLayers' }) });
  };
  const nextNo = () => (project.layers.length ? Math.max(...project.layers.map((l) => (Number.isFinite(l.no) ? l.no : 0))) + 1 : 1);
  const order = new Map(proc.rows.map((r, i) => [r.id, i]));
  const toggleRows = (rows, on) => {
    if (on) {
      const add = rows.filter((r) => !picked.has(r.id));
      const base = nextNo();
      set([...project.layers, ...add.map((r, i) => ({ no: base + i, ref: r.id }))]);
    } else {
      const ids = new Set(rows.map((r) => r.id));
      set(project.layers.filter((l) => !ids.has(l.ref)));
    }
  };
  const allIn = (rows) => rows.length > 0 && rows.every((r) => picked.has(r.id));
  const someIn = (rows) => rows.some((r) => picked.has(r.id));
  const renumberByProcess = () => {
    const sorted = [...project.layers].sort((a, b) => (order.get(a.ref) ?? 1e9) - (order.get(b.ref) ?? 1e9));
    set(sorted.map((l, i) => ({ ...l, no: i + 1 })), '공정 시트 순서로 No를 다시 매겼어요');
  };
  const renumberCurrent = () => set([...project.layers].sort((a, b) => a.no - b.no).map((l, i) => ({ ...l, no: i + 1 })), 'No를 1부터 다시 매겼어요');
  const move = (i, d) => {
    const sorted = [...project.layers].sort((a, b) => a.no - b.no);
    const j = i + d;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    set(project.layers.map((l) => (l === a ? { ...l, no: b.no } : l === b ? { ...l, no: a.no } : l)));
  };
  const rowsSorted = [...resolved].sort((a, b) => a.no - b.no);
  const all = rev ? proc.rows : setRowsOf(proc, project.beolOption, project.feolOption);
  const counts = {};
  for (const l of resolved) if (!l.missing) counts[l.part] = (counts[l.part] || 0) + 1;

  const Check = ({ rows, label, cls }) => {
    const on = allIn(rows);
    const some = !on && someIn(rows);
    return (
      <label className={`pick ${cls || ''}`}>
        <input type="checkbox" checked={on} ref={(el) => el && (el.indeterminate = some)} onChange={() => toggleRows(rows, !on)} disabled={!rows.length} />
        {label}
      </label>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{project.name} · Set List</h1>
          <p>
            기준 공정 <b>{proc.name}</b>의 Set List. Product는 보통 전체가 나가고, 중간부터 나가면 시작 Layer를 고르세요. No 순서대로 STEP2에 투입하고 같은 순서로 MTO합니다.
            {rev ? ' Revision은 Part 구분 없이 한 묶음으로 계산해요.' : ' Part의 GDS 간격·STEP1 TAT는 공정 설정을 따라요.'}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className={`btn ${open ? 'primary' : ''}`} onClick={() => setOpen((v) => !v)}><Icon name="layers" size={15} /> 공정에서 고르기</button>
          <button type="button" className="btn" onClick={() => go('process')}>공정 시트 열기</button>
        </div>
      </div>

      <ProjectBar state={state} dispatch={dispatch} calcs={calcs} notify={notify} />

      {!rev && all.length > 0 && (
        <section className="panel start-bar">
          <span className="small"><b>Set 범위</b></span>
          <button type="button" className={`btn small-btn ${picked.size === all.length ? 'primary' : ''}`} onClick={() => set(all.map((r, i) => ({ no: i + 1, ref: r.id })), '전체 Set List를 담았어요')}>전체 Set</button>
          <span className="small muted">중간부터:</span>
          <select className="input start-sel" value={startId} onChange={(e) => setStartId(e.target.value)} aria-label="시작 Layer">
            {all.map((r, i) => <option key={r.id} value={r.id}>{i + 1}. {r.part} › {r.module || '-'} › {r.layer}</option>)}
          </select>
          <button type="button" className="btn small-btn" onClick={() => {
            const i = all.findIndex((r) => r.id === startId);
            set(all.slice(i).map((r, k) => ({ no: k + 1, ref: r.id })), `${all[i].layer}부터 ${all.length - i}장을 담았어요`);
          }}>이 Layer부터 끝까지</button>
          <span className="small muted">지금 {picked.size}/{all.length}장{firstPicked ? ` · 첫 Layer ${firstPicked.layer}` : ''}</span>
        </section>
      )}

      {open && (
        <section className="panel picker">
          <h2>
            <span className="layer-sum">{proc.name} <Pill tone="accent">{picked.size} / {all.length}장 선택</Pill></span>
            <span className="head-actions">
              <Check rows={all} label="전체" />
              <button type="button" className="btn small-btn" onClick={() => setOpen(false)}>닫기</button>
            </span>
          </h2>
          <div className="pick-grid">
            {tree.map((p) => {
              const prow = p.modules.flatMap((m) => m.rows);
              return (
                <div key={p.name} className="pick-part">
                  <div className="pick-part-h">
                    <button type="button" className="fold-btn" aria-expanded={!closed[p.name]} onClick={() => setClosed((c) => ({ ...c, [p.name]: !c[p.name] }))}><Icon name="chevron" size={14} /></button>
                    <Check rows={prow} label={<b>{/^[A-Z0-9]{1,2}$/.test(p.name) ? `Part ${p.name}` : p.name}</b>} />
                    {!rev && !p.orphan && <span className="small muted">GDS +{p.gdsOffset}일 · STEP1 {p.step1Tat}일{p.name === 'BEOL' ? ` · Option ${project.beolOption || '-'}` : p.name === 'FEOL' ? ` · Option ${feolOptionOf(proc, project.feolOption).name}` : ''}</span>}
                    <span className="num small muted pick-n">{prow.filter((r) => picked.has(r.id)).length}/{prow.length}</span>
                  </div>
                  {!closed[p.name] && p.modules.map((m) => (
                    <div key={m.name} className="pick-mod">
                      <Check rows={m.rows} label={<span className="mod-name">{m.name || '(Module 없음)'}</span>} cls="mod" />
                      <div className="pick-layers">
                        {m.rows.map((r) => (
                          <label key={r.id} className={`pick-layer ${picked.has(r.id) ? 'on' : ''}`} title={Object.entries(r.spec || {}).map(([k, v]) => `${k}: ${v}`).join('\n') || undefined}>
                            <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggleRows([r], !picked.has(r.id))} />
                            {r.layer || '(이름 없음)'}
                            <span className={`type-chip t-${r.type}`}>{r.type}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {!all.length && <p className="empty">공정 시트에 Layer가 없어요. [공정 시트 열기]에서 먼저 넣어 주세요.</p>}
          </div>
        </section>
      )}

      {calc.issues && calc.issues.some((i) => i.field !== 'gds') && (
        <div className="banner warn-banner" role="alert"><span><b>입력 확인</b> · {calc.issues.filter((i) => i.field !== 'gds').slice(0, 3).map((i) => i.msg).join(' / ')}</span></div>
      )}

      <section className="panel">
        <h2>
          <span className="layer-sum">
            담은 Layer {project.layers.length}장
            {!rev && Object.entries(counts).map(([p, n]) => <Pill key={p} tone="accent">{/^[A-Z0-9]{1,2}$/.test(p) ? `Part ${p}` : p} {n}</Pill>)}
          </span>
          <span className="head-actions">
            <button type="button" className="btn small-btn" onClick={renumberByProcess} disabled={!project.layers.length}>공정 순서로 No 매기기</button>
            <button type="button" className="btn small-btn" onClick={renumberCurrent} disabled={!project.layers.length}>No 다시 매기기</button>
            <button type="button" className="btn small-btn ghost danger" onClick={() => set([], '목록을 비웠어요')} disabled={!project.layers.length}><Icon name="trash" size={14} /> 비우기</button>
          </span>
        </h2>
        {project.layers.length ? (
          <div className="table-wrap">
            <table className="data-table layer-edit">
              <thead>
                <tr>
                  <th style={{ width: 84 }}>No</th>
                  {!rev && <th>Part</th>}
                  <th>Module / Option</th>
                  <th>Layer</th>
                  <th>Type</th>
                  <th className="r">STEP2 TAT</th>
                  <th>STEP2 시작</th>
                  <th>MTO</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {rowsSorted.map((l, i) => {
                  const r = mtoOf.get(l.no);
                  const dup = rowsSorted.filter((x) => x.no === l.no).length > 1;
                  return (
                    <tr key={l.ref || i} className={l.missing ? 'missing' : ''}>
                      <td><input className={`input num cell ${dup || !Number.isFinite(l.no) ? 'bad' : ''}`} type="number" value={Number.isFinite(l.no) ? l.no : ''}
                        onChange={(e) => set(project.layers.map((x) => (x.ref === l.ref ? { ...x, no: parseInt(e.target.value, 10) } : x)))} aria-label="No" /></td>
                      {!rev && <td>{l.part}</td>}
                      <td className="muted">{l.module || '-'}</td>
                      <td><b>{l.missing ? '(공정에서 지워짐)' : l.layer}</b></td>
                      <td>{l.type && <span className={`type-chip t-${l.type}`}>{l.type}</span>}</td>
                      <td className="num r">{calc.config.step2Tat[l.type] ? `${calc.config.step2Tat[l.type]}일` : '-'}</td>
                      <td className="num">{r ? <>{fmtShort(r.step2Start)}{r.step2WaitDays > 0 && <span className="tone-warn small"> +{r.step2WaitDays}</span>}</> : '-'}</td>
                      <td className="num">{r ? <>{fmtShort(r.mtoDate)}{r.mtoWaitDays > 0 && <span className="tone-warn small"> +{r.mtoWaitDays}</span>}</> : '-'}</td>
                      <td><div className="row-act">
                        <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} title="위로 (No 바꾸기)" aria-label="위로"><Icon name="chevron" size={14} /></button>
                        <button type="button" className="icon-btn sm down" onClick={() => move(i, 1)} disabled={i === rowsSorted.length - 1} title="아래로 (No 바꾸기)" aria-label="아래로"><Icon name="chevron" size={14} /></button>
                        <button type="button" className="icon-btn sm" onClick={() => set(project.layers.filter((x) => x.ref !== l.ref))} title="빼기" aria-label="빼기"><Icon name="close" size={14} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">아직 담은 Layer가 없어요. 위 [공정에서 고르기]에서 Part · Module · Layer를 체크하세요.</p>
        )}
      </section>
    </div>
  );
}
