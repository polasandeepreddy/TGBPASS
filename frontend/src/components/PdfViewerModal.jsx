import React from 'react';
import { X, Download, ExternalLink, FileText, Maximize2, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';

export default function PdfViewerModal({ 
  folder, 
  filename, 
  title, 
  fileNumber, 
  onClose,
  onShowToast
}) {
  if (!folder || !filename) return null;

  const docUrl = api.getDocumentUrl(folder, filename);
  const downloadUrl = api.getDocumentUrl(folder, filename, true);

  const copyDocLink = () => {
    navigator.clipboard.writeText(window.location.origin + docUrl);
    if (onShowToast) onShowToast('PDF preview link copied to clipboard!', 'success');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <FileText size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{title || 'Document Inspection Preview'}</h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--accent-sky)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fileNumber}</span> • <code>{folder}/{filename}</code>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="icon-btn" 
              title="Copy PDF URL"
              onClick={copyDocLink}
            >
              <ExternalLink size={16} />
            </button>
            <a 
              href={docUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="icon-btn"
              title="Open in Full Browser Tab"
            >
              <Maximize2 size={16} />
            </a>
            <a 
              href={downloadUrl} 
              download 
              className="icon-btn"
              title="Download PDF File"
            >
              <Download size={16} />
            </a>
            <button className="icon-btn" onClick={onClose} title="Close Preview">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Embedded PDF View Frame */}
        <div className="modal-body" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="pdf-preview-container">
            <iframe 
              src={docUrl} 
              title="PDF Preview"
              className="pdf-iframe"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
            <ShieldCheck size={14} color="var(--success)" />
            <span>Streaming verified physical document directly from Google Drive Cloud Storage</span>
          </div>
          <button className="page-btn" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
