// 근태 선택: 시간 연차를 고르면 2시간 단위 버튼(2h·4h·6h)이 붙는다.
import { LEAVE_ORDER } from '../lib/rules.js';

export function LeaveSelect({ id, rules, leave, leaveMin, onChange, allowKeep = false, width = 132, ariaLabel }) {
  const value = leave ?? (allowKeep ? '__keep' : '');
  const hourly = rules.leaveTypes.hourly;
  const steps = [];
  if (hourly) for (let m = hourly.step || 120; m <= (hourly.max || 360); m += hourly.step || 120) steps.push(m);
  const current = leaveMin ?? hourly?.credit ?? 120;

  return (
    <span className="leave-select">
      <select
        className="input"
        id={id}
        style={{ width }}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__keep') onChange(undefined, undefined);
          else if (v === 'hourly') onChange('hourly', current);
          else onChange(v || null, undefined);
        }}
      >
        {allowKeep && <option value="__keep">바꾸지 않음</option>}
        <option value="">{allowKeep ? '근무 (휴가 해제)' : '근무'}</option>
        {LEAVE_ORDER.filter((k) => rules.leaveTypes[k]).map((k) => (
          <option key={k} value={k}>{rules.leaveTypes[k].label}</option>
        ))}
      </select>
      {leave === 'hourly' && (
        <span className="seg hours" role="group" aria-label="시간 연차 시간">
          {steps.map((m) => (
            <button key={m} type="button" aria-pressed={current === m} onClick={() => onChange('hourly', m)}>
              {m / 60}h
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
