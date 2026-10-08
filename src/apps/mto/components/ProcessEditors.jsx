// Process Layer Set 오른쪽 편집 화면: 왼쪽 분류에서 고른 것(공정 · FEOL · FEOL Concept · Module · BEOL · BEOL Option)에 따라 바뀐다.
import { useState } from 'react';
import { Icon, InfoTip } from '../../../shared/ui.jsx';
import { beolMetaOf, beolOptionsOf, beolRowsOf, chosenModOpt, feolOptionsOf, feolRowsOf, isBeol, layerKind, moduleOptionsOf, modulesOf } from '../lib/process.js';
import * as ops from '../lib/processOps.js';

/** 값 보기 + [편집] → 입력 + 저장/취소 */
export function EditableText({ value, onSave, placeholder, label, big }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  if (!edit) {
    return (
      <span className={`ed-view ${big ? 'big' : ''}`}>
        <span className={value ? '' : 'muted'}>{value || placeholder || '-'}</span>
        <button type="button" className="btn small-btn ghost" onClick={() => { setV(value); setEdit(true); }} aria-label={`${label || ''} 편집`}><Icon name="settings" size={13} /> 편집</button>
      </span>
    );
  }
  const save = () => { onSave(v.trim()); setEdit(false); };
  return (
    <span className="ed-edit">
      <input className="input" value={v} autoFocus placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(false); }} aria-label={label} />
      <button type="button" className="btn small-btn primary" onClick={save}>저장</button>
      <button type="button" className="btn small-btn ghost" onClick={() => setEdit(false)}>취소</button>
    </span>
  );
}

/** 이름 목록 편집: 칩 + [편집]을 누르면 이름 바꾸기·지우기·추가 */
function NameChips({ items, onAdd, onRename, onDelete, canDelete, tone, addLabel, first }) {
  const [edit, setEdit] = useState(false);
  const [n, setN] = useState('');
  return (
    <span className="name-chips">
      {items.map((x, i) => (
        edit ? (
          <span key={x} className={`nchip edit ${tone || ''}`}>
            <input className="col-name" defaultValue={x} onBlur={(e) => e.target.value.trim() !== x && onRename(x, e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label={`${x} 이름`} />
            <button type="button" className="col-del show" disabled={!canDelete(x)} title={canDelete(x) ? '지우기' : '쓰는 Layer가 있어 지울 수 없어요'} onClick={() => onDelete(x)} aria-label={`${x} 지우기`}><Icon name="close" size={11} /></button>
          </span>
        ) : (
          <span key={x} className={`nchip ${tone || ''} ${i === 0 && first ? 'first' : ''}`}>{x}{i === 0 && first ? <small>{first}</small> : null}</span>
        )
      ))}
      {edit && (
        <span className="nchip add">
          <input className="col-name" value={n} placeholder={addLabel} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && n.trim()) { onAdd(n.trim()); setN(''); } }} aria-label={addLabel} />
        </span>
      )}
      <button type="button" className={`btn small-btn ${edit ? 'primary' : 'ghost'}`} onClick={() => setEdit((v) => !v)}>{edit ? '완료' : '편집'}</button>
    </span>
  );
}

const count = (rows, f) => rows.filter(f).length;

