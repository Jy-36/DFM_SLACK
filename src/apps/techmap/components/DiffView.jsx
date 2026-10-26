// 세 파일의 unified diff
import { useState } from 'react';

export default function DiffView({ res }) {
  const [file, setFile] = useState('tf');
  const count = (k) => (res.diffs[k].match(/^[+-](?![+-]{2} )/gm) || []).length;
  const lines = res.diffs[file] ? res.diffs[file].replace(/\n$/, '').split('\n') : [];
  return (
    <section className="panel">
      <h2>
        파일 변경
        <div className="seg" role="group" aria-label="파일">
          {['tf', 'layermap', 'drf'].map((k) => (
            <button key={k} type="button" aria-pressed={file === k} onClick={() => setFile(k)}>
              {res.names[k]} <span className="num">{count(k)}</span>
            </button>
          ))}
        </div>
      </h2>
      {lines.length ? (
        <div className="tm-diff">
          {lines.map((l, i) => {
            const cls = l.startsWith('@@') || l.startsWith('+++') || l.startsWith('---') ? 'h' : l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : '';
            return <div key={i} className={cls}>{l || ' '}</div>;
          })}
        </div>
      ) : (
        <p className="empty">이 파일은 바뀌는 줄이 없어요.</p>
      )}
    </section>
  );
}
