// DFM Slack 본체: 상단 바와 탭을 관리하고, 고른 탭의 앱을 그린다.
import { useEffect, useState } from 'react';
import { useTheme, useWindowMode } from '../shared/prefs.js';
import { isTauri } from '../shared/platform.js';
import { Icon } from '../shared/ui.jsx';
import ShellBar from './ShellBar.jsx';
import { APPS, appById } from './apps.js';

const TABS_KEY = 'dfmslack.tabs';
const ACTIVE_KEY = 'dfmslack.active';
const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 저장 불가 환경 */
  }
};

export default function Shell() {
  const [theme, setTheme] = useTheme();
  const [mode, setMode] = useWindowMode();
  const [tabs, setTabs] = useState(() => read(TABS_KEY, ['worktime']).filter((id) => appById(id)));
  const [active, setActive] = useState(() => {
    const a = read(ACTIVE_KEY, 'worktime');
    return appById(a) ? a : null;
  });

  useEffect(() => {
    if (isTauri()) document.documentElement.classList.add('tauri');
  }, []);
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);
  useEffect(() => write(TABS_KEY, tabs), [tabs]);
  useEffect(() => write(ACTIVE_KEY, active), [active]);

  const current = active && tabs.includes(active) ? appById(active) : appById(tabs[0]);
  useEffect(() => {
    document.title = current ? `DFM Slack - ${current.name}` : 'DFM Slack';
  }, [current]);

  const addTab = (id) => {
    setTabs((t) => (t.includes(id) ? t : [...t, id]));
    setActive(id);
  };
  const closeTab = (id) => {
    setTabs((t) => t.filter((x) => x !== id));
    if (active === id) setActive(null);
  };

  const App = current?.component;
  return (
    <div className="shell">
      <ShellBar
        tabs={tabs}
        active={current?.id}
        setActive={setActive}
        addTab={addTab}
        closeTab={closeTab}
        mode={mode}
        setMode={setMode}
        theme={theme}
        setTheme={setTheme}
      />
      {App ? <App mode={mode} setMode={setMode} /> : <Home addTab={addTab} />}
    </div>
  );
}

function Home({ addTab }) {
  return (
    <div className="shell-home">
      <div className="shell-home-card">
        <h2>열린 탭이 없어요</h2>
        <p className="muted">쓰고 싶은 앱을 탭으로 추가하세요.</p>
        <div className="shell-home-apps">
          {APPS.map((app) => (
            <button key={app.id} type="button" className="shell-app" onClick={() => addTab(app.id)}>
              <span className="add-icon"><Icon name={app.icon} size={18} /></span>
              <span className="add-text">
                <strong>{app.name}</strong>
                <span>{app.desc}</span>
              </span>
              <Icon name="plus" size={16} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
