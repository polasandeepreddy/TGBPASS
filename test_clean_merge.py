import pandas as pd
from pathlib import Path

from config import CACHE_DIR

csvs = [
    CACHE_DIR / "All-for-OC_s-_-BP_s.csv",
    CACHE_DIR / "HMDA_LO_Data.csv"
]
dfs = []
for c in csvs:
    df = pd.read_csv(c, dtype=str).fillna('')
    print(c.name, 'rows:', len(df))
    for col in df.columns:
        if col.strip().lower() in ('file_no_temporary_no', 'file_no', 'fileno', 'proposal_number', 'file_number'):
            df['file_number'] = df[col]
            break
    df = df[df['file_number'].str.strip() != '']
    df = df[~df['file_number'].str.strip().str.lower().isin(['not available', 'nan', 'none', 'null'])]
    dfs.append(df)

merged = pd.concat(dfs, ignore_index=True).drop_duplicates(subset=['file_number'], keep='first')
print('Clean merged count:', len(merged))
print('Row 0:', merged.iloc[0]['file_number'])
print('Any blank file numbers?', (merged['file_number'].str.strip() == '').any())