/** 공정 전체: Part 설정 + 요약 */
export function RootPanel({ proc, upd, products, go }) {
  const editPart = (i, patch) => upd({ parts: proc.parts.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  return (
    <>
      <h2>Part <span className="small muted">FEOL → BEOL · 일정 계산에 쓰는 값</span></h2>
      <div className="table-wrap">
        <table className="data-table part-table">
          <thead><tr><th>Part</th><th>나누는 단위</th><th>GDS 입고 <InfoTip text="FEOL GDS 입고일로부터 며칠 뒤에 BEOL GDS가 들어오는지 (기본 14일 = 2주). 중간부터(BEOL만) 나가면 입력한 GDS가 BEOL GDS가 돼요." /></th><th>STEP1 TAT</th><th className="r">Layer</th></tr></thead>
          <tbody>
            {proc.parts.map((p, i) => (
              <tr key={p.name}>
                <td><b>{p.name}</b></td>
                <td className="small muted">{p.name === 'FEOL' ? `FEOL Concept ${feolOptionsOf(proc).length} · Module ${modulesOf(proc).length}` : `BEOL Option ${beolOptionsOf(proc).length}개 중 하나`}</td>
                <td><div className="num-field"><input className="input num cell" type="number" min={0} max={365} value={p.gdsOffset} onChange={(e) => editPart(i, { gdsOffset: Math.max(0, parseInt(e.target.value, 10) || 0) })} /><span className="muted small">일 뒤</span></div></td>
                <td><div className="num-field"><input className="input num cell" type="number" min={1} max={60} value={p.step1Tat} onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1 && v <= 60) editPart(i, { step1Tat: v }); }} /><span className="muted small">일</span></div></td>
                <td className="num r">{count(proc.rows, (r) => r.part === p.name)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pr-used small muted">
        이 공정을 쓰는 Product · Revision: {products.length ? products.map((p) => <button key={p.id} type="button" className="link-btn" onClick={() => go('layers', p.id)}>{p.name}</button>) : '없음'}
      </div>
    </>
  );
}

/** FEOL Concept 칩 (POR 맨 앞, 색 다름) */
function FeolOptionStrip({ proc, sel, setSel, upd }) {
  const [n, setN] = useState('');
  const add = () => {
    const { proc: next, id } = ops.addFeolOption(proc, n.trim());
    if (!id) return;
    upd(next);
    setN('');
    setSel({ kind: 'feolOpt', id });
  };
  return (
    <div className="fo-strip">
      {feolOptionsOf(proc).map((o) => (
        <button key={o.id} type="button" className={`fo-chip ${o.por ? 'por' : ''} ${sel.kind === 'feolOpt' && sel.id === o.id ? 'on' : ''}`} onClick={() => setSel({ kind: 'feolOpt', id: o.id })}>
          {o.por && <span className="por-tag">POR</span>}
          {o.name}
          <span className="num small">{feolRowsOf(proc, o.id).length}장</span>
        </button>
      ))}
      <span className="nchip add"><input className="col-name" value={n} placeholder="+ FEOL Concept" onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="새 FEOL Concept" /></span>
    </div>
  );
}

/** Module 목록: Module 이름 · Module Option 편집 */
function ModuleList({ proc, upd, setSel, sel }) {
  const [n, setN] = useState('');
  const mods = modulesOf(proc);
  return (
    <div className="mod-list">
      {mods.map((m) => {
        const rows = proc.rows.filter((r) => !isBeol(r) && r.module === m);
        return (
          <div key={m} className={`mod-row ${sel.kind === 'module' && sel.name === m ? 'on' : ''}`}>
            <div className="mod-name-cell">
              <button type="button" className="link-btn strong" onClick={() => setSel({ kind: 'module', name: m })}>{m}</button>
              <span className="num small muted">{rows.length}장</span>
            </div>
            <NameChips
              items={moduleOptionsOf(proc, m)}
              first="기본"
              onAdd={(x) => upd(ops.addModOpt(proc, m, x))}
              onRename={(a, b) => upd(ops.renameModOpt(proc, m, a, b))}
              onDelete={(x) => upd(ops.deleteModOpt(proc, m, x))}
              canDelete={(x) => !rows.some((r) => r.modOpt === x)}
              addLabel="+ Module Option"
            />
          </div>
        );
      })}
      <div className="mod-row add">
        <span className="nchip add"><input className="col-name" value={n} placeholder="+ Module" onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && n.trim()) { upd(ops.addModule(proc, n.trim())); setN(''); } }} aria-label="새 Module" /></span>
      </div>
    </div>
  );
}

