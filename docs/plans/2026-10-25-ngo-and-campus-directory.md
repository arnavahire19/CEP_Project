# NGO Connect & Campus Room Directory Enhancement Implementation Plan

> **For Gemini:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance Campus Connect by importing 569 verified Indian NGOs with complete profile fields and duplicate detection into NGO Connect, and building a comprehensive PCCOE Campus Directory featuring 12 buildings, 194 classrooms/labs/cabins with official room codes and suffixes, 228 faculty member cabin associations, and global campus search while keeping room availability and booking restrictions strictly isolated from room identity.

**Architecture:** 
- Backend: Zero-dependency Node.js HTTP server (`server.js`) with built-in `node:sqlite` (`db.js`). Safe schema enhancements for `ngos`, `buildings`, `rooms`, and `faculty` with foreign key relationships.
- Data ingestion: Automated, repeatable scripts (`scripts/import-data.js`) to parse and populate 569 NGOs from `List of ROs under VO.pdf`, 181 campus rooms from `campus_rooms_directory.pdf`, and 228 faculty members from `faculty_directory.pdf`.
- Frontend: Vanilla JavaScript SPA (`public/`) maintaining existing styling, components, responsive layout, and authentication guards.
- Safety: Robust validation, duplicate checks on submission, non-bookable facility protection (exam cells, toilets, staff-only areas), and "Availability not configured" handling.

**Tech Stack:** Node.js 22.13+, `node:sqlite` (DatabaseSync), Vanilla JS (ES Modules), CSS3, Python 3 (pdfplumber for data extraction).

---

### Task 1: Data Parsing & Normalization Scripts

**Files:**
- Create: `scripts/parse-pdf-data.py`
- Create: `data/ngos_source.json`
- Create: `data/rooms_source.json`
- Create: `data/faculty_source.json`
- Test: `tests/data-integrity.test.js`

**Step 1: Write data extraction script**
Write `scripts/parse-pdf-data.py` to extract all 569 NGOs from `List of ROs under VO.pdf`, 181 rooms from `campus_rooms_directory.pdf`, and 228 faculty members from `faculty_directory.pdf`, standardizing states, districts, room codes, designations, and categories.

**Step 2: Run script to generate JSON sources**
Run: `python3 scripts/parse-pdf-data.py`
Expected: 569 NGOs, 181 rooms, 228 faculty generated in `data/`.

**Step 3: Verify record counts and data integrity**
Run a test script verifying:
- Exactly 569 NGOs with non-empty names, states, districts, and valid mobile/emails.
- 181 rooms mapped to buildings and floors.
- 228 faculty members with departments and room locations.

---

### Task 2: Database Schema & Seeder Enhancements

**Files:**
- Modify: `db.js`
- Create: `scripts/seed-campus-directory.js`
- Test: `test.js`

**Step 1: Update `db.js` schema**
- Add `head_name`, `head_designation`, `source`, `volunteering`, `donation_url` to `ngos` table.
- Create `buildings` table (`id`, `name`, `code`, `description`, `departments`, `floors_count`, `floors_list`, `wing`, `sort_order`).
- Add columns to `rooms`: `room_code`, `official_code`, `suffix`, `building_id`, `department`, `wing`, `is_bookable`, `booking_restriction`, `has_timetable`, `verified`, `notes`.
- Create `faculty` table (`id`, `name`, `designation`, `department`, `building`, `building_id`, `floor`, `room_code`, `room_id`, `email`, `phone`, `subjects`, `verified`).
- Update `availability()` helper in `db.js` to return `blocked` with restriction reason for `is_bookable === 0`, and `unconfigured` with 'Availability not configured' for `has_timetable === 0`.

**Step 2: Implement repeatable seeder script**
Write `scripts/seed-campus-directory.js` to:
- Seed the 12 campus buildings: Building 1, Building 3, Building 5, Building 6, Building 7, Building 7(A), Building 8, Building 9, Building 10, Building 11, Sports Complex, PCP Building (Wings A, B, C, D, E).
- Seed the 569 NGOs into `ngos` without duplicating existing records.
- Seed all rooms with correct building, floor, official suffixes (`CR`, `LA`, `HO`, `FC`, `DH`, `SH`, `EO`, `TG`, `TB`, `DL`, `CM`, `TU`), room types, and booking restrictions.
- Seed all 228 faculty members, linking them to their corresponding room record by `room_id`.

**Step 3: Run existing test suite to ensure backwards compatibility**
Run: `npm test`
Expected: PASS (all 10 existing tests pass).

---

### Task 3: NGO Connect API & Duplicate Check Enhancements

**Files:**
- Modify: `server.js`
- Modify: `test.js`

**Step 1: Enhance `/api/ngos` GET & meta**
- Support filtering by `state`, `city` / `district`, `category`, text search `q` (matching NGO name, city, state, head name, description, focus).
- Return paginated results (`limit`, `offset`, `total`) efficiently.
- In `GET /api/ngo-meta`, aggregate all states and districts from all approved NGOs.

**Step 2: Add Duplicate Prevention & Validation to `POST /api/ngos`**
- Check for existing approved or pending NGO with the same normalized name and state/city before insertion. If found, return HTTP 409: "An NGO with this name in this location is already registered or awaiting review."
- Validate required fields and sanitize inputs.

**Step 3: Add automated tests for NGO search, pagination, and duplicate prevention**
Add tests to `test.js`:
- Test searching by state, city, and head name.
- Test duplicate submission rejection (HTTP 409).
- Test pagination offset/limit.
Run: `npm test`
Expected: PASS.

---

### Task 4: Campus Directory Backend API Endpoints

**Files:**
- Modify: `server.js`
- Modify: `test.js`

