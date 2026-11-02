// Iceman IMS: rep visit check-in (v2.8, 2026-11-02). Two ways, one visit:
//   auto   = while the app is open, the phone comes within 20 m of a saved outlet location (GPS accuracy 50 m or better)
//   manual = "Check in here" on the outlet page (within 100 m)
// The server (fu_check_in) joins them into one visit when they are less than 3 hours apart, so a forgotten button is covered by auto
// and the button after an auto check-in does not count twice. Uses the main script's globals at run time
// (api, $, esc, me, sess, ops, lvl, rank, CO, nk, toast, guard, fmtDT, fmtT, go, page).
(function () {
  const AUTO_M = 20, ACC_M = 50, SAME_VISIT_MS = 3 * 3600e3;
  const V = {watch: null, last: null, recent: {}, today: [], status: '', on: true};
  try { V.on = localStorage.getItem('fu_autovisit') !== 'off'; } catch (e) {}
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
      + '<button class="btn" data-vact="toggle">' + (V.on ? '&#128205; Auto check-in: ON' : 'Auto check-in: OFF') + '</button></div>'
      + '<div class="hint">' + (V.on ? 'While this app is open on your phone, coming within 20 m of a saved outlet checks you in. Pressing "Check in here" at the same outlet is the same visit.' : 'Auto check-in is off on this phone. Use "Check in here" on the outlet page.') + (V.status ? ' · <b>' + esc(V.status) + '</b>' : '') + '</div>'
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
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-vact]'); if (!b) return;
    if (b.dataset.vact === 'checkin') guard(async () => manual(b));
    else if (b.dataset.vact === 'toggle') { V.on = !V.on; try { localStorage.setItem('fu_autovisit', V.on ? 'on' : 'off'); } catch (er) {} if (V.on) visitAutoStart(); else stopAuto(); go('home'); }
  });
})();
