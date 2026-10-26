# 06. 작업 폴더를 DB로 · VWP에 바로 쓰기 (다음 단계 명세)

프로토타입은 IndexedDB + zip 다운로드. 설치형에서는 **작업 폴더 하나가 DB**이고, 출력은 **VWP 폴더에 바로** 쓴다.
새 crate 없이 `std::fs`만 쓴다 (`tauri-plugin-fs` · `tauri-plugin-dialog` 추가 금지 — 오프라인 빌드).

## 작업 폴더 구조 (= DB)
```
<작업 폴더>/                        설정에서 경로 입력 (예: D:\Techmap)
  workspace.json                    processes(메타 · classes) · dks · revisions 메타(파일 본문 제외)
  processes/<Process>/master/       tf · layermap · drf · history.txt (현재 Master)
  processes/<Process>/master/_versions/<YYYYMMDD_HHmm>/   승인 전 Master 보관
  revisions/<folder>/
    revision.json                   kind · ver · workDate · ref · options · requests · include · log · status
    base/                           tf · layermap · drf · history.txt (Reference에서 가져온 시작점)
    output/                         승인 시 고정 (All + Options/<name>/)
  inbox/<folder>_<stamp>/           codemate 주고받기 (05 문서)
```
- 텍스트 파일 본문은 파일로, 나머지는 JSON — 탐색기 · codemate · git으로도 읽힌다.
- `lib/workspace.js`의 함수는 그대로 두고, `lib/store.js`만 "IndexedDB 한 건" → "폴더 읽기/쓰기"로 바꾼다. 화면은 안 바뀐다.
- 첫 실행에 폴더가 비어 있으면 지금 IndexedDB 작업공간(있으면)을 폴더로 옮긴다.

## Rust 커맨드 (src-tauri/src/lib.rs)
모든 경로는 **허용된 루트(작업 폴더 · VWP 루트) 아래**인지 확인한다 (`canonicalize` 후 `starts_with`, `..` 거부).

```rust
#[tauri::command] fn tm_set_roots(work: String, vwp: String) -> Result<(), String>   // 앱 상태에 루트 저장 (Mutex)
#[tauri::command] fn tm_read_text(path: String) -> Result<String, String>            // 루트 기준 상대 경로
#[tauri::command] fn tm_write_text(path: String, text: String) -> Result<(), String> // 상위 폴더 생성, 임시 파일 → rename
#[tauri::command] fn tm_list_dir(path: String) -> Result<Vec<Entry>, String>          // { name, is_dir, size, modified }
#[tauri::command] fn tm_exists(path: String) -> Result<bool, String>
#[tauri::command] fn tm_write_tree(root: String, files: Vec<FileItem>, overwrite: bool) -> Result<Vec<String>, String>
     // VWP 출력: { path, text } 목록을 한 번에. overwrite=false면 이미 있는 폴더는 Err(이름) — 화면에서 확인 후 다시
#[tauri::command] fn tm_open_folder(path: String) -> Result<(), String>               // explorer로 열기 (open_external 재사용 가능)
```
- `build.rs`의 `AppManifest::new().commands(&[...])`에 추가하고, `capabilities/main.json`에 `allow-tm-…` 권한 추가.
- 텍스트는 받은 그대로 쓴다(줄 끝 변환 금지 — 엔진이 CRLF/LF를 맞춰 둔다). 인코딩: 읽을 때 UTF-8 실패하면 CP949로 다시(사내 파일 [VERIFY]).
- 공유 드라이브(`\\server\share`) 경로도 허용. 쓰기 실패는 메시지 그대로 화면에.

## 프론트 연결
```js
// lib/fsx.js (새 파일) — isTauri()면 invoke, 아니면 지금처럼 zip 다운로드로 대체
export const fsx = {
  read: (p) => invoke('tm_read_text', { path: p }),
  write: (p, text) => invoke('tm_write_text', { path: p, text }),
  writeTree: (root, files, overwrite) => invoke('tm_write_tree', { root, files, overwrite }),
  list: (p) => invoke('tm_list_dir', { path: p }),
};
```
- [폴더 출력]: 설치형이면 `settings.vwpRoot` 아래로 `revisionFolder()` 결과를 `tm_write_tree`, 끝나면 [폴더 열기]. 브라우저면 지금처럼 zip.
- [처리 규칙 · 작업공간]: 작업 폴더 경로 · VWP 루트 입력 + [확인](존재 · 쓰기 권한 검사).
