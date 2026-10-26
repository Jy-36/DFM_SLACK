# 01. 도메인

## 파일 세트 (Techmap)
한 세트 = **techfile(.tf) · layermap · display.drf + history.txt**. Master · DK All · DK Option 모두 같은 구성(Option은 history 없음).

| 파일 | 역할 | Techmap이 보는 곳 |
|---|---|---|
| techfile | Layer · Purpose 정의, 표시 우선순위, 표시 packet · 플래그 | `techPurposes` · `techLayers` · `techLayerPurposePriorities` · `techDisplays` (+ 다른 절은 참조 검사만) |
| layermap | Cadence LPP ↔ GDS stream layer/datatype | 4컬럼 행 (`layer purpose stream datatype`) |
| display.drf | 화면 표시(색 · stipple · 선) — GDS 출력과 무관 | `drDefineColor` · `drDefineStipple` · `drDefineLineStyle` · `drDefinePacket` |
| history.txt | DK 변경 이력 (앱이 양식 제안 → 04 문서) | 작업마다 블록 추가 |

## 계층

```
노드 = Process (뼈대 공정: 2/3nm · 4nm · 5nm · 7nm · 8/10nm · 14nm, 폴더 id는 '/' → '_' 예 2_3nm)
 ├─ Master Techmap      Layer# · Purpose(datatype) · GDS 번호의 원본. Option별 파일 없음
 │    · 다른 노드의 Master(Other_master)와 "같은 목적 = 같은 번호"를 맞춘다
 └─ DK (Design Kit) — 한 노드 아래 여러 갈래 (예: 2/3nm 아래 SF2 · SF3)
      └─ Ver  (v1.0.0.0 · v1.0.0.0_exp_20261020 · v1.0.0.0_exp20261020 · v1.0.0.0_incr20261101 …)
           └─ 작업(리비전) — 작업날짜 단위. 같은 Ver에 요청이 여러 번 오면 작업이 여러 개
                ├─ All Layer     Master의 부분집합 (DK에서 쓰는 Layer만)
                └─ Options/<Stack>  All의 부분집합 (Metal · Via Stack에 따라 넣고 뺌)
```

- **Master**: 모든 Layer 번호가 여기 있어야 하고, 번호 관리는 여기서만 한다. 새 Layer · Purpose는 "Master 변경" 작업으로 추가.
- **DK All Layer**: Master에서 쓰는 Layer로 꾸린다. 번호 · GDS는 Master와 같아야 한다(다르면 ERROR).
- **DK Option**: DK가 제공하는 Metal/Via Stack별 파일. DK 작업 폴더 안 `Options/<이름>/` 폴더. All에 없는 Layer는 못 넣는다.
- **정식 DK 작업**: Reference(이전 작업 결과 또는 Master)를 가져와 추가 · 삭제 · 변경으로 작업 → 승인 → 다음 작업의 Reference.
- **git처럼 갈라지고 합쳐진다**: 작업 = 커밋, Reference = 부모. 정식 Ver에서 exp · incr가 **분기**하고, exp에서 확인한 변경을 다음 정식 Ver에 **Merge**한다.
  ```
  ○ v1.0.0.0_exp_20261020 (작업중) ⟵ Merge incr
  │ ● v1.0.0.0_incr20261022
  ●─┤ v1.0.0.1  ⟵ Merge v1.0.0.0_exp_20261015
  │ ● v1.0.0.0_exp_20261015
  ● v1.0.0.0
  ■ 2/3nm MASTER
  ```
  화면: DK 그래프(정식 = 왼쪽 줄기, exp · incr Ver마다 가지, 실선 = 분기, 점선 = Merge).

## 번호 (Layer, Property)
- Property = **Purpose(datatype)**. 같은 노드 안에서는 같은 Purpose가 같은 datatype을 쓰도록 관리 (예: drawing 0, pin 10, fillDummy 1).
- 번호 대장 화면: Layer# × Purpose 격자, Purpose별 관례 datatype에서 벗어나면 노란색, layermap 없음은 빨간색, 빈 Layer# 목록.

## Other_master (다른 노드 Master)
- 이름은 조금 달라도(예: 2/3nm `M1` / 4nm `ME1`, 2/3nm `AP` / 4nm `RDL`) **목적이 같은 Layer는 GDS layer · datatype이 같아야** 한다.
- 목적 = **기능키**. 이름으로 자동 추정(METAL n → `METAL1`, VIA n → `VIA1`, 나머지는 이름 대문자)하고, 다르면 노드별로 직접 지정(예: 4nm `RDL` → 기능키 `AP`).
- 비교 결과: 번호 다름(ERROR) · 한쪽에만 있음 · 같은 번호를 다른 기능이 씀(겹침).

## 숨김
- 사용자가 못 보게 · 못 고르게 = **techDisplays의 Vis · Sel 플래그를 nil**. Layer · layermap은 그대로 남는다.
- 요청 유형 `HIDE` / `SHOW`.

## Option(Metal/Via Stack) 자동화 — 제안한 관리법
지금은 수작업. 다음 방식으로 바꾼다:
1. Master의 Layer마다 **분류**를 한 번 붙인다: FEOL 공통 · Metal n · Via n(Metal n ↔ n+1) · Top/RDL · Marker. 이름으로 자동 추정, 다르면 [분류 · 기능키]에서 고침.
2. Option = **Stack 정의**: 이름 · Metal 수(예: 9) · 넣을 Top Layer(예: AP). 규칙: FEOL · Marker 전부, Metal 1~9, Via 1~8, 고른 Top.
3. 규칙 밖은 **예외 표**(Option × Layer 매트릭스)에서 `+`(넣기) · `−`(빼기). 요청 유형 `OPTION_ADD` / `OPTION_REMOVE`도 같은 예외로 들어간다.
4. 점검: Via 스택 끊김(Via n이 있는데 Metal n 또는 n+1이 없음), 아래 Metal · Via 빠짐, 예외 Layer가 All에 없음.
5. Option 파일 = All 파일에서 빠지는 Layer의 행만 지운 것(tf 표 3개 · layermap). drf는 그대로(표시 정의만이라 남아도 무해 — 08 문서에서 확인).

## 사용 형태
- 1인 사용(잠금 불필요). 사내 PC, 오프라인 빌드, 설치형(DFM Slack Prototype).
- 결과물은 DB에도 남기지만 **VWP에 폴더로 넣어 관리** → 출력은 폴더 구조 그대로.
