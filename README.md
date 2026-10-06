# DFM Slack

업무용 도구를 탭으로 모아 쓰는 Windows 데스크톱 앱입니다 (Tauri 2 + React 18).
첫 번째 탭은 선택근무제 근무시간을 관리하는 **WorkTime**입니다.

- 상단 바의 **+** 로 앱을 탭으로 추가하거나 닫습니다.
- 처음에는 휴대폰 크기 **요약 화면**으로 열리고, 상단 바 버튼으로 **확장 화면**으로 바꿉니다.
- 라이트/다크 테마는 상단 바에서 바꿉니다.
- 설치형에서는 Windows 기본 제목 표시줄 대신 이 상단 바를 잡아 창을 옮깁니다.

## 폴더 구조

```
src/
  shell/          DFM Slack 본체 — 상단 바, 탭, 앱 추가 메뉴
    apps.js       탭으로 넣을 수 있는 앱 목록 ← 새 앱은 여기에 한 줄 추가
  apps/
    worktime/     WorkTime 앱 (정산 엔진 lib/, 화면 pages/)
  shared/         여러 앱이 같이 쓰는 UI·테마·창 크기
src-tauri/        데스크톱 앱 (창, 사내 사이트 수집 커맨드)
```

### 새 앱(탭) 추가하기

1. `src/apps/<이름>/<이름>.jsx` 를 만들고 `export default function 이름({ mode, setMode })` 를 작성합니다.
   `mode`는 `'compact'`(요약) 또는 `'full'`(확장)입니다.
2. `src/shell/apps.js` 의 `APPS` 에 `{ id, name, desc, icon, component }` 를 추가합니다.

## 설치 파일 받기 (GitHub Actions)

`main` 브랜치에 올라가면 GitHub의 Windows 빌드 서버가 자동으로 설치 파일을 만듭니다.

1. 저장소의 **Actions** 탭에서 "Windows 설치 파일 빌드"가 초록색(성공)이 될 때까지 기다립니다 (10~15분).
2. 저장소 오른쪽의 **Releases** → 최신 버전 → **Assets**에서 `DFM Slack_x.y.z_x64_en-US.msi` 또는 `DFM Slack_x.y.z_x64-setup.exe`를 받습니다.
3. 실행하면 설치되고, 시작 메뉴에 **DFM Slack**이 생깁니다.

`package.json`의 `version`을 올리면 새 Release가 생기고, 같은 버전으로 다시 올리면 그 Release의 파일이 교체됩니다.

설치형에서는 Windows 기본 제목 표시줄 대신 앱 디자인 상단 바를 씁니다(끌어서 이동, 최소화·요약/확장·닫기).

# WorkTime

## 화면

| 메뉴 | 하는 일 |
|---|---|
| 현황 | 오늘 출근·예상 퇴근, 이번 달 필요/인정/남은 시간, 주간 52시간 막대, 확인 필요 항목, 지난달 정산 |
| 근무기록 | 달력으로 일별 출퇴근·휴가 확인, 날짜별 직접 보정 |
| 근무 계획 | 남은 근무일별 실근무 시간·휴가를 정하면 월말 정산 결과와 예상 퇴근 시각 계산, 균등 배분 |
| 동기화 | 사내 근태 사이트 수집 실행, 수집 설정(주소·표 선택자·열 번호), 표 HTML 붙여넣기 파싱 테스트 |
| 설정 | 소정근로, 인정 시간대, 1일 최소/최대, 주 최대, 휴게 차감 규칙, 휴가별 인정 시간 |

## 실행

필요한 것: Node.js 18+, Rust (rustup, MSVC 툴체인), Windows 10/11 (WebView2 기본 포함).

```bash
npm install
npm run dev            # 브라우저에서 화면만 확인 (http://localhost:1420)
npm run tauri dev      # 데스크톱 창으로 실행
npm run tauri build    # 설치 파일 생성 → src-tauri/target/release/bundle/{msi,nsis}
npm run test:engine    # 정산 엔진 계산 확인 (Node만 있으면 됨)
```

회사 PC에서 npm·crates 설치가 막혀 있으면, 개발 가능한 PC에서 `npm run tauri build`로 만든 `.msi`만 옮겨 설치하면 됩니다.

## WorkTime 구조

```
src/apps/worktime/
  WorkTime.jsx    탭 진입점 (요약·확장 화면 전환)
  lib/
    engine.js     정산 엔진 (순수 함수) — 휴게 차감, 일별 인정, 월 요약, 배분
    rules.js      선택근무제 규칙 기본값 ← 회사 규정이 바뀌면 여기만 수정
    holidays.js   공휴일 표 (나중에 사내 캘린더로 교체)
    mockData.js   가짜 근태 데이터 생성기
    sync.js       사내 사이트 수집 흐름 + 표 HTML 파서
    store.js      앱 상태 (현재 localStorage)
    time.js       시간·날짜 유틸
  pages/          Mini(요약), Dashboard, Records, Planner, Sync, Settings
  components/     Targets (Max·필요시간 패널)
src-tauri/
  src/lib.rs      open_attendance_window / submit_attendance_html 커맨드
  scripts/extract.js  사내 사이트 창에 주입되는 표 수집 스크립트
  capabilities/   창별 권한 (사내 사이트 창은 HTML 전송 하나만 허용)
```

