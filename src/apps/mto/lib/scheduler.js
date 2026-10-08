// MTO 일정 규칙 엔진 (순수 함수). mto-scheduling-agent/mto_agent/scheduler.py 를 그대로 옮긴 것.
//
// 날짜 규칙 (명시한 가정):
// * S일에 시작한 단계의 TAT가 n이면 S ~ S+n-1일 동안 진행하고, 다음 단계는 S+n일부터 시작할 수 있다.
// * STEP1/STEP2는 휴일에 시작할 수 없지만, 시작한 뒤에는 휴일에도 계속 진행한다 (TAT는 달력일).
// * STEP2 동시 진행 제한: 어느 날이든 STEP2 중인 Layer는 step2Concurrency장 이하 (진행 중이면 휴일에도 슬롯 점유).
//   Layer No 순서(=MTO 순서)로 투입하고, TAT 전체 동안 슬롯이 비는 첫 근무일에 시작한다.
// * MTO는 STEP2 종료 + mtoGapDays일부터 가능, 휴일 불가, No 순서대로 하루 mtoPerDay장까지.
// * GDS 입고일이 휴일이면 STEP1은 다음 근무일에 시작한다.
import { holidayName as krHoliday } from '../../../shared/holidays.js';
import { addDays, diffDays, fromDay, toDay, weekdayOf } from './dates.js';

export const DEFAULT_CONFIG = Object.freeze({
  partBOffsetDays: 14, // 규칙 1: Part B GDS = Part A GDS + 2주
  step1Tat: { A: 5, B: 3 }, // 규칙 7: STEP1 TAT는 Part별
  step2Tat: { X: 3, Y: 5, Z: 7 }, // 규칙 7: STEP2 TAT는 Type별
  mtoGapDays: 1, // 규칙 5: STEP2 끝나고 1일 뒤 MTO 가능
  mtoPerDay: 2, // 규칙 10: 하루 MTO 2~3장 (기본 2, 보수적)
  step2Concurrency: 4, // 규칙 11: STEP2 동시 4~5장 (null = 무제한)
  weekendsAreHolidays: true,
  extraHolidays: [], // 회사 휴무일 'YYYY-MM-DD'
  revisionStep1Tat: 3, // Revision 기본 STEP1 TAT (Revision마다 바꿀 수 있음)
});

export const PARTS = ['A', 'B'];
/** Revision은 Part A/B 없이 한 묶음: 엔진 안에서는 Part 'R'로 계산한다 */
export const REVISION_PART = 'R';
export const partLabel = (p) => (p === REVISION_PART ? 'Revision' : /^[A-Z0-9]{1,2}$/.test(p) ? `Part ${p}` : p);

/** 근무일 달력: 대한민국 공휴일 + 주말(선택) + 추가 휴무 */
export function makeCalendar({ weekendsAreHolidays = true, extraHolidays = [] } = {}) {
  const extra = new Set(extraHolidays);
  const name = (iso) => {
    if (extra.has(iso)) return '회사 휴무';
    const kr = krHoliday(iso);
    if (kr) return kr;
    if (weekendsAreHolidays) {
      const w = weekdayOf(toDay(iso));
      if (w === 0 || w === 6) return '주말';
    }
    return null;
  };
  const isHoliday = (iso) => name(iso) != null;
  const nextWorkingDay = (iso) => {
    let d = iso;
    for (let i = 0; i < 400 && isHoliday(d); i++) d = addDays(d, 1);
    return d;
  };
  /** [start, end] 안의 휴일 (pubOnly면 그냥 주말은 뺀다) */
  const holidaysBetween = (start, end, pubOnly = true) => {
    const out = [];
    for (let n = toDay(start), e = toDay(end); n <= e; n++) {
      const d = fromDay(n);
      const nm = name(d);
      if (nm && (!pubOnly || nm !== '주말')) out.push({ date: d, name: nm });
    }
    return out;
  };
  return { holidayName: name, isHoliday, nextWorkingDay, holidaysBetween };
}

