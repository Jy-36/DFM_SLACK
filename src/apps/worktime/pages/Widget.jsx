// 위젯: 바탕화면 위에 띄워 두는 아주 작은 창. 오늘 퇴근 목표 · 진행 · 월말 예상만.
// 설치형에서는 투명 창이라 투명도만큼 뒤가 비치고, 항상 위를 켤 수 있다.
import { fmtDur, fmtClock } from '../lib/time.js';
import { checkoutFor } from '../lib/engine.js';
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

export default function Widget({ state, summary, setMode, widget, setWidget }) {
  const { plans, rules } = state;
  const s = summary;
  const t = s.today;
  const working = t && t.isWorkday && t.inMin != null;
  const targetNet = t ? plans[t.key] ?? s.todayTarget : 0;
  const out = working ? checkoutFor(t, targetNet, rules) : null;
  const pct = working && targetNet ? Math.min(1, t.actual / targetNet) : 0;
  const left = working ? Math.max(0, targetNet - t.actual) : 0;
  const tauri = isTauri();

  return (
    <div className="widget" data-tauri-drag-region>
      <div className="wg-top" data-tauri-drag-region>
        <span className="wg-brand" data-tauri-drag-region>
          <DfmLogo size={18} />
          <span>WorkTime</span>
        </span>
        <span className="wg-actions">
          <button
            type="button"
            className={`wg-btn ${widget.onTop ? 'on' : ''}`}
            onClick={() => setWidget({ onTop: !widget.onTop })}
            disabled={!tauri}
            title={tauri ? (widget.onTop ? '항상 위 끄기' : '항상 위 켜기') : '항상 위는 설치형 앱에서만 됩니다'}
            aria-pressed={widget.onTop}
            aria-label="항상 위"
          >
            <Icon name="pin" size={13} />
          </button>
          <button type="button" className="wg-btn" onClick={() => setMode('compact')} title="요약 화면으로" aria-label="요약 화면으로">
            <Icon name="expand" size={13} />
          </button>
          {tauri && (
            <button type="button" className="wg-btn close" onClick={() => win('close')} title="닫기" aria-label="닫기">
              <Icon name="close" size={13} />
            </button>
          )}
        </span>
      </div>

      <div className="wg-main" data-tauri-drag-region>
        {working ? (
          <>
            <div className="wg-clock-wrap" data-tauri-drag-region>
              <span className="wg-label">{t.live ? '퇴근 목표' : '퇴근'}</span>
              <b className="wg-clock num">{t.live ? fmtClock(out) : fmtClock(t.outMin ?? out)}</b>
            </div>
            <div className="wg-side">
              <span className="num"><small>실근무</small> {fmtDur(t.actual)}</span>
              <span className="num"><small>남은</small> {fmtDur(left)}</span>
            </div>
          </>
        ) : (
          <div className="wg-clock-wrap">
            <span className="wg-label">{t && !t.isWorkday ? t.holiday || '쉬는 날' : '출근 전'}</span>
            <b className="wg-clock num">--:--</b>
          </div>
        )}
      </div>

      <div className="wg-bar" aria-label={`오늘 ${Math.round(pct * 100)}%`}>
        <i style={{ width: `${pct * 100}%` }} />
      </div>

      <div className="wg-foot">
        <span className={`num ${s.projectedDiff < 0 ? 'tone-bad' : 'tone-good'}`}>월말 {fmtDur(s.projectedDiff, { sign: true })}</span>
        <label className="wg-opacity" title="투명도">
          <Icon name="drop" size={12} />
          <input
            type="range"
            id="wg-opacity"
            min="35"
            max="100"
            step="5"
            value={Math.round(widget.opacity * 100)}
            onChange={(e) => setWidget({ opacity: Number(e.target.value) / 100 })}
            aria-label="투명도"
          />
          <span className="num">{Math.round(widget.opacity * 100)}%</span>
        </label>
      </div>
    </div>
  );
}
