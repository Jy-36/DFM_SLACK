// 하루 입력 블록 (DayPinEditor) + 상태별 상세 패널 (GUIDE-ui-window §3.5)
import { useState } from 'react';
import { LEAVE_ORDER } from '../../lib/rules.js';
import { capacityOf } from '../../lib/engine.js';
import { isFixedPin, BLOCK_BOTH } from '../../lib/goal.js';
import { Stepper, Seg, Tag } from './ui.jsx';
import { SuggestBox } from './Suggest.jsx';
import { fieldHints, tryPin, quickOuts, hourChip, bulkResult } from './model.js';
import { clock, dur, signed, mdLong, md, mdw } from './format.js';
import { toMin } from '../../lib/time.js';

function Head({ v, extra }) {
  return (
    <div className="pl2-ins-h">
      <b className="pl2-ins-date">{mdLong(v.key)}</b>
      {v.tag && <Tag tone={v.tagTone}>{v.tag}</Tag>}
      <span className="pl2-sp" />
      {extra}
    </div>
  );
}

function DayNav({ onPrev, onNext }) {
  return (
    <span className="pl2-daynav">
      <button type="button" onClick={onPrev} aria-label="전날">
        ‹
      </button>
      <button type="button" onClick={onNext} aria-label="다음 날">
        ›
      </button>
    </span>
  );
}

function LeaveMenu({ rules, onPick, current }) {
  return (
    <label className="pl2-chip pl2-chip--select">
      <span>{current ? '휴가 바꾸기' : '휴가'}</span>
      <select
        value=""
        aria-label="계획 휴가"
        onChange={(e) => {
          const val = e.target.value;
          if (!val) return;
          const [k, h] = val.split(':');
          onPick(k, h ? Number(h) * 60 : undefined);
        }}
      >
        <option value="">▾</option>
        {LEAVE_ORDER.filter((k) => rules.leaveTypes[k]).map((k) => {
          const def = rules.leaveTypes[k];
          if (!def.variable) return <option key={k} value={k}>{def.label}</option>;
          const steps = [];
          for (let m = def.step; m <= def.max; m += def.step) steps.push(m);
          return steps.map((m) => (
            <option key={`${k}:${m}`} value={`${k}:${m / 60}`}>
              {def.label} {m / 60}h
            </option>
          ));
        })}
      </select>
    </label>
  );
}

