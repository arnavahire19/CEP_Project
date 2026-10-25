// NGO Connect: directory, profiles, submission, government schemes.
import {
  S, api, qs, view, html, icon, causeIcon, safeUrl, $, actions, debounce, go, toast, loadMeta, catBadges, avatar, badge, empty,
  formHTML, wireForm,
} from './lib.js';

const F = { q: '', cats: new Set(), state: '', city: '', maxKm: '50', near: null }; // survives navigation within the session
const PAGE = 24;

const ngoCard = (n) => html`
  <article class="card ngo-card">
    <div class="top-row">
      ${avatar(n.categories)}
      <div style="min-width:0">
        <h3><a href="#/ngos/${n.id}">${n.name}</a></h3>
        <div class="loc">${icon('pin')}${n.city}, ${n.state}</div>
        ${n.head_name ? html`<div class="head-info"><small class="muted">Head: <b>${n.head_name}</b>${n.head_designation ? ` · ${n.head_designation}` : ''}</small></div>` : ''}
      </div>
      ${n.distance_km != null ? html`<span class="dist">${n.distance_km} km</span>` : ''}
    </div>
    <p class="clamp">${n.description}</p>
    <div class="row between" style="margin-top:auto;gap:8px;flex-wrap:wrap">
      <div class="badges">${catBadges(n.categories.slice(0, 3))}</div>
      ${n.source ? html`<span class="badge sm type" title="${n.source}">Verified VO</span>` : ''}
    </div>
    <div class="foot-row"><span class="more">View profile ${icon('right')}</span></div>
  </article>`;

