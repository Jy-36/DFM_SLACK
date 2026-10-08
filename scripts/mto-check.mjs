// MTO 규칙 엔진 확인: node scripts/mto-check.mjs
// 1) mto-scheduling-agent/tests/test_scheduler.py 를 옮긴 규칙 테스트
// 2) Python 엔진 결과(fixtures/mto-golden.json, 같은 공휴일 표로 생성)와 날짜가 모두 같은지 비교
import { readFileSync } from 'node:fs';
import { buildSchedule, scenarioGrid, makeCalendar, DEFAULT_CONFIG } from '../src/apps/mto/lib/scheduler.js';
import { EXAMPLE_LAYERS } from '../src/apps/mto/lib/layers.js';
import { parseLayerText } from '../src/apps/mto/lib/layers.js';
import { analyze } from '../src/apps/mto/lib/insights.js';
import { toCsv } from '../src/apps/mto/lib/report.js';
import { computeProject, newProject, effectiveConfig } from '../src/apps/mto/lib/projects.js';
import { exampleProcess, newProcess, parseProcessRows, checkProcess, layersFromRows } from '../src/apps/mto/lib/process.js';

let fail = 0;
let pass = 0;
const show = (v) => JSON.stringify(v);
const eq = (name, got, want) => {
  const ok = show(got) === show(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${name}\n     got  ${show(got)}\n     want ${show(want)}`);
  else console.log(`ok   ${name}`);
};
const ok = (name, cond) => eq(name, !!cond, true);

const UNLIMITED = { mtoPerDay: 1, step2Concurrency: null };
const L = (no, part, type) => ({ no, part, layer: `${part}-${no}`, type });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const wd = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();

// ── 규칙 테스트
const cal = makeCalendar();
ok('추석 휴일', cal.isHoliday('2026-09-25'));
ok('개천절 대체 휴일', cal.isHoliday('2026-10-05'));
ok('일요일 휴일', cal.isHoliday('2026-09-27'));
ok('월요일 근무일', !cal.isHoliday('2026-09-21'));
eq('다음 근무일 (추석 연휴)', cal.nextWorkingDay('2026-09-24'), '2026-09-28');

let r = buildSchedule('2026-09-21', [L(1, 'A', 'X'), L(2, 'B', 'X')]);
eq('Part B GDS = A + 14일', r.partBGds, '2026-10-05');

r = buildSchedule('2026-09-21', [L(1, 'A', 'X'), L(2, 'A', 'Z'), L(3, 'B', 'X')]);
eq('STEP1 Part A (TAT 5)', [r.step1.A.start, r.step1.A.end], ['2026-09-21', '2026-09-25']);
eq('STEP1 Part B (GDS 휴일 → 다음 근무일, TAT 3)', [r.step1.B.start, r.step1.B.end], ['2026-10-06', '2026-10-08']);

r = buildSchedule('2026-09-21', [L(1, 'A', 'Z')]);
let l = r.layers[0];
eq('STEP2 휴일 시작 불가', [l.step2Ready, l.step2Start], ['2026-09-28', '2026-09-28']);
eq('STEP2 휴일에도 진행 (7달력일)', l.step2End, '2026-10-04');
eq('MTO 휴일 불가', l.mtoEarliest, '2026-10-06');

r = buildSchedule('2026-11-02', [L(1, 'A', 'X'), L(2, 'A', 'Y'), L(3, 'A', 'Z')]);
eq('STEP2 TAT by Type', r.layers.map((x) => (new Date(x.step2End) - new Date(x.step2Start)) / 864e5 + 1), [3, 5, 7]);

r = buildSchedule('2026-11-02', range(1, 4).map((i) => L(i, 'A', 'X')), UNLIMITED);
eq('순차 MTO 하루 1장', r.layers.map((x) => x.mtoDate), ['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17']);
eq('순차 MTO 대기', r.layers.map((x) => x.mtoWaitDays), [0, 1, 4, 5]);

r = buildSchedule('2026-11-02', [L(1, 'A', 'Z'), L(2, 'A', 'X')], UNLIMITED);
ok('뒤 번호는 앞 번호를 앞지르지 않음', r.layers[1].mtoEarliest < r.layers[0].mtoDate && r.layers[1].mtoDate > r.layers[0].mtoDate);

const six = range(1, 6).map((i) => L(i, 'A', 'X'));
r = buildSchedule('2026-11-02', six, { mtoPerDay: 2, step2Concurrency: null });
eq('하루 2장', r.layers.map((x) => x.mtoDate), ['2026-11-12', '2026-11-12', '2026-11-13', '2026-11-13', '2026-11-16', '2026-11-16']);
r = buildSchedule('2026-11-02', six, { mtoPerDay: 3, step2Concurrency: null });
eq('하루 3장', r.layers.map((x) => x.mtoDate), ['2026-11-12', '2026-11-12', '2026-11-12', '2026-11-13', '2026-11-13', '2026-11-13']);

r = buildSchedule('2026-11-02', six, { mtoPerDay: 3, step2Concurrency: 4 });
eq('STEP2 동시 4장', r.layers.map((x) => x.step2Start), [...Array(4).fill('2026-11-09'), '2026-11-12', '2026-11-12']);
eq('STEP2 슬롯 대기', r.layers.map((x) => x.step2WaitDays), [0, 0, 0, 0, 3, 3]);
eq('STEP2 최대 동시', Math.max(...Object.values(r.step2Load)), 4);

r = buildSchedule('2026-11-02', range(1, 5).map((i) => L(i, 'A', 'Z')), { step2Concurrency: 4 });
eq('슬롯은 휴일에도 점유, 시작은 근무일', [r.layers[4].step2Start, wd(r.layers[4].step2Start)], ['2026-11-16', 1]);

for (const cap of [4, 5]) {
  r = buildSchedule('2026-09-21', EXAMPLE_LAYERS, { step2Concurrency: cap });
  const cnt = {};
  for (const x of r.layers) for (let d = new Date(x.step2Start); d <= new Date(x.step2End); d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    cnt[k] = (cnt[k] || 0) + 1;
  }
  ok(`예시 30장 동시 ${cap}장 넘지 않음`, Math.max(...Object.values(cnt)) <= cap && show(cnt) === show(r.step2Load));
  ok(`예시 30장 STEP2 시작은 근무일 (동시 ${cap})`, r.layers.every((x) => !cal.isHoliday(x.step2Start)));
}

r = buildSchedule('2026-11-02', [L(1, 'A', 'X')], { extraHolidays: ['2026-11-09'] });
eq('추가 휴무일', r.layers[0].step2Start, '2026-11-10');

let threw = '';
try { buildSchedule('2026-11-02', [L(1, 'A', 'Q')]); } catch (e) { threw = e.message; }
ok('모르는 Type은 오류', /Type 'Q'/.test(threw));

r = buildSchedule('2026-09-21', EXAMPLE_LAYERS);
const dates = r.layers.map((x) => x.mtoDate);
ok('예시: MTO 날짜 순서 유지', show(dates) === show([...dates].sort()));
ok('예시: 하루 2장 이하', Math.max(...Object.values(dates.reduce((m, d) => ({ ...m, [d]: (m[d] || 0) + 1 }), {}))) <= 2);
eq('예시: 규칙 1~9 기준 최종 MTO', buildSchedule('2026-09-21', EXAMPLE_LAYERS, UNLIMITED).finalMto, '2026-11-16');

const grid = scenarioGrid('2026-09-21', [...range(1, 10).map((i) => L(i, 'A', 'Z')), ...range(11, 20).map((i) => L(i, 'B', 'Y'))]);
eq('시나리오 순서', grid.map((g) => [g.mtoPerDay, g.step2Concurrency]), [[2, 4], [2, 5], [3, 4], [3, 5]]);
const by = Object.fromEntries(grid.map((g) => [`${g.mtoPerDay}x${g.step2Concurrency}`, g.finalMto]));
ok('시나리오 단조', by['2x5'] <= by['2x4'] && by['3x4'] <= by['2x4'] && by['3x5'] <= by['3x4']);

// ── 붙여넣기 파싱
eq('엑셀 붙여넣기 (머리줄, 열 순서 다름)', parseLayerText('Layer\tType\tPart\tNo\nM1\tz\ta\t3\nM2\tx\tb\t4'), [{ no: 3, part: 'A', layer: 'M1', type: 'Z' }, { no: 4, part: 'B', layer: 'M2', type: 'X' }]);
eq('3열 (No 없음)', parseLayerText('A A-1 X\nA A-2 Y').map((x) => x.no), [1, 2]);

// ── 분석이 오류 없이 돌아가는지
const an = analyze(buildSchedule('2026-09-21', EXAMPLE_LAYERS, DEFAULT_CONFIG), EXAMPLE_LAYERS);
ok('분석: 병목 항목 있음', an.bottlenecks.length > 0);
ok('분석: 최종 경로 Layer', !!an.critical.layer);
console.log('     ', an.headline);
an.recs.forEach((x) => console.log(`      추천 +${x.gainDays}일 ${x.title} — ${x.detail}`));
ok('CSV 줄 수', toCsv(r).trim().split('\n').length === 31);

// ── Revision (Part 없이 GDS → STEP1 → STEP2 → MTO) · 여러 묶음
const revP = newProject('revision', [], { gds: '2026-11-02', step1Tat: 3, layers: [{ no: 1, part: '', layer: 'M1', type: 'X' }, { no: 2, part: '', layer: 'V1', type: 'X' }, { no: 3, part: '', layer: 'M2', type: 'X' }] });
const rc = computeProject(revP, DEFAULT_CONFIG);
ok('Revision 계산됨 (Part 입력 없어도)', !!rc.result);
eq('Revision STEP1 (TAT 3, Part 없음)', [rc.result.step1.R.start, rc.result.step1.R.end, Object.keys(rc.result.step1)], ['2026-11-02', '2026-11-04', ['R']]);
eq('Revision STEP2 → MTO (주말 넘김, 하루 2장)', rc.result.layers.map((x) => [x.step2Start, x.step2End, x.mtoDate]), [['2026-11-05', '2026-11-07', '2026-11-09'], ['2026-11-05', '2026-11-07', '2026-11-09'], ['2026-11-05', '2026-11-07', '2026-11-10']]);
eq('Revision STEP1 비우면 규칙 기본값', effectiveConfig(DEFAULT_CONFIG, { ...revP, step1Tat: null }).step1Tat, { R: 3 });
const pA = newProject('product', [], { gds: '2026-09-21', layers: EXAMPLE_LAYERS, override: { mtoPerDay: 3, step2Concurrency: 5 } });
const pB = newProject('product', [pA], { gds: '2026-09-21', layers: EXAMPLE_LAYERS });
eq('Product마다 따로 계산 (조건 다르면 결과 다름)', [computeProject(pA, DEFAULT_CONFIG).result.finalMto, computeProject(pB, DEFAULT_CONFIG).result.finalMto], ['2026-11-03', '2026-11-13']);
eq('묶음 이름 자동', [pA.name, pB.name, revP.name], ['Product 1', 'Product 2', 'Revision 1']);
ok('Product에 Part 빠지면 입력 확인', computeProject({ ...pB, layers: [{ no: 1, part: '', layer: 'x', type: 'X' }] }, DEFAULT_CONFIG).issues?.length > 0);

// ── 공정(Process) 기준 Product
const ex = exampleProcess();
const pp = newProject('product', [], { gds: '2026-09-21', processId: ex.id, layers: layersFromRows(ex.rows) });
const pc = computeProject(pp, DEFAULT_CONFIG, [ex]);
eq('공정 기준 Product = 직접 입력과 같은 결과 (예시 30장)', pc.result?.finalMto, '2026-11-13');
eq('공정 트리 Module 나눔', [...new Set(ex.rows.map((r) => `${r.part}/${r.module}`))], ['A/FEOL', 'A/MOL', 'B/BEOL-1', 'B/BEOL-2']);
const ex2 = { ...ex, parts: [{ name: 'A', gdsOffset: 0, step1Tat: 5 }, { name: 'B', gdsOffset: 7, step1Tat: 4 }] };
const pc2 = computeProject(pp, DEFAULT_CONFIG, [ex2]);
eq('Part별 GDS 간격·STEP1 TAT는 공정 설정을 따름', [pc2.result.step1.B.gds, pc2.result.step1.B.start, pc2.result.step1.B.end], ['2026-09-28', '2026-09-28', '2026-10-01']);
const named = newProcess([], { parts: [{ name: 'FEOL', gdsOffset: 0, step1Tat: 5 }, { name: 'BEOL', gdsOffset: 10, step1Tat: 3 }], rows: [{ id: 'r1', part: 'FEOL', module: 'M', layer: 'PO', type: 'X', spec: {} }, { id: 'r2', part: 'BEOL', module: 'M1', layer: 'M1', type: 'Y', spec: {} }] });
const pn = computeProject(newProject('product', [], { gds: '2026-11-02', processId: named.id, layers: layersFromRows(named.rows) }), DEFAULT_CONFIG, [named]);
eq('Part 이름 자유 (FEOL/BEOL), 순서 유지', [Object.keys(pn.result?.step1 || {}), pn.result?.step1.BEOL.gds], [['FEOL', 'BEOL'], '2026-11-12']);
ok('공정에서 지운 Layer는 입력 확인', computeProject({ ...pp, layers: [...pp.layers, { no: 99, ref: 'gone' }] }, DEFAULT_CONFIG, [ex]).issues?.some((i) => /지워진/.test(i.msg)));
const rv = computeProject(newProject('revision', [], { gds: '2026-11-02', processId: ex.id, layers: layersFromRows(ex.rows.slice(0, 3)) }), DEFAULT_CONFIG, [ex]);
eq('Revision도 공정 Layer 사용, Part는 무시', [Object.keys(rv.result?.step1 || {}), rv.result?.layers.map((l) => l.layer)], [['R'], ['A-1', 'A-2', 'A-3']]);
const pr = parseProcessRows('Layer\tPart\tType\tModule\tGrade\tCD\nM1\ta\tx\tBEOL\t1\t40nm', ['Grade']);
eq('시트 붙여넣기 (열 순서 무관, 새 SPEC 열)', [pr.rows.map((r) => [r.part, r.module, r.layer, r.type, r.spec]), pr.newColumns], [[['A', 'BEOL', 'M1', 'X', { Grade: '1', CD: '40nm' }]], ['CD']]);
ok('시트 확인: 모르는 Part', checkProcess({ ...ex, rows: [{ id: 'z', part: 'Q', module: '', layer: 'L', type: 'X' }] }, ['X', 'Y', 'Z']).length === 1);

// ── Product 탭 / Revision 탭 (ITEM은 Product에 딸림)
{
  const { mtoReducer } = await import('../src/apps/mto/lib/reducer.js');
  const pr = exampleProcess();
  let st = { projects: [], processes: [pr], config: DEFAULT_CONFIG, section: 'product', activeByKind: { product: null, revision: null }, activeId: null };
  const st0 = mtoReducer(st, { type: 'addProject', kind: 'revision', patch: { parentId: 'none' } });
  ok('Product 없으면 ITEM 못 만듦', st0.projects.length === 0);
  st = mtoReducer(st, { type: 'addProject', kind: 'product', patch: { name: 'P1', gds: '2026-09-21' } });
  const P1 = st.projects[0];
  eq('새 Product는 기준 공정 Set List 전체', [P1.processId === pr.id, P1.layers.length], [true, 30]);
  st = mtoReducer(st, { type: 'addProject', kind: 'revision', patch: { parentId: P1.id, gds: '2026-11-02' } });
  const I1 = st.projects[1];
  eq('ITEM: Product에 딸림 · 이름 · 공정 따라감 · Revision 탭으로', [I1.parentId, I1.name, I1.processId, st.section], [P1.id, 'P1 REV01', pr.id, 'revision']);
  st = mtoReducer(st, { type: 'layers', layers: layersFromRows(pr.rows.slice(20, 23)) });
  const ic = computeProject(st.projects[1], DEFAULT_CONFIG, [pr]);
  eq('ITEM 3장 계산 (Part 없이)', [Object.keys(ic.result.step1), ic.result.layers.map((l) => l.layer)], [['R'], ['B-6', 'B-7', 'B-8']]);
  const mid = computeProject({ ...P1, layers: layersFromRows(pr.rows.slice(15)) }, DEFAULT_CONFIG, [pr]);
  eq('중간부터(Part B만) 나가면 입력한 GDS = Part B GDS', [Object.keys(mid.result.step1), mid.result.step1.B.gds], [['B'], '2026-09-21']);
  st = mtoReducer(st, { type: 'section', section: 'product' });
  eq('탭 바꾸면 그 탭의 선택으로', [st.section, st.activeId], ['product', P1.id]);
  const removed = mtoReducer(st, { type: 'removeProject', id: P1.id });
  eq('Product 지우면 딸린 ITEM도 같이', removed.projects.length, 0);
  eq('되돌리기', mtoReducer(removed, { type: 'restoreProject' }).projects.length, 2);
}

// ── Python 엔진과 비교
const golden = JSON.parse(readFileSync(new URL('./fixtures/mto-golden.json', import.meta.url), 'utf8'));
let diffs = 0;
for (const [key, g] of Object.entries(golden)) {
  const [gds, m, c] = key.split('|');
  const res = buildSchedule(gds, EXAMPLE_LAYERS, { mtoPerDay: Number(m), step2Concurrency: c === 'None' ? null : Number(c) });
  const mine = res.layers.map((x) => [x.no, x.step2Ready, x.step2Start, x.step2End, x.mtoEarliest, x.mtoDate]);
  const same = show(mine) === show(g.layers) && res.finalMto === g.final && show(res.step2Load) === show(g.load) && show(Object.fromEntries(Object.entries(res.step1).map(([p, v]) => [p, [v.start, v.end]]))) === show(g.step1);
  if (!same) {
    diffs++;
    const i = mine.findIndex((row, k) => show(row) !== show(g.layers[k]));
    console.log(`FAIL Python 비교 ${key}: 최종 ${res.finalMto} vs ${g.final}${i >= 0 ? ` · No ${mine[i][0]} ${show(mine[i])} vs ${show(g.layers[i])}` : ''}`);
  }
}
eq(`Python 엔진과 동일 (${Object.keys(golden).length}개 조건 × 30 Layer)`, diffs, 0);

console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
