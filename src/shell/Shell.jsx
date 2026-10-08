// DFM Slack 본체: 상단 바와 탭을 관리하고, 고른 탭의 앱을 그린다.
import { useEffect, useRef, useState } from 'react';
import { useTheme, useWindowMode, useWidgetPrefs } from '../shared/prefs.js';
import { isTauri } from '../shared/platform.js';
import { Icon } from '../shared/ui.jsx';
import ShellBar from './ShellBar.jsx';
import { APPS, appById } from './apps.js';
import { APP_NAME } from '../shared/edition.js';

const TABS_KEY = 'dfmslack.tabs';
const ACTIVE_KEY = 'dfmslack.active';
const SEEN_KEY = 'dfmslack.seenApps'; // 지금까지 알려 준 앱 (닫은 탭을 다시 열지 않게)
const LEGACY_APPS = ['worktime']; // 앱 목록 기록이 생기기 전(0.15.0 이하)부터 있던 앱
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

function initialTabs() {
  const saved = read(TABS_KEY, null);
  const seen = read(SEEN_KEY, null);
  const all = APPS.map((a) => a.id);
  const tabs = (saved || all).filter((id) => appById(id));
  const known = seen || (saved ? LEGACY_APPS : all);
  const added = all.filter((id) => !known.includes(id) && !tabs.includes(id));
  return { tabs: [...tabs, ...added], added };
}

export default function Shell() {
  const [theme, setTheme] = useTheme();
  const [widget, setWidget] = useWidgetPrefs();
  const widgetRef = useRef(widget);
  widgetRef.current = widget;
  const [mode, setMode] = useWindowMode(() => widgetRef.current);
  // 업데이트로 새로 생긴 앱은 한 번 자동으로 탭에 넣는다 (예전 PC에는 탭 목록이 WorkTime만 저장돼 있음)
  const [init] = useState(initialTabs);
  const [tabs, setTabs] = useState(init.tabs);
  const [fresh, setFresh] = useState(init.added);
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
  useEffect(() => {
    document.documentElement.style.setProperty('--wg-opacity', String(widget.opacity));
  }, [widget.opacity]);
  useEffect(() => write(TABS_KEY, tabs), [tabs]);
  useEffect(() => write(SEEN_KEY, APPS.map((a) => a.id)), []);
  useEffect(() => write(ACTIVE_KEY, active), [active]);

  const current = active && tabs.includes(active) ? appById(active) : appById(tabs[0]);
  useEffect(() => {
    document.title = current ? `${APP_NAME} - ${current.name}` : APP_NAME;
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
  // 위젯: 상단 바 없이 앱의 위젯 화면만 (탭이 없으면 요약 화면으로)
  if (mode === 'widget' && App) {
    return <App mode="widget" setMode={setMode} widget={widget} setWidget={setWidget} />;
  }
  return (
    <div className="shell">
      <ShellBar
        tabs={tabs}
        active={current?.id}
        setActive={(id) => {
          setActive(id);
          setFresh((f) => f.filter((x) => x !== id));
        }}
        fresh={fresh}
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
