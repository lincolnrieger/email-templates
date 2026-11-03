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
        return { templates: d.templates || [], categories: d.meta?.categories || null, usage: d.meta?.usage || null, initialised: !!d.meta?.initialised };
      }
      // 404: no API here at all (opened as a plain static page). 503: the
      // Worker has no database bound. Anything else is a real failure that
      // should not quietly switch storage.
      if (res.status !== 404 && res.status !== 503) throw new Error('The server returned an error (' + res.status + '). Try again in a moment.');
    }
    this.mode = 'local';
    let d = {};
    try { d = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch {}
    return { templates: d.templates || [], categories: d.categories || null, usage: d.usage || null, initialised: !!d.initialised };
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
};

/* ==================================================================== State */

const S = {
  templates: [],
  categories: [],
  usage: { recent: [], counts: {}, last: {} },
  view: 'all',          // 'all' | 'fav' | 'recent' | 'cat:<id>' | 'cat:' (uncategorised)
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

  let variationId = null;
  for (const v of t.variations) {
    const b = norm(v.building);
    if (toks.some((tok) => tok.length >= 3 && b.includes(tok))) { variationId = v.id; break; }
  }
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
    if (S.view === 'recent' && !S.usage.recent.includes(t.id)) continue;
    if (S.view.startsWith('cat:')) {
      const cid = S.view.slice(4);
      if (cid ? t.categoryId !== cid : S.categories.some((c) => c.id === t.categoryId)) continue;
    }
    if (S.building && !t.variations.some((v) => v.building === S.building)) continue;
    const m = scoreTemplate(t, toks, S.query);
    if (!m) continue;
    list.push({ t, score: m.score, variationId: m.variationId });
  }
  const sort = S.sort === 'best' && !toks.length ? (S.view === 'recent' ? 'recent' : 'name') : S.sort;
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
  if (S.view === 'recent') return 'Recently used';
  if (S.view.startsWith('cat:')) return catName(S.view.slice(4));
  return 'All templates';
}

function renderSide() {
  const favN = S.templates.filter((t) => t.favourite).length;
  const recN = S.usage.recent.filter((id) => byId(id)).length;
  const item = (view, label, n, icon) =>
    `<li><button type="button" data-view="${esc(view)}" aria-current="${S.view === view}">${icon || ''}<span class="nm">${esc(label)}</span><span class="n">${n}</span></button></li>`;
  $('#views').innerHTML =
    item('all', 'All templates', S.templates.length, ICON.all) +
    item('fav', 'Favourites', favN, ICON.star) +
    item('recent', 'Recently used', recN, ICON.clock);
  const counts = {};
  for (const t of S.templates) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
  const known = new Set(S.categories.map((c) => c.id));
  const uncategorised = S.templates.filter((t) => !known.has(t.categoryId)).length;
  $('#cats').innerHTML = S.categories.map((c) => item('cat:' + c.id, c.name, counts[c.id] || 0)).join('') +
    (uncategorised ? item('cat:', 'Uncategorised', uncategorised) : '');

  // Small screens: the sidebar collapses into this dropdown.
  const opts = [['all', 'All templates'], ['fav', 'Favourites'], ['recent', 'Recently used'], ...S.categories.map((c) => ['cat:' + c.id, c.name]), ...(uncategorised ? [['cat:', 'Uncategorised']] : [])];
  $('#mCat').innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}"${S.view === v ? ' selected' : ''}>${esc(l)}</option>`).join('');

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

function renderAll() {
  renderSide();
  renderList();
  renderDetail();
}

/* ============================================================ Detail: use */

function work(t) {
  if (!S.work[t.id]) {
    S.work[t.id] = { varId: '', subject: null, body: null, values: {}, base: t.updatedAt };
  }
  const w = S.work[t.id];
  // Saved elsewhere since: keep any edits on screen; they now compare against the new version.
  if (w.base !== t.updatedAt) w.base = t.updatedAt;
  if (w.varId && !t.variations.some((v) => v.id === w.varId)) w.varId = '';
  return w;
}

