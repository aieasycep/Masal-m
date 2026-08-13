'use client';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