/** 앞으로의 날 · 오늘 입력 (같은 컴포넌트) */
export function DayPinEditor({ v, ctx, applyPin, applyLeave, compact = false }) {
  const [err, setErr] = useState(null);
  const { rules, goal, recentOuts } = ctx;
  const d = v.d;
  const r = v.r;
  const pin = v.pin;
  const isToday = v.state === 'today';
  const hints = fieldHints(pin, isToday);
  const both = pin?.in != null && pin?.out != null;

  const change = (field, value, label) => {
    const t = tryPin(d, pin, field, value, ctx);
    if (t.blocked) {
      setErr(t.blocked);
      return;
    }
    setErr(null);
    applyPin(v.key, t.pin, label);
  };
  const unpin = (field) => {
    const next = { ...(pin || {}) };
    delete next[field];
    applyPin(v.key, Object.keys(next).length ? next : null, `${field === 'in' ? '출근' : field === 'out' ? '퇴근' : '실근무'} 자동으로`);
  };
  const recIn = isToday && d.inMin != null;

  const rows = [
    { f: 'in', label: '출근', value: r.in, pinned: !!r.fixed.in && r.fixed.in !== 'record', ro: recIn, hint: recIn ? hints[0] : hints[0] },
    { f: 'out', label: '퇴근', value: r.out, pinned: r.fixed.out, ro: false, hint: hints[1] },
    { f: 'net', label: '실근무', value: r.net, pinned: r.fixed.net, ro: isToday, hint: hints[2], disabled: both, why: BLOCK_BOTH },
  ];

  return (
    <div className="pl2-editor">
      {rows.map((row) => (
        <div className="pl2-fr" key={row.f}>
          <span className="pl2-fr-k">{row.label}</span>
          <Stepper
            kind={row.f === 'net' ? 'dur' : 'clock'}
            label={`${md(v.key)} ${row.label}`}
            value={row.value}
            readOnly={row.ro}
            pinned={row.pinned}
            disabled={row.disabled}
            disabledReason={row.why}
            onChange={(x) => change(row.f, x, `${row.label} ${row.f === 'net' ? dur(x) : clock(x)}으로 정함`)}
          />
          <span className={`pl2-fr-hint ${row.pinned ? 'is-pinned' : ''}`}>
            {row.pinned ? (
              <>
                직접 정함{' '}
                <button type="button" className="pl2-x" onClick={() => unpin(row.f)} aria-label={`${row.label} 자동으로`}>
                  ×
                </button>
              </>
            ) : (
              row.hint
            )}
          </span>
        </div>
      ))}
      {!compact && d.plannedExclude > 0 && <span className="pl2-fr-note">제외 {dur(d.plannedExclude)} · 근무기록에서 고치기</span>}
      {err && (
        <p className="pl2-err" role="alert">
          {err}
        </p>
      )}

      {isToday ? (
        <TodayExtra v={v} ctx={ctx} applyPin={applyPin} />
      ) : (
        <>
          <span className="pl2-lbl">퇴근 빠르게</span>
          <Seg
            label="퇴근 빠르게"
            className="pl2-seg--fill"
            items={quickOuts(d, goal, recentOuts).map((t) => ({ value: toMin(t), label: t }))}
            value={r.out}
            onChange={(x) => change('out', x, `퇴근 ${clock(x)}으로 정함`)}
          />
          <div className="pl2-chips">
            {[-60, 60].map((dl) => {
              const c = hourChip(d, pin, r, dl, ctx);
              if (!c) return null;
              return (
                <button
                  key={dl}
                  type="button"
                  className="pl2-chip"
                  disabled={!!c.blocked}
                  title={c.blocked}
                  onClick={() => {
                    setErr(null);
                    applyPin(v.key, c.apply.pin, c.label.replace('→', '·'));
                  }}
                >
                  {c.label}
                </button>
              );
            })}
            {pin && (
              <button type="button" className="pl2-chip" onClick={() => applyPin(v.key, null, '자동으로 되돌림')}>
                자동으로 되돌리기
              </button>
            )}
            {v.state !== 'holiday' && <LeaveMenu rules={rules} onPick={(k, m) => applyLeave([v.key], k, m)} />}
            {v.state === 'holiday' && (
              <button type="button" className="pl2-chip" onClick={() => applyPin(v.key, null, '휴일 근무 뺌')}>
                휴일 근무 빼기
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TodayExtra({ v, ctx, applyPin }) {
  const a = ctx.advice;
  if (!a || !a.plan) return null;
  const pct = a.plan.net ? Math.min(100, Math.round((a.soFar / a.plan.net) * 100)) : 0;
  return (
    <>
      {v.d.inMin != null && (
        <div className="pl2-box">
          <div className="pl2-box-row">
            <span>지금까지</span>
            <b>
              {dur(a.soFar)} / {dur(a.plan.net)}
            </b>
          </div>
          <div className="pl2-prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="오늘 계획 진행">
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="pl2-hint">{a.state === 'done' ? '지금 나가도 돼요 ✓' : `${clock(a.plan.out)}에 나가면 계획대로예요.`}</span>
        </div>
      )}
      <span className="pl2-lbl">다르게 나가면</span>
      <Seg
        label="다르게 나가면"
        className="pl2-seg--fill pl2-seg--two"
        items={a.options.map((o) => ({ value: o.out, label: clock(o.out), sub: o.isPlan ? '계획' : signed(o.monthDelta) }))}
        value={a.plan.out}
        onChange={(x) => {
          const t = tryPin(v.d, v.pin, 'out', x, ctx);
          if (!t.blocked) applyPin(v.key, t.pin, `퇴근 ${clock(x)}으로 정함`);
        }}
      />
      <span className="pl2-hint">작은 숫자는 월말 초과가 달라지는 양이에요. 고르면 남은 날에 어떻게 나눌지 이 아래에서 물어봐요.</span>
    </>
  );
}

/** 오른쪽 상세 패널 (Calendar) — 선택 상태에 따라 모양이 바뀜 */
export default function DayPanel(props) {
  const { v, ctx, go, applyPin, applyLeave, selectedViews, onNav, suggestion, showSug, applySpread, dismissSug, setHover, lastMode, bulk, onClose } = props;
  const nav = <DayNav onPrev={() => onNav(-1)} onNext={() => onNav(1)} />;
  const close = onClose ? (
    <button type="button" className="pl2-x pl2-x--lg" onClick={onClose} aria-label="닫기">
      ×
    </button>
  ) : null;

  if (selectedViews.length > 1) {
    const list = selectedViews.filter((x) => x.r);
    const total = list.reduce((s, x) => s + x.r.net, 0);
    const res = bulkResult(list, bulk, ctx);
    const anyDraft = ['in', 'out', 'net'].some((f) => bulk[f] != null) || bulk.auto;
    const allAuto = list.every((x) => !isFixedPin(x.pin));
    return (
      <>
        <div className="pl2-ins-h">
          <b className="pl2-ins-date">{list.length}일 선택</b>
          <Tag tone="neutral">{allAuto ? '모두 자동' : '섞여 있음'}</Tag>
          <span className="pl2-sp" />
          <span className="pl2-lbl">Esc 해제</span>
          {close}
        </div>
        <div className="pl2-ins-b">
          {list.map((x) => (
            <div key={x.key} className="pl2-pick">
              <b>{mdw(x.key)}</b>
              <span>
                {clock(x.r.in)}–{clock(x.r.out)}
              </span>
              <b>{dur(x.r.net)}</b>
            </div>
          ))}
          <div className="pl2-pick pl2-pick--sum">
            <span>합계</span>
            <b>{dur(total)}</b>
          </div>
          <div className="pl2-box">
            {anyDraft ? (
              <>
                <b>{bulk.auto ? '자동으로 되돌리면' : `${['in', 'out', 'net'].filter((f) => bulk[f] != null).map((f) => `${{ in: '출근', out: '퇴근', net: '실근무' }[f]} ${f === 'net' ? dur(bulk[f]) : clock(bulk[f])}`).join(' · ')}으로 바꾸면`}</b>
                <span className="pl2-t2">
                  합계 {signed(res.delta)} · {dur(total + res.delta)}
                  {res.blocked.length ? ` · ${res.blocked.length}일은 못 바꿈` : ''}
                </span>
                <span className="pl2-hint">아래 막대에서 [적용]하면 달라진 양을 어디서 채울지 물어봐요.</span>
              </>
            ) : (
              <span className="pl2-hint">아래 막대에서 출근·퇴근·실근무·휴가를 골라 한 번에 바꿔요.</span>
            )}
          </div>
        </div>
      </>
    );
  }

  if (!v) return <div className="pl2-ins-b pl2-hint">날짜를 고르세요.</div>;

  // 지난 날 (기록) — 읽기 전용
  if (v.state === 'rec' || v.state === 'recNone') {
    const d = v.d;
    return (
      <>
        <Head v={v} extra={<>{nav}{close}</>} />
        <div className="pl2-ins-b">
          {v.state === 'rec' ? (
            <>
              <div className="pl2-trio">
                <span className="pl2-box">
                  <span className="pl2-lbl">출근</span>
                  <b>{d.inMin != null ? clock(d.inMin) : '—'}</b>
                </span>
                <span className="pl2-box">
                  <span className="pl2-lbl">퇴근</span>
                  <b>{d.outMin != null ? clock(d.outMin) : '—'}</b>
                </span>
                <span className="pl2-box">
                  <span className="pl2-lbl">인정</span>
                  <b>{dur(d.recognized)}</b>
                </span>
              </div>
              <span className="pl2-t2">
                {d.gross ? `휴게 ${dur(Math.max(0, d.gross - d.excluded - d.actual))} · ` : ''}
                {d.leaveLabel ? `근태 ${d.leaveLabel}` : '근태 정상'}
                {d.excluded ? ` · 제외 ${dur(d.excluded)}` : ''} · {d.note ? `메모 ${d.note}` : '메모 없음'}
              </span>
            </>
          ) : (
            <span className="pl2-t2">이 날은 근무기록이 없어요.</span>
          )}
          <div className="pl2-box pl2-box--white">
            <b>지난 날은 회사 사이트 기록이에요</b>
            <span className="pl2-hint">계획에서는 고치지 않아요. 기록이 틀렸다면 근무기록에서 고쳐 주세요.</span>
            <button type="button" className="pl2-btn" onClick={() => go('records', { y: d.date.getFullYear(), m: d.date.getMonth() })}>
              {v.state === 'recNone' ? '근무기록에서 입력 →' : '근무기록에서 보기 →'}
            </button>
          </div>
        </div>
      </>
    );
  }

  // 사이트 근태가 있는 미래 날 — 읽기 전용
  if (v.state === 'leaveRec') {
    return (
      <>
        <Head v={v} extra={<>{nav}{close}</>} />
        <div className="pl2-ins-b">
          <div className="pl2-box pl2-box--white">
            <b>사이트에서 승인된 근태예요</b>
            <span className="pl2-hint">회사 사이트 기록이 계획보다 우선이라 여기서는 바꿀 수 없어요.</span>
          </div>
        </div>
      </>
    );
  }

  // 계획 휴가
  if (v.state === 'leavePlan') {
    const pl = v.leavePlan;
    const def = ctx.rules.leaveTypes[pl?.leave];
    return (
      <>
        <Head v={v} extra={<>{nav}{close}</>} />
        <div className="pl2-ins-b">
          <div className="pl2-fr">
            <span className="pl2-fr-k">근태</span>
            <span className="pl2-t2">{def?.label}</span>
            <LeaveMenu rules={ctx.rules} current onPick={(k, m) => applyLeave([v.key], k, m)} />
          </div>
          <span className="pl2-hint">계획 휴가는 근무기록에 쓰지 않아요. 회사 기록이 들어오면 그 값으로 바뀌어요.</span>
          <button type="button" className="pl2-btn" onClick={() => applyLeave([v.key], null)}>
            휴가 취소
          </button>
        </div>
        {showSug && <SuggestBox suggestion={suggestion} onApply={applySpread} onDismiss={dismissSug} onHover={setHover} lastMode={lastMode} />}
      </>
    );
  }

  // 주말
  if (v.state === 'weekend') {
    return (
      <>
        <Head v={v} extra={<>{nav}{close}</>} />
        <div className="pl2-ins-b">
          <span className="pl2-t2">{v.d.holiday ? `${v.d.holiday} · 근무 없는 날` : '근무 없는 날'}</span>
          {!ctx.isPastMonth && (
            <button type="button" className="pl2-btn" onClick={() => applyPin(v.key, { net: ctx.rules.dailyStdMin }, '휴일 근무 넣음')}>
              휴일 근무 넣기
            </button>
          )}
        </div>
      </>
    );
  }

  // 앞으로의 날 · 오늘 · 휴일 근무
  const cap = v.d ? capacityOf(v.d, ctx.rules) : 0;
  return (
    <>
      <Head v={v} extra={<>{nav}{close}</>} />
      <div className="pl2-ins-b">
        {v.state === 'today' && (!ctx.advice || ctx.advice.state === 'leave' || ctx.advice.state === 'out') ? (
          <span className="pl2-t2">오늘은 {v.d.leaveLabel || '근무 기록이 끝난 날'}이에요.</span>
        ) : (
          <DayPinEditor v={v} ctx={ctx} applyPin={applyPin} applyLeave={applyLeave} />
        )}
        {v.d.leaveLabel && cap > 0 && <span className="pl2-hint">{v.d.leaveLabel} 포함 · 실근무는 남은 시간이에요</span>}
      </div>
      {showSug && <SuggestBox suggestion={suggestion} onApply={applySpread} onDismiss={dismissSug} onHover={setHover} lastMode={lastMode} />}
    </>
  );
}
