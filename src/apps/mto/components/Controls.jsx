// 선택한 묶음의 자주 바꾸는 입력: GDS 입고일, 하루 MTO 수, STEP2 동시 진행 수 (묶음마다 따로 저장)

const uniq = (arr) => [...new Set(arr)];

export function QuickControls({ project, cfg, dispatch, compact = false }) {
  const mtoOpts = uniq([2, 3, cfg.mtoPerDay]).sort((a, b) => a - b);
  const capOpts = uniq([4, 5, cfg.step2Concurrency]).sort((a, b) => (a ?? 1e9) - (b ?? 1e9));
  const custom = project.override && Object.keys(project.override).length > 0;
  return (
    <div className={`mto-controls ${compact ? 'compact' : ''}`}>
      <label className="field gds">
        <span>{project.kind === 'revision' ? 'GDS 입고일' : 'Part A GDS 입고일'}</span>
        <input type="date" className="input num" value={project.gds} onChange={(e) => dispatch({ type: 'gds', value: e.target.value })} />
      </label>
      <div className="field">
        <span>하루 MTO</span>
        <div className="seg" role="group" aria-label="하루 MTO 가능 수">
          {mtoOpts.map((n) => (
            <button key={n} type="button" aria-pressed={cfg.mtoPerDay === n} onClick={() => dispatch({ type: 'override', patch: { mtoPerDay: n } })}>
              {n}장
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>STEP2 동시</span>
        <div className="seg" role="group" aria-label="STEP2 동시 진행 수">
          {capOpts.map((n) => (
            <button key={String(n)} type="button" aria-pressed={cfg.step2Concurrency === n} onClick={() => dispatch({ type: 'override', patch: { step2Concurrency: n } })}>
              {n == null ? '무제한' : `${n}장`}
            </button>
          ))}
        </div>
      </div>
      {custom && !compact && (
        <button type="button" className="link-btn ctl-reset" onClick={() => dispatch({ type: 'clearOverride' })} title="규칙의 기본값으로">
          기본값으로
        </button>
      )}
    </div>
  );
}
