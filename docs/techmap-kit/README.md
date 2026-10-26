# Techmap Kit — codemate 인계 자료

Techmap 탭(DFM Slack Prototype)의 **설계 · 규칙 · 프로토타입 · 다음 작업**을 codemate(opencode)가 이어받아 구현할 수 있게 정리한 묶음입니다.
프로토타입 코드는 이미 `src/apps/techmap/`에 있고 테스트가 통과합니다. 이 Kit은 "왜 그렇게 되어 있는지"와 "다음에 무엇을 해야 하는지"를 담습니다.

## 읽는 순서

| 문서 | 내용 |
|---|---|
| [01-domain.md](01-domain.md) | 업무 도메인: 노드(Process) Master · DK · Option · Ver · 작업날짜 · 숨김 · Other_master |
| [02-data-model.md](02-data-model.md) | 작업공간(workspace) 구조, 작업(리비전) 생애주기, 저장 방식 |
| [03-rules.md](03-rules.md) | 요청 유형별 처리 · 점검 규칙 전체 (엔진이 지키는 것) |
| [04-folders-versions-history.md](04-folders-versions-history.md) | VWP 출력 폴더 구조, 파일 이름, Ver 해석, history.txt 양식 |
| [05-requests-codemate.md](05-requests-codemate.md) | 요청 엑셀 · request.json · opencode CLI 연결 흐름 |
| [06-tauri-folder-io.md](06-tauri-folder-io.md) | 다음 단계: 작업 폴더를 DB로 · VWP 폴더에 바로 쓰기 (Rust `std::fs` 커맨드 명세) |
| [07-tasks.md](07-tasks.md) | **codemate 작업 목록** — 순서 · 범위 · 완료 기준 |
| [08-verify.md](08-verify.md) | 실제 사내 파일로 확인해야 할 것 [VERIFY] |
| [09-prompts.md](09-prompts.md) | codemate에 그대로 붙여 넣을 작업 지시문 |
| [request.schema.json](request.schema.json) | codemate가 만드는 request.json 형식 |

## 코드 지도

```
src/apps/techmap/
  Techmap.jsx            탭 진입점 · 왼쪽 메뉴(노드 → Master · DK → Ver · 작업)
  lib/                   ← 순수 함수. 화면 · 테스트 · 앞으로의 CLI가 같이 쓴다
    sexpr.js             SKILL 괄호 파서 (줄 번호 유지)
    model.js             tf · layermap · drf 색인, 파일 간 점검, LPP 표
    patcher.js           줄 단위 패치(컬럼 정렬 복제 · CRLF 유지 · 줄 삭제) · diff
    planner.js           요청 → 상태(READY/NEEDS_REVIEW/ERROR) → 줄 수정. DK 모드(Master에서 번호 가져오기)
    classify.js          Layer 분류(FEOL/METAL n/VIA n/TOP/MARKER) · 기능키
    options.js           Option(Metal/Via Stack) 규칙 + 예외, Option 파일 만들기(filterSet)
    registry.js          번호 대장, Master ↔ Master 비교, DK ↔ Master 점검
    version.js           Ver 해석 · 정렬 · 작업 폴더 이름
    history.js           history.txt 블록 양식
    revision.js          작업 계산(computeRevision) · 출력 폴더 항목(revisionFolder)
    graph.js             분기 · Merge 관계: 조상 · 공통 조상 · 재생 경로 · DK 그래프 배치(lane/row/edge)
    workspace.js         작업공간 만들기 · 바꾸기 (불변 갱신) · DEMO 데이터
    requests.js          엑셀(.xlsx 직접 읽기) · CSV · request.json → 요청
    codemate.js          inbox 폴더 · AGENTS.md(변환 규칙) · opencode 명령
    zip.js · report.js   의존성 없는 zip, 리포트 CSV, 저장
    store.js             저장 (지금: IndexedDB 한 건 → 다음: 작업 폴더)
    demoMasters.js       DEMO Master(2/3nm · 4nm) — scripts/gen/make_techmap_demo.py로 생성
  pages/ · components/   화면 (RevisionPage, GraphPage · RevGraph, OptionMatrix, RegistryPage, ComparePage, ClassesPage …)
public/techmap/          요청 엑셀 양식 · DK/Master 예시 (scripts/gen/make_techmap_requests.py)
scripts/techmap-check.mjs  엔진 · 작업공간 · 분기/Merge 테스트 (88건) + Python 참조 엔진과 글자 단위 비교
```

## 실행 · 확인

```bash
npm run test:techmap      # 엔진 테스트만 (Node만 있으면 됨)
npm run test:engine       # WorkTime · MTO · Techmap 전부 (CI와 같음)
npm run dev               # 브라우저에서 화면 (http://localhost:1420)
npm run tauri dev         # 데스크톱 창
```

화면에서 DEMO 흐름: Techmap 탭 → Window Mode → 열린 작업 `SF3 v1.0.0.0_exp_20261020` → [요청 올리기]에 `public/techmap/techmap_request_dk_sample.xlsx`
→ 요청 검토 · Option · 점검 · History 탭 → [승인] → [폴더 출력].

## 바꾸면 안 되는 원칙

1. **번호는 Master에서만 만든다.** DK · Option은 Master에 있는 LPP만, Master와 같은 번호로.
2. **같은 목적이면 노드가 달라도 같은 번호.** 이름이 달라도 기능키로 묶어 비교한다.
3. **원본 양식 유지.** 파일을 다시 만들지 않고 줄 단위로 고친다.
4. **추측하지 않는다.** 모르는 값은 NEEDS_REVIEW/ERROR로 남기고 사람이 결정한다.
5. **LLM은 변환만.** 요청 원문 → request.json까지. 파일 수정 · 번호 확인은 엔진.
6. **의존성 추가 금지** (오프라인 빌드).
