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
  compact: { width: 420, height: 820 },
  full: { width: 1280, height: 860 },
};

/** 실제 창 크기를 바꾼다. Tauri 창 → 창 API, Edge 앱 창 → resizeTo. 안 되면 화면 배치만 바뀐다. */
export async function resizeWindow(mode) {
  const size = WINDOW_SIZES[mode];
  try {
    if (window.__TAURI_INTERNALS__) {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setSize(new LogicalSize(size.width, size.height));
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

/** mode: 'compact' | 'full' */
export function useWindowMode() {
  // 실행할 때는 항상 요약 화면으로 시작
  const [mode, setModeState] = useState('compact');
  const setMode = (next) => {
    setModeState(next);
    writePref(MODE_KEY, next);
    resizeWindow(next);
  };
  return [mode, setMode];
}
