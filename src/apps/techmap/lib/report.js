// 결과 내보내기: 검토 리포트(CSV) · 수정 파일 묶음(zip) · 파일 저장
import { zip } from './zip.js';

const STATUS_LABEL = { READY: 'READY', NEEDS_REVIEW: '검토 필요', ERROR: 'ERROR' };
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** 요약 + 변경 줄을 한 CSV에 (엑셀에서 바로 열림) */
export function reviewCsv(batch, baseline, res) {
  const rows = [
    [`Techmap 검토 리포트`, batch.name, `기준 ${baseline.id} ${baseline.label}`, new Date().toLocaleString('ko-KR')],
    [],
    ['Req_ID', 'Type', 'LPP', '상태', '반영', 'Requester', 'Reason', '검사 결과'],
    ...res.items.map((it) => [it.id, it.type, it.lpp, STATUS_LABEL[it.status], it.included ? 'Y' : 'N', it.fields.requester, it.fields.reason, it.checks.map((c) => `[${c.level}] ${c.msg}`).join('\n')]),
    [],
    ['반영된 변경 줄'],
    ['Req_ID', '파일', '표', '동작', '원본 줄', '변경 전', '변경 후'],
  ];
  for (const it of res.items) {
    if (!it.included) continue;
    for (const c of it.changes) rows.push([it.id, res.names[c.file], c.where, c.action, c.line, c.before.trim(), c.text.trim()]);
  }
  return '﻿' + csv(rows);
}

/** 리비전 검토 리포트 CSV */
export function revisionCsv(rev, c) {
  return reviewCsv({ name: rev.folder }, { id: rev.ref?.label || '', label: '' }, c.res).replace('\r\n\r\n', `\r\n점검,${c.checks.length}건\r\n${c.checks.map((x) => [x.level, x.scope, x.msg].map(csvCell).join(',')).join('\r\n')}\r\n\r\n`);
}

/** 폴더 항목 [{path, data}] → zip (설치형에서는 같은 구조로 VWP 폴더에 바로 쓴다) */
export const folderZip = (entries) => zip(entries.map((e) => ({ name: e.path, data: e.data })));

export function bundleZip(batch, baseline, res) {
  const folder = `techmap_${batch.id}`;
  return zip([
    { name: `${folder}/${res.names.tf}`, data: res.files.tf },
    { name: `${folder}/${res.names.layermap}`, data: res.files.layermap },
    { name: `${folder}/${res.names.drf}`, data: res.files.drf },
    { name: `${folder}/review_report.csv`, data: reviewCsv(batch, baseline, res) },
    { name: `${folder}/changes.diff`, data: ['tf', 'layermap', 'drf'].map((k) => res.diffs[k]).join('') },
  ]);
}

/** 브라우저 다운로드 (설치형도 WebView2가 다운로드 폴더에 저장) — MTO CSV 저장과 같은 방식 */
export function saveFile(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
