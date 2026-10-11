// College section: dashboard, events, live room availability + slot-based booking, my bookings.
import {
  S, api, qs, view, html, icon, $, actions, debounce, go, toast, openDialog, closeDialog, confirmDialog, formDialog, formHTML, wireForm,
  cleanups, isStaff, fmtDate, fmtShort, fmtTime, hourLabel, hhmm, badge, empty, EVENT_CATEGORIES,
} from './lib.js';

const month = (d) => fmtShort(d).split(' ').slice(-1)[0];
const dateBadge = (d) => html`<div class="date-badge"><b>${d.slice(8)}</b><span>${month(d)}</span></div>`;
const stat = (ic, n, label, href) => (href
  ? html`<a class="stat" href="${href}"><span class="s-ic">${icon(ic)}</span><div><b>${n}</b><span class="l">${label}</span></div></a>`
  : html`<div class="stat"><span class="s-ic">${icon(ic)}</span><div><b>${n}</b><span class="l">${label}</span></div></div>`);

// ---------- dashboard ----------
export async function campus() {
  const [stats, avail, events] = await Promise.all([api('/stats'), api('/availability'), api('/events?when=upcoming')]);
  const h = Math.floor(avail.now.minutes / 60);
  const at = (r) => r.cells.find((c) => c.h === h)?.s;
  const free = avail.rooms.filter((r) => at(r) === 'free');
  const busy = avail.rooms.filter((r) => ['class', 'booked', 'event'].includes(at(r)));
  view(html`
    <div class="page-head"><div class="eyebrow">Campus</div><h1>What's happening on campus</h1><p>Events, classroom availability and room booking in one place.</p></div>
    <div class="stats">
      ${stat('check', stats.open ? free.length : '–', stats.open ? 'rooms free right now' : 'campus closed (8 AM – 6 PM)', '#/rooms')}
      ${stat('clock', stats.open ? busy.length : '–', 'rooms in use right now', '#/rooms')}
      ${stat('calendar', stats.upcoming_events, 'upcoming events', '#/events')}
      ${stat('building', stats.rooms, 'bookable rooms', '#/rooms')}
    </div>
    <div class="two-col even">
      <section class="card"><div class="row between"><h2>${icon('calendar')}Upcoming events</h2><a class="btn link" href="#/events">All events</a></div>
        ${events.slice(0, 4).map((e) => html`<div class="mini-event">${dateBadge(e.date)}<div><strong>${e.title}</strong><br><span class="muted">${fmtTime(e.start_time)} · ${e.venue}</span></div></div>`)}
        ${events.length ? '' : empty('No upcoming events.', 'calendar')}</section>
      <section class="card"><h2>${icon('ticket')}Free right now</h2>
        ${stats.open ? (free.length ? html`<ul class="tags">${free.slice(0, 14).map((r) => html`<li>${r.name} <span class="muted">· ${r.capacity}</span></li>`)}</ul>` : empty('Every room is in use this hour.', 'clock')) : empty('Rooms can be booked between 8 AM and 6 PM.', 'clock')}
        <div style="margin-top:16px"><a class="btn" href="#/rooms">View availability and book ${icon('right')}</a></div></section>
    </div>`);
}

// ---------- events ----------
const EF = { when: 'upcoming', q: '', category: '' };

