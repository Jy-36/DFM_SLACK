// Process Layer Set 팝업: FEOL Concept · Module · BEOL Option 추가, Concept의 Module Option 바꾸기 확인
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { Modal } from './Modal.jsx';
import { beolOptionsOf, beolRowsOf, feolOptionsOf, feolRowsOf, modulesOf } from '../lib/process.js';
import * as ops from '../lib/processOps.js';

function Foot({ onClose, ok, disabled, label = '추가' }) {
  return (
    <>
      <button type="button" className="btn ghost" onClick={onClose}>취소</button>
      <button type="button" className="btn primary" disabled={disabled} onClick={ok}>{label}</button>
    </>
  );
}

function ChoiceCards({ value, set, items }) {
  return (
    <div className="np-choice" role="radiogroup">
      {items.map(([k, icon, title, desc, disabled]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} disabled={disabled} className={`np-card ${value === k ? 'on' : ''}`} onClick={() => set(k)}>
          <Icon name={icon} size={18} />
          <b>{title}</b>
          <span className="small muted">{desc}</span>
        </button>
      ))}
    </div>
  );
}

/** FEOL Concept 추가: 기준 Concept의 Module Option 조합을 복사해서 시작 */
export function AddConceptModal({ proc, onClose, onDone }) {
  const list = feolOptionsOf(proc);
  const [name, setName] = useState('');
  const [base, setBase] = useState(list[0]?.id);
  const n = name.trim();
  const dup = list.some((o) => o.name === n);
  const ok = () => {
    const { proc: next, id } = ops.addFeolOption(proc, n, base);
    if (id) onDone(next, { kind: 'feolOpt', id });
  };
  return (
    <Modal title="FEOL Concept 추가" onClose={onClose} footer={<Foot onClose={onClose} ok={ok} disabled={!n || dup} />}>
      <label className="field"><span>Concept 이름</span><input className={`input ${dup ? 'bad' : ''}`} value={name} autoFocus placeholder="예: HD, LP, HV" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && n && !dup && ok()} /></label>
      <label className="field">
        <span>시작할 Module Option 조합</span>
        <select className="input" value={base} onChange={(e) => setBase(e.target.value)}>
          {list.map((o) => <option key={o.id} value={o.id}>{o.name}{o.por && o.name !== 'POR' ? ' (POR)' : ''} 조합 복사 · {feolRowsOf(proc, o.id).length}장</option>)}
        </select>
      </label>
      <div className="small muted">만든 뒤 Module마다 Module Option을 바꿔 조합을 정하세요.</div>
      {dup && <div className="small bad-text">같은 이름의 Concept이 있어요</div>}
    </Modal>
  );
}

