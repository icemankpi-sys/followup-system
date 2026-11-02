// Iceman IMS: add one Outstanding invoice by hand (v2.3, 2026-11-02). Short Expiry's "+ Add line" lives in ims-expiry.js.
// Loaded before the main script; uses the main script's globals at run time (api, $, esc, money, op, ops, lvl, rank, rows, lists,
// nk, guard, closeDrawer, toast, loadRows, openRecord, me, myTitle, fmtDT).
(function () {
  const edOps = () => ops.filter(o => rank(lvl(o.code, 'receivable')) >= 2);
  window.canAddOs = () => edOps().length > 0;
  const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);   // Sri Lanka date
  const uniq = (o, k) => [...new Set(rows.filter(r => !o || r.operation === o).map(r => r[k]).filter(Boolean))].sort();
  const dl = (id, vals) => '<datalist id="' + id + '">' + vals.map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>';
  const opt = (arr, blank) => (blank ? '<option value=""></option>' : '') + arr.map(v => '<option>' + esc(v) + '</option>').join('');

  function drawer() {
    const eo = edOps(), o0 = op && eo.some(o => o.code === op) ? op : (eo.length === 1 ? eo[0].code : '');
    $('panel').innerHTML = '<div class="dh"><div><h3>Add invoice</h3><div class="hint">One outstanding invoice, added by hand. It gets the same timeline, remarks and follow-up as an uploaded one.</div></div><button class="btn" data-aact="close">Close</button></div><div class="frm">'
      + '<label>Operation *</label><select id="aiOp"><option value="">Choose</option>' + eo.map(o => '<option value="' + o.code + '"' + (o.code === o0 ? ' selected' : '') + '>' + esc(o.code + ' - ' + o.name) + '</option>').join('') + '</select>'
      + '<label>Invoice no (memo) *</label><input id="aiRef" maxlength="60" placeholder="as in C40, e.g. INV-MT-004512">'
      + '<label>Invoice date *</label><input id="aiDate" type="date" max="' + today() + '">'
      + '<label>Balance Rs. *</label><input id="aiAmt" inputmode="decimal" placeholder="e.g. 12500.00">'
      + '<label>Customer chain</label><input id="aiChain" list="aiChains" maxlength="120">' + dl('aiChains', uniq('', 'party'))
      + '<label>Outlet *</label><input id="aiOutlet" list="aiOutlets" maxlength="160" placeholder="type to pick a saved outlet">' + dl('aiOutlets', uniq('', 'outlet'))
      + '<label>Sales rep</label><input id="aiRep" list="aiReps" maxlength="80">' + dl('aiReps', uniq('', 'owner_name'))
      + '<label>Reason</label><select id="aiReason">' + opt(lists.reason || [], true) + '</select>'
      + '<label>Next step</label><select id="aiStep">' + opt(lists.next_step || [], true) + '</select>'
      + '<label>Who does it</label><input id="aiWho" maxlength="80">'
      + '<label>Next action date</label><input id="aiNext" type="date">'
      + '<label>Short remark (shown in the list)</label><textarea id="aiRem" rows="2" maxlength="300"></textarea>'
      + '<div class="err" id="aiDup"></div>'
      + '<div class="stamp">Added as <b>' + esc(me.full_name || me.username) + '</b>' + (myTitle() ? ' · ' + esc(myTitle()) : '') + ' · ' + esc(fmtDT(new Date())) + '. A hand-added invoice is not closed by the next upload: settle it here when it is paid. If a later list has the same invoice no, the upload takes it over.</div>'
      + '<div class="row2"><button class="btn p" data-aact="save">Add invoice</button><button class="btn" data-aact="close">Cancel</button></div><div class="err" id="aiErr"></div></div>';
    $('panel').classList.add('open');
    setTimeout(() => { const f = $(o0 ? 'aiRef' : 'aiOp'); if (f) f.focus(); }, 220);
  }
  // warn while typing: same invoice already in the list, or a similar outlet name
  function check() {
    const o = $('aiOp').value, ref = $('aiRef').value.trim().toUpperCase(), ou = $('aiOutlet').value.trim(), w = [];
    const same = ref && rows.find(r => (r.ref_key || '').toUpperCase() === ref);
    if (same) w.push(ref + ' is already in ' + same.operation + ' (' + (same.outlet || '') + '). It cannot be added twice.');
    if (ou) { const k = nk(ou), saved = uniq(o, 'outlet'); if (!saved.some(s => nk(s) === k)) { const near = saved.filter(s => nk(s).includes(k.slice(0, 6)) || k.includes(nk(s).slice(0, 6))).slice(0, 3); if (near.length) w.push('New outlet name. Did you mean: ' + near.join(' / ') + '?'); } }
    $('aiDup').innerHTML = w.map(esc).join('<br>');
  }
  async function save() {
    const v = id => $(id).value.trim(), o = v('aiOp'), amt = Number(v('aiAmt').replace(/[, ]/g, ''));
    const miss = [['aiOp', 'Operation'], ['aiRef', 'Invoice no'], ['aiDate', 'Invoice date'], ['aiAmt', 'Balance'], ['aiOutlet', 'Outlet']].filter(x => !v(x[0])).map(x => x[1]);
    if (miss.length) { $('aiErr').textContent = 'Fill in: ' + miss.join(', '); return; }
    if (isNaN(amt) || amt <= 0) { $('aiErr').textContent = 'Balance must be a number above 0'; return; }
    if (v('aiDate') > today()) { $('aiErr').textContent = 'The invoice date is in the future'; return; }
    const row = {ref_key: v('aiRef'), party: v('aiChain'), outlet: v('aiOutlet'), owner_name: v('aiRep'), amount: Math.round(amt * 100) / 100, base_date: v('aiDate'),
      reason: v('aiReason'), next_step: v('aiStep'), next_owner: v('aiWho'), next_date: v('aiNext'), remarks: v('aiRem'), details: {txn: 'Invoice'}};
    try {
      const id = await api('/rest/v1/rpc/fu_add_item', {method: 'POST', body: {p_module: 'receivable', p_op: o, p_row: row}});
      await loadRows(); closeDrawer(); openRecord(id); toast(row.ref_key.toUpperCase() + ' added to ' + o);
    } catch (e) { $('aiErr').textContent = e.message; }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-aact]'); if (!b || b.disabled) return;
    if (b.dataset.aact === 'open') drawer(); else if (b.dataset.aact === 'close') closeDrawer(); else if (b.dataset.aact === 'save') guard(save);
  });
  document.addEventListener('input', e => { if (['aiOp', 'aiRef', 'aiOutlet'].includes(e.target.id)) check(); });
  document.addEventListener('change', e => { if (e.target.id === 'aiOp') check(); });
})();