/** FEOL 전체: FEOL Concept(맨 위) + Module 목록 */
export function FeolPanel({ proc, upd, sel, setSel }) {
  return (
    <>
      <h2>FEOL Concept <span className="small muted">Module마다 어떤 Module Option을 쓸지 정한 조합 · POR이 기본</span></h2>
      <FeolOptionStrip proc={proc} sel={sel} setSel={setSel} upd={upd} />
      <h3 className="sub-h">FEOL Module <span className="small muted">Module Option은 [편집]으로 추가·이름 바꾸기 · 첫 번째가 기본 · Module Option이 빈 Layer는 공통</span></h3>
      <ModuleList proc={proc} upd={upd} sel={sel} setSel={setSel} />
    </>
  );
}

/** FEOL Concept 하나: 이름 · POR · Module별 Module Option 고르기 */
export function FeolOptionPanel({ proc, upd, sel, setSel, products, askConfirm }) {
  const fo = feolOptionsOf(proc).find((o) => o.id === sel.id);
  if (!fo) return null;
  const users = products.filter((p) => p.kind === 'product' && (p.feolOption || feolOptionsOf(proc)[0].id) === fo.id);
  return (
    <>
      <FeolOptionStrip proc={proc} sel={sel} setSel={setSel} upd={upd} />
      <div className="fo-head">
        <EditableText value={fo.name} big label="FEOL Concept 이름" onSave={(v) => v && !feolOptionsOf(proc).some((o) => o.name === v && o.id !== fo.id) && upd(ops.updateFeolOption(proc, fo.id, { name: v }))} />
        {fo.por ? <span className="por-tag big">POR</span> : <button type="button" className="btn small-btn" onClick={() => upd(ops.setPor(proc, fo.id))}>POR로 지정</button>}
        <span className="small muted">{feolRowsOf(proc, fo.id).length}장 · 쓰는 Product {users.length}</span>
        {!fo.por && (
          <button type="button" className="btn small-btn ghost danger" disabled={users.length > 0} title={users.length ? '쓰는 Product가 있어 지울 수 없어요' : ''}
            onClick={() => askConfirm({ title: 'FEOL Concept 지우기', message: `'${fo.name}'을 지울까요?`, onConfirm: () => { upd(ops.deleteFeolOption(proc, fo.id)); setSel({ kind: 'feol' }); } })}>
            <Icon name="trash" size={13} /> 지우기
          </button>
        )}
      </div>
      <h3 className="sub-h">Module Option 조정 <span className="small muted">Module을 누르면 아래 시트에 그 Module Layer만</span></h3>
      <div className="mod-list">
        {modulesOf(proc).map((m) => {
          const opts = moduleOptionsOf(proc, m);
          const cur = chosenModOpt(proc, fo, m);
          return (
            <div key={m} className={`mod-row ${sel.module === m ? 'on' : ''}`}>
              <div className="mod-name-cell">
                <button type="button" className="link-btn strong" onClick={() => setSel({ ...sel, module: sel.module === m ? null : m })}>{m}</button>
                <span className="num small muted">{feolRowsOf(proc, fo.id).filter((r) => r.module === m).length}장</span>
              </div>
              {opts.length ? (
                <div className="seg" role="group" aria-label={`${m} Module Option`}>
                  {opts.map((o) => <button key={o} type="button" aria-pressed={cur === o} onClick={() => upd(ops.setFeolModOpt(proc, fo.id, m, o))}>{o}</button>)}
                </div>
              ) : <span className="small muted">Module Option 없음 (공통 Layer만)</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Module 하나: 이름 · Module Option 편집 */
export function ModulePanel({ proc, upd, sel, setSel, askConfirm }) {
  const m = sel.name;
  const rows = proc.rows.filter((r) => !isBeol(r) && r.module === m);
  return (
    <>
      <FeolOptionStrip proc={proc} sel={sel} setSel={setSel} upd={upd} />
      <div className="fo-head">
        <span className="small muted">Module</span>
        <EditableText value={m} big label="Module 이름" onSave={(v) => { if (v && v !== m) { upd(ops.renameModule(proc, m, v)); setSel({ kind: 'module', name: v }); } }} />
        <span className="small muted">{rows.length}장 · 공통 {rows.filter((r) => !r.modOpt).length}</span>
        <button type="button" className="btn small-btn ghost danger" disabled={rows.length > 0} title={rows.length ? 'Layer가 있는 Module은 지울 수 없어요' : ''}
          onClick={() => askConfirm({ title: 'Module 지우기', message: `'${m}' Module을 지울까요?`, onConfirm: () => { upd(ops.deleteModule(proc, m)); setSel({ kind: 'feol' }); } })}>
          <Icon name="trash" size={13} /> 지우기
        </button>
      </div>
      <h3 className="sub-h">Module Option</h3>
      <NameChips
        items={moduleOptionsOf(proc, m)}
        first="기본"
        onAdd={(x) => upd(ops.addModOpt(proc, m, x))}
        onRename={(a, b) => upd(ops.renameModOpt(proc, m, a, b))}
        onDelete={(x) => upd(ops.deleteModOpt(proc, m, x))}
        canDelete={(x) => !rows.some((r) => r.modOpt === x)}
        addLabel="+ Module Option"
      />
      <div className="mo-counts small muted">
        {['', ...moduleOptionsOf(proc, m)].map((o) => <span key={o || 'common'}>{o || '공통'} <b className="num">{rows.filter((r) => (r.modOpt || '') === o).length}</b></span>)}
      </div>
    </>
  );
}

/** BEOL Option 카드 (맨 위) */
function BeolOptionCards({ proc, sel, setSel, dispatch, upd }) {
  const [n, setN] = useState('');
  return (
    <div className="bo-cards">
      {beolOptionsOf(proc).map((o) => {
        const meta = beolMetaOf(proc, o);
        const rows = beolRowsOf(proc, o);
        return (
          <button key={o} type="button" className={`bo-card ${sel.kind === 'beolOpt' && sel.name === o ? 'on' : ''}`} onClick={() => setSel({ kind: 'beolOpt', name: o })}>
            <span className="bo-name">{o}</span>
            <span className="small muted">{meta.concept || '컨셉 없음'}</span>
            <span className="small num">{rows.length}장 · {count(rows, (r) => layerKind(r.layer) === 'metal')}M {count(rows, (r) => layerKind(r.layer) === 'via')}V · 순서 {meta.stack.length ? '있음' : '없음'}</span>
          </button>
        );
      })}
      <span className="bo-card add">
        <input className="col-name" value={n} placeholder="+ BEOL Option (예: 13M)" onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { const v = n.trim(); if (e.key === 'Enter' && v && !beolOptionsOf(proc).includes(v)) { upd({ ...proc, beolOptions: [...beolOptionsOf(proc), v] }); setN(''); setSel({ kind: 'beolOpt', name: v }); } }} aria-label="새 BEOL Option" />
      </span>
    </div>
  );
}

export function BeolPanel({ proc, upd, sel, setSel, dispatch }) {
  return (
    <>
      <h2>BEOL Option <span className="small muted">Product는 이 중 하나를 골라요 · 눌러서 컨셉과 Metal · Via 순서 보기</span></h2>
      <BeolOptionCards proc={proc} sel={sel} setSel={setSel} dispatch={dispatch} upd={upd} />
    </>
  );
}

/** BEOL Option 하나: 이름 · 컨셉 · Metal / Via 쌓는 순서 */
export function BeolOptionPanel({ proc, upd, sel, setSel, dispatch, products, askConfirm }) {
  const o = sel.name;
  const meta = beolMetaOf(proc, o);
  const rows = proc.rows.filter((r) => isBeol(r) && r.module === o);
  const ordered = beolRowsOf(proc, o);
  const users = products.filter((p) => p.kind === 'product' && p.beolOption === o);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState([]);
  const startEdit = () => { setDraft(meta.stack.filter((id) => rows.some((r) => r.id === id))); setEdit(true); };
  const rowOf = (id) => rows.find((r) => r.id === id);
  const Chip = ({ r, onClick, idx }) => (
    <button type="button" className={`stack-chip ${layerKind(r.layer)}`} onClick={onClick} title={onClick ? '눌러서 빼기' : undefined}>
      {idx != null && <span className="num">{idx + 1}</span>}
      {r.layer}
    </button>
  );
  return (
    <>
      <BeolOptionCards proc={proc} sel={sel} setSel={setSel} dispatch={dispatch} upd={upd} />
      <div className="fo-head">
        <span className="small muted">BEOL Option</span>
        <EditableText value={o} big label="BEOL Option 이름" onSave={(v) => { if (v && v !== o && !beolOptionsOf(proc).includes(v)) { dispatch({ type: 'renameBeolOption', id: proc.id, from: o, to: v }); setSel({ kind: 'beolOpt', name: v }); } }} />
        <span className="small muted">{rows.length}장 · 쓰는 Product {users.length}</span>
        <button type="button" className="btn small-btn ghost danger" disabled={rows.length > 0 || users.length > 0} title={rows.length || users.length ? 'Layer나 쓰는 Product가 있으면 지울 수 없어요' : ''}
          onClick={() => askConfirm({ title: 'BEOL Option 지우기', message: `'${o}'을 지울까요?`, onConfirm: () => { upd({ ...proc, beolOptions: beolOptionsOf(proc).filter((x) => x !== o) }); setSel({ kind: 'beol' }); } })}>
          <Icon name="trash" size={13} /> 지우기
        </button>
      </div>
      <div className="field concept">
        <span>컨셉</span>
        <EditableText value={meta.concept} placeholder="예: 13M · 1X 6층 + 2X 4층 + 4X 2층 + RDL" label="컨셉" onSave={(v) => upd(ops.setBeolMeta(proc, o, { concept: v }))} />
      </div>
      <h3 className="sub-h">
        Metal · Via 순서 <span className="small muted">아래부터 쌓는 순서 · Set List에서도 이 순서로 담겨요</span>
        {!edit && <button type="button" className="btn small-btn ghost" onClick={startEdit}><Icon name="settings" size={13} /> 편집</button>}
      </h3>
      {!edit ? (
        meta.stack.length ? (
          <div className="stack-row">
            {ordered.map((r, i) => <Chip key={r.id} r={r} idx={meta.stack.includes(r.id) ? i : null} />)}
            {ordered.length > meta.stack.length && <span className="small muted">· 뒤 {ordered.length - meta.stack.filter((id) => rowOf(id)).length}장은 순서 미지정</span>}
          </div>
        ) : (
          <div className="stack-empty small">순서가 없어요. <button type="button" className="link-btn" onClick={startEdit}>편집</button>을 눌러 Layer를 아래부터 차례로 고르세요.</div>
        )
      ) : (
        <div className="stack-edit">
          <div className="small muted">고른 순서 (누르면 빼기)</div>
          <div className="stack-row">{draft.length ? draft.map((id, i) => rowOf(id) && <Chip key={id} r={rowOf(id)} idx={i} onClick={() => setDraft(draft.filter((x) => x !== id))} />) : <span className="small muted">아직 없음</span>}</div>
          <div className="small muted">Layer (눌러서 다음 순서로)</div>
          <div className="stack-row">{rows.filter((r) => !draft.includes(r.id)).map((r) => <Chip key={r.id} r={r} onClick={() => setDraft([...draft, r.id])} />)}</div>
          <div className="head-actions">
            <button type="button" className="btn small-btn" onClick={() => setDraft(rows.map((r) => r.id))}>시트 순서로 채우기</button>
            <button type="button" className="btn small-btn ghost" onClick={() => setDraft([])}>비우기</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn small-btn ghost" onClick={() => setEdit(false)}>취소</button>
            <button type="button" className="btn small-btn primary" onClick={() => { upd(ops.setBeolMeta(proc, o, { stack: draft })); setEdit(false); }}>저장</button>
          </div>
        </div>
      )}
    </>
  );
}
