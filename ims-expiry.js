// Iceman IMS - Short Expiry section (2026-11-01), built on "ඇමුණුම අ - Short Expiry Template Example.xlsx"
// Loaded before the main script; uses the main script's globals at run time (api, $, esc, money, money0, op, me, ops, lvl, rank, go, bars,
// toast, closeDrawer, fmtDT, guard, cur, tlEv, tlF, tlItem, paintTl, loadHist, myTitle, sess, telA).
(function () {
  const X = {rows: [], at: 0, imports: [], f: {band: '', status: 'active', plan: '', action: '', text: ''}, parsed: null};
  const ST = {open: 'Open', action_pending: 'Action in progress', settled: 'Cleared', written_off: 'Written off'};
  const ACTIONS = ['Transfer to another operation', 'Rep push (with target)', 'Promotion / markdown', 'Return to supplier', 'Write-off (approval needed)', 'Sold - no action needed', 'Other'];
  const CAUSES = ['Bought outside demand plan', 'Over-receipt at GRN', 'Short shelf life accepted at GRN', 'Piece-order remainder', 'Slow sales / no movement', 'Customer did not take the full order', 'Expired before it could be sold', 'Other'];
  const BANDS = ['Expired', '0-30', '31-60', '61-90', 'Over 90'];
  const OPMAP = {MT: 'MT', MT_COLOMBO: 'MT', MT_KANDY: 'MTK', MT_HORECA: 'MTH', MT_HOREKA: 'MTH', MT_HREKA: 'MTH', MT_SMMT: 'MT', GT_KANDY: 'KDY', GT_MEDAWELA: 'MDW', GT_MEDAWALA: 'MDW', CBL_COLOMBO: 'CBL', CBL_KANDY: 'CBK', CBL_GALLE: 'CBG', AMB_COLOMBO: 'AMB', AMB_JAFFNA: 'JFN', ICE_TUBE_COL: 'ICE', ICE_TUBE_COLOMBO: 'ICE', ICE: 'ICE', AMB: 'AMB', PLT: 'PLT', KDY: 'KDY', DEPOT: 'DEP', GOTHATUWA: 'DEP', MDW: 'MDW', CBL_CO: 'CBL', CBL_G: 'CBG', CBL_K: 'CBK', JAFFNA: 'JFN', MNG: 'MNG'};
  const isOpen = r => !['settled', 'written_off'].includes(r.status);
  const val = l => l.reduce((s, r) => s + Number(r.amount || 0), 0);
  const bandTag = b => b ? '<span class="tag ' + (b === 'Expired' || b === '0-30' ? 't-r' : b === '31-60' ? 't-a' : b === '61-90' ? 't-w' : 't-g') + '">' + (b === 'Expired' ? 'EXPIRED' : b === 'Over 90' ? '> 90' : b + ' days') + '</span>' : '';
  const scope = () => X.rows.filter(r => !op || r.operation === op);
  const canEd = o => rank(lvl(o, 'short_expiry')) >= 2, canFull = o => rank(lvl(o, 'short_expiry')) >= 3;
  const fullOps = () => ops.filter(o => canFull(o.code)), edOps = () => ops.filter(o => canEd(o.code));
  const d10 = d => d ? String(d).slice(0, 10) : '';

  async function load(force) {
    if (!force && X.at && Date.now() - X.at < 60000) return;
    X.rows = await api('/rest/v1/v_short_expiry?select=*&order=base_date.asc&limit=5000') || [];
    try { X.imports = await api('/rest/v1/fu_imports?module=eq.short_expiry&select=operation,as_at,file_name,rows_in,rows_new,rows_closed,by_name,at&order=as_at.desc&limit=200') || []; } catch (e) { X.imports = []; }
    X.at = Date.now();
  }
  async function run(fn) { $('page').innerHTML = '<div class="hint">Loading...</div>'; try { await load(); fn(); } catch (e) { $('page').innerHTML = '<div class="card err">Could not load: ' + esc(e.message) + '</div>'; } }

  // ---------- lines ----------
  function list() {
    const F = X.f, t = F.text.toLowerCase(), all = scope(), act = all.filter(isOpen);
    const L = all.filter(r => (F.status === 'all' || (F.status === 'active' ? isOpen(r) : !isOpen(r))) && (!F.band || r.band === F.band)
      && (!F.plan || (F.plan === 'out' ? r.not_in_plan : !r.not_in_plan)) && (!F.action || (F.action === 'none' ? !r.next_step : F.action === 'overdue' ? r.action_overdue : r.next_step === F.action))
      && (!t || [r.party, r.outlet, r.batch, r.owner_name].some(v => String(v || '').toLowerCase().includes(t))));
    const lastUp = X.imports.filter(i => !op || i.operation === op)[0];
    $('page').innerHTML = '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">Short Expiry</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' · items expired or expiring within 90 days'
      + (lastUp ? ' · last list ' + esc(lastUp.operation) + ' as at ' + esc(lastUp.as_at) : ' · no list uploaded yet') + '</div></div><div class="row2">' + (edOps().length ? '<button class="btn" data-sact="add">+ Add line</button>' : '') + (fullOps().length ? '<button class="btn p" data-sact="upload">&#8679; Upload Short Expiry List</button>' : '') + '</div></div>'
      + '<div class="grid"><div class="tile"><b>' + money0(val(act)) + '</b><span>Short-expiry value (' + act.length + ' lines)</span></div><div class="tile r"><b>' + money0(val(act.filter(r => r.band === 'Expired'))) + '</b><span>Already expired (' + act.filter(r => r.band === 'Expired').length + ')</span></div>'
      + '<div class="tile r"><b>' + money0(val(act.filter(r => r.band === '0-30'))) + '</b><span>Within 30 days (' + act.filter(r => r.band === '0-30').length + ')</span></div><div class="tile a"><b>' + act.filter(r => r.not_in_plan).length + '</b><span>Not in the demand plan</span></div>'
      + '<div class="tile r"><b>' + act.filter(r => r.action_overdue).length + '</b><span>Actions overdue</span></div><div class="tile a"><b>' + act.filter(r => r.incomplete).length + '</b><span>No action / date yet</span></div></div>'
      + '<div class="filters row2"><input id="seText" placeholder="Search code, item, batch, officer" value="' + esc(F.text) + '" style="min-width:200px">'
      + sel('seStatus', [['active', 'Open lines'], ['closed', 'Cleared / written off'], ['all', 'All lines']], F.status) + sel('seBand', [['', 'All alerts']].concat(BANDS.map(b => [b, b === 'Expired' ? 'Expired' : b === 'Over 90' ? 'Over 90 days' : b + ' days'])), F.band)
      + sel('sePlan', [['', 'Plan: all'], ['out', 'Not in demand plan'], ['in', 'In demand plan']], F.plan) + sel('seAction', [['', 'All actions'], ['none', 'No action yet'], ['overdue', 'Action overdue']].concat(ACTIONS.map(a => [a, a])), F.action) + '</div>'
      + '<div class="wrap"><table><thead><tr><th>Code</th><th>Item</th>' + (op ? '' : '<th>Op</th>') + '<th class="n">Qty</th><th>Expiry</th><th class="n">Days</th><th>Alert</th><th class="n">Value</th><th>Plan month</th><th>Planned action</th><th>By</th><th>Status</th></tr></thead><tbody>'
      + (L.length ? L.map(r => '<tr class="row" data-se="' + r.id + '"><td>' + esc(r.party) + '</td><td><b>' + esc(r.outlet) + '</b>' + (r.batch ? '<br><span class="hint">' + esc(r.batch) + '</span>' : '') + '</td>' + (op ? '' : '<td>' + esc(r.operation) + '</td>')
        + '<td class="n">' + (r.qty != null ? Number(r.qty).toLocaleString('en-US') : '') + ' ' + esc(r.unit || '') + '</td><td>' + esc(r.base_date || '') + '</td><td class="n">' + (r.days_left != null ? r.days_left : '') + '</td><td>' + bandTag(r.band) + '</td><td class="n">' + (r.amount ? money(r.amount) : '<span class="hint">no cost</span>') + '</td>'
        + '<td>' + (r.not_in_plan ? '<span class="tag t-r">not in plan</span>' : esc(r.plan_month || '')) + '</td><td>' + esc(r.next_step || '') + '</td><td' + (r.action_overdue ? ' style="color:var(--danger);font-weight:600"' : '') + '>' + esc(r.next_date || '') + '</td><td>' + esc(ST[r.status] || r.status) + '</td></tr>').join('')
        : '<tr><td colspan="12" class="hint">' + (all.length ? 'No lines match the filters.' : 'No Short Expiry List loaded yet. Press "Upload Short Expiry List".') + '</td></tr>') + '</tbody></table></div>';
  }
  const sel = (id, opts, v) => '<select id="' + id + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';

  // ---------- record ----------
  function record() {
    const r = X.rows.find(x => x.id === window.SE_ID);
    if (!r) { $('page').innerHTML = '<div class="card">This line was not found, or you do not have access.<div class="row2"><button class="btn p" data-sact="back">Back to Short Expiry</button></div></div>'; return; }
    cur = r; const ce = canEd(r.operation), late = r.action_overdue, d = r.details || {};
    const row = (k, v, cls) => '<dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + (v ? esc(v) : '<span class="hint">not set</span>') + '</dd>';
    $('page').innerHTML = '<div class="crumb noprint"><a data-sact="back">Short Expiry</a> &rsaquo; <b>' + esc(r.outlet) + '</b></div>'
      + '<div class="rhero"><div><h2 class="pt">' + esc(r.outlet) + '</h2><div class="hint">item ' + esc(r.party) + ' · operation ' + esc(r.operation) + (r.batch ? ' · batch / GRN ' + esc(r.batch) : '') + '</div></div><div class="row2 noprint"><button class="btn" data-sact="back">&larr; Back to list</button></div></div>'
      + '<div class="grid"><div class="tile ' + (r.band === 'Expired' || r.band === '0-30' ? 'r' : 'a') + '"><b>' + (r.days_left < 0 ? 'Expired ' + (-r.days_left) + ' days ago' : r.days_left + ' days') + '</b><span>Left until expiry ' + bandTag(r.band) + '</span></div><div class="tile"><b>' + esc(r.base_date || '') + '</b><span>Date of expiration</span></div>'
      + '<div class="tile"><b>' + (r.qty != null ? Number(r.qty).toLocaleString('en-US') : '-') + ' ' + esc(r.unit || '') + '</b><span>Qty remaining</span></div><div class="tile"><b>' + (r.amount ? money(r.amount) : 'not captured') + '</b><span>Value Rs.' + (r.unit_cost ? ' (' + money(r.unit_cost) + ' each)' : '') + '</span></div>'
      + '<div class="tile ' + (r.not_in_plan ? 'r' : '') + '"><b>' + esc(r.not_in_plan ? 'Not in plan' : (r.plan_month || '-')) + '</b><span>Demand plan month</span></div><div class="tile"><b>' + esc(ST[r.status] || r.status) + '</b><span>Status</span></div></div>'
      + '<div class="rgrid"><div class="card"><div class="tlh"><h3>Timeline</h3><div class="chips noprint" id="tlChips"></div><button class="btn noprint" data-ract="present">&#x26F6; Present</button><button class="btn p noprint" data-sact="note">+ Add remark</button></div>'
      + '<div class="hint">Every remark and change on this line, oldest first, with who added it and when.</div><div id="hist" class="tl">Loading...</div><button class="fake noprint" data-sact="note">Write a remark for everyone following this line...</button></div>'
      + '<div class="side"><div class="card plan"><div class="tlh"><h3>Current follow-up</h3>' + (ce ? '<button class="btn noprint" data-sact="edit">&#9998; Update</button>' : '') + '</div><dl>'
      + row('Status', ST[r.status]) + row('Cause', r.reason) + row('Planned action', r.next_step) + row('Who does it', r.next_owner) + row('Action by', r.next_date, late ? 'late' : '') + row('Short remark', r.remarks) + '</dl>'
      + (ce ? '' : '<div class="hint" style="margin-top:8px">You can add remarks. Users with edit access update the follow-up.</div>') + '</div>'
      + '<div class="card plan"><h3>From the operation\'s list</h3><dl>' + row('Reason given', d.reason_text) + row('Current status', d.cur_status) + row('Action in the list', d.sheet_action) + row('Responsible officer', r.owner_name) + row('Operation head', d.op_head)
      + row('List date', d.create_date) + row('First seen', r.first_seen) + row('Last seen', r.last_seen) + '</dl></div></div></div>';
    if (tlItem !== r.id) { tlEv = []; tlF = 'all'; } paintTl(); loadHist(); window.scrollTo(0, 0);
  }

  // ---------- drawers ----------
  const head = (t, r) => '<div class="dh"><div><h3>' + t + '</h3><div class="hint">' + esc(r.outlet) + ' · ' + esc(r.party) + ' · ' + esc(r.operation) + ' · expiry ' + esc(r.base_date || '') + ' ' + bandTag(r.band) + '</div></div><button class="btn" data-sact="close">Close</button></div><div class="frm">';
  const stamp = () => '<div class="stamp">Logged as <b>' + esc(me.full_name || me.username) + '</b>' + (myTitle() ? ' · ' + esc(myTitle()) : '') + ' · ' + esc(fmtDT(new Date())) + '. Remarks cannot be edited later.</div>';
  const opts = (arr, v) => '<option value=""></option>' + (v && !arr.includes(v) ? arr.concat([v]) : arr).map(a => '<option' + (a === v ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
  function open(h) { $('panel').innerHTML = h; $('panel').classList.add('open'); }
  function editDrawer(r) {
    const full = canFull(r.operation);
    open(head('Update follow-up', r) + '<label>Status</label><select id="sStatus">' + Object.keys(ST).map(k => '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + (k === 'written_off' && !full ? ' disabled' : '') + '>' + ST[k] + (k === 'written_off' && !full ? ' (Full access only)' : '') + '</option>').join('') + '</select>'
      + '<label>Cause</label><select id="sCause">' + opts(CAUSES, r.reason) + '</select><label>Planned action</label><select id="sAction">' + opts(ACTIONS, r.next_step) + '</select>'
      + '<label>Who does it</label><input id="sOwner" maxlength="80" value="' + esc(r.next_owner || '') + '"><label>Action by date</label><input id="sDate" type="date" value="' + esc(r.next_date || '') + '">'
      + '<label>Short remark (shown in the list)</label><textarea id="sRem" rows="2" maxlength="300">' + esc(r.remarks || '') + '</textarea>'
      + '<label>Remark for the timeline (optional)</label><textarea id="sNote" rows="3" maxlength="2000" placeholder="e.g. 120 EA transferred to Kandy on 5 Nov, transfer note TN-0451"></textarea>' + stamp()
      + '<div class="row2"><button class="btn p" data-sact="save">Save</button><button class="btn" data-sact="close">Cancel</button></div><div class="err" id="sErr"></div></div>');
  }
  function noteDrawer(r) {
    open(head('Add remark', r) + '<label>Remark</label><textarea id="sNote" rows="6" maxlength="2000" placeholder="e.g. Kandy can sell 200 EA before expiry. Please transfer this week."></textarea>' + stamp()
      + '<div class="row2"><button class="btn p" data-sact="post">Post remark</button><button class="btn" data-sact="close">Cancel</button><span class="hint">Ctrl + Enter</span></div><div class="err" id="sErr"></div></div>');
    setTimeout(() => { const n = $('sNote'); if (n) n.focus(); }, 220);
  }
  async function after(msg) { const id = cur.id; await load(true); closeDrawer(); window.SE_ID = id; go('record', 'short_expiry'); await loadHist(); toast(msg); }
  async function save() {
    const r = cur, v = {status: $('sStatus').value, reason: $('sCause').value || null, next_step: $('sAction').value || null, next_owner: $('sOwner').value.trim() || null, next_date: $('sDate').value || null, remarks: $('sRem').value.trim() || null}, note = $('sNote').value.trim();
    const ch = {}; Object.keys(v).forEach(k => { if ((r[k] || null) !== v[k]) ch[k] = v[k]; });
    if (!Object.keys(ch).length && !note) { $('sErr').textContent = 'Nothing changed'; return; }
    try {
      if (Object.keys(ch).length) await api('/rest/v1/fu_items?id=eq.' + r.id, {method: 'PATCH', body: ch, headers: {Prefer: 'return=minimal'}});
      if (note) await api('/rest/v1/rpc/fu_add_note', {method: 'POST', body: {p_item: r.id, p_note: note}});
      await after('Saved to the timeline');
    } catch (e) { $('sErr').textContent = e.message; }
  }
  async function post() {
    const t = $('sNote').value.trim(); if (!t) { $('sErr').textContent = 'Write the remark first'; return; }
    try { await api('/rest/v1/rpc/fu_add_note', {method: 'POST', body: {p_item: cur.id, p_note: t}}); await after('Remark added'); } catch (e) { $('sErr').textContent = e.message; }
  }

  // ---------- add one line by hand (same fields as the template) ----------
  function addDrawer() {
    const eo = edOps(), o0 = op && eo.some(o => o.code === op) ? op : (eo.length === 1 ? eo[0].code : '');
    const items = {}; X.rows.forEach(r => { if (r.party) items[r.party] = r; });
    open('<div class="dh"><div><h3>Add Short Expiry line</h3><div class="hint">One item / expiry / batch, added by hand. Same follow-up and timeline as an uploaded line.</div></div><button class="btn" data-sact="close">Close</button></div><div class="frm">'
      + '<label>Operation *</label><select id="saOp"><option value="">Choose</option>' + eo.map(o => '<option value="' + o.code + '"' + (o.code === o0 ? ' selected' : '') + '>' + esc(o.code + ' - ' + o.name) + '</option>').join('') + '</select>'
      + '<label>Item code *</label><input id="saCode" list="saCodes" maxlength="40"><datalist id="saCodes">' + Object.values(items).map(r => '<option value="' + esc(r.party) + '">' + esc(r.outlet || '') + '</option>').join('') + '</datalist>'
      + '<label>Item name *</label><input id="saName" maxlength="160">'
      + '<div class="row2"><div style="flex:1"><label>Qty *</label><input id="saQty" inputmode="decimal"></div><div style="flex:1"><label>Unit *</label><input id="saUnit" maxlength="20" placeholder="EA / CTN / KG"></div></div>'
      + '<label>Date of expiration *</label><input id="saExp" type="date">'
      + '<label>Batch / GRN no</label><input id="saBatch" maxlength="60" placeholder="blank if not known">'
      + '<label>Unit cost Rs.</label><input id="saCost" inputmode="decimal" placeholder="value = qty x unit cost">'
      + '<label>Demand plan month</label><input id="saPlan" list="saPlans" maxlength="40" placeholder="e.g. Nov-2026 or Not in plan"><datalist id="saPlans"><option value="Not in plan"></datalist>'
      + '<label>Reason given</label><input id="saWhy" maxlength="200">'
      + '<label>Cause</label><select id="saCause">' + opts(CAUSES, '') + '</select><label>Planned action</label><select id="saAction">' + opts(ACTIONS, '') + '</select>'
      + '<label>Who does it</label><input id="saWho" maxlength="80" value="' + esc(me.full_name || '') + '"><label>Action by date</label><input id="saDate" type="date">'
      + '<div class="err" id="saDup"></div>' + stamp().replace('Remarks cannot be edited later.', 'A hand-added line is not cleared by the next upload: close it here when the stock is cleared.')
      + '<div class="row2"><button class="btn p" data-sact="addsave">Add line</button><button class="btn" data-sact="close">Cancel</button></div><div class="err" id="sErr"></div></div>');
    setTimeout(() => { const f = $(o0 ? 'saCode' : 'saOp'); if (f) f.focus(); }, 220);
  }
  const saKey = () => { const o = $('saOp').value, c = $('saCode').value.trim(), x = $('saExp').value; return o && c && x ? (o + '|' + c + '|' + x + '|' + ($('saBatch').value.trim() || '-')).toUpperCase() : ''; };
  async function addSave() {
    const v = id => $(id).value.trim(), o = v('saOp'), qty = num(v('saQty')), cost = num(v('saCost')), plan = v('saPlan');
    const miss = [['saOp', 'Operation'], ['saCode', 'Item code'], ['saName', 'Item name'], ['saQty', 'Qty'], ['saUnit', 'Unit'], ['saExp', 'Date of expiration']].filter(x => !v(x[0])).map(x => x[1]);
    if (miss.length) { $('sErr').textContent = 'Fill in: ' + miss.join(', '); return; }
    if (qty == null || qty <= 0) { $('sErr').textContent = 'Qty must be a number above 0'; return; }
    if (v('saCost') && (cost == null || cost < 0)) { $('sErr').textContent = 'Unit cost is not a number'; return; }
    const row = {ref_key: saKey(), party: v('saCode'), outlet: v('saName'), owner_name: v('saWho'), amount: cost != null ? Math.round(qty * cost * 100) / 100 : 0, base_date: v('saExp'),
      reason: v('saCause') || (/^not in plan/i.test(plan) ? 'Bought outside demand plan' : ''), next_step: v('saAction'), next_owner: v('saWho'), next_date: v('saDate'),
      details: {unit: v('saUnit'), qty, unit_cost: cost, plan_month: plan, reason_text: v('saWhy'), batch: v('saBatch'), create_date: new Date().toISOString().slice(0, 10)}};
    try {
      const id = await api('/rest/v1/rpc/fu_add_item', {method: 'POST', body: {p_module: 'short_expiry', p_op: o, p_row: row}});
      await load(true); closeDrawer(); location.hash = 'se/' + id; toast(row.party + ' added to ' + o);
    } catch (e) { $('sErr').textContent = e.message; }
  }

  // ---------- upload (reads the template in the browser, nothing is sent until "Load") ----------
  function uploadDrawer(msg) {
    const fo = fullOps(), P = X.parsed;
    let h = '<div class="dh"><div><h3>Upload Short Expiry List</h3><div class="hint">The common template (sheet "Short Expiry List"). Example rows are skipped. Lines of this operation that are not in the new file are closed as Cleared.</div></div><button class="btn" data-sact="close">Close</button></div><div class="frm">'
      + '<label>Excel file (.xlsx)</label><input type="file" id="seFile" accept=".xlsx,.xlsm,.xls">';
    if (P) {
      const opSel = P.op || (op && fo.some(o => o.code === op) ? op : '');
      h += '<label>Operation</label><select id="seOp"><option value="">Choose</option>' + fo.map(o => '<option value="' + o.code + '"' + (o.code === opSel ? ' selected' : '') + '>' + esc(o.code + ' - ' + o.name) + '</option>').join('') + '</select>'
        + (P.opName ? '<div class="hint">The file says: ' + esc(P.opName) + (P.op ? '' : ' (choose the operation)') + '</div>' : '')
        + '<label>List date (as at)</label><input type="date" id="seAsAt" value="' + esc(P.asAt || '') + '">'
        + '<div class="stamp"><b>' + esc(P.file) + '</b><br>' + P.lines.length + ' lines · value ' + money(P.lines.reduce((s, l) => s + l.amount, 0)) + ' · expired ' + P.lines.filter(l => l.days < 0).length + ' · within 30 days ' + P.lines.filter(l => l.days >= 0 && l.days <= 30).length + ' · not in plan ' + P.lines.filter(l => l.details.plan_month && /^not in plan/i.test(l.details.plan_month)).length
        + (P.examples ? '<br>' + P.examples + ' example rows skipped' : '') + (P.officer ? '<br>Responsible officer: ' + esc(P.officer) + (P.head ? ' · Head: ' + esc(P.head) : '') : '') + '</div>';
      if (P.problems.length) h += '<div class="err" style="max-height:170px;overflow-y:auto">' + P.problems.length + ' problems in the file:<br>' + P.problems.slice(0, 40).map(esc).join('<br>') + (P.problems.length > 40 ? '<br>...' : '') + '</div>';
      const willClose = opSel ? X.rows.filter(r => r.operation === opSel && isOpen(r) && !P.lines.some(l => (opSel + '|' + l.key) === r.ref_key)).length : 0;
      if (willClose) h += '<div class="hint" style="color:var(--warn)">' + willClose + ' open lines of ' + esc(opSel) + ' are not in this file and will be closed as Cleared.</div>';
      h += '<div class="row2"><button class="btn p" data-sact="load"' + (P.blocking ? ' disabled' : '') + '>Load ' + P.lines.length + ' lines into the system</button><button class="btn" data-sact="close">Cancel</button></div>' + (P.blocking ? '<div class="err">' + esc(P.blocking) + '</div>' : '');
    }
    h += '<div class="err" id="sErr">' + esc(msg || '') + '</div></div>';
    const ups = X.imports.slice(0, 12);
    h += '<h4 class="dh4">Lists loaded</h4>' + (ups.length ? '<table><tbody>' + ups.map(i => '<tr><td>' + esc(i.operation) + '</td><td>' + esc(i.as_at) + '</td><td>' + i.rows_in + ' lines<br><span class="hint">' + i.rows_new + ' new · ' + i.rows_closed + ' closed</span></td><td class="hint">' + esc(i.by_name || '') + '</td></tr>').join('') + '</tbody></table>' : '<div class="hint">None yet.</div>');
    open(h);
  }
  function loadLib() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the Excel reader. Check the internet connection.')); document.head.appendChild(s); });
  }
  const iso = v => {
    if (v == null || v === '') return '';
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
    const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    if ((m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    if ((m = s.match(/^(\d{1,2})[-./ ]([A-Za-z]{3})[A-Za-z]*[-./ ](\d{4})/))) { const mo = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase()) / 3 + 1; if (mo >= 1) return m[3] + '-' + String(mo).padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
    return '';
  };
  const num = v => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).replace(/[, ]/g, '')); return isNaN(n) ? null : n; };
  async function readFile(file) {
    await loadLib();
    const wb = XLSX.read(await file.arrayBuffer(), {type: 'array'});
    const ws = wb.Sheets['Short Expiry List'] || wb.Sheets[wb.SheetNames[0]];
    const cell = a => { const c = ws[a]; return c ? c.v : null; }, txt = a => String(cell(a) == null ? '' : cell(a)).trim();
    const opName = txt('C4'), asAt = iso(cell('I4')), head = txt('C5'), officer = txt('I5');
    const opKey = opName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''), opCode = OPMAP[opKey] || (ops.find(o => nk(o.code) === nk(opName) || nk(o.name) === nk(opName)) || {}).code || '';
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Q207'), lines = [], problems = [], seen = {};
    let examples = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let R = 8; R <= Math.max(range.e.r + 1, 8); R++) {
      const g = c => cell(c + R), t = c => String(g(c) == null ? '' : g(c)).trim();
      if (!['B', 'C', 'D', 'E', 'F'].some(c => t(c) !== '')) continue;
      if (/^example/i.test(t('C')) || /^example/i.test(t('B'))) { examples++; continue; }
      const exp = iso(g('F')), qty = num(g('E')), cost = num(g('M')), miss = [['B', 'Item Code'], ['C', 'Item Name'], ['D', 'Unit'], ['E', 'Qty'], ['F', 'Date of Expiration'], ['I', 'Demand Plan Month'], ['J', 'Reason'], ['K', 'Current Status']].filter(x => t(x[0]) === '').map(x => x[1]);
      if (miss.length) problems.push('Row ' + R + ': ' + miss.join(', ') + ' blank');
      if (t('F') && !exp) problems.push('Row ' + R + ': expiry date not readable (' + t('F') + ')');
      if (t('E') && qty == null) problems.push('Row ' + R + ': Qty is not a number');
      if (!exp || !t('B')) continue;
      const key = (t('B') + '|' + exp + '|' + (t('L') || '-')).toUpperCase();
      if (seen[key]) { problems.push('Row ' + R + ': same item, expiry and batch as row ' + seen[key] + ' (merge them into one line)'); continue; }
      seen[key] = R;
      const plan = t('I'), days = Math.round((new Date(exp + 'T00:00:00') - today) / 864e5);
      lines.push({key, days, ref_key: '', party: t('B'), outlet: t('C'), owner_name: officer && !/^example/i.test(officer) ? officer : null, amount: qty != null && cost != null ? Math.round(qty * cost * 100) / 100 : 0, base_date: exp,
        reason: /^not in plan/i.test(plan) ? 'Bought outside demand plan' : null, next_step: t('O') || null, next_date: iso(g('P')) || null, next_owner: officer && !/^example/i.test(officer) ? officer : null,
        details: {unit: t('D'), qty, unit_cost: cost, plan_month: plan, reason_text: t('J'), cur_status: t('K'), batch: t('L'), sheet_action: t('O'), create_date: asAt, op_head: /^example/i.test(head) ? '' : head, row: R}});
    }
    X.parsed = {file: file.name, opName, op: opCode && fullOps().some(o => o.code === opCode) ? opCode : '', asAt, head, officer: /^example/i.test(officer) ? '' : officer, lines, problems, examples,
      blocking: !lines.length ? 'No lines to load (only example or blank rows).' : ''};
    uploadDrawer();
  }
  async function loadList() {
    const P = X.parsed, o = $('seOp').value, asAt = $('seAsAt').value;
    if (!o) { $('sErr').textContent = 'Choose the operation'; return; }
    if (!asAt) { $('sErr').textContent = 'Set the list date'; return; }
    const rowsOut = P.lines.map(l => Object.assign({}, l, {ref_key: o + '|' + l.key, key: undefined, days: undefined, details: Object.assign({}, l.details, {create_date: asAt})}));
    try {
      const r = await api('/rest/v1/rpc/fu_apply_import', {method: 'POST', body: {p_module: 'short_expiry', p_op: o, p_as_at: asAt, p_file: P.file, p_rows: rowsOut}});
      X.parsed = null; await load(true); closeDrawer(); go('items', 'short_expiry');
      toast(o + ': ' + r.rows + ' lines loaded (' + r.new + ' new, ' + r.closed + ' cleared)');
    } catch (e) { $('sErr').textContent = e.message; }
  }

  // ---------- dashboard and report ----------
  function dash() {
    const act = scope().filter(isOpen), grp = (f, fv) => { const m = {}; act.forEach(r => { const k = f(r) || '(not set)'; m[k] = (m[k] || 0) + (fv ? fv(r) : Number(r.amount || 0)); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const bandBars = BANDS.slice(0, 4).map(b => [b === 'Expired' ? 'Expired' : b + ' days', val(act.filter(r => r.band === b)), b === 'Expired' || b === '0-30' ? 'var(--danger)' : b === '31-60' ? 'var(--accent)' : 'var(--warn)']);
    const top = act.slice().sort((a, b) => b.amount - a.amount).slice(0, 10).map(r => [r.outlet + ' (' + r.operation + ')', Number(r.amount || 0), r.band === 'Expired' || r.band === '0-30' ? 'var(--danger)' : 'var(--primary)']);
    const wk = new Date(); wk.setDate(wk.getDate() + 7); const w = wk.toISOString().slice(0, 10), due = act.filter(r => r.next_date && r.next_date <= w).sort((a, b) => a.next_date < b.next_date ? -1 : 1);
    $('page').innerHTML = '<h2 class="pt">Short Expiry dashboard</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' · open lines</div>'
      + '<div class="grid"><div class="tile"><b>' + money0(val(act)) + '</b><span>Short-expiry value (' + act.length + ' lines)</span></div><div class="tile r"><b>' + money0(val(act.filter(r => r.band === 'Expired' || r.band === '0-30'))) + '</b><span>Expired or within 30 days</span></div>'
      + '<div class="tile a"><b>' + (act.length ? Math.round(100 * act.filter(r => r.not_in_plan).length / act.length) : 0) + '%</b><span>Lines bought outside the demand plan (target 0)</span></div><div class="tile r"><b>' + act.filter(r => (r.band === 'Expired' || r.band === '0-30') && !r.next_step).length + '</b><span>Red lines with no action</span></div><div class="tile r"><b>' + act.filter(r => r.action_overdue).length + '</b><span>Actions overdue</span></div></div>'
      + '<div class="grid2"><div class="card"><h3>Value by alert</h3>' + bars(bandBars, money0) + '</div>' + (op ? '' : '<div class="card"><h3>Value by operation</h3>' + bars(grp(r => r.operation), money0) + '</div>')
      + '<div class="card"><h3>Planned action (value)</h3>' + bars(grp(r => r.next_step), money0) + '</div><div class="card"><h3>Cause (lines)</h3>' + bars(grp(r => r.reason, () => 1), v => v) + '</div>'
      + '<div class="card"><h3>Top 10 lines by value</h3>' + bars(top, money0) + '</div><div class="card"><h3>Actions due in 7 days (' + due.length + ')</h3>' + (due.length ? '<table><tbody>' + due.slice(0, 12).map(r => '<tr class="row" data-se="' + r.id + '"><td>' + esc(r.next_date) + '</td><td>' + esc(r.outlet) + '<br><span class="hint">' + esc(r.next_step || '') + '</span></td><td class="n">' + money0(r.amount) + '</td></tr>').join('') + '</tbody></table>' : '<div class="hint">None.</div>') + '</div></div>';
  }
  function report() {
    const all = scope(), act = all.filter(isOpen), opsIn = [...new Set(all.map(r => r.operation))].sort();
    const s = o => { const a = act.filter(r => r.operation === o), b = k => val(a.filter(r => r.band === k)); const li = X.imports.find(i => i.operation === o); return [o, a.length, val(a), b('Expired'), b('0-30'), b('31-60'), b('61-90'), a.filter(r => r.not_in_plan).length, a.filter(r => !r.next_step).length, a.filter(r => r.action_overdue).length, li ? li.as_at : '']; };
    const rs = opsIn.map(s);
    $('page').innerHTML = '<div class="noprint row2"><button class="btn p" id="seP">Print / Save as PDF</button><button class="btn" id="seC">Download all lines (CSV)</button></div><h2 class="pt">Short Expiry report</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' · as at ' + new Date().toISOString().slice(0, 10) + ' · open lines · Iceman IMS</div>'
      + '<div class="wrap"><table><thead><tr><th>Operation</th><th class="n">Lines</th><th class="n">Value</th><th class="n">Expired</th><th class="n">0-30</th><th class="n">31-60</th><th class="n">61-90</th><th class="n">Not in plan</th><th class="n">No action</th><th class="n">Overdue</th><th>Last list</th></tr></thead><tbody>'
      + rs.map(x => '<tr><td>' + esc(x[0]) + '</td><td class="n">' + x[1] + '</td>' + x.slice(2, 7).map(v => '<td class="n">' + (v ? money0(v) : '') + '</td>').join('') + '<td class="n">' + x[7] + '</td><td class="n">' + x[8] + '</td><td class="n">' + x[9] + '</td><td>' + esc(x[10]) + '</td></tr>').join('')
      + '<tr style="font-weight:700"><td>Total</td><td class="n">' + act.length + '</td>' + [2, 3, 4, 5, 6].map(i => '<td class="n">' + money0(rs.reduce((t, x) => t + x[i], 0)) + '</td>').join('') + [7, 8, 9].map(i => '<td class="n">' + rs.reduce((t, x) => t + x[i], 0) + '</td>').join('') + '<td></td></tr></tbody></table></div>'
      + '<div class="card" style="margin-top:12px"><h3>Red lines (expired or within 30 days)</h3><table><thead><tr><th>Op</th><th>Item</th><th>Expiry</th><th class="n">Value</th><th>Planned action</th><th>By</th><th>Who</th></tr></thead><tbody>'
      + act.filter(r => r.band === 'Expired' || r.band === '0-30').sort((a, b) => b.amount - a.amount).map(r => '<tr><td>' + esc(r.operation) + '</td><td>' + esc(r.party + ' ' + r.outlet) + '</td><td>' + esc(r.base_date) + '</td><td class="n">' + money(r.amount) + '</td><td>' + esc(r.next_step || 'none') + '</td><td>' + esc(r.next_date || '') + '</td><td>' + esc(r.next_owner || '') + '</td></tr>').join('') + '</tbody></table></div>';
    $('seP').onclick = () => window.print();
    $('seC').onclick = () => {
      const cols = [['Operation', 'operation'], ['Item code', 'party'], ['Item name', 'outlet'], ['Unit', 'unit'], ['Qty', 'qty'], ['Expiry', 'base_date'], ['Days left', 'days_left'], ['Alert', 'band'], ['Plan month', 'plan_month'], ['Reason given', 'reason_text'], ['Current status', 'cur_status'], ['Batch / GRN', 'batch'], ['Unit cost', 'unit_cost'], ['Value', 'amount'], ['Cause', 'reason'], ['Planned action', 'next_step'], ['Action by', 'next_date'], ['Who', 'next_owner'], ['Status', 'status'], ['Short remark', 'remarks']];
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', csv = '﻿' + cols.map(c => q(c[0])).join(',') + '\r\n' + all.map(r => cols.map(c => q(c[1] === 'status' ? ST[r.status] : r[c[1]])).join(',')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = 'Short Expiry ' + (op || 'all') + ' ' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    };
  }
  function card(m) {
    const a = X.rows.filter(isOpen);
    return '<div class="card mcard" data-mod="short_expiry" data-go="items"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + money0(val(a)) + '</div><div class="hint">' + a.length + ' open lines · ' + a.filter(r => r.band === 'Expired' || r.band === '0-30').length + ' red · ' + a.filter(r => r.action_overdue).length + ' overdue</div></div>';
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const rr = e.target.closest('[data-se]'); if (rr) { location.hash = 'se/' + rr.dataset.se; return; }
    const b = e.target.closest('[data-sact]'); if (!b || b.disabled) return;
    const k = b.dataset.sact;
    if (k === 'back') { history.replaceState(null, '', location.pathname + location.search); go('items', 'short_expiry'); }
    else if (k === 'close') closeDrawer();
    else if (k === 'upload') { X.parsed = null; uploadDrawer(); }
    else if (k === 'add') addDrawer();
    else if (k === 'addsave') guard(addSave);
    else if (k === 'load') guard(loadList);
    else if (k === 'edit') editDrawer(cur);
    else if (k === 'note') noteDrawer(cur);
    else if (k === 'save') guard(save);
    else if (k === 'post') guard(post);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'seFile' && t.files[0]) { readFile(t.files[0]).catch(er => uploadDrawer('Could not read the file: ' + er.message)); return; }
    if (t.id === 'seOp' && X.parsed) { X.parsed.op = t.value; uploadDrawer(); return; }
    if (t.id === 'seAsAt' && X.parsed) { X.parsed.asAt = t.value; return; }
    const m = {seStatus: 'status', seBand: 'band', sePlan: 'plan', seAction: 'action'}[t.id]; if (m) { X.f[m] = t.value; list(); }
  });
  // add-line drawer: fill the name and unit from a known item code, warn when the same line is already there
  document.addEventListener('input', e => {
    if (!['saOp', 'saCode', 'saExp', 'saBatch'].includes(e.target.id)) return;
    if (e.target.id === 'saCode') { const k = e.target.value.trim().toUpperCase(), r = X.rows.find(x => String(x.party || '').toUpperCase() === k); if (r) { if (!$('saName').value) $('saName').value = r.outlet || ''; if (!$('saUnit').value) $('saUnit').value = r.unit || ''; if (!$('saCost').value && r.unit_cost) $('saCost').value = r.unit_cost; } }
    const key = saKey(), same = key && X.rows.find(r => r.ref_key === key);
    $('saDup').textContent = same ? 'This item with the same expiry and batch is already in ' + same.operation + ' (' + (ST[same.status] || same.status) + '). Open it from the list instead.' : '';
  });
  document.addEventListener('change', e => { if (e.target.id === 'saOp' || e.target.id === 'saExp') e.target.dispatchEvent(new Event('input', {bubbles: true})); });
  document.addEventListener('input', e => { if (e.target.id === 'seText') { X.f.text = e.target.value; const p = e.target.selectionStart; list(); const t = $('seText'); t.focus(); t.setSelectionRange(p, p); } });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'sNote' && $('panel').querySelector('[data-sact="post"]')) { e.preventDefault(); guard(post); } });

  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {short_expiry: {items: () => run(list), dash: () => run(dash), report: () => run(report), record: () => run(record), card}});
  window.seWarm = () => load().catch(() => {});
  window.IMSX = {loadLib, iso, num};   // Excel reader helpers shared with the Outstanding upload
})();
