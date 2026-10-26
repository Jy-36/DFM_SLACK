# DFM Slack

업무용 도구를 탭으로 모아 쓰는 Windows 데스크톱 앱입니다 (Tauri 2 + React 18).
탭: 선택근무제 근무시간을 관리하는 **WorkTime**, Mask STEP2·MTO 일정을 계산하는 **MTO**, Site Request로 techfile·layermap·drf를 검토·수정하는 **Techmap**.

- 상단 바의 **+** 로 앱을 탭으로 추가하거나 닫습니다.
- 처음에는 **요약 화면**(모니터 오른쪽 끝, 위아래 꽉 차게, 둥근 모서리)으로 열리고, 상단 바 버튼으로 **확장 화면**(1440×940, 모니터보다 크면 줄임)으로 바꿉니다.
- 화면 모드: **Widget Mode**(오른쪽 위 작은 창) · **App Mode**(오른쪽 끝 요약) · **Window Mode**(넓은 창). 상단 바 오른쪽 세 버튼으로 바꿉니다.
- Window Mode 왼쪽 메뉴는 위쪽 작은 버튼으로 접을 수 있습니다.
- 라이트/다크 테마는 상단 바에서 바꿉니다.
- 설치형에서는 Windows 기본 제목 표시줄 대신 이 상단 바를 잡아 창을 옮깁니다.
- 상단 바의 **위젯** 버튼: 모니터 오른쪽 맨 위에 300×164 작은 창으로 오늘 퇴근 목표·진행·월말 예상만 표시. 투명도(35~100%) 슬라이더, 핀 버튼으로 **항상 위**(설치형만).

## 폴더 구조

