// Techmap 탭 상태. techfile은 수 MB가 될 수 있어서 localStorage 대신 IndexedDB에 둔다
// (쓸 수 없는 환경이면 메모리에만). 처리 규칙만 localStorage.
// baseline: { id:'v0', label, created, source, files:{ tf|layermap|drf: {name,text} } }
// batch:    { id, name, file, baseline, created, requests, include:null|[id], log:[], promoted:null|'vN' }
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_OPTIONS } from './planner.js';
import { DEMO_FILES } from './samples.js';

const DB = 'dfmslack-techmap';
const STORE = 'docs';
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
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
  });

export const now = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
const vnum = (id) => Number(String(id).slice(1)) || 0;

function readSettings() {
  try {
    return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function useTechmapStore() {
  const [state, setState] = useState({ ready: false, baselines: [], batches: [], persistent: true });
  const [settings, setSettingsState] = useState(readSettings);
  const dbRef = useRef(null);

  const save = useCallback(async (doc) => {
    if (!dbRef.current) return;
    try {
      await tx(dbRef.current, 'readwrite', (s) => s.put(doc));
    } catch {
      /* 저장 실패 시 메모리에만 */
    }
  }, []);
  const remove = useCallback(async (key) => {
    if (!dbRef.current) return;
    try {
      await tx(dbRef.current, 'readwrite', (s) => s.delete(key));
    } catch {
      /* 무시 */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let docs = [];
      let persistent = true;
      try {
        dbRef.current = await openDb();
        docs = (await tx(dbRef.current, 'readonly', (s) => s.getAll())) || [];
      } catch {
        persistent = false;
      }
      let baselines = docs.filter((d) => d.kind === 'baseline').map((d) => d.value).sort((a, b) => vnum(a.id) - vnum(b.id));
      const batches = docs.filter((d) => d.kind === 'batch').map((d) => d.value).sort((a, b) => (a.id < b.id ? 1 : -1));
      if (!baselines.length) {
        const demo = { id: 'v0', label: 'DEMO baseline', created: now(), source: '예시 파일', files: DEMO_FILES };
        baselines = [demo];
        if (dbRef.current) await tx(dbRef.current, 'readwrite', (s) => s.put({ key: 'baseline:v0', kind: 'baseline', value: demo })).catch(() => {});
      }
      if (alive) setState({ ready: true, baselines, batches, persistent });
    })();
    return () => {
      alive = false;
    };
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

  const putBatch = (batch) => {
    setState((s) => ({ ...s, batches: s.batches.some((b) => b.id === batch.id) ? s.batches.map((b) => (b.id === batch.id ? batch : b)) : [batch, ...s.batches] }));
    save({ key: `batch:${batch.id}`, kind: 'batch', value: batch });
    return batch;
  };
  const withLog = (batch, kind, text) => ({ ...batch, log: [...(batch.log || []), { at: now(), kind, text }] });

  const actions = {
    addBaseline(files, label, source) {
      const id = `v${Math.max(-1, ...state.baselines.map((b) => vnum(b.id))) + 1}`;
      const b = { id, label: label || '업로드 baseline', created: now(), source, files };
      setState((s) => ({ ...s, baselines: [...s.baselines, b] }));
      save({ key: `baseline:${id}`, kind: 'baseline', value: b });
      return b;
    },
    deleteBaseline(id) {
      setState((s) => ({ ...s, baselines: s.baselines.filter((b) => b.id !== id) }));
      remove(`baseline:${id}`);
    },
    addBatch({ name, file, baseline, requests }) {
      let id = stamp();
      while (state.batches.some((b) => b.id === id)) id += 'a';
      return putBatch(withLog({ id, name, file, baseline, created: now(), requests, include: null, log: [], promoted: null }, 'system', `${file} 업로드 · Request ${requests.length}건 검토 시작`));
    },
    /** 처음 계산한 기본 반영 목록(READY)을 고정한다 */
    freezeInclude(batch, ids) {
      if (batch.include) return batch;
      return putBatch({ ...batch, include: ids });
    },
    setInclude(batch, ids, id, on) {
      const inc = new Set(batch.include || ids);
      if (on) inc.add(id);
      else inc.delete(id);
      return putBatch(withLog({ ...batch, include: [...inc] }, 'decision', `${id} ${on ? '반영 승인' : '반영 제외'}`));
    },
    comment(batch, text) {
      return putBatch(withLog(batch, 'comment', text));
    },
    log(batch, text) {
      return putBatch(withLog(batch, 'system', text));
    },
    promote(batch, res, applied) {
      const b = actions.addBaseline(
        { tf: { name: res.names.tf, text: res.files.tf }, layermap: { name: res.names.layermap, text: res.files.layermap }, drf: { name: res.names.drf, text: res.files.drf } },
        `${batch.name} 반영 (${applied.length}건)`,
        `Request ${batch.name}`,
      );
      putBatch(withLog({ ...batch, promoted: b.id }, 'system', `${batch.baseline} + ${applied.join(', ')} → 새 baseline ${b.id}`));
      return b;
    },
    deleteBatch(id) {
      setState((s) => ({ ...s, batches: s.batches.filter((b) => b.id !== id) }));
      remove(`batch:${id}`);
    },
  };

  return { ...state, settings, setSettings, actions };
}
