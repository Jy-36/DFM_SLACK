// 분류 · 기능키: 이름으로 자동 추정하고, 다르면 Process별로 고친다. Option 자동 구성과 Master 비교의 기준
import { useState } from 'react';
import { Pill } from '../../../shared/ui.jsx';
import { CLASS_LABEL, CLASSES, classOf, guessClass, autoKey } from '../lib/classify.js';
import { setClass } from '../lib/workspace.js';
import { techSetOf } from '../lib/revision.js';

export default function ClassesPage({ proc, store, notify }) {
  const [q, setQ] = useState('');
  const t = techSetOf(proc.master.files);
  if (!t?.ts) return <div className="page"><div className="banner tm-err">Master 파일을 읽지 못했어요</div></div>;
  const layers = [...t.ts.tf.layerByName()].sort((a, b) => Number(a[1].tokens[1]) - Number(b[1].tokens[1]));
  const set = (layer, patch) => store.update((ws) => setClass(ws, proc.id, layer, patch));
  const rows = layers.filter(([l]) => !q || l.toLowerCase().includes(q.toLowerCase()));
  const manual = Object.keys(proc.classes || {}).length;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{proc.name} 분류 · 기능키</h1>
          <p>
            분류는 Option(Metal/Via Stack) 자동 구성에, 기능키는 다른 노드 Master와 번호를 맞출 때 쓰여요. 이름으로 자동 추정하고, 다르면 여기서 고쳐요.
            {manual > 0 && <> · 직접 고친 Layer <b>{manual}</b>개</>}
          </p>
        </div>
        <input className="input tm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Layer 검색" />
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table tm-classes">
            <thead><tr><th className="r">Layer#</th><th>Layer</th><th>분류</th><th>Level</th><th>기능키</th><th>자동 추정</th><th /></tr></thead>
            <tbody>
              {rows.map(([layer, r]) => {
                const c = classOf(layer, proc.classes);
                const g = guessClass(layer);
                const o = proc.classes?.[layer] || {};
                const needsLevel = c.cls === 'METAL' || c.cls === 'VIA';
                return (
                  <tr key={layer} className={c.auto ? '' : 'tm-manual'}>
                    <td className="num r">{r.tokens[1]}</td>
                    <td><b>{layer}</b></td>
                    <td>
                      <select className="input tm-mini-input" value={c.cls} onChange={(e) => set(layer, { cls: e.target.value === g.cls ? '' : e.target.value })}>
                        {CLASSES.map((k) => <option key={k} value={k}>{CLASS_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td>
                      {needsLevel ? (
                        <input className="input tm-mini-input num" style={{ width: 64 }} value={c.level ?? ''} onChange={(e) => set(layer, { level: e.target.value === '' || Number(e.target.value) === g.level ? '' : Number(e.target.value) })} />
                      ) : <span className="muted">-</span>}
                    </td>
                    <td>
                      <input className="input tm-mini-input mono" style={{ width: 130 }} value={o.key || ''} placeholder={autoKey(layer, c)} onChange={(e) => set(layer, { key: e.target.value.trim() })} />
                    </td>
                    <td className="small muted">{CLASS_LABEL[g.cls]}{g.level != null ? ` ${g.level}` : ''}</td>
                    <td>{!c.auto && <button type="button" className="btn small" onClick={() => { set(layer, { cls: '', level: '', key: '' }); notify(`${layer} 자동으로 되돌림`); }}>자동으로</button>}{!c.auto && <Pill tone="accent">직접</Pill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
