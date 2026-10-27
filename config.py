import os
from pathlib import Path

# Base directories
SITE_DIR = Path(__file__).resolve().parent
BASE_DIR = SITE_DIR.parent
CACHE_DIR = SITE_DIR / os.environ.get('CACHE_DIR', 'cache')
CACHE_DIR.mkdir(parents=True, exist_ok=True)
DOCUMENTS_CACHE_DIR = CACHE_DIR / 'documents'
DOCUMENTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
TGBPSS_DIR = CACHE_DIR

# Google Drive Cloud Configuration
STORAGE_MODE = os.environ.get('STORAGE_MODE', 'google_drive')
GOOGLE_DRIVE_ENABLED = os.environ.get('GOOGLE_DRIVE_ENABLED', 'True').lower() in ('true', '1', 'yes')
GOOGLE_DRIVE_FOLDER_ID = os.environ.get('GOOGLE_DRIVE_FOLDER_ID', '1lDOBRrNSZ0uN70BDXONqg7U3xBNxhIel')
GOOGLE_CREDENTIALS_FILE = SITE_DIR / os.environ.get('GOOGLE_CREDENTIALS_FILE', 'credentials.json')
GOOGLE_TOKEN_FILE = SITE_DIR / os.environ.get('GOOGLE_TOKEN_FILE', 'token.json')


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

# Automatically load environment variables from .env
_load_env_file()


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
# 100% GOOGLE DRIVE CLOUD STORAGE (No Local Storage / No Local Paths)
# =============================================================================

# All master datasets and documents are retrieved directly from Google Drive Cloud
DEFAULT_CSV_PATHS = [
    CACHE_DIR / 'all_proposals.csv'
]

DEFAULT_OC_BP_CSV_PATHS = [
    CACHE_DIR / 'All-for-OC_s-_-BP_s.csv'
]

DEFAULT_HMDA_CSV_PATHS = [
    CACHE_DIR / 'HMDA_LO_Data.csv',
    CACHE_DIR / 'HMDA_DPMS_All_Proposals.csv'
]

# Local directory lists are emptied because documents stream from Google Drive
DEFAULT_OC_BP_DIRS = []
DEFAULT_DOCUMENT_DIRS = []

# Parsed Lists from .env with Google Drive defaults
CSV_PATHS = _parse_path_list(['CSV_PATHS', 'CSV_PATH'], DEFAULT_CSV_PATHS)
CSV_PATH = _get_first_existing_or_default(CSV_PATHS, CACHE_DIR / 'all_proposals.csv')

CSV_BACKUP_PATH = CACHE_DIR / 'all_proposals_backup.csv'

OC_BP_CSV_PATHS = _parse_path_list(['OC_BP_CSV_PATHS', 'OC_BP_CSV_PATH'], DEFAULT_OC_BP_CSV_PATHS)
OC_BP_CSV_PATH = _get_first_existing_or_default(OC_BP_CSV_PATHS, CACHE_DIR / 'All-for-OC_s-_-BP_s.csv')

HMDA_CSV_PATHS = _parse_path_list(['HMDA_CSV_PATHS', 'HMDA_CSV_PATH'], DEFAULT_HMDA_CSV_PATHS)
HMDA_CSV_PATH = _get_first_existing_or_default(HMDA_CSV_PATHS, CACHE_DIR / 'HMDA_LO_Data.csv')

OC_BP_DIRS = []
OC_BP_DIR = None
DOCUMENT_DIRS = []

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
