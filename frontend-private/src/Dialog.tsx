import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider dialog for dense content (the task form, the assistant). */
  size?: 'normal' | 'wide' | 'full';
}

/** A modal on the native <dialog> element: Escape and the backdrop close it, focus is trapped by the browser. */
export function Dialog({ open, onClose, title, subtitle, children, footer, size = 'normal' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="modal-body">
          <header className="modal-header">
            <div>
              <h2>{title}</h2>
              {subtitle && <div className="muted small">{subtitle}</div>}
            </div>
            <button type="button" className="link modal-close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </header>
          <div className="modal-content">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
