import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  db, HOURS, OPEN_H, CLOSE_H, availability, nowCampus, addDays, isDate, toMin, weekdayOf,
  hashPassword, checkPassword,
} from './db.js';
import { CATEGORIES, CITIES } from './seed-data.js';

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const SESSION_DAYS = 7;
const CAT_SLUGS = new Set(CATEGORIES.map((c) => c.slug));
const PROD = process.env.NODE_ENV === 'production';

// ---------- tiny validation helpers ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new HttpError(400, m);
const str = (v, name, { max = 200, req = true } = {}) => {
  if (v == null || v === '') { if (req) throw bad(`${name} is required`); return ''; }
  if (typeof v !== 'string') throw bad(`${name} must be text`);
  v = v.trim();
  if (req && !v) throw bad(`${name} is required`);
  if (v.length > max) throw bad(`${name} is too long (max ${max} characters)`);
  return v;
};
const int = (v, name, min, max) => {
  const n = Number(v);
  if (v === '' || v == null || !Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}`);
  return n;
};
// only http(s) URLs: stops javascript: URLs ending up in href attributes
const url = (v, name) => {
  v = str(v, name, { max: 500, req: false });
  if (v && !/^https?:\/\/[^\s<>"']+$/i.test(v)) throw bad(`${name} must start with http:// or https://`);
  return v;
};
const time = (v, name) => { if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(`${name} must be HH:MM`); return v; };
const date = (v, name) => { if (typeof v !== 'string' || !isDate(v)) throw bad(`${name} must be YYYY-MM-DD`); return v; };
const email = (v) => {
  v = str(v, 'email', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad('Enter a valid email address');
  return v;
};
const cats = (v) => {
  if (!Array.isArray(v) || !v.length || v.some((c) => !CAT_SLUGS.has(c))) throw bad('Choose at least one valid category');
  return [...new Set(v)];
};
const isStaff = (u) => u && (u.role === 'faculty' || u.role === 'admin');
const json = (s) => { try { return JSON.parse(s); } catch { return []; } };

// ---------- sessions & rate limiting ----------
const sha = (t) => createHash('sha256').update(t).digest('hex');
const DUMMY_HASH = hashPassword('timing-equaliser');
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department });

function createSession(res, userId, req) {
  const token = randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?,?,?)').run(sha(token), userId, expires);
  const secure = PROD || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
function sessionUser(req) {
  const m = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?').get(sha(m[1]), Date.now()) || null;
}

// ponytail: in-memory limiter, resets on restart; use a shared store if running multiple instances
const fails = new Map();
const MAX_FAILS = 8, WINDOW = 15 * 60e3;
function checkLimit(key) {
  const f = fails.get(key);
  if (f && f.reset > Date.now() && f.n >= MAX_FAILS) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
}
function noteFail(key) {
  if (fails.size > 5000) fails.clear();
  const f = fails.get(key);
  if (!f || f.reset < Date.now()) fails.set(key, { n: 1, reset: Date.now() + WINDOW }); else f.n++;
}

// ---------- router ----------
const routes = [];
function route(method, pattern, role, fn) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, role, fn });
}
const idParam = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Not found'); return n; };

// ---------- auth ----------
function doLogin(ctx, staffOnly) {
  const { body, req, res } = ctx;
  const em = email(body.email);
  const pw = str(body.password, 'password', { max: 200 });
  const key = `${req.socket.remoteAddress}|${em}`;
  checkLimit(key);
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  const ok = checkPassword(pw, u ? u.pass_hash : DUMMY_HASH) && u;
  if (!ok) { noteFail(key); throw new HttpError(401, 'Invalid email or password'); }
  if (staffOnly && !isStaff(u)) throw new HttpError(403, 'This portal is for faculty and administrators only. Students: use the regular login.');
  fails.delete(key);
  createSession(res, u.id, req);
  return { user: publicUser(u) };
}
route('POST', '/api/auth/login', 'public', (c) => doLogin(c, false));
route('POST', '/api/auth/faculty-login', 'public', (c) => doLogin(c, true));
route('POST', '/api/auth/register', 'public', ({ body, req, res }) => {
  const key = `reg|${req.socket.remoteAddress}`;
  checkLimit(key);
  const name = str(body.name, 'name', { max: 100 });
  const em = email(body.email);
  const pw = str(body.password, 'password', { max: 200 });
  if (pw.length < 8) throw bad('Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(em)) throw new HttpError(409, 'An account with this email already exists');
  noteFail(key); // counts registrations per IP too
  const r = db.prepare("INSERT INTO users (name,email,pass_hash,role,department) VALUES (?,?,?,'student',?)")
    .run(name, em, hashPassword(pw), str(body.department, 'department', { max: 100, req: false }));
  createSession(res, Number(r.lastInsertRowid), req);
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)) };
});
route('POST', '/api/auth/logout', 'public', ({ req, res }) => {
  const m = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '');
  if (m) db.prepare('DELETE FROM sessions WHERE token = ?').run(sha(m[1]));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  return { ok: true };
});
route('GET', '/api/me', 'public', ({ user }) => ({ user: user ? publicUser(user) : null }));

