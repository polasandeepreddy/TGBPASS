"""Lists Drive PDFs and stores their created time -> cache/dates.json {file_id: 'YYYY-MM-DD HH:MM:SS'}."""
import json, re
from pathlib import Path
from googleapiclient.discovery import build
from drive_manager import drive_manager

SITE = Path(__file__).resolve().parent
progress = json.loads((SITE / 'cache' / 'progress.json').read_text(encoding='utf-8', errors='ignore'))
wanted = set()
for p in progress.values():
    for k in ('proceeding_letter_link', 'drawing_link'):
        m = re.search(r'/d/([a-zA-Z0-9_-]+)', p.get(k) or '')
        if m: wanted.add(m.group(1))
svc = build('drive', 'v3', credentials=drive_manager.creds, cache_discovery=False)
dates, tok, n = {}, None, 0
while True:
    r = svc.files().list(q="mimeType='application/pdf' and trashed=false", pageSize=1000, pageToken=tok,
                         fields='nextPageToken, files(id,createdTime)', corpora='allDrives',
                         includeItemsFromAllDrives=True, supportsAllDrives=True).execute()
    for f in r['files']:
        n += 1
        if f['id'] in wanted:
            dates[f['id']] = f['createdTime'][:19].replace('T', ' ')
    tok = r.get('nextPageToken')
    print(f'scanned {n}, matched {len(dates)}/{len(wanted)}', end='\r')
    if not tok: break
(SITE / 'cache' / 'dates.json').write_text(json.dumps(dates), encoding='utf-8')
print(f'\nsaved {len(dates)}')
