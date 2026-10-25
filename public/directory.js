// PCCOE Campus Directory: Buildings, Floors, Classrooms, Labs, Faculty Cabins, and Global Search.
import {
  S, api, qs, view, html, icon, $, actions, debounce, go, toast, openDialog, closeDialog, empty, badge,
} from './lib.js';

const STATE = {
  selectedBld: null,
  selectedFloor: null,
  selectedType: '',
  searchQ: '',
};

const ROOM_TYPE_ICONS = {
  'Classroom': 'book',
  'Laboratory': 'wrench',
  'Faculty cabin or office': 'user',
  'Staff room': 'users',
  'Drawing hall': 'grid',
  'Seminar hall': 'ticket',
  'Tutorial room': 'book',
  'Research centre': 'sprout',
  'Department library': 'book',
  'Common room': 'heart',
  'Administrative or examination facility': 'shield',
  'Other campus facilities': 'building',
};

// ---------- 1. Campus Directory Main View ----------
export async function campusDirectory(params) {
  const bldParam = params?.get('bld');
  const floorParam = params?.get('floor');
  const roomParam = params?.get('room');

  const buildings = await api('/campus/buildings').catch(() => []);

  let activeBld = null;
  if (bldParam) {
    activeBld = buildings.find((b) => b.name.toLowerCase() === bldParam.toLowerCase() || String(b.id) === bldParam);
  }

  // If a specific room was passed in URL, auto-open its detail modal after loading
  if (roomParam) {
    setTimeout(async () => {
      const match = await api('/campus/rooms?q=' + encodeURIComponent(roomParam)).catch(() => []);
      if (match.length) roomDetailModal(match[0].id);
    }, 150);
  }

  if (!activeBld) {
    // Campus Buildings Overview
    view(html`
      <div class="page-head row between wrap">
        <div>
          <div class="eyebrow">Campus Directory</div>
          <h1>Find a Building, Classroom, or Faculty Cabin</h1>
          <p>Explore PCCOE campus buildings, floor-by-floor room layouts, laboratories, and faculty offices.</p>
        </div>
        <div class="row gap">
          <a class="btn ghost" href="#/campus/faculty">${icon('user')}Faculty Directory</a>
          <a class="btn" href="#/campus/search">${icon('search')}Global Campus Search</a>
        </div>
      </div>

      <div class="toolbar">
        <div class="icon-input" style="flex:1 1 300px">
          ${icon('search')}<input id="dir-search" type="search" placeholder="Quick find room code (e.g. 9102, 9104 HO), lab name, faculty member..." aria-label="Quick search">
        </div>
        <div id="quick-matches" class="quick-matches" hidden></div>
      </div>

      <div class="section-title">
        <h2>Campus Buildings</h2>
        <span class="muted">${buildings.length} Registered Campus Facilities</span>
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
        ${buildings.map((b) => html`
          <article class="card bld-card" data-act="bld-select" data-bld="${b.name}">
            <div class="row between" style="margin-bottom:8px">
              <span class="badge sm type" style="font-weight:700">${b.code || b.name}</span>
              <span class="muted" style="font-size:.85rem">${b.floors_count} Floor${b.floors_count > 1 ? 's' : ''}</span>
            </div>
            <h3 style="font-size:1.25rem;margin:0 0 6px"><a href="#/campus/directory?bld=${encodeURIComponent(b.name)}">${b.name}</a></h3>
            <p style="color:var(--text-lead);font-weight:600;margin-bottom:10px">${b.description}</p>
            <div class="badges" style="margin-bottom:14px">
              ${b.departments.slice(0, 3).map((d) => html`<span class="badge sm cat">${d}</span>`)}
              ${b.departments.length > 3 ? html`<span class="badge sm">+${b.departments.length - 3} more</span>` : ''}
            </div>
            <div class="foot-row row between" style="border-top:1px solid var(--border);padding-top:10px;margin-top:auto">
              <span class="muted" style="font-size:.88rem"><b>${b.room_count}</b> Rooms · <b>${b.faculty_count}</b> Faculty</span>
              <span class="more">Explore floors ${icon('right')}</span>
            </div>
          </article>`)}
      </div>`);

    $('#dir-search')?.addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      const wrap = $('#quick-matches');
      if (!wrap) return;
      if (q.length < 2) { wrap.hidden = true; return; }
      const res = await api('/campus/search?q=' + encodeURIComponent(q)).catch(() => ({}));
      const rooms = res.rooms || [];
      const fac = res.faculty || [];
      if (!rooms.length && !fac.length) {
        wrap.hidden = false;
        wrap.innerHTML = `<div class="p-match muted">No direct matches for "${q}". Try Global Search.</div>`;
        return;
      }
      wrap.hidden = false;
      wrap.innerHTML = html`
        <div class="quick-dropdown card">
          ${rooms.slice(0, 5).map((r) => html`
            <div class="match-item" data-act="rm-open" data-id="${r.id}">
              <span class="badge sm type">${r.official_code || r.room_code || 'ROOM'}</span>
              <strong>${r.name}</strong> · <span class="muted">${r.building} Fl ${r.floor}</span>
            </div>`)}
          ${fac.slice(0, 4).map((f) => html`
            <div class="match-item" data-act="fac-open" data-id="${f.id}">
              <span class="badge sm cat">Faculty</span>
              <strong>${f.name}</strong> · <span class="muted">${f.department} (${f.room_code || 'Office'})</span>
            </div>`)}
          <a class="btn link sm" href="#/campus/search?q=${encodeURIComponent(q)}" style="padding:8px 12px;display:block">See all results in Global Search ${icon('right')}</a>
        </div>`.s;
    }, 250));

    actions['bld-select'] = (el) => go('#/campus/directory?bld=' + encodeURIComponent(el.dataset.bld));
    actions['rm-open'] = (el) => roomDetailModal(el.dataset.id);
    actions['fac-open'] = (el) => facultyDetailModal(el.dataset.id);
    return;
  }

  // Specific Building View
  const bldDetail = await api('/campus/buildings/' + activeBld.id).catch(() => activeBld);
  const rooms = bldDetail.rooms || [];
  const floorsList = bldDetail.floors_list || [0];
  const activeFloor = floorParam !== null && floorParam !== undefined && floorParam !== ''
    ? parseInt(floorParam)
    : floorsList[0];

  const floorRooms = rooms.filter((r) => r.floor === activeFloor);
  const roomTypes = [...new Set(floorRooms.map((r) => r.type))].sort();

  view(html`
    <nav class="breadcrumb" aria-label="Directory navigation">
      <a href="#/campus/directory">${icon('left')}All Buildings</a>
      <span class="sep">/</span>
      <span aria-current="page">${activeBld.name}</span>
    </nav>

    <div class="bld-hero card" style="margin-bottom:24px">
      <div class="row between wrap">
        <div>
          <div class="eyebrow">${activeBld.code || 'Building'}</div>
          <h1 style="margin:4px 0 8px">${activeBld.name} — ${activeBld.description}</h1>
          <div class="badges" style="margin-bottom:12px">
            ${activeBld.departments.map((d) => html`<span class="badge cat">${d}</span>`)}
          </div>
        </div>
        <div class="row gap">
          <div class="stat-pill"><b>${rooms.length}</b><small>Total Rooms</small></div>
          <div class="stat-pill"><b>${(bldDetail.faculty || []).length}</b><small>Assigned Faculty</small></div>
        </div>
      </div>
    </div>

    <div class="floor-nav" role="tablist" aria-label="Floor selector">
      <span class="fl-label">Select Floor:</span>
      ${floorsList.map((fl) => {
        const count = rooms.filter((r) => r.floor === fl).length;
        const isCurrent = fl === activeFloor;
        const flText = fl === -1 ? 'Basement' : fl === 0 ? 'Ground / Floor 0' : `Floor ${fl}`;
        return html`
          <a class="fl-tab ${isCurrent ? 'active' : ''}" role="tab" aria-selected="${String(isCurrent)}" href="#/campus/directory?bld=${encodeURIComponent(activeBld.name)}&floor=${fl}">
            <b>${flText}</b>
            <span class="count">${count}</span>
          </a>`;
      })}
    </div>

    <div class="toolbar" style="margin-top:16px">
      <div class="controls wrap">
        <div class="icon-input" style="flex:2 1 200px">
          ${icon('search')}<input id="fl-room-search" type="search" placeholder="Filter rooms on this floor..." aria-label="Filter rooms">
        </div>
        <select id="fl-type-filter" aria-label="Filter by room type" style="flex:1 1 180px">
          <option value="">All Room Types</option>
          ${roomTypes.map((t) => html`<option value="${t}">${t}</option>`)}
        </select>
        <label class="check" style="margin:0;align-self:center">
          <input type="checkbox" id="fl-bookable-only"> Bookable only
        </label>
      </div>
    </div>

    <div class="result-bar">
      <span id="fl-count">Showing ${floorRooms.length} rooms on ${activeFloor === -1 ? 'Basement' : activeFloor === 0 ? 'Ground Floor' : 'Floor ' + activeFloor}</span>
    </div>

    <div id="fl-rooms-grid" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
      ${floorRooms.map((r) => renderRoomCard(r, bldDetail.faculty))}
    </div>`);

  function renderRoomCard(r, allFaculty = []) {
    const assignedFac = (allFaculty || []).filter((f) => f.room_id === r.id || (r.room_code && f.room_code === r.room_code));
    const isBookable = r.is_bookable === 1 && r.has_timetable === 1;
    const isRestricted = r.is_bookable === 0;

    return html`
      <article class="card room-card ${isRestricted ? 'restricted' : ''}" data-act="rm-modal" data-id="${r.id}">
        <div class="row between" style="margin-bottom:8px">
          <span class="badge room-code">${r.official_code || r.room_code || 'ROOM'}</span>
          <span class="badge sm ${isBookable ? 'ok' : isRestricted ? 'bad' : 'warn'}">
            ${isBookable ? 'Bookable' : isRestricted ? 'Restricted' : 'Directory Only'}
          </span>
        </div>
        <h3 style="font-size:1.15rem;margin:0 0 6px"><a href="javascript:void(0)" data-act="rm-modal" data-id="${r.id}">${r.display_name || r.name}</a></h3>
        <div class="muted" style="font-size:.88rem;margin-bottom:10px">
          ${icon(ROOM_TYPE_ICONS[r.type] || 'building')}${r.type} · ${r.capacity} Seats
        </div>
        ${assignedFac.length ? html`
          <div class="assigned-fac">
            <small class="muted">Faculty in cabin:</small>
            <div class="fac-chips">
              ${assignedFac.slice(0, 3).map((f) => html`<span class="fac-chip">${icon('user')}${f.name}</span>`)}
              ${assignedFac.length > 3 ? html`<span class="fac-chip">+${assignedFac.length - 3}</span>` : ''}
            </div>
          </div>` : ''}
        ${isRestricted && r.booking_restriction ? html`
          <div class="rest-note"><small>${icon('lock')}${r.booking_restriction}</small></div>` : ''}
        <div class="foot-row row between" style="margin-top:auto;padding-top:10px;border-top:1px solid var(--border)">
          <span class="muted" style="font-size:.85rem">${r.building} · Fl ${r.floor}</span>
          <span class="more">Details ${icon('right')}</span>
        </div>
      </article>`;
  }

  function filterRooms() {
    const q = ($('#fl-room-search')?.value || '').toLowerCase().trim();
    const type = $('#fl-type-filter')?.value || '';
    const bookableOnly = $('#fl-bookable-only')?.checked || false;

    let filtered = floorRooms;
    if (type) filtered = filtered.filter((r) => r.type === type);
    if (bookableOnly) filtered = filtered.filter((r) => r.is_bookable === 1 && r.has_timetable === 1);
    if (q) {
      filtered = filtered.filter((r) => [r.name, r.room_code, r.official_code, r.suffix, r.facilities].join(' ').toLowerCase().includes(q));
    }

    const grid = $('#fl-rooms-grid');
    if (grid) {
      grid.innerHTML = filtered.length
        ? html`${filtered.map((r) => renderRoomCard(r, bldDetail.faculty))}`.s
        : empty('No rooms on this floor match your search filters.', 'search').s;
    }
    const countEl = $('#fl-count');
    if (countEl) countEl.textContent = `Showing ${filtered.length} of ${floorRooms.length} rooms on this floor`;
  }

  $('#fl-room-search')?.addEventListener('input', debounce(filterRooms, 150));
  $('#fl-type-filter')?.addEventListener('change', filterRooms);
  $('#fl-bookable-only')?.addEventListener('change', filterRooms);
  actions['rm-modal'] = (el) => roomDetailModal(el.dataset.id);
}

