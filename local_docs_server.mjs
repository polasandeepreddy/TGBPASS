// Read-only static PDF server (no Flask). Serves GET /api/document/<folder>/<file>[?download=1]
// straight from the local disks using cache/local_doc_index.json (built by local_documents.py).
// Usage: node local_docs_server.mjs [port=8000]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 8000);
const { index } = JSON.parse(fs.readFileSync(path.join(here, 'cache', 'local_doc_index.json'), 'utf8'));

const key = (s) => String(s).replace(/&#160;|&nbsp;/g, ' ').toLowerCase().replace(/[^a-z0-9]/g, '');
const kind = (f) => { const n = f.toLowerCase(); return n.includes('inspection') ? 'i' : n.includes('proceeding') ? 'p' : (n.includes('drawing') || n.includes('plan')) ? 'd' : 'o'; };

function find(folder, name) {
  const e = index[key(folder)];
  if (!e) return null;
  const base = path.basename(name || '');
  const docs = Object.keys(e.docs);
  const cands = [...docs.filter((f) => f === base), ...docs.filter((f) => f.toLowerCase() === base.toLowerCase()),
    ...docs.filter((f) => kind(f) === kind(base)).sort()];
  for (const f of cands) { try { if (fs.statSync(e.docs[f]).isFile()) return e.docs[f]; } catch { /* next */ } }
  return null;
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/api\/document\/([^/]+)\/(.+)$/);
  if (req.method !== 'GET' || !m) return json(res, 404, { success: false, error: 'Only /api/document/<folder>/<file> is served (no backend).' });
  const file = find(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
  if (!file) return json(res, 404, { success: false, error: `Document not found in storage: ${path.basename(decodeURIComponent(m[2]))}` });
  const size = fs.statSync(file).size;
  const disp = u.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const head = { 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*',
    'Content-Disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(path.basename(file))}` };
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (r && (r[1] || r[2])) {
    const start = r[1] ? Number(r[1]) : Math.max(0, size - Number(r[2]));
    const end = r[1] && r[2] ? Math.min(Number(r[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`PDF server (no backend) on http://127.0.0.1:${port}`));
