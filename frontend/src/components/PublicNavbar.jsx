import React from 'react';
import {
  Building2,
  ShieldCheck
} from 'lucide-react';

export default function PublicNavbar({ onOpenAdmin }) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <div className="navbar-brand" style={{ cursor: 'default' }}>
          <div className="brand-logo" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div className="brand-title">
              <span>TG-bPASS</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', letterSpacing: '0.04em' }}>CITIZEN PORTAL</span>
            </div>
            <div className="brand-subtitle">Telangana Building Permission & Document Verification</div>
          </div>
        </div>

        {/* Right Info Badge & Admin Link */}
        <div className="nav-actions">
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontSize: '0.8rem',
            fontWeight: 600
          }}>
            <ShieldCheck size={15} color="#16a34a" />
            <span>Government of Telangana</span>
          </div>
        </div>
      </div>
    </header>
  );
}
