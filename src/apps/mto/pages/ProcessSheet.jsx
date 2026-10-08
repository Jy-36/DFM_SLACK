// Process Layer Set: Process → FEOL(Option · Module) · BEOL(Option) → Layer 분류와 Layer별 SPEC 시트.
// 왼쪽 분류에서 고른 것에 따라 오른쪽 편집 화면과 아래 Layer SPEC Sheet가 바뀐다.
import { useMemo, useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { beolOptionsOf, beolRowsOf, checkProcess, feolOptionsOf, feolRowsOf, isBeol, layerKind, moduleOptionsOf, modulesOf, parseProcessRows, processToTsv, uid } from '../lib/process.js';
import { copyText } from './ScheduleTable.jsx';
import { Confirm, Modal } from '../components/Modal.jsx';
import { BeolOptionPanel, BeolPanel, FeolOptionPanel, FeolPanel, ModulePanel, RootPanel } from '../components/ProcessEditors.jsx';

/** 새 공정 팝업: Reference Copy 또는 새로 Setting */
function NewProcessModal({ processes, onClose, onCreate }) {
  const [mode, setMode] = useState(processes.length ? 'copy' : 'new');
  const [src, setSrc] = useState(processes[0]?.id || '');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const srcProc = processes.find((p) => p.id === src);
  const finalName = name.trim() || (mode === 'copy' && srcProc ? `${srcProc.name} 복사` : `공정 ${processes.length + 1}`);
  const dup = processes.some((p) => p.name === finalName);
  return (
    <Modal
      title="새 공정"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn primary" disabled={dup || (mode === 'copy' && !srcProc)} onClick={() => onCreate(mode === 'copy' ? { copyFrom: src, name: finalName, desc: desc.trim() || srcProc.desc } : { patch: { name: finalName, desc: desc.trim() } })}>
            만들기
          </button>
        </>
      }
    >
      <div className="np-choice" role="radiogroup" aria-label="만드는 방법">
        <button type="button" role="radio" aria-checked={mode === 'copy'} className={`np-card ${mode === 'copy' ? 'on' : ''}`} disabled={!processes.length} onClick={() => setMode('copy')}>
          <Icon name="copy" size={18} />
          <b>Reference Copy</b>
          <span className="small muted">기존 공정의 Option · Module · Layer · SPEC을 그대로 복사해서 시작</span>
        </button>
        <button type="button" role="radio" aria-checked={mode === 'new'} className={`np-card ${mode === 'new' ? 'on' : ''}`} onClick={() => setMode('new')}>
          <Icon name="plus" size={18} />
          <b>새로 Setting</b>
          <span className="small muted">빈 공정 (FEOL · BEOL, POR 하나, BEOL Option 하나)에서 시작</span>
        </button>
      </div>
      {mode === 'copy' && (
        <label className="field">
          <span>복사할 공정</span>
          <select className="input" value={src} onChange={(e) => setSrc(e.target.value)}>
            {processes.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.rows.length}장</option>)}
          </select>
        </label>
      )}
      <label className="field"><span>공정 이름</span><input className="input" value={name} autoFocus placeholder={finalName} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>설명</span><input className="input" value={desc} placeholder={mode === 'copy' && srcProc?.desc ? srcProc.desc : '예: 3nm GAA, BEOL 13층'} onChange={(e) => setDesc(e.target.value)} /></label>
      {dup && <div className="small bad-text">같은 이름의 공정이 있어요</div>}
    </Modal>
  );
}

