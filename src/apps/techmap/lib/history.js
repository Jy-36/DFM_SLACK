// DK history txt 양식 (제안). 리비전마다 블록 하나를 기존 history 뒤에 붙인다 — 위에서 아래로 시간순.
//
// ========================================================================
// [SF3_DK v1.0.0.0_exp_20261020]  작업 20261026  (폴더 SF3_DK_v1.0.0.0_exp_20261020_20261026)
// Reference : SF3_DK_v1.0.0.0_20261012
// 승인      : 2026-10-26 14:02
// ------------------------------------------------------------------------
// ADD      REQ-001  VIA10/drawing          GDS 30/0         Site-A  신규 VIA10
// HIDE     REQ-004  prBoundary/drawing                      Site-B  사용자 선택 막기
// OPTION   REQ-007  1P9M_6X1Z  - PAD                        Site-C
// Option   1P9M_6X1Z  Metal 9 · Via 8 · 48 Layer
// ========================================================================

const LINE = '='.repeat(72);
const pad = (s, n) => String(s ?? '').padEnd(n);

export function historyBlock(rev, res, options, applied) {
  const head = rev.kind === 'dk' ? `[${rev.dk} ${rev.ver}]` : `[${rev.process} MASTER]`;
  const lines = [
    LINE,
    `${head}  작업 ${rev.workDate}  (폴더 ${rev.folder})`,
    `Reference : ${rev.ref?.label || '-'}`,
    ...(rev.merges || []).map((m) => `Merge     : ${m.label} (요청 ${m.count}건)`),
    `승인      : ${rev.approvedAt || '(미승인 · 작업중)'}`,
    '-'.repeat(72),
  ];
  const done = res.items.filter((i) => i.included);
  if (!done.length) lines.push('(반영한 요청 없음)');
  for (const it of done) {
    const f = it.fields || {};
    if (it.optionOp) {
      lines.push(`${pad('OPTION', 8)} ${pad(it.id, 8)} ${pad(it.optionOp.option, 12)} ${it.optionOp.op === 'add' ? '+' : '-'} ${pad(it.optionOp.layer, 20)} ${pad(f.requester, 8)} ${f.reason || ''}`.trimEnd());
      continue;
    }
    const gds = it.type === 'ADD' ? (it.changes.find((c) => c.file === 'layermap')?.text.trim().split(/\s+/).slice(2, 4).join('/') || '') : '';
    lines.push(`${pad(it.type === 'CHANGE_DISPLAY' ? 'DISPLAY' : it.type, 8)} ${pad(it.id, 8)} ${pad(it.lpp, 22)} ${pad(gds ? `GDS ${gds}` : '', 16)} ${pad(f.requester, 8)} ${f.reason || ''}${f.merged_from ? `  ← ${f.merged_from}` : ''}`.trimEnd());
  }
  for (const o of options || []) lines.push(`Option   ${pad(o.def.name, 12)} Metal ${o.def.metals} · Via ${o.check.vias} · ${o.check.count} Layer${o.def.plus.length ? ` · +${o.def.plus.join(',')}` : ''}${o.def.minus.length ? ` · -${o.def.minus.join(',')}` : ''}`);
  lines.push(LINE, '');
  return lines.join('\n') + '\n';
}
