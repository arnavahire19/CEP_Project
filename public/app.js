import { S, $, api, view, html, icon, actions, cleanups, go, toast, formHTML, wireForm, isStaff, app, skeleton, causeIcon, causeHue } from './lib.js';
import { ngos, ngoDetail, ngoNew, schemes } from './ngo.js';
import { campus, events, rooms, myBookings } from './campus.js';
import { campusDirectory, facultyDirectory, campusSearch } from './directory.js';
import { cameras } from './cameras.js';
import { facultyLogin, portal } from './portal.js';

// ---------- home ----------
async function home() {
  const [st, meta] = await Promise.all([api('/stats').catch(() => ({})), api('/ngo-meta').catch(() => ({ categories: [] }))]);
  S.meta ||= meta.categories?.length ? meta : null;
  view(html`
    <section class="hero">
      <h1>Do good. <span class="grad">Run campus.</span> One place.</h1>
      <p class="lead">Find 600+ NGOs across India and government support open to them, navigate PCCOE campus buildings, rooms & faculty cabins, and manage college events and room bookings, all in one app.</p>
      <form class="hero-search" id="hero-search" role="search">
        <div class="icon-input">${icon('search')}<input name="q" type="search" placeholder="Search NGOs by name, city or cause, or rooms (e.g. 9102, 9104 HO)" aria-label="Search" autocomplete="off"></div>
        <button class="btn" type="submit">Search</button>
      </form>
      <div class="stats-line">
        <span><b>${st.ngos ?? '–'}</b> NGOs</span>
        <span><b>${st.buildings ?? '12'}</b> Buildings</span>
        <span><b>${st.total_campus_rooms ?? '200+'}</b> Rooms & Labs</span>
        <span><b>${st.faculty ?? '228'}</b> Faculty</span>
        <span><b>${st.upcoming_events ?? '–'}</b> Events</span>
      </div>
    </section>

    <div class="section-title"><h2>Browse NGOs by cause</h2><a class="btn link" href="#/ngos">View all ${icon('right')}</a></div>
    <div class="cause-grid">${meta.categories.map((c) => html`<a class="cause-tile" style="--h:${causeHue(c.slug)}" href="#/ngos?cat=${c.slug}"><span class="avatar" style="--h:${causeHue(c.slug)}">${causeIcon(c.slug)}</span><span>${c.label}<small>${c.count} NGOs</small></span></a>`)}</div>

    <div class="section-title"><h2>Two sections, one account</h2></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      <a class="feature ngo" href="#/ngos"><span class="big-ic">${icon('sprout')}</span><h2>NGO Connect</h2>
        <p>Discover 600+ verified voluntary organizations by cause, state, city or distance, and see which schemes apply to them.</p>
        <ul><li>${icon('check')}Directory with contact details & leadership</li><li>${icon('check')}${st.schemes ?? ''} government schemes and grants</li><li>${icon('check')}Submit an NGO for verification</li></ul>
        <span class="go">Explore NGOs ${icon('right')}</span></a>
      <a class="feature campus" href="#/campus/directory"><span class="big-ic">${icon('cap')}</span><h2>Campus Directory</h2>
        <p>Find classrooms, laboratories, and faculty cabins across all PCCOE buildings with official room codes.</p>
        <ul><li>${icon('check')}12 Campus Buildings & floor-by-floor room layouts</li><li>${icon('check')}Faculty cabin directory with 228 faculty</li><li>${icon('check')}Live classroom availability & slot-based booking</li></ul>
        <span class="go">Explore Campus Directory ${icon('right')}</span></a>
    </div>

    <div class="section-title"><h2>Built for everyone on campus</h2></div>
    <div class="grid3">
      <div class="card role"><span class="avatar">${icon('user')}</span><h3>Students</h3><p>Find causes to volunteer for, locate classrooms, RSVP to events and request rooms.</p></div>
      <div class="card role"><span class="avatar">${icon('book')}</span><h3>Faculty</h3><p>Locate cabins, publish events, manage the timetable, approve bookings and view cameras.</p><a class="btn link" href="#/faculty">Faculty portal</a></div>
      <div class="card role"><span class="avatar">${icon('shield')}</span><h3>Administrators</h3><p>Moderate NGO listings, manage campus spaces, users, schemes and camera privacy.</p></div>
    </div>`);
  $('#hero-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    if (!q) return go('#/ngos');
    if (/^\d{3,4}/.test(q) || /building|lab|room|hod|floor/i.test(q)) {
      go('#/campus/search?q=' + encodeURIComponent(q));
    } else {
      go('#/ngos?q=' + encodeURIComponent(q));
    }
  });
}