// ---------- 2. Room Detail Modal ----------
export async function roomDetailModal(roomId) {
  const r = await api('/campus/rooms/' + roomId).catch((e) => ({ error: e.message }));
  if (r.error) return toast(r.error, 'error');

  const isBookable = r.is_bookable === 1 && r.has_timetable === 1;
  const isRestricted = r.is_bookable === 0;

  const content = html`
    <div class="rm-detail">
      <div class="row between wrap" style="margin-bottom:12px;gap:8px">
        <span class="badge room-code lg">${r.official_code || r.room_code || 'ROOM'}</span>
        <span class="badge ${isBookable ? 'ok' : isRestricted ? 'bad' : 'warn'}">
          ${r.availability_status}
        </span>
      </div>

      <h2 style="margin:0 0 6px;font-size:1.4rem">${r.display_name || r.name}</h2>
      <div class="loc" style="font-size:.95rem;margin-bottom:16px">
        ${icon('pin')}${r.building} · Floor ${r.floor} · Room ${r.room_code || '–'}
      </div>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="stat-box">
          <small class="muted">Room Type</small>
          <strong>${r.type}</strong>
        </div>
        <div class="stat-box">
          <small class="muted">Capacity</small>
          <strong>${r.capacity ? `${r.capacity} Seats` : 'Standard'}</strong>
        </div>
        <div class="stat-box">
          <small class="muted">Department</small>
          <strong>${r.department || r.building || 'Campus Facility'}</strong>
        </div>
        <div class="stat-box">
          <small class="muted">Official Suffix</small>
          <strong>${r.suffix || 'None'}</strong>
        </div>
      </div>

      ${r.facilities ? html`
        <div class="card sm" style="margin-bottom:16px">
          <small class="muted">Facilities & Equipment:</small>
          <div style="font-weight:500;margin-top:2px">${r.facilities}</div>
        </div>` : ''}

      ${r.faculty && r.faculty.length ? html`
        <div class="card" style="margin-bottom:16px">
          <h3 style="font-size:1.05rem;margin:0 0 10px">${icon('user')}Assigned Faculty Members (${r.faculty.length})</h3>
          <div class="faculty-mini-list">
            ${r.faculty.map((f) => html`
              <div class="row between fac-item" style="padding:6px 0;border-bottom:1px solid var(--border)">
                <div>
                  <strong>${f.name}</strong>${f.designation ? ` · <span class="muted">${f.designation}</span>` : ''}
                  <br><small class="muted">${f.department}</small>
                </div>
                ${f.email ? html`<a class="btn ghost sm" href="mailto:${f.email}">${icon('mail')}Email</a>` : ''}
              </div>`)}
          </div>
        </div>` : ''}

      ${isRestricted ? html`
        <div class="note warn" style="margin-bottom:16px">
          ${icon('lock')}<span><b>Restricted Facility:</b> ${r.booking_restriction || 'This room is not available for booking by students or faculty.'}</span>
        </div>` : ''}

      ${r.has_timetable === 0 && !isRestricted ? html`
        <div class="note info" style="margin-bottom:16px">
          ${icon('info')}<span><b>Availability not configured:</b> This facility is recorded in the campus room directory, but does not participate in active slot booking.</span>
        </div>` : ''}

      <div class="row between" style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
        <a class="btn ghost" href="#/campus/directory?bld=${encodeURIComponent(r.building)}&floor=${r.floor}" onclick="document.getElementById('dlg').close()">
          ${icon('layers')}View Floor Layout
        </a>
        ${isBookable ? html`
          <a class="btn" href="#/rooms" onclick="document.getElementById('dlg').close()">
            ${icon('ticket')}Book Room in Schedule
          </a>` : html`
          <button class="btn ghost" disabled>${icon('lock')}Booking Restricted</button>`}
      </div>
    </div>`;

  openDialog(content, `${r.official_code || r.name} Details`);
}

