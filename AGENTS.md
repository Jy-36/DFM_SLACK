# DFM Slack — codemate(opencode) 작업 안내

이 저장소는 업무 도구를 탭으로 모은 Windows 데스크톱 앱입니다 (Tauri 2 + React 18 + Vite).
탭: `src/apps/worktime` (근무시간), `src/apps/mto` (MTO 일정), `src/apps/techmap` (Techmap).

## 꼭 지킬 것
- **새 npm 패키지 · Rust crate를 추가하지 않는다.** 사내 PC는 오프라인 빌드 묶음(OFFLINE.md)으로 빌드한다. 의존성이 바뀌면 묶음을 다시 만들어야 한다. 필요한 건 표준 라이브러리(`std::fs` 등) · 브라우저 API로 해결한다.
- 화면 문구는 한국어, 기존 디자인 클래스(`styles.css`: `.page`, `.panel`, `.btn`, `.data-table`, `.pill`, `.seg`, `.mini-card` …)를 재사용한다. 라이트/다크 모두 확인.
- 계산 로직은 `lib/`의 순수 함수로 두고 `scripts/*-check.mjs`에 테스트를 추가한다. `npm run test:engine`이 전부 돌린다(CI도 같은 단계).
- 버전: `package.json`(x.y.z-prototype) · `src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml` · `WORKTIME_VERSION`을 같이 올리고, README의 해당 앱 절을 갱신한다.
- 사용자 작업 브랜치는 `prototype`. 설치본은 GitHub Actions "Windows 설치 파일 빌드"를 prototype으로 실행해서 만든다.

## Techmap 작업이면
먼저 `docs/techmap-kit/README.md`를 읽고, 그 안의 순서(도메인 → 데이터 모델 → 규칙 → 작업 목록)대로 진행한다.
변환 · 수정 원칙: **LLM은 요청을 표(request.json)로 바꾸기만 하고, 번호 확인 · 파일 수정은 `src/apps/techmap/lib` 엔진이 한다.**