// ---------- admin: users ----------
route('GET', '/api/admin/users', 'admin', () => db.prepare('SELECT id,name,email,role,department,created_at FROM users ORDER BY role, name').all());
route('POST', '/api/admin/users', 'admin', ({ body }) => {
  const role = ['student', 'faculty', 'admin'].includes(body.role) ? body.role : (() => { throw bad('Invalid role'); })();
  const em = email(body.email);
  const pw = str(body.password, 'password', { max: 200 });
  if (pw.length < 8) throw bad('Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(em)) throw new HttpError(409, 'Email already in use');
  const r = db.prepare('INSERT INTO users (name,email,pass_hash,role,department) VALUES (?,?,?,?,?)')
    .run(str(body.name, 'name', { max: 100 }), em, hashPassword(pw), role, str(body.department, 'department', { max: 100, req: false }));
  return { id: Number(r.lastInsertRowid) };
});
route('DELETE', '/api/admin/users/:id', 'admin', ({ params, user }) => {
  const id = idParam(params.id);
  if (id === user.id) throw bad('You cannot delete your own account');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { ok: true };
});

// ---------- NGO Connect ----------
const ngoOut = (r) => ({
  ...r,
  categories: json(r.categories),
  focus: json(r.focus),
  head_name: r.head_name || '',
  head_designation: r.head_designation || '',
  source: r.source || '',
  volunteering: r.volunteering || '',
  donation_url: r.donation_url || '',
});
const rad = (d) => (d * Math.PI) / 180;
const haversine = (a, b, c, d) => {
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const matchCats = (have, want) => !want.length || want.some((c) => have.includes(c));

route('GET', '/api/ngo-meta', 'public', () => {
  const rows = db.prepare("SELECT state, city, categories FROM ngos WHERE status = 'approved'").all();
  const counts = {};
  for (const r of rows) for (const c of json(r.categories)) counts[c] = (counts[c] || 0) + 1;
  const states = [...new Set([...rows.map((r) => r.state), ...Object.values(CITIES).map((c) => c[2])])].filter(Boolean).sort();
  const cities = [...new Set([...rows.map((r) => r.city), ...Object.keys(CITIES)])].filter(Boolean).sort();
  const citiesByState = {};
  for (const r of rows) {
    if (r.state && r.city) {
      citiesByState[r.state] ||= new Set();
      citiesByState[r.state].add(r.city);
    }
  }
  const formattedCitiesByState = {};
  for (const [st, set] of Object.entries(citiesByState)) {
    formattedCitiesByState[st] = [...set].sort();
  }
  return {
    categories: CATEGORIES.map((c) => ({ ...c, count: counts[c.slug] || 0 })),
    states,
    cities,
    citiesByState: formattedCitiesByState,
  };
});

route('GET', '/api/ngos', 'public', ({ query }) => {
  const q = (query.get('q') || '').toLowerCase().trim();
  const want = (query.get('category') || '').split(',').filter(Boolean);
  const state = query.get('state') || '';
  const city = (query.get('city') || '').toLowerCase().trim();
  const lat = parseFloat(query.get('lat')), lng = parseFloat(query.get('lng'));
  const maxKm = parseFloat(query.get('maxKm'));
  const near = Number.isFinite(lat) && Number.isFinite(lng);
  let rows = db.prepare("SELECT * FROM ngos WHERE status = 'approved'").all().map(ngoOut)
    .filter((r) => matchCats(r.categories, want)
      && (!state || r.state === state)
      && (!city || r.city.toLowerCase() === city)
      && (!q || [r.name, r.city, r.state, r.head_name, r.head_designation, r.description, ...r.focus, ...r.categories].join(' ').toLowerCase().includes(q)));
  if (near) {
    for (const r of rows) r.distance_km = r.lat == null ? null : Math.round(haversine(lat, lng, r.lat, r.lng) * 10) / 10;
    if (Number.isFinite(maxKm)) rows = rows.filter((r) => r.distance_km != null && r.distance_km <= maxKm);
    rows.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));
  } else rows.sort((a, b) => a.name.localeCompare(b.name));
  const offset = Math.max(0, parseInt(query.get('offset')) || 0), limit = Math.min(100, parseInt(query.get('limit')) || 24);
  return { total: rows.length, items: rows.slice(offset, offset + limit) };
});

route('GET', '/api/ngos/:id', 'public', ({ params }) => {
  const r = db.prepare("SELECT * FROM ngos WHERE id = ? AND status = 'approved'").get(idParam(params.id));
  if (!r) throw new HttpError(404, 'NGO not found');
  const ngo = ngoOut(r);
  const schemes = db.prepare('SELECT * FROM schemes').all().map(schemeOut)
    .filter((s) => s.categories.includes('all') || s.categories.some((c) => ngo.categories.includes(c)));
  return { ...ngo, schemes };
});

