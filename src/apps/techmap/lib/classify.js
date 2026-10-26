// Layer 분류 · 기능키.
// 분류: Option(Metal/Via Stack) 자동 구성에 쓴다.  FEOL · METAL n · VIA n(Metal n과 n+1 사이) · TOP · MARKER
// 기능키: Process마다 이름이 달라도 "목적이 같은 Layer"를 묶는 이름. Master끼리 GDS 번호를 맞출 때 기준.
//   METAL n → METAL1 …, VIA n → VIA1 …, 그 밖은 Layer 이름 대문자. 다르면 Process별로 직접 지정(override).

export const CLASSES = ['FEOL', 'METAL', 'VIA', 'TOP', 'MARKER'];
export const CLASS_LABEL = { FEOL: 'FEOL 공통', METAL: 'Metal', VIA: 'Via', TOP: 'Top · RDL', MARKER: 'Marker' };

const TOP_NAMES = /^(AP|RDL|PAD|UBM|CB|PI|PASS|BUMP|TV|LB)\d*$/i;
const MARKER_NAMES = /^(text|prboundary|boundary|dmexcl|.*mark.*|.*excl.*|.*dummy.*|.*blk.*|.*_id|.*text)$/i;

/** 이름으로 분류 추정 */
export function guessClass(layer) {
  let m = layer.match(/^(?:M|ME|MET|METAL)(\d+)$/i);
  if (m) return { cls: 'METAL', level: Number(m[1]) };
  m = layer.match(/^(?:VIA|VI|V)(\d+)$/i);
  if (m) return { cls: 'VIA', level: Number(m[1]) };
  if (TOP_NAMES.test(layer)) return { cls: 'TOP', level: null };
  if (MARKER_NAMES.test(layer)) return { cls: 'MARKER', level: null };
  return { cls: 'FEOL', level: null };
}

export const autoKey = (layer, c) => (c.cls === 'METAL' || c.cls === 'VIA' ? `${c.cls}${c.level}` : layer.toUpperCase());

/** overrides: { [layer]: { cls?, level?, key? } } → { cls, level, key, auto } */
export function classOf(layer, overrides = {}) {
  const g = guessClass(layer);
  const o = overrides[layer] || {};
  const cls = o.cls || g.cls;
  const level = o.level != null && o.level !== '' ? Number(o.level) : cls === g.cls ? g.level : null;
  const c = { cls, level };
  return { ...c, key: o.key || autoKey(layer, c), auto: !o.cls && !o.key && o.level == null };
}

export const lppFnKey = (layer, purpose, overrides) => `${classOf(layer, overrides).key}:${purpose}`;
