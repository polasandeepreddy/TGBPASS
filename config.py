import os
import re
from functools import lru_cache
from pathlib import Path

# Base directories
SITE_DIR = Path(__file__).resolve().parent
BASE_DIR = SITE_DIR.parent
CACHE_DIR = SITE_DIR / os.environ.get('CACHE_DIR', 'cache')
CACHE_DIR.mkdir(parents=True, exist_ok=True)
DOCUMENTS_CACHE_DIR = CACHE_DIR / 'documents'
DOCUMENTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
TGBPSS_DIR = CACHE_DIR

def _load_env_file():
    """Lightweight .env file parser and loader (reads from .env in SITE_DIR or BASE_DIR)."""
    env_paths = [SITE_DIR / '.env', BASE_DIR / '.env']
    for env_path in env_paths:
        if env_path.exists():
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        # Ignore comments and empty lines
                        if not line or line.startswith('#') or '=' not in line:
                            continue
                        key, val = line.split('=', 1)
                        key = key.strip()
                        val = val.strip()
                        # Strip surrounding single or double quotes
                        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                            val = val[1:-1].strip()
                        os.environ[key] = val
            except Exception as e:
                print(f"[config] Warning loading .env from {env_path}: {e}")
            break

# Load environment variables before reading any env-backed config values.
_load_env_file()

# Google Drive Cloud Configuration
STORAGE_MODE = os.environ.get('STORAGE_MODE', 'local' if any(p.exists() for p in [Path(r'D:\TGBPASS DATA'), Path(r'D:\GHMC')]) else 'google_drive')
GOOGLE_DRIVE_ENABLED = os.environ.get('GOOGLE_DRIVE_ENABLED', 'False').lower() in ('true', '1', 'yes')
GOOGLE_DRIVE_FOLDER_ID = os.environ.get('GOOGLE_DRIVE_FOLDER_ID', '')
GOOGLE_CREDENTIALS_FILE = SITE_DIR / os.environ.get('GOOGLE_CREDENTIALS_FILE', 'credentials.json')
GOOGLE_TOKEN_FILE = SITE_DIR / os.environ.get('GOOGLE_TOKEN_FILE', 'token.json')


def _parse_path_list(env_keys, default_paths=None):
    """
    Parses one or more environment variable keys containing single or
    comma/semicolon/newline-delimited paths into a list of Path objects.
    Preserves ordering and removes duplicates.
    """
    if isinstance(env_keys, str):
        env_keys = [env_keys]
    
    collected_paths = []
    seen = set()

    for key in env_keys:
        raw_val = os.environ.get(key, '').strip()
        if not raw_val:
            continue
        # Split on commas, semicolons, pipes, or newlines
        import re
        tokens = re.split(r'[,;\n\|]+', raw_val)
        for token in tokens:
            cleaned = token.strip()
            # Strip extra quotes around individual items if present
            if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
                cleaned = cleaned[1:-1].strip()
            if not cleaned:
                continue
            p = Path(cleaned)
            norm_str = str(p).lower()
            if norm_str not in seen:
                seen.add(norm_str)
                collected_paths.append(p)

    # Append default paths if not already present
    if default_paths:
        for p in default_paths:
            if p is not None:
                norm_str = str(p).lower()
                if norm_str not in seen:
                    seen.add(norm_str)
                    collected_paths.append(p)

    return collected_paths


def _get_first_existing_or_default(path_list, default_path):
    """Returns the first path from the list that exists, or the first configured / default path."""
    for p in path_list:
        if p and p.exists():
            return p
    return path_list[0] if path_list else default_path


# MySQL Database Configuration
DB_CONFIG = {
    'host': os.environ.get('TGBPASS_DB_HOST', 'localhost'),
    'user': os.environ.get('TGBPASS_DB_USER', 'root'),
    'password': os.environ.get('TGBPASS_DB_PASSWORD', 'Adgjmptw@7286'),
    'database': os.environ.get('TGBPASS_DB_NAME', 'tgbpass'),
    'port': int(os.environ.get('TGBPASS_DB_PORT', 3306)),
    'connection_timeout': 2,
    'raise_on_warnings': True,
    'charset': 'utf8mb4',
    'autocommit': True
}

# =============================================================================
# Local system paths are supported as the default data sources when present.
# This allows the app to ingest files from D:\TGBPASS DATA and D:\GHMC without
# requiring Google Drive as the only source of truth.
# =============================================================================

