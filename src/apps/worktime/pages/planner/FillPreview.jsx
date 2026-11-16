// 채우기 미리보기 — 목표·시간대·일찍 퇴근을 바꾸는 유일한 화면 (GUIDE-ui-window §5, SPEC-goal-panel-v2 계산)
import { useMemo } from 'react';
import { planSummary, distributeByGoal, describePlan, goalPreview, excessForGoal, GOAL_IDS } from '../../lib/goal.js';
import { toMin } from '../../lib/time.js';
import { dayView, GOAL_LABEL } from './model.js';
import { Cell, gridOf, HEADS } from './CalendarView.jsx';
import { Kbd } from './ui.jsx';
import { clock, dur, signed, mdw } from './format.js';

/** 목표를 못 채우는 이유 한 줄: 무엇이 막는지 */
function failWhy(o, draft, rules) {
  if (o.capped) return '월 최대 근무 시간에 걸려요';
  const lim = draft.cutoff || rules.recognizeTo;
  const early = draft.earlyDays?.length ? ` · 일찍 퇴근 ${draft.earlyDays.length}요일` : '';
  return `자동 ${o.days}일을 ${draft.startIn || rules.planDefaultIn}–${lim}${early} 안에서 다 채워도 ${dur(o.gap)} 모자라요`;
}

const LV = { ok: ['✓ 여유', 'ok'], tight: ['빡빡', 'warn'], fail: ['불가', 'bad'], max: ['최대', 'acc'] };

