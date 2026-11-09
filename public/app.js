// Woodhouse Email Templates - the whole app (runs in the browser).
//
// Data lives in the Cloudflare D1 database behind /api/ (see src/index.js).
// If the site is opened somewhere without that API (for example the HTML
// file straight off disk), it falls back to this browser's local storage
// and says so in a banner.
'use strict';

/* ================================================================ Utilities */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (o) => JSON.parse(JSON.stringify(o));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const PH = /\[([^\[\]\n]{1,48})\]/g;
// Formatting inside an email body:
//   **bold text**
//   {{image:ID|Description|WIDTH}}   an image from the image library
//   {{link:ADDRESS|Text to show}}    a link (web address, email address or a [Placeholder])
const BOLD = /\*\*(?=\S)([^\n]*?\S)\*\*/g;
const LINK = /\{\{link:([^|}\n]+)\|([^}\n]*)\}\}/g;
const IMG = /\{\{image:([a-z0-9-]+)(?:\|([^|}\n]*))?(?:\|(\d+))?\}\}/g;

const ICON = {
  star: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  edit: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  dup: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>',
  copy: '<svg class="i" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  back: '<svg class="i" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  all: '<svg class="i" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  clock: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  key: '<svg class="i" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/></svg>',
  link: '<svg class="i" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  image: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  folder: '<svg class="i" viewBox="0 0 24 24"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
};

const STANDARD_PLACEHOLDERS = ['Customer Name', 'Booking Number', 'Arrival Date', 'Departure Date', 'Building Name', 'Price', 'Payment Amount', 'Due Date', 'Your Name'];
const LOCAL_PREFS = 'woodhouse-et-prefs';

function prefs() {
  try { return { name: '', font: 'Aptos', ...JSON.parse(localStorage.getItem(LOCAL_PREFS) || '{}') }; }
  catch { return { name: '', font: 'Aptos' }; }
}
function setPref(k, v) {
  const p = prefs(); p[k] = v;
  try { localStorage.setItem(LOCAL_PREFS, JSON.stringify(p)); } catch {}
}

