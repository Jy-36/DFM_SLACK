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
  widget: { width: 300, height: 164 },
  compact: { width: 420, height: 820 }, // 높이는 모니터 작업 영역에 맞춰 꽉 채움
  full: { width: 1440, height: 940 }, // 근무기록 달력이 가로 스크롤 없이 들어가는 크기 (모니터보다 크면 줄임)
};
const EDGE = 12; // 위젯과 화면 가장자리 사이 여백

const WIDGET_KEY = 'dfmslack.widget';
const tauriWin = async () => {
  if (!window.__TAURI_INTERNALS__) return null;
  const mod = await import('@tauri-apps/api/window');
  return { win: mod.getCurrentWindow(), mod, LogicalSize: mod.LogicalSize };
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

/** 모드별 창 위치·크기 (물리 픽셀). 작업 영역 = 작업 표시줄을 뺀 모니터 영역
 *  위젯: 오른쪽 맨 위 · 요약(앱): 오른쪽 끝에 위아래 꽉 차게 · 확장: 가운데 */
export function placementFor(mode, area, scale = 1) {
  const { x: X, y: Y, width: W, height: H } = area;
  const px = (v) => Math.round(v * scale);
  const size = WINDOW_SIZES[mode];
  if (mode === 'widget') {
    const w = px(size.width);
    const h = px(size.height);
    return { x: X + W - w - px(EDGE), y: Y + px(EDGE), width: w, height: h };
  }
  if (mode === 'compact') {
    const w = Math.min(px(size.width), W);
    return { x: X + W - w, y: Y, width: w, height: H };
  }
  const w = Math.min(px(size.width), W);
  const h = Math.min(px(size.height), H);
  return { x: X + Math.round((W - w) / 2), y: Y + Math.round((H - h) / 2), width: w, height: h };
}

/** 실제 창 크기·위치를 바꾼다. Tauri 창 → 창 API, Edge 앱 창 → resizeTo/moveTo. */
export async function resizeWindow(mode, opts = {}) {
  try {
    const t = await tauriWin();
    if (t) {
      const { win, mod } = t;
      // 최소 크기를 먼저 바꿔야 위젯 크기로 줄어든다
      const min = mode === 'widget' ? { width: 260, height: 140 } : { width: 380, height: 600 };
      try { await win.setMinSize(new mod.LogicalSize(min.width, min.height)); } catch { /* 권한 없음 */ }
      try { if (await win.isMaximized()) await win.unmaximize(); } catch { /* 무시 */ }
      // 위젯·요약은 모서리가 둥근 투명 창(그림자 없음), 확장은 보통 창
      try { await win.setShadow(mode === 'full'); } catch { /* 권한 없음 */ }
      const mon = (await mod.currentMonitor()) || (await mod.primaryMonitor());
      if (mon) {
        const wa = mon.workArea || { position: mon.position, size: mon.size };
        const area = { x: wa.position.x, y: wa.position.y, width: wa.size.width, height: wa.size.height };
        const p = placementFor(mode, area, mon.scaleFactor || 1);
        await win.setSize(new mod.PhysicalSize(p.width, p.height));
        await win.setPosition(new mod.PhysicalPosition(p.x, p.y));
      } else {
        const size = WINDOW_SIZES[mode];
        await win.setSize(new mod.LogicalSize(size.width, size.height));
      }
      await setAlwaysOnTop(mode === 'widget' && opts.onTop);
      return;
    }
    // Edge 앱 창: 같은 배치를 화면 좌표로
    const area = { x: screen.availLeft ?? 0, y: screen.availTop ?? 0, width: screen.availWidth, height: screen.availHeight };
    const p = placementFor(mode, area, 1);
    window.resizeTo(p.width, p.height);
    window.moveTo(p.x, p.y);
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
  // 처음 열 때도 요약 화면 자리(모니터 오른쪽 끝)에 둔다
  useEffect(() => {
    resizeWindow('compact', getWidget());
  }, []);
  const setMode = (next) => {
    setModeState(next);
    writePref(MODE_KEY, next);
    resizeWindow(next, getWidget());
  };
  return [mode, setMode];
}
