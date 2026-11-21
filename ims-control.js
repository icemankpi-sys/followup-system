// Iceman IMS v6.2 (2026-11-21, Oshan) - Control Board (Admin only):
// Outstanding block date e-mails. For each operation: the officer's e-mail, CC, System Block days (stop supply when the
// oldest invoice reaches this age, counted from the invoice date) and how many days before to warn.
// 99 System\Send-BlockAlerts.ps1 reads these rows after the morning C40 sync and e-mails each officer the outlets that are
// close to the block date (and, if ticked, the ones already over it). Table: os_alert_settings, log: os_alert_log (Supabase/46).
(function () {
  const n = v => Number(v || 0), e = s => esc(s == null ? '' : String(s));
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const okMails = s => !s || s.split(/[;,]/).map(x => x.trim()).filter(Boolean).every(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const cleanMails = s => (s || '').split(/[;,]/).map(x => x.trim()).filter(Boolean).join(', ');
  let SET = [], LOG = [];
  const opName = c => { const o = (window.ops || []).find(x => x.code === c); return o ? o.name : c; };
  function preview(s) {
    const cust = (window.rows || []).filter(r => window.isCustRow && isCustRow(r) && r.operation === s.operation && (typeof isActive !== 'function' || isActive(r)));
    const lo = n(s.block_days) - n(s.warn_days), hi = n(s.block_days);
    const near = cust.filter(r => r.aging_days != null && r.aging_days >= lo && r.aging_days < hi), over = cust.filter(r => r.aging_days != null && r.aging_days >= hi);
    return {near: near.length, over: over.length, nearAmt: near.reduce((a, r) => a + n(r.amount), 0), overAmt: over.reduce((a, r) => a + n(r.amount), 0)};
  }
  const modeSel = (id, v) => '<select data-cb="mode" data-op="' + e(id) + '">' + [['off', 'Off'], ['test', 'Test (to me only)'], ['live', 'Live (to officer)']].map(x => '<option value="' + x[0] + '"' + (v === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>';
  async function load() {
    [SET, LOG] = await Promise.all([
      api('/rest/v1/os_alert_settings?select=*&order=operation'),
      api('/rest/v1/os_alert_log?select=*&order=sent_at.desc&limit=60').catch(() => [])]);
  }
  function render() {
    const G = SET.find(s => s.operation === '*') || {operation: '*', block_days: 60, warn_days: 10, mode: 'test', send_days: 'Mon,Tue,Wed,Thu,Fri,Sat'};
    const list = SET.filter(s => s.operation !== '*');
    const lastOf = c => LOG.find(l => l.operation === c);
    const sd = (G.send_days || '').split(',');
    const fmtDT2 = s => s ? (typeof fmtDT === 'function' ? fmtDT(new Date(s)) : String(s).slice(0, 16).replace('T', ' ')) : '';
    $('page').innerHTML = '<h2 class="pt">Control Board <span class="hint">Outstanding · block date e-mails</span></h2>'
      + '<div class="hint" style="margin-bottom:8px">Every morning, after the C40 update, each Outstanding officer gets one e-mail with the outlets whose oldest unpaid invoice will reach the <b>System Block</b> age within the warning days (and, if ticked, the outlets already over it). Days are counted from the invoice date. An officer with nothing in the list gets no mail. <b>Test</b> sends the mail only to the test address below; <b>Live</b> sends it to the officer and CC.</div>'
      + '<div class="card"><h3>All operations (global)</h3><div class="filters" style="align-items:flex-end;flex-wrap:wrap;gap:10px">'
      + '<label>Master switch<br>' + modeSel('*', G.mode) + '</label>'
      + '<label>Test address (Test mode mails go here)<br><input data-cb="to_emails" data-op="*" value="' + e(G.to_emails) + '" placeholder="your e-mail" style="min-width:240px"></label>'
      + '<label>Always CC (Live mode)<br><input data-cb="cc_emails" data-op="*" value="' + e(G.cc_emails) + '" placeholder="e.g. Director, you" style="min-width:240px"></label>'
      + '<label>Default block days<br><input type="number" min="1" max="400" data-cb="block_days" data-op="*" value="' + n(G.block_days) + '" style="width:80px"></label>'
      + '<label>Default warn days before<br><input type="number" min="0" max="120" data-cb="warn_days" data-op="*" value="' + n(G.warn_days) + '" style="width:80px"></label>'
      + '<div>Send on<br>' + DAYS.map(d => '<label style="margin-right:6px"><input type="checkbox" data-cbday="' + d + '"' + (sd.includes(d) ? ' checked' : '') + '> ' + d + '</label>').join('') + '</div>'
      + '<button class="btn p" data-cbact="saveg">Save global</button><button class="btn" data-cbact="applyall" title="Copy the default block / warn days to every operation">Use defaults for all operations</button></div>'
      + '<div class="hint">Master switch: Off = no mails at all · Test = every operation\'s mail goes only to the test address · Live = each operation follows its own mode below.</div></div>'
      + '<div class="card" style="margin-top:10px"><div class="row2" style="justify-content:space-between"><h3>By operation</h3><button class="btn p" data-cbact="saveall">Save all changes</button></div>'
      + '<div class="wrap"><table style="min-width:1350px"><thead><tr><th>Operation</th><th>Officer</th><th>Officer e-mail(s)</th><th>CC (Operation Head etc.)</th><th class="n">Block days</th><th class="n">Warn days before</th><th class="n">Warn from day</th><th>Also list outlets over block</th><th>Mode</th><th class="n">Today: near block</th><th class="n">Today: over block</th><th>Last mail</th></tr></thead><tbody>'
      + list.map(s => { const p = preview(s), l = lastOf(s.operation); return '<tr data-row="' + e(s.operation) + '"><td><b>' + e(s.operation) + '</b> <span class="hint">' + e(opName(s.operation)) + '</span></td>'
        + '<td><input data-cb="officer" data-op="' + e(s.operation) + '" value="' + e(s.officer) + '" style="width:150px"></td>'
        + '<td><input data-cb="to_emails" data-op="' + e(s.operation) + '" value="' + e(s.to_emails) + '" placeholder="name@icemanlk.com" style="width:210px"></td>'
        + '<td><input data-cb="cc_emails" data-op="' + e(s.operation) + '" value="' + e(s.cc_emails) + '" placeholder="optional" style="width:190px"></td>'
        + '<td class="n"><input type="number" min="1" max="400" data-cb="block_days" data-op="' + e(s.operation) + '" value="' + n(s.block_days) + '" style="width:64px"></td>'
        + '<td class="n"><input type="number" min="0" max="120" data-cb="warn_days" data-op="' + e(s.operation) + '" value="' + n(s.warn_days) + '" style="width:64px"></td>'
        + '<td class="n" data-from="' + e(s.operation) + '">' + (n(s.block_days) - n(s.warn_days)) + '</td>'
        + '<td><input type="checkbox" data-cb="include_over" data-op="' + e(s.operation) + '"' + (s.include_over ? ' checked' : '') + '></td>'
        + '<td>' + modeSel(s.operation, s.mode) + '</td>'
        + '<td class="n">' + p.near + (p.near ? '<br><span class="hint">' + money0(p.nearAmt) + '</span>' : '') + '</td><td class="n">' + p.over + (p.over ? '<br><span class="hint">' + money0(p.overAmt) + '</span>' : '') + '</td>'
        + '<td>' + (l ? '<span class="tag t-' + (/sent/i.test(l.status) ? 'g' : /skip|no outlets/i.test(l.status) ? 'b' : 'r') + '">' + e(l.status) + '</span><br><span class="hint">' + e(fmtDT2(l.sent_at)) + ' · ' + e(l.mode) + '</span>' : '<span class="hint">never</span>') + '</td></tr>'; }).join('')
      + '</tbody></table></div><div class="hint" style="margin-top:6px">Today counts are customers by their oldest Over 30 invoice (a quick guide; the mail itself is built from every invoice in the C40 export). Several e-mails: separate with a comma. Last change: ' + e((list.concat([G]).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || {}).updated_by || '') + '</div></div>'
      + '<div class="card" style="margin-top:10px"><h3>Mail log (last 60)</h3><div class="wrap"><table style="min-width:900px"><thead><tr><th>Sent</th><th>C40 as at</th><th>Operation</th><th>Mode</th><th>To</th><th>CC</th><th class="n">Near block</th><th class="n">Over block</th><th>Status</th></tr></thead><tbody>'
      + (LOG.length ? LOG.map(l => '<tr><td>' + e(fmtDT2(l.sent_at)) + '</td><td>' + e(l.as_at) + '</td><td>' + e(l.operation) + '</td><td>' + e(l.mode) + '</td><td>' + e(l.to_emails) + '</td><td>' + e(l.cc_emails) + '</td><td class="n">' + n(l.near_n) + (l.near_amt ? ' · ' + money0(l.near_amt) : '') + '</td><td class="n">' + n(l.over_n) + (l.over_amt ? ' · ' + money0(l.over_amt) : '') + '</td><td>' + e(l.status) + (l.detail ? ' <span class="hint">' + e(l.detail) + '</span>' : '') + '</td></tr>').join('') : '<tr><td colspan="9" class="hint">No mails sent yet.</td></tr>')
      + '</tbody></table></div></div>';
  }
  function collect(opCode) {
    const g = k => { const el = document.querySelector('[data-cb="' + k + '"][data-op="' + CSS.escape(opCode) + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
    const o = {operation: opCode, to_emails: cleanMails(g('to_emails')), cc_emails: cleanMails(g('cc_emails')), block_days: Math.round(n(g('block_days'))), warn_days: Math.round(n(g('warn_days'))), mode: g('mode')};
    if (opCode === '*') o.send_days = [...document.querySelectorAll('[data-cbday]')].filter(x => x.checked).map(x => x.dataset.cbday).join(',');
    else { o.officer = (g('officer') || '').trim(); o.include_over = !!g('include_over'); }
    if (!okMails(o.to_emails) || !okMails(o.cc_emails)) throw new Error(opCode + ': check the e-mail address (several: separate with a comma)');
    if (!(o.block_days >= 1 && o.block_days <= 400)) throw new Error(opCode + ': block days must be 1 to 400');
    if (!(o.warn_days >= 0 && o.warn_days <= 120) || o.warn_days >= o.block_days) throw new Error(opCode + ': warn days must be less than the block days');
    if (opCode !== '*' && o.mode === 'live' && !o.to_emails) throw new Error(opCode + ': Live needs the officer e-mail');
    return o;
  }
  const changed = (o) => { const s = SET.find(x => x.operation === o.operation) || {}; return Object.keys(o).some(k => String(o[k] == null ? '' : o[k]) !== String(s[k] == null ? '' : s[k])); };
  async function save(list) {
    const ch = list.filter(changed);
    if (!ch.length) { toast('No changes'); return; }
    await api('/rest/v1/os_alert_settings?on_conflict=operation', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body: ch});
    toast(ch.length + ' row(s) saved'); await load(); render();
  }
  window.pgControl = async function () {
    if (!me || me.role !== 'admin') { $('page').innerHTML = '<div class="card">Control Board is for Admin only.</div>'; return; }
    $('page').innerHTML = '<div class="hint">Loading...</div>';
    try { if (window.osWarm) await osWarm(); await load(); render(); } catch (x) { $('page').innerHTML = '<div class="card err">' + e(x.message || x) + '<br>Run Supabase/46 block date email alerts.sql first.</div>'; }
  };
  document.addEventListener('input', ev => { const t = ev.target; if (t.dataset && (t.dataset.cb === 'block_days' || t.dataset.cb === 'warn_days') && t.dataset.op !== '*') { const op = t.dataset.op, td = document.querySelector('[data-from="' + CSS.escape(op) + '"]'); const b = document.querySelector('[data-cb="block_days"][data-op="' + CSS.escape(op) + '"]'), w = document.querySelector('[data-cb="warn_days"][data-op="' + CSS.escape(op) + '"]'); if (td && b && w) td.textContent = n(b.value) - n(w.value); } });
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-cbact]'); if (!b) return;
    const run = async () => {
      try {
        if (b.dataset.cbact === 'saveg') await save([collect('*')]);
        else if (b.dataset.cbact === 'saveall') await save(SET.filter(s => s.operation !== '*').map(s => collect(s.operation)));
        else if (b.dataset.cbact === 'applyall') { const g = collect('*'); SET.filter(s => s.operation !== '*').forEach(s => { const q = c => document.querySelector('[data-cb="' + c + '"][data-op="' + CSS.escape(s.operation) + '"]'); q('block_days').value = g.block_days; q('warn_days').value = g.warn_days; q('block_days').dispatchEvent(new Event('input', {bubbles: true})); }); toast('Defaults copied; press "Save all changes"'); }
      } catch (x) { toast(x.message || String(x)); }
    };
    if (typeof guard === 'function') guard(run); else run();
  });
})();
