// Iceman IMS - "Today in the field" on the Rep dashboard (2026-11-03, Oshan): each rep's meter (Running Chart) and location (check-ins) for today,
// for Admin and Operation Heads. Reads fu_runs and fu_visits; the database rules already let only the rep, Admin and managers of that operation read them.
// Loaded before the main script; uses the main script's globals at run time (api, esc, nk, op, rows, isActive).
(function () {
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hm = t => { if (!t) return ''; const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const ago = t => { const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min ago'; };
  const km = v => v == null ? '' : Number(v).toLocaleString('en-US');
  const map = (lat, lng) => 'https://www.google.com/maps?q=' + lat + ',' + lng;
  const SRC = {ocr: 'photo', corrected: 'photo, number corrected', manual: 'manual (admin)'};
  const L = {name: null, timer: null, runs: [], visits: [], at: null};

  async function load() {
    const d = new Date(), day = ymd(d), from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(), o = op ? '&operation=eq.' + encodeURIComponent(op) : '';
    const [r, v] = await Promise.all([
      api('/rest/v1/fu_runs?day=eq.' + day + o + '&select=*&limit=2000').catch(() => []),
      api('/rest/v1/fu_visits?started_at=gte.' + encodeURIComponent(from) + o + '&order=last_at.desc&select=*&limit=5000').catch(() => [])]);
    L.runs = r || []; L.visits = v || []; L.at = new Date();
  }
  function people() {
    // reps who have outstanding in this operation, plus anyone who took a meter photo or checked in today
    const m = {};
    const add = (n, x) => { const k = nk(n); if (!k) return; m[k] = m[k] || {name: (n || '').trim(), runs: [], visits: []}; if (x) m[k][x.t].push(x.r); };
    rows.filter(r => isActive(r) && (!op || r.operation === op)).forEach(r => add(r.owner_name));
    L.runs.forEach(r => add(r.rep_name, {t: 'runs', r}));
    L.visits.forEach(r => add(r.rep_name, {t: 'visits', r}));
    let list = Object.values(m);
    if (L.name) list = list.filter(p => nk(p.name) === nk(L.name));
    // active reps first: the most recent update on top, then reps with nothing yet today
    const last = p => Math.max(0, ...p.visits.map(v => +new Date(v.last_at)), ...p.runs.map(r => Math.max(+new Date(r.end_at || 0), +new Date(r.start_at || 0))));
    return list.map(p => Object.assign(p, {last: last(p)})).sort((a, b) => b.last - a.last || a.name.localeCompare(b.name));
  }
  function where(p) {
    // latest known position: a check-in, or the place a meter photo was taken
    const c = [];
    p.visits.forEach(v => v.lat != null && c.push({t: v.last_at, lat: v.lat, lng: v.lng, what: 'check-in at ' + (v.outlet || v.outlet_key)}));
    p.runs.forEach(r => { if (r.start_lat != null) c.push({t: r.start_at, lat: r.start_lat, lng: r.start_lng, what: 'start meter photo'}); if (r.end_lat != null) c.push({t: r.end_at, lat: r.end_lat, lng: r.end_lng, what: 'close meter photo'}); });
    c.sort((a, b) => new Date(b.t) - new Date(a.t));
    return c[0];
  }
  function meterCell(r, k) {
    if (!r || r[k + '_km'] == null) return '<span class="hint">not yet</span>';
    const s = r[k + '_src'];
    return '<b>' + km(r[k + '_km']) + '</b> <span class="hint">' + hm(r[k + '_at']) + '</span>'
      + (s && s !== 'ocr' ? ' <span class="tag ' + (s === 'manual' ? 't-b' : 't-a') + '">' + esc(SRC[s] || s) + '</span>' : '')
      + (r[k + '_photo'] ? ' <a href="#" data-lvph="' + esc(r[k + '_photo']) + '">photo</a>' : '');
  }
  function paint() {
    const box = document.getElementById('liveBox'); if (!box) return stop();
    const ps = people();
    const on = ps.filter(p => p.runs.length || p.visits.length).length;
    const rowsHtml = ps.map(p => {
      const r = p.runs.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0], w = where(p), lv = p.visits[0];
      const run = r && r.start_km != null && r.end_km != null ? km(r.end_km - r.start_km) + ' km' : r && r.start_km != null ? '<span class="hint">on the road</span>' : '';
      return '<tr><td><b>' + esc(p.name) + '</b>' + (r && r.vehicle ? '<br><span class="hint">' + esc(r.vehicle) + '</span>' : '') + '</td>'
        + '<td>' + meterCell(r, 'start') + '</td><td>' + meterCell(r, 'end') + '</td><td class="n">' + run + '</td>'
        + '<td class="n">' + (p.visits.length || '') + '</td>'
        + '<td>' + (lv ? esc(lv.outlet || lv.outlet_key) + '<br><span class="hint">' + hm(lv.started_at) + (lv.method === 'both' ? ' · auto + manual' : ' · ' + esc(lv.method)) + '</span>' : '<span class="hint">no check-in yet</span>') + '</td>'
        + '<td>' + (w ? '<a href="' + map(w.lat, w.lng) + '" target="_blank" rel="noopener">&#128205; map</a> <span class="hint">' + ago(w.t) + '<br>' + esc(w.what) + '</span>' : '<span class="hint">no location yet</span>') + '</td></tr>';
    }).join('');
    box.innerHTML = '<div class="row2" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Today in the field: meter and location</h3>'
      + '<span class="hint noprint">' + (L.name ? '' : on + ' of ' + ps.length + ' reps active today · ') + 'updated ' + hm(L.at) + ', refreshes every minute <button class="btn q" data-lv="reload" title="Refresh now">&#8635;</button></span></div>'
      + (ps.length ? '<div class="wrap" style="box-shadow:none;margin-top:8px"><table><thead><tr><th>Sales rep</th><th>Start meter</th><th>Close meter</th><th class="n">Km run</th><th class="n">Check-ins</th><th>Last check-in</th><th>Last location</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
        : '<div class="hint">No reps in this operation.</div>');
  }
  function stop() { if (L.timer) { clearInterval(L.timer); L.timer = null; } }
  async function tick() { if (!document.getElementById('liveBox')) return stop(); await load(); paint(); }
  // name = one rep's dashboard, null = all reps
  window.liveBoard = function (name) {
    L.name = name || null; stop();
    setTimeout(async () => { await tick(); L.timer = setInterval(tick, 60000); }, 0);
    return '<div class="card" id="liveBox" style="margin-top:12px"><h3>Today in the field: meter and location</h3><div class="hint">Loading...</div></div>';
  };
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-lv="reload"]')) { tick(); return; }
    if (e.target.closest('[data-lv="close"]')) { $('panel').classList.remove('open'); return; }
    const a = e.target.closest('[data-lvph]'); if (!a) return;
    e.preventDefault();
    // same side panel as the Running Chart page; the photo link is signed for 10 minutes
    const path = a.dataset.lvph;
    $('panel').innerHTML = '<div class="dh"><div><h3>Meter photo</h3><div class="hint">' + esc(path.split('/').pop()) + '</div></div><button class="btn" data-lv="close">Close</button></div><div class="frm"><div id="lvPh" class="hint">Loading...</div></div>'; $('panel').classList.add('open');
    try {
      const j = await api('/storage/v1/object/sign/meter-photos/' + path, {method: 'POST', body: {expiresIn: 600}});
      $('lvPh').innerHTML = '<img src="' + esc(URL_ + '/storage/v1' + j.signedURL) + '" alt="meter photo" style="width:100%;border-radius:8px">';
    } catch (er) { $('lvPh').textContent = er.message; }
  });
})();
