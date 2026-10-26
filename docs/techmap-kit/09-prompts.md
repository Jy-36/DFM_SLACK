# 09. codemate 지시문

VSCode에서 저장소(`prototype` 브랜치)를 열고 opencode 터미널에 붙여 넣는다. 계획(Plan Builder) → 실행(Plan Executor) 순서를 권장.

## 시작 — 맥락 잡기 (Plan Builder)
```
AGENTS.md와 docs/techmap-kit/README.md, 01~05 문서를 읽고 Techmap 탭의 구조를 요약해 줘.
그다음 src/apps/techmap/lib 의 각 파일이 문서의 어느 규칙을 구현하는지 표로 정리하고,
npm run test:techmap 을 실행해 결과를 보여 줘. 코드는 아직 고치지 마.
```

## T0 — 실제 파일 확인
```
docs/techmap-kit/07-tasks.md 의 T0를 해 줘.
scripts/fixtures/real/ 에 실제 Master · DK 파일을 넣어 두었어(git에 올리지 마 — .gitignore에 추가).
lib/model.js 의 loadSet · consistency, lib/registry.js 의 numberRegistry를 돌리는 스크립트 scripts/techmap-real.mjs 를 만들고,
08-verify.md 의 V1~V18을 실제 파일 기준으로 확인해서 표의 '확인 결과' 칸을 채워 줘.
규칙과 다른 게 있으면 바로 고치지 말고 목록으로 먼저 보여 줘.
```

## T1 — 작업 폴더 DB
```
docs/techmap-kit/06-tauri-folder-io.md 대로 T1을 계획해 줘 (Plan만).
조건: 새 crate · npm 패키지 금지(std::fs만), 경로는 허용 루트 아래만, lib/workspace.js 함수는 그대로 두고 store.js만 교체,
브라우저(npm run dev)에서는 지금 IndexedDB 동작 유지. 바꿀 파일 · 함수 · 테스트를 단계별 체크리스트로 docs/plans/techmap-t1.md 에 써 줘.
```
```
docs/plans/techmap-t1.md 의 1단계만 구현하고 npm run test:engine 을 돌려 줘. 끝나면 다음 단계를 알려 줘.
```

## 규칙 바꿀 때
```
docs/techmap-kit/03-rules.md 의 <규칙>을 <이렇게> 바꾸고 싶어.
lib/planner.js(또는 해당 파일)를 고치고, scripts/techmap-check.mjs 에 바뀐 규칙 테스트를 추가하고, 03 문서도 같이 고쳐 줘.
Python 참조 엔진 비교(golden) 테스트가 깨지면 이유를 설명하고 golden을 갱신할지 물어봐 줘.
```

## Site 요청 변환 (앱이 만든 inbox에서)
앱 [codemate 변환]의 RUN.txt 명령을 그대로 쓴다:
```
opencode run --dir "<경로>/inbox/<작업폴더>_<stamp>" -f site_request.txt -f context.json "AGENTS.md 규칙대로 site_request.txt를 Techmap 요청으로 바꿔서 이 폴더에 request.json으로 저장해 줘. 원문에 없는 값은 지어내지 말고 questions에 적어 줘."
```
