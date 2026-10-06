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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_attendance_window,
            submit_attendance_html
        ])
        .run(tauri::generate_context!())
        .expect("앱 실행 중 오류가 발생했습니다");
}
