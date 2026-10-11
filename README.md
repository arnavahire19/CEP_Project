# Campus Connect

One app, two sections, role-based access (student / faculty / admin). **Zero npm dependencies**: needs Node 22.13+ only (uses built-in `node:sqlite`).

## Quick start for beginners (no coding knowledge needed)

You do this once. After that, running the project takes 2 steps.

### 1. Install two free programs
| Program | Download | Check it worked |
|---|---|---|
| **Node.js** (the "LTS" version, must be 22.13 or newer) | https://nodejs.org | open a terminal, type `node -v` |
| **Git** | https://git-scm.com/downloads | open a terminal, type `git --version` |

Both should print a version number. Node must say `v22.13` or higher (e.g. `v24.x` is fine).

> **What is a terminal?** A window where you type commands.
> - **Windows:** press the Windows key, type `PowerShell`, press Enter.
> - **Mac:** press Cmd + Space, type `Terminal`, press Enter.

### 2. Download the project (once)
Copy and paste these lines into the terminal, one at a time, pressing Enter after each:

```
git clone https://github.com/arnavahire19/CEP_Project.git
cd CEP_Project
```

### 3. Start the app
```
npm start
```
Wait until you see `Campus Connect running at http://127.0.0.1:3000`. There is **no** `npm install` step; the project needs nothing else.

### 4. Open it
Open your browser (Chrome, Edge, Safari) and go to **http://127.0.0.1:3000**.

Log in with a demo account (see the table below). Faculty and admin log in at **http://127.0.0.1:3000/faculty**.

> Keep the terminal window open while you use the app. It is the "server".

### 5. Stop the app
Click the terminal window and press **Ctrl + C**.

### Next time
Open a terminal, then:
```
cd CEP_Project
npm start
```
(If you opened the terminal somewhere else, `cd` into wherever you cloned the folder.)

### Getting the latest changes
When a teammate pushes updates:
```
cd CEP_Project
git pull
npm start
```

### Something wrong?
| Problem | Fix |
|---|---|
| `node` / `npm` / `git` "is not recognized" or "command not found" | Install it (step 1), then close and reopen the terminal. |
| Error mentions `node:sqlite` or `ExperimentalWarning` | Node is too old. Install the newest LTS from nodejs.org. |
| `EADDRINUSE` / "address already in use" | Something is already using port 3000. Close the other terminal running the app, or use another port: Mac `PORT=3001 npm start`, Windows PowerShell `$env:PORT=3001; npm start` (then open `http://127.0.0.1:3001`). |
| Page will not load | Check the terminal still shows the server running and the address is exactly `http://127.0.0.1:3000`. |
| Want to wipe all data and start fresh | Stop the app, delete the `data` folder, start again. Demo data is re-created. |

## Developer quick reference

```
npm start          # http://127.0.0.1:3000   (PORT / HOST env to change)
npm test           # 10 API tests, in-memory DB
```

## Demo accounts (seeded on first run, SEED_DEMO=0 to skip) - change before real use
| Role | Email | Password |
|---|---|---|
| Admin | admin@campus.edu | admin123 |
| Faculty | faculty@campus.edu | faculty123 |
| Student | student@campus.edu | student123 |

Faculty/admin sign in at `/faculty` (students are refused there). Students self-register; faculty/admin accounts are created by an admin (Portal -> Users).

## NGO Connect (public)
- Directory of 47 NGOs, 10 cause categories; filter by cause, state, text, or **near me** (browser geolocation + distance sort).
- Profiles with areas of work, contact, and the government schemes relevant to that NGO's causes.
- 15 government schemes/registrations (NGO Darpan, 12A/80G, FCRA, CSR-1, Mission Shakti, AVYAY...) with benefits, eligibility, how to apply, official link.
- Logged-in users submit NGOs -> **pending** until an admin approves.

## Campus
- **Events**: list, filter, RSVP; faculty create/edit/delete. An event linked to a room blocks that room.
- **Availability**: live grid (rooms x hourly slots, 8AM-6PM, IST) merging weekly timetable, bookings, events and maintenance. Refreshes every minute.
- **Booking** (BookMyShow-style): pick date, click contiguous free slots, book. Students: pending until faculty approves (slot is held meanwhile, max 4h, 5 upcoming). Faculty: instant. Server re-checks every slot, so no double booking.
- **Faculty portal**: approve/reject requests, events, weekly timetable, room maintenance, cameras. Admin adds: users, NGO moderation, schemes, camera config + access log.
- **Live cameras** (faculty/admin only): every view is logged, per-camera privacy mode pauses a feed for everyone, "admin only" cameras hidden from faculty, consent notice before first view. Feed types: simulated demo, this device's webcam (local test), MJPEG, snapshot URL, HLS.

## Data you must verify
- NGO entries are well-known organisations from general knowledge, **with no phone/email** - check each website. Scheme details change; confirm on the official link.
- Cities outside the built-in list get no coordinates (no distance), they still appear in text/state search.

## Security notes
scrypt password hashes, revocable server-side sessions (HttpOnly, SameSite=Lax cookie), JSON-only writes (CSRF), login rate limiting, http(s)-only URLs, escaped HTML templating, CSP, role checks on every route. For production: set `NODE_ENV=production`, serve over HTTPS, change demo passwords, and note the rate limiter is in-memory (single instance).

## Layout
`server.js` API + static, `db.js` schema/availability/seed, `seed-data.js` NGOs/schemes/rooms, `public/` vanilla-JS SPA (`app.js` router, `ngo.js`, `campus.js`, `portal.js`, `cameras.js`, `lib.js`).
