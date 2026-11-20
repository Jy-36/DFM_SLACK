// OS Size Checker 계산 확인: node scripts/oschecker-check.mjs
import { parseA, parseB, compare, parseChipSize, resultTsv, SAMPLE_A, SAMPLE_B, fmt } from '../src/apps/oschecker/lib/parse.js';

let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`); };

// Chip Size 모양
eq('Chip Size "10000 x 8000"', parseChipSize('10000 x 8000'), { x: 10000, y: 8000 });
eq('Chip Size "10000x8000"', parseChipSize('10000x8000'), { x: 10000, y: 8000 });
eq('Chip Size "5000.5 X 2500.25"', parseChipSize('5000.5 X 2500.25'), { x: 5000.5, y: 2500.25 });
eq('Chip Size "1,000 × 2,000"', parseChipSize('1,000 × 2,000'), { x: 1000, y: 2000 });
eq('Chip Size 빈 칸', parseChipSize(''), null);

// A: 가로 표 (탭)
const a = parseA(SAMPLE_A);
eq('A 샘플 건수', a.items.length, 4);
eq('A 첫 건 key·size', [a.items[0].key, a.items[0].w, a.items[0].h], ['TOP_CHIP_A', 9800, 7840]);
eq('A 빠진 항목 없음', a.missing, []);

// A: 공백 정렬 + 세로로 한 건씩 반복
const aVert = parseA(`Module     M1
Blockcount 1
MaskVersion A0
LowerLeftX 0
LowerLeftY 0
UpperRightX 100
UpperRightY 200
Polarity P
Select Y
Structure S1
Module     M2
UpperRightX 300
UpperRightY 400
Structure S2`);
eq('A 세로 반복 → 2건', aVert.items.map((i) => [i.key, i.w, i.h]), [['S1', 100, 200], ['S2', 300, 400]]);
eq('A "Upper Right X:" 모양도 읽음', parseA('Upper Right X: 10 20\nUpperRightY: 30 40\nStructure: P Q').items.map((i) => [i.key, i.w, i.h]), [['P', 10, 30], ['Q', 20, 40]]);

// B: 탭 머리줄
const b = parseB(SAMPLE_B);
eq('B 샘플 건수 (SCRIBE 포함 6, 비교에서 제외)', b.items.length, 6);
eq('B TOP_CHIP_A ×0.98', [fmt(b.items[0].w), fmt(b.items[0].h)], ['9800', '7840']);
eq('B 머리줄 있음', b.headerless, false);

// B: 공백 하나로 나뉜 줄 (Chip Size 안의 공백 다시 붙이기)
const bSp = parseB('No Struct Name DB Class GDS File Chip Size Cust.Nick GDS ID EBEAM Prefix Place.X Place.Y\n1 S1 MAIN s1.gds 100 x 200 AA G1 EA 0 0');
eq('B 공백 구분 · 머리줄 없음 취급 → 기본 순서', bSp.items.map((i) => [i.key, i.chipX, i.chipY]), [['S1', 100, 200]]);

// B: 열 순서가 달라도 머리줄로 찾음
const bOrd = parseB('Struct Name\tChip Size\tNo\nX1\t50x60\t1');
eq('B 열 순서 다름', bOrd.items.map((i) => [i.key, i.chipX, i.chipY]), [['X1', 50, 60]]);

// 비교
const r = compare(a.items, b.items);
const st = Object.fromEntries(r.rows.map((x) => [x.key, x.status]));
eq('TOP_CHIP_A 일치', st.TOP_CHIP_A, 'match');
eq('TEG_01 일치 (4900.49 = 5000.5×0.98, 부동소수점 찌꺼기 무시)', st.TEG_01, 'match');
eq('TOP_CHIP_B 불일치', st.TOP_CHIP_B, 'diff');
eq('TEG_02 가로세로 바뀜 → 불일치 + 표시', [st.TEG_02, r.rows.find((x) => x.key === 'TEG_02').swapped], ['diff', true]);
eq('TEG_03 B에만', st.TEG_03, 'onlyB');
eq('SCRIBE 제외', [st.SCRIBE, r.excluded], [undefined, ['SCRIBE']]);
eq('개수', r.counts, { match: 2, diff: 2, bad: 0, onlyA: 0, onlyB: 1 });
const diffRow = r.rows.find((x) => x.key === 'TOP_CHIP_B');
eq('TOP_CHIP_B ΔY', fmt(diffRow.dh), fmt(9310 - 9600 * 0.98));
eq('오차 없음: 0.001 차이도 불일치', compare([{ key: 'k', w: 1.001, h: 2, ok: true }], [{ key: 'k', w: 1, h: 2, ok: true }]).counts.diff, 1);
eq('대소문자는 다른 이름', compare([{ key: 'abc', w: 1, h: 1, ok: true }], [{ key: 'ABC', w: 1, h: 1, ok: true }]).counts.onlyA, 1);
eq('BLIND · SC1 · OOB 제외', compare(['BLIND', 'SC1', 'OOB', 'X'].map((key) => ({ key, w: 1, h: 1, ok: true })), [{ key: 'X', w: 1, h: 1, ok: true }]).total, 1);
eq('중복 Key 표시', compare([{ key: 'k', w: 1, h: 1, ok: true }, { key: 'k', w: 1, h: 1, ok: true }], [{ key: 'k', w: 1, h: 1, ok: true }]).dups, 1);
eq('결과 TSV 줄 수', resultTsv(r).split('\n').length, 6);

process.exit(fail ? 1 : 0);
