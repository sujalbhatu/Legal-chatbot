import { useEffect, useRef } from 'react';

/** Small accessible confirm dialog (replaces window.confirm). */
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
    const confirmRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        confirmRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;
    return (
        <div className="dialog-backdrop" onClick={onCancel}>
            <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title"
                onClick={(e) => e.stopPropagation()}>
                <h3 id="dialog-title">{title}</h3>
                {message && <p>{message}</p>}
                <div className="dialog-actions">
                    <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                    <button type="button" ref={confirmRef} className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
                        onClick={onConfirm}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
}