/** 공정 이름 · 설명: 보기 → [수정] → 저장/취소 */
function ProcessInfo({ proc, upd, onDelete, processes }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(proc.name);
  const [desc, setDesc] = useState(proc.desc || '');
  const dup = processes.some((p) => p.id !== proc.id && p.name === name.trim());
  if (!edit) {
    return (
      <div className="pb-settings proc-info">
        <div className="proc-title">
          <b>{proc.name}</b>
          <span className={proc.desc ? 'small' : 'small muted'}>{proc.desc || '설명 없음'}</span>
        </div>
        <span className="pb-tools">
          <button type="button" className="btn small-btn" onClick={() => { setName(proc.name); setDesc(proc.desc || ''); setEdit(true); }}><Icon name="settings" size={14} /> 수정</button>
          <button type="button" className="btn small-btn ghost danger" onClick={onDelete}><Icon name="trash" size={14} /> 삭제</button>
        </span>
      </div>
    );
  }
  const save = () => { if (!name.trim() || dup) return; upd({ name: name.trim(), desc: desc.trim() }); setEdit(false); };
  return (
    <div className="pb-settings proc-info" onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(false); }}>
      <label className="field pb-title"><span>공정 이름</span><input className={`input ${dup ? 'bad' : ''}`} value={name} autoFocus onChange={(e) => setName(e.target.value)} /></label>
      <label className="field pr-desc"><span>설명</span><input className="input" value={desc} placeholder="예: 3nm GAA, BEOL 13층" onChange={(e) => setDesc(e.target.value)} /></label>
      <span className="pb-tools">
        <button type="button" className="btn small-btn ghost" onClick={() => setEdit(false)}>취소</button>
        <button type="button" className="btn small-btn primary" disabled={!name.trim() || dup} onClick={save}>저장</button>
      </span>
    </div>
  );
}

