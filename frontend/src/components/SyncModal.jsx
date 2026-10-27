import React, { useState } from 'react';
import { X, ArrowLeftRight, CheckCircle2, AlertCircle, Database, Layers } from 'lucide-react';
import { api } from '../services/api';

export default function SyncModal({ onClose, onSyncComplete, onShowToast }) {
  const [limit, setLimit] = useState(1000);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.syncToMysql(limit);
      setResult(res.message);
      if (onSyncComplete) onSyncComplete();
      if (onShowToast) onShowToast(res.message || 'Database sync completed successfully!', 'success');
    } catch (err) {
      setError(err.message || 'Sync operation failed');
      if (onShowToast) onShowToast(err.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <ArrowLeftRight size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Database Synchronization Wizard</h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>CSV Archive → MySQL Cluster Ingestion</div>
            </div>
          </div>

          <button className="icon-btn" onClick={onClose} disabled={syncing}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.88rem', lineHeight: 1.5 }}>
            Synchronize verified records from <code>all_proposals.csv</code> directly into your live MySQL <code>proposals</code> database table using high-speed batch operations with duplicate protection.
          </p>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Select Batch Record Limit:
            </label>
            <select 
              className="filter-select" 
              style={{ width: '100%', padding: '10px 14px' }}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={syncing}
            >
              <option value={500}>⚡ 500 Records (Fast Sync ~1s)</option>
              <option value={1000}>⭐ 1,000 Records (Recommended Standard ~2s)</option>
              <option value={5000}>📦 5,000 Records (Extended Batch ~8s)</option>
              <option value={20000}>🚀 20,000 Records (Major Sync ~25s)</option>
              <option value={90000}>🌐 All 86,500+ Records (Full Master Synchronization)</option>
            </select>
          </div>

          {result && (
            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', padding: '14px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success-text)', fontSize: '0.88rem', marginBottom: '14px' }}>
              <CheckCircle2 size={18} />
              <span>{result}</span>
            </div>
          )}

          {error && (
            <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '14px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--danger-text)', fontSize: '0.88rem', marginBottom: '14px' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="page-btn" onClick={onClose} disabled={syncing}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSync} disabled={syncing}>
            <ArrowLeftRight size={16} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Synchronizing Records...' : 'Start Ingestion'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