**Step 1: Implement Campus Directory APIs in `server.js`**
- `GET /api/campus/buildings`: List all 12 buildings with room counts, floor counts, departments.
- `GET /api/campus/buildings/:id`: Details of a building with its floors and room summary.
- `GET /api/campus/rooms`: Filter by `building_id`, `building`, `floor`, `type`, `department`, `bookable`, search `q`.
- `GET /api/campus/rooms/:id`: Complete room details including official code, suffix, facilities, assigned faculty members, and booking status.
- `GET /api/campus/faculty`: List faculty with search `q` (name, department, room code, designation) and department filter.
- `GET /api/campus/faculty/:id`: Faculty profile with room and building details.
- `GET /api/campus/search`: Global campus search across buildings, rooms, official codes, types, and faculty.

**Step 2: Enforce Booking Restrictions**
- In `POST /api/bookings`, ensure that any attempt to book a room with `is_bookable === 0` is rejected with HTTP 400/403: "This facility is restricted and cannot be booked."
- Reject booking for rooms where `has_timetable === 0` with HTTP 400: "Booking availability is not configured for this room."

**Step 3: Add API tests for Campus Directory & Booking Restrictions**
Add tests in `test.js`:
- Test building hierarchy navigation.
- Test room official code and assigned faculty retrieval.
- Test restricted room booking rejection.
- Test global campus search.
Run: `npm test`
Expected: PASS.

---

### Task 5: NGO Connect Frontend Improvements

**Files:**
- Modify: `public/ngo.js`
- Modify: `public/lib.js`
- Modify: `public/style.css`

**Step 1: Enhance NGO Directory UI**
- Add City/District dropdown filter populated dynamically based on selected State.
- Add Search by name, city, head name, or area of work with debounced input.
- Add responsive NGO cards showing: Name, Head & Designation, District & State, Cause badges, Verified Source badge.
- Add pagination / "Load more" button with total count indicator (`Showing X of Y NGOs`).
- Handle empty states and loading spinners cleanly.

**Step 2: Enhance NGO Detail Profile Page**
- Display all verified source fields:
  - Organization name
  - NGO Head Name & Designation
  - State, District, and complete Street Address
  - Contact number (clickable `tel:`) and official email (clickable `mailto:`)
  - Official website (clickable external link, only if provided)
  - Cause categories and specific areas of work
  - Official source attribution ("Source: National Trust - MSJE Voluntary Organizations List")
  - Relevant government schemes
- Do NOT display fabricated donation or volunteer links.

**Step 3: Fix & Enhance NGO Submission Form**
- Add duplicate check feedback on form submit.
- Show clear success message ("Thanks! Your submission is awaiting review by an administrator.").
- Refresh directory data when admin approves submission.

---

### Task 6: Campus Directory Frontend Implementation

**Files:**
- Create: `public/directory.js`
- Modify: `public/app.js`
- Modify: `public/campus.js`
- Modify: `public/icons.js`
- Modify: `public/style.css`

**Step 1: Build Hierarchical Campus Directory Views**
- Route `#/campus/directory`:
  - **Campus View**: Grid of 12 PCCOE buildings with departments, floor tags, and room counts.
  - **Building View**: Building header, department information, interactive floor tabs (`Basement`, `Ground`, `Floor 1`, `Floor 2`, `Floor 3`, `Floor 4`, `Floor 5`).
  - **Floor View**: Rooms arranged by floor with room cards displaying official room code (`9102 LA`, `9104 HO`, `9501 EO`), display name, room type badge (`Laboratory`, `Classroom`, `Faculty cabin or office`, etc.), capacity, assigned faculty chips, and bookable/restricted status.
  - **Room Detail Modal / Page**: Complete room metadata, assigned faculty members with clickable profile links, live availability or "Availability not configured" notice, and direct booking button (or restriction notice for restricted facilities).
  - Breadcrumb navigation (`Campus > Building 9 > Floor 2 > 9203 LA`).

**Step 2: Build Faculty Cabin Directory View**
- Route `#/campus/faculty`:
  - Faculty directory search by name, department, designation, cabin/room code.
  - Department filter pills.
  - Faculty cards showing Name, Designation, Department, Cabin Room Code, Building, and Floor with a "Find on Campus" shortcut that jumps directly into the campus directory hierarchy.

**Step 3: Build Global Campus Search UI**
- Route `#/campus/search` & search bar in directory header:
  - Instant autocomplete search for buildings, classrooms, laboratories, faculty cabins, seminar halls, drawing halls, and faculty names.
  - Results grouped cleanly: Buildings, Rooms, Faculty.

**Step 4: Update Navigation in `public/app.js`**
- Add "Campus Directory" (`#/campus/directory`), "Faculty Directory" (`#/campus/faculty`), and "Global Search" (`#/campus/search`) to Campus section navigation.
- Connect home page quick links to the campus directory.

---

### Task 7: Comprehensive Verification & Acceptance Testing

**Files:**
- Modify: `test.js`
- Run: `npm test`
- Verification commands and manual flow checks.

**Step 1: Automated Verification**
- Run test suite: `npm test`.
- Verify database counts:
  - Total approved NGOs >= 616 (47 initial + 569 imported).
  - Total buildings: 12 PCCOE buildings.
  - Total rooms: >= 194 rooms mapped with official codes and suffixes.
  - Total faculty: 228 faculty members mapped to rooms.

**Step 2: Functional Verification**
- Test NGO search, filter by state, city, and cause, pagination.
- Test NGO submission and duplicate prevention.
- Test Campus Directory: Building -> Floor -> Room -> Faculty.
- Test Room booking restrictions: restricted rooms cannot be booked; unconfigured rooms show "Availability not configured".
- Test Global search: search for "9102", "9104 HO", "Game", "Fluid", "Civil".
- Verify dark/light theme styling and responsive mobile layout.

---
