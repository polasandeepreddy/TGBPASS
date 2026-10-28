/**
 * Backend-free search: loads pre-exported JSON shards (public/data, built by export_static_data.py)
 * and runs the public search entirely in the browser. Mirrors DataProvider.get_public_search.
 */

const DATA_BASE = `${(import.meta.env && import.meta.env.BASE_URL) || '/'}data/`;
const DATASETS = ['tgbpass', 'oc_bp', 'hmda'];
const ARCHIVE_LABELS = {
  tgbpass: ['TG-bPASS Master Archive', 'sky'],
  oc_bp: ["DPMS OC's & BP's Archive", 'purple'],
  hmda: ['Masterplan HMDA Planning Layouts', 'emerald'],
};

const alnum = (s) => s.replace(/[^a-z0-9]/g, '');
const tokenize = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);

const driveViewUrl = (id) => `https://drive.google.com/file/d/${id}/preview`;
const driveDownloadUrl = (id) => `https://drive.google.com/uc?export=download&id=${id}`;

const driveFolderViewUrl = (id) => `https://drive.google.com/embeddedfolderview?id=${id}#list`;
const driveFolderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;

// "folder/doc name" -> { view, download } Drive URLs, filled as records load so api.getDocumentUrl can resolve links.
export const documentIds = new Map();
export const docKey = (folder, name) => `${folder}/${name}`;

let manifestPromise = null;
const datasetPromises = {};

