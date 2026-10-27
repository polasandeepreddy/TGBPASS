import os
import re
import json
import time
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime

import pandas as pd
from functools import lru_cache
import mysql.connector
from mysql.connector import Error as MySQLError

from config import (
    DB_CONFIG, CSV_PATH, CSV_PATHS, PROGRESS_PATH, LOG_PATH,
    OC_BP_CSV_PATH, OC_BP_CSV_PATHS, HMDA_CSV_PATHS, HMDA_CSV_PATH,
    DOCUMENTS_CACHE_DIR, CACHE_DIR
)

logger = logging.getLogger('tgbpass_site.data_provider')


def extract_metadata_from_file_no(file_no: str) -> Dict[str, str]:
    """
    Extracts authority, circle/district, year, type from TG-bPASS file number.
    e.g. '000483/GHMC/0224/KPL2/2025-BP'
    e.g. '004550/FLT/YELR/3123/0002/2025'
    e.g. '000001/OC/DTCP/3131/0001/2021'
    """
    if not file_no or not isinstance(file_no, str):
        return {'authority': 'Unknown', 'year': 'Unknown', 'prop_type': 'Unknown'}

    parts = [p.strip() for p in file_no.replace('\\', '/').split('/') if p.strip()]
    authority = 'Other'
    year = 'Unknown'
    prop_type = 'Unknown'

    # Check for known authorities
    upper_no = file_no.upper()
    if 'GHMC' in upper_no:
        authority = 'GHMC'
    elif 'HMDA' in upper_no:
        authority = 'HMDA'
    elif 'DTCP' in upper_no:
        authority = 'DTCP'
    elif 'GWMC' in upper_no:
        authority = 'GWMC'
    elif 'FLT' in upper_no:
        authority = 'FLT'
    elif 'LO' in upper_no:
        authority = 'Layout (LO)'
    elif len(parts) >= 2:
        authority = parts[1]

    # Extract year (2015-2030)
    year_match = re.search(r'20[1-3][0-9]', file_no)
    if year_match:
        year = year_match.group(0)

    # Extract proposal type (BP, OC, LO, CW, FLT)
    if upper_no.endswith('-BP') or '/BP/' in upper_no or '-BP' in upper_no:
        prop_type = 'Building Permission (BP)'
    elif upper_no.endswith('-OC') or '/OC/' in upper_no or '-OC' in upper_no:
        prop_type = 'Occupancy Certificate (OC)'
    elif upper_no.endswith('-LO') or '/LO/' in upper_no or '-LO' in upper_no:
        prop_type = 'Layout Permission (LO)'
    elif upper_no.endswith('-CW') or '/CW/' in upper_no:
        prop_type = 'Compound Wall (CW)'
    elif 'FLT' in upper_no:
        prop_type = 'Flat / Sub-division'

    return {
        'authority': authority,
        'year': year,
        'prop_type': prop_type
    }


def parse_site_inspection_table(text: str) -> List[Dict[str, str]]:
    """Parses Site Inspection Details text into structured rows for UI rendering."""
    if not text or not isinstance(text, str):
        return []
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    if not lines:
        return []
    
    rows = []
    for line in lines:
        if 'Sr. No.' in line or 'Officer Name' in line or 'Designation' in line:
            continue
        parts = [p.strip() for p in re.split(r'\t+|\s{2,}', line) if p.strip()]
        if len(parts) >= 4:
            rows.append({
                'sr_no': parts[0],
                'officer_name': parts[1],
                'designation': parts[2],
                'inspection_date': parts[3]
            })
        elif len(parts) == 3:
            rows.append({
                'sr_no': parts[0],
                'officer_name': parts[1],
                'designation': parts[2],
                'inspection_date': ''
            })
        elif len(parts) == 2:
            rows.append({
                'sr_no': '1',
                'officer_name': parts[0],
                'designation': parts[1],
                'inspection_date': ''
            })
    return rows


def is_placeholder_search(term: str) -> bool:
    """Detects whether a search query is accidental placeholder text or empty."""
    if not term:
        return True
    t = term.strip().lower()
    if not t or t in ('search', 'search by', 'search file', 'search file no', 'search file no, permit n', 'search by file'):
        return True
    if t.startswith('search') and any(k in t for k in ['file', 'permit', 'applicant', 'architect', 'folder', 'officer']):
        return True
    return False


@lru_cache(maxsize=32768)
def find_document_file(folder_name: str, filename: str) -> Optional[Path]:
    """Exclusively finds and streams verified PDF documents from Google Drive."""
    if not folder_name and not filename:
        return None

    clean_file = Path(filename).name if filename else ''
    
    # Exclusively retrieve from Google Drive (checks ./cache/documents/ first, then streams on demand)
    try:
        from drive_manager import drive_manager
        if drive_manager.is_connected():
            cloud_doc = drive_manager.get_document_file(folder_name, clean_file or filename)
            if cloud_doc and cloud_doc.exists() and cloud_doc.stat().st_size > 0:
                return cloud_doc
    except Exception as e:
        logger.debug(f"Google Drive document fetch notice: {e}")

    return None





