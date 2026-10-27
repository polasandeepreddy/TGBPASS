import urllib.request
import json

res = urllib.request.urlopen('http://127.0.0.1:8000/api/oc-bp/proposals?page=1&page_size=10')
data = json.loads(res.read())

print("Total records:", data['data']['total_records'])
for i, r in enumerate(data['data']['records']):
    print(f"[{i}] row={r.get('row_number')} | file='{r.get('file_number')}' | applicant='{r.get('applicant_name')}' | folder='{r.get('folder_name')}'")