function placeholdersIn(...texts) {
  const out = [];
  for (const t of texts) for (const m of String(t || '').matchAll(PH)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

function relTime(ts) {
  if (!ts) return '';
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + ' min ago';
  if (d < 86400) return Math.floor(d / 3600) + ' h ago';
  if (d < 86400 * 7) return Math.floor(d / 86400) + ' d ago';
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ================================================================== Storage */

const LOCAL_KEY = 'woodhouse-email-templates-v1';

const Store = {
  mode: 'server', // 'server' | 'local'

  async load() {
    if (location.protocol !== 'file:') {
      let res;
      try {
        res = await fetch('/api/data', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      } catch {
        throw new Error("Couldn't reach the server. Check your connection and try again.");
      }
      if (res.status === 401) { location.reload(); return new Promise(() => {}); }
      if (res.ok) {
        const d = await res.json();
        return { templates: d.templates || [], categories: d.meta?.categories || null, usage: d.meta?.usage || null, shared: d.meta?.shared || null, initialised: !!d.meta?.initialised };
      }
      // 404: no API here at all (opened as a plain static page). 503: the
      // Worker has no database bound. Anything else is a real failure that
      // should not quietly switch storage.
      if (res.status !== 404 && res.status !== 503) throw new Error('The server returned an error (' + res.status + '). Try again in a moment.');
    }
    this.mode = 'local';
    let d = {};
    try { d = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch {}
    return { templates: d.templates || [], categories: d.categories || null, usage: d.usage || null, shared: d.shared || null, initialised: !!d.initialised };
  },

  _local(fn) {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch {}
    d.templates ||= [];
    fn(d);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
  },

  async _send(method, path, body) {
    let res;
    try {
      res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error("Couldn't save: the server can't be reached. Your changes are still on screen; try again.");
    }
    if (res.status === 401) throw new Error('Your sign-in has expired. Copy anything you need, then reload the page.');
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) { const e = new Error('conflict'); e.conflict = data.template; throw e; }
    if (!res.ok) throw new Error(data.error || 'Saving failed (' + res.status + ').');
    return data;
  },

  async saveTemplate(t, base) {
    if (this.mode === 'local') {
      this._local((d) => { const i = d.templates.findIndex((x) => x.id === t.id); if (i >= 0) d.templates[i] = t; else d.templates.push(t); });
      return;
    }
    await this._send('PUT', '/api/templates/' + encodeURIComponent(t.id), { template: t, base: base ?? null });
  },

  async deleteTemplate(id) {
    if (this.mode === 'local') { this._local((d) => { d.templates = d.templates.filter((x) => x.id !== id); }); return; }
    await this._send('DELETE', '/api/templates/' + encodeURIComponent(id));
  },

  async saveMeta(key, data) {
    if (this.mode === 'local') { this._local((d) => { d[key] = data; }); return; }
    await this._send('PUT', '/api/meta/' + key, { data });
  },

  async importAll({ replace, templates, categories }) {
    if (this.mode === 'local') {
      this._local((d) => {
        if (replace) d.templates = [];
        for (const t of templates) { const i = d.templates.findIndex((x) => x.id === t.id); if (i >= 0) d.templates[i] = t; else d.templates.push(t); }
        if (categories) d.categories = categories;
        d.initialised = true;
      });
      return;
    }
    await this._send('POST', '/api/import', { replace: !!replace, templates, categories });
  },

  async listImages() {
    if (this.mode === 'local') {
      let d = {};
      try { d = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch {}
      return d.images || [];
    }
    const res = await fetch('/api/images', { cache: 'no-store' });
    if (!res.ok) throw new Error('The image library could not be loaded.');
    return (await res.json()).images || [];
  },

  async uploadImage(blob, meta) {
    if (this.mode === 'local') {
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
      const img = { id: meta.id || 'local-' + Math.random().toString(36).slice(2, 12), name: meta.name, type: blob.type, width: meta.width, height: meta.height, size: blob.size, created_at: Date.now(), data };
      try { this._local((d) => { d.images = [img, ...(d.images || [])]; }); }
      catch { throw new Error("This browser's storage is full, so the image couldn't be saved."); }
      return img;
    }
    let res;
    try {
      res = await fetch('/api/images', {
        method: 'POST', body: blob,
        headers: { 'Content-Type': blob.type, 'X-Name': encodeURIComponent(meta.name), 'X-Width': String(meta.width || 0), 'X-Height': String(meta.height || 0), ...(meta.id ? { 'X-Id': meta.id } : {}) },
      });
    } catch { throw new Error("Couldn't upload: the server can't be reached."); }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Upload failed (' + res.status + ').');
    return d.image;
  },

  async deleteImage(id) {
    if (this.mode === 'local') { this._local((d) => { d.images = (d.images || []).filter((x) => x.id !== id); }); return; }
    await this._send('DELETE', '/api/images/' + encodeURIComponent(id));
  },
};

/* ==================================================================== State */

const S = {
  templates: [],
  categories: [],
  usage: { recent: [], counts: {}, last: {} },
  images: [],           // image library: {id, name, type, width, height, size}
  shared: null,         // Codes & links: gate codes, places, links, maps, other details
  view: 'all',          // 'all' | 'fav' | 'ap' (accounts payable codes) | 'cat:<id>' | 'cat:' (uncategorised)
  query: '',
  sort: 'best',
  building: '',
  selectedId: null,
  kbIndex: -1,          // keyboard highlight in the list
  mode: 'use',          // 'use' | 'edit'
  draft: null,          // template being edited (copy)
  draftIsNew: false,
  work: {},             // per-template working copy in the Use view
  lastResults: [],
};

const byId = (id) => S.templates.find((t) => t.id === id);
const catName = (id) => S.categories.find((c) => c.id === id)?.name || 'Uncategorised';

function normaliseTemplate(t) {
  const now = new Date().toISOString();
  const out = {
    id: typeof t.id === 'string' && t.id ? t.id : uid('tpl'),
    name: String(t.name || 'Untitled template'),
    categoryId: String(t.categoryId || ''),
    description: String(t.description || ''),
    subject: String(t.subject || ''),
    body: String(t.body || ''),
    keywords: Array.isArray(t.keywords) ? t.keywords.map(String).filter(Boolean) : String(t.keywords || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    notes: String(t.notes || ''),
    favourite: !!t.favourite,
    fields: Array.isArray(t.fields) ? t.fields.map(String).filter(Boolean) : [],
    variations: Array.isArray(t.variations) ? t.variations.map((v, i) => ({
      id: String(v.id || 'v' + (i + 1) + Math.random().toString(36).slice(2, 5)),
      building: String(v.building || ''),
      values: v.values && typeof v.values === 'object' ? Object.fromEntries(Object.entries(v.values).map(([k, x]) => [k, String(x ?? '')])) : {},
      ownEmail: !!v.ownEmail,
      subject: String(v.subject || ''),
      body: String(v.body || ''),
    })) : [],
    createdAt: t.createdAt || now,
    updatedAt: t.updatedAt || now,
  };
  return out;
}

/* ================================================================== Search */
//
// Every word typed must appear somewhere in the template (partial words
// count). Where it appears decides the ranking: the name and keywords count
// most, the email body least. If a word names a building, that building's
// version is the one that opens.

const FIELD_WEIGHTS = [['name', 12], ['keywords', 9], ['buildings', 8], ['category', 5], ['subject', 5], ['description', 4], ['values', 2], ['body', 2], ['notes', 1]];
const indexCache = new Map();

function indexOf(t) {
  const key = t.id + '|' + t.updatedAt + '|' + t.categoryId + '|' + catName(t.categoryId);
  const hit = indexCache.get(t.id);
  if (hit && hit.key === key) return hit.ix;
  const ix = {
    name: norm(t.name),
    keywords: norm(t.keywords.join(' | ')),
    buildings: norm(t.variations.map((v) => v.building).join(' | ')),
    category: norm(catName(t.categoryId)),
    subject: norm(t.subject + ' | ' + t.variations.map((v) => v.ownEmail ? v.subject : '').join(' | ')),
    description: norm(t.description),
    values: norm(t.variations.map((v) => Object.values(v.values).join(' | ')).join(' | ')),
    body: norm(t.body + ' | ' + t.variations.map((v) => v.ownEmail ? v.body : '').join(' | ')),
    notes: norm(t.notes),
  };
  indexCache.set(t.id, { key, ix });
  return ix;
}

function queryTokens(q) {
  return norm(q).split(/[\s,]+/).filter(Boolean).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

function scoreTemplate(t, toks, rawQuery) {
  if (!toks.length) return { score: 0, variationId: null };
  const ix = indexOf(t);
  let score = 0;
  for (const tok of toks) {
    let best = 0;
    for (const [f, w] of FIELD_WEIGHTS) {
      const s = ix[f];
      const at = s.indexOf(tok);
      if (at < 0) continue;
      const wordStart = at === 0 || /[^a-z0-9]/.test(s[at - 1]);
      const v = w * (wordStart ? 1.3 : 1);
      if (v > best) best = v;
    }
    if (!best) return null;
    score += best;
  }
  const phrase = norm(rawQuery).trim();
  if (phrase.length > 2 && ix.name.includes(phrase)) score += 20;

  // Pre-choose a building only when the search points at exactly one:
  // "hooper" or "st george 3" does, "bell tent" (all five tents) doesn't.
  let variationId = null;
  const useful = toks.filter((tok) => tok.length >= 3 || /^\d+$/.test(tok));
  const hits = t.variations.map((v) => ({ v, n: useful.filter((tok) => norm(v.building).split(/[^a-z0-9]+/).some((w) => w.startsWith(tok))).length }));
  const best = Math.max(0, ...hits.map((h) => h.n));
  const top = hits.filter((h) => h.n === best);
  if (best > 0 && top.length === 1) variationId = top[0].v.id;
  return { score, variationId };
}

function highlight(text, toks) {
  let html = esc(text);
  if (!toks.length) return html;
  const parts = toks.filter((t) => t.length >= 2).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!parts.length) return html;
  // Accent-insensitive matching is skipped here for simplicity; highlighting is a visual aid only.
  const re = new RegExp('(' + parts.join('|') + ')', 'gi');
  return html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, txt) => tag || txt.replace(re, '<mark>$1</mark>'));
}

/* ================================================================ List view */

function visibleTemplates() {
  const toks = queryTokens(S.query);
  let list = [];
  for (const t of S.templates) {
    if (S.view === 'fav' && !t.favourite) continue;
    if (S.view.startsWith('cat:')) {
      const cid = S.view.slice(4);
      if (cid ? t.categoryId !== cid : S.categories.some((c) => c.id === t.categoryId)) continue;
    }
    if (S.building && !t.variations.some((v) => v.building === S.building)) continue;
    const m = scoreTemplate(t, toks, S.query);
    if (!m) continue;
    list.push({ t, score: m.score, variationId: m.variationId });
  }
  const sort = S.sort === 'best' && !toks.length ? 'name' : S.sort;
  const name = (a, b) => a.t.name.localeCompare(b.t.name, 'en', { sensitivity: 'base' });
  const recentRank = (id) => { const i = S.usage.recent.indexOf(id); return i < 0 ? 1e9 : i; };
  const cmp = {
    best: (a, b) => b.score - a.score || name(a, b),
    name,
    recent: (a, b) => recentRank(a.t.id) - recentRank(b.t.id) || name(a, b),
    used: (a, b) => (S.usage.counts[b.t.id] || 0) - (S.usage.counts[a.t.id] || 0) || name(a, b),
    updated: (a, b) => String(b.t.updatedAt).localeCompare(String(a.t.updatedAt)) || name(a, b),
    category: (a, b) => catName(a.t.categoryId).localeCompare(catName(b.t.categoryId)) || name(a, b),
  }[sort];
  list.sort(cmp);
  return { list, toks };
}

function viewTitle() {
  if (S.view === 'fav') return 'Favourites';
  if (S.view.startsWith('cat:')) return catName(S.view.slice(4));
  return 'All templates';
}

function renderSide() {
  const favN = S.templates.filter((t) => t.favourite).length;
  const codeN = departments().reduce((n, d) => n + d.codes.length, 0);
  const item = (view, label, n, icon) =>
    `<li><button type="button" data-view="${esc(view)}" aria-current="${S.view === view}">${icon || ''}<span class="nm">${esc(label)}</span><span class="n">${n}</span></button></li>`;
  $('#views').innerHTML =
    item('all', 'All templates', S.templates.length, ICON.all) +
    item('fav', 'Favourites', favN, ICON.star) +
    item('ap', 'Accounts payable', codeN, ICON.key);
  const counts = {};
  for (const t of S.templates) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
  const known = new Set(S.categories.map((c) => c.id));
  const uncategorised = S.templates.filter((t) => !known.has(t.categoryId)).length;
  $('#cats').innerHTML = S.categories.map((c) => item('cat:' + c.id, c.name, counts[c.id] || 0)).join('') +
    (uncategorised ? item('cat:', 'Uncategorised', uncategorised) : '');

  // Small screens: the sidebar collapses into this dropdown.
  const opts = [['all', 'All templates'], ['fav', 'Favourites'], ['ap', 'Accounts payable'], ...S.categories.map((c) => ['cat:' + c.id, c.name]), ...(uncategorised ? [['cat:', 'Uncategorised']] : [])];
  $$('.m-cat').forEach((sel) => { sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}"${S.view === v ? ' selected' : ''}>${esc(l)}</option>`).join(''); });
  showView();

  // Building filter: every building used by any template.
  const bs = [...new Set(S.templates.flatMap((t) => t.variations.map((v) => v.building)).filter(Boolean))].sort();
  if (S.building && !bs.includes(S.building)) S.building = '';
  $('#fBuilding').innerHTML = '<option value="">All buildings</option>' + bs.map((b) => `<option${b === S.building ? ' selected' : ''}>${esc(b)}</option>`).join('');
}

function renderList() {
  const { list, toks } = visibleTemplates();
  S.lastResults = list;
  $('#listTitle').textContent = S.query ? 'Search results' : viewTitle();
  $('#listCount').textContent = list.length + (list.length === 1 ? ' template' : ' templates');
  $('#sort').value = S.sort;
  if (S.kbIndex >= list.length) S.kbIndex = list.length - 1;

  if (!list.length) {
    $('#list').innerHTML = `<li class="empty-list">${S.templates.length ? (S.query ? `No templates match “${esc(S.query)}”.` : 'No templates here yet.') : 'The library is empty.'}<br>
      <button class="btn" type="button" data-act="new">New template</button></li>`;
    return;
  }

  $('#list').innerHTML = list.map(({ t, variationId }, i) => {
    const v = variationId && t.variations.find((x) => x.id === variationId);
    const bTag = v
      ? `<span class="tag b">${highlight(v.building, toks)}</span>`
      : t.variations.length
        ? `<span class="tag b">${t.variations.length === 1 ? esc(t.variations[0].building) : t.variations.length + ' buildings'}</span>`
        : '';
    return `<li><button type="button" class="row${i === S.kbIndex ? ' kb' : ''}" role="option" data-id="${esc(t.id)}" data-var="${esc(variationId || '')}" aria-selected="${t.id === S.selectedId}">
      <div class="r1"><span class="t">${highlight(t.name, toks)}</span>${t.favourite ? ICON.star.replace('class="i"', 'class="i star"') : ''}</div>
      <div class="r2"><span>${esc(catName(t.categoryId))}</span>${bTag}</div>
      ${t.description ? `<div class="r3">${highlight(t.description, toks)}</div>` : ''}
    </button></li>`;
  }).join('');
}

/* ===================================================== Accounts payable view */
//
// Every banking code in one table, to look up a code without opening a
// template. View only; changes are made in Codes & links -> Banking codes.

let apDept = ''; // '' = every department

/** Show either the template list and detail, or the accounts payable page. */
function showView() {
  const ap = S.view === 'ap';
  $('#shell').classList.toggle('ap-mode', ap);
  $('#apPane').hidden = !ap;
  if (ap) renderAp();
}

function renderAp() {
  const ds = departments();
  if (apDept && !deptById(apDept)) apDept = '';
  $('#apDepts').innerHTML = [['', 'All'], ...ds.map((d, i) => [d.id, deptLabel(d, i) + (d.number.trim() ? ' ' + d.number.trim() : '')])]
    .map(([id, l]) => `<button type="button" class="choice" data-apdept="${esc(id)}" aria-pressed="${id === apDept}">${esc(l)}</button>`).join('');
  renderApTable();
}

function renderApTable() {
  const ds = departments();
  const q = $('#apQ').value;
  const toks = queryTokens(q);
  const dp = deptById(apDept);
  const hits = bankSearch(q, dp);
  // With nothing typed, list them in order: department, then code number.
  const num = (c) => (/^\d+$/.test(c.code.trim()) ? +c.code.trim() : Infinity);
  if (!q.trim()) hits.sort((a, b) => ds.indexOf(a.dept) - ds.indexOf(b.dept) || num(a.code) - num(b.code) || a.code.name.localeCompare(b.code.name));
  const total = (dp ? [dp] : ds).reduce((n, d) => n + d.codes.length, 0);
  $('#apCount').textContent = q.trim() ? `${hits.length} of ${total} codes` : `${total} codes`;
  $('#apRows').innerHTML = hits.length
    ? hits.map(({ dept, code }) => `<tr>
        <td>${esc(deptLabel(dept, ds.indexOf(dept)))}</td>
        <td class="mono">${esc(dept.number)}</td>
        <td class="mono"><button type="button" class="ap-code" data-apcopy="${esc(code.code)}" title="Copy ${esc(code.code)}">${highlight(code.code, toks)}</button></td>
        <td>${highlight(code.name, toks)}</td>
        <td>${highlight(code.type, toks)}</td>
        <td class="ap-other">${highlight(code.other, toks)}</td></tr>`).join('')
    : `<tr><td colspan="6" class="none" style="padding:14px">${total ? `No code matches “${esc(q.trim())}”.` : 'No banking codes yet. Add or upload them under Codes &amp; links → Banking codes.'}</td></tr>`;
}

function renderAll() {
  renderSide();
  renderList();
  renderDetail();
}

/* ============================================================ Codes & links */
//
// Details that many templates share and that change often: gate codes,
// lock codes, web pages and maps. They live in the database (meta 'shared')
// and fill in placeholders automatically:
//
//   [Gate Code]          one of the rotating gate codes, picked at random per email
//   [Fixed Gate Code]    the fixed code (never rotated)
//   [Lock Code]          ┐
//   [Building Link]      ├ from the Places row matching the chosen building
//   [Building Map]       ┘ (that place's map, or the default map)
//   [<Place> Link]       a place's web page, e.g. [Rymill Centre Link]
//   [<Link name> Link]   e.g. [Disc Golf Link]
//   [<Map name>]         e.g. [Entry Map] (the picture itself)
//   [<Detail name>]      e.g. [Caretaker Phone]
//   [Department]         ┐ banking codes: chosen on the email screen
//   [Department Number]  │ (pick the department, then search its codes
//   [Banking Code]       │ by name and the number fills itself in)
//   [Banking Code Name]  ┘

const PLACE_KINDS = ['Building', 'Chalet', 'Bell tent', 'Camping', 'Other'];
const cleanName = (x) => String(x || '').replace(/[\[\]{}|\n]/g, ' ').replace(/\s+/g, ' ').trim();

function normaliseShared(sh) {
  sh = sh && typeof sh === 'object' ? sh : {};
  const arr = (a) => (Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : []);
  const str = (x) => String(x ?? '');
  return {
    gateCodes: (Array.isArray(sh.gateCodes) ? sh.gateCodes : []).map(str),
    fixedGateCode: str(sh.fixedGateCode),
    places: arr(sh.places).map((x) => ({ id: str(x.id) || uid('pl'), name: str(x.name), kind: PLACE_KINDS.includes(x.kind) ? x.kind : 'Building', code: str(x.code), link: str(x.link), map: str(x.map) })),
    links: arr(sh.links).map((x) => ({ id: str(x.id) || uid('ln'), name: str(x.name), url: str(x.url) })),
    maps: arr(sh.maps).map((x) => ({ id: str(x.id) || uid('mp'), name: str(x.name), image: str(x.image), width: +x.width || 600 })),
    details: arr(sh.details).map((x) => ({ id: str(x.id) || uid('dt'), name: str(x.name), value: str(x.value) })),
    departments: (Array.isArray(sh.departments) ? arr(sh.departments) : [{}, {}]).map((x) => ({
      id: str(x.id) || uid('dp'), name: str(x.name), number: str(x.number),
      codes: arr(x.codes).map((c) => ({ id: str(c.id) || uid('bc'), name: str(c.name), code: str(c.code), type: str(c.type), other: str(c.other) })),
    })),
  };
}

/* ---- Banking codes */

const BANK_PH = ['Department', 'Department Number', 'Banking Code', 'Banking Code Name'];
const deptLabel = (d, i) => cleanName(d.name) || 'Department ' + (i + 1);
function departments() { return S.shared.departments; }
function deptById(id) { return departments().find((d) => d.id === id) || null; }
function bankCodeById(id) {
  for (const d of departments()) { const c = d.codes.find((x) => x.id === id); if (c) return { dept: d, code: c }; }
  return null;
}
/** Codes matching a search: every word has to appear in the name, other names or number (partial words count). */
function bankSearch(q, dept) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const out = [];
  for (const d of dept ? [dept] : departments()) {
    for (const c of d.codes) {
      if (!cleanName(c.name) && !c.code.trim()) continue;
      const name = norm(c.name); const hay = name + ' ' + norm(c.other) + ' ' + norm(c.code) + ' ' + norm(c.type);
      if (!words.every((x) => hay.includes(x))) continue;
      // Names that start with what was typed come first.
      const score = !words.length ? 0 : name.startsWith(words[0]) ? 0 : name.split(/\s+/).some((x) => x.startsWith(words[0])) ? 1 : 2;
      out.push({ dept: d, code: c, score });
    }
  }
  return out.sort((a, b) => a.score - b.score || a.code.name.localeCompare(b.code.name));
}

function gateCodes() { return S.shared.gateCodes.map((c) => c.trim()).filter(Boolean); }

/** A random rotating gate code, different from `not` when there's a choice. */
function pickGate(not) {
  const codes = gateCodes();
  if (!codes.length) return '';
  const pool = codes.length > 1 ? codes.filter((c) => c !== not) : codes;
  return pool[Math.floor(Math.random() * pool.length)];
}

function placeFor(building) {
  const n = norm(building).trim();
  return S.shared.places.find((x) => norm(x.name).trim() === n) || null;
}
function defaultMap() {
  const ms = S.shared.maps.filter((m) => m.image && imageMeta(m.image));
  return ms.find((m) => norm(m.name).trim() === 'entry map') || ms[0] || null;
}
function mapForPlace(pl) {
  return (pl && pl.map && S.shared.maps.find((m) => m.id === pl.map && m.image && imageMeta(m.image))) || defaultMap();
}
/** True when a map slot is still waiting for its picture. */
function mapMissing(m) { return !(m.image && imageMeta(m.image)); }
function mapToken(m) {
  return m && m.image && imageMeta(m.image) ? `{{image:${m.image}|${cleanName(m.name)}|${m.width || 600}}}` : '';
}

function sharedValues(building, gate) {
  const sh = S.shared; const out = {};
  const put = (k, v) => { k = cleanName(k); v = String(v || '').trim(); if (k && v) out[k] = v; };
  for (const d of sh.details) put(d.name, d.value);
  for (const l of sh.links) if (cleanName(l.name)) put(l.name + ' Link', l.url);
  for (const pl of sh.places) if (cleanName(pl.name)) put(pl.name + ' Link', pl.link);
  // A map with no picture yet shows the default map, so emails never break
  // while a map is waiting to be uploaded.
  for (const m of sh.maps) put(m.name, mapToken(m) || mapToken(defaultMap()));
  put('Fixed Gate Code', sh.fixedGateCode);
  put('Gate Code', gate);
  const pl = building ? placeFor(building) : null;
  if (pl) { put('Lock Code', pl.code); put('Building Link', pl.link); put('Building Map', mapToken(mapForPlace(pl))); }
  return out;
}

/** Every placeholder Codes & links can fill (for the editor's Insert buttons). */
function sharedPlaceholderNames() {
  const sh = S.shared;
  const named = (list, suffix = '') => list.map((x) => cleanName(x.name)).filter(Boolean).map((n) => n + suffix);
  return [...new Set(['Gate Code', 'Fixed Gate Code', 'Lock Code', 'Building Link', 'Building Map',
    ...named(sh.maps), ...named(sh.links, ' Link'), ...named(sh.places, ' Link'), ...named(sh.details), ...BANK_PH])];
}

/* ============================================================ Detail: use */
//
// Using a template: choose the building (if it has building versions), fill
// in the blanks, copy. The email text itself isn't edited here; that's done
// in Outlook after pasting.

function work(t) {
  // Fill in anything missing, whoever created the working copy.
  const w = S.work[t.id] || (S.work[t.id] = {});
  for (const [k, v] of Object.entries({ varId: '', values: {}, gate: '', dept: '', bank: '', bankQ: '', bankKb: 0 })) if (w[k] == null) w[k] = v;
  if (w.dept && !deptById(w.dept)) w.dept = '';
  if (w.bank && !bankCodeById(w.bank)) w.bank = '';
  if (w.varId && !t.variations.some((v) => v.id === w.varId)) w.varId = '';
  if (w.gate && !gateCodes().includes(w.gate)) w.gate = pickGate();
  if (!w.gate) w.gate = pickGate();
  return w;
}

function currentVariation(t, w) { return t.variations.find((v) => v.id === w.varId) || null; }

/** The subject and body for this email: the chosen building's own version, if it has one. */
function emailText(t, w) {
  const v = currentVariation(t, w);
  return v && v.ownEmail ? { subject: v.subject, body: v.body } : { subject: t.subject, body: t.body };
}

function autoValues(t, w) {
  const v = currentVariation(t, w);
  const out = sharedValues(v ? v.building : null, w.gate);
  if (v) {
    out['Building Name'] = v.building;
    for (const [k, x] of Object.entries(v.values)) if (x !== '') out[k] = x;
  }
  const dp = deptById(w.dept);
  if (dp) {
    if (cleanName(dp.name)) out['Department'] = dp.name.trim();
    if (dp.number.trim()) out['Department Number'] = dp.number.trim();
  }
  const bc = w.bank && bankCodeById(w.bank);
  if (bc) {
    if (bc.code.code.trim()) out['Banking Code'] = bc.code.code.trim();
    if (cleanName(bc.code.name)) out['Banking Code Name'] = bc.code.name.trim();
  }
  const me = prefs().name;
  if (me) out['Your Name'] = me;
  return out;
}

function resolvedValues(t, w) {
  const auto = autoValues(t, w);
  return { values: { ...w.values, ...auto }, auto };
}

function fill(text, values) {
  return String(text || '').replace(PH, (m, k) => (values[k] != null && values[k] !== '' ? values[k] : m));
}

function imageMeta(id) { return S.images.find((x) => x.id === id); }

/** Where an image can be loaded from. Copied emails need the full address. */
function imageUrl(id, absolute) {
  const m = imageMeta(id);
  if (!m) return null;
  if (m.data) return m.data; // browser-only storage keeps the picture itself
  return (absolute ? location.origin : '') + '/img/' + id;
}

/** Display size: the width written in the email (or up to 600 px), height kept in proportion. */
function imageSize(m, w) {
  const width = Math.max(20, Math.min(+w || Math.min(m.width || 600, 600), 1400));
  const height = m.width && m.height ? Math.round(width * m.height / m.width) : 0;
  return { width, height };
}

/** `name` arrives already escaped, because it comes from an escaped line. */
function imageHtml(id, name, w, forCopy) {
  const m = imageMeta(id);
  const src = imageUrl(id, forCopy);
  if (!m || !src) return forCopy ? '' : `<span class="ph-e">[missing image${name ? ': ' + name : ''}]</span>`;
  const { width, height } = imageSize(m, w);
  return forCopy
    ? `<img src="${esc(src)}" alt="${name || ''}" width="${width}"${height ? ` height="${height}"` : ''} style="width:${width}px;${height ? `height:${height}px;` : ''}border:0">`
    : `<img src="${esc(src)}" alt="${name || ''}" width="${width}" style="width:${width}px;max-width:100%;height:auto">`;
}

/** A link address that is safe to put in an email, or null. */
function safeHref(url) {
  let u = String(url || '').trim();
  if (/^www\./i.test(u)) u = 'https://' + u;
  else if (/^[^\s@/:]+@[^\s@/]+\.[a-z]{2,}$/i.test(u)) u = 'mailto:' + u;
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+\d][\d\s-]*)$/i.test(u) ? u : null;
}

/** Turn plain web and email addresses in escaped text into links. */
function autolink(h) {
  return h.replace(/\b((?:https?:\/\/|www\.)[^\s<\[\]]+[^\s<\[\].,;:!?)])/gi, (m) => `<a href="${m.startsWith('www.') ? 'https://' + m : m}">${m}</a>`)
    .replace(/(^|[\s(])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1<a href="mailto:$2">$2</a>');
}

/** One piece of a line (outside any link token): escaped, then bold, placeholders and images. */
function segmentHtml(text, values, forCopy, inLink) {
  let h = esc(text);
  if (!inLink) h = autolink(h);
  if (!forCopy) {
    h = h.replace(PH, (m, k) => {
      const raw = Object.prototype.hasOwnProperty.call(values, k) ? values[k] : null;
      if (raw == null || raw === '') return `<span class="ph-e">${m}</span>`;
      const im = /^\{\{image:([a-z0-9-]+)(?:\|([^|}\n]*))?(?:\|(\d+))?\}\}$/.exec(raw);
      if (im) return imageHtml(im[1], esc(im[2] || ''), im[3], false);
      return `<span class="ph-f" title="[${esc(k)}]">${esc(raw)}</span>`;
    });
  }
  return h.replace(IMG, (m, id, name, w) => imageHtml(id, name, w, forCopy));
}

/**
 * One line of an email body as HTML. Link tokens are handled separately, so
 * addresses never get mixed up with automatic links or placeholder markers.
 * For copying, the text has already had its placeholders filled in.
 */
function lineHtml(line, values, forCopy) {
  // Bold is marked across the whole line first, so it can wrap a link.
  line = line.replace(BOLD, '\u0001$1\u0002');
  let out = ''; let last = 0;
  for (const m of line.matchAll(LINK)) {
    out += segmentHtml(line.slice(last, m.index), values, forCopy, false);
    const href = safeHref(fill(m[1], values));
    const inner = segmentHtml(m[2].trim() || m[1], values, forCopy, true);
    if (forCopy) out += href ? `<a href="${esc(href)}">${inner}</a>` : inner;
    else out += href
      ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(href)}">${inner}</a>`
      : `<a class="nolink" title="Link address still to fill in: ${esc(m[1])}">${inner}</a>`;
    last = m.index + m[0].length;
  }
  out += segmentHtml(line.slice(last), values, forCopy, false);
  return out.replace(/\u0001/g, '<b>').replace(/\u0002/g, '</b>');
}

function previewHtml(text, values) {
  return String(text || '').split('\n').map((line) => `<p>${lineHtml(line, values, false) || '&nbsp;'}</p>`).join('');
}

/** The copied plain-text version: links as "text (address)", no bold markers, no images. */
function plainText(text) {
  return String(text || '')
    .replace(LINK, (m, url, label) => {
      const t = label.trim(); const u = url.trim();
      return !t || t === u ? u : `${t} (${u.replace(/^mailto:/i, '')})`;
    })
    .replace(BOLD, '$1').replace(IMG, '').replace(/[ \t]+$/gm, '');
}

function renderDetail() {
  const el = $('#detail');
  document.body.classList.toggle('m-open', !!(S.selectedId || S.mode === 'edit'));
  if (S.mode === 'edit' && S.draft) return renderEditor();
  const t = S.selectedId && byId(S.selectedId);
  if (!t) {
    el.innerHTML = `<div class="blank"><div>
      <p><b>${S.templates.length} templates</b> in the library.</p>
      <p>Search or pick one from the list to open it here.</p>
      <p><span class="k">/</span> search &nbsp; <span class="k">↑</span> <span class="k">↓</span> move &nbsp; <span class="k">Enter</span> open</p>
    </div></div>`;
    return;
  }
  const w = work(t);
  const v = currentVariation(t, w);
  const needBuilding = t.variations.length > 0 && !v;
  const kind = choiceKind(t);
  el.innerHTML = `
  <div class="d-head">
    <button class="btn quiet icon back" type="button" data-act="close" aria-label="Back to list">${ICON.back}</button>
    <div class="d-title">
      <div class="crumb"><span>${esc(catName(t.categoryId))}</span></div>
      <h2><span>${esc(t.name)}</span><button class="fav" type="button" data-act="fav" aria-pressed="${t.favourite}" title="${t.favourite ? 'Remove from favourites' : 'Add to favourites'}">${ICON.star}</button></h2>
      ${t.description ? `<p>${esc(t.description)}</p>` : ''}
    </div>
    <div class="d-actions">
      <button class="btn quiet" type="button" data-act="edit">${ICON.edit}Edit template</button>
      <button class="btn quiet" type="button" data-act="dup">${ICON.dup}Duplicate</button>
      <button class="btn quiet danger" type="button" data-act="del">${ICON.trash}Delete</button>
    </div>
  </div>

  <div class="work">
    <div class="col">
      ${t.variations.length ? `
      <section class="panel">
        <div class="panel-h"><h4>${kind === 'building' ? 'Building' : 'Option'}</h4>${needBuilding ? '<span class="need">Choose one to start</span>' : ''}</div>
        <div class="choices">${t.variations.map((x) => `<button type="button" class="choice" data-var="${esc(x.id)}" aria-pressed="${x.id === w.varId}">${esc(x.building)}</button>`).join('')}</div>
      </section>` : ''}
      <div id="fillArea" class="col"></div>
      ${t.notes ? `<div class="notes"><b>Internal notes (not copied)</b>${esc(t.notes)}</div>` : ''}
    </div>

    <section class="panel preview">
      <div class="copybar">
        <button class="btn primary lg" type="button" data-act="copy"${needBuilding ? ' disabled' : ''}>${ICON.copy}Copy email</button>
        <button class="btn lg" type="button" data-act="copysubj"${needBuilding ? ' disabled' : ''}>Copy subject</button>
      </div>
      ${needBuilding
        ? `<div class="pv-empty">Choose the ${kind} first. Its email will show here.</div>`
        : '<div class="mail-subj"><span>Subject</span><span id="pvSubj"></span></div><div class="mail" id="pvBody"></div><div class="unfilled" id="pvWarn" hidden></div>'}
    </section>
  </div>`;
  if (!needBuilding) { renderFill(t, w); updatePreview(); }
}

/** "building" when every choice is a place in Codes & links, otherwise "option" (e.g. Email to customer / Email for portal). */
function choiceKind(t) { return t.variations.every((x) => placeFor(x.building)) ? 'building' : 'option'; }

/** How a value from Codes & links is shown in "Filled in for you". */
function autoDisplay(val) {
  const im = /^\{\{image:[a-z0-9-]+\|([^|}\n]*)/.exec(val);
  if (im) return `<span class="mapname">${ICON.image}${esc(im[1])}</span>`;
  if (/^(https?:|mailto:)/i.test(val)) return `<a href="${esc(val)}" target="_blank" rel="noopener noreferrer">${esc(val.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</a>`;
  return `<b>${esc(val)}</b>`;
}

function renderFill(t, w) {
  const area = $('#fillArea'); if (!area) return;
  const { subject, body } = emailText(t, w);
  const fields = placeholdersIn(subject, body);
  const auto = autoValues(t, w);
  const banking = fields.some((k) => BANK_PH.includes(k));
  const manual = fields.filter((k) => auto[k] == null && !(banking && BANK_PH.includes(k)));
  const filled = fields.filter((k) => auto[k] != null && !(banking && BANK_PH.includes(k)));
  area.innerHTML = `
    ${banking ? bankPanel(w) : ''}
    <section class="panel">
      <div class="panel-h"><h4>Fill in</h4>${manual.length ? '<button class="link" type="button" data-act="clearvals">Clear</button>' : ''}</div>
      ${manual.length
        ? `<div class="ph-grid">${manual.map((k) => `<label class="field"><span class="lbl">${esc(k)}${k === 'Your Name' ? ' <span class="opt">remembered</span>' : ''}</span><input class="input" data-ph="${esc(k)}" value="${esc(w.values[k] ?? '')}" placeholder="[${esc(k)}]" autocomplete="off"></label>`).join('')}</div>`
        : '<p class="none">Nothing to fill in. This email is ready to copy.</p>'}
    </section>
    ${filled.length ? `
    <section class="panel">
      <div class="panel-h"><h4>Filled in for you</h4><button class="link" type="button" data-act="openshared">Codes &amp; links</button></div>
      <dl class="auto">${filled.map((k) => `<div><dt>${esc(k)}</dt><dd>${autoDisplay(auto[k])}${k === 'Gate Code' && gateCodes().length > 1 ? ' <button class="link" type="button" data-act="newgate">Use a different code</button>' : ''}</dd></div>`).join('')}</dl>
    </section>` : ''}`;
}

/** Choose the department, then search its codes by name. */
function bankPanel(w) {
  const ds = departments();
  const dp = deptById(w.dept);
  const bc = w.bank && bankCodeById(w.bank);
  const total = (dp ? [dp] : ds).reduce((n, d) => n + d.codes.length, 0);
  return `<section class="panel bank">
    <div class="panel-h"><h4>Banking code</h4><button class="link" type="button" data-act="openbank">Codes &amp; links</button></div>
    <div class="bank-b">
      ${ds.length ? `<div class="choices">${ds.map((d, i) => `<button type="button" class="choice" data-dept="${esc(d.id)}" aria-pressed="${d.id === w.dept}">${esc(deptLabel(d, i))}${d.number.trim() ? ` <span class="num">${esc(d.number.trim())}</span>` : ''}</button>`).join('')}</div>` : '<p class="none">No departments yet. Add them under Codes &amp; links → Banking codes.</p>'}
      ${bc ? `<div class="bank-pick"><span class="bank-name">${esc(bc.code.name || 'Unnamed code')}</span><b class="bank-num">${esc(bc.code.code || 'no number')}</b><button class="link" type="button" data-act="bankchange">Change</button></div>`
        : `<div class="bank-search">
            <input class="input" id="bankQ" data-banksearch value="${esc(w.bankQ)}" placeholder="${dp ? `Search ${esc(deptLabel(dp, ds.indexOf(dp)))} codes, e.g. equ` : 'Search codes by name, e.g. equ'}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="bankRes">
            <div class="bank-res" id="bankRes" role="listbox">${bankResults(w, dp, total)}</div>
          </div>`}
    </div>
  </section>`;
}

function bankResults(w, dp, total) {
  if (!w.bankQ.trim()) return total ? `<p class="none">Type part of a name to search ${total} code${total === 1 ? '' : 's'}.</p>` : '<p class="none">No codes yet. Add them under Codes &amp; links → Banking codes.</p>';
  const hits = bankSearch(w.bankQ, dp);
  if (!hits.length) return `<p class="none">No code matches “${esc(w.bankQ.trim())}”${dp ? ' in this department' : ''}.</p>`;
  const max = 8; w.bankKb = Math.min(w.bankKb, Math.min(hits.length, max) - 1);
  const ds = departments();
  return hits.slice(0, max).map((h, i) => `<button type="button" class="bank-hit${i === w.bankKb ? ' kb' : ''}" role="option" data-bankcode="${esc(h.code.id)}"><span>${esc(h.code.name || 'Unnamed code')}${h.code.type.trim() ? ` <span class="dept">${esc(h.code.type.trim())}</span>` : ''}${dp ? '' : ` <span class="dept">${esc(deptLabel(h.dept, ds.indexOf(h.dept)))}</span>`}</span><b>${esc(h.code.code)}</b></button>`).join('')
    + (hits.length > max ? `<p class="none">${hits.length - max} more. Keep typing to narrow it down.</p>` : '');
}

function refreshBankResults(t, w) {
  const res = $('#bankRes'); if (!res) return;
  const dp = deptById(w.dept);
  res.innerHTML = bankResults(w, dp, (dp ? [dp] : departments()).reduce((n, d) => n + d.codes.length, 0));
}

function pickBankCode(t, w, id) {
  const bc = bankCodeById(id); if (!bc) return;
  w.bank = id; w.dept = bc.dept.id; w.bankQ = ''; w.bankKb = 0;
  renderFill(t, w); updatePreview();
  ($$('#fillArea [data-ph]').find((i) => !i.value) || $('[data-act="copy"]'))?.focus();
}

function updatePreview() {
  const t = byId(S.selectedId); if (!t || !$('#pvBody')) return;
  const w = work(t);
  const { subject, body } = emailText(t, w);
  const { values } = resolvedValues(t, w);
  $('#pvSubj').innerHTML = previewHtml(subject, values).replace(/^<p>|<\/p>$/g, '');
  $('#pvBody').innerHTML = previewHtml(body, values);
  const missing = placeholdersIn(subject, body).filter((k) => !values[k]);
  const warn = $('#pvWarn');
  warn.hidden = !missing.length;
  warn.textContent = missing.length ? `Not filled in yet: ${missing.map((k) => '[' + k + ']').join(', ')}. These stay in the copied text as they are.` : '';
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(260, ta.scrollHeight + 2) + 'px';
}

/* ================================================================= Copying */

function emailHtml(text) {
  const font = prefs().font || 'Aptos';
  const family = font === 'Calibri' ? 'Calibri, Arial, sans-serif' : font === 'Arial' ? 'Arial, Helvetica, sans-serif' : 'Aptos, Calibri, Arial, sans-serif';
  // One <p> per line with no margins: Outlook keeps blank lines as blank
  // paragraphs, so the pasted spacing matches the preview exactly.
  const lines = String(text).split('\n').map((l) => {
    const html = lineHtml(l, {}, true);
    return `<p style="margin:0">${l.trim() ? html : '&nbsp;'}</p>`;
  }).join('');
  return `<div style="font-family:${family};font-size:11pt;color:#000000">${lines}</div>`;
}

async function copyText(text, html) {
  try {
    if (html && window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      return true;
    }
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the old method */ }
  // Fallback for browsers that block the clipboard API.
  const holder = document.createElement(html ? 'div' : 'textarea');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap';
  if (html) { holder.contentEditable = 'true'; holder.innerHTML = html; } else holder.value = text;
  document.body.appendChild(holder);
  const range = document.createRange();
  if (html) { range.selectNodeContents(holder); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); } else holder.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  holder.remove();
  getSelection()?.removeAllRanges();
  return ok;
}

async function doCopy(what) {
  const t = byId(S.selectedId); if (!t) return;
  const w = work(t);
  const wt = emailText(t, w);
  const { values } = resolvedValues(t, w);
  if (t.variations.length && !w.varId) {
    toast(`Choose the ${choiceKind(t)} first.`, 'warn');
    $('.choice[data-var]')?.focus();
    return;
  }
  const subject = plainText(fill(wt.subject, values));
  const body = fill(wt.body, values);
  const ok = what === 'subject'
    ? await copyText(subject)
    : await copyText(plainText(body), prefs().font === 'plain' ? null : emailHtml(body));
  if (!ok) { toast("Couldn't copy. Your browser blocked the clipboard.", 'err'); return; }
  const missing = placeholdersIn(what === 'subject' ? wt.subject : wt.body).filter((k) => !values[k]);
  toast((what === 'subject' ? 'Subject copied' : 'Email copied') + (missing.length ? `. Still to fill in: ${missing.map((k) => '[' + k + ']').join(', ')}` : '. Paste it into Outlook.'), missing.length ? 'warn' : '');
  recordUse(t.id);
}

function recordUse(id) {
  const u = S.usage;
  u.recent = [id, ...u.recent.filter((x) => x !== id && byId(x))].slice(0, 15);
  u.counts[id] = (u.counts[id] || 0) + 1;
  u.last[id] = new Date().toISOString();
  renderSide();
  if (S.view === 'recent' || S.sort === 'recent' || S.sort === 'used') renderList();
  Store.saveMeta('usage', u).catch(() => {});
}

/* =============================================================== Mutations */

async function persistTemplate(t, base, { quiet } = {}) {
  setStatus('busy', 'Saving');
  try {
    await Store.saveTemplate(t, base);
    const i = S.templates.findIndex((x) => x.id === t.id);
    if (i >= 0) S.templates[i] = t; else S.templates.push(t);
    setStatus();
    if (!quiet) toast('Saved');
    return true;
  } catch (e) {
    setStatus();
    if (e.conflict) {
      const fresh = normaliseTemplate(e.conflict);
      const i = S.templates.findIndex((x) => x.id === fresh.id);
      if (i >= 0) S.templates[i] = fresh;
      toast('Not saved: this template was changed somewhere else (another tab or computer) since you opened it. Your edits are still here; save again to replace that version with yours.', 'err', 9000);
      renderAll();
      return false;
    }
    toast(e.message, 'err', 7000);
    return false;
  }
}

function stamp(t) { return { ...t, updatedAt: new Date().toISOString() }; }

async function toggleFav(id) {
  const t = byId(id); if (!t) return;
  const next = stamp({ ...clone(t), favourite: !t.favourite });
  if (await persistTemplate(next, t.updatedAt, { quiet: true })) {
    // Keep any unsaved working edits through the change of updatedAt.
    if (S.work[id]) S.work[id].base = next.updatedAt;
    renderSide(); renderList();
    const b = $('[data-act="fav"]'); if (b) { b.setAttribute('aria-pressed', next.favourite); b.title = next.favourite ? 'Remove from favourites' : 'Add to favourites'; }
    if (S.mode === 'edit' && S.draft?.id === id) S.draft.favourite = next.favourite;
  }
}

async function deleteTemplate(id) {
  const t = byId(id); if (!t) return;
  if (!(await ask('Delete template?', `“${t.name}”${t.variations.length ? ` and its ${t.variations.length} building versions` : ''} will be removed from the library. This can't be undone.`, 'Delete'))) return;
  setStatus('busy', 'Saving');
  try {
    await Store.deleteTemplate(id);
    S.templates = S.templates.filter((x) => x.id !== id);
    delete S.work[id];
    if (S.selectedId === id) S.selectedId = null;
    if (S.usage.recent.includes(id)) { S.usage.recent = S.usage.recent.filter((x) => x !== id); Store.saveMeta('usage', S.usage).catch(() => {}); }
    setStatus();
    toast('Template deleted');
    renderAll();
  } catch (e) { setStatus(); toast(e.message, 'err', 7000); }
}

function duplicateTemplate(id) {
  const t = byId(id); if (!t) return;
  const d = clone(t);
  d.id = uid('tpl');
  d.name = t.name + ' (copy)';
  d.favourite = false;
  d.variations.forEach((v) => { v.id = uid('v'); });
  openEditor(d, true);
}

/* ================================================================= Editor */

function blankTemplate() {
  const cid = S.view.startsWith('cat:') ? S.view.slice(4) : '';
  return normaliseTemplate({ id: uid('tpl'), name: '', categoryId: cid, subject: '', body: 'Dear [Customer Name],\n\n\n\nKind regards,\n\n[Your Name]\nWoodhouse Adventure Park' });
}

async function openEditor(draft, isNew) {
  if (!(await leaveOk())) return;
  S.draft = clone(draft);
  S.draft._hasVars = S.draft.variations.length > 0;
  S.draftIsNew = !!isNew;
  S.draftOriginal = JSON.stringify(draftComparable(S.draft));
  S.mode = 'edit';
  renderDetail();
  $('#edName')?.focus();
}

function draftComparable(d) { const { _hasVars, ...rest } = d; return rest; }
function editorDirty() { return S.mode === 'edit' && S.draft && JSON.stringify(draftComparable(S.draft)) !== S.draftOriginal; }

function knownBuildings() {
  return [...new Set([...S.shared.places.map((x) => cleanName(x.name)), ...S.templates.flatMap((t) => t.variations.map((v) => v.building))].filter(Boolean))];
}

function renderEditor() {
  const d = S.draft;
  const el = $('#detail');
  el.innerHTML = `
  <div class="d-head">
    <button class="btn quiet icon back" type="button" data-act="edcancel" aria-label="Back">${ICON.back}</button>
    <div class="d-title">
      <div class="crumb">${S.draftIsNew ? 'New template' : 'Editing template'}</div>
      <h2>${esc(d.name || 'Untitled template')}</h2>
    </div>
    <div class="d-actions">
      <button class="btn" type="button" data-act="edcancel">Cancel</button>
      <button class="btn primary" type="button" data-act="edsave">Save template</button>
    </div>
  </div>
  <form class="ed" id="edForm" autocomplete="off" onsubmit="return false">
    <div class="box"><div class="box-h"><h4>Details</h4></div>
      <div class="box-b stack">
        <div class="grid3">
          <div class="field"><label class="lbl" for="edName">Template name</label><input class="input" id="edName" data-k="name" value="${esc(d.name)}" placeholder="e.g. Accommodation Availability Response" required></div>
          <div class="field"><label class="lbl" for="edCat">Category</label>
            <select class="select" id="edCat" data-k="categoryId">
              <option value="">Uncategorised</option>
              ${S.categories.map((c) => `<option value="${esc(c.id)}"${c.id === d.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select></div>
        </div>
        <div class="field"><label class="lbl" for="edDesc">Short description <span class="opt">shown in the list</span></label><input class="input" id="edDesc" data-k="description" value="${esc(d.description)}" placeholder="When to use this template"></div>
        <div class="grid3">
          <div class="field"><label class="lbl" for="edKw">Keywords and tags <span class="opt">separate with commas; help search find it</span></label><input class="input" id="edKw" data-k="keywords" value="${esc(d.keywords.join(', '))}" placeholder="e.g. deposit, reminder, overdue"></div>
          <div class="field" style="align-self:end;padding-bottom:6px"><label class="check"><input type="checkbox" data-k="favourite"${d.favourite ? ' checked' : ''}> Favourite</label></div>
        </div>
      </div>
    </div>

    <div class="box"><div class="box-h"><h4>Email</h4></div>
      <div class="box-b stack">
        <div class="field"><label class="lbl" for="edSubj">Subject line</label><input class="input" id="edSubj" data-k="subject" value="${esc(d.subject)}"></div>
        <div class="chip-rows" id="edChips"></div>
        <div class="field"><div class="lbl-row"><label class="lbl" for="edBody">Email body ${d._hasVars ? '<span class="opt">shared by every building unless a building has its own version</span>' : ''}</label><span class="fmt"><button type="button" class="fbtn" data-fmt="bold" title="Bold: select text, then click (Ctrl+B)"><b>B</b></button><button type="button" class="fbtn" data-fmt="link" title="Link: select text, then click (Ctrl+K)">${ICON.link}Link</button><button type="button" class="fbtn" data-fmt="image" title="Insert an image">${ICON.image}Image</button></span></div>
          <textarea class="textarea body-ta" id="edBody" data-k="body" spellcheck="true">${esc(d.body)}</textarea>
          <div class="help">Put placeholders in square brackets, like [Customer Name]. Select text and press B (or Ctrl+B) to make it **bold**. Blank lines become paragraph breaks in Outlook.</div></div>
      </div>
    </div>

    <div class="box"><div class="box-h"><h4>Building variations</h4></div>
      <div class="box-b stack">
        <label class="check"><input type="checkbox" id="edHasVars"${d._hasVars ? ' checked' : ''}> This template has a version for each building</label>
        <div id="edVars"${d._hasVars ? '' : ' hidden'}></div>
      </div>
    </div>

    <div class="box"><div class="box-h"><h4>Internal notes</h4><span class="help sp" style="margin:0">Shown to staff only, never copied into the email</span></div>
      <div class="box-b"><textarea class="textarea" id="edNotes" data-k="notes" rows="3" placeholder="e.g. Check the booking calendar first. Attach the site map.">${esc(d.notes)}</textarea></div>
    </div>
    <div class="err" id="edErr" hidden></div>
    <div class="row-btns" style="justify-content:flex-end">
      <button class="btn" type="button" data-act="edcancel">Cancel</button>
      <button class="btn primary lg" type="button" data-act="edsave">Save template</button>
    </div>
  </form>`;
  renderChips();
  renderVarTable();
  autosize($('#edBody'));
}

function renderChips() {
  const d = S.draft;
  const list = [...STANDARD_PLACEHOLDERS, ...(d._hasVars ? d.fields : [])];
  const uniq = [...new Set(list)];
  const chip = (x, cls = '') => `<button type="button" class="chip${cls}" data-ins="${esc(x)}">[${esc(x)}]</button>`;
  $('#edChips').innerHTML = `<div class="chips"><span>Insert:</span>${uniq.map((x) => chip(x, d._hasVars && d.fields.includes(x) ? ' f' : '')).join('')}</div>
    <div class="chips"><span>From Codes &amp; links:</span>${sharedPlaceholderNames().map((x) => chip(x, ' s')).join('')}</div>`;
}

function renderVarTable() {
  const d = S.draft;
  const box = $('#edVars');
  if (!box) return;
  const cols = d.fields;
  const dl = `<datalist id="bList">${knownBuildings().map((b) => `<option value="${esc(b)}">`).join('')}</datalist>`;
  const rows = d.variations.map((v, i) => `
    <tr>
      <td class="bcell"><input class="input" list="bList" data-vi="${i}" data-vk="building" value="${esc(v.building)}" placeholder="Building name"></td>
      ${cols.map((f) => `<td><input class="input" data-vi="${i}" data-vf="${esc(f)}" value="${esc(v.values[f] || '')}"></td>`).join('')}
      <td class="c"><label class="check" title="Give this building a completely different subject and body"><input type="checkbox" data-vi="${i}" data-vk="ownEmail"${v.ownEmail ? ' checked' : ''}> Own email</label></td>
      <td class="c"><button type="button" class="x" data-act="delvar" data-vi="${i}" title="Remove ${esc(v.building || 'this building')}">${ICON.x}</button></td>
    </tr>
    ${v.ownEmail ? `<tr class="own"><td colspan="${cols.length + 3}"><div class="stack">
      <div class="field"><label class="lbl">${esc(v.building || 'This building')}: subject</label><input class="input" data-vi="${i}" data-vk="subject" value="${esc(v.subject)}"></div>
      <div class="field"><div class="lbl-row"><label class="lbl">${esc(v.building || 'This building')}: email body</label><span class="fmt"><button type="button" class="fbtn" data-fmt="bold" data-for="${i}" title="Bold: select text, then click (Ctrl+B)"><b>B</b></button><button type="button" class="fbtn" data-fmt="link" data-for="${i}" title="Link: select text, then click (Ctrl+K)">${ICON.link}Link</button><button type="button" class="fbtn" data-fmt="image" data-for="${i}" title="Insert an image">${ICON.image}Image</button></span></div><textarea class="textarea" rows="8" data-vi="${i}" data-vk="body">${esc(v.body)}</textarea></div>
    </div></td></tr>` : ''}`).join('');

  box.innerHTML = `${dl}
    <p class="help" style="margin:0 0 8px">Each row is a building. Each column is a detail that changes between buildings. Write the column name in square brackets in the email, e.g. <b>[${esc(cols[0] || 'Price')}]</b>, and the selected building's value goes in automatically. <b>[Building Name]</b> always works, and so do <b>[Lock Code]</b>, <b>[Building Link]</b> and <b>[Building Map]</b> from Codes &amp; links when the building name matches a place there.</p>
    <div class="vt-wrap"><table class="vt">
      <thead><tr>
        <th>Building</th>
        ${cols.map((f, j) => `<th><div class="hcell"><input class="input" data-fi="${j}" value="${esc(f)}" aria-label="Detail name"><button type="button" class="x" data-act="delfield" data-fi="${j}" title="Remove the ${esc(f)} column">${ICON.x}</button></div></th>`).join('')}
        <th class="c" style="width:1%">&nbsp;</th><th style="width:1%"></th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols.length + 3}" class="none" style="padding:10px">No buildings yet.</td></tr>`}</tbody>
    </table></div>
    <div class="vt-tools">
      <button type="button" class="btn" data-act="addvar">Add building</button>
      <button type="button" class="btn" data-act="addfield">Add detail column</button>
      ${PLACE_KINDS.map((k) => { const n = S.shared.places.filter((x) => x.kind === k && cleanName(x.name) && !d.variations.some((v) => norm(v.building) === norm(x.name))).length; return n ? `<button type="button" class="link" data-act="addkind" data-kind="${esc(k)}">Add ${n} ${esc(k.toLowerCase())}${n === 1 ? '' : 's'}</button>` : ''; }).join('')}
    </div>`;
}

function editorInput(e) {
  const d = S.draft; if (!d) return;
  const el = e.target;
  if (el.dataset.k) {
    const k = el.dataset.k;
    if (k === 'keywords') d.keywords = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === 'favourite') d.favourite = el.checked;
    else d[k] = el.value;
    if (k === 'name') $('.d-title h2').textContent = el.value || 'Untitled template';
    if (k === 'body') autosize(el);
    return;
  }
  if (el.id === 'edHasVars') {
    d._hasVars = el.checked;
    $('#edVars').hidden = !el.checked;
    renderVarTable(); renderChips();
    return;
  }
  if (el.dataset.vi != null && el.dataset.act == null) {
    const v = d.variations[+el.dataset.vi];
    if (el.dataset.vf) v.values[el.dataset.vf] = el.value;
    else if (el.dataset.vk === 'ownEmail') {
      v.ownEmail = el.checked;
      if (el.checked && !v.body) { v.subject = d.subject; v.body = d.body; }
      renderVarTable();
    } else if (el.dataset.vk) v[el.dataset.vk] = el.value;
  }
}

function renameField(j, name) {
  const d = S.draft;
  const old = d.fields[j];
  name = name.replace(/[\[\]]/g, '').trim();
  if (!name || name === old) { renderVarTable(); return; }
  if (d.fields.includes(name)) { toast('There is already a column called ' + name, 'warn'); renderVarTable(); return; }
  d.fields[j] = name;
  for (const v of d.variations) { v.values[name] = v.values[old] ?? ''; delete v.values[old]; }
  const swap = (s) => String(s || '').split('[' + old + ']').join('[' + name + ']');
  d.subject = swap(d.subject); d.body = swap(d.body);
  for (const v of d.variations) { v.subject = swap(v.subject); v.body = swap(v.body); }
  $('#edSubj').value = d.subject; $('#edBody').value = d.body;
  renderVarTable(); renderChips();
}

async function saveEditor() {
  const d = S.draft;
  const err = (m) => { const e = $('#edErr'); e.textContent = m; e.hidden = false; e.scrollIntoView({ block: 'nearest' }); };
  if (!d.name.trim()) { err('Give the template a name.'); $('#edName').focus(); return; }
  const out = clone(draftComparable(d));
  out.name = out.name.trim();
  if (!d._hasVars) { out.variations = []; out.fields = []; }
  else {
    out.variations = out.variations.filter((v) => v.building.trim() || Object.values(v.values).some(Boolean));
    out.variations.forEach((v) => { v.building = v.building.trim(); });
    if (out.variations.some((v) => !v.building)) { err('Every building row needs a building name.'); return; }
    const names = out.variations.map((v) => norm(v.building));
    if (new Set(names).size !== names.length) { err('Each building can only appear once.'); return; }
    out.fields = out.fields.filter(Boolean);
    for (const v of out.variations) {
      v.values = Object.fromEntries(out.fields.map((f) => [f, v.values[f] || '']));
      if (!v.ownEmail) { v.subject = ''; v.body = ''; }
    }
  }
  const prev = byId(out.id);
  const saved = stamp(normaliseTemplate(out));
  if (!prev) saved.createdAt = saved.updatedAt;
  if (await persistTemplate(saved, prev ? prev.updatedAt : null)) {
    S.mode = 'use'; S.draft = null;
    S.selectedId = saved.id;
    delete S.work[saved.id];
    renderAll();
  }
}

/* ======================================================= Categories dialog */

function renderCatDialog() {
  const counts = {};
  for (const t of S.templates) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
  $('#catRows').innerHTML = S.categories.map((c) => `
    <div class="cat-row">
      <input class="input" data-cat="${esc(c.id)}" value="${esc(c.name)}" aria-label="Category name">
      <span class="n">${counts[c.id] || 0} ${counts[c.id] === 1 ? 'item' : 'items'}</span>
      <button class="btn icon danger" type="button" data-delcat="${esc(c.id)}" title="Delete category" aria-label="Delete ${esc(c.name)}">${ICON.trash}</button>
    </div>`).join('') || '<p class="none">No categories.</p>';
}

async function saveCategories(msg) {
  setStatus('busy', 'Saving');
  try { await Store.saveMeta('categories', S.categories); setStatus(); if (msg) toast(msg); }
  catch (e) { setStatus(); toast(e.message, 'err', 7000); }
  renderSide(); renderList(); if (S.mode !== 'edit') renderDetail();
}

/* ============================================================ Import/export */

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const today = () => new Date().toISOString().slice(0, 10);

async function exportJson() {
  // Images go into the backup too, so restoring it brings them back.
  const images = [];
  if (S.images.length) toast('Preparing backup…', '', 20000);
  for (const m of S.images) {
    try {
      const data = m.data || await fetch('/img/' + m.id).then((r) => (r.ok ? r.blob() : null)).then((b) => b && new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }));
      if (data) images.push({ id: m.id, name: m.name, type: m.type, width: m.width, height: m.height, data });
    } catch { /* skip an image that can't be fetched */ }
  }
  $('#toast').hidden = true;
  const data = { app: 'woodhouse-email-templates', version: 3, exportedAt: new Date().toISOString(), categories: S.categories, shared: S.shared, templates: S.templates, images };
  download(`woodhouse-email-templates-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

const CSV_COLS = ['id', 'name', 'category', 'description', 'subject', 'body', 'keywords', 'notes', 'favourite', 'fields', 'variations', 'createdAt', 'updatedAt'];

function exportCsv() {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [CSV_COLS.join(',')];
  for (const t of S.templates) {
    rows.push([t.id, t.name, catName(t.categoryId), t.description, t.subject, t.body, t.keywords.join('; '), t.notes, t.favourite ? 'yes' : 'no',
      t.fields.join('; '), t.variations.length ? JSON.stringify(t.variations) : '', t.createdAt, t.updatedAt].map(cell).join(','));
  }
  // The BOM makes Excel read the file as UTF-8.
  download(`woodhouse-email-templates-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

async function importFile(file) {
  const text = await file.text();
  let templates = []; let categories = null; let images = []; let shared = null;
  const replace = $('#impReplace').checked;
  try {
    if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(text)) {
      const d = JSON.parse(text);
      templates = Array.isArray(d) ? d : d.templates || [];
      if (d.shared && typeof d.shared === 'object') shared = normaliseShared(d.shared);
      if (Array.isArray(d.images)) images = d.images.filter((m) => m && m.id && /^data:image\/(png|jpeg|gif);base64,/.test(m.data || ''));
      if (Array.isArray(d.categories)) categories = d.categories.filter((c) => c && c.id && c.name).map((c) => ({ id: String(c.id), name: String(c.name) }));
    } else {
      const rows = parseCsv(text);
      const head = rows.shift().map((h) => h.trim());
      const col = (r, k) => { const i = head.indexOf(k); return i >= 0 ? r[i] ?? '' : ''; };
      if (!head.includes('name')) throw new Error('The CSV needs at least a "name" column.');
      const cats = clone(S.categories);
      for (const r of rows) {
        const cname = col(r, 'category').trim();
        let cat = cats.find((c) => norm(c.name) === norm(cname));
        if (cname && !cat) { cat = { id: uid('cat'), name: cname }; cats.push(cat); }
        let variations = [];
        try { variations = col(r, 'variations') ? JSON.parse(col(r, 'variations')) : []; } catch { throw new Error(`The variations column for “${col(r, 'name')}” isn't valid.`); }
        templates.push({
          id: col(r, 'id') || undefined, name: col(r, 'name'), categoryId: cat?.id || '', description: col(r, 'description'),
          subject: col(r, 'subject'), body: col(r, 'body'), keywords: col(r, 'keywords').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
          notes: col(r, 'notes'), favourite: /^(yes|true|1)$/i.test(col(r, 'favourite').trim()),
          fields: col(r, 'fields').split(';').map((s) => s.trim()).filter(Boolean), variations,
          createdAt: col(r, 'createdAt') || undefined, updatedAt: col(r, 'updatedAt') || undefined,
        });
      }
      categories = cats;
    }
  } catch (e) {
    toast("Couldn't read that file. " + (e.message || ''), 'err', 7000);
    return;
  }
  templates = templates.map(normaliseTemplate);
  if (!templates.length) { toast('No templates found in that file.', 'warn'); return; }
  if (!categories) categories = S.categories;
  else if (!replace) {
    // Merge: keep existing categories, add any new ones from the file.
    const merged = clone(S.categories);
    for (const c of categories) if (!merged.some((m) => m.id === c.id)) merged.push(c);
    categories = merged;
  }
  const msg = replace
    ? `Replace the whole library with the ${templates.length} templates in “${file.name}”? Templates not in the file will be deleted.`
    : `Import ${templates.length} templates from “${file.name}”? Templates with the same ID will be overwritten.`;
  if (!(await ask('Import templates?', msg, replace ? 'Replace library' : 'Import'))) return;
  setStatus('busy', 'Saving');
  try {
    for (const m of images) {
      if (imageMeta(m.id)) continue;
      const blob = await (await fetch(m.data)).blob();
      const saved = await Store.uploadImage(blob, { id: m.id, name: m.name || 'Image', width: m.width, height: m.height });
      if (saved.id !== m.id) {
        // Couldn't keep the old address: point the templates at the new one.
        const swap = (t) => String(t || '').split('{{image:' + m.id).join('{{image:' + saved.id);
        for (const t of templates) { t.body = swap(t.body); t.variations.forEach((v) => { v.body = swap(v.body); }); }
      }
      S.images.unshift(saved);
    }
    await Store.importAll({ replace, templates, categories });
    if (shared) { await Store.saveMeta('shared', shared); S.shared = shared; }
    if (replace) S.templates = [];
    for (const t of templates) { const i = S.templates.findIndex((x) => x.id === t.id); if (i >= 0) S.templates[i] = t; else S.templates.push(t); }
    S.categories = categories;
    S.work = {};
    setStatus();
    toast(`Imported ${templates.length} templates`);
    $('#setDlg').close();
    renderAll();
  } catch (e) { setStatus(); toast(e.message, 'err', 7000); }
}

