import assert from 'node:assert/strict';
import { db } from '../db.js';

console.log('--- Starting Comprehensive Final Verification ---');

// 1. Verify NGO Data
const ngosCount = db.prepare("SELECT count(*) as count FROM ngos WHERE status='approved'").get().count;
console.log(`✓ Approved NGOs in Database: ${ngosCount} (Expected: 616)`);
assert.equal(ngosCount, 616, 'Total approved NGOs must be exactly 616 (47 previous + 569 imported)');

// Check sample imported NGO fields
const aadhar = db.prepare("SELECT * FROM ngos WHERE name = 'AADHAR FOUNDATION'").get();
assert.ok(aadhar, 'AADHAR FOUNDATION must exist');
assert.equal(aadhar.head_name, 'ER. Mahesh Kinth');
assert.equal(aadhar.head_designation, 'President');
assert.equal(aadhar.city, 'Chhindwara');
assert.equal(aadhar.state, 'Madhya Pradesh');
assert.equal(aadhar.phone, '8989173581');
assert.equal(aadhar.email, 'aadhar.foundation@rediffmail.com');
assert.equal(aadhar.website, '', 'Should not fabricate website URL if missing in source');
assert.ok(aadhar.source.includes('National Trust'), 'Source must reflect National Trust list');
console.log('✓ Verified imported NGO record fields accurately preserved without hallucinations');

// 2. Verify Buildings
const buildings = db.prepare('SELECT * FROM buildings ORDER BY sort_order').all();
console.log(`✓ Campus Buildings in Database: ${buildings.length} (Expected: 12)`);
assert.equal(buildings.length, 12, 'Must have exactly 12 PCCOE buildings');

const expectedBlds = [
  'Building 1', 'Building 3', 'Building 5', 'Building 6', 'Building 7',
  'Building 7(A)', 'Building 8', 'Building 9', 'Building 10', 'Building 11',
  'Sports Complex', 'PCP Building'
];
for (const bName of expectedBlds) {
  assert.ok(buildings.some((b) => b.name === bName), `Building "${bName}" must exist in database`);
}
console.log('✓ All 12 requested campus buildings verified');

// 3. Verify Building 9 and Room Directory
const b9 = buildings.find((b) => b.name === 'Building 9');
const b9Rooms = db.prepare('SELECT * FROM rooms WHERE building = ?').all('Building 9');
console.log(`✓ Building 9 Rooms in Database: ${b9Rooms.length} (Expected >= 40)`);
assert.ok(b9Rooms.length >= 40, 'Building 9 should have at least 40 rooms');

// Check Building 9 official suffixes
const suffixes = new Set(b9Rooms.map((r) => r.suffix));
console.log('✓ Suffixes present in Building 9:', [...suffixes].sort().join(', '));
for (const s of ['LA', 'HO', 'FC', 'TG', 'CM']) {
  assert.ok(suffixes.has(s), `Suffix ${s} should be present in Building 9`);
}

// 4. Verify Faculty Members and Cabin Association
const facultyCount = db.prepare('SELECT count(*) as count FROM faculty').get().count;
console.log(`✓ Faculty Members in Database: ${facultyCount} (Expected: 228)`);
assert.equal(facultyCount, 228, 'Must have exactly 228 faculty members');

// Check HOD Civil Dr. Ajay K. Gaikwad in 9104
const ajay = db.prepare("SELECT * FROM faculty WHERE name LIKE '%Ajay K. Gaikwad%'").get();
assert.ok(ajay, 'Dr. Ajay K. Gaikwad must exist');
assert.equal(ajay.room_code, '9104');
assert.equal(ajay.department, 'Civil');
assert.ok(ajay.room_id, 'Must be linked to room_id in rooms table');

const room9104 = db.prepare('SELECT * FROM rooms WHERE id = ?').get(ajay.room_id);
assert.equal(room9104.room_code, '9104');
assert.equal(room9104.official_code, '9104 HO');
assert.equal(room9104.type, 'Faculty cabin or office');
assert.equal(room9104.is_bookable, 0, 'HOD Office must be restricted from booking');
console.log('✓ Faculty cabin association verified: Dr. Ajay K. Gaikwad -> Room 9104 HO');

// 5. Verify Booking Restrictions on Restricted Facilities
const examCell = db.prepare("SELECT * FROM rooms WHERE name LIKE '%Examination Cell%'").get();
assert.ok(examCell, 'Examination Cell must exist');
assert.equal(examCell.is_bookable, 0, 'Examination Cell must not be bookable');
assert.ok(examCell.booking_restriction.length > 0, 'Must have restriction reason');
console.log('✓ Non-bookable facility restrictions verified for examination/administrative facilities');

console.log('--- All Verification Assertions Passed Successfully! ---');
