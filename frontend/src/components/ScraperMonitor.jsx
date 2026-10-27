import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  AlertCircle, 
  Terminal, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  FileSpreadsheet, 
  Copy, 
  Download, 
  Search, 
  Zap, 
  Play, 
  Pause, 
  AlertTriangle 
} from 'lucide-react';
import { api } from '../services/api';

export default function ScraperMonitor({ onShowToast }) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedError, setSelectedError] = useState(null);
  const [logFilter, setLogFilter] = useState('all'); // all, info, warn, error
  const [logSearch, setLogSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000); // Poll every 4s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [statusData, autoScroll]);

  const fetchStatus = async () => {
    try {
      const data = await api.getScraperStatus();
      setStatusData(data);
    } catch (err) {
      console.error("Failed to load scraper status:", err);
    } finally {
      setLoading(false);
    }
  };

  const copyLogs = () => {
    const raw = (statusData?.log_tail || []).join('\n');
    navigator.clipboard.writeText(raw);
    if (onShowToast) onShowToast('Scraper logs copied to clipboard!', 'success');
  };

  const downloadLogs = () => {
    const raw = (statusData?.log_tail || []).join('\n');
    const blob = new Blob([raw], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scraper_tail_${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    if (onShowToast) onShowToast('Downloaded scraper log file', 'info');
  };

  if (loading && !statusData) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
        <div className="live-pulse" style={{ marginBottom: '16px', width: '12px', height: '12px' }}></div>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Establishing Telemetry Connection with Scraper Daemon...
        </div>
      </div>
    );
  }

  const sessions = statusData?.mysql_stats || [];
  const errors = statusData?.recent_errors || [];
  const rawLogs = statusData?.log_tail || [];
  const progressSummary = statusData?.progress_summary || {};

  // Filter logs
  const filteredLogs = rawLogs.filter(line => {
    const lower = line.toLowerCase();
    if (logFilter === 'error' && !lower.includes('error') && !lower.includes('exception') && !lower.includes('fail')) return false;
    if (logFilter === 'warn' && !lower.includes('warn')) return false;
    if (logFilter === 'info' && !lower.includes('info')) return false;
    if (logSearch && !lower.includes(logSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Telemetry Progress Summary Cards */}
      <div className="stats-grid">
        <div className="glass-card stat-card info">
          <div className="stat-header">
            <span className="stat-title">Progress Cache Registry</span>
            <FileSpreadsheet size={20} color="var(--accent-sky)" />
          </div>
          <div className="stat-value">{progressSummary.total_tracked?.toLocaleString() || 0}</div>
          <div className="stat-footer">
            <span style={{ color: 'var(--success-text)' }}>
              <strong>{progressSummary.completed_tracked?.toLocaleString() || 0}</strong> fully downloaded
            </span>
          </div>
        </div>

        <div className="glass-card stat-card success">
          <div className="stat-header">
            <span className="stat-title">Scraping Sessions</span>
            <Activity size={20} color="var(--success)" />
          </div>
          <div className="stat-value">{sessions.length}</div>
          <div className="stat-footer">
            <span>MySQL telemetry records</span>
          </div>
        </div>

        <div className="glass-card stat-card danger">
          <div className="stat-header">
            <span className="stat-title">Logged Exceptions</span>
            <AlertCircle size={20} color="var(--danger)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--danger-text)' }}>{errors.length}</div>
          <div className="stat-footer">
            <span>Auto-captured stack traces</span>
          </div>
        </div>

        <div className="glass-card stat-card purple">
          <div className="stat-header">
            <span className="stat-title">Engine Health State</span>
            <Zap size={20} color="var(--accent-purple)" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.6rem', color: 'var(--success-text)' }}>
            ONLINE
          </div>
          <div className="stat-footer">
            <span className="live-pulse"></span>
            <span>Real-time polling active (4s)</span>
          </div>
        </div>
      </div>

      {/* Scraper Sessions Table */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Clock size={18} color="var(--accent-sky)" />
            <span>Scraping Execution Sessions</span>
          </h3>
          <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
            {sessions.length} Recorded Sessions
          </span>
        </div>
        
        {sessions.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No session history found in MySQL database. Run scraper to populate live execution history.
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Pages</th>
                  <th>Rows</th>
                  <th>Completed</th>
                  <th>Partial</th>
                  <th>Failed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, idx) => (
                  <tr key={s.id || s.session_id || idx}>
                    <td><code style={{ color: 'var(--accent-sky)', fontWeight: 600 }}>{s.session_id}</code></td>
                    <td>{s.start_time ? new Date(s.start_time).toLocaleString() : '—'}</td>
                    <td>{s.end_time ? new Date(s.end_time).toLocaleString() : <span className="badge badge-completed">Running</span>}</td>
                    <td>{s.total_pages || 0}</td>
                    <td><strong>{s.total_rows || 0}</strong></td>
                    <td style={{ color: 'var(--success-text)', fontWeight: 600 }}>{s.completed || 0}</td>
                    <td style={{ color: 'var(--warning-text)' }}>{s.partial || 0}</td>
                    <td style={{ color: 'var(--danger-text)' }}>{s.failed || 0}</td>
                    <td>
                      <span className={`badge ${s.status === 'completed' ? 'badge-completed' : 'badge-partial'}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Errors & Real-time Logs Split View */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '24px' }}>
        {/* Recent Errors Diagnostics */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <AlertCircle size={18} color="var(--danger)" />
              <span>Exception Diagnostics ({errors.length})</span>
            </h3>
          </div>

          {errors.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--success-text)' }}>
              <CheckCircle size={32} style={{ marginBottom: '8px' }} />
              <div>Zero runtime exceptions logged! The scraper pipeline is operating cleanly.</div>
            </div>
          ) : (
            <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {errors.map((err, idx) => {
                const isSelected = selectedError === err;
                return (
                  <div 
                    key={err.id || idx}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)'
                    }}
                    onClick={() => setSelectedError(isSelected ? null : err)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent-sky)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        {err.file_number || 'Pipeline Exception'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {err.created_at ? new Date(err.created_at).toLocaleTimeString() : ''}
                      </span>
                    </div>

                    <div style={{ color: 'var(--danger-text)', fontSize: '0.82rem', fontWeight: 600 }}>
                      {err.error_type || 'Exception'}: {err.error_message}
                    </div>

                    {isSelected && err.stack_trace && (
                      <div style={{ marginTop: '10px' }}>
                        <pre style={{
                          padding: '10px',
                          background: '#000',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          color: '#94a3b8',
                          overflowX: 'auto',
                          maxHeight: '180px'
                        }}>
                          {err.stack_trace}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Scraper Log Terminal */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Terminal size={18} color="var(--success)" />
              <span>Live Scraper Stream</span>
            </h3>

            {/* Terminal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                className="icon-btn" 
                style={{ width: '32px', height: '32px' }}
                onClick={() => setAutoScroll(!autoScroll)}
                title={autoScroll ? 'Pause Auto-scroll' : 'Resume Auto-scroll'}
              >
                {autoScroll ? <Pause size={14} color="var(--warning)" /> : <Play size={14} color="var(--success)" />}
              </button>
              <button 
                className="icon-btn" 
                style={{ width: '32px', height: '32px' }}
                onClick={copyLogs}
                title="Copy Terminal Logs"
              >
                <Copy size={14} />
              </button>
              <button 
                className="icon-btn" 
                style={{ width: '32px', height: '32px' }}
                onClick={downloadLogs}
                title="Download Log File"
              >
                <Download size={14} />
              </button>
            </div>
          </div>

          {/* Log Controls Bar */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div className="search-wrapper" style={{ minWidth: '180px' }}>
              <Search className="search-icon" size={14} />
              <input 
                type="text" 
                className="search-input" 
                style={{ padding: '6px 10px 6px 34px', fontSize: '0.8rem' }}
                placeholder="Search log output..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
              />
            </div>

            <div className="filters-group">
              {['all', 'info', 'warn', 'error'].map((lvl) => (
                <button
                  key={lvl}
                  className={`filter-chip ${logFilter === lvl ? 'active' : ''}`}
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => setLogFilter(lvl)}
                >
                  {lvl.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Terminal Box */}
          <div ref={terminalRef} className="log-terminal">
            {filteredLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>
                No log output matching current filter.
              </div>
            ) : (
              filteredLogs.map((line, i) => {
                const lower = line.toLowerCase();
                let cls = 'log-line';
                if (lower.includes('error') || lower.includes('fail') || lower.includes('exception')) cls += ' error';
                else if (lower.includes('warn')) cls += ' warn';
                else if (lower.includes('info')) cls += ' info';

                return (
                  <div key={i} className={cls}>
                    <span style={{ color: '#475569', marginRight: '8px', userSelect: 'none' }}>{i + 1}</span>
                    {line}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