export const eventFields = (rooms) => [
  { name: 'title', label: 'Event name', required: true, max: 150 },
  { name: 'category', label: 'Category', type: 'select', half: true, options: EVENT_CATEGORIES.map((c) => [c, c]) },
  { name: 'organizer', label: 'Organiser', half: true, max: 100 },
  { name: 'date', label: 'Date', type: 'date', required: true, half: true },
  { name: 'start_time', label: 'Start', type: 'time', required: true, half: true },
  { name: 'end_time', label: 'End', type: 'time', required: true, half: true },
  { name: 'room_id', label: 'Campus room (blocks it for bookings)', type: 'select', half: true, options: [['', 'No room / other venue'], ...rooms.map((r) => [r.id, `${r.name} (${r.capacity})`])] },
  { name: 'venue', label: 'Venue (if no room)', max: 150, hint: 'Required when no campus room is chosen.' },
  { name: 'description', label: 'Description', type: 'textarea', max: 2000 },
];
export async function eventDialog(existing, done) {
  const rooms = await api('/rooms');
  const fields = eventFields(rooms);
  formDialog(existing ? 'Edit event' : 'New event', fields, existing ? { ...existing, room_id: existing.room_id ?? '' } : { category: 'General' }, async (v) => {
    await api(existing ? '/events/' + existing.id : '/events', { method: existing ? 'PUT' : 'POST', body: v });
    toast('Event saved.');
    done?.();
  });
}

export async function events() {
  view(html`
    <div class="page-head row between wrap"><div><div class="eyebrow">Campus</div><h1>College events</h1><p>Everything happening on campus.</p></div>${isStaff() ? html`<button class="btn" data-act="ev-new">${icon('plus')}Add event</button>` : ''}</div>
    <div class="toolbar"><div class="controls">
      <div class="seg" role="tablist" aria-label="When">${['upcoming', 'past'].map((w) => html`<button role="tab" aria-selected="${String(EF.when === w)}" data-act="ev-when" data-when="${w}">${w === 'upcoming' ? 'Upcoming' : 'Past'}</button>`)}</div>
      <div class="icon-input" style="flex:2 1 220px">${icon('search')}<input id="evq" type="search" aria-label="Search events" placeholder="Search events" value="${EF.q}"></div>
      <select id="evc" aria-label="Category"><option value="">All categories</option>${EVENT_CATEGORIES.map((c) => html`<option ${c === EF.category ? 'selected' : ''}>${c}</option>`)}</select>
    </div></div><div id="evlist" class="grid"></div>`);
  async function load() {
    const list = await api('/events' + qs(EF));
    if (!$('#evlist')) return;
    $('#evlist').innerHTML = list.length ? html`${list.map((e) => eventCard({ ...e, upcoming: EF.when === 'upcoming' }))}`.s : empty(EF.when === 'past' ? 'No past events.' : 'No upcoming events match.', 'calendar').s;
  }
  actions['ev-when'] = (el) => { EF.when = el.dataset.when; events(); };
  actions['ev-new'] = () => eventDialog(null, load);
  actions['ev-rsvp'] = async (el) => {
    if (!S.me) return go('#/login?next=events');
    const r = await api(`/events/${el.dataset.id}/rsvp`, { method: 'POST' });
    toast(r.going ? "You're going!" : 'RSVP removed.');
    load();
  };
  $('#evq').addEventListener('input', debounce((e) => { EF.q = e.target.value; load(); }));
  $('#evc').addEventListener('change', (e) => { EF.category = e.target.value; load(); });
  await load();
}

const eventCard = (e) => html`
  <article class="card event">
    ${dateBadge(e.date)}
    <div class="grow">
      <h3>${e.title}</h3>
      <div class="meta"><span>${icon('clock')}${fmtShort(e.date)} · ${fmtTime(e.start_time)} – ${fmtTime(e.end_time)}</span><span>${icon('pin')}${e.venue}${e.organizer ? ` · ${e.organizer}` : ''}</span></div>
      ${e.description ? html`<p class="clamp" style="margin-bottom:12px">${e.description}</p>` : ''}
      <div class="row between"><span>${badge(e.category, 'cat')} <span class="muted" style="font-size:.86rem">${e.rsvp_count} going</span></span>
        ${e.upcoming ? html`<button class="btn sm ${e.going ? 'ghost' : ''}" data-act="ev-rsvp" data-id="${e.id}">${e.going ? html`${icon('check')}Going` : 'RSVP'}</button>` : ''}</div>
    </div>
  </article>`;

