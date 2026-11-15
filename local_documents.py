"""Index of proposal documents stored on the local data disks (no Google Drive).

The scrapers save one folder per proposal, named after its file number with '/' replaced by '_'
(e.g. 000001/GHMC/0001/SEC1/2022-OC -> 000001_GHMC_0001_SEC1_2022-OC), containing the PDFs
(Proceeding_Letter.pdf, Drawing.pdf, Plan.pdf, Inspection Report.pdf, ...) plus .txt metadata.
The same proposal is often copied under several roots; all copies are merged here.

Walking every root takes about a minute, so the index is cached in cache/local_doc_index.json
and rebuilt when any data folder that holds proposal folders changes, or on request:
    python local_documents.py          # rebuild and print a summary
"""
import html
import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import Dict, List, Optional

from config import CACHE_DIR, DOCUMENT_DIRS

logger = logging.getLogger('tgbpass_site.local_documents')

INDEX_PATH = CACHE_DIR / 'local_doc_index.json'
INDEX_VERSION = 2  # bump whenever doc_key() changes
SKIP_DIRS = {'.venv', 'venv', '.git', '__pycache__', 'site-packages', 'node_modules', 'lib', 'scripts', 'include'}


def clean_text(value) -> str:
    """Decodes HTML entities the scrapers left in names/values (&#160;, &nbsp;, &amp;, &quot;)."""
    s = html.unescape(html.unescape(str(value or '')))
    return s.replace('\xa0', ' ').strip()


def doc_key(name: str) -> str:
    """Normalises a file number or folder name to the index key (lowercase alphanumerics only)."""
    return re.sub(r'[^a-z0-9]', '', clean_text(name).lower())


def doc_kind(filename: str) -> str:
    """Classifies a PDF by its filename: 'proceeding', 'drawing', 'inspection' or 'other'."""
    n = filename.lower()
    if 'inspection' in n:
        return 'inspection'
    if 'proceeding' in n:
        return 'proceeding'
    if 'drawing' in n or 'plan' in n:
        return 'drawing'
    return 'other'


def _roots() -> List[Path]:
    return [Path(p) for p in DOCUMENT_DIRS if p and Path(p).is_dir()]


class LocalDocumentIndex:
    def __init__(self):
        self._lock = threading.Lock()
        self._index: Optional[Dict[str, dict]] = None
        self._parents: Dict[str, float] = {}

    # ---- building ---------------------------------------------------------------------------

    def _scan(self):
        """Walks every root. Returns ({key: {'folder', 'docs': {pdf_name: abs_path}}}, {parent_dir: mtime})."""
        index: Dict[str, dict] = {}
        parents: Dict[str, float] = {}
        for root in _roots():
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = [d for d in dirnames if d.lower() not in SKIP_DIRS]
                pdfs = [f for f in filenames if f.lower().endswith('.pdf')]
                if not pdfs:
                    continue
                folder = os.path.basename(dirpath)
                parent = os.path.dirname(dirpath)
                if parent not in parents:
                    try:
                        parents[parent] = os.stat(parent).st_mtime
                    except OSError:
                        parents[parent] = 0
                entry = index.setdefault(doc_key(folder), {'folder': folder, 'docs': {}})
                for f in pdfs:
                    path = os.path.join(dirpath, f)
                    if f not in entry['docs']:
                        try:
                            if os.path.getsize(path) > 0:
                                entry['docs'][f] = path
                        except OSError:
                            pass
        index = {k: v for k, v in index.items() if v['docs']}
        return index, parents

    def _cache_is_fresh(self, cached: dict) -> bool:
        if cached.get('version') != INDEX_VERSION or cached.get('roots') != [str(r) for r in _roots()]:
            return False
        for parent, mtime in cached.get('parents', {}).items():
            try:
                if os.stat(parent).st_mtime != mtime:
                    return False
            except OSError:
                return False
        return True

    def load(self, force_rebuild: bool = False) -> Dict[str, dict]:
        with self._lock:
            if self._index is not None and not force_rebuild:
                return self._index
            if not force_rebuild and INDEX_PATH.exists():
                try:
                    cached = json.loads(INDEX_PATH.read_text(encoding='utf-8'))
                    if self._cache_is_fresh(cached):
                        self._index, self._parents = cached['index'], cached['parents']
                        return self._index
                except Exception as e:
                    logger.warning(f'Ignoring unreadable local document index cache: {e}')
            logger.info(f'Scanning local document folders under {[str(r) for r in _roots()]} ...')
            self._index, self._parents = self._scan()
            try:
                INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
                tmp = INDEX_PATH.with_suffix('.tmp')
                tmp.write_text(json.dumps({'version': INDEX_VERSION, 'roots': [str(r) for r in _roots()],
                                           'parents': self._parents, 'index': self._index}), encoding='utf-8')
                tmp.replace(INDEX_PATH)
            except Exception as e:
                logger.warning(f'Could not write local document index cache: {e}')
            logger.info(f'Indexed {len(self._index):,} local proposal folders.')
            return self._index

    # ---- lookups ----------------------------------------------------------------------------

    def entry(self, *names: str) -> Optional[dict]:
        """Index entry for the first of the given file numbers / folder names that has local PDFs."""
        index = self.load()
        for n in names:
            e = index.get(doc_key(n)) if n else None
            if e:
                return e
        return None

    def kinds(self, *names: str) -> Dict[str, str]:
        """{'proceeding'|'drawing'|'inspection'|'other': pdf filename} available locally for a proposal."""
        e = self.entry(*names)
        out: Dict[str, str] = {}
        if e:
            for f in sorted(e['docs']):
                out.setdefault(doc_kind(f), f)
        return out

    def entries_under(self, *path_parts: str) -> List[dict]:
        """Index entries with a copy in a directory whose path contains any of the given substrings."""
        parts = [p.lower() for p in path_parts]
        out = []
        for e in self.load().values():
            dirs = {os.path.dirname(p).lower() for p in e['docs'].values()}
            if any(part in d for d in dirs for part in parts):
                out.append(e)
        return out

    def find(self, folder: str, filename: str) -> Optional[Path]:
        """Local path of a document: exact filename first, then any PDF of the same kind."""
        e = self.entry(folder)
        if not e:
            return None
        name = Path(filename or '').name
        candidates = [name] if name in e['docs'] else []
        candidates += [f for f in e['docs'] if f.lower() == name.lower()]
        kind = doc_kind(name)
        candidates += sorted(f for f in e['docs'] if doc_kind(f) == kind)
        for f in candidates:
            p = Path(e['docs'][f])
            if p.is_file():
                return p
        return None