function currentVariation(t, w) { return t.variations.find((v) => v.id === w.varId) || null; }

/** The stored subject/body that the Use view starts from (building's own email, if it has one). */
function storedText(t, v) {
  if (v && v.ownEmail) return { subject: v.subject, body: v.body, where: v.building + ' version' };
  return { subject: t.subject, body: t.body, where: t.variations.length ? 'shared email (all buildings)' : 'template' };
}

function workingText(t, w) {
  const st = storedText(t, currentVariation(t, w));
  return { subject: w.subject ?? st.subject, body: w.body ?? st.body, stored: st };
}

function autoValues(t, w) {
  const out = {};
  const v = currentVariation(t, w);
  if (v) {
    out['Building Name'] = v.building;
    for (const [k, x] of Object.entries(v.values)) if (x !== '') out[k] = x;
  }
  const me = prefs().name;
  if (me) out['Your Name'] = me;
  return out;
}

function resolvedValues(t, w) {
  const auto = autoValues(t, w);
  const out = { ...auto };
  for (const [k, x] of Object.entries(w.values)) out[k] = x;
  return { values: out, auto };
}

function fill(text, values) {
  return String(text || '').replace(PH, (m, k) => (values[k] != null && values[k] !== '' ? values[k] : m));
}

function previewHtml(text, values) {
  // Escape first, then mark placeholders. Brackets are not touched by esc().
  return String(text || '').split('\n').map((line) => {
    const html = esc(line).replace(PH, (m, k) => {
      const raw = Object.prototype.hasOwnProperty.call(values, k) ? values[k] : null;
      return raw != null && raw !== '' ? `<span class="ph-f" title="[${esc(k)}]">${esc(raw)}</span>` : `<span class="ph-e">${m}</span>`;
    });
    return `<p>${html || '&nbsp;'}</p>`;
  }).join('');
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
      <p style="margin-top:10px"><span class="k">/</span> search &nbsp; <span class="k">↑</span> <span class="k">↓</span> move &nbsp; <span class="k">Enter</span> fill in</p>
    </div></div>`;
    return;
  }
  const w = work(t);
  const v = currentVariation(t, w);
  el.innerHTML = `
  <div class="d-head">
    <button class="btn quiet icon back" type="button" data-act="close" aria-label="Back to list">${ICON.back}</button>
    <div class="d-title">
      <div class="crumb"><span>${esc(catName(t.categoryId))}</span>${t.keywords.length ? `<span class="kw">· ${esc(t.keywords.slice(0, 6).join(', '))}</span>` : ''}</div>
      <h2><span>${esc(t.name)}</span><button class="fav" type="button" data-act="fav" aria-pressed="${t.favourite}" title="${t.favourite ? 'Remove from favourites' : 'Add to favourites'}">${ICON.star}</button></h2>
      ${t.description ? `<p>${esc(t.description)}</p>` : ''}
    </div>
    <div class="d-actions">
      <button class="btn" type="button" data-act="edit">${ICON.edit}Edit template</button>
      <button class="btn" type="button" data-act="dup">${ICON.dup}Duplicate</button>
      <button class="btn danger" type="button" data-act="del">${ICON.trash}Delete</button>
    </div>
  </div>

  <div class="work">
    <div class="stack">
      <div class="box">
        ${t.variations.length ? `
        <div class="building">
          <label class="lbl" for="varSel">Building</label>
          <select class="select" id="varSel">
            <option value="">Select a building…</option>
            ${t.variations.map((x) => `<option value="${esc(x.id)}"${x.id === w.varId ? ' selected' : ''}>${esc(x.building)}</option>`).join('')}
          </select>
          <div class="facts" id="facts">${factsHtml(t, v)}</div>
        </div>` : ''}
        <div class="box-h"><h4>Fill in</h4><button class="link sp" type="button" data-act="clearvals">Clear</button></div>
        <div class="box-b" id="phGrid"></div>
      </div>

      <div class="box">
        <div class="box-h"><h4>Email</h4><span class="help sp" style="margin:0">Edits here change this email only, unless you save them.</span></div>
        <div class="box-b stack">
          <div class="field"><label class="lbl" for="wSubj">Subject</label><input class="input" id="wSubj"></div>
          <div class="field"><label class="lbl" for="wBody">Body</label><textarea class="textarea body-ta" id="wBody" spellcheck="true"></textarea></div>
        </div>
        <div class="savebar" id="saveBar"></div>
      </div>

      ${t.notes ? `<div class="notes"><b>Internal notes · not copied</b>${esc(t.notes)}</div>` : ''}
    </div>

    <div class="box preview">
      <div class="copybar">
        <button class="btn primary lg" type="button" data-act="copy">${ICON.copy}Copy email</button>
        <button class="btn lg" type="button" data-act="copysubj">Copy subject</button>
      </div>
      <div class="mail-subj"><span>Subject</span><span id="pvSubj"></span></div>
      <div class="mail" id="pvBody"></div>
      <div class="unfilled" id="pvWarn" hidden></div>
    </div>
  </div>`;

  const wt = workingText(t, w);
  $('#wSubj').value = wt.subject;
  $('#wBody').value = wt.body;
  autosize($('#wBody'));
  setGrid(t, w);
  updatePreview();
  updateSaveBar();
}

function factsHtml(t, v) {
  if (!v) return '<span>Choose the building to load its details into the email.</span>';
  const entries = t.fields.filter((f) => v.values[f]).slice(0, 6);
  return entries.map((f) => `<span>${esc(f)}: <b>${esc(v.values[f])}</b></span>`).join('') + (v.ownEmail ? '<span><b>Has its own version of the email</b></span>' : '');
}

function placeholdersOf(t, w) {
  const wt = workingText(t, w);
  return placeholdersIn(wt.subject, wt.body);
}

function phGridHtml(t, w, fields) {
  if (!fields.length) return '<div class="none">This email has no placeholders.</div>';
  const { auto } = resolvedValues(t, w);
  const v = currentVariation(t, w);
  const input = (k) => {
    const has = Object.prototype.hasOwnProperty.call(w.values, k);
    const val = has ? w.values[k] : (auto[k] ?? '');
    const big = String(val).length > 60;
    const changed = has && auto[k] != null && w.values[k] !== auto[k];
    return `<div class="field"${big ? ' style="grid-column:1/-1"' : ''}><label class="lbl"><span>${esc(k)}</span>${changed ? '<span class="src">changed for this email</span>' : ''}</label>
      <input class="input${auto[k] != null && !has ? ' auto' : ''}" data-ph="${esc(k)}" value="${esc(val)}" placeholder="[${esc(k)}]" autocomplete="off" aria-label="${esc(k)}"></div>`;
  };
  // Values that fill themselves in (from the building or Settings) are tucked
  // away below, so only what still needs typing is in view.
  const manual = fields.filter((k) => auto[k] == null);
  const pre = fields.filter((k) => auto[k] != null);
  const from = [v ? v.building : '', pre.includes('Your Name') && prefs().name ? 'your settings' : ''].filter(Boolean).join(' and ');
  return (manual.length ? `<div class="ph-grid">${manual.map(input).join('')}</div>` : '<div class="none">Everything is filled in automatically.</div>') +
    (pre.length ? `<details class="pre"${w.showPre ? ' open' : ''}><summary>${pre.length} filled in from ${esc(from)}<span class="help"> · open to change them for this email</span></summary><div class="ph-grid">${pre.map(input).join('')}</div></details>` : '');
}

function setGrid(t, w) {
  const grid = $('#phGrid'); if (!grid) return;
  const fields = placeholdersOf(t, w);
  grid.innerHTML = phGridHtml(t, w, fields);
  grid.dataset.sig = fields.join('\u0001');
}

function updatePreview() {
  const t = byId(S.selectedId); if (!t) return;
  const w = work(t);
  const wt = workingText(t, w);
  const { values } = resolvedValues(t, w);
  $('#pvSubj').innerHTML = previewHtml(wt.subject, values).replace(/^<p>|<\/p>$/g, '');
  $('#pvBody').innerHTML = previewHtml(wt.body, values);
  const missing = placeholdersIn(wt.subject, wt.body).filter((k) => !values[k]);
  const warn = $('#pvWarn');
  warn.hidden = !missing.length;
  warn.textContent = missing.length ? `Not filled in yet: ${missing.map((k) => '[' + k + ']').join(', ')}. These stay in the copied text as they are.` : '';
}

function refreshPlaceholderGrid() {
  const t = byId(S.selectedId); if (!t) return;
  const w = work(t);
  const fields = placeholdersOf(t, w);
  const grid = $('#phGrid');
  if (grid.dataset.sig !== fields.join('\u0001')) {
    const focusPh = document.activeElement?.dataset?.ph;
    setGrid(t, w);
    if (focusPh) $(`[data-ph="${CSS.escape(focusPh)}"]`, grid)?.focus();
  }
}

function isUseDirty(t, w) {
  const st = storedText(t, currentVariation(t, w));
  return (w.subject != null && w.subject !== st.subject) || (w.body != null && w.body !== st.body);
}

function updateSaveBar() {
  const t = byId(S.selectedId); if (!t) return;
  const w = work(t);
  const dirty = isUseDirty(t, w);
  const st = storedText(t, currentVariation(t, w));
  const bar = $('#saveBar');
  bar.classList.toggle('dirty', dirty);
  bar.innerHTML = `<span class="msg">${dirty
    ? `Changed from the saved template. Save to update the ${esc(st.where)}, or cancel to undo.`
    : `Matches the saved ${esc(st.where)}.`}</span>
    <button class="btn" type="button" data-act="cancelwork"${dirty ? '' : ' disabled'}>Cancel</button>
    <button class="btn primary" type="button" data-act="savework"${dirty ? '' : ' disabled'}>Save changes</button>`;
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.max(260, ta.scrollHeight + 2) + 'px';
}

/* ================================================================= Copying */

function emailHtml(text) {
  const font = prefs().font || 'Aptos';
  const family = font === 'Calibri' ? 'Calibri, Arial, sans-serif' : font === 'Arial' ? 'Arial, Helvetica, sans-serif' : 'Aptos, Calibri, Arial, sans-serif';
  const linkify = (s) => s.replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>')
    .replace(/(^|[\s(])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1<a href="mailto:$2">$2</a>');
  // One <p> per line with no margins: Outlook keeps blank lines as blank
  // paragraphs, so the pasted spacing matches the preview exactly.
  const lines = String(text).split('\n').map((l) => `<p style="margin:0">${l.trim() ? linkify(esc(l)) : '&nbsp;'}</p>`).join('');
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
  const wt = workingText(t, w);
  const { values } = resolvedValues(t, w);
  if (t.variations.length && !w.varId) {
    const varFields = new Set(['Building Name', ...t.fields]);
    if (placeholdersIn(wt.subject, wt.body).some((k) => varFields.has(k) && !values[k])) {
      toast('Select a building first, so its details go into the email.', 'warn');
      $('#varSel')?.focus();
      return;
    }
  }
  const subject = fill(wt.subject, values);
  const body = fill(wt.body, values);
  const ok = what === 'subject'
    ? await copyText(subject)
    : await copyText(body, prefs().font === 'plain' ? null : emailHtml(body));
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

async function saveWork() {
  const t = byId(S.selectedId); if (!t) return;
  const w = work(t);
  const v = currentVariation(t, w);
  const next = clone(t);
  const wt = workingText(t, w);
  if (v && v.ownEmail) {
    const nv = next.variations.find((x) => x.id === v.id);
    nv.subject = wt.subject; nv.body = wt.body;
  } else {
    next.subject = wt.subject; next.body = wt.body;
  }
  const saved = stamp(next);
  if (await persistTemplate(saved, t.updatedAt)) {
    w.subject = null; w.body = null; w.base = saved.updatedAt;
    renderList(); renderDetail();
  }
}

function cancelWork() {
  const t = byId(S.selectedId); if (!t) return;
  const w = work(t);
  w.subject = null; w.body = null;
  renderDetail();
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
  const seed = window.SEED?.buildings || [];
  return [...new Set([...seed, ...S.templates.flatMap((t) => t.variations.map((v) => v.building))].filter(Boolean))];
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
        <div class="chips" id="edChips"></div>
        <div class="field"><label class="lbl" for="edBody">Email body ${d._hasVars ? '<span class="opt">shared by every building unless a building has its own version</span>' : ''}</label>
          <textarea class="textarea body-ta" id="edBody" data-k="body" spellcheck="true">${esc(d.body)}</textarea>
          <div class="help">Put placeholders in square brackets, like [Customer Name]. Blank lines become paragraph breaks when pasted into Outlook.</div></div>
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
  $('#edChips').innerHTML = '<span>Insert:</span>' + uniq.map((p) =>
    `<button type="button" class="chip${d._hasVars && d.fields.includes(p) ? ' f' : ''}" data-ins="${esc(p)}">[${esc(p)}]</button>`).join('');
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
      <div class="field"><label class="lbl">${esc(v.building || 'This building')}: email body</label><textarea class="textarea" rows="8" data-vi="${i}" data-vk="body">${esc(v.body)}</textarea></div>
    </div></td></tr>` : ''}`).join('');

  box.innerHTML = `${dl}
    <p class="help" style="margin:0 0 8px">Each row is a building. Each column is a detail that changes between buildings. Write the column name in square brackets in the email, e.g. <b>[${esc(cols[0] || 'Price')}]</b>, and the selected building's value goes in automatically. <b>[Building Name]</b> always works.</p>
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
      ${d.variations.length ? '' : '<button type="button" class="link" data-act="addallvars">Add all standard buildings</button>'}
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
    if (el.checked && !d.fields.length) d.fields = ['Price', 'Capacity', 'Minimum Numbers', 'Check-in'];
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

