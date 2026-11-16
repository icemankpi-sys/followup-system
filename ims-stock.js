// Iceman IMS - Stocks > Daily ICE Stock (v5.8, 2026-11-16)
// Each stock point (one per operation, person in charge can change) enters the day's stock:
// Main Stores (Impulse, Bulk) and Outside (Impulse, Bulk). Access: module 'stock' per operation
// (View = see, Edit = enter, Full = also manage the points and persons). Needs Supabase/42 daily ice stock.sql.
// Uses the main script's globals at run time only (api, fetchAll, $, esc, op, lvl, rank, opsFor, ops, me, go).
(function () {
  const css = document.createElement('style');
  css.textContent = `
.st-in{width:92px;text-align:right;padding:4px 6px}.st-in.ok{border-color:var(--ok);background:var(--ok-soft)}.st-in.bad{border-color:var(--danger);background:var(--danger-soft)}
.st-note{width:150px;padding:4px 6px}
table.st th.grpH{text-align:center;border-bottom:1px solid rgba(255,255,255,.35)}
table.st td.sep,table.st th.sep{border-left:2px solid var(--line2)}
.st-miss{background:var(--danger-soft);color:var(--danger);font-weight:700;text-align:center}
/* v5.8.1 report document (Daily report / Week report): plain values, borders, signature block; black and white on paper */
table.st-doc{width:100%;border-collapse:collapse;font-size:12.5px}
table.st-doc th,table.st-doc td{border:1px solid var(--line2);padding:5px 6px}
table.st-doc td.ne{color:var(--danger);font-style:italic}
.st-sum{display:flex;flex-wrap:wrap;gap:6px 22px;font-size:13px;margin:6px 0 10px}.st-sum b{font-size:14px}
.st-sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:34px;font-size:12.5px}
.st-sign div{border-top:1px dotted #555;padding-top:4px}.st-sign small{display:block;color:var(--muted);margin-top:10px}
@media print{
  table.st-doc{font-size:10.5px}
  table.st-doc th,table.st-doc td{border:1px solid #000!important;color:#000!important;background:#fff!important;padding:3px 4px}
  table.st-doc th{font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  table.st-doc tr.tot td{font-weight:700;border-top:2px solid #000!important}
  table.st-doc td.ne{color:#000!important}
  .st-sum{color:#000}.st-sign small{color:#000}
}`;
  document.head.appendChild(css);

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const pd = s => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const fmtD = d => d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
  const fmtL = d => DOW[(d.getDay() + 6) % 7] + ' ' + fmtD(d) + ' ' + d.getFullYear();
  const q = v => v == null || v === '' ? '' : Number(v).toLocaleString('en-US', {maximumFractionDigits: 2});
  const F4 = [['main_impulse', 'Impulse'], ['main_bulk', 'Bulk'], ['out_impulse', 'Impulse'], ['out_bulk', 'Bulk']];

  const S = {loaded: false, has: true, pts: [], d: {}, day: null};
  const canS = (o, need) => (me && me.role === 'admin') || rank(lvl(o, 'stock')) >= rank(need);
  const anyFull = () => S.pts.some(p => canS(p.operation, 'full')) || (me && me.role === 'admin');

  async function load(force) {
    if (S.loaded && !force) return;
    const from = ymd(addD(new Date(), -120));
    try {
      const [p, d] = await Promise.all([api('/rest/v1/st_points?select=*&order=sort,name'), fetchAll('/rest/v1/st_daily?select=*&day=gte.' + from + '&order=point_id,day')]);
      S.pts = p; S.d = {}; d.forEach(x => S.d[x.point_id + '|' + x.day] = x); S.has = true;
    } catch (e) { S.has = false; S.err = e.message; }
    S.loaded = true;
  }
  async function run(fn) {
    $('page').innerHTML = '<div class="hint">Loading...</div>';
    try { await load(); if (!S.has) { $('page').innerHTML = '<div class="card err">Daily ICE Stock is not set up yet (Supabase/42 daily ice stock.sql).<div class="hint">' + esc(S.err || '') + '</div></div>'; return; } fn(); }
    catch (e) { $('page').innerHTML = '<div class="card err">Could not load: ' + esc(e.message) + '</div>'; }
  }
  const ptsF = () => S.pts.filter(p => p.active && (!op || p.operation === op));
  const val = (p, k, f) => { const r = S.d[p.id + '|' + k]; return r && r[f] != null ? Number(r[f]) : null; };
  const has = (p, k) => F4.some(x => val(p, k, x[0]) != null);
  const mainT = (p, k) => (val(p, k, 'main_impulse') || 0) + (val(p, k, 'main_bulk') || 0);
  const outT = (p, k) => (val(p, k, 'out_impulse') || 0) + (val(p, k, 'out_bulk') || 0);
  const opName = c => { const o = (ops || []).find(x => x.code === c); return o ? o.name : c; };
  const sumA = a => a.reduce((s, v) => s + (Number(v) || 0), 0);

  // ---------- Daily entry ----------
  function entry() {
    const today = ymd(new Date()), k = S.day || today; S.day = k;
    const d = pd(k), ls = ptsF(), future = k > today;
    let h = '<h2 class="pt">Daily ICE Stock &middot; ' + esc(fmtL(d)) + '</h2>'
      + '<div class="wknav noprint"><button class="btn" id="stPrev">&lsaquo; Previous day</button><input type="date" id="stDay" value="' + k + '" max="' + today + '"><button class="btn" id="stNext">Next day &rsaquo;</button><button class="btn" id="stToday">Today</button>'
      + (anyFull() ? '<button class="btn" id="stPts">Manage stock points</button>' : '') + '<button class="btn p" id="stDoc" title="The day\'s figures as a report document with signatures, for Print / Save as PDF">Daily report (PDF)</button></div>'
      + '<div class="grid" id="stTiles"></div>'
      + '<div class="wrap"><table class="st" style="min-width:1000px"><thead><tr><th rowspan="2">Operation</th><th rowspan="2">In charge</th><th colspan="3" class="grpH sep">Main Stores</th><th colspan="3" class="grpH sep">Outside</th><th rowspan="2" class="n sep">Total</th><th rowspan="2">Note</th><th rowspan="2">Entered by</th></tr>'
      + '<tr><th class="n sep">Impulse</th><th class="n">Bulk</th><th class="n">Total</th><th class="n sep">Impulse</th><th class="n">Bulk</th><th class="n">Total</th></tr></thead><tbody>';
    if (!ls.length) h += '<tr><td colspan="11" class="hint">No stock points for your access. The Admin gives access in Permission (Daily ICE Stock).</td></tr>';
    ls.forEach(p => {
      const e = canS(p.operation, 'edit') && !future, r = S.d[p.id + '|' + k] || {};
      const cell = (fi, sep) => { const v = val(p, k, F4[fi][0]); return '<td class="n' + (sep ? ' sep' : '') + '">' + (e ? '<input class="st-in" type="number" step="0.01" min="0" data-p="' + p.id + '" data-f="' + F4[fi][0] + '" value="' + (v == null ? '' : v) + '">' : (v == null ? '<span class="hint">-</span>' : q(v))) + '</td>'; };
      h += '<tr><td><b>' + esc(p.name) + '</b> <span class="tag t-b">' + esc(p.operation) + '</span></td><td>' + esc(p.person || '') + '</td>'
        + cell(0, true) + cell(1) + '<td class="n"><b id="stM' + p.id + '"></b></td>' + cell(2, true) + cell(3) + '<td class="n"><b id="stO' + p.id + '"></b></td><td class="n sep"><b id="stT' + p.id + '"></b></td>'
        + '<td>' + (e ? '<input class="st-note" data-p="' + p.id + '" data-f="note" value="' + esc(r.note || '') + '" placeholder="optional">' : esc(r.note || '')) + '</td><td class="hint" id="stBy' + p.id + '">' + esc(r.by_name || '') + '</td></tr>';
    });
    h += '<tr class="tot"><td colspan="2">Total</td><td class="n sep" id="stF0"></td><td class="n" id="stF1"></td><td class="n" id="stFM"></td><td class="n sep" id="stF2"></td><td class="n" id="stF3"></td><td class="n" id="stFO"></td><td class="n sep" id="stFT"></td><td colspan="2"></td></tr></tbody></table></div>'
      + '<div class="hint">Pick the date (today by default; future days are locked), type the stock and press Tab: it saves at once. Blank = not entered. Main Stores = stock in the main store; Outside = stock kept outside the main store. Each total = Impulse + Bulk.</div><div class="err" id="stMsg"></div>';
    $('page').innerHTML = h;
    calc(ls, k);
    const goDay = x => { S.day = x; entry(); };
    $('stDay').onchange = e => { if (e.target.value) goDay(e.target.value > today ? today : e.target.value); };
    $('stPrev').onclick = () => goDay(ymd(addD(d, -1)));
    $('stNext').onclick = () => { const n = ymd(addD(d, 1)); if (n <= today) goDay(n); };
    $('stToday').onclick = () => goDay(today);
    if ($('stPts')) $('stPts').onclick = pointsPanel;
    $('stDoc').onclick = () => dayDoc();
    document.querySelectorAll('#page [data-p][data-f]').forEach(i => i.onchange = () => save(i, ls, k));
  }

  // ---------- Daily report document (v5.8.1) ----------
  // The day's stock as a plain report: no input boxes, one line per operation ("Not entered" where blank), totals, summary and signatures.
  const signBlock = () => '<div class="st-sign"><div>Prepared by<small>Name / Signature / Date</small></div><div>Checked by (Stores)<small>Name / Signature / Date</small></div><div>Approved by (Operation Head)<small>Name / Signature / Date</small></div></div>';
  function dayDoc() {
    const today = ymd(new Date()), k = S.day || today, d = pd(k), ls = ptsF();
    const cell = v => '<td class="n">' + (v == null ? '-' : q(v)) + '</td>';
    const t = F4.map(x => sumA(ls.map(p => val(p, k, x[0]) || 0))), M = t[0] + t[1], O = t[2] + t[3], ent = ls.filter(p => has(p, k));
    const rows = ls.map((p, i) => { const r = S.d[p.id + '|' + k] || {}, hv = has(p, k);
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(p.name) + '</b> (' + esc(p.operation) + ')</td><td>' + esc(p.person || '') + '</td>'
        + (hv ? cell(val(p, k, 'main_impulse')) + cell(val(p, k, 'main_bulk')) + '<td class="n"><b>' + q(mainT(p, k)) + '</b></td>' + cell(val(p, k, 'out_impulse')) + cell(val(p, k, 'out_bulk')) + '<td class="n"><b>' + q(outT(p, k)) + '</b></td><td class="n"><b>' + q(mainT(p, k) + outT(p, k)) + '</b></td>'
          : '<td colspan="7" class="ne">Not entered</td>')
        + '<td>' + esc(r.note || '') + '</td><td>' + esc(hv ? (r.by_name || '') : '') + '</td></tr>'; }).join('');
    $('page').innerHTML = '<div class="noprint row2"><button class="btn" id="sdBack">&lsaquo; Back to daily entry</button><button class="btn" id="sdPrev">&lsaquo; Previous day</button><input type="date" id="sdDay" value="' + k + '" max="' + today + '"><button class="btn" id="sdNext">Next day &rsaquo;</button><button class="btn p" id="rPrint">Print / Save as PDF</button></div>'
      + '<h2 class="pt">Daily ICE Stock Report &middot; ' + esc(fmtL(d)) + '</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All operations') + ' &middot; Iceman IMS</div>'
      + '<div class="st-sum"><span>Date: <b>' + esc(fmtL(d)) + '</b></span><span>Operations entered: <b>' + ent.length + ' of ' + ls.length + '</b></span><span>Main Stores: <b>' + q(M) + '</b> (Impulse ' + q(t[0]) + ', Bulk ' + q(t[1]) + ')</span><span>Outside: <b>' + q(O) + '</b> (Impulse ' + q(t[2]) + ', Bulk ' + q(t[3]) + ')</span><span>Total stock: <b>' + q(M + O) + '</b></span></div>'
      + '<div class="wrap" style="box-shadow:none"><table class="st-doc"><thead><tr><th rowspan="2">No</th><th rowspan="2">Operation</th><th rowspan="2">In charge</th><th colspan="3" style="text-align:center">Main Stores</th><th colspan="3" style="text-align:center">Outside</th><th rowspan="2" class="n">Total stock</th><th rowspan="2">Note</th><th rowspan="2">Entered by</th></tr>'
      + '<tr><th class="n">Impulse</th><th class="n">Bulk</th><th class="n">Total</th><th class="n">Impulse</th><th class="n">Bulk</th><th class="n">Total</th></tr></thead><tbody>' + (rows || '<tr><td colspan="12">No stock points.</td></tr>')
      + '<tr class="tot"><td colspan="3">Total</td>' + [t[0], t[1], M, t[2], t[3], O, M + O].map(v => '<td class="n">' + q(v) + '</td>').join('') + '<td colspan="2"></td></tr></tbody></table></div>'
      + (ls.length - ent.length ? '<div class="hint" style="margin-top:6px">Not entered: ' + ls.filter(p => !has(p, k)).map(p => esc(p.name) + (p.person ? ' (' + esc(p.person) + ')' : '')).join(', ') + '</div>' : '')
      + signBlock();
    const goDay = x => { S.day = x; dayDoc(); };
    $('sdBack').onclick = () => entry();
    $('sdDay').onchange = e => { if (e.target.value) goDay(e.target.value > today ? today : e.target.value); };
    $('sdPrev').onclick = () => goDay(ymd(addD(d, -1)));
    $('sdNext').onclick = () => { const n = ymd(addD(d, 1)); if (n <= today) goDay(n); };
  }
  function calc(ls, k) {
    ls.forEach(p => { const hv = has(p, k); $('stM' + p.id).textContent = hv ? q(mainT(p, k)) : ''; $('stO' + p.id).textContent = hv ? q(outT(p, k)) : ''; $('stT' + p.id).textContent = hv ? q(mainT(p, k) + outT(p, k)) : ''; });
    const t = F4.map(x => sumA(ls.map(p => val(p, k, x[0]) || 0))), M = t[0] + t[1], O = t[2] + t[3], ent = ls.filter(p => has(p, k)).length;
    ['stF0', 'stF1', 'stF2', 'stF3'].forEach((id, i) => $(id).textContent = q(t[i])); $('stFM').textContent = q(M); $('stFO').textContent = q(O); $('stFT').textContent = q(M + O);
    $('stTiles').innerHTML = '<div class="tile"><b>' + q(M) + '</b><span>Main Stores (Impulse ' + q(t[0]) + ', Bulk ' + q(t[1]) + ')</span></div><div class="tile"><b>' + q(O) + '</b><span>Outside (Impulse ' + q(t[2]) + ', Bulk ' + q(t[3]) + ')</span></div>'
      + '<div class="tile"><b>' + q(M + O) + '</b><span>Total stock</span></div><div class="tile ' + (ent === ls.length ? 'g' : 'r') + '"><b>' + ent + ' of ' + ls.length + '</b><span>Operations entered</span></div>';
  }
  async function save(i, ls, k) {
    const f = i.dataset.f, pid = Number(i.dataset.p), key = pid + '|' + k;
    let v;
    if (f === 'note') v = i.value.trim() || null; else { v = i.value === '' ? null : Number(i.value); if (v != null && (isNaN(v) || v < 0)) { i.classList.add('bad'); return; } }
    const body = {point_id: pid, day: k}; body[f] = v;
    try {
      await api('/rest/v1/st_daily?on_conflict=point_id,day', {method: 'POST', body, headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}});
      S.d[key] = Object.assign(S.d[key] || {point_id: pid, day: k}, body, {by_name: (me && (me.full_name || me.username)) || ''});
      const by = $('stBy' + pid); if (by) by.textContent = S.d[key].by_name;
      i.classList.remove('bad'); i.classList.add('ok'); setTimeout(() => i.classList.remove('ok'), 1200); $('stMsg').textContent = ''; calc(ls, k);
    } catch (e) { i.classList.add('bad'); $('stMsg').textContent = e.message; }
  }

  // ---------- Manage stock points (Full / Admin) ----------
  function pointsPanel() {
    const fullOps = (ops || []).filter(o => canS(o.code, 'full')), pts = S.pts.filter(p => canS(p.operation, 'full'));
    // the point's own operation is always an option, so saving a person never moves the point to another operation
    const opSel = (v, id) => '<select data-f="operation"' + (id ? ' id="' + id + '"' : '') + '>' + (v && !fullOps.some(o => o.code === v) ? '<option value="' + esc(v) + '" selected>' + esc(v) + '</option>' : '') + fullOps.map(o => '<option value="' + o.code + '"' + (o.code === v ? ' selected' : '') + '>' + o.code + ' - ' + esc(o.name) + '</option>').join('') + '</select>';
    $('panel').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><h3>Stock points</h3><button class="btn" id="pClose">Close</button></div><div class="hint">One line = one place whose ICE stock is entered every day. Change the person in charge here when it changes.</div>'
      + pts.map(p => '<div class="card" style="margin:8px 0;box-shadow:none;border:1px solid var(--line)" data-sid="' + p.id + '"><div class="frm"><label>Name</label><input data-f="name" value="' + esc(p.name) + '"><label>Operation</label>' + opSel(p.operation)
        + '<label>Person in charge</label><input data-f="person" value="' + esc(p.person || '') + '"><label>Order</label><input data-f="sort" type="number" value="' + p.sort + '"><label><input type="checkbox" data-f="active"' + (p.active ? ' checked' : '') + ' style="width:auto"> Active</label></div><div class="row2"><button class="btn p" data-ssave="' + p.id + '">Save</button></div></div>').join('')
      + (fullOps.length ? '<div class="card" style="margin:8px 0;box-shadow:none;border:1px dashed var(--line2)"><b>Add a stock point</b><div class="frm"><label>Name</label><input id="spName"><label>Operation</label>' + opSel(fullOps[0].code, 'spOp') + '<label>Person in charge</label><input id="spPerson"></div><div class="row2"><button class="btn p" id="spAdd">Add</button></div></div>' : '')
      + '<div class="err" id="pErr"></div>';
    $('panel').classList.add('open'); $('pClose').onclick = () => $('panel').classList.remove('open');
    $('panel').querySelectorAll('[data-ssave]').forEach(b => b.onclick = async () => {
      const box = b.closest('[data-sid]'), g = f => box.querySelector('[data-f="' + f + '"]');
      const body = {name: g('name').value.trim(), operation: g('operation').value, person: g('person').value.trim() || null, sort: Number(g('sort').value) || 0, active: g('active').checked};
      if (!body.name) { $('pErr').textContent = 'Enter a name'; return; }
      try { await api('/rest/v1/st_points?id=eq.' + b.dataset.ssave, {method: 'PATCH', body, headers: {Prefer: 'return=minimal'}}); await load(true); pointsPanel(); entry(); $('panel').classList.add('open'); } catch (e) { $('pErr').textContent = e.message; }
    });
    if ($('spAdd')) $('spAdd').onclick = async () => {
      const body = {name: $('spName').value.trim(), operation: $('spOp').value, person: $('spPerson').value.trim() || null, sort: 99};
      if (!body.name) { $('pErr').textContent = 'Enter a name'; return; }
      try { await api('/rest/v1/st_points', {method: 'POST', body, headers: {Prefer: 'return=minimal'}}); await load(true); pointsPanel(); entry(); $('panel').classList.add('open'); } catch (e) { $('pErr').textContent = e.message; }
    };
  }

  // ---------- Dashboard: last 14 days ----------
  function dash() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [...Array(14)].map((_, i) => addD(today, i - 13)), ls = ptsF(), tk = ymd(today);
    const yk = ymd(addD(today, -1)), missY = ls.filter(p => !has(p, yk)), missT = ls.filter(p => !has(p, tk));
    const totDay = k => sumA(ls.map(p => mainT(p, k) + outT(p, k)));
    const last = p => { for (let i = days.length - 1; i >= 0; i--) { const k = ymd(days[i]); if (has(p, k)) return k; } return null; };
    let h = '<h2 class="pt">Daily ICE Stock &middot; last 14 days</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' &middot; total = Main Stores + Outside (Impulse + Bulk) &middot; red = not entered</div>'
      + '<div class="grid"><div class="tile"><b>' + q(totDay(tk)) + '</b><span>Total stock today</span></div><div class="tile"><b>' + q(totDay(yk)) + '</b><span>Total stock yesterday</span></div>'
      + '<div class="tile ' + (missT.length ? 'a' : 'g') + '"><b>' + (ls.length - missT.length) + ' of ' + ls.length + '</b><span>Entered today</span></div><div class="tile ' + (missY.length ? 'r' : 'g') + '"><b>' + (ls.length - missY.length) + ' of ' + ls.length + '</b><span>Entered yesterday</span></div></div>'
      + (missY.length ? '<div class="ins r" style="margin-bottom:8px"><b>Not entered for ' + esc(fmtD(addD(today, -1))) + ':</b> ' + missY.map(p => esc(p.name) + (p.person ? ' (' + esc(p.person) + ')' : '')).join(', ') + '</div>' : '')
      + '<div class="wrap"><table class="hm"><thead><tr><th style="text-align:left">Operation</th>' + days.map(d => '<th>' + DOW[(d.getDay() + 6) % 7] + '<br>' + d.getDate() + '</th>').join('') + '<th>Last entry</th></tr></thead><tbody>'
      + ls.map(p => '<tr><td style="text-align:left;white-space:nowrap"><b>' + esc(p.name) + '</b><div class="hint" style="margin:0">' + esc(p.person || '') + '</div></td>' + days.map(d => { const k = ymd(d); return has(p, k) ? '<td>' + q(mainT(p, k) + outT(p, k)) + '</td>' : '<td class="st-miss">-</td>'; }).join('') + '<td>' + (last(p) ? esc(fmtD(pd(last(p)))) : '<span class="down">none</span>') + '</td></tr>').join('')
      + '<tr class="tot"><td style="text-align:left">Total</td>' + days.map(d => '<td>' + q(totDay(ymd(d))) + '</td>').join('') + '<td></td></tr></tbody></table></div>';
    $('page').innerHTML = h;
  }

  // ---------- Week report ----------
  function report() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const base = S.rday ? pd(S.rday) : today, ws = monday(base), we = addD(ws, 6), days = [...Array(7)].map((_, i) => ymd(addD(ws, i))), ls = ptsF();
    const cellT = (p, k) => has(p, k) ? q(mainT(p, k) + outT(p, k)) : '<span class="hint">-</span>';
    const detail = [];
    ls.forEach(p => days.forEach(k => { if (has(p, k)) detail.push([p.name, p.operation, p.person || '', k, val(p, k, 'main_impulse'), val(p, k, 'main_bulk'), mainT(p, k), val(p, k, 'out_impulse'), val(p, k, 'out_bulk'), outT(p, k), mainT(p, k) + outT(p, k), (S.d[p.id + '|' + k] || {}).note || '']); }));
    const lab = fmtD(ws) + ' to ' + fmtD(we) + ' ' + we.getFullYear();
    $('page').innerHTML = '<div class="noprint row2"><button class="btn" id="srPrev">&lsaquo; Previous week</button><input type="date" id="srDay" value="' + ymd(base) + '" title="Any date in the week"><button class="btn" id="srNext">Next week &rsaquo;</button><button class="btn" id="srNow">This week</button><button class="btn p" id="rPrint">Print / Save as PDF</button><button class="btn" id="srCsv">Download Excel (CSV)</button></div>'
      + '<h2 class="pt">Daily ICE Stock &middot; week report &middot; ' + esc(lab) + '</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' &middot; Monday to Sunday &middot; Iceman IMS</div>'
      + '<h3>Total stock by day</h3><div class="wrap" style="box-shadow:none"><table class="st-doc"><thead><tr><th>Operation</th><th>In charge</th>' + days.map((k, i) => '<th class="n">' + DOW[i] + ' ' + pd(k).getDate() + '</th>').join('') + '</tr></thead><tbody>'
      + ls.map(p => '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.person || '') + '</td>' + days.map(k => '<td class="n">' + cellT(p, k) + '</td>').join('') + '</tr>').join('')
      + '<tr class="tot"><td colspan="2">Total</td>' + days.map(k => '<td class="n">' + q(sumA(ls.map(p => mainT(p, k) + outT(p, k)))) + '</td>').join('') + '</tr></tbody></table></div>'
      + '<h3 style="margin-top:14px">Details</h3><div class="wrap" style="box-shadow:none"><table class="st-doc"><thead><tr><th rowspan="2">Day</th><th rowspan="2">Operation</th><th colspan="3" class="grpH sep">Main Stores</th><th colspan="3" class="grpH sep">Outside</th><th rowspan="2" class="n sep">Total</th><th rowspan="2">Note</th></tr><tr><th class="n sep">Impulse</th><th class="n">Bulk</th><th class="n">Total</th><th class="n sep">Impulse</th><th class="n">Bulk</th><th class="n">Total</th></tr></thead><tbody>'
      + (detail.length ? detail.slice().sort((a, b) => a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0).map(r => '<tr><td>' + esc(fmtL(pd(r[3]))) + '</td><td>' + esc(r[0]) + '</td><td class="n sep">' + q(r[4]) + '</td><td class="n">' + q(r[5]) + '</td><td class="n">' + q(r[6]) + '</td><td class="n sep">' + q(r[7]) + '</td><td class="n">' + q(r[8]) + '</td><td class="n">' + q(r[9]) + '</td><td class="n sep"><b>' + q(r[10]) + '</b></td><td>' + esc(r[11]) + '</td></tr>').join('') : '<tr><td colspan="10" class="hint">Nothing entered in this week.</td></tr>')
      + '</tbody></table></div>' + signBlock();
    const goWk = dt => { S.rday = ymd(dt); report(); };
    $('srPrev').onclick = () => goWk(addD(ws, -7)); $('srNext').onclick = () => goWk(addD(ws, 7)); $('srNow').onclick = () => goWk(today);
    $('srDay').onchange = e => { if (e.target.value) goWk(pd(e.target.value)); };
    $('srCsv').onclick = () => {
      const head = ['Operation', 'Op code', 'In charge', 'Date', 'Main Impulse', 'Main Bulk', 'Main Total', 'Outside Impulse', 'Outside Bulk', 'Outside Total', 'Total', 'Note'];
      const qq = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [head].concat(detail).map(r => r.map(qq).join(',')).join('\r\n')], {type: 'text/csv'}));
      a.download = 'Daily ICE Stock ' + ymd(ws) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    };
  }

  // ---------- Home card ----------
  function card(m) {
    setTimeout(async () => { try { await load(); const el = document.getElementById('card-stock'); if (!el) return; if (!S.has) { el.innerHTML = '<b>' + esc(m.name) + '</b><div class="hint">Not set up yet</div>'; return; }
      const k = ymd(new Date()), ls = S.pts.filter(p => p.active), ent = ls.filter(p => has(p, k)).length, tot = sumA(ls.map(p => mainT(p, k) + outT(p, k)));
      el.innerHTML = '<b>Stocks &middot; ' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + q(tot) + '</div><div class="hint">total stock today &middot; ' + ent + ' of ' + ls.length + ' operations entered</div>'; } catch (e) {} }, 0);
    return '<div class="card mcard" data-mod="stock" data-go="items" id="card-stock"><b>Stocks &middot; ' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">Loading...</div></div>';
  }

  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {stock: {items: () => run(entry), dash: () => run(dash), report: () => run(report), card}});
})();
