import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CITIES, NGOS, SCHEMES, ROOMS, COURSES, CAMERAS } from './seed-data.js';

export const TZ = process.env.TZ_CAMPUS || 'Asia/Kolkata';
export const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]; // slot h = h:00-(h+1):00
export const OPEN_H = HOURS[0];
export const CLOSE_H = HOURS.at(-1) + 1;

const path = process.env.DB_PATH || new URL('./data/campus.db', import.meta.url).pathname;
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('student','faculty','admin')),
  department TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ngos (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, lat REAL, lng REAL,
  categories TEXT NOT NULL DEFAULT '[]', description TEXT DEFAULT '', focus TEXT NOT NULL DEFAULT '[]',
  website TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved')),
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS schemes (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, ministry TEXT DEFAULT '', type TEXT NOT NULL DEFAULT 'funding',
  categories TEXT NOT NULL DEFAULT '["all"]', summary TEXT DEFAULT '', benefits TEXT DEFAULT '',
  eligibility TEXT DEFAULT '', how_to_apply TEXT DEFAULT '', url TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, building TEXT DEFAULT '', floor INTEGER DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 30, type TEXT DEFAULT 'Classroom', facilities TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','maintenance')));
CREATE TABLE IF NOT EXISTS timetable (
  id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), start_h INTEGER NOT NULL, end_h INTEGER NOT NULL,
  title TEXT NOT NULL, faculty TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', category TEXT DEFAULT 'General',
  date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, venue TEXT DEFAULT '',
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL, organizer TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rsvps (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (event_id, user_id));
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL,
  start_h INTEGER NOT NULL, end_h INTEGER NOT NULL, purpose TEXT NOT NULL, attendees INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  note TEXT DEFAULT '', decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS bookings_room_date ON bookings(room_id, date);
CREATE TABLE IF NOT EXISTS cameras (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, location TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'demo' CHECK (type IN ('demo','device','mjpeg','image','hls')),
  stream_url TEXT DEFAULT '', privacy_mode INTEGER NOT NULL DEFAULT 0, admin_only INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS camera_log (
  id INTEGER PRIMARY KEY, camera_id INTEGER REFERENCES cameras(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

// ---------- passwords ----------
export function hashPassword(pw) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const got = scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

// ---------- time helpers (campus timezone) ----------
export function nowCampus() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: +g('hour') * 60 + +g('minute') };
}
export const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const weekdayOf = (date) => new Date(date + 'T00:00:00Z').getUTCDay() || 7; // Mon=1..Sun=7
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && addDays(s, 0) === s;
export const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

// ---------- availability: single source of truth for "is this slot free?" ----------
// state: free | class | booked | pending | event | blocked | past
export function availability(date, { user = null, excludeEvent = 0 } = {}) {
  const now = nowCampus();
  const staff = user && (user.role === 'faculty' || user.role === 'admin');
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY building, name').all();
  const tt = db.prepare('SELECT * FROM timetable WHERE weekday = ?').all(weekdayOf(date));
  const bk = db.prepare("SELECT * FROM bookings WHERE date = ? AND status IN ('pending','approved')").all(date);
  const ev = db.prepare('SELECT * FROM events WHERE date = ? AND room_id IS NOT NULL AND id != ?').all(date, excludeEvent);
  return rooms.map((r) => ({
    ...r,
    cells: HOURS.map((h) => {
      const cell = (s, label = '') => ({ h, s, label });
      if (r.status === 'maintenance') return cell('blocked', 'Maintenance');
      const c = tt.find((x) => x.room_id === r.id && x.start_h <= h && h < x.end_h);
      if (c) return cell('class', c.title);
      const e = ev.find((x) => x.room_id === r.id && toMin(x.start_time) < (h + 1) * 60 && toMin(x.end_time) > h * 60);
      if (e) return cell('event', e.title);
      const b = bk.find((x) => x.room_id === r.id && x.start_h <= h && h < x.end_h);
      if (b) {
        const mine = staff || (user && b.user_id === user.id);
        return { ...cell(b.status === 'approved' ? 'booked' : 'pending', mine ? b.purpose : 'Reserved'), bookingId: mine ? b.id : undefined };
      }
      if (date < now.date || (date === now.date && h * 60 + 59 < now.minutes)) return cell('past');
      return cell('free');
    }),
  }));
}

// ---------- seed ----------
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

if (!db.prepare('SELECT 1 FROM rooms LIMIT 1').get()) {
  db.exec('BEGIN');
  const insNgo = db.prepare('INSERT INTO ngos (name,city,state,lat,lng,categories,description,focus,website) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const [name, city, cats, web, desc, focus] of NGOS) {
    const [lat, lng, state] = CITIES[city];
    insNgo.run(name, city, state, lat, lng, JSON.stringify(cats), desc, JSON.stringify(focus), web);
  }
  const insScheme = db.prepare('INSERT INTO schemes (name,ministry,type,categories,summary,benefits,eligibility,how_to_apply,url) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const [n, m, t, c, s, b, e, h, u] of SCHEMES) insScheme.run(n, m, t, JSON.stringify(c), s, b, e, h, u);

  const insRoom = db.prepare('INSERT INTO rooms (name,building,floor,capacity,type,facilities) VALUES (?,?,?,?,?,?)');
  const roomIds = ROOMS.map((r) => Number(insRoom.run(...r).lastInsertRowid));

  // deterministic timetable: Mon-Sat, 2-3 blocks per room per day (skip auditorium / library rooms)
  const rnd = lcg(42);
  const insTT = db.prepare('INSERT INTO timetable (room_id,weekday,start_h,end_h,title,faculty) VALUES (?,?,?,?,?,?)');
  ROOMS.forEach((r, i) => {
    if (r[4] === 'Auditorium' || r[4] === 'Discussion Room') return;
    for (let wd = 1; wd <= 6; wd++) {
      let h = OPEN_H + Math.floor(rnd() * 2);
      for (let k = 0; k < 3 && h < CLOSE_H - 1; k++) {
        const len = r[4] === 'Lab' ? 2 : 1 + Math.floor(rnd() * 2);
        const end = Math.min(h + len, CLOSE_H);
        const [title, fac] = COURSES[Math.floor(rnd() * COURSES.length)];
        if (rnd() > 0.2) insTT.run(roomIds[i], wd, h, end, r[4] === 'Lab' ? `${title} Lab` : title, fac);
        h = end + 1 + Math.floor(rnd() * 2);
      }
    }
  });

  const insCam = db.prepare('INSERT INTO cameras (name,location,type) VALUES (?,?,?)');
  for (const c of CAMERAS) insCam.run(...c);

  if (process.env.SEED_DEMO !== '0') {
    const insUser = db.prepare('INSERT INTO users (name,email,pass_hash,role,department) VALUES (?,?,?,?,?)');
    insUser.run('Campus Admin', 'admin@campus.edu', hashPassword('admin123'), 'admin', 'Administration');
    const fac = Number(insUser.run('Dr. Asha Rao', 'faculty@campus.edu', hashPassword('faculty123'), 'faculty', 'Computer Engineering').lastInsertRowid);
    insUser.run('Riya Student', 'student@campus.edu', hashPassword('student123'), 'student', 'Computer Engineering');

    const today = nowCampus().date;
    const insEv = db.prepare('INSERT INTO events (title,description,category,date,start_time,end_time,venue,room_id,organizer,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const auditorium = roomIds[ROOMS.findIndex((r) => r[4] === 'Auditorium')];
    const seminar = roomIds[4];
    insEv.run('NGO Volunteer Fair', 'Meet local NGOs, learn about their work and sign up to volunteer. Pairs with the NGO Connect directory.', 'Social Impact', addDays(today, 2), '11:00', '14:00', 'Main Auditorium', auditorium, 'Social Service Cell', fac);
    insEv.run('Placement Orientation', 'Resume tips, aptitude prep and company-wise process overview for final-year students.', 'Career', addDays(today, 4), '10:00', '12:00', 'B-101 Seminar Hall', seminar, 'Training & Placement Cell', fac);
    insEv.run('Blood Donation Camp', 'Organised with a partner NGO and a local blood bank. Donors receive a certificate.', 'Social Impact', addDays(today, 6), '09:00', '13:00', 'Library Lawn', null, 'NSS Unit', fac);
    insEv.run('Tech Fest Kick-off', 'Hackathon, robotics showcase and project exhibition open to all departments.', 'Technical', addDays(today, 9), '09:30', '17:00', 'Main Auditorium', auditorium, 'Student Council', fac);
    insEv.run('Tree Plantation Drive', 'Plant saplings around the campus with an environmental NGO. Gloves and tools provided.', 'Social Impact', addDays(today, 12), '07:30', '09:30', 'North Campus', null, 'Eco Club', fac);
    insEv.run('Cultural Night', 'Music, dance and drama performances by student clubs.', 'Cultural', addDays(today, 15), '17:00', '19:30', 'Open Air Theatre', null, 'Cultural Committee', fac);
    insEv.run('Guest Lecture: AI for Social Good', 'An industry speaker on applying machine learning to healthcare and education problems.', 'Academic', addDays(today, -5), '14:00', '15:30', 'B-102', null, 'CS Department', fac);
  }
  db.exec('COMMIT');
  if (process.env.SEED_DEMO !== '0') console.log('Seeded demo accounts: admin@campus.edu / admin123, faculty@campus.edu / faculty123, student@campus.edu / student123 -- change before real use.');
}
