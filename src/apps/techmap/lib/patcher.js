// 줄 단위 패치: 파일을 다시 만들지 않는다.
// 새 행은 이웃 행의 컬럼 위치를 복제하고, 바뀐 행은 컬럼 위치를 유지하고, 폐기 행은 지우지 않고 주석 처리한다.

const TOK = /\(|\)|"[^"]*"|[^\s()]+/g;
const eolOf = (s) => (s.endsWith('\r\n') ? '\r\n' : s.endsWith('\n') ? '\n' : '');
export const bare = (s) => s.replace(/\r?\n$/, '');

function splitComment(line, cchar) {
  const body = bare(line);
  const i = body.indexOf(cchar);
  return i < 0 ? body : body.slice(0, i).trimEnd();
}

/** tokens를 template 줄의 컬럼 배치대로 쓴다 (줄 끝 없음).
 *  "  ( OD          1      OD   )" + [M9, 29, M9] → "  ( M9          29     M9   )" */
export function formatLike(template, tokens, cchar = ';', comment = '') {
  const code = splitComment(template, cchar);
  const parts = [...code.matchAll(TOK)].map((m) => [m.index, m[0]]);
  const indent = code.match(/^\s*/)[0];
  const hasParen = parts.length > 0 && parts[0][1] === '(';
  const atomCols = parts.filter(([, t]) => t !== '(' && t !== ')').map(([p]) => p);
  const closeCol = [...parts].reverse().find(([, t]) => t === ')')?.[0] ?? null;
  const openCol = hasParen ? parts[0][0] : null;
  const spaceAfterOpen = hasParen && atomCols.length > 0 && atomCols[0] > openCol + 1;
  const spaceBeforeClose = closeCol != null && closeCol > 0 && code[closeCol - 1] === ' ';

  let out = hasParen ? code.slice(0, openCol) + '(' : indent;
  tokens.forEach((tok, i) => {
    const minGap = i === 0 ? (hasParen ? (spaceAfterOpen ? 1 : 0) : 0) : 1;
    const col = i < atomCols.length ? atomCols[i] : null;
    const gap = col != null ? Math.max(col - out.length, minGap) : minGap;
    out += ' '.repeat(gap) + tok;
  });
  if (hasParen) {
    const minGap = spaceBeforeClose ? 1 : 0;
    const aligned = closeCol != null && tokens.length === atomCols.length;
    const gap = aligned ? Math.max(closeCol - out.length, minGap) : minGap;
    out += ' '.repeat(gap) + ')';
  }
  if (comment) out += `  ${cchar} ${comment}`;
  return out.trimEnd();
}

/** 한 파일에 대한 수정 모음 → apply()로 한 번에 반영 */
export class Patch {
  constructor(lines, cchar) {
    this.lines = lines;
    this.cchar = cchar;
    this.ops = new Map(); // idx -> { replace, after: [] }
    const crlf = lines.filter((l) => l.endsWith('\r\n')).length;
    this.eol = crlf > lines.length / 2 ? '\r\n' : '\n';
  }
  op(idx) {
    if (!this.ops.has(idx)) this.ops.set(idx, { replace: null, remove: false, after: [] });
    return this.ops.get(idx);
  }
  insertAfter(idx, text) {
    this.op(idx).after.push(bare(text));
  }
  replace(idx, text) {
    this.op(idx).replace = bare(text);
  }
  /** 줄 지우기 (Option 파일 만들 때 · 빠지는 Layer 행) */
  remove(idx) {
    this.op(idx).remove = true;
  }
  commentOut(start, end, tag) {
    for (let i = start; i <= end; i++) {
      const src = bare(this.lines[i]);
      const lead = src.match(/^\s*/)[0];
      const note = i === start && tag ? `  ${this.cchar} ${tag}` : '';
      this.replace(i, `${lead}${this.cchar}${src.slice(lead.length)}${note}`);
    }
  }
  current(idx) {
    const op = this.ops.get(idx);
    return op && op.replace != null ? op.replace : bare(this.lines[idx]);
  }
  /** 수정된 줄 배열 (줄 끝 포함) */
  apply() {
    const out = [];
    this.lines.forEach((ln, i) => {
      const op = this.ops.get(i);
      if (!op) return out.push(ln);
      const eol = eolOf(ln) || this.eol;
      if (!op.remove) out.push((op.replace != null ? op.replace : bare(ln)) + eol);
      for (const a of op.after) out.push(a + this.eol);
    });
    // 마지막 줄에 줄 끝이 없던 파일 뒤에 줄을 붙였으면 원래 모양을 지킨다
    return out;
  }
  /** 원본 대비 unified diff (패치 기록에서 바로 만든다) */
  diff(name, context = 2) {
    if (!this.ops.size) return '';
    const seq = []; // { t: ' '|'-'|'+', s, a (orig no), b (new no) }
    let b = 0;
    this.lines.forEach((ln, i) => {
      const op = this.ops.get(i);
      if (!op || (op.replace == null && !op.remove)) seq.push({ t: ' ', s: bare(ln), a: i + 1, b: ++b });
      else if (op.remove) seq.push({ t: '-', s: bare(ln), a: i + 1, b: null });
      else {
        seq.push({ t: '-', s: bare(ln), a: i + 1, b: null });
        seq.push({ t: '+', s: op.replace, a: null, b: ++b });
      }
      for (const x of op?.after || []) seq.push({ t: '+', s: x, a: null, b: ++b });
    });
    const changed = seq.map((x, i) => (x.t !== ' ' ? i : -1)).filter((i) => i >= 0);
    const hunks = [];
    for (const i of changed) {
      const lo = Math.max(0, i - context);
      const hi = Math.min(seq.length - 1, i + context);
      const last = hunks[hunks.length - 1];
      if (last && lo <= last.hi + 1) last.hi = Math.max(last.hi, hi);
      else hunks.push({ lo, hi });
    }
    const out = [`--- a/${name}`, `+++ b/${name}`];
    for (const h of hunks) {
      const part = seq.slice(h.lo, h.hi + 1);
      const aLines = part.filter((x) => x.t !== '+');
      const bLines = part.filter((x) => x.t !== '-');
      const aStart = aLines[0]?.a ?? (seq.slice(0, h.lo).filter((x) => x.a).pop()?.a ?? 0);
      const bStart = bLines[0]?.b ?? 0;
      out.push(`@@ -${aStart},${aLines.length} +${bStart},${bLines.length} @@`);
      for (const x of part) out.push(x.t + x.s);
    }
    return out.join('\n') + '\n';
  }
}
