// v6.6 (2026-11-21): Compare & decide shown as charts: comparison cards, line chart (per operation lines, period shading), pie charts (age mix now / before, share by operation, Over 60 follow-up status, money in).
// v6.5 (2026-11-21): Compare & decide tab: pick operations (one, several, all) and a period (day / week / month / since start / two dates); this vs previous for Over 120/90/60/30, customers, cash; decisions from rules; by operation table + bars.
// v6.4 (2026-11-21): All operations dashboard redesigned (Overview / Details / Trend): Over 30/60/90/120/240 by operation (Over 240 from the invoice lines), age mix, Needs you, weekly A/B/C rings, officer table, trend, cash bars, Over 60 trend per operation.
// v6.3 (2026-11-21): Dashboard (all operations and each operation) shows the customers with no Main reason separately: by operation + list, oldest money first.
// v6.1 (2026-11-21): Operation dashboard (Dashboard chip / Dashboard tab with one operation), ages shown Over 120 -> 31-60 then Over 90 / 60 / 30, lists sorted oldest money first, tables scroll inside the page.
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
  const ymdL = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');   // local date (toISOString shifts a day back in Sri Lanka, +5:30)
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
  const addD = (s, k) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + k); return ymdL(d); };
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
  const TABS = [['dash', 'Dashboard'], ['cust', 'Customers'], ['inv', 'Invoices'], ['cred', 'Credits'], ['coll', 'Collections'], ['sett', 'Settled'], ['prog', 'Progress'], ['week', 'Weekly target']];
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
    const tl = [tile('r', m0(sumF(act, r => n(D(r).b120))), 'Over 120 total'), tile('r', m0(sumF(act, r => n(D(r).o90))), 'Over 90 total'), tile('a', m0(sumF(act, o60)), 'Over 60 total'), tile('', m0(sumF(act, o30)), 'Over 30 total'), tile('', act.length, 'Customers over 30 days'),
      tile('g', m0(sumF(act, r => n(D(r).cash))), 'Cash since the last update'), tile('', m0(sumF(act, r => n(D(r).setoff))), 'Set off (not cash)'),
      tile('a', c60.filter(r => !r.reason).length, 'Over 60 with no remark'), tile('r', act.filter(promiseMissed).length, 'Promise missed'), tile('a', c60.filter(r => r.reason && !fresh(r)).length, 'Over 60, no update 7+ days'),
      tile('', pc(c60.length ? c60.filter(r => r.reason && fresh(r)).length / c60.length : 1), 'C: Over 60 with a fresh remark')].join('');
    const base = myCust(), uniq = k => [...new Set(base.map(k).filter(Boolean))].sort();
    ['rep', 'reason'].forEach(k => { if (OF[k] && !uniq(k === 'rep' ? r => r.owner_name : r => r.reason || '(no reason yet)').includes(OF[k])) OF[k] = ''; });
    const cnt = (k, t) => ofilt(k).filter(t).length;
    const sel = (id, k, lab, list) => '<select data-osf="' + k + '"' + (OF[k] && !(k === 'status' && OF[k] === 'active') ? ' class="on"' : '') + '>' + list.map(x => '<option value="' + esc(x[0]) + '"' + (OF[k] === x[0] ? ' selected' : '') + '>' + esc(x[1]) + ' (' + cnt(k, x[2]) + ')</option>').join('') + '</select>';
    const f = ofilt('').sort((a, b) => (isActive(b) - isActive(a)) || (n(D(b).b120) - n(D(a).b120)) || (n(D(b).o90) - n(D(a).o90)) || (o60(b) - o60(a)) || (o30(b) - o30(a)));   // oldest money first: Over 120, 90, 60, 30
    $('page').innerHTML = head('Outstanding · Over 30 follow-up') + chips() + '<div class="grid">' + tl + '</div>'
      + '<div class="filters noprint">' + sel('', 'status', '', [['active', 'Active customers', isActive], ['settled', 'Cleared (settled)', r => r.status === 'settled'], ['all', 'All', () => true]])
      + sel('', 'band', '', [['', 'All ages (oldest invoice)', () => true]].concat(BANDS.map(b => [b[0], 'Oldest ' + b[1] + ' days', r => inB(r, b[0])])))
      + sel('', 'rep', '', [['', 'All sales reps', () => true]].concat(uniq(r => r.owner_name).map(v => [v, v, r => r.owner_name === v])))
      + sel('', 'reason', '', [['', 'All reasons', () => true]].concat(uniq(r => r.reason || '(no reason yet)').map(v => [v, v, r => (r.reason || '(no reason yet)') === v])))
      + sel('', 'flag', '', [['', 'All flags', () => true]].concat(FLAGS.map(x => [x[0], x[1], x[2]])))
      + '<input data-osf="text" placeholder="Search customer / rep / no / remark" value="' + esc(OF.text) + '" style="flex:1;min-width:170px">'
      + (OF.band || OF.rep || OF.flag || OF.reason || OF.text || OF.status !== 'active' ? '<button class="btn" data-osact="clear">Clear filters</button>' : '') + '</div>'
      + '<div class="hint">' + f.length + ' customers · Over 120 ' + m2(f.reduce((s, r) => s + n(D(r).b120), 0)) + ' · Over 90 ' + m2(f.reduce((s, r) => s + n(D(r).o90), 0)) + ' · Over 60 ' + m2(f.reduce((s, r) => s + o60(r), 0)) + ' · Over 30 ' + m2(f.reduce((s, r) => s + o30(r), 0)) + ' &nbsp; ' + ageKey() + '</div>'
      + '<div class="wrap"><table style="min-width:1500px"><thead><tr><th class="n">#</th><th>No</th><th>Customer</th><th>Sales rep</th><th class="n">Days</th><th class="n">Over 120</th><th class="n">91-120</th><th class="n">61-90</th><th class="n">31-60</th><th class="n">Over 90</th><th class="n">Over 60</th><th class="n">Over 30</th><th class="n">Credits</th><th class="n">Paid (cash)</th><th>Flags</th><th>Main reason</th><th>Next action</th><th>Promise</th><th>Last update</th><th></th></tr></thead><tbody>'
      + f.map((r, i) => { const d = D(r); return '<tr class="row' + ageCls(r) + '" data-open="' + r.id + '"><td class="n sno">' + (i + 1) + '</td><td class="rno">' + esc(r.rec_code || '') + '</td><td><b>' + esc(r.outlet) + '</b>' + (!op ? ' <span class="tag t-b">' + esc(r.operation) + '</span>' : '') + '</td><td>' + esc(r.owner_name) + '</td><td class="n">' + (r.aging_days == null ? '' : r.aging_days) + '</td>'
        + '<td class="n">' + m0(d.b120) + '</td><td class="n">' + m0(d.b91) + '</td><td class="n">' + m0(d.b61) + '</td><td class="n">' + m0(d.b31) + '</td><td class="n"><b>' + m0(d.o90) + '</b></td><td class="n"><b>' + m0(d.o60) + '</b></td><td class="n"><b>' + m0(r.amount) + '</b></td><td class="n">' + (n(d.cred) ? m0(d.cred) : '') + '</td><td class="n">' + (n(d.cash) ? m0(d.cash) : '') + '</td>'
        + '<td>' + flagHtml(r) + (isActive(r) ? '' : '<span class="tag t-g">Cleared ' + esc(dmy(d.cleared_on || r.settled_on)) + '</span>') + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.next_step) + (r.next_date ? '<br><span class="hint">' + esc(dmy(r.next_date)) + '</span>' : '') + '</td>'
        + '<td>' + (r.promised_date ? esc(dmy(r.promised_date)) + (r.promised_amount != null ? '<br>' + m0(r.promised_amount) : '') : '') + '</td><td>' + (r.fu_updated_at ? esc(dmy(r.fu_updated_at.slice(0, 10))) + '<br><span class="hint">' + esc(r.fu_updated_by || '') + '</span>' : '<span class="hint">never</span>') + '</td>'
        + '<td><button class="btn q" data-quick="' + r.id + '" title="Update follow-up">&#9998;</button></td></tr>'; }).join('')
      + '</tbody><tfoot>' + (f.length ? '<tr class="tot"><td colspan="5"><b>Total of ' + f.length + ' customers</b></td>' + ['b120', 'b91', 'b61', 'b31'].map(k => '<td class="n">' + m0(f.reduce((s, r) => s + n(D(r)[k]), 0)) + '</td>').join('')
        + '<td class="n"><b>' + m0(f.reduce((s, r) => s + n(D(r).o90), 0)) + '</b></td><td class="n"><b>' + m0(f.reduce((s, r) => s + o60(r), 0)) + '</b></td><td class="n"><b>' + m0(f.reduce((s, r) => s + o30(r), 0)) + '</b></td><td class="n">' + m0(f.reduce((s, r) => s + n(D(r).cred), 0)) + '</td><td class="n">' + m0(f.reduce((s, r) => s + n(D(r).cash), 0)) + '</td><td colspan="6"></td></tr>' : '<tr><td colspan="20" class="hint">No customers match the filters.</td></tr>') + '</tfoot></table></div>'
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
    const mon = (() => { const d = new Date(a + 'T00:00:00'), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymdL(d); })();
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
      + '<div class="wrap" style="margin-top:10px"><table style="min-width:1100px"><thead><tr><th>Date</th><th class="n">Customers</th><th class="n">Over 120</th><th class="n">91-120</th><th class="n">61-90</th><th class="n">31-60</th><th class="n">Over 90</th><th class="n">Over 60</th><th class="n">Over 30</th><th class="n">Cash</th><th class="n">Cash on Over 60</th><th class="n">Set off</th><th class="n">New</th><th class="n">Cleared</th><th class="n">Credits</th></tr></thead><tbody>'
      + t.slice().reverse().map(x => '<tr><td>' + esc(dmy(x.as_at)) + (!op && x.ops < codes.length ? ' <span class="hint">(' + x.ops + ' ops)</span>' : '') + '</td><td class="n">' + x.customers + '</td><td class="n">' + m0(x.b120) + '</td><td class="n">' + m0(x.b91) + '</td><td class="n">' + m0(x.b61) + '</td><td class="n">' + m0(x.b31) + '</td><td class="n"><b>' + m0(x.o90) + '</b></td><td class="n"><b>' + m0(x.o60) + '</b></td><td class="n"><b>' + m0(x.o30) + '</b></td><td class="n">' + m0(x.cash) + '</td><td class="n">' + m0(x.cash60) + '</td><td class="n">' + m0(x.setoff) + '</td><td class="n">' + x.new_cust + '</td><td class="n">' + x.cleared + '</td><td class="n">' + m0(x.credits) + '</td></tr>').join('')
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
    const fn = {dash: () => op ? opDash(op, true) : allDash(true), cust: custPage, inv: invPage, cred: credPage, coll: collPage, sett: settPage, prog: progPage, week: weekPage, old: oldPage}[tab] || custPage;
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
  // ---------- Customers with no Main reason (v6.3) ----------
  let NR_ALL = false;
  function noReasonCard(codes) {
    const a = custRows().filter(r => codes.includes(r.operation) && isActive(r)), z = a.filter(r => !r.reason);
    const S2 = (l, f) => l.reduce((s, r) => s + f(r), 0), b120 = r => n(D(r).b120), o90 = r => n(D(r).o90);
    const list = z.slice().sort((x, y) => b120(y) - b120(x) || o90(y) - o90(x) || o60(y) - o60(x) || o30(y) - o30(x)), max = NR_ALL ? list.length : 100;
    const byOp = codes.map(c => { const all = a.filter(r => r.operation === c), q = z.filter(r => r.operation === c); return {c, n: q.length, all: all.length, b120: S2(q, b120), o90: S2(q, o90), o60: S2(q, o60), o30: S2(q, o30), off: (targetOf(c) || {}).officer || ''}; }).filter(x => x.all).sort((x, y) => y.o60 - x.o60 || y.o30 - x.o30);
    const tot = k => byOp.reduce((s, x) => s + x[k], 0);
    return '<div class="card" style="margin-top:10px"><div class="row2" style="justify-content:space-between;align-items:center"><h3>Customers with no Main reason (' + z.length + ' of ' + a.length + ' · Over 60 Rs ' + m0(S2(z, o60)) + ' · Over 30 Rs ' + m0(S2(z, o30)) + ')</h3>'
      + '<button class="btn noprint" data-osact="nrlist">Open in the Customers list</button></div>'
      + '<div class="hint">These customers are in the Over 30 list but nobody has written why they have not paid. Officers write the Main reason, explanation, next action and promise in IMS. Oldest money first.</div>'
      + (codes.length > 1 ? '<div class="wrap" style="margin-top:6px"><table style="min-width:900px"><thead><tr><th>Operation</th><th>Officer</th><th class="n">No reason</th><th class="n">In list</th><th class="n">% with no reason</th><th class="n">Over 120</th><th class="n">Over 90</th><th class="n">Over 60</th><th class="n">Over 30</th></tr></thead><tbody>'
        + byOp.map(x => '<tr class="row" data-osop="' + x.c + '"><td>' + esc(x.c + ' - ' + opName(x.c)) + '</td><td>' + esc(x.off) + '</td><td class="n"><b>' + x.n + '</b></td><td class="n">' + x.all + '</td><td class="n">' + (x.n / x.all >= 0.5 ? '<span class="bad">' + pc(x.n / x.all) + '</span>' : pc(x.n / x.all)) + '</td><td class="n">' + m0(x.b120) + '</td><td class="n">' + m0(x.o90) + '</td><td class="n">' + m0(x.o60) + '</td><td class="n">' + m0(x.o30) + '</td></tr>').join('')
        + '</tbody><tfoot><tr class="tot"><td colspan="2"><b>Total</b></td><td class="n"><b>' + tot('n') + '</b></td><td class="n">' + tot('all') + '</td><td class="n">' + pc(tot('all') ? tot('n') / tot('all') : null) + '</td><td class="n">' + m0(tot('b120')) + '</td><td class="n">' + m0(tot('o90')) + '</td><td class="n">' + m0(tot('o60')) + '</td><td class="n">' + m0(tot('o30')) + '</td></tr></tfoot></table></div>' : '')
      + '<div class="wrap" style="margin-top:8px"><table style="min-width:1150px"><thead><tr><th class="n">#</th>' + (codes.length > 1 ? '<th>Op</th><th>Officer</th>' : '') + '<th>No</th><th>Customer</th><th>Sales rep</th><th class="n">Days</th><th class="n">Over 120</th><th class="n">Over 90</th><th class="n">Over 60</th><th class="n">Over 30</th><th class="n">Paid (cash)</th><th>In list since</th><th>Last update</th><th></th></tr></thead><tbody>'
      + (list.length ? list.slice(0, max).map((r, i) => '<tr class="row' + ageCls(r) + '" data-open="' + r.id + '"><td class="n">' + (i + 1) + '</td>' + (codes.length > 1 ? '<td>' + esc(r.operation) + '</td><td>' + esc((targetOf(r.operation) || {}).officer || '') + '</td>' : '') + '<td class="rno">' + esc(r.rec_code || '') + '</td><td><b>' + esc(r.outlet) + '</b></td><td>' + esc(r.owner_name) + '</td><td class="n">' + (r.aging_days == null ? '' : r.aging_days) + '</td><td class="n">' + m0(b120(r)) + '</td><td class="n">' + m0(o90(r)) + '</td><td class="n"><b>' + m0(o60(r)) + '</b></td><td class="n">' + m0(o30(r)) + '</td><td class="n">' + (n(D(r).cash) ? m0(D(r).cash) : '') + '</td><td>' + esc(dmy(D(r).new_on || '')) + '</td><td>' + (r.fu_updated_at ? esc(dmy(r.fu_updated_at.slice(0, 10))) : '<span class="hint">never</span>') + '</td><td><button class="btn q" data-quick="' + r.id + '" title="Write the reason">&#9998;</button></td></tr>').join('') : '<tr><td colspan="15" class="hint">Every customer has a Main reason.</td></tr>')
      + '</tbody></table></div>'
      + (list.length > 100 ? '<div class="row2 noprint" style="margin-top:6px"><button class="btn" data-osact="nrall">' + (NR_ALL ? 'Show the first 100 only' : 'Show all ' + list.length) + '</button></div>' : '') + '</div>';
  }

  // ---------- Operation dashboard (books: Dashboard sheet of each operation's book) ----------
  function opDash(c, inFollowUp) {
    const a = custRows().filter(r => r.operation === c && isActive(r)), z60 = a.filter(r => o60(r) >= 1), S2 = (l, f) => l.reduce((s, r) => s + f(r), 0);
    const days = S.days.filter(x => x.operation === c).sort((x, y) => x.as_at.localeCompare(y.as_at)), L = days[days.length - 1], P = days[days.length - 2], F = days[0];
    const t0 = today(), mon = (() => { const d = new Date((L ? L.as_at : t0) + 'T00:00:00'), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymdL(d); })();
    const cashWk = days.filter(x => x.as_at >= mon).reduce((s, x) => s + n(x.cash), 0), ret = a.filter(r => n(D(r).ret) > 0.005), p7 = a.filter(r => r.promised_date && r.promised_date >= t0 && r.promised_date <= addD(t0, 6));
    const wk = curWeek(), cred = S2(a, r => n(D(r).cred));
    const tl1 = tile('r', m0(S2(a, r => n(D(r).b120))), 'Over 120') + tile('r', m0(S2(a, r => n(D(r).o90))), 'Over 90') + tile('a', m0(S2(a, o60)), 'Over 60') + tile('', m0(S2(a, o30)), 'Over 30')
      + tile('', a.length, 'Customers in the list') + tile('g', m0(L ? n(L.cash) : 0), 'Cash since the last update');
    const tl2 = tile('g', m0(cashWk), 'Cash this week (from ' + dmy(mon).slice(0, 5) + ')') + tile('', pc(a.length ? a.filter(r => r.reason).length / a.length : 1), 'Customers with a remark')
      + tile('r', a.filter(promiseMissed).length, 'Promises missed') + tile('', p7.length + ' · ' + m0(S2(p7, r => n(r.promised_amount))), 'Promises due in 7 days')
      + tile('r', ret.length + ' · ' + m0(S2(ret, r => n(D(r).ret))), 'Returned cheques') + tile('a', m0(cred), 'Credits to set off');
    // ageing: first update vs last update vs today
    const AG = [['Over 120', 'b120'], ['91-120', 'b91'], ['61-90', 'b61'], ['31-60', 'b31'], ['Over 90', 'o90'], ['Over 60', 'o60'], ['Over 30', 'o30'], ['Customers', 'customers']];
    const dv = (x, y) => { if (x == null || y == null) return ''; const d = n(x) - n(y); return '<span style="color:var(--' + (d > 0.5 ? 'danger' : d < -0.5 ? 'ok' : 'muted') + ')">' + (d > 0 ? '+' : '') + (Math.abs(d) < 1000 && d % 1 === 0 ? d : m0(d)) + '</span>'; };
    const fmt = (k, v) => v == null ? '' : k === 'customers' ? n(v) : m0(v);
    const ageT = !L ? '<div class="hint">No C40 update yet.</div>' : '<table><thead><tr><th>Age</th><th class="n">First update<br>' + dmy(F.as_at) + '</th><th class="n">Last update<br>' + (P ? dmy(P.as_at) : '-') + '</th><th class="n">Today<br>' + dmy(L.as_at) + '</th><th class="n">Change vs last</th><th class="n">Change vs first</th></tr></thead><tbody>'
      + AG.map(g => '<tr' + (g[1] === 'o30' ? ' class="tot"' : '') + '><td>' + g[0] + '</td><td class="n">' + fmt(g[1], F[g[1]]) + '</td><td class="n">' + (P ? fmt(g[1], P[g[1]]) : '') + '</td><td class="n"><b>' + fmt(g[1], L[g[1]]) + '</b></td><td class="n">' + (P ? dv(L[g[1]], P[g[1]]) : '') + '</td><td class="n">' + dv(L[g[1]], F[g[1]]) + '</td></tr>').join('') + '</tbody></table>';
    // by main reason, by sales rep
    const grp = (keyF) => { const m = {}; a.forEach(r => { const k = keyF(r); const t = m[k] = m[k] || {k, n: 0, o120: 0, o60: 0, o30: 0, nr: 0}; t.n++; t.o120 += n(D(r).b120); t.o60 += o60(r); t.o30 += o30(r); if (!r.reason) t.nr++; }); return Object.values(m).sort((x, y) => y.o60 - x.o60 || y.o30 - x.o30); };
    const byR = grp(r => r.reason || '(no reason yet)'), byRep = grp(r => r.owner_name || '(no rep)');
    const gT = (lst, h, nr) => '<table><thead><tr><th>' + h + '</th><th class="n">Customers</th><th class="n">Over 120</th><th class="n">Over 60</th><th class="n">Over 30</th>' + (nr ? '<th class="n">No remark</th>' : '') + '</tr></thead><tbody>'
      + lst.map(x => '<tr><td>' + esc(x.k) + '</td><td class="n">' + x.n + '</td><td class="n">' + m0(x.o120) + '</td><td class="n">' + m0(x.o60) + '</td><td class="n">' + m0(x.o30) + '</td>' + (nr ? '<td class="n">' + (x.nr || '') + '</td>' : '') + '</tr>').join('') + '</tbody></table>';
    const top = z60.slice().sort((x, y) => o60(y) - o60(x)).slice(0, 15);
    const topT = '<div class="wrap"><table style="min-width:1000px"><thead><tr><th class="n">#</th><th>Customer</th><th>Sales rep</th><th class="n">Days</th><th class="n">Over 120</th><th class="n">Over 90</th><th class="n">Over 60</th><th class="n">Over 30</th><th>Main reason</th><th>Next action</th><th>Promise</th><th>Last update</th></tr></thead><tbody>'
      + top.map((r, i) => '<tr class="row' + ageCls(r) + '" data-open="' + r.id + '"><td class="n">' + (i + 1) + '</td><td><b>' + esc(r.outlet) + '</b></td><td>' + esc(r.owner_name) + '</td><td class="n">' + (r.aging_days == null ? '' : r.aging_days) + '</td><td class="n">' + m0(D(r).b120) + '</td><td class="n">' + m0(D(r).o90) + '</td><td class="n"><b>' + m0(o60(r)) + '</b></td><td class="n">' + m0(o30(r)) + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.next_step) + '</td><td>' + (r.promised_date ? esc(dmy(r.promised_date)) + (r.promised_amount != null ? ' · ' + m0(r.promised_amount) : '') : '') + '</td><td>' + (r.fu_updated_at ? esc(dmy(r.fu_updated_at.slice(0, 10))) : '<span class="hint">never</span>') + '</td></tr>').join('') + '</tbody></table></div>';
    const off = (targetOf(c) || {}).officer;
    $('page').innerHTML = head('Outstanding · Operation dashboard') + (inFollowUp ? chips() : '')
      + '<div class="hint" style="margin-bottom:6px">' + esc(c + ' - ' + opName(c)) + (off ? ' · Officer: <b>' + esc(off) + '</b>' : '') + ' · ages from the invoice date · cash = what cleared invoices between two C40 exports</div>'
      + '<div class="grid">' + tl1 + '</div><div class="grid" style="margin-top:8px">' + tl2 + '</div>'
      + (wk ? '<div class="card" style="margin-top:10px"><h3>This week (' + esc(wk) + ') · A / B / C</h3>' + weekTable([c], wk) + '</div>' : '')
      + '<div class="grid2" style="margin-top:10px"><div class="card"><h3>Ageing · first update, last update, today</h3>' + ageT + '</div><div class="card"><h3>Trend</h3>' + trend(days) + '</div></div>'
      + '<div class="grid2" style="margin-top:10px"><div class="card"><h3>Customers by main reason</h3>' + gT(byR, 'Main reason', false) + '</div><div class="card"><h3>By sales rep</h3>' + gT(byRep, 'Sales rep', true) + '</div></div>'
      + noReasonCard([c])
      + '<div class="card" style="margin-top:10px"><h3>Top 15 customers by Over 60</h3>' + topT + '</div>'
      + '<div class="card" style="margin-top:10px"><h3>Action list</h3>' + actTable(actionList([c]), 40) + '</div>';
  }
  // ---------- Compare & decide (v6.5): pick operations + period, this vs previous, signals, decisions ----------
  const DEC = {sel: [], per: 'week', a: '', b: '', met: 'o60', lmet: 'o60'};
  const mondayOf = s => { const d = new Date(s + 'T00:00:00'), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymdL(d); };
  const monthOf = s => s.slice(0, 8) + '01';
  const MON = s => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', {month: 'short', year: 'numeric'});
  function snapAt(codes, date) {   // stock figures at a date: each operation's latest update on or before the date
    const t = {customers: 0, b31: 0, b61: 0, b91: 0, b120: 0, o30: 0, o60: 0, o90: 0, soon60: 0, credits: 0, n: 0, miss: []};
    if (!date) return null;
    codes.forEach(c => { const x = S.days.filter(y => y.operation === c && y.as_at <= date).reduce((m, y) => !m || y.as_at > m.as_at ? y : m, null);
      if (!x) { t.miss.push(c); return; } t.n++; ['customers', 'b31', 'b61', 'b91', 'b120', 'o30', 'o60', 'o90', 'soon60', 'credits'].forEach(k => t[k] += n(x[k])); });
    return t.n ? t : null;
  }
  function flowIn(codes, from, to) {   // what happened between two dates (both included): cash, cash on Over 60, set off, new, cleared
    const t = {cash: 0, cash60: 0, setoff: 0, new_cust: 0, cleared: 0, days: new Set()};
    S.days.filter(x => codes.includes(x.operation) && x.as_at >= from && x.as_at <= to).forEach(x => { ['cash', 'cash60', 'setoff', 'new_cust', 'cleared'].forEach(k => t[k] += n(x[k])); t.days.add(x.as_at); });
    t.nd = t.days.size; return t;
  }
  function periods() {
    const ds = [...new Set(S.days.map(x => x.as_at))].sort(), B = ds[ds.length - 1];
    if (!B) return null;
    let A = null, cur = [B, B], prev = [null, null], lab = ['', ''];
    if (DEC.per === 'day') { A = ds[ds.length - 2] || null; cur = [B, B]; prev = [A, A]; lab = ['Previous update' + (A ? ' ' + dmy(A) : ''), 'Last update ' + dmy(B)]; }
    else if (DEC.per === 'week') { const w = mondayOf(B), pw = addD(w, -7); A = ds.filter(d => d < w).pop() || null; cur = [w, B]; prev = [pw, addD(w, -1)]; lab = ['Last week (' + dmy(pw).slice(0, 5) + '-' + dmy(addD(w, -1)).slice(0, 5) + ')', 'This week (' + dmy(w).slice(0, 5) + '-' + dmy(B).slice(0, 5) + ')']; }
    else if (DEC.per === 'month') { const m = monthOf(B), pm = monthOf(addD(m, -1)); A = ds.filter(d => d < m).pop() || null; cur = [m, B]; prev = [pm, addD(m, -1)]; lab = ['Last month (' + MON(pm) + ')', 'This month (' + MON(m) + ', to ' + dmy(B).slice(0, 5) + ')']; }
    else if (DEC.per === 'start') { A = ds[0] === B ? null : ds[0]; cur = [ds[0], B]; prev = [null, null]; lab = ['First update' + (A ? ' ' + dmy(A) : ''), 'Last update ' + dmy(B)]; }
    else { const a = ds.includes(DEC.a) ? DEC.a : (ds[ds.length - 2] || ds[0]), b = ds.includes(DEC.b) ? DEC.b : B; A = a < b ? a : null; cur = [addD(a, 1), b]; prev = [null, null]; lab = ['Date A ' + dmy(a), 'Date B ' + dmy(b)]; return {ds, A, B: b, cur, prev, lab}; }
    return {ds, A, B, cur, prev, lab};
  }
  function decDash(allCodes) {
    const codes = DEC.sel.filter(c => allCodes.includes(c)).length ? DEC.sel.filter(c => allCodes.includes(c)) : allCodes, all = codes.length === allCodes.length;
    const P = periods();
    const opChip = (c, lab, on) => '<button data-osdsel="' + c + '" class="' + (on ? 'on' : '') + '">' + esc(lab) + '</button>';
    const PER = [['day', 'Today vs previous update'], ['week', 'This week vs last week'], ['month', 'This month vs last month'], ['start', 'Since the first update'], ['custom', 'Pick two dates']];
    const METS = [['o30', 'Over 30'], ['o60', 'Over 60'], ['o90', 'Over 90'], ['b120', 'Over 120']];
    let h = '<div class="xcard"><div class="xlab" style="margin-bottom:8px">1 · Operations</div><div class="chips" style="flex-wrap:wrap">' + opChip('all', 'All operations', all) + allCodes.map(c => opChip(c, c + ' - ' + opName(c), !all && codes.includes(c))).join('') + '</div>'
      + '<div class="xlab" style="margin:12px 0 8px">2 · Period</div><div class="seg" style="flex-wrap:wrap">' + PER.map(p => '<button data-osdper="' + p[0] + '"' + (DEC.per === p[0] ? ' class="on"' : '') + '>' + p[1] + '</button>').join('') + '</div>'
      + (DEC.per === 'custom' && P ? '<div class="row2" style="gap:8px;margin-top:8px">Date A <select data-osdc="a">' + P.ds.map(d => '<option value="' + d + '"' + (d === (P.A || '') ? ' selected' : '') + '>' + dmy(d) + '</option>').join('') + '</select> Date B <select data-osdc="b">' + P.ds.map(d => '<option value="' + d + '"' + (d === P.B ? ' selected' : '') + '>' + dmy(d) + '</option>').join('') + '</select></div>' : '')
      + '<div class="hint" style="margin-top:8px">Showing <b>' + (all ? 'all ' + codes.length + ' operations' : esc(codes.join(', '))) + '</b>. Balances = position at the last C40 update of each period; cash = everything collected inside the period.</div></div>';
    if (!P) return h + '<div class="xcard" style="margin-top:12px">No C40 update yet.</div>';
    const now = snapAt(codes, P.B), was = P.A ? snapAt(codes, P.A) : null, fNow = flowIn(codes, P.cur[0], P.cur[1]), fWas = P.prev[0] ? flowIn(codes, P.prev[0], P.prev[1]) : null;
    const first = P.ds[0];
    const noBase = !was ? '<div class="card" style="margin-top:12px;border-left:4px solid var(--accent)"><b>No figures for "' + esc(P.lab[0]) + '" yet.</b> IMS has C40 updates from ' + dmy(first) + ' only (' + P.ds.length + ' update' + (P.ds.length > 1 ? 's' : '') + '), so this comparison fills in by itself as the daily updates build up' + (DEC.per === 'week' ? ' (first full week-to-week view on Mon ' + dmy(addD(mondayOf(first), 7)) + ')' : DEC.per === 'month' ? ' (first month-to-month view from 01-' + addD(monthOf(first), 32).slice(5, 7) + '-' + addD(monthOf(first), 32).slice(0, 4) + ')' : '') + '. The "This" column below already shows today\'s position.</div>' : '';
    const pct = (x, y) => y ? (x - y) / Math.abs(y) : null;
    const cell = (cur, prv, lowGood, money) => { if (prv == null) return '<td class="n hint">-</td><td class="n hint">-</td><td></td>'; const d = cur - prv, p = pct(cur, prv), good = Math.abs(d) < 0.5 ? null : (lowGood ? d < 0 : d > 0);
      return '<td class="n">' + (money === false ? (d > 0 ? '+' : '') + d : (d > 0 ? '+' : d < 0 ? '-' : '') + m0(Math.abs(d))) + '</td><td class="n">' + (p == null ? '' : (p > 0 ? '+' : '') + (p * 100).toFixed(1) + '%') + '</td><td>' + (good == null ? '<span class="chip nt">same</span>' : good ? '<span class="chip dn">better</span>' : '<span class="chip up">worse</span>') + '</td>'; };
    const R = [['Over 120', now.b120, was && was.b120, true], ['Over 90', now.o90, was && was.o90, true], ['Over 60', now.o60, was && was.o60, true], ['Over 30', now.o30, was && was.o30, true], ['Customers over 30', now.customers, was && was.customers, true, false],
      ['Moves to 61+ within 7 days', now.soon60, was && was.soon60, true], ['Cash collected in the period', fNow.cash, fWas && fWas.nd ? fWas.cash : null, false], ['Cash on Over 60 in the period', fNow.cash60, fWas && fWas.nd ? fWas.cash60 : null, false], ['Set off by Accounts (not cash)', fNow.setoff, fWas && fWas.nd ? fWas.setoff : null, false], ['Customers cleared', fNow.cleared, fWas && fWas.nd ? fWas.cleared : null, false, false], ['New customers in the list', fNow.new_cust, fWas && fWas.nd ? fWas.new_cust : null, true, false]];
    // 3 · comparison as cards + line chart (v6.6: charts instead of tables)
    const card = r => { const has = r[2] != null, d = has ? r[1] - r[2] : 0, good = !has || Math.abs(d) < 0.5 ? null : (r[3] ? d < 0 : d > 0), cnt = r[4] === false;
      return '<div class="xcard kpi"><div class="xlab">' + r[0] + '</div><div class="v">' + (cnt ? r[1] : m0(r[1])) + '</div>'
        + (has ? '<span class="chip ' + (good == null ? 'nt' : good ? 'dn' : 'up') + '">' + (Math.abs(d) < 0.5 ? 'same' : (d > 0 ? '▲ ' : '▼ ') + (cnt ? Math.abs(d) : m0(Math.abs(d))) + (r[2] ? ' · ' + (d > 0 ? '+' : '') + (d / Math.abs(r[2]) * 100).toFixed(1) + '%' : '')) + '</span><div class="hint" style="margin-top:4px">' + esc(P.lab[0]) + ': ' + (cnt ? r[2] : m0(r[2])) + '</div>' : '<span class="chip nt">' + esc(P.lab[0]) + ': no data</span>') + '</div>'; };
    const LMET = [['o30', 'Over 30'], ['o60', 'Over 60'], ['o90', 'Over 90'], ['b120', 'Over 120'], ['cash', 'Cash per update']];
    const lm = LMET.find(x => x[0] === DEC.lmet) || LMET[1];
    const PAL = ['#4f46e5', '#ef4444', '#16a34a', '#f59e0b', '#0ea5e9', '#a855f7', '#ec4899', '#14b8a6'];
    const from = P.prev[0] || P.A || P.ds[0], dts = P.ds.filter(d => d >= from && d <= P.B);
    const series = (!all && codes.length <= 8 ? codes.map((c, i) => ({lab: c, col: PAL[i % 8], c: [c]})) : [{lab: all ? 'All operations' : codes.length + ' operations', col: PAL[0], c: codes}])
      .map(s => ({lab: s.lab, col: s.col, pts: dts.map(d => { if (lm[0] === 'cash') return {d, v: S.days.filter(x => s.c.includes(x.operation) && x.as_at === d).reduce((t, x) => t + n(x.cash), 0)}; const z = snapAt(s.c, d); return {d, v: z ? z[lm[0]] : 0}; })}));
    const lineSvg = (() => { const W = 760, H = 250, Pl = 58, Pr = 14, Pt = 14, Pb = 34; if (!dts.length) return '<div class="hint">No updates in this period.</div>';
      const mxv = Math.max(1, ...series.flatMap(s => s.pts.map(p => p.v))), X = i => dts.length === 1 ? (Pl + W - Pr) / 2 : Pl + (W - Pl - Pr) * i / (dts.length - 1), Y = v => Pt + (H - Pt - Pb) * (1 - v / mxv);
      const ci = dts.findIndex(d => d >= P.cur[0]), sh = ci > 0 ? '<rect x="' + ((X(ci - 1) + X(ci)) / 2).toFixed(1) + '" y="' + Pt + '" width="' + (W - Pr - (X(ci - 1) + X(ci)) / 2).toFixed(1) + '" height="' + (H - Pt - Pb) + '" fill="var(--primary)" opacity=".06"/><text x="' + (W - Pr - 4) + '" y="' + (Pt + 12) + '" text-anchor="end" font-size="10.5" fill="var(--muted)">' + esc(P.lab[1].split(' (')[0]) + '</text>' : '';
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%">' + sh + [0, .5, 1].map(f => '<line x1="' + Pl + '" x2="' + (W - Pr) + '" y1="' + Y(mxv * f) + '" y2="' + Y(mxv * f) + '" stroke="var(--line)" stroke-dasharray="3 4"/><text x="' + (Pl - 6) + '" y="' + (Y(mxv * f) + 4) + '" text-anchor="end" font-size="10.5" fill="var(--muted)">' + (mxv * f / 1e6).toFixed(mxv < 2e7 ? 1 : 0) + ' Mn</text>').join('')
        + series.map(s => (s.pts.length > 1 ? '<polyline fill="none" stroke="' + s.col + '" stroke-width="2.5" stroke-linejoin="round" points="' + s.pts.map((p, i) => X(i).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ') + '"/>' : '') + s.pts.map((p, i) => '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="3.5" fill="' + s.col + '"><title>' + esc(s.lab) + ' ' + dmy(p.d) + ': Rs ' + m0(p.v) + '</title></circle>').join('')).join('')
        + dts.map((d, i) => i % Math.ceil(dts.length / 9) ? '' : '<text x="' + X(i).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10.5" fill="var(--muted)">' + dmy(d).slice(0, 5) + '</text>').join('') + '</svg>'
        + '<div class="leg">' + series.map(s => '<span><i class="dot" style="background:' + s.col + '"></i>' + esc(s.lab) + ' <b>' + m0(s.pts[s.pts.length - 1].v) + '</b></span>').join('') + '</div>'
        + (dts.length < 2 ? '<div class="hint" style="margin-top:6px">Only one C40 update in this period, so the line starts from one point; it grows with each daily update.</div>' : ''); })();
    h += noBase + '<div class="kpis" style="margin-top:12px">' + R.slice(0, 8).map(card).join('') + '</div>'
      + '<div class="xgrid"><div class="xcard"><div class="row2" style="justify-content:space-between;align-items:center;margin-bottom:6px"><div class="xlab">3 · Trend · ' + esc(lm[1]) + ' · ' + esc(P.lab[0]) + ' → ' + esc(P.lab[1]) + '</div><div class="seg">' + LMET.map(m => '<button data-osdlm="' + m[0] + '"' + (lm[0] === m[0] ? ' class="on"' : '') + '>' + m[1] + '</button>').join('') + '</div></div>' + lineSvg + '</div>';
    // per operation comparison + signals
    const per = codes.map(c => { const s1 = snapAt([c], P.B), s0 = P.A ? snapAt([c], P.A) : null, f1 = flowIn([c], P.cur[0], P.cur[1]), f0 = P.prev[0] ? flowIn([c], P.prev[0], P.prev[1]) : null, z = custRows().filter(r => r.operation === c && isActive(r) && o60(r) >= 1);
      return {c, s1, s0, f1, f0, nr: z.length ? z.filter(r => !r.reason).length / z.length : 0, nrN: z.filter(r => !r.reason).length, z: z.length, off: (targetOf(c) || {}).officer || ''}; }).filter(x => x.s1);
    const sig = [];
    per.forEach(x => { const d120 = x.s0 ? x.s1.b120 - x.s0.b120 : null, d60 = x.s0 ? x.s1.o60 - x.s0.o60 : null, cashDrop = x.f0 && x.f0.nd && x.f0.cash > 0 ? x.f1.cash / x.f0.cash : null;
      if (d120 != null && d120 > Math.max(100000, 0.05 * x.s0.b120)) sig.push({p: 1, c: x.c, t: 'Over 120 grew by Rs ' + m0(d120), d: 'Escalate the largest Over 120 customers to the Operation Head; letter of demand list for 120+ with no promise.', who: 'Operation Head / Director', score: d120});
      if (d60 != null && d60 > Math.max(100000, 0.05 * x.s0.o60) && (cashDrop == null || cashDrop < 1)) sig.push({p: 1, c: x.c, t: 'Over 60 grew by Rs ' + m0(d60) + (cashDrop != null ? ' while cash fell to ' + pc(cashDrop) + ' of the previous period' : ''), d: 'Daily call list for Over 60 with the officer; stop supply for 60+ customers with no promise.', who: 'Director (stop supply), Officer', score: d60});
      if (cashDrop != null && cashDrop < 0.7) sig.push({p: 2, c: x.c, t: 'Cash this period is ' + pc(cashDrop) + ' of the previous period', d: 'Check route / collection plan with the officer; confirm promises due this week.', who: 'Operation Head', score: (x.f0.cash - x.f1.cash)});
      if (x.z >= 5 && x.nr >= 0.5) sig.push({p: 2, c: x.c, t: pc(x.nr) + ' of Over 60 customers have no reason (' + x.nrN + ')', d: 'Officer writes a reason, next action and promise for each Over 60 customer within 2 days.', who: 'Officer (' + (x.off || 'not set') + ')', score: x.s1.o60 * x.nr});
      if (x.s1.o60 > 0 && x.s1.soon60 > 0.15 * x.s1.o60) sig.push({p: 3, c: x.c, t: 'Rs ' + m0(x.s1.soon60) + ' turns Over 60 within 7 days', d: 'Collect these invoices this week before they move to 61+ (B target).', who: 'Officer / Sales rep', score: x.s1.soon60 * 0.5});
      if (d60 != null && x.s0.o60 > 0 && d60 < -0.05 * x.s0.o60) sig.push({p: 4, c: x.c, t: 'Improving: Over 60 down Rs ' + m0(-d60) + ' (' + pc(-d60 / x.s0.o60) + ')', d: 'Keep the plan; recognise the officer.', who: '', score: -d60}); });
    sig.sort((a, b) => a.p - b.p || b.score - a.score);
    const PC = {1: ['r', 'Act now'], 2: ['w', 'This week'], 3: ['b', 'Watch'], 4: ['g', 'Good']};
    h += '<div class="xcard"><div class="row2" style="justify-content:space-between"><div class="xlab">4 · Decisions to take</div><span class="hint">rules on the figures, worst first</span></div>'
      + (sig.length ? sig.slice(0, 8).map(s => '<div class="need" data-osop="' + s.c + '" style="align-items:flex-start"><div><div class="t"><span class="tag t-' + PC[s.p][0] + '">' + PC[s.p][1] + '</span> <span style="font-weight:700">' + esc(s.c) + '</span> · ' + esc(s.t) + '</div><div class="s" style="margin-top:4px">' + esc(s.d) + (s.who ? ' <span style="font-weight:600;color:inherit">Decides:</span> ' + esc(s.who) : '') + '</div></div></div>').join('') + (sig.length > 8 ? '<div class="hint" style="margin-top:6px">' + (sig.length - 8) + ' more: see the Details tab.</div>' : '')
        : '<div class="hint" style="margin-top:8px">' + (was ? 'No warning signals for this selection.' : 'Signals that compare two periods start when the previous period has an update; the no-reason and turning-61+ checks already work.') + '</div>')
      + '</div></div>';
    // 5 · pie charts (v6.6)
    const donut = (title, parts, center, sub) => { const tot = parts.reduce((s, p) => s + p.v, 0), R0 = 62, C = 2 * Math.PI * R0; let acc = 0;
      const arcs = tot > 0 ? parts.filter(p => p.v > 0).map(p => { const len = C * p.v / tot, a = '<circle cx="80" cy="80" r="' + R0 + '" fill="none" stroke="' + p.col + '" stroke-width="24" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-acc).toFixed(2) + '" transform="rotate(-90 80 80)"><title>' + esc(p.lab) + ': ' + (p.cnt ? p.v : 'Rs ' + m0(p.v)) + ' (' + pc(p.v / tot) + ')</title></circle>'; acc += len; return a; }).join('') : '<circle cx="80" cy="80" r="' + R0 + '" fill="none" stroke="var(--line)" stroke-width="24"/>';
      return '<div class="xcard"><div class="xlab" style="margin-bottom:8px">' + title + '</div><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><svg width="160" height="160" viewBox="0 0 160 160">' + arcs + '<text x="80" y="78" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">' + center + '</text><text x="80" y="96" text-anchor="middle" font-size="10.5" fill="var(--muted)">' + sub + '</text></svg>'
        + '<div style="flex:1;min-width:150px">' + parts.map(p => '<div class="row2" style="justify-content:space-between;gap:8px;font-size:12.5px;padding:3px 0;border-bottom:1px solid var(--line)"><span><i class="dot" style="background:' + p.col + '"></i>' + esc(p.lab) + '</span><span><b>' + (p.cnt ? p.v : m0(p.v)) + '</b> <span class="hint">' + (tot ? pc(p.v / tot) : '') + '</span></span></div>').join('') + '</div></div></div>'; };
    const ageParts = s => [{lab: '31-60', v: s.b31, col: '#93c5fd'}, {lab: '61-90', v: s.b61, col: '#fbbf24'}, {lab: '91-120', v: s.b91, col: '#fb923c'}, {lab: 'Over 120', v: s.b120, col: '#ef4444'}];
    const pm = DEC.met, pmL = (METS.find(m => m[0] === pm) || METS[1])[1], shareRows = per.map(x => ({lab: x.c, v: x.s1[pm]})).sort((a, b) => b.v - a.v), top = shareRows.slice(0, 7), rest = shareRows.slice(7).reduce((s, x) => s + x.v, 0);
    const share = top.map((x, i) => ({lab: x.lab, v: x.v, col: PAL[i % 8]})).concat(rest > 0 ? [{lab: 'Others (' + (shareRows.length - 7) + ')', v: rest, col: '#94a3b8'}] : []);
    const z60 = custRows().filter(r => codes.includes(r.operation) && isActive(r) && o60(r) >= 1);
    const rs = [{lab: 'Reason, updated in 7 days', v: z60.filter(r => r.reason && fresh(r)).length, col: '#16a34a', cnt: 1}, {lab: 'Reason, older than 7 days', v: z60.filter(r => r.reason && !fresh(r)).length, col: '#f59e0b', cnt: 1}, {lab: 'No reason', v: z60.filter(r => !r.reason).length, col: '#ef4444', cnt: 1}];
    const cashP = [{lab: 'Cash on Over 60', v: fNow.cash60, col: '#16a34a'}, {lab: 'Cash on 31-60 / current', v: Math.max(0, fNow.cash - fNow.cash60), col: '#86efac'}, {lab: 'Set off by Accounts', v: fNow.setoff, col: '#94a3b8'}];
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px;margin-top:12px">'
      + donut('5 · Age mix · ' + esc(P.lab[1]), ageParts(now), (now.o30 / 1e6).toFixed(1) + ' Mn', 'Over 30')
      + (was ? donut('Age mix · ' + esc(P.lab[0]), ageParts(was), (was.o30 / 1e6).toFixed(1) + ' Mn', 'Over 30') : '')
      + '<div style="display:contents">' + donut(esc(pmL) + ' by operation <span class="seg" style="margin-left:6px;vertical-align:middle">' + METS.map(m => '<button data-osdmet="' + m[0] + '"' + (pm === m[0] ? ' class="on"' : '') + ' style="padding:3px 8px;font-size:11px">' + m[1].replace('Over ', '') + '</button>').join('') + '</span>', share, (share.reduce((s, p) => s + p.v, 0) / 1e6).toFixed(1) + ' Mn', esc(pmL)) + '</div>'
      + donut('Over 60 customers · follow-up status', rs, String(z60.length), 'customers')
      + donut('Money in · ' + esc(P.lab[1]), cashP, (fNow.cash / 1e6).toFixed(2) + ' Mn', 'cash') + '</div>';
    return h;
  }

  // ---------- All operations dashboard (v6.4): Overview / Details / Trend ----------
  let DT = 'ov';
  const OSX_CSS = '.osx{--r:18px}.osx .xhead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin:2px 0 14px}'
    + '.osx .xcrumb{font:600 10.5px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.osx h2{margin:4px 0 2px;font-size:26px;letter-spacing:-.01em}'
    + '.osx .seg{display:inline-flex;background:var(--line);border-radius:12px;padding:3px;gap:2px}.osx .seg button{border:0;background:transparent;padding:7px 16px;border-radius:9px;font-size:13px;color:var(--muted);cursor:pointer}.osx .seg button.on{background:var(--surface);color:inherit;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.12)}'
    + '.osx .xcard{background:var(--surface);border-radius:var(--r);box-shadow:0 1px 2px rgba(16,24,40,.05),0 8px 24px rgba(16,24,40,.06);padding:16px 18px;min-width:0}'
    + '.osx .xlab{font:600 10.5px/1.3 ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}'
    + '.osx .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:12px}.osx .kpi .v{font-size:26px;font-weight:650;letter-spacing:-.02em;margin:6px 0 4px;font-variant-numeric:tabular-nums}.osx .kpi.xhero .v{font-size:34px}'
    + '.osx .chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:600}.osx .up{background:rgba(220,38,38,.12);color:var(--danger)}.osx .dn{background:rgba(22,163,74,.14);color:var(--ok)}.osx .nt{background:var(--line);color:var(--muted)}'
    + '.osx .kpi .bar{height:5px;border-radius:3px;background:var(--line);margin-top:8px;overflow:hidden}.osx .kpi .bar i{display:block;height:100%;border-radius:3px}'
    + '.osx .xgrid{display:grid;grid-template-columns:minmax(0,2.3fr) minmax(260px,1fr);gap:12px}@media(max-width:1100px){.osx .xgrid{grid-template-columns:minmax(0,1fr)}}'
    + '.osx table.xt{width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums}.osx table.xt th{background:transparent;color:var(--muted);font:600 10.5px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:1}'
    + '.osx table.xt td{padding:9px 10px;border-bottom:1px solid var(--line);white-space:nowrap}.osx table.xt tr.row:hover td{background:var(--primary-soft);cursor:pointer}.osx table.xt td.n,.osx table.xt th.n{text-align:right}.osx table.xt tr.xtot td{font-weight:700;border-top:2px solid var(--line);border-bottom:0}'
    + '.osx .heat{border-radius:6px}.osx .mix{display:flex;height:10px;border-radius:5px;overflow:hidden;min-width:120px;background:var(--line)}.osx .mix i{display:block;height:100%}'
    + '.osx .need{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;border:1px solid var(--line);margin-top:8px;cursor:pointer}.osx .need:hover{border-color:var(--primary)}.osx .need b{font-size:20px;font-variant-numeric:tabular-nums}.osx .need .t{font-size:13px}.osx .need .s{font-size:11.5px;color:var(--muted)}'
    + '.osx .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}.osx .leg{font-size:11.5px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap}'
    + '.osx .sm{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}.osx .sm .xcard{padding:12px 14px}';
  const AGE = [['b31', '31-60', '#93c5fd'], ['b61', '61-90', '#fbbf24'], ['b91', '91-120', '#fb923c'], ['b121', '121-240', '#ef4444'], ['b241', 'Over 240', '#7f1d1d']];
  async function ageByOp(codes) {   // invoice lines of the latest C40 export -> per operation 31-60 / 61-90 / 91-120 / 121-240 / Over 240
    const a = asAt(); const k = a + '|' + codes.join(',');
    if (S.age && S.age.k === k) return S.age.m;
    const m = {}; codes.forEach(c => m[c] = {b31: 0, b61: 0, b91: 0, b121: 0, b241: 0, ok: false});
    try {
      const L = await fetchAll('/rest/v1/os_lines?select=operation,days,amount&kind=eq.inv&as_at=eq.' + a + '&days=gt.30&amount=gt.0&order=id');
      (L || []).forEach(x => { const t = m[x.operation]; if (!t) return; const d = n(x.days), v = n(x.amount); t.ok = true; t[d > 240 ? 'b241' : d > 120 ? 'b121' : d > 90 ? 'b91' : d > 60 ? 'b61' : 'b31'] += v; });
    } catch (e) {}
    S.age = {k, m}; return m;
  }
  function chg(cur, prev, money) { if (prev == null) return '<span class="chip nt">new</span>'; const d = n(cur) - n(prev); if (Math.abs(d) < 0.5) return '<span class="chip nt">no change</span>'; return '<span class="chip ' + (d > 0 ? 'up' : 'dn') + '">' + (d > 0 ? '▲ ' : '▼ ') + (money === false ? Math.abs(d) : m0(Math.abs(d))) + '</span>'; }
  async function allDash(inFollowUp) {
    if (!document.getElementById('osxCss')) { const st = document.createElement('style'); st.id = 'osxCss'; st.textContent = OSX_CSS; document.head.appendChild(st); }
    const codes = myOps().map(o => o.code), act = custRows().filter(r => codes.includes(r.operation) && isActive(r)), S2 = (l, f) => l.reduce((s, r) => s + f(r), 0);
    const a = asAt(), tr = sumDays(codes), L = tr[tr.length - 1], P = tr[tr.length - 2];
    const ag = await ageByOp(codes);
    const rowsO = codes.map(c => { const z = act.filter(r => r.operation === c), g = ag[c], ld = S.days.filter(x => x.operation === c).sort((x, y) => x.as_at.localeCompare(y.as_at)), l1 = ld[ld.length - 1], l0 = ld[ld.length - 2];
      const o30v = S2(z, o30), o60v = S2(z, o60), o90v = S2(z, r => n(D(r).o90)), o120v = S2(z, r => n(D(r).b120));
      return {c, off: (targetOf(c) || {}).officer || '', n: z.length, o30: o30v, o60: o60v, o90: o90v, o120: o120v, o240: g && g.ok ? g.b241 : null, g, prev60: l0 ? n(l0.o60) : null, nr: z.filter(r => o60(r) >= 1 && !r.reason).length, pm: z.filter(promiseMissed).length, stale: l1 && l1.as_at !== a}; })
      .filter(x => x.n).sort((x, y) => y.o60 - x.o60);
    const T = k => rowsO.reduce((s, x) => s + n(x[k]), 0), tot30 = T('o30'), t240 = rowsO.every(x => x.o240 != null) ? T('o240') : null;
    const kpi = (lab, v, prev, pct, col, hero) => '<div class="xcard kpi' + (hero ? ' xhero' : '') + '"><div class="xlab">' + lab + '</div><div class="v">' + (v == null ? '-' : m0(v)) + '</div>' + (prev === undefined ? '<span class="chip nt">vs last update n/a</span>' : chg(v, prev)) + (pct != null ? ' <span class="hint">' + pc(pct) + ' of Over 30</span>' : '') + '<div class="bar"><i style="width:' + Math.min(100, Math.round((pct == null ? 1 : pct) * 100)) + '%;background:' + col + '"></i></div></div>';
    const segs = [['ov', 'Overview'], ['dec', 'Compare & decide'], ['det', 'Details'], ['tr', 'Trend']];
    let h = '<div class="osx">' + (inFollowUp ? chips() : '')
      + '<div class="xhead"><div><div class="xcrumb">Outstanding / All operations</div><h2>Outstanding overview</h2><div class="hint">' + codes.length + ' operations · C40 as at <b>' + dmy(a) + '</b>' + (L && P ? ' · compared with ' + dmy(P.as_at) : '') + ' · ages from the invoice date</div></div>'
      + '<div class="row2 noprint" style="gap:8px;align-items:center">' + (isBoard() && window.osDecisionView ? '<button class="btn" data-osact="decision">Decision view</button>' : '') + '<div class="seg">' + segs.map(s => '<button data-osdt="' + s[0] + '"' + (DT === s[0] ? ' class="on"' : '') + '>' + s[1] + '</button>').join('') + '</div></div></div>';
    const stale = rowsO.filter(x => x.stale); if (stale.length) h += '<div class="card err" style="margin-bottom:10px">Not updated with the latest C40 export: ' + stale.map(x => esc(x.c)).join(', ') + '</div>';
    if (DT === 'ov') {
      h += '<div class="kpis">' + kpi('Over 30 total', tot30, P ? n(P.o30) : null, null, 'var(--primary)', true) + kpi('Over 60', T('o60'), P ? n(P.o60) : null, tot30 ? T('o60') / tot30 : 0, '#fbbf24') + kpi('Over 90', T('o90'), P ? n(P.o90) : null, tot30 ? T('o90') / tot30 : 0, '#fb923c')
        + kpi('Over 120', T('o120'), P ? n(P.b120) : null, tot30 ? T('o120') / tot30 : 0, '#ef4444') + kpi('Over 240', t240, undefined, tot30 && t240 != null ? t240 / tot30 : 0, '#7f1d1d')
        + '<div class="xcard kpi"><div class="xlab">Customers · cash</div><div class="v">' + act.length + '</div>' + (L && P ? chg(L.customers, P.customers, false) : '') + '<div class="hint" style="margin-top:6px">Cash at the last update <b style="color:var(--ok)">Rs ' + m0(L ? L.cash : 0) + '</b></div></div></div>';
      const mx = Math.max(1, ...rowsO.map(x => x.o60 / Math.max(1, x.o30)));
      const heat = (v, base) => { const p = base > 0 ? v / base : 0; return 'background:rgba(239,68,68,' + (0.04 + p * 0.32).toFixed(3) + ')'; };
      h += '<div class="xgrid"><div class="xcard"><div class="row2" style="justify-content:space-between;align-items:center;margin-bottom:6px"><div><div class="xlab">Ageing by operation</div><div class="hint">Over 30 / 60 / 90 / 120 / 240 days · click an operation for its own dashboard</div></div><div class="leg">' + AGE.map(x => '<span><i class="dot" style="background:' + x[2] + '"></i>' + x[1] + '</span>').join('') + '</div></div>'
        + '<div class="wrap" style="box-shadow:none;max-height:none"><table class="xt" style="min-width:880px"><thead><tr><th>Operation</th><th class="n">Cust.</th><th class="n">Over 30</th><th class="n">Over 60</th><th class="n">Over 90</th><th class="n">Over 120</th><th class="n">Over 240</th><th>Age mix</th><th class="n">60+ %</th><th class="n">Over 60 vs last</th></tr></thead><tbody>'
        + rowsO.map(x => { const g = x.g || {}, tt = AGE.reduce((s, k) => s + n(g[k[0]]), 0) || 1; return '<tr class="row" data-osop="' + x.c + '"><td><b>' + esc(x.c) + '</b> <span class="hint">' + esc(opName(x.c)) + '</span><br><span class="hint">' + esc(x.off) + '</span></td><td class="n">' + x.n + '</td><td class="n"><b>' + m0(x.o30) + '</b></td>'
          + '<td class="n heat" style="' + heat(x.o60, x.o30) + '">' + m0(x.o60) + '</td><td class="n heat" style="' + heat(x.o90, x.o30) + '">' + m0(x.o90) + '</td><td class="n heat" style="' + heat(x.o120, x.o30) + '">' + m0(x.o120) + '</td><td class="n heat" style="' + (x.o240 == null ? '' : heat(x.o240, x.o30)) + '">' + (x.o240 == null ? '-' : m0(x.o240)) + '</td>'
          + '<td><div class="mix" title="' + AGE.map(k => k[1] + ' ' + m0(g[k[0]])).join(' · ') + '">' + (x.g && x.g.ok ? AGE.map(k => '<i style="width:' + (n(g[k[0]]) / tt * 100).toFixed(1) + '%;background:' + k[2] + '"></i>').join('') : '') + '</div></td>'
          + '<td class="n">' + pc(x.o30 ? x.o60 / x.o30 : 0) + '</td><td class="n">' + chg(x.o60, x.prev60) + '</td></tr>'; }).join('')
        + '</tbody><tfoot><tr class="xtot"><td>Total · ' + rowsO.length + ' operations</td><td class="n">' + T('n') + '</td><td class="n">' + m0(tot30) + '</td><td class="n">' + m0(T('o60')) + '</td><td class="n">' + m0(T('o90')) + '</td><td class="n">' + m0(T('o120')) + '</td><td class="n">' + (t240 == null ? '-' : m0(t240)) + '</td><td></td><td class="n">' + pc(tot30 ? T('o60') / tot30 : 0) + '</td><td class="n">' + (P ? chg(T('o60'), n(P.o60)) : '') + '</td></tr></tfoot></table></div></div>';
      const c60 = act.filter(r => o60(r) >= 1), ret = act.filter(r => n(D(r).ret) > 0.005), soon = act.filter(r => n(D(r).soon60) > 0.5), cr = act.filter(r => n(D(r).cred) <= -1), p7 = act.filter(r => r.promised_date && r.promised_date >= today() && r.promised_date <= addD(today(), 6));
      const need = (flag, num, t, s, col) => '<div class="need" data-osneed="' + flag + '"><div><div class="t">' + t + '</div><div class="s">' + s + '</div></div><b style="color:' + col + '">' + num + '</b></div>';
      h += '<div class="xcard"><div class="row2" style="justify-content:space-between"><div class="xlab">Needs you</div><span class="hint">click to open the list</span></div>'
        + need('pm', act.filter(promiseMissed).length, 'Promises missed', 'promise date passed, no cash', 'var(--danger)')
        + need('ret', ret.length, 'Returned cheques', 'Rs ' + m0(S2(ret, r => n(D(r).ret))), 'var(--danger)')
        + need('nr60', c60.filter(r => !r.reason).length, 'Over 60 with no reason', 'Rs ' + m0(S2(c60.filter(r => !r.reason), o60)) + ' Over 60', 'var(--accent)')
        + need('stale', c60.filter(r => r.reason && !fresh(r)).length, 'Over 60, no update 7+ days', 'reason written but old', 'var(--accent)')
        + need('soon', soon.length, 'Moves to 61+ in 7 days', 'Rs ' + m0(S2(soon, r => n(D(r).soon60))) + ' will turn Over 60', '#fb923c')
        + need('p7', p7.length, 'Promises due in 7 days', 'Rs ' + m0(S2(p7, r => n(r.promised_amount))) + ' promised', 'var(--ok)')
        + need('cred', cr.length, 'Credits to set off', 'Rs ' + m0(-S2(cr, r => n(D(r).cred))) + ' not allocated', 'var(--primary)')
        + '</div></div>';
      const wk = curWeek();
      if (wk) { const ws = S.weeks.filter(w => w.week === wk && codes.includes(w.operation)), sm = k => ws.reduce((s, w) => s + n(w[k]), 0), cN = codes.reduce((s, c) => s + cLive(c).n, 0), cOk = codes.reduce((s, c) => s + cLive(c).ok, 0);
        const ring = (lab, p, sub) => { const v = p == null ? 0 : Math.min(1, p), C = 2 * Math.PI * 30; return '<div style="display:flex;align-items:center;gap:12px"><svg width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r="30" fill="none" stroke="var(--line)" stroke-width="8"/><circle cx="38" cy="38" r="30" fill="none" stroke="' + (v >= 0.999 ? 'var(--ok)' : v >= 0.8 ? '#fbbf24' : 'var(--danger)') + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (C * v).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 38 38)"/><text x="38" y="43" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">' + pc(p) + '</text></svg><div><div class="xlab">' + lab + '</div><div class="hint">' + sub + '</div></div></div>'; };
        h += '<div class="xcard" style="margin-top:12px"><div class="row2" style="justify-content:space-between"><div><div class="xlab">This week · ' + esc(wk) + '</div><div class="hint">A = Over 60 cash · B = 70% of invoices turning 61+ · C = Over 60 customers with a fresh reason</div></div><button class="btn" data-osdt="det">Weekly table by operation</button></div>'
          + '<div style="display:flex;gap:28px;flex-wrap:wrap;margin-top:10px">' + ring('A · Over 60 cash', sm('a_target') ? sm('a_coll') / sm('a_target') : null, 'Rs ' + m0(sm('a_coll')) + ' of ' + m0(sm('a_target'))) + ring('B · turning 61+', sm('b_target') ? sm('b_coll') / sm('b_target') : null, 'Rs ' + m0(sm('b_coll')) + ' of ' + m0(sm('b_target'))) + ring('C · fresh reason', cN ? cOk / cN : null, cOk + ' of ' + cN + ' customers') + '</div></div>'; }
    } else if (DT === 'dec') {
      h += decDash(codes);
    } else if (DT === 'det') {
      const wk = curWeek(), acts = actionList(codes);
      const offs = {}; rowsO.forEach(x => { const o = x.off || '(no officer)'; const t = offs[o] = offs[o] || {o, ops: [], n: 0, o30: 0, o60: 0, o120: 0, nr: 0, pm: 0}; t.ops.push(x.c); ['n', 'o30', 'o60', 'o120', 'nr', 'pm'].forEach(k => t[k] += n(x[k])); });
      h += (wk ? '<div class="xcard"><div class="xlab" style="margin-bottom:6px">This week (' + esc(wk) + ') · targets by operation</div>' + weekTable(codes, wk) + '</div>' : '')
        + '<div class="xcard" style="margin-top:12px"><div class="xlab" style="margin-bottom:6px">Age bands by operation (amounts in each band)</div><div class="wrap" style="box-shadow:none"><table class="xt" style="min-width:900px"><thead><tr><th>Operation</th>' + AGE.map(k => '<th class="n">' + k[1] + '</th>').join('') + '<th class="n">Over 30</th></tr></thead><tbody>'
        + rowsO.map(x => '<tr class="row" data-osop="' + x.c + '"><td><b>' + esc(x.c) + '</b> <span class="hint">' + esc(opName(x.c)) + '</span></td>' + AGE.map(k => '<td class="n">' + (x.g && x.g.ok ? m0(x.g[k[0]]) : '-') + '</td>').join('') + '<td class="n"><b>' + m0(x.o30) + '</b></td></tr>').join('')
        + '</tbody><tfoot><tr class="xtot"><td>Total</td>' + AGE.map(k => '<td class="n">' + m0(rowsO.reduce((s, x) => s + n(x.g && x.g[k[0]]), 0)) + '</td>').join('') + '<td class="n">' + m0(tot30) + '</td></tr></tfoot></table></div></div>'
        + '<div class="xcard" style="margin-top:12px"><div class="xlab" style="margin-bottom:6px">By officer</div><div class="wrap" style="box-shadow:none"><table class="xt" style="min-width:800px"><thead><tr><th>Officer</th><th>Operations</th><th class="n">Customers</th><th class="n">Over 30</th><th class="n">Over 60</th><th class="n">Over 120</th><th class="n">Over 60, no reason</th><th class="n">Promise missed</th></tr></thead><tbody>'
        + Object.values(offs).sort((x, y) => y.o60 - x.o60).map(x => '<tr><td><b>' + esc(x.o) + '</b></td><td>' + esc(x.ops.join(', ')) + '</td><td class="n">' + x.n + '</td><td class="n">' + m0(x.o30) + '</td><td class="n">' + m0(x.o60) + '</td><td class="n">' + m0(x.o120) + '</td><td class="n">' + x.nr + '</td><td class="n">' + x.pm + '</td></tr>').join('') + '</tbody></table></div></div>'
        + noReasonCard(codes)
        + '<div class="card" style="margin-top:10px"><h3>Action list (' + acts.length + ')</h3><div class="hint">P1 = promise missed / returned cheque · P2 = Over 60 with no reason (top 15 per operation) · P3 = no update 7+ days and invoices turning 61+ in 7 days</div>' + actTable(acts, 60) + '</div>';
    } else {
      const W = 900, H = 260, Pd = 56;
      const big = t => { if (t.length < 2) return '<div class="hint">The trend shows after two C40 updates.</div>'; const mxv = Math.max(...t.map(x => x.o30)) || 1, X = i => Pd + (W - Pd - 14) * i / (t.length - 1), Y = v => 14 + (H - 46) * (1 - v / mxv);
        const ln = (k, c, w) => '<polyline fill="none" stroke="' + c + '" stroke-width="' + (w || 2.5) + '" stroke-linejoin="round" points="' + t.map((x, i) => X(i).toFixed(1) + ',' + Y(x[k]).toFixed(1)).join(' ') + '"/>';
        const area = '<polygon fill="var(--primary)" opacity=".08" points="' + Pd + ',' + Y(0) + ' ' + t.map((x, i) => X(i).toFixed(1) + ',' + Y(x.o30).toFixed(1)).join(' ') + ' ' + X(t.length - 1) + ',' + Y(0) + '"/>';
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%">' + [0, .25, .5, .75, 1].map(f => '<line x1="' + Pd + '" x2="' + (W - 14) + '" y1="' + Y(mxv * f) + '" y2="' + Y(mxv * f) + '" stroke="var(--line)" stroke-dasharray="3 4"/><text x="' + (Pd - 6) + '" y="' + (Y(mxv * f) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + (mxv * f / 1e6).toFixed(mxv < 2e7 ? 1 : 0) + ' Mn</text>').join('')
          + area + ln('o30', 'var(--primary)', 3) + ln('o60', '#fbbf24') + ln('o90', '#fb923c') + ln('b120', '#ef4444')
          + t.map((x, i) => i % Math.ceil(t.length / 10) ? '' : '<text x="' + X(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + dmy(x.as_at).slice(0, 5) + '</text>').join('') + '</svg>'
          + '<div class="leg"><span><i class="dot" style="background:var(--primary)"></i>Over 30</span><span><i class="dot" style="background:#fbbf24"></i>Over 60</span><span><i class="dot" style="background:#fb923c"></i>Over 90</span><span><i class="dot" style="background:#ef4444"></i>Over 120</span></div>'; };
      const bars = t => { const z = t.slice(-24); if (!z.length) return ''; const mxv = Math.max(...z.map(x => x.cash)) || 1, bw = (W - Pd - 14) / z.length;
        return '<svg viewBox="0 0 ' + W + ' 200" style="width:100%">' + z.map((x, i) => { const hh = 150 * x.cash / mxv, h6 = 150 * x.cash60 / mxv; return '<rect x="' + (Pd + i * bw + 3).toFixed(1) + '" y="' + (165 - hh).toFixed(1) + '" width="' + (bw - 6).toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="4" fill="var(--primary)" opacity=".35"><title>' + dmy(x.as_at) + ' cash Rs ' + m0(x.cash) + '</title></rect><rect x="' + (Pd + i * bw + 3).toFixed(1) + '" y="' + (165 - h6).toFixed(1) + '" width="' + (bw - 6).toFixed(1) + '" height="' + h6.toFixed(1) + '" rx="4" fill="var(--ok)"><title>' + dmy(x.as_at) + ' cash on Over 60 Rs ' + m0(x.cash60) + '</title></rect>' + (i % Math.ceil(z.length / 10) ? '' : '<text x="' + (Pd + i * bw + bw / 2).toFixed(1) + '" y="186" text-anchor="middle" font-size="11" fill="var(--muted)">' + dmy(x.as_at).slice(0, 5) + '</text>'); }).join('')
          + '<text x="' + (Pd - 6) + '" y="20" text-anchor="end" font-size="11" fill="var(--muted)">' + (mxv / 1e6).toFixed(1) + ' Mn</text></svg><div class="leg"><span><i class="dot" style="background:var(--primary);opacity:.4"></i>Cash collected</span><span><i class="dot" style="background:var(--ok)"></i>of which on Over 60</span></div>'; };
      const spark = c => { const t = S.days.filter(x => x.operation === c).sort((x, y) => x.as_at.localeCompare(y.as_at)); if (t.length < 2) return '<div class="hint">one update only</div>'; const mxv = Math.max(...t.map(x => n(x.o60))) || 1, mnv = Math.min(...t.map(x => n(x.o60))), X = i => 4 + 212 * i / (t.length - 1), Y = v => 6 + 40 * (1 - (v - mnv) / Math.max(1, mxv - mnv)); const d = n(t[t.length - 1].o60) - n(t[0].o60);
        return '<svg viewBox="0 0 220 52" style="width:100%;height:52px"><polyline fill="none" stroke="' + (d > 0 ? 'var(--danger)' : 'var(--ok)') + '" stroke-width="2" points="' + t.map((x, i) => X(i).toFixed(1) + ',' + Y(n(x.o60)).toFixed(1)).join(' ') + '"/></svg><div class="hint">' + dmy(t[0].as_at).slice(0, 5) + ' Rs ' + m0(t[0].o60) + ' → ' + m0(t[t.length - 1].o60) + ' ' + chg(t[t.length - 1].o60, t[0].o60) + '</div>'; };
      h += '<div class="xcard"><div class="xlab" style="margin-bottom:6px">Outstanding by age · every C40 update</div>' + big(tr) + '</div>'
        + '<div class="xcard" style="margin-top:12px"><div class="xlab" style="margin-bottom:6px">Cash collected per update (all operations)</div>' + bars(tr) + '</div>'
        + '<div class="xcard" style="margin-top:12px"><div class="xlab" style="margin-bottom:8px">Over 60 trend by operation</div><div class="sm">' + rowsO.map(x => '<div class="xcard row" data-osop="' + x.c + '" style="box-shadow:none;border:1px solid var(--line);cursor:pointer"><div><b>' + esc(x.c) + '</b> <span class="hint">' + esc(opName(x.c)) + '</span></div>' + spark(x.c) + '</div>').join('') + '</div></div>'
        + '<div class="card" style="margin-top:12px"><h3>Progress by update (all operations)</h3><div class="wrap"><table style="min-width:1000px"><thead><tr><th>Date</th><th class="n">Customers</th><th class="n">Over 120</th><th class="n">Over 90</th><th class="n">Over 60</th><th class="n">Over 30</th><th class="n">Cash</th><th class="n">Cash on Over 60</th><th class="n">Set off</th><th class="n">New</th><th class="n">Cleared</th></tr></thead><tbody>'
        + tr.slice().reverse().map(x => '<tr><td>' + dmy(x.as_at) + (x.ops < codes.length ? ' <span class="hint">(' + x.ops + ' ops)</span>' : '') + '</td><td class="n">' + x.customers + '</td><td class="n">' + m0(x.b120) + '</td><td class="n">' + m0(x.o90) + '</td><td class="n">' + m0(x.o60) + '</td><td class="n"><b>' + m0(x.o30) + '</b></td><td class="n">' + m0(x.cash) + '</td><td class="n">' + m0(x.cash60) + '</td><td class="n">' + m0(x.setoff) + '</td><td class="n">' + x.new_cust + '</td><td class="n">' + x.cleared + '</td></tr>').join('') + '</tbody></table></div></div>';
    }
    $('page').innerHTML = h + '</div>';
  }

  function master() {
    if (op) return opDash(op, false);
    return allDash(false);
  }
  function masterOld() {
    const codes = op ? [op] : myOps().map(o => o.code), act = custRows().filter(r => codes.includes(r.operation) && isActive(r)), c60 = act.filter(r => o60(r) >= 1);
    const S2 = (a, f) => a.reduce((s, r) => s + f(r), 0), wk = curWeek(), acts = actionList(codes);
    const byOp = codes.map(c => { const a = act.filter(r => r.operation === c), z = a.filter(r => o60(r) >= 1), ld = lastDay(c); return {c, n: a.length, o30: S2(a, o30), o60: S2(a, o60), o90: S2(a, r => n(D(r).o90)), cash: ld && ld.as_at === asAt() ? n(ld.cash) : 0, setoff: ld && ld.as_at === asAt() ? n(ld.setoff) : 0, nr: z.filter(r => !r.reason).length, pm: a.filter(promiseMissed).length, cov: z.length ? z.filter(r => r.reason && fresh(r)).length / z.length : 1, as: ld && ld.as_at}; });
    const offs = {}; byOp.forEach(x => { const o = ((targetOf(x.c) || {}).officer) || '(no officer)'; const t = offs[o] = offs[o] || {o, ops: [], n: 0, o30: 0, o60: 0, nr: 0, pm: 0}; t.ops.push(x.c); t.n += x.n; t.o30 += x.o30; t.o60 += x.o60; t.nr += x.nr; t.pm += x.pm; });
    const stale = byOp.filter(x => x.as && x.as !== asAt());
    $('page').innerHTML = head('Outstanding · Master dashboard') + (isBoard() && window.osDecisionView ? '<div class="row2 noprint" style="margin-bottom:6px"><button class="btn" data-osact="decision">Decision view (trend, coming risk)</button></div>' : '')
      + (stale.length ? '<div class="card err">Not updated with the latest C40 export: ' + stale.map(x => esc(x.c) + ' (' + dmy(x.as) + ')').join(', ') + '</div>' : '')
      + '<div class="grid">' + tile('r', m0(S2(act, r => n(D(r).b120))), 'Over 120') + tile('r', m0(S2(act, r => n(D(r).o90))), 'Over 90') + tile('a', m0(S2(act, o60)), 'Over 60') + tile('', m0(S2(act, o30)), 'Over 30') + tile('', act.length, 'Customers over 30')
      + tile('g', m0(byOp.reduce((s, x) => s + x.cash, 0)), 'Cash at the last update') + tile('', m0(byOp.reduce((s, x) => s + x.setoff, 0)), 'Set off at the last update')
      + tile('r', act.filter(promiseMissed).length, 'Promise missed') + tile('a', c60.filter(r => !r.reason).length, 'Over 60, no remark') + tile('a', c60.filter(r => r.reason && !fresh(r)).length, 'No update 7+ days') + tile('r', act.filter(r => n(D(r).ret) > 0.005).length, 'Returned cheques') + '</div>'
      + (wk ? '<div class="card" style="margin-top:10px"><h3>This week (' + esc(wk) + ') · targets by operation</h3>' + weekTable(codes, wk) + '</div>' : '')
      + '<div class="grid2" style="margin-top:10px"><div class="card"><h3>By operation</h3><table><thead><tr><th>Operation</th><th class="n">Customers</th><th class="n">Over 30</th><th class="n">Over 60</th><th class="n">No remark (60+)</th><th class="n">Promise missed</th><th class="n">C</th></tr></thead><tbody>'
      + byOp.map(x => '<tr class="row" data-osop="' + x.c + '"><td>' + esc(x.c + ' - ' + opName(x.c)) + '</td><td class="n">' + x.n + '</td><td class="n">' + m0(x.o30) + '</td><td class="n">' + m0(x.o60) + '</td><td class="n">' + x.nr + '</td><td class="n">' + x.pm + '</td><td class="n">' + pc(x.cov) + '</td></tr>').join('') + '</tbody></table></div>'
      + '<div class="card"><h3>By officer</h3><table><thead><tr><th>Officer</th><th>Operations</th><th class="n">Customers</th><th class="n">Over 60</th><th class="n">No remark</th><th class="n">Promise missed</th></tr></thead><tbody>'
      + Object.values(offs).sort((a, b) => b.o60 - a.o60).map(x => '<tr><td>' + esc(x.o) + '</td><td>' + esc(x.ops.join(', ')) + '</td><td class="n">' + x.n + '</td><td class="n">' + m0(x.o60) + '</td><td class="n">' + x.nr + '</td><td class="n">' + x.pm + '</td></tr>').join('') + '</tbody></table></div></div>'
      + noReasonCard(codes)
      + '<div class="card" style="margin-top:10px"><h3>Trend</h3>' + trend(sumDays(codes)) + '</div>'
      + '<div class="card" style="margin-top:10px"><h3>Action list (' + acts.length + ')</h3><div class="hint">P1 = promise missed / returned cheque (all) · P2 = Over 60 with no remark (top 15 per operation) · P3 = no update 7+ days and invoices turning 61+ in 7 days (top 10 each per operation)</div>' + actTable(acts, 60) + '</div>';
  }

  // ---------- Report (printable) + CSV ----------
  function report() {
    const codes = op ? [op] : myOps().map(o => o.code), act = custRows().filter(r => codes.includes(r.operation) && isActive(r)), wk = curWeek(), acts = actionList(codes);
    const S2 = (a, f) => a.reduce((s, r) => s + f(r), 0), top = act.slice().sort((a, b) => o60(b) - o60(a)).slice(0, 40);
    $('page').innerHTML = '<div class="noprint row2"><button class="btn p" data-osact="print">Print / Save as PDF</button><button class="btn" data-osact="csv">Download Excel (CSV)</button></div>'
      + '<h2 class="pt">Outstanding daily report</h2><div class="hint">' + (op ? esc(op + ' - ' + opName(op)) : 'All my operations') + ' · C40 as at ' + dmy(asAt(op)) + ' · source C40 B2001 + B2011 · Iceman IMS</div>'
      + '<table style="margin:8px 0"><tbody>' + [['Over 120 total', m2(S2(act, r => n(D(r).b120)))], ['Over 90 total', m2(S2(act, r => n(D(r).o90)))], ['Over 60 total', m2(S2(act, o60))], ['Over 30 total', m2(S2(act, o30))], ['Customers over 30', act.length], ['Cash at the last update', m2(S2(act, r => n(D(r).cash)))], ['Set off at the last update', m2(S2(act, r => n(D(r).setoff)))], ['Promise missed', act.filter(promiseMissed).length], ['Over 60 with no remark', act.filter(r => o60(r) >= 1 && !r.reason).length]].map(x => '<tr><td>' + x[0] + '</td><td class="n"><b>' + x[1] + '</b></td></tr>').join('') + '</tbody></table>'
      + (wk ? '<h3>Weekly targets (' + esc(wk) + ')</h3>' + weekTable(codes, wk) : '')
      + '<h3 style="margin-top:12px">Action list</h3>' + actTable(acts)
      + '<h3 style="margin-top:12px">Largest Over 60 customers (40)</h3><div class="wrap"><table><thead><tr><th>Op</th><th>Customer</th><th>Rep</th><th class="n">Days</th><th class="n">Over 60</th><th class="n">Over 30</th><th>Main reason</th><th>Next action</th><th>Promise</th></tr></thead><tbody>'
      + top.map(r => '<tr class="' + ageCls(r).trim() + '"><td>' + esc(r.operation) + '</td><td>' + esc(r.outlet) + '</td><td>' + esc(r.owner_name) + '</td><td class="n">' + (r.aging_days == null ? '' : r.aging_days) + '</td><td class="n">' + m0(o60(r)) + '</td><td class="n">' + m0(o30(r)) + '</td><td>' + esc(r.reason) + '</td><td>' + esc(r.next_step) + '</td><td>' + (r.promised_date ? esc(dmy(r.promised_date)) : '') + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function csv() {
    const codes = op ? [op] : myOps().map(o => o.code), list = custRows().filter(r => codes.includes(r.operation) && isActive(r)), q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const cols = [['Record no', r => r.rec_code], ['Operation', r => r.operation], ['Customer', r => r.outlet], ['Company', r => D(r).co], ['Class', r => r.party], ['Sales rep', r => r.owner_name], ['Oldest Over 30 invoice', r => r.base_date], ['Days (oldest)', r => r.aging_days], ['Days past due', r => D(r).pastdue],
      ['Over 120', r => D(r).b120], ['91-120', r => D(r).b91], ['61-90', r => D(r).b61], ['31-60', r => D(r).b31], ['Over 90 total', r => D(r).o90], ['Over 60 total', r => D(r).o60], ['Over 30 total', r => r.amount], ['1-30 and current', r => D(r).cur], ['Credits not allocated', r => D(r).cred], ['Net balance', r => D(r).net],
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
      + '<div class="card" style="margin-top:8px"><table><thead><tr><th class="n">Over 120</th><th class="n">91-120</th><th class="n">61-90</th><th class="n">31-60</th><th class="n">Over 90</th><th class="n">Over 60</th><th class="n">Over 30</th><th class="n">Days past due</th><th>Flags</th></tr></thead><tbody><tr><td class="n">' + m2(d.b120) + '</td><td class="n">' + m2(d.b91) + '</td><td class="n">' + m2(d.b61) + '</td><td class="n">' + m2(d.b31) + '</td><td class="n">' + m2(d.o90) + '</td><td class="n">' + m2(d.o60) + '</td><td class="n"><b>' + m2(r.amount) + '</b></td><td class="n">' + (d.pastdue == null ? '' : d.pastdue) + '</td><td>' + flagHtml(r) + '</td></tr></tbody></table></div>'
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
    const t = e.target.closest && e.target.closest('[data-ostab],[data-osact],[data-oscp],[data-oswk],[data-osnote],[data-osop],[data-osold],[data-osdt],[data-osneed],[data-osdsel],[data-osdper],[data-osdmet],[data-osdlm],#osNoteSave');
    if (!t) return;
    if (t.dataset.osdt) { DT = t.dataset.osdt; go(); window.scrollTo(0, 0); return; }
    if (t.dataset.osdsel) { const c = t.dataset.osdsel; if (c === 'all') DEC.sel = []; else { const s = new Set(DEC.sel); s.has(c) ? s.delete(c) : s.add(c); DEC.sel = [...s]; } go(); return; }
    if (t.dataset.osdper) { DEC.per = t.dataset.osdper; go(); return; }
    if (t.dataset.osdmet) { DEC.met = t.dataset.osdmet; go(); return; }
    if (t.dataset.osdlm) { DEC.lmet = t.dataset.osdlm; go(); return; }
    if (t.dataset.osneed) { Object.assign(OF, {band: '', rep: '', flag: t.dataset.osneed, reason: '', text: '', status: 'active'}); op = ''; tab = 'cust'; go('items', 'receivable'); return; }
    if (t.dataset.ostab) { tab = t.dataset.ostab; go('items', 'receivable'); }
    else if (t.dataset.oscp) { CP = t.dataset.oscp; go(); }
    else if (t.dataset.oswk) { WK = t.dataset.oswk; go(); }
    else if (t.dataset.osop) { op = t.dataset.osop; tab = 'dash'; go('items', 'receivable'); }
    else if (t.dataset.osold) { e.stopPropagation(); const o = (S.old || []).find(x => x.id === t.dataset.osold); if (o && !rows.some(x => x.id === o.id)) rows.push(o); openRecord(t.dataset.osold); }
    else if (t.dataset.osnote) { e.stopPropagation(); noteDrawer(t); }
    else if (t.id === 'osNoteSave') guard(() => noteSave(t));
    else if (t.dataset.osact === 'clear') { Object.assign(OF, {band: '', rep: '', flag: '', reason: '', text: '', status: 'active'}); go(); }
    else if (t.dataset.osact === 'print') window.print();
    else if (t.dataset.osact === 'csv') csv();
    else if (t.dataset.osact === 'decision') window.osDecisionView();
    else if (t.dataset.osact === 'nrall') { NR_ALL = !NR_ALL; go(); }
    else if (t.dataset.osact === 'nrlist') { Object.assign(OF, {band: '', rep: '', flag: 'nr', reason: '', text: '', status: 'active'}); tab = 'cust'; go('items', 'receivable'); }
  }, true);
  document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.osdc) { DEC[t.dataset.osdc] = t.value; go(); return; } if (t.dataset && t.dataset.osf && t.tagName === 'SELECT') { OF[t.dataset.osf] = t.value; go(); } else if (t.dataset && t.dataset.oif && t.tagName === 'SELECT') { IF[t.dataset.oif] = t.value; go(); } });
  let tmr = null;
  document.addEventListener('input', e => { const t = e.target; if (t.dataset && (t.dataset.osf === 'text' || t.dataset.oif === 'text')) { clearTimeout(tmr); tmr = setTimeout(() => { if (t.dataset.osf) OF.text = t.value; else IF.text = t.value; const pos = t.selectionStart; go(); const n2 = document.querySelector('[data-' + (t.dataset.osf ? 'osf' : 'oif') + '="text"]'); if (n2) { n2.focus(); try { n2.setSelectionRange(pos, pos); } catch (x) {} } }, 350); } });

  // ---------- register: Follow-up / Dashboard / Report of Outstanding ----------
  const prevDash = (window.MODULE_PAGES && MODULE_PAGES.receivable && MODULE_PAGES.receivable.dash) || null;
  if (prevDash) window.osDecisionView = prevDash;
  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {receivable: {items: () => run(items), dash: () => run(async () => master()), report: () => run(async () => report())}});
  window.osWarm = warm;
})();