# 03. 처리 · 점검 규칙

엔진(`lib/planner.js` 외)이 지키는 규칙. 테스트는 `scripts/techmap-check.mjs`. 규칙을 바꾸면 테스트도 같이 바꾼다.

## 공통
- 요청은 **엑셀 순서대로** 처리하고, 앞 요청의 반영 결과를 이어받는다 → 같은 엑셀 안 번호 충돌도 잡힌다.
- 상태: `READY`(기본 반영) · `NEEDS_REVIEW`(사람이 체크해야 반영) · `ERROR`(반영 불가). 검사 메시지 수준: info · review · error.
- 처음 계산한 READY 목록을 `include`로 고정. 이후 체크로만 바뀐다(승인 · 제외가 활동 기록에 남음).
- 같은 Req_ID 두 번 → ERROR. Layer 비어 있음 → ERROR. 모르는 Type → ERROR.
- 바뀐 줄 끝 `; REQ-ID` (설정으로 끄기). 폐기는 `; RETIRED REQ-ID`.
- 새 행은 이웃 행(같은 Layer 마지막 행, 없으면 번호가 바로 아래인 Layer)의 **컬럼 위치를 복제**. 숨김(nil) 행은 칸 폭이 달라 보통 행을 틀로 쓴다.
- 줄 끝(CRLF/LF)은 파일 원래 것을 따른다.

## 요청 유형

### ADD
| | Master 작업 | DK 작업 |
|---|---|---|
| LPP가 Master에 없음 | 새로 만든다 | **ERROR** "Master 변경으로 먼저 추가" |
| 신규 Layer 번호 | `Layer_No` 필수, 이미 쓰는 번호면 ERROR | Master 번호를 가져옴. 요청에 다른 번호 → ERROR |
| 신규 Purpose | `Purpose_No` 필수 (검토 필요: 번호 체계 확인) | Master에서 가져옴 |
| GDS | `GDS_Layer` 없으면 NEEDS_REVIEW (layermap 행 안 만듦, Not Found). Datatype 없으면 0 가정(검토). 이미 쓰는 GDS → ERROR | Master layermap에서 가져옴. 다르면 ERROR |
| 표시(packet) | Packet 지정 → 재사용 / 색 · 패턴 → 새 packet(`이름 규칙` 추정, 예 `M1_drw`) / 색은 이름 · #RRGGBB · R,G,B (같은 RGB 있으면 재사용, 없으면 `cRRGGBB` 추가) | 표시 칸이 비면 **Master packet을 그대로** 사용 (DK drf에 없으면 packet · 색 복사, stipple · lineStyle이 없으면 ERROR) |
| techDisplays 플래그 | 이웃 행 플래그 | Master 행 플래그 (Master에서 숨김이면 숨김) |
| 이미 있는 LPP | ERROR ("표시 변경이면 CHANGE_DISPLAY") | 같음 |

### CHANGE_DISPLAY
- techDisplays에 없음 → ERROR (Not Found). 바꿀 칸이 하나도 없음 → ERROR. 결과가 지금과 같음 → ERROR.
- packet을 다른 LPP도 쓰면: 기본은 **전용 packet을 새로 만들어 연결**(NEEDS_REVIEW). 요청 Packet 칸에 현재 이름을 쓰면 공유 packet 직접 수정(NEEDS_REVIEW, 같이 바뀌는 LPP 표시).
- Fill만 바꾸면 Outline은: 원래 Fill = Outline이었으면 같이, 달랐으면 유지.
- packet 정의가 여러 줄이면 ERROR (수동).

### RETIRE
- 행을 지우지 않고 `;` 주석. Purpose 비우면 Layer 전체(techLayers 포함).
- Layer 전체 폐기인데 techfile 다른 절(룰 · functions · via 정의 등)에서 참조 → NEEDS_REVIEW + 줄 번호.
- layermap은 기본 유지(설정: 주석 처리 → NEEDS_REVIEW "과거 GDS 재생성 시 빠짐").
- 더 이상 안 쓰는 packet은 drf에 남긴다(info).

