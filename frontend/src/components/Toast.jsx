import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const type = toast.type || 'info';
        return (
          <div key={toast.id} className={`toast ${type}`}>
            {type === 'success' && <CheckCircle2 size={18} color="var(--success)" />}
            {type === 'error' && <AlertCircle size={18} color="var(--danger)" />}
            {type === 'info' && <Info size={18} color="var(--accent-sky)" />}

            <div style={{ flex: 1 }}>
              {toast.title && <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{toast.title}</div>}
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{toast.message}</div>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex'
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