export function normalizeConfig(cfg = {}) {
  const c = { ...DEFAULT_CONFIG, ...cfg };
  c.step1Tat = { ...DEFAULT_CONFIG.step1Tat, ...(cfg.step1Tat || {}) };
  c.step2Tat = { ...(cfg.step2Tat || DEFAULT_CONFIG.step2Tat) };
  c.extraHolidays = [...(cfg.extraHolidays || [])];
  if (c.step2Concurrency === 0 || c.step2Concurrency === undefined) c.step2Concurrency = null;
  return c;
}

/**
 * @param {string} partAGds 'YYYY-MM-DD'
 * @param {{no:number, part:string, layer:string, type:string}[]} layers
 * @param {object} config DEFAULT_CONFIG 형태 (빠진 값은 기본값)
 */
export function buildSchedule(partAGds, layers, config) {
  const cfg = normalizeConfig(config);
  if (!partAGds) throw new Error('Part A GDS 입고일을 입력하세요.');
  if (!layers || !layers.length) throw new Error('Layer List가 비어 있습니다.');
  if (!(cfg.mtoPerDay >= 1)) throw new Error('하루 MTO 가능 수는 1 이상이어야 합니다.');
  if (cfg.step2Concurrency != null && !(cfg.step2Concurrency >= 1)) throw new Error('STEP2 동시 진행 수는 1 이상(또는 무제한)이어야 합니다.');
  for (const l of layers) {
    if (!(l.part in cfg.step1Tat)) throw new Error(`Layer ${l.layer || l.no}: Part '${l.part}'를 알 수 없습니다 (A 또는 B).`);
    if (!(l.type in cfg.step2Tat)) throw new Error(`Layer ${l.layer || l.no}: Type '${l.type}'를 알 수 없습니다 (${Object.keys(cfg.step2Tat).join('/')}).`);
  }

  // 규칙 1 (Revision은 GDS 입고일 그대로)
  // 공정에서 Part를 정의하면 Part별 GDS 간격(cfg.partOffsets)을 쓴다. 없으면 A = GDS, B = GDS + partBOffsetDays
  const offsets = cfg.partOffsets || {};
  const gdsOf = (part) => addDays(partAGds, offsets[part] ?? (part === 'B' ? cfg.partBOffsetDays : 0));
  const gds = { A: gdsOf('A'), B: gdsOf('B'), [REVISION_PART]: partAGds };
  for (const l of layers) if (!(l.part in gds)) gds[l.part] = gdsOf(l.part);
  const cal = makeCalendar(cfg);

  // 규칙 2, 4, 6, 7: STEP1은 Part(GDS) 단위
  const step1 = {};
  const partOrder = cfg.partOrder || [];
  const parts = [...new Set(layers.map((l) => l.part))].sort((x, y) => {
    const i = partOrder.indexOf(x);
    const j = partOrder.indexOf(y);
    return (i < 0 ? 1e9 : i) - (j < 0 ? 1e9 : j) || (x < y ? -1 : x > y ? 1 : 0);
  });
  for (const part of parts) {
    const start = cal.nextWorkingDay(gds[part]);
    step1[part] = { gds: gds[part], start, end: addDays(start, cfg.step1Tat[part] - 1) };
  }

  // 규칙 3, 6, 7, 11: STEP2는 Layer 단위, No 순서로 동시 진행 제한 안에서 투입
  const load = new Map(); // day number → STEP2 중인 Layer 수
  const cap = cfg.step2Concurrency;
  const sorted = [...layers].sort((a, b) => a.no - b.no);
  const out = sorted.map((l) => {
    const s1 = step1[l.part];
    const notes = [];
    const tat2 = cfg.step2Tat[l.type];
    const readyRaw = addDays(s1.end, 1);
    const ready = cal.nextWorkingDay(readyRaw);
    if (ready !== readyRaw) notes.push(`STEP2 가능일 ${readyRaw}→${ready} (휴일: ${cal.holidayName(readyRaw)})`);
    let start = ready;
    if (cap != null) {
      const busy = (s) => {
        const n0 = toDay(s);
        for (let i = 0; i < tat2; i++) if ((load.get(n0 + i) || 0) >= cap) return true;
        return false;
      };
      while (busy(start)) start = cal.nextWorkingDay(addDays(start, 1));
    }
    const n0 = toDay(start);
    for (let i = 0; i < tat2; i++) load.set(n0 + i, (load.get(n0 + i) || 0) + 1);
    const wait = diffDays(start, ready);
    if (wait) notes.push(`STEP2 동시진행 ${cap}장 제한으로 ${wait}일 대기`);
    const end = addDays(start, tat2 - 1);
    // 규칙 5, 8
    const mtoReady = addDays(end, cfg.mtoGapDays);
    const mtoEarliest = cal.nextWorkingDay(mtoReady);
    if (mtoEarliest !== mtoReady) notes.push(`MTO 가능일 ${mtoReady}→${mtoEarliest} (휴일: ${cal.holidayName(mtoReady)})`);
    return {
      no: l.no, part: l.part, layer: l.layer, type: l.type,
      gds: s1.gds, step1Start: s1.start, step1End: s1.end,
      step2Tat: tat2, step2Ready: ready, step2Start: start, step2WaitDays: wait, step2End: end,
      mtoEarliest, mtoDate: mtoEarliest, mtoWaitDays: 0, notes,
    };
  });

  // 규칙 5, 10: No 순서대로 순차 MTO, 근무일마다 mtoPerDay장까지
  let prev = null;
  let usedOnPrev = 0;
  for (const ls of out) {
    let d = ls.mtoEarliest;
    if (prev != null) {
      if (d < prev) d = prev; // 앞 번호를 앞지를 수 없다
      if (d === prev && usedOnPrev >= cfg.mtoPerDay) d = cal.nextWorkingDay(addDays(prev, 1));
    }
    usedOnPrev = d === prev ? usedOnPrev + 1 : 1;
    ls.mtoDate = d;
    ls.mtoWaitDays = diffDays(d, ls.mtoEarliest);
    if (ls.mtoWaitDays) ls.notes.push(`순차 MTO(${cfg.mtoPerDay}장/일) 대기 ${ls.mtoWaitDays}일`);
    prev = d;
  }

  const finalMto = out.reduce((m, l) => (l.mtoDate > m ? l.mtoDate : m), out[0].mtoDate);
  const step2Load = {};
  [...load.keys()].sort((a, b) => a - b).forEach((n) => {
    if (load.get(n)) step2Load[fromDay(n)] = load.get(n);
  });
  return {
    partAGds: gds.A,
    partBGds: gds.B,
    step1,
    layers: out,
    config: cfg,
    finalMto,
    leadTimeDays: diffDays(finalMto, gds.A),
    holidaysInWindow: cal.holidaysBetween(partAGds, finalMto),
    step2Load,
  };
}

/** 하루 MTO 수 × STEP2 동시 진행 수 조합별 최종 MTO (다른 설정은 그대로) */
export function scenarioGrid(partAGds, layers, config, mtoOptions = [2, 3], step2Options = [4, 5]) {
  const base = normalizeConfig(config);
  const rows = [];
  for (const m of mtoOptions) {
    for (const c of step2Options) {
      const r = buildSchedule(partAGds, layers, { ...base, mtoPerDay: m, step2Concurrency: c });
      rows.push({
        mtoPerDay: m,
        step2Concurrency: c,
        finalMto: r.finalMto,
        leadTimeDays: r.leadTimeDays,
        step2WaitTotal: r.layers.reduce((a, l) => a + l.step2WaitDays, 0),
        mtoWaitTotal: r.layers.reduce((a, l) => a + l.mtoWaitDays, 0),
      });
    }
  }
  return rows;
}
