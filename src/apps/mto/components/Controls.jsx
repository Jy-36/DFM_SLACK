// 자주 바꾸는 입력: GDS 입고일, 하루 MTO 수, STEP2 동시 진행 수 (현황·요약 화면 공용)

const uniq = (arr) => [...new Set(arr)];

export function QuickControls({ state, dispatch, compact = false }) {
  const c = state.config;
  const mtoOpts = uniq([2, 3, c.mtoPerDay]).sort((a, b) => a - b);
  const capOpts = uniq([4, 5, c.step2Concurrency]).sort((a, b) => (a ?? 1e9) - (b ?? 1e9));
  return (
    <div className={`mto-controls ${compact ? 'compact' : ''}`}>
      <label className="field gds">
        <span>Part A GDS 입고일</span>
        <input type="date" className="input num" value={state.gds} onChange={(e) => dispatch({ type: 'gds', value: e.target.value })} />
      </label>
      <div className="field">
        <span>하루 MTO</span>
        <div className="seg" role="group" aria-label="하루 MTO 가능 수">
          {mtoOpts.map((n) => (
            <button key={n} type="button" aria-pressed={c.mtoPerDay === n} onClick={() => dispatch({ type: 'config', patch: { mtoPerDay: n } })}>
              {n}장
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>STEP2 동시</span>
        <div className="seg" role="group" aria-label="STEP2 동시 진행 수">
          {capOpts.map((n) => (
            <button key={String(n)} type="button" aria-pressed={c.step2Concurrency === n} onClick={() => dispatch({ type: 'config', patch: { step2Concurrency: n } })}>
              {n == null ? '무제한' : `${n}장`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