// ---------- 3. Faculty Cabin Directory View ----------
export async function facultyDirectory(params) {
  const deptParam = params?.get('dept') || '';
  const qParam = params?.get('q') || '';

  const faculty = await api('/campus/faculty').catch(() => []);
  const departments = [...new Set(faculty.map((f) => f.department))].filter(Boolean).sort();

  view(html`
    <div class="page-head row between wrap">
      <div>
        <div class="eyebrow">Campus Directory</div>
        <h1>Faculty Cabin & Office Directory</h1>
        <p>Locate faculty cabins, HOD offices, and faculty seating across all PCCOE departments.</p>
      </div>
      <div class="row gap">
        <a class="btn ghost" href="#/campus/directory">${icon('building')}Campus Buildings</a>
        <a class="btn" href="#/campus/search">${icon('search')}Global Campus Search</a>
      </div>
    </div>

    <div class="toolbar">
      <div class="controls wrap">
        <div class="icon-input" style="flex:2 1 260px">
          ${icon('search')}<input id="fac-q" type="search" placeholder="Search faculty name, department, or cabin code (e.g. 9104, 9101)..." aria-label="Search faculty" value="${qParam}">
        </div>
        <select id="fac-dept" aria-label="Department filter" style="flex:1 1 220px">
          <option value="">All Departments</option>
          ${departments.map((d) => html`<option value="${d}" ${d === deptParam ? 'selected' : ''}>${d}</option>`)}
        </select>
      </div>
    </div>

    <div class="result-bar">
      <span id="fac-count">Showing <b>${faculty.length}</b> faculty members</span>
    </div>

    <div id="fac-grid" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
      ${faculty.map((f) => renderFacultyCard(f))}
    </div>`);

  function renderFacultyCard(f) {
    return html`
      <article class="card fac-card">
        <div class="row between" style="margin-bottom:8px">
          <span class="badge cat sm">${f.department}</span>
          ${f.room_code ? html`<span class="badge room-code sm">${f.official_code || f.room_code}</span>` : ''}
        </div>
        <h3 style="margin:0 0 4px;font-size:1.18rem">${f.name}</h3>
        ${f.designation ? html`<div class="muted" style="font-size:.9rem;margin-bottom:10px">${f.designation}</div>` : ''}
        <div class="loc" style="font-size:.88rem;margin-bottom:14px">
          ${icon('pin')}${f.building} · Floor ${f.floor}${f.room_code ? ` · Room ${f.room_code}` : ''}
        </div>
        <div class="foot-row row between" style="margin-top:auto;border-top:1px solid var(--border);padding-top:10px">
          ${f.room_code ? html`
            <a class="btn link sm" href="#/campus/directory?bld=${encodeURIComponent(f.building)}&floor=${f.floor}&room=${encodeURIComponent(f.room_code)}">
              ${icon('map')}Locate Cabin ${icon('right')}
            </a>` : html`<span class="muted" style="font-size:.82rem">Cabin info pending</span>`}
          ${f.email ? html`<a class="btn ghost sm" href="mailto:${f.email}">${icon('mail')}Email</a>` : ''}
        </div>
      </article>`;
  }

  function filterFaculty() {
    const q = ($('#fac-q')?.value || '').toLowerCase().trim();
    const dept = $('#fac-dept')?.value || '';

    let list = faculty;
    if (dept) list = list.filter((f) => f.department === dept);
    if (q) {
      list = list.filter((f) => [f.name, f.designation, f.department, f.room_code, f.official_code, f.building].join(' ').toLowerCase().includes(q));
    }

    const grid = $('#fac-grid');
    if (grid) {
      grid.innerHTML = list.length
        ? html`${list.map(renderFacultyCard)}`.s
        : empty('No faculty members match your search criteria.', 'search').s;
    }
    const countEl = $('#fac-count');
    if (countEl) countEl.innerHTML = html`Showing <b>${list.length}</b> of <b>${faculty.length}</b> faculty members`.s;
  }

  $('#fac-q')?.addEventListener('input', debounce(filterFaculty, 150));
  $('#fac-dept')?.addEventListener('change', filterFaculty);
}

