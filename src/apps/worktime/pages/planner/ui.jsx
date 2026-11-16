// 근무 계획 화면 공통 부품 (pl2-)
import { useEffect, useRef, useState } from 'react';
import { clock, dur, parseClockInput, clockKo, durKo } from './format.js';
import { parseDurInput } from '../../lib/time.js';

export function Tag({ tone = 'neutral', children }) {
  if (!children) return null;
  return <span className={`pl2-tag pl2-tag--${tone}`}>{children}</span>;
}

export function Kbd({ children }) {
  return <kbd className="pl2-kbd">{children}</kbd>;
}

/** 세그먼트 (Calendar | List, 퇴근 빠르게 …) */
export function Seg({ items, value, onChange, label, className = '' }) {
  return (
    <div className={`pl2-seg ${className}`} role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="radio"
          aria-checked={value === it.value}
          className={value === it.value ? 'is-on' : ''}
          onClick={() => onChange(it.value)}
          disabled={it.disabled}
          title={it.title}
        >
          {it.label}
          {it.sub != null && <em>{it.sub}</em>}
        </button>
      ))}
    </div>
  );
}

/**
 * 시각·길이 스테퍼 (role=spinbutton). 클릭 ±10분, PageUp/PageDown ±1시간, 직접 입력 + Enter
 * kind: 'clock' | 'dur'. readOnly 면 회색 상자
 */
export function Stepper({ kind = 'clock', value, onChange, readOnly, pinned, disabled, disabledReason, label, step = 10, min, max }) {
  const [text, setText] = useState(null); // 입력 중인 글자 (null = 입력 안 함)
  const inputRef = useRef(null);
  const show = kind === 'clock' ? clock(value) : dur(value);
  useEffect(() => setText(null), [value]);
  const commit = (v) => {
    if (v == null || Number.isNaN(v)) return;
    let x = Math.round(v / 5) * 5;
    if (min != null) x = Math.max(min, x);
    if (max != null) x = Math.min(max, x);
    if (x !== value) onChange(x);
  };
  const parse = (t) => (kind === 'clock' ? parseClockInput(t) : parseDurInput(t));
  if (readOnly) {
    return (
      <span className="pl2-step is-readonly" aria-label={`${label} ${kind === 'clock' ? clockKo(value) : durKo(value)}`}>
        <b>{show}</b>
      </span>
    );
  }
  const onKey = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      commit(value + (e.key === 'PageUp' ? 60 : step));
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      commit(value - (e.key === 'PageDown' ? 60 : step));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (text != null) commit(parse(text));
      setText(null);
    } else if (e.key === 'Escape' && text != null) {
      e.stopPropagation();
      setText(null);
    }
  };
  return (
    <span className={`pl2-step ${pinned ? 'is-pinned' : ''} ${disabled ? 'is-disabled' : ''}`} title={disabled ? disabledReason : undefined}>
      <button type="button" tabIndex={-1} aria-label={`${label} 10분 줄이기`} disabled={disabled} onClick={() => commit(value - step)}>
        −
      </button>
      <input
        ref={inputRef}
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuetext={kind === 'clock' ? clockKo(value) : durKo(value)}
        aria-disabled={disabled || undefined}
        value={text ?? show}
        readOnly={disabled}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (text != null) commit(parse(text));
          setText(null);
        }}
        onKeyDown={onKey}
        inputMode="numeric"
      />
      <button type="button" tabIndex={-1} aria-label={`${label} 10분 늘리기`} disabled={disabled} onClick={() => commit(value + step)}>
        +
      </button>
    </span>
  );
}

/** 표 안 시간 칸 (List). pinned=그날 정한 값, record=기록(잠김) */
export function TimeCell({ value, onChange, pinned, record, label, disabled }) {
  const [text, setText] = useState(null);
  useEffect(() => setText(null), [value]);
  if (record) return <span className="pl2-tf pl2-tf--rec" aria-label={`${label} ${clockKo(value)} 기록`}>{clock(value)}</span>;
  const commit = () => {
    if (text == null) return;
    const v = parseClockInput(text);
    setText(null);
    if (v != null && v !== value) onChange(Math.round(v / 5) * 5);
  };
  return (
    <input
      className={`pl2-tf ${pinned ? 'pl2-tf--pin' : 'pl2-tf--auto'}`}
      aria-label={label}
      value={text ?? clock(value)}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape' && text != null) {
          e.stopPropagation();
          setText(null);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          if (text == null && (e.altKey || e.ctrlKey)) {
            e.preventDefault();
            onChange(value + (e.key === 'ArrowUp' ? 10 : -10));
          }
        }
      }}
      inputMode="numeric"
    />
  );
}

/** 컨테이너 폭 (ResizeObserver) — 창이 아니라 Planner 영역 폭으로 배치를 정한다 (GUIDE-ui-window §1.2) */
export function useWidth(ref) {
  const [w, setW] = useState(1280);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
