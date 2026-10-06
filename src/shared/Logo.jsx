// DFM Slack 로고: 네이비 바탕 위 캡슐·점 조각으로 만든 DFM (public/logo.svg 와 같은 그림)
export function DfmLogo({ size = 28, className = '' }) {
  return (
    <svg className={`dfm-logo ${className}`} width={size} height={size} viewBox="16 16 480 480" aria-hidden="true">
      <defs><linearGradient id="dfm-logo-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#16295c"/><stop offset="1" stopColor="#0a1433"/></linearGradient></defs><rect x="16" y="16" width="480" height="480" rx="112" fill="url(#dfm-logo-bg)"/><g transform="translate(60.0 194.9) scale(0.5552)" fill="none" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round">
  <path d="M28 28 V192" stroke="#5B8DFF"/>
  <path d="M100 28 A82 82 0 0 1 100 192" stroke="#2F6BFF"/>
  <path d="M262 28 V192" stroke="#4CC3F5"/>
  <path d="M334 28 H384" stroke="#2F6BFF"/>
  <circle cx="334" cy="110" r="28" fill="#7FE3FF" stroke="none"/>
  <path d="M470 28 V192" stroke="#5B8DFF"/>
  <path d="M530 44 L574 122 L618 44" stroke="#4CC3F5"/>
  <path d="M678 28 V192" stroke="#2F6BFF"/>
</g>
    </svg>
  );
}