const fetchJson = async (path) => {
  const res = await fetch(DATA_BASE + path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
};

const getManifest = () => (manifestPromise ||= fetchJson('manifest.json'));

const prepare = (name, rec) => {
  const fields = [rec.file_number, rec.permit_number, rec.applicant_name, rec.architect_name,
    rec.officer_name, rec.village, rec.folder_name];
  rec.source_dataset = name;
  rec._fn = (rec.file_number || '').toLowerCase();
  rec._pn = (rec.permit_number || '').toLowerCase();
  rec._fnA = alnum(rec._fn);
  rec._pnA = alnum(rec._pn);
  rec._text = fields.filter(Boolean).join(' ').toLowerCase();
  const [label, color] = ARCHIVE_LABELS[name];
  const isLayout = name === 'hmda' || /layout/i.test(rec.project_type || '');
  // Per-document status fields the records table expects
  const pick = (test) => rec.files.find((f) => test(f.t));
  const proc = pick((t) => /Proceeding/.test(t));
  const draw = pick((t) => /Plan|Drawing/.test(t));
  const insp = pick((t) => /Inspection/.test(t));
  const setDoc = (f, prefix) => {
    rec[`${prefix}_file`] = f ? f.n : '';
    rec[`${prefix}_status`] = f ? 'Downloaded' : 'Not Available';
  };
  setDoc(proc, 'proceeding_letter');
  setDoc(draw, 'drawing_pdf');
  setDoc(insp, 'inspection_report');
  rec.files = rec.files.map((f) => {
    // Prefer the exact Drive file; otherwise fall back to the record's Drive folder.
    const view = f.id ? driveViewUrl(f.id) : (rec.fu ? driveFolderViewUrl(rec.fu) : '');
    const download = f.id ? driveDownloadUrl(f.id) : (rec.fu ? driveFolderUrl(rec.fu) : '');
    if (view) documentIds.set(docKey(rec.folder_name, f.n), { view, download });
    const available = !!view;
    return {
      file_id: `${name}-${rec.file_number}-${f.n}`,
      doc_type: f.t,
      doc_name: f.n,
      date: f.d || '',
      reference_no: rec.file_number,
      permit_number: rec.permit_number || '',
      folder_name: rec.folder_name || '',
      applicant_name: rec.applicant_name || '',
      source_dataset: name,
      source_label: label,
      source_badge_color: color,
      status: available ? 'Available' : 'Offline',
      is_available: available,
      can_download: available,
      storage: 'Google Drive Cloud Storage',
      view_url: view,
      download_url: download,
      _layout: isLayout,
    };
  });
  return rec;
};

/** Loads (once) every shard of a dataset. */
const loadDataset = (name) => (datasetPromises[name] ||= (async () => {
  const { [name]: info } = await getManifest();
  const shards = await Promise.all(
    Array.from({ length: info.shards }, (_, i) => fetchJson(`${name}-${i}.json`))
  );
  return shards.flat().map((rec) => prepare(name, rec));
})().catch((err) => {
  delete datasetPromises[name];
  throw err;
}));

const isPlaceholder = (t) => {
  if (!t) return true;
  const s = t.trim().toLowerCase();
  if (!s || ['search', 'search by', 'search file', 'search file no', 'search file no, permit n', 'search by file'].includes(s)) return true;
  return s.startsWith('search') && ['file', 'permit', 'applicant', 'architect', 'folder', 'officer'].some((k) => s.includes(k));
};

const priorityOf = (r, q, qA) => {
  const { _fn: fn, _pn: pn, _fnA: fnA, _pnA: pnA } = r;
  if (fn === q || (pn && pn === q)) return 1;
  if (qA.length >= 4 && (fnA === qA || (pnA && pnA === qA))) return 1;
  const fnT = tokenize(fn);
  const pnT = tokenize(pn);
  if (fnT.includes(q) || pnT.includes(q) || (qA && (fnT.includes(qA) || pnT.includes(qA)))) return 2;
  if (fn.startsWith(q) || (pn && pn.startsWith(q)) || (qA && (fnA.startsWith(qA) || (pnA && pnA.startsWith(qA))))) return 3;
  if (fn.includes(q) || (pn && pn.includes(q)) || (qA.length >= 2 && (fnA.includes(qA) || (pnA && pnA.includes(qA))))) return 4;
  return 5;
};

const snippetOf = (r, q, qA) => {
  const has = (v) => v && v.toLowerCase().includes(q);
  if (r._fn === q || (qA.length >= 4 && r._fnA === qA)) return `Matched in File Number: ${r.file_number}`;
  if (r._pn === q || (r._pn && qA.length >= 4 && r._pnA === qA)) return `Matched in Permit Number: ${r.permit_number}`;
  if (r._fn.includes(q) || (qA.length >= 2 && r._fnA.includes(qA))) return `Matched in File Number: ${r.file_number}`;
  if (r._pn && (r._pn.includes(q) || (qA.length >= 2 && r._pnA.includes(qA)))) return `Matched in Permit Number: ${r.permit_number}`;
  if (has(r.applicant_name)) return `Matched in Applicant Name: ${r.applicant_name.slice(0, 40)}`;
  if (has(r.architect_name)) return `Matched in Architect: ${r.architect_name}`;
  if (has(r.officer_name)) return `Matched in Inspection Officer: ${r.officer_name}${r.designation ? ` (${r.designation})` : ''}`;
  if (has(r.village)) return `Matched in Location: ${r.village.slice(0, 40)}`;
  return `Related to Application: ${r.file_number}`;
};

const emptyResult = (query, page, pageSize) => ({
  query, page, page_size: pageSize, total_files: 0, total_records: 0, total_pages: 1,
  files: [], records: [],
  counts: { all: 0, tgbpass: 0, oc_bp: 0, hmda: 0, total_files: 0 },
});

const REPO_MODES = {
  tgbpass: ['tgbpass'], 'tg-bpass': ['tgbpass'], tg_bpass: ['tgbpass'],
  dpms: ['oc_bp'], oc_bp: ['oc_bp'], 'oc-bp': ['oc_bp'], oc: ['oc_bp'], bp: ['oc_bp'],
  hmda: ['hmda'], layout: ['hmda'], layouts: ['hmda'],
};

export async function staticPublicSearch({
  search = '', dataset = 'all', authority = '', year = '', project_type = '', status = '', page = 1, page_size = 25,
} = {}) {
  const query = String(search).trim().split(/\s+/).join(' ');
  const pageNo = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(page_size) || 25));
  if (!query || isPlaceholder(query)) return emptyResult(query, pageNo, size);

  const q = query.toLowerCase();
  const qA = alnum(q);
  const tokens = tokenize(q);
  const targets = REPO_MODES[String(dataset || 'all').toLowerCase().trim()] || DATASETS;
  const loaded = await Promise.all(targets.map(async (name) => [name, await loadDataset(name)]));

  // An exact full reference match isolates the results to that reference.
  const isExact = (r) => r._fn === q || r._pn === q || (qA.length >= 5 && (r._fnA === qA || r._pnA === qA));
  const hasExact = loaded.some(([, rows]) => rows.some(isExact));

  const matchesBroad = (r) => {
    if (tokens.length > 1) return tokens.every((t) => r._text.includes(t));
    const t = tokens[0] || q;
    if (r._text.includes(t)) return true;
    return /^\d+$/.test(t) && t.startsWith('0') && t.length > 3 && r._text.includes(t.replace(/^0+/, ''));
  };

  const records = [];
  const files = [];
  const seenRecords = new Set();
  const seenFiles = new Set();
  const authL = authority.toLowerCase();
  const yearL = year.toLowerCase();
  const typeL = project_type.toLowerCase();

  for (const [name, rows] of loaded) {
    for (const r of rows) {
      if (!(hasExact ? isExact(r) : matchesBroad(r))) continue;
      if (authL && !r._fn.includes(authL)) continue;
      if (yearL && !r._fn.includes(yearL)) continue;
      if (status && r.processing_status !== status) continue;
      if (typeL && !(r.project_type || '').toLowerCase().includes(typeL)) continue;

      const recKey = `${name}_${r.file_number}`;
      if (seenRecords.has(recKey)) continue;
      seenRecords.add(recKey);

      const priority = hasExact ? 1 : priorityOf(r, q, qA);
      const snippet = snippetOf(r, q, qA);
      records.push({ ...r, match_priority: priority });
      for (const f of r.files) {
        const fk = `${f.reference_no}|${f.doc_name}`;
        if (seenFiles.has(fk)) continue;
        seenFiles.add(fk);
        files.push({ ...f, match_priority: priority, snippet });
      }
    }
  }

  files.sort((a, b) => a.match_priority - b.match_priority
    || (a.is_available ? 0 : 1) - (b.is_available ? 0 : 1)
    || b.date.length - a.date.length
    || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  records.sort((a, b) => a.match_priority - b.match_priority);

  const count = (name) => records.reduce((n, r) => n + (r.source_dataset === name ? 1 : 0), 0);
  const offset = (pageNo - 1) * size;
  return {
    query, page: pageNo, page_size: size,
    total_files: files.length,
    total_records: records.length,
    total_pages: Math.max(Math.ceil(records.length / size) || 1, Math.ceil(files.length / size) || 1),
    files: files.slice(offset, offset + size),
    records: records.slice(offset, offset + size).map(({ _fn, _pn, _fnA, _pnA, _text, ...rest }) => ({
      ...rest,
      files: undefined,
      site_inspection_table: [],
    })),
    counts: { all: records.length, total_files: files.length, tgbpass: count('tgbpass'), oc_bp: count('oc_bp'), hmda: count('hmda') },
  };
}

export async function staticStats() {
  const manifest = await getManifest();
  const total = DATASETS.reduce((n, d) => n + (manifest[d]?.records || 0), 0);
  return {
    source: 'Static archive',
    total_indexed: total,
    proposals_total: manifest.tgbpass?.records || 0,
    oc_bp_total: manifest.oc_bp?.records || 0,
    hmda_total: manifest.hmda?.records || 0,
  };
}
