// 앱 안 뒤로 · 앞으로 가기 + 왼쪽 메뉴 도구줄(뒤로 · 앞으로 · 접기)
// here: 지금 위치(JSON으로 비교 가능한 값), apply(entry): 그 위치로 되돌리기
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './ui.jsx';

export function useNavHistory(here, apply, enabled = true) {
  const key = JSON.stringify(here);
  const [hist, setHist] = useState(() => ({ list: [key], idx: 0 }));
  useEffect(() => {
    setHist((h) => {
      if (h.list[h.idx] === key) return h;
      const list = [...h.list.slice(0, h.idx + 1), key].slice(-100);
      return { list, idx: list.length - 1 };
    });
  }, [key]);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const travel = useCallback((d) => {
    setHist((h) => {
      const i = h.idx + d;
      if (i < 0 || i >= h.list.length) return h;
      // 상태 바꾸기는 이 갱신 뒤에 (렌더 중 다른 상태를 바꾸지 않도록)
      const entry = JSON.parse(h.list[i]);
      queueMicrotask(() => applyRef.current(entry));
      return { ...h, idx: i };
    });
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    const keyDown = (e) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      travel(e.key === 'ArrowLeft' ? -1 : 1);
    };
    const mouse = (e) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      travel(e.button === 3 ? -1 : 1);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('mouseup', mouse);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('mouseup', mouse);
    };
  }, [enabled, travel]);
  return { back: () => travel(-1), forward: () => travel(1), canBack: hist.idx > 0, canForward: hist.idx < hist.list.length - 1 };
}

/** 앱 이름 아래 도구줄: 뒤로 · 앞으로 | 메뉴 접기 */
export function NavTools({ nav, navMini, toggleNav }) {
  return (
    <div className={`nav-tools ${navMini ? 'mini' : ''}`} role="toolbar" aria-label="메뉴 도구">
      <button type="button" className="nav-tool back" disabled={!nav.canBack} onClick={nav.back} title="뒤로 (Alt + ←)" aria-label="뒤로">
        <Icon name="chevron" size={14} />
      </button>
      <button type="button" className="nav-tool" disabled={!nav.canForward} onClick={nav.forward} title="앞으로 (Alt + →)" aria-label="앞으로">
        <Icon name="chevron" size={14} />
      </button>
      <span className="nav-tools-gap" />
      <button type="button" className="nav-tool" onClick={toggleNav} title={navMini ? '메뉴 펼치기' : '메뉴 접기'} aria-label={navMini ? '메뉴 펼치기' : '메뉴 접기'} aria-expanded={!navMini}>
        <Icon name={navMini ? 'navOpen' : 'navClose'} size={14} />
      </button>
    </div>
  );
}