### HIDE / SHOW
- techDisplays Vis · Sel → `nil` / `t`. 이미 그 상태면 ERROR(변경 없음). Layer · layermap은 그대로.

### OPTION_ADD / OPTION_REMOVE (DK 작업만)
- 파일을 바로 고치지 않고 해당 Option 정의의 예외(`plus` / `minus`)에 들어간다.
- Option 이름이 이 작업에 없음 → ERROR. Layer가 All에 없음 → ERROR("먼저 ADD").

## 점검 (작업 화면 [점검])
| 대상 | 규칙 | 수준 |
|---|---|---|
| DK All ↔ Master | All의 Layer · LPP가 모두 Master에 있음, Layer# · Purpose# · GDS가 같음 | error |
| Option | Via n이 있으면 Metal n · n+1도 있어야 | error |
| Option | Metal n(n>1)이 있으면 Metal n−1 · Via n−1도 | warn |
| Option | 예외 Layer가 All에 있어야 | error |
| Option 파일 | 빠진 Layer를 techfile 다른 절에서 참조 | info (사내 규칙대로 정리 필요 — 08 [VERIFY]) |
| Master 변경 | 다른 노드 Master와 기능키가 같은데 GDS가 다름(이번 작업에서 새로 생긴 것) | error |
| 번호 대장 | Layer# 중복 · GDS 중복 | error |
| 번호 대장 | layermap 없는 LPP | warn |
| 번호 대장 | Purpose 관례 datatype과 다름, GDS layer ≠ Layer# | info |
| Master 비교 | 같은 기능 다른 번호 / 한쪽에만 / 같은 번호 다른 기능 | 화면 표시 |

점검 ERROR가 있어도 승인은 막지 않고 확인 창을 띄운다(사람이 판단). 바꾸려면 `RevisionPage.approve`.

## 분기 · Merge
- 분기 = 아무 작업(승인 · 작업중)을 Reference로 새 작업. 그래프 [분기]는 Ver를 `<기본 Ver>_exp_<오늘>`로 채워 준다(바꿀 수 있음).
- Merge는 **작업중(draft) 작업에만**. 같은 노드 · 같은 종류(DK ↔ DK, Master ↔ Master)끼리.
- source가 이미 target의 조상이면 막는다("이미 들어 있어요").
- 재생하는 요청 = source 쪽에만 있는 작업들에서 **실제로 반영된** 요청(승인본은 고정된 include). Merge로 들어온 요청은 원본만 재생(중복 방지).
- **충돌 = 엔진 검사로 드러난다**: 같은 LPP를 양쪽에서 ADD, 이미 숨긴 것을 HIDE 등 → 합친 요청이 ERROR/변경 없음. 사람이 [반영] 체크를 풀어 정리.
- Option 3-way: plus · minus · tops는 source가 공통 조상 대비 더하고 뺀 것만 반영. Metal 수는 target이 안 바꿨으면 source 값, 양쪽이 다르게 바꿨으면 target 유지 + 충돌 알림.
- history 블록에 `Merge     : <폴더> (요청 n건)`, 합친 요청 줄 끝에 `← <원래 폴더>`.

## 분류 · 기능키 (`lib/classify.js`)
- 추정: `M|ME|MET|METAL<n>` → METAL n, `VIA|VI|V<n>` → VIA n, `AP|RDL|PAD|UBM|CB|PI|PASS|BUMP|TV|LB` → TOP, `text|prBoundary|boundary|DMEXCL|*mark*|*excl*|*dummy*|*blk*|*_id` → MARKER, 나머지 FEOL.
- 기능키: METAL n → `METALn`, VIA n → `VIAn`, 나머지 이름 대문자. LPP 기능키 = `기능키:purpose`.
- 노드별 예외: `process.classes[layer] = { cls?, level?, key? }`.
- 사내 이름 규칙에 맞춰 추정식을 늘리는 건 07 작업 T5.

## Option 규칙 (`lib/options.js`)
`in = FEOL · MARKER → 항상 | METAL → level ≤ metals | VIA → level < metals | TOP → tops에 있음`, 그다음 `plus`면 in, `minus`면 out.