function exportJson() {
  const data = { app: 'woodhouse-email-templates', version: 1, exportedAt: new Date().toISOString(), categories: S.categories, templates: S.templates };
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
  let templates = []; let categories = null;
  const replace = $('#impReplace').checked;
  try {
    if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(text)) {
      const d = JSON.parse(text);
      templates = Array.isArray(d) ? d : d.templates || [];
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
    await Store.importAll({ replace, templates, categories });
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
  S.selectedId = id;
  const t = byId(id);
  if (t && variationId) {
    const w = work(t);
    if (!isUseDirty(t, w)) { w.varId = variationId; resetVarValues(t, w); }
  }
  renderList();
  renderDetail();
  $('#detail').scrollTop = 0;
}

function resetVarValues(t, w) {
  // Clear any typed-over building details so the new building's values show.
  for (const k of ['Building Name', ...t.fields]) delete w.values[k];
}

/* =================================================================== Events */

function bind() {
  const q = $('#q');
  q.addEventListener('input', () => {
    S.query = q.value;
    S.kbIndex = q.value ? 0 : -1;
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
        const first = $('#varSel') && !$('#varSel').value ? $('#varSel') : $$('#phGrid [data-ph]').find((i) => !i.value) || $('[data-act="copy"]');
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
  $('#mCat').addEventListener('change', (e) => { S.view = e.target.value; S.kbIndex = -1; renderSide(); renderList(); });

  $('.side').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) { S.view = b.dataset.view; S.kbIndex = -1; if (S.view === 'recent' && !S.query) S.sort = 'best'; renderSide(); renderList(); }
  });

  $('#list').addEventListener('click', (e) => {
    const r = e.target.closest('.row');
    if (r) { S.kbIndex = -1; selectTemplate(r.dataset.id, r.dataset.var || null); return; }
    if (e.target.closest('[data-act="new"]')) openEditor(blankTemplate(), true);
  });

  $('#newBtn').addEventListener('click', () => openEditor(blankTemplate(), true));

  // ---- Detail pane: clicks
  $('#detail').addEventListener('click', async (e) => {
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
      case 'savework': saveWork(); break;
      case 'cancelwork': cancelWork(); break;
      case 'clearvals': if (t) { work(t).values = {}; setGrid(t, work(t)); updatePreview(); } break;
      case 'edcancel':
        if (await leaveOk()) { if (S.draftIsNew) S.selectedId = S.selectedId && byId(S.selectedId) ? S.selectedId : null; renderDetail(); }
        break;
      case 'edsave': saveEditor(); break;
      case 'addvar': S.draft.variations.push({ id: uid('v'), building: '', values: {}, ownEmail: false, subject: '', body: '' }); renderVarTable(); $$('#edVars [data-vk="building"]').pop()?.focus(); break;
      case 'addallvars':
        for (const name of window.SEED.buildings) if (!S.draft.variations.some((v) => v.building === name)) S.draft.variations.push({ id: uid('v'), building: name, values: {}, ownEmail: false, subject: '', body: '' });
        renderVarTable(); break;
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
    if (el.dataset.ph) { w.values[el.dataset.ph] = el.value; el.classList.remove('auto'); updatePreview(); return; }
    if (el.id === 'wSubj') { w.subject = el.value; }
    else if (el.id === 'wBody') { w.body = el.value; autosize(el); }
    else return;
    refreshPlaceholderGrid();
    updatePreview();
    updateSaveBar();
  });

  $('#detail').addEventListener('change', async (e) => {
    const el = e.target;
    if (S.mode === 'edit') {
      if (el.dataset.fi != null && el.tagName === 'INPUT') renameField(+el.dataset.fi, el.value);
      else if (el.type === 'checkbox' || el.tagName === 'SELECT') editorInput(e);
      return;
    }
    if (el.id === 'varSel') {
      const t = byId(S.selectedId); const w = work(t);
      if (isUseDirty(t, w)) {
        const nv = t.variations.find((x) => x.id === el.value);
        const cv = currentVariation(t, w);
        // Edits only carry over when both buildings share the same email text.
        if ((cv?.ownEmail || nv?.ownEmail) && !(await ask('Switch building?', 'Your edits to the email text will be lost, because this building uses a different version of the email.', 'Switch'))) { el.value = w.varId; return; }
        if (cv?.ownEmail || nv?.ownEmail) { w.subject = null; w.body = null; }
      }
      w.varId = el.value;
      resetVarValues(t, w);
      const wt = workingText(t, w);
      $('#wSubj').value = wt.subject; $('#wBody').value = wt.body; autosize($('#wBody'));
      $('#facts').innerHTML = factsHtml(t, currentVariation(t, w));
      setGrid(t, w);
      updatePreview(); updateSaveBar();
    }
  });

  $('#detail').addEventListener('toggle', (e) => {
    if (e.target.classList?.contains('pre')) { const t = byId(S.selectedId); if (t) work(t).showPre = e.target.open; }
  }, true);

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
  $('#setName').addEventListener('input', (e) => { setPref('name', e.target.value.trim()); if (S.mode !== 'edit' && S.selectedId) { refreshPlaceholderGridForce(); } });
  $('#setFont').addEventListener('change', (e) => setPref('font', e.target.value));
  $('#expJson').addEventListener('click', exportJson);
  $('#expCsv').addEventListener('click', exportCsv);
  $('#impBtn').addEventListener('click', () => $('#impFile').click());
  $('#impFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });
  $('#seedBtn').addEventListener('click', async () => { try { await addSeed(); } catch (e) { toast(e.message, 'err', 7000); } });

  window.addEventListener('beforeunload', (e) => {
    const t = byId(S.selectedId);
    if (editorDirty() || (t && S.mode === 'use' && isUseDirty(t, work(t)))) { e.preventDefault(); e.returnValue = ''; }
  });
}

function refreshPlaceholderGridForce() {
  const t = byId(S.selectedId); if (!t) return;
  const w = work(t);
  setGrid(t, w);
  updatePreview();
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

  if (!data.initialised && !S.templates.length) {
    try { await addSeed({ silent: true }); }
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