LOCAL_DATA_ROOTS = [
    Path(r'D:\TGBPASS DATA'),
    Path(r'D:\GHMC')
]

# Gather the relevant project CSV files from the local roots, including nested
# folders such as Masterplan_HMDA_Planning_layouts, Pubilc Search, and
# OC's & BP's while excluding hidden or dependency folders.
# Scraped proposal folders (e.g. 000001_GHMC_0001_SEC1_2022-OC, 16494_06_04_2015_C11) hold only
# PDFs/.txt, never CSVs. There are ~290k of them, so skipping them keeps startup fast.
_PROPOSAL_FOLDER_RE = re.compile(r'^\d+_')


def _walk_csvs(root, excluded_dirs):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames
                       if d.lower() not in excluded_dirs and not _PROPOSAL_FOLDER_RE.match(d)]
        for f in filenames:
            if f.lower().endswith('.csv'):
                yield Path(dirpath) / f


@lru_cache(maxsize=1)
def _find_csv_files_in_roots(root_paths):
    excluded_dirs = {'.venv', 'venv', '.git', '__pycache__', 'site-packages', 'node_modules'}
    relevant_keywords = (
        'proposal', 'oc', 'bp', 'hmda', 'layout', 'search', 'masterplan',
        'ghmc', 'public', 'district', 'mandal', 'village'
    )
    discovered = []
    seen = set()

    def add(path):
        key = str(path.resolve()).lower()
        if key not in seen:
            seen.add(key)
            discovered.append(path.resolve())

    for root in root_paths:
        if not root or not root.exists():
            continue
        found = sorted(_walk_csvs(root, excluded_dirs), key=lambda p: str(p).lower())

        def top_dir(p):
            rel = p.relative_to(root).parts
            return rel[0].lower() if len(rel) > 1 else None

        # Priority order (earlier files win on duplicate records): CSVs directly under the root,
        # then CSVs under project-named folders, then everything else under the root.
        for p in sorted((p for p in found if top_dir(p) is None), key=lambda p: p.name.lower()):
            add(p)
        for p in found:
            t = top_dir(p)
            if t and any(k in t for k in relevant_keywords):
                add(p)
        for p in found:
            add(p)

    return tuple(discovered)


def _is_oc_bp_csv(p):
    # By filename (All-for-OC_s..., new_all_proposals_oc.csv) or by folder: the OC scraper also
    # writes generic all_proposals.csv files inside "OC's & BP's" folders.
    name = p.name.lower()
    folders = [part.lower() for part in p.parent.parts]
    return 'oc' in name or 'bp' in name or any("oc's" in f or "bp's" in f for f in folders)


def _is_hmda_csv(p):
    return 'hmda' in p.name.lower()


# TG-bPASS master proposals only: OC/BP and HMDA CSVs have their own datasets
# below, so including them here would duplicate those records in the TG vault.
DEFAULT_CSV_PATHS = [
    *(p for p in _find_csv_files_in_roots(tuple(LOCAL_DATA_ROOTS)) if not _is_oc_bp_csv(p) and not _is_hmda_csv(p)),
    CACHE_DIR / 'all_proposals.csv'
]

DEFAULT_OC_BP_CSV_PATHS = [
    *(p for p in _find_csv_files_in_roots(tuple(LOCAL_DATA_ROOTS)) if _is_oc_bp_csv(p)),
    CACHE_DIR / 'All-for-OC_s-_-BP_s.csv'
]

DEFAULT_HMDA_CSV_PATHS = [
    *(p for p in _find_csv_files_in_roots(tuple(LOCAL_DATA_ROOTS)) if _is_hmda_csv(p)),
    CACHE_DIR / 'HMDA_LO_Data.csv',
    CACHE_DIR / 'HMDA_DPMS_All_Proposals.csv'
]

DEFAULT_OC_BP_DIRS = [p for p in LOCAL_DATA_ROOTS if p.exists()]
DEFAULT_DOCUMENT_DIRS = [p for p in LOCAL_DATA_ROOTS if p.exists()]

# Parsed Lists from .env with local defaults fallback
CSV_PATHS = _parse_path_list(['CSV_PATHS', 'CSV_PATH'], DEFAULT_CSV_PATHS)
CSV_PATH = _get_first_existing_or_default(CSV_PATHS, CACHE_DIR / 'all_proposals.csv')

