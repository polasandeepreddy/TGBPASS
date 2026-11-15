"""One-time voluntary UPI donations.

Money moves directly donor -> owner's UPI; this module only keeps records.
Statuses:
  pending        donation started, nothing claimed
  self_reported  donor clicked "I have donated" (UNVERIFIED claim)
  verified       admin matched it against the real bank/UPI statement
Only an authenticated admin can set `verified`.
"""
import csv
import io
import os
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path

from flask import Blueprint, Response, jsonify, request

SITE_DIR = Path(__file__).resolve().parent
DB_PATH = os.environ.get('DONATIONS_DB_PATH') or str(SITE_DIR / 'donations.db')

MIN_AMOUNT = 1
MAX_AMOUNT = 500000
STATUSES = ('pending', 'self_reported', 'verified')

_EMAIL_RE = re.compile(r'^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$')
_UTR_RE = re.compile(r'^[A-Za-z0-9]{8,30}$')
_TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{16,64}$')
_REF_RE = re.compile(r'^DON-[A-Z0-9]{10}$')
_REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

_lock = threading.Lock()


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _lock, _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS donations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ref TEXT NOT NULL UNIQUE,
                client_token TEXT NOT NULL UNIQUE,
                amount INTEGER NOT NULL,
                name TEXT, email TEXT, phone TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                utr TEXT,
                created_at INTEGER NOT NULL,
                reported_at INTEGER,
                verified_at INTEGER
            )""")


def _new_ref():
    return 'DON-' + ''.join(secrets.choice(_REF_ALPHABET) for _ in range(10))


class ValidationError(ValueError):
    pass


def validate_donation(data):
    """Returns cleaned fields or raises ValidationError."""
    if not isinstance(data, dict):
        raise ValidationError('Invalid request.')
    amount = data.get('amount')
    if isinstance(amount, bool) or not isinstance(amount, (int, float, str)):
        raise ValidationError('Please enter a valid amount.')
    try:
        amount_f = float(amount)
    except ValueError:
        raise ValidationError('Please enter a valid amount.')
    if amount_f != amount_f or amount_f != int(amount_f):
        raise ValidationError('Please enter a whole-rupee amount.')
    amount = int(amount_f)
    if amount < MIN_AMOUNT:
        raise ValidationError(f'Minimum donation is ₹{MIN_AMOUNT}.')
    if amount > MAX_AMOUNT:
        raise ValidationError(f'Maximum donation is ₹{MAX_AMOUNT:,}.')

    name = str(data.get('name') or '').strip()
    email = str(data.get('email') or '').strip()
    phone = re.sub(r'[\s\-]', '', str(data.get('phone') or ''))
    if len(name) > 100:
        raise ValidationError('Name is too long.')
    if email and not _EMAIL_RE.match(email):
        raise ValidationError('Please enter a valid email address.')
    if phone:
        phone = re.sub(r'^(\+91|91|0)(?=\d{10}$)', '', phone)
        if not re.fullmatch(r'[6-9]\d{9}', phone):
            raise ValidationError('Please enter a valid 10-digit mobile number.')

    token = str(data.get('client_token') or '')
    if not _TOKEN_RE.match(token):
        raise ValidationError('Invalid request.')
    return {'amount': amount, 'name': name or None, 'email': email or None,
            'phone': phone or None, 'client_token': token}


def create_donation(fields):
    """Idempotent on client_token. Returns (row_dict, created)."""
    with _lock, _connect() as conn:
        row = conn.execute('SELECT * FROM donations WHERE client_token=?', (fields['client_token'],)).fetchone()
        if row:
            if row['status'] == 'pending':  # donor edited the form before paying
                conn.execute('UPDATE donations SET amount=?, name=?, email=?, phone=? WHERE id=?',
                             (fields['amount'], fields['name'], fields['email'], fields['phone'], row['id']))
                row = conn.execute('SELECT * FROM donations WHERE id=?', (row['id'],)).fetchone()
            return dict(row), False
        for _ in range(5):
            try:
                conn.execute(
                    'INSERT INTO donations (ref, client_token, amount, name, email, phone, status, created_at) '
                    "VALUES (?,?,?,?,?,?, 'pending', ?)",
                    (_new_ref(), fields['client_token'], fields['amount'], fields['name'],
                     fields['email'], fields['phone'], int(time.time())))
                break
            except sqlite3.IntegrityError:
                row = conn.execute('SELECT * FROM donations WHERE client_token=?', (fields['client_token'],)).fetchone()
                if row:
                    return dict(row), False
        row = conn.execute('SELECT * FROM donations WHERE client_token=?', (fields['client_token'],)).fetchone()
        return dict(row), True


def get_donation(ref):
    with _connect() as conn:
        row = conn.execute('SELECT * FROM donations WHERE ref=?', (ref,)).fetchone()
        return dict(row) if row else None


def mark_self_reported(ref, utr=None):
    """pending -> self_reported. Never touches verified. Returns row or None."""
    with _lock, _connect() as conn:
        row = conn.execute('SELECT * FROM donations WHERE ref=?', (ref,)).fetchone()
        if not row:
            return None
        if row['status'] == 'pending':
            conn.execute("UPDATE donations SET status='self_reported', utr=?, reported_at=? WHERE id=?",
                         (utr, int(time.time()), row['id']))
        elif row['status'] == 'self_reported' and utr and not row['utr']:
            conn.execute('UPDATE donations SET utr=? WHERE id=?', (utr, row['id']))
        return dict(conn.execute('SELECT * FROM donations WHERE id=?', (row['id'],)).fetchone())


def mark_verified(ref):
    with _lock, _connect() as conn:
        row = conn.execute('SELECT * FROM donations WHERE ref=?', (ref,)).fetchone()
        if not row:
            return None
        if row['status'] != 'verified':
            conn.execute("UPDATE donations SET status='verified', verified_at=? WHERE id=?",
                         (int(time.time()), row['id']))
        return dict(conn.execute('SELECT * FROM donations WHERE id=?', (row['id'],)).fetchone())


def list_donations(status=None):
    with _connect() as conn:
        if status in STATUSES:
            rows = conn.execute('SELECT * FROM donations WHERE status=? ORDER BY id DESC', (status,)).fetchall()
        else:
            rows = conn.execute('SELECT * FROM donations ORDER BY id DESC').fetchall()
        summary = {s: {'count': 0, 'amount': 0} for s in STATUSES}
        for r in conn.execute('SELECT status, COUNT(*) c, COALESCE(SUM(amount),0) a FROM donations GROUP BY status'):
            summary[r['status']] = {'count': r['c'], 'amount': r['a']}
        return [dict(r) for r in rows], summary


# --- simple in-memory rate limit (per client IP) for public writes ---
_hits = {}
RATE_LIMIT = 20
RATE_WINDOW = 600


def _rate_limited():
    ip = request.headers.get('CF-Connecting-IP') or request.remote_addr or '?'
    now = time.time()
    hits = [t for t in _hits.get(ip, []) if now - t < RATE_WINDOW]
    if len(hits) >= RATE_LIMIT:
        _hits[ip] = hits
        return True
    hits.append(now)
    _hits[ip] = hits
    return False


def _public(row):
    """Fields safe to return to the donor (no personal details)."""
    return {'ref': row['ref'], 'amount': row['amount'], 'status': row['status']}


def create_blueprint(admin_required):
    bp = Blueprint('donations', __name__)
    init_db()

    @bp.route('/api/donations', methods=['POST', 'OPTIONS'])
    def api_create():
        if request.method == 'OPTIONS':
            return jsonify({'success': True})
        if _rate_limited():
            return jsonify({'success': False, 'error': 'Too many requests. Please try again later.'}), 429
        try:
            fields = validate_donation(request.get_json(silent=True))
        except ValidationError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        row, created = create_donation(fields)
        return jsonify({'success': True, 'data': _public(row)}), (201 if created else 200)

    @bp.route('/api/donations/<ref>', methods=['GET'])
    def api_status(ref):
        row = get_donation(ref) if _REF_RE.match(ref) else None
        if not row:
            return jsonify({'success': False, 'error': 'Donation not found.'}), 404
        return jsonify({'success': True, 'data': _public(row)})

    @bp.route('/api/donations/<ref>/confirm', methods=['POST', 'OPTIONS'])
    def api_confirm(ref):
        if request.method == 'OPTIONS':
            return jsonify({'success': True})
        if _rate_limited():
            return jsonify({'success': False, 'error': 'Too many requests. Please try again later.'}), 429
        if not _REF_RE.match(ref):
            return jsonify({'success': False, 'error': 'Donation not found.'}), 404
        body = request.get_json(silent=True) or {}
        utr = str(body.get('utr') or '').strip()
        if utr and not _UTR_RE.match(utr):
            return jsonify({'success': False, 'error': 'Transaction ID should be 8-30 letters/digits.'}), 400
        row = mark_self_reported(ref, utr or None)
        if not row:
            return jsonify({'success': False, 'error': 'Donation not found.'}), 404
        return jsonify({'success': True, 'data': _public(row)})

    @bp.route('/api/admin/donations', methods=['GET', 'OPTIONS'])
    @admin_required
    def api_admin_list():
        rows, summary = list_donations(request.args.get('status'))
        return jsonify({'success': True, 'data': {'donations': rows, 'summary': summary}})

    @bp.route('/api/admin/donations/<ref>/verify', methods=['POST', 'OPTIONS'])
    @admin_required
    def api_admin_verify(ref):
        row = mark_verified(ref) if _REF_RE.match(ref) else None
        if not row:
            return jsonify({'success': False, 'error': 'Donation not found.'}), 404
        return jsonify({'success': True, 'data': _public(row)})

    @bp.route('/api/admin/donations/export', methods=['GET', 'OPTIONS'])
    @admin_required
    def api_admin_export():
        rows, _ = list_donations(request.args.get('status'))
        out = io.StringIO()
        out.write('﻿')  # BOM so Excel reads UTF-8 correctly
        w = csv.writer(out)
        w.writerow(['Reference', 'Amount (INR)', 'Status', 'Name', 'Email', 'Phone',
                    'Donor-reported UPI Txn ID', 'Created', 'Reported', 'Verified'])

        def ts(v):
            return time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(v)) if v else ''

        def safe(v):  # neutralise spreadsheet formula injection
            v = v or ''
            return "'" + v if v[:1] in ('=', '+', '-', '@') else v

        for r in rows:
            w.writerow([r['ref'], r['amount'], r['status'], safe(r['name']), safe(r['email']),
                        safe(r['phone']), safe(r['utr']), ts(r['created_at']),
                        ts(r['reported_at']), ts(r['verified_at'])])
        return Response(out.getvalue(), mimetype='text/csv',
                        headers={'Content-Disposition': 'attachment; filename=donations.csv'})

    return bp
