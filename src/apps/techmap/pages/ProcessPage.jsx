// Process 추가 (Master tf · layermap · drf 세 파일) · Master 파일 · history 보기
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { loadSet } from '../lib/model.js';
import { saveFile } from '../lib/report.js';
import { addProcess } from '../lib/workspace.js';

export function NewProcessPage({ store, notify, go }) {
  const [id, setId] = useState('');
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
      store.update((w) => addProcess(w, id.trim(), files, '업로드'));
      notify(`Process ${id.trim()} 추가`);
      go({ page: 'registry', proc: id.trim() });
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Process 추가</h1><p>뼈대 공정의 Master techfile · layermap · drf를 올리면 번호 대장이 만들어져요.</p></div></div>
      <section className="panel">
        <div className="tm-pick-grid">
          <label className="field"><span>Process 이름</span><input className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder="예: SF3P" /></label>
          {[['tf', 'Master techfile (.tf)'], ['layermap', 'Master layermap'], ['drf', 'Master display.drf']].map(([k, l]) => (
            <label key={k} className="field">
              <span>{l}</span>
              <input className="input" type="file" onChange={(e) => pick(k, e.target.files[0])} />
              {files[k] && <span className="small muted">{files[k].name} · {files[k].text.split('\n').length}줄</span>}
            </label>
          ))}
        </div>
        {err && <div className="banner tm-err">{err}</div>}
        <button type="button" className="btn primary" disabled={!ready} onClick={submit}><Icon name="plus" size={15} /> 추가</button>
      </section>
    </div>
  );
}

export function MasterFilesPanel({ proc }) {
  const f = proc.master.files;
  return (
    <section className="panel">
      <h2>{proc.id} Master 파일 <span className="small muted">갱신 {proc.master.updated}</span></h2>
      <div className="head-actions">
        {['tf', 'layermap', 'drf'].map((k) => <button key={k} type="button" className="btn" onClick={() => saveFile(f[k].text, f[k].name, 'text/plain')}><Icon name="download" size={14} /> {f[k].name}</button>)}
        <button type="button" className="btn" onClick={() => saveFile(proc.master.history || '', `${proc.id}_master_history.txt`, 'text/plain')}><Icon name="download" size={14} /> history</button>
      </div>
    </section>
  );
}
