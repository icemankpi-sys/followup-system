// Iceman IMS v6.0 - Outstanding from the daily C40 update, one follow-up record per customer (2026-11-21, Oshan).
// Replaces the 16 OneDrive "Over 30 Follow-up books": same list, same figures, same remarks, in IMS.
//   Follow-up tab = Customers | Invoices | Credits | Collections | Settled | Progress | Weekly target | Old lists
//   Dashboard tab = Master dashboard (all my operations: figures, this week A / B / C by operation and officer, action list, trend)
//   Report tab    = printable daily Outstanding report + Excel (CSV)
//   Customer page = figures, follow-up (Main reason, explanation, next action, promise), contacts, invoices, credits, collections, timeline
// Data: v_receivable rows with details.level = 'customer' (loaded at sign-in by index.html), os_days, os_weeks, os_targets,
// os_lines, os_collections, os_line_notes (Supabase/43). Officers type only the follow-up fields; the rest comes from C40 every morning.
// Loaded after the main script (it replaces planHtml, formHtml and renderRecord for customer records).
(function () {
  const isCust = r => !!(r && r.details && r.details.level === 'customer');
  window.isCustRow = isCust;
  const D = r => (r && r.details) || {};
  const n = v => Number(v || 0);
  const m0 = v => money0(v), m2 = v => money(v);
  const pc = v => v == null || isNaN(v) ? '' : Math.round(v * 100) + '%';
  const dmy = s => s ? String(s).slice(8, 10) + '-' + String(s).slice(5, 7) + '-' + String(s).slice(0, 4) : '';
  const daysAgo = s => s ? Math.floor((Date.now() - new Date(s).getTime()) / 864e5) : null;
  const today = () => lkDay();
  const custRows = () => rows.filter(isCust);
  const myCust = () => custRows().filter(r => !op || r.operation === op);
  const actCust = () => myCust().filter(isActive);
  const opName = c => { const o = ops.find(x => x.code === c); return o ? o.name : c; };
  const myOps = () => opsFor('receivable');
  const isBoard = () => !!me && (me.role === 'admin' || (access || []).some(a => a.module === '*') || /director/i.test(me.job_title || ''));
  const canFullOp = c => rank(lvl(c, 'receivable')) >= 3, canEditOp = c => rank(lvl(c, 'receivable')) >= 2;
  const fresh = r => r.fu_updated_at && daysAgo(r.fu_updated_at) <= 7;
  const promiseMissed = r => isActive(r) && r.promised_date && r.promised_date < today();
  const o60 = r => n(D(r).o60), o30 = r => n(r.amount);
  // flags (books' "Flags" column + alerts)
  function flags(r) {
    const d = D(r), f = [];
    if (promiseMissed(r)) f.push(['r', 'Promise missed']);
    if (n(d.ret) > 0.005) f.push(['r', 'Returned cheque']);
    if (o60(r) >= 1 && !r.reason) f.push(['a', 'Over 60, no remark']);
    else if (!r.reason) f.push(['a', 'No remark']);
    else if (o60(r) >= 1 && !fresh(r)) f.push(['a', 'No update 7+ days']);
    if (d.new_on && d.new_on === d.as_at && isActive(r)) f.push(['b', 'New in list']);
    if (n(d.cash) >= 100) f.push(['g', 'Paid ' + m0(d.cash)]);
    if (n(d.setoff) >= 100) f.push(['b', 'Set off ' + m0(d.setoff)]);
    if (n(d.cred) <= -1) f.push(['b', 'Credits to allocate']);
    if (n(d.soon60) > 0.5) f.push(['w', 'Moves to 61+ in 7 days']);
    return f;
  }
  const flagHtml = r => flags(r).map(f => '<span class="tag t-' + f[0] + '">' + esc(f[1]) + '</span>').join('');

  // ---------- data: day figures, weekly rows, targets (once per 5 minutes), lines / collections / notes per operation ----------
  const S = {at: 0, days: [], weeks: [], targets: [], lines: {}, coll: {}, notes: {}, old: null};
  async function warm(force) {
    if (!force && Date.now() - S.at < 3e5 && S.days.length) return;
    const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const [d, w, t] = await Promise.all([
      fetchAll('/rest/v1/os_days?select=*&as_at=gte.' + since + '&order=as_at,operation').catch(() => []),
      fetchAll('/rest/v1/os_weeks?select=*&order=w_from,operation').catch(() => []),
      api('/rest/v1/os_targets?select=*').catch(() => [])]);
    S.days = d || []; S.weeks = w || []; S.targets = t || []; S.at = Date.now();
  }
  const lastDay = c => S.days.filter(x => !c || x.operation === c).reduce((a, x) => !a || x.as_at > a.as_at ? x : a, null);
  const asAt = c => { const x = lastDay(c); return x ? x.as_at : null; };
  async function linesOf(c, kind) {
    const k = c + '|' + kind, a = asAt(c); if (!a) return [];
    if (S.lines[k] && S.lines[k].as_at === a) return S.lines[k].rows;
    const r = await fetchAll('/rest/v1/os_lines?select=*&operation=eq.' + c + '&as_at=eq.' + a + '&kind=eq.' + kind + '&order=cust_key,inv_date,id');
    S.lines[k] = {as_at: a, rows: r || []}; return S.lines[k].rows;
  }
  async function notesOf(c) {
    if (S.notes[c] && Date.now() - S.notes[c].at < 6e4) return S.notes[c].map;
    const r = await fetchAll('/rest/v1/os_line_notes?select=*&operation=eq.' + c + '&order=at.desc,id').catch(() => []), mp = {};
    (r || []).forEach(x => { const k = x.kind + '|' + x.line_key; if (!mp[k] || String(x.at) > String(mp[k].at)) mp[k] = x; });   // the latest remark of each line
    S.notes[c] = {at: Date.now(), map: mp}; return mp;
  }
  async function collOf(c, from) {
    const k = c + '|' + from; if (S.coll[k] && Date.now() - S.coll[k].at < 3e5) return S.coll[k].rows;
    const r = await fetchAll('/rest/v1/os_collections?select=*&operation=eq.' + c + '&as_at=gte.' + from + '&order=as_at.desc,cust_key,id');
    S.coll[k] = {at: Date.now(), rows: r || []}; return S.coll[k].rows;
  }

  // ---------- weekly status (books: worst of A, B, C; On track / Watch / Behind, after the week Achieved / Near / Missed) ----------
  const grade = (p, fr) => p == null || !(fr > 0) ? -1 : p / fr >= 0.999 ? 0 : p / fr >= 0.8 ? 1 : 2;
  function cLive(c) { const a = custRows().filter(r => r.operation === c && isActive(r) && o60(r) >= 1); return {n: a.length, ok: a.filter(r => r.reason && fresh(r)).length, cov: a.length ? a.filter(r => r.reason && fresh(r)).length / a.length : 1}; }
  function weekOf(c, date) { return S.weeks.find(w => w.operation === c && date >= w.w_from && date <= addD(w.w_to, 1)); }
  const addD = (s, k) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); };
  function wkStat(w, live) {
    if (!w || !w.started) return {label: 'Not started', ap: null, bp: null, c: null};
    const ap = w.a_target == null ? null : n(w.a_target) > 0.5 ? n(w.a_coll) / n(w.a_target) : 1;
    const bp = w.b_target == null ? null : n(w.b_target) > 0.5 ? n(w.b_coll) / n(w.b_target) : 1;
    const c = live ? cLive(w.operation).cov : (w.c_cov == null ? null : n(w.c_cov));
    const fr = n(w.done_frac), gs = [grade(ap, fr), grade(bp, fr), c == null ? -1 : grade(c, 1)], worst = Math.max(...gs);
    const lab = fr >= 0.999 ? ['Achieved', 'Near', 'Missed'] : ['On track', 'Watch', 'Behind'];
    return {label: worst < 0 ? 'Started' : lab[worst], ap, bp, c, worst};
  }
  const stTag = s => '<span class="tag t-' + (/Behind|Missed/.test(s) ? 'r' : /Watch|Near/.test(s) ? 'w' : /On track|Achieved/.test(s) ? 'g' : 'b') + '">' + esc(s) + '</span>';

  // ---------- page shell ----------
  let tab = 'cust';
  const TABS = [['cust', 'Customers'], ['inv', 'Invoices'], ['cred', 'Credits'], ['coll', 'Collections'], ['sett', 'Settled'], ['prog', 'Progress'], ['week', 'Weekly target']];
  function head(title) {
    const a = asAt(op), ld = lastDay(op);
    return '<div class="row2" style="justify-content:space-between;align-items:flex-end"><h2 class="pt">' + esc(title) + ' <span class="hint">' + (op ? esc(op + ' - ' + opName(op)) : 'All my operations') + '</span></h2>'
      + '<div class="hint" style="text-align:right">' + (a ? 'C40 as at <b>' + dmy(a) + '</b>' + (ld && ld.synced_at ? ' · updated ' + esc(fmtDT(new Date(ld.synced_at))) : '') : '<span class="bad">No C40 update yet</span>') + '<br>Source: C40 B2001 + B2011 (CCS, DIS), every morning</div></div>';
  }
  function chips() {
    const t = TABS.concat(me.role === 'admin' || myOps().some(o => canFullOp(o.code)) ? [['old', 'Old lists (Oct 2026)']] : []);
    return '<div class="chips noprint" style="margin:6px 0 10px">' + t.map(x => '<button data-ostab="' + x[0] + '"' + (tab === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>').join('') + '</div>';
  }
  async function run(fn) {
    $('page').innerHTML = '<div class="hint">Loading...</div>';
    try { await warm(); await fn(); } catch (e) { $('page').innerHTML = '<div class="card err">' + esc(e.message || e) + '</div>'; }
  }
  const needOp = what => head(what) + chips() + '<div class="card">Pick one operation in the box above to see its ' + esc(what.toLowerCase()) + ' (the list is long).</div>';
  const tile = (cls, v, t) => '<div class="tile ' + cls + '"><b>' + v + '</b><span>' + t + '</span></div>';

  // ---------- Customers (books: Customers sheet) ----------
  const OF = {band: '', rep: '', flag: '', reason: '', text: '', status: 'active'};
  const BANDS = [['31', '31-60'], ['61', '61-90'], ['91', '91-120'], ['121', '121-240'], ['241', '241+']];
  const inB = (r, b) => { const d = ageDays(r) || 0, lo = Number(b), hi = {31: 60, 61: 90, 91: 120, 121: 240, 241: 1e9}[b]; return d >= lo && d <= hi; };
  const FLAGS = [['nr60', 'Over 60, no remark', r => o60(r) >= 1 && !r.reason], ['nr', 'No remark', r => !r.reason], ['stale', 'No update 7+ days', r => !fresh(r)], ['pm', 'Promise missed', promiseMissed],
    ['p7', 'Promise in 7 days', r => r.promised_date && r.promised_date >= today() && r.promised_date <= addD(today(), 6)], ['ret', 'Returned cheque', r => n(D(r).ret) > 0.005],
    ['new', 'New in list', r => D(r).new_on && D(r).new_on === D(r).as_at], ['paid', 'Paid since last update', r => n(D(r).cash) >= 1], ['cred', 'Credits to allocate', r => n(D(r).cred) <= -1],
    ['soon', 'Moves to 61+ in 7 days', r => n(D(r).soon60) > 0.5], ['o60', 'Over 60 only', r => o60(r) >= 1]];
  const OT = {
    status: r => OF.status === 'active' ? isActive(r) : OF.status === 'all' ? true : r.status === OF.status,
    band: r => !OF.band || inB(r, OF.band), rep: r => !OF.rep || r.owner_name === OF.rep,
    reason: r => !OF.reason || (r.reason || '(no reason yet)') === OF.reason,
    flag: r => { if (!OF.flag) return true; const f = FLAGS.find(x => x[0] === OF.flag); return !f || f[2](r); },
    text: r => { const t = (OF.text || '').toLowerCase(); return !t || [r.rec_code, r.outlet, r.owner_name, r.party, r.reason, r.remarks].some(v => (v || '').toLowerCase().includes(t)); }
  };
  const ofilt = skip => myCust().filter(r => Object.keys(OT).every(k => k === skip || OT[k](r)));
  function custPage() {
    const act = actCust(), sumF = (a, f) => a.reduce((s, r) => s + f(r), 0), c60 = act.filter(r => o60(r) >= 1);
    const tl = [tile('', act.length, 'Customers over 30 days'), tile('', m0(sumF(act, o30)), 'Over 30 total'), tile('r', m0(sumF(act, o60)), 'Over 60 total'), tile('r', m0(sumF(act, r => n(D(r).o90))), 'Over 90 total'),
      tile('g', m0(sumF(act, r => n(D(r).cash))), 'Cash since the last update'), tile('', m0(sumF(act, r => n(D(r).setoff))), 'Set off (not cash)'),
      tile('a', c60.filter(r => !r.reason).length, 'Over 60 with no remark'), tile('r', act.filter(promiseMissed).length, 'Promise missed'), tile('a', c60.filter(r => r.reason && !fresh(r)).length, 'Over 60, no update 7+ days'),
      tile('', pc(c60.length ? c60.filter(r => r.reason && fresh(r)).length / c60.length : 1), 'C: Over 60 with a fresh remark')].join('');
    const base = myCust(), uniq = k => [...new Set(base.map(k).filter(Boolean))].sort();
    ['rep', 'reason'].forEach(k => { if (OF[k] && !uniq(k === 'rep' ? r => r.owner_name : r => r.reason || '(no reason yet)').includes(OF[k])) OF[k] = ''; });
    const cnt = (k, t) => ofilt(k).filter(t).length;
    const sel = (id, k, lab, list) => '<select data-osf="' + k + '"' + (OF[k] && !(k === 'status' && OF[k] === 'active') ? ' class="on"' : '') + '>' + list.map(x => '<option value="' + esc(x[0]) + '"' + (OF[k] === x[0] ? ' selected' : '') + '>' + esc(x[1]) + ' (' + cnt(k, x[2]) + ')</option>').join('') + '</select>';
    const f = ofilt('').sort((a, b) => (isActive(b) - isActive(a)) || (o60(b) - o60(a)) || (n(D(b).b31) - n(D(a).b31)));
    $('page').innerHTML = head('Outstanding · Over 30 follow-up') + chips() + '<div class="grid">' + tl + '</div>'
      + '<div class="filters noprint">' + sel('', 'status', '', [['active', 'Active customers', isActive], ['settled', 'Cleared (settled)', r => r.status === 'settled'], ['all', 'All', () => true]])
      + sel('', 'band', '', [['', 'All ages (oldest invoice)', () => true]].concat(BANDS.map(b => [b[0], 'Oldest ' + b[1] + ' days', r => inB(r, b[0])])))
      + sel('', 'rep', '', [['', 'All sales reps', () => true]].concat(uniq(r => r.owner_name).map(v => [v, v, r => r.owner_name === v])))
      + sel('', 'reason', '', [['', 'All reasons', () => true]].concat(uniq(r => r.reason || '(no reason yet)').map(v => [v, v, r => (r.reason || '(no reason yet)') === v])))
      + sel('', 'flag', '', [['', 'All flags', () => true]].concat(FLAGS.map(x => [x[0], x[1], x[2]])))
      + '<input data-osf="text" placeholder="Search customer / rep / no / remark" value="' + esc(OF.text) + '" style="flex:1;min-width:170px">'
      + (OF.band || OF.rep || OF.flag || OF.reason || OF.text || OF.status !== 'active' ? '<button class="btn" data-osact="clear">Clear filters</button>' : '') + '</div>'
      + '<div class="hint">' + f.length + ' customers · Over 30 ' + m2(f.reduce((s, r) => s + o30(r), 0)) + ' · Over 60 ' + m2(f.reduce((s, r) => s + o60(r), 0)) + ' &nbsp; ' + ageKey() + '</div>'
      + '<div class="wrap"><table style="min-width:1500px"><thead><tr><th class="n">#</th><th>No</th><th>Customer</th><th>Sales rep</th><th class="n">Days</th><th class="n">31-60</th><th class="n">61-90</th><th class="n">91-120</th><th class="n">Over 120</th><th class="n">Over 30</th><th class="n">Over 60</th><th class="n">Credits</th><th class="n">Paid (cash)</th><th>Flags</th><th>Main reason</th><th>Next action</th><th>Promise</th><th>Last update</th><th></th></tr></thead><tbody>'
      + f.map((r, i) => { const d = D(r); return '<tr class="row' + ageCls(r) + '" data-open="' + r.id + '"><td class="n sno">' + (i + 1) + '</td><td class="rno">' + esc(r.rec_code || '') + '</td><td><b>' + esc(r.outlet) + '</b>' + (!op ? ' <span class="tag t-b">' + esc(r.operation) + '</span>' : '') + '</td><td>' + esc(r.owner_name) + '</td><td class="n">' + (r.aging_days == null ? '' : r.aging_days) + '</td>'
        + '<td class="n">' + m0(d.b31) + '</td><td class="n">' + m0(d.b61) + '</td><td class="n">' + m0(d.b91) + '</td><td class="n">' + m0(d.b120) + '</td><td class="n"><b>' + m0(r.amount) + '</b></td><td class="n"><b>' + m0(d.o60) + '</b></td><td class="n">' + (n(d.cred) ? m0(d.cred) : '') + '</td><td class="n">' + (n(d.cash) ? m0(d.cash) : '') + '</td>'
        + '<td>' + flagHtml(r) + (isActive(r) ? '' : '<span class="tag t-g">Cleared ' + esc(dmy(d.cleared_on || r.settled_on)) + '</span>') + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.next_step) + (r.next_date ? '<br><span class="hint">' + esc(dmy(r.next_date)) + '</span>' : '') + '</td>'
        + '<td>' + (r.promised_date ? esc(dmy(r.promised_date)) + (r.promised_amount != null ? '<br>' + m0(r.promised_amount) : '') : '') + '</td><td>' + (r.fu_updated_at ? esc(dmy(r.fu_updated_at.slice(0, 10))) + '<br><span class="hint">' + esc(r.fu_updated_by || '') + '</span>' : '<span class="hint">never</span>') + '</td>'
        + '<td><button class="btn q" data-quick="' + r.id + '" title="Update follow-up">&#9998;</button></td></tr>'; }).join('')
      + '</tbody><tfoot>' + (f.length ? '<tr class="tot"><td colspan="5"><b>Total of ' + f.length + ' customers</b></td>' + ['b31', 'b61', 'b91', 'b120'].map(k => '<td class="n">' + m0(f.reduce((s, r) => s + n(D(r)[k]), 0)) + '</td>').join('')
        + '<td class="n"><b>' + m0(f.reduce((s, r) => s + o30(r), 0)) + '</b></td><td class="n"><b>' + m0(f.reduce((s, r) => s + o60(r), 0)) + '</b></td><td class="n">' + m0(f.reduce((s, r) => s + n(D(r).cred), 0)) + '</td><td class="n">' + m0(f.reduce((s, r) => s + n(D(r).cash), 0)) + '</td><td colspan="6"></td></tr>' : '<tr><td colspan="19" class="hint">No customers match the filters.</td></tr>') + '</tfoot></table></div>'
      + '<div class="hint" style="margin-top:6px">A customer is listed when any invoice is older than 30 days (from the invoice date) or has a returned cheque. Days = oldest Over 30 invoice. Only the follow-up fields are typed in IMS; the figures come from C40 every morning.</div>';
  }

  // ---------- Invoices (books: Invoices sheet) ----------
  const IF = {band: '', st: '', text: ''};
  async function invPage() {
    if (!op) { $('page').innerHTML = needOp('Invoices'); return; }
    const [L, N] = await Promise.all([linesOf(op, 'inv'), notesOf(op)]), t = (IF.text || '').toLowerCase();
    const f = L.filter(x => (!IF.band || x.band === IF.band) && (!IF.st || x.line_status === IF.st) && (!t || [x.customer, x.ref_no, x.rep, x.txn_type].some(v => (v || '').toLowerCase().includes(t))));
    const byC = {}; custRows().filter(r => r.operation === op).forEach(r => byC[r.ref_key] = r);
    const bands = ['31-60', '61-90', '91-120', 'Over 120', '1-30'], sts = [...new Set(L.map(x => x.line_status).filter(Boolean))].sort();
    $('page').innerHTML = head('Outstanding · Invoices over 30 days') + chips()
      + '<div class="filters noprint"><select data-oif="band"><option value="">All age bands (' + L.length + ')</option>' + bands.map(b => '<option' + (IF.band === b ? ' selected' : '') + '>' + b + '</option>').join('') + '</select>'
      + '<select data-oif="st"><option value="">All (since last update)</option>' + sts.map(b => '<option' + (IF.st === b ? ' selected' : '') + '>' + esc(b) + '</option>').join('') + '</select>'
      + '<input data-oif="text" placeholder="Search customer / invoice / rep" value="' + esc(IF.text) + '" style="flex:1;min-width:170px"></div>'
      + '<div class="hint">' + f.length + ' invoice lines · balance ' + m2(f.reduce((s, x) => s + n(x.amount), 0)) + '</div>'
      + '<div class="wrap"><table style="min-width:1200px"><thead><tr><th class="n">#</th><th>Customer</th><th>Txn type</th><th>Invoice no</th><th>Invoice date</th><th>Due date</th><th class="n">Days</th><th>Age band</th><th class="n">Balance</th><th class="n">Last update</th><th>Since last update</th><th>Rep</th><th>Invoice remark</th><th></th></tr></thead><tbody>'
      + f.map((x, i) => { const nt = N['invoice|' + x.line_key], c = byC[x.cust_key]; return '<tr' + (c ? ' class="row" data-open="' + c.id + '"' : '') + '><td class="n">' + (i + 1) + '</td><td>' + esc(x.customer) + '</td><td>' + esc(x.txn_type) + '</td><td>' + esc(x.ref_no) + '</td><td>' + esc(dmy(x.inv_date)) + '</td><td>' + esc(dmy(x.due_date)) + '</td><td class="n">' + (x.days == null ? '' : x.days) + '</td><td>' + esc(x.band) + '</td><td class="n"><b>' + m2(x.amount) + '</b></td><td class="n">' + (x.bal_prev == null ? '' : m2(x.bal_prev)) + '</td><td>' + esc(x.line_status || '') + '</td><td>' + esc(x.rep) + '</td>'
        + '<td>' + (nt ? esc(nt.note) + '<br><span class="hint">' + esc(nt.by_name || '') + ', ' + esc(dmy(nt.at.slice(0, 10))) + '</span>' : '') + '</td><td>' + (canEditOp(op) || (c && canOf(c).edit) ? '<button class="btn q" data-osnote="invoice" data-cust="' + esc(x.cust_key) + '" data-line="' + esc(x.line_key) + '" data-ref="' + esc(x.ref_no) + '" title="Invoice remark">&#9998;</button>' : '') + '</td></tr>'; }).join('')
      + '</tbody><tfoot><tr class="tot"><td colspan="8"><b>Total of ' + f.length + ' lines</b></td><td class="n"><b>' + m2(f.reduce((s, x) => s + n(x.amount), 0)) + '</b></td><td colspan="5"></td></tr></tfoot></table></div>';
  }

  // ---------- Credits (books: Credits sheet, Accounts remark) ----------
  async function credPage() {
    if (!op) { $('page').innerHTML = needOp('Credits'); return; }
    const [L, N] = await Promise.all([linesOf(op, 'cred'), notesOf(op)]), t = (IF.text || '').toLowerCase();
    const f = L.filter(x => !t || [x.customer, x.ref_no, x.txn_type].some(v => (v || '').toLowerCase().includes(t))).sort((a, b) => n(b.cust_o30) - n(a.cust_o30) || n(a.amount) - n(b.amount));
    const sug = x => n(x.cust_o30) > 0.005 ? 'Set off against the oldest open invoice' : 'Set off against open invoices / check refund or wrong customer';
    const tot = f.reduce((s, x) => s + n(x.amount), 0), withDue = f.filter(x => n(x.cust_o30) > 0.005);
    $('page').innerHTML = head('Outstanding · Unapplied credits') + chips()
      + '<div class="grid">' + tile('', f.length, 'Credit lines') + tile('a', m0(tot), 'Credits not allocated') + tile('r', m0(withDue.reduce((s, x) => s + n(x.amount), 0)), 'Credits of customers with Over 30 due (' + withDue.length + ')') + '</div>'
      + '<div class="filters noprint"><input data-oif="text" placeholder="Search customer / ref" value="' + esc(IF.text) + '" style="flex:1;min-width:170px"></div>'
      + '<div class="wrap"><table style="min-width:1100px"><thead><tr><th class="n">#</th><th>Customer</th><th>Txn type</th><th>Ref no</th><th>Date</th><th class="n">Days</th><th class="n">Amount</th><th class="n">Customer Over 30 due</th><th>Suggested action</th><th>Accounts remark</th><th></th></tr></thead><tbody>'
      + f.map((x, i) => { const nt = N['accounts|' + x.line_key]; return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(x.customer) + '</td><td>' + esc(x.txn_type) + '</td><td>' + esc(x.ref_no) + '</td><td>' + esc(dmy(x.inv_date)) + '</td><td class="n">' + (x.days == null ? '' : x.days) + '</td><td class="n">' + m2(x.amount) + '</td><td class="n">' + (n(x.cust_o30) > 0.005 ? m2(x.cust_o30) : '') + '</td><td>' + esc(sug(x)) + '</td>'
        + '<td>' + (nt ? esc(nt.note) + '<br><span class="hint">' + esc(nt.by_name || '') + ', ' + esc(dmy(nt.at.slice(0, 10))) + '</span>' : '') + '</td><td>' + (canEditOp(op) ? '<button class="btn q" data-osnote="accounts" data-cust="' + esc(x.cust_key) + '" data-line="' + esc(x.line_key) + '" data-ref="' + esc(x.ref_no) + '" title="Accounts remark">&#9998;</button>' : '') + '</td></tr>'; }).join('')
      + '</tbody><tfoot><tr class="tot"><td colspan="6"><b>Total of ' + f.length + ' credit lines</b></td><td class="n"><b>' + m2(tot) + '</b></td><td colspan="4"></td></tr></tfoot></table></div>';
  }

  // ---------- Collections (cash / set off since the previous export) ----------
  let CP = 'last';
  async function collPage() {
    const a = asAt(op); if (!a) { $('page').innerHTML = head('Collections') + chips() + '<div class="card">No C40 update yet.</div>'; return; }
    const mon = (() => { const d = new Date(a + 'T00:00:00'), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return d.toISOString().slice(0, 10); })();
    const from = CP === 'last' ? a : CP === 'week' ? mon : addD(a, -30);
    const codes = op ? [op] : myOps().map(o => o.code);
    const all = (await Promise.all(codes.map(c => collOf(c, from)))).flat().filter(x => CP !== 'last' || x.as_at === asAt(x.operation));
    const sm = (arr, k) => arr.reduce((s, x) => s + n(x[k]), 0), o6 = all.filter(x => ['61-90', '91-120', 'Over 120'].includes(x.band));
    const byBand = ['1-30', '31-60', '61-90', '91-120', 'Over 120'].map(b => { const z = all.filter(x => x.band === b); return [b, z.length, sm(z, 'cash'), sm(z, 'setoff')]; });
    $('page').innerHTML = head('Outstanding · Collections') + chips()
      + '<div class="chips noprint" style="margin-bottom:8px">' + [['last', 'Last update (' + dmy(a) + ')'], ['week', 'This week'], ['30', 'Last 30 days']].map(x => '<button data-oscp="' + x[0] + '"' + (CP === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>').join('') + '</div>'
      + '<div class="grid">' + tile('g', m0(sm(all, 'cash')), 'Cash collected') + tile('r', m0(sm(o6, 'cash')), 'Cash on Over 60 (counts for A)') + tile('', m0(sm(all, 'setoff')), 'Set off by Accounts (not cash)') + tile('', all.length, 'Invoices paid (full or part)') + '</div>'
      + '<div class="card"><h3>By age band (at the previous update)</h3><table><thead><tr><th>Band</th><th class="n">Invoices</th><th class="n">Cash</th><th class="n">Set off</th></tr></thead><tbody>' + byBand.map(b => '<tr><td>' + b[0] + '</td><td class="n">' + b[1] + '</td><td class="n">' + m2(b[2]) + '</td><td class="n">' + m2(b[3]) + '</td></tr>').join('') + '</tbody></table></div>'
      + '<div class="wrap" style="margin-top:10px"><table style="min-width:1000px"><thead><tr><th>Found on</th><th>Counted on</th>' + (op ? '' : '<th>Op</th>') + '<th>Customer</th><th>Invoice</th><th>Invoice date</th><th>Band</th><th class="n">Paid</th><th class="n">Cash</th><th class="n">Set off</th></tr></thead><tbody>'
      + all.map(x => '<tr><td>' + esc(dmy(x.as_at)) + '</td><td>' + esc(dmy(x.coll_day)) + '</td>' + (op ? '' : '<td>' + esc(x.operation) + '</td>') + '<td>' + esc(x.customer) + '</td><td>' + esc(x.ref_no) + ' <span class="hint">' + esc(x.txn_type || '') + '</span></td><td>' + esc(dmy(x.inv_date)) + '</td><td>' + esc(x.band) + '</td><td class="n">' + m2(x.paid) + '</td><td class="n"><b>' + m2(x.cash) + '</b></td><td class="n">' + (n(x.setoff) ? m2(x.setoff) : '') + '</td></tr>').join('')
      + '</tbody><tfoot><tr class="tot"><td colspan="' + (op ? 6 : 7) + '"><b>Total of ' + all.length + ' invoices</b></td><td class="n">' + m2(sm(all, 'paid')) + '</td><td class="n"><b>' + m2(sm(all, 'cash')) + '</b></td><td class="n">' + m2(sm(all, 'setoff')) + '</td></tr></tfoot></table></div>'
      + '<div class="hint" style="margin-top:6px">Collection = what cleared the invoices between the previous C40 export and this one (same figure as the Director\'s Daily Outstanding report). Set off = the customer\'s own credits or a chain head-office credit used by Accounts; only cash counts for targets and promises.</div>';
  }

  // ---------- Settled (customers that left the Over 30 list) ----------
  function settPage() {
    const f = myCust().filter(r => r.status === 'settled').sort((a, b) => String(b.settled_on || '').localeCompare(String(a.settled_on || '')));
    $('page').innerHTML = head('Outstanding · Cleared customers') + chips()
      + '<div class="hint">Customers whose Over 30 balance was paid or set off (last 60 days). Their remarks stay; if they come back in the list they reopen with the same follow-up.</div>'
      + '<div class="wrap"><table style="min-width:1000px"><thead><tr><th>Cleared on</th><th>No</th><th>Customer</th><th>Sales rep</th><th class="n">Over 30 at last update</th><th class="n">Over 60</th><th>How</th><th>Main reason</th><th>Explanation</th><th>Last update</th></tr></thead><tbody>'
      + f.map(r => '<tr class="row" data-open="' + r.id + '"><td>' + esc(dmy(r.settled_on)) + '</td><td class="rno">' + esc(r.rec_code || '') + '</td><td>' + esc(r.outlet) + (!op ? ' <span class="tag t-b">' + esc(r.operation) + '</span>' : '') + '</td><td>' + esc(r.owner_name) + '</td><td class="n">' + m2(r.amount) + '</td><td class="n">' + m0(D(r).o60) + '</td><td>' + esc(r.settle_remark || '') + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.remarks) + '</td><td>' + (r.fu_updated_at ? esc(dmy(r.fu_updated_at.slice(0, 10))) + ' ' + esc(r.fu_updated_by || '') : '') + '</td></tr>').join('')
      + '</tbody><tfoot><tr class="tot"><td colspan="4"><b>' + f.length + ' customers cleared</b></td><td class="n"><b>' + m2(f.reduce((s, r) => s + o30(r), 0)) + '</b></td><td colspan="5"></td></tr></tfoot></table></div>';
  }

  // ---------- Progress (books: Progress sheet) + a small trend chart ----------
  function sumDays(codes) {
    const by = {}; S.days.filter(x => codes.includes(x.operation)).forEach(x => { const t = by[x.as_at] = by[x.as_at] || {as_at: x.as_at, customers: 0, b31: 0, b61: 0, b91: 0, b120: 0, o30: 0, o60: 0, o90: 0, cash: 0, cash60: 0, setoff: 0, new_cust: 0, cleared: 0, credits: 0, ops: 0};
      ['customers', 'b31', 'b61', 'b91', 'b120', 'o30', 'o60', 'o90', 'cash', 'cash60', 'setoff', 'new_cust', 'cleared', 'credits'].forEach(k => t[k] += n(x[k])); t.ops++; });
    return Object.values(by).sort((a, b) => a.as_at.localeCompare(b.as_at));
  }
  function trend(rowsT) {
    if (rowsT.length < 2) return '<div class="hint">The trend shows after two C40 updates.</div>';
    const W = 640, H = 200, P = 48, mx = Math.max(...rowsT.map(x => x.o30)) || 1, X = i => P + (W - P - 10) * i / (rowsT.length - 1), Y = v => 10 + (H - 40) * (1 - v / mx);
    const ln = (k, c) => '<polyline fill="none" stroke="' + c + '" stroke-width="2.5" points="' + rowsT.map((x, i) => X(i) + ',' + Y(x[k])).join(' ') + '"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:720px">' + [0, .5, 1].map(f => '<line x1="' + P + '" x2="' + (W - 10) + '" y1="' + Y(mx * f) + '" y2="' + Y(mx * f) + '" stroke="var(--line)"/><text x="' + (P - 4) + '" y="' + (Y(mx * f) + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + (mx * f / 1e6).toFixed(1) + ' Mn</text>').join('')
      + ln('o30', 'var(--primary)') + ln('o60', 'var(--danger)') + ln('o90', 'var(--accent)')
      + rowsT.map((x, i) => i % Math.ceil(rowsT.length / 8) ? '' : '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + dmy(x.as_at).slice(0, 5) + '</text>').join('') + '</svg>'
      + '<div class="hint"><b style="color:var(--primary)">Over 30</b> · <b style="color:var(--danger)">Over 60</b> · <b style="color:var(--accent)">Over 90</b></div>';
  }
  function progPage() {
    const codes = op ? [op] : myOps().map(o => o.code), t = sumDays(codes);
    $('page').innerHTML = head('Outstanding · Progress by update') + chips() + '<div class="card">' + trend(t) + '</div>'
      + '<div class="wrap" style="margin-top:10px"><table style="min-width:1100px"><thead><tr><th>Date</th><th class="n">Customers</th><th class="n">31-60</th><th class="n">61-90</th><th class="n">91-120</th><th class="n">Over 120</th><th class="n">Over 30</th><th class="n">Over 60</th><th class="n">Over 90</th><th class="n">Cash</th><th class="n">Cash on Over 60</th><th class="n">Set off</th><th class="n">New</th><th class="n">Cleared</th><th class="n">Credits</th></tr></thead><tbody>'
      + t.slice().reverse().map(x => '<tr><td>' + esc(dmy(x.as_at)) + (!op && x.ops < codes.length ? ' <span class="hint">(' + x.ops + ' ops)</span>' : '') + '</td><td class="n">' + x.customers + '</td><td class="n">' + m0(x.b31) + '</td><td class="n">' + m0(x.b61) + '</td><td class="n">' + m0(x.b91) + '</td><td class="n">' + m0(x.b120) + '</td><td class="n"><b>' + m0(x.o30) + '</b></td><td class="n"><b>' + m0(x.o60) + '</b></td><td class="n">' + m0(x.o90) + '</td><td class="n">' + m0(x.cash) + '</td><td class="n">' + m0(x.cash60) + '</td><td class="n">' + m0(x.setoff) + '</td><td class="n">' + x.new_cust + '</td><td class="n">' + x.cleared + '</td><td class="n">' + m0(x.credits) + '</td></tr>').join('')
      + '</tbody></table></div>';
  }

  // ---------- Weekly target (A + B + C) ----------
  const targetOf = c => S.targets.find(t => t.operation === c);
  function weekTable(codes, wk) {
    const rowsW = codes.map(c => { const w = S.weeks.find(x => x.operation === c && x.week === wk); const live = w && today() >= w.w_from && today() <= addD(w.w_to, 2); return {c, w, st: wkStat(w, live), t: targetOf(c), live}; });
    const tot = k => rowsW.reduce((s, x) => s + n(x.w && x.w[k]), 0), cN = rowsW.reduce((s, x) => s + (x.live ? cLive(x.c).n : n(x.w && x.w.c_n)), 0), cOk = rowsW.reduce((s, x) => s + (x.live ? cLive(x.c).ok : Math.round(n(x.w && x.w.c_n) * n(x.w && x.w.c_cov))), 0);
    return '<div class="wrap"><table style="min-width:1100px"><thead><tr><th>Operation</th><th>Officer</th><th class="n">A target</th><th class="n">A collected</th><th class="n">A %</th><th class="n">B target</th><th class="n">B collected</th><th class="n">B %</th><th class="n">C coverage</th><th>Status</th><th class="n">31-12 Over 60 target</th><th class="n">Set off (not in A)</th></tr></thead><tbody>'
      + rowsW.map(x => '<tr><td>' + esc(x.c + ' - ' + opName(x.c)) + '</td><td>' + esc((x.t && x.t.officer) || '') + '</td><td class="n">' + (x.w && x.w.a_target != null ? m0(x.w.a_target) : x.w && x.w.a_plan != null ? '<span class="hint">plan ' + m0(x.w.a_plan) + '</span>' : '') + '</td><td class="n">' + (x.w && x.w.started ? m0(x.w.a_coll) : '') + '</td><td class="n">' + pc(x.st.ap) + '</td><td class="n">' + (x.w && x.w.b_target != null ? m0(x.w.b_target) : '') + '</td><td class="n">' + (x.w && x.w.started ? m0(x.w.b_coll) : '') + '</td><td class="n">' + pc(x.st.bp) + '</td><td class="n">' + pc(x.st.c) + (x.live ? ' <span class="hint">live</span>' : '') + '</td><td>' + stTag(x.st.label) + '</td><td class="n">' + (x.t ? m0(x.t.target_o60) + (x.t.approved ? '' : ' <span class="hint">draft</span>') : '') + '</td><td class="n">' + (x.w && x.w.setoff ? m0(x.w.setoff) : '') + '</td></tr>').join('')
      + '</tbody><tfoot><tr class="tot"><td colspan="2"><b>Total</b></td><td class="n">' + m0(tot('a_target')) + '</td><td class="n">' + m0(tot('a_coll')) + '</td><td class="n">' + pc(tot('a_target') ? tot('a_coll') / tot('a_target') : null) + '</td><td class="n">' + m0(tot('b_target')) + '</td><td class="n">' + m0(tot('b_coll')) + '</td><td class="n">' + pc(tot('b_target') ? tot('b_coll') / tot('b_target') : null) + '</td><td class="n">' + pc(cN ? cOk / cN : null) + '</td><td></td><td class="n">' + m0(codes.reduce((s, c) => s + n((targetOf(c) || {}).target_o60), 0)) + '</td><td class="n">' + m0(tot('setoff')) + '</td></tr></tfoot></table></div>';
  }
  const curWeek = () => { const t = today(); const ws = [...new Set(S.weeks.map(w => w.week + '|' + w.w_from + '|' + w.w_to))].map(s => s.split('|')).sort((a, b) => a[1].localeCompare(b[1])); const c = ws.find(w => t >= w[1] && t <= addD(w[2], 1)) || ws.filter(w => w[1] <= t).pop() || ws[0]; return c ? c[0] : null; };
  let WK = null;
  function weekPage() {
    const codes = op ? [op] : myOps().map(o => o.code), weeks = [...new Set(S.weeks.map(w => w.week))].sort();
    if (!weeks.length) { $('page').innerHTML = head('Weekly target') + chips() + '<div class="card">No weekly rows yet (they come with the first C40 update).</div>'; return; }
    if (!WK || !weeks.includes(WK)) WK = curWeek();
    const w0 = S.weeks.find(w => w.week === WK) || {};
    let h = head('Outstanding · Weekly target') + chips()
      + '<div class="chips noprint" style="margin-bottom:8px">' + weeks.map(w => { const x = S.weeks.find(y => y.week === w); return '<button data-oswk="' + w + '"' + (WK === w ? ' class="on"' : '') + '>' + w + ' ' + dmy(x.w_from).slice(0, 5) + '-' + dmy(x.w_to).slice(0, 5) + '</button>'; }).join('') + '</div>'
      + '<div class="hint">' + esc(WK) + ': ' + dmy(w0.w_from) + ' to ' + dmy(w0.w_to) + ' · plan ' + pc(w0.plan_pct) + ' of the 31-12 Over 60 target by the week end. A = Over 60 cash collection (with catch-up), B = 70% of the invoices turning 61+ this week, C = Over 60 customers with a Main reason updated in the last 7 days (target 100%). Status = the worst of A, B and C. Targets are drafts until the Director approves them.</div>'
      + weekTable(codes, WK);
    if (op) {
      const ws = S.weeks.filter(w => w.operation === op).sort((a, b) => a.w_from.localeCompare(b.w_from));
      h += '<div class="card" style="margin-top:10px"><h3>All weeks · ' + esc(op) + '</h3><table><thead><tr><th>Week</th><th>From</th><th>To</th><th class="n">Plan %</th><th class="n">A target</th><th class="n">A collected</th><th class="n">B target</th><th class="n">B collected</th><th class="n">C</th><th>Status</th></tr></thead><tbody>'
        + ws.map(w => { const live = today() >= w.w_from && today() <= addD(w.w_to, 2), st = wkStat(w, live); return '<tr><td>' + w.week + '</td><td>' + dmy(w.w_from) + '</td><td>' + dmy(w.w_to) + '</td><td class="n">' + pc(w.plan_pct) + '</td><td class="n">' + (w.a_target != null ? m0(w.a_target) : '') + '</td><td class="n">' + (w.started ? m0(w.a_coll) : '') + '</td><td class="n">' + (w.b_target != null ? m0(w.b_target) : '') + '</td><td class="n">' + (w.started ? m0(w.b_coll) : '') + '</td><td class="n">' + pc(st.c) + '</td><td>' + stTag(st.label) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    $('page').innerHTML = h;
  }

  // ---------- Old lists (October 2026 uploads, invoice level, read only) ----------
  async function oldPage() {
    if (!S.old) S.old = (await fetchAll('/rest/v1/v_receivable?select=*&details->>level=eq.invoice_v1&order=operation,outlet,id').catch(() => [])) || [];
    const f = S.old.filter(r => !op || r.operation === op);
    $('page').innerHTML = head('Outstanding · Old lists (October 2026)') + chips()
      + '<div class="hint">The invoice lists loaded by hand at the end of October, before the daily C40 update. Their remarks were copied to the customer records (moved on the migration day). Read only.</div>'
      + '<div class="wrap"><table style="min-width:900px"><thead><tr><th>No</th><th>Op</th><th>Outlet</th><th>Memo / invoice</th><th class="n">Balance (Oct)</th><th>Reason</th><th>Moved to</th></tr></thead><tbody>'
      + f.map(r => { const to = r.details && r.details.v1_to ? custRows().find(x => x.id === r.details.v1_to) : null; return '<tr class="row" data-osold="' + r.id + '"><td class="rno">' + esc(r.rec_code || '') + '</td><td>' + esc(r.operation) + '</td><td>' + esc(r.outlet) + '</td><td>' + esc(r.ref_key) + '</td><td class="n">' + m2(r.amount) + '</td><td>' + esc(r.reason) + '</td><td>' + (to ? esc(to.rec_code + ' ' + to.outlet) : '<span class="hint">' + esc((r.details && r.details.v1_note) || '') + '</span>') + '</td></tr>'; }).join('')
      + '</tbody></table></div>';
  }

  async function items() {
    const fn = {cust: custPage, inv: invPage, cred: credPage, coll: collPage, sett: settPage, prog: progPage, week: weekPage, old: oldPage}[tab] || custPage;
    await fn();
  }

  // ---------- Master dashboard (books: Master Dashboard - All Operations) ----------
  function actionList(codes) {
    const out = [];
    codes.forEach(c => {
      const a = custRows().filter(r => r.operation === c && isActive(r)), t = targetOf(c), off = (t && t.officer) || '';
      const mk = (p, iss, r) => ({p, iss, r, off});
      a.filter(r => promiseMissed(r)).forEach(r => out.push(mk(1, 'Promise missed', r)));
      a.filter(r => n(D(r).ret) > 0.005).forEach(r => out.push(mk(1, 'Returned cheque Rs ' + m0(D(r).ret), r)));
      a.filter(r => o60(r) >= 1 && !r.reason).sort((x, y) => o60(y) - o60(x)).slice(0, 15).forEach(r => out.push(mk(2, 'Over 60, no remark', r)));
      a.filter(r => o60(r) >= 1 && r.reason && !fresh(r)).sort((x, y) => o60(y) - o60(x)).slice(0, 10).forEach(r => out.push(mk(3, 'No update 7+ days', r)));
      a.filter(r => n(D(r).soon60) >= 50000).sort((x, y) => n(D(y).soon60) - n(D(x).soon60)).slice(0, 10).forEach(r => out.push(mk(3, 'Turns 61+ in 7 days: Rs ' + m0(D(r).soon60), r)));
    });
    return out.sort((x, y) => x.p - y.p || o60(y.r) - o60(x.r));
  }
  function actTable(list, max) {
    const l = max ? list.slice(0, max) : list;
    return '<div class="wrap"><table style="min-width:1100px"><thead><tr><th class="n">P</th><th>Issue</th><th>Op</th><th>Officer</th><th>Customer</th><th class="n">Over 60</th><th class="n">Over 30</th><th class="n">Days</th><th>Main reason</th><th>Promise</th><th>Last update</th><th>Explanation</th></tr></thead><tbody>'
      + l.map(x => '<tr class="row" data-open="' + x.r.id + '"><td class="n"><span class="tag t-' + (x.p === 1 ? 'r' : x.p === 2 ? 'w' : 'b') + '">' + x.p + '</span></td><td>' + esc(x.iss) + '</td><td>' + esc(x.r.operation) + '</td><td>' + esc(x.off) + '</td><td>' + esc(x.r.outlet) + '</td><td class="n">' + m0(o60(x.r)) + '</td><td class="n">' + m0(o30(x.r)) + '</td><td class="n">' + (x.r.aging_days == null ? '' : x.r.aging_days) + '</td><td>' + esc(x.r.reason) + '</td><td>' + (x.r.promised_date ? esc(dmy(x.r.promised_date)) + (x.r.promised_amount != null ? ' · ' + m0(x.r.promised_amount) : '') : '') + '</td><td>' + (x.r.fu_updated_at ? esc(dmy(x.r.fu_updated_at.slice(0, 10))) : 'never') + '</td><td>' + esc(x.r.remarks) + '</td></tr>').join('')
      + '</tbody></table></div>' + (max && list.length > max ? '<div class="hint">' + (list.length - max) + ' more in the Report tab.</div>' : '');
  }
  function master() {
    const codes = op ? [op] : myOps().map(o => o.code), act = custRows().filter(r => codes.includes(r.operation) && isActive(r)), c60 = act.filter(r => o60(r) >= 1);
    const S2 = (a, f) => a.reduce((s, r) => s + f(r), 0), wk = curWeek(), acts = actionList(codes);
    const byOp = codes.map(c => { const a = act.filter(r => r.operation === c), z = a.filter(r => o60(r) >= 1), ld = lastDay(c); return {c, n: a.length, o30: S2(a, o30), o60: S2(a, o60), o90: S2(a, r => n(D(r).o90)), cash: ld && ld.as_at === asAt() ? n(ld.cash) : 0, setoff: ld && ld.as_at === asAt() ? n(ld.setoff) : 0, nr: z.filter(r => !r.reason).length, pm: a.filter(promiseMissed).length, cov: z.length ? z.filter(r => r.reason && fresh(r)).length / z.length : 1, as: ld && ld.as_at}; });
    const offs = {}; byOp.forEach(x => { const o = ((targetOf(x.c) || {}).officer) || '(no officer)'; const t = offs[o] = offs[o] || {o, ops: [], n: 0, o30: 0, o60: 0, nr: 0, pm: 0}; t.ops.push(x.c); t.n += x.n; t.o30 += x.o30; t.o60 += x.o60; t.nr += x.nr; t.pm += x.pm; });
    const stale = byOp.filter(x => x.as && x.as !== asAt());
    $('page').innerHTML = head('Outstanding · Master dashboard') + (isBoard() && window.osDecisionView ? '<div class="row2 noprint" style="margin-bottom:6px"><button class="btn" data-osact="decision">Decision view (trend, coming risk)</button></div>' : '')
      + (stale.length ? '<div class="card err">Not updated with the latest C40 export: ' + stale.map(x => esc(x.c) + ' (' + dmy(x.as) + ')').join(', ') + '</div>' : '')
      + '<div class="grid">' + tile('', act.length, 'Customers over 30') + tile('', m0(S2(act, o30)), 'Over 30') + tile('r', m0(S2(act, o60)), 'Over 60') + tile('r', m0(S2(act, r => n(D(r).o90))), 'Over 90')
      + tile('g', m0(byOp.reduce((s, x) => s + x.cash, 0)), 'Cash at the last update') + tile('', m0(byOp.reduce((s, x) => s + x.setoff, 0)), 'Set off at the last update')
      + tile('r', act.filter(promiseMissed).length, 'Promise missed') + tile('a', c60.filter(r => !r.reason).length, 'Over 60, no remark') + tile('a', c60.filter(r => r.reason && !fresh(r)).length, 'No update 7+ days') + tile('r', act.filter(r => n(D(r).ret) > 0.005).length, 'Returned cheques') + '</div>'
      + (wk ? '<div class="card" style="margin-top:10px"><h3>This week (' + esc(wk) + ') · targets by operation</h3>' + weekTable(codes, wk) + '</div>' : '')
      + '<div class="grid2" style="margin-top:10px"><div class="card"><h3>By operation</h3><table><thead><tr><th>Operation</th><th class="n">Customers</th><th class="n">Over 30</th><th class="n">Over 60</th><th class="n">No remark (60+)</th><th class="n">Promise missed</th><th class="n">C</th></tr></thead><tbody>'
      + byOp.map(x => '<tr class="row" data-osop="' + x.c + '"><td>' + esc(x.c + ' - ' + opName(x.c)) + '</td><td class="n">' + x.n + '</td><td class="n">' + m0(x.o30) + '</td><td class="n">' + m0(x.o60) + '</td><td class="n">' + x.nr + '</td><td class="n">' + x.pm + '</td><td class="n">' + pc(x.cov) + '</td></tr>').join('') + '</tbody></table></div>'
      + '<div class="card"><h3>By officer</h3><table><thead><tr><th>Officer</th><th>Operations</th><th class="n">Customers</th><th class="n">Over 60</th><th class="n">No remark</th><th class="n">Promise missed</th></tr></thead><tbody>'
      + Object.values(offs).sort((a, b) => b.o60 - a.o60).map(x => '<tr><td>' + esc(x.o) + '</td><td>' + esc(x.ops.join(', ')) + '</td><td class="n">' + x.n + '</td><td class="n">' + m0(x.o60) + '</td><td class="n">' + x.nr + '</td><td class="n">' + x.pm + '</td></tr>').join('') + '</tbody></table></div></div>'
      + '<div class="card" style="margin-top:10px"><h3>Trend</h3>' + trend(sumDays(codes)) + '</div>'
      + '<div class="card" style="margin-top:10px"><h3>Action list (' + acts.length + ')</h3><div class="hint">P1 = promise missed / returned cheque (all) · P2 = Over 60 with no remark (top 15 per operation) · P3 = no update 7+ days and invoices turning 61+ in 7 days (top 10 each per operation)</div>' + actTable(acts, 60) + '</div>';
  }

  // ---------- Report (printable) + CSV ----------
  function report() {
    const codes = op ? [op] : myOps().map(o => o.code), act = custRows().filter(r => codes.includes(r.operation) && isActive(r)), wk = curWeek(), acts = actionList(codes);
    const S2 = (a, f) => a.reduce((s, r) => s + f(r), 0), top = act.slice().sort((a, b) => o60(b) - o60(a)).slice(0, 40);
    $('page').innerHTML = '<div class="noprint row2"><button class="btn p" data-osact="print">Print / Save as PDF</button><button class="btn" data-osact="csv">Download Excel (CSV)</button></div>'
      + '<h2 class="pt">Outstanding daily report</h2><div class="hint">' + (op ? esc(op + ' - ' + opName(op)) : 'All my operations') + ' · C40 as at ' + dmy(asAt(op)) + ' · source C40 B2001 + B2011 · Iceman IMS</div>'
      + '<table style="margin:8px 0"><tbody>' + [['Customers over 30', act.length], ['Over 30 total', m2(S2(act, o30))], ['Over 60 total', m2(S2(act, o60))], ['Over 90 total', m2(S2(act, r => n(D(r).o90)))], ['Cash at the last update', m2(S2(act, r => n(D(r).cash)))], ['Set off at the last update', m2(S2(act, r => n(D(r).setoff)))], ['Promise missed', act.filter(promiseMissed).length], ['Over 60 with no remark', act.filter(r => o60(r) >= 1 && !r.reason).length]].map(x => '<tr><td>' + x[0] + '</td><td class="n"><b>' + x[1] + '</b></td></tr>').join('') + '</tbody></table>'
      + (wk ? '<h3>Weekly targets (' + esc(wk) + ')</h3>' + weekTable(codes, wk) : '')
      + '<h3 style="margin-top:12px">Action list</h3>' + actTable(acts)
      + '<h3 style="margin-top:12px">Largest Over 60 customers (40)</h3><div class="wrap"><table><thead><tr><th>Op</th><th>Customer</th><th>Rep</th><th class="n">Days</th><th class="n">Over 60</th><th class="n">Over 30</th><th>Main reason</th><th>Next action</th><th>Promise</th></tr></thead><tbody>'
      + top.map(r => '<tr class="' + ageCls(r).trim() + '"><td>' + esc(r.operation) + '</td><td>' + esc(r.outlet) + '</td><td>' + esc(r.owner_name) + '</td><td class="n">' + (r.aging_days == null ? '' : r.aging_days) + '</td><td class="n">' + m0(o60(r)) + '</td><td class="n">' + m0(o30(r)) + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.next_step) + '</td><td>' + (r.promised_date ? esc(dmy(r.promised_date)) : '') + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function csv() {
    const codes = op ? [op] : myOps().map(o => o.code), list = custRows().filter(r => codes.includes(r.operation) && isActive(r)), q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const cols = [['Record no', r => r.rec_code], ['Operation', r => r.operation], ['Customer', r => r.outlet], ['Company', r => D(r).co], ['Class', r => r.party], ['Sales rep', r => r.owner_name], ['Oldest Over 30 invoice', r => r.base_date], ['Days (oldest)', r => r.aging_days], ['Days past due', r => D(r).pastdue],
      ['31-60', r => D(r).b31], ['61-90', r => D(r).b61], ['91-120', r => D(r).b91], ['Over 120', r => D(r).b120], ['Over 30 total', r => r.amount], ['Over 60 total', r => D(r).o60], ['1-30 and current', r => D(r).cur], ['Credits not allocated', r => D(r).cred], ['Net balance', r => D(r).net],
      ['Over 30 last update', r => D(r).o30_prev], ['Paid since last update (cash)', r => D(r).cash], ['Set off since last update', r => D(r).setoff], ['Flags', r => flags(r).map(f => f[1]).join(' | ')], ['Main reason', r => r.reason], ['Clear explanation', r => r.remarks], ['Next action', r => r.next_step], ['Who', r => r.next_owner], ['Next date', r => r.next_date],
      ['Promise date', r => r.promised_date], ['Promise amount', r => r.promised_amount], ['Updated by', r => r.fu_updated_by], ['Last update', r => (r.fu_updated_at || '').slice(0, 10)], ['Status', r => STATUS[r.status]]];
    const txt = '﻿' + cols.map(c => q(c[0])).join(',') + '\r\n' + list.map(r => cols.map(c => q(c[1](r))).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], {type: 'text/csv'})); a.download = 'Outstanding ' + (op || 'all') + ' C40 ' + asAt(op) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- customer page and follow-up form ----------
  const _plan = window.planHtml, _form = window.formHtml, _rec = window.renderRecord;
  window.planHtml = function (r) {
    if (!isCust(r)) return _plan(r);
    const late = r.next_date && r.next_date < today() && isActive(r), row = (k, v, cls) => '<dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + (v ? esc(v) : '<span class="hint">not set</span>') + '</dd>';
    return '<dl>' + row('Status', STATUS[r.status]) + row('Main reason', r.reason) + row('Clear explanation', r.remarks) + row('Next action', r.next_step) + row('Who does it', r.next_owner) + row('Next action date', r.next_date ? dmy(r.next_date) : '', late ? 'late' : '')
      + row('Promise date', r.promised_date ? dmy(r.promised_date) : '', promiseMissed(r) ? 'late' : '') + row('Promise amount', r.promised_amount != null ? m2(r.promised_amount) : '') + row('Last update', r.fu_updated_at ? fmtDT(new Date(r.fu_updated_at)) + ' · ' + (r.fu_updated_by || '') : '', !fresh(r) && o60(r) >= 1 ? 'late' : '')
      + (r.status === 'settled' ? row('Cleared', r.settle_remark) : '') + '</dl>';
  };
  window.formHtml = function (r, canEdit, canFull) {
    if (!isCust(r)) return _form(r, canEdit, canFull);
    const dis = canEdit ? '' : ' disabled', rl = lists.reason.includes(r.reason) || !r.reason ? lists.reason : lists.reason.concat([r.reason]);
    const stOk = ['open', 'promised', 'dispute', 'action_pending'].concat(canFull ? ['written_off'] : []).concat(r.status === 'settled' ? ['settled'] : []);
    return '<label>Status</label><select id="eStatus"' + dis + '>' + stOk.map(k => '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + STATUS[k] + (k === 'settled' ? ' (cleared in C40)' : '') + '</option>').join('') + '</select>'
      + '<label>Main reason</label><select id="eReason"' + dis + '>' + selOpts(rl, r.reason, true) + '</select>'
      + '<label>Clear explanation of the current situation</label><textarea id="eRem" rows="3" maxlength="1000"' + dis + ' placeholder="e.g. Owner agreed to pay Over 60 in 2 parts; cheque for 120,000 on 28 Nov">' + esc(r.remarks) + '</textarea>'
      + '<label>Next action</label><input id="eStep" list="osNext" maxlength="300" value="' + esc(r.next_step) + '"' + dis + ' placeholder="e.g. Visit with the rep and collect the cheque"><datalist id="osNext">' + lists.next_step.map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>'
      + '<label>Who does it</label><input id="eOwner" value="' + esc(r.next_owner) + '"' + dis + '>'
      + '<label>Next action date</label><input id="eNext" type="date" value="' + esc(r.next_date) + '"' + dis + '>'
      + '<div class="row2"><div style="flex:1"><label>Promise date</label><input id="ePromise" type="date" value="' + esc(r.promised_date) + '"' + dis + '></div><div style="flex:1"><label>Promise amount (Rs)</label><input id="ePAmt" type="number" min="0" step="0.01" inputmode="decimal" value="' + (r.promised_amount != null ? esc(r.promised_amount) : '') + '"' + dis + '></div></div>'
      + '<div class="hint">Updated by and the date are saved by IMS. Only cash counts against a promise; set off by Accounts does not.</div>';
  };
  let RC = {id: null, inv: null, cred: null, coll: null, notes: null};
  window.renderRecord = function () {
    const r0 = rows.find(x => x.id === recId);
    if (!r0) { const o = (S.old || []).find(x => x.id === recId); if (o) { rows.push(o); } return _rec(); }
    if (!isCust(r0)) return _rec();
    cur = r0; const r = cur, d = D(r), c = canOf(r), list = (tab === 'cust' ? ofilt('') : myCust()).sort((a, b) => o60(b) - o60(a)), i = list.findIndex(x => x.id === r.id), prev = list[i - 1], next = list[i + 1];
    $('page').innerHTML = '<div class="crumb noprint"><a data-back="1">Follow-up</a> &rsaquo; Outstanding &rsaquo; <b>' + esc(r.outlet) + '</b></div>'
      + '<div class="rhero"><div><h2 class="pt">' + (r.rec_code ? '<span class="rtag">' + esc(r.rec_code) + '</span> ' : '') + esc(r.outlet) + '</h2><div class="hint">' + esc(d.co || '') + ' · ' + esc(r.party || '') + ' · sales rep ' + esc(r.owner_name || 'not set') + ' · operation ' + esc(r.operation + ' - ' + opName(r.operation)) + ' · C40 as at ' + esc(dmy(d.as_at)) + '</div></div>'
      + '<div class="row2 noprint"><button class="btn" data-back="1">&larr; Back to list</button><button class="btn" data-rec="' + (prev ? prev.id : '') + '"' + (prev ? '' : ' disabled') + '>&lsaquo; Previous</button><button class="btn" data-rec="' + (next ? next.id : '') + '"' + (next ? '' : ' disabled') + '>Next &rsaquo;</button></div></div>'
      + '<div class="grid">' + tile('', m2(r.amount), 'Over 30 total') + tile('r', m2(d.o60), 'Over 60 total') + tile(r.aging_days > 120 ? 'r' : 'a', (r.aging_days == null ? '-' : r.aging_days + ' days'), 'Oldest Over 30 invoice ' + esc(dmy(r.base_date))) + tile('', m2(d.cur), '1-30 and current')
      + tile('a', m2(d.cred), 'Credits not allocated') + tile('', m2(d.net), 'Net balance (C40)') + tile('g', m2(d.cash) + (n(d.setoff) ? ' <small>+ set off ' + m0(d.setoff) + '</small>' : ''), 'Paid since the last update') + tile('', d.o30_prev == null ? '-' : m2(d.o30_prev), 'Over 30 at the last update') + '</div>'
      + '<div class="card" style="margin-top:8px"><table><thead><tr><th class="n">31-60</th><th class="n">61-90</th><th class="n">91-120</th><th class="n">Over 120</th><th class="n">Over 30</th><th class="n">Over 90</th><th class="n">Days past due</th><th>Flags</th></tr></thead><tbody><tr><td class="n">' + m2(d.b31) + '</td><td class="n">' + m2(d.b61) + '</td><td class="n">' + m2(d.b91) + '</td><td class="n">' + m2(d.b120) + '</td><td class="n"><b>' + m2(r.amount) + '</b></td><td class="n">' + m2(d.o90) + '</td><td class="n">' + (d.pastdue == null ? '' : d.pastdue) + '</td><td>' + flagHtml(r) + '</td></tr></tbody></table></div>'
      + '<div class="rgrid"><div class="card"><div class="tlh"><h3>Timeline</h3><div class="chips noprint" id="tlChips"></div><button class="btn noprint" data-ract="present" title="Big timeline for a meeting screen (Esc to exit)">' + (document.body.classList.contains('present') ? 'Exit present' : '&#x26F6; Present') + '</button><button class="btn p noprint" data-ract="note">+ Add remark</button></div>'
      + '<div class="hint">Every remark and change on this customer, oldest first, with who added it and when.</div><div id="hist" class="tl">Loading...</div><button class="fake noprint" data-ract="note">Write a remark for everyone following this customer...</button>'
      + '<h3 style="margin-top:14px">Invoices over 30 days</h3><div id="osRInv" class="hint">Loading...</div><h3 style="margin-top:14px">Unapplied credits</h3><div id="osRCred" class="hint">Loading...</div><h3 style="margin-top:14px">Collections (last 30 days)</h3><div id="osRColl" class="hint">Loading...</div></div>'
      + '<div class="side"><div class="card plan"><div class="tlh"><h3>Current follow-up</h3>' + (c.edit ? '<button class="btn noprint" data-ract="edit">&#9998; Update</button>' : '') + '</div>' + window.planHtml(r)
      + (c.edit ? '' : '<div class="hint" style="margin-top:8px">You can add remarks. Only users with edit access change the follow-up fields.</div>') + '</div>'
      + '<div class="card plan"><div class="tlh"><h3>Contacts</h3>' + (c.edit ? '<button class="btn noprint" data-ract="contact">&#9998; Edit</button>' : '') + '</div>' + contactHtml(r) + '</div></div></div>';
    if (tlItem !== r.id) { tlEv = []; tlF = 'all'; } paintTl(); loadHist(); window.scrollTo(0, 0);
    recExtras(r);
  };
  async function recExtras(r) {
    try {
      await warm();
      const [inv, cred, N, coll] = await Promise.all([linesOf(r.operation, 'inv'), linesOf(r.operation, 'cred'), notesOf(r.operation), collOf(r.operation, addD(today(), -30))]);
      if (cur !== r) return;
      const mi = inv.filter(x => x.cust_key === r.ref_key), mc = cred.filter(x => x.cust_key === r.ref_key), mo = coll.filter(x => x.cust_key === r.ref_key), ed = canOf(r).edit;
      const box = (id, h) => { const e = $(id); if (e) { e.className = ''; e.innerHTML = h; } };
      box('osRInv', mi.length ? '<div class="wrap" style="box-shadow:none"><table><thead><tr><th>Invoice</th><th>Date</th><th class="n">Days</th><th>Band</th><th class="n">Balance</th><th>Since last update</th><th>Remark</th><th></th></tr></thead><tbody>' + mi.map(x => { const nt = N['invoice|' + x.line_key]; return '<tr><td>' + esc(x.ref_no) + ' <span class="hint">' + esc(x.txn_type) + '</span></td><td>' + esc(dmy(x.inv_date)) + '</td><td class="n">' + x.days + '</td><td>' + esc(x.band) + '</td><td class="n">' + m2(x.amount) + '</td><td>' + esc(x.line_status || '') + (x.bal_prev != null && x.line_status !== 'Unchanged' ? ' <span class="hint">(' + m2(x.bal_prev) + ')</span>' : '') + '</td><td>' + (nt ? esc(nt.note) + ' <span class="hint">' + esc(nt.by_name || '') + '</span>' : '') + '</td><td>' + (ed ? '<button class="btn q noprint" data-osnote="invoice" data-cust="' + esc(r.ref_key) + '" data-line="' + esc(x.line_key) + '" data-ref="' + esc(x.ref_no) + '">&#9998;</button>' : '') + '</td></tr>'; }).join('') + '<tr class="tot"><td colspan="4"><b>' + mi.length + ' invoices</b></td><td class="n"><b>' + m2(mi.reduce((s, x) => s + n(x.amount), 0)) + '</b></td><td colspan="3"></td></tr></tbody></table></div>' : 'None.');
      box('osRCred', mc.length ? '<table><thead><tr><th>Type</th><th>Ref</th><th>Date</th><th class="n">Amount</th><th>Accounts remark</th></tr></thead><tbody>' + mc.map(x => { const nt = N['accounts|' + x.line_key]; return '<tr><td>' + esc(x.txn_type) + '</td><td>' + esc(x.ref_no) + '</td><td>' + esc(dmy(x.inv_date)) + '</td><td class="n">' + m2(x.amount) + '</td><td>' + (nt ? esc(nt.note) : '') + '</td></tr>'; }).join('') + '</tbody></table><div class="hint">Credits should be set off against the oldest open invoice (Accounts).</div>' : 'None.');
      box('osRColl', mo.length ? '<table><thead><tr><th>Found on</th><th>Invoice</th><th>Band</th><th class="n">Cash</th><th class="n">Set off</th></tr></thead><tbody>' + mo.map(x => '<tr><td>' + esc(dmy(x.as_at)) + '</td><td>' + esc(x.ref_no) + '</td><td>' + esc(x.band) + '</td><td class="n">' + m2(x.cash) + '</td><td class="n">' + (n(x.setoff) ? m2(x.setoff) : '') + '</td></tr>').join('') + '<tr class="tot"><td colspan="3"><b>Total</b></td><td class="n"><b>' + m2(mo.reduce((s, x) => s + n(x.cash), 0)) + '</b></td><td class="n">' + m2(mo.reduce((s, x) => s + n(x.setoff), 0)) + '</td></tr></tbody></table>' : 'No payment found in the last 30 days.');
    } catch (e) { const el = $('osRInv'); if (el) el.textContent = 'Not loaded: ' + e.message; }
  }

  // invoice / Accounts remark drawer
  function noteDrawer(b) {
    const kind = b.dataset.osnote, cu = b.dataset.cust, ln = b.dataset.line, ref = b.dataset.ref;
    $('panel').innerHTML = '<div class="dh"><div><h3>' + (kind === 'invoice' ? 'Invoice remark' : 'Accounts remark') + '</h3><div class="hint">' + esc(cu.split('|').slice(1).join('|')) + ' · ' + esc(ref) + '</div></div><button class="btn" data-pact="close">Close</button></div><div class="frm">'
      + '<label>Remark</label><textarea id="osNoteTx" rows="4" maxlength="1000" placeholder="' + (kind === 'invoice' ? 'e.g. GRN short 2 cartons, credit note asked on 21 Nov' : 'e.g. Advance to be set off against invoice 26OCT_MTC_32012') + '"></textarea>'
      + stampLine() + '<div class="row2"><button class="btn p" id="osNoteSave" data-op="' + esc(op || (rows.find(r => r.ref_key === cu) || {}).operation || '') + '" data-cust="' + esc(cu) + '" data-line="' + esc(ln) + '" data-kind="' + kind + '">Save</button><button class="btn" data-pact="close">Cancel</button></div><div class="err" id="pErr"></div></div>';
    $('panel').classList.add('open'); setTimeout(() => { const t = $('osNoteTx'); if (t) t.focus(); }, 150);
  }
  async function noteSave(b) {
    const t = $('osNoteTx').value.trim(); if (!t) { $('pErr').textContent = 'Write the remark first'; return; }
    const o = b.dataset.op || (cur && cur.operation);
    try {
      await api('/rest/v1/rpc/os_add_line_note', {method: 'POST', body: {p_op: o, p_cust: b.dataset.cust, p_line: b.dataset.line, p_kind: b.dataset.kind, p_note: t}});
      delete S.notes[o]; closeDrawer(); toast('Remark saved');
      if (page === 'record' && cur) { const id = cur.id; await loadRows(); cur = rows.find(x => x.id === id) || cur; window.renderRecord(); } else go();
    } catch (e) { $('pErr').textContent = e.message; }
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-ostab],[data-osact],[data-oscp],[data-oswk],[data-osnote],[data-osop],[data-osold],#osNoteSave');
    if (!t) return;
    if (t.dataset.ostab) { tab = t.dataset.ostab; go('items', 'receivable'); }
    else if (t.dataset.oscp) { CP = t.dataset.oscp; go(); }
    else if (t.dataset.oswk) { WK = t.dataset.oswk; go(); }
    else if (t.dataset.osop) { op = t.dataset.osop; tab = 'cust'; go('items', 'receivable'); }
    else if (t.dataset.osold) { e.stopPropagation(); const o = (S.old || []).find(x => x.id === t.dataset.osold); if (o && !rows.some(x => x.id === o.id)) rows.push(o); openRecord(t.dataset.osold); }
    else if (t.dataset.osnote) { e.stopPropagation(); noteDrawer(t); }
    else if (t.id === 'osNoteSave') guard(() => noteSave(t));
    else if (t.dataset.osact === 'clear') { Object.assign(OF, {band: '', rep: '', flag: '', reason: '', text: '', status: 'active'}); go(); }
    else if (t.dataset.osact === 'print') window.print();
    else if (t.dataset.osact === 'csv') csv();
    else if (t.dataset.osact === 'decision') window.osDecisionView();
  }, true);
  document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.osf && t.tagName === 'SELECT') { OF[t.dataset.osf] = t.value; go(); } else if (t.dataset && t.dataset.oif && t.tagName === 'SELECT') { IF[t.dataset.oif] = t.value; go(); } });
  let tmr = null;
  document.addEventListener('input', e => { const t = e.target; if (t.dataset && (t.dataset.osf === 'text' || t.dataset.oif === 'text')) { clearTimeout(tmr); tmr = setTimeout(() => { if (t.dataset.osf) OF.text = t.value; else IF.text = t.value; const pos = t.selectionStart; go(); const n2 = document.querySelector('[data-' + (t.dataset.osf ? 'osf' : 'oif') + '="text"]'); if (n2) { n2.focus(); try { n2.setSelectionRange(pos, pos); } catch (x) {} } }, 350); } });

  // ---------- register: Follow-up / Dashboard / Report of Outstanding ----------
  const prevDash = (window.MODULE_PAGES && MODULE_PAGES.receivable && MODULE_PAGES.receivable.dash) || null;
  if (prevDash) window.osDecisionView = prevDash;
  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {receivable: {items: () => run(items), dash: () => run(async () => master()), report: () => run(async () => report())}});
  window.osWarm = warm;
})();
