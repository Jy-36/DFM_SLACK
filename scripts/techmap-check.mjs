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
import { DEMO_FILES } from './fixtures/techmap-demo-files.js';

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
const xbuf = readFileSync(new URL('./fixtures/techmap_request_sample.xlsx', import.meta.url));
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

// ── 작업공간 흐름: Master · DK · Ver · Option · history · 폴더 출력
{
  const { seedWorkspace, approveRevision, addRequests, newRevision } = await import('../src/apps/techmap/lib/workspace.js');
  const { computeRevision, revisionFolder } = await import('../src/apps/techmap/lib/revision.js');
  const { crossMaster, numberRegistry } = await import('../src/apps/techmap/lib/registry.js');
  const { parseVer, compareVer, folderName } = await import('../src/apps/techmap/lib/version.js');
  const { classOf } = await import('../src/apps/techmap/lib/classify.js');
  const { DEFAULT_OPTIONS } = await import('../src/apps/techmap/lib/planner.js');
  const S = DEFAULT_OPTIONS;

  ok('Ver: 정식', parseVer('v1.0.0.0').kind === 'release');
  ok('Ver: exp_날짜', parseVer('v1.0.0.0_exp_20261020').kind === 'exp' && parseVer('v1.0.0.0_exp_20261020').date === '20261020');
  ok('Ver: exp날짜(붙여 씀)', parseVer('v1.0.0.0_exp20261020').date === '20261020');
  ok('Ver: incr날짜', parseVer('v1.0.0.0_incr20261101').kind === 'incr');
  ok('Ver: 잘못된 형식', !parseVer('1.0').valid);
  ok('Ver 정렬', ['v1.0.0.0_incr20261101', 'v1.0.0.1', 'v1.0.0.0', 'v1.0.0.0_exp_20261020'].sort(compareVer).join() === 'v1.0.0.0,v1.0.0.0_exp_20261020,v1.0.0.0_incr20261101,v1.0.0.1');
  ok('작업 폴더 이름 · 같은 날 _2', folderName('SF3', 'v1.0.0.0', '20261026', ['SF3_v1.0.0.0_20261026']) === 'SF3_v1.0.0.0_20261026_2');
  ok('분류 추정', classOf('M7').cls === 'METAL' && classOf('VI3').level === 3 && classOf('AP').cls === 'TOP' && classOf('prBoundary').cls === 'MARKER' && classOf('OD').cls === 'FEOL');

  const { ws, current } = seedWorkspace(S);
  const sf3 = ws.processes.find((p) => p.id === '2_3nm');
  const sf2 = ws.processes.find((p) => p.id === '4nm');
  const reg = numberRegistry(loadSet(sf3.master.files), sf3.classes);
  ok('번호 대장: SF3 Layer 32 · 불일치 없음', reg.rows.length === 32 && !reg.issues.some((i) => i.level === 'error'));
  const cm = crossMaster({ ts: loadSet(sf3.master.files), classes: sf3.classes }, { ts: loadSet(sf2.master.files), classes: sf2.classes });
  ok('Master 비교: VIA4 번호 불일치 1건', cm.counts.mismatch === 1 && cm.rows[0].key === 'VIA4:drawing', JSON.stringify(cm.counts));
  ok('Master 비교: RDL ↔ AP 기능키로 같음', cm.rows.some((r) => r.key === 'AP:drawing' && r.status === 'same' && r.b.layer === 'RDL'));
  ok('Master 비교: 한쪽에만 (MIM · PAD · M10/M11)', cm.rows.some((r) => r.key === 'MIM:drawing' && r.status === 'onlyB') && cm.rows.some((r) => r.key === 'PAD:drawing' && r.status === 'onlyA'));

  const first = ws.revisions.find((r) => r.status === 'approved');
  ok('첫 DK 작업 승인 · 폴더 이름', first.folder === 'SF3_v1.0.0.0_20261012' && first.output);
  ok('첫 DK: HIDE 반영 (prBoundary Vis/Sel nil)', /prBoundary\s+drawing\s+prBoundary_drw\s+nil nil t t t/.test(first.output.files.tf.text));
  const fc = computeRevision(ws, first, S);
  ok('Option: 빠진 Layer를 룰 등에서 참조하면 알림', fc.checks.some((c) => c.scope === 'Option 1P9M_6X1Z' && c.msg.includes('M10')));
  ok('첫 DK: Master 부분집합 · 번호 같음', !fc.checks.some((c) => c.scope === 'All ↔ Master'), JSON.stringify(fc.checks.slice(0, 3)));
  const o9 = fc.options.find((o) => o.def.name === '1P9M_6X1Z');
  ok('Option 9M: Metal 9 · Via 8 · AP 포함 · PAD 제외', o9.check.metals === 9 && o9.check.vias === 8 && o9.set.get('AP').in && !o9.set.get('PAD').in);
  ok('Option 파일에서 M10 행 삭제', !/\(\s*M10\s+(\d+|drawing|pin)/.test(o9.files.tf.text) && !/^M10\s/m.test(o9.files.layermap.text) && /\(\s*M9\s/.test(o9.files.tf.text));

  // exp 작업에 DK 예시 요청
  const rev = ws.revisions.find((r) => r.id === current);
  ok('exp 작업: Reference = 첫 작업, Option 이어받음', rev.ref.id === first.id && rev.options.length === 2 && rev.folder.startsWith('SF3_v1.0.0.0_exp_20261020_'));
  const dkReqs = await readRequestFile('dk.xlsx', readFileSync(new URL('../public/techmap/techmap_request_dk_sample.xlsx', import.meta.url)));
  let ws2 = addRequests(ws, current, dkReqs, 'dk.xlsx');
  const rev2 = ws2.revisions.find((r) => r.id === current);
  const c2 = computeRevision(ws2, rev2, S);
  const st = Object.fromEntries(c2.res.items.map((i) => [i.id, i.status]));
  ok('DK 요청 상태', JSON.stringify(st) === JSON.stringify({ 'REQ-101': 'READY', 'REQ-102': 'ERROR', 'REQ-103': 'READY', 'REQ-104': 'READY', 'REQ-105': 'READY', 'REQ-106': 'READY', 'REQ-107': 'READY', 'REQ-108': 'READY', 'REQ-109': 'ERROR' }), JSON.stringify(st));
  const i101 = c2.res.items.find((i) => i.id === 'REQ-101');
  ok('DK ADD: 번호 · GDS · packet을 Master에서', i101.checks.some((c) => c.msg.startsWith('Master에서 가져옴: Layer# 236')) && c2.allFiles.layermap.text.includes('DMEXCL') && c2.allFiles.drf.text.includes('DMEXCL_drw'));
  ok('DK ADD: Master와 다른 GDS → ERROR', c2.res.items.find((i) => i.id === 'REQ-102').checks.some((c) => c.msg.includes('≠ Master 10')));
  ok('DK ADD: Master에 없는 LPP → ERROR', c2.res.items.find((i) => i.id === 'REQ-109').checks.some((c) => c.msg.includes('Master에 없는 LPP')));
  ok('HIDE · SHOW 플래그', /text\s+drawing\s+text_drw\s+nil nil t t t/.test(c2.allFiles.tf.text) && /prBoundary\s+drawing\s+prBoundary_drw\s+t t t t t/.test(c2.allFiles.tf.text));
  ok('수정 후에도 Master 부분집합', !c2.checks.some((c) => c.scope === 'All ↔ Master'), JSON.stringify(c2.checks.filter((c) => c.scope === 'All ↔ Master')));
  const o9b = c2.options.find((o) => o.def.name === '1P9M_6X1Z');
  ok('OPTION_ADD → 9M에 PAD (예외 +)', o9b.set.get('PAD').in && o9b.set.get('PAD').why === 'plus');
  const o11 = c2.options.find((o) => o.def.name === '1P11M_8X2Z');
  ok('OPTION_REMOVE VIA10 → Via 스택 점검 경고', !o11.set.get('VIA10').in && o11.check.issues.some((i) => i.msg.includes('M11') && i.msg.includes('Via 10')));
  ok('history: 이전 블록 + 이번 블록', c2.history.includes('[SF3 v1.0.0.0]') && c2.history.includes('[SF3 v1.0.0.0_exp_20261020]') && c2.history.includes('ADD      REQ-101'));
  const files = revisionFolder(ws2, rev2, c2).map((f) => f.path);
  const root = `2_3nm/SF3/${rev2.folder}`;
  ok('출력 폴더 구조', files.includes(`${root}/All/SF3.tf`) && files.includes(`${root}/All/SF3_history.txt`) && files.includes(`${root}/Options/1P9M_6X1Z/SF3.layermap`) && files.includes(`${root}/_techmap/revision.json`), files.join('\n'));

  // 승인 → 다음 작업의 Reference
  ws2 = approveRevision(ws2, current, S);
  const nx = newRevision(ws2, { kind: 'dk', process: '2_3nm', dk: 'SF3', ver: 'v1.0.0.0_incr20261101', workDate: '20261101', ref: current }, S);
  ok('승인본이 다음 Reference', nx.rev.base.files.layermap.text.includes('DMEXCL') && nx.rev.base.history.includes('v1.0.0.0_exp_20261020'));

  // Master 변경: 번호 지정 ADD + 다른 Master와 번호 비교
  const mr = newRevision(ws2, { kind: 'master', process: '2_3nm' }, S);
  const mReqs = await readRequestFile('m.xlsx', readFileSync(new URL('../public/techmap/techmap_request_master_sample.xlsx', import.meta.url)));
  const ws3 = addRequests(mr.ws, mr.rev.id, mReqs, 'm.xlsx');
  const mc = computeRevision(ws3, ws3.revisions.find((r) => r.id === mr.rev.id), S);
  ok('Master ADD 3건 READY', mc.res.items.every((i) => i.status === 'READY'), JSON.stringify(mc.res.items.map((i) => [i.id, i.status, i.checks])));
  ok('Master ↔ SF2: MIM GDS 불일치 ERROR', mc.checks.some((c) => c.level === 'error' && c.msg.startsWith('MIM:drawing')), JSON.stringify(mc.checks));
  const ws4 = approveRevision(ws3, mr.rev.id, S);
  ok('Master 승인 → Process Master 갱신', ws4.processes.find((p) => p.id === '2_3nm').master.files.tf.text.includes('M12'));
}

// ── 분기 · Merge (git처럼)
{
  const { seedWorkspace, newRevision, addRequests, approveRevision, mergeInto, setOptions } = await import('../src/apps/techmap/lib/workspace.js');
  const { computeRevision } = await import('../src/apps/techmap/lib/revision.js');
  const { dkGraph, isAncestor, mergeBase } = await import('../src/apps/techmap/lib/graph.js');
  const { DEFAULT_OPTIONS: S } = await import('../src/apps/techmap/lib/planner.js');
  const { ws: w0, current: expId } = seedWorkspace(S);
  const relId = w0.revisions.find((r) => r.status === 'approved').id;
  const R = (id, type, f) => ({ id, type, row: 0, f: { req_id: id, type, ...f } });
  // exp 브랜치: DMEXCL 추가 + 9M Option에 PAD
  let ws = addRequests(w0, expId, [R('E-1', 'ADD', { layer: 'DMEXCL', purpose: 'drawing' }), R('E-2', 'OPTION_ADD', { layer: 'PAD', option: '1P9M_6X1Z' })], 'exp');
  ws = setOptions(ws, expId, ws.revisions.find((r) => r.id === expId).options.map((o) => (o.name === '1P11M_8X2Z' ? { ...o, minus: ['DMEXCL'] } : o)));
  ws = approveRevision(ws, expId, S);
  // 정식 다음 버전: v1.0.0.1, v1.0.0.0에서 분기 (exp와 따로)
  let n = newRevision(ws, { kind: 'dk', process: '2_3nm', dk: 'SF3', ver: 'v1.0.0.1', workDate: '20261101', ref: relId }, S);
  ws = addRequests(n.ws, n.rev.id, [R('R-1', 'HIDE', { layer: 'text', purpose: 'drawing' })], 'rel');
  const relNext = n.rev.id;
  ok('분기: exp와 v1.0.0.1은 서로 조상 아님', !isAncestor(ws, expId, relNext) && !isAncestor(ws, relNext, expId) && mergeBase(ws, expId, relNext) === relId);
  const m = mergeInto(ws, relNext, expId, S);
  ws = m.ws;
  const t = ws.revisions.find((r) => r.id === relNext);
  ok('Merge: exp의 반영 요청 2건이 들어옴', m.added.length === 2 && t.requests.some((q) => q.f.merged_from === ws.revisions.find((r) => r.id === expId).folder));
  ok('Merge: 둘째 부모 기록', t.merges.length === 1 && t.merges[0].id === expId);
  const c = computeRevision(ws, t, S);
  ok('Merge 결과: 양쪽 변경이 모두 반영', c.allFiles.layermap.text.includes('DMEXCL') && /text\s+drawing\s+text_drw\s+nil nil/.test(c.allFiles.tf.text), JSON.stringify(c.res.items.map((i) => [i.id, i.status])));
  ok('Merge: Option 3-way (exp가 바꾼 minus DMEXCL)', t.options.find((o) => o.name === '1P11M_8X2Z').minus.includes('DMEXCL'));
  ok('Merge: history에 Merge 줄', c.history.includes('Merge     : SF3_v1.0.0.0_exp_20261020_'));
  let err = '';
  try { mergeInto(ws, relNext, expId, S); } catch (e) { err = e.message; }
  ok('같은 작업을 다시 합치면 막음 (이미 포함)', err.includes('이미 이 작업에 들어 있어요'));
  // 충돌: 양쪽이 같은 LPP를 ADD
  let n2 = newRevision(w0, { kind: 'dk', process: '2_3nm', dk: 'SF3', ver: 'v1.0.0.1', workDate: '20261102', ref: relId }, S);
  let w2 = addRequests(n2.ws, n2.rev.id, [R('X-1', 'ADD', { layer: 'DMEXCL', purpose: 'drawing' })], 'x');
  w2 = addRequests(w2, expId, [R('E-1', 'ADD', { layer: 'DMEXCL', purpose: 'drawing' })], 'exp');
  const m2 = mergeInto(w2, n2.rev.id, expId, S);
  const c2 = computeRevision(m2.ws, m2.ws.revisions.find((r) => r.id === n2.rev.id), S);
  ok('충돌: 같은 LPP ADD → 합친 쪽 요청이 ERROR', c2.res.items.find((i) => i.id === 'E-1').status === 'ERROR');
  // 그래프
  const g = dkGraph(ws, 'SF3');
  const lane = (id) => g.nodes.find((x) => x.rev.id === id).lane;
  ok('그래프: 정식은 lane 0, exp는 다른 lane', lane(relId) === 0 && lane(relNext) === 0 && lane(expId) === 1 && g.lanes.length === 2);
  ok('그래프: 분기 · Merge 선', g.edges.filter((e) => e.kind === 'parent').length === 2 && g.edges.some((e) => e.kind === 'merge' && e.from.rev.id === expId && e.to.rev.id === relNext) && g.edges.some((e) => e.kind === 'master'));
  const rich = seedWorkspace(S, { rich: true });
  ok('노드 6개 (표시 이름 · 폴더 id)', rich.ws.processes.map((p) => `${p.name}=${p.id}`).join() === '2/3nm=2_3nm,4nm=4nm,5nm=5nm,7nm=7nm,8/10nm=8_10nm,14nm=14nm');
  ok('노드 아래 DK: 2/3nm → SF3 · SF2, 4nm → SF4', rich.ws.dks.filter((d) => d.process === '2_3nm').map((d) => d.id).sort().join() === 'SF2,SF3' && rich.ws.dks.find((d) => d.id === 'SF4').process === '4nm');
  let e2 = '';
  try { newRevision(rich.ws, { kind: 'dk', process: '7nm', dk: 'SF7', ver: 'v1.0.0.0', ref: 'master' }, S); } catch (e) { e2 = e.message; }
  ok('Master 없는 노드는 작업을 만들 수 없음', e2.includes('7nm에 Master가 아직 없어요'));
  const { addProcess } = await import('../src/apps/techmap/lib/workspace.js');
  const { DEMO_MASTERS } = await import('../src/apps/techmap/lib/demoMasters.js');
  const w7 = addProcess(rich.ws, '7nm', DEMO_MASTERS['4nm'], 'test');
  ok('미등록 노드에 Master 등록', w7.processes.find((p) => p.id === '7nm').master && w7.processes.length === 6);
  ok('새 노드 추가 (폴더 id 변환)', addProcess(rich.ws, '1.4nm A', DEMO_MASTERS['4nm']).processes.some((p) => p.id === '1.4nm_A' && p.name === '1.4nm A'));
  const rg = dkGraph(rich.ws, 'SF3');
  ok('DEMO(rich): 정식 · exp 2 · incr = lane 4개, Merge 선 1개', rg.lanes.length === 4 && rg.edges.filter((e) => e.kind === 'merge').length === 1 && rg.nodes.length === 5, JSON.stringify(rg.lanes));
  const v101 = rich.ws.revisions.find((r) => r.ver === 'v1.0.0.1');
  ok('DEMO(rich): v1.0.0.1에 exp의 AP pin이 합쳐짐', v101.output.files.layermap.text.includes('AP                pin'), v101.log.map((l) => l.text).join(' / '));
  ok('그래프: 위가 최신', g.nodes.find((x) => x.rev.id === relNext).row === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
