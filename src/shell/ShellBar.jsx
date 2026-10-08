// DFM Slack 상단 바: 앱 이름 · 탭 · 앱 추가 · 테마 · 요약/확장 · (설치형) 최소화·닫기
// 설치형(Tauri)에서는 Windows 기본 제목 표시줄을 끄고 이 바를 잡아 창을 옮긴다.
import { useEffect, useRef, useState } from 'react';
import { isTauri } from '../shared/platform.js';
import { Icon, ThemeCycle } from '../shared/ui.jsx';
import { DfmLogo } from '../shared/Logo.jsx';
import { APPS, appById } from './apps.js';
import { EDITION } from '../shared/edition.js';

async function win(action) {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow()[action]();
  } catch {
    /* 창 API를 쓸 수 없는 환경 */
  }
}

function WindowControls() {
  if (!isTauri()) return null;
  return (
    <div className="win-controls">
      <button type="button" className="win-btn" onClick={() => win('minimize')} title="최소화" aria-label="최소화">
        <Icon name="minimize" size={16} />
      </button>
      <button type="button" className="win-btn close" onClick={() => win('close')} title="닫기" aria-label="닫기">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function AddMenu({ tabs, addTab, closeTab, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="add-menu" ref={ref} role="dialog" aria-label="앱 추가">
      <div className="add-menu-head">앱 추가</div>
      {APPS.map((app) => {
        const added = tabs.includes(app.id);
        return (
          <div className="add-item" key={app.id}>
            <span className="add-icon"><Icon name={app.icon} size={16} /></span>
            <span className="add-text">
              <strong>{app.name}</strong>
              <span>{app.desc}</span>
            </span>
            {added ? (
              <button type="button" className="chip" onClick={() => closeTab(app.id)}>탭 닫기</button>
            ) : (
              <button type="button" className="chip on" onClick={() => { addTab(app.id); onClose(); }}>추가</button>
            )}
          </div>
        );
      })}
      <p className="add-foot">새 앱은 업데이트되면 탭에 자동으로 한 번 추가됩니다. 닫은 탭은 여기서 다시 열 수 있어요.</p>
    </div>
  );
}

const MODES = [
  { id: 'widget', name: 'Widget Mode', icon: 'widget', desc: '모니터 오른쪽 위 작은 창 · 투명도 · 항상 위' },
  { id: 'compact', name: 'App Mode', icon: 'appMode', desc: '모니터 오른쪽 끝에 붙는 요약 화면' },
  { id: 'full', name: 'Window Mode', icon: 'windowMode', desc: '넓은 창 · 전체 메뉴 (현황·근무기록·계획)' },
];

export default function ShellBar({ tabs, active, setActive, fresh = [], addTab, closeTab, mode, setMode, theme, setTheme }) {
  const [menu, setMenu] = useState(false);
  const compact = mode === 'compact';
  return (
    <header className={`shellbar ${compact ? 'compact' : 'full'}`} data-tauri-drag-region>
      <div className="sb-brand" data-tauri-drag-region>
        <DfmLogo size={compact ? 32 : 26} />
        <strong>DFM Slack</strong>
        {EDITION && <span className="sb-edition">{EDITION}</span>}
      </div>

      <div className="sb-tabs" role="tablist" aria-label="앱 탭" data-tauri-drag-region>
        {tabs.map((id) => {
          const app = appById(id);
          if (!app) return null;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active === id}
              className="sb-tab"
              onClick={() => setActive(id)}
            >
              <Icon name={app.icon} size={14} />
              {app.name}
              {fresh.includes(id) && <span className="sb-new" title="새로 추가된 앱">NEW</span>}
            </button>
          );
        })}
        <span className="sb-add-wrap">
          <button type="button" className="sb-add" onClick={() => setMenu((v) => !v)} aria-expanded={menu} title="앱 추가" aria-label="앱 추가">
            <Icon name="plus" size={15} />
          </button>
          {menu && <AddMenu tabs={tabs} addTab={addTab} closeTab={closeTab} onClose={() => setMenu(false)} />}
        </span>
      </div>

      <div className="sb-actions">
        <ThemeCycle theme={theme} setTheme={setTheme} />
        <span className="mode-switch" role="group" aria-label="화면 모드">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="mode-btn"
              aria-pressed={mode === m.id}
              aria-label={m.name}
              data-tip={m.name}
              data-desc={m.desc}
              onClick={() => mode !== m.id && setMode(m.id)}
            >
              <Icon name={m.icon} size={16} />
            </button>
          ))}
        </span>
        <WindowControls />
      </div>
    </header>
  );
}
