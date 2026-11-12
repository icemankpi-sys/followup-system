// Iceman IMS - Rep Team (v4.0, 2026-11-07, Oshan): for Admin, Operation Heads and the Director.
//   Team     : reps of the operation (add / edit / active), outlets assigned to each rep with a weekly beat plan, today's status.
//   Rep Day  : one rep, one day: meter, check-ins, GPS route (Android app), stops away from outlets, planned outlets not visited, on a map.
//   Coverage : for a period, per rep: assigned outlets visited, visits, days worked, km, and outlets not visited for 14+ days.
// Changes (add rep, assign outlets) need Outstanding edit or Rep Team edit on the operation (Supabase/31 + 33); others read only.
// Rep app logins (make, reset password, switch off) need Rep Team Full or Admin (edge function admin-users, Supabase/33).
// Loaded before the main script; uses its globals at run time (api, $, esc, money0, rows, op, ops, me, lvl, rank, isActive, sum, isO120,
// go, toast, closeDrawer, guard, CO, ck, loadContacts, nk, page).
(function () {
  const T = {reps: [], runs: [], visits: [], pts: [], stays: [], users: {}, rep: '', day: '', per: 'week', cov: null, timer: null, map: null, pick: {}, f: '', fMode: 'all', days: null, err: ''};
  const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
  const DKEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const pad = n => String(n).padStart(2, '0'), ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  const dStart = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addD = (s, n) => { const d = dStart(s); d.setDate(d.getDate() + n); return ymd(d); };
  const hm = t => { if (!t) return ''; const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const mins = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  const dur = m => m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min';
  const dist = (a, b, c, d) => { const R = 6371000, r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const kmf = m => (m / 1000).toLocaleString('en-US', {maximumFractionDigits: 1});
  const gmap = (la, ln) => 'https://www.google.com/maps?q=' + la + ',' + ln;
  // Rep Team access (module 'team', 2026-11-10): View = see, Edit = add reps / outlets and assign, Full = also make rep app logins
  const myOps = () => ops.filter(o => me.role === 'admin' || rank(lvl(o.code, 'receivable')) > 0 || rank(lvl(o.code, 'team')) > 0);
  const canEdit = o => me.role === 'admin' || rank(lvl(o, 'receivable')) >= 2 || rank(lvl(o, 'team')) >= 2;
  const canAcct = o => me.role === 'admin' || rank(lvl(o, 'team')) >= 3;
  const acctOf = r => (T.accts || []).find(a => (a.operations || []).includes(r.op) && nk(a.rep_name) === nk(r.name));
  const opNow = () => op || (myOps().length === 1 ? myOps()[0].code : '');
  const inOp = o => !op || o === op;
  window.canTeam = () => !!me && (me.role === 'admin' || myOps().length > 0);
  window.teamCanEdit = () => !!me && myOps().some(o => canEdit(o.code));   // Sales Reps screen shows + Add rep / Assign outlets with this

  // ---------- data ----------
  function outletsAll() {
    // saved profiles plus outlets that appear on invoices; rep = assigned rep (profile) or, if none, the invoice rep
    const m = {};
    Object.values(CO || {}).forEach(p => { if (inOp(p.operation)) m[p.operation + '|' + p.outlet_key] = {op: p.operation, key: p.outlet_key, outlet: p.outlet, chain: p.chain, prof: p, inv: '', bal: 0, n: 0}; });
    rows.filter(r => isActive(r) && inOp(r.operation)).forEach(r => {
      const k = r.operation + '|' + nk(r.outlet);
      const x = m[k] = m[k] || {op: r.operation, key: nk(r.outlet), outlet: (r.outlet || '').trim(), chain: r.party, prof: null, inv: '', bal: 0, n: 0};
      x.inv = x.inv || (r.owner_name || '').trim(); x.bal += Number(r.amount || 0); x.n++;
    });
    return Object.values(m).map(x => Object.assign(x, {rep: (x.prof && x.prof.rep) || '', days: (x.prof && x.prof.visit_days) || [], loc: !!(x.prof && x.prof.lat != null)}));
  }
  const repOf = x => x.rep || x.inv;
  function repList() {
    const m = {}, add = (o, n, extra) => { const k = o + '|' + nk(n); if (!nk(n) || !inOp(o)) return; m[k] = Object.assign(m[k] || {op: o, name: n.trim(), phone: '', area: '', active: true, saved: false}, extra || {}); };
    T.reps.forEach(r => add(r.operation, r.rep_name, {phone: r.phone || '', area: r.area || '', active: r.active !== false, saved: true}));
    rows.filter(r => isActive(r)).forEach(r => add(r.operation, r.owner_name || ''));
    Object.values(CO || {}).forEach(p => p.rep && add(p.operation, p.rep));
    return Object.values(m).sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
  }
  async function loadTeam() {
    const o = op ? '&operation=eq.' + encodeURIComponent(op) : '', a = encodeURIComponent(dStart(today()).toISOString());
    const [reps, runs, vis, pts, hist] = await Promise.all([
      api('/rest/v1/fu_reps?select=*' + o).catch(() => []),
      api('/rest/v1/fu_runs?day=eq.' + today() + o + '&select=*').catch(() => []),
      fetchAll('/rest/v1/fu_visits?started_at=gte.' + a + o + '&order=started_at.asc,id&select=*').catch(() => []),
      fetchAll('/rest/v1/fu_track_points?recorded_at=gte.' + a + o + '&order=recorded_at.desc,id&select=rep_user,recorded_at,battery').catch(() => []),
      fetchAll('/rest/v1/fu_runs?day=gte.' + addD(today(), -60) + o + '&order=id&select=rep_user,rep_name').catch(() => [])]);
    T.accts = myOps().some(x => canAcct(x.code)) ? ((await fn({action: 'rep_accounts'}).catch(() => null)) || {}).reps || [] : [];
    T.reps = reps || []; T.runs = runs || []; T.visits = vis || []; T.pts = pts || [];
    (hist || []).concat(T.runs).concat(T.visits).forEach(r => { if (r.rep_user && r.rep_name) T.users[nk(r.rep_name)] = r.rep_user; });
  }
  async function run(fn) {
    $('page').innerHTML = '<div class="hint">Loading...</div>';
    try { await fn(); } catch (e) { $('page').innerHTML = '<div class="card err">Could not load: ' + esc(e.message) + '</div>'; }
  }

  // ---------- Team ----------
  async function team() {
    await loadTeam();
    const outs = outletsAll(), reps = repList(), dk = DKEY[new Date().getDay()];
    const card = r => {
      const mine = outs.filter(x => x.op === r.op && nk(repOf(x)) === nk(r.name)), asg = mine.filter(x => nk(x.rep) === nk(r.name));
      const plan = asg.filter(x => x.days.includes(dk)), vis = T.visits.filter(v => v.operation === r.op && nk(v.rep_name) === nk(r.name));
      const done = new Set(vis.map(v => v.outlet_key)), planDone = plan.filter(x => done.has(x.key)).length;
      const rn = T.runs.find(x => x.operation === r.op && nk(x.rep_name) === nk(r.name)), uid = T.users[nk(r.name)], lp = uid && T.pts.find(p => p.rep_user === uid);
      const st = rn && rn.start_km != null && rn.end_km == null ? '<span class="tag t-g">On duty since ' + hm(rn.start_at) + '</span>' : rn && rn.end_km != null ? '<span class="tag t-b">Day closed ' + hm(rn.end_at) + ' · ' + (rn.end_km - rn.start_km) + ' km</span>' : '<span class="tag t-a">No start meter today</span>';
      const last = vis.length ? vis[vis.length - 1] : null;
      return '<div class="card tmc' + (r.active ? '' : ' off') + '"><div class="tmh"><span class="tav">' + esc(window.imsInitials ? imsInitials(r.name) : r.name[0]) + '</span><div style="flex:1;min-width:0"><b>' + esc(r.name) + '</b>' + (r.active ? '' : ' <span class="tag t-b">inactive</span>')
        + '<div class="hint">' + esc(r.op) + (r.area ? ' · ' + esc(r.area) : '') + (r.phone ? ' · ' + esc(r.phone) : '') + '</div></div></div>'
        + '<div class="row2" style="margin:6px 0">' + st + (lp ? '<span class="tag t-g">GPS ' + hm(lp.recorded_at) + (lp.battery != null ? ' · ' + lp.battery + '%' : '') + '</span>' : '') + '</div>'
        + '<div class="tmg"><div><b>' + asg.length + '</b><span>assigned outlets</span></div><div><b>' + mine.filter(x => x.bal > 0).length + '</b><span>with outstanding</span></div>'
        + '<div><b>' + vis.length + '</b><span>visits today</span></div><div><b>' + planDone + ' / ' + plan.length + '</b><span>today\'s beat done</span></div></div>'
        + (last ? '<div class="hint" style="margin-top:6px">Last check-in ' + hm(last.started_at) + ' · ' + esc(last.outlet || last.outlet_key) + '</div>' : '')
        + (canAcct(r.op) ? (acctOf(r) ? '<div class="hint" style="margin-top:6px">App login <span class="pm-un">@' + esc(acctOf(r).username) + '</span>' + (acctOf(r).active ? '' : ' <span class="tag t-b">switched off</span>') + '</div>' : '<div class="hint" style="margin-top:6px">No app login yet</div>') : '')
        + '<div class="row2" style="margin-top:8px"><button class="btn p" data-tm="day" data-op="' + esc(r.op) + '" data-n="' + esc(r.name) + '">Rep Day</button>'
        + (canEdit(r.op) ? '<button class="btn" data-tm="assign" data-op="' + esc(r.op) + '" data-n="' + esc(r.name) + '">Assign outlets</button><button class="btn" data-tm="edit" data-op="' + esc(r.op) + '" data-n="' + esc(r.name) + '">Edit</button>' : '') + (canAcct(r.op) ? '<button class="btn" data-tm="login" data-op="' + esc(r.op) + '" data-n="' + esc(r.name) + '">' + (acctOf(r) ? 'App login' : '+ App login') + '</button>' : '') + (canAcct(r.op) && !acctOf(r) ? '<button class="btn" data-tm="link" data-op="' + esc(r.op) + '" data-n="' + esc(r.name) + '">Link existing user</button>' : '') + '</div></div>';
    };
    const unas = outs.filter(x => !x.rep);
    const anyEdit = myOps().some(o => canEdit(o.code)), anyAcct = myOps().some(o => canAcct(o.code));
    $('page').innerHTML = '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">Rep Team</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' · ' + reps.filter(r => r.active).length + ' active reps · ' + outs.length + ' outlets · ' + unas.length + ' without an assigned rep</div></div>'
      + (anyEdit || anyAcct ? '<div class="row2">' + (anyEdit ? '<button class="btn p" data-tm="add">+ Add rep</button><button class="btn" data-tm="assign" data-op="' + esc(opNow()) + '" data-n="">Assign outlets</button>' : '') + (anyAcct ? '<button class="btn" data-tm="link" data-op="' + esc(opNow()) + '" data-n="">Link existing user</button>' : '') + '</div>' : '') + '</div>'
      + '<div class="grid"><div class="tile"><b>' + reps.filter(r => r.active).length + '</b><span>Active reps</span></div><div class="tile g"><b>' + T.runs.filter(r => r.start_km != null && r.end_km == null).length + '</b><span>On duty now</span></div>'
      + '<div class="tile"><b>' + T.visits.length + '</b><span>Check-ins today</span></div><div class="tile a"><b>' + unas.length + '</b><span>Outlets with no assigned rep</span></div></div>'
      + (reps.length ? '<div class="tmlist">' + reps.map(card).join('') + '</div>' : '<div class="card hint">No reps yet for this operation. Press "+ Add rep".</div>');
  }

  // ---------- add / edit rep ----------
  function repForm(r) {
    const eo = myOps().filter(o => canEdit(o.code));
    $('panel').innerHTML = '<div class="dh"><div><h3>' + (r ? 'Edit rep' : 'Add rep') + '</h3><div class="hint">The name must match the rep name on the outstanding list and the app account (Permission → rep name).</div></div><button class="btn" data-tm="close">Close</button></div><div class="frm">'
      + '<label>Operation</label><select id="tmOp"' + (r ? ' disabled' : '') + '>' + eo.map(o => '<option value="' + o.code + '"' + ((r ? r.op : opNow()) === o.code ? ' selected' : '') + '>' + esc(o.code + ' - ' + o.name) + '</option>').join('') + '</select>'
      + '<label>Rep name</label>' + (r ? '' : '<select id="tmPick"></select><div class="hint" id="tmPickHint">Pick a rep who is already on the list so no second profile is made. Choose "+ New rep" only for a rep who is not on the list.</div>')
      + '<input id="tmName" maxlength="80" value="' + esc(r ? r.name : '') + '"' + (r ? ' disabled' : ' hidden') + ' placeholder="New rep name, e.g. Kasun Perera">'
      + '<label>Phone</label><input id="tmPhone" maxlength="40" value="' + esc(r ? r.phone : '') + '" placeholder="07x xxx xxxx">'
      + '<label>Area / route</label><input id="tmArea" maxlength="80" value="' + esc(r ? r.area : '') + '" placeholder="e.g. Kandana - Ja-Ela - Seeduwa">'
      + (r ? '<label><input type="checkbox" id="tmAct" style="width:auto"' + (r.active ? ' checked' : '') + '> Active (untick when the rep leaves; history stays)</label>' : '')
      + (!r && eo.some(o => canAcct(o.code)) ? '<div class="card" id="tmLg" style="margin-top:10px;background:var(--surface2)"><b>App login for the rep (optional)</b><div class="hint">Fill these to give the rep a login for the phone app now. The rep only gets Sales Reps access on this operation. Leave empty to add the login later.</div>' + loginFields() + '</div>' : '')
      + '<div class="err" id="tmErr"></div><div class="row2"><button class="btn p" data-tm="saverep">Save</button></div></div>';
    $('panel').dataset.rep = r ? r.op + '|' + r.name : ''; $('panel').classList.add('open');
    if (!r) { fillPick(); $('tmOp').onchange = fillPick; $('tmPick').onchange = pickRep; $('tmName').oninput = warnSame; }
  }
  // Add rep: existing reps of the operation in a drop-down, so a rep already on the list is not added twice
  function fillPick() {
    const o = $('tmOp').value, list = repList().filter(x => x.op === o);
    $('tmPick').innerHTML = '<option value="">-- Select the rep --</option>'
      + list.map(x => '<option value="' + esc(x.name) + '">' + esc(x.name) + (x.active ? '' : ' (inactive)') + (acctOf(x) ? ' · has app login' : '') + (x.saved ? '' : ' · from outstanding list') + '</option>').join('')
      + '<option value="__new">+ New rep (not on the list)</option>';
    pickRep();
  }
  function pickRep() {
    const v = $('tmPick').value, x = v && v !== '__new' ? repList().find(y => y.op === $('tmOp').value && y.name === v) : null;
    $('tmName').hidden = v !== '__new'; $('tmName').value = x ? x.name : ''; $('tmErr').textContent = '';
    $('tmPhone').value = x ? x.phone : ''; $('tmArea').value = x ? x.area : '';
    const has = x && acctOf(x);
    if ($('tmLg')) { $('tmLg').hidden = !!has; }
    $('tmPickHint').textContent = has ? x.name + ' already has an app login (@' + has.username + '). Saving updates the phone and route only; use "App login" on the rep card to reset the password.'
      : x ? 'Saving updates ' + x.name + "'s profile (no new profile is made)" + (x.saved ? '.' : ' and adds the rep to Rep Team.')
      : 'Pick a rep who is already on the list so no second profile is made. Choose "+ New rep" only for a rep who is not on the list.';
    if (v === '__new') $('tmName').focus();
  }
  // Guard (2026-11-12): a rep name typed by hand must not be a rep of another operation, and must not be an existing name with extra words
  // (a login was made on MT for an MTH rep as "S.Pradeep Rangana form outstanding list", so the rep saw nothing).
  const allRepNames = () => {
    const m = {}, add = (o, n) => { const k = nk(n); if (!k || !String(n).trim()) return; (m[k] = m[k] || {name: String(n).trim(), ops: new Set()}).ops.add(o); };
    rows.forEach(r => add(r.operation, r.owner_name || '')); Object.values(CO || {}).forEach(p => p.rep && add(p.operation, p.rep)); T.reps.forEach(r => add(r.operation, r.rep_name));
    return Object.values(m);
  };
  function nameClash(o, n) {
    const k = nk(n); if (!k) return '';
    const all = allRepNames(), same = all.find(x => nk(x.name) === k);
    if (same && !same.ops.has(o)) return same.name + ' is a rep on ' + [...same.ops].join(', ') + ', not on ' + o + '. Change the Operation to ' + [...same.ops][0] + ' and pick the name from the list.';
    const part = all.find(x => nk(x.name) !== k && nk(x.name).length >= 6 && k.includes(nk(x.name)));
    if (part) return 'This looks like "' + part.name + '" (' + [...part.ops].join(', ') + ') with extra words. ' + (part.ops.has(o) ? 'Pick that name from the list' : 'Change the Operation to ' + [...part.ops][0] + ' and pick that name from the list') + '; write only the rep name.';
    return '';
  }
  window.imsRepNameClash = nameClash; window.imsRepNames = allRepNames;   // the Permission page uses the same guard
  function warnSame() {
    const n = nk($('tmName').value), same = n && repList().find(y => y.op === $('tmOp').value && nk(y.name) === n);
    $('tmErr').textContent = same ? same.name + ' is already on the list. Pick the name from the drop-down instead.' : nameClash($('tmOp').value, $('tmName').value);
  }
  async function saveRep() {
    const k = $('panel').dataset.rep, r = k ? repList().find(x => x.op + '|' + x.name === k) : null;
    if (!r && !$('tmPick').value) { $('tmErr').textContent = 'Select the rep from the list, or choose "+ New rep"'; return; }
    const o = r ? r.op : $('tmOp').value, n = r ? r.name : $('tmName').value.trim().replace(/\s+/g, ' ');
    if (!n) { $('tmErr').textContent = 'Write the rep name'; return; }
    if (!r && $('tmPick').value === '__new') {
      const same = repList().find(y => y.op === o && nk(y.name) === nk(n));
      if (same) { $('tmErr').textContent = same.name + ' is already on the list. Pick the name from the drop-down instead.'; return; }
      const cl = nameClash(o, n); if (cl) { $('tmErr').textContent = cl; return; }
    }
    // keep the saved row's key (lists loaded by SQL use lower(name), older app saves used nk(name)) so no second row is made
    const old = T.reps.find(x => x.operation === o && nk(x.rep_name) === nk(n));
    const body = {operation: o, rep_key: old ? old.rep_key : n.toLowerCase(), rep_name: n, phone: $('tmPhone').value.trim() || null, area: $('tmArea').value.trim() || null, active: r ? $('tmAct').checked : true};
    const lg = !r && $('lgUser') ? readLogin() : null;
    if (lg && lg.err) { $('tmErr').textContent = lg.err; return; }
    if (lg && !canAcct(o)) { $('tmErr').textContent = 'You cannot make app logins for ' + o + '. Leave the login empty or ask the Admin.'; return; }
    try { await api('/rest/v1/fu_reps?on_conflict=operation,rep_key', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body}); }
    catch (e) { $('tmErr').textContent = /column/.test(e.message) ? 'The database needs Supabase/31 rep team.sql first. ' + e.message : e.message; return; }
    if (lg) {
      try { await fn({action: 'create_rep', operation: o, username: lg.user, password: lg.pass, full_name: n, rep_name: n, new_rep: true}); }
      catch (e) { $('tmErr').textContent = 'Rep saved, but the login was not made: ' + e.message; return; }
      // create_rep also writes a fu_reps row keyed lower(name); remove it when the existing profile has another key
      if (old && old.rep_key !== n.toLowerCase()) await api('/rest/v1/fu_reps?operation=eq.' + encodeURIComponent(o) + '&rep_key=eq.' + encodeURIComponent(n.toLowerCase()), {method: 'DELETE', headers: {Prefer: 'return=minimal'}}).catch(() => {});
    }
    closeDrawer(); toast('Rep saved: ' + n + (lg ? ' · login @' + lg.user + ' made. Give the rep the username and password.' : '')); go();
  }

  // ---------- rep app login (Rep Team Full or Admin) ----------
  const genPass = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const a = new Uint32Array(10); crypto.getRandomValues(a); a.forEach(v => s += c[v % c.length]); return s; };
  function loginFields(user) {
    return '<label>Username</label><input id="lgUser" maxlength="60" autocomplete="off" value="' + esc(user || '') + '" placeholder="e.g. kasun.p (letters, numbers, dot)">'
      + '<label>Password</label><div class="row2"><input id="lgPass" maxlength="60" autocomplete="new-password" style="flex:1" placeholder="at least 8 characters"><button type="button" class="btn q" data-tm="genpass">Make one</button></div>'
      + '<div class="hint">The rep signs in with this username and password. Write them down and give them to the rep; the password is not shown again.</div>';
  }
  function readLogin() {
    const u = ($('lgUser').value || '').trim().toLowerCase(), p = $('lgPass').value || '';
    if (!u && !p) return null;
    if (!/^[a-z0-9._@-]{3,60}$/.test(u)) return {err: 'Username: 3 to 60 letters, numbers, dot, dash or underscore (no spaces).'};
    if (p.length < 8) return {err: 'The password needs at least 8 characters (press "Make one").'};
    return {user: u, pass: p};
  }
  const suggestUser = n => String(n || '').toLowerCase().replace(/[^a-z0-9 .]/g, '').trim().split(/[\s.]+/).filter(Boolean).slice(-2).join('.');
  function loginForm(r) {
    const a = acctOf(r);
    $('panel').innerHTML = '<div class="dh"><div><h3>App login · ' + esc(r.name) + '</h3><div class="hint">' + esc(r.op) + (a ? ' · login <b>@' + esc(a.username) + '</b>' + (a.active ? '' : ' (switched off)') : ' · no login yet') + '</div></div><button class="btn" data-tm="close">Close</button></div><div class="frm">'
      + (a ? '<b>Reset password</b>' + '<label>New password</label><div class="row2"><input id="lgPass" maxlength="60" autocomplete="new-password" style="flex:1" placeholder="at least 8 characters"><button type="button" class="btn q" data-tm="genpass">Make one</button></div>'
          + '<div class="err" id="tmErr"></div><div class="row2"><button class="btn p" data-tm="lgreset">Save new password</button></div>'
          + '<div class="card" style="margin-top:12px;background:var(--surface2)"><b>' + (a.active ? 'Switch the login off' : 'Switch the login on again') + '</b><div class="hint">' + (a.active ? 'Use this when the rep leaves. The rep can no longer sign in; the history stays.' : 'The rep can sign in again with the same username.') + '</div>'
          + '<label><input type="checkbox" id="lgSure" style="width:auto"> Yes, ' + (a.active ? 'switch it off' : 'switch it on') + '</label><div class="row2"><button class="btn" data-tm="lgactive" data-on="' + (a.active ? '0' : '1') + '">' + (a.active ? 'Switch off' : 'Switch on') + '</button></div></div>'
        : '<div class="hint">Make a phone app login for this rep. The rep gets Sales Reps access on ' + esc(r.op) + ' only, and the rep name is set to "' + esc(r.name) + '" so their outstanding and outlets show up.</div>'
          + loginFields(suggestUser(r.name)) + '<div class="err" id="tmErr"></div><div class="row2"><button class="btn p" data-tm="lgcreate">Make login</button></div>')
      + '</div>';
    $('panel').dataset.rep = r.op + '|' + r.name; $('panel').classList.add('open');
  }
  const panelRep = () => { const k = $('panel').dataset.rep; return repList().find(x => x.op + '|' + x.name === k); };
  async function lgCreate() {
    const r = panelRep(), lg = readLogin();
    if (!lg) { $('tmErr').textContent = 'Write a username and a password.'; return; }
    if (lg.err) { $('tmErr').textContent = lg.err; return; }
    try { await fn({action: 'create_rep', operation: r.op, username: lg.user, password: lg.pass, full_name: r.name, rep_name: r.name, new_rep: true}); closeDrawer(); toast('Login @' + lg.user + ' made for ' + r.name + '. Give the rep the username and password.'); go(); }
    catch (e) { $('tmErr').textContent = e.message; }
  }
  async function lgReset() {
    const r = panelRep(), a = acctOf(r), p = $('lgPass').value || '';
    if (p.length < 8) { $('tmErr').textContent = 'The password needs at least 8 characters (press "Make one").'; return; }
    try { await fn({action: 'rep_password', id: a.id, password: p}); closeDrawer(); toast('New password saved for @' + a.username + '. Give it to the rep.'); }
    catch (e) { $('tmErr').textContent = e.message; }
  }
  async function lgActive(on) {
    const r = panelRep(), a = acctOf(r);
    if (!$('lgSure').checked) { $('lgSure').closest('label').style.color = 'var(--danger)'; return; }
    try { await fn({action: 'rep_active', id: a.id, active: on}); closeDrawer(); toast('Login @' + a.username + (on ? ' switched on' : ' switched off')); go(); }
    catch (e) { const er = $('tmErr'); if (er) er.textContent = e.message; else toast(e.message); }
  }

  // ---------- link an existing user as a rep (Rep Team Full or Admin; edge function actions rep_find / grant_rep, 2026-11-11) ----------
  const lkNames = o => repList().filter(r => r.op === o && r.active).map(r => '<option value="' + esc(r.name) + '">').join('');
  function linkForm(o, name) {
    const ao = myOps().filter(x => canAcct(x.code)); if (!ao.length) return;
    const o0 = ao.some(x => x.code === o) ? o : (ao.some(x => x.code === opNow()) ? opNow() : ao[0].code);
    T.lk = {sel: ''};
    $('panel').innerHTML = '<div class="dh"><div><h3>Link an existing user</h3><div class="hint">Give a user who already has a login Sales Reps access on your operation and link them to their rep name. Only users with no other access can be linked. The rep sees only their own outstanding.</div></div><button class="btn" data-tm="close">Close</button></div><div class="frm">'
      + '<label>Operation</label><select id="lkOp">' + ao.map(x => '<option value="' + x.code + '"' + (x.code === o0 ? ' selected' : '') + '>' + esc(x.code + ' - ' + x.name) + '</option>').join('') + '</select>'
      + '<label>Find the user (name or username)</label><input id="lkQ" maxlength="60" autocomplete="off" placeholder="type 2 letters or more">'
      + '<div id="lkRes" class="talist" style="max-height:30vh"><div class="hint" style="padding:8px">Type a name to search.</div></div>'
      + '<label>Rep name (as on the outstanding list)</label><input id="lkName" maxlength="80" list="lkReps" autocomplete="off" value="' + esc(name || '') + '" placeholder="pick or write the rep name"><datalist id="lkReps">' + lkNames(o0) + '</datalist>'
      + '<div class="err" id="tmErr"></div><div class="row2"><button class="btn p" data-tm="lkgo">Give access</button></div></div>';
    $('panel').classList.add('open');
  }
  async function lkFind() {
    const q = ($('lkQ').value || '').trim(), box = $('lkRes'); if (!box) return;
    if (q.length < 2) { box.innerHTML = '<div class="hint" style="padding:8px">Type a name to search.</div>'; return; }
    try {
      const r = await fn({action: 'rep_find', q}); if (($('lkQ').value || '').trim() !== q) return;
      const u = (r && r.users) || []; T.lk.sel = '';
      box.innerHTML = u.length ? u.map(x => '<label class="tar"><input type="radio" name="lkU" value="' + esc(x.id) + '" data-rn="' + esc(x.rep_name || '') + '" style="width:auto"><span style="flex:1;min-width:0"><b>' + esc(x.full_name || x.username || '') + '</b><br><span class="hint">@' + esc(x.username || '') + (x.rep_name ? ' · rep name ' + esc(x.rep_name) : '') + (x.operations && x.operations.length ? ' · already a rep on ' + esc(x.operations.join(', ')) : '') + '</span></span></label>').join('')
        : '<div class="hint" style="padding:8px">No user found. Only active users with no access (or only Sales Reps access) are shown. Ask the Admin for anyone else.</div>';
    } catch (e) { box.innerHTML = '<div class="err" style="padding:8px">' + esc(e.message) + '</div>'; }
  }
  async function lkGo() {
    const o = $('lkOp').value, id = T.lk && T.lk.sel, n = ($('lkName').value || '').trim().replace(/\s+/g, ' '), er = $('tmErr');
    if (!id) { er.textContent = 'Search and select the user first.'; return; }
    if (!n) { er.textContent = 'Write the rep name (as on the outstanding list).'; return; }
    const known = repList().find(x => x.op === o && nk(x.name) === nk(n));
    if (!known) { er.textContent = nameClash(o, n) || 'No rep named "' + n + '" on the list of ' + o + '. Pick the name from the list, or add the rep first with "+ Add rep".'; return; }
    try { await fn({action: 'grant_rep', id, operation: o, rep_name: known.name, new_rep: true}); closeDrawer(); toast('Sales Reps access given on ' + o + ' for ' + n + '. Ask the rep to sign out and sign in again.'); go(); }
    catch (e) { er.textContent = e.message; }
  }

  // ---------- assign outlets ----------
  function assignForm(o, name) {
    T.aOp = o || opNow() || (myOps().find(x => canEdit(x.code)) || {}).code || ''; T.aRep = name || ''; T.pick = {}; T.f = ''; T.fMode = name ? 'mine' : 'unassigned'; T.days = null;
    paintAssign(); $('panel').classList.add('open');
  }
  function paintAssign(msg) {
    const save = op; op = T.aOp; const outs = outletsAll(); op = save;
    const reps = repList().filter(r => r.op === T.aOp && r.active), t = T.f.toLowerCase();
    const L = outs.filter(x => (T.fMode === 'all' || (T.fMode === 'unassigned' ? !x.rep : T.fMode === 'mine' ? nk(repOf(x)) === nk(T.aRep) : nk(x.rep) !== nk(T.aRep)))
      && (!t || [x.outlet, x.chain, repOf(x)].some(v => String(v || '').toLowerCase().includes(t)))).sort((a, b) => a.outlet.localeCompare(b.outlet));
    const n = Object.keys(T.pick).length;
    $('panel').innerHTML = '<div class="dh"><div><h3>Assign outlets</h3><div class="hint">Tick outlets, choose the rep and the visit days, then Save. The outlet history keeps every change.</div></div><button class="btn" data-tm="close">Close</button></div><div class="frm">'
      + '<label>Operation</label><select id="taOp">' + myOps().filter(x => canEdit(x.code)).map(x => '<option value="' + x.code + '"' + (x.code === T.aOp ? ' selected' : '') + '>' + esc(x.code + ' - ' + x.name) + '</option>').join('') + '</select>'
      + '<label>Rep</label><select id="taRep"><option value="">(no rep: remove the assignment)</option>' + reps.map(r => '<option' + (nk(r.name) === nk(T.aRep) ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('') + '</select>'
      + '<label>Visit days (beat plan)</label><div class="chips" id="taDays">' + DAYS.map(d => '<button type="button" data-tday="' + d[0] + '" class="' + (T.days && T.days.includes(d[0]) ? 'on' : '') + '">' + d[1] + '</button>').join('') + '</div>'
      + '<div class="hint">' + (T.days ? 'The ticked outlets get these days.' : 'No day chosen: each outlet keeps its current days.') + '</div>'
      + '<label>Show</label><div class="chips">' + [['unassigned', 'No rep yet'], ['mine', 'This rep'], ['other', 'Other reps'], ['all', 'All']].map(m => '<button type="button" data-tmode="' + m[0] + '" class="' + (T.fMode === m[0] ? 'on' : '') + '">' + m[1] + '</button>').join('') + '</div>'
      + '<input id="taF" placeholder="Search outlet, chain, rep" value="' + esc(T.f) + '" style="margin-top:6px">'
      + '<div class="row2" style="justify-content:space-between;margin-top:6px"><span class="hint">' + L.length + ' shown · <b>' + n + ' ticked</b></span><span><button type="button" class="btn q" data-tm="all">Tick all shown</button> <button type="button" class="btn q" data-tm="none">Clear</button></span></div>'
      + '<div class="talist">' + (L.length ? L.map(x => '<label class="tar"><input type="checkbox" data-tk="' + esc(x.key) + '"' + (T.pick[x.key] ? ' checked' : '') + ' style="width:auto"><span style="flex:1;min-width:0"><b>' + esc(x.outlet) + '</b><br><span class="hint">' + esc(x.chain || '') + (repOf(x) ? ' · ' + (x.rep ? 'rep ' : 'invoice rep ') + esc(repOf(x)) : ' · no rep') + (x.days.length ? ' · ' + x.days.join(', ') : '') + (x.loc ? '' : ' · no location') + '</span></span>' + (x.bal ? '<span class="hint">' + money0(x.bal) + '</span>' : '') + '</label>').join('') : '<div class="hint">No outlets match.</div>') + '</div>'
      + '<div class="err" id="taErr">' + esc(msg || '') + '</div><div class="row2"><button class="btn p" data-tm="saveassign"' + (n ? '' : ' disabled') + '>Save ' + n + ' outlet' + (n === 1 ? '' : 's') + '</button></div></div>';
    T.aList = L;
  }
  async function saveAssign() {
    const rep = $('taRep').value, keys = Object.keys(T.pick);
    const save = op; op = T.aOp; const outs = outletsAll(); op = save;
    const body = keys.map(k => { const x = outs.find(o => o.key === k); return {key: k, outlet: x ? x.outlet : k}; });
    try {
      const n = await api('/rest/v1/rpc/fu_assign_outlets', {method: 'POST', body: {p_op: T.aOp, p_rep: rep || null, p_outlets: body, p_days: T.days}});
      await loadContacts(); closeDrawer(); toast((rep ? n + ' outlets assigned to ' + rep : n + ' outlets now have no rep') + (T.days ? ' · days ' + T.days.join(', ') : '')); go();
    } catch (e) { $('taErr').textContent = /fu_assign_outlets|function/.test(e.message) ? 'The database needs Supabase/31 rep team.sql first. ' + e.message : e.message; }
  }

  // ---------- Rep Day ----------
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (!document.getElementById('lfcss')) { const l = document.createElement('link'); l.id = 'lfcss'; l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l); }
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = ok; s.onerror = () => no(new Error('map library could not load')); document.head.appendChild(s); });
  }
  async function day() {
    clearInterval(T.timer); T.timer = null;
    if (!T.day) T.day = today();
    const reps = repList().filter(r => r.active);
    if (!reps.length) await loadTeam();
    const list = repList().filter(r => r.active);
    if (!T.rep || !list.some(r => r.name === T.rep)) T.rep = (list[0] || {}).name || '';
    const r = list.find(x => x.name === T.rep), o = r ? '&operation=eq.' + encodeURIComponent(r.op) : '';
    const a = encodeURIComponent(dStart(T.day).toISOString()), b = encodeURIComponent(dStart(addD(T.day, 1)).toISOString()), rn = encodeURIComponent(T.rep);
    const [runs, vis] = r ? await Promise.all([api('/rest/v1/fu_runs?day=eq.' + T.day + '&rep_name=eq.' + rn + o + '&select=*').catch(() => []),
      api('/rest/v1/fu_visits?started_at=gte.' + a + '&started_at=lt.' + b + '&rep_name=eq.' + rn + o + '&order=started_at.asc&select=*').catch(() => [])]) : [[], []];
    (runs || []).concat(vis || []).forEach(x => { if (x.rep_user) T.users[nk(x.rep_name)] = x.rep_user; });
    const uid = T.users[nk(T.rep)];
    const [pts, stays] = uid ? await Promise.all([fetchAll('/rest/v1/fu_track_points?rep_user=eq.' + uid + '&recorded_at=gte.' + a + '&recorded_at=lt.' + b + '&order=recorded_at.asc,id&select=lat,lng,accuracy_m,battery,recorded_at').catch(() => []),
      api('/rest/v1/fu_track_stays?rep_user=eq.' + uid + '&day=eq.' + T.day + '&order=started_at.asc&select=*').catch(() => [])]) : [[], []];
    T.dRuns = runs || []; T.dVis = vis || []; T.dPts = (pts || []).filter(p => (p.accuracy_m || 0) <= 100); T.dStays = stays || [];
    paintDay(r, list);
    if (T.day === today() && page === 'dash') T.timer = setInterval(() => { if (page === 'dash' && mod === 'team' && T.day === today()) day(); else { clearInterval(T.timer); T.timer = null; } }, 120000);
  }
  function paintDay(r, list) {
    const dk = DKEY[dStart(T.day).getDay()], runs = T.dRuns, vis = T.dVis, pts = T.dPts, stays = T.dStays;
    const save = op; if (r) op = r.op; const outs = outletsAll(); op = save;
    const asg = r ? outs.filter(x => nk(x.rep) === nk(r.name)) : [], plan = asg.filter(x => x.days.includes(dk));
    const done = new Set(vis.map(v => v.outlet_key)), miss = plan.filter(x => !done.has(x.key)), offPlan = vis.filter(v => !plan.some(x => x.key === v.outlet_key));
    const fu = rows.filter(x => isActive(x) && r && x.operation === r.op && nk(x.owner_name) === nk(r.name) && x.next_date === T.day && !done.has(nk(x.outlet)));
    let gps = 0; for (let i = 1; i < pts.length; i++) gps += dist(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    const rn = runs[0] || {}, mkm = rn.start_km != null && rn.end_km != null ? rn.end_km - rn.start_km : null;
    const away = stays.filter(s => !s.outlet_key), first = vis[0], last = vis[vis.length - 1];
    const ev = [];
    if (rn.start_at) ev.push({t: rn.start_at, h: '<b>Start meter</b> ' + Number(rn.start_km).toLocaleString('en-US') + ' km' + (rn.vehicle ? ' · ' + esc(rn.vehicle) : ''), c: 'g'});
    vis.forEach(v => ev.push({t: v.started_at, h: '<b>Check-in</b> ' + esc(v.outlet || v.outlet_key) + ' <span class="hint">' + (v.method === 'auto' ? 'auto' : v.method === 'both' ? 'auto + button' : 'button') + (v.distance_m != null ? ' · ' + Math.round(v.distance_m) + ' m' : '') + ' · ' + dur(mins(v.started_at, v.last_at || v.started_at)) + (plan.some(x => x.key === v.outlet_key) ? ' · on beat' : ' · not on beat') + '</span>' + (v.note ? '<br><span class="hint">' + esc(v.note) + '</span>' : ''), c: 'b'}));
    away.forEach(s => ev.push({t: s.started_at, h: '<b>Stop away from outlets</b> ' + dur(s.minutes) + ' <a href="' + gmap(s.lat, s.lng) + '" target="_blank" rel="noopener">map</a>', c: 'a'}));
    for (let i = 1; i < pts.length; i++) { const g = mins(pts[i - 1].recorded_at, pts[i].recorded_at); if (g >= 45) ev.push({t: pts[i - 1].recorded_at, h: '<b>No GPS for ' + dur(g) + '</b> <span class="hint">phone off, no signal or app closed</span>', c: 'r'}); }
    if (rn.end_at) ev.push({t: rn.end_at, h: '<b>Close meter</b> ' + Number(rn.end_km).toLocaleString('en-US') + ' km' + (mkm != null ? ' · day ' + mkm + ' km' : ''), c: 'g'});
    ev.sort((a, b) => a.t < b.t ? -1 : 1);
    const field = first && last ? mins(first.started_at, last.last_at || last.started_at) : 0;
    $('page').innerHTML = '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">Rep Day</h2><div class="hint">' + (r ? esc(r.op) + ' · ' : '') + dStart(T.day).toLocaleDateString('en-GB', {weekday: 'long', day: '2-digit', month: 'short', year: 'numeric'}) + (T.day === today() ? ' · refreshes every 2 min' : '') + '</div></div>'
      + '<div class="row2 noprint"><select id="tdRep">' + list.map(x => '<option' + (x.name === T.rep ? ' selected' : '') + ' value="' + esc(x.name) + '">' + esc(x.name + (op ? '' : ' · ' + x.op)) + '</option>').join('') + '</select>'
      + '<button class="btn q" data-tm="prev">&lsaquo;</button><input type="date" id="tdDay" value="' + T.day + '" max="' + today() + '"><button class="btn q" data-tm="next"' + (T.day >= today() ? ' disabled' : '') + '>&rsaquo;</button></div></div>'
      + (!r ? '<div class="card hint">No reps yet.</div>' :
      '<div class="grid"><div class="tile ' + (rn.start_at ? 'g' : 'r') + '"><b>' + (rn.start_at ? hm(rn.start_at) : '-') + '</b><span>Start meter' + (rn.start_km != null ? ' · ' + Number(rn.start_km).toLocaleString('en-US') + ' km' : '') + '</span></div>'
      + '<div class="tile"><b>' + (rn.end_at ? hm(rn.end_at) : '-') + '</b><span>Close meter' + (mkm != null ? ' · ' + mkm + ' km' : '') + '</span></div>'
      + '<div class="tile"><b>' + vis.length + '</b><span>Check-ins · ' + done.size + ' outlets</span></div>'
      + '<div class="tile ' + (miss.length ? 'a' : 'g') + '"><b>' + (plan.length - miss.length) + ' / ' + plan.length + '</b><span>Beat outlets visited</span></div>'
      + '<div class="tile"><b>' + (first ? hm(first.started_at) + ' - ' + hm(last.last_at || last.started_at) : '-') + '</b><span>First - last check-in' + (field ? ' · ' + dur(field) : '') + '</span></div>'
      + '<div class="tile ' + (pts.length ? '' : 'a') + '"><b>' + (pts.length ? kmf(gps) + ' km' : 'no GPS') + '</b><span>GPS route · ' + pts.length + ' points' + (mkm != null && pts.length ? ' · meter ' + mkm + ' km' : '') + '</span></div>'
      + '<div class="tile ' + (away.length ? 'a' : '') + '"><b>' + away.length + '</b><span>Stops away from outlets (10+ min)</span></div></div>'
      + '<div class="card" style="padding:0;overflow:hidden"><div id="tdMap" style="height:380px;max-height:60vh"></div><div class="hint" style="padding:6px 12px"><span style="color:#2f6fe0">&#9632;</span> route &nbsp; <span style="color:#0f9b8e">&#9679;</span> check-in &nbsp; <span style="color:#e8590c">&#9679;</span> stop away from outlets &nbsp; <span style="color:#be123c">&#9679;</span> beat outlet not visited</div></div>'
      + '<div class="grid2" style="margin-top:12px"><div class="card"><h3>Timeline</h3>' + (ev.length ? '<div class="tdtl">' + ev.map(e => '<div class="tde ' + e.c + '"><time>' + hm(e.t) + '</time><div>' + e.h + '</div></div>').join('') + '</div>' : '<div class="hint">Nothing recorded this day.</div>') + '</div>'
      + '<div class="side"><div class="card"><h3>Beat outlets not visited (' + miss.length + ')</h3>' + (plan.length ? (miss.length ? miss.map(x => '<div class="row2" style="border-bottom:1px solid var(--line);padding:4px 0"><span style="flex:1"><b>' + esc(x.outlet) + '</b>' + (x.bal ? ' <span class="hint">' + money0(x.bal) + '</span>' : '') + '</span>' + (x.loc ? '' : '<span class="tag t-b">no location</span>') + '</div>').join('') : '<div class="hint">All beat outlets visited.</div>') : '<div class="hint">No beat plan for ' + esc(dk) + '. Set visit days in Rep Team → Assign outlets.</div>') + '</div>'
      + '<div class="card"><h3>Visits not on the beat (' + offPlan.length + ')</h3>' + (offPlan.length ? offPlan.map(v => '<div>' + hm(v.started_at) + ' · ' + esc(v.outlet || v.outlet_key) + '</div>').join('') : '<div class="hint">None.</div>') + '</div>'
      + '<div class="card"><h3>Follow-ups due this day, not visited (' + fu.length + ')</h3>' + (fu.length ? fu.map(x => '<div class="row" data-open="' + x.id + '" style="cursor:pointer;padding:3px 0"><b>' + esc(x.outlet) + '</b> <span class="hint">' + money0(x.amount) + ' · ' + esc(x.next_step || '') + '</span></div>').join('') : '<div class="hint">None.</div>') + '</div></div></div>');
    if (r) drawMap(vis, pts, away, miss);
  }
  async function drawMap(vis, pts, away, miss) {
    const el = $('tdMap'); if (!el) return;
    try { await loadLeaflet(); } catch (e) { el.innerHTML = '<div class="hint" style="padding:12px">Map could not load (no internet?). The timeline below still works.</div>'; return; }
    if (T.map) { try { T.map.remove(); } catch (e) {} T.map = null; }
    const m = T.map = L.map(el, {zoomControl: true}); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap'}).addTo(m);
    const b = [], dot = (la, ln, c, tip, r) => { if (la == null || ln == null) return; b.push([la, ln]); L.circleMarker([la, ln], {radius: r || 8, color: '#fff', weight: 2, fillColor: c, fillOpacity: .95}).bindPopup(tip).addTo(m); };
    if (pts.length) { const line = pts.map(p => [p.lat, p.lng]); L.polyline(line, {color: '#2f6fe0', weight: 4, opacity: .8}).addTo(m); b.push(...line);
      dot(pts[0].lat, pts[0].lng, '#3b2fc9', 'First GPS ' + hm(pts[0].recorded_at), 6); dot(pts[pts.length - 1].lat, pts[pts.length - 1].lng, '#3b2fc9', 'Last GPS ' + hm(pts[pts.length - 1].recorded_at) + (pts[pts.length - 1].battery != null ? ' · battery ' + pts[pts.length - 1].battery + '%' : ''), 6); }
    vis.forEach(v => dot(v.lat, v.lng, '#0f9b8e', '<b>' + esc(v.outlet || v.outlet_key) + '</b><br>' + hm(v.started_at) + ' · ' + dur(mins(v.started_at, v.last_at || v.started_at))));
    away.forEach(s => dot(s.lat, s.lng, '#e8590c', 'Stop ' + hm(s.started_at) + ' · ' + dur(s.minutes)));
    miss.forEach(x => x.prof && dot(x.prof.lat, x.prof.lng, '#be123c', '<b>' + esc(x.outlet) + '</b><br>beat outlet, not visited', 7));
    if (b.length) m.fitBounds(b, {padding: [24, 24], maxZoom: 16}); else m.setView([7.05, 79.9], 11);
    setTimeout(() => m.invalidateSize(), 200);
  }

  // ---------- Coverage ----------
  function perRange() {
    const t = today(), d = dStart(t);
    if (T.per === 'week') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [ymd(d), t]; }
    if (T.per === 'month') { d.setDate(1); return [ymd(d), t]; }
    if (T.per === 'last') { const a = new Date(d.getFullYear(), d.getMonth() - 1, 1), z = new Date(d.getFullYear(), d.getMonth(), 0); return [ymd(a), ymd(z)]; }
    return [addD(t, -29), t];
  }
  async function coverage() {
    const [f, t] = perRange(), o = op ? '&operation=eq.' + encodeURIComponent(op) : '';
    const a = encodeURIComponent(dStart(addD(t, -60) < f ? addD(t, -60) : f).toISOString()), z = encodeURIComponent(dStart(addD(t, 1)).toISOString());
    const [reps, vis, runs] = await Promise.all([api('/rest/v1/fu_reps?select=*' + o).catch(() => []),
      fetchAll('/rest/v1/fu_visits?started_at=gte.' + a + '&started_at=lt.' + z + o + '&order=id&select=operation,outlet_key,rep_name,started_at').catch(() => []),
      fetchAll('/rest/v1/fu_runs?day=gte.' + f + '&day=lte.' + t + o + '&order=id&select=operation,rep_name,day,start_km,end_km').catch(() => [])]);
    T.reps = reps || [];
    const outs = outletsAll(), inPer = v => { const d = ymd(new Date(v.started_at)); return d >= f && d <= t; };
    const lastV = {}; (vis || []).forEach(v => { const k = v.operation + '|' + v.outlet_key; if (!lastV[k] || v.started_at > lastV[k]) lastV[k] = v.started_at; });
    const R = repList().filter(r => r.active).map(r => {
      const asg = outs.filter(x => x.op === r.op && nk(x.rep) === nk(r.name)), v = (vis || []).filter(x => x.operation === r.op && nk(x.rep_name) === nk(r.name) && inPer(x));
      const seen = new Set(v.map(x => x.outlet_key)), cov = asg.filter(x => seen.has(x.key)).length, rr = (runs || []).filter(x => x.operation === r.op && nk(x.rep_name) === nk(r.name));
      const days = new Set(rr.map(x => x.day).concat(v.map(x => ymd(new Date(x.started_at))))).size, km = rr.reduce((s, x) => s + (x.start_km != null && x.end_km != null ? x.end_km - x.start_km : 0), 0);
      const stale = asg.filter(x => { const l = lastV[x.op + '|' + x.key]; return !l || (Date.now() - new Date(l)) > 14 * 864e5; }).map(x => Object.assign({}, x, {last: lastV[x.op + '|' + x.key] || null}));
      return {r, asg: asg.length, cov, pct: asg.length ? Math.round(cov * 100 / asg.length) : null, visits: v.length, days, km, avg: days ? (v.length / days).toFixed(1) : '0', stale};
    }).sort((a, b) => (a.pct == null) - (b.pct == null) || (a.pct || 0) - (b.pct || 0));
    T.cov = {f, t, R};
    const tot = R.reduce((s, x) => ({a: s.a + x.asg, c: s.c + x.cov, v: s.v + x.visits}), {a: 0, c: 0, v: 0});
    $('page').innerHTML = '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">Coverage</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' · ' + f + ' to ' + t + ' · assigned outlets visited at least once</div></div>'
      + '<div class="row2 noprint"><div class="chips">' + [['week', 'This week'], ['month', 'This month'], ['30', 'Last 30 days'], ['last', 'Last month']].map(p => '<button data-tper="' + p[0] + '" class="' + (T.per === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div><button class="btn" id="tcPrint">Print / PDF</button></div></div>'
      + '<div class="grid"><div class="tile"><b>' + (tot.a ? Math.round(tot.c * 100 / tot.a) + '%' : '-') + '</b><span>Coverage (' + tot.c + ' of ' + tot.a + ' assigned outlets)</span></div><div class="tile"><b>' + tot.v + '</b><span>Check-ins</span></div>'
      + '<div class="tile a"><b>' + R.reduce((s, x) => s + x.stale.length, 0) + '</b><span>Assigned outlets not visited 14+ days</span></div><div class="tile a"><b>' + outs.filter(x => !x.rep).length + '</b><span>Outlets with no assigned rep</span></div></div>'
      + '<div class="wrap"><table><thead><tr><th>Rep</th>' + (op ? '' : '<th>Op</th>') + '<th class="n">Assigned</th><th class="n">Visited</th><th>Coverage</th><th class="n">Check-ins</th><th class="n">Days worked</th><th class="n">Per day</th><th class="n">Meter km</th><th class="n">Not visited 14+ d</th></tr></thead><tbody>'
      + (R.length ? R.map(x => '<tr class="row" data-tm="day" data-op="' + esc(x.r.op) + '" data-n="' + esc(x.r.name) + '"><td><b>' + esc(x.r.name) + '</b></td>' + (op ? '' : '<td>' + esc(x.r.op) + '</td>') + '<td class="n">' + x.asg + '</td><td class="n">' + x.cov + '</td>'
        + '<td>' + (x.pct == null ? '<span class="hint">no outlets assigned</span>' : '<div class="bt" style="min-width:90px"><i style="width:' + x.pct + '%;background:' + (x.pct >= 80 ? 'var(--ok)' : x.pct >= 50 ? 'var(--accent)' : 'var(--danger)') + '"></i></div><span class="hint">' + x.pct + '%</span>') + '</td>'
        + '<td class="n">' + x.visits + '</td><td class="n">' + x.days + '</td><td class="n">' + x.avg + '</td><td class="n">' + (x.km ? x.km.toLocaleString('en-US') : '') + '</td><td class="n">' + (x.stale.length ? '<span class="down">' + x.stale.length + '</span>' : 0) + '</td></tr>').join('') : '<tr><td colspan="10" class="hint">No active reps.</td></tr>') + '</tbody></table></div>'
      + R.filter(x => x.stale.length).map(x => '<div class="card" style="margin-top:12px"><h3>' + esc(x.r.name) + ' · not visited for 14+ days (' + x.stale.length + ')</h3>' + x.stale.sort((a, b) => (a.last || '') < (b.last || '') ? -1 : 1).map(s => '<div class="row2" style="border-bottom:1px solid var(--line);padding:3px 0"><span style="flex:1">' + esc(s.outlet) + (s.bal ? ' <span class="hint">' + money0(s.bal) + '</span>' : '') + '</span><span class="hint">' + (s.last ? 'last ' + ymd(new Date(s.last)) : 'never visited') + '</span></div>').join('') + '</div>').join('')
      + '<div class="hint" style="margin-top:8px">Tap a rep to open their Rep Day.</div>';
    $('tcPrint').onclick = () => window.print();
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const tp = e.target.closest('[data-tper]'); if (tp) { T.per = tp.dataset.tper; run(coverage); return; }
    const dd = e.target.closest('[data-tday]'); if (dd) { const k = dd.dataset.tday; T.days = T.days || []; T.days = T.days.includes(k) ? T.days.filter(x => x !== k) : T.days.concat(k); if (!T.days.length) T.days = null; paintAssign(); return; }
    const mm = e.target.closest('[data-tmode]'); if (mm) { T.fMode = mm.dataset.tmode; paintAssign(); return; }
    const b = e.target.closest('[data-tm]'); if (!b || b.disabled) return;
    const k = b.dataset.tm;
    if (k === 'day') { T.rep = b.dataset.n; if (b.dataset.op && op && op !== b.dataset.op) op = b.dataset.op; go('dash', 'team'); }
    else if (k === 'add') repForm(null);
    else if (k === 'edit') repForm(repList().find(r => r.op === b.dataset.op && r.name === b.dataset.n));
    else if (k === 'assign') assignForm(b.dataset.op, b.dataset.n);
    else if (k === 'close') closeDrawer();
    else if (k === 'saverep') guard(saveRep);
    else if (k === 'login') loginForm(repList().find(r => r.op === b.dataset.op && r.name === b.dataset.n));
    else if (k === 'link') linkForm(b.dataset.op, b.dataset.n);
    else if (k === 'lkgo') guard(lkGo);
    else if (k === 'genpass') { const i = $('lgPass'); if (i) { i.value = genPass(); i.type = 'text'; } }
    else if (k === 'lgcreate') guard(lgCreate);
    else if (k === 'lgreset') guard(lgReset);
    else if (k === 'lgactive') guard(() => lgActive(b.dataset.on === '1'));
    else if (k === 'saveassign') guard(saveAssign);
    else if (k === 'all') { (T.aList || []).forEach(x => T.pick[x.key] = 1); paintAssign(); }
    else if (k === 'none') { T.pick = {}; paintAssign(); }
    else if (k === 'prev') { T.day = addD(T.day, -1); run(day); }
    else if (k === 'next') { T.day = addD(T.day, 1) > today() ? today() : addD(T.day, 1); run(day); }
  });
  document.addEventListener('change', e => {
    const id = e.target.id;
    if (e.target.dataset && e.target.dataset.tk != null) { if (e.target.checked) T.pick[e.target.dataset.tk] = 1; else delete T.pick[e.target.dataset.tk]; paintAssign(); return; }
    if (e.target.name === 'lkU') { T.lk.sel = e.target.value; const rn = e.target.dataset.rn; if (rn) $('lkName').value = rn; return; }
    if (id === 'lkOp') { $('lkReps').innerHTML = lkNames(e.target.value); return; }
    if (id === 'taOp') { T.aOp = e.target.value; T.aRep = ''; T.pick = {}; paintAssign(); }
    else if (id === 'taRep') { T.aRep = e.target.value; paintAssign(); }
    else if (id === 'tdRep') { T.rep = e.target.value; run(day); }
    else if (id === 'tdDay') { T.day = e.target.value > today() ? today() : e.target.value; run(day); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'lkQ') { clearTimeout(T.lkT); T.lkT = setTimeout(lkFind, 400); return; } if (e.target.id === 'taF') { T.f = e.target.value; const s = e.target.selectionStart; paintAssign(); const i = $('taF'); i.focus(); i.setSelectionRange(s, s); } });

  const css = document.createElement('style');
  css.textContent = '.tmlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:10px}.tmc.off{opacity:.6}.tmh{display:flex;gap:10px;align-items:center}'
    + '.tav{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;background:linear-gradient(135deg,#3b2fc9,#2f6fe0 55%,#1fc2ec)}'
    + '.tmg{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.tmg div{background:var(--surface2);border-radius:10px;padding:6px;text-align:center}.tmg b{display:block;font-size:16px}.tmg span{font-size:10.5px;color:var(--muted)}'
    + '.talist{max-height:46vh;overflow-y:auto;border:1px solid var(--line);border-radius:10px;margin-top:6px}.tar{display:flex!important;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px solid var(--line);margin:0!important;color:var(--ink)!important;font-size:13px!important;cursor:pointer}'
    + '.tdtl{display:flex;flex-direction:column;gap:0}.tde{display:flex;gap:10px;padding:6px 0 6px 10px;border-left:3px solid var(--line2);font-size:13px}.tde time{flex:none;width:42px;font-variant-numeric:tabular-nums;color:var(--muted)}'
    + '.tde.g{border-color:var(--ok)}.tde.b{border-color:#2f6fe0}.tde.a{border-color:var(--accent)}.tde.r{border-color:var(--danger)}@media(max-width:600px){.tmg{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  document.head.appendChild(css);

  function card(m) {
    return '<div class="card mcard" data-mod="team" data-go="items"><b>' + esc(m.name) + '</b> <span class="badge b-live">New</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + repList().filter(r => r.active).length + ' reps</div><div class="hint">' + outletsAll().filter(x => !x.rep).length + ' outlets without an assigned rep</div></div>';
  }
  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {team: {items: () => run(team), dash: () => run(day), report: () => run(coverage), card}});
})();
