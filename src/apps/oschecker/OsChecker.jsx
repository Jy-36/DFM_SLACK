// OS Size Checker: 두 Text를 붙여 넣어 같은 Structure의 Size가 같은지 확인하는 DFM Slack 탭.
// A = Structure 표 (Size = UpperRightX × UpperRightY), B = Struct 목록 (Size = Chip X·Y × 0.98).
// 계산은 lib/parse.js (순수 함수, scripts/oschecker-check.mjs로 확인).
import { useEffect, useMemo, useState } from 'react';
import { Icon, Pill } from '../../shared/ui.jsx';
import { DfmLogo } from '../../shared/Logo.jsx';
import { isTauri } from '../../shared/platform.js';
import { parseA, parseB, compare, resultTsv, fmt, fmtSize, fmtDelta, STATUS_LABEL, DEFAULTS, SAMPLE_A, SAMPLE_B, A_FIELDS, B_FIELDS } from './lib/parse.js';
import './oschecker.css';

export const OSCHECKER_VERSION = '0.1.0';
const KEY = 'oschecker.state';
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') || {};
  } catch {
    return {};
  }
};
const TONE = { match: 'good', diff: 'bad', swap: 'warn', bad: 'bad', onlyA: 'neutral', onlyB: 'neutral' };
const FILTERS = [
  ['issue', '문제만'],
  ['all', '전체'],
  ['diff', '불일치'],
  ['swap', '뒤바뀜'],
  ['onlyA', 'A에만'],
  ['onlyB', 'B에만'],
  ['match', '일치'],
];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function useOsState() {
  const [s, setS] = useState(() => {
    const v = read();
    return { a: v.a || '', b: v.b || '', opt: { ...DEFAULTS, ...(v.opt || {}) } };
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* 저장 불가 */
    }
  }, [s]);
  const pa = useMemo(() => parseA(s.a), [s.a]);
  const pb = useMemo(() => parseB(s.b, s.opt.shrink), [s.b, s.opt.shrink]);
  const res = useMemo(() => compare(pa.items, pb.items, s.opt), [pa, pb, s.opt]);
  return { s, setS, pa, pb, res };
}

