// Request 엑셀(.xlsx) · CSV → Request 목록. 첫 시트가 아니라 'Request' 시트를 먼저 찾고, Req_ID 헤더 줄부터 읽는다.
import { unzip } from './zip.js';

export const COLUMNS = [
  // key, 헤더, 설명
  ['req_id', 'Req_ID', '고유 ID (예: REQ-2026-001)'],
  ['type', 'Type', 'ADD / CHANGE_DISPLAY / RETIRE'],
  ['layer', 'Layer', 'Layer 이름'],
  ['purpose', 'Purpose', 'Purpose 이름 (RETIRE에서 비우면 Layer 전체)'],
  ['layer_no', 'Layer_No', 'ADD · 신규 Layer일 때 techLayers 번호'],
  ['abbrev', 'Abbrev', 'ADD · 신규 Layer 약어 (비우면 Layer 이름)'],
  ['purpose_no', 'Purpose_No', 'ADD · 신규 Purpose일 때 techPurposes 번호'],
  ['gds_layer', 'GDS_Layer', 'ADD · layermap stream 번호'],
  ['gds_datatype', 'GDS_Datatype', 'ADD · layermap datatype'],
  ['packet', 'Packet', '기존 packet 재사용 / CHANGE에서 공유 packet 직접 수정 시 현재 이름'],
  ['fill_color', 'Fill_Color', '색 이름 · #RRGGBB · R,G,B'],
  ['outline_color', 'Outline_Color', '비우면 Fill_Color와 같게'],
  ['stipple', 'Stipple', 'drDefineStipple 이름'],
  ['linestyle', 'LineStyle', 'drDefineLineStyle 이름'],
  ['fill_style', 'Fill_Style', 'outline / solid / X / stipple / outlineStipple …'],
  ['requester', 'Requester', '요청자'],
  ['reason', 'Reason', '요청 사유 / Site Request 원문 요약'],
];
const KEY_BY_HEADER = Object.fromEntries(COLUMNS.map(([k, h]) => [h.toLowerCase(), k]));

const TYPE_ALIASES = {
  ADD: 'ADD', '추가': 'ADD', NEW: 'ADD',
  CHANGE_DISPLAY: 'CHANGE_DISPLAY', CHANGE: 'CHANGE_DISPLAY', '변경': 'CHANGE_DISPLAY', DISPLAY: 'CHANGE_DISPLAY',
  RETIRE: 'RETIRE', DELETE: 'RETIRE', '삭제': 'RETIRE', '폐기': 'RETIRE',
};
export const normType = (t) => {
  const k = String(t || '').trim().toUpperCase().replace(/\s+/g, '_');
  return TYPE_ALIASES[k] || TYPE_ALIASES[String(t || '').trim()] || k;
};

/** 표(2차원 배열) → Request[] */
export function rowsToRequests(table) {
  const hdr = table.findIndex((r) => r.some((c) => String(c).trim().toLowerCase() === 'req_id'));
  if (hdr < 0) throw new Error('Req_ID 헤더 줄을 찾지 못했어요 — Techmap Request 양식인지 확인해 주세요');
  const headers = table[hdr].map((c) => String(c).trim().toLowerCase());
  const out = [];
  table.slice(hdr + 1).forEach((r, i) => {
    const f = {};
    headers.forEach((h, j) => {
      if (KEY_BY_HEADER[h]) f[KEY_BY_HEADER[h]] = String(r[j] ?? '').trim();
    });
    if (!Object.values(f).some(Boolean)) return;
    if ((f.req_id || '').startsWith('#')) return; // 설명 · 예시 줄
    const row = hdr + 2 + i;
    out.push({ id: f.req_id || `ROW${row}`, type: normType(f.type), row, f });
  });
  return out;
}

// ── xlsx
const decodeXml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
const colIndex = (ref) => {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(buf) {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const txt = (n) => (files[n] ? dec.decode(files[n]) : '');
  const shared = [...txt('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  // 'Request' 시트 → 없으면 첫 시트
  const wb = txt('xl/workbook.xml');
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: decodeXml(m[0].match(/name="([^"]*)"/)?.[1] || ''),
    rid: m[0].match(/r:id="([^"]*)"/)?.[1],
  }));
  const rels = Object.fromEntries([...txt('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/Id="([^"]*)"/)?.[1], m[0].match(/Target="([^"]*)"/)?.[1]]));
  const pick = sheets.find((s) => s.name === 'Request') || sheets[0];
  let target = pick && rels[pick.rid];
  if (!target) throw new Error('엑셀 시트를 찾지 못했어요');
  target = target.replace(/^\//, '');
  const path = target.startsWith('xl/') ? target : `xl/${target}`;
  const sheet = txt(path);
  const table = [];
  for (const rm of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rno = Number(rm[1].match(/\br="(\d+)"/)?.[1] || table.length + 1) - 1;
    const row = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const t = attrs.match(/\bt="([^"]*)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = textOf(body);
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null) {
        val = decodeXml(v);
        if (/^-?\d+\.0+$/.test(val)) val = val.replace(/\.0+$/, '');
      }
      row[ref ? colIndex(ref) : row.length] = val;
    }
    table[rno] = Array.from(row, (x) => x ?? '');
  }
  return Array.from(table, (r) => r || []);
}

// ── CSV (엑셀에서 CSV로 저장한 것도 받는다)
export function readCsv(text) {
  const s = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 파일 이름으로 형식을 고른다 */
export async function readRequestFile(name, buf) {
  if (/\.csv$/i.test(name)) return rowsToRequests(readCsv(new TextDecoder().decode(buf)));
  return rowsToRequests(await readXlsx(buf));
}
