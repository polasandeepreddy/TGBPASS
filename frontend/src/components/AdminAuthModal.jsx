import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  Mail, 
  KeyRound, 
  ArrowRight, 
  ArrowLeft,
  Globe, 
  AlertCircle, 
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { api } from '../services/api';

export default function AdminAuthModal({ onAuthenticated, onCancel, onShowToast }) {
  // Step: 'email' (Step 1) or 'otp' (Step 2)
  const [step, setStep] = useState('email');
  
  // Form State
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Resend OTP Cooldown Timer (60 seconds)
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);
  const otpInputRef = useRef(null);

  // Countdown timer effect
  useEffect(() => {
    if (cooldown > 0) {
      timerRef.current = setTimeout(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cooldown]);

  // Focus OTP input when transitioning to step 2
  useEffect(() => {
    if (step === 'otp' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  // Handle Step 1: Request OTP
  const handleRequestOtp = async (e) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your administrator email address.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.requestAdminOtp(cleanEmail);
      if (res && res.success) {
        setStep('otp');
        setCooldown(60);
        setOtp('');
        setSuccessMsg(res.message || 'OTP verification code sent to your email.');
        if (onShowToast) onShowToast('OTP verification code sent to authorized admin email', 'info', 'OTP Dispatched');
      } else {
        setErrorMsg(res.error || 'Unauthorized email address. Access denied.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Unauthorized email address. Access denied.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setErrorMsg('Please enter the 6-digit OTP verification code.');
      return;
    }

    if (cleanOtp.length < 6) {
      setErrorMsg('The verification code must be 6 digits.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await api.verifyAdminOtp(email.trim(), cleanOtp);
      if (res && res.success) {
        if (onShowToast) onShowToast('Admin authentication verified successfully!', 'success', 'Authenticated');
        onAuthenticated(res.token);
      } else {
        setErrorMsg(res.error || 'Invalid or expired OTP code.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.requestAdminOtp(email.trim());
      if (res && res.success) {
        setCooldown(60);
        setOtp('');
        setSuccessMsg('A fresh verification code has been sent.');
        if (onShowToast) onShowToast('Fresh verification code sent!', 'info', 'OTP Resent');
      } else {
        setErrorMsg(res.error || 'Failed to resend verification code.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(10px)', background: 'rgba(15, 23, 42, 0.78)', zIndex: 10000 }}>
      <div className="modal-container" style={{ maxWidth: '480px', padding: '0', overflow: 'hidden', border: '1px solid #bae6fd', boxShadow: '0 25px 60px -15px rgba(2, 132, 199, 0.35)', borderRadius: '16px' }}>
        
        {/* Security Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '28px 28px 22px',
          textAlign: 'center',
          color: '#ffffff',
          position: 'relative'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'rgba(2, 132, 199, 0.2)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#38bdf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px'
          }}>
            <Lock size={28} />
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            background: 'rgba(220, 38, 38, 0.2)',
            border: '1px solid rgba(248, 113, 113, 0.3)',
            color: '#fca5a5',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            marginBottom: '10px'
          }}>
            <ShieldAlert size={14} />
            <span>RESTRICTED ADMIN ACCESS</span>
          </div>

          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 6px' }}>
            {step === 'email' ? 'Admin Portal Authentication' : 'Enter Verification Code (OTP)'}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
            {step === 'email' 
              ? 'Confidential operations console for authorized TG-bPASS administrators.'
              : `A 6-digit OTP code was sent to the authorized admin email.`
            }
          </p>
        </div>

        {/* Modal Form Body */}
        <div style={{ padding: '26px 28px 24px', background: '#ffffff' }}>
          
          {/* Error Alert Box */}
          {errorMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.84rem',
              fontWeight: 600,
              marginBottom: '18px',
              lineHeight: 1.4
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Notice Box */}
          {successMsg && step === 'otp' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              fontSize: '0.82rem',
              fontWeight: 600,
              marginBottom: '18px'
            }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ================= STEP 1: EMAIL INPUT FORM ================= */}
          {step === 'email' && (
            <form onSubmit={handleRequestOtp}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                Authorized Administrator Email:
              </label>
              
              <div style={{ position: 'relative', marginBottom: '18px' }}>
                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input 
                  type="email"
                  autoFocus
                  required
                  placeholder="e.g. admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    fontSize: '0.98rem',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    color: '#0f172a',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  fontSize: '0.96rem',
                  fontWeight: 700,
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Verifying Email & Generating OTP...</span>
                  </>
                ) : (
                  <>
                    <KeyRound size={18} />
                    <span>Get OTP</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ================= STEP 2: OTP VERIFICATION FORM ================= */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                  Enter 6-Digit OTP:
                </label>
                <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={13} />
                  <span>Expires in 5 mins</span>
                </span>
              </div>
              
              <div style={{ position: 'relative', marginBottom: '18px' }}>
                <KeyRound size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input 
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  placeholder="• • • • • •"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    width: '100%',
                    padding: '14px 14px 14px 44px',
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    letterSpacing: '0.35em',
                    textAlign: 'center',
                    borderRadius: '10px',
                    border: '1.5px solid #0284c7',
                    background: '#f0f9ff',
                    color: '#0369a1',
                    fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="btn-primary"
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  fontSize: '0.96rem',
                  fontWeight: 700,
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
                  cursor: (loading || otp.length !== 6) ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Verifying OTP Code...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Verify OTP & Unlock Console</span>
                  </>
                )}
              </button>

              {/* Resend OTP & Back Controls */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #f1f5f9'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#0284c7'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
                >
                  <ArrowLeft size={14} />
                  <span>Change Email</span>
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0 || loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: cooldown > 0 ? '#94a3b8' : '#0284c7',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: cooldown > 0 ? 'default' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px'
                  }}
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                  <span>{cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Return to Public Citizen Portal */}
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#0284c7'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
            >
              <Globe size={14} />
              <span>Cancel and Return to Public Portal</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
