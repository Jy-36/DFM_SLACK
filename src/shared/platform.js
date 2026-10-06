// 실행 환경 구분: 설치형(Tauri) 앱인지, Edge 앱 창·브라우저인지
export const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