function ngoFields(b) {
  const city = str(b.city, 'city', { max: 80 });
  const known = Object.entries(CITIES).find(([k]) => k.toLowerCase() === city.toLowerCase());
  const state = str(b.state, 'state', { max: 80, req: !known }) || (known ? known[1][2] : '');
  const phone = str(b.phone, 'phone', { max: 30, req: false });
  if (phone && !/^[\d\s+()-]{5,30}$/.test(phone)) throw bad('Phone may only contain digits, spaces, + ( ) -');
  const em = str(b.email, 'email', { max: 200, req: false });
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw bad('Enter a valid contact email');
  const focus = Array.isArray(b.focus) ? b.focus : String(b.focus || '').split(',');
  return {
    name: str(b.name, 'name', { max: 150 }),
    head_name: str(b.head_name, 'head name', { max: 100, req: false }),
    head_designation: str(b.head_designation, 'designation', { max: 100, req: false }),
    city: known ? known[0] : city,
    state,
    lat: known ? known[1][0] : null,
    lng: known ? known[1][1] : null,
    categories: JSON.stringify(cats(b.categories)),
    description: str(b.description, 'description', { max: 1500 }),
    focus: JSON.stringify(focus.map((f) => String(f).trim().slice(0, 80)).filter(Boolean).slice(0, 8)),
    website: url(b.website, 'website'),
    phone,
    email: em,
    address: str(b.address, 'address', { max: 300, req: false }),
    source: str(b.source, 'source', { max: 200, req: false }) || 'User submission',
    volunteering: str(b.volunteering, 'volunteering', { max: 500, req: false }),
    donation_url: url(b.donation_url, 'donation URL'),
  };
}
const NGO_COLS = 'name,head_name,head_designation,city,state,lat,lng,categories,description,focus,website,phone,email,address,source,volunteering,donation_url';
route('POST', '/api/ngos', 'user', ({ body, user }) => {
  const f = ngoFields(body);
  const dup = db.prepare('SELECT 1 FROM ngos WHERE LOWER(TRIM(name)) = LOWER(?) AND (LOWER(TRIM(state)) = LOWER(?) OR LOWER(TRIM(city)) = LOWER(?))').get(f.name, f.state, f.city);
  if (dup) throw new HttpError(409, 'An NGO with this name in this state or city is already registered or awaiting review');
  const status = user.role === 'admin' ? 'approved' : 'pending';
  const r = db.prepare(`INSERT INTO ngos (${NGO_COLS},status,submitted_by) VALUES (${NGO_COLS.split(',').map(() => '?').join(',')},?,?)`)
    .run(...NGO_COLS.split(',').map((c) => f[c]), status, user.id);
  return { id: Number(r.lastInsertRowid), status };
});
route('PUT', '/api/ngos/:id', 'admin', ({ params, body }) => {
  const f = ngoFields(body);
  const status = body.status === 'pending' ? 'pending' : 'approved';
  const r = db.prepare(`UPDATE ngos SET ${NGO_COLS.split(',').map((c) => c + '=?').join(',')},status=? WHERE id=?`)
    .run(...NGO_COLS.split(',').map((c) => f[c]), status, idParam(params.id));
  if (!r.changes) throw new HttpError(404, 'NGO not found');
  return { ok: true };
});
route('POST', '/api/ngos/:id/approve', 'admin', ({ params }) => {
  db.prepare("UPDATE ngos SET status='approved' WHERE id=?").run(idParam(params.id));
  return { ok: true };
});
route('DELETE', '/api/ngos/:id', 'admin', ({ params }) => { db.prepare('DELETE FROM ngos WHERE id=?').run(idParam(params.id)); return { ok: true }; });
route('GET', '/api/admin/ngos', 'admin', ({ query }) => {
  const st = query.get('status');
  return db.prepare(`SELECT n.*, u.name AS submitter FROM ngos n LEFT JOIN users u ON u.id = n.submitted_by
    ${st ? 'WHERE n.status = ?' : ''} ORDER BY (n.status = 'pending') DESC, n.name`).all(...(st ? [st] : [])).map(ngoOut);
});

// ---------- government schemes ----------
const SCHEME_TYPES = ['registration', 'tax', 'funding', 'csr', 'programme', 'training'];
const schemeOut = (r) => ({ ...r, categories: json(r.categories) });
route('GET', '/api/schemes', 'public', ({ query }) => {
  const q = (query.get('q') || '').toLowerCase().trim();
  const want = (query.get('category') || '').split(',').filter(Boolean);
  const type = query.get('type') || '';
  return db.prepare('SELECT * FROM schemes ORDER BY name').all().map(schemeOut)
    .filter((s) => (!type || s.type === type) && (!want.length || s.categories.includes('all') || matchCats(s.categories, want))
      && (!q || [s.name, s.ministry, s.summary, s.benefits].join(' ').toLowerCase().includes(q)));
});
function schemeFields(b) {
  if (!SCHEME_TYPES.includes(b.type)) throw bad('Invalid scheme type');
  const c = Array.isArray(b.categories) && b.categories.includes('all') ? ['all'] : cats(b.categories);
  return [str(b.name, 'name', { max: 200 }), str(b.ministry, 'ministry', { max: 200, req: false }), b.type, JSON.stringify(c),
    str(b.summary, 'summary', { max: 1000 }), str(b.benefits, 'benefits', { max: 1000, req: false }),
    str(b.eligibility, 'eligibility', { max: 1000, req: false }), str(b.how_to_apply, 'how to apply', { max: 1000, req: false }), url(b.url, 'url')];
}
route('POST', '/api/schemes', 'admin', ({ body }) => ({
  id: Number(db.prepare('INSERT INTO schemes (name,ministry,type,categories,summary,benefits,eligibility,how_to_apply,url) VALUES (?,?,?,?,?,?,?,?,?)').run(...schemeFields(body)).lastInsertRowid),
}));
route('PUT', '/api/schemes/:id', 'admin', ({ params, body }) => {
  db.prepare('UPDATE schemes SET name=?,ministry=?,type=?,categories=?,summary=?,benefits=?,eligibility=?,how_to_apply=?,url=? WHERE id=?').run(...schemeFields(body), idParam(params.id));
  return { ok: true };
});
route('DELETE', '/api/schemes/:id', 'admin', ({ params }) => { db.prepare('DELETE FROM schemes WHERE id=?').run(idParam(params.id)); return { ok: true }; });

