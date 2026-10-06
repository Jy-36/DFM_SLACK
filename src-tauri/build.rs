fn main() {
    // 앱 커맨드를 권한 시스템에 등록해서 창별로 허용 범위를 나눈다 (capabilities/*.json)
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["open_attendance_window", "submit_attendance_html"]),
        ),
    )
    .expect("failed to run tauri-build");
}
