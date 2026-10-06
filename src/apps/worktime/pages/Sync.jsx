import { useState } from 'react';
import { runSync, parseAttendanceHtml, isTauri } from '../lib/sync.js';
import { sampleAttendanceHtml } from '../lib/mockData.js';
import { Pill } from '../../../shared/ui.jsx';
import { pad2 } from '../lib/time.js';

const stamp = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

export default function Sync({ state, dispatch, notify }) {
  const cfg = state.syncConfig;
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState(() => sampleAttendanceHtml(state.records));
  const [parsed, setParsed] = useState(null);
  const [parseErr, setParseErr] = useState(null);

  const setCfg = (patch) => dispatch({ type: 'sync/config', patch });
  const setCol = (k, v) => setCfg({ cols: { ...cfg.cols, [k]: Number(v) } });

  const start = async () => {
    setBusy(true);
    setLog([]);
    const add = (text, level = '') => setLog((l) => [...l, { t: stamp(), text, level }]);
    try {
      const { records, mode } = await runSync({ config: cfg, onLog: add });
      dispatch({ type: 'records/merge', records, mode });
      notify(`${Object.keys(records).length}일치 기록을 동기화했습니다.`);
    } catch (e) {
      add(e.message || String(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  const tryParse = () => {
    setParseErr(null);
    try {
      const r = parseAttendanceHtml(html, cfg);
      setParsed(r);
      if (r.rowCount === 0) setParseErr(`"${cfg.rowSelector}"에 맞는 행이 없습니다. 행 선택자를 확인하세요.`);
    } catch (e) {
      setParsed(null);
      setParseErr(e.message);
    }
  };

  const entries = parsed ? Object.entries(parsed.records).sort(([a], [b]) => (a < b ? 1 : -1)) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>사내 사이트 동기화</h1>
          <p>사내 근태 사이트에서 내 출퇴근·휴가 기록을 가져옵니다.</p>
        </div>
        <div className="head-actions">
          <Pill tone={isTauri() ? 'accent' : 'plan'}>{isTauri() ? '데스크톱 앱' : '미리보기 · 가짜 동기화'}</Pill>
          <button className="btn primary" onClick={start} disabled={busy}>
            {busy ? '동기화 중…' : '지금 동기화'}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <h2>동작 방식</h2>
          <ol className="steps">
            <li>앱이 사내 근태 사이트를 새 창으로 엽니다.</li>
            <li>평소처럼 로그인하고 근태 조회 화면으로 이동합니다. 비밀번호는 앱에 저장하지 않습니다.</li>
            <li>앱이 화면의 근태 표를 찾아 읽고 창을 닫습니다.</li>
            <li>날짜별 출퇴근·근태 구분을 이 PC에만 저장합니다.</li>
          </ol>
          <div className="log" aria-live="polite">
            {log.length === 0 ? (
              <span className="muted">동기화 기록이 여기에 표시됩니다.</span>
            ) : (
              log.map((l, i) => (
                <div key={i} className={l.level}>
                  <span className="muted">{l.t}</span> {l.text}
                </div>
              ))
            )}
          </div>
          <span className="small muted">
            마지막 동기화: {state.lastSync ? new Date(state.lastSync).toLocaleString('ko-KR') : '없음'}
          </span>
        </section>

        <section className="panel" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <h2>수집 설정</h2>
          <label className="field">
            <span>근태 조회 화면 주소</span>
            <input className="input num" id="sync-url" value={cfg.portalUrl} onChange={(e) => setCfg({ portalUrl: e.target.value })} />
          </label>
          <label className="field">
            <span>근태 표 행 선택자 (CSS)</span>
            <input className="input num" id="sync-row" value={cfg.rowSelector} onChange={(e) => setCfg({ rowSelector: e.target.value })} />
          </label>
          <div>
            <span className="small muted">열 번호 (왼쪽부터 0)</span>
            <div className="cols" style={{ marginTop: 4 }}>
              {[
                ['date', '일자'],
                ['in', '출근'],
                ['out', '퇴근'],
                ['type', '근태구분'],
              ].map(([k, label]) => (
                <label className="field" key={k}>
                  <span>{label}</span>
                  <input className="input num" type="number" min="0" id={`col-${k}`} value={cfg.cols[k]} onChange={(e) => setCol(k, e.target.value)} />
                </label>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            근태구분 글자 → 앱 구분: {Object.entries(cfg.typeMap).map(([k, v]) => `${k}→${state.rules.leaveTypes[v]?.label || v}`).join(', ')}
          </p>
        </section>
      </div>

      <section className="panel" style={{ display: 'grid', gap: 12 }}>
        <h2>
          표 읽기 테스트
          <span className="small muted">실제 근태 화면의 표 HTML을 붙여넣어 설정을 맞춰보세요</span>
        </h2>
        <textarea className="input" id="sync-html" rows={9} value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} />
        <div className="head-actions">
          <button className="btn" onClick={tryParse}>표 읽어보기</button>
          {parsed && entries.length > 0 && (
            <button
              className="btn primary"
              onClick={() => {
                dispatch({ type: 'records/merge', records: parsed.records, mode: 'manual' });
                notify(`${entries.length}일치 기록을 반영했습니다.`);
              }}
            >
              읽은 {entries.length}일 기록에 반영
            </button>
          )}
          {parsed && (
            <span className="small muted">
              {parsed.rowCount}행 발견 · {entries.length}일 읽음{parsed.skipped.length ? ` · 날짜를 못 읽은 행 ${parsed.skipped.join(', ')}` : ''}
            </span>
          )}
        </div>
        {parseErr && <div className="banner" style={{ background: 'var(--bad-soft)' }}>{parseErr}</div>}
        {entries.length > 0 && (
          <div className="table-wrap">
            <table className="data-table num">
              <thead>
                <tr><th>일자</th><th>출근</th><th>퇴근</th><th>근태</th></tr>
              </thead>
              <tbody>
                {entries.map(([k, r]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{r.in || '—'}</td>
                    <td>{r.out || '—'}</td>
                    <td>{r.leave ? state.rules.leaveTypes[r.leave]?.label : '정상'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
