// Iceman IMS: rep visit check-in (v2.8, 2026-11-02). Two ways, one visit:
//   auto   = while the app is open, the phone comes within 20 m of a saved outlet location (GPS accuracy 50 m or better)
//   manual = "Check in here" on the outlet page (within 100 m)
// The server (fu_check_in) joins them into one visit when they are less than 3 hours apart, so a forgotten button is covered by auto
// and the button after an auto check-in does not count twice. Uses the main script's globals at run time
// (api, $, esc, me, sess, ops, lvl, rank, CO, nk, toast, guard, fmtDT, fmtT, go, page).
(function () {
  const AUTO_M = 20, ACC_M = 50, SAME_VISIT_MS = 3 * 3600e3;
  const V = {watch: null, last: null, recent: {}, today: [], status: '', on: true};
  // v3.9 (2026-11-07, Oshan): auto check-in is always on for reps; it cannot be turned off on the phone (an old "off" choice is cleared)
  V.on = true; try { localStorage.removeItem('fu_autovisit'); } catch (e) {}
  const uid = () => sess && sess.user && sess.user.id;
  const repOps = () => ops.filter(o => rank(lvl(o.code, 'rep')) > 0);
  const isRep = () => !!(me && (me.rep_name || (me.role !== 'admin' && repOps().length)));
  const canCheck = o => rank(lvl(o, 'rep')) > 0 || rank(lvl(o, 'receivable')) > 0;
  const dist = (a, b, c, d) => { const R = 6371000, r = x => x * Math.PI / 180, s1 = Math.sin(r(c - a) / 2), s2 = Math.sin(r(d - b) / 2); return 2 * R * Math.asin(Math.sqrt(s1 * s1 + Math.cos(r(a)) * Math.cos(r(c)) * s2 * s2)); };
  const targets = () => Object.values(CO || {}).filter(p => p.lat != null && p.lng != null && rank(lvl(p.operation, 'rep')) > 0);
  const METHOD = {auto: 'Auto (within 20 m)', manual: 'Check-in button', both: 'Auto + button'};

  // ---------- today's visits (Home) ----------
  window.loadVisitsToday = async function () {
    if (!uid()) return;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    try { V.today = await api('/rest/v1/fu_visits?rep_user=eq.' + uid() + '&started_at=gte.' + d.toISOString() + '&order=started_at.desc&select=id,operation,outlet_key,outlet,started_at,last_at,method,distance_m,note') || []; } catch (e) { V.today = []; }
  };
  window.visitHomeCard = function () {
    if (!isRep() && !V.today.length) return '';
    return '<div class="card" style="margin-top:12px"><div class="row2" style="justify-content:space-between"><h3>My visits today (' + V.today.length + ')</h3>'
      + '<span class="badge b-live" style="font-size:12px;padding:3px 10px">&#128205; Auto check-in: always ON</span></div>'
      + '<div class="hint">While this app is open on your phone, coming within 20 m of a saved outlet checks you in. Pressing "Check in here" at the same outlet is the same visit.' + (V.status ? ' · <b>' + esc(V.status) + '</b>' : '') + '</div>'
      + (V.today.length ? '<div class="wrap" style="box-shadow:none;margin-top:6px"><table><thead><tr><th>Time</th><th>Outlet</th><th>How</th><th class="n">Distance</th></tr></thead><tbody>'
        + V.today.map(v => '<tr class="row" data-outlet="' + encodeURIComponent(v.operation + '|' + v.outlet_key) + '"><td>' + esc(fmtT(new Date(v.started_at))) + '</td><td><b>' + esc(v.outlet || v.outlet_key) + '</b> <span class="hint">' + esc(v.operation) + '</span>' + (v.note ? '<br><span class="hint">' + esc(v.note) + '</span>' : '') + '</td><td>' + esc(METHOD[v.method] || v.method) + '</td><td class="n">' + (v.distance_m != null ? Math.round(v.distance_m) + ' m' : '') + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="hint" style="margin-top:6px">No visits yet today.</div>') + '</div>';
  };

  // ---------- auto check-in while the app is open ----------
  async function onPos(g) {
    const c = g.coords; V.last = {lat: c.latitude, lng: c.longitude, acc: c.accuracy, at: Date.now()};
    const T = targets(); if (!T.length) { setStatus('no outlet locations saved yet'); return; }
    let best = null; T.forEach(p => { const d = dist(p.lat, p.lng, c.latitude, c.longitude); if (!best || d < best.d) best = {p, d}; });
    setStatus('nearest: ' + best.p.outlet + ' ' + Math.round(best.d) + ' m (GPS ±' + Math.round(c.accuracy) + ' m)');
    if (best.d > AUTO_M || c.accuracy > ACC_M) return;
    const key = best.p.operation + '|' + best.p.outlet_key;
    if (V.recent[key] && Date.now() - V.recent[key] < SAME_VISIT_MS) return;
    V.recent[key] = Date.now();
    try {
      const r = await api('/rest/v1/rpc/fu_check_in', {method: 'POST', body: {p_op: best.p.operation, p_key: best.p.outlet_key, p_lat: c.latitude, p_lng: c.longitude, p_acc: Math.round(c.accuracy), p_method: 'auto'}});
      if (r && r.ok) { toast((r.merged ? 'Visit already recorded: ' : 'Auto check-in: ') + (r.outlet || best.p.outlet) + ' (' + r.distance + ' m)'); await loadVisitsToday(); if (page === 'home') go(); }
      else delete V.recent[key];
    } catch (e) { delete V.recent[key]; setStatus('check-in failed: ' + e.message); }
  }
  function setStatus(s) { V.status = s; const el = $('vPill'); if (el) el.textContent = '\u{1F4CD} ' + s; }
  window.visitAutoStart = function () {
    if (V.watch != null || !V.on || !isRep() || !navigator.geolocation) return;
    V.watch = navigator.geolocation.watchPosition(onPos, er => setStatus(er.code === 1 ? 'location permission is off' : 'no GPS signal'), {enableHighAccuracy: true, maximumAge: 20000, timeout: 30000});
    if (!$('vPill')) { const p = document.createElement('div'); p.id = 'vPill'; p.className = 'vpill noprint'; p.title = 'Auto check-in (tap to open My visits)'; p.textContent = '\u{1F4CD} auto check-in on'; p.onclick = () => go('home'); document.body.appendChild(p); }
  };
  function stopAuto() { if (V.watch != null) navigator.geolocation.clearWatch(V.watch); V.watch = null; const p = $('vPill'); if (p) p.remove(); V.status = ''; }

  // ---------- outlet page: Check in here + visits ----------
  window.visitCard = async function (x) {
    const side = document.querySelector('#page .side'); if (!side || !x) return;
    const p = x.prof || {}, ok = p.lat != null && canCheck(x.operation);
    const c = document.createElement('div'); c.className = 'card plan'; c.id = 'visitCard';
    c.innerHTML = '<div class="tlh"><h3>Visits</h3></div>' + (ok ? '<input id="vNote" maxlength="200" placeholder="Note (optional), e.g. met the owner, cheque on Friday" style="width:100%;margin-bottom:6px">'
      + '<div class="row2 noprint"><button class="btn p" data-vact="checkin">&#9989; Check in here</button></div><div class="hint">At the outlet (within 100 m). If the app already checked you in automatically, this confirms the same visit.</div>'
      : '<div class="hint">' + (p.lat == null ? 'Save the outlet\'s live location first, then visits can be checked in here.' : 'You have no access to check in at this operation.') + '</div>')
      + '<div id="vList" class="hint" style="margin-top:8px">Loading visits...</div>';
    side.appendChild(c); c.dataset.op = x.operation; c.dataset.key = x.key;
    try {
      const L = await api('/rest/v1/fu_visits?operation=eq.' + encodeURIComponent(x.operation) + '&outlet_key=eq.' + encodeURIComponent(x.key) + '&order=started_at.desc&limit=10&select=started_at,rep_name,method,distance_m,note') || [];
      $('vList').innerHTML = L.length ? '<table><tbody>' + L.map(v => '<tr><td>' + esc(fmtDT(new Date(v.started_at))) + '<br><span class="hint">' + esc(v.rep_name || '') + '</span></td><td>' + esc(METHOD[v.method] || v.method) + (v.distance_m != null ? '<br><span class="hint">' + Math.round(v.distance_m) + ' m</span>' : '') + (v.note ? '<br><span class="hint">' + esc(v.note) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table>' : 'No visits yet.';
    } catch (e) { $('vList').textContent = 'Visits could not be loaded: ' + e.message; }
  };
  function manual(b) {
    const card = $('visitCard'); if (!card || !navigator.geolocation) { toast('This browser cannot give a location'); return; }
    b.disabled = true; b.textContent = 'Getting your location...';
    navigator.geolocation.getCurrentPosition(async g => {
      try {
        const r = await api('/rest/v1/rpc/fu_check_in', {method: 'POST', body: {p_op: card.dataset.op, p_key: card.dataset.key, p_lat: g.coords.latitude, p_lng: g.coords.longitude, p_acc: Math.round(g.coords.accuracy), p_method: 'manual', p_note: ($('vNote') || {}).value || null}});
        V.recent[card.dataset.op + '|' + card.dataset.key] = Date.now();
        toast(r.merged ? 'Same visit confirmed (' + r.distance + ' m)' : 'Checked in (' + r.distance + ' m from the saved location)');
        await loadVisitsToday(); go('outlet', 'outlets');
      } catch (e) { b.disabled = false; b.innerHTML = '&#9989; Check in here'; toast(e.message); }
    }, er => { b.disabled = false; b.innerHTML = '&#9989; Check in here'; toast(er.code === 1 ? 'Allow location for this site in the browser, then try again' : 'No GPS position, try again outside'); }, {enableHighAccuracy: true, timeout: 20000, maximumAge: 0});
  }
  // ---------- Visit History: every saved visit, any date range, as routes per rep per day ----------
  // v3.8: the same report also shows each rep's Start / Close meter for the day (fu_runs), for Admin and Operation Heads
  const H = {from: '', to: '', rep: '', rows: [], runs: [], key: '', err: '', title: 'Visit History'};
  const SRC = {ocr: 'photo', corrected: 'photo, number corrected', manual: 'manual (admin)'};
  const kmf = n => Number(n).toLocaleString('en-US', {maximumFractionDigits: 1});
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dayOf = s => ymd(new Date(s));
  function range(k) {
    const t = new Date(); t.setHours(0, 0, 0, 0); const d = new Date(t);
    if (k === 'today') return [ymd(t), ymd(t)];
    if (k === 'yday') { d.setDate(d.getDate() - 1); return [ymd(d), ymd(d)]; }
    if (k === 'week') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [ymd(d), ymd(t)]; }
    if (k === 'month') { d.setDate(1); return [ymd(d), ymd(t)]; }
    if (k === 'lmonth') { const a = new Date(t.getFullYear(), t.getMonth() - 1, 1), b = new Date(t.getFullYear(), t.getMonth(), 0); return [ymd(a), ymd(b)]; }
    return [H.from, H.to];
  }
  if (!H.from) [H.from, H.to] = range('today');
  async function hLoad(force) {
    const key = H.from + '|' + H.to + '|' + op; if (!force && key === H.key && Date.now() - (H.at || 0) < 60000) return;   // fresh for one minute
    H.at = Date.now();
    const a = new Date(H.from + 'T00:00:00'), b = new Date(H.to + 'T00:00:00'); b.setDate(b.getDate() + 1);
    const o = op ? '&operation=eq.' + encodeURIComponent(op) : '';
    try {
      const [vs, rs] = await Promise.all([
        fetchAll('/rest/v1/fu_visits?started_at=gte.' + a.toISOString() + '&started_at=lt.' + b.toISOString() + o
          + '&order=started_at.asc,id&select=id,operation,outlet_key,outlet,rep_user,rep_name,started_at,last_at,method,lat,lng,accuracy,distance_m,note'),
        fetchAll('/rest/v1/fu_runs?day=gte.' + H.from + '&day=lte.' + H.to + o + '&order=day.asc,id&select=id,operation,rep_user,rep_name,day,vehicle,start_km,start_at,start_src,start_photo,end_km,end_at,end_src,end_photo,note').catch(() => [])]);
      H.rows = vs || []; H.runs = rs || [];
      H.key = key; H.err = '';
    } catch (e) { H.rows = []; H.runs = []; H.err = e.message; }
  }
  const hRows = () => H.rows.filter(v => !H.rep || nk(v.rep_name) === nk(H.rep));
  const hRuns = () => H.runs.filter(r => !H.rep || nk(r.rep_name) === nk(H.rep));
  const runKm = r => r.start_km != null && r.end_km != null ? Number(r.end_km) - Number(r.start_km) : 0;
  // meter block of one route (rep x day): one line per vehicle, with times, source, photo links and checks
  function meterHtml(runs) {
    if (!runs.length) return '<div class="vmeter none">No Start / Close meter for this day.</div>';
    const cell = (r, k) => r[k + '_km'] == null ? '<span class="tag t-a">' + (k === 'end' ? 'no close meter' : 'no start meter') + '</span>'
      : '<b>' + kmf(r[k + '_km']) + ' km</b><br><span class="hint">' + esc(r[k + '_at'] ? fmtT(new Date(r[k + '_at'])) : '') + (r[k + '_src'] ? ' · ' + esc(SRC[r[k + '_src']] || r[k + '_src']) : '') + '</span>'
        + (r[k + '_photo'] ? ' <a href="#" class="noprint" data-lvph="' + esc(r[k + '_photo']) + '">photo</a>' : '');
    const flag = r => [r.start_src === 'corrected' || r.end_src === 'corrected' ? 'number changed from the photo: check the photo' : '', r.start_km != null && r.end_km != null && Number(r.start_km) === Number(r.end_km) ? 'start = close' : ''].filter(Boolean).join(' · ');
    return '<table class="vmeter"><thead><tr><th>Vehicle</th><th>Start meter</th><th>Close meter</th><th class="n">Km run (meter)</th></tr></thead><tbody>'
      + runs.map(r => '<tr><td>' + esc(r.vehicle || '-') + (flag(r) ? '<br><span class="tag t-r">' + esc(flag(r)) + '</span>' : '') + (r.note ? '<br><span class="hint">' + esc(r.note) + '</span>' : '') + '</td><td>' + cell(r, 'start') + '</td><td>' + cell(r, 'end') + '</td><td class="n"><b>' + (r.start_km != null && r.end_km != null ? kmf(runKm(r)) + ' km' : '-') + '</b></td></tr>').join('')
      + (runs.length > 1 ? '<tr class="tot"><td colspan="3">Total</td><td class="n"><b>' + kmf(runs.reduce((s, r) => s + runKm(r), 0)) + ' km</b></td></tr>' : '') + '</tbody></table>';
  }
  const km = (a, b) => a.lat != null && b.lat != null ? dist(a.lat, a.lng, b.lat, b.lng) / 1000 : null;
  const mins = v => Math.max(0, Math.round((new Date(v.last_at) - new Date(v.started_at)) / 60000));
  // one route per rep per day: the day's visits plus the day's meter readings (a day with a meter but no visit still shows)
  function routes(L, RU) {
    const g = {}, key = (day, u, n) => day + '|' + (u || nk(n || ''));
    L.forEach(v => { const k = key(dayOf(v.started_at), v.rep_user, v.rep_name); (g[k] = g[k] || {day: dayOf(v.started_at), rep: v.rep_name || '', stops: [], runs: []}).stops.push(v); });
    (RU || []).forEach(r => { const k = key(r.day, r.rep_user, r.rep_name); (g[k] = g[k] || {day: r.day, rep: r.rep_name || '', stops: [], runs: []}).runs.push(r); if (!g[k].rep) g[k].rep = r.rep_name || ''; });
    return Object.values(g).map(x => (x.stops.sort((a, b) => a.started_at.localeCompare(b.started_at)), x))
      .sort((x, y) => y.day.localeCompare(x.day) || x.rep.localeCompare(y.rep));
  }
  const mapDir = s => 'https://www.google.com/maps/dir/' + s.filter(v => v.lat != null).slice(0, 10).map(v => v.lat.toFixed(6) + ',' + v.lng.toFixed(6)).join('/');
  function filterBar() {
    // v3.8.2: every rep of the chosen operation(s), not only those with a visit in the period: reps on the outstanding list,
    // reps with a saved phone (fu_reps), and anyone who checked in or took a meter photo in the period. One entry per rep (nk match).
    const seen = {}, add = n => { n = (n || '').trim(); if (n && !/^no\s*rep$/i.test(n) && !seen[nk(n)]) seen[nk(n)] = n; };
    (typeof rows !== 'undefined' ? rows : []).filter(r => (!op || r.operation === op) && r.owner_name).forEach(r => add(r.owner_name));
    Object.values(typeof CR !== 'undefined' ? CR : {}).filter(x => !op || x.operation === op).forEach(x => add(x.rep_name));
    H.rows.forEach(v => add(v.rep_name)); H.runs.forEach(r => add(r.rep_name)); if (H.rep) add(H.rep);
    const reps = Object.values(seen).sort((a, b) => a.localeCompare(b));
    const nv = r => H.rows.filter(v => nk(v.rep_name) === nk(r)).length, nm = r => H.runs.filter(x => nk(x.rep_name) === nk(r)).length;
    return '<div class="filters noprint"><label class="hint">From</label><input type="date" id="vhFrom" value="' + H.from + '"><label class="hint">To</label><input type="date" id="vhTo" value="' + H.to + '">'
      + [['today', 'Today'], ['yday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['lmonth', 'Last month']].map(x => '<button class="btn" data-vh="' + x[0] + '">' + x[1] + '</button>').join('')
      + '<label class="hint">Sales rep</label><select id="vhRep"><option value="">All reps (' + reps.length + ')</option>' + reps.map(r => '<option value="' + esc(r) + '"' + (nk(r) === nk(H.rep) ? ' selected' : '') + '>' + esc(r) + ' · ' + nv(r) + ' visits' + (nm(r) ? ', meter ' + nm(r) + ' day(s)' : '') + '</option>').join('') + '</select></div>';
  }
  const period = () => (H.from === H.to ? H.from : H.from + ' to ' + H.to) + (op ? ' · ' + op : ' · all my operations') + (H.rep ? ' · ' + H.rep : '');
  async function hList(title) {
    H.title = typeof title === 'string' ? title : 'Visit History';
    $('page').innerHTML = '<div class="hint">Loading visits...</div>'; await hLoad();
    const L = hRows(), RU = hRuns(), R = routes(L, RU), outs = new Set(L.map(v => v.operation + '|' + v.outlet_key)).size, both = L.filter(v => v.method === 'both').length;
    const mkm = RU.reduce((s, r) => s + runKm(r), 0), noClose = RU.filter(r => r.start_km != null && r.end_km == null).length, noMeter = R.filter(r => r.stops.length && !r.runs.length).length;
    let h = '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">' + esc(H.title) + '</h2><div class="hint">' + esc(period()) + ' · visits with Start / Close meter</div></div><div class="row2 noprint"><button class="btn" data-vh="csv">Download Excel (CSV)</button><button class="btn p" data-vh="print">Print / Save as PDF</button></div></div>'
      + filterBar() + (H.err ? '<div class="card err">' + esc(H.err) + '</div>' : '')
      + '<div class="grid noprint"><div class="tile"><b>' + L.length + '</b><span>Visits</span></div><div class="tile"><b>' + outs + '</b><span>Outlets visited</span></div><div class="tile"><b>' + R.length + '</b><span>Routes (rep × day)</span></div>'
      + '<div class="tile g"><b>' + (L.length ? Math.round(100 * both / L.length) : 0) + '%</b><span>Confirmed by auto + button (' + both + ')</span></div><div class="tile"><b>' + L.filter(v => v.method === 'auto').length + '</b><span>Auto only</span></div><div class="tile a"><b>' + L.filter(v => v.method === 'manual').length + '</b><span>Button only</span></div>'
      + '<div class="tile"><b>' + kmf(mkm) + ' km</b><span>Km run (meter)</span></div><div class="tile ' + (noClose ? 'r' : '') + '"><b>' + noClose + '</b><span>No close meter</span></div><div class="tile ' + (noMeter ? 'a' : '') + '"><b>' + noMeter + '</b><span>Visits but no meter</span></div></div>';
    h += R.length ? R.map(r => {
      let tot = 0; const lines = r.stops.map((v, i) => { const k = i ? km(r.stops[i - 1], v) : null; if (k) tot += k;
        return '<tr class="row" data-outlet="' + encodeURIComponent(v.operation + '|' + v.outlet_key) + '"><td class="n">' + (i + 1) + '</td><td>' + esc(fmtT(new Date(v.started_at))) + '</td><td><b>' + esc(v.outlet || v.outlet_key) + '</b>' + (op ? '' : ' <span class="hint">' + esc(v.operation) + '</span>') + (v.note ? '<br><span class="hint">' + esc(v.note) + '</span>' : '') + '</td>'
          + '<td>' + esc(METHOD[v.method] || v.method) + '</td><td class="n">' + (v.distance_m != null ? Math.round(v.distance_m) + ' m' : '') + '</td><td class="n">' + mins(v) + ' min</td><td class="n">' + (k != null ? k.toFixed(1) + ' km' : '') + '</td></tr>'; }).join('');
      const a = r.stops[0], z = r.stops[r.stops.length - 1], mk = r.runs.reduce((s, x) => s + runKm(x), 0);
      return '<div class="card vroute" style="margin-top:12px"><div class="row2" style="justify-content:space-between"><div><h3>' + esc(r.rep || 'Unknown rep') + ' · ' + esc(new Date(r.day + 'T00:00:00').toDateString()) + '</h3><div class="hint">'
        + (r.stops.length ? r.stops.length + ' visits · ' + esc(fmtT(new Date(a.started_at))) + ' to ' + esc(fmtT(new Date(z.last_at))) + ' · about ' + tot.toFixed(1) + ' km between stops (straight line)' : 'No check-ins this day')
        + (mk ? ' · <b>' + kmf(mk) + ' km by meter</b>' : '') + '</div></div>'
        + (r.stops.length ? '<a class="btn noprint" href="' + mapDir(r.stops) + '" target="_blank" rel="noopener">&#128506; Route on Google Maps' + (r.stops.length > 10 ? ' (first 10)' : '') + '</a>' : '') + '</div>'
        + meterHtml(r.runs)
        + (r.stops.length ? '<div class="wrap" style="box-shadow:none"><table><thead><tr><th class="n">#</th><th>Time</th><th>Outlet</th><th>Check-in</th><th class="n">From outlet</th><th class="n">At outlet</th><th class="n">From last stop</th></tr></thead><tbody>' + lines + '</tbody></table></div>' : '') + '</div>';
    }).join('') : '<div class="card" style="margin-top:12px"><div class="hint">No visits in this period. Choose other dates above.</div></div>';
    $('page').innerHTML = h;
    if (H.autoPrint) { H.autoPrint = false; window.scrollTo(0, 0); setTimeout(() => window.print(), 400); }
  }
  async function hDash() {
    $('page').innerHTML = '<div class="hint">Loading visits...</div>'; await hLoad();
    const L = hRows(), cnt = f => { const m = {}; L.forEach(v => { const k = f(v); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const seen = new Set(L.map(v => v.operation + '|' + v.outlet_key));
    const owe = {}; rows.filter(r => isActive(r) && (!op || r.operation === op) && (!H.rep || nk(r.owner_name) === nk(H.rep))).forEach(r => { const k = r.operation + '|' + nk(r.outlet); owe[k] = owe[k] || [r.outlet, 0, r.operation]; owe[k][1] += Number(r.amount || 0); });
    const notVisited = Object.entries(owe).filter(([k]) => !seen.has(k)).map(([, v]) => v).sort((a, b) => b[1] - a[1]);
    $('page').innerHTML = '<h2 class="pt">Visit History dashboard</h2><div class="hint">' + esc(period()) + '</div>' + filterBar()
      + '<div class="grid2" style="margin-top:10px"><div class="card"><h3>Visits by rep</h3>' + bars(cnt(v => v.rep_name || '(unknown)'), n => n) + '</div>'
      + '<div class="card"><h3>Visits by day</h3>' + bars(cnt(v => dayOf(v.started_at)).sort((a, b) => a[0].localeCompare(b[0])), n => n) + '</div>'
      + '<div class="card"><h3>Most visited outlets</h3>' + bars(cnt(v => v.outlet || v.outlet_key).slice(0, 10), n => n) + '</div>'
      + '<div class="card"><h3>Check-in method</h3>' + bars(cnt(v => METHOD[v.method] || v.method), n => n) + '</div>'
      + '<div class="card"><h3>Km run by rep (meter)</h3>' + (() => { const m = {}; hRuns().forEach(r => { const k = r.rep_name || '(unknown)'; m[k] = (m[k] || 0) + runKm(r); }); const e = Object.entries(m).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]); return e.length ? bars(e, n => kmf(n) + ' km') : '<div class="hint">No Start / Close meter pairs in this period.</div>'; })() + '</div>'
      + '<div class="card"><h3>Days without a close meter</h3>' + (() => { const L2 = hRuns().filter(r => r.start_km != null && r.end_km == null); return L2.length ? '<table><tbody>' + L2.map(r => '<tr><td>' + esc(r.day) + '</td><td>' + esc(r.rep_name || '') + '</td><td>' + esc(r.vehicle || '') + '</td></tr>').join('') + '</tbody></table>' : '<div class="hint">Every start meter has a close meter.</div>'; })() + '</div>'
      + '<div class="card" style="grid-column:1/-1"><h3>Outlets with outstanding NOT visited in this period (' + notVisited.length + ')</h3>'
      + (notVisited.length ? '<table><tbody>' + notVisited.slice(0, 15).map(v => '<tr><td>' + esc(v[0]) + ' <span class="hint">' + esc(v[2]) + '</span></td><td class="n">' + money(v[1]) + '</td></tr>').join('') + '</tbody></table>' + (notVisited.length > 15 ? '<div class="hint">and ' + (notVisited.length - 15) + ' more</div>' : '') : '<div class="hint">Every outlet with outstanding was visited.</div>') + '</div></div>';
  }
  function hCsv() {
    const q = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"', cols = ['Date', 'Check-in time', 'Last time', 'Rep', 'Operation', 'Outlet', 'Method', 'Distance from outlet (m)', 'Minutes at outlet', 'Note', 'Latitude', 'Longitude'];
    const L = hRows().map(v => [dayOf(v.started_at), fmtT(new Date(v.started_at)), fmtT(new Date(v.last_at)), v.rep_name, v.operation, v.outlet || v.outlet_key, METHOD[v.method] || v.method, v.distance_m != null ? Math.round(v.distance_m) : '', mins(v), v.note, v.lat, v.lng]);
    // second table in the same file: the meter readings, one line per rep per day per vehicle
    const mc = ['Date', 'Rep', 'Operation', 'Vehicle', 'Start meter (km)', 'Start time', 'Start source', 'Close meter (km)', 'Close time', 'Close source', 'Km run (meter)', 'Check-ins that day', 'Note'];
    const M = hRuns().map(r => [r.day, r.rep_name, r.operation, r.vehicle, r.start_km, r.start_at ? fmtT(new Date(r.start_at)) : '', SRC[r.start_src] || r.start_src || '', r.end_km, r.end_at ? fmtT(new Date(r.end_at)) : '', SRC[r.end_src] || r.end_src || '', r.start_km != null && r.end_km != null ? runKm(r) : '',
      hRows().filter(v => dayOf(v.started_at) === r.day && (v.rep_user ? v.rep_user === r.rep_user : nk(v.rep_name) === nk(r.rep_name))).length, r.note]);
    const csv = '﻿' + cols.map(q).join(',') + '\r\n' + L.map(r => r.map(q).join(',')).join('\r\n') + '\r\n\r\n' + q('Start / Close meter') + '\r\n' + mc.map(q).join(',') + '\r\n' + M.map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = 'Visit History ' + H.from + ' to ' + H.to + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }
  function hCard(m) { return '<div class="card mcard" data-mod="visits" data-go="items"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + V.today.length + ' today</div><div class="hint">My visits today · any date in Visit History</div></div>'; }
  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {visits: {items: () => hList('Visit History'), dash: hDash, report: () => hList('Rep Visit & Meter Report'), card: hCard}});
  // opened from Sales Reps (dashboard / report): same report, for one rep or all reps
  // from / to: keep the dates chosen on the Sales Reps meter card; autoPrint: open the print dialog once the report is drawn
  window.openVisitReport = function (rep, from, to, autoPrint) {
    H.rep = rep || ''; H.key = '';
    if (from) { H.from = from; H.to = to && to >= from ? to : from; }
    if (autoPrint) H.autoPrint = true;
    go('report', 'visits');
  };
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'vhFrom' || t.id === 'vhTo') { H.from = $('vhFrom').value || H.from; H.to = $('vhTo').value || H.to; if (H.to < H.from) H.to = H.from; go(); }
    else if (t.id === 'vhRep') { H.rep = t.value || ''; go(); }
  });

  document.addEventListener('click', e => {
    const vo = e.target.closest('[data-vhopen]'); if (vo) { openVisitReport(vo.dataset.vhopen); return; }
    const h = e.target.closest('[data-vh]');
    if (h) { const k = h.dataset.vh; if (k === 'csv') hCsv(); else if (k === 'print') window.print(); else { [H.from, H.to] = range(k); go(); } return; }
    const b = e.target.closest('[data-vact]'); if (!b) return;
    if (b.dataset.vact === 'checkin') guard(async () => manual(b));
    else if (b.dataset.vact === 'toggle') { V.on = true; visitAutoStart(); go('home'); }   // always on: an old cached button only restarts it
  });
})();
