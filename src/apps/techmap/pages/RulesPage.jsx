// 처리 규칙: 바꾸면 열린 Request 묶음이 바로 다시 계산된다
export default function RulesPage({ store }) {
  const { settings, setSettings } = store;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>처리 규칙</h1>
          <p>모든 Request 묶음에 같이 적용돼요. 바꾸면 검토 결과와 수정 파일이 바로 다시 계산됩니다.</p>
        </div>
      </div>
      <section className="panel tm-rules">
        <label className="tm-rule">
          <input type="checkbox" checked={settings.tagChanges} onChange={(e) => setSettings({ tagChanges: e.target.checked })} />
          <span>
            <b>바꾼 줄 끝에 Req_ID 주석 남기기</b>
            <span className="small muted">예: <code>( VIA3  16  V3 )  ; REQ-001</code> · 폐기는 <code>; RETIRED REQ-007</code></span>
          </span>
        </label>
        <label className="tm-rule">
          <input type="checkbox" checked={settings.splitSharedPacket} onChange={(e) => setSettings({ splitSharedPacket: e.target.checked })} />
          <span>
            <b>공유 packet을 바꾸면 전용 packet 새로 만들기</b>
            <span className="small muted">끄면 공유 packet을 직접 고쳐서 같이 쓰는 LPP 표시도 함께 바뀌어요 (검토 필요로 표시)</span>
          </span>
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
      </section>
      <section className="panel">
        <h2>항상 지키는 것</h2>
        <ul className="tm-principles">
          <li><b>원본 양식 유지</b> — 파일을 새로 만들지 않고 줄 단위로 고쳐요. 새 행은 이웃 행의 컬럼 위치를 따르고, Windows 줄 끝(CRLF)도 그대로 둡니다.</li>
          <li><b>추측하지 않음</b> — GDS 번호가 없거나, purpose가 정의돼 있지 않거나, 폐기할 Layer가 룰에서 참조되면 자동으로 채우지 않고 검토 필요 · ERROR로 남겨요.</li>
          <li><b>사람이 승인</b> — READY만 기본 반영, 검토 필요는 체크해야 반영. 승인 · 제외 · 저장 · baseline 반영은 활동 기록에 남아요.</li>
          <li><b>같은 엑셀 안 충돌</b> — 엑셀 순서대로 처리하며 Layer 번호 · GDS 번호가 앞 Request와 겹치면 ERROR.</li>
          <li><b>packet 이름</b> — 기존 techDisplays에서 이름 규칙(예: <code>M1_drw</code>)을 찾아 같은 규칙으로 지어요.</li>
        </ul>
      </section>
    </div>
  );
}
