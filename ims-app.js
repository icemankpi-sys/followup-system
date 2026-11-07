// Iceman IMS - phone app (2026-11-03, Oshan): installs on Android from Chrome (PWA), and a "My day" card for sales reps on Home.
// Loaded before the main script; uses the main script's globals at run time (me, rows, op, F, go, nk, esc, money0, sum, isActive, isO120, ageDays, AGES, inBand, MY_MENTIONS).
(function () {
  // ---------- install ----------
  // sw.js keeps the app's own files on the phone so it opens without signal; database calls are never cached
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  let prompt = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; paint(); });
  window.addEventListener('appinstalled', () => { prompt = null; paint(); });
  function paint() {
    const h = document.querySelector('header'); if (!h) return;
    let b = document.getElementById('instBtn');
    if (!prompt || standalone()) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('button'); b.id = 'instBtn'; b.className = 'hbtn'; b.innerHTML = '&#128242; Install app'; b.onclick = install; h.insertBefore(b, document.getElementById('logout')); }
  }
  async function install() {
    if (!prompt) return;
    prompt.prompt(); try { await prompt.userChoice; } catch (e) {}
    prompt = null; paint();
  }
  if (standalone()) document.documentElement.classList.add('is-app');

  // v3.9: a sales rep's own view (rep name linked, not Admin, no edit rights on Outstanding): the phone app shows My Outlets in place of Dashboard
  window.imsRepView = () => { try { return !!(me && me.rep_name && me.role !== 'admin' && !ops.some(o => rank(lvl(o.code, 'receivable')) >= 2)); } catch (e) { return false; } };

  // ---------- rep "My day" card (Home) ----------
  const myName = () => (me && me.rep_name || '').trim();
  const mine = () => rows.filter(r => isActive(r) && (!op || r.operation === op) && nk(r.owner_name) === nk(myName()));
  const ownerOf = () => { const r = rows.find(x => nk(x.owner_name) === nk(myName())); return r ? r.owner_name : ''; };
  const BAND = {30: 'age-g', 60: 'age-g', 90: 'age-y', 120: 'age-o', 240: 'age-r'};
  window.repHomeCard = function () {
    if (!myName()) return '';
    const a = mine(), o120 = a.filter(isO120), todo = (window.MY_MENTIONS || []).length;
    const bands = AGES.map((g, i) => { const l = a.filter(r => inBand(r, g)); return {g, n: l.length, v: sum(l), label: 'Over ' + g + (AGES[i + 1] ? ' (' + (g + 1) + '-' + AGES[i + 1] + ')' : ' (241+)')}; }).filter(b => b.n);
    // v3.9: icon grid (same actions as before, plus to-do and outlets)
    const ic = k => window.imsIcon ? imsIcon(k) : '';
    const btn = (act, k, tx, c) => '<button class="ibtn' + (c ? ' ' + c : '') + '" data-app="' + act + '"><span class="ii">' + ic(k) + '</span>' + tx + '</button>';
    return '<div class="card myday"><h3>My day · ' + esc(myName()) + '</h3>'
      + '<div class="mtiles"><div class="mt"><b>' + money0(sum(a)) + '</b><span>My outstanding (' + a.length + ' invoices)</span></div>'
      + '<div class="mt r"><b>' + money0(sum(o120)) + '</b><span>Over 120 days (' + o120.length + ')</span></div>'
      + '<div class="mt a"><b>' + a.filter(r => r.action_overdue || r.promise_broken).length + '</b><span>Overdue / promise broken</span></div>'
      + '<div class="mt ' + (todo ? 'a' : 'g') + '"><b>' + todo + '</b><span>My to-do</span></div></div>'
      + '<div class="igrid">' + btn('list', 'cash', 'My outstanding') + btn('todo', 'todo', 'My to-do', 'c3') + btn('myol', 'store', 'My Outlets' + (window.myOutletCount ? ' (' + myOutletCount() + ')' : ''), 'c4') + btn('runs', 'car', 'Running chart', 'c2') + btn('visits', 'pin', 'Visit history', 'c5')
      + (ops.some(o => rank(lvl(o.code, 'rep')) >= 2 || rank(lvl(o.code, 'receivable')) >= 2) ? '<button class="ibtn" data-oact="new"><span class="ii">' + ic('pin') + '</span>New outlet</button>' : '') + '</div>'
      + (bands.length ? '<div class="bands" style="margin-top:12px">' + bands.map(b => '<button class="band ' + BAND[b.g] + '" data-app="band" data-g="' + b.g + '"><b>' + esc(b.label) + '</b><span>' + b.n + ' · ' + money0(b.v) + '</span></button>').join('') + '</div>' : '')
      + (!standalone() ? '<div class="hint inst">' + (prompt ? 'Put this app on your phone: <button class="btn" data-app="install">&#128242; Install app</button>' : 'Phone app: open this page in Chrome, tap &#8942; then <b>Install app</b> (or <b>Add to Home screen</b>).') + '</div>' : '')
      + '</div>';
  };
  function openList(g) {
    F = {chain: '', outlet: '', rep: ownerOf(), reason: '', bucket: g ? String(g) : '', status: 'active', flag: '', text: ''};
    go('items', 'receivable');
  }
  window.imsMyList = () => openList('');   // phone bottom bar "Follow-up" for a rep = My outstanding
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-app]'); if (!b) return;
    const a = b.dataset.app;
    if (a === 'install') install();
    else if (a === 'list') openList('');
    else if (a === 'band') openList(b.dataset.g);
    else if (a === 'dash') go('dash', 'rep');
    else if (a === 'runs') go('items', 'runs');
    else if (a === 'visits') go('items', 'visits');
    else if (a === 'todo') go('items', 'rep');
    else if (a === 'outlets') go('items', 'outlets');
    else if (a === 'myol') { if (location.hash) history.replaceState(null, '', location.pathname + location.search); go('mine', 'outlets'); }
  });
  document.addEventListener('DOMContentLoaded', paint);
  setTimeout(paint, 1500);
})();