// ---------- rooms & campus directory ----------
const facOut = (f) => ({ ...f, subjects: json(f.subjects) });

function assertRoomFree(roomId, day, start, end, excludeEvent = 0) {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
  if (!room) throw bad('Unknown room');
  const cells = availability(day, { excludeEvent }).find((r) => r.id === roomId).cells;
  const busy = cells.find((c) => c.s !== 'free' && c.s !== 'past' && c.h * 60 < toMin(end) && (c.h + 1) * 60 > toMin(start));
  if (busy) throw new HttpError(409, `${room.name} is not free then (${busy.s}: ${busy.label})`);
}

route('GET', '/api/rooms', 'public', ({ query }) => {
  const bld = query?.get('building') || '';
  const flr = query?.get('floor');
  const type = query?.get('type') || '';
  const q = (query?.get('q') || '').toLowerCase().trim();
  const bookable = query?.get('bookable');

  let rows = db.prepare('SELECT * FROM rooms ORDER BY building, name').all();
  if (bld) rows = rows.filter((r) => (r.building || '').toLowerCase() === bld.toLowerCase());
  if (flr !== null && flr !== undefined && flr !== '') rows = rows.filter((r) => String(r.floor) === String(flr));
  if (type) rows = rows.filter((r) => r.type === type);
  if (bookable === '1') rows = rows.filter((r) => r.is_bookable === 1 && r.has_timetable === 1);
  if (q) rows = rows.filter((r) => [r.name, r.room_code, r.official_code, r.suffix, r.building, r.type, r.department, r.facilities].join(' ').toLowerCase().includes(q));
  return rows;
});

route('POST', '/api/rooms', 'admin', ({ body }) => {
  try {
    return { id: Number(db.prepare('INSERT INTO rooms (name,building,floor,capacity,type,facilities) VALUES (?,?,?,?,?,?)').run(
      str(body.name, 'name', { max: 80 }), str(body.building, 'building', { max: 80, req: false }), int(body.floor ?? 0, 'floor', -2, 50),
      int(body.capacity, 'capacity', 1, 5000), str(body.type, 'type', { max: 50, req: false }) || 'Classroom',
      str(body.facilities, 'facilities', { max: 200, req: false })).lastInsertRowid) };
  } catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'A room with this name already exists'); throw e; }
});
route('PATCH', '/api/rooms/:id', 'staff', ({ params, body }) => {
  if (!['available', 'maintenance'].includes(body.status)) throw bad('Invalid status');
  db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(body.status, idParam(params.id));
  return { ok: true };
});
route('DELETE', '/api/rooms/:id', 'admin', ({ params }) => { db.prepare('DELETE FROM rooms WHERE id=?').run(idParam(params.id)); return { ok: true }; });

route('GET', '/api/availability', 'public', ({ query, user }) => {
  const day = query.get('date') || nowCampus().date;
  date(day, 'date');
  const rooms = availability(day, { user });
  const bookable = query.get('bookable');
  if (bookable === '1') return { date: day, now: nowCampus(), hours: HOURS, rooms: rooms.filter((r) => r.is_bookable === 1 && r.has_timetable === 1) };
  return { date: day, now: nowCampus(), hours: HOURS, rooms };
});

// ---------- Campus Building & Room Directory APIs ----------
route('GET', '/api/campus/buildings', 'public', () => {
  const blds = db.prepare('SELECT * FROM buildings ORDER BY sort_order, id').all();
  return blds.map((b) => {
    const rc = db.prepare('SELECT COUNT(*) n FROM rooms WHERE building = ? OR building_id = ?').get(b.name, b.id).n;
    const fc = db.prepare('SELECT COUNT(*) n FROM faculty WHERE building = ? OR building_id = ?').get(b.name, b.id).n;
    return {
      ...b,
      departments: json(b.departments),
      floors_list: json(b.floors_list),
      room_count: rc,
      faculty_count: fc,
    };
  });
});

route('GET', '/api/campus/buildings/:id', 'public', ({ params }) => {
  const id = idParam(params.id);
  const b = db.prepare('SELECT * FROM buildings WHERE id = ?').get(id);
  if (!b) throw new HttpError(404, 'Building not found');
  const rooms = db.prepare('SELECT * FROM rooms WHERE building = ? OR building_id = ? ORDER BY floor, room_code, name').all(b.name, b.id);
  const faculty = db.prepare('SELECT * FROM faculty WHERE building = ? OR building_id = ? ORDER BY floor, name').all(b.name, b.id).map(facOut);
  return {
    ...b,
    departments: json(b.departments),
    floors_list: json(b.floors_list),
    rooms,
    faculty,
  };
});

