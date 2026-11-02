// Iceman IMS - Outstanding list upload (2026-11-01)
// Reads the operation's filled "ඇමුණුම (අ) - Outstanding Template" in the browser and loads it into Outstanding for the chosen operation.
// Columns are found by their header names, so both layouts work: the template (Customer Name, Txn Type, Date, SalesRep, Current ... Over 120,
// Balance, Memo, SalesRep / Customer Phone, Customer Address, Reason, explanation) and the older one sent by MT (Txn Type, Date, Memo, GroupName,
// Aging, SalesRep, 91-120, Over 120, Balance, ...). Chain names written as their own rows ("Arpico", "Spar") become the chain of the lines below.
// Uses the main script's globals at run time (api, $, esc, money, rows, ops, op, lvl, rank, lists, nk, CO, CR, loadRows, go, toast, closeDrawer, guard)
// and IMSX from ims-expiry.js.
(function () {
  const U = {p: null};
  const fullOps = () => ops.filter(o => rank(lvl(o.code, 'receivable')) >= 3);
  window.canUploadOs = () => fullOps().length > 0;
  const H = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const COLS = [['outlet', h => h === 'customername' || h === 'groupname' || h === 'customer' || h === 'outlet'], ['txn', h => h === 'txntype' || h === 'type'], ['date', h => h === 'date' || h === 'invoicedate'],
    ['ref', h => h === 'memo' || h === 'num' || h === 'invoiceno' || h === 'memonum'], ['rep', h => h === 'salesrep' || h === 'rep'], ['aging', h => h === 'aging'], ['cur', h => h === 'current'], ['b1', h => h === '130'], ['b31', h => h === '3160'],
    ['b61', h => h === '6190'], ['b91', h => h === '91120'], ['o120', h => h === 'over120'], ['bal', h => h === 'balance' || h === 'amount'], ['repph', h => h.startsWith('salesrepphone')], ['custph', h => h.startsWith('customerphone')],
    ['addr', h => h.startsWith('customeraddress') || h === 'address'], ['reason', h => h.startsWith('mainreason') || h === 'reason'], ['sit', h => h.startsWith('clearexplanation') || h.startsWith('currentsituation') || h === 'explanation']];
  const SYN = {'grn error': 'GRN error', 'price not update item sale': 'Price not updated', 'price not updated': 'Price not updated', 'invoice enter error': 'Invoice entry error', 'invoice entry error': 'Invoice entry error',
    // GT wording (Gothatuwa list, 31.10.2026)
    'the employee has already left the company.': 'Rep left the company', 'the employee has already left the company': 'Rep left the company',
    'the outstanding amount is to be collected from the outlet.': 'Collect from outlet', 'the outstanding amount is to be collected from the outlet': 'Collect from outlet',
    'handed over to mr.jayarathna to police entry': 'Police entry', 'to be settled from ccs': 'To be settled from CCS'};
  const synOf = rl => SYN[rl] || (/^payment to be collected from /.test(rl) ? 'Collect from another rep' : /police entry/.test(rl) ? 'Police entry' : null);
  function opFromName(s) {
    const t = String(s || '').toLowerCase();
    if (!t) return '';
    const byName = ops.find(o => nk(o.name) === nk(t) || nk(o.code) === nk(t)); if (byName) return byName.code;   // "GT Medawela", "AMB Jaffna", ...
    if (/cbl/.test(t)) return /galle/.test(t) ? 'CBG' : /kandy/.test(t) ? 'CBK' : 'CBL';
    if (/^mt\b|modern|smmt/.test(t)) return /kandy/.test(t) ? 'MTK' : /horeca|hreka|horeka/.test(t) ? 'MTH' : 'MT';
    if (/jaffna/.test(t)) return 'JFN'; if (/kandy|kdy/.test(t)) return 'KDY'; if (/medawala|medawela|madawala|mdw/.test(t)) return 'MDW'; if (/depot|gothatuwa/.test(t)) return 'DEP';
    if (/\bamb|ambient/.test(t)) return 'AMB'; if (/\bice/.test(t)) return 'ICE'; if (/plt|pallet/.test(t)) return 'PLT'; if (/mng|management/.test(t)) return 'MNG';
    const c = ops.find(o => o.code.toLowerCase() === t.trim()); return c ? c.code : '';
  }

  async function read(file) {
    const X = IMSX; await X.loadLib();
    const wb = XLSX.read(await file.arrayBuffer(), {type: 'array'});
    let ws = null, hr = 0, map = null, sheet = '';
    for (const n of wb.SheetNames) {   // the first sheet that has a "Txn Type" header
      const s = wb.Sheets[n], rg = XLSX.utils.decode_range(s['!ref'] || 'A1:A1');
      for (let R = 0; R <= Math.min(rg.e.r, 20) && !map; R++) {
        const m = {};
        for (let C = 0; C <= Math.min(rg.e.c, 30); C++) { const c = s[XLSX.utils.encode_cell({r: R, c: C})], h = H(c && c.v); if (!h) continue; const k = COLS.find(x => x[1](h)); if (k && m[k[0]] == null) m[k[0]] = C; }
        if (m.txn != null && m.ref != null && m.bal != null) { ws = s; hr = R; map = m; sheet = n; }
      }
      if (map) break;
    }
    if (!map) throw new Error('No header row with Txn Type, Memo and Balance was found.');
    const v = (R, k) => { if (map[k] == null) return null; const c = ws[XLSX.utils.encode_cell({r: R, c: map[k]})]; return c ? c.v : null; }, t = (R, k) => String(v(R, k) == null ? '' : v(R, k)).trim();
    const label = re => { for (let R = 0; R < hr; R++) { const a = ws[XLSX.utils.encode_cell({r: R, c: 0})]; if (a && re.test(String(a.v))) { const inl = String(a.v).split(':').slice(1).join(':').trim(); if (inl) return inl; for (let C = 1; C <= 12; C++) { const c = ws[XLSX.utils.encode_cell({r: R, c: C})]; if (c && String(c.v).trim() && !/^[:.\s]+$/.test(String(c.v))) return c.v; } } } return ''; };
    const asAtRaw = label(/date last updated/i), officer = String(label(/officer responsible/i) || '').trim(), opName = String(label(/name of operation/i) || '').trim();
    const rg = XLSX.utils.decode_range(ws['!ref']), lines = [], problems = [], skipped = [], seen = {};
    let chain = '';
    for (let R = hr + 1; R <= rg.e.r; R++) {
      const txn = t(R, 'txn'), ref = t(R, 'ref'), first = ws[XLSX.utils.encode_cell({r: R, c: 0})], firstV = first ? String(first.v).trim() : '';
      if (/^(name of|signature|date\s*$)/i.test(firstV)) break;
      const row = R + 1, balRaw = v(R, 'bal'), bal = X.num(balRaw);
      if (!ref) {
        // no invoice no and no balance = a chain heading ("Arpico", "Spar"), wherever it is written; a balance without invoice no = a total row
        if (balRaw == null || String(balRaw).trim() === '') { if (firstV && !/total/i.test(firstV)) chain = firstV; }
        else if (/invoice/i.test(txn)) problems.push('Row ' + row + ': Memo (invoice no) blank');
        continue;
      }
      if (bal == null) { problems.push('Row ' + row + ': Balance is not a number'); continue; }
      if (bal <= 0) { skipped.push('Row ' + row + ' ' + ref + ' (' + (txn || 'line') + ', balance ' + bal + ')'); continue; }
      const key = ref.toUpperCase();
      if (seen[key]) { problems.push('Row ' + row + ': invoice ' + ref + ' again (also row ' + seen[key] + ')'); continue; }
      seen[key] = row;
      const date = X.iso(v(R, 'date')); if (!date) problems.push('Row ' + row + ': date not readable (' + t(R, 'date') + ')');
      let outlet = t(R, 'outlet'); if (!outlet) { outlet = chain; if (!outlet) problems.push('Row ' + row + ': customer / outlet blank'); }
      const rTxt = t(R, 'reason'), rl = rTxt.toLowerCase(); let reason = synOf(rl) || (lists.reason || []).find(x => x.toLowerCase() === rl) || null;
      if (rTxt && !reason) { reason = 'Other'; problems.push('Row ' + row + ': reason "' + rTxt + '" is not in the list, saved as Other'); }
      if (!rTxt) problems.push('Row ' + row + ': Main Reason blank');
      const sit = t(R, 'sit');
      const next = /^need to update/i.test(sit) ? 'Update deduction / credit note' : /awaiting for payment|awaiting payment/i.test(sit) ? 'Awaiting payment' : null;
      const bk = k => X.num(v(R, k));
      lines.push({ref_key: key, party: chain || null, outlet: outlet || chain, owner_name: t(R, 'rep') || null, amount: Math.round(bal * 100) / 100, base_date: date || null, reason, next_step: next, remarks: sit ? sit.slice(0, 300) : null,
        details: {txn: txn || 'Invoice', aging_at_submission: X.num(v(R, 'aging')), current: bk('cur'), b1_30: bk('b1'), b31_60: bk('b31'), b61_90: bk('b61'), b91_120: bk('b91'), over120: bk('o120'), rep_phone: t(R, 'repph'), cust_phone: t(R, 'custph'), cust_address: t(R, 'addr'), reason_text: rTxt, situation: sit, row},
        _rp: t(R, 'repph'), _cp: t(R, 'custph'), _ad: t(R, 'addr')});
    }
    const code = opFromName(opName);
    U.p = {file: file.name, sheet, opName, op: fullOps().some(o => o.code === code) ? code : '', asAt: X.iso(asAtRaw), officer, lines, problems, skipped};
    drawer();
  }

  function drawer(msg) {
    const P = U.p, fo = fullOps();
    let h = '<div class="dh"><div><h3>Upload Outstanding List</h3><div class="hint">The operation\'s filled Outstanding template (Over 90 / Over 120). Columns are found by their headers. Invoices of this operation that are not in the new file are closed as Settled.</div></div><button class="btn" data-uact2="close">Close</button></div><div class="frm">'
      + '<label>Excel file (.xlsx)</label><input type="file" id="osFile" accept=".xlsx,.xlsm,.xls">';
    if (P) {
      const o = P.op, tot = P.lines.reduce((s, l) => s + l.amount, 0), o120 = P.lines.reduce((s, l) => s + (l.details.over120 || 0), 0);
      h += '<label>Operation</label><select id="osOp"><option value="">Choose</option>' + fo.map(x => '<option value="' + x.code + '"' + (x.code === o ? ' selected' : '') + '>' + esc(x.code + ' - ' + x.name) + '</option>').join('') + '</select>'
        + (P.opName ? '<div class="hint">The file says: ' + esc(P.opName) + (o ? '' : ' (choose the operation)') + '</div>' : '')
        + '<label>List date (Date last updated)</label><input type="date" id="osAsAt" value="' + esc(P.asAt || '') + '">'
        + '<div class="stamp"><b>' + esc(P.file) + '</b> · sheet "' + esc(P.sheet) + '"<br>' + P.lines.length + ' invoices · balance ' + money(tot) + (o120 ? ' · Over 120 ' + money(o120) : '') + ' · ' + new Set(P.lines.map(l => l.party).filter(Boolean)).size + ' chains · ' + new Set(P.lines.map(l => l.owner_name).filter(Boolean)).size + ' reps'
        + (P.officer ? '<br>Responsible officer: ' + esc(P.officer) : '') + (P.skipped.length ? '<br>' + P.skipped.length + ' credit / zero lines skipped' : '') + '</div>';
      if (P.problems.length) h += '<div class="err" style="max-height:170px;overflow-y:auto">' + P.problems.length + ' points to check:<br>' + P.problems.slice(0, 40).map(esc).join('<br>') + (P.problems.length > 40 ? '<br>...' : '') + '</div>';
      if (o) {
        const keys = new Set(P.lines.map(l => l.ref_key)), close = rows.filter(r => r.operation === o && isActive(r) && !keys.has(r.ref_key)), nw = P.lines.filter(l => !rows.some(r => r.operation === o && r.ref_key === l.ref_key)).length;
        h += '<div class="hint">' + nw + ' new invoices · ' + (P.lines.length - nw) + ' already in the system (balance and age will update, follow-up kept)' + (close.length ? ' · <b style="color:var(--warn)">' + close.length + ' open invoices of ' + esc(o) + ' (' + money(sum(close)) + ') are not in this file and will be closed as Settled</b>' : '') + '</div>';
      }
      h += '<div class="row2"><button class="btn p" data-uact2="load"' + (P.lines.length ? '' : ' disabled') + '>Load ' + P.lines.length + ' invoices into the system</button><button class="btn" data-uact2="close">Cancel</button></div>'
        + '<div class="hint">Sales rep phone, customer phone and address from the file also go to the contacts (they never blank out a number already saved).</div>';
    }
    h += '<div class="err" id="osErr">' + esc(msg || '') + '</div></div>';
    $('panel').innerHTML = h; $('panel').classList.add('open');
  }

  async function load() {
    const P = U.p, o = $('osOp').value, asAt = $('osAsAt').value, err = $('osErr');
    if (!o) { err.textContent = 'Choose the operation'; return; }
    if (!asAt) { err.textContent = 'Set the list date'; return; }
    // officer goes with each line so the explanation lands in the timeline as "Outstanding list as at <date> (<officer>): ..."
    const body = P.lines.map(l => { const x = Object.assign({}, l); delete x._rp; delete x._cp; delete x._ad; x.details = Object.assign({}, x.details, {officer: P.officer || ''}); return x; });
    try {
      const r = await api('/rest/v1/rpc/fu_apply_import', {method: 'POST', body: {p_module: 'receivable', p_op: o, p_as_at: asAt, p_file: P.file, p_rows: body}});
      let nc = 0;
      try { nc = await contacts(o, P.lines); } catch (e) { toast('Invoices loaded. Contacts not saved: ' + e.message); }
      U.p = null; await loadRows(); closeDrawer(); go('items', 'receivable');
      toast(o + ': ' + r.rows + ' invoices loaded (' + r.new + ' new, ' + r.closed + ' settled)' + (nc ? ', ' + nc + ' contacts updated' : ''));
    } catch (e) { err.textContent = e.message; }
  }
  // contacts from the file: only filled values, merged with what is saved, so nothing is blanked
  async function contacts(o, lines) {
    const out = {}, rep = {};
    lines.forEach(l => {
      if ((l._cp || l._ad) && l.outlet) { const k = nk(l.outlet), cur0 = CO[o + '|' + k] || {}; out[k] = out[k] || {operation: o, outlet_key: k, outlet: cur0.outlet || l.outlet, chain: cur0.chain || l.party || null, phone: cur0.phone || null, address: cur0.address || null, _ch: false};
        if (l._cp && l._cp !== out[k].phone) { out[k].phone = l._cp; out[k]._ch = true; } if (l._ad && l._ad !== out[k].address) { out[k].address = l._ad; out[k]._ch = true; } }
      if (l._rp && l.owner_name) { const k = nk(l.owner_name), c0 = CR[o + '|' + k] || {}; if (l._rp !== c0.phone) rep[k] = {operation: o, rep_key: k, rep_name: c0.rep_name || l.owner_name, phone: l._rp}; }
    });
    const ob = Object.values(out).filter(x => x._ch).map(x => { delete x._ch; return x; }), rb = Object.values(rep), hd = {Prefer: 'resolution=merge-duplicates,return=minimal'};
    if (ob.length) await api('/rest/v1/fu_outlets?on_conflict=operation,outlet_key', {method: 'POST', headers: hd, body: ob});
    if (rb.length) await api('/rest/v1/fu_reps?on_conflict=operation,rep_key', {method: 'POST', headers: hd, body: rb});
    return ob.length + rb.length;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-uact2]'); if (!b || b.disabled) return;
    const k = b.dataset.uact2;
    if (k === 'open') { U.p = null; drawer(); } else if (k === 'close') closeDrawer(); else if (k === 'load') guard(load);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'osFile' && t.files[0]) read(t.files[0]).catch(er => { U.p = null; drawer('Could not read the file: ' + er.message); });
    else if (t.id === 'osOp' && U.p) { U.p.op = t.value; drawer(); }
    else if (t.id === 'osAsAt' && U.p) U.p.asAt = t.value;
  });
})();
