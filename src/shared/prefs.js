// 화면 환경설정: 테마(시스템/라이트/다크)와 창 모드(요약/확장)
import { useEffect, useState } from 'react';

const THEME_KEY = 'worktime.theme';
const MODE_KEY = 'worktime.mode';

const readPref = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 저장 불가 환경 */
  }
};

/** theme: 'light' | 'dark'. 처음 실행할 때만 PC 설정을 따라 정하고, 이후에는 고른 값을 유지 */
function initialTheme() {
  const saved = readPref(THEME_KEY, null);
  if (saved === 'light' || saved === 'dark') return saved;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writePref(THEME_KEY, theme);
    // 창 제목 표시줄 색을 화면 배경과 맞춘다 (Edge 앱 창 등)
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#0a1020' : '#f2f5fb';
  }, [theme]);
  return [theme, setTheme];
}

export const WINDOW_SIZES = {
  widget: { width: 300, height: 184 },
  compact: { width: 420, height: 820 },
  full: { width: 1280, height: 860 },
};

const WIDGET_KEY = 'dfmslack.widget';
const tauriWin = async () => {
  if (!window.__TAURI_INTERNALS__) return null;
  const mod = await import('@tauri-apps/api/window');
  return { win: mod.getCurrentWindow(), LogicalSize: mod.LogicalSize };
};

/** 설치형에서만: 항상 위 켜기/끄기 */
export async function setAlwaysOnTop(on) {
  try {
    const t = await tauriWin();
    if (t) await t.win.setAlwaysOnTop(!!on);
  } catch {
    /* 지원하지 않는 환경 */
  }
}

/** 실제 창 크기를 바꾼다. Tauri 창 → 창 API, Edge 앱 창 → resizeTo. 안 되면 화면 배치만 바뀐다. */
export async function resizeWindow(mode, opts = {}) {
  const size = WINDOW_SIZES[mode];
  try {
    const t = await tauriWin();
    if (t) {
      // 최소 크기를 먼저 바꿔야 위젯 크기로 줄어든다
      const min = mode === 'widget' ? { width: 260, height: 150 } : { width: 380, height: 600 };
      try { await t.win.setMinSize(new t.LogicalSize(min.width, min.height)); } catch { /* 권한 없음 */ }
      await t.win.setSize(new t.LogicalSize(size.width, size.height));
      // 위젯은 그림자 없는 투명 창 + (선택) 항상 위, 다른 화면은 보통 창
      try { await t.win.setShadow(mode !== 'widget'); } catch { /* 권한 없음 */ }
      await setAlwaysOnTop(mode === 'widget' && opts.onTop);
      return;
    }
    const dx = size.width - window.innerWidth;
    window.resizeTo(window.outerWidth + dx, window.outerHeight + (size.height - window.innerHeight));
    // 오른쪽 아래로 넘치지 않게 위치 보정
    const left = Math.min(window.screenX, Math.max(0, screen.availWidth - window.outerWidth));
    const top = Math.min(window.screenY, Math.max(0, screen.availHeight - window.outerHeight));
    window.moveTo(left, top);
  } catch {
    /* 창 크기를 바꿀 수 없는 환경 (일반 브라우저 탭 등) */
  }
}

/** 위젯 설정: 투명도(0.35~1)와 항상 위 */
export function useWidgetPrefs() {
  const [w, setW] = useState(() => {
    try {
      return { opacity: 0.92, onTop: true, ...JSON.parse(localStorage.getItem(WIDGET_KEY) || '{}') };
    } catch {
      return { opacity: 0.92, onTop: true };
    }
  });
  const update = (patch) =>
    setW((prev) => {
      const next = { ...prev, ...patch };
      writePref(WIDGET_KEY, JSON.stringify(next));
      if ('onTop' in patch) setAlwaysOnTop(next.onTop);
      return next;
    });
  return [w, update];
}

/** mode: 'widget' | 'compact' | 'full' */
export function useWindowMode(getWidget = () => ({})) {
  // 실행할 때는 항상 요약 화면으로 시작
  const [mode, setModeState] = useState('compact');
  const setMode = (next) => {
    setModeState(next);
    writePref(MODE_KEY, next);
    resizeWindow(next, getWidget());
  };
  return [mode, setMode];
}