export default function OsChecker({ mode, setMode, widget, setWidget }) {
  const st = useOsState();
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);
  if (mode === 'widget') return <Widget res={st.res} setMode={setMode} widget={widget} setWidget={setWidget} />;
  const compact = mode === 'compact';
  return (
    <>
      <CheckerPage {...st} compact={compact} notify={setToast} expand={() => setMode('full')} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function CheckerPage({ s, setS, pa, pb, res, compact, notify, expand }) {
  const [filter, setFilter] = useState('issue');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const setOpt = (patch) => setS((x) => ({ ...x, opt: { ...x.opt, ...patch } }));
  const has = pa.items.length > 0 && pb.items.length > 0;
  const issues = res.total - res.counts.match;
  const rows = res.rows.filter((r) => (filter === 'all' ? true : filter === 'issue' ? r.status !== 'match' : r.status === filter) && (!q || r.key.toLowerCase().includes(q.toLowerCase())));
  const shrinkTxt = fmt(s.opt.shrink);

  const inputs = (
    <div className={`osc-inputs ${compact ? 'one' : ''}`}>
      <InputBox
        tag="A"
        title="Structure 표"
        hint={`항목 이름 | 값 | 값 … — Size = UpperRightX × UpperRightY`}
        placeholder={`${A_FIELDS.join('\t…\n')}\t…\n\n(왼쪽에 항목 이름, 오른쪽으로 Structure마다 값 — 엑셀에서 그대로 복사해 붙여 넣기)`}
        value={s.a}
        onChange={(v) => set({ a: v })}
        count={pa.items.length}
        warnings={[...(pa.missing.length && s.a.trim() ? [`없는 항목: ${pa.missing.join(', ')}`] : []), ...pa.warnings]}
      />
      <InputBox
        tag="B"
        title="Struct 목록"
        hint={`머리줄 + 한 줄에 한 건 — Size = Chip X × ${shrinkTxt} · Chip Y × ${shrinkTxt}`}
        placeholder={`${B_FIELDS.join('\t')}\n1\tTOP_CHIP\tMAIN\tchip.gds\t10000 x 8000\t…\n\n(머리줄까지 같이 복사해 붙여 넣기)`}
        value={s.b}
        onChange={(v) => set({ b: v })}
        count={pb.items.length}
        warnings={pb.warnings}
      />
    </div>
  );

  const options = (
    <div className="osc-opts">
      <label className="osc-opt">
        <span>B 배율</span>
        <input className="input num" type="number" step="0.001" min="0" value={s.opt.shrink} onChange={(e) => setOpt({ shrink: Number(e.target.value) || 0 })} aria-label="B Chip Size 배율" />
      </label>
      <label className="osc-opt">
        <span>허용 오차</span>
        <input className="input num" type="number" step="0.0001" min="0" value={s.opt.tol} onChange={(e) => setOpt({ tol: Math.max(0, Number(e.target.value) || 0) })} aria-label="허용 오차" />
      </label>
      <label className="osc-check">
        <input type="checkbox" checked={s.opt.ignoreCase} onChange={(e) => setOpt({ ignoreCase: e.target.checked })} />
        <span>이름 대소문자 무시</span>
      </label>
      <label className="osc-check">
        <input type="checkbox" checked={s.opt.allowSwap} onChange={(e) => setOpt({ allowSwap: e.target.checked })} />
        <span>가로·세로 뒤바뀜도 일치로</span>
      </label>
    </div>
  );

  const summary = (
    <div className="osc-sum" role="group" aria-label="비교 결과 요약">
      <button type="button" className={`osc-sum-item ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
        <span className="label">전체</span>
        <b className="num">{res.total}</b>
      </button>
      <button type="button" className={`osc-sum-item ${filter === 'match' ? 'on' : ''}`} onClick={() => setFilter('match')}>
        <span className="label">일치</span>
        <b className="num tone-good">{res.counts.match}</b>
      </button>
      <button type="button" className={`osc-sum-item ${filter === 'diff' ? 'on' : ''}`} onClick={() => setFilter('diff')}>
        <span className="label">불일치</span>
        <b className={`num ${res.counts.diff + res.counts.bad ? 'tone-bad' : ''}`}>{res.counts.diff + res.counts.bad}</b>
      </button>
      <button type="button" className={`osc-sum-item ${filter === 'swap' ? 'on' : ''}`} onClick={() => setFilter('swap')}>
        <span className="label">뒤바뀜</span>
        <b className={`num ${res.counts.swap ? 'tone-warn' : ''}`}>{res.counts.swap}</b>
      </button>
      <button type="button" className={`osc-sum-item ${filter === 'onlyA' || filter === 'onlyB' ? 'on' : ''}`} onClick={() => setFilter(res.counts.onlyA ? 'onlyA' : 'onlyB')}>
        <span className="label">한쪽만</span>
        <b className="num">{res.counts.onlyA + res.counts.onlyB}</b>
        <span className="osc-sum-foot">A {res.counts.onlyA} · B {res.counts.onlyB}</span>
      </button>
    </div>
  );

  const table = (
    <div className="table-wrap">
      <table className="data-table osc-table">
        <thead>
          <tr>
            <th>결과</th>
            <th>Structure</th>
            <th className="r">A · UR X × UR Y</th>
            {!compact && <th className="r">B · Chip Size</th>}
            <th className="r">B · × {shrinkTxt}</th>
            <th className="r">ΔX (A−B)</th>
            <th className="r">ΔY (A−B)</th>
            {!compact && <th>Module / GDS File</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open === r.key;
            const bad = r.status === 'diff';
            return [
              <tr key={r.key} className={`osc-row s-${r.status} ${isOpen ? 'open' : ''}`} onClick={() => setOpen(isOpen ? null : r.key)} title="눌러서 원래 값 보기">
                <td>
                  <Pill tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                  {(r.dupA > 1 || r.dupB > 1) && <span className="osc-dup" title="같은 이름이 여러 번 — 첫 번째 값으로 비교">중복</span>}
                </td>
                <td className="mono osc-key">{r.key}</td>
                <td className="r num">{r.a ? fmtSize(r.a.w, r.a.h) : '-'}</td>
                {!compact && <td className="r num muted">{r.b ? fmtSize(r.b.chipX, r.b.chipY) : '-'}</td>}
                <td className="r num">{r.b ? fmtSize(r.b.w, r.b.h) : '-'}</td>
                <td className={`r num ${bad && Math.abs(r.dw) > s.opt.tol ? 'tone-bad' : 'muted'}`}>{fmtDelta(r.dw)}</td>
                <td className={`r num ${bad && Math.abs(r.dh) > s.opt.tol ? 'tone-bad' : 'muted'}`}>{fmtDelta(r.dh)}</td>
                {!compact && <td className="small muted osc-info">{[r.a?.raw.Module, r.b?.raw['GDS File']].filter(Boolean).join(' / ')}</td>}
              </tr>,
              isOpen && (
                <tr key={`${r.key}-d`} className="osc-detail">
                  <td colSpan={compact ? 5 : 8}>
                    <div className="osc-raw">
                      <RawBox title={`A · ${r.a?.src || '없음'}`} fields={A_FIELDS} rec={r.a?.raw} hi={['UpperRightX', 'UpperRightY', 'Structure']} />
                      <RawBox title={`B · ${r.b?.src || '없음'}`} fields={B_FIELDS} rec={r.b?.raw} hi={['Struct Name', 'Chip Size']} />
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
      {!rows.length && <p className="empty osc-empty">{res.total ? (filter === 'issue' ? '문제 없음 — 모든 Structure의 Size가 같아요' : '해당하는 항목이 없어요') : '양쪽 Text를 붙여 넣으면 바로 비교해요'}</p>}
    </div>
  );

  const tools = (
    <div className="osc-tools">
      <div className="seg" role="group" aria-label="결과 거르기">
        {FILTERS.filter(([k]) => !compact || ['issue', 'all', 'match'].includes(k)).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label}
            {k === 'issue' && issues > 0 && <span className="osc-badge">{issues}</span>}
          </button>
        ))}
      </div>
      <input className="input osc-search" placeholder="Structure 이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="button" className="btn small" disabled={!res.total} onClick={async () => notify((await copyText(resultTsv(res))) ? `결과 ${res.total}건을 복사했어요 — 엑셀에 붙여 넣기` : '복사하지 못했어요')}>
        <Icon name="copy" size={14} /> 결과 복사
      </button>
    </div>
  );

  const headBtns = (
    <div className="head-actions">
      <button type="button" className="btn small ghost" onClick={() => set({ a: SAMPLE_A, b: SAMPLE_B })}>샘플 넣기</button>
      <button type="button" className="btn small ghost" disabled={!s.a && !s.b} onClick={() => set({ a: '', b: '' })}>
        <Icon name="trash" size={14} /> 비우기
      </button>
    </div>
  );

  const verdict = has && (
    <div className={`osc-verdict ${issues ? 'bad' : 'good'}`} role="status">
      {issues ? (
        <><b>{issues}건 확인 필요</b> · 일치 {res.counts.match} / 전체 {res.total}{res.dups ? ` · 중복 이름 ${res.dups}` : ''}</>
      ) : (
        <><Icon name="check" size={16} /> <b>모두 일치</b> · {res.total}건{res.dups ? ` · 중복 이름 ${res.dups}` : ''}</>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="mini osc osc-compact fade-in">
        <section className="mini-card">
          <div className="mini-card-head">
            <h3>OS Size Checker</h3>
            {headBtns}
          </div>
          {inputs}
          {options}
        </section>
        {has && (
          <section className="mini-card">
            {verdict}
            {summary}
            {tools}
            {table}
            <button type="button" className="btn small" onClick={expand}>넓게 보기</button>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="osc fade-in">
      <main className="main">
        <div className="page">
          <div className="page-head">
            <div>
              <h1>OS Size Checker</h1>
              <p>두 Text를 붙여 넣으면 Structure ↔ Struct Name 으로 맞춰서 Size가 같은지 확인해요. A = UR X × UR Y, B = Chip Size × {shrinkTxt}.</p>
            </div>
            {headBtns}
          </div>
          <section className="panel osc-in-panel">
            {inputs}
            {options}
          </section>
          {has ? (
            <section className="panel">
              <h2>
                <span>비교 결과</span>
                {verdict}
              </h2>
              {summary}
              {tools}
              {table}
            </section>
          ) : (
            <div className="banner">
              {!pa.items.length && !pb.items.length ? 'A · B 양쪽에 Text를 붙여 넣어 주세요. 처음이면 [샘플 넣기]로 모양을 확인할 수 있어요.' : !pa.items.length ? 'A(Structure 표)를 읽지 못했어요 — 맨 왼쪽 칸에 Module · UpperRightX · Structure 같은 항목 이름이 있어야 해요.' : 'B(Struct 목록)를 읽지 못했어요 — Struct Name · Chip Size 머리줄을 같이 붙여 넣어 주세요.'}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function InputBox({ tag, title, hint, placeholder, value, onChange, count, warnings }) {
  const [showWarn, setShowWarn] = useState(false);
  return (
    <div className="osc-box">
      <div className="osc-box-head">
        <span className="osc-tag">{tag}</span>
        <b>{title}</b>
        <span className="osc-box-count">
          {value.trim() ? <Pill tone={count ? 'accent' : 'bad'}>{count}건 읽음</Pill> : <span className="small muted">비어 있음</span>}
        </span>
      </div>
      <span className="small muted osc-hint">{hint}</span>
      <textarea className="input mono osc-text" spellCheck={false} wrap="off" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={`${tag} ${title}`} />
      {warnings.length > 0 && (
        <div className="osc-warn">
          <button type="button" className="link-btn" onClick={() => setShowWarn((v) => !v)}>
            읽으며 확인한 것 {warnings.length}건 {showWarn ? '접기' : '보기'}
          </button>
          {showWarn && (
            <ul>
              {warnings.slice(0, 30).map((w, i) => <li key={i}>{w}</li>)}
              {warnings.length > 30 && <li>… 외 {warnings.length - 30}건</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RawBox({ title, fields, rec, hi }) {
  return (
    <div className="osc-rawbox">
      <div className="label">{title}</div>
      {rec ? (
        <dl>
          {fields.map((f) => (
            <div key={f} className={hi.includes(f) ? 'hi' : ''}>
              <dt>{f}</dt>
              <dd className="mono">{rec[f] || '-'}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="small muted">이 쪽에는 같은 이름이 없어요</p>
      )}
    </div>
  );
}

async function win(action) {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow()[action]();
  } catch {
    /* 창 API를 쓸 수 없는 환경 */
  }
}

function Widget({ res, setMode, widget, setWidget }) {
  const tauri = isTauri();
  const issues = res.total - res.counts.match;
  const pct = res.total ? res.counts.match / res.total : 0;
  return (
    <div className="widget" data-tauri-drag-region>
      <div className="wg-top" data-tauri-drag-region>
        <span className="wg-brand" data-tauri-drag-region>
          <DfmLogo size={18} />
          <span>OS Checker</span>
        </span>
        <span className="wg-actions">
          <button type="button" className={`wg-btn ${widget.onTop ? 'on' : ''}`} onClick={() => setWidget({ onTop: !widget.onTop })} disabled={!tauri}
            title={tauri ? (widget.onTop ? '항상 위 끄기' : '항상 위 켜기') : '항상 위는 설치형 앱에서만 됩니다'} aria-pressed={widget.onTop} aria-label="항상 위">
            <Icon name="pin" size={13} />
          </button>
          <button type="button" className="wg-btn" onClick={() => setMode('compact')} title="App Mode" aria-label="App Mode"><Icon name="appMode" size={13} /></button>
          <button type="button" className="wg-btn" onClick={() => setMode('full')} title="Window Mode" aria-label="Window Mode"><Icon name="windowMode" size={13} /></button>
          {tauri && <button type="button" className="wg-btn close" onClick={() => win('close')} title="닫기" aria-label="닫기"><Icon name="close" size={13} /></button>}
        </span>
      </div>
      <div className="wg-main" data-tauri-drag-region>
        <div className="wg-clock-wrap" data-tauri-drag-region>
          <span className="wg-label">확인 필요</span>
          <b className="wg-clock num">{res.total ? issues : '-'}</b>
        </div>
        {res.total > 0 && (
          <div className="wg-side">
            <span className="num"><small>일치</small> {res.counts.match}</span>
            <span className="num"><small>전체</small> {res.total}</span>
          </div>
        )}
      </div>
      <div className="wg-bar" aria-label={`일치 ${Math.round(pct * 100)}%`}><i style={{ width: `${pct * 100}%` }} /></div>
      <div className="wg-foot">
        <span className="num">{res.total ? `불일치 ${res.counts.diff} · 뒤바뀜 ${res.counts.swap} · 한쪽만 ${res.counts.onlyA + res.counts.onlyB}` : 'Text를 붙여 넣어 주세요'}</span>
        <label className="wg-opacity" title="투명도">
          <Icon name="drop" size={12} />
          <input type="range" min="35" max="100" step="5" value={Math.round(widget.opacity * 100)} onChange={(e) => setWidget({ opacity: Number(e.target.value) / 100 })} aria-label="투명도" />
        </label>
      </div>
    </div>
  );
}
