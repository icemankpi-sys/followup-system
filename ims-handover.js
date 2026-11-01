// Iceman IMS - Rep handover: move a rep's outlets and open invoices to another rep in one step (2026-11-01)
// Loaded before the main script; uses the main script's globals at run time (api, $, esc, money, rows, op, me, ops, lvl, rank,
// isActive, loadRows, go, toast, closeDrawer, fmtDT).
(function () {
  const H = {op: '', from: '', all: true, picked: {}, past: [], maps: []};
  const lc = s => String(s || '').trim().toLowerCase();
  const fullOps = () => ops.filter(o => rank(lvl(o.code, 'receivable')) >= 3);
  window.canHandover = () => fullOps().length > 0;
  const openRows = () => rows.filter(r => r.operation === H.op && isActive(r));
  const reps = () => { const m = {}; openRows().forEach(r => { const n = (r.owner_name || '').trim(); if (!n) return; m[n] = m[n] || {n, c: 0, b: 0}; m[n].c++; m[n].b += Number(r.amount); }); return Object.values(m).sort((a, b) => a.n.localeCompare(b.n)); };
  function outletsOf(name) {
    const m = {}; openRows().filter(r => lc(r.owner_name) === lc(name)).forEach(r => { const k = lc(r.outlet); m[k] = m[k] || {k, name: (r.outlet || '').trim(), chain: r.party, c: 0, b: 0}; m[k].c++; m[k].b += Number(r.amount); });
    return Object.values(m).sort((a, b) => b.b - a.b);
  }

  async function openHandover() {
    const fo = fullOps(); if (!fo.length) return;
    if (!fo.some(o => o.code === H.op)) H.op = op && fo.some(o => o.code === op) ? op : fo[0].code;
    try { H.past = await api('/rest/v1/fu_rep_handovers?select=*&order=at.desc&limit=20') || []; H.maps = await api('/rest/v1/fu_rep_map?select=*&order=created_at.desc') || []; } catch (e) { H.past = []; H.maps = []; }
    paint();
  }
  window.openHandover = openHandover;

  function paint(msg) {
    const fo = fullOps(), rs = reps(); if (!rs.some(x => x.n === H.from)) { H.from = ''; H.picked = {}; }
    const outs = H.from ? outletsOf(H.from) : [], sel = H.all ? outs : outs.filter(o => H.picked[o.k]);
    const names =[...new Set(rows.map(r => (r.owner_name || '').trim()).filter(Boolean))].sort();
    let h = '<div class="dh"><div><h3>Rep handover</h3><div class="hint">Move a rep\'s outlets and open invoices to another rep. History and remarks stay with the outlets.</div></div><button class="btn" data-hact="close">Close</button></div><div class="frm">'
      + '<label>Operation</label><select id="hOp">' + fo.map(o => '<option value="' + o.code + '"' + (o.code === H.op ? ' selected' : '') + '>' + esc(o.code + ' - ' + o.name) + '</option>').join('') + '</select>'
      + '<label>From rep (leaving)</label><select id="hFrom"><option value="">Choose the rep</option>' + rs.map(x => '<option' + (x.n === H.from ? ' selected' : '') + ' value="' + esc(x.n) + '">' + esc(x.n) + ' · ' + x.c + ' open · ' + money(x.b) + '</option>').join('') + '</select>'
      + '<label>To rep (taking over)</label><input id="hTo" list="hNames" maxlength="80" placeholder="Name exactly as the new rep should appear" value="' + esc(H.to || '') + '"><datalist id="hNames">' + names.filter(n => n !== H.from).map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>';
    if (H.from) {
      h += '<label>Which outlets</label><div class="row2"><label style="display:flex;gap:5px;align-items:center;margin:0;color:var(--ink)"><input type="radio" name="hAll" value="1" style="width:auto"' + (H.all ? ' checked' : '') + '>All outlets of ' + esc(H.from) + '</label><label style="display:flex;gap:5px;align-items:center;margin:0;color:var(--ink)"><input type="radio" name="hAll" value="0" style="width:auto"' + (H.all ? '' : ' checked') + '>Only the outlets I tick</label></div>'
        + '<div class="wrap" style="box-shadow:none;max-height:260px;overflow-y:auto"><table><thead><tr>' + (H.all ? '' : '<th></th>') + '<th>Outlet</th><th class="n">Open</th><th class="n">Balance</th></tr></thead><tbody>'
        + outs.map(o => '<tr>' + (H.all ? '' : '<td><input type="checkbox" data-hpick="' + esc(o.k) + '" style="width:auto"' + (H.picked[o.k] ? ' checked' : '') + '></td>') + '<td>' + esc(o.name) + '<br><span class="hint">' + esc(o.chain || '') + '</span></td><td class="n">' + o.c + '</td><td class="n">' + money(o.b) + '</td></tr>').join('') + '</tbody></table></div>'
        + '<div class="stamp"><b>' + sel.length + ' outlets · ' + sel.reduce((s, o) => s + o.c, 0) + ' open invoices · ' + money(sel.reduce((s, o) => s + o.b, 0)) + '</b> will move to the new rep, with the open to-dos of these invoices'
        + (H.all ? ' and all other open to-dos of ' + esc(H.from) : '') + '. Settled invoices stay under ' + esc(H.from) + '. Every invoice and outlet gets a history line, and the next weekly uploads keep the new rep until C40 shows the new name.</div>'
        + '<label>Reason (shown in the history)</label><input id="hNote" maxlength="200" placeholder="e.g. Transferred to Kandy from 1 Nov 2026" value="' + esc(H.note || '') + '">'
        + '<label style="display:flex;gap:6px;align-items:center;color:var(--ink)"><input type="checkbox" id="hOk" style="width:auto">I checked the reps and outlets above</label>'
        + '<div class="row2"><button class="btn p" data-hact="go">Hand over</button><button class="btn" data-hact="close">Cancel</button></div>';
    }
    h += '<div class="err" id="hErr">' + esc(msg || '') + '</div></div>';
    const maps = H.maps.filter(m => m.operation === H.op), past = H.past.filter(p => p.operation === H.op);
    h += '<h4 class="dh4">Upload name mappings (' + H.op + ')</h4>' + (maps.length ? '<table><tbody>' + maps.map(m => '<tr><td>' + esc(m.from_key) + ' &rarr; <b>' + esc(m.to_name) + '</b><br><span class="hint">' + (m.outlet_key ? 'outlet ' + esc(m.outlet_key) : 'all outlets') + '</span></td><td><button class="btn q" data-hact="unmap" data-from="' + esc(m.from_key) + '" data-outlet="' + esc(m.outlet_key) + '" title="Remove when C40 shows the new rep">Remove</button></td></tr>').join('') + '</tbody></table><div class="hint">Remove a mapping once C40 shows the new rep on those invoices.</div>' : '<div class="hint">None.</div>')
      + '<h4 class="dh4">Past handovers (' + H.op + ')</h4>' + (past.length ? past.map(p => '<div class="tls"><i></i><div><b>#' + p.id + ' ' + esc(p.from_rep) + ' &rarr; ' + esc(p.to_rep) + '</b> · ' + esc(fmtDT(new Date(p.at))) + ' · by ' + esc(p.by_name || '') + '<span class="chg">' + p.outlets_moved + ' outlets, ' + p.items_moved + ' invoices, ' + money(p.balance) + ', ' + p.todos_moved + ' to-dos' + (p.note ? ' · ' + esc(p.note) : '') + '</span></div></div>').join('') : '<div class="hint">None yet.</div>');
    $('panel').innerHTML = h; $('panel').classList.add('open');
  }

  async function run() {
    const to = $('hTo').value.trim().replace(/\s+/g, ' '), err = $('hErr'); H.to = to; H.note = $('hNote').value;
    if (!to) { err.textContent = 'Write the new rep name'; return; }
    if (lc(to) === lc(H.from)) { err.textContent = 'The new rep is the same as the old rep'; return; }
    if (!$('hOk').checked) { err.textContent = 'Tick "I checked" first'; return; }
    const outs = outletsOf(H.from), keys = H.all ? null : outs.filter(o => H.picked[o.k]).map(o => o.k);
    if (keys && !keys.length) { err.textContent = 'Tick at least one outlet'; return; }
    try {
      const r = await api('/rest/v1/rpc/fu_rep_handover', {method: 'POST', body: {p_op: H.op, p_from: H.from, p_to: to, p_outlets: keys, p_note: H.note.trim() || null}});
      await loadRows(); closeDrawer(); go(); H.from = ''; H.to = ''; H.note = ''; H.picked = {};
      toast('Handover #' + r.id + ': ' + r.items + ' invoices, ' + r.outlets + ' outlets, ' + r.todos + ' to-dos moved to ' + to);
    } catch (e) { err.textContent = e.message; }
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-hact]'); if (!b) return;
    const k = b.dataset.hact;
    if (k === 'open') openHandover();
    else if (k === 'close') closeDrawer();
    else if (k === 'go') run();
    else if (k === 'unmap') { try { await api('/rest/v1/rpc/fu_rep_map_remove', {method: 'POST', body: {p_op: H.op, p_from: b.dataset.from, p_outlet: b.dataset.outlet}}); H.maps = await api('/rest/v1/fu_rep_map?select=*&order=created_at.desc') || []; paint('Mapping removed'); } catch (er) { $('hErr').textContent = er.message; } }
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!$('panel').contains(t)) return;
    const keep = () => { const to = $('hTo'), n = $('hNote'); if (to) H.to = to.value; if (n) H.note = n.value; };
    if (t.id === 'hOp') { keep(); H.op = t.value; H.from = ''; paint(); }
    else if (t.id === 'hFrom') { keep(); H.from = t.value; H.picked = {}; paint(); }
    else if (t.name === 'hAll') { keep(); H.all = t.value === '1'; paint(); }
    else if (t.dataset && t.dataset.hpick) { keep(); H.picked[t.dataset.hpick] = t.checked; paint(); }
  });
})();
