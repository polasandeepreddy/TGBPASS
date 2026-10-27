import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FileCheck,
  FolderOpen,
  LayoutGrid,
  Table as TableIcon,
  Copy,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  CheckSquare,
  Square,
  Building2,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { api } from '../services/api';

const isPlaceholderText = (text) => {
  if (!text) return true;
  const s = text.trim().toLowerCase();
  if (s === 'search' || s === 'search by' || s === 'search file no' || s === 'search file') return true;
  return s.startsWith('search') && (s.includes('file') || s.includes('permit') || s.includes('applicant') || s.includes('folder') || s.includes('architect'));
};

export default function ProposalsTable({
  vault = 'proposals',
  dataSource,
  filterState = {},
  onFilterStateChange,
  onSelectProposal,
  onOpenPdf,
  onShowToast
}) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // View mode: 'table' or 'grid'
  const [viewMode, setViewMode] = useState('table');

  // Expanded rows for inline details
  const [expandedRows, setExpandedRows] = useState({});

  // Selected row IDs for batch actions
  const [selectedRows, setSelectedRows] = useState(new Set());

  // Filters state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState(filterState.status || '');
  const [authority, setAuthority] = useState(filterState.authority || '');
  const [year, setYear] = useState(filterState.year || '');
  const [procStatus, setProcStatus] = useState(filterState.proc_status || '');
  const [drawStatus, setDrawStatus] = useState(filterState.draw_status || '');
  const [projectType, setProjectType] = useState(filterState.project_type || '');
  const [sortBy, setSortBy] = useState('row_number');
  const [sortDir, setSortDir] = useState('asc');

  // Synchronize incoming filterState props from StatsCards or QuickSearch
  useEffect(() => {
    if (filterState.status !== undefined) setStatus(filterState.status);
    if (filterState.authority !== undefined) setAuthority(filterState.authority);
    if (filterState.year !== undefined) setYear(filterState.year);
    if (filterState.proc_status !== undefined) setProcStatus(filterState.proc_status);
    if (filterState.draw_status !== undefined) setDrawStatus(filterState.draw_status);
    if (filterState.project_type !== undefined) setProjectType(filterState.project_type);
    if (filterState.search !== undefined) setSearch(filterState.search);
    setPage(1);
  }, [filterState]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isPlaceholderText(search)) {
        setDebouncedSearch('');
      } else {
        setDebouncedSearch(search.trim());
      }
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch proposals
  useEffect(() => {
    fetchProposals();
  }, [vault, dataSource, page, pageSize, debouncedSearch, status, authority, year, procStatus, drawStatus, projectType, sortBy, sortDir]);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      const data = await api.getProposals({
        vault,
        source: dataSource,
        page,
        page_size: pageSize,
        search: debouncedSearch,
        status,
        authority,
        year,
        proc_status: procStatus,
        draw_status: drawStatus,
        sort_by: sortBy,
        sort_dir: sortDir
      });
      setProposals(data.records || []);
      setTotalRecords(data.total_records || 0);
      setTotalPages(data.total_pages || 1);
      setSelectedRows(new Set());
    } catch (err) {
      console.error("Failed to load proposals:", err);
      if (onShowToast) onShowToast('Failed to load proposals', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const handleExport = () => {
    const url = api.getExportUrl({
      source: dataSource,
      search: debouncedSearch,
      status,
      authority,
      year,
      limit: 5000
    });
    window.open(url, '_blank');
    if (onShowToast) onShowToast('Export initiated. Downloading CSV archive...', 'info');
  };

  const toggleRowExpanded = (fileNo) => {
    setExpandedRows(prev => ({ ...prev, [fileNo]: !prev[fileNo] }));
  };

  const toggleRowSelect = (fileNo) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(fileNo)) next.delete(fileNo);
      else next.add(fileNo);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    if (selectedRows.size === proposals.length && proposals.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(proposals.map(p => p.file_number)));
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    if (onShowToast) onShowToast(`Copied ${label} to clipboard!`, 'success');
  };

  const copySelectedFileNumbers = () => {
    const list = Array.from(selectedRows).join('\n');
    navigator.clipboard.writeText(list);
    if (onShowToast) onShowToast(`Copied ${selectedRows.size} file numbers to clipboard!`, 'success');
  };

  const clearAllFilters = () => {
    setSearch('');
    setStatus('');
    setAuthority('');
    setYear('');
    setProcStatus('');
    setDrawStatus('');
    setPage(1);
    if (onFilterStateChange) onFilterStateChange({});
    if (onShowToast) onShowToast('All filters cleared', 'info');
  };

  const activeFiltersCount = [status, authority, year, procStatus, drawStatus, debouncedSearch].filter(Boolean).length;

  return (
    <div>
      {/* Search & Advanced Filters Bar */}
      <div className="glass-card filter-bar">
        <div className="filter-top-row">
          {/* Main Search Bar */}
          <div className="search-wrapper">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              className="search-input"
              placeholder={
                vault === 'hmda_layouts'
                  ? "Search HMDA file no, applicant, developer, village, survey no, extent..."
                  : vault === 'oc_bp'
                    ? "Search DPMS file no, permit no, applicant, officer, village..."
                    : "Search by File No, Applicant, Architect, Folder..."
              }
              value={search}
              onChange={(e) => {
                const val = e.target.value;
                if (isPlaceholderText(val)) {
                  setSearch('');
                } else {
                  setSearch(val);
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            {search && (
              <button className="search-clear-btn" onClick={() => setSearch('')}>
                <X size={16} />
              </button>
            )}
          </div>

          {/* Right Action Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Table / Grid Mode Toggle */}
            <div className="view-toggle-group">
              <button
                className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Data Table View"
              >
                <TableIcon size={16} />
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Card Grid View"
              >
                <LayoutGrid size={16} />
              </button>
            </div>

            {/* Clear Filters Button */}
            {activeFiltersCount > 0 && (
              <button className="btn-secondary" onClick={clearAllFilters} style={{ padding: '8px 12px', fontSize: '0.8rem' }}>
                <X size={14} />
                <span>Reset ({activeFiltersCount})</span>
              </button>
            )}

            {/* Export CSV Button */}
            <button className="btn-primary" onClick={handleExport} title="Export filtered dataset to CSV">
              <Download size={16} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Quick Authority Filter Chips (Proposals Vault) */}
        {vault === 'proposals' && (
          <div className="quick-chips-row">
            <span className="chip-label">Authority:</span>
            {['', 'GHMC', 'HMDA', 'DTCP', 'GWMC', 'FLT', 'LO'].map((auth) => (
              <button
                key={auth || 'all'}
                className={`filter-chip ${authority === auth ? 'active' : ''}`}
                onClick={() => { setAuthority(auth); setPage(1); }}
              >
                {auth === '' ? 'All Authorities' : auth}
              </button>
            ))}
          </div>
        )}

        {/* Quick Chips for DPMS OC's & BP's */}
        {vault === 'oc_bp' && (
          <div className="quick-chips-row">
            <span className="chip-label">Project Type:</span>
            {[
              { label: 'All Permissions & OCs', value: '' },
              { label: 'Building Permission', value: 'Building Permission' },
              { label: 'Occupancy Certificate', value: 'Occupancy Certificate' }
            ].map((pt) => (
              <button
                key={pt.value || 'all'}
                className={`filter-chip ${projectType === pt.value ? 'active' : ''}`}
                onClick={() => { setProjectType(pt.value); setPage(1); }}
              >
                {pt.label}
              </button>
            ))}
          </div>
        )}

        {/* Quick Year Filter Chips & Dropdowns */}
        <div className="quick-chips-row" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {vault === 'proposals' && (
              <>
                <span className="chip-label">Year:</span>
                {['', '2025', '2024', '2023', '2022', '2021'].map((yr) => (
                  <button
                    key={yr || 'all'}
                    className={`filter-chip ${year === yr ? 'active' : ''}`}
                    onClick={() => { setYear(yr); setPage(1); }}
                  >
                    {yr === '' ? 'All Years' : yr}
                  </button>
                ))}
              </>
            )}
            {vault === 'hmda_layouts' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="chip-label">Vault Mode:</span>
                <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                  HMDA Masterplan Planning Layouts Archive (LO)
                </span>
              </div>
            )}
          </div>

          <div className="filters-group">
            {/* Status Dropdown */}
            <select
              className="filter-select"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            >
              <option value="">Status: All</option>
              <option value="Completed">Completed (Full)</option>
              <option value="Partially Completed">Partially Completed</option>
              <option value="Failed">Failed / Not Found</option>
            </select>

            {/* Proceeding Status Dropdown */}
            <select
              className="filter-select"
              value={procStatus}
              onChange={(e) => { setProcStatus(e.target.value); setPage(1); }}
            >
              <option value="">Proceeding: All</option>
              <option value="Downloaded">Downloaded</option>
              <option value="Not Available">Not Available</option>
            </select>

            {/* Drawing Status Dropdown */}
            <select
              className="filter-select"
              value={drawStatus}
              onChange={(e) => { setDrawStatus(e.target.value); setPage(1); }}
            >
              <option value="">Drawing: All</option>
              <option value="Downloaded">Downloaded</option>
              <option value="Not Available">Not Available</option>
            </select>
          </div>
        </div>
      </div>

      {/* Batch Action Bar (Visible when rows are selected) */}
      {selectedRows.size > 0 && (
        <div className="batch-action-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckSquare size={18} color="var(--accent-sky)" />
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {selectedRows.size} proposal{selectedRows.size > 1 ? 's' : ''} selected
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn-secondary" onClick={copySelectedFileNumbers} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              <Copy size={14} />
              <span>Copy File Numbers</span>
            </button>
            <button className="btn-secondary" onClick={() => setSelectedRows(new Set())} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              <X size={14} />
              <span>Deselect All</span>
            </button>
          </div>
        </div>
      )}

      {/* View Mode 1: High-Density Table View */}
      {viewMode === 'table' ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              {vault === 'hmda_layouts' ? (
                <tr>
                  <th onClick={() => handleSort('row_number')} style={{ width: '4%', textAlign: 'center' }}>
                    Row {sortBy === 'row_number' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => handleSort('file_number')} style={{ width: '10%' }}>
                    File / Letter No {sortBy === 'file_number' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => handleSort('applicant_name')} style={{ width: '22%' }}>
                    Applicant / Developer {sortBy === 'applicant_name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ width: '18%' }}>Village & Survey Nos</th>
                  <th style={{ width: '11%' }}>Extent</th>
                  <th style={{ width: '9%' }}>Draft Layout</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Proceedings</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Plan PDF</th>
                  <th style={{ textAlign: 'center', width: '8%' }}>Actions</th>
                </tr>
              ) : vault === 'oc_bp' ? (
                <tr>
                  <th onClick={() => handleSort('row_number')} style={{ width: '4%', textAlign: 'center' }}>
                    Row {sortBy === 'row_number' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => handleSort('file_number')} style={{ width: '16%' }}>
                    File Number & Permit {sortBy === 'file_number' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ width: '8%' }}>Type</th>
                  <th onClick={() => handleSort('applicant_name')} style={{ width: '28%' }}>
                    Applicant Name {sortBy === 'applicant_name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Letter</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Drawing</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Inspection</th>
                  <th style={{ textAlign: 'center', width: '8%' }}>Actions</th>
                </tr>
              ) : (
                <tr>
                  <th onClick={() => handleSort('row_number')} style={{ width: '4%', textAlign: 'center' }}>
                    Row {sortBy === 'row_number' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => handleSort('file_number')} style={{ width: '18%' }}>
                    File Number & Authority {sortBy === 'file_number' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => handleSort('applicant_name')} style={{ width: '27%' }}>
                    Applicant Name {sortBy === 'applicant_name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => handleSort('architect_name')} style={{ width: '22%' }}>
                    Architect / Licensee
                  </th>
                  <th style={{ width: '11%', textAlign: 'center' }}>Letter</th>
                  <th style={{ width: '11%', textAlign: 'center' }}>Drawing</th>
                  <th style={{ textAlign: 'center', width: '7%' }}>Actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                // Shimmer Skeleton Loading Rows
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={vault === 'proposals' ? 7 : (vault === 'oc_bp' ? 8 : 9)} style={{ padding: '16px' }}>
                      <div className="skeleton" style={{ height: '24px', width: '100%' }}></div>
                    </td>
                  </tr>
                ))
              ) : proposals.length === 0 ? (
                <tr>
                  <td colSpan={vault === 'proposals' ? 7 : (vault === 'oc_bp' ? 8 : 9)} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <Search size={32} color="var(--text-muted)" />
                      <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>No matching proposals found</div>
                      <p style={{ fontSize: '0.85rem', maxWidth: '400px', margin: 0 }}>
                        Try adjusting your search criteria, switching authority, or resetting filters.
                      </p>
                      <button className="btn-secondary" onClick={clearAllFilters} style={{ marginTop: '8px' }}>
                        Clear All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                proposals.map((item, idx) => {
                  const isExpanded = expandedRows[item.file_number];
                  const isSelected = selectedRows.has(item.file_number);
                  const statusClass = (item.processing_status || 'neutral')
                    .toLowerCase()
                    .replace(/ /g, '');

                  return (
                    <React.Fragment key={item.id || item.file_number || idx}>
                      <tr>
                        <td style={{ width: '45px', textAlign: 'center', padding: '6px 4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <button
                              onClick={() => toggleRowExpanded(item.file_number)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}
                              title="Toggle inline details"
                            >
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                            <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                              {item.row_number || idx + 1}
                            </span>
                          </div>
                        </td>

                        {/* Cell 1: File Number */}
                        <td>
                          <div className="cell-file-no" title={item.file_number}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{item.file_number}</span>
                            <button
                              className="copy-mini-btn"
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(item.file_number, 'File Number'); }}
                              title="Copy File Number"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                          {vault === 'oc_bp' && item.permit_number && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                              Permit: <strong>{item.permit_number}</strong>
                            </div>
                          )}
                          {vault === 'proposals' && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                              {item.meta_authority && (
                                <span className="badge badge-neutral" style={{ fontSize: '0.66rem', padding: '1px 5px' }}>
                                  {item.meta_authority}
                                </span>
                              )}
                              {item.meta_year && (
                                <span className="badge badge-neutral" style={{ fontSize: '0.66rem', padding: '1px 5px' }}>
                                  {item.meta_year}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Cell 2: Project Type (for DPMS) */}
                        {vault === 'oc_bp' && (
                          <td style={{ width: '100px' }}>
                            <span className="badge badge-info" style={{ fontSize: '0.68rem', padding: '2px 5px', whiteSpace: 'nowrap' }}>
                              {item.project_type?.includes('Occupancy') ? 'Occupancy' : 'Building'}
                            </span>
                          </td>
                        )}

                        {/* Cell 3: Applicant Name */}
                        <td>
                          <div className="cell-applicant" title={item.applicant_name}>
                            {item.applicant_name || '—'}
                          </div>
                        </td>

                        {/* Specific columns for HMDA Layouts */}
                        {vault === 'hmda_layouts' && (
                          <>
                            <td>
                              {(() => {
                                const cleanVillage = (item.village || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
                                return (
                                  <div
                                    style={{
                                      width: '100%',
                                      fontSize: '0.78rem',
                                      color: 'var(--text-secondary)',
                                      lineHeight: '1.35',
                                      maxHeight: '2.7em',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      wordBreak: 'break-word'
                                    }}
                                    title={cleanVillage}
                                  >
                                    {cleanVillage || '—'}
                                  </div>
                                );
                              })()}
                            </td>
                            <td>
                              {(() => {
                                const rawExtent = (item.extent || '')
                                  .replace(/&quot;/g, '"')
                                  .replace(/&amp;/g, '&')
                                  .replace(/&lt;/g, '<')
                                  .replace(/&gt;/g, '>')
                                  .trim();
                                if (!rawExtent) return '—';

                                const words = rawExtent.split(/\s+/);
                                const isTruncated = words.length > 20;
                                const displayExtent = isTruncated ? words.slice(0, 20).join(' ') + ' ...' : rawExtent;

                                return (
                                  <span
                                    className="badge badge-neutral"
                                    style={{
                                      fontSize: '0.7rem',
                                      maxWidth: '100%',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      display: 'inline-block',
                                      verticalAlign: 'middle'
                                    }}
                                    title={rawExtent}
                                  >
                                    {displayExtent}
                                  </span>
                                );
                              })()}
                            </td>
                            <td>
                              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {item.draft_layout_issued || '—'}
                              </span>
                            </td>
                          </>
                        )}

                        {/* Specific columns for Proposals Vault */}
                        {vault === 'proposals' && (
                          <td>
                            <div className="cell-architect" title={item.architect_name}>
                              {item.architect_name || '—'}
                            </div>
                          </td>
                        )}

                        {/* Proceeding Letter PDF */}
                        <td style={{ textAlign: 'center' }}>
                          {item.proceeding_letter_status === 'Downloaded' ? (
                            <button
                              className="table-action-btn"
                              style={{ borderColor: 'var(--success-border)', color: 'var(--success-text)', padding: '2px 6px', fontSize: '0.72rem' }}
                              onClick={() => onOpenPdf(item.folder_name, item.proceeding_letter_file || (vault === 'hmda_layouts' ? 'Proceedings.pdf' : 'Proceeding_Letter.pdf'), 'Proceeding Letter', item.file_number)}
                              title="Preview Proceeding Letter PDF"
                            >
                              <FileCheck size={12} />
                              <span>Letter</span>
                            </button>
                          ) : (
                            <span className="doc-pill not-available" style={{ padding: '2px 5px', fontSize: '0.66rem' }}>N/A</span>
                          )}
                        </td>

                        {/* Drawing PDF */}
                        <td style={{ textAlign: 'center' }}>
                          {item.drawing_pdf_status === 'Downloaded' ? (
                            <button
                              className="table-action-btn"
                              style={{ borderColor: 'rgba(139, 92, 246, 0.4)', color: 'var(--accent-purple)', padding: '2px 6px', fontSize: '0.72rem' }}
                              onClick={() => onOpenPdf(item.folder_name, item.drawing_pdf_file || (vault === 'hmda_layouts' ? 'Plan.pdf' : 'Drawing.pdf'), 'Drawing PDF', item.file_number)}
                              title="Preview Drawing PDF"
                            >
                              <FileText size={12} />
                              <span>Drawing</span>
                            </button>
                          ) : (
                            <span className="doc-pill not-available" style={{ padding: '2px 5px', fontSize: '0.66rem' }}>N/A</span>
                          )}
                        </td>

                        {/* Site Inspection Report PDF (for DPMS) */}
                        {vault === 'oc_bp' && (
                          <td style={{ textAlign: 'center' }}>
                            {item.inspection_report_status === 'Downloaded' ? (
                              <button
                                className="table-action-btn"
                                style={{ borderColor: 'var(--info-border, rgba(56, 189, 248, 0.4))', color: 'var(--accent-sky)', padding: '2px 6px', fontSize: '0.72rem' }}
                                onClick={() => onOpenPdf(item.folder_name, item.inspection_report_file || 'Inspection Report.PDF', 'Site Inspection Report', item.file_number)}
                                title="Preview Inspection Report PDF"
                              >
                                <FileCheck size={12} />
                                <span>Report</span>
                              </button>
                            ) : (
                              <span className="doc-pill not-available" style={{ padding: '2px 5px', fontSize: '0.66rem' }}>N/A</span>
                            )}
                          </td>
                        )}

                        {/* Actions */}
                        <td style={{ textAlign: 'center', width: '75px' }}>
                          <button
                            className="table-action-btn"
                            style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                            onClick={() => onSelectProposal(item.file_number)}
                            title="Inspect full proposal metadata & dossier"
                          >
                            <Eye size={12} />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Accordion Row Details */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={vault === 'proposals' ? 7 : (vault === 'oc_bp' ? 8 : 9)} style={{ padding: 0 }}>
                            <div className="expandable-row-content">
                              <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Google Drive Cloud Folder</div>
                                <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', marginTop: '4px', wordBreak: 'break-all' }}>
                                  <code>{item.folder_name || '—'}</code>
                                </div>
                              </div>

                              <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Proceeding File Name</div>
                                <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                                  {item.proceeding_letter_file || 'Proceeding_Letter.pdf'}
                                </div>
                              </div>

                              <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Drawing File Name</div>
                                <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                                  {item.drawing_pdf_file || 'Drawing.pdf'}
                                </div>
                              </div>

                              {item.error_message && (
                                <div style={{ gridColumn: '1 / -1', color: 'var(--danger-text)', fontSize: '0.8rem' }}>
                                  <strong>Scraper Note:</strong> {item.error_message}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* View Mode 2: Card Grid View */
        <div className="proposals-card-grid">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card skeleton" style={{ height: '220px' }}></div>
            ))
          ) : proposals.length === 0 ? (
            <div className="glass-card" style={{ gridColumn: '1 / -1', padding: '60px', textAlign: 'center' }}>
              No matching proposals found.
            </div>
          ) : (
            proposals.map((item, idx) => {
              const statusClass = (item.processing_status || 'neutral')
                .toLowerCase()
                .replace(/ /g, '');

              return (
                <div key={item.file_number || idx} className="glass-card proposal-card-item">
                  <div className="proposal-card-header">
                    <div>
                      <div className="cell-file-no">{item.file_number}</div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        {item.meta_authority && <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{item.meta_authority}</span>}
                        {item.meta_year && <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{item.meta_year}</span>}
                      </div>
                    </div>
                    <span className={`badge badge-${statusClass}`}>
                      <span className="badge-dot"></span>
                      {item.processing_status || 'Pending'}
                    </span>
                  </div>

                  <div className="proposal-card-body">
                    <div style={{ fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Applicant: </span>
                      <strong style={{ color: 'var(--text-primary)' }}>{item.applicant_name || '—'}</strong>
                    </div>
                    <div style={{ fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Architect: </span>
                      <span>{item.architect_name || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {item.proceeding_letter_status === 'Downloaded' ? (
                        <button
                          className="table-action-btn"
                          style={{ flex: 1, justifyContent: 'center', borderColor: 'var(--success-border)', color: 'var(--success-text)' }}
                          onClick={() => onOpenPdf(item.folder_name, item.proceeding_letter_file || 'Proceeding_Letter.pdf', 'Proceeding Letter', item.file_number)}
                        >
                          <FileCheck size={14} />
                          <span>Letter PDF</span>
                        </button>
                      ) : (
                        <div className="doc-pill not-available" style={{ flex: 1, justifyContent: 'center' }}>No Letter</div>
                      )}

                      {item.drawing_pdf_status === 'Downloaded' ? (
                        <button
                          className="table-action-btn"
                          style={{ flex: 1, justifyContent: 'center', borderColor: 'rgba(139, 92, 246, 0.4)', color: 'var(--accent-purple)' }}
                          onClick={() => onOpenPdf(item.folder_name, item.drawing_pdf_file || 'Drawing.pdf', 'Drawing PDF', item.file_number)}
                        >
                          <FileText size={14} />
                          <span>Drawing PDF</span>
                        </button>
                      ) : (
                        <div className="doc-pill not-available" style={{ flex: 1, justifyContent: 'center' }}>No Drawing</div>
                      )}
                    </div>
                  </div>

                  <div className="proposal-card-footer">
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Row {item.row_number || idx + 1}</span>
                    <button
                      className="table-action-btn"
                      onClick={() => onSelectProposal(item.file_number)}
                      style={{ background: 'var(--gradient-primary)', color: '#fff', border: 'none' }}
                    >
                      <Eye size={14} />
                      <span>Inspect Dossier</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Pagination Bar */}
      <div className="pagination-bar" style={{ marginTop: '16px' }}>
        <div>
          Showing <strong>{proposals.length}</strong> of <strong>{totalRecords.toLocaleString()}</strong> records
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Rows per page:</span>
            <select
              className="filter-select"
              style={{ padding: '5px 10px' }}
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          <div className="pagination-controls">
            <button
              className="page-btn"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              title="First Page"
            >
              «
            </button>
            <button
              className="page-btn"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              title="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ padding: '0 10px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              Page {page} of {totalPages || 1}
            </span>
            <button
              className="page-btn"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              title="Next Page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="page-btn"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              title="Last Page"
            >
              »
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
