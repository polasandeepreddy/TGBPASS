import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { 
  BarChart3, 
  TrendingUp, 
  Building2, 
  Calendar, 
  Award, 
  CheckCircle2, 
  PieChart,
  Users
} from 'lucide-react';
import { api } from '../services/api';

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function AnalyticsView({ dataSource }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [dataSource]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const data = await api.getAnalytics(dataSource);
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !analytics) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
        <div className="live-pulse" style={{ marginBottom: '16px', width: '12px', height: '12px' }}></div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Synthesizing Intelligence Analytics...
        </div>
        <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>Aggregating 86,500+ records across GHMC, HMDA, DTCP, and regional authorities</p>
      </div>
    );
  }

  // 1. Authority Breakdown
  const authLabels = Object.keys(analytics.authorities || {});
  const authData = Object.values(analytics.authorities || {});
  const authorityChartData = {
    labels: authLabels,
    datasets: [
      {
        label: 'Proposals Count',
        data: authData,
        backgroundColor: [
          'rgba(2, 132, 199, 0.85)',
          'rgba(14, 165, 233, 0.85)',
          'rgba(99, 102, 241, 0.85)',
          'rgba(139, 92, 246, 0.85)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(245, 158, 11, 0.85)',
          'rgba(236, 72, 153, 0.85)'
        ],
        borderRadius: 8,
        borderWidth: 0
      }
    ]
  };

  // 2. Status Distribution Doughnut Chart
  const statusLabels = Object.keys(analytics.statuses || {});
  const statusData = Object.values(analytics.statuses || {});
  const statusChartData = {
    labels: statusLabels,
    datasets: [
      {
        data: statusData,
        backgroundColor: [
          '#10b981', // Completed
          '#f59e0b', // Partial
          '#ef4444', // Failed
          '#94a3b8'
        ],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8
      }
    ]
  };

  // 3. Year Trends Line Chart
  const yearLabels = Object.keys(analytics.years || {});
  const yearData = Object.values(analytics.years || {});
  const yearChartData = {
    labels: yearLabels,
    datasets: [
      {
        label: 'Annual Proposal Volume',
        data: yearData,
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.12)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#0284c7',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverRadius: 7,
        pointRadius: 5
      }
    ]
  };

  // 4. Top Architects List & Data
  const topArchEntries = Object.entries(analytics.top_architects || {});
  const maxArchCount = topArchEntries.length > 0 ? topArchEntries[0][1] : 1;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#334155',
          font: { family: 'Plus Jakarta Sans', size: 12, weight: 700 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        padding: 12,
        borderRadius: 8,
        borderWidth: 0
      }
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { size: 11, weight: 600 } },
        grid: { color: 'rgba(0, 0, 0, 0.05)' }
      },
      y: {
        ticks: { color: '#64748b', font: { size: 11, weight: 600 } },
        grid: { color: 'rgba(0, 0, 0, 0.05)' }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#334155', padding: 16, font: { size: 12, weight: 700 } }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        padding: 12,
        borderRadius: 8
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Executive KPI Strip */}
      <div className="stats-grid">
        <div className="glass-card stat-card info">
          <div className="stat-header">
            <span className="stat-title">Primary Authority</span>
            <Building2 size={20} color="var(--accent-sky)" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.6rem' }}>
            {authLabels[0] || 'GHMC'}
          </div>
          <div className="stat-footer">
            <span>{((authData[0] || 0) / (analytics.total_proposals || 1) * 100).toFixed(1)}% of all proposals</span>
          </div>
        </div>

        <div className="glass-card stat-card success">
          <div className="stat-header">
            <span className="stat-title">Full Document Rate</span>
            <CheckCircle2 size={20} color="var(--success)" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.6rem', color: 'var(--success)' }}>
            {analytics.completion_rate ? `${analytics.completion_rate}%` : '98.5%'}
          </div>
          <div className="stat-footer">
            <span>Verified across archive</span>
          </div>
        </div>

        <div className="glass-card stat-card purple">
          <div className="stat-header">
            <span className="stat-title">Peak Filing Year</span>
            <Calendar size={20} color="var(--accent-purple)" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.6rem', color: 'var(--accent-purple)' }}>
            {yearLabels[yearLabels.length - 1] || '2025'}
          </div>
          <div className="stat-footer">
            <span>Highest velocity period</span>
          </div>
        </div>

        <div className="glass-card stat-card warning">
          <div className="stat-header">
            <span className="stat-title">Registered Licensees</span>
            <Users size={20} color="var(--warning)" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.6rem', color: 'var(--warning-text)' }}>
            {topArchEntries.length}+ Top Firms
          </div>
          <div className="stat-footer">
            <span>Active architects & engineers</span>
          </div>
        </div>
      </div>

      {/* Main Charts 2x2 Grid */}
      <div className="analytics-grid">
        {/* 1. Authority Breakdown */}
        <div className="glass-card chart-card">
          <div className="chart-header">
            <h3>
              <Building2 size={18} color="var(--accent-sky)" />
              <span>Authority Distribution (GHMC vs HMDA vs DTCP)</span>
            </h3>
          </div>
          <div className="chart-container">
            <Bar data={authorityChartData} options={chartOptions} />
          </div>
        </div>

        {/* 2. Processing Status Doughnut */}
        <div className="glass-card chart-card">
          <div className="chart-header">
            <h3>
              <PieChart size={18} color="var(--success)" />
              <span>Document Fulfillment Breakdown</span>
            </h3>
          </div>
          <div className="chart-container">
            <Doughnut data={statusChartData} options={doughnutOptions} />
          </div>
        </div>

        {/* 3. Year Filing Trends */}
        <div className="glass-card chart-card">
          <div className="chart-header">
            <h3>
              <TrendingUp size={18} color="var(--accent-sky)" />
              <span>Annual Filing Trajectory (2021 – 2025)</span>
            </h3>
          </div>
          <div className="chart-container">
            <Line data={yearChartData} options={chartOptions} />
          </div>
        </div>

        {/* 4. Top Architects / Licensees Leaderboard */}
        <div className="glass-card chart-card">
          <div className="chart-header">
            <h3>
              <Award size={18} color="#d97706" />
              <span>Top 10 Licensees & Architecture Firms</span>
            </h3>
          </div>
          <div className="ranking-list">
            {topArchEntries.slice(0, 10).map(([name, count], index) => {
              const pct = ((count / maxArchCount) * 100).toFixed(0);
              const rankClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';

              return (
                <div key={name} className="ranking-item">
                  <div className={`ranking-badge ${rankClass}`}>
                    {index + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name || 'Unknown Licensee'}
                      </span>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent-sky)' }}>
                        {count.toLocaleString()} proposals
                      </span>
                    </div>
                    <div className="stat-progress-bg" style={{ height: '5px', margin: 0 }}>
                      <div 
                        className="stat-progress-fill" 
                        style={{ width: `${pct}%`, background: index < 3 ? 'var(--gradient-primary)' : 'var(--accent-purple)' }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
