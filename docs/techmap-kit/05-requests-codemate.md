# 05. 요청 · codemate 연결

## 요청 엑셀 (1차)
- `Request` 시트(없으면 첫 시트), `Req_ID` 헤더 줄부터. 설명 줄은 Req_ID가 `#`로 시작.
- 컬럼: `Req_ID · Type · Layer · Purpose · Layer_No · Abbrev · Purpose_No · GDS_Layer · GDS_Datatype · Packet · Fill_Color · Outline_Color · Stipple · LineStyle · Fill_Style · Option · Requester · Reason` (`lib/requests.js` `COLUMNS`가 기준).
- Type 한글도 받음: 추가 · 변경 · 삭제/폐기 · 숨김 · 표시 · OPTION추가 · OPTION제외.
- .xlsx는 의존성 없이 직접 읽고(`zip.js` + XML 정규식), .csv · request.json도 받는다.
- 양식 · 예시: `public/techmap/` — 다시 만들기 `python scripts/gen/make_techmap_requests.py` (COLUMNS와 같게 유지).

## codemate 변환 (2차) — 파일로 주고받기
사내 LLM은 **VSCode 터미널의 opencode CLI(codemate)** 만 쓸 수 있다. 앱이 직접 LLM을 부르지 않고, 폴더로 주고받는다.

```
[작업 화면 → codemate 변환]
  ① Site 원문 붙여넣기
  ② [inbox 받기] → inbox/<작업폴더>_<YYYYMMDD_HHmm>/
       site_request.txt     원문
       context.json         이 작업: kind · process · dk · ver · options · master_lpps(GDS 포함) · current_lpps · 기존 Req_ID
       AGENTS.md            변환 규칙 (lib/codemate.js agentsMd)
       request.schema.json  출력 형식
       RUN.txt              실행 명령
  ③ VSCode 터미널:
       opencode run --dir "<경로>/inbox/…" -f site_request.txt -f context.json "AGENTS.md 규칙대로 … request.json으로 저장해 줘 …"
       (필요하면 --agent <사내 agent 이름>, -m <provider/model>)
  ④ codemate가 같은 폴더에 request.json  →  작업 화면 [요청 올리기]로 가져오기
```
- request.json: `{ source?, requests: [{ req_id, type, layer, purpose, … }], questions?: [] }` — `request.schema.json`.
- **LLM이 하면 안 되는 것**: 번호를 지어내기(DK는 번호를 비워 두면 엔진이 Master에서 채움), 비슷한 Layer 이름 골라 쓰기, 파일 직접 수정. 모르면 `questions`.
- `questions`는 지금 화면에 안 보인다 → 07 T6.

## 설치형에서 자동화 (07 T6)
- 작업 폴더가 DB가 되면(06) inbox를 그 안에 바로 쓰고, `request.json`이 생기면 자동으로 읽는다(폴더 감시 대신 [다시 읽기] 버튼 + 시작 시 확인으로 충분).
- 앱이 opencode를 직접 실행하는 것도 가능하지만(Rust `std::process::Command`), 사내 사용 방식이 "VSCode 터미널에서 실행"이므로 **명령 복사**를 기본으로 둔다.
