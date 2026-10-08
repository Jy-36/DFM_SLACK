// 팝업: 화면 가운데 작은 창 (Esc · 바깥 누르면 닫힘)
import { useEffect } from 'react';
import { Icon } from '../../../shared/ui.jsx';

export function Modal({ title, onClose, children, footer, width = 460 }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width: `min(${width}px, calc(100vw - 32px))` }}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="닫기"><Icon name="close" size={14} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** 확인 팝업: 확인을 눌러야 실행 */
export function Confirm({ title, message, confirmLabel = '확인', danger, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>취소</button>
          <button type="button" className={`btn primary ${danger ? 'danger-fill' : ''}`} autoFocus onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </>
      }
    >
      <div className="small">{message}</div>
    </Modal>
  );
}
