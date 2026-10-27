"""
TG-bPASS Data Intelligence Platform - High-Security Admin Authentication Manager
Handles Fixed Admin Email Verification, Cryptographic OTP Generation, Rate Limiting,
SMTP Email Dispatch, and Protected Admin Session Lifecycle.
"""

import os
import time
import hmac
import hashlib
import secrets
import smtplib
import logging
import threading
from typing import Dict, Tuple, Optional, Any
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from config import (
    ADMIN_EMAIL,
    OTP_EXPIRY_SECONDS,
    OTP_RESEND_COOLDOWN,
    OTP_MAX_ATTEMPTS,
    ADMIN_SESSION_EXPIRY_SECONDS,
    SMTP_SERVER,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_USE_TLS,
    SMTP_USE_SSL,
    ADMIN_SECRET_TOKEN
)

logger = logging.getLogger('tgbpass_site.auth')


class AdminAuthManager:
    """Thread-safe administrator authentication manager with OTP & Session handling."""

    def __init__(self):
        self._lock = threading.Lock()
        # Active OTP records: { email_lower: { 'otp': str, 'expires_at': float, 'attempts_left': int, 'resend_after': float, 'created_at': float } }
        self._active_otps: Dict[str, Dict[str, Any]] = {}
        # Active session tokens: { token_str: { 'email': str, 'created_at': float, 'expires_at': float } }
        self._active_sessions: Dict[str, Dict[str, Any]] = {}
        # Rate limiting for request attempts: { ip_address: [timestamp, ...] }
        self._ip_request_history: Dict[str, list] = {}

    def get_authorized_admin_email(self) -> str:
        """Returns the configured predefined admin email (for backend reference)."""
        return ADMIN_EMAIL.strip().lower()

    def is_authorized_email(self, email: str) -> bool:
        """
        Validates if the provided email strictly matches the predefined authorized admin email.
        Comparison is case-insensitive and trims accidental leading/trailing whitespace.
        """
        if not email or not isinstance(email, str):
            return False
        return email.strip().lower() == self.get_authorized_admin_email()

    def _check_ip_rate_limit(self, client_ip: str) -> bool:
        """Allows maximum 10 OTP requests per 10 minutes per IP address."""
        if not client_ip:
            return True
        now = time.time()
        with self._lock:
            history = self._ip_request_history.get(client_ip, [])
            # Keep only timestamps within last 600 seconds (10 mins)
            history = [ts for ts in history if now - ts < 600]
            if len(history) >= 10:
                self._ip_request_history[client_ip] = history
                return False
            history.append(now)
            self._ip_request_history[client_ip] = history
            return True

    def request_otp(self, email: str, client_ip: str = '') -> Tuple[bool, str]:
        """
        Step 1: Validates the entered admin email.
        - If NOT MATCH: Immediately denies access and DOES NOT generate or send any OTP.
        - If MATCH: Checks rate-limiting, generates a 6-digit cryptographic OTP,
          stores it securely in memory (5 min expiry), and dispatches it via email.
        """
        if not email or not isinstance(email, str):
            return False, "Please provide a valid administrator email address."

        clean_email = email.strip().lower()

        # STRICT VALIDATION: Compare with fixed predefined admin email
        if not self.is_authorized_email(clean_email):
            logger.warning("Admin OTP request rejected for unauthorized email attempt: %s (IP: %s)", clean_email, client_ip)
            # Do NOT generate or send OTP
            return False, "Unauthorized email address. Access to Admin Operations Console is restricted to authorized administrators only."

        # Check IP-based rate limiting
        if not self._check_ip_rate_limit(client_ip):
            return False, "Too many OTP requests from your network. Please wait a few minutes before trying again."

        now = time.time()
        with self._lock:
            # Check resend cooldown
            existing = self._active_otps.get(clean_email)
            if existing:
                resend_after = existing.get('resend_after', 0)
                if now < resend_after:
                    wait_seconds = int(resend_after - now)
                    return False, f"Please wait {wait_seconds}s before requesting another OTP."

            # Generate secure 6-digit random numeric OTP
            # Using secrets module for cryptographic randomness
            otp_val = f"{secrets.randbelow(900000) + 100000:06d}"

            # Store OTP record
            self._active_otps[clean_email] = {
                'otp': otp_val,
                'created_at': now,
                'expires_at': now + OTP_EXPIRY_SECONDS,
                'resend_after': now + OTP_RESEND_COOLDOWN,
                'attempts_left': OTP_MAX_ATTEMPTS
            }

        # Dispatch OTP via SMTP email
        email_sent = self._send_otp_email(clean_email, otp_val)

        logger.info("Admin OTP generated and dispatched for authorized admin: %s (expires in %ds)", clean_email, OTP_EXPIRY_SECONDS)
        
        # In development mode, if SMTP is not configured, inform that OTP was prepared
        if not email_sent and not SMTP_SERVER:
            return True, f"OTP verification code sent! (Dev Notice: Configure SMTP in config.py for live email delivery)"

        return True, "Verification code (OTP) has been sent to your authorized admin email address."

    def verify_otp(self, email: str, entered_otp: str) -> Tuple[bool, str, Optional[str]]:
        """
        Step 2: Verifies the entered OTP code.
        - Checks active record, expiry (5 mins), attempts remaining, and exact match.
        - On success: Immediately invalidates the OTP and generates a secure session token.
        """
        if not email or not entered_otp:
            return False, "Email and OTP code are required.", None

        clean_email = email.strip().lower()
        clean_otp = str(entered_otp).strip()

        # Check email match
        if not self.is_authorized_email(clean_email):
            return False, "Unauthorized email address.", None

        now = time.time()
        with self._lock:
            record = self._active_otps.get(clean_email)
            if not record:
                return False, "No active OTP request found or code has expired. Please request a new OTP.", None

            # Check if expired
            if now > record.get('expires_at', 0):
                self._active_otps.pop(clean_email, None)
                return False, "The OTP code has expired. Please request a new verification code.", None

            # Check attempts remaining
            attempts_left = record.get('attempts_left', 1)
            if attempts_left <= 0:
                self._active_otps.pop(clean_email, None)
                return False, "Maximum verification attempts exceeded. For security, please request a new OTP.", None

            # Decrement attempt counter
            record['attempts_left'] = attempts_left - 1

            # Constant-time comparison to prevent timing attacks
            expected_otp = str(record.get('otp', ''))
            is_valid = hmac.compare_digest(expected_otp, clean_otp)

            if not is_valid:
                rem = record['attempts_left']
                if rem <= 0:
                    self._active_otps.pop(clean_email, None)
                    return False, "Invalid OTP code. Maximum attempts reached. Please request a new OTP.", None
                return False, f"Invalid OTP code. {rem} attempt(s) remaining.", None

            # OTP is VALID: Invalidate OTP immediately to prevent reuse / replay
            self._active_otps.pop(clean_email, None)

            # Generate cryptographically secure session token (256-bit entropy)
            session_token = secrets.token_urlsafe(32)
            self._active_sessions[session_token] = {
                'email': clean_email,
                'created_at': now,
                'expires_at': now + ADMIN_SESSION_EXPIRY_SECONDS
            }

            logger.info("Admin authentication successful for %s. Session established.", clean_email)
            return True, "Admin authentication successful.", session_token

    def validate_session(self, token: str) -> bool:
        """Validates whether an admin session token is active and not expired."""
        if not token or not isinstance(token, str):
            return False

        clean_token = token.strip()
        
        # Support fallback legacy secret token if configured
        if ADMIN_SECRET_TOKEN and clean_token == ADMIN_SECRET_TOKEN:
            return True

        now = time.time()
        with self._lock:
            session = self._active_sessions.get(clean_token)
            if not session:
                return False
            if now > session.get('expires_at', 0):
                self._active_sessions.pop(clean_token, None)
                return False
            return True

    def revoke_session(self, token: str) -> bool:
        """Revokes and clears an active admin session token."""
        if not token:
            return False
        with self._lock:
            if token in self._active_sessions:
                self._active_sessions.pop(token, None)
                return True
        return False

    def clean_expired_records(self):
        """Housekeeping helper to remove expired OTPs and stale sessions."""
        now = time.time()
        with self._lock:
            # Clean expired OTPs
            expired_emails = [e for e, r in self._active_otps.items() if now > r.get('expires_at', 0)]
            for e in expired_emails:
                self._active_otps.pop(e, None)

            # Clean expired sessions
            expired_tokens = [t for t, s in self._active_sessions.items() if now > s.get('expires_at', 0)]
            for t in expired_tokens:
                self._active_sessions.pop(t, None)

    def _send_otp_email(self, to_email: str, otp: str) -> bool:
        """Sends the OTP email via SMTP if configured."""
        if not SMTP_SERVER:
            logger.info("SMTP_SERVER not configured. Skipping live email dispatch.")
            return False

        try:
            from_addr = SMTP_FROM_EMAIL or SMTP_USER
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"TG-bPASS Admin Login Verification Code - {otp}"
            msg['From'] = f"TG-bPASS Security Operations <{from_addr}>"
            msg['To'] = to_email

            text_body = f"""
======================================================
TELANGANA BUILDING PERMISSION & APPROVAL SYSTEM (TG-bPASS)
CONFIDENTIAL - ADMIN OPERATIONS CONSOLE VERIFICATION
======================================================

Your One-Time Password (OTP) for admin access is:

      {otp}

This code is valid for 5 minutes only.
Never share this code with anyone.

If you did not request this verification code, please ignore this email
or report unauthorized access attempts to the security team.

Government of Telangana | TG-bPASS Intelligence Platform
"""

            html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; }}
    .container {{ max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 24px; text-align: center; color: #ffffff; }}
    .logo-badge {{ display: inline-block; padding: 4px 12px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; }}
    .title {{ font-size: 20px; font-weight: 800; margin: 0 0 4px; color: #f8fafc; }}
    .subtitle {{ font-size: 12px; color: #94a3b8; margin: 0; }}
    .content {{ padding: 32px 28px; text-align: center; color: #334155; }}
    .instruction {{ font-size: 14px; color: #64748b; margin-bottom: 22px; line-height: 1.5; }}
    .otp-box {{ display: inline-block; padding: 16px 36px; background: #f0f9ff; border: 2px dashed #0284c7; border-radius: 12px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0284c7; font-family: monospace; margin: 10px 0 20px; }}
    .expiry {{ font-size: 12px; color: #ef4444; font-weight: 600; margin-bottom: 16px; }}
    .warning {{ font-size: 12px; color: #94a3b8; line-height: 1.5; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9; }}
    .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-badge">RESTRICTED ADMIN PORTAL</div>
      <div class="title">TG-bPASS Operations Console</div>
      <div class="subtitle">Telangana Building Approval Intelligence Hub</div>
    </div>
    <div class="content">
      <p class="instruction">
        A login attempt was initiated for the authorized administrator account. Use the following One-Time Password (OTP) to complete authentication:
      </p>
      <div class="otp-box">{otp}</div>
      <div class="expiry">⚠️ Valid for 5 minutes only. Single-use code.</div>
      <div class="warning">
        <strong>Security Notice:</strong> TG-bPASS administrators will never ask for your verification code. If you did not initiate this request, no action is required.
      </div>
    </div>
    <div class="footer">
      Government of Telangana | Municipal Administration & Urban Development Department
    </div>
  </div>
</body>
</html>
"""
            msg.attach(MIMEText(text_body, 'plain'))
            msg.attach(MIMEText(html_body, 'html'))

            if SMTP_USE_SSL:
                server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=10)
            else:
                server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
                if SMTP_USE_TLS:
                    server.starttls()

            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)

            server.sendmail(from_addr, [to_email], msg.as_string())
            server.quit()
            logger.info("Admin OTP email successfully delivered to %s via SMTP %s", to_email, SMTP_SERVER)
            return True
        except Exception as e:
            logger.error("Failed to send Admin OTP email via SMTP: %s", str(e))
            return False


# Global Singleton Instance
auth_manager = AdminAuthManager()
