import React, { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  User, 
  FileCheck2, 
  FileSpreadsheet, 
  Download, 
  Eye, 
  Folder,
  AlertTriangle,
  HardDrive,
  Copy,
  Calendar,
  Layers,
  FileCode,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';

export default function ProposalDetailModal({ 
  fileNumber, 
  onClose, 
  onOpenPdf,
  onShowToast
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, documents, raw

  useEffect(() => {
    if (!fileNumber) return;
    fetchDetail();
  }, [fileNumber]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const data = await api.getProposalDetail(fileNumber);
      setDetail(data);
    } catch (err) {
      console.error("Failed to load proposal detail:", err);
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text, label) => {
    navigator.clipboard.writeText(text);
    if (onShowToast) onShowToast(`Copied ${label} to clipboard!`, 'success');
  };

  if (!fileNumber) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Building2 size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-sky)' }}>
                  {fileNumber}
                </h3>
                <button 
                  className="copy-mini-btn" 
                  onClick={() => copyText(fileNumber, 'File Number')}
                  title="Copy File Number"
                  style={{ opacity: 1 }}
                >
                  <Copy size={14} />
                </button>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Government Proposal Dossier & Document Inspection
              </div>
            </div>
          </div>

          <button className="icon-btn" onClick={onClose} title="Close (ESC)">
            <X size={18} />
          </button>
        </div>

        {/* Dossier Tabs Header */}
        <div style={{ padding: '0 24px', background: 'var(--bg-tertiary)' }}>
          <div className="dossier-tabs" style={{ margin: 0 }}>
            <button 
              className={`dossier-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview & Compliance
            </button>
            {(detail?.site_inspection_table?.length > 0 || detail?.officer_name) && (
              <button 
                className={`dossier-tab-btn ${activeTab === 'inspection' ? 'active' : ''}`}
                onClick={() => setActiveTab('inspection')}
              >
                Site Inspection & Officers
              </button>
            )}
            <button 
              className={`dossier-tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('documents')}
            >
              Document Vault (PDFs)
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
              <div className="live-pulse" style={{ marginBottom: '12px', width: '12px', height: '12px' }}></div>
              <div>Retrieving high-fidelity proposal records from data provider...</div>
            </div>
          ) : !detail ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--danger-text)' }}>
              Proposal record not found in active database or CSV archive.
            </div>
          ) : (
            <div>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Metadata Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                    background: 'var(--bg-tertiary)',
                    padding: '20px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-glass)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Authority & Category</div>
                      <div style={{ fontWeight: 700, color: 'var(--accent-sky)', fontSize: '1.05rem', marginTop: '2px' }}>
                        {detail.project_type || detail.meta?.authority || 'GHMC / Telangana'}
                      </div>
                      {detail.case_type && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Case: {detail.case_type}</div>
                      )}
                    </div>

                    {detail.permit_number && (
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Permit Number</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                            {detail.permit_number}
                          </span>
                          <button className="copy-mini-btn" onClick={() => copyText(detail.permit_number, 'Permit Number')}>
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Filing Year & Jurisdiction</div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>
                        {detail.meta?.year || '—'} {detail.village ? `• ${detail.village}` : ''}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fulfillment State</div>
                      <div style={{ marginTop: '4px' }}>
                        <span className={`badge badge-${(detail.processing_status || (detail.is_oc_bp ? 'Completed' : 'Pending')).toLowerCase().replace(/ /g, '')}`}>
                          <span className="badge-dot"></span>
                          {detail.processing_status || (detail.is_oc_bp ? 'Verified' : 'Pending')}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Google Drive Cloud Folder</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <code style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>{detail.folder_name || detail.Folder || '—'}</code>
                        <button 
                          className="copy-mini-btn" 
                          onClick={() => copyText(detail.folder_name || detail.Folder, 'Folder Name')}
                          style={{ opacity: 1 }}
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Applicant & Architect Info Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
                          <User size={16} />
                          <span>APPLICANT / OWNER</span>
                        </div>
                        <button className="copy-mini-btn" onClick={() => copyText(detail.applicant_name, 'Applicant Name')} style={{ opacity: 1 }}>
                          <Copy size={13} />
                        </button>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.4 }}>
                        {detail.applicant_name || detail.Applicant_Name || '—'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-tertiary)', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
                          <Building2 size={16} />
                          <span>REGISTERED ARCHITECT / LICENSEE</span>
                        </div>
                        <button className="copy-mini-btn" onClick={() => copyText(detail.architect_name, 'Architect Name')} style={{ opacity: 1 }}>
                          <Copy size={13} />
                        </button>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem', lineHeight: 1.4 }}>
                        {detail.architect_name || detail.Architect_LE_SE_Name || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Officer & Inspection Quick Info (if available) */}
                  {detail.officer_name && (
                    <div style={{ background: 'var(--bg-tertiary)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inspecting Officer</div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.98rem', marginTop: '2px' }}>
                          {detail.officer_name} {detail.designation ? `(${detail.designation})` : ''}
                        </div>
                      </div>
                      {detail.site_inspection_on && (
                        <div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inspection Date</div>
                          <div style={{ fontWeight: 600, color: 'var(--accent-teal)', fontSize: '0.92rem', marginTop: '2px' }}>
                            📅 {detail.site_inspection_on}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Document Status Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    {/* Inspection Report Pill */}
                    {(detail.has_inspection_disk || detail.inspection_report_status === 'Downloaded') && (
                      <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600 }}>Inspection Report</span>
                          <span className="doc-pill downloaded">
                            Drive Verified
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {detail.inspection_report_file || 'Inspection Report.PDF'}
                        </div>
                      </div>
                    )}

                    {(detail.has_proc_disk || detail.proceeding_letter_status === 'Downloaded' || detail.proceeding_status === 'Downloaded') && (
                      <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600 }}>Proceeding Letter</span>
                          <span className="doc-pill downloaded">
                            Drive Verified
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {detail.proceeding_letter_file || detail.proceeding_file || 'Proceeding_Letter.pdf'}
                        </div>
                      </div>
                    )}

                    {(detail.has_draw_disk || detail.drawing_pdf_status === 'Downloaded' || detail.drawing_status === 'Downloaded') && (
                      <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600 }}>Approved Drawing</span>
                          <span className="doc-pill downloaded">
                            Drive Verified
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {detail.drawing_pdf_file || detail.drawing_file || 'Drawing.pdf'}
                        </div>
                      </div>
                    )}
                  </div>


                  {/* Error Log if any */}
                  {detail.error_message && (
                    <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger-text)', fontWeight: 700, marginBottom: '6px' }}>
                        <AlertTriangle size={16} />
                        <span>Scraper Failure Details</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--danger-text)' }}>
                        {detail.error_message}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: SITE INSPECTION & OFFICERS */}
              {activeTab === 'inspection' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Site Inspection Verification Records</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {detail.site_inspection_table?.length || 0} Inspection logs recorded
                    </span>
                  </div>

                  {detail.site_inspection_table && detail.site_inspection_table.length > 0 ? (
                    <div className="table-responsive" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                      <table className="proposals-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: '60px', textAlign: 'center' }}>Sr. No.</th>
                            <th>Officer Name</th>
                            <th>Designation</th>
                            <th>Site Inspection Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.site_inspection_table.map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.sr_no || rIdx + 1}</td>
                              <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.officer_name || '—'}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{row.designation || '—'}</td>
                              <td style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>{row.inspection_date || row.date || detail.site_inspection_on || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ background: 'var(--bg-tertiary)', padding: '20px', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div>Officer: <strong>{detail.officer_name || '—'}</strong></div>
                      <div>Designation: <strong>{detail.designation || '—'}</strong></div>
                      {detail.site_inspection_on && <div>Inspection Date: <strong>{detail.site_inspection_on}</strong></div>}
                    </div>
                  )}

                  {detail.site_inspection_details && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>RAW INSPECTION TEXT</div>
                      <pre style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', overflowX: 'auto' }}>
                        {detail.site_inspection_details}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: DOCUMENT VAULT */}
              {activeTab === 'documents' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    {/* Inspection Report PDF Card */}
                    {(detail.has_inspection_disk || detail.inspection_report_status === 'Downloaded') && (
                      <div style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-glass)',
                        padding: '20px',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        borderTop: '3px solid var(--success)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>Inspection Report PDF</span>
                            <span className="doc-pill downloaded">
                              Google Drive Verified
                            </span>
                          </div>

                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
                            <div>File: <code>{detail.inspection_report_file || 'Inspection Report.PDF'}</code></div>
                            {detail.inspection_report_size > 0 && <div>File Size: <strong>{(detail.inspection_report_size / 1024).toFixed(1)} KB</strong></div>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            className="btn-primary" 
                            style={{ flex: 1, justifyContent: 'center', background: 'var(--gradient-teal)' }}
                            onClick={() => {
                              onClose();
                              onOpenPdf(detail.folder_name, detail.inspection_report_file || 'Inspection Report.PDF', 'Inspection Report (PDF)', detail.file_number);
                            }}
                          >
                            <Eye size={15} />
                            <span>Preview Report</span>
                          </button>
                          <a 
                            className="icon-btn"
                            title="Download PDF from Google Drive"
                            href={api.getDocumentUrl(detail.folder_name, detail.inspection_report_file || 'Inspection Report.PDF', true)}
                            download
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Proceeding Letter Card */}
                    {(detail.has_proc_disk || detail.proceeding_letter_status === 'Downloaded' || detail.proceeding_status === 'Downloaded') && (
                      <div style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-glass)',
                        padding: '20px',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        borderTop: '3px solid var(--accent-purple)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>Proceeding Letter</span>
                            <span className="doc-pill downloaded">
                              Google Drive Verified
                            </span>
                          </div>

                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
                            <div>File: <code>{detail.proceeding_letter_file || detail.proceeding_file || 'Proceeding_Letter.pdf'}</code></div>
                            {detail.proc_disk_size > 0 && <div>File Size: <strong>{(detail.proc_disk_size / 1024).toFixed(1)} KB</strong></div>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            className="btn-primary" 
                            style={{ flex: 1, justifyContent: 'center' }}
                            onClick={() => {
                                onClose();
                                onOpenPdf(detail.folder_name, detail.proceeding_letter_file || detail.proceeding_file || 'Proceeding_Letter.pdf', 'Proceeding Letter', detail.file_number);
                            }}
                          >
                            <Eye size={15} />
                            <span>Preview Letter</span>
                          </button>
                          <a 
                            className="icon-btn"
                            title="Download PDF from Google Drive"
                            href={api.getDocumentUrl(detail.folder_name, detail.proceeding_letter_file || detail.proceeding_file || 'Proceeding_Letter.pdf', true)}
                            download
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Drawing PDF Card */}
                    {(detail.has_draw_disk || detail.drawing_pdf_status === 'Downloaded' || detail.drawing_status === 'Downloaded') && (
                      <div style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-glass)',
                        padding: '20px',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        borderTop: '3px solid var(--accent-sky)'
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>Approved Blueprint Drawing</span>
                            <span className="doc-pill downloaded">
                              Google Drive Verified
                            </span>
                          </div>

                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
                            <div>File: <code>{detail.drawing_pdf_file || detail.drawing_file || 'Drawing.pdf'}</code></div>
                            {detail.draw_disk_size > 0 && <div>File Size: <strong>{(detail.draw_disk_size / 1024).toFixed(1)} KB</strong></div>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            className="btn-primary" 
                            style={{ flex: 1, justifyContent: 'center', background: 'var(--gradient-purple)' }}
                            onClick={() => {
                              onClose();
                              onOpenPdf(detail.folder_name, detail.drawing_pdf_file || detail.drawing_file || 'Drawing.pdf', 'Drawing PDF', detail.file_number);
                            }}
                          >
                            <Eye size={15} />
                            <span>Preview Blueprint</span>
                          </button>
                          <a 
                            className="icon-btn"
                            title="Download PDF from Google Drive"
                            href={api.getDocumentUrl(detail.folder_name, detail.drawing_pdf_file || detail.drawing_file || 'Drawing.pdf', true)}
                            download
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="page-btn" onClick={onClose}>
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
}
