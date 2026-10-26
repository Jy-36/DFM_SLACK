// 처리 규칙 · 출력 위치 · 작업공간(가져오기 / 내보내기 / 초기화)
import { useRef } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { saveFile } from '../lib/report.js';
import { seedWorkspace } from '../lib/workspace.js';

export default function RulesPage({ store, notify }) {
  const { settings, setSettings, ws } = store;
  const fileRef = useRef(null);
  const importWs = async (f) => {
    if (!f) return;
    try {
      const v = JSON.parse(await f.text());
      if (v.version !== 2 || !Array.isArray(v.processes)) throw new Error('Techmap 작업공간 파일(version 2)이 아니에요');
      if (!window.confirm(`지금 작업공간을 '${f.name}' 내용으로 바꿀까요?`)) return;
      store.replace(v);
      notify('작업공간을 가져왔어요');
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>처리 규칙 · 작업공간</h1>
          <p>규칙을 바꾸면 열린 작업의 검토 결과와 수정 파일이 바로 다시 계산돼요 (승인한 작업은 고정).</p>
        </div>
      </div>
      <section className="panel tm-rules">
        <label className="tm-rule">
          <input type="checkbox" checked={settings.tagChanges} onChange={(e) => setSettings({ tagChanges: e.target.checked })} />
          <span><b>바꾼 줄 끝에 Req_ID 주석 남기기</b><span className="small muted">예: <code>( VIA3  16  V3 )  ; REQ-001</code> · 폐기는 <code>; RETIRED REQ-007</code></span></span>
        </label>
        <label className="tm-rule">
          <input type="checkbox" checked={settings.splitSharedPacket} onChange={(e) => setSettings({ splitSharedPacket: e.target.checked })} />
          <span><b>공유 packet을 바꾸면 전용 packet 새로 만들기</b><span className="small muted">끄면 공유 packet을 직접 고쳐서 같이 쓰는 LPP 표시도 함께 바뀌어요 (검토 필요)</span></span>
        </label>
        <div className="tm-rule">
          <span className="tm-rule-pad" />
          <span>
            <b>폐기(RETIRE)할 때 layermap 행</b>
            <span className="small muted">과거 GDS 재생성 호환 때문에 기본은 유지 — 사내 정책 확인 필요 [VERIFY]</span>
            <div className="seg" role="group" aria-label="layermap 처리">
              <button type="button" aria-pressed={settings.retireLayermap === 'keep'} onClick={() => setSettings({ retireLayermap: 'keep' })}>유지</button>
              <button type="button" aria-pressed={settings.retireLayermap === 'comment'} onClick={() => setSettings({ retireLayermap: 'comment' })}>주석 처리</button>
            </div>
          </span>
        </div>
        <div className="tm-rule">
          <span className="tm-rule-pad" />
          <span>
            <b>VWP 출력 위치</b>
            <span className="small muted">설치형 폴더 쓰기(다음 단계)에서 이 경로 아래에 <code>Process/DK/DK_Ver_작업날짜/</code>로 써요. 지금은 같은 구조의 zip으로 저장돼요.</span>
            <input className="input mono" style={{ maxWidth: 520 }} value={settings.vwpRoot} onChange={(e) => setSettings({ vwpRoot: e.target.value })} placeholder="예: \\\\vwp\\techmap 또는 D:\\VWP\\Techmap" />
          </span>
        </div>
      </section>
      <section className="panel">
        <h2>작업공간 <span className="small muted">Process {ws.processes.length} · DK {ws.dks.length} · 작업 {ws.revisions.length} — 이 PC에만 저장{store.persistent ? '' : ' (저장소를 쓸 수 없어 창을 닫으면 사라져요)'}</span></h2>
        <div className="head-actions">
          <button type="button" className="btn" onClick={() => saveFile(JSON.stringify(ws), `techmap_workspace_${new Date().toISOString().slice(0, 10)}.json`, 'application/json')}><Icon name="download" size={14} /> 내보내기 (.json · 백업)</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>가져오기</button>
          <input ref={fileRef} type="file" hidden accept=".json" onChange={(e) => { importWs(e.target.files[0]); e.target.value = ''; }} />
          <button type="button" className="btn ghost" onClick={() => { if (window.confirm('작업공간을 지우고 DEMO 데이터로 다시 시작할까요? (먼저 내보내기로 백업하세요)')) { store.replace(seedWorkspace(settings).ws); notify('DEMO로 초기화했어요'); } }}>DEMO로 초기화</button>
        </div>
      </section>
      <section className="panel">
        <h2>항상 지키는 것</h2>
        <ul className="tm-principles">
          <li><b>번호는 Master에서만</b> — DK · Option은 Master에 있는 LPP만 쓰고, 번호 · GDS가 Master와 다르면 ERROR. DK ADD는 Layer · Purpose만 쓰면 번호 · 표시를 Master에서 가져와요.</li>
          <li><b>다른 Master와 같은 목적 = 같은 번호</b> — 이름이 달라도 기능키가 같으면 GDS layer/datatype이 같아야 해요.</li>
          <li><b>원본 양식 유지</b> — 줄 단위 수정, 이웃 행 컬럼 배치 복제, CRLF 유지. Option 파일은 All에서 빠지는 Layer 행만 지워요.</li>
          <li><b>추측하지 않음 · 사람이 승인</b> — 모르는 값은 검토 필요/ERROR, READY만 기본 반영, 승인하면 고정되고 다음 작업의 Reference.</li>
        </ul>
      </section>
    </div>
  );
}
