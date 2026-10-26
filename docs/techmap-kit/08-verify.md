# 08. 실제 사내 파일로 확인할 것 [VERIFY]

DEMO 파일은 표준 Virtuoso 문법으로 만든 합성 데이터다. 사내 파일에서 다를 수 있는 것들 — 확인하면 "확인됨 / 다름 → 조치"를 적는다.

| # | 항목 | 지금 가정 | 확인 결과 |
|---|---|---|---|
| V1 | techfile이 한 파일인가, include · 여러 파일로 나뉘는가 | 한 파일 | |
| V2 | `techDisplays` 열 구성 (Vis Sel Con2ChgLy DrgEnbl Valid) | 이 순서, Vis=3번째 · Sel=4번째 토큰 | |
| V3 | 숨김을 Vis · Sel 둘 다 nil로 하는지, Valid도 바꾸는지 | Vis · Sel만 | |
| V4 | drf packet 정의가 한 줄인가 | 한 줄 (여러 줄이면 CHANGE_DISPLAY ERROR) | |
| V5 | drf FillStyle 허용 값 | outline · solid · X · stipple · outlineStipple … | |
| V6 | layermap 컬럼 수 · 주석 문자 | 4컬럼, `#` 주석 | |
| V7 | DK 파일 이름 규칙 (All · Option 폴더 안) | `<DK>.tf` · `<DK>.layermap` · `display.drf` · `<DK>_history.txt` | |
| V8 | VWP 폴더 구조 | `Process/DK/DK_Ver_작업날짜/All · Options/<Stack>` | |
| V9 | Option 파일에서 빠진 Layer 처리 | 표 3개 · layermap 행 삭제, drf는 그대로, 다른 절(룰 등) 참조는 알림만 | |
| V10 | 폐기 Layer의 layermap 행 | 유지 (설정으로 주석) | |
| V11 | 사내 reserved purpose 목록 · purpose 번호 체계 | Virtuoso 기본 목록 + techPurposes | |
| V12 | GDS stream 번호 상한 | 0 ~ 65535 | |
| V13 | 파일 인코딩 · 줄 끝 | UTF-8, CRLF/LF 원래대로 유지 | |
| V14 | Metal · Via 이름 규칙 (분류 추정) | `M|ME|MET|METAL<n>`, `VIA|VI|V<n>` | |
| V15 | Top · RDL · Marker 이름 | AP · RDL · PAD · UBM … / text · prBoundary · DMEXCL … | |
| V16 | Master에서 숨김인 LPP를 DK에 넣을 때 | Master 플래그를 그대로 | |
| V17 | history.txt 사내 양식 유무 | 앱 제안 양식 (04 문서) | |
| V18 | 정식 발행일을 Ver와 따로 관리하는지 | Ver 꼬리 날짜 · 작업날짜로 구분 | |
