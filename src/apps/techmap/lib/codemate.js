// 사내 codemate(opencode) 연결: 파일로 주고받는다.
//   1) 앱이 inbox 폴더(site_request.txt · context.json · AGENTS.md · request.schema.json)를 만든다
//   2) VSCode 터미널에서:  opencode run --dir <inbox 폴더> -f site_request.txt -f context.json "<지시>"
//   3) codemate가 같은 폴더에 request.json을 쓴다 → 앱에서 [codemate 결과 가져오기]
// LLM은 요청을 표 형태로 바꾸기만 하고, 번호 확인 · 파일 수정은 앱 엔진이 한다.
import { COLUMNS } from './requests.js';
import { loadSet, lppTable } from './model.js';

export const REQUEST_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Techmap request.json',
  type: 'object',
  required: ['requests'],
  properties: {
    source: { type: 'string', description: '원문 출처 (메일 제목 · Site 게시글 번호 등)' },
    requests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['req_id', 'type', 'layer'],
        properties: Object.fromEntries(COLUMNS.map(([k, , help]) => [k, { type: 'string', description: help }])),
      },
    },
    questions: { type: 'array', items: { type: 'string' }, description: '원문만으로 정할 수 없어 사람이 확인할 것' },
  },
};

export const INSTRUCTION = 'AGENTS.md 규칙대로 site_request.txt를 Techmap 요청으로 바꿔서 이 폴더에 request.json으로 저장해 줘. 원문에 없는 값은 지어내지 말고 questions에 적어 줘.';

export function agentsMd(ctx) {
  return `# Techmap 요청 변환 (codemate용)

이 폴더의 \`site_request.txt\`(Site에서 온 요청 원문)를 읽고, \`request.json\`을 같은 폴더에 써 주세요.
형식은 \`request.schema.json\`, 대상 정보는 \`context.json\`을 보세요.

## 규칙
1. 요청 한 건 = 한 행. 여러 Layer를 한 번에 말하면 Layer마다 나눠요. Req_ID는 \`${ctx.idPrefix}-001\`부터.
2. Type은 ${['ADD', 'CHANGE_DISPLAY', 'RETIRE', 'HIDE', 'SHOW', 'OPTION_ADD', 'OPTION_REMOVE'].join(' / ')} 중 하나.
   - 새 Layer/Purpose를 쓰게 해 달라 → ADD
   - 색 · 패턴 · 선 바꿔 달라 → CHANGE_DISPLAY
   - 안 쓰게 / 지워 달라 → RETIRE (Layer 전체면 purpose 비움)
   - 사용자에게 안 보이게 · 못 고르게 → HIDE, 다시 보이게 → SHOW
   - 특정 Option(Metal Stack)에만 넣기/빼기 → OPTION_ADD / OPTION_REMOVE (option 필수, context.json의 options 중 하나)
3. ${ctx.kind === 'dk' ? '이 작업은 **DK**예요. ADD는 layer · purpose만 쓰고 번호(layer_no, gds_layer, gds_datatype)는 비워 두세요 — 앱이 Master에서 채워요. Master에 없는 LPP를 원하면 그대로 적고 questions에 "Master 추가 필요"라고 남겨요.' : '이 작업은 **Process Master**예요. ADD는 layer_no · gds_layer · gds_datatype이 필요해요. 원문에 없으면 비우고 questions에 적어요 (지어내지 않기).'}
4. Layer 이름은 context.json의 이름과 똑같이 (대소문자 포함). 비슷한 이름이 여러 개면 고르지 말고 questions에 적어요.
5. 색은 drf 색 이름 · #RRGGBB · R,G,B 중 원문 그대로.
6. reason에는 원문 근거 문장을 짧게, requester에는 Site/요청자.
7. 출력은 request.json 하나만. 다른 파일은 고치지 마세요.
`;
}

export function buildInbox(ws, rev, text, source = '') {
  const proc = ws.processes.find((p) => p.id === rev.process);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const folder = `inbox/${rev.folder}_${stamp}`;
  const ctx = {
    kind: rev.kind,
    idPrefix: rev.kind === 'dk' ? 'REQ' : 'MREQ',
    process: rev.process,
    dk: rev.dk,
    ver: rev.ver,
    workFolder: rev.folder,
    options: (rev.options || []).map((o) => o.name),
    existing_request_ids: rev.requests.map((r) => r.id),
  };
  let masterLpps = [];
  let dkLpps = [];
  try {
    masterLpps = lppTable(loadSet(proc.master.files)).map((r) => ({ layer: r.layer, purpose: r.purpose, gds: r.gds }));
    dkLpps = lppTable(loadSet(rev.base.files)).map((r) => `${r.layer}/${r.purpose}`);
  } catch {
    /* 파일을 못 읽으면 목록 없이 */
  }
  const context = { ...ctx, master_lpps: masterLpps, current_lpps: dkLpps };
  const cmd = `opencode run --dir "<압축 푼 경로>/${folder}" -f site_request.txt -f context.json "${INSTRUCTION}"`;
  return {
    folder,
    command: cmd,
    files: [
      { path: `${folder}/site_request.txt`, data: (source ? `# 출처: ${source}\n\n` : '') + text },
      { path: `${folder}/context.json`, data: JSON.stringify(context, null, 2) },
      { path: `${folder}/AGENTS.md`, data: agentsMd(ctx) },
      { path: `${folder}/request.schema.json`, data: JSON.stringify(REQUEST_SCHEMA, null, 2) },
      { path: `${folder}/RUN.txt`, data: `VSCode 터미널에서 실행:\n\n${cmd}\n\n끝나면 같은 폴더의 request.json을 Techmap 작업 화면 [codemate 결과 가져오기]로 올리세요.\n` },
    ],
  };
}