## 정산 계산 규칙 (기본값)

- **Max** = 주 최대 52h ÷ 7 × 월 일수, 시간 단위 버림 (30일 → 222:00, 31일 → 230:00). [설정]에서 분 단위로 변경 가능
- **필요시간** = min(근무일수 × 8h, 주 소정 40h ÷ 7 × 월 일수(시간 단위 버림)) − 비근무근태 시간
- **평일 누적초과** = 전일까지 평일(근무일) 인정 − 전일까지 평일 필수근무 누적 (휴일근무 제외)
- 비근무근태(필요시간 차감): 연차 8h, 반차 4h, 반반차 2h / 근무 인정: 출장·교육 8h
- 일 인정 = 실근무(휴게 차감) + 출장·교육 인정, 1일 최대 12h
- 휴게: 실근무 4시간마다 30분, 근로 인정 시간대 06:00–22:00
- `npm run test:engine`으로 위 공식 확인

## 근무 계획 일괄 변경

남은 근무일을 체크(빠른 선택: 전체·휴가 없는 날·이번 주·다음 주·매주 요일)한 뒤
- 실근무 시간(+선택: 출근 시각) 또는 출퇴근 시각으로 한 번에 적용
- 근태(연차 등)를 한 번에 지정
- "남은 필요시간 나눠 넣기": 선택하지 않은 날 계획은 그대로 두고 부족분을 선택한 날에 배분
- "Max까지 채우기": 월 Max까지 남은 시간을 남은 근무일(또는 선택한 날)에 고르게 나눔. 22:00(인정 시간대 끝)을 넘는 날은 출근 시각을 자동으로 앞당김
- 회사 기준에 맞춰 하루 최대·주 52h 제한은 기본으로 꺼져 있음 ([설정]에서 켤 수 있음)

## 시간 고정 · 휴일 근무

- 근무 계획에서 시간을 직접 바꾼 날(또는 일괄 적용한 날)은 자물쇠로 **고정**됩니다. 균등 배분·Max 채우기·나눠 넣기는 고정한 날을 그대로 두고 나머지 날에만 배분합니다. 자물쇠를 눌러 풀거나, 일괄 변경의 "고정 / 고정 풀기"로 여러 날을 한 번에 바꿀 수 있습니다.
- **휴일 근무 추가**로 주말·공휴일 근무를 계획에 넣을 수 있습니다. 휴일 근무는 **Max에서만 차감**되고 **필요시간은 줄여주지 않습니다**(필요시간은 근무일 근무로 채워야 함). 평일 누적초과에서도 제외됩니다.
- 근무기록 달력은 공휴일·주말·패밀리데이를 배경색으로, 휴일 근무를 왼쪽 빨간 줄로 구분합니다. 칸 아래 큰 숫자는 지난 날은 인정, 앞으로는 예정 시간입니다.

## 패밀리데이

매달 21일이 있는 주(월~일)의 금요일이 후보로 표시됩니다. [근무 계획]에서 "패밀리데이로 쉬기"를 누르면 그날은 일하지 않지만 필요시간은 줄지 않습니다. 그날 몫(8h)은 "다른 날에 나눠 채우기" 또는 균등 배분으로 다른 근무일에 넣습니다. 후보일이 공휴일이면 표시되지 않습니다.

## 사내 사이트 수집 (다음 단계)

1. 앱이 `portalUrl`을 별도 창으로 엽니다. 사용자가 직접 로그인합니다(인증 정보 저장 안 함).
2. `extract.js`가 페이지마다 `rowSelector` 행을 찾고, 행 수가 안정되면 표 HTML을 앱으로 보냅니다.
3. 메인 창이 `parseAttendanceHtml()`로 날짜·출근·퇴근·근태구분을 읽어 저장합니다.

붙일 때 바꿀 곳:
- `src/apps/worktime/lib/sync.js` `DEFAULT_SYNC_CONFIG` — 실제 주소, 표 선택자, 열 번호, 근태구분 글자
- `src-tauri/capabilities/attendance.json` `remote.urls` — 실제 사내 도메인
- 날짜·시간 형식이 다르면 `normalizeDate()`, `normalizeTime()`

사내 시스템 자동 수집이 보안 정책상 허용되는지(본인 데이터 조회 범위) 먼저 확인하세요.

## 상태

- 화면·정산 엔진: 가짜 데이터로 동작 확인
- Tauri(Rust) 쪽: GitHub Actions의 Windows 빌드로 확인
- 저장: localStorage (Tauri 창에서도 동작). 다음 단계에서 `tauri-plugin-sql`(SQLite)로 교체 예정
