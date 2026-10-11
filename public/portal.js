// Faculty & admin portal: separate login + management tabs (admin-only tabs are hidden and enforced server-side).
import {
  S, api, view, html, icon, $, actions, go, toast, formDialog, formHTML, wireForm, confirmDialog, isStaff, loadMeta, qs,
  fmtShort, fmtTime, fmtDate, hhmm, DAYS, badge, empty, safeUrl, catBadges,
} from './lib.js';
import { ngoFields, TYPE_LABEL } from './ngo.js';
import { eventDialog, bookingRow } from './campus.js';
import { cameras, wireCameras } from './cameras.js';

let TAB = 'overview';
const reload = () => portal(TAB);
const cache = {};
const keep = (name, list) => { cache[name] = Object.fromEntries(list.map((x) => [x.id, x])); return list; };

const table = (heads, rows) => html`<div class="table-wrap"><table class="data stack"><thead><tr>${heads.map((h) => html`<th>${h}</th>`)}</tr></thead>
  <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => html`<td data-label="${heads[i]}">${c}</td>`)}</tr>`)}</tbody></table></div>`;
const delBtn = (path, label) => html`<button class="btn ghost sm danger-text" data-act="pt-del" data-path="${path}" data-label="${label}">Delete</button>`;

actions['pt-del'] = async (el) => {
  if (!(await confirmDialog(`Delete "${el.dataset.label}"? This cannot be undone.`, 'Delete', true))) return;
  await api(el.dataset.path, { method: 'DELETE' });
  toast('Deleted.');
  reload();
};

// ---------- login ----------
export async function facultyLogin() {
  if (isStaff()) return go('#/portal');
  const fields = [
    { name: 'email', label: 'Institute email', type: 'email', required: true, autocomplete: 'username' },
    { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' },
  ];
  view(html`<div class="portal-login"><div class="card narrow"><div class="lock">${icon('lock')}</div><h1>Faculty and staff portal</h1>
    <p class="muted">Manage events, classroom availability, bookings and cameras. Students: please use the <a href="#/login">regular login</a>.</p>
    ${formHTML(fields, {}, 'Sign in to portal')}<div class="note">${icon('info')}<span>Faculty accounts are created by a campus administrator.</span></div></div></div>`);
  wireForm($('form'), fields, async (v) => {
    const r = await api('/auth/faculty-login', { method: 'POST', body: v });
    S.me = r.user; S.onAuth();
    go('#/portal');
  });
}

// ---------- shell ----------
const TABS = [['overview', 'Overview', 'home'], ['bookings', 'Booking requests', 'ticket'], ['events', 'Events', 'calendar'], ['timetable', 'Timetable', 'clock'], ['rooms', 'Rooms', 'building'], ['cameras', 'Cameras', 'video'],
  ['users', 'Users', 'users', 1], ['ngos', 'NGOs', 'sprout', 1], ['schemes', 'Schemes', 'landmark', 1], ['camadmin', 'Camera admin', 'eye', 1]];

export async function portal(tab = 'overview') {
  if (!isStaff()) return go('#/faculty');
  const admin = S.me.role === 'admin';
  if (!TABS.some(([k, , , a]) => k === tab && (!a || admin))) tab = 'overview';
  TAB = tab;
  const link = ([k, l, ic]) => html`<a href="#/portal/${k}" aria-current="${String(k === tab)}">${icon(ic)}${l}</a>`;
  view(html`<div class="page-head"><div class="eyebrow">Campus</div><h1>${admin ? 'Admin' : 'Faculty'} portal</h1><p>Signed in as ${S.me.name} (${S.me.role}).</p></div>
    <div class="portal"><nav class="side" aria-label="Portal sections"><div class="grp">Manage</div>${TABS.filter((t) => !t[3]).map(link)}
      ${admin ? html`<div class="grp">Administration</div>${TABS.filter((t) => t[3]).map(link)}` : ''}</nav>
    <div id="tab" class="tab-body" aria-live="polite"><div class="skel"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:85%"></div></div></div>`);
  try {
    const out = await RENDER[tab]();
    if (!$('#tab') || TAB !== tab) return;
    $('#tab').innerHTML = html`${out}`.s;
    if (tab === 'cameras') wireCameras();
  } catch (e) { if ($('#tab')) $('#tab').innerHTML = empty(e.message).s; }
}

