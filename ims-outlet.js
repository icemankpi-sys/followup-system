// Iceman IMS - Outlets section: outlet profiles, live location, outlet history (2026-11-01)
// Loaded before the main script; uses the main script's globals at run time (api, $, esc, money, money0, rows, op, me, ops, lvl, rank,
// sum, isActive, go, CO, ck, loadContacts, toast, closeDrawer, fmtDT, fmtT, fmtD, ini, tcls, myTitle, STATUS, sess, telA, openRecord, bars).
(function () {
  const O = {f: {text: '', chain: '', terms: '', gap: ''}, notes: [], ev: [], key: null, pos: null, tlF: 'all'};
  const lc = s => String(s || '').trim().toLowerCase();
  const TERMS = {cash: 'Cash', credit: 'Credit', both: 'Cash and credit'};
  const FLD = {chain: 'Chain', phone: 'Contact no', address: 'Address', br_no: 'BR no', credit_ref: 'Credit policy reference', credit_no: 'Credit policy no', pay_terms: 'Cash / credit', rep: 'Sales rep'};
  const opsAll = () => ops.filter(o => rank(lvl(o.code, 'receivable')) > 0 || rank(lvl(o.code, 'rep')) > 0);
  const canMgr = o => rank(lvl(o, 'receivable')) >= 2;
  const canAdd = o => canMgr(o) || rank(lvl(o, 'rep')) >= 2;
  const uid = () => sess && sess.user && sess.user.id;
  const myRepRows = (o, name) => rows.filter(r => r.operation === o && lc(r.outlet) === lc(name) && me.rep_name && lc(r.owner_name) === lc(me.rep_name));
  const canEdit = x => canMgr(x.operation) || (rank(lvl(x.operation, 'rep')) >= 2 && (myRepRows(x.operation, x.outlet).length > 0 || (x.prof && x.prof.created_by === uid())));
  const idOf = (o, key) => encodeURIComponent(o + '|' + key);
  const mapUrl = p => 'https://www.google.com/maps?q=' + p.lat + ',' + p.lng;

  // every outlet: saved profiles plus outlets that appear in the follow-up records
  function outlets() {
    const m = {};
    Object.values(CO).forEach(p => { if (!op || p.operation === op) m[p.operation + '|' + p.outlet_key] = {operation: p.operation, key: p.outlet_key, outlet: p.outlet, chain: p.chain, prof: p, recs: []}; });
    rows.forEach(r => {
      if (op && r.operation !== op) return;
      const k = r.operation + '|' + lc(r.outlet);
      if (!m[k]) m[k] = {operation: r.operation, key: lc(r.outlet), outlet: (r.outlet || '').trim(), chain: r.party, prof: null, recs: []};
      if (!m[k].chain) m[k].chain = r.party;
      m[k].recs.push(r);
    });
    return Object.values(m).map(x => {
      const a = x.recs.filter(isActive), p = x.prof || {};
      x.open = a.length; x.bal = sum(a); x.o120 = sum(a.filter(r => r.aging_days > 120)); x.oldest = Math.max(0, ...a.map(r => r.aging_days || 0));
      x.missing = [!p.phone && 'contact no', !p.address && 'address', !p.br_no && 'BR no', !p.pay_terms && 'cash / credit', (p.pay_terms === 'credit' || p.pay_terms === 'both') && !p.credit_no && 'credit policy', p.lat == null && 'location'].filter(Boolean);
      return x;
    });
  }
  // look the outlet up across all operations, whatever the operation filter is
  const find = id => { const [o, key] = decodeURIComponent(id).split('|'), s = op; op = ''; const r = outlets().find(x => x.operation === o && x.key === key); op = s; return r; };
  const termTag = t => t ? '<span class="tag ' + (t === 'cash' ? 't-g' : t === 'credit' ? 't-a' : 't-b') + '">' + TERMS[t] + '</span>' : '<span class="hint">not set</span>';

  // ---------- list ----------
  function list() {
    const all = outlets(), F = O.f, t = lc(F.text);
    let L = all.filter(x => (!F.chain || x.chain === F.chain) && (!F.terms || (F.terms === 'none' ? !(x.prof && x.prof.pay_terms) : x.prof && x.prof.pay_terms === F.terms))
      && (!F.gap || (F.gap === 'noprof' ? !x.prof : F.gap === 'noloc' ? !(x.prof && x.prof.lat != null) : x.missing.length > 0))
      && (!t || [x.outlet, x.chain, x.prof && x.prof.phone, x.prof && x.prof.br_no, x.prof && x.prof.address].some(v => lc(v).includes(t))));
    L.sort((a, b) => b.bal - a.bal || a.outlet.localeCompare(b.outlet));
    const chains = [...new Set(all.map(x => x.chain).filter(Boolean))].sort(), addOps = opsAll().filter(o => canAdd(o.code));
    $('page').innerHTML = '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">Outlets</h2><div class="hint">' + (op ? 'Operation ' + esc(op) + ' · ' : '') + all.length + ' outlets · ' + all.filter(x => x.prof).length + ' with a profile · ' + all.filter(x => x.prof && x.prof.lat != null).length + ' with a location</div></div>'
      + '<div class="row2">' + (window.canHandover && canHandover() ? '<button class="btn" data-hact="open">&#8644; Rep handover</button>' : '') + (addOps.length ? '<button class="btn p" data-oact="new">+ New outlet</button>' : '') + '</div></div>'
      + '<div class="filters row2"><input id="olText" placeholder="Search outlet, chain, phone, BR no" value="' + esc(F.text) + '" style="min-width:220px"><select id="olChain"><option value="">All chains</option>' + chains.map(c => '<option' + (c === F.chain ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>'
      + '<select id="olTerms">' + [['', 'Cash and credit: all'], ['cash', 'Cash'], ['credit', 'Credit'], ['both', 'Cash and credit'], ['none', 'Not set']].map(o => '<option value="' + o[0] + '"' + (o[0] === F.terms ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>'
      + '<select id="olGap">' + [['', 'All outlets'], ['missing', 'Profile not complete'], ['noprof', 'No profile yet'], ['noloc', 'No location']].map(o => '<option value="' + o[0] + '"' + (o[0] === F.gap ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>'
      + '<div class="wrap"><table><thead><tr><th>Outlet</th><th>Chain</th>' + (op ? '' : '<th>Op</th>') + '<th>Cash / credit</th><th>Contact no</th><th>Location</th><th class="n">Open</th><th class="n">Outstanding</th><th class="n">Over 120</th><th>Profile</th></tr></thead><tbody>'
      + (L.length ? L.map(x => '<tr class="row" data-outlet="' + idOf(x.operation, x.key) + '"><td><b>' + esc(x.outlet) + '</b></td><td>' + esc(x.chain || '') + '</td>' + (op ? '' : '<td>' + esc(x.operation) + '</td>') + '<td>' + termTag(x.prof && x.prof.pay_terms) + '</td><td>' + esc(x.prof && x.prof.phone || '') + '</td><td>' + (x.prof && x.prof.lat != null ? '<span class="tag t-g">saved</span>' : '<span class="hint">none</span>') + '</td>'
        + '<td class="n">' + (x.open || '') + '</td><td class="n">' + (x.bal ? money(x.bal) : '') + '</td><td class="n">' + (x.o120 ? money(x.o120) : '') + '</td><td>' + (!x.prof ? '<span class="tag t-b">no profile</span>' : x.missing.length ? '<span class="tag t-a">' + x.missing.length + ' missing</span>' : '<span class="tag t-g">complete</span>') + '</td></tr>').join('') : '<tr><td colspan="10" class="hint">No outlets match.</td></tr>') + '</tbody></table></div>';
  }

  // ---------- outlet page ----------
  async function page() {
    const x = find(window.OUTLET_ID || '');
    if (!x) { $('page').innerHTML = '<div class="card">This outlet was not found, or you do not have access.<div class="row2"><button class="btn p" data-oact="back">Back to outlets</button></div></div>'; return; }
    const p = x.prof || {}, ce = canEdit(x), recs = x.recs.slice().sort((a, b) => (isActive(b) - isActive(a)) || (b.aging_days - a.aging_days)), closed = recs.filter(r => !isActive(r));
    $('page').innerHTML = '<div class="crumb noprint"><a data-oact="back">Outlets</a> &rsaquo; <b>' + esc(x.outlet) + '</b></div>'
      + '<div class="rhero"><div><h2 class="pt">' + esc(x.outlet) + '</h2><div class="hint">' + esc(x.chain || 'no chain') + ' · operation ' + esc(x.operation) + ' · ' + termTag(p.pay_terms) + '</div></div><div class="row2 noprint"><button class="btn" data-oact="back">&larr; Back to outlets</button></div></div>'
      + '<div class="grid"><div class="tile"><b>' + money(x.bal) + '</b><span>Outstanding now (' + x.open + ' open)</span></div><div class="tile ' + (x.o120 ? 'r' : '') + '"><b>' + money(x.o120) + '</b><span>Over 120 days</span></div><div class="tile ' + (x.oldest > 120 ? 'r' : x.oldest > 90 ? 'a' : '') + '"><b>' + (x.oldest ? x.oldest + ' days' : '-') + '</b><span>Oldest open invoice</span></div>'
      + '<div class="tile"><b>' + recs.length + '</b><span>Records in the system (' + closed.length + ' settled / closed)</span></div><div class="tile ' + (x.missing.length ? 'a' : '') + '"><b>' + (x.prof ? (x.missing.length ? x.missing.length + ' missing' : 'Complete') : 'No profile') + '</b><span>' + (x.missing.length ? esc(x.missing.join(', ')) : 'Profile') + '</span></div></div>'
      + '<div class="rgrid"><div class="card"><div class="tlh"><h3>Outlet history</h3><div class="chips noprint" id="olChips"></div><button class="btn p noprint" data-oact="note">+ Add remark</button></div>'
      + '<div class="hint">Remarks about the outlet, profile changes and the remarks on its invoices, oldest first.</div><div id="olTl" class="tl">Loading...</div>'
      + '<button class="fake noprint" data-oact="note">Write a remark about this outlet...</button>'
      + '<h3 style="margin-top:18px">Transactions in the system</h3><div class="wrap" style="box-shadow:none"><table><thead><tr><th>Invoice</th><th>Date</th><th class="n">Balance</th><th class="n">Days</th><th>Status</th><th>Sales rep</th><th>Reason</th></tr></thead><tbody>'
      + (recs.length ? recs.map(r => '<tr class="row" data-open="' + r.id + '"><td>' + esc(r.ref_key) + '</td><td>' + esc(r.base_date || '') + '</td><td class="n">' + money(r.amount) + '</td><td class="n">' + (isActive(r) ? r.aging_days : '') + '</td><td>' + esc(STATUS[r.status] || r.status) + '</td><td>' + esc(r.owner_name || '') + '</td><td>' + esc(r.reason || '') + '</td></tr>').join('') : '<tr><td colspan="7" class="hint">No records for this outlet yet.</td></tr>') + '</tbody></table></div></div>'
      + '<div class="side"><div class="card plan"><div class="tlh"><h3>Profile</h3>' + (ce ? '<button class="btn noprint" data-oact="edit">&#9998; Edit</button>' : '') + '</div><dl>'
      + row('Outlet / chain', esc(x.outlet) + (x.chain ? '<br><span class="hint">' + esc(x.chain) + '</span>' : '')) + row('Contact no', p.phone ? telA(p.phone) : '') + row('Address', p.address ? esc(p.address).replace(/\n/g, '<br>') : '') + row('BR no', esc(p.br_no || ''))
      + row('Credit policy ref', esc(p.credit_ref || '')) + row('Credit policy no', esc(p.credit_no || '')) + row('Cash / credit', p.pay_terms ? TERMS[p.pay_terms] : '') + '</dl>'
      + (p.updated_at ? '<div class="hint" style="margin-top:6px">Last changed by ' + esc(p.by_name || '') + ', ' + esc(fmtDT(new Date(p.updated_at))) + '</div>' : '') + '</div>'
      + '<div class="card plan"><div class="tlh"><h3>Location</h3></div>' + (p.lat != null ? '<dl>' + row('Map', '<a href="' + mapUrl(p) + '" target="_blank" rel="noopener">Open in Google Maps</a>') + row('Point', p.lat.toFixed(6) + ', ' + p.lng.toFixed(6)) + row('Accuracy', p.loc_accuracy != null ? '±' + Math.round(p.loc_accuracy) + ' m' : '') + row('Added', esc((p.loc_by || '') + (p.loc_at ? ', ' + fmtDT(new Date(p.loc_at)) : ''))) + '</dl>' : '<div class="hint">No location yet.</div>')
      + (ce ? '<div class="row2 noprint"><button class="btn p" data-oact="loc">&#128205; ' + (p.lat != null ? 'Update' : 'Add') + ' live location</button></div><div class="hint">Stand at the outlet and press the button on your phone.</div>' : '') + '</div></div></div>';
    loadHistory(x);
  }
  const row = (k, v) => '<dt>' + k + '</dt><dd>' + (v || '<span class="hint">not set</span>') + '</dd>';

  async function loadHistory(x) {
    O.key = x.operation + '|' + x.key; O.notes = []; O.ev = [];
    try {
      if (x.prof) O.notes = await api('/rest/v1/fu_outlet_notes?operation=eq.' + encodeURIComponent(x.operation) + '&outlet_key=eq.' + encodeURIComponent(x.key) + '&order=at.asc,id.asc&limit=1000&select=*') || [];
      const ids = x.recs.map(r => r.id);
      for (let i = 0; i < ids.length; i += 60) O.ev = O.ev.concat(await api('/rest/v1/fu_events?kind=eq.note&item_id=in.(' + ids.slice(i, i + 60).join(',') + ')&select=id,item_id,at,by_name,by_title,by_user,note') || []);
    } catch (e) { const t = $('olTl'); if (t) t.textContent = e.message; return; }
    paint(x);
  }
  function paint(x) {
    const inv = {}; x.recs.forEach(r => inv[r.id] = r.ref_key);
    const all = O.notes.map(n => Object.assign({src: 'o'}, n)).concat(O.ev.map(e => Object.assign({src: 'i', kind: 'note', inv: inv[e.item_id]}, e))).sort((a, b) => a.at.localeCompare(b.at));
    const nOut = all.filter(e => e.src === 'o' && e.kind === 'note').length, nInv = all.filter(e => e.src === 'i').length, nCh = all.length - nOut - nInv;
    const ch = $('olChips'); if (ch) ch.innerHTML = [['all', 'All', all.length], ['o', 'Outlet remarks', nOut], ['i', 'Invoice remarks', nInv], ['c', 'Changes', nCh]].map(c => '<button data-otf="' + c[0] + '"' + (O.tlF === c[0] ? ' class="on"' : '') + '>' + c[1] + ' ' + c[2] + '</button>').join('');
    const L = all.filter(e => O.tlF === 'all' || (O.tlF === 'o' ? e.src === 'o' && e.kind === 'note' : O.tlF === 'i' ? e.src === 'i' : e.kind !== 'note'));
    let day = '';
    const h = L.map(e => {
      const at = new Date(e.at), d = fmtD(at), sep = d !== day ? '<div class="tld">' + esc(d) + '</div>' : ''; day = d;
      if (e.kind === 'note') { const c = tcls(e.by_title);
        return sep + '<div class="tln' + (e.by_user && e.by_user === uid() ? ' me' : '') + '"><span class="av ' + c + '">' + esc(ini(e.by_name)) + '</span><div class="bub"><div class="bh"><b>' + esc(e.by_name || 'Unknown') + '</b>' + (e.by_title ? '<span class="tt ' + c + '">' + esc(e.by_title) + '</span>' : '')
          + (e.src === 'i' ? '<span class="bn">on invoice ' + esc(e.inv || '') + '</span>' : '<span class="bn">outlet</span>') + '<time title="' + esc(fmtDT(at)) + '">' + esc(fmtT(at)) + '</time></div><div class="btx">' + esc(e.note) + '</div></div></div>'; }
      const what = e.kind === 'change' ? esc(FLD[e.field] || e.field) + ': ' + esc(e.field === 'pay_terms' ? (TERMS[e.old_value] || e.old_value || '(blank)') : (e.old_value || '(blank)')) + ' &rarr; <b>' + esc(e.field === 'pay_terms' ? (TERMS[e.new_value] || e.new_value || '(blank)') : (e.new_value || '(blank)')) + '</b>'
        : esc(e.note || e.kind) + (e.kind === 'location' && e.new_value ? ' · <a href="https://www.google.com/maps?q=' + esc(e.new_value) + '" target="_blank" rel="noopener">map</a>' : '');
      return sep + '<div class="tls"><i></i><div><b>' + esc(e.by_name || 'System') + '</b>' + (e.by_title ? ' (' + esc(e.by_title) + ')' : '') + ' · ' + esc(fmtT(at)) + '<span class="chg">' + what + '</span></div></div>';
    }).join('');
    const t = $('olTl'); if (t) t.innerHTML = h || '<div class="hint">' + (x.prof ? 'Nothing yet. Add the first remark.' : 'No history yet. Save the profile to start the outlet history.') + '</div>';
  }

  // ---------- drawers ----------
  const head = (title, x) => '<div class="dh"><div><h3>' + title + '</h3><div class="hint">' + esc(x ? x.outlet + ' · ' + x.operation : 'New outlet profile') + '</div></div><button class="btn" data-oact="close">Close</button></div><div class="frm">';
  const open = h => { $('panel').innerHTML = h; $('panel').classList.add('open'); };
  function profForm(x) {
    const p = (x && x.prof) || {};
    return (x ? '' : '<label>Operation</label><select id="oOp">' + opsAll().filter(o => canAdd(o.code)).map(o => '<option value="' + o.code + '"' + (o.code === op ? ' selected' : '') + '>' + esc(o.code + ' - ' + o.name) + '</option>').join('') + '</select><label>Outlet name</label><input id="oName" maxlength="150" placeholder="e.g. ARPICO DAILY - MATTEGODA">')
      + '<label>Chain name</label><input id="oChain" maxlength="100" list="oChains" value="' + esc(p.chain || (x && x.chain) || '') + '"><datalist id="oChains">' + [...new Set(rows.map(r => r.party).filter(Boolean))].sort().map(c => '<option value="' + esc(c) + '">').join('') + '</datalist>'
      + '<label>Contact no</label><input id="oPhone" inputmode="tel" maxlength="40" value="' + esc(p.phone || '') + '">'
      + '<label>Address</label><textarea id="oAddr" rows="2" maxlength="500">' + esc(p.address || '') + '</textarea>'
      + '<label>BR no</label><input id="oBr" maxlength="60" value="' + esc(p.br_no || '') + '">'
      + '<label>Cash / credit</label><div class="row2">' + [['cash', 'Cash'], ['credit', 'Credit'], ['both', 'Both']].map(o => '<label style="display:flex;gap:5px;align-items:center;margin:0;color:var(--ink)"><input type="radio" name="oTerms" value="' + o[0] + '" style="width:auto"' + (p.pay_terms === o[0] ? ' checked' : '') + '>' + o[1] + '</label>').join('') + '</div>'
      + '<label>Credit policy reference</label><input id="oCref" maxlength="80" value="' + esc(p.credit_ref || '') + '" placeholder="e.g. CCS/FIN/CP/2026/04">'
      + '<label>Credit policy no</label><input id="oCno" maxlength="60" value="' + esc(p.credit_no || '') + '">';
  }
  function editDrawer(x) {
    open(head(x ? 'Edit outlet profile' : 'New outlet', x) + profForm(x) + '<div class="stamp">Every change is written to the outlet history with your name and the time.</div>'
      + '<div class="row2"><button class="btn p" data-oact="saveprof">Save</button><button class="btn" data-oact="close">Cancel</button></div><div class="err" id="oErr"></div></div>');
  }
  function noteDrawer(x) {
    open(head('Outlet remark', x) + '<label>Remark</label><textarea id="oNote" rows="6" maxlength="2000" placeholder="e.g. New owner from 1 Nov. Credit limit to be reviewed with Finance."></textarea>'
      + '<div class="stamp">Logged as <b>' + esc(me.full_name || me.username) + '</b>' + (myTitle() ? ' · ' + esc(myTitle()) : '') + ' · ' + esc(fmtDT(new Date())) + '. Remarks cannot be edited later.</div>'
      + '<div class="row2"><button class="btn p" data-oact="postnote">Post remark</button><button class="btn" data-oact="close">Cancel</button><span class="hint">Ctrl + Enter</span></div><div class="err" id="oErr"></div></div>');
    setTimeout(() => { const n = $('oNote'); if (n) n.focus(); }, 220);
  }
  function locDrawer(x) {
    O.pos = null;
    open(head('Live location', x) + '<div class="hint">Stand at the outlet. Your phone will ask to share its location: allow it.</div><div id="oLoc" class="stamp">Finding your location...</div>'
      + '<div class="row2"><button class="btn p" data-oact="saveloc" disabled id="oLocSave">Save this location</button><button class="btn" data-oact="loc">Try again</button><button class="btn" data-oact="close">Cancel</button></div><div class="err" id="oErr"></div></div>');
    if (!navigator.geolocation) { $('oLoc').textContent = 'This browser cannot give a location. Use Chrome on the phone.'; return; }
    navigator.geolocation.getCurrentPosition(g => {
      O.pos = {lat: g.coords.latitude, lng: g.coords.longitude, acc: g.coords.accuracy};
      const el = $('oLoc'); if (!el) return;
      el.innerHTML = '<b>' + O.pos.lat.toFixed(6) + ', ' + O.pos.lng.toFixed(6) + '</b> · accuracy ±' + Math.round(O.pos.acc) + ' m · <a href="' + mapUrl(O.pos) + '" target="_blank" rel="noopener">check on the map</a>'
        + (O.pos.acc > 100 ? '<br><span class="err">Accuracy is weak. Go outside, wait a few seconds and press Try again.</span>' : '');
      $('oLocSave').disabled = false;
    }, er => { const el = $('oLoc'); if (el) el.innerHTML = '<span class="err">' + esc(er.code === 1 ? 'Location permission was refused. Allow location for this site in the browser settings and try again.' : er.code === 3 ? 'Timed out. Go outside and try again.' : 'Could not get the location: ' + er.message) + '</span>'; },
    {enableHighAccuracy: true, timeout: 25000, maximumAge: 0});
  }

  async function upsert(body) { await api('/rest/v1/fu_outlets?on_conflict=operation,outlet_key', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body}); }
  async function refresh(id, msg) { await loadContacts(); closeDrawer(); if (id) { window.OUTLET_ID = id; if (location.hash !== '#outlet/' + id) location.hash = 'outlet/' + id; else go('outlet', 'outlets'); } else go(); toast(msg); }
  async function saveProf() {
    const x = O.cur, err = $('oErr'), terms = (document.querySelector('input[name="oTerms"]:checked') || {}).value || null;
    const o = x ? x.operation : $('oOp').value, name = x ? x.outlet : $('oName').value.trim().replace(/\s+/g, ' ');
    if (!name) { err.textContent = 'Write the outlet name'; return; }
    if (!x && CO[ck(o, name)]) { err.textContent = 'This outlet already has a profile. Open it from the list.'; return; }
    const body = {operation: o, outlet_key: lc(name), outlet: name, chain: $('oChain').value.trim() || null, phone: $('oPhone').value.trim() || null, address: $('oAddr').value.trim() || null,
      br_no: $('oBr').value.trim() || null, pay_terms: terms, credit_ref: $('oCref').value.trim() || null, credit_no: $('oCno').value.trim() || null};
    try { await upsert(body); await refresh(idOf(o, lc(name)), 'Outlet profile saved'); } catch (e) { err.textContent = e.message; }
  }
  async function saveLoc() {
    const x = O.cur; if (!O.pos) return;
    try { await upsert({operation: x.operation, outlet_key: x.key, outlet: x.outlet, chain: (x.prof && x.prof.chain) || x.chain || null, lat: O.pos.lat, lng: O.pos.lng, loc_accuracy: Math.round(O.pos.acc)}); await refresh(idOf(x.operation, x.key), 'Location saved'); }
    catch (e) { $('oErr').textContent = e.message; }
  }
  async function postNote() {
    const x = O.cur, t = $('oNote').value.trim(); if (!t) { $('oErr').textContent = 'Write the remark first'; return; }
    try {
      if (!x.prof) await upsert({operation: x.operation, outlet_key: x.key, outlet: x.outlet, chain: x.chain || null});
      await api('/rest/v1/rpc/fu_add_outlet_note', {method: 'POST', body: {p_op: x.operation, p_key: x.key, p_note: t}});
      await refresh(idOf(x.operation, x.key), 'Remark added');
    } catch (e) { $('oErr').textContent = e.message; }
  }

  // ---------- dashboard and report ----------
  function dash() {
    const all = outlets(), pr = all.filter(x => x.prof), cnt = k => all.filter(k).length;
    const terms = [['Cash', cnt(x => x.prof && x.prof.pay_terms === 'cash'), 'var(--ok)'], ['Credit', cnt(x => x.prof && x.prof.pay_terms === 'credit'), 'var(--accent)'], ['Cash and credit', cnt(x => x.prof && x.prof.pay_terms === 'both'), 'var(--primary)'], ['Not set', cnt(x => !(x.prof && x.prof.pay_terms)), 'var(--muted)']];
    const gaps = ['contact no', 'address', 'BR no', 'cash / credit', 'credit policy', 'location'].map(g => [g, cnt(x => x.missing.includes(g)), 'var(--accent)']);
    const top = all.filter(x => x.bal > 0).sort((a, b) => b.bal - a.bal).slice(0, 10).map(x => [x.outlet, x.bal, x.o120 ? 'var(--danger)' : 'var(--primary)']);
    const ch = {}; all.forEach(x => { const k = x.chain || '(no chain)'; ch[k] = (ch[k] || 0) + 1; });
    $('page').innerHTML = '<h2 class="pt">Outlets dashboard</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + '</div>'
      + '<div class="grid"><div class="tile"><b>' + all.length + '</b><span>Outlets</span></div><div class="tile"><b>' + pr.length + '</b><span>With a profile</span></div><div class="tile ' + (cnt(x => x.prof && !x.missing.length) < all.length ? 'a' : '') + '"><b>' + cnt(x => x.prof && !x.missing.length) + '</b><span>Profile complete</span></div>'
      + '<div class="tile a"><b>' + cnt(x => !(x.prof && x.prof.lat != null)) + '</b><span>No location yet</span></div><div class="tile r"><b>' + cnt(x => x.o120 > 0) + '</b><span>Outlets with Over 120</span></div></div>'
      + '<div class="grid2"><div class="card"><h3>Top 10 outlets by outstanding</h3>' + bars(top, money0) + '</div><div class="card"><h3>Cash or credit</h3>' + bars(terms, v => v) + '</div>'
      + '<div class="card"><h3>Missing in the profile (outlets)</h3>' + bars(gaps, v => v) + '<div class="hint">Ask the reps to fill these when they visit.</div></div><div class="card"><h3>Outlets by chain</h3>' + bars(Object.entries(ch).sort((a, b) => b[1] - a[1]).slice(0, 10), v => v) + '</div></div>';
  }
  function report() {
    const all = outlets().sort((a, b) => b.bal - a.bal);
    const cols = [['Operation', x => x.operation], ['Outlet', x => x.outlet], ['Chain', x => x.chain], ['Contact no', x => x.prof && x.prof.phone], ['Address', x => x.prof && x.prof.address], ['BR no', x => x.prof && x.prof.br_no], ['Cash / credit', x => x.prof && TERMS[x.prof.pay_terms]],
      ['Credit policy ref', x => x.prof && x.prof.credit_ref], ['Credit policy no', x => x.prof && x.prof.credit_no], ['Latitude', x => x.prof && x.prof.lat], ['Longitude', x => x.prof && x.prof.lng], ['Open invoices', x => x.open], ['Outstanding', x => x.bal], ['Over 120', x => x.o120], ['Missing', x => x.missing.join('; ')]];
    $('page').innerHTML = '<div class="noprint row2"><button class="btn p" id="olPrint">Print / Save as PDF</button><button class="btn" id="olCsv">Download Excel (CSV)</button></div><h2 class="pt">Outlet register</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' · ' + all.length + ' outlets · Iceman IMS</div>'
      + '<div class="wrap"><table><thead><tr>' + cols.filter(c => !['Latitude', 'Longitude', 'Address'].includes(c[0])).map(c => '<th>' + c[0] + '</th>').join('') + '</tr></thead><tbody>'
      + all.map(x => '<tr>' + cols.filter(c => !['Latitude', 'Longitude', 'Address'].includes(c[0])).map(c => { const v = c[1](x); return '<td' + (typeof v === 'number' ? ' class="n"' : '') + '>' + (typeof v === 'number' && ['Outstanding', 'Over 120'].includes(c[0]) ? (v ? money(v) : '') : esc(v == null ? '' : v)) + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table></div>';
    $('olPrint').onclick = () => window.print();
    $('olCsv').onclick = () => { const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; const csv = '﻿' + cols.map(c => q(c[0])).join(',') + '\r\n' + all.map(x => cols.map(c => q(c[1](x))).join(',')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = 'Outlets ' + (op || 'all') + ' ' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); };
  }
  function card(m) {
    const all = outlets();
    return '<div class="card mcard" data-mod="outlets" data-go="items"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + all.length + ' outlets</div><div class="hint">' + all.filter(x => x.prof && !x.missing.length).length + ' complete · ' + all.filter(x => !(x.prof && x.prof.lat != null)).length + ' without location</div></div>';
  }

  // ---------- events (the page and panel listeners of the main script ignore these attributes) ----------
  document.addEventListener('click', e => {
    const ro = e.target.closest('[data-outlet]'); if (ro) { location.hash = 'outlet/' + ro.dataset.outlet; return; }
    const tf = e.target.closest('[data-otf]'); if (tf) { O.tlF = tf.dataset.otf; const x = find(window.OUTLET_ID || ''); if (x) paint(x); return; }
    const b = e.target.closest('[data-oact]'); if (!b || b.disabled) return;
    // buttons inside the side popup act on the outlet the popup was opened for (null = new outlet)
    const k = b.dataset.oact, inPanel = $('panel').contains(b), x = k === 'new' ? null : inPanel ? O.cur : find(window.OUTLET_ID || '');
    if (!inPanel && k !== 'back') O.cur = x;
    if (k === 'back') { history.replaceState(null, '', location.pathname + location.search); go('items', 'outlets'); }
    else if (k === 'close') closeDrawer();
    else if (k === 'new') editDrawer(null);
    else if (k === 'edit') editDrawer(x);
    else if (k === 'note') noteDrawer(x);
    else if (k === 'loc') locDrawer(x);
    else if (k === 'saveprof') saveProf();
    else if (k === 'saveloc') saveLoc();
    else if (k === 'postnote') postNote();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'oNote') { e.preventDefault(); postNote(); } });
  document.addEventListener('input', e => { if (e.target.id === 'olText') { O.f.text = e.target.value; const s = e.target.selectionStart; list(); const t = $('olText'); t.focus(); t.setSelectionRange(s, s); } });
  document.addEventListener('change', e => { const m = {olChain: 'chain', olTerms: 'terms', olGap: 'gap'}[e.target.id]; if (m) { O.f[m] = e.target.value; list(); } });

  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {outlets: {items: list, dash, report, outlet: page, card}});
})();