export async function ngos(params) {
  const meta = await loadMeta();
  if (params?.has('q') || params?.has('cat') || params?.has('state') || params?.has('city')) {
    F.q = params.get('q') || '';
    F.cats = new Set(params.get('cat') ? [params.get('cat')] : []);
    F.state = params.get('state') || '';
    F.city = params.get('city') || '';
    F.near = null;
  }

  const getCitiesForState = () => {
    if (F.state && meta.citiesByState && meta.citiesByState[F.state]) {
      return meta.citiesByState[F.state];
    }
    return meta.cities || [];
  };

  view(html`
    <div class="page-head">
      <div class="eyebrow">NGO Connect</div>
      <h1>Find an NGO to support across India</h1>
      <p>Browse over 600 verified voluntary organizations and non-profits across India. Search by cause, state, district, or distance.</p>
    </div>
    <div class="toolbar" role="search">
      <div class="controls wrap">
        <div class="icon-input" style="flex:2 1 240px">
          ${icon('search')}<input id="q" type="search" placeholder="Search by name, city, head name, or cause" aria-label="Search NGOs" value="${F.q}">
        </div>
        <select id="state" aria-label="State or union territory" style="flex:1 1 180px">
          <option value="">All States / UTs</option>
          ${meta.states.map((s) => html`<option value="${s}" ${s === F.state ? 'selected' : ''}>${s}</option>`)}
        </select>
        <select id="city" aria-label="City or district" style="flex:1 1 180px">
          <option value="">All Cities / Districts</option>
          ${getCitiesForState().map((c) => html`<option value="${c}" ${c === F.city ? 'selected' : ''}>${c}</option>`)}
        </select>
        <button type="button" class="btn ghost" data-act="ngo-near" id="near" aria-pressed="${String(!!F.near)}" style="flex:0 0 auto">
          ${icon('nav')}${F.near ? 'Near you' : 'Near me'}
        </button>
        <select id="km" aria-label="Distance" ${F.near ? '' : 'hidden'} style="flex:0 0 auto">
          ${['10', '25', '50', '100', '300', '1000'].map((k) => html`<option value="${k}" ${k === F.maxKm ? 'selected' : ''}>within ${k} km</option>`)}
        </select>
      </div>
      <div class="chips scroll" id="cats" role="group" aria-label="Causes">
        ${meta.categories.map((c) => html`
          <button type="button" class="chip" data-act="ngo-cat" data-cat="${c.slug}" aria-pressed="${String(F.cats.has(c.slug))}">
            ${causeIcon(c.slug)}${c.label}<span class="count">${c.count}</span>
          </button>`)}
      </div>
    </div>
    <div class="result-bar">
      <span id="count" aria-live="polite">Loading NGOs…</span>
      <button class="btn link" data-act="ngo-reset">Clear all filters</button>
    </div>
    <div id="results" class="grid"></div>
    <div class="row center" style="margin:24px 0">
      <button class="btn ghost" id="more" hidden data-act="ngo-more">Load more NGOs</button>
    </div>
    <div class="card cta">
      <div>
        <strong>Know a registered NGO that's missing?</strong><br>
        <span class="muted">Submit it for review and help students and donors connect with their work.</span>
      </div>
      <a class="btn" href="#/ngos/new">${icon('plus')}Submit an NGO</a>
    </div>`);

  let offset = 0;
  async function load(reset = true) {
    if (reset) offset = 0;
    const res = $('#results');
    if (!res) return;
    try {
      const d = await api('/ngos' + qs({
        q: F.q, category: [...F.cats].join(','), state: F.state, city: F.city, limit: PAGE, offset,
        lat: F.near?.lat, lng: F.near?.lng, maxKm: F.near ? F.maxKm : '',
      }));
      if (!$('#results')) return; // navigated away
      const items = d.items.map(ngoCard);
      res.innerHTML = (reset ? '' : res.innerHTML) + html`${items}`.s;
      const countLoaded = reset ? d.items.length : Math.min(offset + PAGE, d.total);
      if (reset && !items.length) {
        res.innerHTML = empty('No NGOs match these filters. Try clearing some filters or searching a different area.', 'search').s;
      }
      $('#count').innerHTML = html`Showing <b>${countLoaded}</b> of <b>${d.total}</b> NGO${d.total === 1 ? '' : 's'}${F.near ? ' near you' : ''}`.s;
      $('#more').hidden = offset + PAGE >= d.total;
    } catch (e) {
      if ($('#results')) res.innerHTML = empty(e.message, 'alert').s;
    }
  }

  actions['ngo-more'] = () => { offset += PAGE; return load(false); };
  actions['ngo-cat'] = (el) => {
    const c = el.dataset.cat;
    F.cats.has(c) ? F.cats.delete(c) : F.cats.add(c);
    el.setAttribute('aria-pressed', String(F.cats.has(c)));
    load();
  };
  actions['ngo-reset'] = () => {
    Object.assign(F, { q: '', cats: new Set(), state: '', city: '', near: null });
    ngos();
  };
  actions['ngo-near'] = () => {
    if (F.near) { F.near = null; return ngos(); }
    return new Promise((resolve) => {
      if (!navigator.geolocation) { toast('Location is not available in this browser.', 'error'); return resolve(); }
      navigator.geolocation.getCurrentPosition((p) => {
        F.near = { lat: p.coords.latitude, lng: p.coords.longitude };
        ngos();
        resolve();
      }, () => {
        toast('Could not get your location. Allow access, or filter by state instead.', 'error');
        resolve();
      }, { timeout: 10000 });
    });
  };

  $('#q').addEventListener('input', debounce((e) => { F.q = e.target.value; load(); }));
  $('#state').addEventListener('change', (e) => {
    F.state = e.target.value;
    F.city = '';
    const citySelect = $('#city');
    if (citySelect) {
      const cities = getCitiesForState();
      citySelect.innerHTML = html`<option value="">All Cities / Districts</option>${cities.map((c) => html`<option value="${c}">${c}</option>`)}`.s;
    }
    load();
  });
  $('#city').addEventListener('change', (e) => { F.city = e.target.value; load(); });
  $('#km').addEventListener('change', (e) => { F.maxKm = e.target.value; load(); });
  await load();
}

