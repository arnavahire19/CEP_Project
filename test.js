// Run: npm test   (in-memory DB, random port)
process.env.DB_PATH = ':memory:';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { server } = await import('./server.js');
const { nowCampus, addDays, weekdayOf, db } = await import('./db.js');
let base;
before(() => new Promise((r) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => server.close());

// minimal client with its own cookie
function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const h = { ...(cookie && { cookie }), ...headers };
    if (method !== 'GET' && !('Content-Type' in h)) h['Content-Type'] = 'application/json';
    const r = await fetch(base + '/api' + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
const login = async (email, password, path = '/auth/login') => { const c = client(); const r = await c(path, { method: 'POST', body: { email, password } }); assert.equal(r.status, 200, JSON.stringify(r.body)); return c; };

// a future date whose weekday is Sunday (seed timetable has no Sunday classes) => predictable free slots
const futureSunday = () => { let d = addDays(nowCampus().date, 3); while (weekdayOf(d) !== 7) d = addDays(d, 1); return d; };

test('auth: faculty portal rejects students; wrong password is generic 401', async () => {
  const c = client();
  assert.equal((await c('/auth/faculty-login', { method: 'POST', body: { email: 'student@campus.edu', password: 'student123' } })).status, 403);
  assert.equal((await c('/auth/login', { method: 'POST', body: { email: 'student@campus.edu', password: 'nope-nope' } })).status, 401);
  assert.equal((await c('/auth/faculty-login', { method: 'POST', body: { email: 'faculty@campus.edu', password: 'faculty123' } })).status, 200);
  assert.equal((await c('/me')).body.user.role, 'faculty');
});

test('csrf guard: non-JSON content type is refused', async () => {
  const c = await login('student@campus.edu', 'student123');
  const r = await c('/bookings', { method: 'POST', body: 'x=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 415);
});

test('public NGO directory: filters, near-me sort, schemes on profile', async () => {
  const c = client();
  const animals = (await c('/ngos?category=animals&limit=100')).body;
  assert.ok(animals.total >= 5 && animals.items.every((n) => n.categories.includes('animals')));
  const near = (await c('/ngos?lat=13.08&lng=80.27&maxKm=50')).body; // Chennai
  assert.ok(near.items.length > 0 && near.items.every((n) => n.city === 'Chennai' || n.distance_km <= 50));
  assert.ok(near.items[0].distance_km <= near.items.at(-1).distance_km);
  const one = (await c('/ngos/' + animals.items[0].id)).body;
  assert.ok(one.schemes.some((s) => s.name.includes('Animal Welfare')));
});

test('NGO submission: pending until admin approves; javascript: URLs rejected', async () => {
  const stu = await login('student@campus.edu', 'student123'), adm = await login('admin@campus.edu', 'admin123');
  const ngo = { name: 'Test Trust', city: 'Pune', categories: ['education'], description: 'x', website: 'https://example.org' };
  assert.equal((await stu('/ngos', { method: 'POST', body: { ...ngo, website: 'javascript:alert(1)' } })).status, 400);
  const made = (await stu('/ngos', { method: 'POST', body: ngo })).body;
  assert.equal(made.status, 'pending');
  assert.equal((await client()(`/ngos/${made.id}`)).status, 404); // hidden from public
  assert.equal((await stu(`/ngos/${made.id}/approve`, { method: 'POST' })).status, 403);
  assert.equal((await adm(`/ngos/${made.id}/approve`, { method: 'POST' })).status, 200);
  assert.equal((await client()(`/ngos/${made.id}`)).body.state, 'Maharashtra'); // inferred from city
});

test('booking: student request holds slot, blocks double-booking, faculty approves/rejects', async () => {
  const stu = await login('student@campus.edu', 'student123'), fac = await login('faculty@campus.edu', 'faculty123');
  const date = futureSunday();
  const room = (await stu('/rooms')).body[0];
  const req = { room_id: room.id, date, start_h: 10, end_h: 12, purpose: 'Club meeting', attendees: 10 };
  const first = await stu('/bookings', { method: 'POST', body: req });
  assert.equal(first.status, 200); assert.equal(first.body.status, 'pending');
  const clash = await fac('/bookings', { method: 'POST', body: { ...req, start_h: 11, end_h: 13 } });
  assert.equal(clash.status, 409);
  assert.equal((await stu('/bookings', { method: 'POST', body: { ...req, attendees: room.capacity + 1, start_h: 14, end_h: 15 } })).status, 400);
  assert.equal((await stu('/bookings', { method: 'POST', body: { ...req, start_h: 8, end_h: 14 } })).status, 400); // > 4h for students
  assert.equal((await stu(`/bookings/${first.body.id}/decide`, { method: 'POST', body: { approve: true } })).status, 403);
  assert.equal((await fac(`/bookings/${first.body.id}/decide`, { method: 'POST', body: { approve: false, note: 'Lab in use' } })).status, 200);
  assert.equal((await fac('/bookings', { method: 'POST', body: { ...req, start_h: 11, end_h: 13 } })).body.status, 'approved'); // freed, faculty auto-approved
  // cells reflect state; students see a masked label for others' bookings
  const cells = (await client()(`/availability?date=${date}`)).body.rooms.find((r) => r.id === room.id).cells;
  assert.equal(cells.find((c) => c.h === 11).s, 'booked'); assert.equal(cells.find((c) => c.h === 11).label, 'Reserved');
});

test('booking: timetable classes and past slots are not bookable', async () => {
  const fac = await login('faculty@campus.edu', 'faculty123');
  const today = nowCampus().date;
  assert.equal((await fac('/bookings', { method: 'POST', body: { room_id: 1, date: addDays(today, -1), start_h: 10, end_h: 11, purpose: 'x' } })).status, 409);
  let d = addDays(today, 1); while (weekdayOf(d) === 7) d = addDays(d, 1);
  const tt = (await fac('/timetable?room_id=1')).body.find((t) => t.weekday === weekdayOf(d));
  if (tt) assert.equal((await fac('/bookings', { method: 'POST', body: { room_id: 1, date: d, start_h: tt.start_h, end_h: tt.start_h + 1, purpose: 'x' } })).status, 409);
});

test('events: staff-only writes, room-linked events block bookings, RSVP toggles', async () => {
  const stu = await login('student@campus.edu', 'student123'), fac = await login('faculty@campus.edu', 'faculty123');
  const date = futureSunday(), ev = { title: 'Quiz', date, start_time: '14:00', end_time: '16:00', room_id: 1 };
  assert.equal((await stu('/events', { method: 'POST', body: ev })).status, 403);
  const made = await fac('/events', { method: 'POST', body: ev });
  assert.equal(made.status, 200);
  assert.equal((await fac('/bookings', { method: 'POST', body: { room_id: 1, date, start_h: 15, end_h: 16, purpose: 'x' } })).status, 409);
  assert.equal((await fac('/events', { method: 'POST', body: { ...ev, start_time: '15:00' } })).status, 409); // double-booked venue
  assert.equal((await stu(`/events/${made.body.id}/rsvp`, { method: 'POST' })).body.going, true);
  assert.equal((await stu(`/events/${made.body.id}/rsvp`, { method: 'POST' })).body.going, false);
});

test('cameras: students blocked, views are logged, privacy mode pauses feed, admin-only hidden from faculty', async () => {
  const stu = await login('student@campus.edu', 'student123'), fac = await login('faculty@campus.edu', 'faculty123'), adm = await login('admin@campus.edu', 'admin123');
  assert.equal((await stu('/cameras')).status, 403);
  const cams = (await fac('/cameras')).body;
  assert.equal((await fac(`/cameras/${cams[0].id}/view`, { method: 'POST' })).status, 200);
  assert.equal(cams[0].stream_url, undefined);
  assert.equal((await fac('/cameras/log')).status, 403);
  assert.equal((await adm('/cameras/log')).body[0].user, 'Dr. Asha Rao');
  const c = cams[1];
  await adm(`/cameras/${c.id}`, { method: 'PUT', body: { name: c.name, type: 'demo', privacy_mode: true, admin_only: false } });
  assert.equal((await fac(`/cameras/${c.id}/view`, { method: 'POST' })).status, 403);
  await adm(`/cameras/${c.id}`, { method: 'PUT', body: { name: c.name, type: 'demo', privacy_mode: false, admin_only: true } });
  assert.ok(!(await fac('/cameras')).body.some((x) => x.id === c.id));
  assert.equal((await fac(`/cameras/${c.id}/view`, { method: 'POST' })).status, 404);
});

test('admin: only admins manage users/schemes; students can register but not escalate', async () => {
  const fac = await login('faculty@campus.edu', 'faculty123'), adm = await login('admin@campus.edu', 'admin123');
  assert.equal((await fac('/admin/users')).status, 403);
  assert.equal((await fac('/schemes', { method: 'POST', body: {} })).status, 403);
  const c = client();
  const reg = await c('/auth/register', { method: 'POST', body: { name: 'New Kid', email: 'kid@x.edu', password: 'longenough', role: 'admin' } });
  assert.equal(reg.body.user.role, 'student');
  assert.equal((await c('/admin/users')).status, 403);
  assert.equal((await adm('/admin/users', { method: 'POST', body: { name: 'F2', email: 'f2@x.edu', password: 'longenough', role: 'faculty' } })).status, 200);
});

test('static: serves app, blocks path traversal', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/%2e%2e/%2e%2e/server.js')).status, 404);
  assert.equal((await fetch(base + '/..%2fserver.js')).status, 404);
  const r = await fetch(base + '/faculty', { redirect: 'manual' });
  assert.equal(r.status, 302);
});