const RENDER = {
  async overview() {
    const [st, evs, pending] = await Promise.all([api('/stats'), api('/events?when=upcoming'), api('/bookings?scope=all&status=pending')]);
    const st_ = (ic, n, l, href) => html`<a class="stat" href="${href}"><span class="s-ic">${icon(ic)}</span><div><b>${n}</b><span class="l">${l}</span></div></a>`;
    return html`<div class="stats">${st_('ticket', pending.length, 'pending booking requests', '#/portal/bookings')}${st_('check', st.open ? st.rooms_free_now : '–', 'rooms free now', '#/rooms')}
      ${st_('calendar', st.upcoming_events, 'upcoming events', '#/portal/events')}${st_('video', 'Open', 'camera wall', '#/portal/cameras')}</div>
      <section class="card"><h2>${icon('calendar')}Next events</h2>${evs.slice(0, 5).map((e) => html`<div class="mini-event"><div><strong>${e.title}</strong><br><span class="muted">${fmtDate(e.date)} · ${fmtTime(e.start_time)} · ${e.venue}</span></div><span class="muted">${e.rsvp_count} going</span></div>`)}${evs.length ? '' : empty('Nothing scheduled.', 'calendar')}</section>`;
  },

  async bookings() {
    const all = await api('/bookings?scope=all');
    const pending = all.filter((b) => b.status === 'pending');
    const rest = all.filter((b) => b.status !== 'pending');
    const head = (showUser) => html`<thead><tr><th>When</th><th>Room</th>${showUser ? html`<th>By</th>` : ''}<th>Purpose</th><th>Status</th><th></th></tr></thead>`;
    return html`<section class="card"><h2>Awaiting approval (${pending.length})</h2>
      ${pending.length ? html`<div class="table-wrap"><table class="data stack">${head(true)}<tbody>${pending.map((b) => bookingRow(b, { showUser: true, actionsHtml: html`<button class="btn sm" data-act="pt-decide" data-id="${b.id}" data-ok="1">Approve</button> <button class="btn ghost sm" data-act="pt-decide" data-id="${b.id}" data-ok="0">Reject</button>` }))}</tbody></table></div>` : empty('No pending requests.', 'check')}</section>
      <section class="card"><h2>Recent bookings</h2>${rest.length ? html`<div class="table-wrap"><table class="data stack">${head(true)}<tbody>${rest.map((b) => bookingRow(b, { showUser: true, actionsHtml: b.status === 'approved' ? html`<button class="btn ghost sm" data-act="pt-bk-cancel" data-id="${b.id}">Cancel</button>` : '' }))}</tbody></table></div>` : empty('Nothing yet.', 'inbox')}</section>`;
  },

  async events() {
    const list = keep('events', await api('/events?when=all'));
    return html`<div class="row between"><h2>Events</h2><button class="btn" data-act="pt-ev-new">${icon('plus')}New event</button></div>
      ${table(['Date', 'Event', 'Venue', 'RSVPs', ''], list.map((e) => [html`${fmtShort(e.date)}<br><small>${fmtTime(e.start_time)}–${fmtTime(e.end_time)}</small>`, e.title, e.venue, e.rsvp_count,
        html`<button class="btn ghost sm" data-act="pt-ev-edit" data-id="${e.id}">Edit</button> ${delBtn('/events/' + e.id, e.title)}`]))}`;
  },

  async timetable() {
    const rooms = await api('/rooms');
    const rid = +(RENDER.timetable.room || rooms[0]?.id);
    RENDER.timetable.room = rid;
    const tt = await api('/timetable?room_id=' + rid);
    return html`<div class="row between wrap"><h2>Weekly timetable</h2><div class="row"><select id="tt-room" aria-label="Room">${rooms.map((r) => html`<option value="${r.id}" ${r.id === rid ? 'selected' : ''}>${r.name}</option>`)}</select><button class="btn" data-act="pt-tt-new">${icon('plus')}Add class</button></div></div>
      <p class="muted">Classes repeat every week and show as "Class" (occupied) on the availability grid.</p>
      ${[1, 2, 3, 4, 5, 6, 7].map((d) => html`<div class="card tt-day"><strong>${DAYS[d]}</strong>
        ${tt.filter((t) => t.weekday === d).map((t) => html`<span class="tt-item">${hhmm(t.start_h)}–${hhmm(t.end_h)} · ${t.title}${t.faculty ? html` <small>(${t.faculty})</small>` : ''} <button class="icon-btn" data-act="pt-del" data-path="/timetable/${t.id}" data-label="${t.title}" aria-label="Delete ${t.title}">${icon('x')}</button></span>`)}
        ${tt.some((t) => t.weekday === d) ? '' : html`<span class="muted">No classes</span>`}</div>`)}`;
  },

  async rooms() {
    const list = keep('rooms', await api('/rooms'));
    const admin = S.me.role === 'admin';
    return html`<div class="row between"><h2>Rooms</h2>${admin ? html`<button class="btn" data-act="pt-room-new">${icon('plus')}Add room</button>` : ''}</div>
      <p class="muted">Rooms under maintenance can't be booked.</p>
      ${table(['Room', 'Building', 'Type', 'Capacity', 'Status', ''], list.map((r) => [r.name, r.building, r.type, r.capacity, badge(r.status, r.status === 'available' ? 'ok' : 'warn'),
        html`<button class="btn ghost sm" data-act="pt-room-toggle" data-id="${r.id}">${r.status === 'available' ? 'Mark maintenance' : 'Mark available'}</button> ${admin ? delBtn('/rooms/' + r.id, r.name) : ''}`]))}`;
  },

  async cameras() { return cameras(true); },

  async users() {
    const list = await api('/admin/users');
    return html`<div class="row between"><h2>Users</h2><button class="btn" data-act="pt-user-new">${icon('plus')}Add user</button></div>
      <p class="muted">Students can self-register. Create faculty and admin accounts here.</p>
      ${table(['Name', 'Email', 'Role', 'Department', ''], list.map((u) => [u.name, u.email, badge(u.role, u.role === 'student' ? '' : 'cat'), u.department, u.id === S.me.id ? html`<small class="muted">You</small>` : delBtn('/admin/users/' + u.id, u.name)]))}`;
  },

  async ngos() {
    await loadMeta();
    const list = keep('ngos', await api('/admin/ngos'));
    const pending = list.filter((n) => n.status === 'pending').length;
    return html`<div class="row between"><h2>NGOs ${pending ? badge(pending + ' pending', 'warn') : ''}</h2><button class="btn" data-act="pt-ngo-new">${icon('plus')}Add NGO</button></div>
      ${table(['Name', 'Location', 'Causes', 'Status', ''], list.map((n) => [html`<strong>${n.name}</strong>${n.submitter ? html`<br><small class="muted">by ${n.submitter}</small>` : ''}`, `${n.city}, ${n.state}`, html`${catBadges(n.categories)}`, badge(n.status, n.status === 'pending' ? 'warn' : 'ok'),
        html`${n.status === 'pending' ? html`<button class="btn sm" data-act="pt-ngo-approve" data-id="${n.id}">Approve</button> ` : ''}<button class="btn ghost sm" data-act="pt-ngo-edit" data-id="${n.id}">Edit</button> ${delBtn('/ngos/' + n.id, n.name)}`]))}`;
  },

  async schemes() {
    await loadMeta();
    const list = keep('schemes', await api('/schemes'));
    return html`<div class="row between"><h2>Government schemes</h2><button class="btn" data-act="pt-sch-new">${icon('plus')}Add scheme</button></div>
      ${table(['Scheme', 'Ministry', 'Type', ''], list.map((s) => [s.name, s.ministry, badge(TYPE_LABEL[s.type] || s.type, 'type'), html`<button class="btn ghost sm" data-act="pt-sch-edit" data-id="${s.id}">Edit</button> ${delBtn('/schemes/' + s.id, s.name)}`]))}`;
  },

  async camadmin() {
    const [cams, log] = await Promise.all([api('/cameras'), api('/cameras/log')]);
    keep('cams', cams);
    return html`<div class="row between"><h2>Cameras</h2><button class="btn" data-act="pt-cam-new">${icon('plus')}Add camera</button></div>
      <p class="muted">Use privacy mode to pause a feed for everyone. "Admin only" hides it from faculty.</p>
      ${table(['Camera', 'Type', 'Flags', ''], cams.map((c) => [html`<strong>${c.name}</strong><br><small class="muted">${c.location}</small>`, c.type, html`${c.privacy_mode ? badge('Privacy mode', 'warn') : ''} ${c.admin_only ? badge('Admin only', 'cat') : ''}`,
        html`<button class="btn ghost sm" data-act="pt-cam-edit" data-id="${c.id}">Edit</button> ${delBtn('/cameras/' + c.id, c.name)}`]))}
      <h2>Access log</h2>${log.length ? table(['When (UTC)', 'User', 'Camera'], log.map((l) => [l.at, `${l.user ?? 'deleted user'} (${l.role ?? '-'})`, l.camera ?? 'deleted camera'])) : empty('No feeds opened yet.', 'eye')}`;
  },
};

