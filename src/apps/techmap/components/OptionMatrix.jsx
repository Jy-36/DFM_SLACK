// Option × Layer 매트릭스: 분류 규칙으로 자동(●) · 규칙 밖(·) · 직접 넣음(+) · 직접 뺌(−). 칸을 누르면 예외를 넣고 뺀다.
import { useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { CLASS_LABEL, CLASSES } from '../lib/classify.js';
import { newOption } from '../lib/options.js';
import { LEVEL_TONE } from '../lib/view.js';

const MARK = { rule: '●', out: '·', plus: '+', minus: '−' };
const WHY = { rule: '규칙으로 포함', out: '규칙 밖', plus: '직접 넣음', minus: '직접 뺌' };

export default function OptionMatrix({ c, rev, locked, onChange, go }) {
  const [name, setName] = useState('');
  const [metals, setMetals] = useState(9);
  const defs = rev.options || [];
  const opts = c.options;
  const layerNum = new Map([...c.all.tf.layerByName()].map(([l, r]) => [l, Number(r.tokens[1])]));
  const anySet = opts[0]?.set;
  const layers = anySet ? [...anySet.entries()] : [...layerNum.keys()].map((l) => [l, { cls: 'FEOL', level: null }]);
  const rank = Object.fromEntries(CLASSES.map((k, i) => [k, i]));
  layers.sort((a, b) => rank[a[1].cls] - rank[b[1].cls] || (a[1].level ?? 0) - (b[1].level ?? 0) || layerNum.get(a[0]) - layerNum.get(b[0]));
  const tops = layers.filter(([, v]) => v.cls === 'TOP').map(([l]) => l);
  const maxMetal = Math.max(0, ...layers.filter(([, v]) => v.cls === 'METAL').map(([, v]) => v.level || 0));

  const patch = (i, p, note) => onChange(defs.map((d, k) => (k === i ? { ...d, ...p } : d)), note);
  const toggle = (i, layer, v) => {
    const d = defs[i];
    let plus = d.plus.filter((x) => x !== layer);
    let minus = d.minus.filter((x) => x !== layer);
    let note;
    if (v.why === 'rule') { minus = [...minus, layer]; note = `${d.name}: ${layer} 빼기`; }
    else if (v.why === 'out') { plus = [...plus, layer]; note = `${d.name}: ${layer} 넣기`; }
    else note = `${d.name}: ${layer} 예외 해제`;
    patch(i, { plus, minus }, note);
  };
  const add = () => {
    const n = name.trim();
    if (!n || defs.some((d) => d.name === n)) return;
    onChange([...defs, newOption(n, Number(metals) || 1, [])], `Option ${n} 추가`);
    setName('');
  };

  let lastCls = null;
  return (
    <div className="tm-opt">
      <section className="panel">
        <h2>
          Option 구성
          <span className="small muted">● 규칙 · + 직접 넣음 · − 직접 뺌 · 칸을 누르면 예외 전환 {locked && '(승인된 작업은 보기만)'}</span>
        </h2>
        {!opts.length && <p className="empty">아직 Option이 없어요. 아래에서 Stack을 추가하세요.</p>}
        {opts.length > 0 && (
          <div className="table-wrap tm-opt-wrap">
            <table className="data-table tm-opt-table">
              <thead>
                <tr>
                  <th>Layer</th>
                  {opts.map((o, i) => (
                    <th key={o.def.name} className="tm-opt-head">
                      <div className="tm-opt-name">{o.def.name}</div>
                      <label className="small">Metal <input className="input tm-mini-input num" type="number" min="1" max={Math.max(maxMetal, 1)} value={defs[i]?.metals ?? o.def.metals} disabled={locked}
                        onChange={(e) => patch(i, { metals: Number(e.target.value) || 1 }, `${o.def.name}: Metal ${e.target.value}`)} /></label>
                      {tops.length > 0 && (
                        <div className="tm-opt-tops">
                          {tops.map((t) => (
                            <label key={t} className="small">
                              <input type="checkbox" disabled={locked} checked={(defs[i]?.tops || []).includes(t)}
                                onChange={(e) => patch(i, { tops: e.target.checked ? [...defs[i].tops, t] : defs[i].tops.filter((x) => x !== t) }, `${o.def.name}: ${t} ${e.target.checked ? '포함' : '제외'}`)} /> {t}
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="small muted">{o.check.count} Layer · M{o.check.metals} · V{o.check.vias}</div>
                      {!locked && <button type="button" className="link-btn small" onClick={() => window.confirm(`${o.def.name} Option을 지울까요?`) && onChange(defs.filter((_, k) => k !== i), `Option ${o.def.name} 삭제`)}>지우기</button>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {layers.map(([layer, v]) => {
                  const head = v.cls !== lastCls;
                  lastCls = v.cls;
                  return [
                    head && (
                      <tr key={`h-${v.cls}`} className="tm-opt-group"><td colSpan={opts.length + 1}>{CLASS_LABEL[v.cls]}</td></tr>
                    ),
                    <tr key={layer}>
                      <td><b>{layer}</b> <span className="small muted">{v.level != null ? `${v.cls === 'VIA' ? `M${v.level}↔M${v.level + 1}` : `L${v.level}`}` : ''} · #{layerNum.get(layer)}</span></td>
                      {opts.map((o, i) => {
                        const s = o.set.get(layer);
                        return (
                          <td key={o.def.name} className={`tm-opt-cell ${s.why} ${s.in ? 'in' : ''}`}>
                            <button type="button" disabled={locked} onClick={() => toggle(i, layer, s)} title={`${o.def.name} · ${layer}: ${WHY[s.why]}`}>{MARK[s.why]}</button>
                          </td>
                        );
                      })}
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
        {!locked && (
          <div className="tm-opt-add">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="새 Option 이름 (예: 1P10M_7X2Z)" />
            <label className="small">Metal <input className="input tm-mini-input num" type="number" min="1" value={metals} onChange={(e) => setMetals(e.target.value)} /></label>
            <button type="button" className="btn" onClick={add} disabled={!name.trim()}><Icon name="plus" size={14} /> Option 추가</button>
            <button type="button" className="btn ghost" onClick={() => go({ page: 'classes' })}>분류 고치기</button>
          </div>
        )}
      </section>
      {opts.some((o) => o.check.issues.length) && (
        <section className="panel">
          <h2>Option 점검</h2>
          <ul className="tm-checks flat">
            {opts.flatMap((o) => o.check.issues.map((x, k) => (
              <li key={`${o.def.name}-${k}`}><Pill tone={LEVEL_TONE[x.level]}>{x.level}</Pill><b>{o.def.name}</b><span>{x.msg}</span></li>
            )))}
          </ul>
        </section>
      )}
    </div>
  );
}
