/**
 * TG-bPASS API Service Layer
 * Supports Public Searches, Document Fetching, and Authenticated Admin Operations with Email+OTP.
 */

const API_BASE = (import.meta.env && import.meta.env.VITE_API_URL) ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api' : '/api';
const TOKEN_KEY = 'tgbpass_admin_token';

export const api = {
  // --- Admin Token Storage Management ---
  getAdminToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  },

  setAdminToken(token) {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem('tgbpass_admin_auth', 'true');
    } else {
      this.clearAdminToken();
    }
  },

  clearAdminToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('tgbpass_admin_auth');
  },

  getAuthHeaders() {
    const token = this.getAdminToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Admin-Token'] = token;
    }
    return headers;
  },

  // --- Public APIs ---

  // Fetch overall statistics
  async getStats(source = 'auto', vault = 'proposals') {
    const res = await fetch(`${API_BASE}/stats?source=${source}&vault=${vault}`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    const json = await res.json();
    return json.data;
  },

  // Unified multi-dataset omni-search (TG-bPASS 86.5k + DPMS OC's & BP's 169)
  async getUnifiedSearch(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });

    const res = await fetch(`${API_BASE}/unified-search?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch unified search results');
    const json = await res.json();
    return json.data;
  },

  // Public Search: Search by number, letter, or alphanumeric reference to find related files & records
  async getPublicSearch(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });

    const res = await fetch(`${API_BASE}/public-search?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch public search results');
    const json = await res.json();
    return json.data;
  },

  // Fetch paginated & filtered proposals
  async getProposals(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });

    const res = await fetch(`${API_BASE}/proposals?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch proposals');
    const json = await res.json();
    return json.data;
  },

  // Fetch single proposal detail
  async getProposalDetail(fileNumber) {
    const res = await fetch(`${API_BASE}/proposals/${encodeURIComponent(fileNumber)}`);
    if (!res.ok) throw new Error('Failed to fetch proposal details');
    const json = await res.json();
    return json.data;
  },

  // Fetch analytics charts data
  async getAnalytics(source = 'auto') {
    const res = await fetch(`${API_BASE}/analytics?source=${source}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    const json = await res.json();
    return json.data;
  },

  // Get Document Preview URL
  getDocumentUrl(folder, filename, download = false) {
    return `${API_BASE}/document/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}${download ? '?download=1' : ''}`;
  },

  // Export CSV URL
  getExportUrl(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    return `${API_BASE}/export?${query.toString()}`;
  },

  // --- DPMS OC's & BP's APIs ---

  // Fetch DPMS OC & BP overview statistics
  async getOcBpStats() {
    const res = await fetch(`${API_BASE}/oc-bp/stats`);
    if (!res.ok) throw new Error('Failed to fetch OC & BP stats');
    const json = await res.json();
    return json.data;
  },

  // Fetch paginated & filtered DPMS OC & BP proposals
  async getOcBpProposals(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });

    const res = await fetch(`${API_BASE}/oc-bp/proposals?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch OC & BP proposals');
    const json = await res.json();
    return json.data;
  },

  // Fetch single DPMS OC & BP proposal dossier
  async getOcBpDetail(fileNumber) {
    const res = await fetch(`${API_BASE}/oc-bp/${encodeURIComponent(fileNumber)}`);
    if (!res.ok) throw new Error('Failed to fetch OC & BP details');
    const json = await res.json();
    return json.data;
  },

  // Export DPMS OC & BP CSV URL
  getOcBpExportUrl(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    return `${API_BASE}/oc-bp/export?${query.toString()}`;
  },

  // --- Admin Authentication & OTP Flow ---

  // Step 1: Request OTP for fixed authorized email
  async requestAdminOtp(email) {
    const res = await fetch(`${API_BASE}/admin/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: (email || '').trim() })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to request OTP. Access denied.');
    }
    return json;
  },

  // Step 2: Verify 6-digit OTP code
  async verifyAdminOtp(email, otp) {
    const res = await fetch(`${API_BASE}/admin/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: (email || '').trim(),
        otp: (otp || '').trim()
      })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Invalid or expired OTP verification code.');
    }
    if (json.token) {
      this.setAdminToken(json.token);
    }
    return json;
  },

  // Check active admin session validity
  async checkAdminSession() {
    const token = this.getAdminToken();
    if (!token) return false;

    try {
      const res = await fetch(`${API_BASE}/admin/session`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) {
        this.clearAdminToken();
        return false;
      }
      const json = await res.json();
      return json.authenticated === true;
    } catch {
      return false;
    }
  },

  // Logout admin
  async adminLogout() {
    try {
      await fetch(`${API_BASE}/admin/logout`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
    } catch (e) {
      console.warn('Logout error:', e);
    } finally {
      this.clearAdminToken();
    }
    return true;
  },

  // Legacy verify admin fallback
  async verifyAdminAuth(keyOrPin) {
    const res = await fetch(`${API_BASE}/admin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: keyOrPin, pin: keyOrPin })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Invalid Admin Security Key or PIN');
    }
    if (json.token) {
      this.setAdminToken(json.token);
    }
    return json;
  },

  // --- Protected Admin Operations ---

  // Sync CSV data to MySQL
  async syncToMysql(limit = 1000) {
    const res = await fetch(`${API_BASE}/sync-to-mysql`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ limit })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Sync failed');
    return json;
  },

  // Fetch scraper live status & logs
  async getScraperStatus() {
    const res = await fetch(`${API_BASE}/scraper-status`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch scraper status');
    const json = await res.json();
    return json.data;
  }
};
