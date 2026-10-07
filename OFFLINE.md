# 오프라인 빌드 패키지 사용법

crates.io·npm에 접속할 수 없는 사내 PC에서 DFM Slack을 빌드하기 위한 묶음입니다.
소스, `node_modules`, Rust 의존성(`offline/vendor`), Tauri 번들 도구(`offline/tauri-tools`)가 모두 들어 있어서 **인터넷 없이** 빌드됩니다.

## 미리 설치할 것 (한 번만)
1. Node.js 18 이상
2. Rust — `x86_64-pc-windows-msvc` 스탠드얼론 설치 파일(.msi)
3. Visual Studio Build Tools — "C++를 사용한 데스크톱 개발"

## 빌드
1. zip을 공백 없는 경로에 풉니다. 예: `C:\dev\dfm_slack`
2. 번들 도구 복사 (설치 파일 .msi/.exe를 만들 때 필요):
   ```
   xcopy /E /I /Y offline\tauri-tools "%LOCALAPPDATA%\tauri"
   ```
3. 그 폴더에서:
   ```
   npm run tauri build
   ```
   결과: `src-tauri\target\release\bundle\nsis\*.exe`, `...\msi\*.msi`
   개발 창으로 실행만 하려면 `npm run tauri dev`

## 주의
- `npm install`은 하지 마세요 (인터넷이 필요함). `node_modules`가 이미 들어 있습니다.
- 사용자 폴더의 `%USERPROFILE%\.cargo\config.toml`에 `replace-with = "artifactory"` 같은 설정이 있어도,
  이 폴더의 `.cargo\config.toml`(vendor 사용, offline)이 우선합니다.
- `src-tauri\Cargo.toml`이나 `package.json`의 의존성을 바꾸면 새 패키지가 필요합니다
  (GitHub Actions → "오프라인 빌드 패키지" → Run workflow). 화면 코드(`src\`)만 고치는 건 그대로 빌드됩니다.