_META_KEYS = {
    'file_number': ('file no. / temporary no.', 'file no. _ temporary no', 'file_no', 'file no'),
    'applicant_name': ('name of applicant', 'applicant_name', 'applicant name', 'name'),
    'architect_name': ('architect/le/se name', 'architect_le_se_name', 'architect_se name', 'architect'),
    'case_type': ('case type', 'case_type'),
    'project_type': ('project type', 'project_type'),
    'village': ('village_synos', 'village', 'village/synos'),
    'extent': ('extent',),
    'designation': ('designation',),
}


def folder_texts(*dirs: str) -> Dict[str, str]:
    """{lowercase label: value} from a proposal folder's .txt files: Row_Data.txt 'Label:\\nvalue'
    blocks and one-value files like 'Applicant Name.txt' / 'File_no.txt'. Values are entity-decoded."""
    found: Dict[str, str] = {}
    for d in dirs:
        try:
            txts = [f for f in os.listdir(d) if f.lower().endswith('.txt') and 'not_available' not in f.lower()]
        except OSError:
            continue
        for t in txts:
            try:
                text = Path(d, t).read_text(encoding='utf-8', errors='ignore').strip()
            except OSError:
                continue
            if t.lower() == 'row_data.txt':
                for label, value in re.findall(r'^([^\n:]+):\s*\n([^\n]*)', text, flags=re.M):
                    found.setdefault(label.strip().lower(), value.strip())
            else:
                found.setdefault(Path(t).stem.strip().lower(), text.splitlines()[0].strip() if text else '')
    return {k: clean_text(v) for k, v in found.items()}


def folder_metadata(entry: dict) -> Dict[str, str]:
    """Record fields from the .txt details next to a proposal's PDFs; file_number falls back to the folder name."""
    found = folder_texts(*sorted({os.path.dirname(p) for p in entry['docs'].values()}))
    meta = {}
    for field, labels in _META_KEYS.items():
        meta[field] = next((found[l] for l in labels if found.get(l) and found[l] != 'NOT_AVAILABLE'), '')
    if not meta['file_number'] or doc_key(meta['file_number']) != doc_key(entry['folder']):
        meta['file_number'] = clean_text(entry['folder']).replace('_', '/')
    return meta


local_documents = LocalDocumentIndex()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    idx = local_documents.load(force_rebuild=True)
    total = sum(len(v['docs']) for v in idx.values())
    print(f'{len(idx):,} proposal folders, {total:,} PDFs -> {INDEX_PATH}')
