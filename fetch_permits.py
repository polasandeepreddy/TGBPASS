"""Reads 'Permit Number.txt' from Drive for scraped folders that lack a permit number.

Writes cache/permits.json  {drive_folder_id: permit_number}  (resumable; re-run to continue).
Needs a valid token.json (see reauth_drive.py).
"""
import io
import json
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from drive_manager import drive_manager

SITE = Path(__file__).resolve().parent
OUT = SITE / 'cache' / 'permits.json'
creds = drive_manager.creds
permits = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
progress = json.loads((SITE / 'cache' / 'progress.json').read_text(encoding='utf-8', errors='ignore'))

# folder ids we care about
wanted = {}
for key, p in progress.items():
    m = re.search(r'/folders/([a-zA-Z0-9_-]+)', p.get('drive_folder_url') or '')
    if m:
        wanted[m.group(1)] = key
todo_folders = {f for f in wanted if f not in permits}
print(f'{len(wanted)} folders, {len(todo_folders)} still to read')

svc = build('drive', 'v3', credentials=creds, cache_discovery=False)
files, tok = {}, None  # folder_id -> txt file id
while True:
    r = svc.files().list(q="name='Permit Number.txt' and trashed=false", pageSize=1000, pageToken=tok,
                         fields='nextPageToken, files(id,parents)', corpora='allDrives',
                         includeItemsFromAllDrives=True, supportsAllDrives=True).execute()
    for f in r['files']:
        for par in f.get('parents', []):
            if par in todo_folders:
                files[par] = f['id']
    tok = r.get('nextPageToken')
    print(f'listed… matched {len(files)}', end='\r')
    if not tok:
        break
print(f'\n{len(files)} permit files to download')

local = threading.local()
lock = threading.Lock()
done = 0


def fetch(item):
    global done
    folder, fid = item
    if not hasattr(local, 'svc'):
        local.svc = build('drive', 'v3', credentials=creds, cache_discovery=False)
    try:
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, local.svc.files().get_media(fileId=fid, supportsAllDrives=True))
        while not dl.next_chunk()[1]:
            pass
        text = buf.getvalue().decode('utf-8', errors='ignore').strip().splitlines()
        val = text[0].strip() if text else ''
    except Exception:
        return
    with lock:
        permits[folder] = val
        done += 1
        if done % 500 == 0:
            OUT.write_text(json.dumps(permits), encoding='utf-8')
            print(f'downloaded {done}/{len(files)}', flush=True)


with ThreadPoolExecutor(12) as ex:
    list(ex.map(fetch, files.items()))
OUT.write_text(json.dumps(permits), encoding='utf-8')
print('finished', len(permits))
