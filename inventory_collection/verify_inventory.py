"""Verify every record of the master inventory (CSV + JSON) against local disk.
Read-only on the source; writes reports into --out. Usage: python -I verify_inventory.py [--out DIR]"""
import csv, json, os, sys, gzip, time, collections, argparse
csv.field_size_limit(1<<30)
D = r'D:\TGBPASS DATA\json and csv fils for all'
CSV = os.path.join(D, 'Complete_Inventory.csv'); JS = os.path.join(D, 'Complete_Inventory.json')
ap = argparse.ArgumentParser(); ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'report')); a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

def json_records(path):
    buf = []
    with open(path, encoding='utf-8-sig') as f:
        for line in f:
            s = line.rstrip('\r\n')
            if s == ' {': buf = [s]
            elif s in (' },', ' }'):
                buf.append(' }'); yield json.loads('\n'.join(buf)); buf = []
            elif buf: buf.append(s)
        if buf: raise RuntimeError('truncated JSON tail')

PFX = chr(92)*2 + '?' + chr(92)
def full(p):
    p = os.path.normpath(p)
    return PFX + p if len(p) > 240 and not p.startswith(PFX) else p

def norm(v):
    if v is None: return ''
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15: pass
    s = str(v)
    try: return repr(float(s)) if s != '' else ''
    except ValueError: return s

st = collections.Counter(); per_root = collections.defaultdict(collections.Counter)
mism_examples = []; size_examples = []; t = time.time()
miss = csv.writer(open(os.path.join(a.out, 'missing_items.csv'), 'w', newline='', encoding='utf-8'))
miss.writerow(['row', 'Record_Type', 'Root_Path', 'Path', 'Reason', 'Expected_Size', 'Actual_Size'])
man = gzip.open(os.path.join(a.out, 'processed_manifest.csv.gz'), 'wt', newline='', encoding='utf-8')
mw = csv.writer(man); mw.writerow(['row', 'Record_Type', 'Root_Path', 'Path', 'Disk_Status', 'Expected_Size', 'Actual_Size', 'CSV_JSON_Match'])
seen = set(); jit = json_records(JS)
with open(CSV, newline='', encoding='utf-8-sig') as f:
    for n, row in enumerate(csv.DictReader(f), 1):
        try: j = next(jit)
        except StopIteration: j = None
        if j is None: match = 'NO_JSON_RECORD'
        else:
            bad = [k for k in row if norm(row[k]) != norm(j.get(k))]
            match = 'OK' if not bad else 'DIFF:' + ','.join(bad)
        rt = row['Record_Type']; root = row['Root_Path']
        p = row['Folder_Path'] if rt == 'FOLDER' else os.path.join(row['Folder_Path'], row['File_Name'])
        key = (rt, p)
        if key in seen: st['duplicate_paths'] += 1
        seen.add(key)
        exp = row['File_Size_Bytes'] if rt == 'FILE' else ''
        act = ''; status = 'OK'
        try:
            s = os.stat(full(p))
            import stat as _s
            isdir = _s.S_ISDIR(s.st_mode)
            if (rt == 'FOLDER') != isdir: status = 'TYPE_MISMATCH'
            elif rt == 'FILE':
                act = s.st_size
                if exp != '' and int(float(exp)) != act: status = 'SIZE_MISMATCH'
        except (FileNotFoundError, NotADirectoryError): status = 'MISSING'
        except OSError as e: status = 'ERROR:' + type(e).__name__
        st[rt + '_' + status] += 1; per_root[root][rt + '_' + status] += 1
        if match != 'OK':
            st['csv_json_' + ('nojson' if j is None else 'diff')] += 1
            if len(mism_examples) < 50: mism_examples.append((n, match, p))
        mw.writerow([n, rt, root, p, status, exp, act, match])
        if status != 'OK': miss.writerow([n, rt, root, p, status, exp, act])
        if n % 200000 == 0: print(n, round(time.time() - t), dict(st), flush=True)
extra_json = sum(1 for _ in jit); st['json_extra_records'] = extra_json; st['csv_rows'] = n
man.close()
summary = {'csv_rows': n, 'totals': dict(st), 'per_root': {k: dict(v) for k, v in per_root.items()}, 'csv_json_mismatch_examples': mism_examples, 'seconds': round(time.time() - t)}
json.dump(summary, open(os.path.join(a.out, 'summary.json'), 'w'), indent=1)
print(json.dumps(summary, indent=1))