// ---------- actions ----------
const act = (name, fn) => { actions[name] = fn; };
act('pt-decide', async (el) => {
  const ok = el.dataset.ok === '1', id = el.dataset.id;
  const send = async (note = '') => { await api(`/bookings/${id}/decide`, { method: 'POST', body: { approve: ok, note } }); toast(ok ? 'Approved.' : 'Rejected.'); reload(); };
  if (ok) return send();
  formDialog('Reject request', [{ name: 'note', label: 'Reason (shown to the requester)', max: 300 }], {}, (v) => send(v.note), 'Reject');
});
act('pt-bk-cancel', async (el) => {
  if (!(await confirmDialog('Cancel this approved booking?', 'Cancel booking', true))) return;
  await api(`/bookings/${el.dataset.id}/cancel`, { method: 'POST' }); toast('Cancelled.'); reload();
});
act('pt-ev-new', () => eventDialog(null, reload));
act('pt-ev-edit', (el) => eventDialog(cache.events[el.dataset.id], reload));
act('pt-room-toggle', async (el) => {
  const r = cache.rooms[el.dataset.id];
  await api('/rooms/' + r.id, { method: 'PATCH', body: { status: r.status === 'available' ? 'maintenance' : 'available' } });
  reload();
});
act('pt-room-new', () => formDialog('Add room', [
  { name: 'name', label: 'Room name', required: true, half: true, max: 80 }, { name: 'building', label: 'Building', half: true, max: 80 },
  { name: 'floor', label: 'Floor', type: 'number', half: true, min: -2 }, { name: 'capacity', label: 'Capacity', type: 'number', required: true, half: true, min: 1 },
  { name: 'type', label: 'Type', type: 'select', options: ['Classroom', 'Lab', 'Seminar Hall', 'Auditorium', 'Discussion Room'].map((x) => [x, x]) },
  { name: 'facilities', label: 'Facilities', max: 200 }], { floor: 0, type: 'Classroom' },
async (v) => { await api('/rooms', { method: 'POST', body: v }); toast('Room added.'); reload(); }));
act('pt-tt-new', async () => {
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) => [h, hhmm(h)]);
  formDialog('Add weekly class', [
    { name: 'weekday', label: 'Day', type: 'select', half: true, options: DAYS.slice(1).map((d, i) => [i + 1, d]) },
    { name: 'title', label: 'Course / class', required: true, half: true, max: 120 },
    { name: 'start_h', label: 'From', type: 'select', half: true, options: hours.slice(0, -1) }, { name: 'end_h', label: 'To', type: 'select', half: true, options: hours.slice(1), value: 9 },
    { name: 'faculty', label: 'Faculty', max: 100 }], {},
  async (v) => { await api('/timetable', { method: 'POST', body: { ...v, room_id: RENDER.timetable.room } }); toast('Class added.'); reload(); });
});
document.addEventListener('change', (e) => { if (e.target.id === 'tt-room') { RENDER.timetable.room = +e.target.value; reload(); } });

