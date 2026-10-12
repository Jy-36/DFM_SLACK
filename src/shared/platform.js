// 실행 환경 구분: 설치형(Tauri) 앱인지, Edge 앱 창·브라우저인지
export const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

/** 링크를 기본 브라우저 · 탐색기로 열기 (데스크톱 앱은 open_external 커맨드, 브라우저는 새 탭) */
export async function openExternal(url) {
  if (isTauri()) return window.__TAURI_INTERNALS__.invoke('open_external', { url });
  window.open(url, '_blank', 'noopener');
  return undefined;
}
