# 04. 출력 폴더 · Ver · history

## VWP 출력 구조 (`revisionFolder`)
```
<VWP 루트>/
  <Process>/
    <DK>/
      <DK>_<Ver>_<작업날짜>[_n]/          예: SF3_DK_v1.0.0.0_exp_20261020_20261026
        All/
          <DK>.tf
          <DK>.layermap
          display.drf
          <DK>_history.txt
        Options/
          <Option 이름>/                   예: 1P9M_6X1Z
            <DK>.tf
            <DK>.layermap
            display.drf
        _techmap/                          앱 기록 (VWP 배포 대상에서 빼도 됨)
          revision.json                    작업 정보 · Option 정의와 최종 Layer 목록 · 반영 요청 · 요청 원본
          review_report.csv                요청별 상태 · 검사 · 반영된 변경 줄 · 점검
          changes.diff                     All Layer 세 파일 unified diff
    _MASTER/
      <Process>_MASTER_<작업날짜>[_n]/     Master 변경 작업
        <Process>_master.tf …, <Process>_master_history.txt, _techmap/
```
- 파일 이름: Reference가 Master이면 DK 이름 규칙(`<DK>.tf` · `<DK>.layermap` · `display.drf`)으로 바꾸고, 그다음부터는 이어받은 이름을 그대로 쓴다. **사내 실제 이름 규칙은 08 [VERIFY]**.
- 지금은 같은 구조를 zip으로 저장(VWP에 풀면 됨). 설치형에서 바로 쓰기 = 06 문서 · 07 T2.

## Ver 해석 (`lib/version.js`)
- 형식: `v<숫자 4자리 이하 . 구분>` + 선택 꼬리 `[_]<태그>[_]<YYYYMMDD>` + 나머지.
  - `v1.0.0.0` → 정식 / `v1.0.0.0_exp_20261020` · `v1.0.0.0_exp20261020` → exp, 날짜 20261020 / `v1.0.0.0_incr20261101` → incr / 그 밖의 태그 → 기타
- **원문은 그대로 저장 · 출력**. 해석 결과는 정렬 · 표시용(기본 번호 → 정식 먼저 → 날짜).
- 작업 폴더: `<DK>_<Ver>_<작업날짜>`. 같은 이름이 이미 있으면 `_2`, `_3`.
- 정식 발행일이 따로 있는 경우: 지금은 Ver 꼬리 날짜 · 작업날짜로 구분. 발행일 칸이 따로 필요하면 07 T7.

## history.txt 양식 (`lib/history.js`, 제안)
작업마다 블록 하나를 기존 history 뒤에 붙인다(위 → 아래 시간순). 승인 전에는 `승인 : (미승인 · 작업중)`.

```
========================================================================
[SF3_DK v1.0.0.0_exp_20261020]  작업 20261026  (폴더 SF3_DK_v1.0.0.0_exp_20261020_20261026)
Reference : SF3_DK_v1.0.0.0_20261012
승인      : 2026-10-26 11:58
------------------------------------------------------------------------
ADD      REQ-101  DMEXCL/drawing         GDS 236/0        Site-A   Dummy 제외 영역 사용 — 번호·표시는 Master 그대로
ADD      REQ-103  M11/fillDummy          GDS 31/1         Site-B   M11 dummy fill
HIDE     REQ-104  text/drawing                            Site-B   text layer 사용자 선택 막기
SHOW     REQ-105  prBoundary/drawing                      Site-B   prBoundary 다시 보이게
OPTION   REQ-106  1P9M_6X1Z    + PAD                  Site-C   9M Option에도 PAD 제공
OPTION   REQ-107  1P11M_8X2Z   - VIA10                Site-C   VIA10 제외 요청 (Via 스택이 끊기는 예)
DISPLAY  REQ-108  M5/drawing                              Site-C   M5 색 구분
Option   1P9M_6X1Z    Metal 9 · Via 8 · 28 Layer · +PAD
Option   1P11M_8X2Z   Metal 11 · Via 9 · 31 Layer · -VIA10
========================================================================
```
(DEMO 예시 요청으로 실제 만든 결과. 맨 앞에는 이전 작업들의 블록이 이어져 있다.)
- 열: 유형(8) · Req_ID(8) · LPP(22) · GDS(16, ADD만) · 요청자(8) · 사유.
- 사내에 정해진 양식이 생기면 `historyBlock`만 바꾸면 된다(테스트 `history:` 항목 같이 수정).
