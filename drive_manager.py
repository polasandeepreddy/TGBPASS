"""
TG-bPASS Google Drive Cloud Storage Manager
============================================
Enables full cloud-backed operation for the TG-bPASS platform without
any dependency on local hardcoded disk paths (e.g. D:\\TGBPASS DATA, D:\\GHMC).

Capabilities:
- Dynamic authentication using cached OAuth token.json or credentials.json.
- Synchronizes master CSV files (all_proposals.csv, All-for-OC_s-_-BP_s.csv) into ./cache.
- Synchronizes cloud progress.json (141k+ proposals) into ./cache.
- On-demand streaming and caching of PDF documents from Google Drive.
- Provides direct Google Drive preview / webView links.
"""

import io
import re
import json
import time
import logging
import threading
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from googleapiclient.errors import HttpError

logger = logging.getLogger('tgbpass_site.drive_manager')

SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
]

# Known cloud file IDs on Google Drive (Folder ID: 1lDOBRrNSZ0uN70BDXONqg7U3xBNxhIel)
KNOWN_CLOUD_FILES = {
    'all_proposals.csv': '1lBOHpiNfwh8a1Sdmp-T9yZbwn85o8G9O',
    'progress.json': '1shnUL2qpbMHLSW9wDUsrKsQ85eZOEIQe',
    'All-for-OC_s-_-BP_s.csv': '1KjSj3dfb45-LJ7b-65u1fJKeVEN3wruo',
    'Pubile Scearch_all_proposals.csv': '1WlrslwWvABctsaJVMa_2p70veB3fx5Wq',
    'all_proposals_oc50001-70000.csv': '1IU3tMcGkK0AQ_jVWXp42R3tJ6MyqaC_V',
    'HMDA_DPMS_All_Proposals.csv': '1Uo7stxJyZrnUqbeajtV7NQv_yMJg74FC',
    'HMDA_LO_Data.csv': '1njVZN29G0H1CIAXUXjP1TdNc9iSvX07o',
    'hmda_downloaded_folders.json': '18ug_0o9cKsDCclenY0PjHyWmmGqwhc0Q',
    'TGBPASS_Master_Records': '1pte-yTnph_4AGyGBYhm1xD9QO8mdFToEBEaM-rY2s5E',
    'Downloaded_Proposals': '1FOhUXN6VAIR9VNBk3MarxK-UlUOv0Pr0'
}


