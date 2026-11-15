"""Exports searchable records to static JSON so the site works without the Flask backend.

Output: frontend/public/data/{tgbpass,oc_bp,hmda}.json  (compact arrays of every loaded record; files may be empty)
Run:    python export_static_data.py
"""
import json
import sys
from pathlib import Path

SITE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SITE_DIR))

from data_provider import data_provider  # noqa: E402

OUT = SITE_DIR / 'frontend' / 'public' / 'data'
OUT.mkdir(parents=True, exist_ok=True)

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
        # Records without downloaded documents are still exported (files == []) so every proposal is searchable.
        files = data_provider.extract_record_files(norm, '')
        seen.add(key)
        rec = {k: norm[k] for k in KEEP if norm.get(k)}
        rec['row_number'] = norm['row_number']
        # Documents are served from the local disks by the backend: /api/document/<folder_name>/<n>
        rec['files'] = [{'t': f['doc_type'], 'n': f['doc_name'], 'd': f['date']} for f in files]
        out.append(rec)
    for old in OUT.glob(f'{name}-*.json'):
        old.unlink()
    shards = [out[i:i + SHARD_SIZE] for i in range(0, len(out), SHARD_SIZE)] or [[]]
    for n, shard in enumerate(shards):
        (OUT / f'{name}-{n}.json').write_text(json.dumps(shard, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    manifest[name] = {'shards': len(shards), 'records': len(out)}
    print(f'{name}: {len(out):,} records in {len(shards)} shard(s)')

(OUT / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