class DataProvider:
    """Unified Data Provider supporting MySQL and CSV fallback/direct modes."""

    def __init__(self):
        self._csv_df: Optional[pd.DataFrame] = None
        self._csv_last_loaded: float = 0
        self._csv_mtimes: Tuple[Tuple[str, float], ...] = ()
        self._oc_bp_df: Optional[pd.DataFrame] = None
        self._oc_bp_last_loaded: float = 0
        self._oc_bp_mtimes: Tuple[Tuple[str, float], ...] = ()
        self._hmda_df: Optional[pd.DataFrame] = None
        self._hmda_last_loaded: float = 0
        self._hmda_mtimes: Tuple[Tuple[str, float], ...] = ()
        self._mysql_available: Optional[bool] = None
        self._last_mysql_check: float = 0

    def check_mysql_connection(self) -> bool:
        """Check if MySQL is reachable and valid."""
        now = time.time()
        if self._mysql_available is not None and (now - self._last_mysql_check) < 60:
            return self._mysql_available

        self._last_mysql_check = now
        try:
            conn = mysql.connector.connect(**DB_CONFIG)
            if conn.is_connected():
                conn.close()
                self._mysql_available = True
                return True
        except Exception as e:
            logger.warning(f"MySQL connection check failed: {e}")
            self._mysql_available = False
        return False

    def get_mysql_connection(self):
        """Creates and returns a MySQL connection."""
        return mysql.connector.connect(**DB_CONFIG)

    def export_mysql_to_csv(self, force: bool = False) -> bool:
        """Exports all proposals from MySQL to CSV_PATH."""
        if not force and CSV_PATH.exists():
            return True
        try:
            if not self.check_mysql_connection():
                return False
            logger.info("Exporting proposals from MySQL to CSV...")
            conn = self.get_mysql_connection()
            cur = conn.cursor(dictionary=True)
            cur.execute("""
                SELECT 
                    page_number, `row_number`, file_number, applicant_name, architect_name,
                    proceeding_letter_status, proceeding_letter_file_path,
                    drawing_pdf_status, drawing_pdf_file_path,
                    folder_name, processing_status, error_message
                FROM proposals
                ORDER BY id ASC
            """)
            rows = cur.fetchall()
            cur.close()
            conn.close()

            if not rows:
                return False

            df = pd.DataFrame(rows)
            df.rename(columns={
                'page_number': 'Page',
                'row_number': 'Row',
                'file_number': 'File_No_Temporary_No',
                'applicant_name': 'Applicant_Name',
                'architect_name': 'Architect_LE_SE_Name',
                'proceeding_letter_status': 'Proceeding_Letter_Status',
                'proceeding_letter_file_path': 'Proceeding_Letter_File',
                'drawing_pdf_status': 'Drawing_PDF_Status',
                'drawing_pdf_file_path': 'Drawing_PDF_File',
                'folder_name': 'Folder',
                'processing_status': 'Processing_Status',
                'error_message': 'Error'
            }, inplace=True)

            CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(CSV_PATH, index=False, encoding='utf-8')
            logger.info(f"Successfully exported {len(df):,} records to {CSV_PATH}")
            return True
        except Exception as e:
            logger.warning(f"Could not export MySQL to CSV: {e}")
            return False

    def load_csv_data(self, force_reload: bool = False) -> pd.DataFrame:
        """Loads, merges, and caches the CSV dataset(s) with multi-path support and search indexing."""
        existing_csvs = [p for p in CSV_PATHS if p and p.exists() and p.is_file()]

        if not existing_csvs:
            try:
                from drive_manager import drive_manager
                if drive_manager.is_connected():
                    synced = drive_manager.sync_csv_file('all_proposals.csv')
                    if synced and synced.exists():
                        existing_csvs = [synced]
            except Exception as e:
                logger.warning(f"Could not auto-sync all_proposals.csv from Google Drive: {e}")

            if not existing_csvs and self.check_mysql_connection():
                logger.info(f"CSV not found in CSV_PATHS. Auto-exporting from MySQL to {CSV_PATH}...")
                self.export_mysql_to_csv()
                if CSV_PATH.exists():
                    existing_csvs = [CSV_PATH]

            if not existing_csvs:
                logger.info(f"No CSV dataset files found in {CSV_PATHS} (Using MySQL if available)")
                return pd.DataFrame()

        current_mtimes = tuple((str(p), p.stat().st_mtime) for p in existing_csvs)
        if not force_reload and self._csv_df is not None and self._csv_mtimes == current_mtimes:
            return self._csv_df

        logger.info(f"Loading CSV dataset from {len(existing_csvs)} file(s): {[str(p) for p in existing_csvs]}...")
        dfs = []
        for csv_file in existing_csvs:
            try:
                df_item = pd.read_csv(
                    csv_file,
                    dtype=str,
                    na_values=['', 'nan', 'NaN', 'None', 'null'],
                    keep_default_na=False
                )
                df_item.fillna('', inplace=True)
                
                # Standardize column naming flexibly (case-insensitive & alphanumeric normalized aliases)
                col_lookup = {}
                for col in df_item.columns:
                    c_clean = col.strip().lower()
                    c_alnum = re.sub(r'[^a-z0-9]', '', c_clean)
                    col_lookup[c_clean] = col
                    col_lookup[c_alnum] = col

                def _get_val(keys, default=''):
                    for k in keys:
                        k_clean = k.strip().lower()
                        k_alnum = re.sub(r'[^a-z0-9]', '', k_clean)
                        if k_clean in col_lookup:
                            return df_item[col_lookup[k_clean]].astype(str).str.strip()
                        if k_alnum in col_lookup:
                            return df_item[col_lookup[k_alnum]].astype(str).str.strip()
                    return pd.Series(default, index=df_item.index)

                df_item['file_number'] = _get_val(['file_no_temporary_no', 'file_no', 'fileno', 'proposal_number', 'file_number'])
                df_item['applicant_name'] = _get_val(['applicant_name', 'applicant', 'name'])
                df_item['architect_name'] = _get_val(['architect_le_se_name', 'architect_se_name', 'architect_name', 'architect'])
                df_item['proceeding_letter_status'] = _get_val(['proceeding_letter_status', 'proceedings_status', 'proceeding_status'])
                df_item['proceeding_letter_file'] = _get_val(['proceeding_letter_file', 'proceedings_pdf', 'proceedings', 'proceeding_file'])
                df_item['drawing_pdf_status'] = _get_val(['drawing_pdf_status', 'drawing_status', 'plan_status'])
                df_item['drawing_pdf_file'] = _get_val(['drawing_pdf_file', 'drawing_file', 'plan_pdf', 'plan'])
                df_item['folder_name'] = _get_val(['folder', 'folder_name'])
                df_item['processing_status'] = _get_val(['processing_status', 'status'])
                df_item['error_message'] = _get_val(['error', 'error_message'])

                # Normalize downloaded statuses
                df_item['proceeding_letter_status'] = df_item['proceeding_letter_status'].apply(
                    lambda x: 'Downloaded' if 'download' in str(x).lower() else ('Not Available' if 'not' in str(x).lower() or not str(x).strip() else str(x).strip())
                )
                df_item['drawing_pdf_status'] = df_item['drawing_pdf_status'].apply(
                    lambda x: 'Downloaded' if 'download' in str(x).lower() else ('Not Available' if 'not' in str(x).lower() or not str(x).strip() else str(x).strip())
                )

                page_val = _get_val(['page', 'page_number'], 0)
                row_val = _get_val(['row', 'row_number', 's.no', 'sno', 'sl_no'], 0)
                df_item['page_number'] = pd.to_numeric(page_val, errors='coerce').fillna(0).astype(int)
                df_item['row_number'] = pd.to_numeric(row_val, errors='coerce').fillna(0).astype(int)
                dfs.append(df_item)
            except Exception as e:
                logger.error(f"Error loading CSV file {csv_file}: {e}")

        if not dfs:
            return pd.DataFrame()

        if len(dfs) == 1:
            df = dfs[0]
        else:
            df = dfs[0]

        # Filter out corrupt/blank header rows
        df = df[df['file_number'].str.strip() != '']
        df = df[~df['file_number'].str.strip().str.lower().isin(['not available', 'nan', 'none', 'null', 'file_no'])]

        # Strict Google Drive filter: Only allow records with verified Google Drive files, remove remaining
        has_proc_drive = df['proceeding_letter_status'] == 'Downloaded'
        has_draw_drive = df['drawing_pdf_status'] == 'Downloaded'
        df = df[has_proc_drive | has_draw_drive]

        # Precompute clean search index columns for fast vectorized filtering
        fn_lower = df['file_number'].astype(str).str.lower()
        pn_lower = df['permit_number'].astype(str).str.lower() if 'permit_number' in df.columns else pd.Series('', index=df.index)
        app_lower = df['applicant_name'].astype(str).str.lower() if 'applicant_name' in df.columns else pd.Series('', index=df.index)
        arc_lower = df['architect_name'].astype(str).str.lower() if 'architect_name' in df.columns else pd.Series('', index=df.index)
        fol_lower = df['folder_name'].astype(str).str.lower() if 'folder_name' in df.columns else pd.Series('', index=df.index)
        proc_lower = df['proceeding_letter_file'].astype(str).str.lower() if 'proceeding_letter_file' in df.columns else pd.Series('', index=df.index)
        draw_lower = df['drawing_pdf_file'].astype(str).str.lower() if 'drawing_pdf_file' in df.columns else pd.Series('', index=df.index)

        df['_fn_lower'] = fn_lower
        df['_pn_lower'] = pn_lower
        df['_fn_alnum'] = fn_lower.str.replace(r'[^a-zA-Z0-9]', '', regex=True)
        df['_pn_alnum'] = pn_lower.str.replace(r'[^a-zA-Z0-9]', '', regex=True)
        df['_clean_search'] = (
            fn_lower + ' ' + pn_lower + ' ' + app_lower + ' ' + arc_lower + ' ' + fol_lower + ' ' + proc_lower + ' ' + draw_lower
        )
        df['_search'] = df['_clean_search']

        self._csv_df = df
        self._csv_mtimes = current_mtimes
        self._csv_last_loaded = time.time()
        logger.info(f"Loaded {len(df):,} total unique records from {len(existing_csvs)} CSV(s).")
        return self._csv_df

    def get_vault_stats(self, vault: str = 'proposals') -> Dict[str, Any]:
        """Calculates identical 6-card metrics for any requested vault (proposals, oc_bp, hmda_layouts)."""
        v = (vault or 'proposals').lower().strip()
        if v in ('hmda_layouts', 'hmda', 'layout'):
            df = self.load_hmda_layout_data()
            source_name = 'HMDA Planning Layouts Vault'
            mysql_conn = False
        elif v in ('oc_bp', 'dpms'):
            df = self.load_oc_bp_data()
            source_name = 'DPMS OC & BP Hub'
            mysql_conn = False
        else:
            df = self.load_csv_data()
            source_name = 'TG-bPASS Proposals Vault'
            mysql_conn = self.check_mysql_connection()

        if df is None or df.empty:
            return {
                'vault': vault,
                'total_proposals': 0,
                'total_records': 0,
                'total_indexed': 0,
                'completed': 0,
                'partial': 0,
                'failed': 0,
                'proc_downloaded': 0,
                'draw_downloaded': 0,
                'insp_downloaded': 0,
                'source': source_name,
                'mysql_connected': mysql_conn
            }

        total = len(df)
        status_col = df['processing_status'].astype(str).str.strip()
        completed = int((status_col == 'Completed').sum())
        partial = int((status_col == 'Partially Completed').sum())
        failed = int((status_col == 'Failed').sum())

        proc_col = df['proceeding_letter_status'].astype(str).str.strip() if 'proceeding_letter_status' in df.columns else pd.Series()
        draw_col = df['drawing_pdf_status'].astype(str).str.strip() if 'drawing_pdf_status' in df.columns else pd.Series()
        insp_col = df['inspection_report_status'].astype(str).str.strip() if 'inspection_report_status' in df.columns else pd.Series()

        proc = int((proc_col == 'Downloaded').sum())
        draw = int((draw_col == 'Downloaded').sum())
        insp = int((insp_col == 'Downloaded').sum())

        stats_dict = {
            'vault': vault,
            'total_proposals': total,
            'total_records': total,
            'total_indexed': total,
            'completed': completed,
            'partial': partial,
            'failed': failed,
            'proc_downloaded': proc,
            'draw_downloaded': draw,
            'insp_downloaded': insp,
            'source': source_name,
            'mysql_connected': mysql_conn
        }

        # Preserve navigation count totals
        try:
            df_csv = self.load_csv_data()
            df_oc = self.load_oc_bp_data()
            df_hmda = self.load_hmda_layout_data()
            stats_dict['proposals_total'] = len(df_csv) if df_csv is not None else 0
            stats_dict['oc_bp_total'] = len(df_oc) if df_oc is not None else 0
            stats_dict['hmda_total'] = len(df_hmda) if df_hmda is not None else 0
        except Exception:
            pass

        return stats_dict

    def get_stats(self, source: str = 'csv', vault: str = 'proposals') -> Dict[str, Any]:
        """Calculates dashboard overview stats from requested vault."""
        return self.get_vault_stats(vault=vault)

    def get_proposals(
        self,
        vault: str = 'proposals',
        source: str = 'csv',
        page: int = 1,
        page_size: int = 50,
        search: str = '',
        status: str = '',
        authority: str = '',
        year: str = '',
        proc_status: str = '',
        draw_status: str = '',
        sort_by: str = 'row_number',
        sort_dir: str = 'asc'
    ) -> Dict[str, Any]:
        """Returns paginated, filtered, sorted proposals from the specified vault."""
        v = (vault or 'proposals').lower().strip()
        page = max(1, page)
        page_size = min(200, max(10, page_size))
        offset = (page - 1) * page_size

        if v in ('hmda_layouts', 'hmda', 'layout'):
            df = self.load_hmda_layout_data()
            source_name = 'HMDA Planning Layouts Vault'
            use_mysql = False
        elif v in ('oc_bp', 'dpms'):
            df = self.load_oc_bp_data()
            source_name = 'DPMS OC & BP Hub'
            use_mysql = False
        else:
            source_name = 'TG-bPASS Proposals Vault'
            use_mysql = (source == 'mysql') or (source == 'auto' and self.check_mysql_connection())
            if not use_mysql:
                df = self.load_csv_data()

        if use_mysql:
            try:
                conn = self.get_mysql_connection()
                cur = conn.cursor(dictionary=True)

                where_clauses = ["1=1", "(proceeding_letter_status = 'Downloaded' OR drawing_pdf_status = 'Downloaded')"]
                params = []

                if search:
                    term = f"%{search.strip()}%"
                    where_clauses.append(
                        "(file_number LIKE %s OR applicant_name LIKE %s OR architect_name LIKE %s OR folder_name LIKE %s)"
                    )
                    params.extend([term, term, term, term])

                if status:
                    where_clauses.append("processing_status = %s")
                    params.append(status)

                if proc_status:
                    where_clauses.append("proceeding_letter_status = %s")
                    params.append(proc_status)

                if draw_status:
                    where_clauses.append("drawing_pdf_status = %s")
                    params.append(draw_status)

                if authority:
                    where_clauses.append("file_number LIKE %s")
                    params.append(f"%{authority}%")

                if year:
                    where_clauses.append("file_number LIKE %s")
                    params.append(f"%{year}%")

                where_sql = " AND ".join(where_clauses)

                # Get total matching rows
                count_sql = f"SELECT COUNT(*) as total FROM proposals WHERE {where_sql}"
                cur.execute(count_sql, tuple(params))
                total_records = cur.fetchone()['total']

                # Allowed sort columns
                valid_cols = {
                    'id': 'id',
                    'row_number': '`row_number`',
                    'page_number': 'page_number',
                    'file_number': 'file_number',
                    'applicant_name': 'applicant_name',
                    'architect_name': 'architect_name',
                    'processing_status': 'processing_status',
                    'proceeding_letter_status': 'proceeding_letter_status',
                    'drawing_pdf_status': 'drawing_pdf_status'
                }
                order_col = valid_cols.get(sort_by, '`row_number`')
                order_dir = 'DESC' if sort_dir.lower() == 'desc' else 'ASC'

                query_sql = f"""
                    SELECT 
                        id, page_number, `row_number`, file_number, applicant_name, architect_name,
                        proceeding_letter_status, proceeding_letter_file_path as proceeding_letter_file,
                        drawing_pdf_status, drawing_pdf_file_path as drawing_pdf_file,
                        folder_name, processing_status, error_message, created_at, updated_at
                    FROM proposals
                    WHERE {where_sql}
                    ORDER BY {order_col} {order_dir}
                    LIMIT %s OFFSET %s
                """
                query_params = list(params) + [page_size, offset]
                cur.execute(query_sql, tuple(query_params))
                rows = cur.fetchall()

                # Enrich records with physical doc availability & parsed metadata
                for r in rows:
                    folder = r.get('folder_name', '')
                    proc_file = r.get('proceeding_letter_file', 'Proceeding_Letter.pdf')
                    draw_file = r.get('drawing_pdf_file', 'Drawing.pdf')
                    
                    r['has_proc_disk'] = bool(find_document_file(folder, proc_file or 'Proceeding_Letter.pdf'))
                    r['has_draw_disk'] = bool(find_document_file(folder, draw_file or 'Drawing.pdf'))
                    
                    meta = extract_metadata_from_file_no(r.get('file_number', ''))
                    r['meta_authority'] = meta['authority']
                    r['meta_year'] = meta['year']
                    r['meta_type'] = meta['prop_type']

                cur.close()
                conn.close()

                total_pages = (total_records + page_size - 1) // page_size if total_records > 0 else 1
                return {
                    'source': 'MySQL Live Cluster',
                    'page': page,
                    'page_size': page_size,
                    'total_records': total_records,
                    'total_pages': total_pages,
                    'records': rows
                }
            except Exception as e:
                logger.error(f"MySQL query error, using CSV: {e}")
                df = self.load_csv_data()

        # In-memory DataFrame Querying (CSV Master, DPMS, or HMDA Layouts)
        if df is None or df.empty:
            return {
                'source': source_name,
                'page': page,
                'page_size': page_size,
                'total_records': 0,
                'total_pages': 0,
                'records': []
            }

        filtered_df = df

        if search and not is_placeholder_search(search):
            s_lower = search.strip().lower()
            if '_search' in filtered_df.columns:
                filtered_df = filtered_df[filtered_df['_search'].str.contains(s_lower, na=False, regex=False)]
            else:
                filtered_df = filtered_df[filtered_df['file_number'].str.lower().str.contains(s_lower, na=False, regex=False)]

        if status:
            filtered_df = filtered_df[filtered_df['processing_status'] == status]

        if proc_status:
            filtered_df = filtered_df[filtered_df['proceeding_letter_status'] == proc_status]

        if draw_status:
            filtered_df = filtered_df[filtered_df['drawing_pdf_status'] == draw_status]

        if authority and 'file_number' in filtered_df.columns:
            filtered_df = filtered_df[filtered_df['file_number'].str.contains(authority, case=False, na=False)]

        if year and 'file_number' in filtered_df.columns:
            filtered_df = filtered_df[filtered_df['file_number'].str.contains(year, case=False, na=False)]

        # Sorting
        sort_column = sort_by if sort_by in filtered_df.columns else 'row_number'
        ascending = (sort_dir.lower() != 'desc')
        try:
            filtered_df = filtered_df.sort_values(by=sort_column, ascending=ascending)
        except Exception:
            pass

        total_records = len(filtered_df)
        total_pages = (total_records + page_size - 1) // page_size if total_records > 0 else 1
        paginated_df = filtered_df.iloc[offset:offset + page_size]

        records = paginated_df.to_dict('records')
        for r in records:
            r.pop('_search', None)
            folder = r.get('folder_name', '')
            proc_file = r.get('proceeding_letter_file', 'Proceeding_Letter.pdf')
            draw_file = r.get('drawing_pdf_file', 'Drawing.pdf')
            
            if 'has_proc_disk' not in r:
                r['has_proc_disk'] = (r.get('proceeding_letter_status') == 'Downloaded')
            if 'has_draw_disk' not in r:
                r['has_draw_disk'] = (r.get('drawing_pdf_status') == 'Downloaded')
            if 'inspection_report_status' in r and 'has_inspection_disk' not in r:
                r['has_inspection_disk'] = (r.get('inspection_report_status') == 'Downloaded')
            
            meta = extract_metadata_from_file_no(r.get('file_number', ''))
            r['meta_authority'] = meta['authority']
            r['meta_year'] = meta['year']
            r['meta_type'] = meta['prop_type']

        return {
            'source': source_name,
            'page': page,
            'page_size': page_size,
            'total_records': total_records,
            'total_pages': total_pages,
            'records': records
        }

    def get_hmda_layout_detail(self, file_number: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed info for an HMDA Layout record."""
        if not file_number:
            return None
        df = self.load_hmda_layout_data()
        if df is None or df.empty:
            return None

        fn_clean = str(file_number).strip().replace('\\', '/')
        fn_upper = fn_clean.upper()

        match = df[
            (df['file_number'].str.upper() == fn_upper) |
            (df['folder_name'].str.upper() == fn_upper) |
            (df['folder_name'].str.replace('_', '/').str.upper() == fn_upper) |
            (df['row_number'].astype(str) == fn_clean)
        ]
        if match.empty:
            match = df[df['file_number'].str.contains(re.escape(fn_clean), case=False, na=False)]

        if not match.empty:
            item = match.iloc[0].to_dict()
            item.pop('_search', None)
            folder = item.get('folder_name', '')
            proc_file = item.get('proceeding_letter_file', 'Proceedings.pdf')
            draw_file = item.get('drawing_pdf_file', 'Plan.pdf')

            proc_path = find_document_file(folder, proc_file)
            draw_path = find_document_file(folder, draw_file)

            item['has_proc_disk'] = bool(proc_path)
            item['has_draw_disk'] = bool(draw_path)
            item['proc_physical_exists'] = bool(proc_path)
            item['draw_physical_exists'] = bool(draw_path)
            item['proc_disk_size'] = proc_path.stat().st_size if proc_path else 0
            item['draw_disk_size'] = draw_path.stat().st_size if draw_path else 0
            item['is_hmda_layout'] = True
            return item

        return None

    def get_proposal_by_file_number(self, file_number: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed info for a single proposal by file number or ID."""
        if not file_number:
            return None

        # 1. Check CSV master dataset first
        df = self.load_csv_data()
        if not df.empty:
            match = df[(df['file_number'] == file_number) | (df['Row'] == str(file_number))]
            if not match.empty:
                item = match.iloc[0].to_dict()
                item.pop('_search', None)
                folder = item.get('folder_name', '')
                proc_file = item.get('proceeding_letter_file', 'Proceeding_Letter.pdf')
                draw_file = item.get('drawing_pdf_file', 'Drawing.pdf')
                
                proc_path = find_document_file(folder, proc_file or 'Proceeding_Letter.pdf')
                draw_path = find_document_file(folder, draw_file or 'Drawing.pdf')
                
                item['has_proc_disk'] = bool(proc_path)
                item['has_draw_disk'] = bool(draw_path)
                item['proc_physical_exists'] = bool(proc_path)
                item['draw_physical_exists'] = bool(draw_path)
                item['proc_disk_size'] = proc_path.stat().st_size if proc_path else 0
                item['draw_disk_size'] = draw_path.stat().st_size if draw_path else 0
                item['meta'] = extract_metadata_from_file_no(item.get('file_number', ''))
                item['progress'] = None
                item['errors'] = []
                return item

        # 2. Check MySQL database
        if self.check_mysql_connection():
            try:
                conn = self.get_mysql_connection()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT * FROM proposals WHERE file_number = %s OR id = %s LIMIT 1", (file_number, file_number))
                row = cur.fetchone()
                
                progress_row = None
                errors = []
                if row:
                    cur.execute("SELECT * FROM scraper_progress WHERE file_number = %s LIMIT 1", (file_number,))
                    progress_row = cur.fetchone()

                    cur.execute("SELECT * FROM scraper_errors WHERE file_number = %s ORDER BY id DESC LIMIT 5", (file_number,))
                    errors = cur.fetchall()

                cur.close()
                conn.close()

                if row:
                    folder = row.get('folder_name', '')
                    proc_file = row.get('proceeding_letter_file_path') or 'Proceeding_Letter.pdf'
                    draw_file = row.get('drawing_pdf_file_path') or 'Drawing.pdf'
                    
                    proc_path = find_document_file(folder, proc_file)
                    draw_path = find_document_file(folder, draw_file)
                    
                    row['proc_physical_exists'] = bool(proc_path)
                    row['draw_physical_exists'] = bool(draw_path)
                    row['proc_disk_size'] = proc_path.stat().st_size if proc_path else 0
                    row['draw_disk_size'] = draw_path.stat().st_size if draw_path else 0
                    row['meta'] = extract_metadata_from_file_no(row.get('file_number', ''))
                    row['progress'] = progress_row
                    row['errors'] = errors
                    return row
            except Exception as e:
                logger.error(f"Error fetching proposal from MySQL: {e}")

        # 3. Fallback: Check DPMS OC & BP dataset
        oc_detail = self.get_oc_bp_detail(file_number)
        if oc_detail:
            return oc_detail

        # 4. Fallback: Check HMDA Planning Layouts dataset
        hmda_detail = self.get_hmda_layout_detail(file_number)
        if hmda_detail:
            return hmda_detail

        return None

    def get_analytics(self, source: str = 'csv') -> Dict[str, Any]:
        """Computes chart analytics: Authority distribution, Years, Top Architects, etc."""
        use_mysql = (source == 'mysql')

        
        if use_mysql:
            try:
                conn = self.get_mysql_connection()
                cur = conn.cursor(dictionary=True)

                # 1. Documents summary
                cur.execute("""
                    SELECT 
                        SUM(CASE WHEN proceeding_letter_status = 'Downloaded' THEN 1 ELSE 0 END) as proc_downloaded,
                        SUM(CASE WHEN proceeding_letter_status = 'Not Available' THEN 1 ELSE 0 END) as proc_not_available,
                        SUM(CASE WHEN drawing_pdf_status = 'Downloaded' THEN 1 ELSE 0 END) as draw_downloaded,
                        SUM(CASE WHEN drawing_pdf_status = 'Not Available' THEN 1 ELSE 0 END) as draw_not_available
                    FROM proposals
                """)
                doc_stats = cur.fetchone() or {}

                # 2. Status counts
                cur.execute("SELECT processing_status, COUNT(*) as cnt FROM proposals GROUP BY processing_status")
                status_counts = {}
                for r in cur.fetchall():
                    s = r['processing_status'] or 'Unknown'
                    status_counts[s] = int(r['cnt'])

                # 3. Top Architects
                cur.execute("""
                    SELECT architect_name, COUNT(*) as cnt 
                    FROM proposals 
                    WHERE architect_name IS NOT NULL AND TRIM(architect_name) != ''
                    GROUP BY architect_name 
                    ORDER BY cnt DESC 
                    LIMIT 10
                """)
                top_architects = {r['architect_name']: int(r['cnt']) for r in cur.fetchall()}

                # 4. Authorities & Years (parse file_numbers)
                cur.execute("SELECT file_number FROM proposals WHERE file_number IS NOT NULL")
                file_numbers = [r['file_number'] for r in cur.fetchall()]
                
                cur.close()
                conn.close()

                auth_counts = {}
                year_counts = {}
                for fn in file_numbers:
                    meta = extract_metadata_from_file_no(fn)
                    a = meta['authority']
                    y = meta['year']
                    auth_counts[a] = auth_counts.get(a, 0) + 1
                    if y != 'Unknown':
                        year_counts[y] = year_counts.get(y, 0) + 1

                # Top 10 authorities
                sorted_auth = dict(sorted(auth_counts.items(), key=lambda x: x[1], reverse=True)[:10])
                sorted_years = dict(sorted(year_counts.items(), key=lambda x: str(x[0])))

                return {
                    'authorities': sorted_auth,
                    'years': sorted_years,
                    'statuses': status_counts,
                    'top_architects': top_architects,
                    'documents': {
                        'proc_downloaded': int(doc_stats.get('proc_downloaded') or 0),
                        'proc_not_available': int(doc_stats.get('proc_not_available') or 0),
                        'draw_downloaded': int(doc_stats.get('draw_downloaded') or 0),
                        'draw_not_available': int(doc_stats.get('draw_not_available') or 0)
                    }
                }
            except Exception as e:
                logger.error(f"MySQL get_analytics error, falling back to CSV: {e}")
                use_mysql = False

        # CSV fallback / direct mode
        df = self.load_csv_data()
        if df.empty:
            return {}

        # Authority distribution
        def get_auth(fn):
            return extract_metadata_from_file_no(str(fn))['authority']
        
        def get_yr(fn):
            return extract_metadata_from_file_no(str(fn))['year']

        auth_counts = df['file_number'].apply(get_auth).value_counts().head(10).to_dict()
        year_counts = df['file_number'].apply(get_yr).value_counts().sort_index().to_dict()
        status_counts = df['processing_status'].value_counts().to_dict()

        # Top Architects
        valid_arch = df[df['architect_name'].str.strip() != '']['architect_name']
        top_architects = valid_arch.value_counts().head(10).to_dict()

        # Download rates
        proc_down = int((df['proceeding_letter_status'] == 'Downloaded').sum())
        proc_na = int((df['proceeding_letter_status'] == 'Not Available').sum())
        draw_down = int((df['drawing_pdf_status'] == 'Downloaded').sum())
        draw_na = int((df['drawing_pdf_status'] == 'Not Available').sum())

        return {
            'authorities': {str(k): int(v) for k, v in auth_counts.items()},
            'years': {str(k): int(v) for k, v in year_counts.items() if k != 'Unknown'},
            'statuses': {str(k): int(v) for k, v in status_counts.items()},
            'top_architects': {str(k): int(v) for k, v in top_architects.items()},
            'documents': {
                'proc_downloaded': proc_down,
                'proc_not_available': proc_na,
                'draw_downloaded': draw_down,
                'draw_not_available': draw_na
            }
        }


    def get_scraper_status(self) -> Dict[str, Any]:
        """Reads scraper_stats, progress.json, and recent scraper errors."""
        result: Dict[str, Any] = {
            'mysql_stats': [],
            'recent_errors': [],
            'progress_summary': {},
            'log_tail': []
        }

        # Check MySQL stats & errors
        if self.check_mysql_connection():
            try:
                conn = self.get_mysql_connection()
                cur = conn.cursor(dictionary=True)
                cur.execute("SELECT * FROM scraper_stats ORDER BY start_time DESC LIMIT 10")
                result['mysql_stats'] = cur.fetchall()
                
                cur.execute("SELECT * FROM scraper_errors ORDER BY id DESC LIMIT 20")
                result['recent_errors'] = cur.fetchall()
                
                cur.close()
                conn.close()
            except Exception as e:
                logger.error(f"Error fetching scraper status: {e}")

        # Progress json stats
        if PROGRESS_PATH.exists():
            try:
                with open(PROGRESS_PATH, 'r', encoding='utf-8') as f:
                    p_data = json.load(f)
                    total_p = len(p_data)
                    comp = sum(1 for v in p_data.values() if v.get('status') == 'completed')
                    result['progress_summary'] = {
                        'total_tracked': total_p,
                        'completed_tracked': comp,
                        'pending_tracked': total_p - comp
                    }
            except Exception as e:
                logger.warning(f"Error reading progress.json: {e}")

        # Log tail
        if LOG_PATH.exists():
            try:
                with open(LOG_PATH, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = f.readlines()
                    result['log_tail'] = [line.strip() for line in lines[-50:]]
            except Exception as e:
                logger.warning(f"Error reading scraper.log: {e}")

        return result


    # =========================================================================
    # DPMS OC's & BP's DATASET METHODS (100% Google Drive Cloud Sourced)
    # =========================================================================

    def load_hmda_layout_data(self, force_reload: bool = False) -> pd.DataFrame:
        """Loads and caches the HMDA Planning Layouts dataset from disk and CSV."""
        now = time.time()
        existing_lo_csvs = [p for p in HMDA_CSV_PATHS if p and p.exists() and p.is_file()]
        if not existing_lo_csvs:
            try:
                from drive_manager import drive_manager
                if drive_manager.is_connected():
                    synced = drive_manager.sync_csv_file('HMDA_LO_Data.csv')
                    if synced and synced.exists():
                        existing_lo_csvs = [synced]
            except Exception as e:
                logger.warning(f"Could not auto-sync HMDA_LO_Data.csv from Google Drive: {e}")

        hmda_root = DOCUMENTS_CACHE_DIR

        if not existing_lo_csvs and not (hmda_root.exists() and hmda_root.is_dir()):
            return pd.DataFrame()

        current_mtimes = tuple((str(p), p.stat().st_mtime) for p in existing_lo_csvs)
        if not force_reload and self._hmda_df is not None and self._hmda_mtimes == current_mtimes:
            return self._hmda_df

        records = []
        seen_files = set()

        hmda_cloud_folders = {}
        try:
            from drive_manager import drive_manager
            if drive_manager.is_connected():
                hmda_cloud_folders = drive_manager.get_hmda_downloaded_data()
        except Exception:
            pass

        # 1. Load from HMDA CSVs (HMDA_LO_Data.csv and HMDA_DPMS_All_Proposals.csv)
        for lo_csv in existing_lo_csvs:
            try:
                raw_df = pd.read_csv(lo_csv, dtype=str).fillna('')
                # Standardize column names lowercase lookup
                raw_cols = {c.strip().lower(): c for c in raw_df.columns}

                def _g(keys, default=''):
                    for k in keys:
                        if k in raw_cols:
                            return raw_df[raw_cols[k]].astype(str).str.strip()
                    return pd.Series([default] * len(raw_df))

                file_nos = _g(['file_no', 'file_number', 'fileno'])
                names = _g(['owner_applicant', 'name', 'applicant_name', 'owner_name'])
                architects = _g(['architect_engineer_surveyor', 'architect_se_name', 'architect_name', 'architect'])
                officers = _g(['officer_name', 'officer'])
                villages = _g(['village', 'village_synos', 'survey_no', 'office'])
                extents = _g(['extent', 'area'])
                draft_issued = _g(['draft_layout_issued', 'extracted_at', 'site_inspection_on'])
                lo_issued = _g(['layout_issued'])
                folders = _g(['folder_name', 'folder'])
                proc_stats = _g(['view_proceeding_action', 'proceedings_status', 'proceeding_status'])
                plan_stats = _g(['view_drawing_action', 'plan_status', 'drawing_status'])
                remarks = _g(['remarks', 'overall_status'])
                project_types = _g(['project_type'])
                case_types = _g(['case_type'])
                permits = _g(['permit_number', 'permit_no', 'proposal_id'])

                for idx in range(len(raw_df)):
                    fn = file_nos.iloc[idx].strip()
                    if not fn or fn.lower() in ('not available', 'nan', 'none', 'file_no'):
                        continue
                    if fn in seen_files:
                        continue
                    seen_files.add(fn)

                    f_name = folders.iloc[idx].strip()
                    if not f_name and fn:
                        f_name = fn.replace('/', '_')

                    applicant = names.iloc[idx].strip()
                    architect = architects.iloc[idx].strip()
                    officer = officers.iloc[idx].strip()
                    v_synos = villages.iloc[idx].strip()
                    ext = extents.iloc[idx].strip()
                    draft_dt = draft_issued.iloc[idx].strip()
                    lo_dt = lo_issued.iloc[idx].strip()
                    rem = remarks.iloc[idx].strip()
                    pt = project_types.iloc[idx].strip()
                    ct = case_types.iloc[idx].strip()
                    p_no = permits.iloc[idx].strip()
                    
                    p_stat = proc_stats.iloc[idx].strip()
                    d_stat = plan_stats.iloc[idx].strip()

                    is_layout = 'layout' in pt.lower() or 'lo' in fn.lower()
                    proc_file_name = 'Proceedings.pdf' if is_layout else 'Proceeding.pdf'
                    plan_file_name = 'Plan.pdf' if is_layout else 'Drawing.pdf'

                    # Check presence in Google Drive HMDA downloaded manifest
                    cloud_info = hmda_cloud_folders.get(f_name) or hmda_cloud_folders.get(fn.replace('/', '_'))
                    proc_in_cloud = bool(cloud_info.get('proceeding', False)) if cloud_info else False
                    plan_in_cloud = bool(cloud_info.get('drawing', False)) if cloud_info else False

                    has_proc = proc_in_cloud or ('download' in p_stat.lower())
                    has_plan = plan_in_cloud or ('download' in d_stat.lower())

                    # Strict Google Drive filter: Only allow records with verified Google Drive files, remove remaining
                    if not (has_proc or has_plan):
                        continue

                    processing_status = 'Completed' if (has_proc and has_plan) else 'Partially Completed'

                    records.append({
                        'file_number': fn,
                        'applicant_name': applicant,
                        'village': v_synos,
                        'extent': ext,
                        'draft_layout_issued': draft_dt,
                        'layout_issued': lo_dt,
                        'remarks': rem,
                        'folder_name': f_name,
                        'folder_path': '',
                        'architect_name': architect,
                        'officer_name': officer,
                        'permit_number': p_no,
                        'project_type': pt or ('Layout Permission (LO)' if is_layout else 'Building Permission'),
                        'case_type': ct or ('Draft Layout' if is_layout else 'New'),
                        'proceeding_letter_file': proc_file_name,
                        'drawing_pdf_file': plan_file_name,
                        'inspection_report_file': '',
                        'proceeding_letter_status': 'Downloaded' if has_proc else 'Not Available',
                        'drawing_pdf_status': 'Downloaded' if has_plan else 'Not Available',
                        'inspection_report_status': 'Not Available',
                        'has_proc_disk': has_proc,
                        'has_draw_disk': has_plan,
                        'has_inspection_disk': False,
                        'processing_status': processing_status
                    })
            except Exception as e:
                logger.error(f"Error loading HMDA CSV {lo_csv}: {e}")

        # 2. Also register any Google Drive downloaded HMDA folders not yet indexed in records
        seen_folders = {str(r.get('folder_name', '')).strip() for r in records if r.get('folder_name')}
        for f_name, cloud_info in hmda_cloud_folders.items():
            if f_name in seen_folders:
                continue
            seen_folders.add(f_name)
            fn = f_name.replace('_', '/')
            if fn in seen_files:
                continue
            seen_files.add(fn)

            has_proc = bool(cloud_info.get('proceeding', False))
            has_plan = bool(cloud_info.get('drawing', False))
            if not (has_proc or has_plan):
                continue

            records.append({
                'file_number': fn,
                'applicant_name': '',
                'village': '',
                'extent': '',
                'draft_layout_issued': '',
                'layout_issued': '',
                'remarks': 'Google Drive Cloud Asset',
                'folder_name': f_name,
                'folder_path': '',
                'architect_name': '',
                'permit_number': '',
                'project_type': 'HMDA Planning Permission',
                'case_type': 'Approved Layout',
                'proceeding_letter_file': 'Proceeding.pdf',
                'drawing_pdf_file': 'Drawing.pdf',
                'inspection_report_file': '',
                'proceeding_letter_status': 'Downloaded' if has_proc else 'Not Available',
                'drawing_pdf_status': 'Downloaded' if has_plan else 'Not Available',
                'inspection_report_status': 'Not Available',
                'has_proc_disk': has_proc,
                'has_draw_disk': has_plan,
                'has_inspection_disk': False,
                'processing_status': 'Completed' if (has_proc and has_plan) else 'Partially Completed'
            })


        if not records:
            return pd.DataFrame()

        df = pd.DataFrame(records)
        fn_lower = df['file_number'].astype(str).str.lower()
        pn_lower = df['permit_number'].astype(str).str.lower() if 'permit_number' in df.columns else pd.Series('', index=df.index)
        app_lower = df['applicant_name'].astype(str).str.lower() if 'applicant_name' in df.columns else pd.Series('', index=df.index)
        vil_lower = df['village'].astype(str).str.lower() if 'village' in df.columns else pd.Series('', index=df.index)
        ext_lower = df['extent'].astype(str).str.lower() if 'extent' in df.columns else pd.Series('', index=df.index)
        rem_lower = df['remarks'].astype(str).str.lower() if 'remarks' in df.columns else pd.Series('', index=df.index)
        fol_lower = df['folder_name'].astype(str).str.lower() if 'folder_name' in df.columns else pd.Series('', index=df.index)
        proc_lower = df['proceeding_letter_file'].astype(str).str.lower() if 'proceeding_letter_file' in df.columns else pd.Series('', index=df.index)
        draw_lower = df['drawing_pdf_file'].astype(str).str.lower() if 'drawing_pdf_file' in df.columns else pd.Series('', index=df.index)

        df['_fn_lower'] = fn_lower
        df['_pn_lower'] = pn_lower
        df['_fn_alnum'] = fn_lower.str.replace(r'[^a-zA-Z0-9]', '', regex=True)
        df['_pn_alnum'] = pn_lower.str.replace(r'[^a-zA-Z0-9]', '', regex=True)
        df['_clean_search'] = (
            fn_lower + ' ' + pn_lower + ' ' + app_lower + ' ' + vil_lower + ' ' + ext_lower + ' ' + rem_lower + ' ' + fol_lower + ' ' + proc_lower + ' ' + draw_lower
        )
        df['_search'] = df['_clean_search']
        self._hmda_df = df
        self._hmda_mtimes = current_mtimes
        self._hmda_last_loaded = now
        logger.info(f"Loaded {len(df):,} HMDA Layout records from Google Drive cloud manifest.")
        return self._hmda_df

    def load_oc_bp_data(self, force_reload: bool = False) -> pd.DataFrame:
        """Loads and caches the DPMS OC & BP dataset across all configured CSVs and directories."""
        now = time.time()
        # Exclude HMDA Layout CSVs from DPMS loader so DPMS has pure Building Permissions & Occupancy Certificates
        existing_oc_csvs = [p for p in OC_BP_CSV_PATHS if p and p.exists() and p.is_file() and 'hmda' not in p.name.lower() and 'layout' not in p.name.lower()]
        if not existing_oc_csvs:
            try:
                from drive_manager import drive_manager
                if drive_manager.is_connected():
                    synced = drive_manager.sync_csv_file('All-for-OC_s-_-BP_s.csv')
                    if synced and synced.exists():
                        existing_oc_csvs = [synced]
            except Exception as e:
                logger.warning(f"Could not auto-sync All-for-OC_s-_-BP_s.csv from Google Drive: {e}")

        if not existing_oc_csvs:
            logger.warning("No DPMS OC & BP dataset found in Google Drive cache.")
            return pd.DataFrame()

        current_mtimes = tuple((str(p), p.stat().st_mtime) for p in existing_oc_csvs)
        if not force_reload and self._oc_bp_df is not None and self._oc_bp_mtimes == current_mtimes:
            return self._oc_bp_df

        dfs = []
        for oc_csv in existing_oc_csvs:
            try:
                df_item = pd.read_csv(oc_csv, dtype=str).fillna('')
                rename_map = {}
                for col in df_item.columns:
                    c_lower = col.strip().lower()
                    if c_lower in ('file_no_temporary_no', 'file_no', 'fileno', 'proposal_number', 'file_number'):
                        rename_map[col] = 'file_number'
                    elif c_lower in ('architect_se_name', 'architect_le_se_name', 'architect_name', 'architect'):
                        rename_map[col] = 'architect_name'
                    elif c_lower in ('applicant_name', 'applicant', 'name', 'owner_name', 'developer_name'):
                        rename_map[col] = 'applicant_name'
                    elif c_lower in ('permit_number', 'permit_no'):
                        rename_map[col] = 'permit_number'
                    elif c_lower in ('case_type',):
                        rename_map[col] = 'case_type'
                    elif c_lower in ('project_type',):
                        rename_map[col] = 'project_type'
                    elif c_lower in ('officer_name', 'officer'):
                        rename_map[col] = 'officer_name'
                    elif c_lower in ('designation',):
                        rename_map[col] = 'designation'
                    elif c_lower in ('village', 'village_synos', 'village_sy_no', 'village/synos'):
                        rename_map[col] = 'village'
                    elif c_lower in ('site_inspection_on',):
                        rename_map[col] = 'site_inspection_on'
                    elif c_lower in ('site_inspection_details',):
                        rename_map[col] = 'site_inspection_details'
                    elif c_lower in ('folder_name', 'folder'):
                        rename_map[col] = 'folder_name'
                    elif c_lower in ('folder_path',):
                        rename_map[col] = 'folder_path'
                    elif c_lower in ('row', 'row_number', 's.no', 'sno', 'sl_no', 'slno'):
                        rename_map[col] = 'row_number'
                    elif c_lower in ('drawing_status', 'plan_status'):
                        rename_map[col] = 'drawing_pdf_status'
                    elif c_lower in ('proceeding_status', 'proceedings_status'):
                        rename_map[col] = 'proceeding_letter_status'
                    elif c_lower in ('drawing_file', 'plan_pdf', 'plan'):
                        rename_map[col] = 'drawing_pdf_file'
                    elif c_lower in ('proceeding_file', 'proceedings_pdf', 'proceedings'):
                        rename_map[col] = 'proceeding_letter_file'
                    elif c_lower in ('inspection_report_file', 'site_inspection_report_pdf', 'site_inspection_report'):
                        rename_map[col] = 'inspection_report_file'
                df_item = df_item.rename(columns=rename_map)

                if 'file_number' not in df_item.columns:
                    continue

                df_item['file_number'] = df_item['file_number'].astype(str).str.strip()
                df_item = df_item[df_item['file_number'] != '']
                df_item = df_item[~df_item['file_number'].str.lower().isin(['not available', 'nan', 'none'])]

                # Pure DPMS: Exclude HMDA Layout letters so vaults remain clean
                df_item = df_item[~df_item['file_number'].str.contains('HMDA|/LO/|-LO', regex=True, case=False)]

                df_item['drawing_pdf_status'] = df_item.get('drawing_pdf_status', '').apply(
                    lambda x: 'Downloaded' if 'download' in str(x).lower() else 'Not Available'
                )
                df_item['proceeding_letter_status'] = df_item.get('proceeding_letter_status', '').apply(
                    lambda x: 'Downloaded' if 'download' in str(x).lower() else 'Not Available'
                )

                # Check Google Drive progress records
                try:
                    from drive_manager import drive_manager
                    if drive_manager.is_connected():
                        prog = drive_manager.get_progress_data()
                        if prog:
                            cloud_proc_fns = {k for k, v in prog.items() if v.get('proceeding_letter') or v.get('proceeding_letter_link')}
                            cloud_proc_keys = {k.replace('/', '_') for k in cloud_proc_fns}
                            mask_cloud = df_item['file_number'].isin(cloud_proc_fns) | df_item['folder_name'].isin(cloud_proc_keys)
                            df_item.loc[mask_cloud, 'proceeding_letter_status'] = 'Downloaded'

                            cloud_draw_fns = {k for k, v in prog.items() if v.get('drawing') or v.get('drawing_link')}
                            cloud_draw_keys = {k.replace('/', '_') for k in cloud_draw_fns}
                            mask_draw = df_item['file_number'].isin(cloud_draw_fns) | df_item['folder_name'].isin(cloud_draw_keys)
                            df_item.loc[mask_draw, 'drawing_pdf_status'] = 'Downloaded'
                except Exception as e:
                    logger.debug(f"Google Drive progress status check notice: {e}")

                df_item['inspection_report_status'] = df_item.get('inspection_report_file', '').apply(
                    lambda x: 'Downloaded' if str(x).strip() and str(x).strip().lower() != 'not_available' else 'Not Available'
                )

                # Strict Google Drive filter: Only keep records that have verified Google Drive files, remove remaining
                is_d = df_item['drawing_pdf_status'] == 'Downloaded'
                is_p = df_item['proceeding_letter_status'] == 'Downloaded'
                is_i = df_item['inspection_report_status'] == 'Downloaded'
                df_item = df_item[is_d | is_p | is_i]

                cond_completed = is_d & (is_p | is_i)
                cond_partial = (is_d | is_p | is_i) & ~cond_completed

                proc_status_series = pd.Series('Partially Completed', index=df_item.index)
                proc_status_series[cond_completed] = 'Completed'
                df_item['processing_status'] = proc_status_series
                df_item['has_draw_disk'] = df_item['drawing_pdf_status'] == 'Downloaded'
                df_item['has_proc_disk'] = df_item['proceeding_letter_status'] == 'Downloaded'
                df_item['has_inspection_disk'] = df_item['inspection_report_status'] == 'Downloaded'

                df_item['drawing_file'] = df_item.get('drawing_pdf_file', 'Drawing.pdf')
                df_item['proceeding_file'] = df_item.get('proceeding_letter_file', 'Proceeding.pdf')
                df_item['drawing_status'] = df_item['drawing_pdf_status']
                df_item['proceeding_status'] = df_item['proceeding_letter_status']

                dfs.append(df_item)

            except Exception as e:
                logger.warning(f"Error loading DPMS CSV {oc_csv}: {e}")

        if not dfs:
            return pd.DataFrame()

        df = pd.concat(dfs, ignore_index=True) if len(dfs) > 1 else dfs[0]
        df = df.drop_duplicates(subset=['file_number'], keep='first')
        fn_lower = df['file_number'].astype(str).str.lower()
        pn_lower = df['permit_number'].astype(str).str.lower() if 'permit_number' in df.columns else pd.Series('', index=df.index)
        app_lower = df['applicant_name'].astype(str).str.lower() if 'applicant_name' in df.columns else pd.Series('', index=df.index)
        arc_lower = df['architect_name'].astype(str).str.lower() if 'architect_name' in df.columns else pd.Series('', index=df.index)
        off_lower = df['officer_name'].astype(str).str.lower() if 'officer_name' in df.columns else pd.Series('', index=df.index)
        des_lower = df['designation'].astype(str).str.lower() if 'designation' in df.columns else pd.Series('', index=df.index)
        vil_lower = df['village'].astype(str).str.lower() if 'village' in df.columns else pd.Series('', index=df.index)
        pt_lower = df['project_type'].astype(str).str.lower() if 'project_type' in df.columns else pd.Series('', index=df.index)
        ct_lower = df['case_type'].astype(str).str.lower() if 'case_type' in df.columns else pd.Series('', index=df.index)
        fol_lower = df['folder_name'].astype(str).str.lower() if 'folder_name' in df.columns else pd.Series('', index=df.index)
        draw_lower = df['drawing_file'].astype(str).str.lower() if 'drawing_file' in df.columns else pd.Series('', index=df.index)
        proc_lower = df['proceeding_file'].astype(str).str.lower() if 'proceeding_file' in df.columns else pd.Series('', index=df.index)
        insp_lower = df['inspection_report_file'].astype(str).str.lower() if 'inspection_report_file' in df.columns else pd.Series('', index=df.index)

        df['_fn_lower'] = fn_lower
        df['_pn_lower'] = pn_lower
        df['_fn_alnum'] = fn_lower.str.replace(r'[^a-zA-Z0-9]', '', regex=True)
        df['_pn_alnum'] = pn_lower.str.replace(r'[^a-zA-Z0-9]', '', regex=True)
        df['_clean_search'] = (
            fn_lower + ' ' + pn_lower + ' ' + app_lower + ' ' + arc_lower + ' ' +
            off_lower + ' ' + des_lower + ' ' + vil_lower + ' ' + pt_lower + ' ' +
            ct_lower + ' ' + fol_lower + ' ' + draw_lower + ' ' + proc_lower + ' ' + insp_lower
        )
        df['_search'] = df['_clean_search']
        self._oc_bp_df = df
        self._oc_bp_mtimes = current_mtimes
        self._oc_bp_last_loaded = now
        logger.info(f"Loaded {len(df):,} DPMS OC & BP records.")
        return self._oc_bp_df

    def get_oc_bp_stats(self) -> Dict[str, Any]:
        """Calculates statistics for the DPMS OC & BP dataset."""
        df = self.load_oc_bp_data()
        if df.empty:
            return {
                'total_records': 0,
                'building_permissions': 0,
                'occupancy_certificates': 0,
                'inspection_reports_downloaded': 0,
                'drawings_downloaded': 0,
                'proceedings_downloaded': 0,
                'unique_officers': 0,
                'project_type_counts': {},
                'top_officers': {},
                'top_designations': {}
            }

        total_records = len(df)
        proj_types = df['project_type'].value_counts().to_dict()
        bp_count = int(df['project_type'].str.lower().str.contains('building', na=False).sum())
        oc_count = int(df['project_type'].str.lower().str.contains('occupancy', na=False).sum())
        lo_count = int(df['project_type'].str.lower().str.contains('layout', na=False).sum())
        
        insp_count = int((df['inspection_report_status'] == 'Downloaded').sum())
        draw_count = int((df['drawing_status'] == 'Downloaded').sum())
        proc_count = int((df['proceeding_status'] == 'Downloaded').sum())

        valid_officers = df[df['officer_name'].str.strip() != '']['officer_name']
        top_officers = {str(k): int(v) for k, v in valid_officers.value_counts().head(8).items()}
        
        valid_desig = df[df['designation'].str.strip() != '']['designation']
        top_desig = {str(k): int(v) for k, v in valid_desig.value_counts().head(6).items()}

        return {
            'total_records': total_records,
            'building_permissions': bp_count,
            'occupancy_certificates': oc_count,
            'layout_permissions': lo_count,
            'inspection_reports_downloaded': insp_count,
            'drawings_downloaded': draw_count,
            'proceedings_downloaded': proc_count,
            'unique_officers': int(valid_officers.nunique()),
            'project_type_counts': {str(k): int(v) for k, v in proj_types.items() if k},
            'top_officers': top_officers,
            'top_designations': top_desig
        }

    def get_oc_bp_proposals(
        self,
        page: int = 1,
        page_size: int = 50,
        search: str = '',
        project_type: str = '',
        case_type: str = '',
        officer: str = '',
        designation: str = '',
        insp_status: str = '',
        draw_status: str = '',
        sort_by: str = 'row_number',
        sort_dir: str = 'asc'
    ) -> Dict[str, Any]:
        """Returns paginated, filtered, sorted DPMS OC & BP proposals."""
        df = self.load_oc_bp_data()
        if df.empty:
            return {
                'page': page,
                'page_size': page_size,
                'total_records': 0,
                'total_pages': 0,
                'records': []
            }

        filtered_df = df

        if search and not is_placeholder_search(search):
            s_lower = search.strip().lower()
            filtered_df = filtered_df[filtered_df['_search'].str.contains(s_lower, na=False, regex=False)]

        if project_type:
            p_lower = project_type.strip().lower()
            if 'layout' in p_lower:
                filtered_df = filtered_df[filtered_df['project_type'].str.lower().str.contains('layout', na=False)]
            elif 'building' in p_lower:
                filtered_df = filtered_df[filtered_df['project_type'].str.lower().str.contains('building', na=False)]
            elif 'occupancy' in p_lower:
                filtered_df = filtered_df[filtered_df['project_type'].str.lower().str.contains('occupancy', na=False)]
            else:
                filtered_df = filtered_df[filtered_df['project_type'].str.lower() == p_lower]

        if case_type:
            filtered_df = filtered_df[filtered_df['case_type'].str.lower() == case_type.strip().lower()]

        if officer:
            filtered_df = filtered_df[filtered_df['officer_name'].str.contains(officer, case=False, na=False)]

        if designation:
            filtered_df = filtered_df[filtered_df['designation'].str.contains(designation, case=False, na=False)]

        if insp_status:
            filtered_df = filtered_df[filtered_df['inspection_report_status'] == insp_status]

        if draw_status:
            filtered_df = filtered_df[filtered_df['drawing_status'] == draw_status]

        # Sorting
        sort_col = sort_by if sort_by in filtered_df.columns else 'row_number'
        ascending = (sort_dir.lower() != 'desc')
        try:
            filtered_df = filtered_df.sort_values(by=sort_col, ascending=ascending)
        except Exception:
            pass

        total_records = len(filtered_df)
        page = max(1, page)
        page_size = min(200, max(10, page_size))
        total_pages = (total_records + page_size - 1) // page_size if total_records > 0 else 1
        offset = (page - 1) * page_size
        paginated_df = filtered_df.iloc[offset:offset + page_size]

        records = paginated_df.to_dict('records')
        for r in records:
            r.pop('_search', None)
            folder = r.get('folder_name', '')
            insp_file = r.get('inspection_report_file') or 'Inspection Report.PDF'
            draw_file = r.get('drawing_file') or 'Drawing.pdf'
            proc_file = r.get('proceeding_file') or 'Proceeding.pdf'
            
            r['has_inspection_disk'] = (r.get('inspection_report_status') == 'Downloaded')
            r['has_draw_disk'] = (r.get('drawing_status') == 'Downloaded')
            r['has_proc_disk'] = (r.get('proceeding_status') == 'Downloaded')
            
            # Parse inspection details table
            r['site_inspection_table'] = parse_site_inspection_table(r.get('site_inspection_details', ''))

        return {
            'page': page,
            'page_size': page_size,
            'total_records': total_records,
            'total_pages': total_pages,
            'records': records
        }

    def get_oc_bp_detail(self, file_number: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed dossier for an OC & BP proposal by file number, permit number, or folder."""
        if not file_number:
            return None

        df = self.load_oc_bp_data()
        if df.empty:
            return None

        fn_clean = str(file_number).strip().replace('\\', '/')
        fn_upper = fn_clean.upper()
        
        match = df[
            (df['file_number'].str.upper() == fn_upper) |
            (df['permit_number'].str.upper() == fn_upper) |
            (df['folder_name'].str.upper() == fn_upper) |
            (df['folder_name'].str.replace('_', '/').str.upper() == fn_upper) |
            (df['row_number'].astype(str) == fn_clean)
        ]
        if match.empty:
            match = df[df['file_number'].str.contains(re.escape(fn_clean), case=False, na=False)]

        if not match.empty:
            item = match.iloc[0].to_dict()
            item.pop('_search', None)
            folder = item.get('folder_name', '')
            
            insp_file = item.get('inspection_report_file') or 'Inspection Report.PDF'
            draw_file = item.get('drawing_file') or 'Drawing.pdf'
            proc_file = item.get('proceeding_file') or 'Proceeding.pdf'

            insp_path = find_document_file(folder, insp_file)
            draw_path = find_document_file(folder, draw_file)
            proc_path = find_document_file(folder, proc_file)

            item['has_inspection_disk'] = bool(insp_path)
            item['has_draw_disk'] = bool(draw_path)
            item['has_proc_disk'] = bool(proc_path)
            item['inspection_report_size'] = insp_path.stat().st_size if insp_path else 0
            item['drawing_size'] = draw_path.stat().st_size if draw_path else 0
            item['proceeding_size'] = proc_path.stat().st_size if proc_path else 0
            item['site_inspection_table'] = parse_site_inspection_table(item.get('site_inspection_details', ''))
            item['is_oc_bp'] = True
            return item

        return None

    def get_unified_search(
        self,
        search: str = '',
        dataset: str = 'all',
        authority: str = '',
        year: str = '',
        project_type: str = '',
        status: str = '',
        doc_filter: str = '',
        page: int = 1,
        page_size: int = 25,
        sort_by: str = 'relevance',
        sort_dir: str = 'asc'
    ) -> Dict[str, Any]:
        """
        Unified omni-search across both TG-bPASS Archive (86.5k+) and DPMS OC's & BP's (169 Inspected).
        Returns normalized unified records with counts breakdown.
        """
        s_lower = '' if is_placeholder_search(search) else search.strip().lower()
        page = max(1, page)
        page_size = min(200, max(1, page_size))

        # --- 1. Query DPMS OC & BP Dataset ---
        df_oc = self.load_oc_bp_data()
        oc_matched_df = df_oc if df_oc is not None else pd.DataFrame()
        if not oc_matched_df.empty:
            if s_lower:
                oc_matched_df = oc_matched_df[oc_matched_df['_search'].str.contains(s_lower, na=False, regex=False)]
            if project_type:
                oc_matched_df = oc_matched_df[oc_matched_df['project_type'].str.lower() == project_type.strip().lower()]
            if doc_filter == 'has_both':
                oc_matched_df = oc_matched_df[(oc_matched_df['inspection_report_status'] == 'Downloaded') & (oc_matched_df['drawing_status'] == 'Downloaded')]
            elif doc_filter == 'has_insp':
                oc_matched_df = oc_matched_df[oc_matched_df['inspection_report_status'] == 'Downloaded']
            elif doc_filter == 'has_draw':
                oc_matched_df = oc_matched_df[oc_matched_df['drawing_status'] == 'Downloaded']
            elif doc_filter == 'has_proc':
                oc_matched_df = oc_matched_df[oc_matched_df['proceeding_status'] == 'Downloaded']

        total_oc_bp = len(oc_matched_df)

        # --- 2. Query TG-bPASS Dataset ---
        df_tg = self.load_csv_data()
        tg_matched_df = df_tg if df_tg is not None else pd.DataFrame()
        if not tg_matched_df.empty:
            if s_lower:
                tg_matched_df = tg_matched_df[tg_matched_df['_search'].str.contains(s_lower, na=False, regex=False)]
            if authority:
                tg_matched_df = tg_matched_df[tg_matched_df['file_number'].str.contains(authority, case=False, na=False)]
            if year:
                tg_matched_df = tg_matched_df[tg_matched_df['file_number'].str.contains(year, case=False, na=False)]
            if status:
                tg_matched_df = tg_matched_df[tg_matched_df['processing_status'] == status]
            if doc_filter == 'has_both':
                tg_matched_df = tg_matched_df[(tg_matched_df['proceeding_letter_status'] == 'Downloaded') & (tg_matched_df['drawing_pdf_status'] == 'Downloaded')]
            elif doc_filter == 'has_proc':
                tg_matched_df = tg_matched_df[tg_matched_df['proceeding_letter_status'] == 'Downloaded']
            elif doc_filter == 'has_draw':
                tg_matched_df = tg_matched_df[tg_matched_df['drawing_pdf_status'] == 'Downloaded']
            elif doc_filter == 'has_insp':
                # TG-bPASS doesn't have inspection reports in master archive
                tg_matched_df = tg_matched_df.iloc[0:0]

        total_tgbpass = len(tg_matched_df)
        total_all = total_oc_bp + total_tgbpass

    def normalize_oc_row(self, r: dict, fallback_idx: int) -> dict:
        folder = str(r.get('folder_name', '') or '')
        insp_file = str(r.get('inspection_report_file', '') or 'Inspection Report.PDF')
        draw_file = str(r.get('drawing_file', '') or 'Drawing.pdf')
        proc_file = str(r.get('proceeding_file', '') or 'Proceeding.pdf')
        insp_status = str(r.get('inspection_report_status', '') or '')
        draw_status = str(r.get('drawing_status', '') or '')
        proc_status = str(r.get('proceeding_status', '') or '')

        fn_upper = str(r.get('file_number', '') or '').upper()
        pt_lower = str(r.get('project_type', '') or '').lower()
        is_layout = 'HMDA' in fn_upper or 'LO' in fn_upper or 'layout' in pt_lower

        source_label = "HMDA Planning Layouts" if is_layout and 'HMDA' in fn_upper else ("Layout Permissions" if is_layout else "DPMS OC & BP")
        source_badge_color = 'teal' if is_layout else 'purple'
        meta_auth = 'HMDA' if 'HMDA' in fn_upper else ('GHMC' if 'GHMC' in fn_upper else 'GHMC / DPMS')

        clean_draw = Path(draw_file).name if draw_file else ('Plan.pdf' if is_layout else 'Drawing.pdf')
        clean_proc = Path(proc_file).name if proc_file else ('Proceedings.pdf' if is_layout else 'Proceeding.pdf')
        clean_insp = Path(insp_file).name if insp_file else 'Inspection Report.PDF'

        has_draw = (str(r.get('drawing_status', '')).strip() == 'Downloaded')
        has_proc = (str(r.get('proceeding_status', '')).strip() == 'Downloaded')
        has_insp = (str(r.get('inspection_report_status', '')).strip() == 'Downloaded')

        return {
            'source_dataset': 'oc_bp',
            'source_label': source_label,
            'source_badge_color': source_badge_color,
            'row_number': int(r.get('row_number', fallback_idx + 1)),
            'file_number': str(r.get('file_number', '') or ''),
            'permit_number': str(r.get('permit_number', '') or ''),
            'applicant_name': str(r.get('applicant_name', '') or ''),
            'architect_name': str(r.get('architect_name', '') or ''),
            'officer_name': str(r.get('officer_name', '') or ''),
            'designation': str(r.get('designation', '') or ''),
            'site_inspection_on': str(r.get('site_inspection_on', '') or ''),
            'project_type': str(r.get('project_type', '') or ('Layout Permission (LO)' if is_layout else 'Building Permission')),
            'case_type': str(r.get('case_type', '') or ('Layout Permission' if is_layout else '')),
            'village': str(r.get('village', '') or ''),
            'folder_name': folder,
            'processing_status': 'Verified',
            'proceeding_letter_status': 'Downloaded' if has_proc else (proc_status if proc_status else 'Not Available'),
            'proceeding_letter_file': clean_proc,
            'drawing_pdf_status': 'Downloaded' if has_draw else (draw_status if draw_status else 'Not Available'),
            'drawing_pdf_file': clean_draw,
            'inspection_report_status': 'Downloaded' if has_insp else (insp_status if insp_status else 'Not Available'),
            'inspection_report_file': clean_insp,
            'has_proc_disk': has_proc,
            'has_draw_disk': has_draw,
            'has_inspection_disk': has_insp,
            'meta_authority': meta_auth,
            'meta_year': re.search(r'20[1-3][0-9]', str(r.get('file_number', ''))).group(0) if re.search(r'20[1-3][0-9]', str(r.get('file_number', ''))) else '',
            'meta_type': str(r.get('project_type', '') or ('Layout Permission (LO)' if is_layout else 'Building Permission')),
            'site_inspection_table': parse_site_inspection_table(r.get('site_inspection_details', '')),
            'is_oc_bp': True
        }

    def normalize_tg_row(self, r: dict, fallback_idx: int) -> dict:
        folder = str(r.get('folder_name', '') or '')
        proc_file = str(r.get('proceeding_letter_file', '') or 'Proceeding_Letter.pdf')
        draw_file = str(r.get('drawing_pdf_file', '') or 'Drawing.pdf')
        proc_status = str(r.get('proceeding_letter_status', '') or 'Not Available')
        draw_status = str(r.get('drawing_pdf_status', '') or 'Not Available')
        file_no = str(r.get('file_number', '') or '')
        meta = extract_metadata_from_file_no(file_no)

        return {
            'source_dataset': 'tgbpass',
            'source_label': 'TG-bPASS Archive',
            'source_badge_color': 'sky',
            'row_number': int(r.get('row_number', fallback_idx + 1)),
            'file_number': file_no,
            'permit_number': '',
            'applicant_name': str(r.get('applicant_name', '') or ''),
            'architect_name': str(r.get('architect_name', '') or ''),
            'officer_name': '',
            'designation': '',
            'site_inspection_on': '',
            'project_type': meta.get('prop_type', 'Building Permission'),
            'case_type': '',
            'village': '',
            'folder_name': folder,
            'processing_status': str(r.get('processing_status', '') or 'Pending'),
            'proceeding_letter_status': proc_status,
            'proceeding_letter_file': proc_file,
            'drawing_pdf_status': draw_status,
            'drawing_pdf_file': draw_file,
            'inspection_report_status': 'Not Available',
            'inspection_report_file': '',
            'has_proc_disk': (proc_status == 'Downloaded'),
            'has_draw_disk': (draw_status == 'Downloaded'),
            'has_inspection_disk': False,
            'meta_authority': meta.get('authority', 'Other'),
            'meta_year': meta.get('year', 'Unknown'),
            'meta_type': meta.get('prop_type', 'Unknown'),
            'site_inspection_table': [],
            'is_oc_bp': False
        }

    def normalize_hmda_row(self, r: dict, fallback_idx: int) -> dict:
        folder = str(r.get('folder_name', '') or '')
        clean_draw = str(r.get('drawing_pdf_file', '') or 'Drawing.pdf')
        clean_proc = str(r.get('proceeding_letter_file', '') or 'Proceeding.pdf')
        has_proc = bool(r.get('has_proc_disk') or ('download' in str(r.get('proceeding_letter_status', '')).lower()))
        has_plan = bool(r.get('has_draw_disk') or ('download' in str(r.get('drawing_pdf_status', '')).lower()))

        pt = str(r.get('project_type', '') or 'Building Permission')
        is_layout = 'layout' in pt.lower() or 'lo' in str(r.get('file_number', '')).lower()
        source_label = 'HMDA Planning Layouts' if is_layout else 'HMDA DPMS Archive'
        source_badge_color = 'teal' if is_layout else 'indigo'

        return {
            'source_dataset': 'hmda',
            'source_label': source_label,
            'source_badge_color': source_badge_color,
            'row_number': int(r.get('row_number', fallback_idx + 1)),
            'file_number': str(r.get('file_number', '') or ''),
            'permit_number': str(r.get('permit_number', '') or ''),
            'applicant_name': str(r.get('applicant_name', '') or ''),
            'architect_name': str(r.get('architect_name', '') or ''),
            'officer_name': str(r.get('officer_name', '') or ''),
            'designation': str(r.get('designation', '') or ''),
            'site_inspection_on': str(r.get('site_inspection_on', '') or r.get('draft_layout_issued', '') or ''),
            'project_type': pt,
            'case_type': str(r.get('case_type', '') or ('Draft Layout' if is_layout else 'New')),
            'village': str(r.get('village', '') or ''),
            'folder_name': folder,
            'processing_status': str(r.get('processing_status', '') or 'Completed'),
            'proceeding_letter_status': 'Downloaded' if has_proc else 'Not Available',
            'proceeding_letter_file': clean_proc,
            'drawing_pdf_status': 'Downloaded' if has_plan else 'Not Available',
            'drawing_pdf_file': clean_draw,
            'inspection_report_status': 'Not Available',
            'inspection_report_file': '',
            'has_proc_disk': has_proc,
            'has_draw_disk': has_plan,
            'has_inspection_disk': False,
            'meta_authority': 'HMDA',
            'meta_year': re.search(r'20[0-3][0-9]', str(r.get('file_number', ''))).group(0) if re.search(r'20[0-3][0-9]', str(r.get('file_number', ''))) else '',
            'meta_type': pt,
            'site_inspection_table': [],
            'is_oc_bp': False
        }

    def calculate_match_priority(self, r: dict, query: str) -> int:
        """
        Computes relevance rank strictly following the 6-tier specification:
        Priority 1 – Exact full reference match (file_number or permit_number equals query)
        Priority 2 – Exact identifier token match (query matches a delimited segment in file/permit no)
        Priority 3 – Starts-with match in file_number or permit_number
        Priority 4 – Contains match in file_number or permit_number
        Priority 5 – Multiple-token / metadata match (applicant, architect, officer, village, folder)
        Priority 6 – OCR / extracted text match (remarks)
        """
        if not query:
            return 5
        q = query.strip().lower()
        q_alnum = re.sub(r'[^a-zA-Z0-9]', '', q)

        fn = str(r.get('file_number', '') or '').strip().lower()
        pn = str(r.get('permit_number', '') or '').strip().lower()
        fn_alnum = re.sub(r'[^a-zA-Z0-9]', '', fn)
        pn_alnum = re.sub(r'[^a-zA-Z0-9]', '', pn)

        # Priority 1: Exact full reference match
        if fn == q or (pn and pn == q):
            return 1
        if q_alnum and len(q_alnum) >= 4 and (fn_alnum == q_alnum or (pn_alnum and pn_alnum == q_alnum)):
            return 1

        # Priority 2: Exact identifier token segment match (e.g. 0872, KPL2, GHMC)
        fn_tokens = [t for t in re.split(r'[^a-zA-Z0-9]+', fn) if t]
        pn_tokens = [t for t in re.split(r'[^a-zA-Z0-9]+', pn) if t]
        if q in fn_tokens or (pn and q in pn_tokens) or (q_alnum and (q_alnum in fn_tokens or q_alnum in pn_tokens)):
            return 2

        # Priority 3: Starts-with match
        if fn.startswith(q) or (pn and pn.startswith(q)):
            return 3
        if q_alnum and (fn_alnum.startswith(q_alnum) or (pn_alnum and pn_alnum.startswith(q_alnum))):
            return 3

        # Priority 4: Contains match in identifier
        if q in fn or (pn and q in pn):
            return 4
        if q_alnum and len(q_alnum) >= 2 and (q_alnum in fn_alnum or (pn_alnum and q_alnum in pn_alnum)):
            return 4

        # Priority 6: OCR / extracted text match (check if matched ONLY in remarks)
        remarks = str(r.get('remarks', '') or '').lower()
        if remarks and q in remarks:
            app = str(r.get('applicant_name', '') or '').lower()
            arc = str(r.get('architect_name', '') or '').lower()
            off = str(r.get('officer_name', '') or '').lower()
            vil = str(r.get('village', '') or '').lower()
            if not any(q in field for field in [app, arc, off, vil]):
                return 6

        # Priority 5: Multiple-token / metadata match
        return 5

    def generate_match_snippet(self, r: dict, query: str) -> str:
        """Generates a clear contextual highlight showing exactly which field the query matched."""
        if not query:
            return f"Ref: {r.get('file_number', '')}"
        q = query.strip().lower()
        q_alnum = re.sub(r'[^a-zA-Z0-9]', '', q)
        fn = str(r.get('file_number', '') or '')
        pn = str(r.get('permit_number', '') or '')
        applicant = str(r.get('applicant_name', '') or '')
        architect = str(r.get('architect_name', '') or '')
        officer = str(r.get('officer_name', '') or '')
        village = str(r.get('village', '') or '')
        remarks = str(r.get('remarks', '') or '')
        doc_proc = str(r.get('proceeding_letter_file', '') or '')
        doc_draw = str(r.get('drawing_pdf_file', '') or '')
        doc_insp = str(r.get('inspection_report_file', '') or '')

        fn_lower = fn.lower()
        pn_lower = pn.lower()

        # Exact match
        if fn_lower == q or (q_alnum and len(q_alnum) >= 4 and re.sub(r'[^a-zA-Z0-9]', '', fn_lower) == q_alnum):
            return f"Matched in File Number: {fn}"
        if pn_lower == q or (pn and q_alnum and len(q_alnum) >= 4 and re.sub(r'[^a-zA-Z0-9]', '', pn_lower) == q_alnum):
            return f"Matched in Permit Number: {pn}"

        # 1. Matched in File / Reference Number
        if q in fn_lower or (q_alnum and len(q_alnum) >= 2 and q_alnum in re.sub(r'[^a-zA-Z0-9]', '', fn_lower)):
            return f"Matched in File Number: {fn}"
        # 2. Matched in Permit Number
        if pn and (q in pn_lower or (q_alnum and len(q_alnum) >= 2 and q_alnum in re.sub(r'[^a-zA-Z0-9]', '', pn_lower))):
            return f"Matched in Permit Number: {pn}"
        # 3. Matched in Document Name
        for dname in [doc_proc, doc_draw, doc_insp]:
            if dname and (q in dname.lower() or (q_alnum and len(q_alnum) >= 2 and q_alnum in re.sub(r'[^a-zA-Z0-9]', '', dname.lower()))):
                return f"Matched in Document Name: {dname}"
        # 4. Matched in Applicant Name
        if applicant:
            app_lower = applicant.lower()
            if q in app_lower or (q_alnum and len(q_alnum) >= 2 and q_alnum in re.sub(r'[^a-zA-Z0-9]', '', app_lower)):
                idx = app_lower.find(q) if q in app_lower else 0
                start = max(0, idx - 10)
                end = min(len(applicant), idx + len(q) + 20)
                pref = '...' if start > 0 else ''
                suff = '...' if end < len(applicant) else ''
                return f"Matched in Applicant Name: {pref}{applicant[start:end]}{suff}"
        # 5. Matched in Architect Name
        if architect and q in architect.lower():
            return f"Matched in Architect: {architect}"
        # 6. Matched in Officer Name
        if officer and q in officer.lower():
            desig = f" ({r.get('designation', '')})" if r.get('designation') else ''
            return f"Matched in Inspection Officer: {officer}{desig}"
        # 7. Matched in Village / Locality
        if village and q in village.lower():
            return f"Matched in Location: {village[:40]}"
        # 8. Matched in OCR / Extracted Text / Remarks
        if remarks and q in remarks.lower():
            idx = remarks.lower().find(q)
            start = max(0, idx - 15)
            end = min(len(remarks), idx + len(q) + 25)
            pref = '...' if start > 0 else ''
            suff = '...' if end < len(remarks) else ''
            return f"Matched in OCR Text: {pref}{remarks[start:end]}{suff}"

        # Delimited token match in file number
        tokens = [t for t in re.split(r'[^a-zA-Z0-9]+', q) if len(t) >= 2]
        for t in tokens:
            if t in fn_lower:
                return f"Matched in File Number: {fn}"
            if pn and t in pn_lower:
                return f"Matched in Permit Number: {pn}"

        return f"Related to Application: {fn}"

    def extract_record_files(self, r: dict, query: str) -> List[dict]:
        """Extracts and flattens all related authorized public files from an application record."""
        files = []
        folder = r.get('folder_name', '')
        ref_no = r.get('file_number', '')
        permit_no = r.get('permit_number', '')
        dataset = r.get('source_dataset', 'tgbpass')
        snippet = self.generate_match_snippet(r, query)
        priority = self.calculate_match_priority(r, query)
        date_val = r.get('site_inspection_on') or r.get('draft_layout_issued') or r.get('meta_year', '')
        is_layout = (dataset == 'hmda') or ('Layout' in str(r.get('project_type', '')))

        # Label & Badge color per archive
        if dataset == 'tgbpass':
            archive_label = "TG-bPASS Master Archive"
            badge_color = "sky"
        elif dataset == 'oc_bp':
            archive_label = "DPMS OC's & BP's Archive"
            badge_color = "purple"
        elif dataset == 'hmda':
            archive_label = "Masterplan HMDA Planning Layouts"
            badge_color = "emerald"
        else:
            archive_label = r.get('source_label', "Archive")
            badge_color = r.get('source_badge_color', "sky")

        # 1. Proceeding Letter / Order
        proc_file = r.get('proceeding_letter_file', '')
        proc_stat = r.get('proceeding_letter_status', 'Not Available')
        has_proc = bool(r.get('has_proc_disk') or (proc_stat == 'Downloaded'))
        clean_proc_name = proc_file or ('Proceedings.pdf' if is_layout else 'Proceeding_Letter.pdf')
        doc_type = "HMDA Layout Proceedings" if is_layout else ("Proceeding Letter" if dataset == 'tgbpass' else "Proceeding Order")
        
        # 1. Proceeding Letter / Order - ONLY ALLOW IF VERIFIED IN GOOGLE DRIVE
        if has_proc:
            files.append({
                'file_id': f"{dataset}-{ref_no}-{clean_proc_name}",
                'doc_type': doc_type,
                'reference_no': ref_no,
                'permit_number': permit_no,
                'doc_name': clean_proc_name,
                'date': date_val,
                'status': 'Available',
                'storage': 'Google Drive Cloud Storage',
                'snippet': snippet,
                'match_priority': priority,
                'folder_name': folder,
                'source_dataset': dataset,
                'source_label': archive_label,
                'source_badge_color': badge_color,
                'applicant_name': r.get('applicant_name', ''),
                'is_available': True,
                'can_download': True,
                'view_url': f"/api/document/{folder}/{clean_proc_name}",
                'download_url': f"/api/document/{folder}/{clean_proc_name}?download=1"
            })

        # 2. Building Plan / Approved Drawing - ONLY ALLOW IF VERIFIED IN GOOGLE DRIVE
        draw_file = r.get('drawing_pdf_file', '')
        draw_stat = r.get('drawing_pdf_status', 'Not Available')
        has_draw = bool(r.get('has_draw_disk') or (draw_stat == 'Downloaded'))
        clean_draw_name = draw_file or ('Plan.pdf' if is_layout else 'Drawing.pdf')
        doc_type_draw = "HMDA Layout Plan" if is_layout else ("Building Plan" if dataset == 'tgbpass' else "Approved Blueprint Drawing")
        if has_draw:
            files.append({
                'file_id': f"{dataset}-{ref_no}-{clean_draw_name}",
                'doc_type': doc_type_draw,
                'reference_no': ref_no,
                'permit_number': permit_no,
                'doc_name': clean_draw_name,
                'date': date_val,
                'status': 'Available',
                'storage': 'Google Drive Cloud Storage',
                'snippet': snippet,
                'match_priority': priority,
                'folder_name': folder,
                'source_dataset': dataset,
                'source_label': archive_label,
                'source_badge_color': badge_color,
                'applicant_name': r.get('applicant_name', ''),
                'is_available': True,
                'can_download': True,
                'view_url': f"/api/document/{folder}/{clean_draw_name}",
                'download_url': f"/api/document/{folder}/{clean_draw_name}?download=1"
            })

        # 3. Site Inspection Report (for DPMS OC & BP) - ONLY ALLOW IF VERIFIED IN GOOGLE DRIVE
        if dataset == 'oc_bp':
            insp_file = r.get('inspection_report_file', '')
            insp_stat = r.get('inspection_report_status', 'Not Available')
            has_insp = bool(r.get('has_inspection_disk') or (insp_stat == 'Downloaded'))
            clean_insp_name = insp_file or 'Inspection Report.PDF'
            if has_insp and insp_file and insp_file.lower() != 'not_available':
                insp_snippet = f"Inspection Officer: {r.get('officer_name', '')} ({r.get('designation', '')})" if r.get('officer_name') else snippet
                files.append({
                    'file_id': f"{dataset}-{ref_no}-{clean_insp_name}",
                    'doc_type': "Site Inspection Report",
                    'reference_no': ref_no,
                    'permit_number': permit_no,
                    'doc_name': clean_insp_name,
                    'date': r.get('site_inspection_on', ''),
                    'status': 'Available',
                    'storage': 'Google Drive Cloud Storage',
                    'snippet': insp_snippet,
                    'match_priority': priority,
                    'folder_name': folder,
                    'source_dataset': dataset,
                    'source_label': archive_label,
                    'source_badge_color': badge_color,
                    'applicant_name': r.get('applicant_name', ''),
                    'is_available': True,
                    'can_download': True,
                    'view_url': f"/api/document/{folder}/{clean_insp_name}",
                    'download_url': f"/api/document/{folder}/{clean_insp_name}?download=1"
                })

        return files

    def get_public_search(
        self,
        search: str = '',
        dataset: str = 'all',
        authority: str = '',
        year: str = '',
        project_type: str = '',
        status: str = '',
        page: int = 1,
        page_size: int = 25
    ) -> Dict[str, Any]:
        """
        Public Search endpoint: Searches records, metadata, and extracted text by number, letter, or alphanumeric identifier.
        Strictly respects the selected dropdown repository (TG-bPASS Master Archive, DPMS OC's & BP's Archive, HMDA Layouts, or All).
        Returns deduplicated matched records and all associated related files sorted by match priority.
        """
        s_clean = ' '.join((search or '').strip().split())
        page = max(1, page)
        page_size = min(200, max(1, page_size))

        if not s_clean or is_placeholder_search(s_clean):
            return {
                'query': s_clean,
                'page': page,
                'page_size': page_size,
                'total_files': 0,
                'total_records': 0,
                'total_pages': 1,
                'files': [],
                'records': [],
                'counts': {'all': 0, 'tgbpass': 0, 'oc_bp': 0, 'hmda': 0, 'total_files': 0}
            }

        s_lower = s_clean.lower()
        s_alnum = re.sub(r'[^a-zA-Z0-9]', '', s_lower)
        tokens = [t for t in re.split(r'[^a-zA-Z0-9]+', s_lower) if t]
        n_tokens = len(tokens)
        raw_mode = (dataset or 'all').lower().strip()

        # Target repositories to search strictly based on dropdown selection
        target_repos = []
        if raw_mode in ('tgbpass', 'tg-bpass', 'tg_bpass'):
            target_repos.append(('tgbpass', self.load_csv_data, self.normalize_tg_row))
        elif raw_mode in ('dpms', 'oc_bp', 'oc-bp', 'oc', 'bp'):
            target_repos.append(('oc_bp', self.load_oc_bp_data, self.normalize_oc_row))
        elif raw_mode in ('hmda', 'layout', 'layouts'):
            target_repos.append(('hmda', self.load_hmda_layout_data, self.normalize_hmda_row))
        else:  # 'all' or default
            target_repos.append(('tgbpass', self.load_csv_data, self.normalize_tg_row))
            target_repos.append(('oc_bp', self.load_oc_bp_data, self.normalize_oc_row))
            target_repos.append(('hmda', self.load_hmda_layout_data, self.normalize_hmda_row))

        # Helper to get string series safely
        def _get_col_str(df_in: pd.DataFrame, col_name: str) -> pd.Series:
            if col_name in df_in.columns:
                return df_in[col_name].fillna('').astype(str).str.lower()
            return pd.Series('', index=df_in.index)

        # First pass: Load dataframes and check if ANY exact full reference match exists in the target scope
        repo_data = []
        has_exact_full_match = False

        for ds_name, loader, normalizer in target_repos:
            df_src = loader()
            if df_src is None or df_src.empty:
                continue

            # Ensure clean search series exists without static filler words
            if '_clean_search' in df_src.columns:
                search_series = df_src['_clean_search']
            else:
                search_series = (
                    _get_col_str(df_src, 'file_number') + ' ' +
                    _get_col_str(df_src, 'permit_number') + ' ' +
                    _get_col_str(df_src, 'applicant_name') + ' ' +
                    _get_col_str(df_src, 'architect_name') + ' ' +
                    _get_col_str(df_src, 'officer_name') + ' ' +
                    _get_col_str(df_src, 'village') + ' ' +
                    _get_col_str(df_src, 'folder_name') + ' ' +
                    _get_col_str(df_src, 'remarks')
                )

            # Precomputed or calculated lower / alnum columns for exact check
            fn_lower = df_src['_fn_lower'] if '_fn_lower' in df_src.columns else _get_col_str(df_src, 'file_number')
            pn_lower = df_src['_pn_lower'] if '_pn_lower' in df_src.columns else _get_col_str(df_src, 'permit_number')
            fn_alnum = df_src['_fn_alnum'] if '_fn_alnum' in df_src.columns else fn_lower.str.replace(r'[^a-zA-Z0-9]', '', regex=True)
            pn_alnum = df_src['_pn_alnum'] if '_pn_alnum' in df_src.columns else pn_lower.str.replace(r'[^a-zA-Z0-9]', '', regex=True)

            is_exact = (fn_lower == s_lower) | (pn_lower == s_lower)
            if s_alnum and len(s_alnum) >= 5:
                is_exact = is_exact | (fn_alnum == s_alnum) | (pn_alnum == s_alnum)

            if is_exact.any():
                has_exact_full_match = True

            repo_data.append({
                'ds_name': ds_name,
                'df': df_src,
                'normalizer': normalizer,
                'search_series': search_series,
                'is_exact': is_exact
            })

        # Second pass: Apply filtering and collect deduplicated records & files
        matched_records = []
        matched_files = []
        seen_file_keys = set()
        seen_rec_keys = set()

        for item in repo_data:
            ds_name = item['ds_name']
            df_src = item['df']
            normalizer = item['normalizer']
            search_series = item['search_series']
            is_exact = item['is_exact']

            if has_exact_full_match:
                # Rule 2 & 5: Exact full reference isolation - return only exact matching records & direct files
                matched = df_src[is_exact]
            else:
                # Broad or multi-token search
                if n_tokens > 1:
                    # Multi-token AND search (Rule 6: Every token must exist in the record)
                    token_mask = pd.Series(True, index=df_src.index)
                    for t in tokens:
                        token_mask &= search_series.str.contains(t, na=False, regex=False)
                    matched = df_src[token_mask]
                else:
                    # Single-token search (Rule 7: Match all records containing token)
                    t = tokens[0] if tokens else s_lower
                    mask = search_series.str.contains(t, na=False, regex=False)
                    # Leading-zero variation for numeric queries (e.g. 05188 vs 5188)
                    if t.isdigit() and t.startswith('0') and len(t) > 3:
                        mask |= search_series.str.contains(t.lstrip('0'), na=False, regex=False)
                    matched = df_src[mask]

            # Apply secondary filters if provided
            if not matched.empty:
                if authority:
                    fn_col = matched['file_number'].astype(str)
                    matched = matched[fn_col.str.contains(authority, case=False, na=False)]
                if year:
                    fn_col = matched['file_number'].astype(str)
                    matched = matched[fn_col.str.contains(year, case=False, na=False)]
                if status and 'processing_status' in matched.columns:
                    matched = matched[matched['processing_status'] == status]
                if project_type and 'project_type' in matched.columns:
                    pt_col = matched['project_type'].astype(str)
                    matched = matched[pt_col.str.contains(project_type, case=False, na=False)]

            # Normalize records and extract direct authorized files
            for idx, r in enumerate(matched.to_dict('records')):
                norm = normalizer(r, idx)
                rec_k = f"{ds_name}_{norm['file_number']}"
                if rec_k not in seen_rec_keys:
                    rec_files = self.extract_record_files(norm, s_clean)
                    # ONLY ALLOW PROPOSALS WITH VERIFIED GOOGLE DRIVE FILES - REMAINING REMOVE
                    if not rec_files:
                        continue

                    seen_rec_keys.add(rec_k)
                    norm['match_priority'] = 1 if has_exact_full_match else self.calculate_match_priority(norm, s_clean)
                    matched_records.append(norm)

                    for f in rec_files:
                        fk = (f['reference_no'], f['doc_name'])
                        if fk not in seen_file_keys:
                            seen_file_keys.add(fk)
                            matched_files.append(f)


        # Calculate exact counts from deduplicated matched records
        total_files = len(matched_files)
        total_records = len(matched_records)
        total_pages = max(
            (total_records + page_size - 1) // page_size if total_records > 0 else 1,
            (total_files + page_size - 1) // page_size if total_files > 0 else 1
        )

        total_tgbpass = sum(1 for r in matched_records if r.get('source_dataset') == 'tgbpass')
        total_oc_bp = sum(1 for r in matched_records if r.get('source_dataset') == 'oc_bp')
        total_hmda = sum(1 for r in matched_records if r.get('source_dataset') == 'hmda')

        # Sort files by Priority (1: Exact, 2: Contains, 3: Multi-token, 4: Dossier, 5: Year/Authority, 6: Metadata), then Availability, then Date
        def sort_file_key(f):
            priority = f.get('match_priority', 6)
            avail = 0 if f.get('is_available') else 1
            date_str = str(f.get('date', ''))
            return (priority, avail, -len(date_str), date_str)

        matched_files.sort(key=sort_file_key)

        # Sort records by Priority (1 to 6)
        matched_records.sort(key=lambda r: (
            r.get('match_priority', 6),
            0 if r.get('processing_status') in ('Completed', 'Approved') else 1
        ))

        file_offset = (page - 1) * page_size
        paged_files = matched_files[file_offset: file_offset + page_size]
        rec_offset = (page - 1) * page_size
        paged_records = matched_records[rec_offset: rec_offset + page_size]

        return {
            'query': s_clean,
            'page': page,
            'page_size': page_size,
            'total_files': total_files,
            'total_records': total_records,
            'total_pages': total_pages,
            'files': paged_files,
            'records': paged_records,
            'counts': {
                'all': total_records,
                'total_files': total_files,
                'tgbpass': total_tgbpass,
                'oc_bp': total_oc_bp,
                'hmda': total_hmda
            }
        }


    def get_unified_search(
        self,
        search: str = '',
        dataset: str = 'all',
        authority: str = '',
        year: str = '',
        project_type: str = '',
        status: str = '',
        doc_filter: str = '',
        page: int = 1,
        page_size: int = 25,
        sort_by: str = 'relevance',
        sort_dir: str = 'asc'
    ) -> Dict[str, Any]:
        """
        Unified omni-search across TG-bPASS Archive, DPMS OC's & BP's, and HMDA Planning Layouts.
        Returns normalized unified records along with associated related files.
        """
        # Call get_public_search to get unified files and records
        res = self.get_public_search(
            search=search,
            dataset=dataset,
            authority=authority,
            year=year,
            project_type=project_type,
            status=status,
            page=page,
            page_size=page_size
        )
        return {
            'page': res['page'],
            'page_size': res['page_size'],
            'total_records': res['total_records'],
            'total_pages': res['total_pages'],
            'total_files': res['total_files'],
            'counts': res['counts'],
            'dataset': dataset,
            'records': res['records'],
            'files': res['files']
        }


# Singleton instance
data_provider = DataProvider()

