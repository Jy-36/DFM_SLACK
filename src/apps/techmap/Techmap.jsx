// Techmap: DFM Slack 안의 탭. Site Request(엑셀)로 techfile · layermap · display.drf를 같이 검토하고,
// 승인한 변경만 원본 양식 그대로 반영한 파일을 내준다. 계산은 lib/planner.js (Python 참조 엔진을 옮긴 것).
// Window Mode 왼쪽 메뉴는 Slack 채널처럼: Request 묶음 · Baseline 버전 · 처리 규칙.
import { useEffect, useMemo, useState } from 'react';
import { NavTools, useNavHistory } from '../../shared/navHistory.jsx';
import { BrandMark, Icon, Pill } from '../../shared/ui.jsx';
import { useTechmapStore } from './lib/store.js';
import { batchResult } from './lib/view.js';
import BatchPage from './pages/BatchPage.jsx';
import BaselinePage from './pages/BaselinePage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import RulesPage from './pages/RulesPage.jsx';
import Mini from './pages/Mini.jsx';
import Widget from './pages/Widget.jsx';
import './techmap.css';

export const TECHMAP_VERSION = '0.1.0';
const LOC_KEY = 'techmap.loc';
const MINI_KEY = 'techmap.navMini';
const readLoc = () => {
  try {
    return JSON.parse(localStorage.getItem(LOC_KEY) || 'null') || { page: 'home' };
  } catch {
    return { page: 'home' };
  }
};

