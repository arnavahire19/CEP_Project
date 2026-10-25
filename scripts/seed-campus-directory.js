import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

export function seedCampusAndNgos(targetDb = db) {
  // 1. Ensure schema tables and columns
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT DEFAULT '',
      description TEXT DEFAULT '',
      departments TEXT DEFAULT '[]',
      floors_count INTEGER DEFAULT 1,
      floors_list TEXT DEFAULT '[]',
      wing TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS faculty (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      designation TEXT DEFAULT '',
      department TEXT NOT NULL,
      building TEXT DEFAULT '',
      building_id INTEGER REFERENCES buildings(id),
      floor INTEGER DEFAULT 0,
      room_code TEXT DEFAULT '',
      room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      subjects TEXT DEFAULT '[]',
      verified INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_faculty_room ON faculty(room_id);
    CREATE INDEX IF NOT EXISTS idx_faculty_dept ON faculty(department);
  `);

  // Ensure helper for ALTER TABLE
  const ensureCol = (tbl, col, def) => {
    const cols = targetDb.prepare(`PRAGMA table_info(${tbl})`).all();
    if (!cols.some((c) => c.name === col)) {
      targetDb.exec(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def};`);
    }
  };

  ensureCol('ngos', 'head_name', "TEXT DEFAULT ''");
  ensureCol('ngos', 'head_designation', "TEXT DEFAULT ''");
  ensureCol('ngos', 'source', "TEXT DEFAULT ''");
  ensureCol('ngos', 'volunteering', "TEXT DEFAULT ''");
  ensureCol('ngos', 'donation_url', "TEXT DEFAULT ''");

  ensureCol('rooms', 'room_code', "TEXT DEFAULT ''");
  ensureCol('rooms', 'official_code', "TEXT DEFAULT ''");
  ensureCol('rooms', 'suffix', "TEXT DEFAULT ''");
  ensureCol('rooms', 'building_id', "INTEGER REFERENCES buildings(id)");
  ensureCol('rooms', 'department', "TEXT DEFAULT ''");
  ensureCol('rooms', 'wing', "TEXT DEFAULT ''");
  ensureCol('rooms', 'is_bookable', "INTEGER NOT NULL DEFAULT 1");
  ensureCol('rooms', 'booking_restriction', "TEXT DEFAULT ''");
  ensureCol('rooms', 'has_timetable', "INTEGER NOT NULL DEFAULT 0");
  ensureCol('rooms', 'verified', "INTEGER NOT NULL DEFAULT 1");
  ensureCol('rooms', 'notes', "TEXT DEFAULT ''");

  // Mark existing initial 13 rooms with has_timetable = 1
  targetDb.prepare('UPDATE rooms SET has_timetable = 1 WHERE id <= 13').run();

  // 2. Load source JSONs
  const bldFile = join(DATA_DIR, 'buildings_source.json');
  const ngoFile = join(DATA_DIR, 'ngos_source.json');
  const roomFile = join(DATA_DIR, 'rooms_source.json');
  const facFile = join(DATA_DIR, 'faculty_source.json');

  if (!existsSync(bldFile) || !existsSync(ngoFile) || !existsSync(roomFile) || !existsSync(facFile)) {
    console.log('Source JSON files missing. Run scripts/parse-pdf-data.py first.');
    return;
  }

  const buildings = JSON.parse(readFileSync(bldFile, 'utf8'));
  const ngos = JSON.parse(readFileSync(ngoFile, 'utf8'));
  const rooms = JSON.parse(readFileSync(roomFile, 'utf8'));
  const faculty = JSON.parse(readFileSync(facFile, 'utf8'));

  targetDb.exec('BEGIN');

  // Seed buildings
  const insBld = targetDb.prepare(`
    INSERT INTO buildings (id, name, code, description, departments, floors_count, floors_list, wing, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      code = excluded.code,
      description = excluded.description,
      departments = excluded.departments,
      floors_count = excluded.floors_count,
      floors_list = excluded.floors_list,
      wing = excluded.wing,
      sort_order = excluded.sort_order
  `);

  for (const b of buildings) {
    insBld.run(
      b.id, b.name, b.code, b.description,
      JSON.stringify(b.departments), b.floors_count,
      JSON.stringify(b.floors_list), b.wing || '', b.sort_order
    );
  }

  // Seed NGOs (skip existing by normalized name + state + city)
  const existingNgos = targetDb.prepare('SELECT name, state, city FROM ngos').all();
  const ngoSet = new Set(existingNgos.map((n) => `${n.name.toLowerCase()}|${n.state.toLowerCase()}|${n.city.toLowerCase()}`));

  const insNgo = targetDb.prepare(`
    INSERT INTO ngos (name, head_name, head_designation, city, state, lat, lng, categories, description, focus, website, phone, email, address, source, volunteering, donation_url, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
  `);

  let newNgosCount = 0;
  for (const n of ngos) {
    const key = `${n.name.toLowerCase()}|${n.state.toLowerCase()}|${n.city.toLowerCase()}`;
    if (ngoSet.has(key)) continue;
    ngoSet.add(key);

    insNgo.run(
      n.name, n.head_name || '', n.head_designation || '', n.city, n.state,
      n.lat || null, n.lng || null, JSON.stringify(n.categories),
      n.description || '', JSON.stringify(n.focus || []),
      n.website || '', n.phone || '', n.email || '', n.address || '',
      n.source || '', n.volunteering || '', n.donation_url || ''
    );
    newNgosCount++;
  }

  // Seed Rooms
  const existingRooms = targetDb.prepare('SELECT id, name, room_code FROM rooms').all();
  const roomNameMap = new Map(existingRooms.map((r) => [r.name, r.id]));
  const roomCodeMap = new Map(existingRooms.filter((r) => r.room_code).map((r) => [r.room_code, r.id]));

  const insRoom = targetDb.prepare(`
    INSERT INTO rooms (name, building, building_id, floor, capacity, type, facilities, status, room_code, official_code, suffix, department, wing, is_bookable, booking_restriction, has_timetable, verified, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updRoom = targetDb.prepare(`
    UPDATE rooms SET
      building = ?, building_id = ?, floor = ?, capacity = ?, type = ?, facilities = ?,
      room_code = ?, official_code = ?, suffix = ?, department = ?, wing = ?,
      is_bookable = ?, booking_restriction = ?, has_timetable = ?, verified = ?, notes = ?
    WHERE id = ?
  `);

  let newRoomsCount = 0;
  const finalRoomCodeToId = new Map(roomCodeMap);

  for (const r of rooms) {
    let existingId = roomNameMap.get(r.name);
    if (!existingId && r.room_code && roomCodeMap.has(r.room_code)) {
      existingId = roomCodeMap.get(r.room_code);
    }

    if (existingId) {
      updRoom.run(
        r.building, r.building_id, r.floor, r.capacity, r.type, r.facilities,
        r.room_code, r.official_code, r.suffix, r.department, r.wing || '',
        r.is_bookable, r.booking_restriction || '', r.has_timetable, r.verified, r.notes || '',
        existingId
      );
      if (r.room_code) finalRoomCodeToId.set(r.room_code, existingId);
    } else {
      const res = insRoom.run(
        r.name, r.building, r.building_id, r.floor, r.capacity, r.type, r.facilities,
        r.room_code, r.official_code, r.suffix, r.department, r.wing || '',
        r.is_bookable, r.booking_restriction || '', r.has_timetable, r.verified, r.notes || ''
      );
      const insertedId = Number(res.lastInsertRowid);
      roomNameMap.set(r.name, insertedId);
      if (r.room_code) finalRoomCodeToId.set(r.room_code, insertedId);
      newRoomsCount++;
    }
  }

  // Seed Faculty
  targetDb.prepare('DELETE FROM faculty').run(); // fresh sync with room links

  const insFac = targetDb.prepare(`
    INSERT INTO faculty (id, name, designation, department, building, building_id, floor, room_code, room_id, email, phone, subjects, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let facultyCount = 0;
  for (const f of faculty) {
    const roomId = f.room_code ? finalRoomCodeToId.get(f.room_code) || null : null;
    insFac.run(
      f.id, f.name, f.designation || '', f.department, f.building, f.building_id,
      f.floor, f.room_code || '', roomId, f.email || '', f.phone || '',
      JSON.stringify(f.subjects || []), f.verified
    );
    facultyCount++;
  }

  targetDb.exec('COMMIT');

  console.log(`Seeding complete:`);
  console.log(`- Buildings: ${buildings.length}`);
  console.log(`- New NGOs imported: ${newNgosCount} (Total in DB: ${targetDb.prepare('SELECT count(*) c FROM ngos').get().c})`);
  console.log(`- New Rooms added/updated: ${newRoomsCount} (Total in DB: ${targetDb.prepare('SELECT count(*) c FROM rooms').get().c})`);
  console.log(`- Faculty members seeded: ${facultyCount}`);
}

// Run immediately if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedCampusAndNgos();
}
