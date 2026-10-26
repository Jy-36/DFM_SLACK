# 07. codemate 작업 목록

순서대로. 한 작업 = 한 커밋(또는 PR) 단위. 모든 작업 공통 완료 기준:
`npm run test:engine` 통과 · 새 규칙은 `scripts/techmap-check.mjs`에 테스트 추가 · 새 의존성 없음 · README Techmap 절 갱신 · 라이트/다크 화면 확인.

---

### T0. 실제 사내 파일로 엔진 확인 (가장 먼저)
- 사용자가 주는 실제 Master · DK tf / layermap / drf 묶음을 `scripts/fixtures/real/`(git에 올리지 않음 — `.gitignore`)에 두고 읽기 · 점검만 돌려 본다.
- 확인: 파싱 성공, `consistency()`·`numberRegistry()` 결과가 말이 되는지, 08 문서 [VERIFY] 항목 하나씩.
- 결과를 `docs/techmap-kit/08-verify.md`에 "확인됨 / 다름 → 이렇게 고침"으로 적는다.
- **완료 기준**: 실제 파일 세트를 base로 DK 예시 요청을 적용했을 때 바뀐 줄 외에는 diff가 0.

### T1. 작업 폴더 = DB (06 문서)
- Rust 커맨드 `tm_*` + `lib/fsx.js` + `lib/store.js` 교체. 브라우저(dev)에서는 지금 IndexedDB 그대로.
- 처리 규칙 화면에 작업 폴더 경로 입력 · 확인.
- **완료 기준**: 앱을 껐다 켜도 폴더에서 그대로 복원 · 탐색기에서 `revisions/<folder>/revision.json`이 보임 · IndexedDB → 폴더 1회 이전.

### T2. VWP 폴더에 바로 출력
- [폴더 출력]이 설치형이면 `vwpRoot/<Process>/<DK>/<folder>/`에 쓰기. 이미 있으면 덮어쓸지 확인. 끝나면 [폴더 열기].
- `_techmap/`을 VWP에 같이 둘지 설정(기본: 같이).
- **완료 기준**: zip을 푼 결과와 바이트 단위로 같음.

### T3. techfile include · 여러 파일 구성
- 사내 techfile이 `include()`나 여러 파일로 나뉘면(08), Master · DK 파일 세트를 "주 파일 + 포함 파일"로 다루기. 패치는 해당 줄이 있는 파일에.
- **완료 기준**: 나뉜 실제 파일에서 ADD · RETIRE가 맞는 파일에 들어감.

### T4. drf packet 여러 줄 · 다른 drf 문법
- 지금 CHANGE_DISPLAY는 packet이 한 줄일 때만. 여러 줄 packet 수정 지원(괄호 범위 전체를 다시 쓰되 들여쓰기 유지).
- **완료 기준**: 여러 줄 packet 테스트 추가 · 기존 한 줄 결과 불변.

### T5. 분류 · 기능키 규칙을 Process 설정으로
- 지금 추정식은 코드(`classify.js`)에 고정. Process별 이름 규칙(정규식 → 분류/레벨/기능키)을 설정으로 두고 화면에서 편집.
- Other_master 기능키 대응표 가져오기/내보내기(CSV).
- **완료 기준**: SF2 `ME1` 같은 접두어를 설정만으로 METAL 1로 인식 · 기존 테스트 유지.

### T6. codemate 연결 자동화
- inbox를 작업 폴더 안에 바로 만들고(T1 이후), 작업 화면에서 그 inbox의 `request.json`을 [다시 읽기]로 가져오기.
- `questions`를 화면에 보여 주고, 답을 메모로 남긴 뒤 다시 변환할 수 있게(같은 inbox에 `answers.txt`).
- **완료 기준**: 원문 → (터미널에서 opencode run) → [다시 읽기] → 요청 카드까지 파일 선택 없이.

### T7. Ver · 발행일 · 작업 이력 보기
- DK별 Ver 목록 화면: 정식 / exp / incr 필터, 발행일(별도 칸) · 작업 수 · 마지막 승인.
- 같은 Ver의 작업들 사이 diff(작업 A 결과 ↔ 작업 B 결과).
- **완료 기준**: v1.0.0.0 · exp · incr이 섞여도 정렬이 `compareVer`와 같음.

### T8. Master 변경 → DK 영향 알림
- Master가 바뀌면(번호 변경 · 폐기) 그 Process의 열린 DK 작업 · 최근 승인본에 영향이 있는 LPP를 점검에 표시.
- **완료 기준**: Master에서 GDS를 바꾸면 DK 작업 점검에 "All ↔ Master 번호 다름"이 뜸 (지금 규칙 재사용).

### T9. 성능 · 큰 파일
- 실제 techfile(수 MB)에서 메뉴 뱃지 계산(`computeRevision`을 작업마다)이 느리면: 작업별 결과 캐시(입력 해시 키), Option 계산 지연.
- **완료 기준**: 실제 크기 파일 작업 5개에서 탭 전환 200ms 이내.

---
작업하다 규칙을 정해야 하는 상황(사내 정책)이 나오면 **추측해서 구현하지 말고** 08 문서에 질문으로 남기고 사용자에게 묻는다.
