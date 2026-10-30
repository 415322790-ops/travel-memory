import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ConfirmDialog({ title, description, confirmLabel = '确认删除', theme = 'film', returnFocusTarget, fallbackFocusSelector, onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = returnFocusTarget || document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      window.requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return;
        const target = previousFocus?.isConnected && !previousFocus.disabled
          ? previousFocus
          : document.querySelector(fallbackFocusSelector || 'button:not(:disabled)');
        target?.focus?.();
      });
    };
  }, [fallbackFocusSelector, returnFocusTarget]);

  return createPortal(
    <dialog
      ref={dialogRef}
      className={`travel-confirm-dialog is-${theme}`}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <span className="travel-confirm-dialog__kicker">TRAVEL MEMORY / ARCHIVE</span>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="travel-confirm-dialog__actions">
        <button ref={cancelRef} type="button" className="travel-confirm-dialog__cancel" onClick={onCancel}>取消</button>
        <button type="button" className="travel-confirm-dialog__danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>,
    document.body,
  );
}
