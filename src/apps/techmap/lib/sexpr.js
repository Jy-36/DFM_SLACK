// SKILL(괄호) 구조를 줄 번호와 함께 읽는다. techfile(.tf)·drf 공통.
// 파일을 다시 쓰지 않고 "어디에 무엇이 있는지"만 알려 준다 → 원본 양식(정렬·주석·빈 줄) 유지.

/** 노드: { head, items, start, end }  — head: `techLayers(`의 이름, 맨 괄호면 null. start/end: 0부터 센 줄 */
export function parse(text) {
  const root = { head: '<root>', items: [], start: 0, end: 0 };
  const stack = [root];
  let pending = null; // 직전 atom (`name(` 호출 구분)
  let line = 0;
  const n = text.length;
  let i = 0;
  const flush = () => {
    if (pending) {
      stack[stack.length - 1].items.push(pending);
      pending = null;
    }
  };
  while (i < n) {
    const c = text[i];
    if (c === '\n') {
      flush();
      line++;
      i++;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      flush();
      i++;
    } else if (c === ';') {
      flush();
      while (i < n && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      flush();
      let j = text.indexOf('*/', i + 2);
      j = j < 0 ? n : j + 2;
      for (let k = i; k < j; k++) if (text[k] === '\n') line++;
      i = j;
    } else if (c === '"') {
      flush();
      let j = i + 1;
      while (j < n && text[j] !== '"') {
        if (text[j] === '\\') j++;
        j++;
      }
      pending = { atom: text.slice(i, j + 1), line };
      for (let k = i; k < j; k++) if (text[k] === '\n') line++;
      i = j + 1;
      flush();
    } else if (c === '(') {
      let head = null;
      // SKILL 호출: 이름 바로 뒤에 공백 없이 '('
      if (pending && i > 0 && !' \t\r\n'.includes(text[i - 1])) {
        head = pending.atom;
        pending = null;
      }
      flush();
      const node = { head, items: [], start: line, end: line };
      stack[stack.length - 1].items.push(node);
      stack.push(node);
      i++;
    } else if (c === ')') {
      flush();
      if (stack.length === 1) throw new Error(`${line + 1}번째 줄: 짝이 없는 ')'`);
      stack.pop().end = line;
      i++;
    } else if (c === "'") {
      flush();
      i++;
    } else {
      let j = i;
      while (j < n && !' \t\r\n();"'.includes(text[j])) j++;
      flush();
      pending = { atom: text.slice(i, j), line };
      i = j;
    }
  }
  flush();
  if (stack.length !== 1) throw new Error(`${stack[stack.length - 1].start + 1}번째 줄에서 연 '('가 닫히지 않음`);
  root.end = line;
  return root;
}

const isList = (x) => x && Array.isArray(x.items);
export const atomsOf = (node) => node.items.filter((x) => !isList(x)).map((x) => x.atom);
export const entriesOf = (node) => node.items.filter(isList);

/** head 이름이 name인 노드를 깊이 우선으로 모두 찾는다 */
export function findAll(node, name, out = []) {
  for (const it of node.items) {
    if (isList(it)) {
      if (it.head === name) out.push(it);
      findAll(it, name, out);
    }
  }
  return out;
}