async function addSeed({ silent } = {}) {
  const seed = window.SEED;
  const missing = seed.templates.filter((t) => !byId(t.id)).map(normaliseTemplate);
  const cats = clone(S.categories);
  for (const c of seed.categories) if (!cats.some((x) => x.id === c.id)) cats.push(c);
  if (!silent && !missing.length) { toast('All the starter examples are already in the library.'); return; }
  await Store.importAll({ replace: false, templates: missing, categories: cats });
  S.templates.push(...missing);
  S.categories = cats;
  if (!silent) { toast(`Added ${missing.length} example templates`); renderAll(); }
}

/* =================================================================== Chrome */

let toastTimer;
function toast(msg, kind = '', ms = 3200) {
  const el = $('#toast');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function setStatus(kind, text) {
  const el = $('#status');
  if (!kind) {
    kind = Store.mode === 'local' ? 'local' : '';
    text = Store.mode === 'local' ? 'This browser only' : 'All changes saved';
  }
  el.className = 'status' + (kind ? ' ' + kind : '');
  el.textContent = text;
}

function showBanner(html) {
  const b = $('#banner');
  b.innerHTML = html; b.hidden = !html;
  $('#shell').classList.toggle('has-banner', !!html);
}

function ask(title, message, yes = 'OK') {
  const dlg = $('#askDlg');
  $('#askT').textContent = title;
  $('#askM').textContent = message;
  $('#askYes').textContent = yes;
  dlg.showModal();
  $('#askNo').focus();
  return new Promise((resolve) => {
    const done = (v) => { dlg.close(); $('#askYes').onclick = $('#askNo').onclick = null; dlg.oncancel = null; resolve(v); };
    $('#askYes').onclick = () => done(true);
    $('#askNo').onclick = () => done(false);
    dlg.oncancel = (e) => { e.preventDefault(); done(false); };
  });
}

/** Before leaving an open editor or unsaved Use-view edits, check it's OK to throw them away. */
async function leaveOk() {
  if (editorDirty()) {
    if (!(await ask('Discard changes?', "You haven't saved the changes to this template.", 'Discard changes'))) return false;
  }
  if (S.mode === 'edit') { S.mode = 'use'; S.draft = null; }
  return true;
}

async function selectTemplate(id, variationId) {
  if (S.mode === 'edit' && S.draft && S.draft.id === id && !S.draftIsNew) return;
  if (!(await leaveOk())) return;
  const t = byId(id);
  if (t && (id !== S.selectedId || variationId)) {
    // Opening a template starts a new email: nothing typed yet, a fresh gate
    // code, and no building chosen unless the search named one.
    S.work[id] = { varId: variationId || '', values: {}, gate: pickGate() };
  }
  S.selectedId = id;
  renderList();
  renderDetail();
  $('#detail').scrollTop = 0;
}

/* =================================================================== Events */

function bind() {
  const q = $('#q');
  q.addEventListener('input', () => {
    S.query = q.value;
    S.kbIndex = q.value ? 0 : -1;
    if (S.view === 'ap' && q.value) { S.view = 'all'; renderSide(); }
    $('#qx').hidden = !q.value; $('#qk').hidden = !!q.value;
    if (q.value && S.sort !== 'best' && !bind.sortTouched) S.sort = 'best';
    renderList();
  });
  q.addEventListener('keydown', (e) => {
    const n = S.lastResults.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      S.kbIndex = Math.max(0, Math.min(n - 1, S.kbIndex + (e.key === 'ArrowDown' ? 1 : -1)));
      renderList();
      $('.row.kb')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const r = S.lastResults[Math.max(0, S.kbIndex)];
      if (!r) return;
      e.preventDefault();
      selectTemplate(r.t.id, r.variationId).then(() => {
        // Jump straight to the first thing to fill in.
        const first = $('.choice[data-var][aria-pressed="false"]') && !$('.choice[data-var][aria-pressed="true"]') ? $('.choice[data-var]') : $$('#fillArea [data-ph]').find((i) => !i.value) || $('[data-act="copy"]');
        first?.focus();
      });
    } else if (e.key === 'Escape') {
      q.value = ''; q.dispatchEvent(new Event('input'));
    }
  });
  $('#qx').addEventListener('click', () => { q.value = ''; q.dispatchEvent(new Event('input')); q.focus(); });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      if ($('dialog[open]')) return;
      e.preventDefault(); q.focus(); q.select();
    }
  });

  $('#sort').addEventListener('change', (e) => { S.sort = e.target.value; bind.sortTouched = true; renderList(); });
  $('#fBuilding').addEventListener('change', (e) => { S.building = e.target.value; renderList(); });
  $$('.m-cat').forEach((sel) => sel.addEventListener('change', (e) => { S.view = e.target.value; S.kbIndex = -1; renderSide(); renderList(); }));

  // Accounts payable page
  $('#apQ').addEventListener('input', renderApTable);
  $('#apQ').addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; renderApTable(); } });
  $('#apPane').addEventListener('click', async (e) => {
    const d = e.target.closest('[data-apdept]');
    if (d) { apDept = d.dataset.apdept; renderAp(); $('#apQ').focus(); return; }
    if (e.target.closest('[data-act="openbank"]')) { openShared('bank'); return; }
    const c = e.target.closest('[data-apcopy]');
    if (c && c.dataset.apcopy && await copyText(c.dataset.apcopy)) toast(`Copied ${c.dataset.apcopy}`);
  });

  $('.side').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) { S.view = b.dataset.view; S.kbIndex = -1; renderSide(); renderList(); if (S.view === 'ap') $('#apQ').focus(); }
  });

  $('#list').addEventListener('click', (e) => {
    const r = e.target.closest('.row');
    if (r) { S.kbIndex = -1; selectTemplate(r.dataset.id, r.dataset.var || null); return; }
    if (e.target.closest('[data-act="new"]')) openEditor(blankTemplate(), true);
  });

  $('#newBtn').addEventListener('click', () => openEditor(blankTemplate(), true));

  // ---- Detail pane: clicks
  $('#detail').addEventListener('click', async (e) => {
    const f = e.target.closest('[data-fmt]');
    if (f) {
      const ta = formatTarget(f);
      if (!ta) return;
      if (f.dataset.fmt === 'bold') toggleBold(ta);
      else if (f.dataset.fmt === 'link') openLinkDialog(ta);
      else openImageDialog(ta);
      return;
    }
    const ch = e.target.closest('.choice[data-var]');
    if (ch && S.mode !== 'edit') {
      const t = byId(S.selectedId); if (!t) return;
      work(t).varId = ch.dataset.var;
      renderDetail();
      ($$('#fillArea [data-ph]').find((i) => !i.value) || $('[data-act="copy"]'))?.focus();
      return;
    }
    const dpb = e.target.closest('[data-dept]');
    if (dpb && S.mode !== 'edit') {
      const t = byId(S.selectedId); if (!t) return;
      const w = work(t);
      w.dept = dpb.dataset.dept;
      const bc = w.bank && bankCodeById(w.bank);
      if (bc && bc.dept.id !== w.dept) w.bank = '';
      w.bankKb = 0;
      renderFill(t, w); updatePreview();
      $('#bankQ')?.focus();
      return;
    }
    const bkb = e.target.closest('[data-bankcode]');
    if (bkb && S.mode !== 'edit') { const t = byId(S.selectedId); if (t) pickBankCode(t, work(t), bkb.dataset.bankcode); return; }
    const b = e.target.closest('[data-act],[data-ins]');
    if (!b) return;
    if (b.dataset.ins) { insertPlaceholder(b.dataset.ins); return; }
    const t = byId(S.selectedId);
    switch (b.dataset.act) {
      case 'close': S.selectedId = null; renderList(); renderDetail(); break;
      case 'fav': toggleFav(S.selectedId); break;
      case 'edit': if (t) openEditor(t, false); break;
      case 'dup': duplicateTemplate(S.selectedId); break;
      case 'del': deleteTemplate(S.selectedId); break;
      case 'copy': doCopy('email'); break;
      case 'copysubj': doCopy('subject'); break;
      case 'clearvals': if (t) { work(t).values = {}; renderFill(t, work(t)); updatePreview(); $('#fillArea [data-ph]')?.focus(); } break;
      case 'newgate': if (t) { const w = work(t); w.gate = pickGate(w.gate); renderFill(t, w); updatePreview(); } break;
      case 'openshared': openShared(); break;
      case 'openbank': openShared('bank'); break;
      case 'bankchange': if (t) { const w = work(t); w.bank = ''; renderFill(t, w); updatePreview(); $('#bankQ')?.focus(); } break;
      case 'addkind':
        for (const pl of S.shared.places.filter((x) => x.kind === b.dataset.kind && cleanName(x.name))) {
          if (!S.draft.variations.some((v) => norm(v.building) === norm(pl.name))) S.draft.variations.push({ id: uid('v'), building: pl.name, values: {}, ownEmail: false, subject: '', body: '' });
        }
        renderVarTable(); break;
      case 'edcancel':
        if (await leaveOk()) { if (S.draftIsNew) S.selectedId = S.selectedId && byId(S.selectedId) ? S.selectedId : null; renderDetail(); }
        break;
      case 'edsave': saveEditor(); break;
      case 'addvar': S.draft.variations.push({ id: uid('v'), building: '', values: {}, ownEmail: false, subject: '', body: '' }); renderVarTable(); $$('#edVars [data-vk="building"]').pop()?.focus(); break;
      case 'delvar': {
        const v = S.draft.variations[+b.dataset.vi];
        const filled = v.building || Object.values(v.values).some(Boolean);
        if (!filled || await ask('Remove building?', `Remove ${v.building || 'this building'} and its details from this template?`, 'Remove')) {
          S.draft.variations.splice(+b.dataset.vi, 1); renderVarTable();
        }
        break;
      }
      case 'addfield': {
        let n = 'New detail', i = 2;
        while (S.draft.fields.includes(n)) n = 'New detail ' + i++;
        S.draft.fields.push(n); renderVarTable(); renderChips();
        const inp = $(`#edVars [data-fi="${S.draft.fields.length - 1}"]`); inp?.focus(); inp?.select();
        break;
      }
      case 'delfield': {
        const j = +b.dataset.fi; const f = S.draft.fields[j];
        const used = S.draft.variations.some((v) => v.values[f]);
        if (!used || await ask('Remove column?', `Remove the “${f}” column and its value for every building?`, 'Remove')) {
          S.draft.fields.splice(j, 1);
          for (const v of S.draft.variations) delete v.values[f];
          renderVarTable(); renderChips();
        }
        break;
      }
    }
  });

  // ---- Detail pane: typing
  $('#detail').addEventListener('input', (e) => {
    if (S.mode === 'edit') { editorInput(e); return; }
    const t = byId(S.selectedId); if (!t) return;
    const w = work(t);
    const el = e.target;
    if (el.dataset.banksearch != null) { w.bankQ = el.value; w.bankKb = 0; refreshBankResults(t, w); return; }
    if (el.dataset.ph) {
      w.values[el.dataset.ph] = el.value;
      // Your name is remembered on this computer, so it fills itself in next time.
      if (el.dataset.ph === 'Your Name') setPref('name', el.value.trim());
      updatePreview();
    }
  });

  $('#detail').addEventListener('change', async (e) => {
    const el = e.target;
    if (S.mode === 'edit') {
      if (el.dataset.fi != null && el.tagName === 'INPUT') renameField(+el.dataset.fi, el.value);
      else if (el.type === 'checkbox' || el.tagName === 'SELECT') editorInput(e);
    }
  });

  // In an email body: Ctrl+B makes the selection bold, Ctrl+K makes it a link (as in Outlook).
  // Banking code search: ↑ ↓ to move, Enter to pick, Esc to clear.
  $('#detail').addEventListener('keydown', (e) => {
    if (e.target.dataset?.banksearch == null) return;
    const t = byId(S.selectedId); if (!t) return;
    const w = work(t);
    const hits = $$('#bankRes [data-bankcode]');
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && hits.length) {
      e.preventDefault();
      w.bankKb = Math.max(0, Math.min(hits.length - 1, w.bankKb + (e.key === 'ArrowDown' ? 1 : -1)));
      hits.forEach((h, i) => h.classList.toggle('kb', i === w.bankKb));
    } else if (e.key === 'Enter' && hits.length) {
      e.preventDefault();
      pickBankCode(t, w, hits[Math.min(w.bankKb, hits.length - 1)].dataset.bankcode);
    } else if (e.key === 'Escape' && w.bankQ) {
      e.preventDefault(); e.stopPropagation();
      e.target.value = ''; w.bankQ = ''; w.bankKb = 0; refreshBankResults(t, w);
    }
  });

  $('#detail').addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.tagName !== 'TEXTAREA' || !isBodyBox(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); toggleBold(e.target); }
    if (k === 'k') { e.preventDefault(); e.stopPropagation(); openLinkDialog(e.target); }
  });

  bindLinkDialog();
  bindShared();

  bindImageDialog();

  // Remember where the cursor was, so Insert puts placeholders in the right box.
  $('#detail').addEventListener('focusin', (e) => { if (e.target.id === 'edSubj' || e.target.id === 'edBody' || e.target.dataset?.vk === 'body' || e.target.dataset?.vk === 'subject') bind.lastText = e.target; });

  // ---- Dialogs
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#manageCats').addEventListener('click', () => { renderCatDialog(); $('#catDlg').showModal(); });
  $('#catRows').addEventListener('change', (e) => {
    const id = e.target.dataset.cat; if (!id) return;
    const name = e.target.value.trim();
    const c = S.categories.find((x) => x.id === id);
    if (!name) { e.target.value = c.name; return; }
    if (name !== c.name) { c.name = name; saveCategories('Category renamed'); }
  });
  $('#catRows').addEventListener('click', async (e) => {
    const id = e.target.closest('[data-delcat]')?.dataset.delcat; if (!id) return;
    const c = S.categories.find((x) => x.id === id);
    const n = S.templates.filter((t) => t.categoryId === id).length;
    $('#catDlg').close();
    const ok = await ask('Delete category?', `Delete “${c.name}”?` + (n ? ` Its ${n} template${n === 1 ? '' : 's'} will stay in the library under Uncategorised.` : ''), 'Delete category');
    if (ok) {
      S.categories = S.categories.filter((x) => x.id !== id);
      if (S.view === 'cat:' + id) S.view = 'all';
      await saveCategories('Category deleted');
    }
    renderCatDialog(); $('#catDlg').showModal();
  });
  $('#catAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#catNew').value.trim(); if (!name) return;
    if (S.categories.some((c) => norm(c.name) === norm(name))) { toast('That category already exists.', 'warn'); return; }
    S.categories.push({ id: uid('cat'), name });
    $('#catNew').value = '';
    renderCatDialog();
    saveCategories('Category added');
  });

  $('#settingsBtn').addEventListener('click', () => {
    const p = prefs();
    $('#setName').value = p.name; $('#setFont').value = p.font;
    $('#storeInfo').textContent = Store.mode === 'local'
      ? 'Templates are saved in this browser only, because this copy of the site has no database. Download a JSON backup regularly.'
      : `Templates are saved in the Woodhouse Email Templates database (${S.templates.length} templates, ${S.categories.length} categories), so they are the same on every computer you sign in from.`;
    $('#setDlg').showModal();
  });
  $('#setName').addEventListener('input', (e) => { setPref('name', e.target.value.trim()); if (S.mode !== 'edit' && S.selectedId) renderDetail(); });
  $('#setFont').addEventListener('change', (e) => setPref('font', e.target.value));
  $('#expJson').addEventListener('click', exportJson);
  $('#expCsv').addEventListener('click', exportCsv);
  $('#impBtn').addEventListener('click', () => $('#impFile').click());
  $('#impFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
  $('#seedBtn').addEventListener('click', async () => { try { await addSeed(); } catch (e) { toast(e.message, 'err', 7000); } });

  window.addEventListener('beforeunload', (e) => {
    if (editorDirty()) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ===================================================== Codes & links dialog */

let shTab = 'gate';
let shTimer = null;
let shBankQ = '';

/** "Name<TAB>Code", "Name, Code" or "Name - Code" per line (code last if it looks like a number). */
function parseCodeList(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parts = line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s+[-–]\s+/);
    parts = parts.map((x) => x.trim());
    if (parts.length === 1) { const m = /^(.*?)\s+([\d][\w.\/-]*)$/.exec(parts[0]); if (m) parts = [m[1], m[2]]; }
    let [name = '', code = '', ...rest] = parts;
    // Accept the columns either way round: "4120, Equipment hire".
    if (/^\d[\w.\/-]*$/.test(name) && !/^\d[\w.\/-]*$/.test(code)) [name, code] = [code, name];
    if (name || code) out.push({ id: uid('bc'), name, code, type: '', other: rest.filter(Boolean).join(', ') });
  }
  return out;
}

/* ---- Uploading banking codes from a spreadsheet */

/** The files inside a .zip (an .xlsx is one), read on demand. */
async function readZip(buf) {
  const dv = new DataView(buf); const u8 = new Uint8Array(buf); const td = new TextDecoder();
  let e = buf.byteLength - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('This file is not a valid Excel (.xlsx) file.');
  const files = {};
  for (let i = 0, n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true); i < n; i++) {
    const nl = dv.getUint16(p + 28, true);
    files[td.decode(u8.subarray(p + 46, p + 46 + nl))] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
    p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return async (name) => {
    const f = files[name]; if (!f) return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = u8.slice(start, start + f.size);
    if (f.method === 0) return td.decode(data);
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
}

/** The first sheet of an .xlsx as rows of { v: text, strike: crossed out? }. */
async function readXlsx(buf) {
  const get = await readZip(buf);
  const xml = (s) => (s ? new DOMParser().parseFromString(s, 'application/xml') : null);
  const tags = (el, t) => (el ? [...el.getElementsByTagName(t)] : []);
  const struckOn = (el) => { const x = el && el.getElementsByTagName('strike')[0]; return !!x && !/^(0|false)$/i.test(x.getAttribute('val') || ''); };
  const wb = xml(await get('xl/workbook.xml'));
  if (!wb) throw new Error('This file is not a valid Excel (.xlsx) file.');
  const rid = tags(wb, 'sheet')[0]?.getAttribute('r:id');
  const rel = tags(xml(await get('xl/_rels/workbook.xml.rels')), 'Relationship').find((r) => r.getAttribute('Id') === rid);
  const target = rel ? rel.getAttribute('Target').replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/') : 'xl/worksheets/sheet1.xml';
  // Crossed-out text: a cell's font, or every run of a shared string.
  const st = xml(await get('xl/styles.xml'));
  const fonts = tags(tags(st, 'fonts')[0], 'font').map(struckOn);
  const xfStrike = tags(tags(st, 'cellXfs')[0], 'xf').map((x) => !!fonts[+x.getAttribute('fontId') || 0]);
  const text = (si) => tags(si, 't').filter((t) => t.parentNode.nodeName !== 'rPh').map((t) => t.textContent).join('');
  const shared = tags(xml(await get('xl/sharedStrings.xml')), 'si').map((si) => {
    const runs = tags(si, 'r');
    return { v: text(si), strike: runs.length > 0 && runs.every((r) => !r.textContent.trim() || struckOn(r.getElementsByTagName('rPr')[0])) };
  });
  const col = (ref) => { let n = 0; for (const ch of String(ref).replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  return tags(xml(await get(target)), 'row').map((row) => {
    const out = [];
    for (const c of tags(row, 'c')) {
      const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const ss = t === 's' ? shared[+v] : null;
      const val = ss ? ss.v : t === 'inlineStr' ? text(c.getElementsByTagName('is')[0]) : v;
      out[col(c.getAttribute('r'))] = { v: String(val).trim(), strike: xfStrike[+c.getAttribute('s') || 0] || !!ss?.strike };
    }
    return Array.from(out, (x) => x || { v: '', strike: false });
  });
}

/** Departments and their codes from spreadsheet rows (headers in the first row that has a Code column). */
function bankRowsToDepartments(rows) {
  const hi = rows.findIndex((r) => r.some((c) => /^(account )?code$/i.test(c.v.trim())));
  if (hi < 0) throw new Error('No “Code” column found. The first row should be the headings: Department, Department Number, Code, Name, Type, Other names.');
  const heads = rows[hi].map((c) => norm(c.v).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim());
  const find = (re) => heads.findIndex((h) => re.test(h));
  const ix = {
    num: find(/^(department|dept) (number|no|num)$/),
    dept: find(/^(department|dept)( name)?$/),
    code: find(/^(account )?code$/),
    name: find(/^(code )?(name|description)$/),
    type: find(/^type$/),
    other: find(/other names|search|supplier|keyword/),
  };
  if (ix.name < 0) throw new Error('No “Name” column found.');
  if (ix.dept < 0 && ix.num < 0) throw new Error('No “Department” column found.');
  const depts = new Map(); let struck = 0;
  for (const r of rows.slice(hi + 1)) {
    const cell = (i) => (i >= 0 && r[i] ? r[i] : { v: '', strike: false });
    const code = cell(ix.code).v; const name = cell(ix.name).v.replace(/\s+/g, ' ');
    if (!code && !name) continue;
    if (cell(ix.code).strike || cell(ix.name).strike) { struck++; continue; }
    const dn = cell(ix.dept).v; const dnum = cell(ix.num).v;
    if (!dn && !dnum) continue;
    const key = dnum || norm(dn);
    if (!depts.has(key)) depts.set(key, { name: dn, number: dnum, codes: [] });
    const d = depts.get(key);
    if (!d.name && dn) d.name = dn;
    const same = d.codes.find((x) => x.code === code && norm(x.name) === norm(name));
    const other = cell(ix.other).v; const type = cell(ix.type).v;
    if (same) { if (other) same.other = [same.other, other].filter(Boolean).join(', '); continue; }
    d.codes.push({ id: uid('bc'), name, code, type, other });
  }
  return { depts: [...depts.values()], struck };
}

async function uploadBankFile(file) {
  let rows;
  try {
    rows = /\.csv$/i.test(file.name) || file.type === 'text/csv'
      ? parseCsv(await file.text()).map((r) => r.map((v) => ({ v: v.trim(), strike: false })))
      : await readXlsx(await file.arrayBuffer());
  } catch (e) { toast('Could not read that file. ' + (e.message || ''), 'err', 7000); return; }
  let res;
  try { res = bankRowsToDepartments(rows); } catch (e) { toast(e.message, 'err', 8000); return; }
  const total = res.depts.reduce((n, d) => n + d.codes.length, 0);
  if (!total) { toast('No codes found in that file.', 'warn'); return; }
  const list = res.depts.map((d) => `${d.name || 'Department'}${d.number ? ' ' + d.number : ''}: ${d.codes.length} code${d.codes.length === 1 ? '' : 's'}`).join('; ');
  if (!(await ask('Upload banking codes?', `Found ${total} codes (${list}).${res.struck ? ` ${res.struck} crossed-out row${res.struck === 1 ? ' is' : 's are'} left out.` : ''} The codes of these departments will be replaced with the ones in the file. Other departments stay as they are.`, 'Upload'))) return;
  const ds = S.shared.departments;
  const blank = (d) => !cleanName(d.name) && !d.number.trim() && !d.codes.length;
  for (const nd of res.depts) {
    const match = ds.find((d) => nd.number && d.number.trim() === nd.number) || ds.find((d) => nd.name && norm(d.name).trim() === norm(nd.name).trim()) || ds.find(blank);
    if (match) { match.name = nd.name || match.name; match.number = nd.number || match.number; match.codes = nd.codes; }
    else ds.push({ id: uid('dp'), ...nd });
  }
  shBankQ = '';
  renderShared(); saveShared();
  toast(`${total} banking codes uploaded.`);
}

function downloadBankCodes() {
  const cell = (v) => { const x = String(v ?? ''); return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
  const rows = [['Department', 'Department Number', 'Code', 'Name', 'Type', 'Other names'].join(',')];
  for (const d of S.shared.departments) for (const c of d.codes) rows.push([d.name, d.number, c.code, c.name, c.type, c.other].map(cell).join(','));
  download(`banking-codes-${today()}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv');
}

function sharedPathGet(path) { return path.split('.').reduce((o, k) => o?.[k], S.shared); }

function openShared(tab) {
  if (tab) shTab = tab;
  $('#shSaved').textContent = Store.mode === 'local' ? 'Saved in this browser only' : 'Changes save automatically';
  renderShared();
  if (!$('#shDlg').open) $('#shDlg').showModal();
}

function saveShared() {
  clearTimeout(shTimer);
  $('#shSaved').textContent = 'Saving…';
  shTimer = setTimeout(async () => {
    try {
      await Store.saveMeta('shared', S.shared);
      $('#shSaved').textContent = 'All changes saved';
    } catch (e) { $('#shSaved').textContent = 'Not saved'; toast(e.message, 'err', 7000); }
    if (S.mode !== 'edit') renderDetail(); else renderChips();
    renderSide();
  }, 450);
}

const phCode = (name) => (name ? `<button type="button" class="phc" data-copyph="${esc(name)}" title="Copy, to paste into a template">[${esc(name)}]</button>` : '');

function renderShared() {
  $$('#shTabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === shTab)));
  const sh = S.shared;
  const del = (list, i) => `<button type="button" class="x" data-shdel="${list}" data-i="${i}" title="Remove" aria-label="Remove">${ICON.x}</button>`;
  const inp = (path, val, ph = '') => `<input class="input" data-sh="${path}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false">`;
  const table = (heads, rows, empty) => `<div class="vt-wrap"><table class="vt sh-t"><thead><tr>${heads.map((x) => `<th>${x}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${heads.length + 1}" class="none" style="padding:10px">${empty}</td></tr>`}</tbody></table></div>`;
  let h = '';

  if (shTab === 'gate') {
    h = `<div class="sh-sec">
        <h5>Rotating gate codes</h5>
        <p>Each email that uses ${phCode('Gate Code')} gets one of these, picked at random. Update them here whenever the codes change.</p>
        <div class="code-list">${sh.gateCodes.map((c, i) => `<div class="code-row">${inp('gateCodes.' + i, c, 'e.g. 1234#')}${del('gateCodes', i)}</div>`).join('') || '<p class="none">No codes yet.</p>'}</div>
        <div><button class="btn" type="button" data-shadd="gateCodes">Add code</button></div>
      </div>
      <div class="sh-sec">
        <h5>Fixed gate code</h5>
        <p>Used by ${phCode('Fixed Gate Code')}, for example in the chalet emails. It's never part of the rotation.</p>
        <div class="code-row">${inp('fixedGateCode', sh.fixedGateCode, 'e.g. 1234#')}</div>
      </div>`;
  } else if (shTab === 'places') {
    const dm = defaultMap();
    h = `<p class="sh-intro">One row per building, chalet, bell tent or camping area. When you choose a building in an email, its row fills in ${phCode('Lock Code')}, ${phCode('Building Link')} and ${phCode('Building Map')}. The name has to match the building's name in the template.</p>` +
      table(['Name', 'Type', 'Lock code', 'Web page', 'Map', 'Its own link'], sh.places.map((x, i) => `<tr>
        <td class="w-name">${inp(`places.${i}.name`, x.name, 'e.g. Rymill Centre')}</td>
        <td class="w-kind"><select class="select" data-sh="places.${i}.kind">${PLACE_KINDS.map((k) => `<option${k === x.kind ? ' selected' : ''}>${k}</option>`).join('')}</select></td>
        <td class="w-code">${inp(`places.${i}.code`, x.code, 'none')}</td>
        <td class="w-url">${inp(`places.${i}.link`, x.link, 'https://…')}</td>
        <td class="w-map"><select class="select" data-sh="places.${i}.map"><option value="">${dm ? 'Default: ' + esc(dm.name) : 'None'}</option>${sh.maps.filter((m) => cleanName(m.name)).map((m) => `<option value="${esc(m.id)}"${m.id === x.map ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></td>
        <td>${cleanName(x.name) ? phCode(cleanName(x.name) + ' Link') : ''}</td>
        <td class="c">${del('places', i)}</td></tr>`).join(''), 'No places yet.') +
      `<div><button class="btn" type="button" data-shadd="places">Add place</button></div>`;
  } else if (shTab === 'links') {
    h = `<p class="sh-intro">Web pages to link to, such as activities. In a template, select some words, click <b>Link</b> and choose the saved link, or type its name in square brackets.</p>` +
      table(['Name', 'Address', 'Use in templates'], sh.links.map((x, i) => `<tr>
        <td class="w-name">${inp(`links.${i}.name`, x.name, 'e.g. Disc Golf')}</td>
        <td class="w-url">${inp(`links.${i}.url`, x.url, 'https://…')}</td>
        <td>${cleanName(x.name) ? phCode(cleanName(x.name) + ' Link') : ''}</td>
        <td class="c">${del('links', i)}</td></tr>`).join(''), 'No links yet.') +
      `<div><button class="btn" type="button" data-shadd="links">Add link</button></div>`;
  } else if (shTab === 'maps') {
    h = `<p class="sh-intro">Maps used in emails. Replace a picture here and every email that uses it changes too. A place without its own map, or a map still waiting for its picture, uses the default: the one called Entry Map, or else the first map here.${sh.maps.some(mapMissing) ? ` <b>${sh.maps.filter(mapMissing).length} still need a picture.</b>` : ''}</p>` +
      table(['Picture', 'Name', 'Size in the email', 'Use in templates'], sh.maps.map((x, i) => {
        const im = x.image && imageMeta(x.image);
        return `<tr>
        <td class="w-pic"><button type="button" class="mapthumb" data-mappick="${i}" title="${im ? 'Change picture' : 'Choose picture'}">${im ? `<img src="${esc(imageUrl(x.image))}" alt="">` : '<span>Upload picture…</span>'}</button></td>
        <td class="w-name">${inp(`maps.${i}.name`, x.name, 'e.g. Entry Map')}</td>
        <td><select class="select" data-sh="maps.${i}.width">${[300, 400, 500, 550, 600, 700, 800].map((n) => `<option value="${n}"${n === +x.width ? ' selected' : ''}>${n} px wide</option>`).join('')}</select></td>
        <td>${cleanName(x.name) ? phCode(cleanName(x.name)) : ''}</td>
        <td class="c">${del('maps', i)}</td></tr>`;
      }).join(''), 'No maps yet.') +
      `<div><button class="btn" type="button" data-shadd="maps">Add map</button></div>`;
  } else if (shTab === 'bank') {
    const ds = sh.departments;
    const q = norm(shBankQ).split(/\s+/).filter(Boolean);
    const shows = (c) => !q.length || q.every((x) => (norm(c.name) + ' ' + norm(c.other) + ' ' + norm(c.code) + ' ' + norm(c.type)).includes(x));
    h = `<p class="sh-intro">Choose the department on the email screen and its number goes into ${phCode('Department Number')} (and its name into ${phCode('Department')}). Then search its codes by name, e.g. <i>equ</i>, and the code fills in ${phCode('Banking Code')} (and its name ${phCode('Banking Code Name')}). <b>Other names</b> are extra words that find the code too, e.g. <i>gear, kit</i>.</p>
      <div class="bank-tools">
        <input class="input" id="shBankQ" value="${esc(shBankQ)}" placeholder="Find a code in this list" autocomplete="off" spellcheck="false">
        <button class="btn" type="button" data-bankupload>Upload spreadsheet</button>
        <button class="link" type="button" data-bankdownload>Download as spreadsheet</button>
        <input type="file" id="bankFile" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
      </div>
      <p class="sh-intro">A spreadsheet to upload has the columns <b>Department</b>, <b>Department Number</b>, <b>Code</b>, <b>Name</b>, <b>Type</b> and <b>Other names</b> (Excel .xlsx or .csv). Rows that are crossed out in Excel are left out. Uploading replaces the codes of each department in the file; other departments stay as they are. <i>Download as spreadsheet</i> gives you the current list in that layout.</p>` +
      ds.map((d, di) => {
        const rows = d.codes.map((c, ci) => shows(c) ? `<tr>
          <td class="w-name">${inp(`departments.${di}.codes.${ci}.name`, c.name, 'e.g. Equipment hire')}</td>
          <td class="w-code">${inp(`departments.${di}.codes.${ci}.code`, c.code, 'e.g. 4120')}</td>
          <td class="w-type">${inp(`departments.${di}.codes.${ci}.type`, c.type, 'e.g. Expense')}</td>
          <td class="w-url">${inp(`departments.${di}.codes.${ci}.other`, c.other, 'other words to search by')}</td>
          <td class="c">${del(`departments.${di}.codes`, ci)}</td></tr>` : '').join('');
        const hidden = d.codes.filter((c) => !shows(c)).length;
        return `<div class="sh-sec dept">
          <div class="dept-h">
            <label class="field"><span class="lbl">Department name</span>${inp(`departments.${di}.name`, d.name, 'e.g. Accommodation')}</label>
            <label class="field w-num"><span class="lbl">Department number</span>${inp(`departments.${di}.number`, d.number, 'e.g. 200')}</label>
            ${ds.length > 1 ? `<button type="button" class="link danger" data-shdel="departments" data-i="${di}">Remove department</button>` : ''}
          </div>
          ${table(['Code name', 'Code', 'Type', 'Other names'], rows, q.length ? `No codes match “${esc(shBankQ.trim())}”.` : 'No codes yet.')}
          ${hidden && q.length ? `<p class="none">${hidden} other code${hidden === 1 ? '' : 's'} hidden by the search.</p>` : ''}
          <div class="bank-add">
            <button class="btn" type="button" data-shaddcode="${di}">Add code</button>
            <details><summary>Paste a list</summary>
              <p>One code per line: the name, then the code, separated by a tab (copy two columns from Excel), a comma or a dash. A third column becomes its other names.</p>
              <textarea class="input" data-bankpaste="${di}" rows="5" placeholder="Equipment hire	4120
Catering, 4130"></textarea>
              <div><button class="btn" type="button" data-bankpasteadd="${di}">Add these codes</button></div>
            </details>
          </div>
        </div>`;
      }).join('') +
      `<div><button class="btn" type="button" data-shadd="departments">Add department</button></div>`;
  } else {
    h = `<p class="sh-intro">Anything else that appears in several templates, such as a phone number. Change it here and every email picks it up.</p>` +
      table(['Name', 'Value', 'Use in templates'], sh.details.map((x, i) => `<tr>
        <td class="w-name">${inp(`details.${i}.name`, x.name, 'e.g. Caretaker Phone')}</td>
        <td class="w-url">${inp(`details.${i}.value`, x.value)}</td>
        <td>${cleanName(x.name) ? phCode(cleanName(x.name)) : ''}</td>
        <td class="c">${del('details', i)}</td></tr>`).join(''), 'Nothing here yet.') +
      `<div><button class="btn" type="button" data-shadd="details">Add detail</button></div>`;
  }
  $('#shBody').innerHTML = h;
}

function setSharedPath(path, value) {
  const parts = path.split('.');
  let o = S.shared;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  const k = parts[parts.length - 1];
  o[k] = k === 'width' ? +value : value;
}

function bindShared() {
  const dlg = $('#shDlg');
  $('#sharedBtn').addEventListener('click', () => openShared());
  $('#setShared').addEventListener('click', () => { $('#setDlg').close(); openShared(); });
  $('#shTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { shTab = b.dataset.tab; renderShared(); } });
  dlg.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'shBankQ') {
      shBankQ = el.value; const at = el.selectionStart;
      renderShared(); const f = $('#shBankQ'); f.focus(); f.setSelectionRange(at, at);
      return;
    }
    if (el.dataset.sh && el.tagName === 'INPUT') { setSharedPath(el.dataset.sh, el.value); saveShared(); }
  });
  dlg.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'bankFile') { const f = el.files[0]; el.value = ''; if (f) uploadBankFile(f); return; }
    if (!el.dataset.sh) return;
    if (el.tagName === 'SELECT') { setSharedPath(el.dataset.sh, el.value); saveShared(); }
    if (el.tagName === 'SELECT' || (/\.name$/.test(el.dataset.sh) && !el.dataset.sh.startsWith('departments.'))) renderShared(); // refresh the [placeholder] shown next to it
  });
  dlg.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-shadd]');
    if (add) {
      const list = add.dataset.shadd;
      const blank = { departments: { id: uid('dp'), name: '', number: '', codes: [] }, gateCodes: '', places: { id: uid('pl'), name: '', kind: 'Building', code: '', link: '', map: '' }, links: { id: uid('ln'), name: '', url: '' }, maps: { id: uid('mp'), name: '', image: '', width: 600 }, details: { id: uid('dt'), name: '', value: '' } }[list];
      S.shared[list].push(blank);
      renderShared();
      if (list === 'departments') { $(`#shBody [data-sh="departments.${S.shared.departments.length - 1}.name"]`)?.focus(); saveShared(); return; }
      $$(`#shBody [data-sh^="${list}."]`).filter((i) => i.tagName === 'INPUT').at(list === 'gateCodes' ? -1 : -(list === 'places' ? 3 : 2))?.focus();
      return;
    }
    const addc = e.target.closest('[data-shaddcode]');
    if (addc) {
      const di = +addc.dataset.shaddcode; const d = S.shared.departments[di];
      d.codes.push({ id: uid('bc'), name: '', code: '', type: '', other: '' });
      shBankQ = '';
      renderShared();
      $(`#shBody [data-sh="departments.${di}.codes.${d.codes.length - 1}.name"]`)?.focus();
      return;
    }
    if (e.target.closest('[data-bankupload]')) { $('#bankFile').click(); return; }
    if (e.target.closest('[data-bankdownload]')) { downloadBankCodes(); return; }
    const pa = e.target.closest('[data-bankpasteadd]');
    if (pa) {
      const di = +pa.dataset.bankpasteadd; const d = S.shared.departments[di];
      const list = parseCodeList($(`#shBody [data-bankpaste="${di}"]`).value);
      if (!list.length) { toast('Nothing to add. Paste one code per line first.', 'warn'); return; }
      // A name already in this department gets its code updated instead of a second copy.
      let added = 0, updated = 0;
      for (const c of list) {
        const same = c.name && d.codes.find((x) => norm(x.name).trim() === norm(c.name).trim());
        if (same) { same.code = c.code || same.code; if (c.other) same.other = c.other; updated++; } else { d.codes.push(c); added++; }
      }
      shBankQ = '';
      renderShared(); saveShared();
      toast(`${added} code${added === 1 ? '' : 's'} added${updated ? `, ${updated} updated` : ''} in ${deptLabel(d, di)}.`);
      return;
    }
    const delb = e.target.closest('[data-shdel]');
    if (delb) {
      const list = delb.dataset.shdel; const i = +delb.dataset.i; const arr = sharedPathGet(list); const item = arr[i];
      const label = typeof item === 'string' ? item : item.name || (list === 'departments' && item.codes.length ? deptLabel(item, i) : '');
      if (label && !(await ask('Remove?', list === 'departments'
        ? `Remove the “${label}” department and its ${item.codes.length} code${item.codes.length === 1 ? '' : 's'}?`
        : `Remove “${label}” from Codes & links? Templates that use it will show it as a blank to fill in.`, 'Remove'))) return;
      arr.splice(i, 1);
      if (list === 'maps') for (const pl of S.shared.places) if (pl.map === item.id) pl.map = '';
      renderShared(); saveShared();
      return;
    }
    const pc = e.target.closest('[data-copyph]');
    if (pc) { if (await copyText('[' + pc.dataset.copyph + ']')) toast(`Copied [${pc.dataset.copyph}]. Paste it into a template.`); return; }
    const mp = e.target.closest('[data-mappick]');
    if (mp) {
      const m = S.shared.maps[+mp.dataset.mappick];
      openImageDialog(null, (id) => {
        m.image = id;
        const meta = imageMeta(id);
        if (!cleanName(m.name) && meta) m.name = meta.name;
        renderShared(); saveShared();
      }, m.image || null);
    }
  });
}

/* ======================================================= Bold and images */

function isBodyBox(el) { return el && (el.id === 'edBody' || el.dataset?.vk === 'body'); }

/** The email body a toolbar button belongs to. */
function formatTarget(btn) {
  if (btn.dataset.for != null) return $(`#edVars textarea[data-vi="${btn.dataset.for}"][data-vk="body"]`);
  return S.mode === 'edit' ? $('#edBody') : null;
}

function replaceRange(el, start, end, text, selStart, selEnd) {
  el.focus();
  el.setSelectionRange(start, end);
  // execCommand keeps the browser's undo history (Ctrl+Z) working; fall back if it's unavailable.
  if (!document.execCommand || !document.execCommand('insertText', false, text)) {
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.setSelectionRange(selStart, selEnd);
}

function toggleBold(el) {
  let s0 = el.selectionStart, s1 = el.selectionEnd;
  const v = el.value;
  // Leave out spaces at the edges of the selection (double-click selects a trailing space).
  while (s1 > s0 && /\s/.test(v[s1 - 1])) s1--;
  while (s0 < s1 && /\s/.test(v[s0])) s0++;
  const sel = v.slice(s0, s1);
  if (sel.startsWith('**') && sel.endsWith('**') && sel.length >= 4) {
    replaceRange(el, s0, s1, sel.slice(2, -2), s0, s1 - 4);
  } else if (v.slice(s0 - 2, s0) === '**' && v.slice(s1, s1 + 2) === '**') {
    replaceRange(el, s0 - 2, s1 + 2, sel, s0 - 2, s1 - 2);
  } else if (sel.includes('\n')) {
    toast('Bold works within one line at a time. Select text on a single line.', 'warn');
  } else if (!sel) {
    replaceRange(el, s0, s1, '**bold text**', s0 + 2, s0 + 11);
  } else {
    replaceRange(el, s0, s1, '**' + sel + '**', s0 + 2, s1 + 2);
  }
}

/** Shrink big photos before upload so emails stay light and the database stays small. */
async function prepareImage(file) {
  if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type)) throw new Error('Choose a JPEG, PNG or GIF image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("That file couldn't be read as an image.")); i.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight;
    const MAXW = 1400;
    if (['image/png', 'image/jpeg', 'image/gif'].includes(file.type) && w <= MAXW && file.size <= 900 * 1024) {
      return { blob: file, width: w, height: h };
    }
    const scale = Math.min(1, MAXW / w);
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d');
    const toBlob = (type, q) => new Promise((ok) => c.toBlob(ok, type, q));
    let blob = null;
    if (file.type === 'image/png' || file.type === 'image/gif') {
      ctx.drawImage(img, 0, 0, c.width, c.height);
      blob = await toBlob('image/png');
    }
    if (!blob || blob.size > 900 * 1024) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      blob = await toBlob('image/jpeg', 0.86);
      if (blob.size > 1.4 * 1024 * 1024) blob = await toBlob('image/jpeg', 0.7);
    }
    return { blob, width: c.width, height: c.height };
  } finally { URL.revokeObjectURL(url); }
}

const LINK_DLG = { target: null, start: 0, end: 0, editing: false };

/** Tidy what was typed into the address box; returns '' if it isn't usable. */
function normaliseAddress(raw) {
  let u = String(raw || '').trim().replace(/\|/g, '%7C').replace(/\}/g, '%7D').replace(/\s+/g, '');
  if (!u) return '';
  if (/^\[[^\[\]]+\]$/.test(u)) return u;                       // a placeholder, filled in per email
  if (/^www\./i.test(u)) u = 'https://' + u;
  else if (/^[^\s@/:]+@[^\s@/]+\.[a-z]{2,}$/i.test(u)) u = 'mailto:' + u;
  else if (/^\+?[\d\s()-]{6,}$/.test(raw.trim())) u = 'tel:' + raw.trim().replace(/[^\d+]/g, '');
  else if (!/^[a-z]+:/i.test(u) && /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(u)) u = 'https://' + u;
  return safeHref(u) ? u : '';
}

function openLinkDialog(ta) {
  const v = ta.value;
  let s0 = ta.selectionStart, s1 = ta.selectionEnd;
  LINK_DLG.target = ta; LINK_DLG.editing = false;
  // Cursor on an existing link: edit that link.
  for (const m of v.matchAll(LINK)) {
    if (m.index <= s0 && s1 <= m.index + m[0].length) {
      LINK_DLG.editing = true; LINK_DLG.start = m.index; LINK_DLG.end = m.index + m[0].length;
      $('#lnkText').value = m[2]; $('#lnkUrl').value = m[1].replace(/^mailto:/i, '');
      break;
    }
  }
  if (!LINK_DLG.editing) {
    while (s1 > s0 && /\s/.test(v[s1 - 1])) s1--;
    while (s0 < s1 && /\s/.test(v[s0])) s0++;
    const sel = v.slice(s0, s1);
    if (sel.includes('\n')) { toast('Select text on a single line to make a link.', 'warn'); return; }
    LINK_DLG.start = s0; LINK_DLG.end = s1;
    const looksLikeAddress = sel && !/\s/.test(sel) && !!normaliseAddress(sel) && /[.@:]/.test(sel);
    $('#lnkText').value = sel.replace(/\*\*/g, '');
    $('#lnkUrl').value = looksLikeAddress ? sel : '';
  }
  const saved = [...S.shared.links, ...S.shared.places].map((x) => cleanName(x.name)).filter(Boolean);
  $('#lnkSaved').innerHTML = '<option value="">Choose a saved link…</option>' + saved.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  $('#lnkSavedRow').hidden = !saved.length;
  $('#lnkTitle').textContent = LINK_DLG.editing ? 'Edit link' : 'Insert link';
  $('#lnkOk').textContent = LINK_DLG.editing ? 'Update link' : 'Insert link';
  $('#lnkRemove').hidden = !LINK_DLG.editing;
  $('#lnkErr').hidden = true;
  $('#linkDlg').showModal();
  ($('#lnkText').value ? $('#lnkUrl') : $('#lnkText')).focus();
}

function bindLinkDialog() {
  const dlg = $('#linkDlg');
  const back = (text, caret) => { dlg.close(); replaceRange(LINK_DLG.target, LINK_DLG.start, LINK_DLG.end, text, caret ?? LINK_DLG.start + text.length, caret ?? LINK_DLG.start + text.length); };
  $('#lnkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('#lnkUrl').value;
    const url = normaliseAddress(raw);
    if (!url) {
      const err = $('#lnkErr');
      err.textContent = raw.trim() ? 'That doesn\'t look like a web or email address. Try something like www.example.com or name@example.com.' : 'Enter the address the link should go to.';
      err.hidden = false; $('#lnkUrl').focus(); return;
    }
    const text = $('#lnkText').value.replace(/[{}|\n]/g, ' ').replace(/\s+/g, ' ').trim() || url.replace(/^mailto:/i, '');
    if (!LINK_DLG.target || !document.contains(LINK_DLG.target)) { dlg.close(); return; }
    back(`{{link:${url}|${text}}}`);
  });
  $('#lnkSaved').addEventListener('change', (e) => {
    const n = e.target.value; if (!n) return;
    $('#lnkUrl').value = '[' + n + ' Link]';
    if (!$('#lnkText').value.trim()) $('#lnkText').value = n;
    e.target.value = '';
  });
  $('#lnkRemove').addEventListener('click', () => {
    const m = LINK_DLG.target.value.slice(LINK_DLG.start, LINK_DLG.end).match(/^\{\{link:([^|}\n]+)\|([^}\n]*)\}\}$/);
    if (m) back(m[2].trim() || m[1]);
  });
}

const IMG_DLG = { target: null, selected: null, onPick: null };

function imageUses(id) {
  return S.templates.filter((t) => [t.body, ...t.variations.map((v) => v.body)].some((b) => String(b || '').includes('{{image:' + id)));
}

function fmtSize(n) { return n > 1024 * 1024 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

function renderImageDialog() {
  const sel = IMG_DLG.selected && imageMeta(IMG_DLG.selected);
  $('#imgGrid').innerHTML = S.images.length
    ? S.images.map((m) => `<button type="button" class="thumb" data-img="${esc(m.id)}" aria-pressed="${m.id === IMG_DLG.selected}" title="${esc(m.name)}">
        <span class="tbox"><img src="${esc(imageUrl(m.id))}" alt="" loading="lazy"></span>
        <span class="tname">${esc(m.name)}</span><span class="tmeta">${m.width}×${m.height} · ${fmtSize(m.size || 0)}</span></button>`).join('')
    : '<p class="none" style="grid-column:1/-1;margin:0">No images yet. Upload one to get started.</p>';
  $('#imgSel').hidden = !sel;
  $('#imgInsert').disabled = !sel;
  $('#imgDelete').hidden = !sel;
  if (sel) {
    $('#imgName').value = sel.name;
    const opts = [[200, 'Small'], [400, 'Medium'], [600, 'Large']].filter(([w]) => w < sel.width);
    opts.push([Math.min(sel.width, 1400), 'Actual size']);
    const def = Math.min(sel.width, 600);
    $('#imgWidth').innerHTML = opts.map(([w, l]) => `<option value="${w}"${w === def ? ' selected' : ''}>${l} (${w} px wide)</option>`).join('');
  }
}

function openImageDialog(target, onPick = null, current = null) {
  IMG_DLG.target = target;
  IMG_DLG.onPick = onPick;
  IMG_DLG.selected = current;
  $('#imgDlg h3').textContent = onPick ? 'Choose a map picture' : 'Insert image';
  $('#imgInsert').textContent = onPick ? 'Use this picture' : 'Insert image';
  $('#imgSel').classList.toggle('pick', !!onPick);
  $('#imgErr').hidden = true;
  renderImageDialog();
  $('#imgDlg').showModal();
}

async function uploadFiles(files) {
  const err = $('#imgErr'); err.hidden = true;
  for (const file of files) {
    const status = $('#imgBusy'); status.hidden = false; status.textContent = 'Uploading ' + (file.name || 'image') + '…';
    try {
      const { blob, width, height } = await prepareImage(file);
      const name = (file.name || 'Pasted image').replace(/\.[a-z0-9]+$/i, '').replace(/[|{}]/g, ' ').trim().slice(0, 80) || 'Image';
      const saved = await Store.uploadImage(blob, { name, width, height });
      S.images.unshift(saved);
      IMG_DLG.selected = saved.id;
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
    } finally { status.hidden = true; }
  }
  renderImageDialog();
}

function insertImageToken() {
  if (IMG_DLG.onPick) {
    const id = IMG_DLG.selected; const fn = IMG_DLG.onPick;
    $('#imgDlg').close(); IMG_DLG.onPick = null;
    if (id) fn(id);
    return;
  }
  const m = imageMeta(IMG_DLG.selected); const el = IMG_DLG.target;
  if (!m || !el || !document.contains(el)) { $('#imgDlg').close(); return; }
  const name = $('#imgName').value.replace(/[|{}\n]/g, ' ').trim() || m.name;
  const token = `{{image:${m.id}|${name}|${$('#imgWidth').value}}}`;
  const v = el.value; const at = el.selectionStart ?? v.length; const end = el.selectionEnd ?? at;
  // Put the image on a line of its own.
  const before = at > 0 && v[at - 1] !== '\n' ? '\n' : '';
  const after = v[end] !== '\n' ? '\n' : '';
  $('#imgDlg').close();
  const text = before + token + after;
  replaceRange(el, at, end, text, at + text.length, at + text.length);
}

function bindImageDialog() {
  const dlg = $('#imgDlg');
  $('#imgUpload').addEventListener('click', () => $('#imgFile').click());
  $('#imgFile').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) uploadFiles(f); });
  $('#imgGrid').addEventListener('click', (e) => { const t = e.target.closest('[data-img]'); if (t) { IMG_DLG.selected = t.dataset.img; renderImageDialog(); } });
  $('#imgGrid').addEventListener('dblclick', (e) => { if (e.target.closest('[data-img]')) insertImageToken(); });
  $('#imgInsert').addEventListener('click', insertImageToken);
  dlg.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); uploadFiles(files); }
  });
  const drop = $('#imgDrop');
  ['dragenter', 'dragover'].forEach((ev) => dlg.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => dlg.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === dlg) drop.classList.remove('over'); }));
  dlg.addEventListener('drop', (e) => { const f = [...(e.dataTransfer?.files || [])].filter((x) => x.type.startsWith('image/')); if (f.length) uploadFiles(f); });
  $('#imgDelete').addEventListener('click', async () => {
    const m = imageMeta(IMG_DLG.selected); if (!m) return;
    const uses = imageUses(m.id);
    dlg.close();
    const ok = await ask('Delete image?', `Delete “${m.name}” from the image library?` + (uses.length ? ` It's used in ${uses.length} template${uses.length === 1 ? '' : 's'} (${uses.slice(0, 3).map((t) => t.name).join(', ')}${uses.length > 3 ? '…' : ''}), which will show it as missing. Emails already sent will lose the picture too.` : ''), 'Delete image');
    if (ok) {
      try { await Store.deleteImage(m.id); S.images = S.images.filter((x) => x.id !== m.id); IMG_DLG.selected = null; toast('Image deleted'); if (S.mode !== 'edit') updatePreview(); }
      catch (e) { toast(e.message, 'err', 7000); }
    }
    renderImageDialog(); dlg.showModal();
  });
}

