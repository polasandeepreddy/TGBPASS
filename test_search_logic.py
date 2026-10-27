import time
from data_provider import data_provider

print("--- Testing get_public_search ---")
queries = ['12345', 'ABC123', 'BP-2024-00125', 'abc123', 'ABC', 'XYZ_NON_EXISTENT_99999']

for q in queries:
    t0 = time.time()
    res = data_provider.get_public_search(search=q, dataset='all', page=1, page_size=10)
    dur = time.time() - t0
    print(f"\nQuery '{q}' took {dur:.3f}s:")
    print(f"  total_files: {res['total_files']}, total_records: {res['total_records']}, counts: {res['counts']}")
    if res['files']:
        print("  Sample files:")
        for f in res['files'][:3]:
            print(f"    - [{f['doc_type']}] Ref: {f['reference_no']} | File: {f['doc_name']} | Status: {f['status']} | Snippet: {f['snippet'][:60]}")
