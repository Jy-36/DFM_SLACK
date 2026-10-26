// 위젯: 지금 작업의 검토 필요 · ERROR · 점검 (MTO · WorkTime 위젯과 같은 틀)
import { Icon } from '../../../shared/ui.jsx';
import { DfmLogo } from '../../../shared/Logo.jsx';
import { isTauri } from '../../../shared/platform.js';

async function win(action) {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow()[action]();
  } catch {
    /* 창 API를 쓸 수 없는 환경 */
  }
}

export default function Widget({ rev, c, setMode, widget, setWidget }) {
  const tauri = isTauri();
  const ok = c && !c.error;
  const total = ok ? c.res.items.length : 0;
  const pct = total ? c.applied.length / total : 0;
  const errs = ok ? c.checks.filter((x) => x.level === 'error').length : 0;
  return (
    <div className="widget" data-tauri-drag-region>
      <div className="wg-top" data-tauri-drag-region>
        <span className="wg-brand" data-tauri-drag-region>
          <DfmLogo size={18} />
          <span>Techmap</span>
          <span className="wg-date tm-wg-date">{rev ? (rev.kind === 'dk' ? rev.ver : `${rev.process} Master`) : '작업 없음'}</span>
        </span>
        <span className="wg-actions">
          <button type="button" className={`wg-btn ${widget.onTop ? 'on' : ''}`} onClick={() => setWidget({ onTop: !widget.onTop })} disabled={!tauri}
            title={tauri ? (widget.onTop ? '항상 위 끄기' : '항상 위 켜기') : '항상 위는 설치형 앱에서만 됩니다'} aria-pressed={widget.onTop} aria-label="항상 위">
            <Icon name="pin" size={13} />
          </button>
          <button type="button" className="wg-btn" onClick={() => setMode('compact')} title="App Mode · 오른쪽에 붙는 요약 화면" aria-label="App Mode"><Icon name="appMode" size={13} /></button>
          <button type="button" className="wg-btn" onClick={() => setMode('full')} title="Window Mode · 넓은 창, 전체 메뉴" aria-label="Window Mode"><Icon name="windowMode" size={13} /></button>
          {tauri && <button type="button" className="wg-btn close" onClick={() => win('close')} title="닫기" aria-label="닫기"><Icon name="close" size={13} /></button>}
        </span>
      </div>
      <div className="wg-main" data-tauri-drag-region>
        <div className="wg-clock-wrap" data-tauri-drag-region>
          <span className="wg-label">검토 필요</span>
          <b className="wg-clock num">{ok ? c.counts.NEEDS_REVIEW : '-'}</b>
        </div>
        {ok && (
          <div className="wg-side">
            <span className="num"><small>ERROR</small> {c.counts.ERROR}</span>
            <span className="num"><small>점검</small> {errs}</span>
          </div>
        )}
      </div>
      <div className="wg-bar" aria-label={`반영 예정 ${Math.round(pct * 100)}%`}><i style={{ width: `${pct * 100}%` }} /></div>
      <div className="wg-foot">
        <span className="num">{ok ? `반영 ${c.applied.length}/${total}` : '작업을 열어 주세요'}</span>
        <label className="wg-opacity" title="투명도">
          <Icon name="drop" size={12} />
          <input type="range" min="35" max="100" step="5" value={Math.round(widget.opacity * 100)} onChange={(e) => setWidget({ opacity: Number(e.target.value) / 100 })} aria-label="투명도" />
          <span className="num">{Math.round(widget.opacity * 100)}%</span>
        </label>
      </div>
    </div>
  );
}