CSV_BACKUP_PATH = CACHE_DIR / 'all_proposals_backup.csv'

OC_BP_CSV_PATHS = _parse_path_list(['OC_BP_CSV_PATHS', 'OC_BP_CSV_PATH'], DEFAULT_OC_BP_CSV_PATHS)
OC_BP_CSV_PATH = _get_first_existing_or_default(OC_BP_CSV_PATHS, CACHE_DIR / 'All-for-OC_s-_-BP_s.csv')

HMDA_CSV_PATHS = _parse_path_list(['HMDA_CSV_PATHS', 'HMDA_CSV_PATH'], DEFAULT_HMDA_CSV_PATHS)
HMDA_CSV_PATH = _get_first_existing_or_default(HMDA_CSV_PATHS, CACHE_DIR / 'HMDA_LO_Data.csv')

OC_BP_DIRS = _parse_path_list(['OC_BP_DIRS', 'OC_BP_DIR'], DEFAULT_OC_BP_DIRS)
OC_BP_DIR = _get_first_existing_or_default(OC_BP_DIRS, DEFAULT_OC_BP_DIRS[0] if DEFAULT_OC_BP_DIRS else None)
DOCUMENT_DIRS = _parse_path_list(['DOCUMENT_DIRS'], DEFAULT_DOCUMENT_DIRS)

# Keep Drive support available, but prefer local source folders when available
STORAGE_MODE = os.environ.get('STORAGE_MODE', 'local' if any(p.exists() for p in LOCAL_DATA_ROOTS) else 'google_drive')
GOOGLE_DRIVE_ENABLED = os.environ.get('GOOGLE_DRIVE_ENABLED', 'False').lower() in ('true', '1', 'yes')

PROGRESS_PATH = CACHE_DIR / 'progress.json'
LOG_PATH = CACHE_DIR / 'scraper.log'

# Web server settings
SERVER_HOST = os.environ.get('SERVER_HOST', '0.0.0.0')
SERVER_PORT = int(os.environ.get('SERVER_PORT', 8000))
DEBUG = os.environ.get('DEBUG', 'False').lower() in ('true', '1', 'yes')
SECRET_KEY = os.environ.get('SECRET_KEY', 'tgbpass_secret_dashboard_key_2026')

# High Security Admin Access Credentials & Long Secret URL
ADMIN_SECRET_PATH = 'tgbpass-TG_87_L00_987445TG3875AP98_kFJj_slk4_gEGdviu299k_9032_nFUh3923xn_lh86_89417284917UYklsfjII491740921740917409'
ADMIN_SECRET_TOKEN = 'tgbpass-TG_87_L00_987445TG3875AP98_kFJj_slk4_gEGdviu299k_9032_nFUh3923xn_lh86_89417284917UYklsfjII491740921740917409'
ADMIN_PIN = os.environ.get('TGBPASS_ADMIN_PIN', 'Adgjmptw@Tgbpass')

# Predefined Fixed Admin Email for OTP Authentication (Loaded from .env: TGBPASS_ADMIN_EMAIL)
ADMIN_EMAIL = os.environ.get('TGBPASS_ADMIN_EMAIL', 'polasandeepreddy0v1@gmail.com')

# OTP & Session Security Configuration
OTP_EXPIRY_SECONDS = int(os.environ.get('OTP_EXPIRY_SECONDS', 300))  # 5 minutes
OTP_RESEND_COOLDOWN = int(os.environ.get('OTP_RESEND_COOLDOWN', 60))  # 60 seconds
OTP_MAX_ATTEMPTS = int(os.environ.get('OTP_MAX_ATTEMPTS', 5))
ADMIN_SESSION_EXPIRY_SECONDS = int(os.environ.get('ADMIN_SESSION_EXPIRY_SECONDS', 86400))  # 24 hours

# SMTP Email Dispatch Configuration (Loaded from .env)
SMTP_SERVER = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER', os.environ.get('TGBPASS_ADMIN_EMAIL', 'polasandeepreddy0v1@gmail.com'))
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM_EMAIL = os.environ.get('SMTP_FROM_EMAIL', '') or SMTP_USER
SMTP_USE_TLS = os.environ.get('SMTP_USE_TLS', 'True').lower() in ('true', '1', 'yes')
SMTP_USE_SSL = os.environ.get('SMTP_USE_SSL', 'False').lower() in ('true', '1', 'yes')