/** 왼쪽 분류 트리 */
function Tree({ proc, sel, setSel }) {
  const feolRows = proc.rows.filter((r) => !isBeol(r));
  const beolRows = proc.rows.filter((r) => isBeol(r));
  const fo = [...feolOptionsOf(proc)].sort((a, b) => (b.por ? 1 : 0) - (a.por ? 1 : 0));
  const on = (k, extra = {}) => sel.kind === k && Object.entries(extra).every(([key, v]) => sel[key] === v);
  return (
    <section className="panel pr-tree">
      <button type="button" className={`tree-item root ${on('root') ? 'on' : ''}`} onClick={() => setSel({ kind: 'root' })}>
        <span>{proc.name}</span><span className="num muted">{proc.rows.length}</span>
      </button>
      <div className="tree-part">
        <button type="button" className={`tree-item part ${on('feol') ? 'on' : ''}`} onClick={() => setSel({ kind: 'feol' })}>
          <span><b>FEOL</b></span><span className="num muted">{feolRows.length}</span>
        </button>
        <div className="tree-group">Option</div>
        {fo.map((o) => (
          <button key={o.id} type="button" className={`tree-item module ${on('feolOpt', { id: o.id }) ? 'on' : ''}`} onClick={() => setSel({ kind: 'feolOpt', id: o.id })}>
            <span>{o.por ? <span className="por-tag">POR</span> : <span className="opt-tag">Opt</span>}{o.name}</span><span className="num muted">{feolRowsOf(proc, o.id).length}</span>
          </button>
        ))}
        <div className="tree-group">Module</div>
        {modulesOf(proc).map((m) => (
          <button key={m} type="button" className={`tree-item module ${on('module', { name: m }) ? 'on' : ''}`} onClick={() => setSel({ kind: 'module', name: m })}>
            <span>{m}{moduleOptionsOf(proc, m).length > 0 && <small className="muted"> · {moduleOptionsOf(proc, m).length}</small>}</span><span className="num muted">{feolRows.filter((r) => r.module === m).length}</span>
          </button>
        ))}
      </div>
      <div className="tree-part">
        <button type="button" className={`tree-item part ${on('beol') ? 'on' : ''}`} onClick={() => setSel({ kind: 'beol' })}>
          <span><b>BEOL</b></span><span className="num muted">{beolRows.length}</span>
        </button>
        <div className="tree-group">Option</div>
        {beolOptionsOf(proc).map((o) => (
          <button key={o} type="button" className={`tree-item module ${on('beolOpt', { name: o }) ? 'on' : ''}`} onClick={() => setSel({ kind: 'beolOpt', name: o })}>
            <span><span className="opt-tag">Opt</span>{o}</span><span className="num muted">{beolRows.filter((r) => r.module === o).length}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** 지금 고른 것으로 시트에 보일 Layer와 이름표 */
function scopeOf(proc, sel) {
  switch (sel.kind) {
    case 'feol':
      return { rows: proc.rows.filter((r) => !isBeol(r)), label: 'FEOL 전체', part: 'FEOL' };
    case 'feolOpt': {
      const o = feolOptionsOf(proc).find((x) => x.id === sel.id);
      const rows = feolRowsOf(proc, sel.id).filter((r) => !sel.module || r.module === sel.module);
      return { rows, label: `FEOL › ${o?.name || ''}${sel.module ? ` › ${sel.module}` : ''}`, part: 'FEOL', module: sel.module };
    }
    case 'module':
      return { rows: proc.rows.filter((r) => !isBeol(r) && r.module === sel.name), label: `FEOL › ${sel.name}`, part: 'FEOL', module: sel.name };
    case 'beol':
      return { rows: proc.rows.filter((r) => isBeol(r)), label: 'BEOL 전체', part: 'BEOL' };
    case 'beolOpt':
      return { rows: beolRowsOf(proc, sel.name), label: `BEOL › ${sel.name}`, part: 'BEOL', module: sel.name };
    default:
      return { rows: proc.rows, label: '전체', part: null };
  }
}

export default function ProcessSheet({ state, dispatch, go, notify }) {
  const { processes, config } = state;
  const [selId, setSelId] = useState(() => state.lastProcessId || processes[0]?.id);
  const proc = processes.find((p) => p.id === selId) || processes.find((p) => p.id === state.lastProcessId) || processes[0];
  const [sel, setSelRaw] = useState({ kind: 'root' });
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [newCol, setNewCol] = useState('');
  const [modal, setModal] = useState(null); // 'new' | { confirm }
  const types = Object.keys(config.step2Tat);
  const setSel = (s) => { setSelRaw(s); setQ(''); };

  const issues = useMemo(() => (proc ? checkProcess(proc, types) : []), [proc, types.join()]);
  const bad = useMemo(() => new Set(issues.map((i) => `${i.id}:${i.field}`)), [issues]);
  const usedBy = useMemo(() => {
    const m = new Map();
    for (const p of state.projects) if (proc && p.processId === proc.id) for (const l of p.layers) if (l.ref) m.set(l.ref, [...(m.get(l.ref) || []), p.name]);
    return m;
  }, [state.projects, proc]);
  const products = proc ? state.projects.filter((p) => p.processId === proc.id) : [];

  const askConfirm = (c) => setModal({ confirm: c });
  const createProcess = (a) => {
    dispatch({ type: 'addProcess', ...a });
    setSelId(null);
    setSel({ kind: 'root' });
    setModal(null);
    notify(a.copyFrom ? 'Reference Copy로 새 공정을 만들었어요' : '새 공정을 만들었어요');
  };

  const modalEl = modal === 'new'
    ? <NewProcessModal processes={processes} onClose={() => setModal(null)} onCreate={createProcess} />
    : modal?.confirm
      ? <Confirm danger confirmLabel={modal.confirm.confirmLabel || '지우기'} title={modal.confirm.title} message={modal.confirm.message} onConfirm={modal.confirm.onConfirm} onClose={() => setModal(null)} />
      : null;

  if (!proc) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>Process Layer Set</h1><p>Process → FEOL(Option · Module) · BEOL(Option) → Layer로 분류하고 SPEC을 관리합니다.</p></div></div>
        <section className="panel mto-empty">
          <h2>공정이 없어요</h2>
          <div className="head-actions">
            <button type="button" className="btn primary" onClick={() => setModal('new')}><Icon name="plus" size={15} /> 새 공정</button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'addProcess', example: true })}>예시 공정</button>
          </div>
        </section>
        {modalEl}
      </div>
    );
  }

  // 지운 Option · Module을 고르고 있으면 공정 전체로
  const valid =
    sel.kind === 'feolOpt' ? feolOptionsOf(proc).some((o) => o.id === sel.id)
      : sel.kind === 'module' ? modulesOf(proc).includes(sel.name)
        : sel.kind === 'beolOpt' ? beolOptionsOf(proc).includes(sel.name) : true;
  const cur = valid ? sel : { kind: 'root' };

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
  const scope = scopeOf(proc, cur);
  const addRow = () => {
    const part = scope.part || proc.rows[proc.rows.length - 1]?.part || 'FEOL';
    const same = proc.rows.filter((r) => r.part === part && (!scope.module || r.module === scope.module));
    const last = same[same.length - 1] || [...proc.rows].reverse().find((r) => r.part === part);
    const module = scope.module ?? last?.module ?? (part === 'BEOL' ? beolOptionsOf(proc)[0] : modulesOf(proc)[0]) ?? '';
    const row = { id: uid('ly'), part, module, modOpt: '', layer: '', type: last?.type || types[0], spec: {} };
    const i = last ? proc.rows.indexOf(last) + 1 : proc.rows.length;
    setRows([...proc.rows.slice(0, i), row, ...proc.rows.slice(i)]);
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
    const prev = { rows: proc.rows, columns: proc.columns };
    upd({ rows: mode === 'append' ? [...proc.rows, ...rows] : rows, columns: [...proc.columns, ...newColumns] });
    notify(`${rows.length}개 Layer를 ${mode === 'append' ? '추가' : '바꿔 넣'}었어요`, { label: '되돌리기', run: () => upd(prev) });
    setPaste(false);
    setText('');
  };

  const deleteProcess = () =>
    askConfirm({
      title: '공정 삭제',
      message: (
        <>
          <b>{proc.name}</b> 공정을 지울까요? Layer {proc.rows.length}장과 Option · Module 설정이 함께 지워져요.
          {products.length > 0 && <div className="bad-text" style={{ marginTop: 6 }}>이 공정을 쓰는 Product · Revision {products.length}개 ({products.map((p) => p.name).join(', ')})는 확인이 필요해요.</div>}
          <div className="muted" style={{ marginTop: 6 }}>지운 뒤 알림의 [되돌리기]로 되살릴 수 있어요.</div>
        </>
      ),
      confirmLabel: '삭제',
      onConfirm: () => {
        dispatch({ type: 'removeProcess', id: proc.id });
        setSelId(null);
        setSel({ kind: 'root' });
        notify(`공정 '${proc.name}'을 지웠어요${products.length ? ` · 쓰던 Product ${products.length}개 확인 필요` : ''}`, { label: '되돌리기', run: () => dispatch({ type: 'restoreProcess' }) });
      },
    });

  const ql = q.trim().toLowerCase();
  const shown = scope.rows.filter((r) => !ql || [r.layer, r.module, r.modOpt, r.part, r.type, ...Object.values(r.spec || {})].some((v) => String(v ?? '').toLowerCase().includes(ql)));
  const ep = { proc, upd, sel: cur, setSel, dispatch, products, go, askConfirm };
  const stackNo = cur.kind === 'beolOpt' ? new Map((proc.beolMeta?.[cur.name]?.stack || []).map((id, i) => [id, i + 1])) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Process Layer Set</h1>
          <p>Process → FEOL(Option · Module) · BEOL(Option) → Layer. Product는 공정 · FEOL Option · BEOL Option을 고르면 그 조합의 Layer가 Set List가 돼요.</p>
        </div>
      </div>

      <section className="panel project-bar">
        <div className="pb-row" role="tablist" aria-label="공정">
          {processes.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === proc.id} className="pb-chip" onClick={() => { setSelId(p.id); setSel({ kind: 'root' }); }}>
              <span className="kind-tag process">공정</span>
              <span className="pb-name">{p.name}</span>
              <span className="pb-st num">{p.rows.length}장</span>
            </button>
          ))}
          <button type="button" className="pb-chip add-chip" onClick={() => setModal('new')} title="새 공정" aria-label="새 공정"><Icon name="plus" size={15} /></button>
        </div>
        <ProcessInfo key={proc.id} proc={proc} upd={upd} processes={processes} onDelete={deleteProcess} />
      </section>

      <div className="pr-grid">
        <Tree proc={proc} sel={cur} setSel={setSel} />
        <section className="panel pr-editor">
          {cur.kind === 'root' && <RootPanel {...ep} />}
          {cur.kind === 'feol' && <FeolPanel {...ep} />}
          {cur.kind === 'feolOpt' && <FeolOptionPanel key={cur.id} {...ep} />}
          {cur.kind === 'module' && <ModulePanel key={cur.name} {...ep} />}
          {cur.kind === 'beol' && <BeolPanel {...ep} />}
          {cur.kind === 'beolOpt' && <BeolOptionPanel key={cur.name} {...ep} />}
        </section>
      </div>

      {paste && (
        <section className="panel paste-panel">
          <h2>엑셀에서 복사해 붙여넣기 <span className="small muted">머리줄(Part · Module · Layer · Type · SPEC 열 이름)이 있으면 열 순서가 달라도 되고, 모르는 열은 SPEC 열로 추가돼요</span></h2>
          <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder={`Part\tModule\tLayer\tType\t${proc.columns.join('\t')}\nFEOL\tMOL\tCA\tX\t…\nBEOL\t15M\tM1\tY\t… (BEOL은 Module 칸에 Option)`} />
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
            <Pill tone="accent">{scope.label} · {shown.length}장</Pill>
            {cur.kind !== 'root' && <button type="button" className="link-btn small" onClick={() => setSel({ kind: 'root' })}>전체 보기</button>}
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
                <th>Module / BEOL Option</th>
                <th>Module Option</th>
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
                const beol = isBeol(r);
                const mo = beol ? [] : moduleOptionsOf(proc, r.module);
                return (
                  <tr key={r.id}>
                    <td className="num r muted">{stackNo ? (stackNo.get(r.id) ? <span title="쌓는 순서">{stackNo.get(r.id)}</span> : '-') : i + 1}</td>
                    <td>
                      <select className={`input cell sm ${bad.has(`${r.id}:part`) ? 'bad' : ''}`} value={r.part} onChange={(e) => editRow(r.id, { part: e.target.value, module: e.target.value === 'BEOL' ? beolOptionsOf(proc)[0] || '' : modulesOf(proc)[0] || '', modOpt: '' })} aria-label="Part">
                        {!proc.parts.some((p) => p.name === r.part) && <option value={r.part}>{r.part || '선택'}</option>}
                        {proc.parts.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                      </select>
                    </td>
                    <td>
                      {beol ? (
                        <select className="input cell opt-sel" value={r.module || ''} onChange={(e) => editRow(r.id, { module: e.target.value })} aria-label="BEOL Option">
                          {!beolOptionsOf(proc).includes(r.module) && <option value={r.module || ''}>{r.module || '고르기'}</option>}
                          {beolOptionsOf(proc).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <select className="input cell" value={r.module || ''} onChange={(e) => editRow(r.id, { module: e.target.value, modOpt: '' })} aria-label="Module">
                          {!modulesOf(proc).includes(r.module) && <option value={r.module || ''}>{r.module || '고르기'}</option>}
                          {modulesOf(proc).map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      {beol ? <span className={`kind-dot ${layerKind(r.layer)}`}>{layerKind(r.layer) === 'metal' ? 'Metal' : layerKind(r.layer) === 'via' ? 'Via' : '-'}</span> : (
                        <select className="input cell sm" value={r.modOpt || ''} onChange={(e) => editRow(r.id, { modOpt: e.target.value })} aria-label="Module Option" disabled={!mo.length && !r.modOpt}>
                          <option value="">공통</option>
                          {r.modOpt && !mo.includes(r.modOpt) && <option value={r.modOpt}>{r.modOpt}</option>}
                          {mo.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                    </td>
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
        </div>
        <button type="button" className="btn ghost add-row" onClick={addRow}><Icon name="plus" size={15} /> Layer 추가 ({scope.part ? `${scope.part}${scope.module ? ` › ${scope.module}` : ''}` : '맨 뒤'})</button>
      </section>
      {modalEl}
    </div>
  );
}
