// Iceman IMS - Daily Collection and Cash Flow sections (2026-11-01)
// Loaded before the main script. Uses the main script's globals at run time only (api, $, esc, money, money0, op, lvl, rank, opsFor, bars, go).
(function () {
  const css = document.createElement('style');
  css.textContent = `
.chart{width:100%;height:auto;display:block}.chart .gl{stroke:var(--line)}.chart .ax{fill:var(--muted);font-size:11px}.chart .pl{fill:var(--ink2);font-size:10px}
.chart .b-ok{fill:var(--primary)}.chart .b-bad{fill:var(--accent)}.chart .b-out{fill:var(--danger)}.chart .ln{fill:none;stroke:var(--danger);stroke-width:2;stroke-dasharray:5 4}
.chart .s1{fill:none;stroke:var(--primary);stroke-width:2.2}.chart .s2{fill:none;stroke:var(--accent);stroke-width:2.2;stroke-dasharray:6 4}.chart .s3{fill:none;stroke:var(--ok);stroke-width:2.2}
.chart .dt{fill:var(--danger)}.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:4px}.legend i{display:inline-block;width:14px;height:4px;border-radius:2px;margin-right:5px;vertical-align:middle}
.cin,.tin{width:100px;text-align:right;padding:4px 6px}.cin.ok,.tin.ok{border-color:var(--ok);background:var(--ok-soft)}.cin.bad,.tin.bad{border-color:var(--danger);background:var(--danger-soft)}
.wknav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 10px}.wknav b{min-width:220px;text-align:center}
.hm td{text-align:center;font-size:12px;padding:5px 4px;min-width:44px}.hm .h-g{background:var(--ok-soft);color:var(--ok);font-weight:700}.hm .h-a{background:var(--warn-soft);color:var(--warn);font-weight:700}.hm .h-r{background:var(--danger-soft);color:var(--danger);font-weight:700}.hm .h-n{color:var(--muted)}
.subtabs{display:flex;gap:6px;margin:8px 0}.subtabs button{border:1px solid var(--line2);background:var(--surface);border-radius:20px;padding:5px 14px;cursor:pointer}.subtabs button.on{background:var(--primary);color:var(--primary-ink);border-color:var(--primary)}
.ins{margin:4px 0;padding:6px 10px;border-radius:8px;background:var(--surface2);font-size:13px}.ins.r{border-left:4px solid var(--danger)}.ins.g{border-left:4px solid var(--ok)}.ins.a{border-left:4px solid var(--accent)}
.up{color:var(--ok);font-weight:700}.down{color:var(--danger);font-weight:700}
tr.tot td{font-weight:700;background:var(--surface2)}tr.grp td{background:var(--primary-soft);color:var(--primary);font-weight:700}`;
  document.head.appendChild(css);

  // ---------- dates ----------
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const pd = s => { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  const isoW = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + 3 - (x.getDay() + 6) % 7); const w1 = new Date(x.getFullYear(), 0, 4); return 1 + Math.round(((x - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7); };
  const wkLabel = ws => 'W' + isoW(ws);
  const fmtD = d => d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const short = v => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? Math.round(v / 1e3) + 'K' : String(Math.round(v)); };
  const pct = (a, b) => b ? Math.round(100 * a / b) : null;
  const sumA = a => a.reduce((s, v) => s + (Number(v) || 0), 0);
  const weeksBack = n => { const cur = monday(new Date()); return [...Array(n)].map((_, i) => addD(cur, -7 * (n - 1 - i))); };

  // ---------- state ----------
  const C = {loaded: false, lanes: [], dmap: {}, tmap: {}, wk: null, n: 13, mgr: '', lane: ''};
  const F = {loaded: false, week: {}, out: [], chq: [], wk: null, sub: 'out', n: 13, from: '', to: ''};
  const canC = (o, need) => rank(lvl(o, 'collection')) >= rank(need);
  const canF = (o, need) => rank(lvl(o, 'cashflow')) >= rank(need);

  async function cLoad(force) {
    if (C.loaded && !force) return;
    const from = ymd(addD(monday(new Date()), -7 * 53));
    const [ln, t, d] = await Promise.all([api('/rest/v1/cc_lanes?select=*&order=sort,name'), api('/rest/v1/cc_targets?select=lane_id,week_start,target&week_start=gte.' + from),
      api('/rest/v1/cc_daily?select=lane_id,day,amount,customers,note,by_name,updated_at&day=gte.' + from + '&limit=50000')]);
    C.lanes = ln;
    C.tmap = {}; t.forEach(x => C.tmap[x.lane_id + '|' + x.week_start] = Number(x.target));
    C.dmap = {}; d.forEach(x => C.dmap[x.lane_id + '|' + x.day] = x);
    C.loaded = true;
  }
  async function fLoad(force) {
    if (F.loaded && !force) return;
    const from = ymd(addD(monday(new Date()), -7 * 53));
    const [w, out, chq] = await Promise.all([api('/rest/v1/cf_week?select=*&week_start=gte.' + from), api('/rest/v1/cf_outflow?select=*&deleted=eq.false&day=gte.' + from + '&order=day.desc&limit=20000'),
      api('/rest/v1/cf_cheques?select=*&order=cheque_date.asc.nullslast&limit=5000'), opsFor('collection').length ? cLoad() : null]);
    F.week = {}; w.forEach(x => F.week[x.operation + '|' + x.week_start] = x);
    F.out = out; F.chq = chq;
    F.loaded = true;
  }
  const lanesF = () => C.lanes.filter(l => l.active && (!op || l.operation === op) && (!C.mgr || (l.manager || '') === C.mgr) && (!C.lane || String(l.id) === C.lane));
  const amt = (l, day) => { const r = C.dmap[l.id + '|' + day]; return r && r.amount != null ? Number(r.amount) : null; };
  const wkSum = (ls, ws) => { let s = 0; ls.forEach(l => { for (let i = 0; i < 7; i++) s += amt(l, ymd(addD(ws, i))) || 0; }); return s; };
  const wkTgt = (ls, ws) => sumA(ls.map(l => C.tmap[l.id + '|' + ymd(ws)] || 0));
  async function run(load, fn) {
    $('page').innerHTML = '<div class="hint">Loading...</div>';
    try { await load(); fn(); } catch (e) { $('page').innerHTML = '<div class="card err">Could not load: ' + esc(e.message) + '<div class="hint">If this is new, the database section may not be set up yet.</div></div>'; }
  }
  const sel = (id, label, opts, v) => '<select id="' + id + '">' + (label ? '<option value="">' + label + '</option>' : '') + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  const csvDl = (name, head, rowsArr) => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [head].concat(rowsArr).map(r => r.map(q).join(',')).join('\r\n')], {type: 'text/csv'}));
    a.download = name + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };

  // ---------- charts ----------
  function svgCombo(labels, barsV, lineV, opt) {
    opt = opt || {};
    const W = 680, H = 240, pl = 50, pr = 10, pt = 18, pb = 30, n = labels.length, mx = Math.max(1, ...barsV, ...lineV) * 1.12;
    const x = i => pl + (i + 0.5) * (W - pl - pr) / n, bw = Math.max(5, (W - pl - pr) / n * 0.62), y = v => pt + (H - pt - pb) * (1 - v / mx);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img">';
    for (let g = 0; g <= 4; g++) { const yy = y(mx * g / 4); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" class="gl"/><text x="' + (pl - 6) + '" y="' + (yy + 4) + '" class="ax" text-anchor="end">' + short(mx * g / 4) + '</text>'; }
    barsV.forEach((v, i) => {
      const okb = opt.cls ? opt.cls : (!lineV[i] || v >= lineV[i] ? 'b-ok' : 'b-bad');
      s += '<rect x="' + (x(i) - bw / 2) + '" y="' + y(v) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(v)) + '" rx="3" class="' + okb + '"><title>' + esc(labels[i]) + ': ' + money0(v) + (lineV[i] ? ' of ' + money0(lineV[i]) : '') + '</title></rect>';
      if (opt.pct && lineV[i] && n <= 20) s += '<text x="' + x(i) + '" y="' + (y(Math.max(v, 0)) - 4) + '" class="pl" text-anchor="middle">' + pct(v, lineV[i]) + '%</text>';
    });
    if (lineV.some(v => v)) { s += '<polyline points="' + lineV.map((v, i) => x(i) + ',' + y(v)).join(' ') + '" class="ln"/>'; lineV.forEach((v, i) => s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.6" class="dt"/>'); }
    const step = Math.ceil(n / 14); labels.forEach((l, i) => { if (i % step === 0) s += '<text x="' + x(i) + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(l) + '</text>'; });
    return s + '</svg>';
  }
  function svgLines(labels, series) {
    const W = 680, H = 230, pl = 50, pr = 10, pt = 14, pb = 30, n = labels.length, all = [].concat(...series.map(s => s.v.filter(v => v != null))), mx = Math.max(1, ...all) * 1.12, mn = Math.min(0, ...all);
    const x = i => pl + (n < 2 ? 0.5 : i / (n - 1)) * (W - pl - pr), y = v => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img">';
    for (let g = 0; g <= 4; g++) { const v = mn + (mx - mn) * g / 4, yy = y(v); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" class="gl"/><text x="' + (pl - 6) + '" y="' + (yy + 4) + '" class="ax" text-anchor="end">' + short(v) + '</text>'; }
    series.forEach(se => { let d = '', pen = false; se.v.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i) + ' ' + y(v) + ' '; pen = true; }); if (d) s += '<path d="' + d + '" class="' + se.cls + '"><title>' + esc(se.name) + '</title></path>'; });
    const step = Math.ceil(n / 12); labels.forEach((l, i) => { if (i % step === 0) s += '<text x="' + x(i) + '" y="' + (H - 10) + '" class="ax" text-anchor="middle">' + esc(l) + '</text>'; });
    return s + '</svg>';
  }
  const legend = items => '<div class="legend">' + items.map(i => '<span><i style="background:' + i[1] + '"></i>' + esc(i[0]) + '</span>').join('') + '</div>';
  function slope(vals) { const p = vals.map((v, i) => [i, v]).filter(a => a[1] != null); if (p.length < 3) return 0; const mx = sumA(p.map(a => a[0])) / p.length, my = sumA(p.map(a => a[1])) / p.length; let nu = 0, de = 0; p.forEach(a => { nu += (a[0] - mx) * (a[1] - my); de += (a[0] - mx) ** 2; }); return de ? nu / de : 0; }

  // ================= DAILY COLLECTION =================
  function cFilters(withLane) {
    const mgrs = [...new Set(C.lanes.filter(l => !op || l.operation === op).map(l => l.manager).filter(Boolean))].sort();
    return '<div class="filters">' + (mgrs.length ? sel('ccMgr', 'All managers', mgrs.map(m => [m, m]), C.mgr) : '')
      + (withLane ? sel('ccLane', 'All collection lines', C.lanes.filter(l => l.active && (!op || l.operation === op)).map(l => [l.id, l.name]), C.lane) : '') + '</div>';
  }
  function bindCF(again) { const m = $('ccMgr'); if (m) m.onchange = () => { C.mgr = m.value; again(); }; const l = $('ccLane'); if (l) l.onchange = () => { C.lane = l.value; again(); }; }

  function cEntry() {
    const ws = C.wk || monday(new Date()); C.wk = ws;
    const days = [...Array(7)].map((_, i) => addD(ws, i)), today = ymd(new Date()), ls = lanesF();
    const anyFull = C.lanes.some(l => canC(l.operation, 'full'));
    const tg = wkTgt(ls, ws), col = wkSum(ls, ws), entered = ls.filter(l => amt(l, today) != null).length;
    let h = '<h2 class="pt">Daily Collection <span class="hint">enter what each collection line collected today</span></h2>'
      + '<div class="wknav"><button class="btn" id="ccPrev">&lsaquo; Previous week</button><b>' + wkLabel(ws) + ' &middot; ' + fmtD(ws) + ' to ' + fmtD(addD(ws, 6)) + ' ' + addD(ws, 6).getFullYear() + '</b><button class="btn" id="ccNext">Next week &rsaquo;</button><button class="btn" id="ccNow">This week</button>'
      + (anyFull ? '<button class="btn" id="ccLanes">Manage collection lines</button>' : '') + '</div>' + cFilters(false)
      + '<div class="grid"><div class="tile"><b>' + money0(tg) + '</b><span>Week target</span></div><div class="tile ' + (col >= tg ? 'g' : 'a') + '"><b>' + money0(col) + '</b><span>Collected so far</span></div>'
      + '<div class="tile ' + (col - tg >= 0 ? 'g' : 'r') + '"><b>' + money0(col - tg) + '</b><span>Excess / (Short)</span></div><div class="tile"><b>' + (tg ? pct(col, tg) + '%' : 'no target') + '</b><span>Achievement</span></div>'
      + (ymd(ws) === ymd(monday(new Date())) ? '<div class="tile a"><b>' + entered + ' of ' + ls.length + '</b><span>Lines entered today</span></div>' : '') + '</div>'
      + '<div class="wrap"><table style="min-width:1100px"><thead><tr><th>Collection line</th><th>Officer</th>' + days.map((d, i) => '<th class="n">' + DOW[i] + ' ' + d.getDate() + '</th>').join('')
      + '<th class="n">Total</th><th class="n">Target</th><th class="n">Excess/(Short)</th><th class="n">%</th><th></th></tr></thead><tbody>';
    if (!ls.length) h += '<tr><td colspan="14" class="hint">No collection lines for your access. The Admin gives access in Permission (Daily Collection).</td></tr>';
    ls.forEach(l => {
      const e = canC(l.operation, 'edit'), f = canC(l.operation, 'full'), t = C.tmap[l.id + '|' + ymd(ws)];
      h += '<tr><td><b>' + esc(l.name) + '</b> <span class="tag t-b">' + esc(l.operation) + '</span></td><td>' + esc(l.officer || '') + '</td>'
        + days.map(d => {
          const k = ymd(d), r = C.dmap[l.id + '|' + k], v = r && r.amount != null ? r.amount : '', old = (new Date() - d) / 864e5 > 7.99, lock = k > today || (old && !f);
          return '<td class="n">' + (e && !lock ? '<input class="cin" type="number" step="0.01" min="0" data-l="' + l.id + '" data-d="' + k + '" value="' + v + '"' + (v === '' && k < today ? ' style="background:var(--danger-soft)" placeholder="not entered"' : '') + (r && r.customers ? ' title="' + esc(r.customers) + '"' : '') + '>' : (v === '' ? '<span class="hint">' + (k > today ? '' : '-') + '</span>' : money0(v))) + '</td>';
        }).join('')
        + '<td class="n"><b id="ccT' + l.id + '"></b></td><td class="n">' + (f ? '<input class="tin" type="number" step="1" min="0" data-l="' + l.id + '" value="' + (t == null ? '' : t) + '">' : (t == null ? '<span class="hint">not set</span>' : money0(t))) + '</td>'
        + '<td class="n" id="ccX' + l.id + '"></td><td class="n" id="ccP' + l.id + '"></td><td><button class="btn q" data-cdet="' + l.id + '" title="Customers and notes for the week">&#128221;</button></td></tr>';
    });
    h += '<tr class="tot"><td colspan="2">Total</td>' + days.map((d, i) => '<td class="n" id="ccD' + i + '"></td>').join('') + '<td class="n" id="ccTT"></td><td class="n" id="ccTG"></td><td class="n" id="ccTX"></td><td class="n" id="ccTP"></td><td></td></tr></tbody></table></div>'
      + '<div class="hint">Type the amount and press Tab: it saves at once. Blank = not entered. Future days are locked; entries older than 7 days need Full access. &#128221; adds the customers collected from.</div><div class="err" id="ccMsg"></div>';
    $('page').innerHTML = h;
    calcRows(ls, days);
    $('ccPrev').onclick = () => { C.wk = addD(ws, -7); cEntry(); };
    $('ccNext').onclick = () => { C.wk = addD(ws, 7); cEntry(); };
    $('ccNow').onclick = () => { C.wk = monday(new Date()); cEntry(); };
    if ($('ccLanes')) $('ccLanes').onclick = lanesPanel;
    bindCF(cEntry);
    document.querySelectorAll('#page .cin').forEach(i => i.onchange = () => saveCell(i, ls, days));
    document.querySelectorAll('#page .tin').forEach(i => i.onchange = () => saveTarget(i, ws, ls, days));
    document.querySelectorAll('#page [data-cdet]').forEach(b => b.onclick = () => detPanel(Number(b.dataset.cdet), ws));
  }
  function calcRows(ls, days) {
    const ws = days[0];
    ls.forEach(l => {
      const tot = sumA(days.map(d => amt(l, ymd(d)) || 0)), t = C.tmap[l.id + '|' + ymd(ws)];
      $('ccT' + l.id).textContent = money0(tot);
      $('ccX' + l.id).innerHTML = t ? '<span class="' + (tot - t >= 0 ? 'up' : 'down') + '">' + money0(tot - t) + '</span>' : '';
      $('ccP' + l.id).textContent = t ? pct(tot, t) + '%' : '';
    });
    days.forEach((d, i) => $('ccD' + i).textContent = money0(sumA(ls.map(l => amt(l, ymd(d)) || 0))));
    const T = wkSum(ls, ws), G = wkTgt(ls, ws);
    $('ccTT').textContent = money0(T); $('ccTG').textContent = money0(G); $('ccTX').textContent = G ? money0(T - G) : ''; $('ccTP').textContent = G ? pct(T, G) + '%' : '';
  }
  async function saveCell(i, ls, days) {
    const v = i.value === '' ? null : Number(i.value), k = i.dataset.l + '|' + i.dataset.d;
    if (v != null && (isNaN(v) || v < 0)) { i.classList.add('bad'); return; }
    try {
      await api('/rest/v1/cc_daily?on_conflict=lane_id,day', {method: 'POST', body: {lane_id: Number(i.dataset.l), day: i.dataset.d, amount: v}, headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}});
      C.dmap[k] = Object.assign(C.dmap[k] || {lane_id: Number(i.dataset.l), day: i.dataset.d}, {amount: v});
      i.classList.remove('bad'); i.classList.add('ok'); setTimeout(() => i.classList.remove('ok'), 1200); $('ccMsg').textContent = ''; calcRows(ls, days);
    } catch (e) { i.classList.add('bad'); $('ccMsg').textContent = e.message; }
  }
  async function saveTarget(i, ws, ls, days) {
    const v = i.value === '' ? 0 : Number(i.value);
    try {
      await api('/rest/v1/cc_targets?on_conflict=lane_id,week_start', {method: 'POST', body: {lane_id: Number(i.dataset.l), week_start: ymd(ws), target: v}, headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}});
      C.tmap[i.dataset.l + '|' + ymd(ws)] = v; i.classList.add('ok'); setTimeout(() => i.classList.remove('ok'), 1200); $('ccMsg').textContent = ''; calcRows(ls, days);
    } catch (e) { i.classList.add('bad'); $('ccMsg').textContent = e.message; }
  }
  function detPanel(laneId, ws) {
    const l = C.lanes.find(x => x.id === laneId), e = canC(l.operation, 'edit'), today = ymd(new Date());
    $('panel').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><h3>' + esc(l.name) + ' &middot; ' + wkLabel(ws) + '</h3><button class="btn" id="pClose">Close</button></div><div class="hint">Customers collected from, per day (the sheet\'s Description column).</div>'
      + [...Array(7)].map((_, i) => { const d = ymd(addD(ws, i)), r = C.dmap[laneId + '|' + d] || {}, lock = !e || d > today;
        return '<div class="frm"><label>' + DOW[i] + ' ' + fmtD(addD(ws, i)) + ' &middot; ' + (r.amount != null ? money0(r.amount) : 'no amount') + (r.by_name ? ' &middot; by ' + esc(r.by_name) : '') + '</label><input data-cust="' + d + '" value="' + esc(r.customers || '') + '" placeholder="e.g. Laugfs, Spar, Arpico"' + (lock ? ' disabled' : '') + '></div>'; }).join('')
      + '<div class="err" id="pErr"></div>';
    $('panel').classList.add('open'); $('pClose').onclick = () => $('panel').classList.remove('open');
    $('panel').querySelectorAll('[data-cust]').forEach(inp => inp.onchange = async () => {
      try { await api('/rest/v1/cc_daily?on_conflict=lane_id,day', {method: 'POST', body: {lane_id: laneId, day: inp.dataset.cust, customers: inp.value.trim() || null}, headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}});
        const k = laneId + '|' + inp.dataset.cust; C.dmap[k] = Object.assign(C.dmap[k] || {lane_id: laneId, day: inp.dataset.cust, amount: null}, {customers: inp.value.trim() || null}); inp.style.borderColor = 'var(--ok)'; $('pErr').textContent = ''; }
      catch (er) { $('pErr').textContent = er.message; }
    });
  }
  function lanesPanel() {
    const fullOps = ops.filter(o => canC(o.code, 'full')), lanes = C.lanes.filter(l => canC(l.operation, 'full'));
    const opSel = (v, id) => '<select data-f="operation"' + (id ? '' : ' id="nlOp"') + '>' + fullOps.map(o => '<option value="' + o.code + '"' + (o.code === v ? ' selected' : '') + '>' + o.code + '</option>').join('') + '</select>';
    $('panel').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><h3>Collection lines</h3><button class="btn" id="pClose">Close</button></div><div class="hint">One line = one collection column of the old sheet. Officer and manager names drive the filters.</div>'
      + lanes.map(l => '<div class="card" style="margin:8px 0;box-shadow:none;border:1px solid var(--line)" data-lid="' + l.id + '"><div class="frm"><label>Name</label><input data-f="name" value="' + esc(l.name) + '"><label>Operation</label>' + opSel(l.operation, 1)
        + '<label>Officer</label><input data-f="officer" value="' + esc(l.officer || '') + '"><label>Manager</label><input data-f="manager" value="' + esc(l.manager || '') + '"><label>Order</label><input data-f="sort" type="number" value="' + l.sort + '"><label><input type="checkbox" data-f="active"' + (l.active ? ' checked' : '') + ' style="width:auto"> Active</label></div><div class="row2"><button class="btn p" data-lsave="' + l.id + '">Save</button></div></div>').join('')
      + '<div class="card" style="margin:8px 0;box-shadow:none;border:1px dashed var(--line2)"><b>Add a line</b><div class="frm"><label>Name</label><input id="nlName"><label>Operation</label>' + opSel(fullOps[0] && fullOps[0].code) + '<label>Officer</label><input id="nlOff"><label>Manager</label><input id="nlMgr"></div><div class="row2"><button class="btn p" id="nlAdd">Add line</button></div></div><div class="err" id="pErr"></div>';
    $('panel').classList.add('open'); $('pClose').onclick = () => $('panel').classList.remove('open');
    $('panel').querySelectorAll('[data-lsave]').forEach(b => b.onclick = async () => {
      const box = b.closest('[data-lid]'), g = f => box.querySelector('[data-f="' + f + '"]');
      try { await api('/rest/v1/cc_lanes?id=eq.' + b.dataset.lsave, {method: 'PATCH', body: {name: g('name').value.trim(), operation: g('operation').value, officer: g('officer').value.trim() || null, manager: g('manager').value.trim() || null, sort: Number(g('sort').value) || 0, active: g('active').checked}, headers: {Prefer: 'return=minimal'}});
        await cLoad(true); lanesPanel(); cEntry(); $('panel').classList.add('open'); } catch (e) { $('pErr').textContent = e.message; }
    });
    $('nlAdd').onclick = async () => {
      try { await api('/rest/v1/cc_lanes', {method: 'POST', body: {name: $('nlName').value.trim(), operation: $('nlOp').value, officer: $('nlOff').value.trim() || null, manager: $('nlMgr').value.trim() || null, sort: 99}, headers: {Prefer: 'return=minimal'}});
        await cLoad(true); lanesPanel(); cEntry(); $('panel').classList.add('open'); } catch (e) { $('pErr').textContent = e.message; }
    };
  }

  function unitStats(units, W, full) {
    return units.map(u => {
      const p = W.map(ws => { const t = wkTgt(u.lanes, ws); return t ? 100 * wkSum(u.lanes, ws) / t : null; });
      const fp = full.map(i => p[i]), c = sumA(full.map(i => wkSum(u.lanes, W[i]))), t = sumA(full.map(i => wkTgt(u.lanes, W[i])));
      return {u, p, slope: slope(fp.slice(-8)), ach: t ? 100 * c / t : null, c, t, last3: fp.slice(-3)};
    });
  }
  function lastWorkDay(d) { let x = addD(d, -1); while (x.getDay() === 0) x = addD(x, -1); return x; }
  function cDash() {
    const my = opsFor('collection'), main = !op && my.length > 1, word = main ? 'operation' : 'line';
    const baseL = C.lanes.filter(l => l.active && (!op || l.operation === op)), ls = main ? baseL : lanesF();
    const units = main ? my.map(o => ({name: o.code, title: o.name, code: o.code, lanes: baseL.filter(l => l.operation === o.code)})).filter(u => u.lanes.length)
                       : ls.map(l => ({name: l.name, title: l.officer || '', lanes: [l]}));
    const W = weeksBack(C.n), cur = ymd(monday(new Date())), today = new Date(), tk = ymd(today);
    const col = W.map(ws => wkSum(ls, ws)), tgt = W.map(ws => wkTgt(ls, ws));
    const full = W.map((ws, i) => ymd(ws) !== cur ? i : -1).filter(i => i >= 0);
    const pCol = sumA(full.map(i => col[i])), pTgt = sumA(full.map(i => tgt[i]));
    const wd = Math.min(6, (today.getDay() + 6) % 7 + 1), curCol = col[col.length - 1], curTgt = tgt[tgt.length - 1], pace = curTgt * wd / 6;
    const D = [...Array(42)].map((_, i) => addD(today, i - 41)), dv = D.map(d => { const k = ymd(d), s = ls.map(l => amt(l, k)).filter(v => v != null); return s.length ? sumA(s) : null; });
    const ma = dv.map((_, i) => { const w = dv.slice(Math.max(0, i - 6), i + 1).filter(v => v != null); return w.length ? sumA(w) / w.length : null; });
    const wdSum = [0, 0, 0, 0, 0, 0, 0], wdCnt = [0, 0, 0, 0, 0, 0, 0];
    W.forEach(ws => { for (let i = 0; i < 7; i++) { const k = ymd(addD(ws, i)), s = ls.map(l => amt(l, k)).filter(v => v != null); if (s.length) { wdSum[i] += sumA(s); wdCnt[i]++; } } });
    const per = unitStats(units, W, full), hc = v => v == null ? 'h-n' : v >= 100 ? 'h-g' : v >= 80 ? 'h-a' : 'h-r';
    const standing = per.filter(x => x.last3.length === 3 && x.last3.every(v => v != null && v < 80)), rising = per.filter(x => x.slope > 3), falling = per.filter(x => x.slope < -3);
    const bestWd = wdSum.map((s, i) => [i, wdCnt[i] ? s / wdCnt[i] : 0]).sort((a, b) => b[1] - a[1]), wkd = bestWd.filter(a => a[0] < 6 && a[1] > 0), weak = wkd.length > 1 ? wkd[wkd.length - 1][0] : null;
    const yd = lastWorkDay(today), ydk = ymd(yd), missing = ls.filter(l => amt(l, ydk) == null);
    const pOpts = [[4, 'Last 4 weeks'], [8, 'Last 8 weeks'], [13, 'Last 13 weeks'], [26, 'Last 26 weeks'], [52, 'Last 52 weeks']];
    const opName = op ? ((ops.find(o => o.code === op) || {}).name || op) : '';
    let h = (my.length > 1 ? '<div class="subtabs noprint"><button data-dop="" class="' + (main ? 'on' : '') + '">Main dashboard</button>' + my.map(o => '<button data-dop="' + o.code + '" class="' + (op === o.code ? 'on' : '') + '" title="' + esc(o.name) + '">' + o.code + '</button>').join('') + '</div>' : '')
      + '<h2 class="pt">' + (main ? 'Main dashboard &middot; all operations' : 'Operation dashboard &middot; ' + esc(opName || 'my operation')) + '</h2><div class="hint">Daily Collection &middot; figures come from what each operation enters &middot; period figures use full weeks only</div>'
      + '<div class="filters">' + sel('ccN', '', pOpts, C.n) + '</div>' + (main ? '' : cFilters(true))
      + '<div class="grid"><div class="tile"><b>' + money0(pCol) + '</b><span>Collected (' + full.length + ' full weeks)</span></div><div class="tile"><b>' + money0(pTgt) + '</b><span>Target (same weeks)</span></div>'
      + '<div class="tile ' + (pCol >= pTgt ? 'g' : 'r') + '"><b>' + (pTgt ? Math.round(100 * pCol / pTgt) + '%' : '-') + '</b><span>Achievement</span></div><div class="tile ' + (pCol - pTgt >= 0 ? 'g' : 'r') + '"><b>' + money0(pCol - pTgt) + '</b><span>Excess / (Short)</span></div>'
      + '<div class="tile ' + (curCol >= pace ? 'g' : 'a') + '"><b>' + money0(curCol) + '</b><span>This week so far (pace ' + money0(pace) + ' of ' + money0(curTgt) + ')</span></div>'
      + '<div class="tile ' + (missing.length ? 'r' : 'g') + '"><b>' + (ls.length - missing.length) + ' of ' + ls.length + '</b><span>Lines entered for ' + DOW[(yd.getDay() + 6) % 7] + ' ' + fmtD(yd) + '</span></div></div>'
      + '<div class="card" style="margin-bottom:12px"><h3>What the figures say</h3>'
      + (standing.length ? '<div class="ins r"><b>Below 80% for 3 weeks in a row (' + word + 's):</b> ' + standing.map(x => esc(x.u.name)).join(', ') + '</div>' : '<div class="ins g">No ' + word + ' has been below 80% for 3 weeks in a row.</div>')
      + (falling.length ? '<div class="ins a"><b>Falling trend, last 8 weeks:</b> ' + falling.map(x => esc(x.u.name)).join(', ') + '</div>' : '')
      + (rising.length ? '<div class="ins g"><b>Improving trend:</b> ' + rising.map(x => esc(x.u.name)).join(', ') + '</div>' : '')
      + (missing.length ? '<div class="ins r"><b>Not entered for ' + fmtD(yd) + ':</b> ' + missing.map(l => esc(l.name) + (main ? ' (' + l.operation + ')' : '')).join(', ') + '</div>' : '')
      + (bestWd[0][1] ? '<div class="ins">Strongest collection day: <b>' + DOW[bestWd[0][0]] + '</b>' + (weak != null ? '; weakest working day: <b>' + DOW[weak] + '</b>' : '') + '.</div>' : '')
      + (curTgt ? '<div class="ins ' + (curCol >= pace ? 'g' : 'a') + '">This week: ' + money0(curCol) + ' after ' + wd + ' working day(s); ' + (curCol >= pace ? 'on pace' : 'behind pace by ' + money0(pace - curCol)) + ' for the ' + money0(curTgt) + ' target.</div>' : '<div class="ins a">No target set for this week yet.</div>')
      + '</div>';
    if (main) {
      const wsC = W[W.length - 1];
      h += '<div class="card" style="margin-bottom:12px"><h3>Operations this week</h3><div class="wrap" style="box-shadow:none"><table><thead><tr><th>Operation</th><th class="n">Target</th><th class="n">Collected</th><th class="n">%</th><th>Pace</th><th class="n">Period %</th><th>Trend</th><th class="n">Entered ' + fmtD(yd) + '</th></tr></thead><tbody>'
        + per.map(x => { const tg = wkTgt(x.u.lanes, wsC), c = wkSum(x.u.lanes, wsC), pv = tg * wd / 6, ent = x.u.lanes.filter(l => amt(l, ydk) != null).length;
          return '<tr class="row" data-dop="' + x.u.code + '"><td><b>' + esc(x.u.code) + '</b> ' + esc(x.u.title) + '</td><td class="n">' + money0(tg) + '</td><td class="n">' + money0(c) + '</td><td class="n">' + (tg ? pct(c, tg) + '%' : '') + '</td><td>' + (tg ? (c >= pv ? '<span class="up">on pace</span>' : '<span class="down">behind ' + money0(pv - c) + '</span>') : '<span class="hint">no target</span>') + '</td><td class="n">' + (x.ach == null ? '' : Math.round(x.ach) + '%') + '</td><td>' + (x.slope > 3 ? '<span class="up">&#9650; rising</span>' : x.slope < -3 ? '<span class="down">&#9660; falling</span>' : '<span class="hint">steady</span>') + '</td><td class="n"><span class="' + (ent < x.u.lanes.length ? 'down' : 'up') + '">' + ent + ' / ' + x.u.lanes.length + '</span></td></tr>'; }).join('')
        + '</tbody></table></div><div class="hint">Click an operation to open its dashboard.</div></div>';
    }
    h += '<div class="grid2">'
      + '<div class="card"><h3>Weekly collection vs target</h3>' + svgCombo(W.map(wkLabel), col, tgt, {pct: true}) + legend([['Collected (met target)', 'var(--primary)'], ['Collected (below target)', 'var(--accent)'], ['Target', 'var(--danger)']]) + '</div>'
      + '<div class="card"><h3>Daily collection, last 6 weeks</h3>' + svgLines(D.map(fmtD), [{name: 'Daily', v: dv, cls: 's1'}, {name: '7-day average', v: ma, cls: 's2'}]) + legend([['Daily total', 'var(--primary)'], ['7-day average', 'var(--accent)']]) + '</div>'
      + '<div class="card"><h3>Achievement by ' + word + ' (period)</h3>' + bars(per.filter(x => x.ach != null).sort((a, b) => b.ach - a.ach).map(x => [x.u.name, Math.round(x.ach), x.ach >= 100 ? 'var(--ok)' : x.ach >= 80 ? 'var(--accent)' : 'var(--danger)']), v => v + '%') + '</div>'
      + '<div class="card"><h3>Collected by ' + word + ' (period)</h3>' + bars(per.filter(x => x.c).sort((a, b) => b.c - a.c).map(x => [x.u.name, x.c]), money0) + '</div>'
      + '<div class="card"><h3>Average by weekday</h3>' + bars(DOW.map((d, i) => [d, wdCnt[i] ? Math.round(wdSum[i] / wdCnt[i]) : 0]), money0) + '</div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Achievement % by ' + word + ' and week</h3><div class="wrap" style="box-shadow:none"><table class="hm"><thead><tr><th>' + (main ? 'Operation' : 'Line') + '</th>' + W.map(ws => '<th>' + wkLabel(ws) + '</th>').join('') + '<th>Trend</th></tr></thead><tbody>'
      + per.map(x => '<tr' + (main ? ' class="row" data-dop="' + x.u.code + '"' : '') + '><td style="text-align:left;white-space:nowrap">' + esc(x.u.name) + '</td>' + x.p.map(v => '<td class="' + hc(v) + '">' + (v == null ? '-' : Math.round(v)) + '</td>').join('') + '<td>' + (x.slope > 3 ? '<span class="up">&#9650; rising</span>' : x.slope < -3 ? '<span class="down">&#9660; falling</span>' : '<span class="hint">steady</span>') + '</td></tr>').join('')
      + '</tbody></table></div><div class="hint">Green 100% or more, amber 80 to 99%, red below 80%, "-" no target.</div></div>';
    $('page').innerHTML = h;
    $('ccN').onchange = () => { C.n = Number($('ccN').value); cDash(); }; bindCF(cDash);
    document.querySelectorAll('#page [data-dop]').forEach(b => b.onclick = () => { op = b.dataset.dop; C.lane = ''; C.mgr = ''; go(); });
  }
  function cReport() {
    const ls = lanesF(), W = weeksBack(26), ws = C.rwk || (W.length > 1 ? W[W.length - 2] : W[0]); C.rwk = ws;
    const prev = addD(ws, -7), groups = {};
    ls.forEach(l => { const g = l.manager || '(no manager)'; (groups[g] = groups[g] || []).push(l); });
    const row = l => { const t = C.tmap[l.id + '|' + ymd(ws)] || 0, c = wkSum([l], ws), pc = wkSum([l], prev); return [l.operation, l.name, l.officer || '', t, c, t ? pct(c, t) : null, t ? c - t : null, pc, c - pc]; };
    const tr = r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td class="n">' + money0(r[3]) + '</td><td class="n">' + money0(r[4]) + '</td><td class="n">' + (r[5] == null ? '' : r[5] + '%') + '</td><td class="n">' + (r[6] == null ? '' : '<span class="' + (r[6] >= 0 ? 'up' : 'down') + '">' + money0(r[6]) + '</span>') + '</td><td class="n">' + money0(r[7]) + '</td><td class="n">' + (r[8] >= 0 ? '+' : '') + money0(r[8]) + '</td></tr>';
    const all = [];
    let body = '';
    Object.keys(groups).sort().forEach(g => { const rs = groups[g].map(row); all.push(...rs); const t = sumA(rs.map(r => r[3])), c = sumA(rs.map(r => r[4])); body += '<tr class="grp"><td colspan="3">' + esc(g) + '</td><td class="n">' + money0(t) + '</td><td class="n">' + money0(c) + '</td><td class="n">' + (t ? pct(c, t) + '%' : '') + '</td><td class="n">' + (t ? money0(c - t) : '') + '</td><td colspan="2"></td></tr>' + rs.map(tr).join(''); });
    const T = sumA(all.map(r => r[3])), Cc = sumA(all.map(r => r[4])), P = sumA(all.map(r => r[7]));
    $('page').innerHTML = '<div class="noprint row2">' + sel('ccRw', '', W.slice().reverse().map(w => [ymd(w), wkLabel(w) + ' (' + fmtD(w) + ' to ' + fmtD(addD(w, 6)) + ')']), ymd(ws)) + '<button class="btn p" id="rPrint">Print / Save as PDF</button><button class="btn" id="ccCsv">Download Excel (CSV)</button></div>'
      + '<h2 class="pt">Weekly collection report &middot; ' + wkLabel(ws) + '</h2><div class="hint">' + fmtD(ws) + ' to ' + fmtD(addD(ws, 6)) + ' ' + addD(ws, 6).getFullYear() + ' &middot; ' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' &middot; Iceman IMS</div>'
      + '<div class="grid"><div class="tile"><b>' + money0(T) + '</b><span>Target</span></div><div class="tile"><b>' + money0(Cc) + '</b><span>Collected</span></div><div class="tile ' + (Cc >= T ? 'g' : 'r') + '"><b>' + (T ? pct(Cc, T) + '%' : '-') + '</b><span>Achievement</span></div><div class="tile"><b>' + (Cc - P >= 0 ? '+' : '') + money0(Cc - P) + '</b><span>Change vs last week</span></div></div>'
      + '<div class="wrap"><table><thead><tr><th>Operation</th><th>Line</th><th>Officer</th><th class="n">Target</th><th class="n">Collected</th><th class="n">%</th><th class="n">Excess/(Short)</th><th class="n">Last week</th><th class="n">Change</th></tr></thead><tbody>' + body
      + '<tr class="tot"><td colspan="3">Total</td><td class="n">' + money0(T) + '</td><td class="n">' + money0(Cc) + '</td><td class="n">' + (T ? pct(Cc, T) + '%' : '') + '</td><td class="n">' + (T ? money0(Cc - T) : '') + '</td><td class="n">' + money0(P) + '</td><td class="n">' + money0(Cc - P) + '</td></tr></tbody></table></div>';
    $('ccRw').onchange = () => { C.rwk = pd($('ccRw').value); cReport(); };
    $('ccCsv').onclick = () => csvDl('Collection ' + wkLabel(ws) + ' ' + ymd(ws), ['Operation', 'Line', 'Officer', 'Target', 'Collected', 'Percent', 'Excess/(Short)', 'Last week', 'Change'], all);
  }
  function cCard(m) {
    setTimeout(async () => { try { await cLoad(); const ls = C.lanes.filter(l => l.active), ws = monday(new Date()), c = wkSum(ls, ws), t = wkTgt(ls, ws), el = document.getElementById('card-collection');
      if (el) el.innerHTML = '<b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + money0(c) + '</div><div class="hint">this week of ' + money0(t) + ' target' + (t ? ' (' + pct(c, t) + '%)' : '') + ' &middot; ' + ls.length + ' lines</div>'; } catch (e) {} }, 0);
    return '<div class="card mcard" data-mod="collection" data-go="items" id="card-collection"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">Loading...</div></div>';
  }

  // ================= CASH FLOW =================
  const CATS = ['Supplier', 'Salaries', 'Utilities', 'Rent', 'Transport', 'Loan / OD', 'Tax', 'Other'];
  const opsCF = need => opsFor('cashflow').filter(o => canF(o.code, need) && (!op || o.code === op));
  const outF = () => F.out.filter(o => !op || o.operation === op);
  const chqF = () => F.chq.filter(o => !op || o.operation === op);
  function fItems() {
    const subs = [['out', 'Outflow (payments)'], ['plan', 'Week plan (FM requirement, OD)'], ['chq', 'Cheques']];
    $('page').innerHTML = '<h2 class="pt">Cash Flow</h2><div class="subtabs">' + subs.map(s => '<button data-cfs="' + s[0] + '" class="' + (F.sub === s[0] ? 'on' : '') + '">' + s[1] + '</button>').join('') + '</div><div id="cfBody"></div>';
    document.querySelectorAll('[data-cfs]').forEach(b => b.onclick = () => { F.sub = b.dataset.cfs; fItems(); });
    ({out: fOut, plan: fPlan, chq: fChq})[F.sub]();
  }
  function fOut() {
    const eo = opsCF('edit'), to = F.to || ymd(new Date()), from = F.from || ymd(addD(new Date(), -30));
    const list = outF().filter(o => o.day >= from && o.day <= to);
    $('cfBody').innerHTML = (eo.length ? '<div class="card"><h3>Add a payment</h3><div class="row2"><input id="oDay" type="date" value="' + ymd(new Date()) + '">' + sel('oOp', '', eo.map(o => [o.code, o.code]), op || eo[0].code)
      + '<input id="oAcc" placeholder="Bank (e.g. DFCC ...0835)" style="width:170px"><input id="oPay" placeholder="Paid to"><select id="oCat">' + CATS.map(c => '<option>' + c + '</option>').join('') + '</select><input id="oAmt" type="number" step="0.01" placeholder="Amount" style="width:130px"><input id="oNote" placeholder="Note"><button class="btn p" id="oAdd">Add</button></div><div class="hint">Use a short bank label only, never the full account number.</div><div class="err" id="oMsg"></div></div>' : '')
      + '<div class="filters" style="margin-top:10px">From <input id="oFrom" type="date" value="' + from + '"> to <input id="oTo" type="date" value="' + to + '"><span class="hint">' + list.length + ' payments, ' + money0(sumA(list.map(o => o.amount))) + '</span></div>'
      + '<div class="wrap"><table><thead><tr><th>Date</th><th>Operation</th><th>Bank</th><th>Paid to</th><th>Category</th><th class="n">Amount</th><th>Note</th><th>By</th><th></th></tr></thead><tbody>'
      + list.map(o => '<tr><td>' + esc(o.day) + '</td><td>' + esc(o.operation) + '</td><td>' + esc(o.account || '') + '</td><td>' + esc(o.payee || '') + '</td><td>' + esc(o.category || '') + '</td><td class="n">' + money(o.amount) + '</td><td>' + esc(o.note || '') + '</td><td>' + esc(o.by_name || '') + '</td><td>' + (canF(o.operation, 'full') ? '<button class="btn d q" data-odel="' + o.id + '">Remove</button>' : '') + '</td></tr>').join('')
      + (list.length ? '' : '<tr><td colspan="9" class="hint">No payments in this period.</td></tr>') + '</tbody></table></div>';
    $('oFrom').onchange = () => { F.from = $('oFrom').value; fOut(); }; $('oTo').onchange = () => { F.to = $('oTo').value; fOut(); };
    if ($('oAdd')) $('oAdd').onclick = async () => {
      const a = Number($('oAmt').value); if (!a || a <= 0) { $('oMsg').textContent = 'Enter an amount'; return; }
      try { await api('/rest/v1/cf_outflow', {method: 'POST', body: {day: $('oDay').value, operation: $('oOp').value, account: $('oAcc').value.trim() || null, payee: $('oPay').value.trim() || null, category: $('oCat').value, amount: a, note: $('oNote').value.trim() || null}, headers: {Prefer: 'return=minimal'}}); await fLoad(true); fOut(); }
      catch (e) { $('oMsg').textContent = e.message; }
    };
    document.querySelectorAll('[data-odel]').forEach(b => b.onclick = async () => { try { await api('/rest/v1/cf_outflow?id=eq.' + b.dataset.odel, {method: 'PATCH', body: {deleted: true}, headers: {Prefer: 'return=minimal'}}); await fLoad(true); fOut(); } catch (e) { alert(e.message); } });
  }
  function fPlan() {
    const ws = F.wk || monday(new Date()); F.wk = ws; const vo = opsFor('cashflow').filter(o => !op || o.code === op), k = ymd(ws), hasC = opsFor('collection').length > 0;
    const rows = vo.map(o => { const w = F.week[o.code + '|' + k] || {}, ls = C.lanes.filter(l => l.operation === o.code && l.active); return {o, w, tg: hasC ? wkTgt(ls, ws) : null, col: hasC ? wkSum(ls, ws) : null, out: sumA(F.out.filter(x => x.operation === o.code && x.day >= k && x.day <= ymd(addD(ws, 6))).map(x => x.amount))}; });
    const inp = (o, f, v) => canF(o.code, 'edit') ? '<input class="tin" type="number" step="1" data-po="' + o.code + '" data-pf="' + f + '" value="' + (v == null ? '' : v) + '">' : (v == null ? '' : money0(v));
    $('cfBody').innerHTML = '<div class="wknav"><button class="btn" id="pPrev">&lsaquo; Previous week</button><b>' + wkLabel(ws) + ' &middot; ' + fmtD(ws) + ' to ' + fmtD(addD(ws, 6)) + '</b><button class="btn" id="pNext">Next week &rsaquo;</button><button class="btn" id="pNow">This week</button></div>'
      + '<div class="wrap"><table><thead><tr><th>Operation</th><th class="n">FM requirement</th><th class="n">Collection target</th><th class="n">Collected</th><th class="n">% of requirement</th><th class="n">Gap to requirement</th><th class="n">Payments</th><th class="n">Bank OD</th><th>Note</th></tr></thead><tbody>'
      + rows.map(r => '<tr><td><b>' + esc(r.o.code) + '</b> ' + esc(r.o.name) + '</td><td class="n">' + inp(r.o, 'fm_requirement', r.w.fm_requirement) + '</td><td class="n">' + (r.tg == null ? '' : money0(r.tg)) + '</td><td class="n">' + (r.col == null ? '' : money0(r.col)) + '</td><td class="n">' + (r.w.fm_requirement && r.col != null ? pct(r.col, r.w.fm_requirement) + '%' : '') + '</td><td class="n">' + (r.w.fm_requirement && r.col != null ? '<span class="' + (r.col - r.w.fm_requirement >= 0 ? 'up' : 'down') + '">' + money0(r.col - r.w.fm_requirement) + '</span>' : '') + '</td><td class="n">' + money0(r.out) + '</td><td class="n">' + inp(r.o, 'od_balance', r.w.od_balance) + '</td><td>' + (canF(r.o.code, 'edit') ? '<input data-po="' + r.o.code + '" data-pf="note" value="' + esc(r.w.note || '') + '">' : esc(r.w.note || '')) + '</td></tr>').join('')
      + '</tbody></table></div><div class="hint">FM requirement = the cash Finance needs from the operation this week; set it on Monday. Target and Collected come from Daily Collection.</div><div class="err" id="pMsg"></div>';
    $('pPrev').onclick = () => { F.wk = addD(ws, -7); fPlan(); }; $('pNext').onclick = () => { F.wk = addD(ws, 7); fPlan(); }; $('pNow').onclick = () => { F.wk = monday(new Date()); fPlan(); };
    document.querySelectorAll('[data-po]').forEach(i => i.onchange = async () => {
      const f = i.dataset.pf, v = f === 'note' ? (i.value.trim() || null) : (i.value === '' ? null : Number(i.value)), body = {operation: i.dataset.po, week_start: k}; body[f] = v;
      try { await api('/rest/v1/cf_week?on_conflict=operation,week_start', {method: 'POST', body, headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}}); const kk = i.dataset.po + '|' + k; F.week[kk] = Object.assign(F.week[kk] || {}, body); i.classList.add('ok'); $('pMsg').textContent = ''; setTimeout(fPlan, 400); }
      catch (e) { i.classList.add('bad'); $('pMsg').textContent = e.message; }
    });
  }
  const STC = {pending: 'Pending', realized: 'Realized', returned: 'Returned', cancelled: 'Cancelled'};
  function fChq() {
    const eo = opsCF('edit'), today = ymd(new Date()), list = chqF().filter(c => F.cst ? c.status === F.cst : c.status !== 'cancelled');
    const due = c => c.cheque_date && c.status === 'pending' ? Math.round((pd(c.cheque_date) - pd(today)) / 864e5) : null;
    $('cfBody').innerHTML = (eo.length ? '<div class="card"><h3>Add a cheque</h3><div class="row2">' + sel('qOp', '', eo.map(o => [o.code, o.code]), op || eo[0].code) + '<select id="qDir"><option value="out">Issued by us</option><option value="in">Received</option></select><input id="qParty" placeholder="Party (e.g. Plenty Foods)"><input id="qNo" placeholder="Cheque no" style="width:110px"><label class="hint">Invoice <input id="qInv" type="date"></label><label class="hint">Cheque date <input id="qDate" type="date"></label><input id="qAmt" type="number" step="0.01" placeholder="Amount" style="width:130px"><button class="btn p" id="qAdd">Add</button></div><div class="err" id="qMsg"></div></div>' : '')
      + '<div class="filters" style="margin-top:10px">' + sel('qSt', 'Open (not cancelled)', Object.keys(STC).map(k => [k, STC[k]]), F.cst || '') + '<span class="hint">' + list.length + ' cheques, ' + money0(sumA(list.map(c => c.amount))) + '</span></div>'
      + '<div class="wrap"><table><thead><tr><th>Operation</th><th>Type</th><th>Party</th><th>Cheque no</th><th>Invoice date</th><th>Cheque date</th><th class="n">Days left</th><th class="n">Amount</th><th>Status</th><th>Realized</th></tr></thead><tbody>'
      + list.map(c => { const d = due(c), e = canF(c.operation, 'edit'); return '<tr><td>' + esc(c.operation) + '</td><td>' + (c.direction === 'in' ? 'Received' : 'Issued') + '</td><td>' + esc(c.party) + '</td><td>' + esc(c.cheque_no || '') + '</td><td>' + esc(c.invoice_date || '') + '</td><td>' + esc(c.cheque_date || '') + '</td><td class="n">' + (d == null ? '' : '<span class="' + (d <= 3 ? 'down' : '') + '">' + d + '</span>') + '</td><td class="n">' + money(c.amount) + '</td><td>'
        + (e ? '<select data-qs="' + c.id + '">' + Object.keys(STC).map(k => '<option value="' + k + '"' + (k === c.status ? ' selected' : '') + '>' + STC[k] + '</option>').join('') + '</select>' : STC[c.status]) + '</td><td>' + (e ? '<input type="date" data-qr="' + c.id + '" value="' + esc(c.realized_date || '') + '">' : esc(c.realized_date || '')) + '</td></tr>'; }).join('')
      + (list.length ? '' : '<tr><td colspan="10" class="hint">No cheques.</td></tr>') + '</tbody></table></div><div class="err" id="qMsg2"></div>';
    $('qSt').onchange = () => { F.cst = $('qSt').value; fChq(); };
    if ($('qAdd')) $('qAdd').onclick = async () => {
      const a = Number($('qAmt').value); if (!a || !$('qParty').value.trim()) { $('qMsg').textContent = 'Enter the party and the amount'; return; }
      try { await api('/rest/v1/cf_cheques', {method: 'POST', body: {operation: $('qOp').value, direction: $('qDir').value, party: $('qParty').value.trim(), cheque_no: $('qNo').value.trim() || null, invoice_date: $('qInv').value || null, cheque_date: $('qDate').value || null, amount: a}, headers: {Prefer: 'return=minimal'}}); await fLoad(true); fChq(); }
      catch (e) { $('qMsg').textContent = e.message; }
    };
    const patch = async (id, body) => { try { await api('/rest/v1/cf_cheques?id=eq.' + id, {method: 'PATCH', body, headers: {Prefer: 'return=minimal'}}); await fLoad(true); fChq(); } catch (e) { $('qMsg2').textContent = e.message; } };
    document.querySelectorAll('[data-qs]').forEach(s => s.onchange = () => patch(s.dataset.qs, s.value === 'realized' && !F.chq.find(c => c.id === s.dataset.qs).realized_date ? {status: s.value, realized_date: today} : {status: s.value}));
    document.querySelectorAll('[data-qr]').forEach(s => s.onchange = () => patch(s.dataset.qr, {realized_date: s.value || null}));
  }
  function fDash() {
    const W = weeksBack(F.n), vo = opsFor('cashflow').filter(o => !op || o.code === op).map(o => o.code), hasC = opsFor('collection').length > 0;
    const ls = C.lanes.filter(l => l.active && vo.includes(l.operation));
    const outW = W.map(ws => sumA(outF().filter(x => x.day >= ymd(ws) && x.day <= ymd(addD(ws, 6))).map(x => x.amount)));
    const inW = W.map(ws => hasC ? wkSum(ls, ws) : 0), tgW = W.map(ws => hasC ? wkTgt(ls, ws) : 0);
    const fmW = W.map(ws => sumA(vo.map(o => (F.week[o + '|' + ymd(ws)] || {}).fm_requirement || 0)));
    const odW = W.map(ws => { const v = vo.map(o => (F.week[o + '|' + ymd(ws)] || {}).od_balance).filter(x => x != null); return v.length ? sumA(v) : null; });
    const today = ymd(new Date()), pend = chqF().filter(c => c.status === 'pending'), soon = pend.filter(c => c.cheque_date && c.cheque_date <= ymd(addD(new Date(), 14))).sort((a, b) => a.cheque_date < b.cheque_date ? -1 : 1);
    const cur = W.length - 1, gapW = W.map((_, i) => fmW[i] ? inW[i] - fmW[i] : null);
    const cats = {}; outF().filter(x => x.day >= ymd(W[0])).forEach(x => cats[x.category || 'Other'] = (cats[x.category || 'Other'] || 0) + Number(x.amount));
    const pOpts = [[4, 'Last 4 weeks'], [8, 'Last 8 weeks'], [13, 'Last 13 weeks'], [26, 'Last 26 weeks'], [52, 'Last 52 weeks']];
    const under = W.filter((_, i) => fmW[i] && tgW[i] && tgW[i] < fmW[i]).length;
    $('page').innerHTML = '<h2 class="pt">Cash Flow dashboard</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + (hasC ? '' : ' &middot; you have no Daily Collection access, so inflow is not shown') + '</div><div class="filters">' + sel('cfN', '', pOpts, F.n) + '</div>'
      + '<div class="grid"><div class="tile"><b>' + money0(sumA(inW)) + '</b><span>Collected (period)</span></div><div class="tile r"><b>' + money0(sumA(outW)) + '</b><span>Payments (period)</span></div><div class="tile ' + (sumA(inW) - sumA(outW) >= 0 ? 'g' : 'r') + '"><b>' + money0(sumA(inW) - sumA(outW)) + '</b><span>Net cash (period)</span></div>'
      + '<div class="tile a"><b>' + money0(fmW[cur]) + '</b><span>FM requirement this week (collected ' + money0(inW[cur]) + ')</span></div><div class="tile ' + (soon.length ? 'a' : 'g') + '"><b>' + soon.length + ' &middot; ' + money0(sumA(soon.map(c => c.amount))) + '</b><span>Cheques due in 14 days</span></div></div>'
      + '<div class="card" style="margin-bottom:12px"><h3>What the figures say</h3>'
      + (under ? '<div class="ins r">In <b>' + under + '</b> of ' + W.length + ' weeks the collection target was set <b>below</b> the FM requirement, so meeting the target still leaves Finance short.</div>' : '<div class="ins g">No week with a target below the FM requirement (where both are set).</div>')
      + (outW.some((v, i) => v > inW[i]) ? '<div class="ins a">Payments were higher than collections in <b>' + outW.filter((v, i) => v > inW[i]).length + '</b> week(s).</div>' : '')
      + (soon.length ? '<div class="ins a">Next cheque: <b>' + esc(soon[0].party) + '</b> ' + money0(soon[0].amount) + ' on ' + esc(soon[0].cheque_date) + '.</div>' : '') + '</div>'
      + '<div class="grid2"><div class="card"><h3>Collections vs payments by week</h3>' + svgLines(W.map(wkLabel), [{name: 'Collected', v: inW, cls: 's1'}, {name: 'Payments', v: outW, cls: 's2'}, {name: 'FM requirement', v: fmW.map(v => v || null), cls: 's3'}]) + legend([['Collected', 'var(--primary)'], ['Payments', 'var(--accent)'], ['FM requirement', 'var(--ok)']]) + '</div>'
      + '<div class="card"><h3>Gap: collected minus FM requirement</h3>' + svgLines(W.map(wkLabel), [{name: 'Gap', v: gapW, cls: 's1'}]) + '<div class="hint">' + W.map((w, i) => gapW[i] == null ? '' : wkLabel(w) + ': <span class="' + (gapW[i] >= 0 ? 'up' : 'down') + '">' + money0(gapW[i]) + '</span>').filter(Boolean).slice(-8).join(' &middot; ') + '</div></div>'
      + '<div class="card"><h3>Bank OD balance by week</h3>' + svgLines(W.map(wkLabel), [{name: 'OD', v: odW, cls: 's2'}]) + '</div>'
      + '<div class="card"><h3>Payments by category (period)</h3>' + bars(Object.entries(cats).sort((a, b) => b[1] - a[1]), money0) + '</div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Cheques due in the next 14 days</h3>' + (soon.length ? '<table><thead><tr><th>Date</th><th>Party</th><th>Operation</th><th class="n">Amount</th></tr></thead><tbody>' + soon.map(c => '<tr><td>' + esc(c.cheque_date) + '</td><td>' + esc(c.party) + '</td><td>' + esc(c.operation) + '</td><td class="n">' + money(c.amount) + '</td></tr>').join('') + '</tbody></table>' : '<div class="hint">None.</div>') + '</div>';
    $('cfN').onchange = () => { F.n = Number($('cfN').value); fDash(); };
  }
  function fReport() {
    const W = weeksBack(26), ws = F.rwk || W[W.length - 1]; F.rwk = ws; const k = ymd(ws), e = ymd(addD(ws, 6)), hasC = opsFor('collection').length > 0;
    const rs = opsFor('cashflow').filter(o => !op || o.code === op).map(o => { const w = F.week[o.code + '|' + k] || {}, ls = C.lanes.filter(l => l.operation === o.code && l.active), tg = hasC ? wkTgt(ls, ws) : 0, col = hasC ? wkSum(ls, ws) : 0, out = sumA(F.out.filter(x => x.operation === o.code && x.day >= k && x.day <= e).map(x => x.amount)); return [o.code, w.fm_requirement || 0, tg, col, w.fm_requirement ? pct(col, w.fm_requirement) : null, tg ? pct(col, tg) : null, out, col - out, w.od_balance == null ? '' : w.od_balance]; });
    const tot = i => sumA(rs.map(r => Number(r[i]) || 0));
    $('page').innerHTML = '<div class="noprint row2">' + sel('cfRw', '', W.slice().reverse().map(w => [ymd(w), wkLabel(w) + ' (' + fmtD(w) + ' to ' + fmtD(addD(w, 6)) + ')']), k) + '<button class="btn p" id="rPrint">Print / Save as PDF</button><button class="btn" id="cfCsv">Download Excel (CSV)</button></div>'
      + '<h2 class="pt">Weekly cash report &middot; ' + wkLabel(ws) + '</h2><div class="hint">' + fmtD(ws) + ' to ' + fmtD(addD(ws, 6)) + ' &middot; Iceman IMS</div>'
      + '<div class="wrap"><table><thead><tr><th>Operation</th><th class="n">FM requirement</th><th class="n">Target</th><th class="n">Collected</th><th class="n">% of requirement</th><th class="n">% of target</th><th class="n">Payments</th><th class="n">Net</th><th class="n">Bank OD</th></tr></thead><tbody>'
      + rs.map(r => '<tr><td>' + esc(r[0]) + '</td><td class="n">' + money0(r[1]) + '</td><td class="n">' + money0(r[2]) + '</td><td class="n">' + money0(r[3]) + '</td><td class="n">' + (r[4] == null ? '' : r[4] + '%') + '</td><td class="n">' + (r[5] == null ? '' : r[5] + '%') + '</td><td class="n">' + money0(r[6]) + '</td><td class="n"><span class="' + (r[7] >= 0 ? 'up' : 'down') + '">' + money0(r[7]) + '</span></td><td class="n">' + (r[8] === '' ? '' : money0(r[8])) + '</td></tr>').join('')
      + '<tr class="tot"><td>Total</td><td class="n">' + money0(tot(1)) + '</td><td class="n">' + money0(tot(2)) + '</td><td class="n">' + money0(tot(3)) + '</td><td class="n">' + (tot(1) ? pct(tot(3), tot(1)) + '%' : '') + '</td><td class="n">' + (tot(2) ? pct(tot(3), tot(2)) + '%' : '') + '</td><td class="n">' + money0(tot(6)) + '</td><td class="n">' + money0(tot(7)) + '</td><td class="n">' + money0(tot(8)) + '</td></tr></tbody></table></div>';
    $('cfRw').onchange = () => { F.rwk = pd($('cfRw').value); fReport(); };
    $('cfCsv').onclick = () => csvDl('Cash ' + wkLabel(ws) + ' ' + k, ['Operation', 'FM requirement', 'Target', 'Collected', '% of requirement', '% of target', 'Payments', 'Net', 'Bank OD'], rs);
  }
  function fCard(m) {
    setTimeout(async () => { try { await fLoad(); const ws = ymd(monday(new Date())), out = sumA(F.out.filter(x => x.day >= ws).map(x => x.amount)), soon = F.chq.filter(c => c.status === 'pending' && c.cheque_date && c.cheque_date <= ymd(addD(new Date(), 7))), el = document.getElementById('card-cashflow');
      if (el) el.innerHTML = '<b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + money0(out) + '</div><div class="hint">paid this week &middot; ' + soon.length + ' cheque(s) due in 7 days</div>'; } catch (e) {} }, 0);
    return '<div class="card mcard" data-mod="cashflow" data-go="items" id="card-cashflow"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">Loading...</div></div>';
  }

  window.MODULE_PAGES = {
    collection: {items: () => run(cLoad, cEntry), dash: () => run(cLoad, cDash), report: () => run(cLoad, cReport), card: cCard}
  };
})();