route('GET', '/api/campus/rooms', 'public', ({ query }) => {
  const q = (query.get('q') || '').toLowerCase().trim();
  const bld = query.get('building') || '';
  const bldId = parseInt(query.get('building_id')) || 0;
  const floor = query.get('floor');
  const type = query.get('type') || '';
  const dept = (query.get('department') || '').toLowerCase().trim();
  const bookable = query.get('bookable');

  let rows = db.prepare('SELECT * FROM rooms ORDER BY building, floor, room_code, name').all();
  if (bld) rows = rows.filter((r) => (r.building || '').toLowerCase() === bld.toLowerCase());
  if (bldId) rows = rows.filter((r) => r.building_id === bldId);
  if (floor !== null && floor !== undefined && floor !== '') rows = rows.filter((r) => String(r.floor) === String(floor));
  if (type) rows = rows.filter((r) => r.type === type);
  if (dept) rows = rows.filter((r) => (r.department || '').toLowerCase().includes(dept));
  if (bookable === '1') rows = rows.filter((r) => r.is_bookable === 1 && r.has_timetable === 1);
  if (bookable === '0') rows = rows.filter((r) => r.is_bookable === 0);
  if (q) {
    rows = rows.filter((r) => [r.name, r.room_code, r.official_code, r.suffix, r.building, r.type, r.department, r.facilities].join(' ').toLowerCase().includes(q));
  }
  return rows;
});

route('GET', '/api/campus/rooms/:id', 'public', ({ params }) => {
  const r = db.prepare('SELECT * FROM rooms WHERE id = ?').get(idParam(params.id));
  if (!r) throw new HttpError(404, 'Room not found');
  const faculty = db.prepare("SELECT * FROM faculty WHERE room_id = ? OR (room_code != '' AND room_code = ?)").all(r.id, r.room_code || '---').map(facOut);
  const building = r.building_id ? db.prepare('SELECT * FROM buildings WHERE id = ?').get(r.building_id) : db.prepare('SELECT * FROM buildings WHERE name = ?').get(r.building);
  let availability_status = 'Availability not configured';
  if (r.status === 'maintenance') availability_status = 'Under Maintenance';
  else if (r.is_bookable === 0) availability_status = r.booking_restriction || 'Restricted Facility - Not Bookable';
  else if (r.has_timetable === 1) availability_status = 'Available for Booking';

  const tt = r.has_timetable === 1 ? db.prepare('SELECT * FROM timetable WHERE room_id = ? ORDER BY weekday, start_h').all(r.id) : [];

  return {
    ...r,
    faculty,
    building: building ? { ...building, departments: json(building.departments), floors_list: json(building.floors_list) } : null,
    availability_status,
    timetable: tt,
  };
});

route('GET', '/api/campus/faculty', 'public', ({ query }) => {
  const q = (query.get('q') || '').toLowerCase().trim();
  const dept = (query.get('department') || '').toLowerCase().trim();
  const bld = query.get('building') || '';
  const floor = query.get('floor');

  let rows = db.prepare('SELECT f.*, r.official_code, r.type AS room_type FROM faculty f LEFT JOIN rooms r ON r.id = f.room_id ORDER BY f.department, f.name').all().map(facOut);
  if (dept) rows = rows.filter((f) => (f.department || '').toLowerCase().includes(dept));
  if (bld) rows = rows.filter((f) => (f.building || '').toLowerCase() === bld.toLowerCase());
  if (floor !== null && floor !== undefined && floor !== '') rows = rows.filter((f) => String(f.floor) === String(floor));
  if (q) {
    rows = rows.filter((f) => [f.name, f.designation, f.department, f.room_code, f.official_code, f.building].join(' ').toLowerCase().includes(q));
  }
  return rows;
});

route('GET', '/api/campus/faculty/:id', 'public', ({ params }) => {
  const f = db.prepare('SELECT f.*, r.official_code, r.type AS room_type, r.name AS room_name FROM faculty f LEFT JOIN rooms r ON r.id = f.room_id WHERE f.id = ?').get(idParam(params.id));
  if (!f) throw new HttpError(404, 'Faculty member not found');
  const building = f.building_id ? db.prepare('SELECT * FROM buildings WHERE id = ?').get(f.building_id) : db.prepare('SELECT * FROM buildings WHERE name = ?').get(f.building);
  return {
    ...facOut(f),
    building: building ? { ...building, departments: json(building.departments), floors_list: json(building.floors_list) } : null,
  };
});

