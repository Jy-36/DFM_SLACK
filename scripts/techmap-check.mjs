// Techmap 엔진 확인: node scripts/techmap-check.mjs
// 1) Python 참조 엔진 결과(fixtures/techmap-golden.json)와 수정 파일이 글자 하나까지 같은지
// 2) 규칙 테스트 (Python tests/test_engine.py를 옮긴 것)
// 3) 예시 Request 엑셀(public/techmap) 읽기 · zip 쓰기/읽기 왕복
import { readFileSync } from 'node:fs';
import { loadSet, consistency } from '../src/apps/techmap/lib/model.js';
import { plan } from '../src/apps/techmap/lib/planner.js';
import { formatLike } from '../src/apps/techmap/lib/patcher.js';
import { readRequestFile, rowsToRequests, readCsv } from '../src/apps/techmap/lib/requests.js';
import { unzip, zip } from '../src/apps/techmap/lib/zip.js';
import { DEMO_FILES } from '../src/apps/techmap/lib/samples.js';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra ? `\n     ${extra}` : ''}`);
};
const ts = () => loadSet(DEMO_FILES);
const req = (id, type, f) => ({ id, type, row: 0, f: { req_id: id, type, ...f } });
const byId = (res) => Object.fromEntries(res.items.map((i) => [i.id, i]));
const firstDiff = (a, b) => {
  const al = a.split('\n');
  const bl = b.split('\n');
  const i = al.findIndex((x, k) => x !== bl[k]);
  return i < 0 ? '' : `line ${i + 1}\n     js : ${JSON.stringify(al[i])}\n     py : ${JSON.stringify(bl[i])}`;
};

// ── 엑셀 읽기
const xbuf = readFileSync(new URL('../public/techmap/techmap_request_sample.xlsx', import.meta.url));
const reqs = await readRequestFile('techmap_request_sample.xlsx', xbuf);
ok('예시 엑셀 9건 읽기', reqs.length === 9, `got ${reqs.length}`);
ok('엑셀 숫자 셀은 정수 문자열', reqs[0].f.layer_no === '16' && reqs[0].f.gds_datatype === '0', JSON.stringify(reqs[0].f));
ok('엑셀 Type 읽기', reqs.map((r) => r.type).join() === 'ADD,ADD,ADD,ADD,CHANGE_DISPLAY,CHANGE_DISPLAY,RETIRE,ADD,CHANGE_DISPLAY');
const tmpl = await readRequestFile('t.xlsx', readFileSync(new URL('../public/techmap/techmap_request_template.xlsx', import.meta.url)));
ok('빈 양식은 0건 (설명 줄 건너뜀)', tmpl.length === 0);

// ── Python 결과와 비교
const golden = JSON.parse(readFileSync(new URL('./fixtures/techmap-golden.json', import.meta.url), 'utf8'));
const cases = { default: [null, {}], all: [['REQ-001', 'REQ-002', 'REQ-003', 'REQ-004', 'REQ-005', 'REQ-006', 'REQ-007'], {}], retire_comment: [['REQ-007'], { retireLayermap: 'comment' }] };
for (const [name, [inc, opt]] of Object.entries(cases)) {
  const res = plan(ts(), reqs, inc, opt);
  const g = golden[name];
  ok(`[${name}] 상태 = Python`, JSON.stringify(Object.fromEntries(res.items.map((i) => [i.id, i.status]))) === JSON.stringify(g.status));
  ok(`[${name}] 반영 목록 = Python`, res.items.filter((i) => i.included).map((i) => i.id).join() === g.included.join());
  for (const k of ['tf', 'layermap', 'drf']) ok(`[${name}] ${k} 결과 = Python`, res.files[k] === g.files[k], firstDiff(res.files[k], g.files[k]));
}

// ── 규칙
ok('DEMO baseline 불일치 없음', consistency(ts()).length === 0);
ok('컬럼 정렬 유지', formatLike('  ( OD          1      OD   )\n', ['M9', '29', 'M9']) === '  ( M9          29     M9   )');
{
  const res = plan(ts(), [req('A1', 'ADD', { layer: 'M9', purpose: 'drawing', layer_no: '40', gds_layer: '40', gds_datatype: '0', fill_color: '#123456' })]);
  ok('신규 Layer ADD → READY', res.items[0].status === 'READY');
  ok('techLayers 행', res.files.tf.includes('( M9                   40         M9           )  ; A1'));
  ok('packet · color 추가', res.files.drf.includes('M9_drw') && res.files.drf.includes('c123456'));
  ok('layermap 행', res.files.layermap.includes('M9                drawing           40              0'));
  const again = loadSet({ tf: { name: 't', text: res.files.tf }, layermap: { name: 'l', text: res.files.layermap }, drf: { name: 'd', text: res.files.drf } });
  ok('수정본 다시 읽어도 불일치 없음', consistency(again).length === 0);
}
{
  const res = plan(ts(), [req('A1', 'ADD', { layer: 'M9', purpose: 'drawing', layer_no: '40', gds_layer: '15', gds_datatype: '0', fill_color: 'red' })]);
  ok('GDS 충돌 → ERROR', res.items[0].status === 'ERROR' && res.items[0].checks.at(-1).msg.includes('stream 충돌'));
}
{
  const res = plan(ts(), [req('A1', 'ADD', { layer: 'M9', purpose: 'drawing', layer_no: '40', fill_color: 'red' })]);
  ok('GDS 미지정 → 검토 필요, 추측하지 않음', res.items[0].status === 'NEEDS_REVIEW' && !res.items[0].included && res.diffs.layermap === '');
}
{
  const res = plan(ts(), [
    req('A1', 'ADD', { layer: 'M9', purpose: 'drawing', layer_no: '40', gds_layer: '40', gds_datatype: '0', fill_color: 'red' }),
    req('A2', 'ADD', { layer: 'M10', purpose: 'drawing', layer_no: '40', gds_layer: '41', gds_datatype: '0', fill_color: 'red' }),
  ]);
  ok('같은 엑셀 안 Layer_No 충돌 → ERROR', byId(res).A2.status === 'ERROR');
}
{
  const res = plan(ts(), [req('C1', 'CHANGE_DISPLAY', { layer: 'M3', purpose: 'drawing', stipple: 'dots' })]);
  ok('공유 아닌 packet 변경', res.items[0].status === 'READY' && res.files.drf.includes('M3_drw        dots        solid       cyan       cyan       outlineStipple )  ; C1'));
}
{
  const res = plan(ts(), [req('C1', 'CHANGE_DISPLAY', { layer: 'M1', purpose: 'pin', packet: 'metalPin', fill_color: 'red' })], ['C1']);
  ok('공유 packet 직접 수정 (Packet 칸 지정)', res.items[0].status === 'NEEDS_REVIEW' && res.items[0].included && res.files.drf.includes('metalPin      cross       thickLine   red        red'));
}
{
  const res = plan(ts(), [req('R1', 'RETIRE', { layer: 'M3' })], ['R1']);
  const it = res.items[0];
  ok('Layer 전체 폐기 → 참조 검토', it.status === 'NEEDS_REVIEW' && it.checks.some((c) => c.msg.includes('참조')));
  ok('techLayers 주석 처리', res.files.tf.includes(';( M3                   15         M3           )  ; RETIRED R1'));
  ok('layermap 기본 유지', res.files.layermap.includes('M3                drawing           15              0'));
}
{
  const res = plan(ts(), [req('A1', 'ADD', { layer: 'M1', purpose: 'hotspot', gds_layer: '11', gds_datatype: '5', fill_color: 'red' })]);
  ok('미정의 purpose · 번호 없음 → ERROR', res.items[0].status === 'ERROR');
  const res2 = plan(ts(), [req('A1', 'ADD', { layer: 'M1', purpose: 'hotspot', purpose_no: '102', gds_layer: '11', gds_datatype: '5', fill_color: 'red' })], ['A1']);
  ok('신규 purpose 추가', res2.files.tf.includes('( hotspot              102        hot          )'));
}
{
  const res = plan(ts(), [req('A1', 'ADD', { layer: 'M1', purpose: 'drawing', gds_layer: '99', fill_color: 'red' })]);
  ok('이미 있는 LPP → ERROR', res.items[0].status === 'ERROR');
}
{
  const crlf = Object.fromEntries(Object.entries(DEMO_FILES).map(([k, v]) => [k, { ...v, text: v.text.replace(/\n/g, '\r\n') }]));
  const res = plan(loadSet(crlf), [req('A1', 'ADD', { layer: 'M9', purpose: 'drawing', layer_no: '40', gds_layer: '40', gds_datatype: '0', fill_color: 'red' })]);
  ok('Windows 줄 끝(CRLF) 유지', !/[^\r]\n/.test(res.files.tf) && res.files.tf.includes('; A1\r\n'));
}
{
  const res = plan(ts(), [req('A1', 'ADD', { layer: 'M9', purpose: 'drawing', layer_no: '40', gds_layer: '40', gds_datatype: '0', fill_color: 'red' })], null, { tagChanges: false });
  ok('Req_ID 주석 끄기', !res.files.tf.includes('; A1'));
}
{
  const r = rowsToRequests(readCsv('﻿Req_ID,Type,Layer,Purpose\r\nX1,추가,M9,drawing\r\n'));
  ok('CSV · 한글 Type', r.length === 1 && r[0].type === 'ADD');
}
{
  const z = zip([{ name: 'a/한글.txt', data: '안녕\n' }, { name: 'b.txt', data: 'x' }]);
  const back = await unzip(z);
  ok('zip 왕복', new TextDecoder().decode(back['a/한글.txt']) === '안녕\n' && Object.keys(back).length === 2);
}
{
  const res = plan(ts(), reqs, null);
  ok('diff 머리 형식', res.diffs.tf.startsWith('--- a/demo.tf\n+++ b/demo.tf\n@@ -'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
