// Layer List: 예시 데이터, 엑셀/CSV 붙여넣기 파싱, 입력 확인

const EX = [[1,"A","A-1","X"],[2,"A","A-2","Z"],[3,"A","A-3","X"],[4,"A","A-4","Y"],[5,"A","A-5","X"],[6,"A","A-6","X"],[7,"A","A-7","X"],[8,"A","A-8","Y"],[9,"A","A-9","Y"],[10,"A","A-10","Y"],[11,"A","A-11","Y"],[12,"A","A-12","Y"],[13,"A","A-13","Y"],[14,"A","A-14","X"],[15,"A","A-15","X"],[16,"B","B-1","Z"],[17,"B","B-2","Z"],[18,"B","B-3","Z"],[19,"B","B-4","Z"],[20,"B","B-5","Z"],[21,"B","B-6","Z"],[22,"B","B-7","Z"],[23,"B","B-8","Z"],[24,"B","B-9","Y"],[25,"B","B-10","Y"],[26,"B","B-11","Y"],[27,"B","B-12","Y"],[28,"B","B-13","X"],[29,"B","B-14","X"],[30,"B","B-15","X"]]; // prettier-ignore

/** 30개 Layer 예시 (mto-scheduling-agent/data/layers_example.csv) */
export const EXAMPLE_LAYERS = EX.map(([no, part, layer, type]) => ({ no, part, layer, type }));
export const EXAMPLE_GDS = '2026-09-21';

const HEAD = { no: /^(no|번호|#)$/i, part: /^(part|파트)$/i, layer: /^(layer|레이어|name)$/i, type: /^(type|타입)$/i };

/**
 * 엑셀에서 복사한 표(탭), CSV, 공백 구분 텍스트를 Layer 목록으로.
 * 머리줄(No, Part, Layer, Type)이 있으면 열 순서를 그대로 따르고, 없으면 No·Part·Layer·Type(또는 Part·Layer·Type) 순서로 읽는다.
 */
export function parseLayerText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const split = (line) => (line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s+/)).map((c) => c.trim().replace(/^"|"$/g, ''));
  let cols = null;
  const first = split(lines[0]);
  const found = Object.fromEntries(Object.entries(HEAD).map(([k, re]) => [k, first.findIndex((c) => re.test(c))]));
  if (found.part >= 0 && found.layer >= 0 && found.type >= 0) {
    cols = found;
    lines.shift();
  }
  const rows = [];
  for (const line of lines) {
    const c = split(line);
    let no, part, layer, type;
    if (cols) {
      [part, layer, type] = [c[cols.part], c[cols.layer], c[cols.type]];
      no = cols.no >= 0 ? c[cols.no] : rows.length + 1;
    } else {
      const cells = c.filter((x) => x !== '');
      if (cells.length < 3) continue;
      if (/^no$/i.test(cells[0])) continue;
      if (cells.length >= 4) [no, part, layer, type] = cells;
      else [part, layer, type] = cells;
      if (no == null) no = rows.length + 1;
    }
    if (!layer && !part && !type) continue;
    rows.push({ no: parseInt(no, 10), part: String(part || '').toUpperCase(), layer: String(layer || ''), type: String(type || '').toUpperCase() });
  }
  return rows;
}

/** 입력 문제를 Layer별로 찾는다: [{ index, msg }] */
export function validateLayers(layers, types) {
  const errs = [];
  const seen = new Map();
  layers.forEach((l, i) => {
    if (!Number.isFinite(l.no)) errs.push({ index: i, field: 'no', msg: `${i + 1}행: No가 숫자가 아닙니다.` });
    else if (seen.has(l.no)) errs.push({ index: i, field: 'no', msg: `No ${l.no}가 두 번 있습니다 (${seen.get(l.no) + 1}행, ${i + 1}행).` });
    else seen.set(l.no, i);
    if (!['A', 'B'].includes(l.part)) errs.push({ index: i, field: 'part', msg: `${l.layer || `${i + 1}행`}: Part는 A 또는 B여야 합니다.` });
    if (!types.includes(l.type)) errs.push({ index: i, field: 'type', msg: `${l.layer || `${i + 1}행`}: Type은 ${types.join('/')} 중 하나여야 합니다.` });
    if (!l.layer) errs.push({ index: i, field: 'layer', msg: `No ${l.no}: Layer 이름이 비어 있습니다.` });
  });
  return errs;
}
