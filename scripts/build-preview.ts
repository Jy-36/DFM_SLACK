// 소스(src/)를 한 장짜리 HTML 미리보기로 묶는다. (bun run scripts/build-preview.ts)
// React는 CDN UMD 전역을 쓰고, 각 모듈의 import/export만 걷어내 이어 붙인다.
const ORDER = [
  'src/shared/platform.js',
  'src/shared/edition.js',
  'src/apps/worktime/lib/time.js',
  'src/shared/holidays.js',
  'src/apps/worktime/lib/rules.js',
  'src/apps/worktime/lib/mockData.js',
  'src/apps/worktime/lib/sync.js',
  'src/apps/worktime/lib/engine.js',
  'src/apps/worktime/lib/store.js',
  'src/shared/prefs.js',
  'src/shared/ui.jsx',
  'src/shared/Logo.jsx',
  'src/shared/TimeField.jsx',
  'src/apps/worktime/components/LeaveSelect.jsx',
  'src/apps/worktime/components/Targets.jsx',
  'src/apps/worktime/pages/Mini.jsx',
  'src/apps/worktime/pages/Widget.jsx',
  'src/apps/worktime/pages/Dashboard.jsx',
  'src/apps/worktime/pages/Records.jsx',
  'src/apps/worktime/pages/Planner.jsx',
  'src/apps/worktime/pages/Sync.jsx',
  'src/apps/worktime/pages/Settings.jsx',
  'src/apps/worktime/WorkTime.jsx',
  'src/shell/apps.js',
  'src/shell/ShellBar.jsx',
  'src/shell/Shell.jsx',
];

const tr = new Bun.Transpiler({
  loader: 'jsx',
  target: 'browser',
  tsconfig: { compilerOptions: { jsx: 'react', jsxFactory: 'React.createElement', jsxFragmentFactory: 'React.Fragment' } },
});

let js = 'const { useState, useEffect, useMemo, useReducer, useRef, useCallback } = React;\n';
for (const f of ORDER) {
  const src = await Bun.file(f).text();
  let out = tr.transformSync(src);
  // 이 미리보기는 WorkTime만 묶는다 (MTO 탭은 모듈이 많아 이어 붙이기 방식으로는 이름이 겹침 → npm run dev로 확인)
  if (f === 'src/shell/apps.js') out = out.replace(/\{\s*id: "mto"[\s\S]*?component: Mto\s*\},?/, '');
  out = out
    .split('\n')
    .filter((l) => !/^import\s.+from\s.+;?\s*$/.test(l) && !/^import\s+['"].+['"];?\s*$/.test(l))
    .join('\n')
    .replace(/^export default function /gm, 'function ')
    .replace(/^export (function|const|let|class|async function) /gm, '$1 ')
    .replace(/^export \{[^}]*\};?\s*$/gm, '');
  if (/^\s*export\s/m.test(out) || /^\s*import\s/m.test(out)) throw new Error(`남은 import/export: ${f}`);
  js += `\n// ── ${f}\n${out}\n`;
}
js += '\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Shell));\n';

const css = await Bun.file('src/styles.css').text();
const favicon = 'data:image/png;base64,' + Buffer.from(await Bun.file('public/favicon-192.png').arrayBuffer()).toString('base64');
const html = `<title>DFM Slack</title>
${favicon ? `<link rel="icon" type="image/png" href="${favicon}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`;
await Bun.write('preview/worktime-preview.html', html);
await Bun.write('preview/app.js', js);
console.log('preview written', html.length);
