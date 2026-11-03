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

  // ---------- rep "My day" card (Home) ----------
  const myName = () => (me && me.rep_name || '').trim();
  const mine = () => rows.filter(r => isActive(r) && (!op || r.operation === op) && nk(r.owner_name) === nk(myName()));
  const ownerOf = () => { const r = rows.find(x => nk(x.owner_name) === nk(myName())); return r ? r.owner_name : ''; };
  const BAND = {30: 'age-g', 60: 'age-g', 90: 'age-y', 120: 'age-o', 240: 'age-r'};
  window.repHomeCard = function () {
    if (!myName()) return '';
    const a = mine(), o120 = a.filter(isO120), todo = (window.MY_MENTIONS || []).length;
    const bands = AGES.map((g, i) => { const l = a.filter(r => inBand(r, g)); return {g, n: l.length, v: sum(l), label: 'Over ' + g + (AGES[i + 1] ? ' (' + (g + 1) + '-' + AGES[i + 1] + ')' : ' (241+)')}; }).filter(b => b.n);
    const btn = (act, ic, tx) => '<button class="abtn" data-app="' + act + '"><span>' + ic + '</span>' + tx + '</button>';
    return '<div class="card myday"><h3>My day · ' + esc(myName()) + '</h3>'
      + '<div class="grid"><div class="tile"><b>' + money0(sum(a)) + '</b><span>My outstanding (' + a.length + ' invoices)</span></div>'
      + '<div class="tile r"><b>' + money0(sum(o120)) + '</b><span>Over 120 days (' + o120.length + ')</span></div>'
      + '<div class="tile a"><b>' + a.filter(r => r.action_overdue || r.promise_broken).length + '</b><span>Overdue / promise broken</span></div>'
      + '<div class="tile ' + (todo ? 'a' : 'g') + '"><b>' + todo + '</b><span>My to-do</span></div></div>'
      + (bands.length ? '<div class="bands">' + bands.map(b => '<button class="band ' + BAND[b.g] + '" data-app="band" data-g="' + b.g + '"><b>' + esc(b.label) + '</b><span>' + b.n + ' · ' + money0(b.v) + '</span></button>').join('') + '</div>' : '')
      + '<div class="abtns">' + btn('list', '&#128203;', 'My outstanding') + btn('dash', '&#128200;', 'My dashboard') + btn('runs', '&#128663;', 'Running chart') + btn('visits', '&#128205;', 'Visit history') + '</div>'
      + (!standalone() ? '<div class="hint inst">' + (prompt ? 'Put this app on your phone: <button class="btn" data-app="install">&#128242; Install app</button>' : 'Phone app: open this page in Chrome, tap &#8942; then <b>Install app</b> (or <b>Add to Home screen</b>).') + '</div>' : '')
      + '</div>';
  };
  function openList(g) {
    F = {chain: '', outlet: '', rep: ownerOf(), reason: '', bucket: g ? String(g) : '', status: 'active', flag: '', text: ''};
    go('items', 'receivable');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-app]'); if (!b) return;
    const a = b.dataset.app;
    if (a === 'install') install();
    else if (a === 'list') openList('');
    else if (a === 'band') openList(b.dataset.g);
    else if (a === 'dash') go('dash', 'rep');
    else if (a === 'runs') go('items', 'runs');
    else if (a === 'visits') go('items', 'visits');
  });
  document.addEventListener('DOMContentLoaded', paint);
  setTimeout(paint, 1500);
})();
