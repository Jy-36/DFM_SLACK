// 사내 근태 사이트 수집.
// 동작 방식: 앱이 사내 사이트 창을 띄움 → 사용자가 평소처럼 로그인 → 근태 조회 화면이 열리면
// 주입 스크립트가 표 HTML을 앱으로 보냄 → 아래 parseAttendanceHtml이 기록으로 변환.
// 브라우저(미리보기)에서는 같은 흐름을 가짜로 재현한다.
import { generateMockRecords } from './mockData.js';
import { pad2 } from './time.js';

export const DEFAULT_SYNC_CONFIG = {
  portalUrl: 'https://attendance.internal.example/my/records',
  rowSelector: '#attTable tbody tr',
  cols: { date: 0, in: 2, out: 3, type: 4 },
  typeMap: {
    연차: 'annual',
    오전반차: 'half_am',
    오후반차: 'half_pm',
    반반차: 'quarter',
    출장: 'trip',
    교육: 'edu',
  },
};

import { isTauri } from '../../../shared/platform.js';
export { isTauri };

/** "2026.10.01", "2026-10-01", "20261001", "10/01(목)" → "2026-10-01" */
export function normalizeDate(text, fallbackYear = new Date().getFullYear()) {
  const t = String(text || '').trim();
  let m = t.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})/);
  if (m) return `${fallbackYear}-${pad2(m[1])}-${pad2(m[2])}`;
  return null;
}

/** "08:12:31", "8:12", "0812" → "08:12" */
export function normalizeTime(text) {
  const t = String(text || '').trim();
  let m = t.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${pad2(m[1])}:${m[2]}`;
  m = t.match(/^(\d{2})(\d{2})$/);
  if (m) return `${m[1]}:${m[2]}`;
  return null;
}

/** 표 HTML → { 'YYYY-MM-DD': { in, out, leave } } */
export function parseAttendanceHtml(html, cfg = DEFAULT_SYNC_CONFIG) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [...doc.querySelectorAll(cfg.rowSelector)];
  const out = {};
  const skipped = [];
  rows.forEach((tr, i) => {
    const cells = [...tr.querySelectorAll('td,th')].map((c) => c.textContent.trim());
    const date = normalizeDate(cells[cfg.cols.date]);
    if (!date) {
      skipped.push(i + 1);
      return;
    }
    const typeText = cells[cfg.cols.type] || '';
    const leave = Object.entries(cfg.typeMap).find(([label]) => typeText.includes(label))?.[1] || null;
    out[date] = {
      in: normalizeTime(cells[cfg.cols.in]),
      out: normalizeTime(cells[cfg.cols.out]),
      leave,
      source: 'portal',
    };
  });
  return { records: out, rowCount: rows.length, skipped };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 동기화 실행. onLog(text, level)로 진행 상황을 알린다.
 * 반환: { records, mode }
 */
export async function runSync({ config, onLog }) {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');
    onLog('사내 근태 사이트 창을 엽니다. 로그인 후 근태 조회 화면으로 이동하세요.');
    const html = await new Promise((resolve, reject) => {
      let unlisten = null;
      const timer = setTimeout(() => {
        unlisten?.();
        reject(new Error('5분 안에 근태 화면을 찾지 못했습니다. 조회 화면을 연 뒤 다시 시도하세요.'));
      }, 5 * 60 * 1000);
      listen('attendance-html', (e) => {
        clearTimeout(timer);
        unlisten?.();
        resolve(e.payload);
      }).then((u) => {
        unlisten = u;
        invoke('open_attendance_window', { url: config.portalUrl, rowSelector: config.rowSelector }).catch(reject);
      });
    });
    onLog('근태 표를 받았습니다. 기록으로 변환합니다.');
    const { records, rowCount, skipped } = parseAttendanceHtml(html, config);
    onLog(`${rowCount}행 중 ${Object.keys(records).length}일 저장${skipped.length ? `, ${skipped.length}행 건너뜀` : ''}`, 'ok');
    return { records, mode: 'portal' };
  }

  // 미리보기: 같은 단계를 가짜로 진행
  onLog(`사내 근태 사이트 창 열기 (${config.portalUrl})`);
  await sleep(500);
  onLog('로그인 세션 확인됨 (가짜)');
  await sleep(500);
  onLog(`근태 조회 화면에서 "${config.rowSelector}" 표를 찾는 중`);
  await sleep(600);
  const records = generateMockRecords(new Date());
  const n = Object.keys(records).length;
  onLog(`${n}일치 기록을 읽었습니다.`);
  await sleep(300);
  onLog('저장 완료 — 가짜 데이터로 동기화했습니다.', 'ok');
  return { records, mode: 'mock' };
}
