// 작업(리비전) 한 건: DK_Ver_작업날짜. 요청 검토 · Option · 점검 · 파일 변경 · History · codemate 변환 · 승인 · 폴더 출력
import { useEffect, useRef, useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import RequestCard from '../components/RequestCard.jsx';
import DiffView from '../components/DiffView.jsx';
import OptionMatrix from '../components/OptionMatrix.jsx';
import { readRequestFile } from '../lib/requests.js';
import { folderZip, revisionCsv, saveFile } from '../lib/report.js';
import { revisionFolder } from '../lib/revision.js';
import { addRequests, approveRevision, deleteRevision, freezeInclude, logRevision, setInclude, setOptions, updateRevision } from '../lib/workspace.js';
import { buildInbox } from '../lib/codemate.js';
import RevGraph from '../components/RevGraph.jsx';
import { isAncestor } from '../lib/graph.js';
import { mergeInto } from '../lib/workspace.js';
import { today8 } from '../lib/version.js';
import { KIND_LABEL, parseVer } from '../lib/version.js';
import { colorsOf, LEVEL_TONE } from '../lib/view.js';

const FILTERS = [['ALL', '전체'], ['READY', 'READY'], ['NEEDS_REVIEW', '검토 필요'], ['ERROR', 'ERROR']];

export default function RevisionPage({ ws, rev, c, store, notify, go }) {
  const [tab, setTab] = useState('requests');
  const [filter, setFilter] = useState('ALL');
  const [memo, setMemo] = useState('');
  const fileRef = useRef(null);
  const locked = rev.status === 'approved';
  const isDk = rev.kind === 'dk';
  const pv = parseVer(rev.ver);

  // 처음 계산한 기본 반영(READY) 목록 고정 → 이후 체크로만 바뀜
  useEffect(() => {
    if (!c.error && !rev.include && rev.requests.length) store.update((w) => freezeInclude(w, rev.id, c.applied));
  }, [rev.id, rev.include, rev.requests.length]);

  if (c.error) return <div className="page"><div className="banner tm-err">{c.error}</div></div>;
  const errors = c.checks.filter((x) => x.level === 'error');
  const warns = c.checks.filter((x) => x.level !== 'error');
  const items = c.res.items.filter((i) => filter === 'ALL' || i.status === filter);
  const colors = colorsOf(c.all);

  const upload = async (file) => {
    if (!file) return;
    try {
      const reqs = await readRequestFile(file.name, new Uint8Array(await file.arrayBuffer()));
      if (!reqs.length) throw new Error('읽은 요청이 0건이에요');
      store.update((w) => addRequests(w, rev.id, reqs, file.name));
      notify(`${file.name}: 요청 ${reqs.length}건`);
      setTab('requests');
    } catch (e) {
      notify(e.message);
    }
  };
  const exportFolder = () => {
    const base = revisionFolder(ws, rev, c);
    const root = base[0].path.split('/').slice(0, 3).join('/');
    const entries = [
      ...base,
      { path: `${root}/_techmap/review_report.csv`, data: revisionCsv(rev, c) },
      { path: `${root}/_techmap/changes.diff`, data: ['tf', 'layermap', 'drf'].map((k) => c.res.diffs[k]).join('') },
    ];
    saveFile(folderZip(entries), `${rev.folder}.zip`, 'application/zip');
    store.update((w) => logRevision(w, rev.id, 'system', `폴더 출력 (${entries.length}개 파일)`));
    notify('폴더 구조 그대로 zip으로 저장했어요 — VWP에 풀면 돼요');
  };
  const approve = () => {
    const msg = errors.length ? `점검 ERROR ${errors.length}건이 있어요. 그래도 승인할까요?` : `반영 ${c.applied.length}건으로 승인할까요? 승인하면 고정되고, 다음 작업의 Reference가 돼요.${rev.kind === 'master' ? '\n(Process Master가 이 결과로 바뀌어요)' : ''}`;
    if (!window.confirm(msg)) return;
    try {
      store.update((w) => approveRevision(w, rev.id, store.settings));
      notify('승인했어요');
    } catch (e) {
      notify(e.message);
    }
  };
  const sendMemo = () => {
    if (!memo.trim()) return;
    store.update((w) => logRevision(w, rev.id, 'comment', memo.trim()));
    setMemo('');
  };

  const tabs = [
    ['requests', `요청 검토 ${c.res.items.length}`],
    ...(isDk ? [['options', `Option ${c.options.length}`]] : []),
    ['checks', `점검 ${errors.length ? `· ERROR ${errors.length}` : c.checks.length}`],
    ['diff', '파일 변경'],
    ['history', 'History'],
    ['codemate', 'codemate 변환'],
    ...(isDk ? [['graph', '그래프']] : []),
  ];
  const mergeable = ws.revisions.filter((r) => r.process === rev.process && r.kind === rev.kind && r.id !== rev.id && !isAncestor(ws, r.id, rev.id));
  const doMerge = (srcId) => {
    const src = ws.revisions.find((r) => r.id === srcId);
    if (!src || !window.confirm(`${src.folder}의 변경(반영된 요청 · Option 예외)을 이 작업에 합칠까요?\n같은 LPP를 양쪽에서 바꿨으면 합친 요청이 ERROR로 보여요.`)) return;
    try {
      const out = store.update((w) => mergeInto(w, rev.id, srcId, store.settings));
      notify(`요청 ${out.added.length}건 합침${out.conflicts.length ? ` · Option 충돌 ${out.conflicts.length}건` : ''}`);
      if (out.conflicts.length) window.alert(out.conflicts.join('\n'));
      setTab('requests');
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="tm-rev-title">
            {isDk ? rev.dk : `${rev.process} MASTER`} {isDk && <span className="tm-ver">{rev.ver}</span>}
            {isDk && <Pill tone={pv.kind === 'release' ? 'accent' : 'plan'}>{KIND_LABEL[pv.kind] || pv.kind}</Pill>}
            <Pill tone={locked ? 'good' : 'warn'}>{locked ? `승인 ${rev.approvedAt}` : '작업중'}</Pill>
          </h1>
          <p className="mono small">{rev.folder}</p>
          <p>작업 {rev.workDate} · Reference {rev.ref?.label}{(rev.merges || []).length > 0 && <> · Merge ⟵ {rev.merges.map((m) => m.label).join(', ')}</>}</p>
        </div>
        <div className="head-actions">
          {!locked && <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="plus" size={15} /> 요청 올리기</button>}
          <input ref={fileRef} type="file" hidden accept=".xlsx,.csv,.json" onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
          {!locked && mergeable.length > 0 && (
            <select className="input tm-merge-pick" value="" onChange={(e) => e.target.value && doMerge(e.target.value)} title="다른 작업의 변경을 이 작업에 합치기">
              <option value="">⟵ 다른 작업 합치기…</option>
              {mergeable.map((r) => <option key={r.id} value={r.id}>{r.folder}{r.status === 'approved' ? ' ✓' : ' (작업중)'}</option>)}
            </select>
          )}
          <button type="button" className="btn" onClick={exportFolder}><Icon name="download" size={15} /> 폴더 출력 (.zip)</button>
          {!locked && <button type="button" className="btn primary" onClick={approve}><Icon name="check" size={15} /> 승인</button>}
          {locked && <button type="button" className="btn primary" onClick={() => go({ page: 'new', kind: rev.kind, ref: rev.id })}><Icon name="plus" size={15} /> 이걸 Reference로 새 작업</button>}
        </div>
      </div>

      <section className="panel stats tm-stats">
        <div className="stat"><span className="label">READY</span><span className="value tone-good">{c.counts.READY}</span><span className="foot">기본 반영</span></div>
        <div className="stat"><span className="label">검토 필요</span><span className="value tone-warn">{c.counts.NEEDS_REVIEW}</span><span className="foot">체크해야 반영</span></div>
        <div className="stat"><span className="label">ERROR</span><span className="value tone-bad">{c.counts.ERROR}</span><span className="foot">반영 불가</span></div>
        <div className="stat"><span className="label">점검</span><span className={`value ${errors.length ? 'tone-bad' : 'tone-good'}`}>{errors.length}</span><span className="foot">{errors.length ? 'ERROR — 승인 전 확인' : isDk ? 'Master 부분집합 · Option OK' : '다른 Master와 번호 OK'}</span></div>
      </section>

      <div className="tm-bar">
        <div className="seg" role="tablist" aria-label="보기">
          {tabs.map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'requests' && (
          <div className="seg" role="group" aria-label="상태 거르기">
            {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
        )}
      </div>

      {tab === 'requests' && (
        <div className="tm-thread">
          {!c.res.items.length && (
            <section className="panel">
              <p className="empty">아직 요청이 없어요. 엑셀(.xlsx · .csv) 또는 codemate가 만든 request.json을 올리세요.</p>
              <div className="head-actions">
                {!locked && <button type="button" className="btn primary" onClick={() => fileRef.current?.click()}>요청 올리기</button>}
                <a className="btn" href={`/techmap/techmap_request_${isDk ? 'dk' : 'master'}_sample.xlsx`} download>예시 엑셀 ({isDk ? 'DK' : 'Master'})</a>
                <a className="btn" href="/techmap/techmap_request_template.xlsx" download>빈 양식</a>
              </div>
            </section>
          )}
          {items.map((it) => (
            <RequestCard key={it.id} item={it} colors={colors} locked={locked} onToggle={(id, on) => { store.update((w) => setInclude(w, rev.id, c.applied, id, on)); notify(`${id} ${on ? '반영 승인' : '반영 제외'}`); }} />
          ))}
        </div>
      )}

      {tab === 'options' && (
        <OptionMatrix c={c} rev={rev} locked={locked} go={go} onChange={(options, note) => store.update((w) => setOptions(w, rev.id, options, note))} />
      )}

      {tab === 'checks' && (
        <section className="panel">
          <h2>점검 <span className="small muted">{isDk ? 'All ↔ Master 번호 · Option 스택 · 빠진 Layer 참조' : '다른 Process Master와 기능키별 번호'}</span></h2>
          {c.checks.length ? (
            <ul className="tm-checks flat">
              {[...errors, ...warns].map((x, k) => <li key={k}><Pill tone={LEVEL_TONE[x.level]}>{x.level}</Pill><b className="small">{x.scope}</b><span>{x.msg}</span></li>)}
            </ul>
          ) : <p className="empty">문제 없어요.</p>}
        </section>
      )}

      {tab === 'diff' && <DiffView res={c.res} />}

      {tab === 'history' && (
        <section className="panel">
          <h2>{isDk ? `${rev.dk}_history.txt` : `${rev.process}_master_history.txt`} <span className="small muted">이전 history 뒤에 이번 블록이 붙어요{locked ? '' : ' · 승인하면 승인 시각이 들어가요'}</span></h2>
          <pre className="tm-pre">{c.history}</pre>
        </section>
      )}

      {tab === 'graph' && isDk && (
        <section className="panel">
          <h2>{rev.dk} 버전 그래프 <span className="small muted">이 작업이 어디서 갈라졌고 무엇을 합쳤는지 · [→ 합치기]는 이 작업으로</span></h2>
          <RevGraph ws={ws} dk={rev.dk} process={rev.process} current={rev.id} target={locked ? null : rev.id}
            onOpen={(id) => go({ page: 'rev', id })}
            onBranch={(r) => go({ page: 'new', kind: 'dk', ref: r.id, ver: `${r.ver.replace(/_(exp|incr)_?\d{8}.*$/i, '')}_exp_${today8()}` })}
            onMerge={(r) => doMerge(r.id)} />
        </section>
      )}

      {tab === 'codemate' && <CodematePanel ws={ws} rev={rev} locked={locked} notify={notify} onImport={() => fileRef.current?.click()} />}

      <section className="panel">
        <h2>메모 · 활동</h2>
        <div className="tm-memo">
          <input className="input" value={memo} placeholder="판단 근거, 확인한 사람 등 · Enter" onChange={(e) => setMemo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && sendMemo()} />
          <button type="button" className="btn" onClick={sendMemo}>남기기</button>
        </div>
        <ul className="tm-log">
          {[...(rev.log || [])].reverse().slice(0, 50).map((l, i) => (
            <li key={i} className={l.kind}><span className="num muted">{l.at.slice(5)}</span>{l.kind === 'comment' ? <b>{l.text}</b> : <span>{l.text}</span>}</li>
          ))}
        </ul>
      </section>

      <div className="tm-foot-actions">
        {!locked && rev.requests.length > 0 && (
          <button type="button" className="btn ghost" onClick={() => window.confirm('올린 요청을 모두 지울까요? (Option 정의는 남아요)') && store.update((w) => updateRevision(w, rev.id, (r) => ({ ...r, requests: [], include: null })))}>요청 모두 지우기</button>
        )}
        <button type="button" className="btn ghost" onClick={() => { if (window.confirm(`${rev.folder} 작업을 지울까요?`)) { store.update((w) => deleteRevision(w, rev.id)); go({ page: 'home' }); } }}>
          <Icon name="trash" size={15} /> 이 작업 지우기
        </button>
      </div>
    </div>
  );
}

/** Site Request 원문 → codemate(opencode)로 request.json 만들기 */
function CodematePanel({ ws, rev, locked, notify, onImport }) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [pkg, setPkg] = useState(null);
  const make = () => {
    const b = buildInbox(ws, rev, text, source);
    setPkg(b);
    saveFile(folderZip(b.files), `${b.folder.split('/').pop()}.zip`, 'application/zip');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pkg.command);
      notify('명령을 복사했어요 — VSCode 터미널에 붙여 넣으세요');
    } catch {
      notify('복사하지 못했어요 · 직접 선택해 복사해 주세요');
    }
  };
  return (
    <section className="panel tm-cm">
      <h2>codemate로 요청 변환 <span className="small muted">Site 원문 → request.json (LLM은 표로 바꾸기만, 번호 확인 · 파일 수정은 앱이)</span></h2>
      <ol className="tm-steps">
        <li><b>원문 붙여넣기</b> — 메일 · Site 게시글 그대로</li>
        <li><b>inbox 받기</b> — site_request.txt · context.json(이 작업의 Master LPP · Option) · AGENTS.md(변환 규칙) · schema</li>
        <li><b>VSCode 터미널에서 opencode 실행</b> — 압축 푼 폴더에서 아래 명령. codemate가 request.json을 써요</li>
        <li><b>결과 가져오기</b> — request.json을 [요청 올리기]로</li>
      </ol>
      <label className="field"><span>출처 (선택)</span><input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="예: Site #1234 · 10/26 메일" /></label>
      <label className="field"><span>Site Request 원문</span><textarea className="input tm-ta" value={text} onChange={(e) => setText(e.target.value)} placeholder={'예) 9M Option에 PAD layer도 넣어 주시고, M5 drawing 색을 #3366FF로 바꿔 주세요. text layer는 사용자가 선택 못 하게 해 주세요.'} /></label>
      <div className="head-actions">
        <button type="button" className="btn primary" disabled={!text.trim()} onClick={make}><Icon name="download" size={15} /> inbox 받기 (.zip)</button>
        {!locked && <button type="button" className="btn" onClick={onImport}>codemate 결과(request.json) 가져오기</button>}
      </div>
      {pkg && (
        <div className="tm-cmd">
          <div className="small muted">압축을 푼 뒤 <code>&lt;압축 푼 경로&gt;</code>를 실제 경로로 바꿔 실행하세요</div>
          <pre className="tm-pre">{pkg.command}</pre>
          <button type="button" className="btn small" onClick={copy}><Icon name="copy" size={13} /> 명령 복사</button>
        </div>
      )}
    </section>
  );
}
