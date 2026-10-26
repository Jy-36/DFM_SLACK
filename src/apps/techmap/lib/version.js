// DK Ver · 작업 폴더 이름.
// Ver 예: v1.0.0.0 · v1.0.0.0_exp_20261020 · v1.0.0.0_exp20261020 · v1.0.0.0_incr20261101 · 그 밖의 꼬리표
// 원문은 그대로 보존하고, 기본 번호 · 종류 · 날짜만 뽑아 정렬 · 필터에 쓴다.
// 작업 폴더: <DK>_<Ver>_<작업날짜 YYYYMMDD>[_n]  (같은 날 같은 Ver 작업이 또 있으면 _2, _3)

export function parseVer(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^v(\d+(?:\.\d+){0,3})(?:_?([A-Za-z]+)_?(\d{8})?)?(.*)$/);
  if (!m) return { raw: s, valid: false, error: 'v + 숫자(예: v1.0.0.0)로 시작해야 해요' };
  const parts = m[1].split('.').map(Number);
  while (parts.length < 4) parts.push(0);
  const tag = (m[2] || '').toLowerCase();
  const kind = !tag ? 'release' : tag === 'exp' ? 'exp' : tag === 'incr' ? 'incr' : 'other';
  return { raw: s, valid: !m[4] || /^[_\-.A-Za-z0-9]*$/.test(m[4]), base: parts.join('.'), parts, kind, tag, date: m[3] || '', rest: m[4] || '' };
}

export const KIND_LABEL = { release: '정식', exp: 'exp', incr: 'incr', other: '기타' };

/** 정렬: 기본 번호 → 정식 먼저 → 날짜 */
export function compareVer(a, b) {
  const A = parseVer(a);
  const B = parseVer(b);
  for (let i = 0; i < 4; i++) if ((A.parts?.[i] ?? 0) !== (B.parts?.[i] ?? 0)) return (A.parts?.[i] ?? 0) - (B.parts?.[i] ?? 0);
  const rank = { release: 0, exp: 1, incr: 2, other: 3 };
  if (A.kind !== B.kind) return rank[A.kind] - rank[B.kind];
  return (A.date || A.raw).localeCompare(B.date || B.raw);
}

export const today8 = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/** 작업 폴더 이름 (taken: 이미 있는 폴더 이름들) */
export function folderName(dk, ver, workDate, taken = []) {
  const base = `${dk}_${ver}_${workDate}`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}
