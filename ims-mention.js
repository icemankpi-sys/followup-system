// Iceman IMS: @mention in remarks + "My to-do" on the Home page (v2.7, 2026-11-02).
// Type @ in any remark box, pick a member; on Post the member gets a to-do. Uses the main script's globals at run time
// (api, $, esc, me, sess, money, fmtDT, toast, guard, closeDrawer, openRecord, go, page).
(function () {
  let people = null;
  window.MY_MENTIONS = []; window.SENT_MENTIONS = [];
  async function loadPeople() { if (!people) { try { people = await api('/rest/v1/rpc/fu_people', {method: 'POST', body: {}}) || []; } catch (e) { people = []; } } return people; }
  window.loadMentions = async function () {
    if (!sess || !sess.user) return;
    const uid = sess.user.id, sel = 'select=id,item_id,to_user,by_user,by_name,by_title,note,created_at,done_at,module,operation,outlet,ref_key,amount,rec_code,to_name';
    try {
      const [mine, sent] = await Promise.all([api('/rest/v1/v_my_mentions?' + sel + '&to_user=eq.' + uid + '&done_at=is.null&order=created_at.desc&limit=200'),
        api('/rest/v1/v_my_mentions?' + sel + '&by_user=eq.' + uid + '&done_at=is.null&order=created_at.desc&limit=50')]);
      MY_MENTIONS = mine || []; SENT_MENTIONS = sent || [];
    } catch (e) { MY_MENTIONS = []; SENT_MENTIONS = []; }
    loadPeople();
  };

  // ---------- picker ----------
  const BOX = ['dNote', 'sNote'];
  let pick = null;   // {el, start, list, i}
  function closePick() { const d = $('mnPick'); if (d) d.remove(); pick = null; }
  async function onType(el) {
    const pos = el.selectionStart, before = el.value.slice(0, pos), m = before.match(/(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/);
    if (!m) { closePick(); return; }
    const q = m[2].toLowerCase(), all = await loadPeople();
    const list = all.filter(p => p.id !== (sess && sess.user && sess.user.id) && (!q || p.full_name.toLowerCase().includes(q))).slice(0, 8);
    if (!list.length) { closePick(); return; }
    pick = {el, start: pos - m[2].length - 1, list, i: 0};
    let d = $('mnPick'); if (!d) { d = document.createElement('div'); d.id = 'mnPick'; d.className = 'mnpick'; el.parentNode.insertBefore(d, el.nextSibling); }
    d.innerHTML = '<div class="hint">Mention a member: they get it on their To-do</div>' + list.map((p, k) => '<button type="button" data-mn="' + k + '"' + (k === 0 ? ' class="on"' : '') + '><b>' + esc(p.full_name) + '</b>' + (p.job_title ? ' <span class="hint">' + esc(p.job_title) + '</span>' : '') + '</button>').join('');
  }
  function choose(k) {
    if (!pick) return; const p = pick.list[k], el = pick.el, pos = el.selectionStart;
    el.value = el.value.slice(0, pick.start) + '@' + p.full_name + ' ' + el.value.slice(pos);
    el._mn = el._mn || {}; el._mn[p.full_name] = p.id;
    const c = pick.start + p.full_name.length + 2; closePick(); el.focus(); el.setSelectionRange(c, c);
  }
  // ids of the members still written in the box
  window.mentionsOf = el => { if (!el || !el._mn) return []; return Object.keys(el._mn).filter(n => el.value.includes('@' + n)).map(n => el._mn[n]); };
  window.mentionResult = res => {
    if (!res) return '';
    const a = res.mentioned || [], b = res.no_access || [];
    if (a.length) loadMentions();   // refresh "Waiting on others"
    if (b.length) alertBox('Not added to the To-do of ' + b.join(', ') + ': they have no access to this record. Give access on the Permission page and mention them again.');
    return a.length ? ' · on the To-do of ' + a.join(', ') : '';
  };
  function alertBox(msg) { const t = document.createElement('div'); t.className = 'mnwarn'; t.textContent = msg; t.onclick = () => t.remove(); document.body.appendChild(t); setTimeout(() => t.remove(), 9000); }
  document.addEventListener('input', e => { if (BOX.includes(e.target.id)) onType(e.target); });
  document.addEventListener('keydown', e => {
    if (!pick || e.target !== pick.el) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pick.i = (pick.i + (e.key === 'ArrowDown' ? 1 : pick.list.length - 1)) % pick.list.length; document.querySelectorAll('#mnPick [data-mn]').forEach((b, k) => b.classList.toggle('on', k === pick.i)); }
    else if (e.key === 'Enter' || e.key === 'Tab') { if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); choose(pick.i); } }
    else if (e.key === 'Escape') { e.stopPropagation(); closePick(); }
  }, true);
  document.addEventListener('mousedown', e => { const b = e.target.closest('[data-mn]'); if (b) { e.preventDefault(); choose(Number(b.dataset.mn)); } else if (!e.target.closest('#mnPick')) closePick(); });

  // @Name shown bold in the timeline (text is already escaped)
  window.hlMentions = html => { if (!people || !people.length) return html; let h = html; people.forEach(p => { const n = esc(p.full_name); h = h.split('@' + n).join('<b class="mn">@' + n + '</b>'); }); return h; };

  // ---------- Home: My to-do ----------
  const openItem = m => { if (m.module === 'short_expiry') location.hash = 'se/' + m.item_id; else openRecord(m.item_id); };
  const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 3600 ? Math.max(1, Math.round(s / 60)) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
  window.mentionCard = function () {
    const row = (m, mine) => '<div class="mnrow"><div class="mnmain" data-mnopen="' + m.id + '"><div><span class="rtag">' + esc(m.rec_code || '') + '</span> <b>' + esc(m.outlet || '') + '</b> <span class="hint">' + esc(m.operation) + (m.amount ? ' · ' + money(m.amount) : '') + '</span></div>'
      + '<div class="mnnote">' + hlMentions(esc(m.note || '')) + '</div><div class="hint">' + (mine ? 'from <b>' + esc(m.by_name || '') + '</b>' + (m.by_title ? ' (' + esc(m.by_title) + ')' : '') : 'to <b>' + esc(m.to_name || 'member') + '</b>') + ' · ' + esc(ago(m.created_at)) + '</div></div>'
      + (mine ? '<button class="btn" data-mndone="' + m.id + '">Done</button>' : '') + '</div>';
    return '<div class="card" style="margin-top:12px"><div class="row2" style="justify-content:space-between"><h3>My to-do (' + MY_MENTIONS.length + ')</h3><span class="hint">Remarks where someone mentioned you with @</span></div>'
      + (MY_MENTIONS.length ? MY_MENTIONS.map(m => row(m, true)).join('') : '<div class="hint">Nothing for you. When someone writes @' + esc(me.full_name || 'your name') + ' in a remark, it comes here.</div>')
      + (SENT_MENTIONS.length ? '<h4 class="dh4" style="margin-top:12px">Waiting on others (' + SENT_MENTIONS.length + ')</h4>' + SENT_MENTIONS.map(m => row(m, false)).join('') : '') + '</div>';
  };
  function doneDrawer(m) {
    $('panel').innerHTML = '<div class="dh"><div><h3>Mark done</h3><div class="hint">' + esc(m.rec_code || '') + ' · ' + esc(m.outlet || '') + ' · from ' + esc(m.by_name || '') + '</div></div><button class="btn" data-mnact="close">Close</button></div><div class="frm">'
      + '<div class="mnnote" style="margin-bottom:8px">' + hlMentions(esc(m.note || '')) + '</div>'
      + '<label>Reply (optional, goes into the record\'s timeline)</label><textarea id="mnReply" rows="3" maxlength="1500" placeholder="e.g. Checked with the customer, they will pay on Friday"></textarea>'
      + '<div class="row2"><button class="btn p" data-mnact="save" data-id="' + m.id + '">Done</button><button class="btn" data-mnact="open" data-id="' + m.id + '">Open the record</button></div><div class="err" id="mnErr"></div></div>';
    $('panel').classList.add('open');
  }
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-mnopen]'); if (o) { const m = MY_MENTIONS.concat(SENT_MENTIONS).find(x => String(x.id) === o.dataset.mnopen); if (m) openItem(m); return; }
    const d = e.target.closest('[data-mndone]'); if (d) { const m = MY_MENTIONS.find(x => String(x.id) === d.dataset.mndone); if (m) doneDrawer(m); return; }
    const a = e.target.closest('[data-mnact]'); if (!a) return;
    if (a.dataset.mnact === 'close') closeDrawer();
    else if (a.dataset.mnact === 'open') { const m = MY_MENTIONS.find(x => String(x.id) === a.dataset.id); closeDrawer(); if (m) openItem(m); }
    else if (a.dataset.mnact === 'save') guard(async () => {
      try { await api('/rest/v1/rpc/fu_mention_done', {method: 'POST', body: {p_id: Number(a.dataset.id), p_reply: $('mnReply').value.trim() || null}}); closeDrawer(); await loadMentions(); go(); toast('Marked done'); }
      catch (er) { $('mnErr').textContent = er.message; }
    });
  });
})();
