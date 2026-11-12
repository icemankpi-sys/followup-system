// Iceman IMS: Running Chart (v2.9, 2026-11-02). Start meter and Close meter by photo; the app reads the number (OCR) and the rep confirms it.
// The photo is always kept; a changed OCR number is flagged "corrected". Without a camera only an admin enters a reading (manual).
// Server rules in fu_run_meter (Supabase/23 running chart.sql). Uses the main script's globals at run time
// (api, $, esc, me, sess, ops, lvl, rank, URL_, KEY, toast, guard, closeDrawer, fmtDT, fmtT, go, page, op, bars).
(function () {
  const R = {from: '', to: '', rep: '', rows: [], hist: [], key: '', at: 0, today: [], pend: null, people: null, ocrW: null};
  const uid = () => sess && sess.user && sess.user.id;
  const isAdmin = () => me && me.role === 'admin';
  const repOps = () => ops.filter(o => rank(lvl(o.code, 'rep')) > 0 || rank(lvl(o.code, 'receivable')) > 0);
  const isRep = () => !!(me && (me.rep_name || (!isAdmin() && ops.some(o => rank(lvl(o.code, 'rep')) > 0))));
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => ymd(new Date());
  const km = v => v == null ? '' : Number(v).toLocaleString('en-US');
  // v4.5 (2026-11-12): the rep types the reading and adds the photo (camera or gallery) in one form. The photo is still needed to save.
  // 'ocr' = the typed number is the same as the number read from the photo; 'corrected' = different, or the photo could not be read.
  // v4.6: the photo is optional. 'typed' = the rep typed the number and added no photo (Supabase/34 meter photo optional.sql).
  const SRC = {ocr: 'Photo matches', corrected: 'Typed, check photo', typed: 'Typed, no photo', manual: 'Manual (admin)'};
  const srcTag = s => s ? '<span class="tag ' + (s === 'ocr' ? 't-g' : s === 'corrected' ? 't-a' : s === 'typed' ? 't-r' : 't-b') + '">' + esc(SRC[s] || s) + '</span>' : '';
  let veh = ''; try { veh = localStorage.getItem('fu_vehicle') || ''; } catch (e) {}

  // ---------- today (Home card for reps) ----------
  window.loadRunsToday = async function () {
    if (!uid()) return;
    try { R.today = await api('/rest/v1/fu_runs?rep_user=eq.' + uid() + '&day=eq.' + today() + '&select=*') || []; } catch (e) { R.today = []; }
  };
  const myOp = () => { const o = repOps(); return op && o.some(x => x.code === op) ? op : (o[0] || {}).code; };
  function todayBox() {
    const r = R.today.find(x => x.vehicle === veh.toUpperCase().replace(/\s+/g, ' ').trim()) || R.today[0] || {};
    const st = r.start_km != null, en = r.end_km != null;
    return '<div class="row2" style="align-items:flex-end;gap:10px"><div><label class="hint">Vehicle no</label><br><input id="rcVeh" maxlength="20" value="' + esc(r.vehicle || veh) + '" placeholder="e.g. CAB-1234" style="width:130px"></div>'
      + '<div class="rcbox"><div class="hint">Start meter</div>' + (st ? '<b>' + km(r.start_km) + ' km</b><div class="hint">' + esc(fmtT(new Date(r.start_at))) + ' ' + srcTag(r.start_src) + '</div>' : '<button class="btn p" data-rc="meter" data-kind="start">&#9998; Start meter</button>') + '</div>'
      + '<div class="rcbox"><div class="hint">Close meter</div>' + (en ? '<b>' + km(r.end_km) + ' km</b><div class="hint">' + esc(fmtT(new Date(r.end_at))) + ' ' + srcTag(r.end_src) + '</div>' : '<button class="btn' + (st ? ' p' : '') + '" data-rc="meter" data-kind="end"' + (st ? '' : ' disabled title="Save the Start meter first"') + '>&#9998; Close meter</button>') + '</div>'
      + (st && en ? '<div class="rcbox"><div class="hint">Today</div><b>' + km(r.end_km - r.start_km) + ' km</b></div>' : '') + '</div>';
  }
  window.runHomeCard = function () {
    if (!isRep()) return '';
    return '<div class="card" style="margin-top:12px"><div class="row2" style="justify-content:space-between"><h3>Running Chart today</h3><span class="hint">Type the meter at start and close of the day. Add its photo when you can.</span></div>' + todayBox() + '</div>';
  };

  // ---------- photo → OCR → confirm → save ----------
  function loadTess() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the number reader')); document.head.appendChild(s); });
  }
  async function shrink(file, maxW, gray) {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
    const s = Math.min(1, maxW / img.width), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    if (gray) { const d = x.getImageData(0, 0, c.width, c.height), p = d.data; for (let i = 0; i < p.length; i += 4) { let g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; g = g > 128 ? Math.min(255, (g - 128) * 1.6 + 128) : Math.max(0, 128 - (128 - g) * 1.6); p[i] = p[i + 1] = p[i + 2] = g; } x.putImageData(d, 0, 0); }
    return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
  }
  function pickNumber(text, min) {
    const c = (String(text).match(/\d[\d ,.]{2,}\d/g) || []).map(s => s.replace(/\D/g, '')).filter(s => s.length >= 4 && s.length <= 7).map(Number);
    if (!c.length) return null;
    const ok = min != null ? c.filter(n => n >= min) : c, L = ok.length ? ok : c;
    return min != null ? L.sort((a, b) => (a - min) - (b - min))[0] : L.sort((a, b) => String(b).length - String(a).length)[0];
  }
  const typedKm = () => Number((($('rcKm') && $('rcKm').value) || '').replace(/\D/g, '')) || 0;
  // the form opens at once: the rep types the reading, then adds the photo (camera or gallery). Nothing waits for the number reader.
  function openMeter(kind) {
    R.pend = {kind, blob: null, ocr: null, op: myOp(), seq: 0};
    $('panel').innerHTML = '<div class="dh"><div><h3>' + (kind === 'start' ? 'Start' : 'Close') + ' meter</h3><div class="hint">' + today() + ' · ' + esc(me.full_name || '') + '</div></div><button class="btn" data-rc="close">Close</button></div><div class="frm">'
      + '<label>1. Meter reading (km)</label><input id="rcKm" inputmode="numeric" maxlength="7" placeholder="Type the number on the meter" style="font-size:22px;font-weight:700;letter-spacing:2px">'
      + '<label>2. Meter photo (optional)</label><img id="rcImg" alt="meter photo" hidden style="width:100%;border-radius:8px;margin-bottom:8px">'
      + '<div class="row2"><button class="btn p" data-rc="cam" id="rcCam">&#128247; Take photo</button><button class="btn" data-rc="gal" id="rcGal">&#128444; Choose from gallery</button></div>'
      + '<div id="rcRead" class="hint">You can save without a photo. A clear photo of the meter is kept with the reading; without one it is marked "Typed, no photo".</div>'
      + '<div class="row2" style="margin-top:10px"><button class="btn p" data-rc="save" id="rcSave">Save</button><button class="btn" data-rc="close">Cancel</button></div><div class="err" id="rcErr"></div></div>';
    $('panel').classList.add('open');
    setTimeout(() => { const k = $('rcKm'); if (k) k.focus(); }, 200);
  }
  function pickFile(camera) {
    const f = $('rcFile') || Object.assign(document.createElement('input'), {type: 'file', accept: 'image/*', id: 'rcFile', hidden: true});
    if (camera) f.setAttribute('capture', 'environment'); else f.removeAttribute('capture');
    if (!f.isConnected) document.body.appendChild(f); f.value = ''; f.click();
  }
  async function onPhoto(file) {
    const P = R.pend; if (!P || !$('rcImg')) return;
    const seq = ++P.seq, r = R.today[0] || {}, min = P.kind === 'end' ? r.start_km : null, live = () => R.pend === P && P.seq === seq && $('rcRead');
    P.blob = null; P.ocr = null; P.busy = true; $('rcErr').textContent = ''; $('rcRead').textContent = 'Preparing the photo...';
    try { const b = await shrink(file, 1280, false); if (!live()) return; P.blob = b; P.busy = false; }
    catch (e) { if (live()) { P.busy = false; $('rcImg').hidden = true; $('rcRead').textContent = 'This photo could not be opened. Take or choose another one, or save without a photo.'; } return; }
    const im = $('rcImg'); im.src = URL.createObjectURL(P.blob); im.hidden = false;
    $('rcCam').innerHTML = '&#128247; Take again'; $('rcGal').innerHTML = '&#128444; Choose another';
    $('rcRead').textContent = 'Photo added. You can save now.';
    try {   // the number reader is only a check: it never blocks Save and never overwrites a typed number
      await loadTess();
      if (!R.ocrW) { R.ocrW = await Tesseract.createWorker('eng'); await R.ocrW.setParameters({tessedit_char_whitelist: '0123456789'}); }
      const g = await shrink(file, 1600, true), res = await R.ocrW.recognize(g), n = pickNumber(res.data.text, min);
      if (!live()) return;
      P.ocr = n; const t = typedKm();
      if (n == null) $('rcRead').textContent = 'Photo added. Check that the number you typed is the same as the photo.';
      else if (!t) { $('rcKm').value = n; $('rcRead').innerHTML = 'Photo added. The app read <b>' + n + '</b> from it. Check it, and change it if it is wrong.'; }
      else if (t === n) $('rcRead').innerHTML = 'Photo added. It shows <b>' + n + '</b>, the same as you typed.';
      else $('rcRead').innerHTML = 'Photo added. The app read <b>' + n + '</b> from it, but you typed <b>' + t + '</b>. Check the number before you save.';
    } catch (e) {}
  }
  const pos = () => new Promise(ok => { if (!navigator.geolocation) return ok(null); navigator.geolocation.getCurrentPosition(g => ok(g.coords), () => ok(null), {enableHighAccuracy: true, timeout: 6000, maximumAge: 60000}); });
  async function save() {
    const P = R.pend; if (!P) return;
    const v = typedKm(); if (!v) { $('rcErr').textContent = 'Type the meter reading'; $('rcKm').focus(); return; }
    if (P.busy) { $('rcErr').textContent = 'The photo is still being prepared. Try again in a moment.'; return; }
    const vh = (($('rcVeh') && $('rcVeh').value) || veh || '').trim(); try { localStorage.setItem('fu_vehicle', vh); } catch (e) {}
    const path = P.blob ? P.op + '/' + uid() + '/' + today() + '-' + P.kind + '-' + Date.now() + '.jpg' : null;
    try {
      $('rcSave').disabled = true; $('rcErr').textContent = path ? 'Saving the photo...' : 'Saving...';
      if (path) {
        const up = await fetch(URL_ + '/storage/v1/object/meter-photos/' + path, {method: 'POST', headers: {apikey: KEY, Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'image/jpeg', 'x-upsert': 'false'}, body: P.blob});
        if (!up.ok) { const j = await up.json().catch(() => ({})); throw new Error(j.message || j.error || ('photo upload failed, HTTP ' + up.status)); }
      }
      const c = await pos();
      const r = await api('/rest/v1/rpc/fu_run_meter', {method: 'POST', body: {p_op: P.op, p_day: today(), p_kind: P.kind, p_km: v, p_ocr: path ? P.ocr : null, p_photo: path, p_src: !path ? 'typed' : P.ocr === v ? 'ocr' : 'corrected', p_vehicle: vh, p_lat: c ? c.latitude : null, p_lng: c ? c.longitude : null}});
      R.pend = null; closeDrawer(); await loadRunsToday(); R.key = '';
      toast((P.kind === 'start' ? 'Start meter saved: ' : 'Close meter saved: ') + km(v) + ' km' + (r && r.km != null ? ' · today ' + km(r.km) + ' km' : '')); go();
    } catch (e) { $('rcSave').disabled = false; $('rcErr').textContent = e.message; }
  }

  // ---------- list / report ----------
  function range(k) {
    const t = new Date(); t.setHours(0, 0, 0, 0); const d = new Date(t);
    if (k === 'today') return [ymd(t), ymd(t)];
    if (k === 'yday') { d.setDate(d.getDate() - 1); return [ymd(d), ymd(d)]; }
    if (k === 'week') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [ymd(d), ymd(t)]; }
    if (k === 'month') { d.setDate(1); return [ymd(d), ymd(t)]; }
    if (k === 'lmonth') return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))];
    return [R.from, R.to];
  }
  [R.from, R.to] = range('month');
  async function load(force) {
    const key = R.from + '|' + R.to + '|' + op; if (!force && key === R.key && Date.now() - R.at < 60000) return;
    const a = new Date(R.from + 'T00:00:00'); a.setDate(a.getDate() - 35);   // earlier rows only to find the last close before the period
    try {
      R.hist = await fetchAll('/rest/v1/fu_runs?day=gte.' + ymd(a) + '&day=lte.' + R.to + (op ? '&operation=eq.' + encodeURIComponent(op) : '') + '&order=day.asc,id&select=*') || [];
      R.rows = R.hist.filter(r => r.day >= R.from); R.key = key; R.at = Date.now();
    } catch (e) { R.rows = []; R.hist = []; toast(e.message); }
  }
  // gap = start today - close of the previous day for the same rep and vehicle (km driven outside the recorded days)
  const gapOf = r => { const p = R.hist.filter(x => x.rep_user === r.rep_user && x.vehicle === r.vehicle && x.day < r.day && x.end_km != null).pop(); return p && r.start_km != null ? r.start_km - p.end_km : null; };
  const shown = () => R.rows.filter(r => !R.rep || r.rep_name === R.rep);
  function bar() {
    const reps = [...new Set(R.rows.map(r => r.rep_name).filter(Boolean))].sort();
    return '<div class="filters noprint"><label class="hint">From</label><input type="date" id="rcFrom" value="' + R.from + '"><label class="hint">To</label><input type="date" id="rcTo" value="' + R.to + '">'
      + [['today', 'Today'], ['yday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['lmonth', 'Last month']].map(x => '<button class="btn" data-rcr="' + x[0] + '">' + x[1] + '</button>').join('')
      + '<select id="rcRep"><option value="">All reps</option>' + reps.map(n => '<option' + (n === R.rep ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>';
  }
  async function list() {
    $('page').innerHTML = '<div class="hint">Loading...</div>'; await load();
    const L = shown(), byRep = {};
    L.forEach(r => { (byRep[r.rep_name || '?'] = byRep[r.rep_name || '?'] || []).push(r); });
    const tot = L.reduce((s, r) => s + (r.start_km != null && r.end_km != null ? r.end_km - r.start_km : 0), 0);
    let h = '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">Running Chart</h2><div class="hint">' + esc((R.from === R.to ? R.from : R.from + ' to ' + R.to) + (op ? ' · ' + op : ' · all my operations') + (R.rep ? ' · ' + R.rep : '')) + '</div></div>'
      + '<div class="row2 noprint">' + (isAdmin() ? '<button class="btn" data-rc="manual">+ Manual entry (admin)</button>' : '') + '<button class="btn" data-rc="csv">Download Excel (CSV)</button><button class="btn p" data-rc="print">Print / Save as PDF</button></div></div>'
      + (isRep() ? '<div class="card noprint" style="margin-bottom:10px"><h3>Today</h3>' + todayBox() + '</div>' : '') + bar()
      + '<div class="grid noprint"><div class="tile"><b>' + km(tot) + ' km</b><span>Total run (' + L.length + ' days)</span></div><div class="tile r"><b>' + L.filter(r => r.end_km == null).length + '</b><span>Close meter missing</span></div>'
      + '<div class="tile a"><b>' + L.filter(r => r.start_src === 'corrected' || r.end_src === 'corrected').length + '</b><span>Typed number differs from photo (check)</span></div><div class="tile"><b>' + L.filter(r => r.start_src === 'manual' || r.end_src === 'manual').length + '</b><span>Manual (admin)</span></div>'
      + '<div class="tile r"><b>' + L.filter(r => r.start_src === 'typed' || r.end_src === 'typed').length + '</b><span>Typed, no photo</span></div></div>';
    h += Object.keys(byRep).sort().map(n => {
      const rs = byRep[n].sort((a, b) => a.day.localeCompare(b.day) || a.vehicle.localeCompare(b.vehicle)), t = rs.reduce((s, r) => s + (r.end_km != null && r.start_km != null ? r.end_km - r.start_km : 0), 0);
      return '<div class="card" style="margin-top:12px"><h3>' + esc(n) + '</h3><div class="hint">' + rs.length + ' days · ' + km(t) + ' km run</div><div class="wrap" style="box-shadow:none"><table><thead><tr><th>Date</th><th>Vehicle</th><th class="n">Start km</th><th>Start</th><th class="n">Close km</th><th>Close</th><th class="n">Km run</th><th class="n">Gap from last close</th><th class="noprint">Photos</th></tr></thead><tbody>'
        + rs.map(r => { const g = gapOf(r), run = r.end_km != null && r.start_km != null ? r.end_km - r.start_km : null;
          return '<tr><td>' + esc(r.day) + '</td><td>' + esc(r.vehicle || '') + '</td><td class="n"><b>' + km(r.start_km) + '</b></td><td>' + (r.start_at ? esc(fmtT(new Date(r.start_at))) + ' ' : '') + srcTag(r.start_src) + '</td>'
            + '<td class="n"><b>' + km(r.end_km) + '</b></td><td>' + (r.end_at ? esc(fmtT(new Date(r.end_at))) + ' ' : (r.end_km == null ? '<span class="tag t-r">missing</span>' : '')) + srcTag(r.end_src) + '</td>'
            + '<td class="n"><b>' + (run != null ? km(run) : '') + '</b></td><td class="n">' + (g ? '<span class="tag ' + (g > 0 ? 't-a' : 't-r') + '">' + km(g) + ' km</span>' : (g === 0 ? '0' : '')) + '</td>'
            + '<td class="noprint">' + (r.start_photo ? '<a data-rcph="' + esc(r.start_photo) + '">start</a> ' : '') + (r.end_photo ? '<a data-rcph="' + esc(r.end_photo) + '">close</a>' : '') + '</td></tr>'; }).join('')
        + '</tbody><tfoot><tr class="tot"><td colspan="6"><b>Total</b></td><td class="n"><b>' + km(t) + '</b></td><td colspan="2"></td></tr></tfoot></table></div>' + (rs.some(r => r.note) ? '<div class="hint">Notes: ' + rs.filter(r => r.note).map(r => esc(r.day + ': ' + r.note)).join(' · ') + '</div>' : '') + '</div>';
    }).join('') || '<div class="card" style="margin-top:12px"><div class="hint">No running chart in this period.</div></div>';
    $('page').innerHTML = h;
  }
  async function photo(path) {
    $('panel').innerHTML = '<div class="dh"><div><h3>Meter photo</h3><div class="hint">' + esc(path.split('/').pop()) + '</div></div><button class="btn" data-rc="close">Close</button></div><div class="frm"><div id="rcPh" class="hint">Loading...</div></div>'; $('panel').classList.add('open');
    try {
      const r = await fetch(URL_ + '/storage/v1/object/sign/meter-photos/' + path, {method: 'POST', headers: {apikey: KEY, Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'application/json'}, body: JSON.stringify({expiresIn: 600})});
      const j = await r.json(); if (!r.ok) throw new Error(j.message || j.error || 'HTTP ' + r.status);
      $('rcPh').innerHTML = '<img src="' + esc(URL_ + '/storage/v1' + j.signedURL) + '" alt="meter photo" style="width:100%;border-radius:8px">';
    } catch (e) { $('rcPh').textContent = e.message; }
  }
  async function manualDrawer() {
    if (!R.people) { try { R.people = await api('/rest/v1/rpc/fu_people', {method: 'POST', body: {}}) || []; } catch (e) { R.people = []; } }
    $('panel').innerHTML = '<div class="dh"><div><h3>Manual entry (admin)</h3><div class="hint">For a phone whose camera does not work. Saved as "Manual (admin)" with your name.</div></div><button class="btn" data-rc="close">Close</button></div><div class="frm">'
      + '<label>Rep</label><select id="mRep"><option value="">Choose</option>' + R.people.map(p => '<option value="' + p.id + '">' + esc(p.full_name + (p.job_title ? ' · ' + p.job_title : '')) + '</option>').join('') + '</select>'
      + '<label>Operation</label><select id="mOp">' + repOps().map(o => '<option value="' + o.code + '"' + (o.code === op ? ' selected' : '') + '>' + esc(o.code + ' - ' + o.name) + '</option>').join('') + '</select>'
      + '<label>Date</label><input type="date" id="mDay" value="' + today() + '" max="' + today() + '"><label>Vehicle no</label><input id="mVeh" maxlength="20">'
      + '<label>Start meter (km)</label><input id="mStart" inputmode="numeric"><label>Close meter (km)</label><input id="mEnd" inputmode="numeric">'
      + '<label>Note (needed if the start is lower than the last close)</label><input id="mNote" maxlength="200" placeholder="e.g. camera broken, reading from the rep by phone">'
      + '<div class="row2"><button class="btn p" data-rc="msave">Save</button><button class="btn" data-rc="close">Cancel</button></div><div class="err" id="mErr"></div></div>';
    $('panel').classList.add('open');
  }
  async function manualSave() {
    const v = id => $(id).value.trim(), n = id => v(id) ? Number(v(id).replace(/\D/g, '')) : null;
    if (!v('mRep')) { $('mErr').textContent = 'Choose the rep'; return; }
    const s = n('mStart'), e = n('mEnd'); if (s == null && e == null) { $('mErr').textContent = 'Type the start and / or close meter'; return; }
    const base = {p_op: v('mOp'), p_day: v('mDay'), p_ocr: null, p_photo: null, p_src: 'manual', p_vehicle: v('mVeh'), p_rep: v('mRep'), p_note: v('mNote') || null};
    try {
      if (s != null) await api('/rest/v1/rpc/fu_run_meter', {method: 'POST', body: Object.assign({}, base, {p_kind: 'start', p_km: s})});
      if (e != null) await api('/rest/v1/rpc/fu_run_meter', {method: 'POST', body: Object.assign({}, base, {p_kind: 'end', p_km: e})});
      closeDrawer(); R.key = ''; await loadRunsToday(); go(); toast('Saved (manual, admin)');
    } catch (er) { $('mErr').textContent = er.message; }
  }
  function csv() {
    const q = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
    const cols = ['Date', 'Rep', 'Operation', 'Vehicle', 'Start km', 'Start time', 'Start source', 'Close km', 'Close time', 'Close source', 'Km run', 'Gap from last close', 'Note'];
    const L = shown().slice().sort((a, b) => (a.rep_name || '').localeCompare(b.rep_name || '') || a.day.localeCompare(b.day)).map(r => [r.day, r.rep_name, r.operation, r.vehicle, r.start_km, r.start_at ? fmtT(new Date(r.start_at)) : '', SRC[r.start_src] || '', r.end_km, r.end_at ? fmtT(new Date(r.end_at)) : '', SRC[r.end_src] || '', r.start_km != null && r.end_km != null ? r.end_km - r.start_km : '', gapOf(r), r.note]);
    const t = '﻿' + cols.map(q).join(',') + '\r\n' + L.map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], {type: 'text/csv'})); a.download = 'Running Chart ' + R.from + ' to ' + R.to + (R.rep ? ' ' + R.rep : '') + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }
  function card(m) { return '<div class="card mcard" data-mod="runs" data-go="items"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div></div>'; }
  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {runs: {items: list, dash: list, report: list, card}});

  document.addEventListener('click', e => {
    const p = e.target.closest('[data-rcph]'); if (p) { photo(p.dataset.rcph); return; }
    const rr = e.target.closest('[data-rcr]'); if (rr) { [R.from, R.to] = range(rr.dataset.rcr); go(); return; }
    const b = e.target.closest('[data-rc]'); if (!b || b.disabled) return;
    const k = b.dataset.rc;
    if (k === 'meter') openMeter(b.dataset.kind === 'end' ? 'end' : 'start');
    else if (k === 'cam' || k === 'gal') pickFile(k === 'cam');
    else if (k === 'close') { R.pend = null; closeDrawer(); }
    else if (k === 'save') guard(save);
    else if (k === 'manual') manualDrawer();
    else if (k === 'msave') guard(manualSave);
    else if (k === 'csv') csv();
    else if (k === 'print') window.print();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'rcFile' && t.files && t.files[0]) onPhoto(t.files[0]);
    else if (t.id === 'rcVeh') { veh = t.value.trim(); try { localStorage.setItem('fu_vehicle', veh); } catch (er) {} }
    else if (t.id === 'rcFrom' || t.id === 'rcTo') { R.from = $('rcFrom').value || R.from; R.to = $('rcTo').value || R.to; if (R.to < R.from) R.to = R.from; go(); }
    else if (t.id === 'rcRep') { R.rep = t.value; go(); }
  });
})();