act('pt-user-new', () => formDialog('Add user', [
  { name: 'name', label: 'Full name', required: true, half: true }, { name: 'email', label: 'Email', type: 'email', required: true, half: true },
  { name: 'role', label: 'Role', type: 'select', half: true, options: [['faculty', 'Faculty'], ['admin', 'Admin'], ['student', 'Student']] },
  { name: 'department', label: 'Department', half: true }, { name: 'password', label: 'Temporary password (min 8)', type: 'password', required: true, autocomplete: 'new-password' }],
{ role: 'faculty' }, async (v) => { await api('/admin/users', { method: 'POST', body: v }); toast('User created.'); reload(); }));

const ngoDialog = (n) => formDialog(n ? 'Edit NGO' : 'Add NGO', ngoFields(S.meta), n ? { ...n, focus: n.focus.join(', ') } : {}, async (v) => {
  await api(n ? '/ngos/' + n.id : '/ngos', { method: n ? 'PUT' : 'POST', body: n ? { ...v, status: n.status } : v });
  toast('NGO saved.'); reload();
});
act('pt-ngo-new', () => ngoDialog(null));
act('pt-ngo-edit', (el) => ngoDialog(cache.ngos[el.dataset.id]));
act('pt-ngo-approve', async (el) => { await api(`/ngos/${el.dataset.id}/approve`, { method: 'POST' }); toast('Published.'); reload(); });

