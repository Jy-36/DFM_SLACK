// 위젯: 최종 MTO · 다음 MTO · 진행 (WorkTime 위젯과 같은 틀)
import { Icon } from '../../../shared/ui.jsx';
import { DfmLogo } from '../../../shared/Logo.jsx';
import { isTauri } from '../../../shared/platform.js';
import { diffDays, fmtShort, todayIso } from '../lib/dates.js';
import { mtoByDate } from '../lib/report.js';

async function win(action) {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow()[action]();
  } catch {
    /* 창 API를 쓸 수 없는 환경 */
  }
}

export default function Widget({ calc, setMode, widget, setWidget }) {
  const { result } = calc;
  const tauri = isTauri();
  const today = todayIso();
  const next = result ? mtoByDate(result).find((d) => d.date >= today) : null;
  const done = result ? result.layers.filter((l) => l.mtoDate < today).length : 0;
  const pct = result ? Math.min(1, Math.max(0, diffDays(today, result.partAGds) / Math.max(1, result.leadTimeDays))) : 0;

  return (
    <div className="widget" data-tauri-drag-region>
      <div className="wg-top" data-tauri-drag-region>
        <span className="wg-brand" data-tauri-drag-region>
          <DfmLogo size={18} />
          <span>MTO</span>
          {result && <span className="wg-date num">Layer {result.layers.length}장</span>}
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
          <span className="wg-label">최종 MTO</span>
          <b className="wg-clock num">{result ? fmtShort(result.finalMto).replace(/\(.\)/, '') : '--/--'}</b>
        </div>
        {result && (
          <div className="wg-side">
            <span className="num"><small>리드타임</small> {result.leadTimeDays}일</span>
            <span className="num"><small>다음</small> {next ? `${next.date === today ? '오늘' : fmtShort(next.date)} ${next.layers.length}장` : '없음'}</span>
          </div>
        )}
      </div>

      <div className="wg-bar" aria-label={`진행 ${Math.round(pct * 100)}%`}><i style={{ width: `${pct * 100}%` }} /></div>

      <div className="wg-foot">
        <span className="num">{result ? `MTO ${done}/${result.layers.length}` : 'Layer List 없음'}</span>
        <label className="wg-opacity" title="투명도">
          <Icon name="drop" size={12} />
          <input type="range" min="35" max="100" step="5" value={Math.round(widget.opacity * 100)} onChange={(e) => setWidget({ opacity: Number(e.target.value) / 100 })} aria-label="투명도" />
          <span className="num">{Math.round(widget.opacity * 100)}%</span>
        </label>
      </div>
    </div>
  );
}
