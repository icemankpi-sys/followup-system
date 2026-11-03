// Iceman IMS - FOC section (2026-11-03), first sub-category MT-Colombo, from "Due From CCS Updated 04.26.xlsx" sheet PENDING M.WISE
// One pending FOC line = one follow-up item (module 'foc', operation MT). Follow-up by age from the invoice date, like Outstanding:
//   0-30 days = monitor (new FOC) · 31-60 days = collect (next step + date) · over 60 days = reason needed.
// Loaded before the main script; uses the main script's globals at run time (api, $, esc, money, money0, op, me, ops, lvl, rank, go, bars,
// toast, closeDrawer, fmtDT, guard, cur, tlEv, tlF, tlItem, paintTl, loadHist, myTitle, ageCls, ageKey, IMSX).
(function () {
  const X = {rows: [], at: 0, imports: [], lists: {reason: [], next_step: []}, f: {stage: '', status: 'active', type: '', sent: '', flag: '', text: ''}, parsed: null};
  const ST = {open: 'Open', action_pending: 'Sent for passing', promised: 'Approval promised', dispute: 'Rejected / dispute', settled: 'Collected (passed)', written_off: 'Written off'};
  const REASONS = ['Not yet sent for passing', 'Sent, awaiting approval', 'Approval document missing (PR / request)', 'FOC Ref No missing or wrong', 'Amount differs (part passed)', 'Rejected / not accepted', 'Late submission (after year-end)', 'Discount bank upload issue', 'Old system matter (2024)', 'Other'];
  const STEPS = ['Send / resend for passing', 'Get the approval document signed', 'Correct the FOC Ref No / amount', 'Follow up with the approver', 'Check the discount bank statement', 'Escalate to Operation Head', 'Refer to Director', 'Write-off request'];
  // sub-categories of FOC: one operation each (more can be added here when their lists come)
  const SUBS = [{op: 'MT', name: 'MT-Colombo'}];
  const subName = o => (SUBS.find(s => s.op === o) || {}).name || o;
  const STAGES = {monitor: ['New (0-30 days)', 't-g'], collect: ['Collect (31-60 days)', 't-a'], reason: ['Over 60: reason', 't-r']};
  const BANDS = ['0-30', '31-60', '61-90', '91-180', '181-365', 'Over 365'];
  const isOpen = r => !['settled', 'written_off'].includes(r.status);
  const val = l => l.reduce((s, r) => s + Number(r.amount || 0), 0);
  const stageTag = r => { const s = STAGES[r.stage]; return s ? '<span class="tag ' + s[1] + '">' + s[0] + '</span>' : ''; };
  const scope = () => X.rows.filter(r => !op || r.operation === op);
  const canEd = o => rank(lvl(o, 'foc')) >= 2, canFull = o => rank(lvl(o, 'foc')) >= 3;
  const fullOps = () => ops.filter(o => canFull(o.code)), edOps = () => ops.filter(o => canEd(o.code));
  const lastAs = o => { const i = X.imports.find(x => !o || x.operation === o); return i ? i.as_at : ''; };
  const isNew = r => { const a = lastAs(r.operation); return a && r.first_seen === a && X.imports.filter(i => i.operation === r.operation).length > 1; };
  const reasons = () => X.lists.reason.length ? X.lists.reason : REASONS, steps = () => X.lists.next_step.length ? X.lists.next_step : STEPS;
  const today = () => new Date().toISOString().slice(0, 10);

  async function load(force) {
    if (!force && X.at && Date.now() - X.at < 60000) return;
    const [r, im, l] = await Promise.all([api('/rest/v1/v_foc?select=*&order=base_date.asc&limit=5000'),
      api('/rest/v1/fu_imports?module=eq.foc&select=operation,as_at,file_name,rows_in,rows_new,rows_closed,total_in,by_name&order=as_at.desc,id.desc&limit=200').catch(() => []),
      api('/rest/v1/fu_lists?module=eq.foc&order=sort&select=kind,value').catch(() => [])]);
    X.rows = r || []; X.imports = im || [];
    X.lists = {reason: (l || []).filter(x => x.kind === 'reason').map(x => x.value), next_step: (l || []).filter(x => x.kind === 'next_step').map(x => x.value)};
    X.at = Date.now();
  }
  async function run(fn) { $('page').innerHTML = '<div class="hint">Loading...</div>'; try { await load(); fn(); } catch (e) { $('page').innerHTML = '<div class="card err">Could not load: ' + esc(e.message) + (/v_foc/.test(e.message) ? '<br>Run "25 FOC MT-Colombo.sql" in Supabase first.' : '') + '</div>'; } }
  const sel = (id, opts, v) => '<select id="' + id + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  const subChips = () => '<div class="chips noprint" style="margin:6px 0">' + SUBS.filter(s => ops.some(o => o.code === s.op && rank(lvl(o.code, 'foc')) > 0)).map(s => '<button data-fsub="' + s.op + '"' + (op === s.op ? ' class="on"' : '') + '>' + esc(s.name) + '</button>').join('') + '</div>';
  function tiles(act) {
    const o60 = act.filter(r => r.stage === 'reason'), c = act.filter(r => r.stage === 'collect'), nw = act.filter(r => r.stage === 'monitor'), big = act.slice().sort((a, b) => b.amount - a.amount)[0];
    return '<div class="grid"><div class="tile"><b>' + money0(val(act)) + '</b><span>Open FOC (' + act.length + ' lines)</span></div>'
      + '<div class="tile r"><b>' + money0(val(o60)) + '</b><span>Over 60 days (' + o60.length + ') · ' + o60.filter(r => r.need_reason).length + ' without a reason</span></div>'
      + '<div class="tile a"><b>' + money0(val(c)) + '</b><span>31-60 days, collect (' + c.length + ') · ' + c.filter(r => r.incomplete).length + ' without next step / date</span></div>'
      + '<div class="tile"><b>' + money0(val(nw)) + '</b><span>New, 0-30 days (' + nw.length + ') · ' + act.filter(isNew).length + ' new in the last upload</span></div>'
      + '<div class="tile r"><b>' + act.filter(r => r.action_overdue).length + '</b><span>Actions overdue</span></div>'
      + (big ? '<div class="tile a"><b>' + money0(big.amount) + '</b><span>Largest line: ' + esc(big.outlet) + ' ' + esc(big.foc_ref || '') + ' (' + Math.round(100 * big.amount / Math.max(1, val(act))) + '% of open)</span></div>' : '') + '</div>';
  }

  // ---------- lines ----------
  function filtered() {
    const F = X.f, t = F.text.toLowerCase();
    return scope().filter(r => (F.status === 'all' || (F.status === 'active' ? isOpen(r) : !isOpen(r))) && (!F.stage || r.stage === F.stage) && (!F.type || (r.foc_type || '(not given)') === F.type) && (!F.sent || (r.sent_month || '(not given)') === F.sent)
      && (!F.flag || (F.flag === 'reason' ? r.need_reason : F.flag === 'step' ? r.incomplete : F.flag === 'overdue' ? r.action_overdue : F.flag === 'new' ? isNew(r) : F.flag === 'noref' ? !r.foc_ref : F.flag === 'big' ? r.amount >= 100000 : true))
      && (!t || [r.rec_code, r.ref_key, r.foc_ref, r.outlet, r.foc_type, r.reason, r.next_step].some(v => String(v || '').toLowerCase().includes(t))));
  }
  function list() {
    const F = X.f, all = scope(), act = all.filter(isOpen), L = filtered(), la = lastAs(op);
    const types = [...new Set(all.map(r => r.foc_type || '(not given)'))].sort(), sents = [...new Set(all.map(r => r.sent_month || '(not given)'))];
    $('page').innerHTML = '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">FOC' + (op ? ' · ' + esc(subName(op)) : '') + '</h2><div class="hint">' + (op ? 'Sub-category ' + esc(subName(op)) : 'All my sub-categories') + ' · free-of-charge lines not yet passed · age from the invoice date'
      + (la ? ' · last list as at ' + esc(la) : ' · no list uploaded yet') + '</div></div><div class="row2">' + (edOps().length ? '<button class="btn" data-fact="add">+ Add FOC line</button>' : '') + (fullOps().length ? '<button class="btn p" data-fact="upload">&#8679; Upload FOC List</button>' : '') + '</div></div>'
      + subChips() + tiles(act)
      + '<div class="filters row2"><input id="fcText" placeholder="Search invoice, FOC Ref, customer, type" value="' + esc(F.text) + '" style="min-width:200px">'
      + sel('fcStatus', [['active', 'Open lines'], ['closed', 'Collected / written off'], ['all', 'All lines']], F.status)
      + sel('fcStage', [['', 'All ages'], ['reason', 'Over 60 days (reason)'], ['collect', '31-60 days (collect)'], ['monitor', '0-30 days (new)']], F.stage)
      + sel('fcFlag', [['', 'All lines'], ['reason', 'Over 60, no reason yet'], ['step', 'No next step / date'], ['overdue', 'Action overdue'], ['new', 'New in last upload'], ['noref', 'No FOC Ref No'], ['big', 'Rs 100,000 and above']], F.flag)
      + sel('fcType', [['', 'All FOC types']].concat(types.map(x => [x, x])), F.type) + sel('fcSent', [['', 'All sent months']].concat(sents.map(x => [x, x])), F.sent) + '</div>'
      + '<div class="hint">' + L.length + ' lines · ' + money(val(L)) + ' ' + ageKey() + '</div>'
      + '<div class="wrap"><table style="min-width:1150px"><thead><tr><th class="n">#</th><th>No</th><th>Inv date</th><th>Invoice</th><th>FOC Ref</th><th>Customer / subject</th><th>FOC type</th><th>Sent</th><th class="n">Days</th><th>Stage</th><th class="n">Balance</th><th>Reason</th><th>Next step</th><th>Next date</th><th>Status</th></tr></thead><tbody>'
      + (L.length ? L.map((r, i) => '<tr class="row' + ageCls(r) + '" data-fc="' + r.id + '"><td class="n hint">' + (i + 1) + '</td><td class="rno">' + esc(r.rec_code || '') + '</td><td>' + esc(r.base_date || '') + '</td><td>' + esc(r.details && r.details.inv_no || r.ref_key) + '</td>'
        + '<td>' + (r.foc_ref ? esc(r.foc_ref) + (r.ref_group ? ' <span class="hint" title="Blank in the sheet: Ref of the line above">(group)</span>' : '') : '<span class="tag t-a">no ref</span>') + '</td><td><b>' + esc(r.outlet) + '</b>' + (isNew(r) ? ' <span class="tag t-g">new</span>' : '') + '</td><td>' + esc(r.foc_type || '') + '</td><td>' + esc(r.sent_month || '') + '</td>'
        + '<td class="n">' + (r.aging_days != null ? r.aging_days : '') + '</td><td>' + stageTag(r) + '</td><td class="n">' + money(r.amount) + '</td>'
        + '<td>' + (r.reason ? esc(r.reason) : r.need_reason ? '<span class="tag t-r">reason needed</span>' : '') + '</td><td>' + (r.next_step ? esc(r.next_step) : r.incomplete ? '<span class="tag t-a">not set</span>' : '') + '</td>'
        + '<td' + (r.action_overdue ? ' style="color:var(--danger);font-weight:600"' : '') + '>' + esc(r.next_date || '') + '</td><td>' + esc(ST[r.status] || r.status) + '</td></tr>').join('')
        : '<tr><td colspan="15" class="hint">' + (all.length ? 'No lines match the filters.' : 'No FOC list loaded yet. Press "Upload FOC List" and choose the Due From CCS workbook.') + '</td></tr>')
      + '</tbody>' + (L.length ? '<tfoot><tr style="font-weight:700"><td colspan="10">Total ' + L.length + ' lines</td><td class="n">' + money(val(L)) + '</td><td colspan="4"></td></tr></tfoot>' : '') + '</table></div>';
  }

  // ---------- record ----------
  function record() {
    const r = X.rows.find(x => x.id === window.FC_ID);
    if (!r) { $('page').innerHTML = '<div class="card">This FOC line was not found, or you do not have access.<div class="row2"><button class="btn p" data-fact="back">Back to FOC</button></div></div>'; return; }
    cur = r; const ce = canEd(r.operation), d = r.details || {};
    const row = (k, v, cls) => '<dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + (v ? esc(v) : '<span class="hint">not set</span>') + '</dd>';
    const need = r.need_reason ? 'Over 60 days: say why it is not passed yet (Reason).' : r.stage === 'collect' && r.incomplete ? '31-60 days: set the next step and the date to collect it.' : r.stage === 'monitor' && !r.foc_ref ? 'New line without a FOC Ref No: get the Ref before sending for passing.' : '';
    $('page').innerHTML = '<div class="crumb noprint"><a data-fact="back">FOC · ' + esc(subName(r.operation)) + '</a> &rsaquo; <b>' + esc(r.outlet) + '</b></div>'
      + '<div class="rhero"><div><h2 class="pt">' + (r.rec_code ? '<span class="rtag">' + esc(r.rec_code) + '</span> ' : '') + esc(r.outlet) + '</h2><div class="hint">invoice ' + esc(d.inv_no || r.ref_key) + ' · ' + esc(r.foc_ref || 'no FOC Ref') + ' · ' + esc(subName(r.operation)) + '</div></div><div class="row2 noprint"><button class="btn" data-fact="back">&larr; Back to list</button></div></div>'
      + (need && isOpen(r) ? '<div class="card" style="border-left:4px solid var(--danger)"><b>Needed now:</b> ' + esc(need) + (ce ? ' <button class="btn p" data-fact="edit">Update</button>' : '') + '</div>' : '')
      + '<div class="grid"><div class="tile ' + (r.stage === 'reason' ? 'r' : r.stage === 'collect' ? 'a' : '') + '"><b>' + (r.aging_days != null ? r.aging_days + ' days' : 'no date') + '</b><span>Since the invoice ' + stageTag(r) + '</span></div><div class="tile"><b>' + money(r.amount) + '</b><span>Balance not passed</span></div>'
      + '<div class="tile"><b>' + esc(r.foc_ref || '-') + '</b><span>FOC Ref No' + (r.ref_group ? ' (taken from the line above)' : '') + '</span></div><div class="tile"><b>' + esc(r.base_date || '-') + '</b><span>Invoice date</span></div>'
      + '<div class="tile"><b>' + esc(r.sent_month || '-') + '</b><span>Sent for passing (month)</span></div><div class="tile"><b>' + esc(ST[r.status] || r.status) + '</b><span>Status</span></div></div>'
      + '<div class="rgrid"><div class="card"><div class="tlh"><h3>Timeline</h3><div class="chips noprint" id="tlChips"></div><button class="btn noprint" data-ract="present">&#x26F6; Present</button><button class="btn p noprint" data-fact="note">+ Add remark</button></div>'
      + '<div class="hint">Every remark and change on this line, oldest first, with who added it and when.</div><div id="hist" class="tl">Loading...</div><button class="fake noprint" data-fact="note">Write a remark for everyone following this line...</button></div>'
      + '<div class="side"><div class="card plan"><div class="tlh"><h3>Current follow-up</h3>' + (ce ? '<button class="btn noprint" data-fact="edit">&#9998; Update</button>' : '') + '</div><dl>'
      + row('Status', ST[r.status]) + row('Reason (why not passed)', r.reason, r.need_reason ? 'late' : '') + row('Next step', r.next_step) + row('Who does it', r.next_owner) + row('Next date', r.next_date, r.action_overdue ? 'late' : '') + row('Approval promised by', r.promised_date, r.promise_broken ? 'late' : '') + row('Short remark', r.remarks) + '</dl>'
      + (ce ? '' : '<div class="hint" style="margin-top:8px">You can add remarks. Users with edit access update the follow-up.</div>') + '</div>'
      + '<div class="card plan"><h3>From the FOC list</h3><dl>' + row('Invoice no', d.inv_no || r.ref_key) + row('FOC type (remark)', r.foc_type) + row('Sent month', r.sent_month) + row('Sheet row', d.row ? String(d.row) : '') + (d.date_text ? row('Date in the sheet', d.date_text + ' (typo, read as ' + r.base_date + ')') : '')
      + row('First seen', r.first_seen) + row('Last seen', r.last_seen) + (d.manual ? row('Added by hand', d.added_by || 'yes') : '') + '</dl></div></div></div>';
    if (tlItem !== r.id) { tlEv = []; tlF = 'all'; } paintTl(); loadHist(); window.scrollTo(0, 0);
  }

  // ---------- drawers ----------
  const head = (t, r) => '<div class="dh"><div><h3>' + t + '</h3><div class="hint">' + esc(r.outlet) + ' · ' + esc(r.foc_ref || 'no ref') + ' · invoice ' + esc(r.ref_key) + ' · ' + money(r.amount) + ' · ' + (r.aging_days != null ? r.aging_days + ' days ' : '') + stageTag(r) + '</div></div><button class="btn" data-fact="close">Close</button></div><div class="frm">';
  const stamp = () => '<div class="stamp">Logged as <b>' + esc(me.full_name || me.username) + '</b>' + (myTitle() ? ' · ' + esc(myTitle()) : '') + ' · ' + esc(fmtDT(new Date())) + '. Remarks cannot be edited later.</div>';
  const opts = (arr, v) => '<option value=""></option>' + (v && !arr.includes(v) ? arr.concat([v]) : arr).map(a => '<option' + (a === v ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
  function open(h) { $('panel').innerHTML = h; $('panel').classList.add('open'); }
  function editDrawer(r) {
    const full = canFull(r.operation);
    open(head('Update follow-up', r) + '<label>Status</label><select id="fStatus2">' + Object.keys(ST).map(k => '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + (k === 'written_off' && !full ? ' disabled' : '') + '>' + ST[k] + (k === 'written_off' && !full ? ' (Full access only)' : '') + '</option>').join('') + '</select>'
      + '<label>Reason: why is it not passed yet?' + (r.stage === 'reason' ? ' *' : '') + '</label><select id="fReason">' + opts(reasons(), r.reason) + '</select>'
      + '<label>Next step' + (r.stage !== 'monitor' ? ' *' : '') + '</label><select id="fStep">' + opts(steps(), r.next_step) + '</select>'
      + '<label>Who does it</label><input id="fWho" maxlength="80" value="' + esc(r.next_owner || '') + '"><label>Next date' + (r.stage !== 'monitor' ? ' *' : '') + '</label><input id="fDate" type="date" value="' + esc(r.next_date || '') + '">'
      + '<label>Approval promised by (date)</label><input id="fProm" type="date" value="' + esc(r.promised_date || '') + '">'
      + '<label>Short remark (shown in the list)</label><textarea id="fRem" rows="2" maxlength="300">' + esc(r.remarks || '') + '</textarea>'
      + '<label>Remark for the timeline</label><textarea id="fNote" rows="3" maxlength="2000" placeholder="e.g. Approval form signed by the Head of Marketing on 5 Nov, sent with the October list"></textarea>' + stamp()
      + '<div class="row2"><button class="btn p" data-fact="save">Save</button><button class="btn" data-fact="close">Cancel</button></div><div class="err" id="fErr"></div></div>');
  }
  function noteDrawer(r) {
    open(head('Add remark', r) + '<label>Remark</label><textarea id="fNote" rows="6" maxlength="2000" placeholder="e.g. Called the approver, will pass with the November list."></textarea>' + stamp()
      + '<div class="row2"><button class="btn p" data-fact="post">Post remark</button><button class="btn" data-fact="close">Cancel</button><span class="hint">Ctrl + Enter</span></div><div class="err" id="fErr"></div></div>');
    setTimeout(() => { const n = $('fNote'); if (n) n.focus(); }, 220);
  }
  async function after(msg) { const id = cur.id; await load(true); closeDrawer(); window.FC_ID = id; go('record', 'foc'); await loadHist(); toast(msg); }
  async function save() {
    const r = cur, v = {status: $('fStatus2').value, reason: $('fReason').value || null, next_step: $('fStep').value || null, next_owner: $('fWho').value.trim() || null, next_date: $('fDate').value || null, promised_date: $('fProm').value || null, remarks: $('fRem').value.trim() || null}, note = $('fNote').value.trim();
    const live = !['settled', 'written_off'].includes(v.status);
    // the age rules: over 60 needs the reason, over 30 needs the next step and date; closing needs a remark
    if (live && r.stage === 'reason' && !v.reason) { $('fErr').textContent = 'Over 60 days: choose the reason first'; return; }
    if (live && r.stage !== 'monitor' && (!v.next_step || !v.next_date)) { $('fErr').textContent = 'Set the next step and the next date'; return; }
    if (live && v.next_date && v.next_date < today() && v.next_date !== r.next_date) { $('fErr').textContent = 'The next date is in the past'; return; }
    if (!live && v.status !== r.status && !note) { $('fErr').textContent = 'Write a remark: how it was passed (statement / month) or why it is written off'; return; }
    const ch = {}; Object.keys(v).forEach(k => { if ((r[k] || null) !== v[k]) ch[k] = v[k]; });
    if (!Object.keys(ch).length && !note) { $('fErr').textContent = 'Nothing changed'; return; }
    try {
      if (Object.keys(ch).length) await api('/rest/v1/fu_items?id=eq.' + r.id, {method: 'PATCH', body: ch, headers: {Prefer: 'return=minimal'}});
      let res = null; if (note) res = await api('/rest/v1/rpc/fu_add_note', {method: 'POST', body: {p_item: r.id, p_note: note, p_mentions: window.mentionsOf ? mentionsOf($('fNote')) : []}});
      await after('Saved to the timeline' + (window.mentionResult ? mentionResult(res) : ''));
    } catch (e) { $('fErr').textContent = e.message; }
  }
  async function post() {
    const t = $('fNote').value.trim(); if (!t) { $('fErr').textContent = 'Write the remark first'; return; }
    try { const res = await api('/rest/v1/rpc/fu_add_note', {method: 'POST', body: {p_item: cur.id, p_note: t, p_mentions: window.mentionsOf ? mentionsOf($('fNote')) : []}}); await after('Remark added' + (window.mentionResult ? mentionResult(res) : '')); } catch (e) { $('fErr').textContent = e.message; }
  }

  // ---------- add one new FOC line by hand (monitored from day 1) ----------
  function addDrawer() {
    const eo = edOps(), o0 = op && eo.some(o => o.code === op) ? op : (eo.length === 1 ? eo[0].code : (eo.some(o => o.code === 'MT') ? 'MT' : ''));
    const types = [...new Set(X.rows.map(r => r.foc_type).filter(Boolean))].sort();
    open('<div class="dh"><div><h3>Add FOC line</h3><div class="hint">A new FOC invoice, followed from today: 0-30 days monitor, 31-60 collect, over 60 reason.</div></div><button class="btn" data-fact="close">Close</button></div><div class="frm">'
      + '<label>Sub-category *</label><select id="faOp"><option value="">Choose</option>' + eo.map(o => '<option value="' + o.code + '"' + (o.code === o0 ? ' selected' : '') + '>' + esc(subName(o.code)) + '</option>').join('') + '</select>'
      + '<div class="row2"><div style="flex:1"><label>Invoice date *</label><input id="faDate" type="date" max="' + today() + '"></div><div style="flex:1"><label>Invoice no *</label><input id="faInv" maxlength="40"></div></div>'
      + '<label>FOC Ref No</label><input id="faRef" maxlength="40" placeholder="FOC0xxx (blank if not given yet)">'
      + '<label>Customer / subject *</label><input id="faCust" maxlength="160">'
      + '<label>Amount Rs. *</label><input id="faAmt" inputmode="decimal">'
      + '<label>FOC type</label><input id="faType" list="faTypes" maxlength="80"><datalist id="faTypes">' + types.map(t => '<option value="' + esc(t) + '">').join('') + '</datalist>'
      + '<label>Sent for passing (month)</label><input id="faSent" maxlength="20" placeholder="e.g. Nov-2026, blank if not sent">'
      + '<label>Next step</label><select id="faStep">' + opts(steps(), '') + '</select><label>Next date</label><input id="faNext" type="date">'
      + '<div class="err" id="faDup"></div>' + stamp().replace('Remarks cannot be edited later.', 'A hand-added line is not closed by the next upload; when the list has the same invoice, the list takes it over.')
      + '<div class="row2"><button class="btn p" data-fact="addsave">Add line</button><button class="btn" data-fact="close">Cancel</button></div><div class="err" id="fErr"></div></div>');
    setTimeout(() => { const f = $('faDate'); if (f) f.focus(); }, 220);
  }
  async function addSave() {
    const v = id => $(id).value.trim(), o = v('faOp'), amt = IMSX.num(v('faAmt'));
    const miss = [['faOp', 'Sub-category'], ['faDate', 'Invoice date'], ['faInv', 'Invoice no'], ['faCust', 'Customer'], ['faAmt', 'Amount']].filter(x => !v(x[0])).map(x => x[1]);
    if (miss.length) { $('fErr').textContent = 'Fill in: ' + miss.join(', '); return; }
    if (amt == null || amt <= 0) { $('fErr').textContent = 'Amount must be a number above 0'; return; }
    const row = {ref_key: v('faInv').toUpperCase(), party: v('faRef'), outlet: v('faCust'), amount: amt, base_date: v('faDate'), next_step: v('faStep'), next_owner: v('faStep') ? (me.full_name || '') : '', next_date: v('faNext'),
      details: {sub: subName(o), foc_ref: v('faRef'), foc_type: v('faType'), sent_month: v('faSent'), inv_no: v('faInv')}};
    try {
      const id = await api('/rest/v1/rpc/fu_add_item', {method: 'POST', body: {p_module: 'foc', p_op: o, p_row: row}});
      await load(true); closeDrawer(); location.hash = 'fc/' + id; toast(row.ref_key + ' added to FOC ' + subName(o));
    } catch (e) { $('fErr').textContent = e.message; }
  }

  // ---------- upload: the Due From CCS workbook, sheet PENDING M.WISE (read in the browser, nothing is sent until "Load") ----------
  function uploadDrawer(msg) {
    const fo = fullOps(), P = X.parsed;
    let h = '<div class="dh"><div><h3>Upload FOC List</h3><div class="hint">The "Due From CCS" workbook. Sheet <b>PENDING M.WISE</b> is read: one line per pending FOC invoice, up to "Pending FOC" summary. Lines of this sub-category that are not in the new file are closed as Collected (passed).</div></div><button class="btn" data-fact="close">Close</button></div><div class="frm">'
      + '<label>Excel file (.xlsx)</label><input type="file" id="fcFile" accept=".xlsx,.xlsm,.xls">';
    if (P) {
      const opSel = P.op;
      h += '<label>Sub-category</label><select id="fcOp"><option value="">Choose</option>' + fo.map(o => '<option value="' + o.code + '"' + (o.code === opSel ? ' selected' : '') + '>' + esc(subName(o.code)) + '</option>').join('') + '</select>'
        + '<label>List date (as at)</label><input type="date" id="fcAsAt" value="' + esc(P.asAt || '') + '">';
      const tot = P.lines.reduce((s, l) => s + l.amount, 0), ok = P.sheetTotal != null && Math.abs(P.sheetTotal - tot) < 1;
      h += '<div class="stamp"><b>' + esc(P.file) + '</b> · sheet ' + esc(P.sheet) + '<br>' + P.lines.length + ' FOC lines · Rs ' + money(tot)
        + (P.sheetTotal != null ? '<br>Sheet "Total FOC Pending": Rs ' + money(P.sheetTotal) + (ok ? ' <b style="color:var(--ok,green)">agrees</b>' : ' <b style="color:var(--danger)">differs by ' + money(tot - P.sheetTotal) + '</b>') : '')
        + '<br>Over 60 days: ' + P.lines.filter(l => l.days > 60).length + ' · 31-60: ' + P.lines.filter(l => l.days > 30 && l.days <= 60).length + ' · 0-30: ' + P.lines.filter(l => l.days <= 30).length
        + '<br>FOC Ref taken from the line above: ' + P.lines.filter(l => l.details.ref_group).length + ' · no Ref at all: ' + P.lines.filter(l => !l.details.foc_ref).length + ' · dates with a typo read: ' + P.lines.filter(l => l.details.date_text).length + '</div>';
      if (P.problems.length) h += '<div class="err" style="max-height:170px;overflow-y:auto">' + P.problems.length + ' things to check in the file:<br>' + P.problems.slice(0, 40).map(esc).join('<br>') + (P.problems.length > 40 ? '<br>...' : '') + '</div>';
      const willClose = opSel ? X.rows.filter(r => r.operation === opSel && isOpen(r) && !(r.details || {}).manual && !P.lines.some(l => l.ref_key === r.ref_key)).length : 0;
      if (willClose) h += '<div class="hint" style="color:var(--warn)">' + willClose + ' open lines of ' + esc(subName(opSel)) + ' are not in this file and will be closed as Collected (passed).</div>';
      h += '<div class="row2"><button class="btn p" data-fact="load"' + (P.blocking ? ' disabled' : '') + '>Load ' + P.lines.length + ' lines into the system</button><button class="btn" data-fact="close">Cancel</button></div>' + (P.blocking ? '<div class="err">' + esc(P.blocking) + '</div>' : '');
    }
    h += '<div class="err" id="fErr">' + esc(msg || '') + '</div></div>';
    const ups = X.imports.slice(0, 12);
    h += '<h4 class="dh4">Lists loaded</h4>' + (ups.length ? '<table><tbody>' + ups.map(i => '<tr><td>' + esc(subName(i.operation)) + '</td><td>' + esc(i.as_at) + '</td><td>' + i.rows_in + ' lines · ' + money0(i.total_in) + '<br><span class="hint">' + i.rows_new + ' new · ' + i.rows_closed + ' collected</span></td><td class="hint">' + esc(i.by_name || '') + '</td></tr>').join('') + '</tbody></table>' : '<div class="hint">None yet.</div>');
    open(h);
  }
  const nz = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // sent month: an Excel date (45597 = Nov-2024) or text ("August - 2025", "Feb-2026", "Sep-2026") -> "Mon-YYYY"
  function sentTxt(v) {
    if (v === '' || v == null) return '';
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return isNaN(d) ? String(v) : MON[d.getUTCMonth()] + '-' + d.getUTCFullYear(); }
    const s = String(v).trim(), m = s.match(/([A-Za-z]{3})[A-Za-z]*\s*[-\s]\s*(\d{4})/);
    if (m) { const i = MON.findIndex(x => x.toLowerCase() === m[1].toLowerCase()); if (i >= 0) return MON[i] + '-' + m[2]; }
    return s;
  }
  // the sheet's own summary labels: Nov-2024 and Jan-2025 = old system matter; Aug-2025, Feb-2026, Mar-2026 = late submission
  const sheetReason = s => /^(Nov-2024|Jan-2025)$/.test(s) ? 'Old system matter (2024)' : /^(Aug-2025|Feb-2026|Mar-2026)$/.test(s) ? 'Late submission (after year-end)' : null;
  async function readFile(file) {
    await IMSX.loadLib();
    const buf = await file.arrayBuffer();
    let wb = XLSX.read(buf, {type: 'array', sheets: ['PENDING M.WISE']}), name = wb.SheetNames.find(n => wb.Sheets[n]);
    let A = name ? XLSX.utils.sheet_to_json(wb.Sheets[name], {header: 1, raw: true, defval: ''}) : [];
    const hdr = R => R.some(c => nz(c) === 'invoiceno') && R.some(c => nz(c) === 'sentmonth');
    if (!A.some(hdr)) {   // another sheet name: look through all sheets for the header
      wb = XLSX.read(buf, {type: 'array'});
      name = wb.SheetNames.find(n => XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, raw: true, defval: '', range: 0}).slice(0, 15).some(hdr));
      A = name ? XLSX.utils.sheet_to_json(wb.Sheets[name], {header: 1, raw: true, defval: ''}) : [];
    }
    const h = A.findIndex(hdr);
    if (h < 0) throw new Error('No sheet with the columns "Invoice No" and "Sent Month" (PENDING M.WISE) in this file.');
    const H = A[h].map(nz), col = k => H.findIndex(x => x.startsWith(k));
    const c = {date: col('invoicedate'), inv: col('invoiceno'), ref: col('refno'), sub: col('subject'), bal: col('balance'), sent: col('sentmonth'), rem: col('remark')};
    const lines = [], problems = [], seen = {}, t0 = new Date(); t0.setHours(0, 0, 0, 0);
    let lastRef = '', sheetTotal = null, inLines = true;
    for (let i = h + 1; i < A.length; i++) {
      const R = A[i], s = k => c[k] >= 0 ? String(R[c[k]] == null ? '' : R[c[k]]).trim() : '', all = R.map(x => String(x)).join(' ');
      if (/total\s*foc\s*pending/i.test(all)) { const n = IMSX.num(R[c.bal]); if (n != null) sheetTotal = n; break; }
      if (/pending\s*foc\s*-/i.test(all)) { inLines = false; continue; }
      if (!inLines) continue;
      const inv = s('inv'), bal = IMSX.num(R[c.bal]);
      if (!inv) { lastRef = ''; continue; }   // a month subtotal row ends a block
      let ref = s('ref'), grp = false;
      if (!ref && lastRef) { ref = lastRef; grp = true; } else if (ref) lastRef = ref;
      const sent = sentTxt(R[c.sent]), raw = R[c.date];
      let iso = IMSX.iso(raw), dtxt = '';
      if (!iso && raw !== '') {   // year typed with 3 digits ("226.05.12", "206.08.21"): take the year of the sent month
        const m = String(raw).trim().match(/^(\d{3})[.\-/](\d{1,2})[.\-/](\d{1,2})$/), y = (sent.match(/\d{4}$/) || [String(t0.getFullYear())])[0];
        if (m) { iso = y + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); dtxt = String(raw).trim(); problems.push('Row ' + (i + 1) + ': date "' + dtxt + '" read as ' + iso); }
        else problems.push('Row ' + (i + 1) + ': invoice date not readable (' + raw + ')');
      }
      if (bal == null || bal === 0) { problems.push('Row ' + (i + 1) + ': ' + inv + ' has no balance, skipped'); continue; }
      if (bal < 0) problems.push('Row ' + (i + 1) + ': ' + inv + ' balance below 0 (' + money(bal) + '), excess?');
      let key = inv.toUpperCase();
      if (seen[key]) { problems.push('Row ' + (i + 1) + ': invoice ' + inv + ' is also on row ' + seen[key] + ' (kept as ' + key + '#2)'); key += '#2'; }
      seen[key] = i + 1;
      const days = iso ? Math.round((t0 - new Date(iso + 'T00:00:00')) / 864e5) : 999;
      lines.push({ref_key: key, days, party: ref || null, outlet: s('sub') || '(no subject)', owner_name: null, amount: bal, base_date: iso, reason: sheetReason(sent),
        details: {sub: '', foc_ref: ref, ref_group: grp, foc_type: s('rem'), sent_month: sent, inv_no: inv, row: i + 1, date_text: dtxt || undefined}});
    }
    const o = fullOps().some(x => x.code === 'MT') ? 'MT' : (fullOps().length === 1 ? fullOps()[0].code : '');
    X.parsed = {file: file.name, sheet: name, lines, problems, sheetTotal, op: o, asAt: today(), blocking: !lines.length ? 'No FOC lines found under the header.' : ''};
    uploadDrawer();
  }
  async function loadList() {
    const P = X.parsed, o = $('fcOp').value, asAt = $('fcAsAt').value;
    if (!o) { $('fErr').textContent = 'Choose the sub-category'; return; }
    if (!asAt) { $('fErr').textContent = 'Set the list date'; return; }
    const rowsOut = P.lines.map(l => ({ref_key: l.ref_key, party: l.party, outlet: l.outlet, owner_name: null, amount: l.amount, base_date: l.base_date, reason: l.reason, details: Object.assign({}, l.details, {sub: subName(o)})}));
    try {
      const r = await api('/rest/v1/rpc/fu_apply_import', {method: 'POST', body: {p_module: 'foc', p_op: o, p_as_at: asAt, p_file: P.file, p_rows: rowsOut}});
      X.parsed = null; await load(true); closeDrawer(); op = o; go('items', 'foc');
      toast(subName(o) + ': ' + r.rows + ' FOC lines loaded (' + r.new + ' new, ' + r.closed + ' collected)');
    } catch (e) { $('fErr').textContent = e.message; }
  }

  // ---------- dashboard and report ----------
  function dash() {
    const act = scope().filter(isOpen), grp = (l, f, fv) => { const m = {}; l.forEach(r => { const k = f(r) || '(not set)'; m[k] = (m[k] || 0) + (fv ? fv(r) : Number(r.amount || 0)); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const col = b => b === '0-30' ? 'var(--primary)' : b === '31-60' ? 'var(--accent)' : 'var(--danger)';
    const o60 = act.filter(r => r.stage === 'reason'), top = act.slice().sort((a, b) => b.amount - a.amount).slice(0, 10).map(r => [r.outlet + ' ' + (r.foc_ref || ''), Number(r.amount || 0), col(r.band)]);
    const wk = new Date(); wk.setDate(wk.getDate() + 7); const w = wk.toISOString().slice(0, 10), due = act.filter(r => r.next_date && r.next_date <= w).sort((a, b) => a.next_date < b.next_date ? -1 : 1);
    $('page').innerHTML = '<h2 class="pt">FOC dashboard' + (op ? ' · ' + esc(subName(op)) : '') + '</h2><div class="hint">Open FOC lines · age from the invoice date</div>' + subChips() + tiles(act)
      + '<div class="grid2"><div class="card"><h3>Value by age</h3>' + bars(BANDS.map(b => [b + ' days', val(act.filter(r => r.band === b)), col(b)]), money0) + '</div>'
      + '<div class="card"><h3>Over 60 days: reason (value)</h3>' + bars(grp(o60, r => r.reason || '(no reason yet)'), money0) + '</div>'
      + '<div class="card"><h3>FOC type (value)</h3>' + bars(grp(act, r => r.foc_type), money0) + '</div><div class="card"><h3>Sent month (value)</h3>' + bars(grp(act, r => r.sent_month || '(not sent)'), money0) + '</div>'
      + '<div class="card"><h3>Top 10 lines</h3>' + bars(top, money0) + '</div><div class="card"><h3>Next steps due in 7 days (' + due.length + ')</h3>' + (due.length ? '<table><tbody>' + due.slice(0, 12).map(r => '<tr class="row" data-fc="' + r.id + '"><td>' + esc(r.next_date) + '</td><td>' + esc(r.outlet) + '<br><span class="hint">' + esc(r.next_step || '') + '</span></td><td class="n">' + money0(r.amount) + '</td></tr>').join('') + '</tbody></table>' : '<div class="hint">None.</div>') + '</div></div>';
  }
  function report() {
    const all = scope(), act = all.filter(isOpen), rs = BANDS.map(b => { const a = act.filter(r => r.band === b); return [b, a.length, val(a), a.filter(r => r.need_reason).length, a.filter(r => r.incomplete).length, a.filter(r => r.action_overdue).length]; });
    const tbl = (t, l) => '<div class="card" style="margin-top:12px"><h3>' + t + ' (' + l.length + ' · Rs ' + money(val(l)) + ')</h3><table><thead><tr><th>No</th><th>Inv date</th><th>Invoice</th><th>FOC Ref</th><th>Customer</th><th>Type</th><th>Sent</th><th class="n">Days</th><th class="n">Balance</th><th>Reason</th><th>Next step</th><th>By</th></tr></thead><tbody>'
      + l.sort((a, b) => b.amount - a.amount).map(r => '<tr><td>' + esc(r.rec_code || '') + '</td><td>' + esc(r.base_date || '') + '</td><td>' + esc(r.ref_key) + '</td><td>' + esc(r.foc_ref || '') + '</td><td>' + esc(r.outlet) + '</td><td>' + esc(r.foc_type || '') + '</td><td>' + esc(r.sent_month || '') + '</td><td class="n">' + (r.aging_days != null ? r.aging_days : '') + '</td><td class="n">' + money(r.amount) + '</td><td>' + esc(r.reason || (r.need_reason ? 'NOT GIVEN' : '')) + '</td><td>' + esc(r.next_step || '') + '</td><td>' + esc(r.next_date || '') + '</td></tr>').join('') + '</tbody></table></div>';
    $('page').innerHTML = '<div class="noprint row2"><button class="btn p" id="fcP">Print / Save as PDF</button><button class="btn" id="fcC">Download all lines (CSV)</button></div><h2 class="pt">FOC follow-up report' + (op ? ' · ' + esc(subName(op)) : '') + '</h2><div class="hint">As at ' + today() + ' · open lines · last list ' + esc(lastAs(op) || 'none') + ' · Iceman IMS</div>'
      + '<div class="wrap"><table><thead><tr><th>Age (days)</th><th class="n">Lines</th><th class="n">Balance</th><th class="n">No reason</th><th class="n">No next step / date</th><th class="n">Overdue</th></tr></thead><tbody>'
      + rs.map(x => '<tr><td>' + x[0] + '</td><td class="n">' + x[1] + '</td><td class="n">' + money(x[2]) + '</td><td class="n">' + (x[3] || '') + '</td><td class="n">' + (x[4] || '') + '</td><td class="n">' + (x[5] || '') + '</td></tr>').join('')
      + '<tr style="font-weight:700"><td>Total</td><td class="n">' + act.length + '</td><td class="n">' + money(val(act)) + '</td>' + [3, 4, 5].map(i => '<td class="n">' + rs.reduce((t, x) => t + x[i], 0) + '</td>').join('') + '</tr></tbody></table></div>'
      + tbl('Over 60 days: reason and next step', act.filter(r => r.stage === 'reason')) + tbl('31-60 days: to collect', act.filter(r => r.stage === 'collect')) + tbl('New, 0-30 days: monitor', act.filter(r => r.stage === 'monitor'))
      + '<div class="sig" style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:30px">' + ['Prepared by', 'Checked by', 'Approved by'].map(t => '<div>' + t + '<div style="margin-top:28px">..............................</div></div>').join('') + '</div>';
    $('fcP').onclick = () => window.print();
    $('fcC').onclick = () => {
      const cols = [['Record no', 'rec_code'], ['Sub-category', 'sub'], ['Invoice date', 'base_date'], ['Invoice no', 'ref_key'], ['FOC Ref', 'foc_ref'], ['Customer / subject', 'outlet'], ['FOC type', 'foc_type'], ['Sent month', 'sent_month'], ['Days', 'aging_days'], ['Age', 'band'], ['Balance', 'amount'], ['Reason', 'reason'], ['Next step', 'next_step'], ['Who', 'next_owner'], ['Next date', 'next_date'], ['Status', 'status'], ['Short remark', 'remarks'], ['First seen', 'first_seen']];
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', csv = '﻿' + cols.map(c => q(c[0])).join(',') + '\r\n' + all.map(r => cols.map(c => q(c[1] === 'status' ? ST[r.status] : r[c[1]])).join(',')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = 'FOC ' + (op ? subName(op) : 'all') + ' ' + today() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    };
  }
  function card(m) {
    const a = X.rows.filter(isOpen);
    return '<div class="card mcard" data-mod="foc" data-go="items"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + money0(val(a)) + '</div><div class="hint">' + a.length + ' open lines · ' + a.filter(r => r.stage === 'reason').length + ' over 60 (' + a.filter(r => r.need_reason).length + ' no reason) · ' + a.filter(r => r.stage === 'collect').length + ' to collect</div></div>';
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const rr = e.target.closest('[data-fc]'); if (rr) { location.hash = 'fc/' + rr.dataset.fc; return; }
    const sb = e.target.closest('[data-fsub]'); if (sb) { op = op === sb.dataset.fsub ? '' : sb.dataset.fsub; go(); return; }
    const b = e.target.closest('[data-fact]'); if (!b || b.disabled) return;
    const k = b.dataset.fact;
    if (k === 'back') { history.replaceState(null, '', location.pathname + location.search); go('items', 'foc'); }
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
    if (t.id === 'fcFile' && t.files[0]) { readFile(t.files[0]).catch(er => uploadDrawer('Could not read the file: ' + er.message)); return; }
    if (t.id === 'fcOp' && X.parsed) { X.parsed.op = t.value; uploadDrawer(); return; }
    if (t.id === 'fcAsAt' && X.parsed) { X.parsed.asAt = t.value; return; }
    const m = {fcStatus: 'status', fcStage: 'stage', fcFlag: 'flag', fcType: 'type', fcSent: 'sent'}[t.id]; if (m) { X.f[m] = t.value; list(); }
  });
  // add drawer: warn when the invoice is already a FOC line
  document.addEventListener('input', e => {
    if (e.target.id === 'faInv') { const k = e.target.value.trim().toUpperCase(), same = k && X.rows.find(r => r.ref_key === k); $('faDup').textContent = same ? 'Invoice ' + k + ' is already a FOC line (' + (ST[same.status] || same.status) + '). Open it from the list instead.' : ''; }
    if (e.target.id === 'fcText') { X.f.text = e.target.value; const p = e.target.selectionStart; list(); const t = $('fcText'); t.focus(); t.setSelectionRange(p, p); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'fNote' && $('panel').querySelector('[data-fact="post"]')) { e.preventDefault(); guard(post); } });

  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {foc: {items: () => run(list), dash: () => run(dash), report: () => run(report), record: () => run(record), card}});
  window.fcWarm = () => load().catch(() => {});
})();