// ---------- rooms: live availability + booking ----------
const STATE_LABEL = { free: 'Free', class: 'Class', booked: 'Booked', pending: 'Pending', event: 'Event', blocked: 'Closed', past: '' };
const R = { date: null, sel: null, data: null, type: '', seats: '', freeOnly: false };
const addDay = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export async function rooms(params) {
  const today = (await api('/availability')).date;
  const want = params?.get('date');
  if (/^\d{4}-\d{2}-\d{2}$/.test(want || '')) R.date = want;
  R.date ||= today;
  if (R.date < today) R.date = today;
  const max = addDay(today, 30);
  view(html`
    <div class="page-head"><div class="eyebrow">Campus</div><h1>Rooms and booking</h1><p>Pick a day, tap free slots to choose a time, then book. ${isStaff() ? 'Your bookings are confirmed instantly.' : 'Student requests are confirmed once a faculty member approves them.'}</p></div>
    <div class="toolbar">
      <div class="daystrip" id="days" role="group" aria-label="Choose a day"></div>
      <div class="controls">
        <input id="rdate" type="date" min="${today}" max="${max}" value="${R.date}" aria-label="Pick any date" style="width:auto;flex:0 0 auto">
        <select id="rtype" aria-label="Room type"><option value="">All room types</option></select>
        <input id="rseats" type="number" min="1" placeholder="Min seats" aria-label="Minimum seats" value="${R.seats}" style="width:120px;flex:0 0 auto">
        <label class="check" style="margin:0"><input type="checkbox" id="rfree" ${R.freeOnly ? 'checked' : ''}> Free slots only</label>
        <span id="live" class="live" style="margin-left:auto" aria-live="polite"></span>
      </div>
    </div>
    <div class="legend" aria-hidden="true">${Object.entries(STATE_LABEL).filter(([k]) => k !== 'past').map(([k, l]) => html`<span><i class="sw s-${k}"></i>${l}</span>`)}<span><i class="sw s-sel"></i>Selected</span></div>
    <div class="board" id="board"></div>
    <div id="bookbar" class="bookbar" hidden></div>`);

  async function load() {
    R.data = await api('/availability' + qs({ date: R.date }));
    if (!$('#board')) return;
    const types = [...new Set(R.data.rooms.map((r) => r.type))].sort();
    $('#rtype').innerHTML = html`<option value="">All room types</option>${types.map((t) => html`<option ${t === R.type ? 'selected' : ''}>${t}</option>`)}`.s;
    // drop selection if it is no longer free (someone else booked it)
    if (R.sel) {
      const room = R.data.rooms.find((r) => r.id === R.sel.room);
      const ok = room && room.cells.filter((c) => c.h >= R.sel.start && c.h < R.sel.end).every((c) => c.s === 'free');
      if (!ok) { R.sel = null; toast('A selected slot was just taken.', 'error'); }
    }
    draw();
  }
  function drawDays() {
    $('#days').innerHTML = html`${Array.from({ length: 14 }, (_, i) => {
      const d = addDay(today, i), [wd] = fmtShort(d).split(',');
      return html`<button class="day" data-act="rm-set" data-d="${d}" aria-pressed="${String(d === R.date)}" aria-label="${fmtDate(d)}"><small>${i === 0 ? 'Today' : wd}</small><b>${+d.slice(8)}</b><small>${month(d)}</small></button>`;
    })}`.s;
  }
  function draw() {
    drawDays();
    const { hours, now } = R.data;
    const isToday = R.data.date === now.date, nowH = Math.floor(now.minutes / 60);
    const sel = R.sel;
    const list = R.data.rooms.filter((r) => (!R.type || r.type === R.type) && (!R.seats || r.capacity >= +R.seats) && (!R.freeOnly || r.cells.some((c) => c.s === 'free')));
    $('#board').innerHTML = list.length ? html`
      <div class="b-head"><div class="rinfo">Room</div><div class="hours">${hours.map((h) => html`<span class="${isToday && h === nowH ? 'now' : ''}">${hourLabel(h)}</span>`)}</div></div>
      ${list.map((r, i) => html`
        ${i === 0 || list[i - 1].building !== r.building ? html`<div class="bld">${r.building}</div>` : ''}
        <div class="rrow"><div class="rinfo"><strong>${r.name}</strong><small>${r.type} · ${r.capacity} seats</small></div>
          <div class="slots">${r.cells.map((c) => {
    const selected = sel && sel.room === r.id && c.h >= sel.start && c.h < sel.end;
    const cls = selected ? 'sel' : c.s;
    const label = c.s === 'free' || c.s === 'past' ? '' : (c.label || STATE_LABEL[c.s]);
    return html`<button class="slot s-${cls}" ${c.s === 'free' ? '' : 'disabled'} data-act="rm-cell" data-room="${r.id}" data-h="${c.h}" title="${r.name}, ${hhmm(c.h)}: ${c.s}${c.label ? ' – ' + c.label : ''}" aria-label="${r.name} ${hourLabel(c.h)} ${selected ? 'selected' : c.s}${c.label ? ', ' + c.label : ''}" aria-pressed="${String(!!selected)}"><span class="hr">${hourLabel(c.h)}</span><span class="st">${label}</span></button>`;
  })}</div></div>`)}`.s : empty('No rooms match these filters.', 'search').s;
    if (isToday) {
      const open = nowH >= hours[0] && nowH <= hours.at(-1);
      const free = R.data.rooms.filter((r) => r.cells.find((c) => c.h === nowH)?.s === 'free').length;
      $('#live').innerHTML = open ? html`<span class="dot"></span>${free} of ${R.data.rooms.length} rooms free now`.s : 'Campus is closed right now';
    } else $('#live').textContent = fmtDate(R.data.date);
    const bar = $('#bookbar');
    if (sel) {
      const room = R.data.rooms.find((r) => r.id === sel.room);
      bar.hidden = false;
      bar.innerHTML = html`<div class="sum"><strong>${room.name}</strong><span>${fmtShort(R.data.date)} · ${hhmm(sel.start)} – ${hhmm(sel.end)} (${sel.end - sel.start} hour${sel.end - sel.start > 1 ? 's' : ''})</span></div>
        <div class="row"><button class="btn ghost" data-act="rm-clear">Clear</button><button class="btn" data-act="rm-book">${isStaff() ? 'Book now' : 'Request booking'}</button></div>`.s;
    } else bar.hidden = true;
  }
  const setDate = (d) => { R.date = d; R.sel = null; $('#rdate').value = d; load(); };
  actions['rm-set'] = (el) => setDate(el.dataset.d);
  actions['rm-clear'] = () => { R.sel = null; draw(); };
  actions['rm-cell'] = (el) => {
    const room = +el.dataset.room, h = +el.dataset.h, s = R.sel, limit = isStaff() ? 8 : 4;
    if (!s || s.room !== room || h < s.start - 1 || h > s.end) R.sel = { room, start: h, end: h + 1 };
    else if (h === s.end) { if (s.end - s.start >= limit) return toast(`You can book up to ${limit} hours at a time.`, 'error'); s.end++; }
    else if (h === s.start - 1) { if (s.end - s.start >= limit) return toast(`You can book up to ${limit} hours at a time.`, 'error'); s.start--; }
    else if (s.end - s.start === 1) R.sel = null; // click the only selected slot -> deselect
    else if (h === s.end - 1) s.end--;
    else if (h === s.start) s.start++;
    draw();
  };
  actions['rm-book'] = () => {
    if (!S.me) return go('#/login?next=rooms');
    const s = R.sel, room = R.data.rooms.find((r) => r.id === s.room);
    const fields = [
      { name: 'purpose', label: 'Purpose', required: true, max: 200, placeholder: 'e.g. Robotics club meeting' },
      { name: 'attendees', label: `Attendees (max ${room.capacity})`, type: 'number', required: true, min: 1, maxv: room.capacity },
    ];
    const body = openDialog(html`<div class="note" style="margin-top:14px">${icon('ticket')}<span><strong>${room.name}</strong> · ${fmtDate(R.data.date)} · ${hhmm(s.start)} – ${hhmm(s.end)}</span></div>
      ${isStaff() ? '' : html`<p class="muted" style="font-size:.9rem">A faculty member will review your request. Your slot is held while it's pending.</p>`}${formHTML(fields, { attendees: 1 }, isStaff() ? 'Confirm booking' : 'Send request')}`, 'Book this room');
    wireForm($('form', body), fields, async (v) => {
      const r = await api('/bookings', { method: 'POST', body: { ...v, room_id: s.room, date: R.data.date, start_h: s.start, end_h: s.end } });
      closeDialog(); R.sel = null;
      toast(r.status === 'approved' ? 'Room booked.' : 'Request sent. Track it under My bookings.');
      load();
    });
  };
  $('#rdate').addEventListener('change', (e) => { if (e.target.value >= today && e.target.value <= max) setDate(e.target.value); else e.target.value = R.date; });
  $('#rtype').addEventListener('change', (e) => { R.type = e.target.value; draw(); });
  $('#rseats').addEventListener('input', debounce((e) => { R.seats = e.target.value; draw(); }, 200));
  $('#rfree').addEventListener('change', (e) => { R.freeOnly = e.target.checked; draw(); });
  const timer = setInterval(() => { if (!$('#dlg').open) load().catch(() => {}); }, 60000);
  cleanups.push(() => clearInterval(timer));
  await load();
}

// ---------- my bookings ----------
const STATUS_KIND = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: '' };
export const bookingRow = (b, { showUser = false, actionsHtml = '' } = {}) => html`
  <tr><td data-label="When"><strong>${fmtShort(b.date)}</strong><br><span class="muted">${hhmm(b.start_h)} – ${hhmm(b.end_h)}</span></td>
  <td data-label="Room">${b.room_name}<br><small class="muted">${b.building}</small></td>
  ${showUser ? html`<td data-label="By">${b.user_name}<br><small class="muted">${b.user_role}</small></td>` : ''}
  <td data-label="Purpose">${b.purpose}<br><small class="muted">${b.attendees} attending${b.note ? ` · Note: ${b.note}` : ''}</small></td>
  <td data-label="Status">${badge(b.status, STATUS_KIND[b.status])}</td><td>${actionsHtml}</td></tr>`;

export async function myBookings() {
  if (!S.me) return go('#/login?next=my-bookings');
  const list = await api('/bookings');
  view(html`<div class="page-head row between wrap"><div><div class="eyebrow">Campus</div><h1>My bookings</h1><p>Requests and confirmed room bookings.</p></div><a class="btn" href="#/rooms">${icon('plus')}Book a room</a></div>
    ${list.length ? html`<div class="table-wrap"><table class="data stack"><thead><tr><th>When</th><th>Room</th><th>Purpose</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((b) => bookingRow(b, { actionsHtml: ['pending', 'approved'].includes(b.status) ? html`<button class="btn ghost sm" data-act="bk-cancel" data-id="${b.id}">Cancel</button>` : '' }))}</tbody></table></div>` : html`<div class="grid">${empty('No bookings yet. Head to Rooms and booking to reserve one.', 'ticket')}</div>`}`);
  actions['bk-cancel'] = async (el) => {
    if (!(await confirmDialog('Cancel this booking?', 'Cancel booking', true))) return;
    await api(`/bookings/${el.dataset.id}/cancel`, { method: 'POST' });
    toast('Booking cancelled.');
    myBookings();
  };
}
