// 나머지 날 맞추기 — 제안 상자(패널·서랍 안)와 아래 제안 막대 (GUIDE-plan-mechanism §6, GUIDE-ui-window §3.7)
import { dur, signed, gapText } from './format.js';

function headLine(s) {
  if (s.matched) return <>목표와 맞아요</>;
  const ch = Math.abs(s.change) >= 10 ? <b>이번 변경 {signed(s.change)}</b> : null;
  return (
    <>
      {s.before != null && <span>이전부터 {signed(s.before)} 밀려 있었어요. </span>}
      {ch}
      {ch && ' · '}
      {s.ahead ? `아직 목표보다 ${signed(s.drift)} 앞서요` : `목표보다 ${gapText(s.drift)}`}
    </>
  );
}

const hoverMap = (opt) => Object.fromEntries(opt.spread.changes.map((c) => [c.key, c.to - c.from]));

export function SuggestBox({ suggestion: s, onApply, onDismiss, onHover, lastMode, title }) {
  if (!s) return null;
  return (
    <section className="pl2-sug" aria-live="polite" aria-label="나머지 날 맞추기">
      {title && <b className="pl2-sug-title">{title}</b>}
      <span className="pl2-sug-h">{headLine(s)}</span>
      {s.matched ? (
        <button type="button" className="pl2-btn" onClick={onDismiss}>
          확인
        </button>
      ) : (
        <>
          {s.options.map((o) => (
            <button
              key={o.mode}
              type="button"
              className={`pl2-opt ${o.mode === (lastMode || 'even') ? 'pl2-opt--primary' : ''}`}
              onClick={() => onApply(o)}
              disabled={o.disabled}
              onMouseEnter={() => onHover(hoverMap(o))}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(hoverMap(o))}
              onBlur={() => onHover(null)}
            >
              <b>{o.title}</b>
              <span className={o.warn ? 'is-warn' : ''}>{o.warn || o.detail}</span>
            </button>
          ))}
          <button type="button" className="pl2-btn pl2-btn--ghost" onClick={onDismiss}>
            그대로 두기
          </button>
        </>
      )}
    </section>
  );
}

export function SuggestBar({ suggestion: s, onApply, onDismiss, onHover, lastMode }) {
  if (!s) return null;
  return (
    <div className="pl2-sugbar" role="region" aria-live="polite" aria-label="나머지 날 맞추기">
      <span className="pl2-sugbar-h">
        {s.head && <b className="pl2-sugbar-head">{s.head} · </b>}
        {headLine(s)} {!s.matched && <span className="pl2-sugbar-q">어디서 채울까요?</span>}
      </span>
      <span className="pl2-sp" />
      {s.matched ? (
        <button type="button" className="pl2-btn pl2-btn--primary" onClick={onDismiss}>
          확인
        </button>
      ) : (
        s.options.map((o) => (
          <button
            key={o.mode}
            type="button"
            className={`pl2-btn ${o.mode === (lastMode || 'even') ? 'pl2-btn--primary' : 'pl2-btn--dark'}`}
            onClick={() => onApply(o)}
            disabled={o.disabled}
            title={o.warn || o.detail}
            onMouseEnter={() => onHover(hoverMap(o))}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(hoverMap(o))}
            onBlur={() => onHover(null)}
          >
            {o.title}
            {o.warn ? ` · ${o.warn.replace('채울 수 있어요', '가능')}` : ''}
          </button>
        ))
      )}
      {!s.matched && (
        <button type="button" className="pl2-btn pl2-btn--ghostdark" onClick={onDismiss}>
          그대로 두기
        </button>
      )}
      <button type="button" className="pl2-sugbar-x" onClick={onDismiss} aria-label="닫기">
        ×
      </button>
    </div>
  );
}

export { dur };
