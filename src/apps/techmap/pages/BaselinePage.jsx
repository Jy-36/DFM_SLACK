// Baseline: LPP 목록(색 견본·GDS·공유 packet) · 파일 간 점검 · 파일 저장 · 새 baseline 등록
import { useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { Swatch } from '../components/RequestCard.jsx';
import { saveFile } from '../lib/report.js';
import { techSet } from '../lib/view.js';
import { loadSet } from '../lib/model.js';

export default function BaselinePage({ baseline, latest, store, notify, go }) {
  const [view, setView] = useState('lpp');
  const [q, setQ] = useState('');
  const t = techSet(baseline);
  if (t?.error) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>baseline {baseline.id}</h1><p>{baseline.label}</p></div></div>
        <div className="banner tone-bad">파일을 읽지 못했어요: {t.error}</div>
      </div>
    );
  }
  const rows = t.lpps.filter((r) => !q || `${r.layer} ${r.purpose} ${r.packet} ${r.gds}`.toLowerCase().includes(q.toLowerCase()));
  const f = baseline.files;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>baseline {baseline.id} {latest && <Pill tone="accent">최신</Pill>}</h1>
          <p>{baseline.label} · {baseline.created} · {baseline.source}</p>
        </div>
        <div className="head-actions">
          {['tf', 'layermap', 'drf'].map((k) => (
            <button key={k} type="button" className="btn" onClick={() => saveFile(f[k].text, f[k].name, 'text/plain')}><Icon name="download" size={14} /> {f[k].name}</button>
          ))}
          <button type="button" className="btn primary" onClick={() => go({ page: 'upload', baseline: baseline.id })}><Icon name="plus" size={15} /> 이 기준으로 Request 검토</button>
        </div>
      </div>

      <section className="panel stats tm-stats">
        <div className="stat"><span className="label">Layer</span><span className="value">{t.ts.tf.layerByName().size}</span></div>
        <div className="stat"><span className="label">LPP (display)</span><span className="value">{t.lpps.length}</span></div>
        <div className="stat"><span className="label">layermap 행</span><span className="value">{t.ts.lm.rows.length}</span></div>
        <div className="stat"><span className="label">파일 간 점검</span><span className={`value ${t.issues.length ? 'tone-warn' : 'tone-good'}`}>{t.issues.length}</span><span className="foot">{t.issues.length ? '확인 필요' : '불일치 없음'}</span></div>
      </section>

      <div className="tm-bar">
        <div className="seg" role="group" aria-label="보기">
          <button type="button" aria-pressed={view === 'lpp'} onClick={() => setView('lpp')}>LPP 목록 <span className="num">{t.lpps.length}</span></button>
          <button type="button" aria-pressed={view === 'issues'} onClick={() => setView('issues')}>파일 간 점검 <span className="num">{t.issues.length}</span></button>
        </div>
        {view === 'lpp' && <input className="input tm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Layer · Purpose · packet · GDS 검색" />}
      </div>

      {view === 'lpp' ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="data-table tm-lpp">
              <thead>
                <tr><th>Layer</th><th>#</th><th>Purpose</th><th>GDS</th><th>Packet</th><th>Fill</th><th>Outline</th><th>Stipple</th><th>Line</th><th>FillStyle</th><th>tf 줄</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td><b>{r.layer}</b></td>
                    <td className="num">{r.layerNo}</td>
                    <td>{r.purpose}</td>
                    <td className="num">{r.gds || <Pill tone="warn">없음</Pill>}</td>
                    <td className="mono">{r.packet}{r.shared && <Pill tone="leave">공유</Pill>}</td>
                    <td><Swatch name={r.fill} colors={t.colors} /></td>
                    <td><Swatch name={r.outline} colors={t.colors} /></td>
                    <td className="mono">{r.stipple}</td>
                    <td className="mono">{r.linestyle}</td>
                    <td className="mono">{r.fillStyle}</td>
                    <td className="num muted">{r.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel">
          {t.issues.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>구분</th><th>파일</th><th>줄</th><th>내용</th></tr></thead>
                <tbody>
                  {t.issues.map((i, k) => (
                    <tr key={k}><td><Pill tone={i.level === 'error' ? 'bad' : 'warn'}>{i.level}</Pill></td><td>{i.file}</td><td className="num">{i.line}</td><td className="tm-wrap">{i.msg}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">techfile · layermap · drf 사이에 불일치가 없어요.</p>
          )}
        </section>
      )}

      <NewBaseline store={store} notify={notify} go={go} />
    </div>
  );
}

/** tf · layermap · drf 세 파일로 새 baseline 등록 */
export function NewBaseline({ store, notify, go }) {
  const [files, setFiles] = useState({});
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const pick = async (k, file) => {
    if (!file) return;
    const text = await file.text();
    setFiles((f) => ({ ...f, [k]: { name: file.name, text } }));
    setErr('');
  };
  const ready = files.tf && files.layermap && files.drf;
  const submit = () => {
    try {
      loadSet(files); // 괄호 짝 등 읽기 확인
    } catch (e) {
      setErr(`파싱 실패: ${e.message}`);
      return;
    }
    const b = store.actions.addBaseline(files, label.trim() || '업로드 baseline', '파일 업로드');
    setFiles({});
    setLabel('');
    notify(`baseline ${b.id} 등록`);
    go({ page: 'baseline', id: b.id });
  };
  return (
    <section className="panel">
      <h2>새 baseline 등록 <span className="small muted">지금 쓰는 파일 세 개를 올리면 다음 버전으로 저장돼요</span></h2>
      <div className="tm-pick-grid">
        {[['tf', 'Technology file (.tf)'], ['layermap', 'Layer map'], ['drf', 'Display resource (.drf)']].map(([k, label2]) => (
          <label key={k} className="field">
            <span>{label2}</span>
            <input className="input" type="file" onChange={(e) => pick(k, e.target.files[0])} />
            {files[k] && <span className="small muted">{files[k].name} · {files[k].text.split('\n').length}줄</span>}
          </label>
        ))}
        <label className="field">
          <span>이름</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 3nm BEOL rev12" />
        </label>
      </div>
      {err && <p className="small tone-bad">{err}</p>}
      <div><button type="button" className="btn primary" disabled={!ready} onClick={submit}>등록</button></div>
    </section>
  );
}
