// Shared helpers: safe HTML templating, API client, dialogs, forms, formatting.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

import { raw, esc, val, html, safeUrl } from './html.js';
import { icon, causeIcon, causeHue } from './icons.js';
export { raw, esc, val, html, safeUrl, icon, causeIcon, causeHue };

// ---- global state ----
export const S = { me: null, meta: null, onAuth: () => {} };
export const cleanups = []; // run on every route change (timers, streams)
export const actions = {}; // data-act="name" click handlers
export const isStaff = () => S.me && (S.me.role === 'faculty' || S.me.role === 'admin');

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (t && actions[t.dataset.act]) { e.preventDefault(); Promise.resolve(actions[t.dataset.act](t, e)).catch((err) => toast(err.message, 'error')); }
});

// ---- API ----
export async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin' };
  if (method !== 'GET') { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body ?? {}); }
  let r;
  try { r = await fetch('/api' + path, opts); } catch { throw new Error('Cannot reach the server. Check your connection.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status });
  return j;
}
export const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---- rendering ----
export const app = () => $('#app');
export function view(r) { app().innerHTML = val(r); }
export function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.innerHTML = val(html`${icon(kind === 'error' ? 'alert' : 'check')}<span>${msg}</span>`); t.className = `toast show ${kind}`;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), 4000);
}

// ---- dialogs (native <dialog>: focus trap + Esc for free) ----
export function openDialog(content, title = '') {
  const d = $('#dlg');
  d.innerHTML = val(html`<div class="dlg-head"><h2>${title}</h2><button class="icon-btn" data-act="dlg-close" aria-label="Close">${icon('x')}</button></div><div class="dlg-body">${content}</div>`);
  if (!d.open) d.showModal();
  return $('.dlg-body', d);
}
export const closeDialog = () => { const d = $('#dlg'); if (d.open) d.close(); };
actions['dlg-close'] = closeDialog;
$('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dlg') closeDialog(); }); // backdrop click

export function confirmDialog(message, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    const body = openDialog(html`<p>${message}</p><div class="row end"><button class="btn ghost" data-r="0">Cancel</button><button class="btn ${danger ? 'danger' : ''}" data-r="1">${okLabel}</button></div>`, 'Please confirm');
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { finish(b.dataset.r === '1'); closeDialog(); } });
    $('#dlg').addEventListener('close', () => finish(false), { once: true });
  });
}

// ---- forms ----
// field: {name,label,type,options:[[value,label]],required,hint,placeholder,max}
export function formHTML(fields, init = {}, submitLabel = 'Save') {
  const one = (f) => {
    const v = init[f.name] ?? f.value ?? '';
    const id = `f-${f.name}`;
    const req = f.required ? 'required' : '';
    let input;
    if (f.type === 'textarea') input = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" maxlength="${f.max || 2000}" ${req} placeholder="${f.placeholder}">${v}</textarea>`;
    else if (f.type === 'select') input = html`<select id="${id}" name="${f.name}" ${req}>${f.options.map(([o, l]) => html`<option value="${o}" ${String(o) === String(v) ? 'selected' : ''}>${l}</option>`)}</select>`;
    else if (f.type === 'checks') {
      const have = new Set(init[f.name] || []);
      input = html`<div class="checks" role="group" aria-label="${f.label}">${f.options.map(([o, l]) => html`<label class="check"><input type="checkbox" name="${f.name}" value="${o}" ${have.has(o) ? 'checked' : ''}> ${l}</label>`)}</div>`;
    } else if (f.type === 'check') input = html`<label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}> ${f.checkLabel || f.label}</label>`;
    else input = html`<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${v}" ${req} placeholder="${f.placeholder}" maxlength="${f.max || 300}" ${f.min != null ? html`min="${f.min}"` : ''} ${f.maxv != null ? html`max="${f.maxv}"` : ''} ${f.autocomplete ? html`autocomplete="${f.autocomplete}"` : ''}>`;
    return html`<div class="field ${f.half ? 'half' : ''}">${f.type === 'check' ? '' : html`<label for="${id}">${f.label}${f.required ? html` <span class="req" aria-hidden="true">*</span>` : ''}</label>`}${input}${f.hint ? html`<small>${f.hint}</small>` : ''}</div>`;
  };
  return html`<form class="form" novalidate>${fields.map(one)}<p class="form-error" role="alert"></p><div class="row end"><button class="btn" type="submit">${submitLabel}</button></div></form>`;
}
export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'checks') out[f.name] = $$(`input[name="${f.name}"]:checked`, form).map((i) => i.value);
    else if (f.type === 'check') out[f.name] = form.elements[f.name].checked;
    else out[f.name] = form.elements[f.name].value;
  }
  return out;
}
export function wireForm(form, fields, onSubmit) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', form), btn = $('button[type=submit]', form);
    err.textContent = '';
    if (!form.checkValidity()) { form.reportValidity(); return; }
    btn.disabled = true;
    try { await onSubmit(readForm(form, fields)); }
    catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });
}
export function formDialog(title, fields, init, onSubmit, submitLabel) {
  const body = openDialog(formHTML(fields, init, submitLabel), title);
  wireForm($('form', body), fields, async (v) => { await onSubmit(v); closeDialog(); });
}

// ---- formatting ----
export const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtShort = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'AM' : 'PM'}`;
export const hhmm = (h) => `${String(h).padStart(2, '0')}:00`;
export const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const badge = (text, kind = '') => html`<span class="badge ${kind}">${text}</span>`;
export const catLabel = (slug) => S.meta?.categories.find((x) => x.slug === slug)?.label || slug;
export const catBadges = (slugs) => slugs.map((s) => html`<span class="badge cause" style="--h:${causeHue(s)}">${causeIcon(s)}${catLabel(s)}</span>`);
// rounded tile with the first cause's icon, used as an NGO "logo"
export const avatar = (slugs, cls = '') => html`<span class="avatar ${cls}" style="--h:${causeHue(slugs[0])}">${causeIcon(slugs[0])}</span>`;
export const skeleton = (n = 6) => html`<div class="skel-head skel"></div><div class="grid">${Array.from({ length: n }, () => html`<div class="card skel-card"><div class="skel" style="width:60%"></div><div class="skel"></div><div class="skel" style="width:80%"></div></div>`)}</div>`;
export const EVENT_CATEGORIES = ['General', 'Academic', 'Technical', 'Cultural', 'Sports', 'Career', 'Social Impact'];
export async function loadMeta() { return (S.meta ||= await api('/ngo-meta')); }
export const empty = (msg, ic = 'inbox') => html`<div class="empty">${icon(ic, 'big')}<p>${msg}</p></div>`;
