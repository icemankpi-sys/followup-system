// Iceman IMS: Operations card on the Permission page (admin only, v2.5, 2026-11-02). Add a new operation or rename one.
// Codes never change and nothing is deleted. Uses the main script's globals at run time (api, $, esc, ops, me, toast, guard, renderUsers).
(function () {
  let open = false;
  window.opsCard = function () {
    if (!me || me.role !== 'admin' || !$('page')) return;
    const c = document.createElement('div'); c.className = 'card'; c.style.marginTop = '12px'; c.id = 'opsCard';
    c.innerHTML = '<div class="row2" style="justify-content:space-between"><h3>Operations (' + ops.length + ')</h3><button class="btn" data-oc="toggle">' + (open ? 'Hide' : 'Show / add') + '</button></div>'
      + (open ? '<div class="hint">A new operation shows at once in every operation list (access, follow-up, uploads) and gets a Daily Collection line with the same name. Codes cannot be changed later.</div>'
        + '<div class="wrap" style="box-shadow:none"><table><thead><tr><th>Code</th><th>Name</th><th></th></tr></thead><tbody>'
        + ops.map(o => '<tr><td><b>' + esc(o.code) + '</b></td><td><input id="on_' + esc(o.code) + '" value="' + esc(o.name) + '" maxlength="60" style="min-width:220px"></td><td><button class="btn" data-oc="ren" data-code="' + esc(o.code) + '">Save name</button></td></tr>').join('')
        + '</tbody></table></div><div class="row2" style="margin-top:8px"><b>New:</b><input id="ocCode" maxlength="6" placeholder="Code, e.g. MTG" style="width:120px;text-transform:uppercase"><input id="ocName" maxlength="60" placeholder="Name, e.g. MT Galle" style="min-width:200px">'
        + '<select id="ocCo"><option>CCS</option><option>DIS</option></select><button class="btn p" data-oc="add">Add operation</button></div><div class="err" id="ocErr"></div>' : '');
    const first = $('page').querySelector('.card'); if (first && first.nextSibling) $('page').insertBefore(c, first.nextSibling); else $('page').appendChild(c);
  };
  async function reloadOps(msg) {
    ops = await api('/rest/v1/operations?select=code,name&order=sort') || ops;
    renderUsers(''); toast(msg);
  }
  async function add() {
    const code = $('ocCode').value.trim().toUpperCase(), name = $('ocName').value.trim();
    if (!/^[A-Z0-9]{2,6}$/.test(code)) { $('ocErr').textContent = 'Code must be 2 to 6 capital letters or numbers'; return; }
    if (!name) { $('ocErr').textContent = 'Write the name'; return; }
    if (ops.some(o => o.code === code)) { $('ocErr').textContent = 'Code ' + code + ' is already used'; return; }
    if (ops.some(o => nk(o.name) === nk(name))) { $('ocErr').textContent = 'An operation with this name is already there'; return; }
    try { await api('/rest/v1/rpc/fu_add_operation', {method: 'POST', body: {p_code: code, p_name: name, p_company: $('ocCo').value}}); await reloadOps(code + ' - ' + name + ' added'); }
    catch (e) { $('ocErr').textContent = e.message; }
  }
  async function ren(code) {
    const name = $('on_' + code).value.trim(), o = ops.find(x => x.code === code);
    if (!name || (o && o.name === name)) { $('ocErr').textContent = 'Nothing changed'; return; }
    try { await api('/rest/v1/rpc/fu_rename_operation', {method: 'POST', body: {p_code: code, p_name: name}}); await reloadOps(code + ' renamed to ' + name); }
    catch (e) { $('ocErr').textContent = e.message; }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-oc]'); if (!b) return;
    const k = b.dataset.oc;
    if (k === 'toggle') { open = !open; renderUsers(''); }
    else if (k === 'add') guard(add);
    else if (k === 'ren') guard(() => ren(b.dataset.code));
  });
})();