const schemeDialog = (s) => formDialog(s ? 'Edit scheme' : 'Add scheme', [
  { name: 'name', label: 'Scheme name', required: true }, { name: 'ministry', label: 'Ministry / department', half: true },
  { name: 'type', label: 'Type', type: 'select', half: true, options: Object.entries(TYPE_LABEL) },
  { name: 'categories', label: 'Relevant causes', type: 'checks', options: [['all', 'All causes'], ...S.meta.categories.map((c) => [c.slug, `${c.icon} ${c.label}`])] },
  { name: 'summary', label: 'Summary', type: 'textarea', required: true, max: 1000 }, { name: 'benefits', label: 'Benefits', type: 'textarea', rows: 2, max: 1000 },
  { name: 'eligibility', label: 'Who can apply', type: 'textarea', rows: 2, max: 1000 }, { name: 'how_to_apply', label: 'How to apply', type: 'textarea', rows: 2, max: 1000 },
  { name: 'url', label: 'Official link', type: 'url', placeholder: 'https://' }], s || { type: 'funding' },
async (v) => { await api(s ? '/schemes/' + s.id : '/schemes', { method: s ? 'PUT' : 'POST', body: v }); toast('Scheme saved.'); reload(); });
act('pt-sch-new', () => schemeDialog(null));
act('pt-sch-edit', (el) => schemeDialog(cache.schemes[el.dataset.id]));

const camDialog = (c) => formDialog(c ? 'Edit camera' : 'Add camera', [
  { name: 'name', label: 'Name', required: true, half: true }, { name: 'location', label: 'Location', half: true },
  { name: 'type', label: 'Feed type', type: 'select', options: [['demo', 'Simulated demo'], ['device', 'This device\'s camera (local test)'], ['mjpeg', 'MJPEG stream URL'], ['image', 'Snapshot URL (refreshes every 2s)'], ['hls', 'HLS (.m3u8) URL']] },
  { name: 'stream_url', label: 'Stream URL', type: 'url', placeholder: 'https://', hint: 'Not needed for demo / device. Browsers need https for most feeds; get the camera owner\'s consent first.', max: 500 },
  { name: 'privacy_mode', label: 'Privacy mode', type: 'check', checkLabel: 'Pause this feed for everyone' },
  { name: 'admin_only', label: 'Admin only', type: 'check', checkLabel: 'Hide from faculty' }], c || { type: 'demo' },
async (v) => { await api(c ? '/cameras/' + c.id : '/cameras', { method: c ? 'PUT' : 'POST', body: v }); toast('Camera saved.'); reload(); });
act('pt-cam-new', () => camDialog(null));
act('pt-cam-edit', (el) => camDialog(cache.cams[el.dataset.id]));
