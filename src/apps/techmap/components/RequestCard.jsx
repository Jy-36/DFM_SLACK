// Request 한 건: 상태 · 검사 결과 · 바뀔 줄(파일:줄, 변경 전/후) · 반영 체크
import { Pill } from '../../../shared/ui.jsx';
import { FILE_LABEL, STATUS, TYPE_LABEL, cssColor } from '../lib/view.js';

const ORDER = { tf: 0, layermap: 1, drf: 2 };
const SIGN = { add: '+', modify: '~', retire: '−' };
const LV = { info: ['INFO', 'neutral'], review: ['검토', 'warn'], error: ['ERROR', 'bad'] };

export function Swatch({ name, colors, label = name }) {
  if (!name) return null;
  const c = cssColor(name, colors);
  return (
    <span className="tm-sw">
      <i style={{ background: c || 'transparent' }} />
      {label}
    </span>
  );
}

export default function RequestCard({ item, colors, locked, onToggle }) {
  const f = item.fields || {};
  const changes = [...item.changes].sort((a, b) => ORDER[a.file] - ORDER[b.file] || a.line - b.line);
  const dis = item.status === 'ERROR' || locked;
  return (
    <article className={`tm-card s-${item.status}`}>
      <header className="tm-card-head">
        <b className="tm-rid">{item.id}</b>
        <span className="tm-type">{TYPE_LABEL[item.type] || item.type}</span>
        <span className="tm-lpp">{item.optionOp || item.type?.startsWith('OPTION') ? item.fields.layer : item.lpp}</span>
        {item.fields.option && <span className="tm-type">Option {item.fields.option}</span>}
        {(f.fill_color || f.stipple || f.linestyle) && (
          <span className="tm-disp">
            {f.fill_color && <Swatch name={f.fill_color} colors={colors} />}
            {f.stipple && <span>· {f.stipple}</span>}
            {f.linestyle && <span>· {f.linestyle}</span>}
          </span>
        )}
        <span className="tm-spacer" />
        <span className="small muted">엑셀 {item.row}행</span>
        <Pill tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Pill>
      </header>
      {(f.requester || f.reason) && (
        <p className="tm-reason">
          {f.requester}
          {f.requester && f.reason ? ' · ' : ''}
          {f.reason}
        </p>
      )}
      {item.checks.length > 0 && (
        <ul className="tm-checks">
          {item.checks.map((c, i) => (
            <li key={i}>
              <span className={`tm-lv ${LV[c.level][1]}`}>{LV[c.level][0]}</span>
              <span>{c.msg}</span>
            </li>
          ))}
        </ul>
      )}
      {changes.length > 0 && (
        <div className={`tm-chg ${item.included ? '' : 'preview'}`}>
          {!item.included && <div className="tm-chg-note">미리보기 · 아직 반영되지 않은 변경</div>}
          {changes.map((c, i) => (
            <div key={i} className="tm-chg-group">
              {c.action !== 'add' && c.before && (
                <div className="tm-row before">
                  <span className="sg" />
                  <span className="loc">{c.where}</span>
                  <span className="code">{c.before.trim()}</span>
                </div>
              )}
              <div className={`tm-row ${c.action}`}>
                <span className="sg">{SIGN[c.action]}</span>
                <span className="loc" title={c.where}>{FILE_LABEL[c.file]}:{c.line}</span>
                <span className="code">{c.text.trim()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <footer className="tm-card-foot">
        <label className={`tm-toggle ${dis ? 'off' : ''}`}>
          <input type="checkbox" checked={item.included} disabled={dis} onChange={(e) => onToggle(item.id, e.target.checked)} />
          {item.status === 'ERROR' ? '반영 불가 · 엑셀을 고쳐 다시 올려 주세요' : locked ? (item.included ? '반영됨' : '반영 안 함') : item.included ? '반영' : '반영하기'}
        </label>
      </footer>
    </article>
  );
}
