import React, { useState, useEffect } from 'react';
import {
  Search,
  FileCheck2,
  FileSpreadsheet,
  Eye,
  Download,
  Copy,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  ShieldCheck,
  FileText,
  Filter,
  Award,
  Calendar,
  Layers,
  Sparkles,
  CheckCircle2,
  FileSearch,
  ExternalLink,
  ClipboardList,
  Database,
  FolderTree,
  AlertCircle,
  XCircle,
  FileX
} from 'lucide-react';
import { api } from '../services/api';

export default function PublicSearchPortal({
  onOpenPdf,
  onSelectProposal,
  onShowToast,
  datasetMode: propDatasetMode = 'all',
  onDatasetModeChange
}) {
  // Dataset filter mode: 'all' (Unified omni-search), 'tgbpass' (85.6k Proposals), 'oc_bp' (DPMS OC & BP Archive), or 'hmda' (HMDA Planning Layouts)
  const [datasetMode, setDatasetMode] = useState(propDatasetMode || 'all');

  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [validationError, setValidationError] = useState('');

  // Granular filters
  const [authority, setAuthority] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('');
  const [projectType, setProjectType] = useState('');
  const [docFilter, setDocFilter] = useState('');

  // Search Results State: Both related files and application dossier records
  const [hasSearched, setHasSearched] = useState(false);
  const [relatedFiles, setRelatedFiles] = useState([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [proposals, setProposals] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState({ all: 172197, tgbpass: 53088, oc_bp: 56482, hmda: 62627 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  // View mode: 'files' (Related Files table, default) or 'records' (Application dossiers table)
  const [activeView, setActiveView] = useState('files');

  // Sync with prop from navbar if changed
  useEffect(() => {
    if (propDatasetMode && propDatasetMode !== datasetMode) {
      setDatasetMode(propDatasetMode);
      setPage(1);
    }
  }, [propDatasetMode]);

  // Overview stats for Hero Banner
  const [globalStats, setGlobalStats] = useState(null);

  useEffect(() => {
    const loadGlobalStats = async () => {
      try {
        const stats = await api.getStats('csv');
        setGlobalStats(stats);
      } catch (err) {
        console.warn('Failed to load global overview stats:', err);
      }
    };
    loadGlobalStats();
  }, []);

  // Fetch results only when search has been initiated and an active query exists
  useEffect(() => {
    if (hasSearched && activeQuery.trim()) {
      executeSearch();
    }
  }, [activeQuery, datasetMode, authority, year, status, projectType, page, pageSize, hasSearched]);

  const executeSearch = async () => {
    setLoading(true);
    setSearchError('');
    try {
      const data = await api.getPublicSearch({
        search: activeQuery,
        dataset: datasetMode,
        repository: datasetMode,
        authority,
        year,
        project_type: projectType,
        status,
        page,
        page_size: pageSize
      });

      setRelatedFiles(data.files || []);
      setTotalFiles(data.total_files || 0);
      setProposals(data.records || []);
      setTotalRecords(data.total_records || 0);
      setTotalPages(data.total_pages || 1);
      if (data.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      console.error('Failed to load public search results:', err);
      setRelatedFiles([]);
      setProposals([]);
      setTotalFiles(0);
      setTotalRecords(0);
      setSearchError(err.message || 'Failed to load search results');
      if (onShowToast) onShowToast('Failed to load search results', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const q = searchInput.trim();
    if (!q) {
      setValidationError('Please enter a file number, reference number, name, or search keyword.');
      if (onShowToast) onShowToast('Please enter a file number, reference number, name, or search keyword.', 'warning');
      return;
    }
    setValidationError('');
    setActiveQuery(q);
    setPage(1);
    setHasSearched(true);
    setActiveView('files');
  };

  const handleQuickSearch = (queryText, mode = 'all', extraFilters = {}) => {
    setValidationError('');
    setSearchInput(queryText);
    setActiveQuery(queryText);
    setDatasetMode(mode);
    if (onDatasetModeChange) onDatasetModeChange(mode);
    if (extraFilters.authority) setAuthority(extraFilters.authority);
    if (extraFilters.projectType) setProjectType(extraFilters.projectType);
    if (extraFilters.docFilter) setDocFilter(extraFilters.docFilter);
    setPage(1);
    setHasSearched(true);
    setActiveView('files');
  };

  const handleClear = () => {
    setSearchInput('');
    setActiveQuery('');
    setValidationError('');
    setAuthority('');
    setYear('');
    setStatus('');
    setProjectType('');
    setDocFilter('');
    setPage(1);
    setRelatedFiles([]);
    setTotalFiles(0);
    setProposals([]);
    setTotalRecords(0);
    setHasSearched(false);
    setActiveView('files');
  };

  const handleDatasetSwitch = (mode) => {
    setDatasetMode(mode);
    if (onDatasetModeChange) onDatasetModeChange(mode);
    setPage(1);
  };

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (onShowToast) onShowToast(`Copied ${label} to clipboard!`, 'success');
  };

  const getDatasetLabel = (mode) => {
    switch (mode) {
      case 'tgbpass':
        return 'TG-bPASS Master Archive';
      case 'oc_bp':
      case 'dpms':
        return "DPMS OC's & BP's Archive";
      case 'hmda':
        return 'Masterplan HMDA Planning Layouts';
      case 'all':
      default:
        return 'All Archives (Unified Omni-Search)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Search Header Banner */}
      <div className="glass-card" style={{
        padding: '36px 32px 28px',
        textAlign: 'center',
        background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
        border: '1px solid #bae6fd'
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 14px', borderRadius: 'var(--radius-full)', background: '#e0f2fe', color: '#0369a1', fontSize: '0.82rem', fontWeight: 700, marginBottom: '14px' }}>
          <ShieldCheck size={16} />
          <span>OFFICIAL CITIZEN VERIFICATION & DOCUMENT SEARCH ENGINE</span>
        </div>

        <h1 style={{ fontSize: '2.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px', lineHeight: 1.2 }}>
          Telangana Building Permission & Document Search
        </h1>
        <p style={{ color: '#475569', fontSize: '0.98rem', maxWidth: '780px', margin: '0 auto 18px', lineHeight: 1.5 }}>
          Search and access official <strong>Proceeding Letters</strong>, certified <strong>Site Inspection Reports</strong>, and approved <strong>Drawing Blueprint PDFs</strong> across all state archives in one unified portal.
        </p>

        {/* Dataset Dropdown directly at top of the search */}
        <div style={{
          maxWidth: '860px',
          margin: '0 auto 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <label
            htmlFor="dataset-select-dropdown"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.92rem',
              fontWeight: 700,
              color: '#334155'
            }}
          >
            <Database size={17} color="#0284c7" />
            <span>Search Repository:</span>
          </label>
          <div style={{ position: 'relative', minWidth: '340px', maxWidth: '520px', flex: 1 }}>
            <select
              id="dataset-select-dropdown"
              value={datasetMode}
              onChange={(e) => handleDatasetSwitch(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 42px 11px 16px',
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#0f172a',
                background: '#ffffff',
                border: '2px solid #38bdf8',
                borderRadius: '10px',
                boxShadow: '0 3px 12px rgba(2, 132, 199, 0.12)',
                cursor: 'pointer',
                appearance: 'none',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <option value="all">🌐 All Archives (Unified Omni-Search — {(counts.all || 172197).toLocaleString()} records)</option>
              <option value="tgbpass">🏛️ TG-bPASS Master Archive ({(counts.tgbpass || 53088).toLocaleString()} records)</option>
              <option value="oc_bp">🏢 DPMS OC's & BP's Archive ({(counts.oc_bp || 56482).toLocaleString()} records)</option>
              <option value="hmda">🗺️ HMDA DPMS & Planning Layouts ({(counts.hmda || 62627).toLocaleString()} records)</option>
            </select>
            <ChevronDown
              size={18}
              color="#0284c7"
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none'
              }}
            />
          </div>
        </div>

        {/* Big Omni-Search Form */}
        <form onSubmit={handleSearchSubmit} style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-wrapper" style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
              <Search className="search-icon" size={22} style={{ left: '16px', color: '#0284c7' }} />
              <input
                type="text"
                className="search-input"
                style={{
                  padding: '15px 44px 15px 50px',
                  fontSize: '1.02rem',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 20px rgba(2, 132, 199, 0.08)',
                  border: validationError ? '2px solid #ef4444' : '1.5px solid #93c5fd',
                  width: '100%',
                  background: '#ffffff'
                }}
                placeholder={
                  datasetMode === 'hmda'
                    ? "Search HMDA Planning Layouts: Enter File No, Village, Applicant..."
                    : datasetMode === 'oc_bp'
                      ? "Search DPMS OC's & BP's: Enter File No, Permit No, Officer, Applicant..."
                      : datasetMode === 'tgbpass'
                        ? "Search TG-bPASS Archive: Enter File No, Permit No, Applicant, Architect..."
                        : "Enter Proposal File No, Permit No, Applicant, Architect, or Officer..."
                }
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  if (validationError) setValidationError('');
                }}
              />
              {searchInput && (
                <button
                  type="button"
                  className="search-clear-btn"
                  style={{ right: '14px' }}
                  onClick={() => {
                    setSearchInput('');
                    if (validationError) setValidationError('');
                  }}
                  title="Clear Input"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{
                padding: '15px 30px',
                fontSize: '1rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-md)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)'
              }}
            >
              <Search size={19} />
              <span>
                {datasetMode === 'hmda'
                  ? 'Check HMDA Layouts'
                  : datasetMode === 'oc_bp'
                    ? 'Check DPMS Archive'
                    : datasetMode === 'tgbpass'
                      ? 'Check TG-bPASS'
                      : 'Search & Check File'}
              </span>
            </button>
          </div>

          {validationError && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '12px',
              color: '#dc2626',
              fontSize: '0.86rem',
              fontWeight: 600,
              background: '#fef2f2',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #fecaca'
            }}>
              <AlertCircle size={15} />
              <span>{validationError}</span>
            </div>
          )}
        </form>
      </div>

      {/* 1. When NOT searched yet: Clean Guidance & Repository Overview */}
      {!hasSearched ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* 3 Step Guidance Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '18px'
          }}>
            <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px'
              }}>
                <FileText size={24} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px' }}>1. Enter File / Permit Number</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Type an official Proposal File Number (e.g. <code>000483/GHMC/...</code>), Temporary No, Permit No, or Applicant Name in the search box above.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px'
              }}>
                <ShieldCheck size={24} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px' }}>2. Instant Archive Verification</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Click Search to verify if the file is registered and active across <strong>172,197+</strong> unified Telangana building authority records.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#f5f3ff',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px'
              }}>
                <FileSpreadsheet size={24} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px' }}>3. Certified PDF Availability</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Immediately check whether official <strong>Proceeding Letters</strong>, certified <strong>Drawing Blueprints</strong>, and <strong>Site Inspection Reports</strong> are available to view and download.
              </p>
            </div>
          </div>

          {/* Dataset Coverage Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '18px'
          }}>
            <div className="glass-card" style={{ padding: '22px', borderLeft: '4px solid #0284c7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', background: '#f0f9ff', color: '#0284c7' }}>
                  <Layers size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>TG-bPASS Master Archive</h4>
                  <span style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 700 }}>{(85598).toLocaleString()}+ Verified Applications</span>
                </div>
              </div>
              <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                Building permissions, layouts, and occupancy certificates across GHMC, HMDA, DTCP, GWMC, and all Telangana ULBs with Proceeding Letters and Drawing Blueprints.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '22px', borderLeft: '4px solid #7c3aed' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', background: '#faf5ff', color: '#7c3aed' }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>DPMS OC's & BP's Archive</h4>
                  <span style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 700 }}>{(75942).toLocaleString()}+ Inspected Records</span>
                </div>
              </div>
              <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                Historical Occupancy Certificates and Building Permissions archive featuring certified site inspection reports, inspector names, designations, and blueprints.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '22px', borderLeft: '4px solid #0d9488' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', background: '#f0fdfa', color: '#0d9488' }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>HMDA Masterplan Layouts</h4>
                  <span style={{ fontSize: '0.78rem', color: '#0d9488', fontWeight: 700 }}>{(1271).toLocaleString()}+ Planning Permissions</span>
                </div>
              </div>
              <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                HMDA planning layout permissions across Hyderabad metropolitan region villages, mandals, and survey numbers.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* 2. When SEARCHED: Check file availability and display appropriate state */
        loading ? (
          <div className="glass-card" style={{ padding: '60px 24px', textAlign: 'center', background: '#ffffff', borderRadius: '16px' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 16px', width: '42px', height: '42px', borderWidth: '3.5px' }}></div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
              Checking Archive Availability...
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.92rem', margin: 0 }}>
              Checking if file matching <strong>"{activeQuery}"</strong> is available in <strong>{getDatasetLabel(datasetMode)}</strong>...
            </p>
          </div>
        ) : searchError ? (
          <div className="glass-card" style={{ padding: '44px 28px', textAlign: 'center', background: '#fff1f2', border: '1.5px solid #fecdd3', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9f1239', marginBottom: '8px' }}>
              Unable to Load Records
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.92rem', margin: '0 0 16px' }}>{searchError}</p>
            <button type="button" className="btn btn-primary" onClick={executeSearch}>Retry</button>
          </div>
        ) : (proposals.length === 0 && relatedFiles.length === 0) ? (
          /* NO RECORDS FOUND FOR SELECTED ARCHIVE */
          <div className="glass-card" style={{
            padding: '44px 28px',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
            border: '1.5px solid #fed7aa',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(234, 88, 12, 0.08)'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#ffedd5',
              color: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              border: '2px solid #fdba74'
            }}>
              <FileX size={32} />
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 14px',
              borderRadius: 'var(--radius-full)',
              background: '#fee2e2',
              color: '#dc2626',
              fontSize: '0.8rem',
              fontWeight: 800,
              marginBottom: '12px'
            }}>
              <XCircle size={15} />
              <span>NO RECORDS FOUND</span>
            </div>

            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
              No Records Found for "{activeQuery}"
            </h2>

            <p style={{ color: '#475569', fontSize: '1.02rem', maxWidth: '640px', margin: '0 auto 20px', lineHeight: 1.6 }}>
              No matching public records were found in <strong>{getDatasetLabel(datasetMode)}</strong>.
            </p>

            <div style={{
              maxWidth: '560px',
              margin: '0 auto 24px',
              padding: '16px 20px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              textAlign: 'left'
            }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                🔍 Search Tips:
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.7 }}>
                <li>Enter any partial reference number, permit number, or letter (e.g. <code>05188</code>, <code>0231</code>, <code>GHMC</code>, <code>ABC</code>).</li>
                {datasetMode !== 'all' && (
                  <li>You are searching only within <strong>{getDatasetLabel(datasetMode)}</strong>. The file may exist in another state archive.</li>
                )}
                <li>Search is case-insensitive (e.g. <code>abc</code> matches <code>ABC</code>).</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {datasetMode !== 'all' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setDatasetMode('all');
                    if (onDatasetModeChange) onDatasetModeChange('all');
                    setPage(1);
                  }}
                  style={{ padding: '10px 22px', fontSize: '0.92rem' }}
                >
                  <Search size={16} />
                  <span>Search Across All Archives</span>
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClear}
                style={{ padding: '10px 22px', fontSize: '0.92rem' }}
              >
                <X size={16} />
                <span>Clear & Check Another Reference</span>
              </button>
            </div>
          </div>
        ) : (
          /* FILES FOUND: Show Search Results Header + Results Table */
          <>
            {/* Search Results Summary Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '18px 24px',
              background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
              border: '1.5px solid #86efac',
              borderRadius: '14px',
              boxShadow: '0 4px 16px rgba(22, 163, 74, 0.08)',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#16a34a',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 3px 10px rgba(22, 163, 74, 0.25)'
                }}>
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span>Search Results for: <code>"{activeQuery}"</code></span>
                    <span style={{ fontSize: '0.82rem', padding: '3px 10px', borderRadius: 'var(--radius-full)', background: '#bbf7d0', color: '#166534', fontWeight: 700 }}>
                      {totalFiles.toLocaleString()} related file{totalFiles === 1 ? '' : 's'} found
                    </span>
                  </div>
                  <div style={{ fontSize: '0.86rem', color: '#166534', marginTop: '3px' }}>
                    Found across <strong>{totalRecords.toLocaleString()}</strong> application record{totalRecords === 1 ? '' : 's'} in <strong>{getDatasetLabel(datasetMode)}</strong>. View or download related certified documents below:
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* View Switcher: Related Files vs Application Dossiers */}
                <div style={{
                  display: 'inline-flex',
                  background: '#dcfce7',
                  padding: '4px',
                  borderRadius: '10px',
                  border: '1px solid #bbf7d0'
                }}>
                  <button
                    type="button"
                    onClick={() => setActiveView('files')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '7px',
                      border: 'none',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: activeView === 'files' ? '#16a34a' : 'transparent',
                      color: activeView === 'files' ? '#ffffff' : '#166534'
                    }}
                  >
                    📄 Related Files ({totalFiles})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('records')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '7px',
                      border: 'none',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: activeView === 'records' ? '#16a34a' : 'transparent',
                      color: activeView === 'records' ? '#ffffff' : '#166534'
                    }}
                  >
                    📁 Applications ({totalRecords})
                  </button>
                </div>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleClear}
                  style={{ padding: '8px 16px', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 700 }}
                  title="Reset search and check another reference"
                >
                  <X size={14} />
                  <span>New Search</span>
                </button>
              </div>
            </div>

            {/* Main Table: Related Files View (Default) or Application Dossiers View */}
            <div className="table-container">
              {activeView === 'files' ? (
                /* 1. RELATED FILES VIEW TABLE */
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px' }}>#</th>
                      <th style={{ width: '170px' }}>Document Type</th>
                      <th>Reference / Application No.</th>
                      <th>Document Name</th>
                      <th style={{ width: '150px' }}>Archive</th>
                      <th style={{ width: '95px' }}>Date</th>
                      <th style={{ width: '95px' }}>Status</th>
                      <th>Why It Matched</th>
                      <th style={{ textAlign: 'center', width: '160px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedFiles.map((file, idx) => {
                      const isAvail = file.is_available || file.status === 'Available' || file.status === 'Downloaded';
                      const docTypeLower = (file.doc_type || '').toLowerCase();
                      const isLetter = docTypeLower.includes('letter') || docTypeLower.includes('proceeding');
                      const isPlan = docTypeLower.includes('plan') || docTypeLower.includes('blueprint') || docTypeLower.includes('drawing');
                      const isReport = docTypeLower.includes('report') || docTypeLower.includes('inspection');

                      return (
                        <tr key={file.file_id || `${file.reference_no}-${file.doc_name}-${idx}`}>
                          {/* Row # */}
                          <td>
                            <span style={{ fontWeight: 700, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                              {(page - 1) * pageSize + idx + 1}
                            </span>
                          </td>

                          {/* Document / File Type */}
                          <td>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              background: isLetter ? '#f0fdf4' : (isPlan ? '#f5f3ff' : '#f0f9ff'),
                              color: isLetter ? '#15803d' : (isPlan ? '#6d28d9' : '#0369a1'),
                              border: `1px solid ${isLetter ? '#bbf7d0' : (isPlan ? '#ddd6fe' : '#bae6fd')}`
                            }}>
                              {isLetter ? <FileCheck2 size={14} /> : (isPlan ? <FileSpreadsheet size={14} /> : <ClipboardList size={14} />)}
                              <span>{file.doc_type}</span>
                            </span>
                          </td>

                          {/* Reference / Application Number */}
                          <td>
                            <div className="cell-file-no">
                              <span
                                onClick={() => onSelectProposal && onSelectProposal(file.reference_no)}
                                style={{ cursor: 'pointer', color: 'var(--accent-sky)', fontWeight: 700 }}
                                title="Click to inspect application dossier"
                              >
                                {file.reference_no}
                              </span>
                              {file.match_priority === 1 && (
                                <span style={{
                                  fontSize: '0.68rem',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  fontWeight: 800,
                                  border: '1px solid #86efac',
                                  marginLeft: '4px'
                                }}>
                                  EXACT
                                </span>
                              )}
                              <button
                                className="copy-mini-btn"
                                onClick={() => copyToClipboard(file.reference_no, 'Reference Number')}
                                title="Copy Reference"
                              >
                                <Copy size={13} />
                              </button>
                            </div>
                            {file.permit_number && file.permit_number !== file.reference_no && (
                              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                                Permit: {file.permit_number}
                              </div>
                            )}
                          </td>

                          {/* Document Name */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FileText size={14} color="#64748b" />
                              <code style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600 }}>{file.doc_name}</code>
                            </div>
                          </td>

                          {/* Archive / Repository */}
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              background: file.source_dataset === 'tgbpass' ? '#f0f9ff' : (file.source_dataset === 'hmda' ? '#f0fdfa' : '#faf5ff'),
                              color: file.source_dataset === 'tgbpass' ? '#0369a1' : (file.source_dataset === 'hmda' ? '#0d9488' : '#7c3aed'),
                              border: `1px solid ${file.source_dataset === 'tgbpass' ? '#bae6fd' : (file.source_dataset === 'hmda' ? '#99f6e4' : '#e9d5ff')}`,
                              whiteSpace: 'nowrap'
                            }}>
                              {file.source_label}
                            </span>
                          </td>

                          {/* Date */}
                          <td>
                            {file.date ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                                <Calendar size={13} color="#059669" />
                                <span>{file.date}</span>
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td>
                            {isAvail ? (
                              <span className="badge badge-completed" style={{ fontSize: '0.74rem', padding: '2px 8px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                                Available
                              </span>
                            ) : (
                              <span className="doc-pill not-available" style={{ fontSize: '0.72rem', padding: '2px 7px' }}>
                                {file.status || 'Not Available'}
                              </span>
                            )}
                          </td>

                          {/* Why It Matched */}
                          <td>
                            <div style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 600, maxWidth: '280px', lineHeight: 1.4 }} title={file.snippet}>
                              {file.snippet}
                            </div>
                          </td>

                          {/* Actions: View & Download */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                              {isAvail ? (
                                <>
                                  <button
                                    className="table-action-btn"
                                    style={{
                                      borderColor: '#86efac',
                                      color: '#15803d',
                                      background: '#f0fdf4',
                                      padding: '5px 10px',
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px'
                                    }}
                                    onClick={() => onOpenPdf(file.folder_name, file.doc_name, file.doc_type, file.reference_no)}
                                    title="View certified file in viewer"
                                  >
                                    <Eye size={13} />
                                    <span>View</span>
                                  </button>
                                  {file.can_download && (
                                    <a
                                      href={api.getDocumentUrl(file.folder_name, file.doc_name, true)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="table-action-btn"
                                      style={{
                                        borderColor: '#bae6fd',
                                        color: '#0369a1',
                                        background: '#f0f9ff',
                                        padding: '5px 10px',
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        textDecoration: 'none'
                                      }}
                                      title="Download certified PDF"
                                    >
                                      <Download size={13} />
                                      <span>Download</span>
                                    </a>
                                  )}
                                </>
                              ) : (
                                <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                  File Offline
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* 2. APPLICATION DOSSIERS VIEW TABLE */
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Row</th>
                      <th style={{ width: '135px' }}>Archive Portal</th>
                      <th>Proposal / Temporary File No.</th>
                      <th>Permit / Category</th>
                      <th>Applicant / Owner Name</th>
                      <th>Architect / Inspection Officer</th>
                      <th>Certified Documents Availability</th>
                      <th style={{ textAlign: 'center', width: '90px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((item, idx) => {
                      const isDPMS = item.source_dataset === 'oc_bp';
                      const folder = item.folder_name;

                      return (
                        <tr key={`${item.source_dataset}-${item.file_number || idx}`}>
                          {/* 1. Row index */}
                          <td>
                            <span style={{ fontWeight: 700, color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                              {item.row_number || (page - 1) * pageSize + idx + 1}
                            </span>
                          </td>

                          {/* 2. Source Badge */}
                          <td>
                            {item.source_badge_color === 'teal' ? (
                              <span className="badge-tgbpass" style={{ background: 'rgba(20, 184, 166, 0.12)', color: '#0d9488', border: '1px solid rgba(20, 184, 166, 0.25)' }}>
                                <Sparkles size={12} />
                                <span>{item.source_label || 'HMDA Layout'}</span>
                              </span>
                            ) : isDPMS ? (
                              <span className="badge-ocbp">
                                <Building2 size={12} />
                                <span>{item.source_label || 'DPMS OC/BP'}</span>
                              </span>
                            ) : (
                              <span className="badge-tgbpass">
                                <Layers size={12} />
                                <span>TG-bPASS</span>
                              </span>
                            )}
                          </td>

                          {/* 3. Proposal File Number */}
                          <td>
                            <div className="cell-file-no">
                              <span
                                onClick={() => onSelectProposal && onSelectProposal(item.file_number)}
                                style={{ cursor: 'pointer', color: 'var(--accent-sky)', fontWeight: 700 }}
                                title="Click to view full dossier"
                              >
                                {item.file_number}
                              </span>
                              <button
                                className="copy-mini-btn"
                                onClick={() => copyToClipboard(item.file_number, 'File Number')}
                                title="Copy File Number"
                              >
                                <Copy size={13} />
                              </button>
                            </div>
                          </td>

                          {/* 4. Permit No or Category */}
                          <td>
                            {isDPMS ? (
                              <div>
                                {item.permit_number ? (
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>
                                    {item.permit_number}
                                  </div>
                                ) : null}
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.72rem',
                                  color: '#7c3aed',
                                  fontWeight: 700
                                }}>
                                  {item.project_type}
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {item.meta_authority && (
                                  <span className="badge badge-neutral" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                    {item.meta_authority}
                                  </span>
                                )}
                                {item.meta_year && (
                                  <span className="badge badge-neutral" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                    {item.meta_year}
                                  </span>
                                )}
                                {item.project_type && (
                                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    {item.project_type}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 5. Applicant Name */}
                          <td>
                            <div className="cell-applicant" title={item.applicant_name}>
                              {item.applicant_name || '—'}
                            </div>
                          </td>

                          {/* 6. Architect / Inspecting Officer */}
                          <td>
                            {isDPMS ? (
                              <div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
                                  {item.officer_name || '—'}
                                </div>
                                {item.designation && (
                                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    {item.designation}
                                  </div>
                                )}
                                {item.site_inspection_on && (
                                  <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>
                                    📅 {item.site_inspection_on}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="cell-architect" title={item.architect_name}>
                                {item.architect_name || '—'}
                              </div>
                            )}
                          </td>

                          {/* 7. Certified Documents Availability */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {/* Proceeding Letter */}
                              {item.proceeding_letter_status === 'Downloaded' && (
                                <button
                                  className="table-action-btn"
                                  style={{ borderColor: '#86efac', color: '#15803d', background: '#f0fdf4', padding: '4px 8px', fontWeight: 600 }}
                                  onClick={() => onOpenPdf(folder, item.proceeding_letter_file || (isDPMS ? 'Proceeding.pdf' : 'Proceeding_Letter.pdf'), 'Proceeding Letter', item.file_number)}
                                  title="Preview & Download Proceeding Letter PDF from Google Drive"
                                >
                                  <FileCheck2 size={13} />
                                  <span>Letter (Available)</span>
                                </button>
                              )}

                              {/* DPMS Site Inspection Report */}
                              {isDPMS && item.inspection_report_status === 'Downloaded' && (
                                <button
                                  className="table-action-btn"
                                  style={{ borderColor: '#5eead4', color: '#0f766e', background: '#f0fdfa', padding: '4px 8px', fontWeight: 600 }}
                                  onClick={() => onOpenPdf(folder, item.inspection_report_file || 'Inspection Report.PDF', 'Site Inspection Report (PDF)', item.file_number)}
                                  title="Preview Site Inspection Report PDF from Google Drive"
                                >
                                  <ClipboardList size={13} />
                                  <span>Report (Available)</span>
                                </button>
                              )}

                              {/* Drawing Blueprint */}
                              {item.drawing_pdf_status === 'Downloaded' && (
                                <button
                                  className="table-action-btn"
                                  style={{ borderColor: '#c4b5fd', color: '#6d28d9', background: '#f5f3ff', padding: '4px 8px', fontWeight: 600 }}
                                  onClick={() => onOpenPdf(folder, item.drawing_pdf_file || 'Drawing.pdf', 'Drawing Blueprint (PDF)', item.file_number)}
                                  title="Preview & Download Approved Blueprint Drawing from Google Drive"
                                >
                                  <FileSpreadsheet size={13} />
                                  <span>Blueprint (Available)</span>
                                </button>
                              )}

                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="table-action-btn"
                              onClick={() => onSelectProposal(item.file_number)}
                              title="Inspect application dossier"
                            >
                              <Eye size={14} />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Pagination Bar */}
              {(relatedFiles.length > 0 || proposals.length > 0) && (
                <div className="pagination-bar" style={{ borderTop: '1px solid var(--border-glass)' }}>
                  <div>
                    Showing <strong>{activeView === 'files' ? relatedFiles.length : proposals.length}</strong> of <strong>{(activeView === 'files' ? totalFiles : totalRecords).toLocaleString()}</strong> {activeView === 'files' ? 'files' : 'records'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Rows per page:</span>
                      <select
                        className="filter-select"
                        style={{ padding: '4px 8px' }}
                        value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
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
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        title="Previous Page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span style={{ padding: '0 10px', fontWeight: 700 }}>
                        Page {page} of {totalPages || 1}
                      </span>
                      <button
                        className="page-btn"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
