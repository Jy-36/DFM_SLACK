// Techmap 작업공간 저장. 지금은 IndexedDB 한 건(workspace) — 설치형에서는 작업 폴더(JSON + 파일)로 옮길 예정
// (Kit의 docs/folder-db.md, Tauri 커맨드 명세 참고). 처리 규칙 · 출력 경로는 localStorage.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_OPTIONS } from './planner.js';
import { seedWorkspace } from './workspace.js';

const DB = 'dfmslack-techmap';
const STORE = 'docs';
const KEY = 'workspace';
const SETTINGS_KEY = 'techmap.settings';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath: 'key' });
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
const tx = (db, mode, fn) =>
  new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const rq = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(rq?.result);
    t.onerror = () => reject(t.error);
  });

function readSettings() {
  try {
    return { ...DEFAULT_OPTIONS, vwpRoot: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_OPTIONS, vwpRoot: '' };
  }
}

export function useTechmapStore() {
  const [ws, setWs] = useState(null);
  const [persistent, setPersistent] = useState(true);
  const [settings, setSettingsState] = useState(readSettings);
  const [firstRev, setFirstRev] = useState(null);
  const dbRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let doc = null;
      try {
        dbRef.current = await openDb();
        doc = await tx(dbRef.current, 'readonly', (s) => s.get(KEY));
      } catch {
        setPersistent(false);
      }
      let value = doc?.value;
      if (!value || value.version !== 2) {
        const seeded = seedWorkspace(readSettings());
        value = seeded.ws;
        setFirstRev(seeded.current);
        if (dbRef.current) tx(dbRef.current, 'readwrite', (s) => s.put({ key: KEY, value })).catch(() => {});
      }
      wsRef.current = value;
      if (alive) setWs(value);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** fn(ws) → 새 ws. 실패하면 예외를 그대로 던진다 (화면이 알림) */
  const update = useCallback((fn) => {
    // 바로 계산해서 결과를 돌려준다 (새 작업 id 등). 혼자 쓰는 앱이라 순서대로 처리하면 충분
    const out = fn(wsRef.current);
    const next = out?.ws || out;
    wsRef.current = next;
    setWs(next);
    if (dbRef.current) tx(dbRef.current, 'readwrite', (s) => s.put({ key: KEY, value: next })).catch(() => {});
    return out;
  }, []);

  /** 작업공간 통째로 바꾸기 (가져오기 · 초기화) */
  const replace = useCallback((value) => {
    wsRef.current = value;
    setWs(value);
    if (dbRef.current) tx(dbRef.current, 'readwrite', (s) => s.put({ key: KEY, value })).catch(() => {});
  }, []);

  const setSettings = (patch) =>
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* 저장 불가 */
      }
      return next;
    });

  return { ws, ready: !!ws, persistent, settings, setSettings, update, replace, firstRev };
}
