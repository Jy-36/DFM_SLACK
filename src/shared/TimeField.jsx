// 시각 입력: 숫자만 쳐도 되고(830 → 08:30), ±10분 버튼과 빠른 선택 목록이 있다.
// 브라우저 기본 시간 입력(오전/오후 표시, 작은 화살표) 대신 앱 디자인에 맞춘 필드.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fmt = (min) => {
  const v = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
};

/** "830", "0830", "8:3", "8", "20:5" → "08:30" … 못 읽으면 null */
export function normalizeClock(text) {
  const t = String(text ?? '').trim().replace(/[^\d:]/g, '');
  if (!t) return '';
  let h;
  let m;
  if (t.includes(':')) {
    const [a, b = '0'] = t.split(':');
    h = Number(a);
    m = Number(b.length === 1 ? `${b}0` : b);
  } else if (t.length <= 2) {
    h = Number(t);
    m = 0;
  } else {
    h = Number(t.slice(0, t.length - 2));
    m = Number(t.slice(-2));
  }
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/** 시간대별 빠른 선택 목록 */
export const PRESETS = {
  in: ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30'],
  out: ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '20:00', '21:00', '22:00'],
  any: ['06:00', '08:00', '09:00', '12:00', '13:00', '15:00', '18:00', '22:00'],
};

export function TimeField({ id, value, onChange, presets = PRESETS.any, step = 10, allowEmpty = true, showNow = false, ariaLabel, placeholder = '--:--' }) {
  const [text, setText] = useState(value || '');
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => setText(value || ''), [value]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const commit = (raw) => {
    const v = normalizeClock(raw);
    if (v === null || (v === '' && !allowEmpty)) {
      setText(value || '');
      return;
    }
    setText(v);
    if (v !== (value || '')) onChange(v || null);
  };
  const bump = (delta) => {
    const base = toMin(value) ?? toMin(presets[Math.floor(presets.length / 2)]) ?? 540;
    const next = fmt(Math.round((base + delta) / step) * step);
    setText(next);
    onChange(next);
  };
  const pick = (t) => {
    setText(t);
    onChange(t);
    setOpen(false);
  };

  return (
    <div className={`tf ${open ? 'open' : ''}`} ref={wrap}>
      <button type="button" className="tf-step" onClick={() => bump(-step)} aria-label={`${step}분 앞으로`} tabIndex={-1}>
        −
      </button>
      <input
        id={id}
        className="tf-input num"
        value={text}
        inputMode="numeric"
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(step); }
          if (e.key === 'ArrowDown') { e.preventDefault(); bump(-step); }
        }}
      />
      <button type="button" className="tf-step" onClick={() => bump(step)} aria-label={`${step}분 뒤로`} tabIndex={-1}>
        +
      </button>
      <button type="button" className="tf-open" onClick={() => setOpen((v) => !v)} aria-label="시각 고르기" aria-expanded={open}>
        <Icon name="clock" size={15} />
      </button>
      {open && (
        <div className="tf-pop" role="listbox">
          <div className="tf-grid">
            {presets.map((t) => (
              <button key={t} type="button" className={`tf-chip num ${t === value ? 'on' : ''}`} onClick={() => pick(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="tf-foot">
            {showNow && (
              <button type="button" className="link-btn" onClick={() => { const d = new Date(); pick(fmt(d.getHours() * 60 + d.getMinutes())); }}>
                지금 시각
              </button>
            )}
            {allowEmpty && value && (
              <button type="button" className="link-btn danger" onClick={() => { setText(''); onChange(null); setOpen(false); }}>
                지우기
              </button>
            )}
            <span className="tf-hint">830처럼 숫자만 입력 · ↑↓ {step}분</span>
          </div>
        </div>
      )}
    </div>
  );
}
