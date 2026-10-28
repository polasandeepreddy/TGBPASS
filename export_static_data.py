"""Exports searchable records to static JSON so the site works without the Flask backend.

Output: frontend/public/data/{tgbpass,oc_bp,hmda}.json  (compact arrays of records that have documents)
Run:    python export_static_data.py
"""
import json
import re
import sys
from pathlib import Path

SITE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SITE_DIR))

from data_provider import data_provider  # noqa: E402

OUT = SITE_DIR / 'frontend' / 'public' / 'data'
OUT.mkdir(parents=True, exist_ok=True)

progress = json.loads((SITE_DIR / 'cache' / 'progress.json').read_text(encoding='utf-8', errors='ignore'))


def drive_id(link):
    m = re.search(r'/d/([a-zA-Z0-9_-]+)', link or '')
    return m.group(1) if m else ''


def links_for(rec):
    """Finds Drive ids (proceeding file, drawing file, folder) from progress.json, keyed by file number (optionally -BP/-OC)."""
    fn = rec['file_number']
    p = progress.get(fn) or progress.get(fn + '-BP') or progress.get(fn + '-OC')
    if not p:
        return '', '', ''
    folder = re.search(r'/folders/([a-zA-Z0-9_-]+)', p.get('drive_folder_url') or '')
    return drive_id(p.get('proceeding_letter_link')), drive_id(p.get('drawing_link')), folder.group(1) if folder else ''


KEEP = ['file_number', 'permit_number', 'applicant_name', 'architect_name', 'officer_name', 'designation',
        'site_inspection_on', 'project_type', 'case_type', 'village', 'folder_name', 'processing_status',
        'meta_authority', 'meta_year', 'meta_type', 'source_label', 'source_badge_color']

datasets = [
    ('tgbpass', data_provider.load_csv_data, data_provider.normalize_tg_row),
    ('oc_bp', data_provider.load_oc_bp_data, data_provider.normalize_oc_row),
    ('hmda', data_provider.load_hmda_layout_data, data_provider.normalize_hmda_row),
]

SHARD_SIZE = 10000  # keeps every file well under Cloudflare's 25 MiB asset limit
manifest = {}

for name, loader, normalizer in datasets:
    df = loader()
    out, seen = [], set()
    for idx, r in enumerate(df.to_dict('records')):
        norm = normalizer(r, idx)
        key = norm['file_number']
        if key in seen:
            continue
        files = data_provider.extract_record_files(norm, '')
        if not files:
            continue
        seen.add(key)
        proc_id, draw_id, folder_id = links_for(norm)
        rec = {k: norm[k] for k in KEEP if norm.get(k)}
        rec['row_number'] = norm['row_number']
        rec['files'] = [
            {'t': f['doc_type'], 'n': f['doc_name'], 'd': f['date'],
             'id': proc_id if ('Proceeding' in f['doc_type']) else (draw_id if ('Plan' in f['doc_type'] or 'Drawing' in f['doc_type']) else '')}
            for f in files
        ]
        if proc_id and not any('Proceeding' in f['t'] for f in rec['files']):
            rec['files'].insert(0, {'t': 'Proceeding Order', 'n': 'Proceeding.pdf', 'd': norm.get('site_inspection_on', ''), 'id': proc_id})
        if folder_id:
            rec['fu'] = folder_id
        out.append(rec)
    for old in OUT.glob(f'{name}-*.json'):
        old.unlink()
    shards = [out[i:i + SHARD_SIZE] for i in range(0, len(out), SHARD_SIZE)] or [[]]
    for n, shard in enumerate(shards):
        (OUT / f'{name}-{n}.json').write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    manifest[name] = {'shards': len(shards), 'records': len(out)}
    print(f'{name}: {len(out):,} records in {len(shards)} shard(s)')

(OUT / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
