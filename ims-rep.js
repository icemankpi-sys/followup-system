// Iceman IMS - Sales Rep section: rep dashboard and rep to-do (2026-11-01)
// Loaded before the main script; uses the main script's globals at run time (api, $, esc, money, money0, rows, op, me, ops, lvl, rank, opsFor, bars, isActive, sum, go).
(function () {
  const R = {rep: '', todos: [], loaded: false};
  const lc = s => nk(s);   // rep names compare without case, spaces or punctuation (main script's nk)
  const isMgr = () => me.role === 'admin' || opsFor('receivable').length > 0;
  const myRep = () => (me.rep_name || '').trim();
  const pad = n => String(n).padStart(2, '0'), ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date()), plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const scope = () => rows.filter(r => !op || r.operation === op);
  const repNames = () => [...new Set(scope().map(r => (r.owner_name || '').trim()).filter(Boolean))].sort();
  const current = () => isMgr() ? R.rep : myRep();
  const repRows = name => scope().filter(r => lc(r.owner_name) === lc(name));
  async function loadTodos() { R.todos = await api('/rest/v1/fu_todos?select=*&order=done.asc,due_date.asc.nullslast&limit=5000'); R.loaded = true; }
  async function run(fn) { $('page').innerHTML = '<div class="hint">Loading...</div>'; try { await loadTodos(); fn(); } catch (e) { $('page').innerHTML = '<div class="card err">Could not load: ' + esc(e.message) + '</div>'; } }
  const canEditRow = r => rank(lvl(r.operation, 'receivable')) >= 2 || (lc(r.owner_name) === lc(myRep()) && rank(lvl(r.operation, 'rep')) >= 2);
  function picker() {
    if (!isMgr()) return '';
    const names = repNames();
    return '<div class="filters noprint row2"><select id="rpSel"><option value="">All reps (overview)</option>' + names.map(n => '<option' + (n === R.rep ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>'
      + (window.canHandover && canHandover() ? '<button class="btn" data-hact="open">&#8644; Rep handover</button>' : '') + '</div>';
  }
  function bindPicker(again) { const s = $('rpSel'); if (s) s.onchange = () => { R.rep = s.value; again(); }; }
  const stats = list => { const a = list.filter(isActive); return {a, bal: sum(a), o120: sum(a.filter(isO120)), b91: sum(a.filter(r => !isO120(r))), soon: a.filter(r => r.days_to_120 > 0 && r.days_to_120 <= 30), over: a.filter(r => r.action_overdue), broken: a.filter(r => r.promise_broken), inc: a.filter(r => r.incomplete), old: Math.max(0, ...a.map(r => r.aging_days || 0))}; };
  const flags = r => (r.promise_broken ? '<span class="tag t-r">promise broken</span>' : '') + (r.action_overdue ? '<span class="tag t-r">overdue</span>' : '') + (r.incomplete ? '<span class="tag t-a">no plan</span>' : '') + (r.days_to_120 > 0 && r.days_to_120 <= 14 ? '<span class="tag t-a">120 in ' + (r.days_to_120 + 1) + 'd</span>' : '');
  const itemRow = r => '<tr class="row" data-open="' + r.id + '"><td class="rno">' + esc(r.rec_code || '') + '</td><td>' + esc(r.outlet) + '</td><td>' + esc(r.party) + '</td><td class="n">' + money(r.amount) + '</td><td class="n">' + r.aging_days + '</td><td>' + esc(r.reason || '') + '</td><td>' + esc(r.next_step || '') + '</td><td>' + esc(r.next_date || '') + '</td><td>' + flags(r) + '</td></tr>';
  const itemTable = list => list.length ? '<div class="wrap" style="box-shadow:none"><table><thead><tr><th>No</th><th>Outlet</th><th>Chain</th><th class="n">Balance</th><th class="n">Days</th><th>Reason</th><th>Next step</th><th>Next date</th><th>Flags</th></tr></thead><tbody>' + list.map(itemRow).join('') + '</tbody></table></div>' : '<div class="hint">None.</div>';

  // ---------- dashboard ----------
  function dash() {
    const name = current();
    if (!isMgr() && !name) { $('page').innerHTML = '<div class="card">Your rep name is not linked yet. Ask the Admin to set it in Permission.</div>'; return; }
    if (!name) return overview();
    const s = stats(repRows(name)), td = R.todos.filter(t => lc(t.rep_name) === lc(name) && !t.done);
    const bucket = ['0-30', '31-60', '61-90', '91-120', '121-240', 'Over 240'].map(b => [b, sum(s.a.filter(r => r.bucket === b)), ['121-240', 'Over 240'].includes(b) ? 'var(--danger)' : 'var(--accent)']).filter(e => e[1] > 0);
    const grp = k => { const m = {}; s.a.forEach(r => { const x = r[k] || '(none)'; m[x] = (m[x] || 0) + Number(r.amount); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const week = s.a.filter(r => r.next_date && r.next_date <= plus(7)).sort((a, b) => a.next_date < b.next_date ? -1 : 1);
    $('page').innerHTML = picker() + '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">Rep dashboard &middot; ' + esc(name) + '</h2><div class="hint">' + (op ? 'Operation ' + esc(op) + ' &middot; ' : '') + 'active outstanding items of this sales rep</div></div>'
      + '<button class="btn noprint" data-vhopen="' + esc(name) + '">&#128663; Visit &amp; meter report</button></div>'
      + '<div class="grid"><div class="tile"><b>' + money0(s.bal) + '</b><span>Outstanding (' + s.a.length + ' invoices)</span></div><div class="tile r"><b>' + money0(s.o120) + '</b><span>Over 120 days</span></div><div class="tile a"><b>' + money0(sum(s.soon)) + '</b><span>Crossing 120 in 30 days (' + s.soon.length + ')</span></div>'
      + '<div class="tile r"><b>' + s.over.length + '</b><span>Actions overdue</span></div><div class="tile r"><b>' + s.broken.length + '</b><span>Promises broken</span></div><div class="tile a"><b>' + s.inc.length + '</b><span>No plan yet</span></div><div class="tile"><b>' + td.length + '</b><span>Open to-dos</span></div></div>'
      + (isMgr() && window.liveBoard ? liveBoard(name) : '')
      + '<div class="grid2"><div class="card"><h3>By age bucket</h3>' + bars(bucket, money0) + '</div><div class="card"><h3>By customer chain</h3>' + bars(grp('party'), money0) + '</div>'
      + '<div class="card"><h3>By reason</h3>' + bars(grp('reason'), money0) + '</div><div class="card"><h3>Follow-up discipline</h3>' + bars([['Planned', s.a.length - s.inc.length, 'var(--ok)'], ['No plan yet', s.inc.length, 'var(--accent)'], ['Action overdue', s.over.length, 'var(--danger)'], ['Promise broken', s.broken.length, 'var(--danger)']], v => v) + '</div></div>'
      + '<div class="card" style="margin-top:12px"><h3>Plan for the next 7 days (' + week.length + ')</h3>' + itemTable(week) + '</div>'
      + '<div class="card" style="margin-top:12px"><h3>Largest invoices</h3>' + itemTable(s.a.slice().sort((a, b) => b.amount - a.amount).slice(0, 10)) + '</div>';
    bindPicker(dash);
  }
  function overview() {
    const names = repNames();
    const list = names.map(n => { const s = stats(repRows(n)); return {n, s, td: R.todos.filter(t => lc(t.rep_name) === lc(n) && !t.done).length}; }).sort((a, b) => b.s.bal - a.s.bal);
    const tot = stats(scope());
    $('page').innerHTML = picker() + '<div class="row2" style="justify-content:space-between"><div><h2 class="pt">Rep dashboard &middot; all reps</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' &middot; for Admin, Director, Finance and Operation Heads</div></div>'
      + '<button class="btn noprint" data-vhopen="">&#128663; Visit &amp; meter report (all reps)</button></div>'
      + '<div class="grid"><div class="tile"><b>' + names.length + '</b><span>Sales reps with outstanding</span></div><div class="tile"><b>' + money0(tot.bal) + '</b><span>Total outstanding</span></div><div class="tile r"><b>' + money0(tot.o120) + '</b><span>Over 120 days</span></div><div class="tile r"><b>' + tot.over.length + '</b><span>Actions overdue</span></div><div class="tile a"><b>' + tot.inc.length + '</b><span>No plan yet</span></div></div>'
      + (window.liveBoard ? liveBoard(null) : '')
      + '<div class="card" style="margin-top:12px"><h3>Reps</h3><div class="wrap" style="box-shadow:none"><table><thead><tr><th>Sales rep</th><th class="n">Invoices</th><th class="n">Outstanding</th><th class="n">Over 120</th><th class="n">Crossing 120 (30d)</th><th class="n">Overdue</th><th class="n">Broken</th><th class="n">No plan</th><th class="n">Open to-dos</th><th class="n">Oldest</th></tr></thead><tbody>'
      + list.map(x => '<tr class="row" data-rp="' + esc(x.n) + '"><td><b>' + esc(x.n) + '</b></td><td class="n">' + x.s.a.length + '</td><td class="n">' + money0(x.s.bal) + '</td><td class="n">' + money0(x.s.o120) + '</td><td class="n">' + money0(sum(x.s.soon)) + '</td><td class="n">' + (x.s.over.length ? '<span class="down">' + x.s.over.length + '</span>' : 0) + '</td><td class="n">' + (x.s.broken.length ? '<span class="down">' + x.s.broken.length + '</span>' : 0) + '</td><td class="n">' + x.s.inc.length + '</td><td class="n">' + x.td + '</td><td class="n">' + x.s.old + '</td></tr>').join('')
      + '</tbody></table></div><div class="hint">Click a rep to open their dashboard.</div></div>'
      + '<div class="grid2" style="margin-top:12px"><div class="card"><h3>Outstanding by rep</h3>' + bars(list.map(x => [x.n, x.s.bal]), money0) + '</div><div class="card"><h3>Over 120 days by rep</h3>' + bars(list.filter(x => x.s.o120).map(x => [x.n, x.s.o120, 'var(--danger)']), money0) + '</div>'
      + '<div class="card"><h3>Items without a plan by rep</h3>' + bars(list.filter(x => x.s.inc.length).map(x => [x.n, x.s.inc.length, 'var(--accent)']), v => v) + '</div><div class="card"><h3>Overdue actions and broken promises</h3>' + bars(list.filter(x => x.s.over.length + x.s.broken.length).map(x => [x.n, x.s.over.length + x.s.broken.length, 'var(--danger)']), v => v) + '</div></div>';
    bindPicker(dash);
    document.querySelectorAll('#page [data-rp]').forEach(tr => tr.onclick = () => { R.rep = tr.dataset.rp; dash(); });
  }

  // ---------- to-do ----------
  function todo() {
    const name = current();
    if (!isMgr() && !name) { $('page').innerHTML = '<div class="card">Your rep name is not linked yet. Ask the Admin to set it in Permission.</div>'; return; }
    if (!name) {
      const names = repNames();
      $('page').innerHTML = picker() + '<h2 class="pt">Rep to-do</h2><div class="card"><div class="hint">Choose a rep above to see and assign their to-do list.</div>' + names.map(n => { const s = stats(repRows(n)); return '<div class="row2"><button class="btn" data-rp="' + esc(n) + '">' + esc(n) + '</button><span class="hint">' + (s.over.length + s.broken.length) + ' overdue / broken, ' + s.inc.length + ' with no plan, ' + R.todos.filter(t => lc(t.rep_name) === lc(n) && !t.done).length + ' open tasks</span></div>'; }).join('') + '</div>';
      bindPicker(todo); document.querySelectorAll('#page [data-rp]').forEach(b => b.onclick = () => { R.rep = b.dataset.rp; todo(); }); return;
    }
    const s = stats(repRows(name)), t = today();
    const overdue = s.a.filter(r => r.promise_broken || r.action_overdue), todayL = s.a.filter(r => r.next_date === t && !r.action_overdue), weekL = s.a.filter(r => r.next_date > t && r.next_date <= plus(7)), noPlan = s.a.filter(r => !r.next_date || r.incomplete);
    const mine = R.todos.filter(x => lc(x.rep_name) === lc(name)), open = mine.filter(x => !x.done), done = mine.filter(x => x.done).slice(0, 10);
    const repOps = [...new Set(repRows(name).map(r => r.operation))], canAdd = isMgr() ? ops.some(o => rank(lvl(o.code, 'receivable')) >= 2) : rank(lvl(repOps[0] || '', 'rep')) >= 1;
    const opChoices = isMgr() ? ops.filter(o => rank(lvl(o.code, 'receivable')) >= 2) : ops.filter(o => rank(lvl(o.code, 'rep')) >= 1);
    const sec = (title, cls, list) => '<div class="card" style="margin-top:12px"><h3>' + title + ' (' + list.length + ')</h3>' + (list.length ? '<div class="wrap" style="box-shadow:none"><table><thead><tr><th></th><th>Outlet</th><th class="n">Balance</th><th class="n">Days</th><th>Next step</th><th>Next date</th><th>Promise</th><th>Flags</th></tr></thead><tbody>'
      + list.map(r => '<tr class="row" data-open="' + r.id + '"><td><span class="tag ' + cls + '">&nbsp;</span></td><td>' + esc(r.outlet) + ' <span class="hint">' + esc(r.party) + '</span></td><td class="n">' + money(r.amount) + '</td><td class="n">' + r.aging_days + '</td><td>' + esc(r.next_step || '') + '</td><td>' + esc(r.next_date || '') + '</td><td>' + esc(r.promised_date || '') + '</td><td>' + flags(r) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="hint">Nothing here.</div>') + '</div>';
    $('page').innerHTML = picker() + '<h2 class="pt">To-do &middot; ' + esc(name) + '</h2><div class="hint">From the outstanding list (click a line to update it) and tasks given to the rep.</div>'
      + '<div class="grid"><div class="tile r"><b>' + overdue.length + '</b><span>Overdue or promise broken</span></div><div class="tile a"><b>' + todayL.length + '</b><span>Due today</span></div><div class="tile"><b>' + weekL.length + '</b><span>Next 7 days</span></div><div class="tile a"><b>' + noPlan.length + '</b><span>No plan yet</span></div><div class="tile"><b>' + open.length + '</b><span>Open tasks</span></div></div>'
      + '<div class="card"><h3>Tasks (' + open.length + ' open)</h3>'
      + (canAdd && opChoices.length ? '<div class="row2"><input id="tdTitle" placeholder="Task, e.g. Collect cheque from Keells Wattala" style="flex:1;min-width:220px"><input id="tdDue" type="date"><select id="tdOp">' + opChoices.map(o => '<option value="' + o.code + '"' + (repOps.includes(o.code) ? ' selected' : '') + '>' + o.code + '</option>').join('') + '</select><select id="tdItem"><option value="">Not linked to an invoice</option>' + s.a.map(r => '<option value="' + r.id + '">' + esc(r.outlet + ' · ' + money0(r.amount)) + '</option>').join('') + '</select><button class="btn p" id="tdAdd">Add task</button></div><div class="err" id="tdMsg"></div>' : '')
      + (open.length ? open.map(x => { const late = x.due_date && x.due_date < t, it = x.item_id && rows.find(r => r.id === x.item_id); return '<div class="row2" style="border-bottom:1px solid var(--line);padding:4px 0"><input type="checkbox" data-tdone="' + x.id + '" style="width:auto"><span style="flex:1"><b>' + esc(x.title) + '</b>' + (it ? ' <a class="hint" data-open="' + it.id + '" style="cursor:pointer;text-decoration:underline">' + esc(it.outlet) + '</a>' : '') + '<br><span class="hint">' + esc(x.operation) + ' &middot; by ' + esc(x.by_name || '') + '</span></span><span class="' + (late ? 'down' : 'hint') + '">' + (x.due_date ? 'due ' + esc(x.due_date) : 'no date') + '</span></div>'; }).join('') : '<div class="hint">No open tasks.</div>')
      + (done.length ? '<details style="margin-top:8px"><summary class="hint">Recently done (' + done.length + ')</summary>' + done.map(x => '<div class="row2"><input type="checkbox" checked data-tundo="' + x.id + '" style="width:auto"><span style="text-decoration:line-through">' + esc(x.title) + '</span><span class="hint">' + esc((x.done_at || '').slice(0, 10)) + '</span></div>').join('') + '</details>' : '') + '</div>'
      + sec('Overdue and broken promises', 't-r', overdue) + sec('Due today', 't-a', todayL) + sec('Next 7 days', 't-b', weekL) + sec('No plan yet: add a reason, next step and date', 't-a', noPlan);
    bindPicker(todo);
    if ($('tdAdd')) $('tdAdd').onclick = async () => {
      const title = $('tdTitle').value.trim(); if (!title) { $('tdMsg').textContent = 'Write the task'; return; }
      try { await api('/rest/v1/fu_todos', {method: 'POST', body: {operation: $('tdOp').value, rep_name: name, title, due_date: $('tdDue').value || null, item_id: $('tdItem').value || null}, headers: {Prefer: 'return=minimal'}}); await loadTodos(); todo(); }
      catch (e) { $('tdMsg').textContent = e.message; }
    };
    const setDone = async (id, v) => { try { await api('/rest/v1/fu_todos?id=eq.' + id, {method: 'PATCH', body: {done: v}, headers: {Prefer: 'return=minimal'}}); await loadTodos(); todo(); } catch (e) { alert(e.message); } };
    document.querySelectorAll('#page [data-tdone]').forEach(c => c.onchange = () => setDone(c.dataset.tdone, true));
    document.querySelectorAll('#page [data-tundo]').forEach(c => c.onchange = () => setDone(c.dataset.tundo, false));
  }

  // ---------- report ----------
  function report() {
    const names = current() ? [current()] : repNames();
    const rs = names.map(n => { const s = stats(repRows(n)); return [n, s.a.length, s.bal, s.b91, s.o120, sum(s.soon), s.over.length, s.broken.length, s.inc.length, R.todos.filter(t => lc(t.rep_name) === lc(n) && !t.done).length]; }).sort((a, b) => b[2] - a[2]);
    $('page').innerHTML = picker() + '<div class="noprint row2"><button class="btn p" id="rPrint">Print / Save as PDF</button><button class="btn" id="rpCsv">Download Excel (CSV)</button><button class="btn" data-vhopen="' + esc(current() || '') + '" title="Visits, routes and Start / Close meter per rep per day">&#128663; Visit &amp; meter report' + (current() ? ' (' + esc(current()) + ')' : '') + '</button></div>'
      + '<h2 class="pt">Sales rep outstanding report</h2><div class="hint">' + (op ? 'Operation ' + esc(op) : 'All my operations') + ' &middot; as at ' + today() + ' &middot; Iceman IMS</div>'
      + '<div class="wrap"><table><thead><tr><th>Sales rep</th><th class="n">Invoices</th><th class="n">Outstanding</th><th class="n">Up to 120</th><th class="n">Over 120</th><th class="n">Crossing 120 (30d)</th><th class="n">Overdue</th><th class="n">Broken</th><th class="n">No plan</th><th class="n">Open tasks</th></tr></thead><tbody>'
      + rs.map(r => '<tr><td>' + esc(r[0]) + '</td>' + r.slice(1).map((v, i) => '<td class="n">' + ([1, 2, 3, 4].includes(i) ? money0(v) : v) + '</td>').join('') + '</tr>').join('')
      + '<tr class="tot"><td>Total</td>' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => '<td class="n">' + ([2, 3, 4, 5].includes(i) ? money0(rs.reduce((s, r) => s + r[i], 0)) : rs.reduce((s, r) => s + r[i], 0)) + '</td>').join('') + '</tr></tbody></table></div>';
    bindPicker(report);
    $('rpCsv').onclick = () => { const q = v => '"' + String(v).replace(/"/g, '""') + '"'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [['Sales rep', 'Invoices', 'Outstanding', 'Up to 120', 'Over 120', 'Crossing 120 (30d)', 'Overdue', 'Broken', 'No plan', 'Open tasks']].concat(rs).map(r => r.map(q).join(',')).join('\r\n')], {type: 'text/csv'})); a.download = 'Sales reps ' + today() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); };
  }
  function card(m) {
    const name = current(), list = name ? repRows(name) : scope(), s = stats(list);
    return '<div class="card mcard" data-mod="rep" data-go="items"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + (name ? esc(name) : repNames().length + ' reps') + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + money0(s.bal) + '</div><div class="hint">' + (s.over.length + s.broken.length) + ' overdue / broken &middot; ' + s.inc.length + ' with no plan</div></div>';
  }

  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {rep: {items: () => run(todo), dash: () => run(dash), report: () => run(report), card}});
})();
