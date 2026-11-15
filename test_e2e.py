"""End-to-end check that every proposal on the local data disks is collected and searchable,
with no Google Drive involvement.

Covers the full chain:
  local disks (D:\\TGBPASS DATA, D:\\GHMC): source CSVs + one folder of PDFs per proposal
    -> local document index (local_documents.py)
    -> DataProvider loaders (TG-bPASS, DPMS OC & BP, HMDA layouts)
    -> static JSON export (frontend/public/data, copied to data/ and frontend/dist/data)
    -> Flask /api/public-search and /api/document (PDFs streamed from local disk) over real HTTP
    -> the browser's static search (staticSearch.js, run under Node)

Run:  python -m unittest test_e2e -v
      (after source data changes: python export_static_data.py && npm run build)
"""
import json
import logging
import random
import re
import shutil
import subprocess
import sys
import threading
import unittest
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

SITE_DIR = Path(__file__).resolve().parent
EXPORT_DIR = SITE_DIR / 'frontend' / 'public' / 'data'
DEPLOY_DIRS = [SITE_DIR / 'data', SITE_DIR / 'frontend' / 'dist' / 'data']
DATASETS = ['tgbpass', 'oc_bp', 'hmda']
SAMPLES_PER_DATASET = 25

logging.disable(logging.WARNING)

import config  # noqa: E402
from data_provider import data_provider  # noqa: E402
from local_documents import local_documents, doc_key, doc_kind  # noqa: E402

FN_ALIASES = ('file_no_temporary_no', 'file_no', 'fileno', 'proposal_number', 'file_number')
JUNK_FNS = {'', 'not available', 'nan', 'none', 'null', 'file_no'}


def _col(df, aliases):
    lookup = {doc_key(c): c for c in df.columns}
    return next((lookup[doc_key(a)] for a in aliases if doc_key(a) in lookup), None)


def _csv_file_numbers(paths, skip=None):
    """{file number} across the given CSVs (optionally skipping file numbers matching `skip`)."""
    out = set()
    for p in paths:
        if not (p and p.exists() and p.is_file()):
            continue
        df = pd.read_csv(p, dtype=str, keep_default_na=False).fillna('')
        fn = _col(df, FN_ALIASES)
        if fn is None:
            continue
        out |= {f.strip() for f in df[fn] if f.strip().lower() not in JUNK_FNS and not (skip and re.search(skip, f, re.I))}
    return out


def _load_export(directory):
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
    out = {}
    for name in DATASETS:
        recs = []
        for i in range(manifest[name]['shards']):
            recs += json.loads((directory / f'{name}-{i}.json').read_text(encoding='utf-8'))
        out[name] = recs
    return manifest, out