export default function FillPreview(p) {
  const { draft, setDraft, onCancel, onApply, ctx, rules, summary, views, layout } = p;
  const { records, plans, pins, leaves, now } = ctx;
  const inc = rules.inclusiveOtMin ?? 840;
  const y = summary.year;
  const m = summary.month;

  const calc = useMemo(() => {
    const pv = planSummary({ year: y, month: m, records, rules, plans, pins, leaves, goal: draft, now });
    const r = distributeByGoal(pv, rules, plans, pins, draft);
    const lv = describePlan(pv, rules, draft, pins, r);
    const opts = goalPreview(pv, rules, plans, pins, draft).options;
    const after = planSummary({ year: y, month: m, records, rules, plans: { ...plans, ...r.plans }, pins, leaves, goal: draft, now });
    const nctx = { ...ctx, goal: draft, summary: after, advice: ctx.advice };
    const nviews = after.days.map((d) => dayView(d, nctx));
    // 해결안 칩: 못 채우면 suggestFixes, 채우면 바꿔 볼 만한 조건 3개
    let chips = [];
    const run = (g) => {
      const rr = distributeByGoal(pv, rules, plans, pins, g, null, true);
      return { rr, dd: describePlan(pv, rules, g, pins, rr) };
    };
    if (!r.feasible) {
      chips = r.suggestions.slice(0, 3).map((s) => ({ goal: s.goal, text: s.label, res: `초과 ${dur(s.reached)}`, bad: false }));
    } else {
      const alts = [];
      if (draft.cutoff) {
        const g = { ...draft, cutoff: clock(toMin(draft.cutoff) - 30) };
        alts.push({ g, text: `마지노선 ${g.cutoff}이면` });
      }
      const s0 = toMin(draft.startIn || rules.planDefaultIn);
      if (s0 - 30 >= toMin(rules.recognizeFrom)) {
        const g = { ...draft, startIn: clock(s0 - 30) };
        alts.push({ g, text: `출근 ${g.startIn}이면`, start: true });
      }
      if (draft.earlyDays?.length) alts.push({ g: { ...draft, earlyDays: [] }, text: '일찍 퇴근을 끄면' });
      else alts.push({ g: { ...draft, earlyDays: [5] }, text: '금요일 일찍 퇴근을 켜면' });
      chips = alts.map((a) => {
        const { rr, dd } = run(a.g);
        if (!rr.feasible && rr.wanted !== Infinity) return { goal: a.g, text: a.text, res: `${dur(rr.wanted - rr.reached)} 모자람`, bad: true };
        return { goal: a.g, text: a.text, res: a.start ? `평균 퇴근 ${clock(dd.avgOut)}` : `평균 ${dur(dd.avgNet)}`, bad: false };
      });
    }
    return { pv, r, lv, opts, after, nviews, chips };
  }, [y, m, records, rules, plans, pins, leaves, draft, now, ctx]);

  const oldOf = useMemo(() => Object.fromEntries(views.map((v) => [v.key, v])), [views]);
  const changed = {};
  for (const v of calc.nviews) {
    const o = oldOf[v.key];
    if (v.r && o?.r && v.r.net !== o.r.net && !v.d.isPast) changed[v.key] = v.r.net - o.r.net;
  }
  const nChanged = Object.keys(changed).length;
  const outPinned = calc.nviews.filter((v) => v.state === 'pin' && v.noteTone === 'warn').length;
  const { lv, r } = calc;

  const from = toMin(rules.recognizeFrom);
  const to = toMin(rules.recognizeTo);
  const pct = (x) => ((x - from) / (to - from)) * 100;
  const sIn = toMin(draft.startIn || rules.planDefaultIn);
  const sOut = draft.cutoff ? toMin(draft.cutoff) : to;
  const ticks = [from, 9 * 60, 18 * 60, to].filter((x, i, a) => x >= from && x <= to && a.indexOf(x) === i);

  const set = (patch) => setDraft({ ...draft, ...patch });
  const customH = Math.round(((draft.customExcessMin || inc) - inc) / 60);

  const resultText = (() => {
    if (draft.target === 'max') return `월 최대까지 · OT ${signed(lv.ot)}`;
    if (!r.feasible) return null;
    return `✓ ${GOAL_LABEL[draft.target] === '직접' ? `OT ${customH}h` : GOAL_LABEL[draft.target]}`;
  })();

  return (
    <div className="pl2-fill">
      <section className="pl2-cond" aria-label="채우기 조건">
        <div className="pl2-cond-row">
          <span className="pl2-cond-k">월말 목표 · 남은 자동 {calc.opts.ot0.days}일 기준</span>
          <div className="pl2-targets" role="radiogroup" aria-label="월말 목표">
            {GOAL_IDS.map((id) => {
              const o = calc.opts[id];
              const on = draft.target === id;
              const [lvText, lvTone] = LV[o.level];
              const name = id === 'ot0' ? `OT 0h · ${Math.round(inc / 60)}h까지` : GOAL_LABEL[id];
              return (
                <div key={id} className={`pl2-target ${on ? 'is-on' : ''}`} role="radio" aria-checked={on} tabIndex={0} onClick={() => set({ target: id })} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), set({ target: id }))}>
                  <b>{name}</b>
                  {id === 'custom' ? (
                    <span className="pl2-target-l">
                      OT{' '}
                      <input
                        type="number"
                        min={0}
                        max={60}
                        aria-label="원하는 OT 시간"
                        value={customH}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => set({ target: 'custom', customExcessMin: inc + Math.max(0, Number(e.target.value) || 0) * 60 })}
                      />
                      h{on ? ` · 하루 ${dur(o.avgNet)}` : ''}
                    </span>
                  ) : (
                    <span className="pl2-target-l">{id === 'max' ? `하루 ${dur(o.avgNet)} · OT ${signed(o.ot)}` : `하루 ${dur(o.avgNet)} · ${clock(o.avgOut)}`}</span>
                  )}
                  {id !== 'custom' || on ? (
                    <span className={`pl2-target-b pl2-target-b--${lvTone}`} title={o.level === 'fail' ? failWhy(o, draft, rules) : undefined}>
                      {o.level === 'fail' && o.gap ? `불가 · ${dur(o.gap)} 모자람` : lvText}
                    </span>
                  ) : null}
                  {o.level === 'fail' && on && <span className="pl2-target-why">{failWhy(o, draft, rules)}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="pl2-cond-row pl2-cond-3">
          <div className="pl2-stack">
            <span className="pl2-cond-k pl2-cond-kk">
              <span>출근 · 퇴근 마지노선</span>
              <span>하루 최대 {dur(Math.max(0, sOut - sIn - 60))}</span>
            </span>
            <div className="pl2-slider">
              <i className="pl2-slider-track" />
              <i className="pl2-slider-fill" style={{ left: `${pct(sIn)}%`, width: `${pct(sOut) - pct(sIn)}%` }} />
              <span className="pl2-slider-label" style={{ left: `${pct(sIn)}%` }}>
                {clock(sIn)}
              </span>
              <span className="pl2-slider-label" style={{ left: `${pct(sOut)}%` }}>
                {draft.cutoff ? clock(sOut) : '제한 없음'}
              </span>
              <input type="range" min={from} max={to} step={30} value={sIn} aria-label="전체 출근 시각" aria-valuetext={clock(sIn)} onChange={(e) => set({ startIn: clock(Math.min(Number(e.target.value), sOut - 240)) })} />
              <input type="range" min={from} max={to} step={30} value={sOut} aria-label="퇴근 마지노선" aria-valuetext={draft.cutoff ? clock(sOut) : '제한 없음'} onChange={(e) => set({ cutoff: clock(Math.max(Number(e.target.value), sIn + 240)) })} disabled={!draft.cutoff} />
            </div>
            <span className="pl2-ticks">
              {ticks.map((t) => (
                <span key={t} style={{ left: `${pct(t)}%` }}>
                  {clock(t)}
                </span>
              ))}
            </span>
            <span className="pl2-cond-opts">
              <label>
                <input type="checkbox" checked={!draft.cutoff} onChange={(e) => set({ cutoff: e.target.checked ? null : '19:00' })} /> 퇴근 제한 없음
              </label>
              <label>
                <input type="checkbox" checked={(draft.minDailyMin || 0) > 0} onChange={(e) => set({ minDailyMin: e.target.checked ? 360 : 0 })} /> 하루 최소 6시간
              </label>
            </span>
          </div>
          <div className="pl2-stack">
            <span className="pl2-cond-k">일찍 퇴근하는 요일</span>
            <div className="pl2-days">
              {[1, 2, 3, 4, 5].map((x) => {
                const on = draft.earlyDays?.includes(x);
                return (
                  <button key={x} type="button" aria-pressed={on} className={on ? 'is-on' : ''} onClick={() => set({ earlyDays: on ? draft.earlyDays.filter((z) => z !== x) : [...(draft.earlyDays || []), x].sort() })}>
                    {'일월화수목금토'[x]}
                  </button>
                );
              })}
            </div>
            {draft.earlyDays?.length > 0 && (
              <label className="pl2-cond-early">
                {draft.earlyDays.map((x) => '일월화수목금토'[x]).join('·')}요일은{' '}
                <select value={draft.earlyOut} onChange={(e) => set({ earlyOut: e.target.value })} aria-label="일찍 퇴근 시각">
                  {['16:00', '16:30', '17:00', '17:30', '18:00'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>{' '}
                까지
              </label>
            )}
          </div>
          <div className="pl2-stack pl2-cond-res">
            <span className="pl2-cond-k">이대로 채우면 월말</span>
            <div className="pl2-cond-big">
              <b>{dur(calc.after.projectedReq)}</b>
              {resultText ? <span>{resultText}</span> : <span className="is-bad">못 채워요</span>}
            </div>
            <span className="pl2-cond-desc">
              {r.feasible || draft.target === 'max'
                ? `자동 ${nChanged}일이 바뀌어요. 가장 늦은 퇴근 ${clock(lv.latestOut)}`
                : `${draft.cutoff || rules.recognizeTo}까지 해도 OT ${signed(lv.ot)}이 최대예요`}
              {outPinned ? ` · 직접 정한 ${outPinned}일이 범위를 벗어나요` : ''}
            </span>
          </div>
        </div>
      </section>

      {calc.chips.length > 0 && (
        <div className="pl2-whatif">
          <span className="pl2-lbl">{r.feasible ? '이렇게 바꾸면' : '해결안'}</span>
          {calc.chips.map((c) => (
            <button key={c.text} type="button" className="pl2-chip" onClick={() => setDraft(c.goal)}>
              {c.text} → <b className={c.bad ? 'is-bad' : ''}>{c.res}</b>
            </button>
          ))}
        </div>
      )}

      <section className="pl2-card pl2-calcard">
        <div className="pl2-fill-legend">
          <b>바뀌는 날</b>
          <span>
            <i className="pl2-sw pl2-sw--preview" />
            바뀜 (점선)
          </span>
          <span className="pl2-t3">흐린 날은 그대로예요</span>
        </div>
        {layout === 'list' ? (
          <div className="pl2-fill-list">
            {calc.nviews
              .filter((v) => !v.d.isPast && v.d.isWorkday)
              .map((v) => {
                const dlt = changed[v.key];
                return (
                  <div key={v.key} className={`pl2-fill-row ${dlt != null ? 'is-changed' : 'is-dim'}`}>
                    <span>{mdw(v.key)}</span>
                    <span>{v.tag}</span>
                    <span>{v.sub}</span>
                    <b>{v.main}</b>
                    <span className={dlt != null ? 'is-acc' : ''}>{dlt != null ? `${signed(dlt)} · ${oldOf[v.key]?.main}에서` : ''}</span>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="pl2-month-grid" role="grid" aria-label="바뀌는 날 미리보기">
            {HEADS.map((h, i) => (
              <div key={h} className={`pl2-dow ${i === 6 ? 'is-sun' : ''}`}>
                {h}
              </div>
            ))}
            {gridOf(views).map((v, i) => {
              if (!v) return <div key={`e${i}`} className="pl2-cell pl2-cell--empty" aria-hidden="true" />;
              const dlt = changed[v.key];
              const nv = calc.nviews.find((x) => x.key === v.key);
              return <Cell key={v.key} v={nv || v} preview={dlt != null ? { delta: dlt, from: v.main, main: (nv || v).main } : null} dim={dlt == null && v.state !== 'weekend'} />;
            })}
          </div>
        )}
      </section>

      <div className="pl2-fill-foot">
        <span className="pl2-t2">
          직접 정한 날 · 기록 · 계획 휴가는 그대로예요. 채운 뒤에도 <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> 로 되돌릴 수 있어요.
        </span>
        <span className="pl2-sp" />
        <button type="button" className="pl2-btn" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="pl2-btn pl2-btn--primary" onClick={() => onApply(r, draft)} disabled={p.isPastMonth}>
          이대로 채우기 · {nChanged}일
        </button>
      </div>
    </div>
  );
}