/** Module 추가: 이름 + Module Option(쉼표로 여러 개, 첫 번째가 기본) */
export function AddModuleModal({ proc, onClose, onDone }) {
  const [name, setName] = useState('');
  const [opts, setOpts] = useState('');
  const n = name.trim();
  const dup = modulesOf(proc).includes(n);
  const list = opts.split(',').map((x) => x.trim()).filter(Boolean);
  const ok = () => onDone(ops.addModule(proc, n, list), { kind: 'module', name: n });
  return (
    <Modal title="FEOL Module 추가" onClose={onClose} footer={<Foot onClose={onClose} ok={ok} disabled={!n || dup} />}>
      <label className="field"><span>Module 이름</span><input className={`input ${dup ? 'bad' : ''}`} value={name} autoFocus placeholder="예: MOL, Gate, Contact" onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Module Option (선택 · 쉼표로 구분, 첫 번째가 POR 기본)</span><input className="input" value={opts} placeholder="예: Base, HD" onChange={(e) => setOpts(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && n && !dup && ok()} /></label>
      {list.length > 0 && <div className="name-chips">{list.map((x, i) => <span key={x} className={`nchip ${i === 0 ? 'first' : ''}`}>{x}{i === 0 && <small>POR</small>}</span>)}</div>}
      <div className="small muted">Module은 FEOL 목록 맨 뒤에 붙어요. 순서는 FEOL 화면에서 ▲▼로 바꿀 수 있어요.</div>
      {dup && <div className="small bad-text">같은 이름의 Module이 있어요</div>}
    </Modal>
  );
}

/** BEOL Option 추가: 빈 Option 또는 Reference Copy(Layer · 순서 복사) */
export function AddBeolOptionModal({ proc, onClose, onDone }) {
  const list = beolOptionsOf(proc);
  const [mode, setMode] = useState(list.length ? 'copy' : 'new');
  const [src, setSrc] = useState(list[0] || '');
  const [name, setName] = useState('');
  const [concept, setConcept] = useState('');
  const n = name.trim();
  const dup = list.includes(n);
  const ok = () => onDone(ops.addBeolOption(proc, n, { concept: concept.trim(), copyFrom: mode === 'copy' ? src : null }), { kind: 'beolOpt', name: n });
  return (
    <Modal title="BEOL Option 추가" width={520} onClose={onClose} footer={<Foot onClose={onClose} ok={ok} disabled={!n || dup} />}>
      <ChoiceCards value={mode} set={setMode} items={[
        ['copy', 'copy', 'Reference Copy', '기존 BEOL Option의 Layer · SPEC · 쌓는 순서를 복사해서 시작', !list.length],
        ['new', 'plus', '새로 Setting', 'Layer 없이 시작 · 시트에서 Layer를 추가'],
      ]} />
      {mode === 'copy' && (
        <label className="field"><span>복사할 BEOL Option</span>
          <select className="input" value={src} onChange={(e) => setSrc(e.target.value)}>
            {list.map((o) => <option key={o} value={o}>{o} · {beolRowsOf(proc, o).length}장</option>)}
          </select>
        </label>
      )}
      <label className="field"><span>Option 이름</span><input className={`input ${dup ? 'bad' : ''}`} value={name} autoFocus placeholder="예: 13M" onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>컨셉 (선택)</span><input className="input" value={concept} placeholder="예: 1X 6층 + 2X 4층 + 4X 2층 + RDL" onChange={(e) => setConcept(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && n && !dup && ok()} /></label>
      {dup && <div className="small bad-text">같은 이름의 BEOL Option이 있어요</div>}
    </Modal>
  );
}

/** Concept의 Module Option 바꾸기 확인: 빠지고 들어오는 Layer, 쓰는 Product 다시 담기 */
export function ModOptChangeModal({ proc, foId, module, to, products, setDefault, onClose, onDone }) {
  const fo = feolOptionsOf(proc).find((o) => o.id === foId);
  const ch = ops.modOptChange(proc, foId, module, to);
  const users = products.filter((p) => p.kind === 'product' && p.processId === proc.id && (p.feolOption || feolOptionsOf(proc)[0].id) === foId);
  const [resync, setResync] = useState(true);
  const ok = () => {
    const next = setDefault ? ops.setDefaultModOpt(proc, module, to) : ops.setFeolModOpt(proc, foId, module, to);
    onDone(next, resync ? users : []);
  };
  return (
    <Modal title={setDefault ? 'POR Module Option 바꾸기' : 'Module Option 바꾸기'} width={500} onClose={onClose} footer={<Foot onClose={onClose} ok={ok} label="바꾸기" />}>
      <div className="mo-change">
        <span className="small muted">Concept</span> <b>{fo?.name}</b>
        <span className="small muted"> · Module</span> <b>{module}</b>
        <div className="mo-arrow"><span className="nchip">{ch.from || '(없음)'}</span><Icon name="chevron" size={14} /><span className="nchip first">{to}</span></div>
      </div>
      {setDefault && <div className="small muted">POR Concept이 이 Module에서 쓰는 Option이 바뀌고, 목록 맨 앞(기본)으로 옮겨져요.</div>}
      <div className="mo-diff">
        <div><span className="small muted">빠지는 Layer {ch.out.length}</span><div className="stack-row">{ch.out.length ? ch.out.map((r) => <span key={r.id} className="stack-chip out">{r.layer}</span>) : <span className="small muted">없음</span>}</div></div>
        <div><span className="small muted">들어오는 Layer {ch.in.length}</span><div className="stack-row">{ch.in.length ? ch.in.map((r) => <span key={r.id} className="stack-chip in">{r.layer}</span>) : <span className="small muted">없음</span>}</div></div>
      </div>
      <div className="small">FEOL {feolRowsOf(proc, foId).length}장 → <b className="num">{feolRowsOf(ops.setFeolModOpt(proc, foId, module, to), foId).length}장</b></div>
      {users.length > 0 ? (
        <label className="check small">
          <input type="checkbox" checked={resync} onChange={(e) => setResync(e.target.checked)} />
          이 Concept을 쓰는 Product {users.length}개({users.map((p) => p.name).join(', ')})의 FEOL Set List도 새 조합으로 다시 담기 <span className="muted">(BEOL은 그대로)</span>
        </label>
      ) : <div className="small muted">이 Concept을 쓰는 Product는 없어요.</div>}
    </Modal>
  );
}