// ---------- 4. Global Campus Search View ----------
export async function campusSearch(params) {
  const qParam = params?.get('q') || '';

  view(html`
    <div class="page-head">
      <div class="eyebrow">Campus Directory</div>
      <h1>Global Campus Search</h1>
      <p>Search across all buildings, classrooms, laboratories, faculty offices, drawing halls, and faculty members.</p>
    </div>

    <div class="toolbar" style="margin-bottom:24px">
      <div class="icon-input" style="flex:1 1 100%;max-width:700px">
        ${icon('search')}<input id="global-q" type="search" placeholder="Type room code (e.g. 9102, 9104), facility (e.g. Heat Transfer, Fluid), or faculty name..." aria-label="Global campus search" value="${qParam}" autofocus>
      </div>
    </div>

    <div id="search-results">
      ${qParam ? '<p class="muted">Searching...</p>' : empty('Enter a room number, laboratory name, building, or faculty name to search.', 'search')}
    </div>`);

  async function performSearch(q) {
    const wrap = $('#search-results');
    if (!wrap) return;
    if (!q || q.length < 2) {
      wrap.innerHTML = empty('Enter at least 2 characters to search the campus directory.', 'search').s;
      return;
    }

    try {
      const res = await api('/campus/search?q=' + encodeURIComponent(q));
      const blds = res.buildings || [];
      const rooms = res.rooms || [];
      const fac = res.faculty || [];

      if (!blds.length && !rooms.length && !fac.length) {
        wrap.innerHTML = empty(`No campus facilities or faculty found matching "${q}".`, 'search').s;
        return;
      }

      wrap.innerHTML = html`
        ${blds.length ? html`
          <section style="margin-bottom:28px">
            <h2 class="sub">${icon('building')}Buildings (${blds.length})</h2>
            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
              ${blds.map((b) => html`
                <div class="card">
                  <span class="badge sm type">${b.code || 'Bld'}</span>
                  <h3 style="margin:4px 0"><a href="#/campus/directory?bld=${encodeURIComponent(b.name)}">${b.name}</a></h3>
                  <p class="muted" style="margin-bottom:8px">${b.description}</p>
                  <a class="btn link sm" href="#/campus/directory?bld=${encodeURIComponent(b.name)}">View Building ${icon('right')}</a>
                </div>`)}
            </div>
          </section>` : ''}

        ${rooms.length ? html`
          <section style="margin-bottom:28px">
            <h2 class="sub">${icon('grid')}Classrooms, Laboratories & Cabins (${rooms.length})</h2>
            <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr))">
              ${rooms.map((r) => html`
                <div class="card" data-act="rm-modal" data-id="${r.id}" style="cursor:pointer">
                  <div class="row between" style="margin-bottom:6px">
                    <span class="badge room-code sm">${r.official_code || r.room_code || 'ROOM'}</span>
                    <span class="badge sm ${r.is_bookable ? 'ok' : 'bad'}">${r.type}</span>
                  </div>
                  <h3 style="font-size:1.1rem;margin:0 0 4px"><a href="javascript:void(0)">${r.display_name || r.name}</a></h3>
                  <div class="loc" style="font-size:.85rem;margin-bottom:8px">${icon('pin')}${r.building} · Floor ${r.floor}</div>
                  <span class="more">View Details ${icon('right')}</span>
                </div>`)}
            </div>
          </section>` : ''}

        ${fac.length ? html`
          <section style="margin-bottom:28px">
            <h2 class="sub">${icon('user')}Faculty Members (${fac.length})</h2>
            <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr))">
              ${fac.map((f) => html`
                <div class="card">
                  <span class="badge cat sm">${f.department}</span>
                  <h3 style="font-size:1.1rem;margin:6px 0 2px">${f.name}</h3>
                  <div class="muted" style="font-size:.88rem;margin-bottom:8px">${f.designation || 'Faculty'}</div>
                  <div class="loc" style="font-size:.85rem;margin-bottom:8px">
                    ${icon('pin')}${f.building} · Fl ${f.floor}${f.room_code ? ` · Room ${f.room_code}` : ''}
                  </div>
                  ${f.room_code ? html`
                    <a class="btn link sm" href="#/campus/directory?bld=${encodeURIComponent(f.building)}&floor=${f.floor}&room=${encodeURIComponent(f.room_code)}">
                      Locate Cabin ${icon('right')}
                    </a>` : ''}
                </div>`)}
            </div>
          </section>` : ''}`.s;
    } catch (e) {
      wrap.innerHTML = empty(e.message, 'alert').s;
    }
  }

  $('#global-q')?.addEventListener('input', debounce((e) => performSearch(e.target.value.trim()), 200));
  if (qParam) performSearch(qParam);
  actions['rm-modal'] = (el) => roomDetailModal(el.dataset.id);
}