```
src/
  shell/          DFM Slack 본체 — 상단 바, 탭, 앱 추가 메뉴
    apps.js       탭으로 넣을 수 있는 앱 목록 ← 새 앱은 여기에 한 줄 추가
  apps/
    worktime/     WorkTime 앱 (정산 엔진 lib/, 화면 pages/)
    mto/          MTO 일정 앱 (규칙 엔진 lib/, 화면 pages/, 간트 components/)
    techmap/      Techmap 앱 (파서·검사·패치 엔진 lib/, 화면 pages/)
  shared/         여러 앱이 같이 쓰는 UI·테마·창 크기·공휴일 표
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
| 근무기록 | 달력으로 일별 출퇴근·휴가 확인, 날짜별 보정 → [변경 내용 반영]을 눌러야 저장 |
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
npm run test:mto       # MTO 일정 엔진 확인
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

- **최대 근무 시간** = 주 최대 52h ÷ 7 × 월 일수, 시간 단위 버림 (30일 → 222:00, 31일 → 230:00). [설정]에서 분 단위로 변경 가능
- **필수 근무 시간** = min(근무일수 × 8h, 주 소정 40h ÷ 7 × 월 일수(시간 단위 버림)) − 비근무근태 시간
- **필요 시간** = 필수 근무 시간 − 현재 근무 시간(근무일 인정, 오늘 포함)
- **예상 초과 근무 시간** = 계획대로 일한 월말 평일 근무 시간 − 필수 근무 시간
- **OT** = 예상 초과 근무 시간 − 포괄 14h ([설정]에서 변경). 주말·공휴일 근무는 따로 표시
- OT 구간 (실질 단가 = (OT + 주말 근무) ÷ (초과 근무 + 주말 근무)): ~14h 호구왕(무급) · 14~28h 호구존(16~18h 12~22%) · 28h 해피존(50%) · 40h+ 부자존(65%+)
- 출장·교육은 그날 8시간 고정 (계획·배분에서 더 넣지 않음)
- **휴게 조정 추천**: 체류 8:30 초과 ~ 9:00 미만이면 알림 (휴게 30분으로 8시간 초과 근무가 잡히는 구간)
- **평일 누적초과** = 전일까지 평일(근무일) 인정 − 전일까지 평일 필수근무 누적 (휴일근무 제외)
- 비근무근태(필요시간 차감): 연차 8h, **시간 연차 2h 단위(2·4·6h)** / 근무 인정: 출장·교육 8h
- 예전 오전·오후반차 기록은 시간 연차 4h, 반반차는 2h로 자동 변환
- **제외시간**(외출 등): 출근 기록이 있는 날에만 입력, 체류시간에서 먼저 빼고 휴게 규칙 적용. 사내 데이터의 제외시간 열(`cols.exclude`)도 읽음
- 일 인정 = 실근무(휴게 차감) + 출장·교육 인정, 1일 최대 12h
- 휴게: 실근무 4시간마다 30분, 근로 인정 시간대 06:00–22:00
- `npm run test:engine`으로 위 공식 확인

## 근무 계획 일괄 변경

남은 근무일을 작은 달력이나 표에서 체크(Shift+클릭으로 구간 선택, 빠른 선택: 전체·휴가 없는 날·이번 주·다음 주·매주 요일)한 뒤
- 실근무 시간(+선택: 출근 시각) 또는 출퇴근 시각으로 한 번에 적용
- 근태(연차 등)를 한 번에 지정
- "남은 필요시간 나눠 넣기": 선택하지 않은 날 계획은 그대로 두고 부족분을 선택한 날에 배분
- 오늘 계획은 직접 바꾸거나 배분할 수 있지만, 지금까지 일한 시간보다 낮아지지 않음
- "목표 초과 배분": 예상 초과 근무 시간 또는 OT 목표(시간)를 넣으면 남은 근무일에 나눔, 최대 근무 시간은 넘지 않음
- 마지막으로 반영한 배분 버튼에 "방금 반영" 표시
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

# MTO

Part A GDS 입고일과 Layer List를 넣으면 Layer별 **STEP2 시작일**과 **MTO 날짜**를 계산하고 병목을 분석합니다.
여러 **Product**(Part A/B)와 **Revision**(Product와 별개로 몇 장만, Part 없이 GDS → STEP1 → STEP2 → MTO)을 한꺼번에 관리하고,
묶음마다 따로 계산합니다 (STEP2 동시 진행·하루 MTO 장수는 묶음별 설정, 서로 공유하지 않음).
`mto-scheduling-agent`(Python)의 규칙 엔진을 JS로 옮겨 앱 안에서 바로 계산합니다 — Python·서버·인터넷 없이 동작.

## 화면

| 모드 · 메뉴 | 하는 일 |
|---|---|
| 전체 일정 | Product·Revision 요약 표(GDS·조건·최종 MTO·가장 큰 대기, 순서 바꾸기), 묶음별 간트, 날짜별 MTO(전체), 전체 엑셀용 복사 |
| 일정 현황 | 위쪽 칩으로 묶음 고르기·추가(Product/Revision)·이름·복제·삭제, Revision은 원래 Product(참고용)·STEP1 TAT, GDS 입고일·하루 MTO 수·STEP2 동시 수 빠른 변경, 최종 MTO, 대기 요약, 병목 분석(최종 MTO 경로 · 원인별 누적 대기), 추천 일정(조건 변경·Layer 순서 재배열·GDS 조정 효과), 리스크, 시나리오 비교(2·3장 × 4·5장, 누르면 적용), 간트 |
| Layer List | 직접 편집, 엑셀 붙여넣기(머리줄이 있으면 열 순서 무관), CSV 열기, 예시 30장, No 다시 매기기·위아래 이동 |
| Layer별 일정표 | 날짜별 MTO 묶음, Layer별 표, 엑셀용 복사, CSV 저장 |
| Process Layer Set | 공정 칩 끝 **+** 로 새 공정(Reference Copy / 새로 Setting), 이름·설명은 [수정]으로, 삭제는 확인 팝업 + 되돌리기. 왼쪽 분류(공정 → FEOL Concept · Module / BEOL Option, 접고 펼치기)에서 고른 것에 따라 오른쪽 편집 화면과 아래 Layer SPEC Sheet가 바뀜. 시트 위 **Module Option 비교**로 Module마다 Option별 Layer · Type · SPEC을 나란히 보고 다른 값을 표시 |
| 규칙 | STEP1 TAT(Part), STEP2 TAT(Type 추가·삭제), Part B GDS 간격, 하루 MTO 수, STEP2 동시 수, MTO 가능 간격, 주말·회사 휴무일 |
| App Mode | 묶음 고르기 · 최종 MTO · 빠른 조건 변경 · 전체 묶음 목록 · 다음 MTO · 병목 · 시나리오 |
| Widget Mode | 선택한 묶음의 최종 MTO · 모든 묶음 중 가장 가까운 MTO · 진행 |

입력이 바뀌면 바로 다시 계산하고, 묶음·규칙은 localStorage(`mto.v2`)에 저장합니다. 예전(`mto.v1`) 입력은 Product 1로 옮겨집니다.
[규칙]은 모든 묶음의 기본값이고, 하루 MTO 수·STEP2 동시 수는 묶음마다 [일정 현황]에서 따로 바꿀 수 있습니다. Revision STEP1 TAT 기본값은 3일.

## Product 탭 / Revision 탭 / Common

MTO 앱 왼쪽 위에서 **Product · Revision · Common**을 전환합니다.
- **Common** (왼쪽 메뉴 아래): Product 정보(기준 공정 · FEOL Concept · BEOL Option · Code/고객/담당/비고 등 정보 열 추가 가능), Process Layer Set, 규칙 — Product · Revision이 같이 쓰는 기준 정보.
- Part는 **FEOL · BEOL** 두 개. FEOL은 **Module**로 나누고, BEOL은 여러 **BEOL Option**(예: 15M, 11M) 중 Product가 하나를 고릅니다.
  Set List = 고른 **FEOL Concept**의 Layer + 고른 BEOL Option의 Layer. Option을 바꾸면 다른 쪽은 그대로 두고 그 Part Layer만 바뀌어요.
- **FEOL Concept**: Module마다 어떤 **Module Option**(예: MOL의 Base / HD)을 쓸지 정한 조합. 하나는 **POR**(기본, 주황색, 맨 앞).
  Module Option이 빈 Layer는 공통이라 항상 들어가고, Module Option이 있는 Layer는 FEOL Concept이 고른 것만 들어가요.
- FEOL Concept은 **활성/비활성**을 정할 수 있어요. 비활성 Concept은 Product에서 새로 고를 수 없고(이미 쓰는 Product는 유지), POR은 항상 활성.
- Concept의 Module Option을 바꾸거나 Module에서 **POR로 지정**하면 팝업에서 빠지고 들어오는 Layer를 보여 주고, 그 Concept을 쓰는 Product Set List를 다시 담을지 고를 수 있어요.
- FEOL Concept · Module · BEOL Option은 **+** 버튼(분류 묶음 옆, 각 편집 화면)에서 팝업으로 추가해요. BEOL Option은 Reference Copy(Layer · 순서 복사) 또는 새로 Setting.
- Module은 ▲▼로 순서를 바꿀 수 있고, 시트와 Set List의 FEOL Layer 순서도 같이 바뀌어요.
- 앱 이름 아래 도구줄의 **‹ ›**(뒤로 · 앞으로, Alt + ← / →, 마우스 뒤로·앞으로 버튼)와 메뉴 접기 버튼 — MTO와 WorkTime 공통. MTO는 메뉴 · Product · 공정 분류 이동, WorkTime은 메뉴와 근무기록 달을 되돌아가요.
- Revision 메뉴: **Dashboard · Concept**. 왼쪽 위는 앱 이름 · 버전 옆에 뒤로 · 앞으로 · 메뉴 접기.
- Revision 일정 현황: 맨 위 Product · ITEM 고르기(접기/펼치기) → **변경점** DB · Runset · SPEC을 고르면 칸이 생겨요.
  DB는 바뀌는 것(A · B · C), Runset은 변경 STEP(없으면 + STEP으로 추가), 각각 준비 날짜 · 코멘트. SPEC은 준비 날짜 · 코멘트.
  GDS 입고일은 따로 넣지 않고 고른 변경점의 준비 날짜 중 가장 늦은 날로 계산해요 (하루 MTO · STEP2 동시는 규칙 기본값).
- Concept 맨 위 고정 줄: `Product › ITEM · Target · MTO`, 누르면 ITEM 목록에서 바꾸기 (이름 · Product 변경은 기본 정보 [수정]). Concept에는 STEP1 · STEP2 간트 대신 **Step 일정** 간트(Changes 준비 → Step X → DWR → DP → EBEAM Review → MTO 완료: 완료 · 진행 중 · 예상 · 기본 기간(Step X 3 · DWR 2 · DP 5 · EBEAM 2일), 오늘 · MTO Target 선). Revision 계산은 STEP2 동시 진행 제한 없음.
- **계획 · 실적**: Changes 줄마다 계획 날짜와 [준비 완료](누르면 오늘 날짜로 실적, 고치기 · × 되돌리기 가능). 보기 화면에서도 바로 누를 수 있어요. DB에서 Step X 대상(A · B · C)은 Step X 날짜가 최종 전달일. 항목 머리에 계획 · 실적 가장 늦은 날, 준비중 n/m. GDS = 실적이 있으면 실적, 없으면 계획 중 가장 늦은 날. Step X는 Changes(DB) 안에서 처리하고 따로 Step을 두지 않아요. Step 일정 간트는 줄마다 계획(점선) · 실적(진한 색), Changes 항목은 계획 ◇ · 실적 ◆.
- **진행 Step** (Concept · 오른쪽 패널 · Dashboard Step 칸): Changes 준비 → (DB Step X가 있으면) Step X 진행중 → DWR 작성 필요 → DP 진행중 → EBEAM Review 요청 필요 → MTO 완료. 각 Step은 날짜(기본 오늘, 수정 가능) · 코멘트와 함께 완료 처리, EBEAM Review 완료 날짜가 MTO 완료 날짜. [이전 Step으로]로 한 단계씩 되돌리기, 끝낸 Step 기록에서 날짜 · 코멘트 수정, Step마다 예상 날짜.
- **준비 상태**: Changes의 DB · Runset · SPEC마다 [준비중 / 준비 완료] (날짜가 다 지나면 자동 완료, 눌러서 직접 지정). Changes 제목 옆과 Dashboard 단계 칸에 'Runset 준비중' · '2/3 준비중'처럼 표시.
- ITEM **완료 · 삭제**: Dashboard 목록 · 오른쪽 패널 · Concept 설정에서 완료 처리(목록 · 타임라인 · ITEM 고르기에서 숨김, 상태 필터 [진행 · 완료 · 전체]로 다시 보기), 삭제는 확인 팝업 + 되돌리기. 이슈 삭제도 되돌리기.
- **Revision Dashboard**: ITEM 목록(필터: Product · ITEM/요청자 · MTO Target 기간) + 걸러진 ITEM만 일정 타임라인(준비 → GDS → STEP1 → STEP2 → MTO, Target 깃발, Reference 곡선, 기준일 단계). ITEM을 누르면 오른쪽에 Concept 정보 패널, **+ ITEM**은 Concept 정보(Product · 이름 · Target · 요청자 · Comment · Changes · Reference · Layer)를 한 번에 넣는 창.
- **Revision Concept**: 위 ITEM 고르기는 스크롤해도 위에 고정. 제목 `Product · ITEM` → 기본 정보 · Changes · Reference(접기) · Layer List(고른 것만) 모두 보기 → [수정] → 저장 → **Issues**(상태 Open/진행/완료 · 내용 · 담당자 · 기한) → 결과 · 간트 · Layer별 일정표 → **관련 자료**(링크).
- 위젯 모드에서 빈 곳을 두 번 누르면 창 모드로.
- **BEOL Option**: 컨셉(예: 1X 6층 + 2X 4층 …)과 **Metal · Via 쌓는 순서**를 가져요. 순서가 없으면 [편집]에서 Layer를 아래부터 차례로 골라 정하고, Set List도 그 순서로 담겨요.
- 예전 데이터의 Part A/B는 FEOL/BEOL로, 공정의 BEOL Module은 BEOL Option으로 자동으로 옮겨집니다.
- **Product**: 새로 만들면 기준 공정의 **Set List 전체**가 담겨요. 중간부터 나가는 경우 [Set List]의 "중간부터"에서 시작 Layer를 고르면 그 Layer부터 끝까지 담깁니다.
  GDS 입고일은 Set의 첫 Part GDS예요 (Part B부터 나가면 입력한 날이 Part B GDS).
- **Revision**: **ITEM** 단위(보통 1~5장 Set)로 들어오고, 항상 **Product에 딸려** 있어요. Product가 있어야 ITEM을 만들 수 있고,
  ITEM Layer는 그 Product의 Set List에서 고릅니다. 기준 공정은 Product를 따라가고, Part 구분 없이 GDS → STEP1 → STEP2 → MTO로 계산해요.
  Product를 지우면 딸린 ITEM도 함께 지워집니다 (되돌리기 가능). 이름은 `Product REV01`처럼 자동으로 붙어요.

## 공정 기준 Product

Product·Revision마다 **기준 공정**을 고르면 Layer List는 그 공정의 Part → Module → Layer 트리에서 체크해서 담습니다.
- Layer 이름·Part·Module·Type은 공정 시트를 따라가요 (시트를 고치면 그 공정을 쓰는 Product에 바로 반영).
- Part의 GDS 입고 간격과 STEP1 TAT는 공정의 Part 설정을 씁니다 (Part 이름 자유: A/B, FEOL/BEOL 등).
- No(= STEP2 투입·MTO 순서)는 Product마다 정하고, [공정 순서로 No 매기기]로 시트 순서대로 맞출 수 있어요.
- Revision도 공정 Layer를 골라 담을 수 있고, Part 구분 없이 계산합니다.
- 기준 공정을 "직접 입력"으로 두면 예전처럼 Part A/B Layer를 직접 입력합니다.
- 처음 실행하면 예시 공정(30장, Part A: FEOL·MOL / Part B: BEOL-1·2)이 하나 들어 있어요.

## 규칙 (기본값)

| # | 규칙 | 구현 |
|---|------|------|
| 1 | Part B GDS = Part A GDS + 2주 | `partBOffsetDays = 14` |
| 2·3 | STEP1은 Part(GDS) 단위, STEP2는 Layer 단위 | Part별 STEP1 1회 |
| 4 | GDS → STEP1 → STEP2 | STEP2는 STEP1 끝난 다음 날부터 |
| 5 | STEP2 + 1일 후 MTO, No 순서대로 | `mtoGapDays = 1`, 앞 번호를 앞지르지 않음 |
| 6 | STEP1/2는 휴일 시작 불가, 시작 후엔 휴일에도 진행 | 시작일만 근무일로, TAT는 달력일 |
| 7 | STEP1 TAT A 5 / B 3, STEP2 TAT X 3 / Y 5 / Z 7 | `step1Tat`, `step2Tat` |
| 8·9 | MTO는 휴일 불가, 대한민국 공휴일 | `src/shared/holidays.js` (WorkTime과 공유) + 주말 + 회사 휴무 |
| 10 | 하루 MTO 2~3장 | `mtoPerDay` (기본 2) |
| 11 | STEP2 동시 4~5장 | `step2Concurrency` (기본 4), No 순서로 슬롯이 비는 첫 근무일에 투입, 진행 중이면 휴일에도 슬롯 점유 |

- TAT: S일 시작, TAT n이면 S ~ S+n-1일 진행, 다음 단계는 S+n일부터.
- GDS 입고일이 휴일이면 STEP1은 다음 근무일에 시작.
- 공휴일 표는 2026·2027년만 들어 있습니다. 다른 해는 주말만 휴일로 계산하고 화면에 알려 줍니다(규칙 → 회사 휴무일로 보완).

## 분석

원본의 LLM 분석(병목·추천·리스크)을 규칙 기반으로 바꿨습니다. 날짜는 엔진 결과만 쓰고, 추천은 엔진을 다시 돌려 비교한 값입니다.
- **최종 MTO 경로**: 마지막 MTO Layer가 GDS 대기·STEP1·휴일·STEP2 슬롯 대기·STEP2·MTO 대기에 각각 며칠을 썼는지
- **병목**: STEP2 슬롯 대기 / 앞 번호 Layer 때문에 생긴 순서 대기 / 하루 MTO 장수 제한 / 휴일 밀림 — Layer별 대기를 더한 누적 일수와 비중
- **추천**: 시나리오 중 가장 빠른 조합, Part 안 Layer 순서 재배열(짧은 Type 먼저/긴 Type 먼저 중 나은 쪽, [순서 적용]·되돌리기), GDS를 1~3일 당겼을 때 그 이상 당겨지는 경우
- **리스크**: STEP2가 꽉 찬 구간, 대기 0일인 Layer, MTO 앞뒤 공휴일, 공휴일 표가 없는 해

## MTO 구조

```
src/apps/mto/
  Mto.jsx          탭 진입점 (모드 전환, 메뉴)
  lib/
    scheduler.js   규칙 엔진 (buildSchedule, scenarioGrid, makeCalendar) ← 규칙이 바뀌면 DEFAULT_CONFIG
    insights.js    병목·추천·리스크 분석
    report.js      요약 수치, CSV·엑셀용 텍스트
    layers.js      예시 Layer, 붙여넣기 파서, 입력 확인
    dates.js       'YYYY-MM-DD' 날짜 계산
    projects.js    Product·Revision 묶음 (묶음별 설정 · 계산)
    process.js     공정 마스터 (Part·Module·Layer·SPEC, 트리, 붙여넣기, Product Layer 연결)
    store.js       상태 (localStorage, 묶음 목록)
  components/      Gantt(SVG), PortfolioGantt(전체), ProjectBar(묶음 고르기), Insights, Controls
  pages/           Portfolio(전체 일정), Overview, LayerList(직접 입력), ProcessLayerList(공정 기준), ScheduleTable, ProcessSheet(공정·SPEC), Rules, Mini, Widget
