// 새 작업: DK(Ver · 작업날짜 · Reference) 또는 Process Master 변경
import { useMemo, useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { CLASS_LABEL, classOf } from '../lib/classify.js';
import { techSetOf } from '../lib/revision.js';
import { newRevision } from '../lib/workspace.js';
import { compareVer, folderName, KIND_LABEL, parseVer, today8 } from '../lib/version.js';

export default function NewRevisionPage({ ws, proc, store, notify, go, initial = {} }) {
  const [kind, setKind] = useState(initial.kind || 'dk');
  const refRev = ws.revisions.find((r) => r.id === initial.ref);
  const dks = ws.dks.filter((d) => d.process === proc.id);
  const [dk, setDk] = useState(refRev?.dk || dks[0]?.id || `${proc.id}_DK`);
  const [ver, setVer] = useState(initial.ver || refRev?.ver || 'v1.0.0.0');
  const [workDate, setWorkDate] = useState(today8());
  const sameDk = ws.revisions.filter((r) => r.kind === 'dk' && r.dk === dk).sort((a, b) => compareVer(b.ver, a.ver) || b.workDate.localeCompare(a.workDate));
  const [ref, setRef] = useState(initial.ref || sameDk[0]?.id || 'master');
  const [err, setErr] = useState('');
  const masterTs = techSetOf(proc.master.files)?.ts;
  const masterLayers = masterTs ? [...masterTs.tf.layerByName().keys()] : [];
  const [picked, setPicked] = useState(() => new Set(masterLayers));
  const pv = parseVer(ver);
  const taken = ws.revisions.map((r) => r.folder);
  const preview = kind === 'dk' ? folderName(dk, ver, workDate, taken) : folderName(`${proc.id}_MASTER`, 'rev', workDate, taken).replace('_rev_', '_');
  const groups = useMemo(() => {
    const g = {};
    for (const l of masterLayers) {
      const c = classOf(l, proc.classes).cls;
      (g[c] = g[c] || []).push(l);
    }
    return g;
  }, [masterLayers.join(), proc.classes]);

  const create = () => {
    setErr('');
    try {
      const out = store.update((w) => newRevision(w, { kind, process: proc.id, dk: dk.trim(), ver: ver.trim(), workDate, ref: kind === 'dk' ? ref : 'master', layers: ref === 'master' ? [...picked] : null }, store.settings));
      notify(`새 작업 ${out.rev.folder}`);
      go({ page: 'rev', id: out.rev.id });
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>새 작업</h1>
          <p>정식 DK는 Reference를 가져와 추가 · 삭제 · 변경으로 작업해요. 작업 폴더는 <code>DK_Ver_작업날짜</code>로 만들어져요.</p>
        </div>
      </div>
      <section className="panel tm-form">
        <div className="seg" role="group" aria-label="작업 종류">
          <button type="button" aria-pressed={kind === 'dk'} onClick={() => setKind('dk')}>DK 작업</button>
          <button type="button" aria-pressed={kind === 'master'} onClick={() => setKind('master')}>{proc.id} Master 변경</button>
        </div>
        {kind === 'dk' ? (
          <div className="tm-pick-grid">
            <label className="field">
              <span>DK</span>
              <input className="input" list="tm-dks" value={dk} onChange={(e) => setDk(e.target.value)} />
              <datalist id="tm-dks">{dks.map((d) => <option key={d.id} value={d.id} />)}</datalist>
              <span className="small muted">{dks.some((d) => d.id === dk) ? '기존 DK' : '새 DK로 만들어요'}</span>
            </label>
            <label className="field">
              <span>Ver</span>
              <input className="input mono" value={ver} onChange={(e) => setVer(e.target.value)} placeholder="v1.0.0.0 · v1.0.0.0_exp_20261020 · v1.0.0.0_incr20261101" />
              <span className={`small ${pv.valid ? 'muted' : 'tone-bad'}`}>{pv.valid ? `${KIND_LABEL[pv.kind]} · 기본 ${pv.base}${pv.date ? ` · ${pv.date}` : ''}` : pv.error || '형식 확인'}</span>
            </label>
            <label className="field">
              <span>작업 날짜</span>
              <input className="input mono" value={workDate} onChange={(e) => setWorkDate(e.target.value.replace(/\D/g, '').slice(0, 8))} />
              <span className="small muted">YYYYMMDD · 같은 날 또 하면 _2</span>
            </label>
            <label className="field">
              <span>Reference</span>
              <select className="input" value={ref} onChange={(e) => setRef(e.target.value)}>
                {sameDk.map((r) => <option key={r.id} value={r.id}>{r.folder}{r.status === 'approved' ? ' ✓' : ' (작업중)'}</option>)}
                {ws.revisions.filter((r) => r.kind === 'dk' && r.process === proc.id && r.dk !== dk).map((r) => <option key={r.id} value={r.id}>{r.folder} (다른 DK)</option>)}
                <option value="master">{proc.id} MASTER에서 새로 꾸리기</option>
              </select>
              <span className="small muted">{ref === 'master' ? 'Master에서 쓸 Layer를 아래에서 골라요' : 'All Layer · Option · history를 이어받아요'}</span>
            </label>
          </div>
        ) : (
          <p className="small muted">현재 {proc.id} Master({proc.master.updated})를 시작점으로 Layer · Purpose 번호를 추가 · 변경해요. 승인하면 Process Master가 바뀌고, 다른 Process Master와 번호 비교 결과가 점검에 나와요.</p>
        )}
        <div className="banner">작업 폴더 <b className="mono">{preview}</b></div>
        {kind === 'dk' && ref === 'master' && (
          <div className="tm-layer-pick">
            <div className="small muted">Master에서 가져올 Layer ({picked.size}/{masterLayers.length}) — 이 DK에서 쓰지 않는 Layer는 빼세요</div>
            {Object.entries(groups).map(([cls, ls]) => (
              <div key={cls} className="tm-layer-group">
                <b className="small">{CLASS_LABEL[cls]}</b>
                {ls.map((l) => (
                  <label key={l} className={`tm-chip ${picked.has(l) ? 'on' : ''}`}>
                    <input type="checkbox" checked={picked.has(l)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(l); else n.delete(l); return n; })} /> {l}
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        {err && <div className="banner tm-err">{err}</div>}
        <div><button type="button" className="btn primary" onClick={create} disabled={kind === 'dk' && (!pv.valid || !dk.trim() || workDate.length !== 8)}><Icon name="plus" size={15} /> 작업 만들기</button></div>
      </section>
      {kind === 'dk' && sameDk.length > 0 && (
        <section className="panel">
          <h2>{dk} 작업 이력</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>폴더</th><th>Ver</th><th>종류</th><th>작업</th><th>상태</th></tr></thead>
              <tbody>
                {sameDk.map((r) => (
                  <tr key={r.id}><td className="mono">{r.folder}</td><td className="mono">{r.ver}</td><td>{KIND_LABEL[parseVer(r.ver).kind]}</td><td className="num">{r.workDate}</td><td><Pill tone={r.status === 'approved' ? 'good' : 'warn'}>{r.status === 'approved' ? '승인' : '작업중'}</Pill></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
