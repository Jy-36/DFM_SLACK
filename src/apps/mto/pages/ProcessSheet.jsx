// 공정 · Layer SPEC: Process → Part → Module → Layer 분류와 Layer별 SPEC을 관리하는 시트.
// Product는 여기서 정한 공정을 고르고 Layer를 골라 담는다. Part의 GDS 간격·STEP1 TAT도 공정이 정한다.
import { useMemo, useState } from 'react';
import { Icon, InfoTip, Pill } from '../../../shared/ui.jsx';
import { checkProcess, parseProcessRows, processToTsv, processTree, uid } from '../lib/process.js';
import { copyText } from './ScheduleTable.jsx';

export default function ProcessSheet({ state, dispatch, go, notify }) {
  const { processes, config } = state;
  const [selId, setSelId] = useState(() => state.lastProcessId || processes[0]?.id);
  const proc = processes.find((p) => p.id === selId) || processes.find((p) => p.id === state.lastProcessId) || processes[0];
  const [filter, setFilter] = useState(null); // { part, module? }
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [newCol, setNewCol] = useState('');
  const types = Object.keys(config.step2Tat);

  const tree = useMemo(() => (proc ? processTree(proc) : []), [proc]);
  const issues = useMemo(() => (proc ? checkProcess(proc, types) : []), [proc, types.join()]);
  const bad = useMemo(() => new Set(issues.map((i) => `${i.id}:${i.field}`)), [issues]);
  const usedBy = useMemo(() => {
    const m = new Map();
    for (const p of state.projects) if (proc && p.processId === proc.id) for (const l of p.layers) if (l.ref) m.set(l.ref, [...(m.get(l.ref) || []), p.name]);
    return m;
  }, [state.projects, proc]);
  const products = proc ? state.projects.filter((p) => p.processId === proc.id) : [];

  const upd = (patch) => dispatch({ type: 'updateProcess', id: proc.id, patch });
  const setRows = (rows) => upd({ rows });
  const editRow = (id, patch) => setRows(proc.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const editSpec = (id, col, v) => setRows(proc.rows.map((r) => (r.id === id ? { ...r, spec: { ...(r.spec || {}), [col]: v } } : r)));
  const moveRow = (id, d) => {
    const i = proc.rows.findIndex((r) => r.id === id);
    const j = i + d;
    if (j < 0 || j >= proc.rows.length) return;
    const rows = [...proc.rows];
    [rows[i], rows[j]] = [rows[j], rows[i]];
    setRows(rows);
  };
  const delRow = (id) => {
    const n = usedBy.get(id)?.length || 0;
    const prev = proc.rows;
    setRows(proc.rows.filter((r) => r.id !== id));
    notify(n ? `Layer를 지웠어요 · 이 Layer를 쓰던 Product ${n}개에서 확인 필요` : 'Layer를 지웠어요', { label: '되돌리기', run: () => upd({ rows: prev }) });
  };
  const addRow = () => {
    const last = filter ? [...proc.rows].reverse().find((r) => r.part === filter.part && (!filter.module || r.module === filter.module)) : proc.rows[proc.rows.length - 1];
    const row = { id: uid('ly'), part: filter?.part || last?.part || proc.parts[0]?.name || '', module: filter?.module ?? last?.module ?? '', layer: '', type: last?.type || types[0], spec: {} };
    // 같은 Part·Module 마지막 줄 뒤에 넣는다
    const i = last ? proc.rows.indexOf(last) + 1 : proc.rows.length;
    setRows([...proc.rows.slice(0, i), row, ...proc.rows.slice(i)]);
  };

  // Part
  const editPart = (i, patch) => {
    const old = proc.parts[i];
    const parts = proc.parts.map((p, k) => (k === i ? { ...p, ...patch } : p));
    const rows = patch.name != null && patch.name !== old.name ? proc.rows.map((r) => (r.part === old.name ? { ...r, part: patch.name } : r)) : proc.rows;
    upd({ parts, rows });
  };
  const addPart = () => {
    const names = new Set(proc.parts.map((p) => p.name));
    let n = 'C';
    for (const c of 'CDEFGHIJ') if (!names.has(c)) { n = c; break; }
    const last = proc.parts[proc.parts.length - 1];
    upd({ parts: [...proc.parts, { name: n, gdsOffset: (last?.gdsOffset || 0) + 14, step1Tat: 3 }] });
  };

  // SPEC 열
  const addCol = () => {
    const c = newCol.trim();
    if (!c || proc.columns.includes(c) || ['Part', 'Module', 'Layer', 'Type'].includes(c)) return;
    upd({ columns: [...proc.columns, c] });
    setNewCol('');
  };
  const renameCol = (old, name) => {
    if (!name || proc.columns.includes(name)) return;
    upd({
      columns: proc.columns.map((c) => (c === old ? name : c)),
      rows: proc.rows.map((r) => {
        if (!r.spec || !(old in r.spec)) return r;
        const { [old]: v, ...rest } = r.spec;
        return { ...r, spec: { ...rest, [name]: v } };
      }),
    });
  };
  const delCol = (c) => {
    const prev = { columns: proc.columns, rows: proc.rows };
    upd({ columns: proc.columns.filter((x) => x !== c) });
    notify(`SPEC 열 '${c}'을 숨겼어요`, { label: '되돌리기', run: () => upd(prev) });
  };

  const applyPaste = (mode) => {
    const { rows, newColumns } = parseProcessRows(text, proc.columns);
    if (!rows.length) return notify('붙여넣은 내용에서 Layer를 찾지 못했어요 (Part · Module · Layer · Type 열 필요)');
    const prev = { rows: proc.rows, columns: proc.columns, parts: proc.parts };
    const partNames = new Set(proc.parts.map((p) => p.name));
    const extraParts = [...new Set(rows.map((r) => r.part).filter((p) => p && !partNames.has(p)))].map((name) => ({ name, gdsOffset: 0, step1Tat: 3 }));
    upd({ rows: mode === 'append' ? [...proc.rows, ...rows] : rows, columns: [...proc.columns, ...newColumns], parts: [...proc.parts, ...extraParts] });
    notify(`${rows.length}개 Layer를 ${mode === 'append' ? '추가' : '바꿔 넣'}었어요${extraParts.length ? ` · 새 Part ${extraParts.map((p) => p.name).join(', ')}` : ''}`, { label: '되돌리기', run: () => upd(prev) });
    setPaste(false);
    setText('');
  };

  if (!proc) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>공정 · Layer SPEC</h1><p>Process → Part → Module → Layer로 Layer를 분류하고 SPEC을 관리합니다.</p></div></div>
        <section className="panel mto-empty">
          <h2>공정이 없어요</h2>
          <div className="head-actions">
            <button type="button" className="btn primary" onClick={() => dispatch({ type: 'addProcess' })}><Icon name="plus" size={15} /> 새 공정</button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'addProcess', example: true })}>예시 공정</button>
          </div>
        </section>
      </div>
    );
  }

  const ql = q.trim().toLowerCase();
  const shown = proc.rows.filter((r) => (!filter || (r.part === filter.part && (filter.module == null || r.module === filter.module))) && (!ql || [r.layer, r.module, r.part, r.type, ...Object.values(r.spec || {})].some((v) => String(v).toLowerCase().includes(ql))));
  const modules = [...new Set(proc.rows.map((r) => r.module).filter(Boolean))];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>공정 · Layer SPEC</h1>
          <p>Process → Part → Module → Layer. Product는 공정을 고르고 여기 있는 Layer를 담습니다. Layer 이름·Part·Type을 바꾸면 그 공정을 쓰는 Product에 바로 반영돼요.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={() => { dispatch({ type: 'addProcess' }); setSelId(null); }}><Icon name="plus" size={15} /> 새 공정</button>
        </div>
      </div>

      <section className="panel project-bar">
        <div className="pb-row" role="tablist" aria-label="공정">
          {processes.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === proc.id} className="pb-chip" onClick={() => { setSelId(p.id); setFilter(null); }}>
              <span className="kind-tag process">공정</span>
              <span className="pb-name">{p.name}</span>
              <span className="pb-st num">{p.rows.length}장</span>
            </button>
          ))}
        </div>
        <div className="pb-settings">
          <label className="field pb-title"><span>공정 이름</span><input className="input" value={proc.name} onChange={(e) => upd({ name: e.target.value })} /></label>
          <label className="field pr-desc"><span>설명</span><input className="input" value={proc.desc || ''} placeholder="예: 3nm GAA, BEOL 13층" onChange={(e) => upd({ desc: e.target.value })} /></label>
          <span className="pb-tools">
            <button type="button" className="btn small-btn" onClick={() => { dispatch({ type: 'duplicateProcess', id: proc.id }); setSelId(null); }}><Icon name="copy" size={14} /> 복제</button>
            <button type="button" className="btn small-btn ghost danger" onClick={() => {
              dispatch({ type: 'removeProcess', id: proc.id });
              setSelId(null);
              notify(`공정 '${proc.name}'을 지웠어요${products.length ? ` · 쓰던 Product ${products.length}개 확인 필요` : ''}`, { label: '되돌리기', run: () => dispatch({ type: 'restoreProcess' }) });
            }}><Icon name="trash" size={14} /> 삭제</button>
          </span>
        </div>
      </section>

      <div className="pr-grid">
        <section className="panel pr-tree">
          <h2>분류 <span className="small muted">눌러서 시트 거르기</span></h2>
          <button type="button" className={`tree-item root ${!filter ? 'on' : ''}`} onClick={() => setFilter(null)}>
            <span>{proc.name}</span><span className="num muted">{proc.rows.length}</span>
          </button>
          {tree.map((p) => (
            <div key={p.name} className="tree-part">
              <button type="button" className={`tree-item part ${filter?.part === p.name && filter.module == null ? 'on' : ''} ${p.orphan ? 'orphan' : ''}`} onClick={() => setFilter({ part: p.name })}>
                <span><b>{/^[A-Z0-9]{1,2}$/.test(p.name) ? `Part ${p.name}` : p.name}</b></span>
                <span className="num muted">{p.modules.reduce((a, m) => a + m.rows.length, 0)}</span>
              </button>
              {p.modules.map((m) => (
                <button key={m.name} type="button" className={`tree-item module ${filter?.part === p.name && filter.module === m.name ? 'on' : ''}`} onClick={() => setFilter({ part: p.name, module: m.name })}>
                  <span>{m.name || <i className="muted">(Module 없음)</i>}</span><span className="num muted">{m.rows.length}</span>
                </button>
              ))}
            </div>
          ))}
        </section>

        <section className="panel">
          <h2>
            Part <span className="small muted">Product 일정 계산에 쓰는 값 · 순서 = 일정표 순서</span>
            <button type="button" className="btn small-btn" onClick={addPart}><Icon name="plus" size={14} /> Part</button>
          </h2>
          <div className="table-wrap">
            <table className="data-table part-table">
              <thead><tr><th>Part</th><th>GDS 입고 <InfoTip text="첫 Part GDS 입고일로부터 며칠 뒤에 이 Part GDS가 들어오는지 (Part A 0일, Part B 14일 = 2주)" /></th><th>STEP1 TAT</th><th className="r">Layer</th><th /></tr></thead>
              <tbody>
                {proc.parts.map((p, i) => {
                  const n = proc.rows.filter((r) => r.part === p.name).length;
                  return (
                    <tr key={i}>
                      <td><input key={p.name} className="input cell" defaultValue={p.name} onBlur={(e) => { const v = e.target.value.trim().toUpperCase(); if (v && v !== p.name && !proc.parts.some((x) => x.name === v)) editPart(i, { name: v }); else e.target.value = p.name; }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Part 이름" /></td>
                      <td><div className="num-field"><input className="input num cell" type="number" min={0} max={365} value={p.gdsOffset} onChange={(e) => editPart(i, { gdsOffset: Math.max(0, parseInt(e.target.value, 10) || 0) })} /><span className="muted small">일 뒤</span></div></td>
                      <td><div className="num-field"><input className="input num cell" type="number" min={1} max={60} value={p.step1Tat} onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1 && v <= 60) editPart(i, { step1Tat: v }); }} /><span className="muted small">일</span></div></td>
                      <td className="num r">{n}</td>
                      <td><div className="row-act">
                        <button type="button" className="icon-btn sm" disabled={i === 0} onClick={() => { const parts = [...proc.parts]; [parts[i - 1], parts[i]] = [parts[i], parts[i - 1]]; upd({ parts }); }} aria-label="위로"><Icon name="chevron" size={14} /></button>
                        <button type="button" className="icon-btn sm" disabled={n > 0 || proc.parts.length <= 1} title={n ? 'Layer가 있는 Part는 지울 수 없어요' : 'Part 지우기'} onClick={() => upd({ parts: proc.parts.filter((_, k) => k !== i) })} aria-label="Part 지우기"><Icon name="close" size={14} /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pr-used small muted">
            이 공정을 쓰는 Product · Revision: {products.length ? products.map((p) => <button key={p.id} type="button" className="link-btn" onClick={() => go('layers', p.id)}>{p.name}</button>) : '없음'}
          </div>
        </section>
      </div>

      {paste && (
        <section className="panel paste-panel">
          <h2>엑셀에서 복사해 붙여넣기 <span className="small muted">머리줄(Part · Module · Layer · Type · SPEC 열 이름)이 있으면 열 순서가 달라도 되고, 모르는 열은 SPEC 열로 추가돼요</span></h2>
          <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder={`Part\tModule\tLayer\tType\t${proc.columns.join('\t')}\nA\tFEOL\tA-1\tX\t…`} />
          <div className="head-actions end">
            <span className="small muted">{text.trim() ? `${parseProcessRows(text, proc.columns).rows.length}개 인식` : ''}</span>
            <button type="button" className="btn ghost" onClick={() => setPaste(false)}>취소</button>
            <button type="button" className="btn" onClick={() => applyPaste('append')}>뒤에 추가</button>
            <button type="button" className="btn primary" onClick={() => applyPaste('replace')}>시트 바꾸기</button>
          </div>
        </section>
      )}

      {issues.length > 0 && (
        <div className="banner warn-banner" role="alert"><span><b>시트 확인 {issues.length}건</b> · {issues.slice(0, 3).map((i) => i.msg).join(' / ')}{issues.length > 3 && ' …'}</span></div>
      )}

      <section className="panel">
        <h2>
          <span className="layer-sum">
            Layer SPEC Sheet
            <Pill tone="accent">{filter ? `${filter.part}${filter.module != null ? ` › ${filter.module || '(없음)'}` : ''} · ${shown.length}장` : `${proc.rows.length}장`}</Pill>
          </span>
          <span className="head-actions">
            <input className="input sheet-search" placeholder="찾기 (Layer · SPEC)" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className={`btn small-btn ${paste ? 'primary' : ''}`} onClick={() => setPaste((v) => !v)}><Icon name="copy" size={14} /> 엑셀 붙여넣기</button>
            <button type="button" className="btn small-btn" onClick={async () => notify((await copyText(processToTsv(proc))) ? '시트를 복사했어요 · 엑셀에 붙여 넣으세요' : '복사하지 못했어요')}>엑셀용 복사</button>
          </span>
        </h2>
        <div className="table-wrap sheet-wrap">
          <table className="data-table sheet">
            <thead>
              <tr>
                <th className="r">#</th>
                <th>Part</th>
                <th>Module</th>
                <th>Layer</th>
                <th>Type</th>
                <th className="r">STEP2</th>
                {proc.columns.map((c) => (
                  <th key={c} className="spec-h">
                    <span className="spec-h-in">
                      <input className="col-name" defaultValue={c} onBlur={(e) => e.target.value.trim() !== c && renameCol(c, e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label={`SPEC 열 ${c} 이름`} />
                      <button type="button" className="col-del" onClick={() => delCol(c)} title="열 지우기" aria-label={`${c} 열 지우기`}><Icon name="close" size={11} /></button>
                    </span>
                  </th>
                ))}
                <th className="spec-add">
                  <span className="spec-h-in">
                    <input className="col-name" value={newCol} placeholder="+ SPEC 열" onChange={(e) => setNewCol(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCol()} aria-label="새 SPEC 열 이름" />
                  </span>
                </th>
                <th>쓰는 곳</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const i = proc.rows.indexOf(r);
                const users = usedBy.get(r.id) || [];
                return (
                  <tr key={r.id}>
                    <td className="num r muted">{i + 1}</td>
                    <td>
                      <select className={`input cell sm ${bad.has(`${r.id}:part`) ? 'bad' : ''}`} value={r.part} onChange={(e) => editRow(r.id, { part: e.target.value })} aria-label="Part">
                        {!proc.parts.some((p) => p.name === r.part) && <option value={r.part}>{r.part || '선택'}</option>}
                        {proc.parts.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                      </select>
                    </td>
                    <td><input className="input cell" list={`mods-${proc.id}`} value={r.module || ''} onChange={(e) => editRow(r.id, { module: e.target.value })} aria-label="Module" /></td>
                    <td><input className={`input cell layer-in ${bad.has(`${r.id}:layer`) ? 'bad' : ''}`} value={r.layer} placeholder="Layer" onChange={(e) => editRow(r.id, { layer: e.target.value })} aria-label="Layer" /></td>
                    <td>
                      <select className={`input cell sm ${bad.has(`${r.id}:type`) ? 'bad' : ''}`} value={types.includes(r.type) ? r.type : ''} onChange={(e) => editRow(r.id, { type: e.target.value })} aria-label="Type">
                        {!types.includes(r.type) && <option value="">{r.type || '선택'}</option>}
                        {types.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="num r muted">{config.step2Tat[r.type] ? `${config.step2Tat[r.type]}일` : '-'}</td>
                    {proc.columns.map((c) => (
                      <td key={c}><input className="input cell spec-in" value={r.spec?.[c] ?? ''} onChange={(e) => editSpec(r.id, c, e.target.value)} aria-label={`${r.layer} ${c}`} /></td>
                    ))}
                    <td />
                    <td className="small">{users.length ? <span title={users.join(', ')}><Pill tone="accent">{users.length}</Pill></span> : <span className="muted">-</span>}</td>
                    <td><div className="row-act">
                      <button type="button" className="icon-btn sm" onClick={() => moveRow(r.id, -1)} disabled={i === 0} aria-label="위로"><Icon name="chevron" size={14} /></button>
                      <button type="button" className="icon-btn sm down" onClick={() => moveRow(r.id, 1)} disabled={i === proc.rows.length - 1} aria-label="아래로"><Icon name="chevron" size={14} /></button>
                      <button type="button" className="icon-btn sm" onClick={() => delRow(r.id)} aria-label="삭제"><Icon name="close" size={14} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id={`mods-${proc.id}`}>{modules.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <button type="button" className="btn ghost add-row" onClick={addRow}><Icon name="plus" size={15} /> Layer 추가{filter ? ` (${filter.part}${filter.module ? ` › ${filter.module}` : ''})` : ''}</button>
      </section>
    </div>
  );
}
