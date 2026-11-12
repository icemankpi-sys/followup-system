// ims-perm.js v1 (2026-11-09): faster, simpler Permission page.
// One access editor per user (side drawer): pick a role template, tick operations, set a level per module, Save once.
// Saving sends ONE upsert (all rows) + ONE delete + ONE profile patch, then reloads the list once.
// Replaces renderUsers / permClick from index.html (same data: fu_access rows user_id + module + operation + level).
(function () {
  const LV = ['none', 'view', 'edit', 'full'];
  const LVTXT = {none: 'None', view: 'View', edit: 'Edit', full: 'Full'};
  const ROLES = [
    {k: 'rep', name: 'Sales Rep', job: 'Sales Rep', hint: 'Own outstanding and to-do (phone app)', m: {rep: 'edit'}, needRep: true},
    {k: 'ophead', name: 'Operation Head', job: 'Operation Head', hint: 'Outstanding, reps, team, expiry', m: {receivable: 'edit', rep: 'view', team: 'full', collection: 'view', short_expiry: 'edit'}},
    {k: 'officer', name: 'Operation Officer', job: 'Operation Officer', hint: 'Daily collection entry', m: {collection: 'edit'}},
    {k: 'accountant', name: 'Accountant', job: 'Accountant', hint: 'Account: Daily Collection entry for the ticked operations', m: {collection: 'edit'}},
    {k: 'finance', name: 'Finance', job: 'Accounts', hint: 'Collection, FOC, outstanding view', m: {collection: 'full', receivable: 'view', short_expiry: 'view', foc: 'full'}},
    {k: 'stores', name: 'Stores', job: 'Stores Officer', hint: 'Short expiry upload', m: {short_expiry: 'full'}},
    {k: 'director', name: 'Director', job: 'Director', hint: 'Everything, view + remarks', m: {'*': 'view'}, allOps: true},
    {k: 'legal', name: 'Legal Officer', job: 'Legal Officer', hint: 'Outstanding view + remarks', m: {receivable: 'view'}, allOps: true}];
  // only these modules can be given in fu_access (fu_access_module_check, Supabase/33 added 'team'); Outlets / Visit History / Running Chart come with Sales Reps or Rep Team
  const GRANT = ['receivable', 'rep', 'team', 'collection', 'foc', 'short_expiry', 'grn', 'kpi'];
  // v4.8: Accountant = job title "Accountant" with Daily Collection edit / full; assigned per operation by ticking operations in the editor
  const isAcct = u => /accountant/i.test(u.job_title || '');
  function acctCard() {
    const rowsH = ops.map(o => {
      const who = uData.users.filter(u => u.active && u.role !== 'admin' && isAcct(u) && accOf(u.id).some(a => ['collection', '*'].includes(a.module) && [o.code, '*'].includes(a.operation) && rk(a.level) >= 2));
      return '<tr><td><b>' + esc(o.code) + '</b> ' + esc(o.name) + '</td><td>' + (who.length ? who.map(u => '<a data-uact="acc" data-id="' + u.id + '" style="cursor:pointer">' + esc(u.full_name || u.username) + '</a>').join(', ') : '<span class="tag t-r">not assigned</span>') + '</td></tr>'; }).join('');
    return '<div class="card" style="margin-top:12px"><h3>Accountants by operation</h3><div class="hint">An Accountant enters the Daily Collection of the operations ticked for them (Account &rsaquo; Daily Collection). To assign: open the user, press the role "Accountant", tick the operations, Save.</div>'
      + '<div class="wrap" style="box-shadow:none"><table><thead><tr><th>Operation</th><th>Accountant</th></tr></thead><tbody>' + rowsH + '</tbody></table></div></div>';
  }
  const SUBS = {collection: 'Account · Daily collection vs weekly target · Edit = enter own operation, Full = also targets and lines', team: 'Manage reps · View = see reps, outlets, Rep Day · Edit = add reps, add / assign outlets · Full = also make rep app logins'};
  const MODLIST = () => [{id: '*', name: 'All modules', sub: 'Every module, now and later'}].concat(MODS.filter(m => GRANT.includes(m.id)).map(m => ({id: m.id, name: m.name, sub: (SUBS[m.id] || m.sub) + (m.ready ? '' : ' (coming)')})));
  const rk = l => ({none: 0, view: 1, edit: 2, full: 3}[l] || 0);
  let F = {q: '', show: 'all', newOpen: false}, E = null;   // E = editor state

  // ---------- styles ----------
  const css = document.createElement('style');
  css.textContent = `
.pm-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.pm-top h2{margin:0;flex:1}
.pm-search{flex:1;min-width:180px;max-width:340px}
.pm-chips{display:flex;gap:6px;flex-wrap:wrap}.pm-chip{border:1px solid var(--line2);background:var(--surface);border-radius:999px;padding:4px 11px;cursor:pointer;font-size:12.5px;color:var(--ink2)}
.pm-chip.on{background:var(--primary);border-color:var(--primary);color:var(--primary-ink);font-weight:600}
.pm-list{display:grid;gap:8px;margin-top:12px}
.pm-user{display:flex;gap:12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;cursor:pointer;flex-wrap:wrap}
.pm-user:hover{border-color:var(--primary)}.pm-user.off{opacity:.55}
.pm-av{width:38px;height:38px;border-radius:50%;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center;font-weight:700;flex:none}
.pm-who{flex:1 1 200px;min-width:0}.pm-who b{display:block}.pm-who small{display:block;color:var(--muted)}
.pm-un{display:inline-block;margin:2px 0;font-size:12px;font-family:Consolas,"Cascadia Mono",monospace;color:var(--primary);background:var(--primary-soft);border-radius:6px;padding:0 6px}
.pm-acc{flex:2 1 280px;min-width:0;display:flex;gap:4px;flex-wrap:wrap}
.pm-tag{border-radius:8px;padding:1px 8px;font-size:11.5px;background:var(--surface2);border:1px solid var(--line);white-space:nowrap}
.pm-tag i{font-style:normal;font-weight:700;margin-left:4px}.pm-tag.view i{color:var(--muted)}.pm-tag.edit i{color:var(--accent)}.pm-tag.full i{color:var(--ok)}
.pm-act{display:flex;gap:6px;flex-wrap:wrap}.pm-act .btn{padding:4px 10px;font-size:12.5px}
.pm-new{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-top:10px}
#pmBack{position:fixed;inset:0;background:rgba(10,15,30,.45);z-index:900}
#pmDrawer{position:fixed;top:0;right:0;bottom:0;width:min(640px,100vw);background:var(--bg);z-index:901;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(0,0,0,.25)}
.pm-dh{background:var(--head);color:var(--head-ink);padding:12px 16px;padding-top:max(12px,env(safe-area-inset-top));display:flex;gap:10px;align-items:center}
.pm-dh b{font-size:16px;flex:1}.pm-dh .hbtn{padding:4px 10px}
.pm-db{flex:1;overflow:auto;padding:14px 16px;display:grid;gap:14px;align-content:start}
.pm-sec{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px}
.pm-sec h4{margin:0 0 8px;font-size:13px;letter-spacing:.3px;color:var(--primary)}
.pm-sec h4 span{color:var(--muted);font-weight:400;letter-spacing:0}
.pm-roles{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px}
.pm-role{border:1px solid var(--line2);border-radius:10px;padding:7px 9px;cursor:pointer;background:var(--surface);text-align:left}
.pm-role b{display:block;font-size:13px}.pm-role small{color:var(--muted);font-size:11px}
.pm-role.on{border-color:var(--primary);background:var(--primary-soft)}
.pm-ops{display:flex;gap:6px;flex-wrap:wrap}
.pm-mods{display:grid;gap:4px}
.pm-mod{display:flex;align-items:center;gap:10px;padding:6px 4px;border-bottom:1px solid var(--line)}
.pm-mod:last-child{border-bottom:0}.pm-mod .nm{flex:1;min-width:0}.pm-mod .nm small{display:block;color:var(--muted);font-size:11px}
.pm-mod.cov .nm{opacity:.6}
.pm-seg{display:inline-flex;border:1px solid var(--line2);border-radius:8px;overflow:hidden;flex:none}
.pm-seg button{border:0;background:var(--surface);padding:4px 9px;font-size:12px;cursor:pointer;color:var(--ink2);border-right:1px solid var(--line2)}
.pm-seg button:last-child{border-right:0}
.pm-seg button.on[data-l=view]{background:var(--muted);color:#fff}.pm-seg button.on[data-l=edit]{background:var(--accent);color:#fff}
.pm-seg button.on[data-l=full]{background:var(--ok);color:#fff}.pm-seg button.on[data-l=none]{background:var(--line2);color:var(--ink)}
.pm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pm-grid2 label{font-size:12px;color:var(--muted);display:grid;gap:3px}
.pm-grid2 label.need input{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
.pm-df{border-top:1px solid var(--line);background:var(--surface);padding:10px 16px;padding-bottom:max(10px,env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pm-df .sum{flex:1;font-size:12.5px;color:var(--ink2);min-width:180px}
.pm-warn{background:var(--warn-soft);color:var(--warn);border-radius:8px;padding:7px 10px;font-size:12.5px}
.pm-legend{font-size:12px;color:var(--muted)}
@media(max-width:560px){.pm-grid2{grid-template-columns:1fr}.pm-seg button{padding:5px 7px}}
`;
  document.head.appendChild(css);

  // ---------- helpers ----------
  const opName = c => c === '*' ? 'All operations' : ((ops.find(o => o.code === c) || {}).name || c);
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const accOf = id => uData.access.filter(a => a.user_id === id);
  function summary(u) {
    if (u.role === 'admin') return '<span class="pm-tag full">Admin<i>everything</i></span>';
    const ac = accOf(u.id); if (!ac.length) return '<span class="pm-tag" style="color:var(--danger)">No access yet</span>';
    const by = {}; ac.forEach(a => { (by[a.module] = by[a.module] || {l: a.level, o: []}); if (rk(a.level) > rk(by[a.module].l)) by[a.module].l = a.level; by[a.module].o.push(a.operation); });
    return Object.keys(by).map(m => { const x = by[m], o = x.o.includes('*') ? 'all ops' : x.o.join(', ');
      return '<span class="pm-tag ' + x.l + '" title="' + esc(o) + '">' + esc(pmName(m)) + ' · ' + esc(o.length > 22 ? x.o.length + ' ops' : o) + '<i>' + x.l + '</i></span>'; }).join('');
  }

  // ---------- users page ----------
  renderUsers = function (msg) {
    const list = uData.users.filter(u => {
      const q = F.q.toLowerCase(), hit = !q || [u.full_name, u.username, u.rep_name, u.job_title].some(v => String(v || '').toLowerCase().includes(q));
      const s = F.show, ac = accOf(u.id).length;
      return hit && (s === 'all' || (s === 'admin' && u.role === 'admin') || (s === 'none' && u.role !== 'admin' && !ac && u.active) || (s === 'off' && !u.active) || (s === 'reps' && (u.rep_name || /rep/i.test(u.job_title || ''))) || (s === 'acct' && isAcct(u)));
    });
    const cnt = k => uData.users.filter(u => k === 'acct' ? isAcct(u) : k === 'admin' ? u.role === 'admin' : k === 'none' ? u.role !== 'admin' && !accOf(u.id).length && u.active : k === 'off' ? !u.active : k === 'reps' ? (u.rep_name || /rep/i.test(u.job_title || '')) : true).length;
    let h = '<div class="card"><div class="pm-top"><h2 class="pt" style="margin:0">Permission</h2><input id="pmQ" class="pm-search" placeholder="Search name, username, rep, job title" value="' + esc(F.q) + '"><button class="btn p" data-uact="newtoggle">+ New user</button></div>'
      + '<div class="pm-chips" style="margin-top:10px">' + [['all', 'All'], ['reps', 'Sales reps'], ['acct', 'Accountants'], ['none', 'No access'], ['admin', 'Admins'], ['off', 'Switched off']].map(c => '<button class="pm-chip' + (F.show === c[0] ? ' on' : '') + '" data-uact="show" data-id="' + c[0] + '">' + c[1] + ' (' + cnt(c[0]) + ')</button>').join('') + '</div>'
      + '<div class="err" id="uMsg" style="margin-top:6px">' + esc(msg || '') + '</div>'
      + (F.newOpen ? '<div class="pm-new"><input id="nName" placeholder="Full name"><input id="nUser" placeholder="Username or email"><input id="nPass" type="password" placeholder="Password (8+ characters)" autocomplete="new-password"><select id="nRole"><option value="user">User</option><option value="admin">Admin</option></select><button class="btn p" data-uact="create">Create and set access</button></div>' : '')
      + '</div>';
    if (F.show === 'acct') h += acctCard();
    h += '<div class="pm-list">' + (list.map(u => '<div class="pm-user' + (u.active ? '' : ' off') + '" data-uact="acc" data-id="' + u.id + '"><div class="pm-av">' + esc(initials(u.full_name || u.username)) + '</div>'
      + '<div class="pm-who"><b>' + esc(u.full_name || u.username) + (u.active ? '' : ' <span class="tag t-b">off</span>') + '</b><span class="pm-un">@' + esc(String(u.username || '').replace(/@iceman-followup\.local$/i, '')) + '</span><small>' + esc([u.job_title, u.rep_name ? 'rep: ' + u.rep_name : ''].filter(Boolean).join(' · ')) + '</small></div>'
      + '<div class="pm-acc">' + summary(u) + '</div>'
      + '<div class="pm-act"><button class="btn p" data-uact="acc" data-id="' + u.id + '">Edit access</button><button class="btn" data-uact="pwd" data-id="' + u.id + '">Password</button><button class="btn" data-uact="role" data-id="' + u.id + '">' + (u.role === 'admin' ? 'Make User' : 'Make Admin') + '</button><button class="btn d" data-uact="act" data-id="' + u.id + '">' + (u.active ? 'Switch off' : 'Switch on') + '</button></div></div>').join('') || '<div class="hint">No users match.</div>') + '</div>';
    $('page').innerHTML = h;
    if (window.opsCard) opsCard();
    const q = $('pmQ'); q.oninput = () => { F.q = q.value; const p = q.selectionStart; renderUsers($('uMsg').textContent); const n = $('pmQ'); n.focus(); n.setSelectionRange(p, p); };
    if (uSel && E && E.id === uSel) paintDrawer();
  };

  const reload = async msg => { uData = await fn({action: 'list'}); renderUsers(msg || ''); };
  permClick = async function (b) {
    const act = b.dataset.uact, id = b.dataset.id;
    try {
      if (act === 'show') { F.show = id; renderUsers(''); }
      else if (act === 'newtoggle') { F.newOpen = !F.newOpen; renderUsers(''); if (F.newOpen) $('nName').focus(); }
      else if (act === 'create') {
        const nm = nk($('nName').value), un = $('nUser').value.trim(), unk = un.toLowerCase().split('@')[0];
        const same = uData.users.filter(u => (nm && nk(u.full_name) === nm) || (unk && String(u.username || '').toLowerCase().split('@')[0] === unk));
        if (same.length && !permClick.dupOk) { permClick.dupOk = true; $('uMsg').textContent = 'Already exists: ' + same.map(u => (u.full_name || '') + ' (' + u.username + ')').join(', ') + '. Press again only if this is a different person.'; return; }
        permClick.dupOk = false;
        await fn({action: 'create', full_name: $('nName').value.trim(), username: un, password: $('nPass').value, role: $('nRole').value});
        F.newOpen = false; uData = await fn({action: 'list'});
        const nu = uData.users.find(u => String(u.username || '').toLowerCase().split('@')[0] === unk);
        renderUsers('User created. Set the access and press Save.'); if (nu && nu.role !== 'admin') openEditor(nu.id);
      }
      else if (act === 'acc') openEditor(id);
      else if (act === 'pwd') { const p = prompt('New password (8+ characters)'); if (!p) return; await fn({action: 'set_password', id, password: p}); $('uMsg').textContent = 'Password changed.'; }
      else if (act === 'role') { const u = uData.users.find(x => x.id === id); await fn({action: 'set_role', id, role: u.role === 'admin' ? 'user' : 'admin'}); await reload(); }
      else if (act === 'act') { const u = uData.users.find(x => x.id === id); await fn({action: 'set_role', id, active: !u.active}); await reload(); }
    } catch (er) { const m = $('uMsg'); if (m) m.textContent = er.message; }
  };

  // ---------- editor ----------
  function fromAccess(u) {
    const ac = accOf(u.id), opsSet = [...new Set(ac.map(a => a.operation))], lv = {};
    ac.forEach(a => { if (rk(a.level) > rk(lv[a.module] || 'none')) lv[a.module] = a.level; });
    // mixed = the rows are not one block (some module missing an operation, or a different level per operation)
    const mixed = Object.keys(lv).some(m => opsSet.some(o => { const r = ac.find(a => a.module === m && a.operation === o); return !r || r.level !== lv[m]; }));
    return {ops: opsSet, lv, mixed};
  }
  function openEditor(id) {
    const u = uData.users.find(x => x.id === id); if (!u) return;
    uSel = id; const s = fromAccess(u);
    E = {id, u, ops: s.ops, lv: s.lv, mixed: s.mixed, role: '', job: u.job_title || '', rep: u.rep_name || '', msg: ''};
    paintDrawer();
  }
  function closeEditor() { E = null; uSel = null; const d = $('pmDrawer'), b = $('pmBack'); if (d) d.remove(); if (b) b.remove(); }
  function desired() {
    const out = []; const opsL = E.ops.includes('*') ? ['*'] : E.ops;
    Object.keys(E.lv).forEach(m => { if (E.lv[m] && E.lv[m] !== 'none' && (m === '*' || GRANT.includes(m))) opsL.forEach(o => out.push({module: m, operation: o, level: E.lv[m]})); });
    return out;
  }
  function diff() {
    const want = desired(), have = accOf(E.id), key = r => r.module + '|' + r.operation;
    const hm = {}; have.forEach(r => hm[key(r)] = r); const wm = {}; want.forEach(r => wm[key(r)] = r);
    const up = want.filter(r => !hm[key(r)] || hm[key(r)].level !== r.level), del = have.filter(r => !wm[key(r)]);
    const prof = (E.job || '') !== (E.u.job_title || '') || (E.rep || '') !== (E.u.rep_name || '');
    // a mixed user keeps the rows as they are until the admin changes something in the access boxes
    if (E.mixed && !E.touched) return {want: have, up: [], del: [], prof};
    return {want, up, del, prof};
  }
  // Guard (2026-11-12): Sales Reps access needs a rep name that is on the list of one of the ticked operations (wrong name or wrong operation = the rep sees nothing)
  function repProblem() {
    const n = (E.rep || '').trim(); if (!n || !E.lv.rep || E.lv.rep === 'none') return '';
    const k = nk(n), all = window.imsRepNames ? imsRepNames() : [], found = all.find(x => nk(x.name) === k);
    if (!found) {
      const part = all.find(x => nk(x.name).length >= 6 && k.includes(nk(x.name)));
      return part ? 'The rep name looks like "' + part.name + '" (' + [...part.ops].join(', ') + ') with extra words. Pick that name from the list; write only the name.'
        : 'No outstanding line or outlet has the rep name "' + n + '". The rep will see nothing. Pick the name from the list.';
    }
    if (!E.ops.includes('*') && E.ops.length && !E.ops.some(o => found.ops.has(o))) return found.name + ' is a rep on ' + [...found.ops].join(', ') + ', but the ticked operations are ' + E.ops.join(', ') + '. Tick ' + [...found.ops].join(', ') + ' in "3. Operations".';
    return '';
  }
  function paintDrawer() {
    if (!E) return;
    if (!$('pmBack')) { const b = document.createElement('div'); b.id = 'pmBack'; b.onclick = closeEditor; document.body.appendChild(b); }
    let d = $('pmDrawer'); if (!d) { d = document.createElement('div'); d.id = 'pmDrawer'; document.body.appendChild(d); d.onclick = drawerClick; d.oninput = drawerInput; }
    const u = E.u, admin = u.role === 'admin', rl = ROLES.find(r => r.k === E.role), dd = diff(), allOps = E.ops.includes('*'), rp = admin ? '' : repProblem();
    const others = uData.users.filter(x => x.id !== u.id && x.role !== 'admin' && accOf(x.id).length);
    const coveredAll = E.lv['*'] && E.lv['*'] !== 'none';
    let h = '<div class="pm-dh"><div class="pm-av" style="background:#fff">' + esc(initials(u.full_name || u.username)) + '</div><b>' + esc(u.full_name || u.username) + '<br><small style="opacity:.75;font-weight:400">' + esc(u.username) + '</small></b><button class="hbtn" data-pm="close">Close</button></div><div class="pm-db">';
    if (admin) h += '<div class="pm-warn">This user is an Admin and can do everything. Use "Make User" on the list to give limited access.</div>';
    if (E.mixed) h += '<div class="pm-warn">' + (E.touched ? 'Save will replace the rows below with one level per module for the ticked operations.' : 'This user has different levels per operation. Nothing changes unless you change the boxes below.') + '<br>Now: ' + accOf(E.id).map(a => esc(pmName(a.module)) + ' / ' + esc(a.operation === '*' ? 'all' : a.operation) + ' ' + a.level).join(' · ') + '</div>';
    h += '<div class="pm-sec"><h4>1. Start from a role <span>(fills the boxes below, nothing is saved yet)</span></h4><div class="pm-roles">' + ROLES.map(r => '<button class="pm-role' + (E.role === r.k ? ' on' : '') + '" data-pm="role" data-k="' + r.k + '"><b>' + r.name + '</b><small>' + r.hint + '</small></button>').join('') + '<button class="pm-role" data-pm="clear"><b>Clear all</b><small>Remove every access</small></button></div>'
      + (others.length ? '<div class="row2" style="margin-top:8px"><span class="hint">or copy from</span><select id="pmCopy"><option value="">choose a user...</option>' + others.map(x => '<option value="' + x.id + '">' + esc(x.full_name || x.username) + (x.job_title ? ' · ' + esc(x.job_title) : '') + '</option>').join('') + '</select></div>' : '') + '</div>';
    h += '<div class="pm-sec"><h4>2. Profile</h4><div class="pm-grid2"><label>Job title (shown on remarks)<input id="pmJob" list="pmJobs" value="' + esc(E.job) + '" placeholder="e.g. Operation Head"></label><datalist id="pmJobs">' + ['Sales Rep', 'Operation Head', 'Operation Officer', 'Accountant', 'Accounts', 'Finance Manager', 'Director', 'Legal Officer', 'Stores Officer', 'AM Operations'].map(n => '<option value="' + n + '">').join('') + '</datalist>'
      + '<label class="' + (rl && rl.needRep && !E.rep ? 'need' : '') + '">Sales rep name (as in the outstanding list)' + '<input id="pmRep" list="pmReps" value="' + esc(E.rep) + '" placeholder="needed for the Sales Rep role"></label><datalist id="pmReps">' + [...new Set(rows.map(r => r.owner_name).filter(Boolean))].sort().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist></div>'
      + (rp ? '<div class="pm-warn" style="margin-top:8px">' + esc(rp) + '<div style="margin-top:6px"><button class="btn q" data-pm="repok">' + (E.repOk ? 'Will save anyway ✓ (tap to undo)' : 'Save anyway (new rep, not on any list yet)') + '</button></div></div>' : '') + '</div>';
    h += '<div class="pm-sec"><h4>3. Operations <span>(' + (allOps ? 'all' : E.ops.length) + ' ticked)</span></h4><div class="pm-ops"><button class="pm-chip' + (allOps ? ' on' : '') + '" data-pm="op" data-o="*">All operations</button>' + ops.map(o => '<button class="pm-chip' + (!allOps && E.ops.includes(o.code) ? ' on' : '') + '" data-pm="op" data-o="' + esc(o.code) + '" title="' + esc(o.name) + '"' + (allOps ? ' style="opacity:.5"' : '') + '>' + esc(o.code) + '</button>').join('') + '</div></div>';
    h += '<div class="pm-sec"><h4>4. What they can do</h4><div class="pm-legend">View = read only · Edit = update fields and add remarks · Full = edit + upload lists, write off, change data</div><div class="pm-mods" style="margin-top:6px">' + MODLIST().map(m => {
      const l = E.lv[m.id] || 'none';
      return '<div class="pm-mod' + (coveredAll && m.id !== '*' ? ' cov' : '') + '"><div class="nm"><b>' + esc(m.name) + '</b><small>' + esc(m.sub) + '</small></div><div class="pm-seg">' + LV.map(x => '<button data-pm="lv" data-m="' + m.id + '" data-l="' + x + '" class="' + (x === l ? 'on' : '') + '">' + LVTXT[x] + '</button>').join('') + '</div></div>'; }).join('') + '</div><div class="pm-legend" style="margin-top:8px">Each module shows only to people who have access to it. Outlets, Visit History and Running Chart come with Sales Reps or Rep Team access. Rep Team Full lets the person make app logins for reps (Sales Reps access only).</div></div>';
    h += '</div>';
    const chg = dd.up.length + dd.del.length + (dd.prof ? 1 : 0);
    const noOps = desired().length === 0 && Object.values(E.lv).some(l => l && l !== 'none');
    h += '<div class="pm-df"><div class="sum">' + (noOps ? '<span style="color:var(--danger)">Tick at least one operation.</span>' : (dd.want.length + ' access rows · ' + (chg ? '<b>' + chg + ' change' + (chg > 1 ? 's' : '') + '</b> to save' : 'no changes'))) + (E.msg ? '<br><span style="color:var(--danger)">' + esc(E.msg) + '</span>' : '') + '</div><button class="btn" data-pm="close">Cancel</button><button class="btn p" data-pm="save"' + (chg && !noOps && !admin && (!rp || E.repOk) ? '' : ' disabled') + '>Save</button></div>';
    const st = d.querySelector('.pm-db'), top = st ? st.scrollTop : 0;
    d.innerHTML = h; const nb = d.querySelector('.pm-db'); if (nb) nb.scrollTop = top;
    const cp = $('pmCopy'); if (cp) cp.onchange = () => { const s = fromAccess(uData.users.find(x => x.id === cp.value)); E.ops = s.ops; E.lv = s.lv; E.role = ''; E.touched = true; paintDrawer(); };
  }
  function drawerInput(e) { if (e.target.id === 'pmJob') { E.job = e.target.value; refreshFoot(); } else if (e.target.id === 'pmRep') { E.rep = e.target.value; E.repOk = false; refreshFoot(); } }
  function refreshFoot() { const a = document.activeElement, id = a && a.id, p = a && a.selectionStart; paintDrawer(); if (id && $(id)) { $(id).focus(); try { $(id).setSelectionRange(p, p); } catch (x) {} } }
  async function drawerClick(e) {
    const b = e.target.closest('[data-pm]'); if (!b || !E) return; const k = b.dataset.pm;
    if (k === 'close') return closeEditor();
    if (k === 'repok') { E.repOk = !E.repOk; return paintDrawer(); }
    if (['role','clear','op','lv'].includes(k)) E.touched = true;
    if (k === 'role') { const r = ROLES.find(x => x.k === b.dataset.k); E.role = r.k; E.lv = Object.assign({}, r.m); if (r.allOps) E.ops = ['*']; if (!E.job || ROLES.some(x => x.job === E.job)) E.job = r.job; return paintDrawer(); }
    if (k === 'clear') { E.role = ''; E.lv = {}; E.ops = []; return paintDrawer(); }
    if (k === 'op') { const o = b.dataset.o; if (o === '*') E.ops = E.ops.includes('*') ? [] : ['*']; else { E.ops = E.ops.filter(x => x !== '*'); E.ops = E.ops.includes(o) ? E.ops.filter(x => x !== o) : E.ops.concat(o); } return paintDrawer(); }
    if (k === 'lv') { E.lv[b.dataset.m] = b.dataset.l; E.role = ''; return paintDrawer(); }
    if (k === 'save') {
      const dd = diff(); b.disabled = true; b.textContent = 'Saving...';
      try {
        if (dd.up.length) await api('/rest/v1/fu_access?on_conflict=user_id,module,operation', {method: 'POST', body: dd.up.map(r => ({user_id: E.id, module: r.module, operation: r.operation, level: r.level})), headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}});
        if (dd.del.length) await api('/rest/v1/fu_access?id=in.(' + dd.del.map(r => r.id).join(',') + ')', {method: 'DELETE', headers: {Prefer: 'return=minimal'}});
        if (dd.prof) await api('/rest/v1/profiles?id=eq.' + E.id, {method: 'PATCH', body: {job_title: E.job.trim() || null, rep_name: E.rep.trim() || null}, headers: {Prefer: 'return=minimal'}});
        const nm = E.u.full_name || E.u.username; closeEditor(); await reload('Saved access for ' + nm + '.');
      } catch (er) { E.msg = er.message; paintDrawer(); }
    }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && E) closeEditor(); });
  // leaving the Permission page closes the drawer
  const _go = window.go; if (typeof _go === 'function') window.go = function () { if (E) closeEditor(); return _go.apply(this, arguments); };
})();
