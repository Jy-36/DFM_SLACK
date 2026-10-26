# 02. 데이터 모델

## workspace (version 2)
`src/apps/techmap/lib/revision.js` 머리 주석과 같음. 모두 JSON 직렬화 가능(함수 · Map 없음).

```jsonc
{
  "version": 2,
  "processes": [{
    "id": "SF3",
    "label": "DEMO",
    "master": { "files": { "tf": {"name","text"}, "layermap": {...}, "drf": {...} }, "updated": "2026-10-26 11:54", "history": "..." },
    "classes": { "RDL": { "key": "AP" }, "MIMCAP": { "cls": "FEOL" }, "TM2": { "cls": "METAL", "level": 12 } }   // 자동 추정과 다른 것만
  }],
  "dks": [{ "id": "SF3_DK", "process": "SF3" }],
  "revisions": [{
    "id": "mk1x9a2b",                 // 내부 id
    "kind": "dk",                      // dk | master
    "process": "SF3", "dk": "SF3_DK",
    "ver": "v1.0.0.0_exp_20261020",    // 원문 그대로
    "workDate": "20261026",
    "folder": "SF3_DK_v1.0.0.0_exp_20261020_20261026",   // 출력 폴더 이름 (같은 날 또 하면 _2)
    "ref": { "kind": "revision", "id": "...", "label": "SF3_DK_v1.0.0.0_20261012" },
    "base": { "files": {...}, "history": "..." },        // Reference에서 가져온 시작점 (All Layer)
    "options": [{ "name": "1P9M_6X1Z", "metals": 9, "tops": ["AP"], "plus": [], "minus": [] }],
    "requests": [{ "id": "REQ-101", "type": "ADD", "row": 3, "f": { "req_id": "REQ-101", "layer": "DMEXCL", ... } }],
    "include": ["REQ-101", ...] | null, // 반영할 요청. null이면 READY만 (처음 계산 후 고정)
    "log": [{ "at": "...", "kind": "system|decision|comment", "text": "..." }],
    "status": "draft" | "approved",
    "approvedAt": "2026-10-26 14:02" | null,
    "output": { "files": {...}, "history": "...", "options": { "1P9M_6X1Z": {...files} } } | null   // 승인 시 고정
  }]
}
```

## 작업(리비전) 생애주기

```
새 작업 ──(Reference 선택)──▶ draft ──(요청 올리기 · 체크 · Option 수정)──▶ draft ──[승인]──▶ approved
   ▲                                                                                        │
   └────────────────────── 승인본(output)이 다음 작업의 base가 된다 ◀───────────────────────┘
```

- **Reference = Master**: Master에서 고른 Layer만 남긴 파일(`filterSet`)을 DK 이름(`<DK>.tf` · `<DK>.layermap` · `display.drf`)으로 시작.
- **Reference = 작업**: 그 작업의 `output`(미승인이면 지금 계산 결과) + Option 정의 + 누적 history.
- **Master 변경 작업**(kind master): base = 현재 Process Master. 승인하면 `process.master`가 결과로 바뀌고 history가 이어진다.
- 계산은 항상 `computeRevision(ws, rev, settings)` 하나 — 저장된 결과가 아니라 base + requests + include + options로 매번 다시 계산(결정적). 승인할 때만 `output`으로 고정.

## computeRevision 결과

| 키 | 내용 |
|---|---|
| `res` | planner 결과: `items`(요청별 상태 · 검사 · 바뀐 줄 · optionOp · filled), `files`, `diffs`, `names` |
| `counts` · `applied` | 상태별 수, 반영한 Req_ID |
| `allFiles` · `all` | 수정된 All Layer 파일 / 파싱 결과 |
| `options[]` | `{ def(요청 예외 반영), set(Layer→in/why), check, files, refs }` |
| `checks[]` | `{ level: error|warn|info, scope, msg }` — DK: All↔Master, Option 스택, 빠진 Layer 참조 / Master: 다른 Master와 번호 |
| `history` | base.history + 이번 블록 |

## 저장
- **지금(프로토타입)**: IndexedDB `dfmslack-techmap` / `docs` / key `workspace` 한 건. 처리 규칙 · VWP 경로는 localStorage `techmap.settings`. [처리 규칙 · 작업공간]에서 JSON 내보내기 · 가져오기.
- **다음(07 작업 T1)**: 작업 폴더를 DB로 — 06 문서. codemate · 탐색기에서도 같은 데이터를 볼 수 있게.

## settings
`{ tagChanges: true, retireLayermap: 'keep'|'comment', splitSharedPacket: true, vwpRoot: '' }`
