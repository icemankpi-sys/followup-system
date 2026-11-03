// Iceman IMS - "Today in the field" on the Rep dashboard (2026-11-03, Oshan): each rep's meter (Running Chart) and location (check-ins),
// for Admin and Operation Heads. Reads fu_runs and fu_visits; the database rules already let only the rep, Admin and managers of that operation read them.
// v3.4 (2026-11-03): any day or date range, printable meter report, and a route check per rep and day (stops in time order, gaps, GPS km vs meter km,
// follow-ups planned for that day but not visited, Google Maps route).
// Loaded before the main script; uses the main script's globals at run time (api, esc, nk, op, rows, isActive, $, URL_).
(function () {
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hm = t => { if (!t) return ''; const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const ago = t => { const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min ago'; };
  const dur = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min'; };
  const km = v => v == null ? '' : Number(v).toLocaleString('en-US');
  const km1 = m => (m / 1000).toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const map = (lat, lng) => 'https://www.google.com/maps?q=' + lat + ',' + lng;
  const SRC = {ocr: 'photo', corrected: 'photo, number corrected', manual: 'manual (admin)'};
  const today = () => ymd(new Date());
  const dayStart = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = dayStart(s); d.setDate(d.getDate() + n); return ymd(d); };
  const vDay = v => ymd(new Date(v.started_at));
  const niceDay = s => dayStart(s).toLocaleDateString('en-GB', {weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'});
  const dist = (a, b, c, d) => { const R = 6371000, r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const MAXDAYS = 62, GAP = 90 * 60000;
  const L = {name: null, timer: null, runs: [], visits: [], at: null, from: null, to: null, err: ''};

  const isToday = () => L.from === today() && L.to === today();
  const single = () => L.from === L.to;
  async function load() {
    const o = op ? '&operation=eq.' + encodeURIComponent(op) : '';
    const a = encodeURIComponent(dayStart(L.from).toISOString()), b = encodeURIComponent(dayStart(addDays(L.to, 1)).toISOString());
    L.err = '';
    const [r, v] = await Promise.all([
      api('/rest/v1/fu_runs?day=gte.' + L.from + '&day=lte.' + L.to + o + '&order=day.asc&select=*&limit=5000').catch(e => { L.err = e.message; return []; }),
      api('/rest/v1/fu_visits?started_at=gte.' + a + '&started_at=lt.' + b + o + '&order=started_at.asc&select=*&limit=10000').catch(e => { L.err = e.message; return []; })]);
    L.runs = r || []; L.visits = v || []; L.at = new Date();
  }
  function people() {
    // one day: reps who have outstanding in this operation, plus anyone who took a meter photo or checked in that day
    const m = {};
    const add = (n, x) => { const k = nk(n); if (!k) return; m[k] = m[k] || {name: (n || '').trim(), runs: [], visits: []}; if (x) m[k][x.t].push(x.r); };
    rows.filter(r => isActive(r) && (!op || r.operation === op)).forEach(r => add(r.owner_name));
    L.runs.forEach(r => add(r.rep_name, {t: 'runs', r}));
    L.visits.forEach(r => add(r.rep_name, {t: 'visits', r}));
    let list = Object.values(m);
    if (L.name) list = list.filter(p => nk(p.name) === nk(L.name));
    // active reps first: the most recent update on top, then reps with nothing that day
    const last = p => Math.max(0, ...p.visits.map(v => +new Date(v.last_at)), ...p.runs.map(r => Math.max(+new Date(r.end_at || 0), +new Date(r.start_at || 0))));
    return list.map(p => Object.assign(p, {last: last(p)})).sort((a, b) => b.last - a.last || a.name.localeCompare(b.name));
  }
  function repDays() {
    // date range: one line per rep per day that has a meter or a check-in
    const m = {};
    const get = (n, d) => { const k = nk(n) + '|' + d; return m[k] = m[k] || {name: (n || '').trim(), day: d, runs: [], visits: []}; };
    L.runs.forEach(r => nk(r.rep_name) && get(r.rep_name, r.day).runs.push(r));
    L.visits.forEach(v => nk(v.rep_name) && get(v.rep_name, vDay(v)).visits.push(v));
    let list = Object.values(m);
    if (L.name) list = list.filter(p => nk(p.name) === nk(L.name));
    return list.sort((a, b) => a.name.localeCompare(b.name) || (a.day < b.day ? -1 : 1));
  }
  const runKm = runs => runs.reduce((s, r) => s + (r.start_km != null && r.end_km != null ? r.end_km - r.start_km : 0), 0);
  function where(p) {
    // latest known position: a check-in, or the place a meter photo was taken
    const c = [];
    p.visits.forEach(v => v.lat != null && c.push({t: v.last_at, lat: v.lat, lng: v.lng, what: 'check-in at ' + (v.outlet || v.outlet_key)}));
    p.runs.forEach(r => { if (r.start_lat != null) c.push({t: r.start_at, lat: r.start_lat, lng: r.start_lng, what: 'start meter photo'}); if (r.end_lat != null) c.push({t: r.end_at, lat: r.end_lat, lng: r.end_lng, what: 'close meter photo'}); });
    c.sort((a, b) => new Date(b.t) - new Date(a.t));
    return c[0];
  }
  function meterCell(r, k, pr) {
    if (!r || r[k + '_km'] == null) return pr ? '-' : '<span class="hint">' + (isToday() ? 'not yet' : 'none') + '</span>';
    const s = r[k + '_src'];
    return '<b>' + km(r[k + '_km']) + '</b> <span class="hint">' + hm(r[k + '_at']) + '</span>'
      + (s && s !== 'ocr' ? ' <span class="tag ' + (s === 'manual' ? 't-b' : 't-a') + '">' + esc(SRC[s] || s) + '</span>' : '')
      + (r[k + '_photo'] && !pr ? ' <a href="#" data-lvph="' + esc(r[k + '_photo']) + '">photo</a>' : '');
  }
  const latestRun = p => p.runs.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
  const routeBtn = (name, day) => '<button class="btn q" data-lvrt="' + esc(name) + '" data-day="' + day + '">Route check</button>';

  // ---------- tables (pr = for the printed report: no links or buttons) ----------
  function dayTable(pr) {
    const ps = people();
    if (!ps.length) return '<div class="hint">No reps in this operation.</div>';
    const body = ps.map(p => {
      const r = latestRun(p), w = where(p), lv = p.visits.slice().sort((a, b) => new Date(b.last_at) - new Date(a.last_at))[0];
      const run = r && r.start_km != null && r.end_km != null ? km(r.end_km - r.start_km) + ' km' : r && r.start_km != null ? '<span class="hint">' + (isToday() ? 'on the road' : 'no close meter') + '</span>' : '';
      return '<tr><td><b>' + esc(p.name) + '</b>' + (r && r.vehicle ? '<br><span class="hint">' + esc(r.vehicle) + '</span>' : '') + '</td>'
        + '<td>' + meterCell(r, 'start', pr) + '</td><td>' + meterCell(r, 'end', pr) + '</td><td class="n">' + run + '</td>'
        + '<td class="n">' + (p.visits.length || '') + '</td>'
        + '<td>' + (lv ? esc(lv.outlet || lv.outlet_key) + '<br><span class="hint">' + hm(lv.started_at) + (lv.method === 'both' ? ' · auto + manual' : ' · ' + esc(lv.method)) + '</span>' : '<span class="hint">no check-in</span>') + '</td>'
        + (pr ? '' : '<td>' + (w ? '<a href="' + map(w.lat, w.lng) + '" target="_blank" rel="noopener">&#128205; map</a> <span class="hint">' + (isToday() ? ago(w.t) : hm(w.t)) + '<br>' + esc(w.what) + '</span>' : '<span class="hint">no location</span>') + '</td>'
          + '<td>' + (p.runs.length || p.visits.length ? routeBtn(p.name, L.from) : '') + '</td>') + '</tr>';
    }).join('');
    return '<table><thead><tr><th>Sales rep</th><th>Start meter</th><th>Close meter</th><th class="n">Km run</th><th class="n">Check-ins</th><th>Last check-in</th>'
      + (pr ? '' : '<th>Last location</th><th></th>') + '</tr></thead><tbody>' + body + '</tbody></table>';
  }
  function rangeTable(pr) {
    const ds = repDays();
    if (!ds.length) return '<div class="hint">No meter readings or check-ins in this period.</div>';
    const tot = {};
    let html = '';
    ds.forEach(p => {
      const k = runKm(p.runs), t = tot[p.name] = tot[p.name] || {days: 0, km: 0, vis: 0, open: 0};
      t.days++; t.km += k; t.vis += p.visits.length; if (p.runs.some(r => r.start_km != null && r.end_km == null)) t.open++;
      const r = p.runs.length > 1 ? null : p.runs[0];
      html += '<tr><td>' + niceDay(p.day) + '</td><td><b>' + esc(p.name) + '</b></td><td>' + esc([...new Set(p.runs.map(x => x.vehicle).filter(Boolean))].join(', ')) + '</td>'
        + (r || !p.runs.length ? '<td>' + meterCell(r, 'start', pr) + '</td><td>' + meterCell(r, 'end', pr) + '</td>' : '<td colspan="2">' + p.runs.length + ' vehicles</td>')
        + '<td class="n">' + (k ? km(k) + ' km' : p.runs.some(x => x.start_km != null && x.end_km == null) ? '<span class="tag t-a">no close meter</span>' : '') + '</td>'
        + '<td class="n">' + (p.visits.length || '') + '</td>' + (pr ? '' : '<td>' + routeBtn(p.name, p.day) + '</td>') + '</tr>';
    });
    const totRows = Object.entries(tot).map(([n, t]) => '<tr class="tot"><td colspan="2">' + esc(n) + '</td><td>' + t.days + ' day' + (t.days > 1 ? 's' : '') + '</td><td colspan="2">' + (t.open ? t.open + ' day(s) without a close meter' : '') + '</td><td class="n">' + km(t.km) + ' km</td><td class="n">' + t.vis + '</td>' + (pr ? '' : '<td></td>') + '</tr>').join('');
    return '<table><thead><tr><th>Date</th><th>Sales rep</th><th>Vehicle</th><th>Start meter</th><th>Close meter</th><th class="n">Km run</th><th class="n">Check-ins</th>' + (pr ? '' : '<th></th>') + '</tr></thead><tbody>'
      + html + '</tbody><tfoot>' + totRows + '</tfoot></table>';
  }

  function head() {
    return isToday() ? 'Today in the field: meter and location' : 'Meter and route: ' + (single() ? niceDay(L.from) : niceDay(L.from) + ' to ' + niceDay(L.to));
  }
  function paint() {
    const box = document.getElementById('liveBox'); if (!box) return stop();
    const t = today(), on = single() ? people().filter(p => p.runs.length || p.visits.length).length : 0;
    const ctl = '<div class="row2 noprint" style="gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px">'
      + '<label class="hint">From <input type="date" id="lvFrom" value="' + L.from + '" max="' + t + '"></label>'
      + '<label class="hint">To <input type="date" id="lvTo" value="' + L.to + '" max="' + t + '"></label>'
      + '<button class="btn q" data-lv="d0">Today</button><button class="btn q" data-lv="d1">Yesterday</button><button class="btn q" data-lv="d7">Last 7 days</button><button class="btn q" data-lv="dm">This month</button>'
      + '<button class="btn" data-lv="print">&#128424; Print report</button></div>';
    box.innerHTML = '<div class="row2" style="justify-content:space-between;align-items:center"><h3 style="margin:0">' + head() + '</h3>'
      + '<span class="hint noprint">' + (single() && !L.name ? on + ' of ' + people().length + ' reps active · ' : '') + 'updated ' + hm(L.at) + (isToday() ? ', refreshes every minute' : '') + ' <button class="btn q" data-lv="reload" title="Refresh now">&#8635;</button></span></div>'
      + ctl + (L.err ? '<div class="card err">Could not load: ' + esc(L.err) + '</div>' : '')
      + '<div class="wrap" style="box-shadow:none;margin-top:8px">' + (single() ? dayTable(false) : rangeTable(false)) + '</div>'
      + '<div class="hint">Route check: the rep\'s stops that day in time order, gaps over 90 minutes, GPS distance against the meter, and follow-ups due that day that were not visited.</div>';
  }
  function stop() { if (L.timer) { clearInterval(L.timer); L.timer = null; } }
  async function tick() { if (!document.getElementById('liveBox')) return stop(); await load(); paint(); }
  function setRange(a, b) {
    const t = today();
    a = a > t ? t : a; b = b > t ? t : b; if (b < a) b = a;
    if (dayStart(b) - dayStart(a) > (MAXDAYS - 1) * 864e5) b = addDays(a, MAXDAYS - 1);
    L.from = a; L.to = b; stop();
    tick().then(() => { if (isToday()) L.timer = setInterval(tick, 60000); });
  }
  // name = one rep's dashboard, null = all reps
  window.liveBoard = function (name) {
    L.name = name || null; stop();
    if (!L.from) L.from = L.to = today();
    setTimeout(() => setRange(L.from, L.to), 0);
    return '<div class="card" id="liveBox" style="margin-top:12px"><h3>' + head() + '</h3><div class="hint">Loading...</div></div>';
  };

  // ---------- route check ----------
  function route(name, day) {
    const runs = L.runs.filter(r => r.day === day && nk(r.rep_name) === nk(name));
    const visits = L.visits.filter(v => vDay(v) === day && nk(v.rep_name) === nk(name));
    const st = [];
    runs.forEach(r => {
      if (r.start_at) st.push({t: r.start_at, kind: 'start', what: 'Start meter ' + km(r.start_km) + (r.vehicle ? ' · ' + r.vehicle : ''), lat: r.start_lat, lng: r.start_lng, src: r.start_src});
      if (r.end_at) st.push({t: r.end_at, kind: 'end', what: 'Close meter ' + km(r.end_km) + (r.vehicle ? ' · ' + r.vehicle : ''), lat: r.end_lat, lng: r.end_lng, src: r.end_src});
    });
    visits.forEach(v => st.push({t: v.started_at, until: v.last_at, kind: 'visit', what: v.outlet || v.outlet_key, lat: v.lat, lng: v.lng, method: v.method, dm: v.distance_m, acc: v.accuracy, note: v.note}));
    st.sort((a, b) => new Date(a.t) - new Date(b.t));
    let gps = 0, prev = null, prevT = null, gaps = 0;
    st.forEach(s => {
      s.leg = null; s.gap = null;
      if (s.lat != null) { if (prev) { s.leg = dist(prev.lat, prev.lng, s.lat, s.lng); gps += s.leg; } prev = s; }
      if (prevT) { const g = new Date(s.t) - prevT; if (g > GAP) { s.gap = g; gaps++; } }
      prevT = new Date(s.until || s.t);
    });
    const meter = runKm(runs);
    const seen = new Set(visits.map(v => v.outlet_key).concat(visits.map(v => nk(v.outlet || ''))));
    const due = rows.filter(r => isActive(r) && (!op || r.operation === op) && nk(r.owner_name) === nk(name) && r.next_date === day);
    const missed = [...new Map(due.filter(r => !seen.has(nk(r.outlet))).map(r => [nk(r.outlet), r])).values()];
    const checks = [];
    if (!runs.length) checks.push(['a', 'No meter reading for this day.']);
    if (runs.some(r => r.start_km != null && r.end_km == null)) checks.push(['a', 'No close meter reading.']);
    if (runs.some(r => r.start_src === 'corrected' || r.end_src === 'corrected')) checks.push(['a', 'Meter number was changed from the photo reading: open the photo and confirm.']);
    if (runs.some(r => r.start_km != null && r.start_km === r.end_km)) checks.push(['r', 'Start and close meter are the same number.']);
    if (meter > 0 && gps > 0 && meter * 1000 < gps * 0.9) checks.push(['r', 'Meter km (' + km(meter) + ') is less than the straight-line distance between the stops (' + km1(gps) + ' km): a meter reading is wrong.']);
    if (meter > 0 && gps > 0 && meter * 1000 > gps * 2.5 && meter - gps / 1000 > 20) checks.push(['a', 'Meter km (' + km(meter) + ') is much more than the stops explain (' + km1(gps) + ' km straight line, roads add about a third): ask for the route taken.']);
    if (meter > 0 && !visits.length) checks.push(['a', km(meter) + ' km on the meter but no check-in at any outlet.']);
    if (gaps) checks.push(['a', gaps + ' gap' + (gaps > 1 ? 's' : '') + ' of more than 90 minutes between stops.']);
    if (missed.length) checks.push(['a', missed.length + ' follow-up' + (missed.length > 1 ? 's' : '') + ' due this day with no check-in.']);
    if (!checks.length && st.length) checks.push(['g', 'No problems found in the meter and check-ins.']);
    const pts = st.filter(s => s.lat != null), links = [];
    for (let i = 0; i < pts.length - 1; i += 9) links.push('https://www.google.com/maps/dir/' + pts.slice(i, i + 10).map(p => p.lat + ',' + p.lng).join('/'));
    const first = st[0], last = st[st.length - 1];
    return {name, day, runs, visits, st, gps, meter, missed, checks, links, span: first && last ? new Date(last.until || last.t) - new Date(first.t) : 0, first, last};
  }
  function routeHtml(x, pr) {
    const tile = (b, s, c) => '<div class="tile' + (c ? ' ' + c : '') + '"><b>' + b + '</b><span>' + s + '</span></div>';
    const tag = {r: 't-r', a: 't-a', g: 't-g'};
    const rowsH = x.st.map((s, i) => '<tr><td class="n">' + (i + 1) + '</td><td>' + hm(s.t) + (s.until && hm(s.until) !== hm(s.t) ? '-' + hm(s.until) : '') + (s.gap ? '<br><span class="tag t-a">gap ' + dur(s.gap) + '</span>' : '') + '</td>'
      + '<td>' + (s.kind === 'visit' ? '<b>' + esc(s.what) + '</b>' : '<i>' + esc(s.what) + '</i>') + (s.note ? '<br><span class="hint">' + esc(s.note) + '</span>' : '') + '</td>'
      + '<td>' + (s.kind === 'visit' ? (s.method === 'both' ? 'auto + button' : s.method === 'auto' ? 'auto (within 20 m)' : 'button') + (s.dm != null ? '<br><span class="hint">' + Math.round(s.dm) + ' m from outlet</span>' : '') : s.src ? esc(SRC[s.src] || s.src) : '') + '</td>'
      + '<td class="n">' + (s.leg != null ? km1(s.leg) + ' km' : '') + '</td>'
      + (pr ? '' : '<td>' + (s.lat != null ? '<a href="' + map(s.lat, s.lng) + '" target="_blank" rel="noopener">&#128205;</a>' : '<span class="hint">no GPS</span>') + '</td>') + '</tr>').join('');
    return '<div class="grid">' + tile(x.meter ? km(x.meter) + ' km' : '-', 'Meter km') + tile(km1(x.gps) + ' km', 'GPS straight line between stops') + tile(x.visits.length, 'Outlet check-ins')
      + tile(x.span ? dur(x.span) : '-', 'First to last stop' + (x.first ? ' (' + hm(x.first.t) + '-' + hm(x.last.until || x.last.t) + ')' : '')) + '</div>'
      + '<div style="margin:8px 0">' + x.checks.map(c => '<div><span class="tag ' + tag[c[0]] + '">' + (c[0] === 'r' ? 'check' : c[0] === 'a' ? 'look' : 'ok') + '</span> ' + esc(c[1]) + '</div>').join('') + '</div>'
      + (x.st.length ? '<div class="wrap" style="box-shadow:none"><table><thead><tr><th class="n">#</th><th>Time</th><th>Stop</th><th>How</th><th class="n">From last stop</th>' + (pr ? '' : '<th>Map</th>') + '</tr></thead><tbody>' + rowsH + '</tbody></table></div>' : '<div class="hint">No meter reading or check-in this day.</div>')
      + (x.missed.length ? '<h4 style="margin:10px 0 4px">Follow-ups due this day, not visited</h4><div class="wrap" style="box-shadow:none"><table><thead><tr><th>Outlet</th><th class="n">Balance</th><th>Next step</th></tr></thead><tbody>'
        + x.missed.map(r => '<tr><td>' + esc(r.outlet) + '</td><td class="n">' + km(Math.round(r.amount)) + '</td><td>' + esc(r.next_step || '') + '</td></tr>').join('') + '</tbody></table></div><div class="hint">From the follow-up next date as it is now in IMS.</div>' : '')
      + (!pr && x.links.length ? '<div style="margin-top:8px">' + x.links.map((u, i) => '<a class="btn q" href="' + u + '" target="_blank" rel="noopener">&#128506; Route on Google Maps' + (x.links.length > 1 ? ' (part ' + (i + 1) + ')' : '') + '</a>').join(' ') + '</div>' : '')
      + '<div class="hint" style="margin-top:6px">GPS km is the straight line between stops that have a location; the road distance is usually about a third more.</div>';
  }
  function openRoute(name, day) {
    const x = route(name, day);
    $('panel').innerHTML = '<div class="dh"><div><h3>Route check · ' + esc(name) + '</h3><div class="hint">' + niceDay(day) + (op ? ' · ' + esc(op) : '') + '</div></div><div class="row2"><button class="btn" data-lvrp="' + esc(name) + '" data-day="' + day + '">&#128424; Print</button><button class="btn" data-lv="close">Close</button></div></div>'
      + '<div class="frm">' + routeHtml(x, false) + '</div>';
    $('panel').classList.add('open');
  }

  // ---------- printing: a clean page in a new window ----------
  function printDoc(title, inner) {
    const who = typeof me !== 'undefined' && me ? (me.full_name || me.username || '') : '';
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups for this site to print the report.'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>'
      + '@page{size:A4 landscape;margin:12mm}body{font:11px/1.4 Arial,sans-serif;color:#111;margin:0}h1{font-size:16px;margin:0}h4{font-size:12px}.sub{color:#555;margin:2px 0 10px}'
      + 'table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef1f5}td.n,th.n{text-align:right}tr.tot td{font-weight:bold;background:#f6f6f6}'
      + '.hint{color:#666;font-size:10px}.tag{display:inline-block;border:1px solid #999;border-radius:3px;padding:0 4px;font-size:10px}.t-r{border-color:#c33;color:#c33}.t-a{border-color:#b77a00;color:#8a5a00}.t-g{border-color:#2a7;color:#1a6}.t-b{border-color:#36c;color:#36c}'
      + '.grid{display:flex;gap:8px;flex-wrap:wrap}.tile{border:1px solid #bbb;border-radius:4px;padding:6px 10px;min-width:120px}.tile b{display:block;font-size:14px}.tile span{color:#555}'
      + '.sig{display:flex;gap:40px;margin-top:40px}.sig div{flex:1;border-top:1px solid #555;padding-top:4px;text-align:center}'
      + '</style></head><body><h1>Iceman IMS · ' + esc(title) + '</h1><div class="sub">' + (op ? 'Operation ' + esc(op) : 'All operations') + ' · printed ' + new Date().toLocaleString('en-GB') + (who ? ' by ' + esc(who) : '') + '</div>'
      + inner + '<div class="sig"><div>Prepared by</div><div>Checked by</div><div>Approved by</div></div></body></html>');
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  }
  function printReport() {
    const per = single() ? niceDay(L.from) : niceDay(L.from) + ' to ' + niceDay(L.to);
    printDoc('Rep meter report · ' + per + (L.name ? ' · ' + L.name : ''), single() ? dayTable(true) : rangeTable(true));
  }

  document.addEventListener('change', e => {
    if (e.target.id === 'lvFrom') setRange(e.target.value || today(), L.to < e.target.value ? e.target.value : L.to);
    else if (e.target.id === 'lvTo') setRange(L.from, e.target.value || today());
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-lv]');
    if (b) {
      const k = b.dataset.lv, t = today();
      if (k === 'reload') tick();
      else if (k === 'close') $('panel').classList.remove('open');
      else if (k === 'print') printReport();
      else if (k === 'd0') setRange(t, t);
      else if (k === 'd1') setRange(addDays(t, -1), addDays(t, -1));
      else if (k === 'd7') setRange(addDays(t, -6), t);
      else if (k === 'dm') setRange(t.slice(0, 8) + '01', t);
      return;
    }
    const rt = e.target.closest('[data-lvrt]');
    if (rt) { openRoute(rt.dataset.lvrt, rt.dataset.day); return; }
    const rp = e.target.closest('[data-lvrp]');
    if (rp) { printDoc('Route check · ' + rp.dataset.lvrp + ' · ' + niceDay(rp.dataset.day), routeHtml(route(rp.dataset.lvrp, rp.dataset.day), true)); return; }
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
