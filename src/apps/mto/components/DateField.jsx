// 날짜 칸: 달력 아이콘 + '10/20 (화)' 형태로 보이고, 누르면 달력이 열린다 (실제 입력은 숨긴 date input)
import { useRef } from 'react';
import { Icon } from '../../../shared/ui.jsx';
import { fmtShort } from '../lib/dates.js';

export default function DateField({ value, onChange, label, placeholder = '날짜', warnEmpty, small }) {
  const ref = useRef(null);
  const open = () => {
    try {
      ref.current?.showPicker?.();
    } catch {
      ref.current?.focus();
    }
  };
  return (
    <span className={`date-field ${value ? 'has' : 'empty'} ${warnEmpty && !value ? 'warn' : ''} ${small ? 'sm' : ''}`} onClick={open}>
      <Icon name="records" size={14} />
      <span className="df-text num">{value ? fmtShort(value) : placeholder}</span>
      {value && (
        <button type="button" className="df-clear" onClick={(e) => { e.stopPropagation(); onChange(''); }} aria-label={`${label || ''} 날짜 지우기`}><Icon name="close" size={11} /></button>
      )}
      <input ref={ref} type="date" className="df-input" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label} tabIndex={0} />
    </span>
  );
}
