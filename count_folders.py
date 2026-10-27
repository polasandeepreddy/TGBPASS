from pathlib import Path
from config import CACHE_DIR, DOCUMENTS_CACHE_DIR
from drive_manager import drive_manager

print("=== TG-bPASS Storage & Cache Status ===")
print("Cache Dir:", CACHE_DIR, "Exists:", CACHE_DIR.exists())
print("Docs Cache Dir:", DOCUMENTS_CACHE_DIR, "Exists:", DOCUMENTS_CACHE_DIR.exists())

if CACHE_DIR.exists():
    files = list(CACHE_DIR.glob('*.*'))
    for f in files:
        print(f"  - {f.name}: {f.stat().st_size:,} bytes")

print("\n=== Google Drive Cloud Status ===")
print("Connected:", drive_manager.is_connected())
if drive_manager.is_connected():
    prog = drive_manager.get_progress_data()
    print(f"Proposals in progress.json: {len(prog):,}")
    proc_count = sum(1 for v in prog.values() if v.get('proceeding_letter') or v.get('proceeding_letter_link'))
    draw_count = sum(1 for v in prog.values() if v.get('drawing') or v.get('drawing_link'))
    print(f"Downloaded Proceedings in Drive: {proc_count:,}")
    print(f"Downloaded Drawings in Drive: {draw_count:,}")

