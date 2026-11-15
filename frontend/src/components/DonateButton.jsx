import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Heart, X, Smartphone, ChevronDown, Check, Download } from 'lucide-react';
import { api } from '../services/api';
import './donate.css';

// Configure in frontend/.env: VITE_DONATE_UPI_ID, VITE_DONATE_NAME
const UPI_ID = import.meta.env.VITE_DONATE_UPI_ID || '';
const PAYEE_NAME = import.meta.env.VITE_DONATE_NAME || 'TG-bPASS';
const MIN_AMOUNT = 1;
const PRESETS = [50, 100, 250, 500, 1000];
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const newToken = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};

const upiLink = (amount, ref) =>
  `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(PAYEE_NAME)}` +
  `&am=${amount}&cu=INR&tn=${encodeURIComponent(ref ? `Donation ${ref}` : 'Donation')}`;

const STEPS = ['amount', 'pay', 'thanks'];

export default function DonateButton() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('amount');
  const [amount, setAmount] = useState('');
  const [donor, setDonor] = useState({ name: '', email: '', phone: '' });
  const [showDetails, setShowDetails] = useState(false);
  const [token, setToken] = useState(newToken);
  const [ref, setRef] = useState('');
  const [status, setStatus] = useState('pending');
  const [utr, setUtr] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amountInput = useRef(null);

  const amt = Number(amount);
  const amountOk = Number.isInteger(amt) && amt >= MIN_AMOUNT;

  const reset = () => {
    setStep('amount'); setAmount(''); setDonor({ name: '', email: '', phone: '' }); setShowDetails(false);
    setToken(newToken()); setRef(''); setStatus('pending'); setUtr(''); setError('');
  };
  const close = () => {
    setOpen(false);
    if (step === 'thanks') reset();
  };

  // Escape to close + lock page scroll while open
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  });

  useEffect(() => {
    if (step === 'pay' && UPI_ID) {
      QRCode.toDataURL(upiLink(amt, ref), { width: 400, margin: 0, errorCorrectionLevel: 'M' })
        .then(setQr).catch(() => setQr(''));
    }
  }, [step, amt, ref]);

  const proceed = async (e) => {
    e?.preventDefault();
    setError('');
    if (!amountOk) return setError(`Please enter an amount of at least ${inr(MIN_AMOUNT)}.`);
    setBusy(true);
    try {
      const rec = await api.createDonation({ amount: amt, client_token: token, ...donor });
      setRef(rec.ref);
    } catch (err) {
      // Details/amount rejected -> tell the donor; backend merely offline -> they can still pay (untracked).
      if (/minimum|maximum|valid|long|whole/i.test(err.message)) { setBusy(false); return setError(err.message); }
      setRef('');
    }
    setBusy(false);
    setStep('pay');
  };

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const rec = await api.confirmDonation(ref, utr.trim());
      setStatus(rec.status);
      setStep('thanks');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const checkStatus = async () => {
    setError('');
    try { setStatus((await api.getDonationStatus(ref)).status); } catch (err) { setError(err.message); }
  };

  const downloadReceipt = () => {
    const html = `<!doctype html><meta charset="utf-8"><title>Donation Receipt ${ref}</title>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto">
<h2>Donation Receipt</h2><p>Thank you for supporting ${PAYEE_NAME}.</p>
<table cellpadding="6"><tr><td>Reference</td><td><b>${ref}</b></td></tr>
<tr><td>Amount</td><td><b>${inr(amt)}</b></td></tr><tr><td>Status</td><td>Verified</td></tr>
<tr><td>Date</td><td>${new Date().toLocaleDateString()}</td></tr></table>
<p style="color:#64748b;font-size:12px">Voluntary one-time donation. This is not a tax receipt.</p></body>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `donation-receipt-${ref}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const header = {
    amount: ['Support this portal', 'A voluntary, one-time contribution — any amount helps.'],
    pay: ['Complete your donation', 'Scan the QR code or open your UPI app.'],
    thanks: ['Thank you', '']
  }[step];

  return (
    <>
      <button
        type="button"
        className="btn-primary"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '0.9rem', fontWeight: 700, borderRadius: 'var(--radius-full)' }}
      >
        <Heart size={16} />
        <span>Donate</span>
      </button>

      {open && createPortal(
        <div className="dn-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="dn-card" role="dialog" aria-modal="true" aria-label="Donate">
            <div className="dn-header">
              <button type="button" className="dn-close" onClick={close} aria-label="Close"><X size={18} /></button>
              <div className="dn-badge"><Heart size={24} fill="#fff" /></div>
              <h3 className="dn-title">{header[0]}</h3>
              {header[1] && <p className="dn-sub">{header[1]}</p>}
              <div className="dn-steps" aria-hidden="true">
                {STEPS.map((s, i) => <span key={s} className={`dn-step ${i <= STEPS.indexOf(step) ? 'on' : ''}`} />)}
              </div>
            </div>

            <div className="dn-body">
              {!UPI_ID ? (
                <div className="dn-error">Donations are not available right now.</div>
              ) : step === 'amount' ? (
                <form onSubmit={proceed} noValidate>
                  <span className="dn-label">Choose an amount</span>
                  <div className="dn-presets">
                    {PRESETS.map((p) => (
                      <button key={p} type="button" className={`dn-preset ${amt === p ? 'on' : ''}`}
                        onClick={() => { setAmount(String(p)); setError(''); }}>
                        {inr(p)}
                      </button>
                    ))}
                    <button type="button" className={`dn-preset ${amountOk && !PRESETS.includes(amt) ? 'on' : ''}`}
                      onClick={() => amountInput.current?.focus()}>
                      Other
                    </button>
                  </div>
                  <div className="dn-field">
                    <span className="dn-rupee">₹</span>
                    <input ref={amountInput} className="dn-input amount" type="number" min={MIN_AMOUNT} step="1"
                      inputMode="numeric" value={amount} placeholder="Enter your own amount"
                      aria-label="Donation amount in rupees"
                      onChange={(e) => { setAmount(e.target.value); setError(''); }} />
                  </div>

                  <button type="button" className="dn-toggle" aria-expanded={showDetails} onClick={() => setShowDetails((v) => !v)}>
                    <span>Add your details <span style={{ fontWeight: 400, color: '#64748b' }}>(optional)</span></span>
                    <ChevronDown size={18} style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </button>
                  {showDetails && (
                    <div className="dn-details">
                      <input className="dn-input" placeholder="Name" maxLength={100} autoComplete="name"
                        value={donor.name} onChange={(e) => setDonor({ ...donor, name: e.target.value })} />
                      <input className="dn-input" placeholder="Email" type="email" autoComplete="email"
                        value={donor.email} onChange={(e) => setDonor({ ...donor, email: e.target.value })} />
                      <input className="dn-input" placeholder="Mobile number" type="tel" inputMode="tel" autoComplete="tel"
                        value={donor.phone} onChange={(e) => setDonor({ ...donor, phone: e.target.value })} />
                      <p className="dn-hint">Leave everything blank to donate anonymously.</p>
                    </div>
                  )}

                  {error && <div className="dn-error" role="alert">{error}</div>}
                  <button type="submit" className="dn-cta" disabled={!amountOk || busy}>
                    {busy ? 'Please wait…' : amountOk ? `Continue · ${inr(amt)}` : 'Enter an amount'}
                  </button>
                  <div className="dn-trust">
                    <span>One-time only</span><span>No fees</span><span>No sign-up</span>
                  </div>
                </form>
              ) : step === 'pay' ? (
                <>
                  <div className="dn-amountbar">
                    <div><div style={{ fontSize: '.76rem', color: '#64748b' }}>You are donating</div><strong>{inr(amt)}</strong></div>
                    <button type="button" onClick={() => setStep('amount')}>Change</button>
                  </div>

                  <div className="dn-qrwrap">
                    <div className="dn-qr">{qr ? <img src={qr} alt={`UPI QR code to donate ${inr(amt)}`} /> : <div style={{ width: 200, height: 200 }} />}</div>
                    <p className="dn-qrnote">Scan with any UPI app</p>
                    <div className="dn-apps"><span>Google Pay</span><span>PhonePe</span><span>Paytm</span><span>BHIM</span></div>
                  </div>

                  <a href={upiLink(amt, ref)} className="dn-cta"><Smartphone size={18} />Pay {inr(amt)} via UPI</a>

                  {ref ? (
                    <>
                      <div className="dn-divider">after you pay</div>
                      <p className="dn-disclaimer">
                        Tapping “I have donated” only notifies us. A donation is marked <strong>verified</strong> after we match it with our bank records.
                      </p>
                      <input className="dn-input" placeholder="UPI transaction ID (optional)" value={utr}
                        onChange={(e) => setUtr(e.target.value)} aria-label="UPI transaction ID" />
                      {error && <div className="dn-error" role="alert">{error}</div>}
                      <button type="button" className="dn-cta ghost" onClick={confirm} disabled={busy}>
                        {busy ? 'Please wait…' : 'I have donated'}
                      </button>
                    </>
                  ) : (
                    <p className="dn-disclaimer" style={{ marginTop: 14, textAlign: 'center' }}>Tracking is unavailable right now, but you can still pay.</p>
                  )}
                </>
              ) : (
                <div className="dn-done">
                  <div className="dn-check"><Check size={34} strokeWidth={3} /></div>
                  <h3>Thank you{donor.name ? `, ${donor.name.split(' ')[0]}` : ''}!</h3>
                  <p>
                    {status === 'verified'
                      ? 'Your donation has been verified. We truly appreciate your support.'
                      : 'We have noted your donation. It will show as verified once we match it with our bank records.'}
                  </p>
                  <div className="dn-receipt">
                    <div className="dn-row"><span>Amount</span><strong>{inr(amt)}</strong></div>
                    <div className="dn-row"><span>Reference</span><strong>{ref}</strong></div>
                    <div className="dn-row"><span>Status</span>
                      <span className={`dn-pill ${status === 'verified' ? 'ok' : ''}`}>{status === 'verified' ? 'Verified' : 'Awaiting verification'}</span>
                    </div>
                  </div>
                  {error && <div className="dn-error" role="alert">{error}</div>}
                  {status === 'verified' ? (
                    <button type="button" className="dn-cta" onClick={downloadReceipt}><Download size={18} />Download receipt</button>
                  ) : (
                    <button type="button" className="dn-cta ghost" onClick={checkStatus}>Check verification status</button>
                  )}
                  <button type="button" className="dn-link" onClick={() => { setOpen(false); reset(); }}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