scripts/mto-check.mjs        규칙 테스트 + Python 엔진 결과와 날짜 비교 (npm run test:mto, test:engine·CI에서도 함께 실행)
scripts/fixtures/mto-golden.json   Python 엔진 결과 (같은 공휴일 표로 생성)
```

# Techmap

노드(2/3nm · 4nm · 5nm · 7nm · 8/10nm · 14nm) **Master Techmap**(Layer · Purpose 번호의 원본) → 그 아래 여러 DK(SF2 · SF3 …) → **DK All Layer** → **DK Option(Metal/Via Stack)** 을
`DK_Ver_작업날짜` 단위로 관리하고, Site Request로 **techfile · layermap · display.drf · history.txt** 를 검토 · 수정해
**VWP 폴더 구조 그대로** 내보내는 탭입니다. 서버 없이 이 PC 안에서만 계산 · 저장합니다.
설계 · 규칙 · 다음 작업은 **[docs/techmap-kit](docs/techmap-kit/README.md)** (codemate 인계용), 저장소 루트 `AGENTS.md`.

## 화면 (Window Mode 왼쪽 메뉴)

| 메뉴 | 하는 일 |
|---|---|
| 노드 전환 (2/3nm · 4nm · 5nm · 7nm · 8/10nm · 14nm · +) | 노드마다 Master · DK를 따로. Master가 없는 노드(점선)는 Master 등록부터. 폴더 id는 2_3nm · 8_10nm |
| 새 작업 | DK 작업(DK · Ver · 작업날짜 · Reference) 또는 Master 변경. Reference가 Master면 쓸 Layer를 고름 |
| 번호 대장 | Layer# × Purpose(datatype) 격자 — GDS, 색, 숨김, Purpose 관례 datatype에서 벗어남(노랑), layermap 없음(빨강), 빈 Layer# |
| Master 비교 | 다른 노드 Master와 **기능키**(목적) 기준 GDS 비교 — 번호 다름 · 한쪽에만 · 번호 겹침 |
| 분류 · 기능키 | FEOL · Metal n · Via n · Top · Marker 자동 추정 + 직접 고치기 (Option 자동 구성 · Master 비교 기준) |
| DK 그래프 | git log --graph처럼: 정식 Ver = 왼쪽 줄기, exp · incr Ver마다 가지, 실선 = Reference(분기) · 점선 = Merge. 노드에서 열기 · [분기] · [→ 합치기] |
| DK → Ver · 작업 (채널) | 요청 검토 · Option 매트릭스 · 점검 · 파일 변경 · History · codemate 변환 · 그래프 · 다른 작업 합치기 · 승인 · 폴더 출력 |
| 처리 규칙 · 작업공간 | Req_ID 주석, 공유 packet, 폐기 시 layermap, VWP 경로, 작업공간 내보내기/가져오기 |

## 요청 유형 (엑셀 `Request` 시트 · .csv · codemate request.json)
`ADD` · `CHANGE_DISPLAY` · `RETIRE` · `HIDE`/`SHOW`(techDisplays Vis·Sel) · `OPTION_ADD`/`OPTION_REMOVE`(Option 예외).
DK 작업의 ADD는 Layer · Purpose만 쓰면 번호 · GDS · 표시를 **Master에서 가져오고**, Master와 다르게 쓰면 ERROR. 양식 · 예시: `public/techmap/`.

## Option 자동화
Layer 분류 + Stack 정의(Metal 수 · Top Layer) → 규칙으로 Layer 자동 포함, 규칙 밖은 Option × Layer 매트릭스에서 `+`/`−`.
점검: Via 스택 끊김 · 빠진 Metal/Via · All에 없는 Layer. Option 파일 = All에서 빠지는 Layer 행만 지움.

## 분기 · Merge
아무 작업에서 [분기] → 새 작업(Reference = 그 작업). [→ 합치기] / [다른 작업 합치기]는 source 쪽에만 있는 작업들의 **반영된 요청을 다시 적용**(git rebase처럼)하고,
Option 정의는 공통 조상 대비 3-way. 같은 LPP를 양쪽에서 바꿨으면 합친 요청이 ERROR로 보여서 사람이 정리합니다. history에 Merge 줄이 남아요.

## 출력 (zip → VWP에 풀기, 설치형 바로 쓰기는 Kit T2)
`<노드 id>/<DK>/<DK>_<Ver>_<작업날짜>/All/{<DK>.tf, <DK>.layermap, display.drf, <DK>_history.txt}` ·
`Options/<Stack>/{…}` · `_techmap/{revision.json, review_report.csv, changes.diff}`

## codemate 변환
작업 화면 [codemate 변환] → 원문 붙여넣기 → inbox zip(site_request.txt · context.json · AGENTS.md · schema) →
VSCode 터미널 `opencode run --dir <inbox> -f site_request.txt -f context.json "…"` → request.json을 [요청 올리기].

## 확인
`npm run test:techmap` — 엔진 · 작업공간 · 분기/Merge 88건 + Python 참조 엔진과 글자 단위 비교 (`test:engine` · CI에서도 같이).
DEMO: 2/3nm Master(M1~M11) 아래 DK SF3 · SF2, 4nm Master(이름이 다르고 VI4 번호가 일부러 다름) 아래 SF4, 나머지 노드는 미등록. SF3 v1.0.0.0 → exp_20261015 → v1.0.0.1(exp Merge) · incr20261022 · exp_20261020(작업중).
