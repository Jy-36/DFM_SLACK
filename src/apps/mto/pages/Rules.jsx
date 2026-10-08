// 규칙: TAT · 동시 진행 · MTO 장수 · 휴일. 바꾸면 바로 다시 계산한다.
import { useState } from 'react';
import { Icon, InfoTip } from '../../../shared/ui.jsx';
import { DEFAULT_CONFIG, makeCalendar } from '../lib/scheduler.js';
import { fmtShort, isIsoDate } from '../lib/dates.js';
import { HOLIDAYS } from '../../../shared/holidays.js';

function NumField({ label, value, onChange, min = 0, max = 365, unit = '일', tip, allowEmpty, emptyLabel }) {
  return (
    <label className="field">
      <span>
        {label} {tip && <InfoTip text={tip} />}
      </span>
      <div className="num-field">
        <input
          className="input num"
          type="number"
          min={min}
          max={max}
          value={value ?? ''}
          placeholder={allowEmpty ? emptyLabel : undefined}
          onChange={(e) => {
            const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
            if (v == null && allowEmpty) onChange(null);
            else if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
          }}
        />
        <span className="muted">{unit}</span>
      </div>
    </label>
  );
}

export default function Rules({ state, dispatch, calc, notify }) {
  const c = state.config;
  const patch = (p) => dispatch({ type: 'config', patch: p });
  const [newType, setNewType] = useState('');
  const [newHol, setNewHol] = useState('');
  const used = new Set(state.projects.flatMap((p) => p.layers.map((l) => l.type)));
  const changed = JSON.stringify({ ...c }) !== JSON.stringify({ ...DEFAULT_CONFIG, extraHolidays: [...DEFAULT_CONFIG.extraHolidays] });

  const addType = () => {
    const k = newType.trim().toUpperCase();
    if (!k || c.step2Tat[k]) return;
    patch({ step2Tat: { ...c.step2Tat, [k]: 5 } });
    setNewType('');
  };
  const addHoliday = () => {
    if (!isIsoDate(newHol) || c.extraHolidays.includes(newHol)) return;
    patch({ extraHolidays: [...c.extraHolidays, newHol].sort() });
    setNewHol('');
  };

  const r = calc.result; // 선택한 묶음 기준
  const cal = makeCalendar(c);
  const pubInWindow = r ? cal.holidaysBetween(r.partAGds, r.finalMto).filter((h) => h.name !== '회사 휴무') : [];
  const years = [...new Set(Object.keys(HOLIDAYS).map((k) => k.slice(0, 4)))];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>규칙</h1>
          <p>Mask 공정 TAT와 운영 제약. 회사 기준이 바뀌면 여기서만 고치면 됩니다.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" disabled={!changed} onClick={() => { dispatch({ type: 'resetConfig' }); notify('규칙을 기본값으로 되돌렸어요'); }}>기본값으로</button>
        </div>
      </div>

      <section className="panel">
        <h2>공정 TAT <span className="small muted">달력일 · 시작은 근무일만, 시작 후에는 휴일에도 진행</span></h2>
        <div className="settings-grid">
          <NumField label="STEP1 TAT · Part A" value={c.step1Tat.A} min={1} onChange={(v) => patch({ step1Tat: { ...c.step1Tat, A: v } })} />
          <NumField label="STEP1 TAT · Part B" value={c.step1Tat.B} min={1} onChange={(v) => patch({ step1Tat: { ...c.step1Tat, B: v } })} />
          <NumField label="STEP1 TAT · Revision (기본)" value={c.revisionStep1Tat} min={1} tip="Revision은 Part A/B 없이 한 묶음. Revision마다 따로 바꿀 수 있고, 비워 두면 이 값" onChange={(v) => patch({ revisionStep1Tat: v })} />
          <NumField label="Part B GDS" value={c.partBOffsetDays} unit="일 뒤 (Part A 기준)" tip="Part B GDS = Part A GDS + 이 일수 (기본 14일 = 2주)" onChange={(v) => patch({ partBOffsetDays: v })} />
        </div>
        <h3 className="sub-h">STEP2 TAT · Type별</h3>
        <div className="type-grid">
          {Object.entries(c.step2Tat).map(([k, v]) => (
            <div key={k} className="type-card">
              <span className={`type-chip t-${k}`}>{k}</span>
              <div className="num-field">
                <input className="input num" type="number" min={1} max={60} value={v} onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (n >= 1 && n <= 60) patch({ step2Tat: { ...c.step2Tat, [k]: n } });
                }} aria-label={`Type ${k} TAT`} />
                <span className="muted">일</span>
              </div>
              <button type="button" className="icon-btn sm" disabled={used.has(k) || Object.keys(c.step2Tat).length <= 1}
                title={used.has(k) ? 'Layer List에서 쓰는 Type은 지울 수 없어요' : 'Type 지우기'} aria-label={`Type ${k} 지우기`}
                onClick={() => { const { [k]: _, ...rest } = c.step2Tat; patch({ step2Tat: rest }); }}>
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
          <div className="type-card add">
            <input className="input" maxLength={4} value={newType} placeholder="새 Type" onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addType()} />
            <button type="button" className="btn small-btn" onClick={addType} disabled={!newType.trim()}><Icon name="plus" size={14} /> 추가</button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>운영 제약 · 기본값 <span className="small muted">Product·Revision마다 [일정 현황]에서 따로 바꿀 수 있어요 (묶음끼리 공유 안 함)</span></h2>
        <div className="settings-grid">
          <NumField label="하루 MTO 가능 수" value={c.mtoPerDay} min={1} max={50} unit="장 / 근무일" tip="No 순서대로 하루 이 장수까지 MTO (규정 2~3장, 기본 2장)" onChange={(v) => patch({ mtoPerDay: v })} />
          <NumField label="STEP2 동시 진행 수" value={c.step2Concurrency} min={1} max={200} unit="장" allowEmpty emptyLabel="무제한" tip="어느 날이든 STEP2 중인 Layer 수 상한 (규정 4~5장, 기본 4장). 비우면 무제한" onChange={(v) => patch({ step2Concurrency: v })} />
          <NumField label="MTO 가능" value={c.mtoGapDays} min={0} max={30} unit="일 뒤 (STEP2 종료 기준)" tip="STEP2 마지막 날 + 이 일수부터 MTO 가능 (기본 1일)" onChange={(v) => patch({ mtoGapDays: v })} />
        </div>
      </section>

      <section className="panel">
        <h2>휴일 <span className="small muted">공휴일 표 {years.join('·')}년 (WorkTime과 공유)</span></h2>
        <label className="toggle-row">
          <input type="checkbox" checked={c.weekendsAreHolidays} onChange={(e) => patch({ weekendsAreHolidays: e.target.checked })} />
          주말(토·일)을 휴일로
        </label>
        <div className="hol-add">
          <span className="small muted">회사 휴무일 추가</span>
          <input className="input num" type="date" value={newHol} onChange={(e) => setNewHol(e.target.value)} />
          <button type="button" className="btn small-btn" onClick={addHoliday} disabled={!isIsoDate(newHol)}><Icon name="plus" size={14} /> 추가</button>
        </div>
        {c.extraHolidays.length > 0 && (
          <div className="chips-row">
            {c.extraHolidays.map((d) => (
              <span key={d} className="hol-chip">
                <span className="num">{fmtShort(d)}</span>
                <button type="button" onClick={() => patch({ extraHolidays: c.extraHolidays.filter((x) => x !== d) })} aria-label={`${d} 빼기`}><Icon name="close" size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {r && (
          <p className="small muted hol-window">
            현재 일정 기간({fmtShort(r.partAGds)} ~ {fmtShort(r.finalMto)}) 휴일:{' '}
            {pubInWindow.length ? pubInWindow.map((h) => `${fmtShort(h.date)} ${h.name}`).join(', ') : '없음'}
          </p>
        )}
      </section>
    </div>
  );
}
