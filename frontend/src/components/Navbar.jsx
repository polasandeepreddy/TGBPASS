import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  Database,
  Layers,
  BarChart3,
  Activity,
  RefreshCw,
  ArrowLeftRight,
  Search,
  Shield,
  LogOut,
  Globe,
  ChevronDown,
  Sparkles,
  Check,
  FolderTree,
  Landmark,
  ShieldAlert
} from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  dataSource,
  setDataSource,
  onRefresh,
  onOpenSync,
  onOpenQuickSearch,
  onSwitchToPublic,
  onLockAdmin,
  mysqlConnected,
  totalRecords,
  ocBpTotalRecords,
  hmdaTotalRecords,
  loading
}) {
  const [vaultDropdownOpen, setVaultDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setVaultDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatCount = (num) => {
    if (num === undefined || num === null || num === 0) return '0';
    return Number(num).toLocaleString();
  };

  const isVaultTabActive = activeTab === 'explorer' || activeTab === 'oc_bp' || activeTab === 'hmda_layouts';

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Left: Brand Identity */}
        <div className="navbar-brand" onClick={() => setActiveTab('explorer')}>
          <div className="brand-logo">
            <Shield size={22} />
          </div>
          <div>
            <div className="brand-title">
              <span>TG-bPASS</span>
              <span className="brand-badge">ADMIN HUB</span>
            </div>
            <div className="brand-subtitle">Telangana Building Intelligence & Operations Console</div>
          </div>
        </div>

        {/* Omnibar Quick Search Trigger */}
        <div className="omnibar-trigger" onClick={onOpenQuickSearch} title="Quick Spotlight Search (Ctrl+K or ⌘K)">
          <Search size={15} />
          <span>Quick search or command...</span>
          <span className="omnibar-badge">⌘K</span>
        </div>

        {/* Center: Navigation Tabs */}
        <nav className="nav-tabs">
          {/* Vaults & Datasets Dropdown */}
          <div className="nav-dropdown-wrapper" ref={dropdownRef}>
            <button
              className={`nav-tab-btn ${isVaultTabActive ? 'active' : ''}`}
              onClick={() => setVaultDropdownOpen(!vaultDropdownOpen)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              title="Select Dataset Vault"
            >
              {activeTab === 'hmda_layouts' ? (
                <>
                  <FolderTree size={16} />
                  <span>HMDA Planning Layouts</span>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 'var(--radius-full)',
                    background: isVaultTabActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(20, 184, 166, 0.12)',
                    color: isVaultTabActive ? '#ffffff' : '#0d9488',
                    marginLeft: '2px'
                  }}>
                    {formatCount(hmdaTotalRecords || 1762)}
                  </span>
                </>
              ) : activeTab === 'oc_bp' ? (
                <>
                  <Building2 size={16} />
                  <span>DPMS OC's & BP's</span>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 'var(--radius-full)',
                    background: isVaultTabActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(2, 132, 199, 0.12)',
                    color: isVaultTabActive ? '#ffffff' : '#0284c7',
                    marginLeft: '2px'
                  }}>
                    {formatCount(ocBpTotalRecords)}
                  </span>
                </>
              ) : (
                <>
                  <Layers size={16} />
                  <span>Proposals Vault</span>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '1px 7px',
                    borderRadius: 'var(--radius-full)',
                    background: isVaultTabActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(2, 132, 199, 0.12)',
                    color: isVaultTabActive ? '#ffffff' : '#0284c7',
                    marginLeft: '2px'
                  }}>
                    {formatCount(totalRecords)}
                  </span>
                </>
              )}
              <ChevronDown
                size={14}
                style={{
                  transform: vaultDropdownOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                  opacity: 0.85,
                  marginLeft: '2px'
                }}
              />
            </button>

            {/* Dropdown Menu */}
            {vaultDropdownOpen && (
              <div className="nav-dropdown-menu">
                <div className="nav-dropdown-header">
                  <Database size={13} color="#0284c7" />
                  <span>REPOSITORIES & ARCHIVES</span>
                </div>

                {/* Option 1: Proposals Vault */}
                <button
                  type="button"
                  className={`nav-dropdown-item ${activeTab === 'explorer' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('explorer');
                    setVaultDropdownOpen(false);
                  }}
                >
                  <div className="nav-dropdown-item-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                    <Layers size={18} />
                  </div>
                  <div className="nav-dropdown-item-body">
                    <div className="nav-dropdown-item-title">
                      <span>Proposals Vault</span>
                      <span className="nav-dropdown-badge">{formatCount(totalRecords)}</span>
                    </div>
                    <div className="nav-dropdown-item-desc">
                      TG-bPASS Master Building Permissions & Scraped Dossiers
                    </div>
                  </div>
                  {activeTab === 'explorer' && <Check size={16} color="#0284c7" />}
                </button>

                {/* Option 2: DPMS OC's & BP's */}
                <button
                  type="button"
                  className={`nav-dropdown-item ${activeTab === 'oc_bp' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('oc_bp');
                    setVaultDropdownOpen(false);
                  }}
                >
                  <div className="nav-dropdown-item-icon" style={{ background: '#ecfeff', color: '#0891b2' }}>
                    <Building2 size={18} />
                  </div>
                  <div className="nav-dropdown-item-body">
                    <div className="nav-dropdown-item-title">
                      <span>DPMS OC's & BP's</span>
                      <span className="nav-dropdown-badge" style={{ background: '#ecfeff', color: '#0891b2', borderColor: '#a5f3fc' }}>
                        {formatCount(ocBpTotalRecords)}
                      </span>
                    </div>
                    <div className="nav-dropdown-item-desc">
                      Occupancy Certificates & DPMS Site Inspection Reports
                    </div>
                  </div>
                  {activeTab === 'oc_bp' && <Check size={16} color="#0891b2" />}
                </button>

                {/* Option 3: HMDA Planning Layouts Vault */}
                <button
                  type="button"
                  className={`nav-dropdown-item ${activeTab === 'hmda_layouts' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('hmda_layouts');
                    setVaultDropdownOpen(false);
                  }}
                >
                  <div className="nav-dropdown-item-icon" style={{ background: '#f0fdfa', color: '#0d9488' }}>
                    <FolderTree size={18} />
                  </div>
                  <div className="nav-dropdown-item-body">
                    <div className="nav-dropdown-item-title">
                      <span>HMDA Planning Layouts Vault</span>
                      <span className="nav-dropdown-badge" style={{ background: '#f0fdfa', color: '#0d9488', borderColor: '#99f6e4' }}>
                        {formatCount(hmdaTotalRecords || 1762)}
                      </span>
                    </div>
                    <div className="nav-dropdown-item-desc">
                      Masterplan Open Plot Layouts, Subdivisions & LO Approvals
                    </div>
                  </div>
                  {activeTab === 'hmda_layouts' && <Check size={16} color="#0d9488" />}
                </button>

                <div className="nav-dropdown-divider" />

                {/* Upcoming Modules in Planning */}
                <div className="nav-dropdown-header" style={{ color: '#b45309' }}>
                  <Sparkles size={13} color="#f59e0b" />
                  <span>UPCOMING VAULTS (IN PLANNING)</span>
                </div>

                {/* Planned 1: Gram Panchayat & Rural Sanctions */}
                <div className="nav-dropdown-item disabled" title="Panchayat Raj & Rural Building Permissions (In Planning)">
                  <div className="nav-dropdown-item-icon" style={{ background: '#f3e8ff', color: '#9333ea' }}>
                    <Landmark size={18} />
                  </div>
                  <div className="nav-dropdown-item-body">
                    <div className="nav-dropdown-item-title">
                      <span style={{ color: '#475569' }}>Gram Panchayat & Rural Sanctions</span>
                      <span className="nav-dropdown-planned-badge" style={{ background: '#f3e8ff', color: '#7e22ce', borderColor: '#e9d5ff' }}>
                        Planned
                      </span>
                    </div>
                    <div className="nav-dropdown-item-desc">
                      PR & RD Department Building Approvals & Land Records
                    </div>
                  </div>
                </div>

                {/* Planned 3: Fire NOC & High-Rise Clearance */}
                <div className="nav-dropdown-item disabled" title="Disaster & Fire Safety Clearances (In Planning)">
                  <div className="nav-dropdown-item-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                    <ShieldAlert size={18} />
                  </div>
                  <div className="nav-dropdown-item-body">
                    <div className="nav-dropdown-item-title">
                      <span style={{ color: '#475569' }}>Fire NOC & Structural Compliance</span>
                      <span className="nav-dropdown-planned-badge" style={{ background: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca' }}>
                        Planned
                      </span>
                    </div>
                    <div className="nav-dropdown-item-desc">
                      High-Rise Safety Audits, Fire Clearances & Multi-Agency NOCs
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

          <button
            className={`nav-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 size={16} />
            <span>BI Analytics</span>
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'scraper' ? 'active' : ''}`}
            onClick={() => setActiveTab('scraper')}
          >
            <Activity size={16} />
            <span>Scraper Monitor</span>
          </button>
        </nav>

        {/* Right: Controls & Actions */}
        <div className="nav-actions">
          {/* Data Source Selector */}
          <div className="source-selector" title="Switch data engine between Live MySQL DB and Master CSV">
            <Database size={15} color={mysqlConnected ? 'var(--success)' : 'var(--warning)'} />
            <select
              className="source-select"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
            >
              <option value="auto">Auto (Live DB)</option>
              <option value="mysql" disabled={!mysqlConnected}>MySQL Database {mysqlConnected ? '🟢' : '🔴'}</option>
              <option value="csv">CSV Archive</option>
            </select>
          </div>

          {/* Sync CSV to MySQL Button */}
          {mysqlConnected && (
            <button
              className="icon-btn"
              title="Sync master CSV records into MySQL database"
              onClick={onOpenSync}
            >
              <ArrowLeftRight size={17} />
            </button>
          )}

          {/* Refresh Data Button */}
          <button
            className="icon-btn"
            title="Refresh All Datasets & Telemetry"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Public Portal Switcher */}
          {onSwitchToPublic && (
            <button
              className="icon-btn"
              title="Return to Public Citizen Portal"
              onClick={onSwitchToPublic}
            >
              <Globe size={17} />
            </button>
          )}

          {/* Logout / Lock Admin */}
          {onLockAdmin && (
            <button
              className="icon-btn"
              title="Lock Admin Console & Logout"
              onClick={onLockAdmin}
              style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
