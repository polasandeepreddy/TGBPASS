import React from 'react';
import { Building2 } from 'lucide-react';
import DonateButton from './DonateButton';

export default function PublicNavbar({ onOpenAdmin, onGoHome }) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <div
          className="navbar-brand"
          style={{ cursor: 'pointer' }}
          role="link"
          tabIndex={0}
          title="Go to home"
          onClick={onGoHome}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGoHome?.(); } }}
        >
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
          <DonateButton />
        </div>
      </div>
    </header>
  );
}