function insertPlaceholder(name) {
  const el = bind.lastText && document.contains(bind.lastText) ? bind.lastText : $('#edBody');
  const token = '[' + name + ']';
  const s = el.selectionStart ?? el.value.length, e2 = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + token + el.value.slice(e2);
  el.focus();
  el.setSelectionRange(s + token.length, s + token.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ===================================================================== Boot */

async function boot() {
  bind();
  let data;
  try {
    data = await Store.load();
  } catch (e) {
    setStatus('err', 'Not connected');
    showBanner(`${esc(e.message)} <button class="btn" type="button" onclick="location.reload()">Try again</button>`);
    $('#detail').innerHTML = '<div class="blank">The library could not be loaded.</div>';
    return;
  }
  S.templates = data.templates.map(normaliseTemplate);
  S.categories = Array.isArray(data.categories) ? data.categories : clone(window.SEED.categories);
  S.usage = { recent: [], counts: {}, last: {}, ...(data.usage || {}) };
  try { S.images = await Store.listImages(); } catch { /* the library still works without images */ }
  S.shared = normaliseShared(data.shared || window.SEED.shared);
  if (!data.shared && (data.initialised || data.templates.length)) Store.saveMeta('shared', S.shared).catch(() => {});

  if (!data.initialised && !S.templates.length) {
    try { await addSeed({ silent: true }); Store.saveMeta('shared', S.shared).catch(() => {}); }
    catch (e) { toast("Couldn't load the starter examples: " + e.message, 'err', 7000); }
  } else if (!Array.isArray(data.categories)) {
    Store.saveMeta('categories', S.categories).catch(() => {});
  }

  if (Store.mode === 'local') {
    showBanner('<b>Saved in this browser only.</b>&nbsp;This copy of the site isn\'t connected to the database, so templates stay on this computer. Use Settings → Download JSON backup to keep a copy.');
  }
  setStatus();
  renderAll();
  if (matchMedia('(min-width: 721px)').matches) $('#q').focus();
  else $('#q').placeholder = 'Search templates';
}

boot();