// ---------- auth pages ----------
const nextOf = (p) => (/^[\w/-]+$/.test(p.get('next') || '') ? '#/' + p.get('next') : '#/');
async function login(params) {
  if (S.me) return go(nextOf(params));
  const fields = [
    { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'username' },
    { name: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' }];
  view(html`<div class="auth"><div class="card narrow"><h1>Welcome back</h1><p class="muted">Log in to RSVP to events, book rooms and submit NGOs.</p>${formHTML(fields, {}, 'Log in')}
    <p class="muted" style="margin:16px 0 0">New here? <a href="#/register${params.get('next') ? '?next=' + params.get('next') : ''}">Create a student account</a><br>Faculty or admin? <a href="#/faculty">Use the faculty portal</a></p></div></div>`);
  wireForm($('form'), fields, async (v) => { S.me = (await api('/auth/login', { method: 'POST', body: v })).user; S.onAuth(); toast(`Welcome, ${S.me.name}!`); go(nextOf(params)); });
}
async function register(params) {
  if (S.me) return go('#/');
  const fields = [
    { name: 'name', label: 'Full name', required: true, max: 100, autocomplete: 'name' },
    { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'username' },
    { name: 'department', label: 'Department (optional)', max: 100 },
    { name: 'password', label: 'Password', type: 'password', required: true, hint: 'At least 8 characters.', autocomplete: 'new-password' }];
  view(html`<div class="auth"><div class="card narrow"><h1>Create your account</h1><p class="muted">Student accounts are free. Faculty accounts are created by an administrator.</p>${formHTML(fields, {}, 'Create account')}<p class="muted" style="margin:16px 0 0">Already registered? <a href="#/login">Log in</a></p></div></div>`);
  wireForm($('form'), fields, async (v) => { S.me = (await api('/auth/register', { method: 'POST', body: v })).user; S.onAuth(); toast('Account created. Welcome!'); go(nextOf(params)); });
}

// ---------- router ----------
const ROUTES = [
  [/^$/, home, ''],
  [/^ngos$/, ngos, 'ngo'],
  [/^ngos\/new$/, ngoNew, 'ngo'],
  [/^ngos\/(\d+)$/, ngoDetail, 'ngo'],
  [/^schemes$/, schemes, 'ngo'],
  [/^campus$/, campus, 'campus'],
  [/^campus\/directory$/, campusDirectory, 'campus'],
  [/^campus\/faculty$/, facultyDirectory, 'campus'],
  [/^campus\/search$/, campusSearch, 'campus'],
  [/^events$/, events, 'campus'],
  [/^rooms$/, rooms, 'campus'],
  [/^my-bookings$/, myBookings, 'campus'],
  [/^cameras$/, () => cameras(), 'campus'],
  [/^faculty$/, facultyLogin, 'campus'],
  [/^portal(?:\/(\w+))?$/, portal, 'campus'],
  [/^login$/, login, ''],
  [/^register$/, register, ''],
];
let routeSeq = 0;
async function router() {
  cleanups.splice(0).forEach((f) => { try { f(); } catch { /* ignore */ } });
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query || '');
  let hit = null;
  for (const [re, fn, section] of ROUTES) { const m = re.exec(path); if (m) { hit = { fn, section, args: m.slice(1) }; break; } }
  const seq = ++routeSeq;
  document.body.dataset.section = hit?.section ?? '';
  renderNav(path);
  if (hit && hit.section) view(skeleton(6));
  try {
    if (!hit) view(html`<div class="page-head"><h1>Page not found</h1><p>That page doesn't exist.</p></div><a class="btn" href="#/">Go home</a>`);
    else await hit.fn(...hit.args.map((a) => a ?? undefined), params);
  } catch (e) {
    if (seq !== routeSeq) return;
    view(html`<div class="page-head"><h1>Something went wrong</h1><p>${e.message}</p></div><button class="btn" data-act="retry">Try again</button>`);
  }
  if (seq === routeSeq) {
    window.scrollTo(0, 0);
    const h1 = $('h1', app());
    h1?.setAttribute('tabindex', '-1'); h1?.focus({ preventScroll: true });
    document.title = (h1?.textContent ? h1.textContent + ' · ' : '') + 'Campus Connect';
  }
}
actions.retry = router;

// ---------- nav ----------
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
function renderNav(path = '') {
  const sec = document.body.dataset.section;
  const on = (re) => (re.test(path) ? html`aria-current="page"` : '');
  $('#sections').innerHTML = html`<a href="#/ngos" ${sec === 'ngo' ? html`aria-current="page"` : ''}>${icon('sprout')}NGO Connect</a><a href="#/campus" ${sec === 'campus' ? html`aria-current="page"` : ''}>${icon('cap')}Campus</a>`.s;
  const sub = $('#subnav');
  const items = sec === 'ngo'
    ? [
        ['ngos', 'Directory', 'grid', /^ngos($|\/\d)/],
        ['schemes', 'Government schemes', 'landmark', /^schemes/],
        ['ngos/new', 'Submit an NGO', 'plus', /^ngos\/new/]
      ]
    : sec === 'campus'
      ? [
          ['campus', 'Overview', 'home', /^campus$/],
          ['campus/directory', 'Classrooms & Labs', 'building', /^campus\/directory/],
          ['campus/faculty', 'Faculty Cabins', 'user', /^campus\/faculty/],
          ['campus/search', 'Campus Search', 'search', /^campus\/search/],
          ['events', 'Events', 'calendar', /^events/],
          ['rooms', 'Rooms & Booking', 'ticket', /^rooms/],
          ...(S.me ? [['my-bookings', 'My bookings', 'list', /^my-bookings/]] : []),
          ...(isStaff() ? [['cameras', 'Cameras', 'video', /^cameras/], ['portal', 'Portal', 'shield', /^portal/]] : [])
        ]
      : [];
  sub.hidden = !items.length;
  sub.innerHTML = html`<div class="subnav-in">${items.map(([h, l, ic, re]) => html`<a href="#/${h}" ${on(re)}>${icon(ic)}${l}</a>`)}</div>`.s;
  $('#account').innerHTML = (S.me
    ? html`<span class="who" title="${S.me.email}"><span class="av">${initials(S.me.name)}</span><span>${S.me.name}<br><small>${S.me.role}</small></span></span><button class="btn ghost sm" data-act="logout">${icon('logout')}Log out</button>`
    : html`<a class="btn ghost sm" href="#/faculty">${icon('lock')}Faculty portal</a><a class="btn sm" href="#/login">Log in</a>`).s;
}
actions.logout = async () => { await api('/auth/logout', { method: 'POST' }); S.me = null; S.onAuth(); toast('Logged out.'); go('#/'); };
S.onAuth = () => renderNav(location.hash.replace(/^#\/?/, '').split('?')[0]);

// ---------- theme + boot ----------
const setThemeIcon = () => { $('#theme-btn').innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon').s; };
$('#theme-btn').addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch { /* private mode */ }
  setThemeIcon();
});
setThemeIcon();
$('#logo').innerHTML = icon('sprout').s;
$('#menu-btn').innerHTML = icon('menu').s;
$('#menu-btn').addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); $('#menu-btn').setAttribute('aria-expanded', open); });
window.addEventListener('hashchange', () => { document.body.classList.remove('menu-open'); router(); });
(async () => {
  try { S.me = (await api('/me')).user; } catch { /* offline: continue as guest */ }
  router();
})();