route('GET', '/api/campus/search', 'public', ({ query }) => {
  const q = (query.get('q') || '').toLowerCase().trim();
  if (!q) return { buildings: [], rooms: [], faculty: [] };

  const buildings = db.prepare('SELECT * FROM buildings ORDER BY sort_order').all()
    .map((b) => ({ ...b, departments: json(b.departments), floors_list: json(b.floors_list) }))
    .filter((b) => [b.name, b.code, b.description, ...b.departments].join(' ').toLowerCase().includes(q))
    .slice(0, 10);

  const rooms = db.prepare('SELECT * FROM rooms ORDER BY building, floor, room_code').all()
    .filter((r) => [r.name, r.room_code, r.official_code, r.suffix, r.building, r.type, r.department, r.facilities].join(' ').toLowerCase().includes(q))
    .slice(0, 30);

  const faculty = db.prepare('SELECT f.*, r.official_code FROM faculty f LEFT JOIN rooms r ON r.id = f.room_id ORDER BY f.name').all().map(facOut)
    .filter((f) => [f.name, f.designation, f.department, f.room_code, f.official_code, f.building].join(' ').toLowerCase().includes(q))
    .slice(0, 30);

  return { buildings, rooms, faculty };
});

// ---------- timetable ----------
route('GET', '/api/timetable', 'public', ({ query }) => {
  const rid = parseInt(query.get('room_id'));
  return db.prepare(`SELECT t.*, r.name AS room_name FROM timetable t JOIN rooms r ON r.id = t.room_id
    ${rid ? 'WHERE t.room_id = ?' : ''} ORDER BY t.weekday, t.start_h`).all(...(rid ? [rid] : []));
});
route('POST', '/api/timetable', 'staff', ({ body }) => {
  const room_id = int(body.room_id, 'room', 1, 1e9), weekday = int(body.weekday, 'weekday', 1, 7);
  const start_h = int(body.start_h, 'start hour', OPEN_H, CLOSE_H - 1), end_h = int(body.end_h, 'end hour', OPEN_H + 1, CLOSE_H);
  if (end_h <= start_h) throw bad('End must be after start');
  if (!db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(room_id)) throw bad('Unknown room');
  if (db.prepare('SELECT 1 FROM timetable WHERE room_id=? AND weekday=? AND start_h < ? AND end_h > ?').get(room_id, weekday, end_h, start_h))
    throw new HttpError(409, 'Overlaps an existing class in this room');
  return { id: Number(db.prepare('INSERT INTO timetable (room_id,weekday,start_h,end_h,title,faculty) VALUES (?,?,?,?,?,?)').run(
    room_id, weekday, start_h, end_h, str(body.title, 'title', { max: 120 }), str(body.faculty, 'faculty', { max: 100, req: false })).lastInsertRowid) };
});
route('DELETE', '/api/timetable/:id', 'staff', ({ params }) => { db.prepare('DELETE FROM timetable WHERE id=?').run(idParam(params.id)); return { ok: true }; });

// ---------- bookings ----------
const BOOKING_SQL = `SELECT b.*, r.name AS room_name, r.building, u.name AS user_name, u.role AS user_role
  FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.user_id`;
route('POST', '/api/bookings', 'user', ({ body, user }) => {
  const staff = isStaff(user);
  const room_id = int(body.room_id, 'room', 1, 1e9), day = date(body.date, 'date');
  const start_h = int(body.start_h, 'start hour', OPEN_H, CLOSE_H - 1), end_h = int(body.end_h, 'end hour', OPEN_H + 1, CLOSE_H);
  if (end_h <= start_h) throw bad('End must be after start');
  const maxH = staff ? 8 : 4;
  if (end_h - start_h > maxH) throw bad(`Bookings are limited to ${maxH} hours`);
  const today = nowCampus().date;
  if (day > addDays(today, 30)) throw bad('Bookings open up to 30 days ahead');
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(room_id);
  if (!room) throw new HttpError(404, 'Room not found');
  if (room.is_bookable === 0) throw bad(`${room.name} is a restricted facility (${room.booking_restriction || 'Restricted'}) and cannot be booked`);
  if (room.has_timetable === 0) throw bad(`${room.name} does not have booking availability configured`);
  const attendees = int(body.attendees ?? 1, 'attendees', 1, 10000);
  if (attendees > room.capacity) throw bad(`${room.name} holds at most ${room.capacity} people`);
  const purpose = str(body.purpose, 'purpose', { max: 200 });
  if (!staff && db.prepare("SELECT COUNT(*) n FROM bookings WHERE user_id = ? AND date >= ? AND status IN ('pending','approved')").get(user.id, today).n >= 5)
    throw bad('You have 5 upcoming bookings already. Cancel one to make another.');
  // sync + single process: check-then-insert cannot interleave. ponytail: add a unique slot table if you ever run multiple instances.
  const bad_cell = availability(day).find((r) => r.id === room_id).cells.find((c) => c.h >= start_h && c.h < end_h && c.s !== 'free');
  if (bad_cell) throw new HttpError(409, bad_cell.s === 'past' ? 'That time has already passed' : `${String(bad_cell.h).padStart(2, '0')}:00 is not available (${bad_cell.s})`);
  const status = staff ? 'approved' : 'pending';
  const r = db.prepare('INSERT INTO bookings (room_id,user_id,date,start_h,end_h,purpose,attendees,status,decided_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(room_id, user.id, day, start_h, end_h, purpose, attendees, status, staff ? user.id : null);
  return { id: Number(r.lastInsertRowid), status };
});
route('GET', '/api/bookings', 'user', ({ query, user }) => {
  const all = query.get('scope') === 'all';
  if (all && !isStaff(user)) throw new HttpError(403, 'Faculty only');
  const st = query.get('status');
  const where = [], args = [];
  if (!all) { where.push('b.user_id = ?'); args.push(user.id); }
  if (st) { where.push('b.status = ?'); args.push(st); }
  return db.prepare(`${BOOKING_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.date DESC, b.start_h LIMIT 300`).all(...args);
});
route('POST', '/api/bookings/:id/cancel', 'user', ({ params, user }) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(idParam(params.id));
  if (!b || (b.user_id !== user.id && !isStaff(user))) throw new HttpError(404, 'Booking not found');
  if (!['pending', 'approved'].includes(b.status)) throw bad(`Booking is already ${b.status}`);
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
  return { ok: true };
});
route('POST', '/api/bookings/:id/decide', 'staff', ({ params, body, user }) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(idParam(params.id));
  if (!b) throw new HttpError(404, 'Booking not found');
  if (b.status !== 'pending') throw bad(`Booking is already ${b.status}`);
  db.prepare('UPDATE bookings SET status = ?, note = ?, decided_by = ? WHERE id = ?')
    .run(body.approve ? 'approved' : 'rejected', str(body.note, 'note', { max: 300, req: false }), user.id, b.id);
  return { ok: true };
});

