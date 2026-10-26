// Request → 검토 결과 + 수정된 파일. 결정적(같은 입력 → 같은 결과).
// 각 Request마다 1) 유형별 검사 2) 상태 READY | NEEDS_REVIEW | ERROR 3) (반영 대상만) 줄 수정 기록.
// include: 반영할 Req_ID 목록. 없으면 READY만 반영하고, NEEDS_REVIEW는 사람이 체크해야 반영된다. ERROR는 반영 안 함.
// 엑셀 순서대로 처리하며 앞 Request의 반영 결과를 이어 받아, 같은 엑셀 안에서 번호가 겹쳐도 잡아낸다.
import { RESERVED_ABBR, lppKey } from './model.js';
import { Patch, formatLike } from './patcher.js';

export const READY = 'READY';
export const REVIEW = 'NEEDS_REVIEW';
export const ERROR = 'ERROR';

export const DEFAULT_OPTIONS = {
  tagChanges: true, // 바꾼 줄 끝에 ; REQ-ID
  retireLayermap: 'keep', // keep | comment
  splitSharedPacket: true, // 공유 packet을 바꾸면 전용 packet을 새로 만든다
};

const toInt = (v) => (/^-?\d+$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : null);
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');

export function parseRgb(value) {
  const v = String(value || '').trim();
  let m = v.match(/^#?([0-9a-fA-F]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})$/);
  if (m) {
    const t = m.slice(1).map(Number);
    if (t.every((x) => x <= 255)) return t;
  }
  return null;
}

const mostCommon = (arr) => {
  const c = new Map();
  for (const x of arr) c.set(x, (c.get(x) || 0) + 1);
  let best = null;
  for (const [k, n] of c) if (best == null || n > c.get(best)) best = k;
  return best;
};

class State {
  constructor(ts) {
    const { tf, lm, drf } = ts;
    this.layers = new Map([...tf.layerByName()].map(([k, r]) => [k, r.tokens[1] || '']));
    this.layerNums = tf.layerNumbers();
    this.purposes = tf.purposeNames();
    this.purposeAbbr = new Map(Object.entries(RESERVED_ABBR));
    for (const r of tf.purposes?.rows || []) if (r.tokens.length) this.purposeAbbr.set(r.tokens[0], r.tokens[2] || r.tokens[0]);
    this.purposeNums = new Set((tf.purposes?.rows || []).filter((r) => r.tokens.length > 1).map((r) => r.tokens[1]));
    this.lpps = new Set([...tf.priorityRows().keys(), ...tf.displayRows().keys()]);
    this.displayPacket = new Map([...tf.displayRows()].map(([k, r]) => [k, r.tokens[2]]));
    this.streams = new Map(lm.rows.map((r) => [`${r.stream}/${r.datatype}`, `${r.layer}/${r.purpose}`]));
    this.colors = new Map();
    for (const [n, r] of drf.colorRows()) {
      const v = r.tokens.slice(2, 5).map(Number);
      if (v.every((x) => Number.isInteger(x))) this.colors.set(n, v);
    }
    this.packets = new Map([...drf.packetRows()].map(([k, r]) => [k, [...r.tokens]]));
    this.stipples = drf.stippleNames();
    this.linestyles = drf.linestyleNames();
    this.retired = new Set();
  }
  colorFor(rgb) {
    for (const [n, v] of this.colors) if (v.join() === rgb.join()) return n;
    return null;
  }
  packetUsers(packet) {
    return [...this.displayPacket].filter(([k, p]) => p === packet && !this.retired.has(k)).map(([k]) => k);
  }
}

const PATTERNS = ['{L}{P}', '{L}_{P}', '{L}_{A}', '{L}{A}', '{L}'];
const fmtPat = (pat, L, P, A) => pat.replace('{L}', L).replace('{P}', P).replace('{A}', A);

function packetPattern(st) {
  const votes = new Map();
  for (const [k, packet] of st.displayPacket) {
    const [layer, purpose] = k.split('/');
    const ab = st.purposeAbbr.get(purpose) || purpose.slice(0, 3);
    for (const pat of PATTERNS) if (fmtPat(pat, layer, purpose, ab) === packet) votes.set(pat, (votes.get(pat) || 0) + 1);
  }
  let best = null;
  for (const [p, n] of votes) if (!best || n > votes.get(best)) best = p;
  return best || '{L}_{P}';
}

/** 엑셀 한 행 → Request { id, type, row, f: {key: value} } (requests.js에서 만든다) */
const get = (req, k) => String(req.f[k] ?? '').trim();

class Item {
  constructor(req) {
    this.req = req;
    this.status = READY;
    this.checks = [];
    this.changes = [];
    this.included = false;
  }
  add(level, msg) {
    this.checks.push({ level, msg });
    if (level === 'error') this.status = ERROR;
    else if (level === 'review' && this.status !== ERROR) this.status = REVIEW;
  }
  get lpp() {
    return `${get(this.req, 'layer')}/${get(this.req, 'purpose') || '*'}`;
  }
}

export function plan(ts, requests, include = null, options = {}) {
  return new Planner(ts, { ...DEFAULT_OPTIONS, ...options }).run(requests, include ? new Set(include) : null);
}

class Planner {
  constructor(ts, opts) {
    this.ts = ts;
    this.opts = opts;
  }

  run(requests, include) {
    const ts = this.ts;
    this.st = new State(ts);
    this.pattern = packetPattern(this.st);
    this.displayName = ts.drf.colors?.rows[0]?.tokens[0] || 'display';
    this.p = { tf: new Patch(ts.tf.lines, ';'), layermap: new Patch(ts.lm.lines, '#'), drf: new Patch(ts.drf.lines, ';') };
    const items = [];
    const seen = new Set();
    for (const req of requests) {
      const it = new Item(req);
      if (seen.has(req.id)) it.add('error', `Req_ID 중복: ${req.id}`);
      seen.add(req.id);
      if (!get(req, 'layer')) it.add('error', 'Layer 값이 비어 있음');
      const fn = { ADD: this.add, CHANGE_DISPLAY: this.change, RETIRE: this.retire }[req.type];
      if (!fn) it.add('error', `알 수 없는 Type '${req.type}' (ADD / CHANGE_DISPLAY / RETIRE)`);
      if (it.status === ERROR) {
        items.push(it);
        continue;
      }
      fn.call(this, it, false); // 미리보기: 상태와 바뀔 줄만
      if (it.status !== ERROR) {
        const want = include ? include.has(req.id) : it.status === READY;
        if (want) {
          it.changes = [];
          it.checks = [];
          it.status = READY;
          fn.call(this, it, true);
          it.included = it.status !== ERROR;
        }
      }
      items.push(it);
    }
    const names = { tf: ts.tf.name, layermap: ts.lm.name, drf: ts.drf.name };
    const files = {};
    const diffs = {};
    for (const k of Object.keys(this.p)) {
      files[k] = this.p[k].apply().join('');
      diffs[k] = this.p[k].diff(names[k]);
    }
    return {
      items: items.map((it) => ({ id: it.req.id, type: it.req.type, row: it.req.row, fields: it.req.f, lpp: it.lpp, status: it.status, included: it.included, checks: it.checks, changes: it.changes })),
      files,
      diffs,
      names,
    };
  }

  tag(it) {
    return this.opts.tagChanges ? it.req.id : '';
  }

  emit(it, apply, file, action, idx, text, before = '', where = '') {
    it.changes.push({ file, action, line: idx + 1, text, before, where });
    if (!apply) return;
    if (action === 'add') this.p[file].insertAfter(idx, text);
    else this.p[file].replace(idx, text);
  }

  emitComment(it, apply, file, start, end, tag, before, where) {
    const p = this.p[file];
    const src = p.lines[start].replace(/\r?\n$/, '');
    const lead = src.match(/^\s*/)[0];
    it.changes.push({ file, action: 'retire', line: start + 1, text: `${lead}${p.cchar}${src.slice(lead.length)}  ${p.cchar} ${tag}`, before: before.replace(/\r?\n$/, ''), where });
    if (apply) p.commentOut(start, end, tag);
  }

  resolveColor(it, value, apply, label) {
    const st = this.st;
    if (st.colors.has(value)) return value;
    const rgb = parseRgb(value);
    if (!rgb) {
      it.add('error', `${label} '${value}' — drDefineColor에 없는 이름이고 #RRGGBB/R,G,B 형식도 아님 (Not Found)`);
      return null;
    }
    const found = st.colorFor(rgb);
    if (found) {
      it.add('info', `${label} ${value} → 기존 color '${found}' 재사용`);
      return found;
    }
    const name = 'c' + rgb.map(hex2).join('');
    const drf = this.ts.drf;
    if (!drf.colors?.rows.length) {
      it.add('error', 'drf에 drDefineColor 테이블이 없어 색을 추가할 수 없음');
      return null;
    }
    const tmpl = drf.colors.rows[drf.colors.rows.length - 1];
    this.emit(it, apply, 'drf', 'add', drf.colors.lastRowLine, formatLike(drf.lines[tmpl.start], [this.displayName, name, ...rgb.map(String)], ';', this.tag(it)), '', 'drDefineColor');
    if (apply) st.colors.set(name, rgb);
    it.add('info', `신규 color '${name}' (${rgb.join(', ')}) 추가`);
    return name;
  }

  packetTokens(it, name, base, apply) {
    const st = this.st;
    const r = it.req;
    const all = [...st.packets.values()];
    const stipple = get(r, 'stipple') || (base ? base[2] : mostCommon(all.map((p) => p[2])) || 'solid');
    const linestyle = get(r, 'linestyle') || (base ? base[3] : st.linestyles.has('solid') ? 'solid' : mostCommon(all.map((p) => p[3])) || 'solid');
    if (get(r, 'stipple') && !st.stipples.has(stipple)) {
      it.add('error', `Stipple '${stipple}'이 drDefineStipple에 없음 (Not Found)`);
      return null;
    }
    if (get(r, 'linestyle') && !st.linestyles.has(linestyle)) {
      it.add('error', `LineStyle '${linestyle}'이 drDefineLineStyle에 없음 (Not Found)`);
      return null;
    }
    const fill = get(r, 'fill_color');
    const outline = get(r, 'outline_color');
    const fillN = fill ? this.resolveColor(it, fill, apply, 'Fill_Color') : base ? base[4] : null;
    if (fill && fillN == null) return null;
    let outlineN;
    if (outline) outlineN = this.resolveColor(it, outline, apply, 'Outline_Color');
    else if (base && (!fill || base[4] !== base[5])) outlineN = base[5];
    else outlineN = fillN;
    if (outline && outlineN == null) return null;
    if (fillN == null) {
      it.add('error', 'Fill_Color 또는 기존 Packet 지정이 필요함');
      return null;
    }
    const toks = [this.displayName, name, stipple, linestyle, fillN, outlineN];
    let fs = get(r, 'fill_style') || (base && base.length > 6 ? base[6] : '');
    if (!fs && !base) {
      fs = mostCommon(all.filter((p) => p.length > 6).map((p) => p[6])) || '';
      if (fs) it.add('info', `Fill_Style 미지정 → 가장 많이 쓰는 '${fs}' 적용`);
    }
    if (fs) toks.push(fs);
    if (!get(r, 'stipple') && !base) it.add('info', `Stipple 미지정 → 가장 많이 쓰는 '${stipple}' 적용`);
    return toks;
  }

  /** 같은 Layer의 마지막 행, 없으면 번호가 바로 아래인 Layer의 마지막 행 */
  neighbour(rows, layer) {
    const same = rows.filter((x) => x.tokens[0] === layer);
    if (same.length) return [same[same.length - 1], true];
    const num = toInt(this.st.layers.get(layer));
    let best = null;
    let bestNum = null;
    if (num != null) {
      for (const x of rows) {
        const n = toInt(this.st.layers.get(x.tokens[0]));
        if (n != null && n < num && (bestNum == null || n >= bestNum)) {
          best = x;
          bestNum = n;
        }
      }
    }
    return [best || rows[rows.length - 1], false];
  }

  newPacketName(layer, purpose) {
    const ab = this.st.purposeAbbr.get(purpose) || purpose.slice(0, 3);
    const base = fmtPat(this.pattern, layer, purpose, ab);
    let name = base;
    let n = 2;
    while (this.st.packets.has(name)) name = `${base}_${n++}`;
    return name;
  }

  // ───────────────────────────────────────────── ADD
  add(it, apply) {
    const { tf, lm, drf } = this.ts;
    const st = this.st;
    const r = it.req;
    const layer = get(r, 'layer');
    const purpose = get(r, 'purpose');
    if (!purpose) return it.add('error', 'ADD에는 Purpose가 필요함');
    if (st.lpps.has(lppKey(layer, purpose))) return it.add('error', `${layer}/${purpose}는 이미 techfile에 있음 — 표시 변경이면 CHANGE_DISPLAY 사용`);

    // 1) techLayers
    if (!st.layers.has(layer)) {
      const num = get(r, 'layer_no');
      if (toInt(num) == null) return it.add('error', `신규 Layer '${layer}' — Layer_No(정수)가 필요함`);
      if (st.layerNums.has(num)) return it.add('error', `Layer_No ${num}은 이미 '${st.layerNums.get(num)}'가 사용 중`);
      const abbrev = get(r, 'abbrev') || layer;
      if (!get(r, 'abbrev')) it.add('info', `Abbrev 미지정 → '${layer}' 사용`);
      const rows = tf.layers?.rows || [];
      if (!rows.length) return it.add('error', 'techfile에 techLayers 테이블이 없음');
      const lower = rows.filter((x) => toInt(x.tokens[1]) != null && toInt(x.tokens[1]) < toInt(num));
      const anchor = lower.length ? lower.reduce((a, b) => (toInt(b.tokens[1]) > toInt(a.tokens[1]) ? b : a)) : rows[rows.length - 1];
      this.emit(it, apply, 'tf', 'add', anchor.end, formatLike(tf.lines[anchor.start], [layer, num, abbrev], ';', this.tag(it)), '', 'techLayers');
      if (apply) {
        st.layers.set(layer, num);
        st.layerNums.set(num, layer);
      }
    } else if (get(r, 'layer_no') && st.layers.get(layer) && get(r, 'layer_no') !== st.layers.get(layer)) {
      it.add('review', `Layer '${layer}'는 이미 번호 ${st.layers.get(layer)}로 있음 — 요청 Layer_No ${get(r, 'layer_no')}는 무시`);
    }

    // 2) techPurposes
    if (!st.purposes.has(purpose)) {
      const pnum = get(r, 'purpose_no');
      if (toInt(pnum) == null) return it.add('error', `Purpose '${purpose}'가 techPurposes에 없음 — Purpose_No가 필요함 (Not Found)`);
      if (st.purposeNums.has(pnum)) return it.add('error', `Purpose_No ${pnum}은 이미 사용 중`);
      if (!tf.purposes?.rows.length) return it.add('error', 'techfile에 techPurposes 테이블이 없음');
      const last = tf.purposes.rows[tf.purposes.rows.length - 1];
      this.emit(it, apply, 'tf', 'add', last.end, formatLike(tf.lines[last.start], [purpose, pnum, purpose.slice(0, 3)], ';', this.tag(it)), '', 'techPurposes');
      it.add('review', `신규 Purpose '${purpose}' (${pnum}) 추가 — Purpose 번호 체계 확인 필요`);
      if (apply) {
        st.purposes.add(purpose);
        st.purposeNums.add(pnum);
        st.purposeAbbr.set(purpose, purpose.slice(0, 3));
      }
    }

    // 3) techLayerPurposePriorities
    if (!tf.priorities?.rows.length) return it.add('error', 'techfile에 techLayerPurposePriorities 테이블이 없음');
    {
      const [anchor, same] = this.neighbour(tf.priorities.rows, layer);
      this.emit(it, apply, 'tf', 'add', anchor.end, formatLike(tf.lines[anchor.start], [layer, purpose], ';', this.tag(it)), '', 'techLayerPurposePriorities');
      if (!same) it.add('info', `priority는 '${anchor.tokens[0]}' 다음에 배치 (Layer 번호 순) — 표시 우선순위 확인`);
    }

    // 4) drf packet + techDisplays
    let packet = get(r, 'packet');
    if (packet && st.packets.has(packet) && !(get(r, 'fill_color') || get(r, 'stipple'))) {
      it.add('info', `기존 packet '${packet}' 재사용 (현재 ${st.packetUsers(packet).length}개 LPP가 사용)`);
    } else {
      packet = packet || this.newPacketName(layer, purpose);
      if (st.packets.has(packet)) return it.add('error', `Packet '${packet}'이 이미 있음 — 재사용하려면 색/패턴 칸을 비워 주세요`);
      const toks = this.packetTokens(it, packet, null, apply);
      if (!toks) return undefined;
      if (!drf.packets?.rows.length) return it.add('error', 'drf에 drDefinePacket 테이블이 없음');
      const last = drf.packets.rows[drf.packets.rows.length - 1];
      this.emit(it, apply, 'drf', 'add', drf.packets.lastRowLine, formatLike(drf.lines[last.start], toks, ';', this.tag(it)), '', 'drDefinePacket');
      if (apply) st.packets.set(packet, toks);
    }
    if (!tf.displays?.rows.length) return it.add('error', 'techfile에 techDisplays 테이블이 없음');
    {
      const [anchor] = this.neighbour(tf.displays.rows, layer);
      const flags = anchor.tokens.length > 3 ? anchor.tokens.slice(3) : ['t', 't', 't', 't', 't'];
      this.emit(it, apply, 'tf', 'add', anchor.end, formatLike(tf.lines[anchor.start], [layer, purpose, packet, ...flags], ';', this.tag(it)), '', 'techDisplays');
      if (apply) {
        st.lpps.add(lppKey(layer, purpose));
        st.displayPacket.set(lppKey(layer, purpose), packet);
      }
    }

    // 5) layermap
    const g = get(r, 'gds_layer');
    let d = get(r, 'gds_datatype');
    if (!g) return it.add('review', 'GDS_Layer 미지정 — layermap 행을 만들지 않음 (Not Found, 수동 입력 필요)');
    if (toInt(g) == null || (d && toInt(d) == null)) return it.add('error', `GDS 번호가 정수가 아님: ${g}/${d}`);
    if (!d) {
      d = '0';
      it.add('review', 'GDS_Datatype 미지정 → 0으로 가정');
    }
    const sk = `${g}/${d}`;
    if (st.streams.has(sk)) return it.add('error', `GDS ${sk}는 이미 ${st.streams.get(sk)}가 사용 중 (stream 충돌)`);
    if (toInt(g) > 65535 || toInt(d) > 65535) it.add('review', 'GDS 번호가 0~65535 범위를 벗어남 [VERIFY]');
    const rows = lm.rows;
    if (!rows.length) return it.add('error', 'layermap에 유효한 행이 없음');
    const same = rows.filter((x) => x.layer === layer);
    let anchor;
    if (same.length) anchor = same[same.length - 1];
    else {
      const lower = rows.filter((x) => toInt(x.stream) != null && toInt(x.stream) <= toInt(g));
      const key = (x) => toInt(x.stream) * 100000 + (toInt(x.datatype) || 0);
      anchor = lower.length ? lower.reduce((a, b) => (key(b) > key(a) ? b : a)) : rows[rows.length - 1];
    }
    this.emit(it, apply, 'layermap', 'add', anchor.line, formatLike(lm.lines[anchor.line], [layer, purpose, g, d], '#', this.tag(it)), '', 'layermap');
    if (apply) st.streams.set(sk, `${layer}/${purpose}`);
    return undefined;
  }

  // ───────────────────────────────────── CHANGE_DISPLAY
  change(it, apply) {
    const { tf, drf } = this.ts;
    const st = this.st;
    const r = it.req;
    const layer = get(r, 'layer');
    const purpose = get(r, 'purpose');
    const key = lppKey(layer, purpose);
    if (!purpose) return it.add('error', 'CHANGE_DISPLAY에는 Purpose가 필요함');
    const disp = tf.displayRows().get(key);
    if (!disp || st.retired.has(key)) return it.add('error', `${key}가 techDisplays에 없음 (Not Found)`);
    if (!['fill_color', 'outline_color', 'stipple', 'linestyle', 'fill_style'].some((k) => get(r, k))) return it.add('error', '바꿀 항목(Fill/Outline/Stipple/LineStyle/Fill_Style)이 하나도 없음');
    const cur = st.displayPacket.get(key);
    const base = st.packets.get(cur);
    const prow = drf.packetRows().get(cur);
    if (!base) return it.add('error', `현재 packet '${cur}'이 drf에 없음 (Not Found)`);
    const others = st.packetUsers(cur).filter((k) => k !== key);
    const modifyShared = get(r, 'packet') === cur;

    if (others.length && this.opts.splitSharedPacket && !modifyShared) {
      const newName = this.newPacketName(layer, purpose);
      const toks = this.packetTokens(it, newName, base, apply);
      if (!toks) return undefined;
      this.emit(it, apply, 'drf', 'add', drf.packets.lastRowLine, formatLike(drf.lines[drf.packets.rows[drf.packets.rows.length - 1].start], toks, ';', this.tag(it)), '', 'drDefinePacket');
      const nd = [...disp.tokens];
      nd[2] = newName;
      this.emit(it, apply, 'tf', 'modify', disp.start, formatLike(tf.lines[disp.start], nd, ';', this.tag(it)), this.p.tf.current(disp.start), 'techDisplays');
      it.add('review', `packet '${cur}'을 ${others.join(', ')}도 사용 중 → 전용 packet '${newName}'을 만들어 연결. 공유 packet을 직접 바꾸려면 Packet 칸에 '${cur}' 입력`);
      if (apply) {
        st.packets.set(newName, toks);
        st.displayPacket.set(key, newName);
      }
      return undefined;
    }

    const toks = this.packetTokens(it, cur, base, apply);
    if (!toks) return undefined;
    if (toks.join(' ') === base.join(' ')) return it.add('error', '요청 값이 현재 packet과 동일 — 변경 사항 없음');
    if (others.length) it.add('review', `공유 packet '${cur}' 직접 수정 → ${others.join(', ')} 표시도 함께 바뀜`);
    if (!prow || prow.start !== prow.end) return it.add('error', 'packet 정의가 여러 줄에 걸쳐 있어 자동 수정 불가 — 수동 수정 필요');
    this.emit(it, apply, 'drf', 'modify', prow.start, formatLike(drf.lines[prow.start], toks, ';', this.tag(it)), this.p.drf.current(prow.start), 'drDefinePacket');
    const names = ['display', 'name', 'stipple', 'lineStyle', 'fill', 'outline', 'fillStyle'];
    const changed = names.filter((_, i) => i < Math.min(base.length, toks.length) && base[i] !== toks[i]);
    if (toks.length !== base.length) changed.push('fillStyle');
    it.add('info', `변경 항목: ${changed.join(', ')}`);
    if (apply) st.packets.set(cur, toks);
    return undefined;
  }

  // ───────────────────────────────────────────── RETIRE
  retire(it, apply) {
    const { tf, lm } = this.ts;
    const st = this.st;
    const r = it.req;
    const layer = get(r, 'layer');
    const purpose = get(r, 'purpose');
    const whole = purpose === '' || purpose === '*';
    const pick = (m) => [...m].filter(([k]) => {
      const [l, p] = k.split('/');
      return l === layer && (whole || p === purpose) && !st.retired.has(k);
    });
    const prio = pick(tf.priorityRows());
    const disp = pick(tf.displayRows());
    const lrow = tf.layerByName().get(layer);
    if (!prio.length && !disp.length && !(whole && lrow)) return it.add('error', `${layer}/${purpose || '*'}가 techfile에 없음 (Not Found)`);
    const tag = this.opts.tagChanges ? `RETIRED ${it.req.id}` : 'RETIRED';
    const tableLines = new Set();
    for (const t of [tf.purposes, tf.layers, tf.priorities, tf.displays]) for (const row of t?.rows || []) for (let i = row.start; i <= row.end; i++) tableLines.add(i);
    for (const [, row] of prio) this.emitComment(it, apply, 'tf', row.start, row.end, tag, tf.lines[row.start], 'techLayerPurposePriorities');
    for (const [, row] of disp) this.emitComment(it, apply, 'tf', row.start, row.end, tag, tf.lines[row.start], 'techDisplays');
    if (whole && lrow) {
      const refs = tf.references(layer, tableLines);
      this.emitComment(it, apply, 'tf', lrow.start, lrow.end, tag, tf.lines[lrow.start], 'techLayers');
      if (refs.length) {
        const shown = refs.slice(0, 8).map((x) => x + 1).join(', ') + (refs.length > 8 ? ' …' : '');
        it.add('review', `techfile의 다른 위치에서 '${layer}' 참조 ${refs.length}건 (line ${shown}) — 룰/via 정의 확인 필요`);
      }
    } else if (whole) {
      it.add('review', `techLayers에 '${layer}' 정의가 없음 — LPP 행만 주석 처리`);
    }
    const lmRows = lm.rows.filter((x) => x.layer === layer && (whole || x.purpose === purpose));
    if (lmRows.length) {
      if (this.opts.retireLayermap === 'comment') {
        for (const x of lmRows) this.emitComment(it, apply, 'layermap', x.line, x.line, tag, lm.lines[x.line], 'layermap');
        it.add('review', 'layermap 행도 주석 처리 — 과거 GDS 재생성 시 해당 stream이 빠짐');
      } else {
        it.add('info', `layermap ${lmRows.length}행(${lmRows.map((x) => `${x.stream}/${x.datatype}`).join(', ')})은 정책상 유지`);
      }
    }
    const affected = new Set([...prio.map(([k]) => k), ...disp.map(([k]) => k)]);
    for (const [k] of disp) {
      const pk = st.displayPacket.get(k);
      if (pk && !st.packetUsers(pk).some((u) => !affected.has(u))) it.add('info', `packet '${pk}'은 더 이상 사용되지 않지만 drf에 남겨 둠`);
    }
    if (apply) for (const k of affected) st.retired.add(k);
    it.add('info', `주석 처리 대상 LPP: ${[...affected].sort().join(', ') || '(없음)'}`);
    return undefined;
  }
}
