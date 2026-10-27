import React from 'react';
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  FileCheck2, 
  FileSpreadsheet, 
  TrendingUp, 
  Database, 
  Layers, 
  Activity 
} from 'lucide-react';

export default function StatsCards({ stats, activeFilter, onFilterChange }) {
  if (!stats) return null;

  const total = stats.total_proposals || 0;
  const completed = stats.completed || 0;
  const partial = stats.partial || 0;
  const failed = stats.failed || 0;
  const procDownloaded = stats.proc_downloaded || 0;
  const drawDownloaded = stats.draw_downloaded || 0;

  const completedPct = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';
  const partialPct = total > 0 ? ((partial / total) * 100).toFixed(1) : '0.0';
  const failedPct = total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0';
  const procPct = total > 0 ? ((procDownloaded / total) * 100).toFixed(1) : '0.0';
  const drawPct = total > 0 ? ((drawDownloaded / total) * 100).toFixed(1) : '0.0';

  const handleCardClick = (filterType, filterVal) => {
    if (!onFilterChange) return;
    if (activeFilter?.[filterType] === filterVal) {
      // Toggle off if already selected
      onFilterChange({ [filterType]: '' });
    } else {
      onFilterChange({ [filterType]: filterVal });
    }
  };

  return (
    <div>
      {/* Top System Status Bar */}
      <div className="system-status-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div className="status-pill" style={{ background: stats.mysql_connected ? 'var(--success-bg)' : 'var(--warning-bg)', color: stats.mysql_connected ? 'var(--success-text)' : 'var(--warning-text)' }}>
            <span className={`live-pulse ${stats.mysql_connected ? '' : 'warning'}`}></span>
            <span>{stats.mysql_connected ? 'MySQL Live Cluster (Port 3306)' : 'CSV Archive Standalone Mode'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={14} color="var(--accent-sky)" />
            <span>Indexed Records: <strong>{total.toLocaleString()}</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={14} color="var(--accent-purple)" />
            <span>Data Engine: <strong>{stats.source}</strong></span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem' }}>
          <span>Fulfillment Efficiency: <strong style={{ color: 'var(--success-text)' }}>{completedPct}%</strong></span>
          <span>•</span>
          <span>Proceeding Coverage: <strong style={{ color: 'var(--accent-sky)' }}>{procPct}%</strong></span>
          <span>•</span>
          <span>Drawings Coverage: <strong style={{ color: 'var(--accent-purple)' }}>{drawPct}%</strong></span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="stats-grid">
        {/* 1. Total Proposals */}
        <div 
          className={`glass-card stat-card info ${!activeFilter?.status && !activeFilter?.proc_status && !activeFilter?.draw_status ? 'active-filter' : ''}`}
          onClick={() => onFilterChange && onFilterChange({ status: '', proc_status: '', draw_status: '', authority: '', year: '' })}
          title="Click to reset all filters"
        >
          <div className="stat-header">
            <span className="stat-title">Total Indexed</span>
            <div className="stat-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <FileText size={20} />
            </div>
          </div>
          <div className="stat-value">{total.toLocaleString()}</div>
          <div className="stat-progress-bg">
            <div className="stat-progress-fill" style={{ width: '100%', background: 'var(--accent-sky)' }}></div>
          </div>
          <div className="stat-footer">
            <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
              All records loaded
            </span>
            <span>Click to reset</span>
          </div>
        </div>

        {/* 2. Completed (Both PDFs Available) */}
        <div 
          className={`glass-card stat-card success ${activeFilter?.status === 'Completed' ? 'active-filter' : ''}`}
          onClick={() => handleCardClick('status', 'Completed')}
          title="Click to filter Completed proposals"
        >
          <div className="stat-header">
            <span className="stat-title">Completed (Full)</span>
            <div className="stat-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="stat-value" style={{ color: 'var(--success-text)' }}>{completed.toLocaleString()}</div>
          <div className="stat-progress-bg">
            <div className="stat-progress-fill" style={{ width: `${completedPct}%`, background: 'var(--success)' }}></div>
          </div>
          <div className="stat-footer">
            <span style={{ color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={13} />
              <strong>{completedPct}%</strong> of total
            </span>
            <span>Both PDFs verified</span>
          </div>
        </div>

        {/* 3. Partially Completed */}
        <div 
          className={`glass-card stat-card warning ${activeFilter?.status === 'Partially Completed' ? 'active-filter' : ''}`}
          onClick={() => handleCardClick('status', 'Partially Completed')}
          title="Click to filter Partially Completed proposals"
        >
          <div className="stat-header">
            <span className="stat-title">Partially Completed</span>
            <div className="stat-icon" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="stat-value" style={{ color: 'var(--warning-text)' }}>{partial.toLocaleString()}</div>
          <div className="stat-progress-bg">
            <div className="stat-progress-fill" style={{ width: `${partialPct}%`, background: 'var(--warning)' }}></div>
          </div>
          <div className="stat-footer">
            <span>{partialPct}% missing 1 document</span>
            <span>Partial match</span>
          </div>
        </div>

        {/* 4. Failed / Not Found */}
        <div 
          className={`glass-card stat-card danger ${activeFilter?.status === 'Failed' ? 'active-filter' : ''}`}
          onClick={() => handleCardClick('status', 'Failed')}
          title="Click to filter Failed proposals"
        >
          <div className="stat-header">
            <span className="stat-title">Failed / Not Found</span>
            <div className="stat-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              <XCircle size={20} />
            </div>
          </div>
          <div className="stat-value" style={{ color: 'var(--danger-text)' }}>{failed.toLocaleString()}</div>
          <div className="stat-progress-bg">
            <div className="stat-progress-fill" style={{ width: `${failedPct}%`, background: 'var(--danger)' }}></div>
          </div>
          <div className="stat-footer">
            <span>{failedPct}% no docs found</span>
            <span>Needs rescan</span>
          </div>
        </div>

        {/* 5. Proceeding Letters */}
        <div 
          className={`glass-card stat-card info ${activeFilter?.proc_status === 'Downloaded' ? 'active-filter' : ''}`}
          onClick={() => handleCardClick('proc_status', 'Downloaded')}
          title="Click to filter proposals with Proceeding Letters"
        >
          <div className="stat-header">
            <span className="stat-title">Proceeding Letters</span>
            <div className="stat-icon" style={{ background: 'rgba(2, 132, 199, 0.15)', color: 'var(--accent-primary)' }}>
              <FileCheck2 size={20} />
            </div>
          </div>
          <div className="stat-value">{procDownloaded.toLocaleString()}</div>
          <div className="stat-progress-bg">
            <div className="stat-progress-fill" style={{ width: `${procPct}%`, background: 'var(--accent-primary)' }}></div>
          </div>
          <div className="stat-footer">
            <span style={{ color: 'var(--accent-sky)' }}><strong>{procPct}%</strong> availability</span>
            <span>PDF verified</span>
          </div>
        </div>

        {/* 6. Drawing PDFs */}
        <div 
          className={`glass-card stat-card purple ${activeFilter?.draw_status === 'Downloaded' ? 'active-filter' : ''}`}
          onClick={() => handleCardClick('draw_status', 'Downloaded')}
          title="Click to filter proposals with Drawing PDFs"
        >
          <div className="stat-header">
            <span className="stat-title">Drawing PDFs</span>
            <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-purple)' }}>
              <FileSpreadsheet size={20} />
            </div>
          </div>
          <div className="stat-value">{drawDownloaded.toLocaleString()}</div>
          <div className="stat-progress-bg">
            <div className="stat-progress-fill" style={{ width: `${drawPct}%`, background: 'var(--accent-purple)' }}></div>
          </div>
          <div className="stat-footer">
            <span style={{ color: 'var(--accent-purple)' }}><strong>{drawPct}%</strong> availability</span>
            <span>Blueprints verified</span>
          </div>
        </div>
      </div>
    </div>
  );
}