class GoogleDriveManager:
    """Manages Google Drive operations for the web portal."""

    def __init__(
        self,
        target_folder_id: str = "1lDOBRrNSZ0uN70BDXONqg7U3xBNxhIel",
        credentials_file: Optional[Path] = None,
        token_file: Optional[Path] = None,
        cache_dir: Optional[Path] = None
    ):
        base_dir = Path(__file__).resolve().parent
        self.target_folder_id = target_folder_id
        self.credentials_file = Path(credentials_file or (base_dir / 'credentials.json'))
        self.token_file = Path(token_file or (base_dir / 'token.json'))
        self.cache_dir = Path(cache_dir or (base_dir / 'cache'))
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.doc_cache_dir = self.cache_dir / 'documents'
        self.doc_cache_dir.mkdir(parents=True, exist_ok=True)

        self.creds = None
        self._thread_local = threading.local()
        self._progress_data: Optional[Dict[str, Any]] = None
        self._progress_last_loaded: float = 0
        self._progress_lock = threading.Lock()
        self._folder_cache: Dict[str, str] = {}
        self._folder_cache_lock = threading.Lock()

        self._authenticate()

    def _authenticate(self):
        """Authenticates with Google Drive using cached tokens."""
        if self.token_file.exists():
            try:
                self.creds = Credentials.from_authorized_user_file(str(self.token_file), SCOPES)
            except Exception as e:
                logger.warning(f"Could not load token.json: {e}")
                self.creds = None

        if not self.creds or not self.creds.valid:
            if self.creds and self.creds.expired and self.creds.refresh_token:
                try:
                    logger.info("Refreshing expired Google Drive OAuth token...")
                    self.creds.refresh(Request())
                    with open(self.token_file, 'w', encoding='utf-8') as f:
                        f.write(self.creds.to_json())
                    logger.info("Saved refreshed OAuth credentials to token.json")
                except Exception as e:
                    logger.warning(f"Could not refresh token: {e}")
                    self.creds = None

    def is_connected(self) -> bool:
        """Checks if Google Drive credentials are valid."""
        return self.creds is not None and self.creds.valid

    def get_drive_service(self):
        """Thread-local Drive service client."""
        if not hasattr(self._thread_local, 'drive_service'):
            if not self.is_connected():
                self._authenticate()
            if not self.is_connected():
                raise ConnectionError("Google Drive is not connected or credentials are missing/invalid.")
            self._thread_local.drive_service = build('drive', 'v3', credentials=self.creds, cache_discovery=False)
        return self._thread_local.drive_service

    def get_progress_data(self, force_reload: bool = False) -> Dict[str, Any]:
        """Loads and returns cloud progress.json data with caching."""
        now = time.time()
        with self._progress_lock:
            if not force_reload and self._progress_data is not None and (now - self._progress_last_loaded) < 300:
                return self._progress_data

            local_progress = self.cache_dir / 'progress.json'
            # If cached locally and fresh (less than 1 hour old), load from disk
            if not force_reload and local_progress.exists() and (now - local_progress.stat().st_mtime) < 3600:
                try:
                    with open(local_progress, 'r', encoding='utf-8', errors='ignore') as f:
                        self._progress_data = json.load(f)
                    self._progress_last_loaded = now
                    logger.info(f"Loaded {len(self._progress_data):,} proposals from cached progress.json")
                    return self._progress_data
                except Exception as e:
                    logger.warning(f"Error reading cached progress.json: {e}")

            # Download fresh from Google Drive
            try:
                drive = self.get_drive_service()
                fid = KNOWN_CLOUD_FILES.get('progress.json')
                if not fid:
                    fid = self.find_file_id('progress.json')
                if fid:
                    req = drive.files().get_media(fileId=fid)
                    with open(local_progress, 'wb') as f:
                        dl = MediaIoBaseDownload(f, req)
                        done = False
                        while not done:
                            _, done = dl.next_chunk()
                    with open(local_progress, 'r', encoding='utf-8', errors='ignore') as f:
                        self._progress_data = json.load(f)
                    self._progress_last_loaded = now
                    logger.info(f"Synced {len(self._progress_data):,} proposals from Google Drive progress.json")
                    return self._progress_data
            except Exception as e:
                logger.error(f"Error syncing progress.json from Google Drive: {e}")

            if local_progress.exists():
                try:
                    with open(local_progress, 'r', encoding='utf-8', errors='ignore') as f:
                        self._progress_data = json.load(f)
                    self._progress_last_loaded = now
                    return self._progress_data
                except Exception:
                    pass

            return {}

    def get_hmda_downloaded_data(self) -> Dict[str, Any]:
        """Loads and returns cloud hmda_downloaded_folders.json data with caching."""
        local_p = self.cache_dir / 'hmda_downloaded_folders.json'
        if local_p.exists():
            try:
                with open(local_p, 'r', encoding='utf-8', errors='ignore') as f:
                    return json.load(f)
            except Exception:
                pass

        try:
            drive = self.get_drive_service()
            fid = KNOWN_CLOUD_FILES.get('hmda_downloaded_folders.json')
            if fid:
                req = drive.files().get_media(fileId=fid)
                with open(local_p, 'wb') as f:
                    dl = MediaIoBaseDownload(f, req)
                    done = False
                    while not done:
                        _, done = dl.next_chunk()
                with open(local_p, 'r', encoding='utf-8', errors='ignore') as f:
                    return json.load(f)
        except Exception as e:
            logger.debug(f"Could not load hmda_downloaded_folders.json: {e}")
        return {}

    def find_file_id(self, filename: str, parent_id: Optional[str] = None) -> Optional[str]:
        """Finds a file ID in Google Drive by filename."""
        if filename in KNOWN_CLOUD_FILES:
            return KNOWN_CLOUD_FILES[filename]

        drive = self.get_drive_service()
        pid = parent_id or self.target_folder_id
        query = f"'{pid}' in parents and name = '{filename}' and trashed = false"
        try:
            res = drive.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
            files = res.get('files', [])
            if files:
                return files[0]['id']
        except Exception as e:
            logger.debug(f"Search for '{filename}' in Drive failed: {e}")
        return None

    def sync_csv_file(self, filename: str, force: bool = False) -> Optional[Path]:
        """Syncs a CSV file from Google Drive into the local cache directory."""
        dest_path = self.cache_dir / filename
        if not force and dest_path.exists() and dest_path.stat().st_size > 1000:
            return dest_path

        try:
            drive = self.get_drive_service()
            file_id = self.find_file_id(filename)
            if not file_id:
                logger.warning(f"File '{filename}' not found in Google Drive.")
                return dest_path if dest_path.exists() else None

            logger.info(f"Syncing '{filename}' from Google Drive...")
            req = drive.files().get_media(fileId=file_id)
            with open(dest_path, 'wb') as f:
                downloader = MediaIoBaseDownload(f, req)
                done = False
                while not done:
                    _, done = downloader.next_chunk()

            # If the CSV has outer-wrapped line quotes (like All-for-OC_s-_-BP_s.csv), normalize it
            try:
                with open(dest_path, 'r', encoding='utf-8', errors='ignore') as f_check:
                    first_line = f_check.readline()
                if first_line.startswith('"') and first_line.strip().endswith('"'):
                    temp_p = dest_path.with_suffix('.tmp')
                    with open(dest_path, 'r', encoding='utf-8', errors='ignore') as fin, \
                         open(temp_p, 'w', encoding='utf-8', newline='') as fout:
                        for line in fin:
                            s = line.strip()
                            if s.startswith('"') and s.endswith('"'):
                                s = s[1:-1]
                            s = s.replace('""', '"')
                            fout.write(s + '\n')
                    temp_p.replace(dest_path)
            except Exception as e:
                logger.debug(f"CSV line unwrap check notice: {e}")

            return dest_path
        except Exception as e:
            logger.error(f"Error syncing '{filename}' from Google Drive: {e}")
            return dest_path if dest_path.exists() else None

    def sync_all_cloud_datasets(self, force: bool = False) -> Dict[str, bool]:
        """Synchronizes all master cloud datasets and manifests from Google Drive."""
        results = {}
        for fname in ['progress.json', 'all_proposals.csv', 'All-for-OC_s-_-BP_s.csv', 'HMDA_LO_Data.csv', 'hmda_downloaded_folders.json']:
            if fname == 'progress.json':
                data = self.get_progress_data(force_reload=force)
                results[fname] = bool(data)
            elif fname == 'hmda_downloaded_folders.json':
                data = self.get_hmda_downloaded_data()
                results[fname] = bool(data)
            else:
                p = self.sync_csv_file(fname, force=force)
                results[fname] = bool(p and p.exists())
        logger.info(f"Cloud dataset synchronization completed: {results}")
        return results

    def get_document_file(self, folder_name: str, filename: str) -> Optional[Path]:
        """
        Retrieves a document file on demand from Google Drive.
        Checks local cache first, then looks up via progress.json links or folder scan.
        """
        if not folder_name or not filename:
            return None

        clean_name = Path(filename).name
        cached_file = self.doc_cache_dir / folder_name / clean_name
        if cached_file.exists() and cached_file.stat().st_size > 500:
            return cached_file

        # Check in progress.json by file number / folder name
        prog = self.get_progress_data()
        file_no = folder_name.replace('_', '/')
        rec = prog.get(file_no) or prog.get(folder_name)
        if not rec:
            # Check with / without trailing -BP / -OC
            for k in [file_no + '-BP', file_no + '-OC', folder_name.upper()]:
                if k in prog:
                    rec = prog[k]
                    break

        file_id = None
        if rec:
            cf_lower = clean_name.lower()
            if 'proceed' in cf_lower or 'order' in cf_lower or 'letter' in cf_lower:
                link = rec.get('proceeding_letter_link', '')
                m = re.search(r'/d/([a-zA-Z0-9_-]+)', link)
                if m:
                    file_id = m.group(1)
            elif 'draw' in cf_lower or 'plan' in cf_lower or 'paln' in cf_lower:
                link = rec.get('drawing_link', '')
                m = re.search(r'/d/([a-zA-Z0-9_-]+)', link)
                if m:
                    file_id = m.group(1)

        # Download file by ID if found
        if file_id:
            try:
                drive = self.get_drive_service()
                cached_file.parent.mkdir(parents=True, exist_ok=True)
                req = drive.files().get_media(fileId=file_id)
                with open(cached_file, 'wb') as f:
                    dl = MediaIoBaseDownload(f, req)
                    done = False
                    while not done:
                        _, done = dl.next_chunk()
                logger.info(f"Streamed '{clean_name}' for '{folder_name}' from Google Drive ({cached_file.stat().st_size:,} bytes)")
                return cached_file
            except Exception as e:
                logger.warning(f"Error downloading file ID '{file_id}' from Google Drive: {e}")

        # Fallback: Search inside Google Drive 'Downloaded_Proposals' folder
        try:
            drive = self.get_drive_service()
            proposals_folder_id = KNOWN_CLOUD_FILES.get('Downloaded_Proposals')
            if not proposals_folder_id:
                proposals_folder_id = self.find_file_id('Downloaded_Proposals')

            if proposals_folder_id:
                # Find folder_name inside Downloaded_Proposals
                folder_id = None
                with self._folder_cache_lock:
                    folder_id = self._folder_cache.get(folder_name)

                if not folder_id:
                    q = f"'{proposals_folder_id}' in parents and name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
                    res = drive.files().list(q=q, fields='files(id, name)').execute()
                    f_list = res.get('files', [])
                    if f_list:
                        folder_id = f_list[0]['id']
                        with self._folder_cache_lock:
                            self._folder_cache[folder_name] = folder_id

                if folder_id:
                    # Find PDF inside folder
                    q_file = f"'{folder_id}' in parents and trashed = false"
                    res_files = drive.files().list(q=q_file, fields='files(id, name, size)').execute()
                    sub_files = res_files.get('files', [])
                    matched_file = None
                    for sf in sub_files:
                        if sf['name'].lower() == clean_name.lower():
                            matched_file = sf
                            break
                        if clean_name.lower() in sf['name'].lower() and sf['name'].lower().endswith('.pdf'):
                            matched_file = sf
                            break

                    if matched_file:
                        cached_file.parent.mkdir(parents=True, exist_ok=True)
                        req = drive.files().get_media(fileId=matched_file['id'])
                        with open(cached_file, 'wb') as f:
                            dl = MediaIoBaseDownload(f, req)
                            done = False
                            while not done:
                                _, done = dl.next_chunk()
                        logger.info(f"Found and streamed '{clean_name}' from Drive folder '{folder_name}'")
                        return cached_file
        except Exception as e:
            logger.debug(f"Direct Drive folder search notice: {e}")

        return None


# Global Drive Manager Instance
drive_manager = GoogleDriveManager()
