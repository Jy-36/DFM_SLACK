// Process 추가 (Master tf · layermap · drf 세 파일) · Master 파일 · history 보기
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { loadSet } from '../lib/model.js';
import { saveFile } from '../lib/report.js';
import { addProcess } from '../lib/workspace.js';

/** proc가 있으면 그 노드에 Master 등록, 없으면 새 노드 추가 */
export function NewProcessPage({ store, notify, go, proc = null }) {
  const [id, setId] = useState(proc?.name || '');
  const [files, setFiles] = useState({});
  const [err, setErr] = useState('');
  const pick = async (k, f) => {
    if (!f) return;
    const text = await f.text();
    setFiles((x) => ({ ...x, [k]: { name: f.name, text } }));
  };
  const ready = id.trim() && files.tf && files.layermap && files.drf;
  const submit = () => {
    try {
      loadSet(files);
      const out = store.update((w) => addProcess(w, id.trim(), files, '업로드'));
      const p = out.processes.find((x) => x.name === id.trim());
      notify(proc ? `${proc.name} Master 등록` : `노드 ${id.trim()} 추가`);
      go({ page: 'registry', proc: p?.id });
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <div className="page">
      <div className="page-head"><div>
        <h1>{proc ? `${proc.name} Master 등록` : '노드 추가'}</h1>
        <p>{proc ? `${proc.name} 노드에 아직 Master가 없어요. ` : ''}뼈대 공정의 Master techfile · layermap · drf를 올리면 번호 대장이 만들어지고, 그 아래에 DK(SF2 · SF3 …)를 만들 수 있어요.</p>
      </div></div>
      <section className="panel">
        <div className="tm-pick-grid">
          {!proc && <label className="field"><span>노드 이름</span><input className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder="예: 3nm · 1.4nm" /><span className="small muted">폴더 이름에는 / 대신 _ (예: 8/10nm → 8_10nm)</span></label>}
          {[['tf', 'Master techfile (.tf)'], ['layermap', 'Master layermap'], ['drf', 'Master display.drf']].map(([k, l]) => (
            <label key={k} className="field">
              <span>{l}</span>
              <input className="input" type="file" onChange={(e) => pick(k, e.target.files[0])} />
              {files[k] && <span className="small muted">{files[k].name} · {files[k].text.split('\n').length}줄</span>}
            </label>
          ))}
        </div>
        {err && <div className="banner tm-err">{err}</div>}
        <button type="button" className="btn primary" disabled={!ready} onClick={submit}><Icon name="plus" size={15} /> {proc ? 'Master 등록' : '추가'}</button>
      </section>
    </div>
  );
}

export function MasterFilesPanel({ proc }) {
  const f = proc.master.files;
  return (
    <section className="panel">
      <h2>{proc.name} Master 파일 <span className="small muted">갱신 {proc.master.updated}</span></h2>
      <div className="head-actions">
        {['tf', 'layermap', 'drf'].map((k) => <button key={k} type="button" className="btn" onClick={() => saveFile(f[k].text, f[k].name, 'text/plain')}><Icon name="download" size={14} /> {f[k].name}</button>)}
        <button type="button" className="btn" onClick={() => saveFile(proc.master.history || '', `${proc.id}_master_history.txt`, 'text/plain')}><Icon name="download" size={14} /> history</button>
      </div>
    </section>
  );
}
