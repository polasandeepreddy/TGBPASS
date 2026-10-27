import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  X, 
  Layers, 
  BarChart3, 
  Activity, 
  FileText, 
  ArrowRight, 
  Database, 
  Building2, 
  FolderTree 
} from 'lucide-react';
import { api } from '../services/api';

export default function QuickSearchModal({ 
  isOpen, 
  onClose, 
  onSelectProposal, 
  onNavigateTab, 
  onApplyFilter, 
  onOpenSync 
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Live search debounced
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.getUnifiedSearch({ search: query.trim(), dataset: 'all', page_size: 8 });
        setResults(data.records || []);
      } catch (err) {
        console.error('Quick search error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Command items list
  const defaultCommands = [
    { id: 'tab-explorer', icon: <Layers size={16} />, label: 'Go to Proposals Vault (86.5k Archive)', action: () => onNavigateTab('explorer') },
    { id: 'tab-oc-bp', icon: <Building2 size={16} />, label: "Go to DPMS OC's & BP's Hub (75.9k Archive)", action: () => onNavigateTab('oc_bp') },
    { id: 'tab-hmda-layouts', icon: <FolderTree size={16} />, label: 'Go to HMDA Planning Layouts Vault (1,271 Records)', action: () => onNavigateTab('hmda_layouts') },
    { id: 'tab-analytics', icon: <BarChart3 size={16} />, label: 'Go to Intelligence Analytics', action: () => onNavigateTab('analytics') },
    { id: 'tab-scraper', icon: <Activity size={16} />, label: 'Go to Scraper Mission Control', action: () => onNavigateTab('scraper') },
    { id: 'filter-ghmc', icon: <Building2 size={16} />, label: 'Filter: GHMC Proposals (2025)', action: () => onApplyFilter({ authority: 'GHMC', year: '2025' }) },
    { id: 'filter-completed', icon: <FileText size={16} />, label: 'Filter: Completed (Both PDFs Available)', action: () => onApplyFilter({ status: 'Completed' }) },
    { id: 'sync-db', icon: <Database size={16} />, label: 'Open MySQL Database Sync', action: onOpenSync },
  ];

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div 
        className="modal-content spotlight" 
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 0, overflow: 'hidden' }}
      >
        {/* Search Input Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-glass)',
          background: 'var(--bg-tertiary)'
        }}>
          <Search size={20} color="var(--accent-sky)" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              boxShadow: 'none',
              fontSize: '1.05rem',
              color: 'var(--text-primary)'
            }}
            placeholder="Search proposals by file no, applicant, or run a quick command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          )}
          <kbd style={{
            background: '#ffffff',
            border: '1px solid var(--border-glass)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            fontWeight: 700
          }}>ESC</kbd>
        </div>

        {/* Results / Commands Body */}
        <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '12px', background: '#ffffff' }}>
          {query.trim() ? (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', padding: '6px 10px', textTransform: 'uppercase' }}>
                {loading ? 'Searching proposals...' : `Proposals Results (${results.length})`}
              </div>

              {results.length === 0 && !loading ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
                  No matching proposals found for "{query}".
                </div>
              ) : (
                results.map((p) => (
                  <div
                    key={p.file_number}
                    onClick={() => {
                      onSelectProposal(p.file_number);
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'var(--transition-fast)',
                      marginBottom: '4px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-glass)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-sky)';
                      e.currentTarget.style.background = '#f0f9ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-glass)';
                      e.currentTarget.style.background = 'var(--bg-tertiary)';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-sky)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                          {p.file_number}
                        </span>
                        {p.source_dataset === 'oc_bp' ? (
                          <span className="badge-ocbp" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>DPMS OC/BP</span>
                        ) : (
                          <span className="badge-tgbpass" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>TG-bPASS</span>
                        )}
                        <span className={`badge badge-${(p.processing_status || (p.source_dataset === 'oc_bp' ? 'completed' : '')).toLowerCase().replace(/ /g, '')}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                          {p.processing_status || (p.source_dataset === 'oc_bp' ? 'Verified' : 'Pending')}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {p.applicant_name || 'No applicant specified'} • <span style={{ color: 'var(--text-muted)' }}>{p.officer_name ? `Officer: ${p.officer_name}` : (p.architect_name || 'No architect')}</span>
                      </div>
                    </div>

                    <ArrowRight size={16} color="var(--text-muted)" />
                  </div>
                ))
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', padding: '6px 10px', textTransform: 'uppercase' }}>
                Quick Navigation & Commands
              </div>

              {defaultCommands.map((cmd) => (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    marginBottom: '4px',
                    transition: 'var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--accent-sky)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                >
                  <div style={{ color: 'var(--accent-sky)' }}>{cmd.icon}</div>
                  <span>{cmd.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border-glass)',
          background: 'var(--bg-tertiary)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Use <code>↑</code> <code>↓</code> to navigate, <code>↵</code> to select</span>
          <span>TG-bPASS Spotlight Search</span>
        </div>
      </div>
    </div>
  );
}
