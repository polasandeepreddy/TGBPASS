import React, { useState, useEffect } from 'react';
import { 
  FolderCheck, 
  FileCheck2, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  HardDrive, 
  Search, 
  Eye, 
  Download, 
  RefreshCw,
  FolderOpen,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { api } from '../services/api';

export default function DocumentAuditView({ dataSource, onOpenPdf, onSelectProposal, onShowToast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testFileNo, setTestFileNo] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    fetchAuditStats();
  }, [dataSource]);

  const fetchAuditStats = async () => {
    setLoading(true);
    try {
      const data = await api.getStats(dataSource);
      setStats(data);
    } catch (err) {
      console.error('Failed to load audit stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestLookup = async (e) => {
    e.preventDefault();
    if (!testFileNo.trim()) return;

    setTestLoading(true);
    setTestResult(null);
    try {
      const data = await api.getProposalDetail(testFileNo.trim());
      setTestResult(data);
    } catch (err) {
      setTestResult({ error: 'Proposal not found or could not be verified in Google Drive Cloud Storage.' });
    } finally {
      setTestLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
        <div className="live-pulse" style={{ marginBottom: '16px', width: '12px', height: '12px' }}></div>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Auditing Google Drive Cloud Document Archives...
        </div>
      </div>
    );
  }

  const total = stats.total_proposals || 0;
  const completed = stats.completed || 0;
  const procDownloaded = stats.proc_downloaded || 0;
  const drawDownloaded = stats.draw_downloaded || 0;
  const procMissing = total - procDownloaded;
  const drawMissing = total - drawDownloaded;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-card" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <ShieldCheck size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Document Vault & Physical PDF Audit</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '4px 0 0' }}>
              Comprehensive integrity audit of <strong>Proceeding Letters</strong> and <strong>Approved Drawing PDFs</strong> stored across proposal folders.
            </p>
          </div>
        </div>
      </div>

      {/* Audit Metric Cards */}
      <div className="stats-grid">
        <div className="glass-card stat-card success">
          <div className="stat-header">
            <span className="stat-title">Full Document Integrity</span>
            <CheckCircle2 size={20} color="var(--success)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--success-text)' }}>
            {((completed / (total || 1)) * 100).toFixed(1)}%
          </div>
          <div className="stat-footer">
            <span>{completed.toLocaleString()} / {total.toLocaleString()} proposals</span>
          </div>
        </div>

        <div className="glass-card stat-card info">
          <div className="stat-header">
            <span className="stat-title">Proceeding Letters Available</span>
            <FileCheck2 size={20} color="var(--accent-primary)" />
          </div>
          <div className="stat-value">{procDownloaded.toLocaleString()}</div>
          <div className="stat-footer">
            <span style={{ color: 'var(--success-text)' }}>{((procDownloaded / (total || 1)) * 100).toFixed(1)}% available</span>
          </div>
        </div>

        <div className="glass-card stat-card purple">
          <div className="stat-header">
            <span className="stat-title">Drawing PDFs Available</span>
            <FileSpreadsheet size={20} color="var(--accent-purple)" />
          </div>
          <div className="stat-value">{drawDownloaded.toLocaleString()}</div>
          <div className="stat-footer">
            <span style={{ color: 'var(--accent-purple)' }}>{((drawDownloaded / (total || 1)) * 100).toFixed(1)}% available</span>
          </div>
        </div>

        <div className="glass-card stat-card warning">
          <div className="stat-header">
            <span className="stat-title">Missing Blueprint Drawings</span>
            <AlertCircle size={20} color="var(--warning)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--warning-text)' }}>{drawMissing.toLocaleString()}</div>
          <div className="stat-footer">
            <span>Requires drawing scraper scan</span>
          </div>
        </div>
      </div>

      {/* Interactive Physical File Inspector & Tester */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HardDrive size={18} color="var(--accent-sky)" />
          <span>Google Drive Cloud Document Verifier</span>
        </h3>

        <form onSubmit={handleTestLookup} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div className="search-wrapper" style={{ flex: 1 }}>
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Enter exact File Number (e.g. 000483/GHMC/0224/KPL2/2025-BP) to test files in Google Drive Cloud..."
              value={testFileNo}
              onChange={(e) => setTestFileNo(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={testLoading || !testFileNo.trim()}>
            {testLoading ? 'Verifying...' : 'Verify in Google Drive'}
          </button>
        </form>

        {testResult && (
          <div style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-glass-hover)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {testResult.error ? (
              <div style={{ color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} />
                <span>{testResult.error}</span>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--accent-sky)', fontFamily: 'var(--font-mono)' }}>{testResult.file_number}</h4>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Folder: <code>{testResult.folder_name}</code>
                    </div>
                  </div>
                  <button 
                    className="table-action-btn"
                    onClick={() => onSelectProposal(testResult.file_number)}
                  >
                    <Eye size={14} />
                    <span>View Dossier</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {/* Proceeding Letter status */}
                  <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600 }}>Proceeding Letter</span>
                      <span className={`doc-pill ${testResult.proceeding_letter_status === 'Downloaded' ? 'downloaded' : 'not-available'}`}>
                        {testResult.proceeding_letter_status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      File: {testResult.proceeding_letter_file || 'Proceeding_Letter.pdf'}
                    </div>
                    {testResult.proceeding_letter_status === 'Downloaded' && (
                      <button 
                        className="btn-primary" 
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => onOpenPdf(testResult.folder_name, testResult.proceeding_letter_file || 'Proceeding_Letter.pdf', 'Proceeding Letter', testResult.file_number)}
                      >
                        <Eye size={14} />
                        <span>Preview Letter PDF</span>
                      </button>
                    )}
                  </div>

                  {/* Drawing PDF status */}
                  <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600 }}>Drawing Blueprint PDF</span>
                      <span className={`doc-pill ${testResult.drawing_pdf_status === 'Downloaded' ? 'downloaded' : 'not-available'}`}>
                        {testResult.drawing_pdf_status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      File: {testResult.drawing_pdf_file || 'Drawing.pdf'}
                    </div>
                    {testResult.drawing_pdf_status === 'Downloaded' && (
                      <button 
                        className="btn-primary" 
                        style={{ width: '100%', justifyContent: 'center', background: 'var(--gradient-purple)' }}
                        onClick={() => onOpenPdf(testResult.folder_name, testResult.drawing_pdf_file || 'Drawing.pdf', 'Drawing PDF', testResult.file_number)}
                      >
                        <Eye size={14} />
                        <span>Preview Blueprint PDF</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
