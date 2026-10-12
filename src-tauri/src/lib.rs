use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// 사내 근태 화면에 주입되는 스크립트. 근태 표가 나타나면 HTML을 앱으로 보낸다.
const EXTRACT_JS: &str = include_str!("../scripts/extract.js");

/// 사내 근태 사이트를 별도 창으로 연다. 로그인은 사용자가 직접 한다(인증 정보 저장 없음).
#[tauri::command]
async fn open_attendance_window(
    app: AppHandle,
    url: String,
    row_selector: String,
) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("attendance") {
        let _ = w.close();
    }
    let parsed: tauri::Url = url
        .parse()
        .map_err(|e| format!("근태 화면 주소를 읽을 수 없습니다: {e}"))?;
    let selector_json = serde_json::to_string(&row_selector).map_err(|e| e.to_string())?;
    let script = EXTRACT_JS.replace("__ROW_SELECTOR__", &selector_json);

    WebviewWindowBuilder::new(&app, "attendance", WebviewUrl::External(parsed))
        .title("사내 근태 사이트 — 로그인 후 근태 조회 화면으로 이동하세요")
        .inner_size(1100.0, 780.0)
        .initialization_script(&script)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 주입 스크립트가 찾은 근태 표 HTML을 메인 창으로 전달하고 수집 창을 닫는다.
#[tauri::command]
fn submit_attendance_html(app: AppHandle, html: String) -> Result<(), String> {
    app.emit_to("main", "attendance-html", html)
        .map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window("attendance") {
        let _ = w.close();
    }
    Ok(())
}

/// 관련 자료 링크를 기본 브라우저 · 탐색기로 연다 (http · https · file · \\공유 폴더만)
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let u = url.trim();
    let ok = u.starts_with("http://") || u.starts_with("https://") || u.starts_with("file://") || u.starts_with("\\\\");
    if !ok || u.contains('\n') {
        return Err("열 수 없는 주소예요".into());
    }
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(u).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(u).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(u).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_attendance_window,
            submit_attendance_html,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("앱 실행 중 오류가 발생했습니다");
}
