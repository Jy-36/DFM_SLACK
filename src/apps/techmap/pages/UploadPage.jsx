// Request 엑셀 올리기 (끌어다 놓기 · 파일 고르기). .xlsx / .csv
import { useRef, useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { readRequestFile } from '../lib/requests.js';

/** 파일 → batch 만들기. 화면 어디서든 쓴다 (App Mode 요약 포함) */
export async function uploadRequestFile(file, baselineId, store) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const requests = await readRequestFile(file.name, buf);
  if (!requests.length) throw new Error('읽은 Request가 0건이에요 — Req_ID 아래 줄에 내용을 넣어 주세요');
  return store.actions.addBatch({ name: file.name.replace(/\.(xlsx|csv)$/i, ''), file: file.name, baseline: baselineId, requests });
}

export default function UploadPage({ store, notify, go, prefBaseline }) {
  const latest = store.baselines[store.baselines.length - 1];
  const [base, setBase] = useState(prefBaseline || latest?.id);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const take = async (file) => {
    if (!file) return;
    setErr('');
    try {
      const b = await uploadRequestFile(file, base, store);
      notify(`Request ${b.requests.length}건 검토 시작`);
      go({ page: 'batch', id: b.id });
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Request 업로드</h1>
          <p>Site Request를 양식 엑셀로 정리해 올리면 Request마다 검사하고 바뀔 줄을 보여 줘요.</p>
        </div>
        <div className="head-actions">
          <a className="btn" href="/techmap/techmap_request_template.xlsx" download><Icon name="download" size={14} /> 빈 양식</a>
          <a className="btn" href="/techmap/techmap_request_sample.xlsx" download><Icon name="download" size={14} /> 예시 9건</a>
        </div>
      </div>
      <section className="panel">
        <label className="field tm-base-pick">
          <span>검토 기준 baseline</span>
          <select className="input" value={base} onChange={(e) => setBase(e.target.value)}>
            {[...store.baselines].reverse().map((b) => <option key={b.id} value={b.id}>{b.id} · {b.label}</option>)}
          </select>
        </label>
        <div
          className={`tm-drop ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <Icon name="plus" size={22} />
          <b>Request 엑셀을 끌어다 놓거나 눌러서 고르세요</b>
          <span className="small muted">.xlsx (Request 시트 · Req_ID 헤더) 또는 .csv</span>
          <input ref={inputRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => { take(e.target.files[0]); e.target.value = ''; }} />
        </div>
        {err && <div className="banner tm-err">{err}</div>}
      </section>
      <section className="panel">
        <h2>Type별 처리</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Type</th><th>필수</th><th>처리</th></tr></thead>
            <tbody>
              <tr><td><b>ADD</b></td><td className="tm-wrap">Layer, Purpose (+신규 Layer면 Layer_No), GDS_Layer/Datatype, Fill_Color 또는 Packet</td><td className="tm-wrap">techLayers · techPurposes(필요 시) · Priorities · techDisplays · layermap · drDefinePacket/Color 추가</td></tr>
              <tr><td><b>CHANGE_DISPLAY</b></td><td className="tm-wrap">Layer, Purpose + 바꿀 값</td><td className="tm-wrap">packet 수정. 다른 LPP와 공유하면 전용 packet을 만들어 연결(검토 필요). Packet 칸에 현재 이름을 쓰면 공유 packet 직접 수정</td></tr>
              <tr><td><b>RETIRE</b></td><td className="tm-wrap">Layer (+Purpose, 비우면 Layer 전체)</td><td className="tm-wrap">지우지 않고 주석 처리 + RETIRED 표시. layermap은 기본 유지. 다른 곳에서 참조되면 검토 필요</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
