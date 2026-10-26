// 번호 대장: Process Master의 Layer# × Purpose(datatype) 격자. 같은 Process 안 번호 관리가 한눈에 보이게
import { useMemo, useState } from 'react';
import { Pill } from '../../../shared/ui.jsx';
import { CLASS_LABEL, CLASSES } from '../lib/classify.js';
import { numberRegistry } from '../lib/registry.js';
import { techSetOf } from '../lib/revision.js';
import { colorsOf, LEVEL_TONE } from '../lib/view.js';

export default function RegistryPage({ proc, go }) {
  const t = techSetOf(proc.master.files);
  const [cls, setCls] = useState('ALL');
  const [q, setQ] = useState('');
  const reg = useMemo(() => (t?.ts ? numberRegistry(t.ts, proc.classes) : null), [t, proc.classes]);
  if (!reg) return <div className="page"><div className="banner tm-err">Master 파일을 읽지 못했어요: {t?.error}</div></div>;
  const colors = colorsOf(t.ts);
  const packets = t.ts.drf.packetRows();
  const rows = reg.rows.filter((r) => (cls === 'ALL' || r.cls === cls) && (!q || `${r.layer} ${r.num} ${r.key}`.toLowerCase().includes(q.toLowerCase())));
  const nums = reg.rows.map((r) => Number(r.num)).filter(Number.isFinite);
  // 빈 번호는 Marker를 뺀 본 Layer 범위에서만 센다 (Marker는 보통 230번대처럼 떨어져 있음)
  const max = Math.max(0, ...reg.rows.filter((r) => r.cls !== 'MARKER').map((r) => Number(r.num)).filter(Number.isFinite));
  const used = new Set(nums);
  const free = [];
  for (let i = 1; i <= max; i++) if (!used.has(i)) free.push(i);
  const errors = reg.issues.filter((i) => i.level === 'error');
  const others = reg.issues.filter((i) => i.level !== 'error');
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{proc.name} 번호 대장</h1>
          <p>Master 기준 Layer# · Purpose별 GDS layer/datatype. DK · Option은 여기 번호만 쓸 수 있어요. (Master 갱신 {proc.master.updated})</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={() => go({ page: 'classes' })}>분류 · 기능키</button>
          <button type="button" className="btn primary" onClick={() => go({ page: 'new', kind: 'master' })}>Master 변경 작업</button>
        </div>
      </div>

      <section className="panel stats tm-stats">
        <div className="stat"><span className="label">Layer</span><span className="value">{reg.rows.length}</span><span className="foot">Layer# 1 ~ {max}</span></div>
        <div className="stat"><span className="label">LPP</span><span className="value">{t.ts.tf.displayRows().size}</span><span className="foot">Purpose {reg.purposes.length}종</span></div>
        <div className="stat"><span className="label">번호 중복</span><span className={`value ${errors.length ? 'tone-bad' : 'tone-good'}`}>{errors.length}</span><span className="foot">Layer# · GDS</span></div>
        <div className="stat"><span className="label">빈 Layer#</span><span className="value">{free.length}</span><span className="foot">{free.length ? `1~${max} 중 ${free.slice(0, 12).join(', ')}${free.length > 12 ? ' …' : ''}` : '없음'}</span></div>
      </section>

      <section className="panel">
        <h2>
          Purpose 관례 <span className="small muted">이 노드에서 Purpose마다 가장 많이 쓰는 datatype — 벗어나면 표에 노란색</span>
        </h2>
        <div className="tm-chips">
          {reg.purposes.map((p) => (
            <span key={p} className="tm-chip static">
              <b>{p}</b> {reg.purposeNo[p] ? `#${reg.purposeNo[p]} · ` : ''}dt {reg.typical[p] ?? '-'}
            </span>
          ))}
        </div>
      </section>

      <div className="tm-bar">
        <div className="seg" role="group" aria-label="분류">
          {['ALL', ...CLASSES].map((k) => (
            <button key={k} type="button" aria-pressed={cls === k} onClick={() => setCls(k)}>
              {k === 'ALL' ? '전체' : CLASS_LABEL[k]} <span className="num">{k === 'ALL' ? reg.rows.length : reg.rows.filter((r) => r.cls === k).length}</span>
            </button>
          ))}
        </div>
        <input className="input tm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Layer · 번호 · 기능키 검색" />
      </div>

      <section className="panel">
        <div className="table-wrap tm-reg-wrap">
          <table className="data-table tm-reg">
            <thead>
              <tr>
                <th className="r">Layer#</th><th>Layer</th><th>분류</th><th>기능키</th>
                {reg.purposes.map((p) => <th key={p}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.layer}>
                  <td className="num r"><b>{r.num}</b></td>
                  <td><b>{r.layer}</b></td>
                  <td className="small">{CLASS_LABEL[r.cls]}{r.level != null ? ` ${r.level}` : ''}</td>
                  <td className="mono small">{r.key}</td>
                  {reg.purposes.map((p) => {
                    const c = r.cells[p];
                    if (!c) return <td key={p} className="tm-cell empty" />;
                    const pk = packets.get(c.packet);
                    const fill = pk ? colors[pk.tokens[4]] : null;
                    return (
                      <td key={p} className={`tm-cell ${c.noMap ? 'bad' : c.offType || c.offStream ? 'warn' : ''}`} title={`${r.layer}/${p} · packet ${c.packet}${c.hidden ? ' · 숨김' : ''}`}>
                        <span className="tm-sw"><i style={{ background: fill || 'transparent' }} /></span>
                        <span className="num">{c.gds || '없음'}</span>
                        {c.hidden && <span className="tm-hid">숨김</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(errors.length > 0 || others.length > 0) && (
        <section className="panel">
          <h2>점검 <span className="small muted">{reg.issues.length}건</span></h2>
          <ul className="tm-checks flat">
            {[...errors, ...others].slice(0, 80).map((i, k) => (
              <li key={k}><Pill tone={LEVEL_TONE[i.level]}>{i.level}</Pill><span>{i.msg}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