// ---------- events ----------
const EVENT_SQL = `SELECT e.*, (SELECT COUNT(*) FROM rsvps WHERE event_id = e.id) AS rsvp_count,
  EXISTS (SELECT 1 FROM rsvps WHERE event_id = e.id AND user_id = ?) AS going, r.name AS room_name
  FROM events e LEFT JOIN rooms r ON r.id = e.room_id`;
route('GET', '/api/events', 'public', ({ query, user }) => {
  const when = query.get('when') || 'upcoming', today = nowCampus().date;
  const q = (query.get('q') || '').toLowerCase().trim(), cat = query.get('category') || '';
  const dir = when === 'past' ? 'DESC' : 'ASC';
  return db.prepare(`${EVENT_SQL} ${when === 'all' ? '' : when === 'past' ? 'WHERE e.date < ?' : 'WHERE e.date >= ?'} ORDER BY e.date ${dir}, e.start_time ${dir}`)
    .all(user?.id ?? 0, ...(when === 'all' ? [] : [today]))
    .filter((e) => (!cat || e.category === cat) && (!q || [e.title, e.description, e.venue, e.organizer].join(' ').toLowerCase().includes(q)))
    .map((e) => ({ ...e, going: !!e.going }));
});
function eventFields(b, excludeId = 0) {
  const day = date(b.date, 'date'), start = time(b.start_time, 'start time'), end = time(b.end_time, 'end time');
  if (toMin(end) <= toMin(start)) throw bad('End time must be after start time');
  const room_id = b.room_id ? int(b.room_id, 'room', 1, 1e9) : null;
  if (room_id) assertRoomFree(room_id, day, start, end, excludeId);
  const venueName = room_id ? db.prepare('SELECT name FROM rooms WHERE id = ?').get(room_id).name : '';
  return [str(b.title, 'title', { max: 150 }), str(b.description, 'description', { max: 2000, req: false }),
    str(b.category, 'category', { max: 50, req: false }) || 'General', day, start, end,
    str(b.venue, 'venue', { max: 150, req: !room_id }) || venueName, room_id, str(b.organizer, 'organizer', { max: 100, req: false })];
}
route('POST', '/api/events', 'staff', ({ body, user }) => ({
  id: Number(db.prepare('INSERT INTO events (title,description,category,date,start_time,end_time,venue,room_id,organizer,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(...eventFields(body), user.id).lastInsertRowid),
}));
route('PUT', '/api/events/:id', 'staff', ({ params, body }) => {
  const id = idParam(params.id);
  const r = db.prepare('UPDATE events SET title=?,description=?,category=?,date=?,start_time=?,end_time=?,venue=?,room_id=?,organizer=? WHERE id=?').run(...eventFields(body, id), id);
  if (!r.changes) throw new HttpError(404, 'Event not found');
  return { ok: true };
});
route('DELETE', '/api/events/:id', 'staff', ({ params }) => { db.prepare('DELETE FROM events WHERE id=?').run(idParam(params.id)); return { ok: true }; });
route('POST', '/api/events/:id/rsvp', 'user', ({ params, user }) => {
  const id = idParam(params.id);
  if (!db.prepare('SELECT 1 FROM events WHERE id = ?').get(id)) throw new HttpError(404, 'Event not found');
  const had = db.prepare('DELETE FROM rsvps WHERE event_id = ? AND user_id = ?').run(id, user.id).changes;
  if (!had) db.prepare('INSERT INTO rsvps (event_id,user_id) VALUES (?,?)').run(id, user.id);
  return { going: !had };
});

// ---------- cameras (privacy-gated, every view is logged) ----------
const camVisible = (c, user) => user.role === 'admin' || !c.admin_only;
route('GET', '/api/cameras', 'staff', ({ user }) =>
  db.prepare('SELECT * FROM cameras ORDER BY id').all().filter((c) => camVisible(c, user))
    .map((c) => ({ ...c, stream_url: user.role === 'admin' ? c.stream_url : undefined })));
route('POST', '/api/cameras/:id/view', 'staff', ({ params, user }) => {
  const c = db.prepare('SELECT * FROM cameras WHERE id = ?').get(idParam(params.id));
  if (!c || !camVisible(c, user)) throw new HttpError(404, 'Camera not found');
  if (c.privacy_mode) throw new HttpError(403, 'This feed is paused (privacy mode is on).');
  db.prepare('INSERT INTO camera_log (camera_id, user_id) VALUES (?,?)').run(c.id, user.id);
  return { id: c.id, type: c.type, stream_url: c.stream_url };
});
function cameraFields(b) {
  if (!['demo', 'device', 'mjpeg', 'image', 'hls'].includes(b.type)) throw bad('Invalid camera type');
  const u = url(b.stream_url, 'stream URL');
  if (['mjpeg', 'image', 'hls'].includes(b.type) && !u) throw bad('Stream URL is required for this camera type');
  return [str(b.name, 'name', { max: 100 }), str(b.location, 'location', { max: 150, req: false }), b.type, u, b.privacy_mode ? 1 : 0, b.admin_only ? 1 : 0];
}
route('POST', '/api/cameras', 'admin', ({ body }) => ({
  id: Number(db.prepare('INSERT INTO cameras (name,location,type,stream_url,privacy_mode,admin_only) VALUES (?,?,?,?,?,?)').run(...cameraFields(body)).lastInsertRowid),
}));
route('PUT', '/api/cameras/:id', 'admin', ({ params, body }) => {
  db.prepare('UPDATE cameras SET name=?,location=?,type=?,stream_url=?,privacy_mode=?,admin_only=? WHERE id=?').run(...cameraFields(body), idParam(params.id));
  return { ok: true };
});
route('DELETE', '/api/cameras/:id', 'admin', ({ params }) => { db.prepare('DELETE FROM cameras WHERE id=?').run(idParam(params.id)); return { ok: true }; });
route('GET', '/api/cameras/log', 'admin', () => db.prepare(`SELECT l.id, l.at, c.name AS camera, u.name AS user, u.role FROM camera_log l
  LEFT JOIN cameras c ON c.id = l.camera_id LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 200`).all());

// ---------- stats ----------
route('GET', '/api/stats', 'public', () => {
  const now = nowCampus(), h = Math.floor(now.minutes / 60);
  const rooms = availability(now.date);
  const bookableRooms = rooms.filter((r) => r.is_bookable !== 0 && r.has_timetable !== 0);
  return {
    ngos: db.prepare("SELECT COUNT(*) n FROM ngos WHERE status='approved'").get().n,
    schemes: db.prepare('SELECT COUNT(*) n FROM schemes').get().n,
    upcoming_events: db.prepare('SELECT COUNT(*) n FROM events WHERE date >= ?').get(now.date).n,
    rooms: bookableRooms.length,
    total_campus_rooms: rooms.length,
    buildings: db.prepare('SELECT COUNT(*) n FROM buildings').get().n,
    faculty: db.prepare('SELECT COUNT(*) n FROM faculty').get().n,
    open: h >= OPEN_H && h < CLOSE_H,
    rooms_free_now: bookableRooms.filter((r) => r.cells.find((c) => c.h === h)?.s === 'free').length,
    pending_bookings: db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='pending'").get().n,
    weekday: weekdayOf(now.date),
  };
});

// ---------- HTTP plumbing ----------
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 100_000) { reject(new HttpError(413, 'Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!size) return resolve({});
      try { const b = JSON.parse(Buffer.concat(chunks).toString()); resolve(b && typeof b === 'object' && !Array.isArray(b) ? b : {}); }
      catch { reject(bad('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, u) {
  let matched = false;
  for (const r of routes) {
    const m = r.re.exec(u.pathname);
    if (!m) continue;
    matched = true;
    if (r.method !== req.method) continue;
    const user = sessionUser(req);
    if (r.role !== 'public' && !user) throw new HttpError(401, 'Please log in');
    if (r.role === 'staff' && !isStaff(user)) throw new HttpError(403, 'Faculty access required');
    if (r.role === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Administrator access required');
    let body = {};
    if (req.method !== 'GET') {
      // requiring JSON content-type blocks cross-site form posts (CSRF) on top of SameSite=Lax cookies
      if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Content-Type must be application/json');
      body = await readBody(req);
    }
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    return send(res, 200, await r.fn({ req, res, params, query: u.searchParams, body, user }));
  }
  throw new HttpError(matched ? 405 : 404, matched ? 'Method not allowed' : 'Not found');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
async function serveStatic(req, res, u) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
  if (u.pathname === '/faculty') { res.writeHead(302, { Location: '/#/faculty' }); return res.end(); }
  const rel = normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, '') || 'index.html';
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) throw new HttpError(403, 'Forbidden');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { throw new HttpError(404, 'Not found'); }
}

export const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src * data: blob:; media-src * blob: data:; connect-src *; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname.startsWith('/api/')) await handleApi(req, res, u); else await serveStatic(req, res, u);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (res.headersSent) return res.end();
    if (req.url.startsWith('/api/')) send(res, status, { error: status === 500 ? 'Something went wrong' : e.message });
    else { res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(status === 404 ? 'Not found' : e.message); }
  }
});

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT) || 3000, host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Campus Connect running at http://${host}:${port}`));
}