export default function Techmap({ mode, setMode, widget, setWidget }) {
  const store = useTechmapStore();
  const [loc, setLoc] = useState(readLoc);
  const [toast, setToast] = useState(null);
  const [navMini, setNavMini] = useState(() => {
    try {
      return localStorage.getItem(MINI_KEY) === '1';
    } catch {
      return false;
    }
  });
  const nav = useNavHistory(loc, (e) => setLoc(e), mode === 'full');
  useEffect(() => {
    try {
      localStorage.setItem(LOC_KEY, JSON.stringify(loc));
    } catch {
      /* 저장 불가 */
    }
  }, [loc]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const { ready, baselines, batches, settings } = store;
  const latest = baselines[baselines.length - 1];
  // 지금 보는 Request 묶음: 고른 것 → 없으면 가장 최근
  const page = loc.page === 'home' ? (batches.length ? 'batch' : 'upload') : loc.page;
  const sel = batches.find((b) => b.id === loc.id);
  const batch = page === 'batch' || mode !== 'full' ? sel || batches[0] || null : null;
  const batchBase = batch ? baselines.find((b) => b.id === batch.baseline) : null;
  const res = useMemo(() => (batch && batchBase ? batchResult(batch, batchBase, settings) : null), [batch, batchBase, settings]);
  // 왼쪽 메뉴 뱃지: 묶음마다 검토 필요 · ERROR 수
  const counts = useMemo(() => {
    const out = {};
    for (const b of batches) {
      const base = baselines.find((x) => x.id === b.baseline);
      const r = base && (b === batch ? res : batchResult(b, base, settings));
      if (r) out[b.id] = r.counts;
    }
    return out;
  }, [batches, baselines, settings, res]);

  // 처음 계산한 기본 반영(READY) 목록을 고정해 둔다 → 이후 체크로만 바뀜
  useEffect(() => {
    if (batch && res && !batch.include) store.actions.freezeInclude(batch, res.applied);
  }, [batch, res]);

  const go = (next) => setLoc(next);
  const expand = (next) => {
    if (next) setLoc(next);
    setMode('full');
  };
  const notify = (text) => setToast(text);
  const toggleNav = () =>
    setNavMini((v) => {
      try {
        localStorage.setItem(MINI_KEY, v ? '0' : '1');
      } catch {
        /* 저장 불가 */
      }
      return !v;
    });
  const toastEl = toast && <div className="toast" role="status">{toast}</div>;

  if (!ready) return <div className="mini fade-in"><section className="mini-card"><p className="small muted">Techmap 불러오는 중…</p></section></div>;
  if (mode === 'widget') return <Widget batch={batch} res={res} setMode={setMode} widget={widget} setWidget={setWidget} />;
  if (mode === 'compact') {
    return (
      <>
        <Mini store={store} batch={batch} baseline={batchBase} res={res} expand={expand} notify={notify} select={(id) => setLoc({ page: 'batch', id })} />
        {toastEl}
      </>
    );
  }

  const baseline = page === 'baseline' ? baselines.find((b) => b.id === loc.id) || latest : null;
  return (
    <div className={`app techmap fade-in ${navMini ? 'nav-mini' : ''}`}>
      <nav className="nav" aria-label="Techmap 메뉴">
        <div className="brand">
          <BrandMark icon="techmap" />
          <div className="brand-text">
            <div className="brand-name">Techmap</div>
            <div className="brand-sub">v{TECHMAP_VERSION}</div>
          </div>
          <NavTools nav={nav} navMini={navMini} toggleNav={toggleNav} />
        </div>

        <button className="nav-btn" aria-current={page === 'upload' ? 'page' : undefined} onClick={() => go({ page: 'upload' })} title={navMini ? 'Request 업로드' : undefined}>
          <Icon name="plus" />
          <span className="nav-label">Request 업로드</span>
        </button>

        {!navMini && <div className="tm-nav-sec">Request</div>}
        <div className="tm-chan-list">
          {batches.map((b) => {
            const n = counts[b.id];
            return (
              <button key={b.id} className="nav-btn tm-chan" aria-current={page === 'batch' && batch?.id === b.id ? 'page' : undefined} onClick={() => go({ page: 'batch', id: b.id })} title={`${b.name} · ${b.created}`}>
                <span className="tm-hash">#</span>
                <span className="nav-label">{b.name}</span>
                {b.promoted ? <span className="tm-pip done">{b.promoted}</span> : n && (
                  <>
                    {n.NEEDS_REVIEW > 0 && <span className="tm-pip rev">{n.NEEDS_REVIEW}</span>}
                    {n.ERROR > 0 && <span className="tm-pip err">{n.ERROR}</span>}
                  </>
                )}
              </button>
            );
          })}
          {!batches.length && !navMini && <p className="tm-nav-empty">아직 올린 Request가 없어요</p>}
        </div>

        {!navMini && <div className="tm-nav-sec">Baseline</div>}
        <div className="tm-chan-list short">
          {[...baselines].reverse().map((b, i) => (
            <button key={b.id} className="nav-btn tm-chan" aria-current={page === 'baseline' && baseline?.id === b.id ? 'page' : undefined} onClick={() => go({ page: 'baseline', id: b.id })} title={`${b.id} · ${b.label}`}>
              <Icon name="layers" />
              <span className="nav-label">{b.id} · {b.label}</span>
              {i === 0 && !navMini && <span className="tm-pip new">최신</span>}
            </button>
          ))}
        </div>

        <div className="tm-nav-common">
          <button className="nav-btn" aria-current={page === 'rules' ? 'page' : undefined} onClick={() => go({ page: 'rules' })} title={navMini ? '처리 규칙' : undefined}>
            <Icon name="settings" />
            <span className="nav-label">처리 규칙</span>
          </button>
        </div>
        <div className="nav-foot">
          <span><Pill tone="accent">Request {batches.length} · Baseline {baselines.length}</Pill></span>
          {!store.persistent && <span className="small tone-warn">저장소를 쓸 수 없어 창을 닫으면 사라져요</span>}
        </div>
      </nav>

      <main className="main">
        {page === 'batch' && batch && batchBase && res && <BatchPage key={batch.id} batch={batch} baseline={batchBase} res={res} store={store} notify={notify} go={go} />}
        {page === 'batch' && batch && !batchBase && (
          <div className="page"><div className="banner">이 Request 묶음의 기준 baseline({batch.baseline})이 지워졌어요. 다른 baseline으로 다시 올려 주세요.</div></div>
        )}
        {page === 'batch' && batch && batchBase && !res && (
          <div className="page"><div className="banner">baseline {batchBase.id} 파일을 읽지 못했어요. Baseline 화면에서 확인해 주세요.</div></div>
        )}
        {page === 'baseline' && baseline && <BaselinePage key={baseline.id} baseline={baseline} latest={baseline === latest} store={store} notify={notify} go={go} />}
        {(page === 'upload' || (page === 'batch' && !batch)) && <UploadPage store={store} notify={notify} go={go} prefBaseline={loc.baseline} />}
        {page === 'rules' && <RulesPage store={store} />}
      </main>
      {toastEl}
    </div>
  );
}
