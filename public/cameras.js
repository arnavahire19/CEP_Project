// Live camera wall. Staff only; the server logs every feed opened and honours per-camera privacy mode.
import { S, api, view, html, icon, $, actions, cleanups, isStaff, go, toast, openDialog, closeDialog, safeUrl, badge, empty } from './lib.js';

const stops = new Map(); // camera id -> stop fn

function demoFeed(canvas, name) {
  const ctx = canvas.getContext('2d'), W = (canvas.width = 640), H = (canvas.height = 360);
  const people = Array.from({ length: 6 }, (_, i) => ({ x: Math.random() * W, y: 170 + Math.random() * 150, vx: (Math.random() - 0.5) * 1.6, c: `hsl(${i * 53},50%,55%)` }));
  let raf;
  (function draw() {
    ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#18222d'; ctx.fillRect(0, 140, W, H - 140);
    ctx.strokeStyle = '#243241';
    for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x - 60 + (x - W / 2) * 0.3, H); ctx.stroke(); }
    for (const p of people) {
      p.x += p.vx; if (p.x < 20 || p.x > W - 20) p.vx *= -1;
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y - 34, 9, 0, 7); ctx.fill(); ctx.fillRect(p.x - 9, p.y - 24, 18, 36);
      ctx.strokeStyle = '#34d399'; ctx.strokeRect(p.x - 16, p.y - 48, 32, 66);
    }
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 1);
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
    ctx.fillText(`${name}  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 14, 24);
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(W - 30, 20, 6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText('SIMULATED DEMO FEED', W - 190, H - 14);
    raf = requestAnimationFrame(draw);
  })();
  return () => cancelAnimationFrame(raf);
}

async function startFeed(slot, cam, info) {
  const box = $('.feed', slot);
  let stop = () => {};
  if (info.type === 'demo') {
    box.innerHTML = '<canvas aria-label="Simulated camera feed"></canvas>';
    stop = demoFeed($('canvas', box), cam.name);
  } else if (info.type === 'device') {
    const v = document.createElement('video'); v.autoplay = true; v.muted = true; v.playsInline = true;
    box.replaceChildren(v);
    const ms = await navigator.mediaDevices.getUserMedia({ video: true });
    v.srcObject = ms;
    stop = () => ms.getTracks().forEach((t) => t.stop());
  } else if (info.type === 'mjpeg' || info.type === 'image') {
    const img = document.createElement('img'); img.alt = `Live view: ${cam.name}`;
    box.replaceChildren(img);
    const u = safeUrl(info.stream_url);
    if (info.type === 'mjpeg') img.src = u;
    else { const tick = () => (img.src = u + (u.includes('?') ? '&' : '?') + 't=' + Date.now()); tick(); const t = setInterval(tick, 2000); stop = () => clearInterval(t); }
  } else if (info.type === 'hls') {
    const v = document.createElement('video'); v.autoplay = true; v.muted = true; v.playsInline = true; v.controls = true;
    box.replaceChildren(v);
    const u = safeUrl(info.stream_url);
    if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = u;
    else {
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the video player.')); document.head.append(s); });
      if (!window.Hls?.isSupported()) throw new Error('This browser cannot play HLS streams.');
      const hls = new window.Hls(); hls.loadSource(u); hls.attachMedia(v);
      stop = () => hls.destroy();
    }
  }
  stops.set(cam.id, () => { stop(); stops.delete(cam.id); });
}

export async function cameras(embedded = false) {
  if (!isStaff()) return go('#/faculty');
  const list = await api('/cameras');
  const wall = html`
    <div class="note banner">${icon('lock')}<span><strong>Privacy notice.</strong> Camera views are limited to faculty and administrators and every view is logged. Use feeds for safety and room-occupancy monitoring only; do not record, capture or share footage. Feeds can be paused by an administrator (privacy mode).</span></div>
    <div class="grid cams">${list.map((c) => html`
      <article class="card cam" data-cam="${c.id}">
        <div class="feed" role="img" aria-label="${c.name} feed">${c.privacy_mode ? html`<div class="feed-off">${icon('lock', 'big')}Paused (privacy mode)</div>` : html`<div class="feed-off">${icon('video', 'big')}Feed not started</div>`}</div>
        <div class="row between"><div><strong>${c.name}</strong><br><small class="muted">${c.location}</small></div>
          <div class="row">${c.privacy_mode ? badge('Paused', 'warn') : html`<button class="btn sm" data-act="cam-open" data-id="${c.id}">${icon('play')}Open</button><button class="btn ghost sm" data-act="cam-full" data-id="${c.id}" aria-label="Fullscreen">${icon('full')}</button>`}</div></div>
      </article>`)}</div>`;
  if (embedded) return wall;
  view(html`<div class="page-head"><div class="eyebrow">Campus</div><h1>Live cameras</h1><p>Monitor campus spaces in real time.</p></div>${wall}`);
  wireCameras();
}

export function wireCameras() {
  cleanups.push(() => [...stops.values()].forEach((f) => f()));
  actions['cam-full'] = (el) => $(`[data-cam="${el.dataset.id}"] .feed`).requestFullscreen?.();
  actions['cam-open'] = async (el) => {
    const id = +el.dataset.id, slot = $(`[data-cam="${id}"]`);
    if (stops.has(id)) { stops.get(id)(); $('.feed', slot).innerHTML = '<div class="feed-off">Feed stopped</div>'; el.innerHTML = html`${icon('play')}Open`.s; return; }
    if (!sessionStorage.getItem('cam-consent')) {
      const ok = await new Promise((resolve) => {
        const b = openDialog(html`<p>You are about to view a live camera feed. This access is <strong>logged</strong>. Use it only for campus safety and room-occupancy purposes, and do not record or share what you see.</p><div class="row end"><button class="btn ghost" data-r="0">Cancel</button><button class="btn" data-r="1">I understand</button></div>`, 'Camera access');
        let done = false;
        b.addEventListener('click', (e) => { const r = e.target.closest('[data-r]'); if (r) { done = true; resolve(r.dataset.r === '1'); closeDialog(); } });
        $('#dlg').addEventListener('close', () => { if (!done) resolve(false); }, { once: true });
      });
      if (!ok) return;
      sessionStorage.setItem('cam-consent', '1');
    }
    el.disabled = true;
    try {
      const info = await api(`/cameras/${id}/view`, { method: 'POST' });
      await startFeed(slot, { id, name: $('strong', slot).textContent }, info);
      el.innerHTML = html`${icon('stop')}Stop`.s;
    } catch (e) {
      $('.feed', slot).innerHTML = `<div class="feed-off">${e.name === 'NotAllowedError' ? 'Camera permission denied' : 'Feed unavailable'}</div>`;
      toast(e.message, 'error');
    } finally { el.disabled = false; }
  };
}
