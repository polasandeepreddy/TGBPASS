import React, { useState, useEffect, useCallback } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

const LABELS = { pending: 'Pending', self_reported: 'Self-reported', verified: 'Verified' };
const COLORS = {
  pending: ['#fef3c7', '#92400e'],
  self_reported: ['#e0f2fe', '#075985'],
  verified: ['#dcfce7', '#166534']
};
const fmt = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : '—');

export default function DonationsView({ onShowToast }) {
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ donations: [], summary: {} });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getAdminDonations(status));
    } catch (e) {
      onShowToast?.(e.message, 'error');
    }
    setLoading(false);
  }, [status, onShowToast]);

  useEffect(() => { load(); }, [load]);

  const verify = async (ref) => {
    if (!window.confirm(`Mark ${ref} as verified? Only do this after matching it with your bank/UPI statement.`)) return;
    try {
      await api.verifyDonation(ref);
      onShowToast?.('Donation marked verified', 'success');
      load();
    } catch (e) {
      onShowToast?.(e.message, 'error');
    }
  };

  const exportCsv = async () => {
    try { await api.downloadDonationsCsv(status); } catch (e) { onShowToast?.(e.message, 'error'); }
  };

  return (
    <div className="glass-card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Donations</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" className="btn-secondary" onClick={exportCsv} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Download size={15} /><span>Export CSV</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {Object.keys(LABELS).map((k) => (
          <div key={k} style={{ background: COLORS[k][0], color: COLORS[k][1], borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{LABELS[k]}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>₹{(data.summary[k]?.amount || 0).toLocaleString('en-IN')}</div>
            <div style={{ fontSize: '0.78rem' }}>{data.summary[k]?.count || 0} donation(s)</div>
          </div>
        ))}
      </div>

      <div className="table-container" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th><th>Amount</th><th>Status</th><th>Donor</th>
              <th>Reported UPI Txn ID</th><th>Created</th><th>Verified</th><th />
            </tr>
          </thead>
          <tbody>
            {data.donations.map((d) => (
              <tr key={d.ref}>
                <td><code>{d.ref}</code></td>
                <td>₹{d.amount.toLocaleString('en-IN')}</td>
                <td><span style={{ background: COLORS[d.status][0], color: COLORS[d.status][1], padding: '2px 8px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700 }}>{LABELS[d.status]}</span></td>
                <td>
                  {d.name || d.email || d.phone ? (
                    <div style={{ fontSize: '0.82rem' }}>{[d.name, d.email, d.phone].filter(Boolean).join(' · ')}</div>
                  ) : <span style={{ color: '#94a3b8' }}>Anonymous</span>}
                </td>
                <td>{d.utr || '—'}</td>
                <td>{fmt(d.created_at)}</td>
                <td>{fmt(d.verified_at)}</td>
                <td>
                  {d.status !== 'verified' && (
                    <button type="button" className="table-action-btn" onClick={() => verify(d.ref)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} /><span>Verify</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && data.donations.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>No donations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
