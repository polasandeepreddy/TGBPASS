import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import PublicNavbar from './components/PublicNavbar';
import PublicSearchPortal from './components/PublicSearchPortal';
import StatsCards from './components/StatsCards';
import ProposalsTable from './components/ProposalsTable';
import AnalyticsView from './components/AnalyticsView';
import OcBpProposalsView from './components/OcBpProposalsView';
import ScraperMonitor from './components/ScraperMonitor';
import ProposalDetailModal from './components/ProposalDetailModal';
import PdfViewerModal from './components/PdfViewerModal';
import SyncModal from './components/SyncModal';
import QuickSearchModal from './components/QuickSearchModal';
import AdminAuthModal from './components/AdminAuthModal';
import Toast from './components/Toast';
import { api } from './services/api';

export default function App() {
  // Mode: 'public' (default citizen portal) or 'admin' (enterprise console)
  const [portalMode, setPortalMode] = useState(() => {
    const hash = (window.location.hash || '').toLowerCase();
    const path = (window.location.pathname || '').toLowerCase();
    const isAdmin = hash.includes('admin') || hash.includes('tgbpass') || path.includes('admin') || path.includes('tgbpass');
    return isAdmin ? 'admin' : 'public';
  });

  // Admin Authentication State
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return !!api.getAdminToken();
  });

  const [activeTab, setActiveTab] = useState('explorer'); // 'explorer', 'analytics', 'scraper'
  const [dataSource, setDataSource] = useState('csv');
  const [publicDatasetMode, setPublicDatasetMode] = useState('all'); // 'all', 'oc_bp', 'tgbpass'
  const [stats, setStats] = useState(null);
  const [ocBpStats, setOcBpStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Synchronized Filter State (between StatsCards & ProposalsTable)
  const [filterState, setFilterState] = useState({});

  // Modals state
  const [selectedFileNo, setSelectedFileNo] = useState(null);
  const [pdfData, setPdfData] = useState(null); // { folder, filename, title, fileNumber }
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showQuickSearch, setShowQuickSearch] = useState(false);

  // Toast notifications state
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', title = '') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Validate existing admin session token on mount
  useEffect(() => {
    const verifyStoredSession = async () => {
      const token = api.getAdminToken();
      if (token) {
        const isValid = await api.checkAdminSession();
        if (isValid) {
          setIsAdminAuthenticated(true);
        } else {
          setIsAdminAuthenticated(false);
          api.clearAdminToken();
        }
      }
    };
    verifyStoredSession();
  }, []);

  // Sync portal mode with URL hash & popstate
  useEffect(() => {
    const handleLocationChange = () => {
      const hash = (window.location.hash || '').toLowerCase();
      const path = (window.location.pathname || '').toLowerCase();
      const isAdmin = hash.includes('admin') || hash.includes('tgbpass') || path.includes('admin') || path.includes('tgbpass');
      setPortalMode(isAdmin ? 'admin' : 'public');
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // Global Keyboard Shortcuts (Ctrl+K or ⌘K for Quick Search)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowQuickSearch((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Determine current active vault
  const currentVault = activeTab === 'oc_bp' 
    ? 'oc_bp' 
    : (activeTab === 'hmda_layouts' ? 'hmda_layouts' : 'proposals');
  const isVaultView = activeTab === 'explorer' || activeTab === 'oc_bp' || activeTab === 'hmda_layouts';

  // Fetch Stats when entering Admin mode or when active vault changes
  const loadStats = useCallback(async () => {
    if (portalMode !== 'admin' || !isAdminAuthenticated) return;
    setLoadingStats(true);
    try {
      const vaultToFetch = activeTab === 'oc_bp' 
        ? 'oc_bp' 
        : (activeTab === 'hmda_layouts' ? 'hmda_layouts' : 'proposals');
      const statsRes = await api.getStats(dataSource, vaultToFetch);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [dataSource, activeTab, portalMode, isAdminAuthenticated]);

  useEffect(() => {
    if (portalMode === 'admin' && isAdminAuthenticated) {
      loadStats();
    }
  }, [loadStats, portalMode, isAdminAuthenticated]);

  const switchToPublic = () => {
    setPortalMode('public');
    window.location.hash = '#/';
    addToast('Returned to Public Citizen Portal', 'info', 'Public Mode');
  };

  const openAdminLogin = () => {
    setPortalMode('admin');
    window.location.hash = '#admin';
  };

  const handleAdminAuthenticated = (token) => {
    if (token) api.setAdminToken(token);
    setIsAdminAuthenticated(true);
    setPortalMode('admin');
    window.location.hash = '#admin';
  };

  const handleLockAdmin = async () => {
    await api.adminLogout();
    setIsAdminAuthenticated(false);
    switchToPublic();
    addToast('Admin Operations Console Locked', 'warning', 'Locked');
  };

  const handleOpenPdf = (folder, filename, title, fileNumber) => {
    setPdfData({ folder, filename, title, fileNumber });
  };

  const handleFilterChange = (newFilters) => {
    setFilterState(prev => ({ ...prev, ...newFilters }));
  };

  return (
    <div className="app-container">
      {/* 1. Header Navigation based on Mode & Auth */}
      {portalMode === 'public' || !isAdminAuthenticated ? (
        <PublicNavbar 
          onOpenAdmin={openAdminLogin} 
          activeDataset={publicDatasetMode}
          onSelectDataset={setPublicDatasetMode}
        />
      ) : (
        <Navbar 
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setFilterState({}); // Reset filters when changing dropdown vault
          }}
          dataSource={dataSource}
          setDataSource={setDataSource}
          onRefresh={() => {
            loadStats();
            addToast('Datasets and metrics refreshed', 'success');
          }}
          onOpenSync={() => setShowSyncModal(true)}
          onOpenQuickSearch={() => setShowQuickSearch(true)}
          onSwitchToPublic={switchToPublic}
          onLockAdmin={handleLockAdmin}
          mysqlConnected={stats?.mysql_connected}
          totalRecords={stats?.proposals_total || 53088}
          ocBpTotalRecords={stats?.oc_bp_total || 56482}
          hmdaTotalRecords={stats?.hmda_total || 62627}
          loading={loadingStats}
        />
      )}

      {/* 2. Main Content */}
      <main className="main-content">
        {/* PUBLIC CITIZEN SEARCH PORTAL */}
        {portalMode === 'public' && (
          <PublicSearchPortal 
            datasetMode={publicDatasetMode}
            onDatasetModeChange={setPublicDatasetMode}
            onOpenPdf={handleOpenPdf}
            onSelectProposal={(fileNo) => setSelectedFileNo(fileNo)}
            onShowToast={addToast}
          />
        )}

        {/* ADMIN SECURITY GATE (Email + OTP Protected) */}
        {portalMode === 'admin' && !isAdminAuthenticated && (
          <>
            <PublicSearchPortal 
              datasetMode={publicDatasetMode}
              onDatasetModeChange={setPublicDatasetMode}
              onOpenPdf={handleOpenPdf}
              onSelectProposal={(fileNo) => setSelectedFileNo(fileNo)}
              onShowToast={addToast}
            />
            <AdminAuthModal 
              onAuthenticated={handleAdminAuthenticated}
              onCancel={switchToPublic}
              onShowToast={addToast}
            />
          </>
        )}

        {/* ADMIN MANAGEMENT CONSOLE (Unlocked) */}
        {portalMode === 'admin' && isAdminAuthenticated && (
          <>
            {/* Top 6 KPI Metrics Banner (changes dynamically for all 3 vaults) */}
            {isVaultView && (
              <StatsCards 
                key={`stats-${currentVault}`}
                stats={stats} 
                activeFilter={filterState}
                onFilterChange={handleFilterChange}
              />
            )}

            {/* Unified Vault Proposals Table */}
            {isVaultView && (
              <ProposalsTable 
                key={`table-${currentVault}`}
                vault={currentVault}
                dataSource={dataSource}
                filterState={filterState}
                onFilterStateChange={setFilterState}
                onSelectProposal={(fileNo) => setSelectedFileNo(fileNo)}
                onOpenPdf={handleOpenPdf}
                onShowToast={addToast}
              />
            )}

            {/* View 3: BI Intelligence Analytics */}
            {activeTab === 'analytics' && (
              <AnalyticsView dataSource={dataSource} />
            )}

            {/* View 4: Live Scraper Session Monitor */}
            {activeTab === 'scraper' && (
              <ScraperMonitor onShowToast={addToast} />
            )}
          </>
        )}
      </main>

      {/* Proposal Dossier Modal */}
      {selectedFileNo && (
        <ProposalDetailModal 
          fileNumber={selectedFileNo}
          onClose={() => setSelectedFileNo(null)}
          onOpenPdf={handleOpenPdf}
          onShowToast={addToast}
        />
      )}

      {/* In-App PDF Preview Workspace */}
      {pdfData && (
        <PdfViewerModal 
          folder={pdfData.folder}
          filename={pdfData.filename}
          title={pdfData.title}
          fileNumber={pdfData.fileNumber}
          onClose={() => setPdfData(null)}
          onShowToast={addToast}
        />
      )}

      {/* Database Sync Wizard Modal (Admin) */}
      {showSyncModal && isAdminAuthenticated && (
        <SyncModal 
          onClose={() => setShowSyncModal(false)}
          onSyncComplete={loadStats}
          onShowToast={addToast}
        />
      )}

      {/* Spotlight Command Palette (Ctrl+K) */}
      {isAdminAuthenticated && (
        <QuickSearchModal
          isOpen={showQuickSearch}
          onClose={() => setShowQuickSearch(false)}
          onSelectProposal={(fileNo) => {
            setSelectedFileNo(fileNo);
            setShowQuickSearch(false);
          }}
          onNavigateTab={(tab) => {
            setActiveTab(tab);
            setShowQuickSearch(false);
          }}
          onApplyFilter={(filters) => {
            handleFilterChange(filters);
            setShowQuickSearch(false);
          }}
          onOpenSync={() => {
            setShowQuickSearch(false);
            setShowSyncModal(true);
          }}
        />
      )}

      {/* Toast Notification Container */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
