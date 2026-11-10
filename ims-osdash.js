// Iceman IMS - Outstanding decision dashboard for the Admin and the Director (v4.3, 2026-11-10, Oshan).
// Replaces the Outstanding "Dashboard" tab for Admin / Director / all-module viewers; everyone else keeps the old dashboard.
//   1. Key figures with the change since last week
//   2. Trend: open balance, 91-120 and Over 120, week by week (rebuilt from each invoice's first-seen / closed dates and invoice date)
//   3. Weekly movement: new balance added by list uploads vs balance settled
//   4. Coming risk: balance that turns Over 120 in each of the next 12 weeks (with the running total)
//   5. Ageing mix by operation (share of balance in each age band)
//   6. Top customers (Pareto) and sales reps
//   7. "Decisions needed": the points the Director should act on, each opens the matching Follow-up list
// Loaded before the main script; uses its globals at run time (rows, myRows, isActive, isO120, op, ops, opsFor, me, access, esc, money, money0, sum, F, go, pgDash, modOf, mod).
(function () {
  const DAY = 864e5;
  const isBoard = () => !!me && (me.role === 'admin' || (access || []).some(a => a.module === '*') || /director/i.test(me.job_title || ''));
  const dOf = s => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? null : d; };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const fmtD = d => d.toLocaleDateString('en-GB', {day: '2-digit', month: 'short'});
  const mn = v => { const a = Math.abs(v); return (v < 0 ? '-' : '') + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + ' Mn' : a >= 1e3 ? Math.round(a / 1e3) + ' K' : Math.round(a)); };
  const pct = (a, b) => b ? Math.round(a * 1000 / b) / 10 : 0;
  const amt = r => Number(r.amount || 0);
  const closedAt = r => (!isActive(r) && r.status === 'settled') ? dOf(r.closed_at || r.updated_at) : null;
  const ageAt = (r, d) => { const b = dOf(r.base_date); return b ? Math.round((d - b) / DAY) : (isO120(r) ? 999 : 0); };
  const openAt = (r, d) => { const f = dOf(r.first_seen) || dOf(r.created_at); if (!f || f > d) return false; if (isActive(r)) return true; const c = dOf(r.closed_at || r.updated_at); return !!c && c > d; };

  // ---------- small SVG charts (theme colours from the page tokens) ----------
  const W = 640, H = 230, P = {l: 52, r: 14, t: 14, b: 34};
  const yScale = (mx) => { const step = Math.pow(10, Math.floor(Math.log10(Math.max(mx, 1)))); const top = Math.ceil(mx / step) * step || 1; return {top, ticks: [0, .25, .5, .75, 1].map(f => f * top)}; };
  function axes(top, ticks, labels, x) {
    let s = ticks.map(v => { const y = P.t + (H - P.t - P.b) * (1 - v / top); return '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/><text x="' + (P.l - 6) + '" y="' + (y + 4) + '" text-anchor="end" class="osd-ax">' + mn(v) + '</text>'; }).join('');
    const every = Math.ceil(labels.length / 8);
    s += labels.map((l, i) => i % every && i !== labels.length - 1 ? '' : '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" class="osd-ax">' + esc(l) + '</text>').join('');
    return s;
  }
  function lineChart(labels, series) {
    const mx = Math.max(1, ...series.flatMap(s => s.v)), {top, ticks} = yScale(mx), n = labels.length;
    const x = i => n === 1 ? (P.l + W - P.r) / 2 : P.l + (W - P.l - P.r) * i / (n - 1), y = v => P.t + (H - P.t - P.b) * (1 - v / top);
    let s = axes(top, ticks, labels, x);
    series.forEach(se => {
      const pts = se.v.map((v, i) => x(i) + ',' + y(v)).join(' ');
      if (se.fill) s += '<polygon points="' + x(0) + ',' + y(0) + ' ' + pts + ' ' + x(n - 1) + ',' + y(0) + '" fill="' + se.c + '" opacity=".12"/>';
      s += '<polyline points="' + pts + '" fill="none" stroke="' + se.c + '" stroke-width="2.5" stroke-linejoin="round"/>';
      s += se.v.map((v, i) => '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3.5" fill="' + se.c + '"><title>' + esc(se.n + ' · ' + labels[i] + ': Rs ' + money0(v)) + '</title></circle>').join('');
    });
    return svg(s) + legend(series);
  }
  function barChart(labels, series, line) {
    const mx = Math.max(1, ...series.flatMap(s => s.v), ...(line ? line.v : [])), {top, ticks} = yScale(mx), n = labels.length, gw = (W - P.l - P.r) / n, bw = Math.min(22, (gw - 6) / series.length);
    const x = i => P.l + gw * i + gw / 2, y = v => P.t + (H - P.t - P.b) * (1 - v / top);
    let s = axes(top, ticks, labels, x);
    series.forEach((se, k) => se.v.forEach((v, i) => { const bx = x(i) - bw * series.length / 2 + bw * k; s += '<rect x="' + bx + '" y="' + y(v) + '" width="' + (bw - 2) + '" height="' + Math.max(0, y(0) - y(v)) + '" rx="2" fill="' + se.c + '"><title>' + esc(se.n + ' · ' + labels[i] + ': Rs ' + money0(v)) + '</title></rect>'; }));
    if (line) { s += '<polyline points="' + line.v.map((v, i) => x(i) + ',' + y(v)).join(' ') + '" fill="none" stroke="' + line.c + '" stroke-width="2.5" stroke-dasharray="5 4"/>' + line.v.map((v, i) => '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="' + line.c + '"><title>' + esc(line.n + ' · ' + labels[i] + ': Rs ' + money0(v)) + '</title></circle>').join(''); }
    return svg(s) + legend(series.concat(line ? [line] : []));
  }
  const svg = s => '<svg viewBox="0 0 ' + W + ' ' + H + '" class="osd-svg" role="img">' + s + '</svg>';
  const legend = ss => '<div class="osd-leg">' + ss.map(s => '<span><i style="background:' + s.c + '"></i>' + esc(s.n) + '</span>').join('') + '</div>';
  function stack100(rowsA, bands) {
    return '<div class="osd-stk">' + rowsA.map(r => { const t = r.v.reduce((a, b) => a + b, 0) || 1;
      return '<div class="osd-sr" data-osd="op:' + esc(r.k) + '" title="Open ' + esc(r.k) + '"><span class="osd-sl">' + esc(r.k) + '</span><span class="osd-sb">' + r.v.map((v, i) => v ? '<i style="width:' + (v * 100 / t) + '%;background:' + bands[i].c + '" title="' + esc(bands[i].n + ': Rs ' + money0(v) + ' (' + pct(v, t) + '%)') + '"></i>' : '').join('') + '</span><span class="osd-sv">' + mn(t) + '<small>' + pct(r.v[2] + r.v[3], t) + '% >120</small></span></div>'; }).join('') + '</div>' + legend(bands);
  }

  // ---------- figures ----------
  function compute() {
    const all = myRows(), act = all.filter(isActive), t = today();
    const first = all.map(r => dOf(r.first_seen)).filter(Boolean).sort((a, b) => a - b)[0] || t;
    // week ends (Sundays) from the first list to today, at most 12, plus today
    const ends = []; let d = new Date(t); d.setDate(d.getDate() - ((d.getDay() + 7) % 7)); // last Sunday
    while (d >= first && ends.length < 12) { ends.unshift(new Date(d)); d = new Date(d - 7 * DAY); }
    if (!ends.length || ends[ends.length - 1] < t) ends.push(t);
    const trend = ends.map(e => { const o = all.filter(r => openAt(r, e)); let tot = 0, b91 = 0, o120 = 0; o.forEach(r => { const a = ageAt(r, e), v = amt(r); tot += v; if (a > 120) o120 += v; else if (a > 90) b91 += v; }); return {e, tot, b91, o120}; });
    // weekly movement (Mon..Sun) for the same weeks
    const wk = ends.map(e => { const s = new Date(e - 6 * DAY); s.setHours(0, 0, 0, 0); const ee = new Date(e.getTime() + DAY - 1);
      return {lab: fmtD(s), add: sum(all.filter(r => { const f = dOf(r.first_seen); return f && f >= s && f <= ee; })), set: sum(all.filter(r => { const c = closedAt(r); return c && c >= s && c <= ee; }))}; });
    // coming risk: balance that turns Over 120 in each of the next 12 weeks
    const fw = []; let run = 0;
    for (let i = 0; i < 12; i++) { const a = i * 7 + 1, b = i * 7 + 7; const v = sum(act.filter(r => r.aging_days != null && r.aging_days <= 120 && r.days_to_120 >= a && r.days_to_120 <= b)); run += v; const s = new Date(t.getTime() + a * DAY); fw.push({lab: fmtD(s), v, run}); }
    return {all, act, trend, wk, fw, first};
  }

  function decisions(c) {
    const act = c.act, out = [];
    const o120 = act.filter(isO120), nr120 = o120.filter(r => !r.reason);
    if (nr120.length) out.push({lvl: 'r', t: 'Over 120 with no reason: Rs ' + money0(sum(nr120)) + ' (' + nr120.length + ' invoices)', d: 'Officers must give a reason and a next step before any recovery decision. Ask the Operation Head to finish these this week.', a: 'flag:incomplete|bucket:120', b: 'Open list'});
    const soon = act.filter(r => r.aging_days != null && r.aging_days <= 120 && r.days_to_120 > 0 && r.days_to_120 <= 14);
    if (soon.length) out.push({lvl: 'a', t: 'Turns Over 120 in the next 14 days: Rs ' + money0(sum(soon)) + ' (' + soon.length + ' invoices)', d: 'Cheapest money to save: collect these before they age. Priority list for reps and the collection officer.', a: 'flag:soon', b: 'Open list'});
    const byCust = {}; act.forEach(r => { const k = r.outlet || r.party || '(none)'; const x = byCust[k] = byCust[k] || {k, op: r.operation, rep: r.owner_name, o60: 0, max: 0, tot: 0}; x.tot += amt(r); if ((r.aging_days || 0) > 60) x.o60 += amt(r); x.max = Math.max(x.max, r.aging_days || 0); });
    const stop = Object.values(byCust).filter(x => x.o60 > 0).sort((a, b) => b.o60 - a.o60);
    if (stop.length) out.push({lvl: 'r', t: 'Stop-supply rule (over 60 days): ' + stop.length + ' customers, Rs ' + money0(sum(stop.map(x => ({amount: x.o60})))) + ' over 60 days', d: 'Top: ' + stop.slice(0, 5).map(x => esc(x.k) + ' (' + mn(x.o60) + ')').join(', ') + '. Decide: hold supply, part-payment plan, or exception with a date.', a: 'bucket:60', b: 'Open list'});
    const exr = act.filter(r => /rep left|settled from/i.test(r.reason || '') || /^no rep$/i.test(r.owner_name || '') || !r.owner_name);
    if (exr.length) out.push({lvl: 'a', t: 'No active rep (ex-rep, "No Rep" or blank): Rs ' + money0(sum(exr)) + ' (' + exr.length + ' invoices)', d: 'Nobody is chasing these. Hand them over to a rep or the collection officer (Rep handover), or send them for legal / write-off review.', a: 'rep:', b: 'Open list'});
    const pb = act.filter(r => r.promise_broken);
    if (pb.length) out.push({lvl: 'r', t: 'Promises broken: Rs ' + money0(sum(pb)) + ' (' + pb.length + ')', d: 'Customer promised a date and did not pay. Escalate: call by the Operation Head, then demand letter.', a: 'flag:broken', b: 'Open list'});
    const ov = act.filter(r => r.action_overdue);
    if (ov.length) out.push({lvl: 'a', t: 'Next action overdue: ' + ov.length + ' invoices, Rs ' + money0(sum(ov)), d: 'Follow-up dates have passed with no update. Check the officers concerned at the weekly meeting.', a: 'flag:overdue', b: 'Open list'});
    const tr = c.trend; if (tr.length >= 2) { const a = tr[tr.length - 2], b = tr[tr.length - 1]; if (b.o120 > a.o120) out.push({lvl: 'r', t: 'Over 120 went up by Rs ' + money0(b.o120 - a.o120) + ' since ' + fmtD(a.e), d: 'More balance is ageing than is being collected. Look at the coming-risk chart and the reps with the highest Over 120 share.'}); }
    return out;
  }

  function page() {
    if (!isBoard()) return pgDash();
    const c = compute(), act = c.act, T = c.trend, last = T[T.length - 1], prev = T.length > 1 ? T[T.length - 2] : null;
    const o120 = sum(act.filter(isO120)), o90 = sum(act.filter(r => (r.aging_days || 0) > 90)), noR = act.filter(r => !r.reason);
    const s30 = sum(c.all.filter(r => { const d = closedAt(r); return d && d >= new Date(today() - 30 * DAY); }));
    const soon30 = sum(act.filter(r => r.aging_days != null && r.aging_days <= 120 && r.days_to_120 > 0 && r.days_to_120 <= 30));
    const delta = (now, was, bad) => was == null ? '' : '<em class="' + ((now - was > 0) === bad ? 'up' : 'dn') + '">' + (now - was >= 0 ? '▲ ' : '▼ ') + mn(Math.abs(now - was)) + ' vs ' + fmtD(prev.e) + '</em>';
    const tiles = [
      ['', 'Rs ' + mn(sum(act)), 'Open balance · ' + act.length + ' invoices', prev ? delta(last.tot, prev.tot, true) : ''],
      ['r', 'Rs ' + mn(o120), 'Over 120 days · ' + pct(o120, sum(act)) + '% of balance', prev ? delta(last.o120, prev.o120, true) : ''],
      ['a', 'Rs ' + mn(o90), 'Over 90 days · ' + pct(o90, sum(act)) + '%', ''],
      ['a', 'Rs ' + mn(soon30), 'Turns Over 120 within 30 days', ''],
      ['g', 'Rs ' + mn(s30), 'Settled in the last 30 days', ''],
      [noR.length ? 'r' : 'g', pct(sum(noR), sum(act)) + '%', 'Balance with no reason yet · ' + noR.length + ' invoices', '']];
    const opsList = [...new Set(act.map(r => r.operation))];
    const bands = [{n: '0-90', c: 'var(--ok)'}, {n: '91-120', c: 'var(--accent)'}, {n: '121-240', c: 'var(--danger)'}, {n: 'Over 240', c: 'var(--violet)'}];
    const mix = opsList.map(o => { const a = act.filter(r => r.operation === o), v = [0, 0, 0, 0]; a.forEach(r => { const g = r.aging_days == null ? (isO120(r) ? 2 : 0) : r.aging_days > 240 ? 3 : r.aging_days > 120 ? 2 : r.aging_days > 90 ? 1 : 0; v[g] += amt(r); }); return {k: o, v}; })
      .sort((a, b) => (b.v[2] + b.v[3]) / (b.v.reduce((x, y) => x + y, 0) || 1) - (a.v[2] + a.v[3]) / (a.v.reduce((x, y) => x + y, 0) || 1));
    // Pareto by customer
    const cust = {}; act.forEach(r => { const k = r.outlet || r.party || '(none)'; const x = cust[k] = cust[k] || {k, op: r.operation, tot: 0, o120: 0}; x.tot += amt(r); if (isO120(r)) x.o120 += amt(r); });
    const cl = Object.values(cust).sort((a, b) => b.tot - a.tot), grand = sum(act) || 1; let cum = 0;
    const top = cl.slice(0, 12).map(x => { cum += x.tot; return Object.assign(x, {cum: pct(cum, grand)}); }), mxc = Math.max(1, ...top.map(x => x.tot));
    const n80 = (() => { let s = 0, i = 0; for (; i < cl.length && s < grand * .8; i++) s += cl[i].tot; return i; })();
    // reps
    const rp = {}; act.forEach(r => { const k = r.owner_name || '(no rep)'; const x = rp[k] = rp[k] || {k, tot: 0, o120: 0, nr: 0, pb: 0, n: 0}; x.tot += amt(r); x.n++; if (isO120(r)) x.o120 += amt(r); if (!r.reason) x.nr++; if (r.promise_broken) x.pb++; });
    const reps = Object.values(rp).sort((a, b) => b.tot - a.tot).slice(0, 12), mxr = Math.max(1, ...reps.map(x => x.tot));
    const dec = decisions(c);

    $('page').innerHTML = '<div class="row2" style="justify-content:space-between;align-items:flex-end"><div><h2 class="pt">Outstanding · decision dashboard</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' · active invoices · trend since ' + fmtD(c.first) + ' (first list in IMS)</div></div>'
      + '<div class="row2"><button class="btn q" data-osd="classic">Detail view</button></div></div>'
      + '<div class="osd-tiles">' + tiles.map(t => '<div class="tile ' + t[0] + '"><b>' + t[1] + '</b><span>' + t[2] + '</span>' + (t[3] || '') + '</div>').join('') + '</div>'
      + '<div class="card osd-dec"><h3>Decisions needed</h3>' + (dec.length ? dec.map(d => '<div class="osd-d ' + d.lvl + '"><div><b>' + d.t + '</b><div class="hint">' + d.d + '</div></div>' + (d.a ? '<button class="btn q" data-osd="' + esc(d.a) + '">' + d.b + '</button>' : '') + '</div>').join('') : '<div class="hint">Nothing urgent.</div>') + '</div>'
      + '<div class="osd-grid">'
      + '<div class="card"><h3>Balance trend · week by week</h3>' + lineChart(T.map(x => fmtD(x.e)), [{n: 'Open balance', c: 'var(--primary)', v: T.map(x => x.tot), fill: true}, {n: '91-120 days', c: 'var(--accent)', v: T.map(x => x.b91)}, {n: 'Over 120 days', c: 'var(--danger)', v: T.map(x => x.o120)}]) + '<div class="hint">Each point is the open balance at the end of that week (invoice age on that day). The line grows as weekly lists are uploaded.</div></div>'
      + '<div class="card"><h3>Weekly movement · added vs settled</h3>' + barChart(c.wk.map(x => x.lab), [{n: 'New balance (list uploads)', c: 'var(--accent)', v: c.wk.map(x => x.add)}, {n: 'Settled', c: 'var(--ok)', v: c.wk.map(x => x.set)}]) + '<div class="hint">Settled higher than new = the book is getting smaller.</div></div>'
      + '<div class="card"><h3>Coming risk · turns Over 120 in the next 12 weeks</h3>' + barChart(c.fw.map(x => x.lab), [{n: 'Turns Over 120 that week', c: 'var(--accent)', v: c.fw.map(x => x.v)}], {n: 'Running total', c: 'var(--danger)', v: c.fw.map(x => x.run)}) + '<div class="hint">Collect the early weeks first: after that week the invoice counts as Over 120.</div></div>'
      + '<div class="card"><h3>Ageing mix by operation</h3>' + stack100(mix, bands) + '<div class="hint">Worst first (highest share over 120). Tap an operation to open it.</div></div>'
      + '<div class="card"><h3>Top customers · ' + n80 + ' of ' + cl.length + ' make 80% of the balance</h3><div class="osd-tbl">' + top.map(x => '<div class="osd-tr" data-osd="outlet:' + esc(x.k) + '"><span class="osd-tn" title="' + esc(x.k) + '">' + esc(x.k) + (!op ? ' <small>' + esc(x.op) + '</small>' : '') + '</span><span class="osd-tb"><i style="width:' + (x.tot * 100 / mxc) + '%"></i><i class="r" style="width:' + (x.o120 * 100 / mxc) + '%"></i></span><span class="osd-tv">' + mn(x.tot) + '</span><span class="osd-tc">' + x.cum + '%</span></div>').join('') + '</div><div class="hint">Bar = balance, red part = Over 120, last column = running share of all balance.</div></div>'
      + '<div class="card"><h3>Sales reps · balance and Over 120 share</h3><div class="osd-tbl">' + reps.map(x => '<div class="osd-tr" data-osd="rep:' + esc(x.k) + '"><span class="osd-tn" title="' + esc(x.k) + '">' + esc(x.k) + '</span><span class="osd-tb"><i style="width:' + (x.tot * 100 / mxr) + '%"></i><i class="r" style="width:' + (x.o120 * 100 / mxr) + '%"></i></span><span class="osd-tv">' + mn(x.tot) + '</span><span class="osd-tc ' + (pct(x.o120, x.tot) > 30 ? 'bad' : '') + '">' + pct(x.o120, x.tot) + '%</span></div>').join('') + '</div><div class="hint">Last column = share of the rep\'s balance that is Over 120. Tap a rep to open the list.</div></div>'
      + '</div>';
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-osd]'); if (!b) return;
    const v = b.dataset.osd;
    if (v === 'classic') { pgDash(); return; }
    F = {chain: '', outlet: '', rep: '', reason: '', bucket: '', status: 'active', flag: '', text: ''};
    v.split('|').forEach(p => { const i = p.indexOf(':'), k = p.slice(0, i), val = p.slice(i + 1);
      if (k === 'op') { if (ops.some(o => o.code === val)) op = val; } else if (k in F) F[k] = val; });
    go('items', 'receivable');
  });

  const css = document.createElement('style');
  css.textContent = '.osd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:12px 0}.osd-tiles .tile em{display:block;font-style:normal;font-size:11.5px;margin-top:4px}.osd-tiles em.up{color:var(--danger)}.osd-tiles em.dn{color:var(--ok)}'
    + '.osd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px;margin-top:12px}@media(max-width:520px){.osd-grid{grid-template-columns:minmax(0,1fr)}}.osd-grid .card{min-width:0}'
    + '.osd-svg{width:100%;height:auto;display:block}.osd-ax{font-size:10.5px;fill:var(--muted)}.osd-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin-top:4px}.osd-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}'
    + '.osd-dec .osd-d{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:9px 10px;border-left:4px solid var(--line2);background:var(--surface2);border-radius:8px;margin-top:8px}.osd-d.r{border-color:var(--danger)}.osd-d.a{border-color:var(--accent)}.osd-d .btn{flex:none}'
    + '.osd-stk{display:grid;gap:7px;margin-top:6px}.osd-sr{display:grid;grid-template-columns:52px minmax(0,1fr) 92px;gap:8px;align-items:center;cursor:pointer}.osd-sl{font-weight:700;font-size:12.5px}.osd-sb{display:flex;height:16px;border-radius:5px;overflow:hidden;background:var(--surface2)}.osd-sb i{display:block;height:100%}.osd-sv{text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums}.osd-sv small{display:block;color:var(--muted);font-size:10.5px}'
    + '.osd-tbl{display:grid;gap:5px;margin-top:6px}.osd-tr{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 62px 48px;gap:8px;align-items:center;font-size:12.5px;cursor:pointer;padding:2px 0}.osd-tr:hover{background:var(--surface2)}.osd-tn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.osd-tn small{color:var(--muted)}'
    + '.osd-tb{position:relative;height:12px;background:var(--surface2);border-radius:4px;overflow:hidden}.osd-tb i{position:absolute;left:0;top:0;bottom:0;background:var(--primary);opacity:.8}.osd-tb i.r{background:var(--danger);opacity:1}.osd-tv,.osd-tc{text-align:right;font-variant-numeric:tabular-nums}.osd-tc{color:var(--muted)}.osd-tc.bad{color:var(--danger);font-weight:700}';
  document.head.appendChild(css);
  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {receivable: Object.assign((window.MODULE_PAGES || {}).receivable || {}, {dash: page})});
})();