export async function ngoDetail(id) {
  const n = await api('/ngos/' + id).catch((e) => ({ error: e.message }));
  if (n.error) return view(html`<a class="back" href="#/ngos">${icon('left')}All NGOs</a><div class="page-head"><h1>NGO not found</h1><p>${n.error}</p></div>`);
  await loadMeta();

  const contact = [
    n.phone && html`<li>${icon('phone')}<a href="tel:${n.phone}">${n.phone}</a></li>`,
    n.email && html`<li>${icon('mail')}<a href="mailto:${n.email}">${n.email}</a></li>`,
    n.website && html`<li>${icon('globe')}<a href="${safeUrl(n.website)}" target="_blank" rel="noopener noreferrer">${n.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></li>`,
    n.address && html`<li>${icon('building')}<span>${n.address}</span></li>`,
  ].filter(Boolean);

  view(html`
    <a class="back" href="#/ngos">${icon('left')}All NGOs</a>
    <div class="ngo-hero">
      ${avatar(n.categories, 'lg')}
      <div class="grow">
        <h1>${n.name}</h1>
        <div class="loc" style="font-size:1rem;margin-bottom:10px">${icon('pin')}${n.city}, ${n.state}</div>
        <div class="badges">${catBadges(n.categories)}</div>
      </div>
      ${n.website ? html`<a class="btn" href="${safeUrl(n.website)}" target="_blank" rel="noopener noreferrer">Visit website ${icon('ext')}</a>` : ''}
    </div>
    <div class="two-col">
      <div>
        ${n.head_name ? html`
          <section class="card" style="margin-bottom:20px">
            <h2 style="font-size:1.15rem">${icon('user')}Organization Leadership</h2>
            <p style="margin:6px 0 0"><strong>${n.head_name}</strong>${n.head_designation ? ` · <span class="muted">${n.head_designation}</span>` : ''}</p>
          </section>` : ''}
        <section class="card">
          <h2>About</h2>
          <p>${n.description}</p>
          ${n.focus && n.focus.length ? html`
            <h3 class="sub">Areas of work</h3>
            <ul class="tags">${n.focus.map((f) => html`<li>${f}</li>`)}</ul>` : ''}
          ${n.source ? html`
            <div class="note" style="margin-top:16px">
              ${icon('shield')}<span><b>Official Source:</b> ${n.source}</span>
            </div>` : ''}
        </section>
        <section class="card">
          <h2>${icon('landmark')}Government support you may be eligible for</h2>
          <p class="muted">Based on this NGO's causes and registration status. Always confirm current eligibility on the official site.</p>
          ${n.schemes.slice(0, 6).map((s) => html`
            <div class="mini-scheme">
              <div><strong>${s.name}</strong> ${badge(s.type, 'type')}<br><span class="muted">${s.ministry}</span></div>
              <a class="btn ghost sm" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">Official site ${icon('ext')}</a>
            </div>`)}
          <a class="btn link" href="#/schemes">Browse all ${n.schemes.length} relevant schemes</a>
        </section>
      </div>
      <aside class="card">
        <h2>Contact Details</h2>
        ${contact.length ? html`<ul class="plain">${contact}</ul>` : html`<p class="muted">Contact details aren't listed. Please check the NGO's official documentation.</p>`}
        <div class="note">${icon('info')}<span>For information only, not an endorsement. Verify registration (e.g. National Trust, NGO Darpan, 12A/80G) before donating.</span></div>
        ${n.lat != null ? html`<a class="btn ghost sm" target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat=${n.lat}&mlon=${n.lng}#map=11/${n.lat}/${n.lng}">${icon('pin')}View city on map</a>` : ''}
      </aside>
    </div>`);
}

export const ngoFields = (meta) => [
  { name: 'name', label: 'NGO name', required: true, max: 150 },
  { name: 'head_name', label: 'Head of Organization (optional)', half: true, max: 100 },
  { name: 'head_designation', label: 'Designation (e.g. President, Secretary)', half: true, max: 100 },
  { name: 'city', label: 'City / District', required: true, half: true, max: 80 },
  { name: 'state', label: 'State / UT', type: 'select', half: true, required: true, options: [['', 'Choose state / UT…'], ...meta.states.map((s) => [s, s])] },
  { name: 'categories', label: 'Causes', type: 'checks', options: meta.categories.map((c) => [c.slug, c.label]) },
  { name: 'description', label: 'What does the NGO do?', type: 'textarea', required: true, max: 1500 },
  { name: 'focus', label: 'Areas of work', hint: 'Comma-separated, e.g. Special education, Child therapy, Vocational training', max: 400 },
  { name: 'website', label: 'Website (must start with https://)', type: 'url', placeholder: 'https://', half: true },
  { name: 'email', label: 'Contact email', type: 'email', half: true },
  { name: 'phone', label: 'Contact phone / mobile', half: true, max: 30 },
  { name: 'address', label: 'Complete Street Address', half: true, max: 300 },
];

export async function ngoNew() {
  if (!S.me) return go('#/login?next=' + encodeURIComponent('ngos/new'));
  const meta = await loadMeta();
  const fields = ngoFields(meta);
  view(html`
    <a class="back" href="#/ngos">${icon('left')}All NGOs</a>
    <div class="page-head">
      <h1>Submit an NGO</h1>
      <p>${S.me.role === 'admin' ? 'As an admin, your submission is published immediately.' : 'Submissions are reviewed by an administrator before appearing in the directory.'}</p>
    </div>
    <div class="card narrow wide">${formHTML(fields, {}, 'Submit for review')}</div>`);
  wireForm($('form'), fields, async (v) => {
    try {
      const r = await api('/ngos', { method: 'POST', body: v });
      toast(r.status === 'approved' ? 'NGO published successfully.' : 'Thanks! Your submission is awaiting administrator review.');
      go('#/ngos');
    } catch (err) {
      toast(err.message || 'Submission failed. Please check your inputs.', 'error');
    }
  });
}

// ---------- government schemes ----------
const SF = { q: '', cats: new Set(), type: '' };
const TYPE_LABEL = { registration: 'Registration', tax: 'Tax benefit', funding: 'Grant / funding', csr: 'CSR', programme: 'Government programme', training: 'Skilling' };
export { TYPE_LABEL };

export async function schemes() {
  const meta = await loadMeta();
  view(html`
    <div class="page-head"><div class="eyebrow">NGO Connect</div><h1>Government support and schemes</h1><p>Registrations, tax benefits, grants and programmes NGOs can use. Rules change, so confirm on the official link before applying.</p></div>
    <div class="toolbar">
      <div class="controls"><div class="icon-input">${icon('search')}<input id="sq" type="search" aria-label="Search schemes" placeholder="Search schemes or ministries" value="${SF.q}"></div>
        <select id="st" aria-label="Scheme type"><option value="">All types</option>${Object.entries(TYPE_LABEL).map(([k, l]) => html`<option value="${k}" ${k === SF.type ? 'selected' : ''}>${l}</option>`)}</select></div>
      <div class="chips scroll" role="group" aria-label="Causes">${meta.categories.map((c) => html`<button type="button" class="chip" data-act="sch-cat" data-cat="${c.slug}" aria-pressed="${String(SF.cats.has(c.slug))}">${causeIcon(c.slug)}${c.label}</button>`)}</div>
    </div>
    <div class="result-bar"><span id="scount" aria-live="polite"></span></div><div id="slist"></div>`);
  async function load() {
    const list = await api('/schemes' + qs({ q: SF.q, type: SF.type, category: [...SF.cats].join(',') }));
    if (!$('#slist')) return;
    $('#scount').innerHTML = html`<b>${list.length}</b> scheme${list.length === 1 ? '' : 's'}`.s;
    $('#slist').innerHTML = list.length ? html`${list.map((s) => html`
      <details class="card scheme"><summary><span class="s-ico">${icon('file')}</span><span class="s-main"><span class="s-name">${s.name}</span><span class="s-min">${s.ministry}</span></span>${badge(TYPE_LABEL[s.type] || s.type, 'type')}<span class="chev">${icon('cd')}</span></summary>
        <div class="body"><p style="margin-top:14px">${s.summary}</p>
        <dl>${s.benefits ? html`<dt>Benefits</dt><dd>${s.benefits}</dd>` : ''}${s.eligibility ? html`<dt>Who can apply</dt><dd>${s.eligibility}</dd>` : ''}${s.how_to_apply ? html`<dt>How to apply</dt><dd>${s.how_to_apply}</dd>` : ''}
        <dt>For causes</dt><dd>${s.categories.includes('all') ? 'All causes' : html`<div class="badges">${catBadges(s.categories)}</div>`}</dd></dl>
        ${s.url ? html`<a class="btn sm" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">Official site ${icon('ext')}</a>` : ''}</div>
      </details>`)}`.s : empty('No schemes match. Clear a filter to see more.', 'search').s;
  }
  actions['sch-cat'] = (el) => { const c = el.dataset.cat; SF.cats.has(c) ? SF.cats.delete(c) : SF.cats.add(c); el.setAttribute('aria-pressed', String(SF.cats.has(c))); load(); };
  $('#sq').addEventListener('input', debounce((e) => { SF.q = e.target.value; load(); }));
  $('#st').addEventListener('change', (e) => { SF.type = e.target.value; load(); });
  await load();
}
