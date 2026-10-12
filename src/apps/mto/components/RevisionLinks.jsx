// 관련 자료 링크: 이름 + 주소 (http · https · file · \\공유 폴더). 누르면 브라우저 · 탐색기로 연다.
import { useState } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { openExternal } from '../../../shared/platform.js';

const okUrl = (u) => /^(https?:\/\/|file:\/\/|\\\\)/i.test(u.trim());
const lid = () => `l${Math.random().toString(36).slice(2, 8)}`;

export default function RevisionLinks({ project, dispatch, notify }) {
  const links = project.links || [];
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const set = (next) => dispatch({ type: 'updateProject', id: project.id, patch: { links: next } });
  const add = () => {
    const u = url.trim();
    if (!okUrl(u)) return notify?.('http(s)://, file://, \\\\공유폴더 주소만 넣을 수 있어요');
    set([...links, { id: lid(), title: title.trim() || u, url: u }]);
    setTitle('');
    setUrl('');
  };
  const open = async (l) => {
    try {
      await openExternal(l.url);
    } catch (e) {
      notify?.(`열지 못했어요 · ${e}`);
    }
  };
  return (
    <section className="panel links">
      <div className="chg-title"><h2>Links</h2></div>
      {links.length > 0 && (
        <div className="lk-list">
          {links.map((l) => (
            <div key={l.id} className="lk-row">
              <Icon name="link" size={15} />
              <button type="button" className="lk-title" onClick={() => open(l)} title={l.url}>{l.title}</button>
              <span className="lk-url small muted">{l.url}</span>
              <button type="button" className="icon-btn sm" onClick={() => set(links.filter((x) => x.id !== l.id))} aria-label={`${l.title} 지우기`}><Icon name="close" size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="lk-add" onKeyDown={(e) => e.key === 'Enter' && add()}>
        <input className="input lk-in-title" value={title} placeholder="이름" onChange={(e) => setTitle(e.target.value)} aria-label="링크 이름" />
        <input className="input lk-in-url" value={url} placeholder="https://… 또는 \\서버\폴더" onChange={(e) => setUrl(e.target.value)} aria-label="링크 주소" />
        <button type="button" className="btn small-btn" disabled={!url.trim()} onClick={add}><Icon name="plus" size={13} /> 추가</button>
      </div>
    </section>
  );
}
