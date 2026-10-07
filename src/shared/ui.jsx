import { useEffect, useRef, useState } from 'react';
import { fmtDur } from '../apps/worktime/lib/time.js';

/** 설명 아이콘: 마우스를 올리면 설명이 뜨고, 누르면 고정된다 */
export function InfoTip({ text, align = 'left', label = '설명 보기' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span className={`info-tip ${open ? 'open' : ''} ${align}`} ref={ref}>
      <button
        type="button"
        className="info-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        i
      </button>
      <span className="info-pop" role="tooltip">{text}</span>
    </span>
  );
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Stat({ label, value, unit, foot, tone }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className={`value ${tone ? `tone-${tone}` : ''}`}>
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {foot && <span className="foot">{foot}</span>}
    </div>
  );
}

/** 월 진행 막대: 실근무 + 휴가 인정 + 계획(빗금), 페이스 마커 */
export function MonthMeter({ work = 0, leave = 0, plan = 0, total, marker, markerLabel }) {
  const max = Math.max(total, work + leave + plan, 1);
  const pct = (v) => `${(Math.max(0, v) / max) * 100}%`;
  return (
    <div className="meter" role="img" aria-label={`인정 ${fmtDur(work + leave)} / 필요 ${fmtDur(total)}`}>
      <i className="seg-work" style={{ width: pct(work) }} />
      <i className="seg-leave" style={{ width: pct(leave) }} />
      {plan > 0 && <i className="seg-plan" style={{ width: pct(plan) }} />}
      {marker != null && <span className="marker" data-label={markerLabel} style={{ left: pct(marker) }} />}
    </div>
  );
}

export function LeaveTag({ day }) {
  if (!day.leaveLabel) return null;
  return <Pill tone="leave">{day.leaveLabel}</Pill>;
}

