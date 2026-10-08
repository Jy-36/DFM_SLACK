// Layer List 편집: 직접 입력 · 엑셀/CSV 붙여넣기 · CSV 열기 · 예시. No 순서 = STEP2 투입 순서 = MTO 순서
import { useMemo, useRef, useState } from 'react';
import { Icon, Pill } from '../../../shared/ui.jsx';
import { parseLayerText, validateLayers } from '../lib/layers.js';
import { fmtShort } from '../lib/dates.js';
import { loadExample } from './Overview.jsx';
import ProjectBar from '../components/ProjectBar.jsx';

export default function LayerList({ state, dispatch, project, calc, calcs, notify }) {
  const { layers } = project;
  const rev = project.kind === 'revision';
  const types = Object.keys(state.config.step2Tat);
  const config = calc.config;
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const fileRef = useRef(null);
  const issues = useMemo(() => validateLayers(layers, types, { revision: rev }), [layers, types.join(), rev]);
  const bad = useMemo(() => {
    const m = new Map();
    issues.forEach((i) => m.set(`${i.index}:${i.field}`, i.msg));
    return m;
  }, [issues]);
  const mtoOf = useMemo(() => new Map((calc.result?.layers || []).map((l) => [l.no, l])), [calc.result]);

  const set = (next, undoMsg) => {
    dispatch({ type: 'layers', layers: next, keepUndo: !!undoMsg });
    if (undoMsg) notify(undoMsg, { label: '되돌리기', run: () => dispatch({ type: 'undoLayers' }) });
  };
  const edit = (i, patch) => set(layers.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const nextNo = () => (layers.length ? Math.max(...layers.map((l) => (Number.isFinite(l.no) ? l.no : 0))) + 1 : 1);
  const addRow = () => {
    const last = layers[layers.length - 1];
    set([...layers, { no: nextNo(), part: rev ? 'R' : last?.part || 'A', layer: '', type: last?.type || types[0] }]);
  };

  const applyPaste = (mode) => {
    const rows = parseLayerText(text, { noPart: rev });
    if (!rows.length) {
      notify(rev ? '붙여넣은 내용에서 Layer를 찾지 못했어요 (Layer · Type 열 필요)' : '붙여넣은 내용에서 Layer를 찾지 못했어요 (Part · Layer · Type 열 필요)');
      return;
    }
    if (mode === 'append') {
      const base = nextNo() - 1;
      set([...layers, ...rows.map((r, i) => ({ ...r, no: base + i + 1 }))], `${rows.length}장을 뒤에 추가했어요`);
    } else {
      set(rows, `Layer ${rows.length}장으로 바꿨어요`);
    }
    setPaste(false);
    setText('');
  };

  const openCsv = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const rows = parseLayerText(await f.text(), { noPart: rev });
    if (!rows.length) return notify(`${f.name}에서 Layer를 찾지 못했어요`);
    set(rows, `${f.name}에서 ${rows.length}장을 불러왔어요`);
  };

  const renumber = () => set([...layers].map((l, i) => ({ ...l, no: i + 1 })), 'No를 1부터 다시 매겼어요');
  const sortByNo = () => set([...layers].sort((a, b) => a.no - b.no));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= layers.length) return;
    const next = [...layers];
    // 자리만 바꾸고 No도 서로 바꿔서 순서를 유지
    [next[i], next[j]] = [{ ...next[j], no: next[i].no }, { ...next[i], no: next[j].no }];
    set(next);
  };

  const counts = useMemo(() => {
    const c = {};
    for (const l of layers) c[`${l.part}`] = (c[`${l.part}`] || 0) + 1;
    const t = {};
    for (const l of layers) t[l.type] = (t[l.type] || 0) + 1;
    return { parts: c, types: t };
  }, [layers]);
  const unsorted = layers.some((l, i) => i > 0 && l.no < layers[i - 1].no);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{project.name} · Layer List</h1>
          <p>No 순서대로 STEP2에 투입하고, 같은 순서로 MTO합니다.{rev ? ' Revision은 Part 구분 없이 한 묶음이에요.' : ''} 바꾸면 바로 다시 계산돼요.</p>
        </div>
        <div className="head-actions">
          <button type="button" className={`btn ${paste ? 'primary' : ''}`} onClick={() => setPaste((v) => !v)}>
            <Icon name="copy" size={15} /> 엑셀 붙여넣기
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>CSV 열기</button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" hidden onChange={openCsv} />
          <button type="button" className="btn" onClick={() => loadExample(project, dispatch, notify)}>예시 {rev ? 5 : 30}장</button>
        </div>
      </div>

      <ProjectBar state={state} dispatch={dispatch} calcs={calcs} notify={notify} />

      {paste && (
        <section className="panel paste-panel">
          <h2>엑셀에서 복사해 붙여넣기 <span className="small muted">{rev ? '머리줄(No · Layer · Type)이 있으면 열 순서가 달라도 됩니다 · Part 열은 무시' : '머리줄(No · Part · Layer · Type)이 있으면 열 순서가 달라도 됩니다'}</span></h2>
          <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} autoFocus
            placeholder={rev ? 'No\tLayer\tType\n1\tM1\tX\n2\tV1\tY\n…' : 'No\tPart\tLayer\tType\n1\tA\tA-1\tX\n2\tA\tA-2\tZ\n…'} />
          <div className="head-actions end">
            <span className="small muted">{text.trim() ? `${parseLayerText(text, { noPart: rev }).length}장 인식` : ''}</span>
            <button type="button" className="btn ghost" onClick={() => setPaste(false)}>취소</button>
            <button type="button" className="btn" disabled={!layers.length} onClick={() => applyPaste('append')}>뒤에 추가</button>
            <button type="button" className="btn primary" onClick={() => applyPaste('replace')}>목록 바꾸기</button>
          </div>
        </section>
      )}

      {issues.length > 0 && (
        <div className="banner warn-banner" role="alert">
          <span><b>입력 확인 {issues.length}건</b> · {issues.slice(0, 3).map((i) => i.msg).join(' / ')}{issues.length > 3 && ' …'}</span>
        </div>
      )}

      <section className="panel">
        <h2>
          <span className="layer-sum">
            Layer {layers.length}장
            {!rev && Object.entries(counts.parts).sort().map(([p, n]) => <Pill key={p} tone="accent">Part {p} {n}</Pill>)}
            {Object.entries(counts.types).sort().map(([t, n]) => <Pill key={t} tone="neutral">{t} {n}</Pill>)}
          </span>
          <span className="head-actions">
            {unsorted && <button type="button" className="btn small-btn" onClick={sortByNo}>No 순서로 정렬</button>}
            <button type="button" className="btn small-btn" onClick={renumber} disabled={!layers.length}>No 다시 매기기</button>
            <button type="button" className="btn small-btn ghost danger" onClick={() => set([], '목록을 비웠어요')} disabled={!layers.length}>
              <Icon name="trash" size={14} /> 비우기
            </button>
          </span>
        </h2>
        <div className="table-wrap">
          <table className="data-table layer-edit">
            <thead>
              <tr>
                <th style={{ width: 84 }}>No</th>
                {!rev && <th style={{ width: 110 }}>Part</th>}
                <th>Layer</th>
                <th style={{ width: 120 }}>Type</th>
                <th className="r">STEP2 TAT</th>
                <th>STEP2 시작</th>
                <th>MTO</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {layers.map((l, i) => {
                const r = mtoOf.get(l.no);
                return (
                  <tr key={i}>
                    <td><input className={`input num cell ${bad.has(`${i}:no`) ? 'bad' : ''}`} type="number" value={Number.isFinite(l.no) ? l.no : ''} onChange={(e) => edit(i, { no: parseInt(e.target.value, 10) })} aria-label={`${i + 1}행 No`} /></td>
                    {!rev && (
                      <td>
                        <div className={`seg ${bad.has(`${i}:part`) ? 'bad' : ''}`} role="group" aria-label={`${i + 1}행 Part`}>
                          {['A', 'B'].map((p) => <button key={p} type="button" aria-pressed={l.part === p} onClick={() => edit(i, { part: p })}>{p}</button>)}
                        </div>
                      </td>
                    )}
                    <td><input className={`input cell ${bad.has(`${i}:layer`) ? 'bad' : ''}`} value={l.layer} placeholder={rev ? 'M1' : 'A-1'} onChange={(e) => edit(i, { layer: e.target.value })} aria-label={`${i + 1}행 Layer`} /></td>
                    <td>
                      <select className={`input cell ${bad.has(`${i}:type`) ? 'bad' : ''}`} value={types.includes(l.type) ? l.type : ''} onChange={(e) => edit(i, { type: e.target.value })} aria-label={`${i + 1}행 Type`}>
                        {!types.includes(l.type) && <option value="">{l.type || '선택'}</option>}
                        {types.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="num r">{config.step2Tat[l.type] ? `${config.step2Tat[l.type]}일` : '-'}</td>
                    <td className="num">{r ? <>{fmtShort(r.step2Start)}{r.step2WaitDays > 0 && <span className="tone-warn small"> +{r.step2WaitDays}</span>}</> : '-'}</td>
                    <td className="num">{r ? <>{fmtShort(r.mtoDate)}{r.mtoWaitDays > 0 && <span className="tone-warn small"> +{r.mtoWaitDays}</span>}</> : '-'}</td>
                    <td><div className="row-act">
                      <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} title="위로 (No 바꾸기)" aria-label="위로"><Icon name="chevron" size={14} /></button>
                      <button type="button" className="icon-btn sm down" onClick={() => move(i, 1)} disabled={i === layers.length - 1} title="아래로 (No 바꾸기)" aria-label="아래로"><Icon name="chevron" size={14} /></button>
                      <button type="button" className="icon-btn sm" onClick={() => set(layers.filter((_, k) => k !== i))} title="삭제" aria-label="삭제"><Icon name="close" size={14} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn ghost add-row" onClick={addRow}><Icon name="plus" size={15} /> 행 추가</button>
      </section>
    </div>
  );
}