class RecordCollectionE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = local_documents.load()
        cls.tg = data_provider.load_csv_data(force_reload=True)
        cls.oc = data_provider.load_oc_bp_data(force_reload=True)
        cls.hmda = data_provider.load_hmda_layout_data(force_reload=True)
        cls.drive_loaded_by_loaders = 'drive_manager' in sys.modules
        cls.loaded = {
            'tgbpass': set(cls.tg['file_number']),
            'oc_bp': set(cls.oc['file_number']),
            'hmda': set(cls.hmda['file_number']),
        }
        cls.manifest, cls.exported = _load_export(EXPORT_DIR)
        cls.exported_fns = {n: {r['file_number'] for r in recs} for n, recs in cls.exported.items()}

        rng = random.Random(42)
        cls.samples = []
        for name in DATASETS:
            recs = cls.exported[name]
            # first/last of every shard boundary plus a random spread, plus some without documents
            picks = {0, len(recs) - 1, *range(0, len(recs), 10000), *range(9999, len(recs), 10000)}
            picks |= set(rng.sample(range(len(recs)), min(SAMPLES_PER_DATASET, len(recs))))
            no_docs = [i for i, r in enumerate(recs) if not r['files']]
            picks |= set(rng.sample(no_docs, min(10, len(no_docs))))
            cls.samples += [{'dataset': name, 'file_number': recs[i]['file_number'],
                             'folder': recs[i].get('folder_name', ''), 'files': [f['n'] for f in recs[i]['files']]}
                            for i in sorted(picks)]

    def assertNoneMissing(self, missing, what):
        missing = sorted(missing)
        if missing:
            self.fail(f'{len(missing):,} {what}, e.g. {missing[:10]}')

    # ---- 0. local only -----------------------------------------------------------------------

    def test_no_google_drive_used(self):
        self.assertFalse(self.drive_loaded_by_loaders, 'loading the datasets imported drive_manager (Google Drive)')
        for name, recs in self.exported.items():
            self.assertFalse([r for r in recs if 'fu' in r or any('id' in f for f in r['files'])][:1],
                             f'{name} export still carries Google Drive ids')
        js = (SITE_DIR / 'frontend' / 'src' / 'services' / 'staticSearch.js').read_text(encoding='utf-8')
        self.assertNotIn('drive.google', js)

    # ---- 1. local disks -> loaders -----------------------------------------------------------

    def test_every_local_proposal_folder_collected(self):
        """Every proposal folder with PDFs on the local disks is in exactly one dataset, with all its documents."""
        by_key = {}
        for name, recs in self.exported.items():
            for r in recs:
                for k in {doc_key(r['file_number']), doc_key(r.get('folder_name', ''))} - {''}:
                    by_key.setdefault(k, []).append((name, r))
        missing, docs_missing = [], []
        for key, entry in self.index.items():
            hits = by_key.get(key)
            if not hits:
                missing.append(entry['folder'])
                continue
            local_kinds = {doc_kind(f) for f in entry['docs']} - {'other'}
            listed = {doc_kind(f['n']) for _, r in hits for f in r['files']}
            if local_kinds - listed:
                docs_missing.append((entry['folder'], sorted(local_kinds - listed)))
        self.assertNoneMissing(missing, f'of {len(self.index):,} local proposal folders are not collected')
        self.assertNoneMissing(docs_missing, 'local folders whose PDFs are not listed on their record')

    def test_every_hmda_layout_folder_listed(self):
        """Every layout folder next to an HMDA_LO_Data.csv (e.g. D:\\GHMC\\layout\\HMDA_LO_DATA) is listed,
        with or without PDFs. Only scraper placeholders (no file number and no real applicant) are skipped."""
        from local_documents import folder_texts
        keys = {doc_key(k) for r in self.exported['hmda'] for k in (r['file_number'], r.get('folder_name', ''))}
        layout_dirs = {p.parent for p in config.HMDA_CSV_PATHS
                       if p.is_file() and 'lo_data' in p.name.lower() and p.parent != config.CACHE_DIR}
        self.assertTrue(layout_dirs, 'no HMDA layout data folders found')
        missing = []
        for layout_dir in layout_dirs:
            for d in layout_dir.iterdir():
                if not d.is_dir():
                    continue
                t = folder_texts(str(d))
                if doc_key(d.name) in keys or doc_key(t.get('file_no', '')) in keys:
                    continue
                fn, name = t.get('file_no', ''), t.get('name', '')
                looks_real = (re.search(r'\d+.*[/-].*[/-]', fn) is not None) or (' ' in name and name.upper() != 'NA')
                if looks_real:
                    missing.append(str(d))
        self.assertNoneMissing(missing, 'HMDA layout folders not listed')

    def test_listed_documents_exist_on_local_disk(self):
        bad = []
        for name, recs in self.exported.items():
            for r in recs:
                entry = self.index.get(doc_key(r.get('folder_name', '')))
                for f in r['files']:
                    if not entry or f['n'] not in entry['docs']:
                        bad.append((name, r['file_number'], f['n']))
        self.assertNoneMissing(bad, 'listed documents with no local PDF')

    def test_tg_csv_proposals_all_loaded(self):
        expected = _csv_file_numbers(config.CSV_PATHS)
        self.assertTrue(expected, 'no TG-bPASS CSVs found')
        self.assertNoneMissing(expected - self.loaded['tgbpass'], 'TG-bPASS proposals from the CSVs not loaded')
        self.assertEqual(len(self.tg), self.tg['file_number'].nunique(), 'duplicate TG-bPASS rows')

    def test_oc_bp_csv_proposals_with_local_documents_loaded(self):
        csv_fns = _csv_file_numbers(config.OC_BP_CSV_PATHS, skip=r'HMDA|/LO/|-LO')
        expected = {f for f in csv_fns if local_documents.entry(f)}
        self.assertNoneMissing(expected - self.loaded['oc_bp'], 'OC/BP proposals with local PDFs not loaded')

    def test_hmda_csv_layouts_with_local_documents_loaded(self):
        csv_fns = _csv_file_numbers(config.HMDA_CSV_PATHS)
        expected = {f for f in csv_fns if local_documents.entry(f) and 'downloaded_proposals' not in
                    str(next(iter(local_documents.entry(f)['docs'].values()))).lower()}
        # The same layout number is spelled several ways across rows ('008461-SKP-LT-...' / '008461/SKP/LT/...',
        # 'PLG.' / 'PLG'), so compare normalised numbers and folder names.
        loaded_keys = {doc_key(v) for df in (self.hmda, self.tg) for col in ('file_number', 'folder_name')
                       if col in df.columns for v in df[col]}
        self.assertNoneMissing({f for f in expected if doc_key(f) not in loaded_keys
                                and doc_key(local_documents.entry(f)['folder']) not in loaded_keys},
                               'HMDA layouts with local PDFs not loaded')

    def test_no_record_in_two_datasets(self):
        self.assertEqual(self.loaded['tgbpass'] & self.loaded['oc_bp'], set(), 'OC/BP records leaked into TG-bPASS')
        self.assertEqual(self.loaded['oc_bp'] & self.loaded['hmda'], set(), 'HMDA records leaked into OC/BP')
        # One genuine cross-listing exists (an HMDA LO file in the public search CSV).
        self.assertLessEqual(len(self.loaded['tgbpass'] & self.loaded['hmda']), 5, 'HMDA records leaked into TG-bPASS')

    # ---- 2. loaders -> static export -> deployed copies --------------------------------------

    def test_export_contains_every_loaded_record(self):
        for name in DATASETS:
            with self.subTest(dataset=name):
                self.assertEqual(self.manifest[name]['records'], len(self.exported[name]))
                self.assertEqual(len(self.exported_fns[name]), len(self.exported[name]), 'duplicate rows in export')
                self.assertNoneMissing(self.loaded[name] - self.exported_fns[name], f'{name} records missing from static export')
                self.assertNoneMissing(self.exported_fns[name] - self.loaded[name], f'{name} records exported but not loaded')

    def test_deployed_data_matches_export(self):
        for d in DEPLOY_DIRS:
            if not d.exists():
                continue
            with self.subTest(deploy_dir=str(d.relative_to(SITE_DIR))):
                deployed = json.loads((d / 'manifest.json').read_text(encoding='utf-8'))
                self.assertEqual(deployed, self.manifest, 'stale deployed data: run `npm run build` after exporting')
                for name in DATASETS:
                    self.assertEqual((d / f'{name}-0.json').read_bytes(), (EXPORT_DIR / f'{name}-0.json').read_bytes(),
                                     f'stale {name} shard in {d}')
                stale = [f.name for f in d.glob('*.json') if f.name != 'manifest.json'
                         and int(f.stem.rsplit('-', 1)[1]) >= deployed.get(f.stem.rsplit('-', 1)[0], {}).get('shards', 0)]
                self.assertEqual(stale, [], 'orphaned shard files left in deploy dir')

    # ---- 3. backend over real HTTP ------------------------------------------------------------

    def test_backend_search_and_local_documents(self):
        from werkzeug.serving import make_server
        from app import app

        server = make_server('127.0.0.1', 0, app, threaded=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            missing, bad_docs = [], []
            for s in self.samples:
                url = f"{base}/api/public-search?{urllib.parse.urlencode({'search': s['file_number'], 'page_size': 200})}"
                with urllib.request.urlopen(url, timeout=120) as resp:
                    body = json.load(resp)
                self.assertTrue(body.get('success'), body)
                if s['file_number'] not in {r.get('file_number') for r in body['data']['records']}:
                    missing.append((s['dataset'], s['file_number']))
                for name in s['files']:
                    doc_url = f"{base}/api/document/{urllib.parse.quote(s['folder'], safe='')}/{urllib.parse.quote(name, safe='')}"
                    try:
                        with urllib.request.urlopen(doc_url, timeout=60) as resp:
                            head = resp.read(5)
                        if head != b'%PDF-':
                            bad_docs.append((s['file_number'], name, head))
                    except urllib.error.HTTPError as e:
                        bad_docs.append((s['file_number'], name, e.code))
            self.assertNoneMissing(missing, 'sampled records not found via /api/public-search')
            self.assertNoneMissing(bad_docs, 'sampled documents not served from local disk via /api/document')
            self.assertNotIn('drive_manager', sys.modules, 'the backend imported drive_manager (Google Drive)')
        finally:
            server.shutdown()

    # ---- 4. browser static search -------------------------------------------------------------

    @unittest.skipUnless(shutil.which('node'), 'node not installed')
    def test_browser_static_search_finds_samples(self):
        proc = subprocess.run(
            ['node', str(SITE_DIR / 'e2e' / 'static_search_check.mjs'), str(EXPORT_DIR)],
            input=json.dumps(self.samples), capture_output=True, text=True, encoding='utf-8', timeout=600,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        result = json.loads(proc.stdout)
        self.assertEqual(result['stats']['total_indexed'], sum(self.manifest[n]['records'] for n in DATASETS))
        self.assertNoneMissing([(m['dataset'], m['file_number']) for m in result['missing']],
                               'sampled records not found via in-browser static search')
        self.assertNoneMissing(result['bad_urls'], 'document links not pointing at /api/document (local archive)')


if __name__ == '__main__':
    unittest.main(verbosity=2)