export function StatusPill({ day }) {
  if (day.live) return <Pill tone="good"><span className="live-dot" /> 근무 중</Pill>;
  if (day.warnings.length) return <Pill tone="warn">{day.warnings[0]}</Pill>;
  if (day.status === 'holiday') return <Pill tone="neutral">{day.holiday}</Pill>;
  if (day.leaveLabel) return <Pill tone="leave">{day.leaveLabel}</Pill>;
  return null;
}

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  records: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10z',
  plan: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l4 2.4-1 1.7-5-3V7h2z',
  sync: 'M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6 6 6 0 0 1-.7 2.8l1.5 1.5A8 8 0 0 0 12 4zm-6 8a6 6 0 0 1 .7-2.8L5.2 7.7A8 8 0 0 0 12 20v3l4-4-4-4v3a6 6 0 0 1-6-6z',
  settings:
    'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.8a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.8c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.2-1.7zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  left: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z',
  right: 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z',
  moon: 'M20.7 15.3A8.5 8.5 0 0 1 8.7 3.3a9 9 0 1 0 12 12z',
  monitor: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h16V6H4z',
  expand: 'M4 4h6v2H7.4l3.3 3.3-1.4 1.4L6 7.4V10H4V4zm16 0v6h-2V7.4l-3.3 3.3-1.4-1.4L16.6 6H14V4h6zM4 20v-6h2v2.6l3.3-3.3 1.4 1.4L7.4 18H10v2H4zm16 0h-6v-2h2.6l-3.3-3.3 1.4-1.4 3.3 3.3V14h2v6z',
  compress: 'M10 4v6H4V8h2.6L3.3 4.7l1.4-1.4L8 6.6V4h2zm4 0h2v2.6l3.3-3.3 1.4 1.4L17.4 8H20v2h-6V4zM4 14h6v6H8v-2.6l-3.3 3.3-1.4-1.4L6.6 16H4v-2zm10 0h6v2h-2.6l3.3 3.3-1.4 1.4-3.3-3.3V20h-2v-6z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3v5.6l4.2 2.5 1-1.7-3.2-1.9V7h-2z',
  chevron: 'M9.3 6.7 10.7 5.3 17.4 12l-6.7 6.7-1.4-1.4 5.3-5.3z',
  lock: 'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z',
  unlock: 'M12 2a5 5 0 0 0-5 5h2a3 3 0 1 1 6 0v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zM6 12h12v8H6v-8z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  minimize: 'M5 11h14v2H5z',
  appMode: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h4V5h-4zM3 5h8v2H3zm0 4h8v2H3zm0 4h8v2H3zm0 4h8v2H3z',
  windowMode: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zm2 3v9h4V9H5zm6 0v9h8V9h-8z',
  navClose: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v12h4V6H5zm6 0v12h8V6h-8zm5.6 2.6L13.2 12l3.4 3.4-1.4 1.4L10.4 12l4.8-4.8 1.4 1.4z',
  navOpen: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v12h4V6H5zm6 0v12h8V6h-8zm2.4 2.6 1.4-1.4 4.8 4.8-4.8 4.8-1.4-1.4L16.8 12l-3.4-3.4z',
  widget: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v14h14V5H5zm7 6h6v6h-6v-6z',
  pin: 'M14 2l8 8-2 2-1-1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4-1-1 2-2z',
  drop: 'M12 2.5C9 7 6 10.2 6 14a6 6 0 0 0 12 0c0-3.8-3-7-6-11.5zM8 14h2a2 2 0 0 0 2 2v2a4 4 0 0 1-4-4z',
  apps: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
  close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z',
  // MTO 탭
  mask: 'M3 3h18v2H3zM3 19h18v2H3zM3 3h2v18H3zM19 3h2v18h-2zM7 7h4v4H7zM13 7h4v2h-4zM13 11h4v6h-4zM7 13h4v4H7z',
  gantt: 'M3 4h2v16H3zM7 5h8v3H7zM11 10.5h9v3h-9zM9 16h6v3H9z',
  layers: 'M12 3 2 8l10 5 10-5-10-5zM4.2 10.9 2 12l10 5 10-5-2.2-1.1L12 14.8zM4.2 14.9 2 16l10 5 10-5-2.2-1.1L12 18.8z',
  table: 'M3 4h18v2H3zM3 18h18v2H3zM3 4h2v16H3zM19 4h2v16h-2zM3 9h18v1.6H3zM3 13.4h18V15H3zM9 4h1.6v16H9z',
  copy: 'M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9H5z',
  download: 'M11 3h2v9.2l3.3-3.3 1.4 1.4-5.7 5.7-5.7-5.7 1.4-1.4 3.3 3.3V3zM4 18h16v2H4z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9zm4 2v8h1.5v-8H10zm2.5 0v8H14v-8h-1.5z',
};

const THEME_OPTIONS = [
  ['light', 'sun', '라이트'],
  ['dark', 'moon', '다크'],
];

/** 테마 선택: 3단 세그먼트 */
export function ThemeSwitch({ theme, setTheme, compactLabels = false }) {
  return (
    <div className="seg" role="group" aria-label="화면 테마">
      {THEME_OPTIONS.map(([key, icon, label]) => (
        <button key={key} type="button" aria-pressed={theme === key} onClick={() => setTheme(key)} title={label}>
          <Icon name={icon} size={14} />
          {!compactLabels && label}
        </button>
      ))}
    </div>
  );
}

/** 테마 전환 버튼: 라이트 ↔ 다크 */
export function ThemeCycle({ theme, setTheme }) {
  const idx = THEME_OPTIONS.findIndex(([k]) => k === theme);
  const [, icon, label] = THEME_OPTIONS[idx < 0 ? 0 : idx];
  const next = THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length];
  return (
    <button className="icon-btn" type="button" onClick={() => setTheme(next[0])} title={`테마: ${label} (눌러서 ${next[2]})`} aria-label={`테마 ${label}, 눌러서 ${next[2]}로 바꾸기`}>
      <Icon name={icon} size={17} />
    </button>
  );
}

export function BrandMark({ size = 18, icon = 'clock' }) {
  return (
    <div className="brand-mark" aria-hidden="true">
      <Icon name={icon} size={size} />
    </div>
  );
}

export function Icon({ name, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={ICONS[name]} fill="currentColor" />
    </svg>
  );
}
