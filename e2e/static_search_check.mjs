// Runs the browser's static search (frontend/src/services/staticSearch.js) under Node against
// exported JSON shards, so the e2e suite exercises the exact code the public site runs.
//
// Usage: node static_search_check.mjs <data_dir>   (stdin: JSON [{dataset, file_number}, ...])
// Prints JSON: {stats, missing: [{dataset, file_number, got}]}
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.argv[2]);

globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*\/data\//, '');
  try {
    const body = await readFile(path.join(dataDir, rel), 'utf8');
    return { ok: true, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, json: async () => ({}) };
  }
};

const { staticPublicSearch, staticStats } = await import(
  pathToFileURL(path.join(here, '..', 'frontend', 'src', 'services', 'staticSearch.js')).href
);

let input = '';
for await (const chunk of process.stdin) input += chunk;
const samples = JSON.parse(input);

const missing = [];
const badUrls = [];
for (const { dataset, file_number, folder, files } of samples) {
  const res = await staticPublicSearch({ search: file_number, dataset: 'all', page_size: 200 });
  const hit = res.records.some((r) => r.file_number === file_number && r.source_dataset === dataset);
  if (!hit) missing.push({ dataset, file_number, got: res.records.slice(0, 3).map((r) => r.file_number) });
  // Every document of this record must link to the backend's local-archive route.
  for (const name of files) {
    const f = res.files.find((x) => x.reference_no === file_number && x.doc_name === name);
    const expected = `/api/document/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
    if (!f || f.view_url !== expected || !f.download_url.startsWith(expected)) {
      badUrls.push([file_number, name, f ? f.view_url : 'missing']);
    }
  }
}

process.stdout.write(JSON.stringify({ stats: await staticStats(), missing, bad_urls: badUrls }));
