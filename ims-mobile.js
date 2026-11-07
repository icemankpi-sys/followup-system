// Iceman IMS - phone look (v3.9, 2026-11-07, Oshan): on a phone (width up to 820 px, or inside the Iceman IMS Android app)
// the app gets a gradient header with a curved edge, a bottom navigation bar, a side drawer with the profile and modules,
// rounded cards and an icon grid. It only changes the look: every button still runs the main script's own handlers
// (bottom bar = the #tabs buttons, drawer = the #mods buttons, Sign out = #logout). Desktop stays as it was.
// Loaded after the main script; reads its globals me, myTitle at run time.
(function () {
  const CSS = `
:root{--g-a:#3b2fc9;--g-b:#2f6fe0;--g-c:#1fc2ec;--grad:linear-gradient(135deg,var(--g-a) 0%,var(--g-b) 55%,var(--g-c) 100%);--soft-sh:0 6px 20px rgba(46,49,146,.10),0 1px 3px rgba(46,49,146,.06)}
/* hero and icon grid (all screens) */
.hero{display:flex;align-items:center;gap:14px;background:var(--grad);color:#fff;border-radius:18px;padding:16px 18px;margin:0 0 12px;box-shadow:0 10px 26px rgba(47,111,224,.30)}
.hero .hav{flex:none;width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.22);border:3px solid rgba(255,255,255,.75);display:grid;place-items:center;font-weight:800;font-size:20px;letter-spacing:.5px}
.hero .hx{min-width:0}.hero .hhi{font-size:12.5px;opacity:.85}.hero .hnm{font-size:19px;font-weight:800;line-height:1.2;overflow-wrap:anywhere}
.hero .hmeta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.hero .hmeta span{background:rgba(255,255,255,.18);border-radius:999px;padding:2px 10px;font-size:11.5px}
.igrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;margin-top:10px}
.ibtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:96px;padding:12px 6px;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--ink);font-weight:600;font-size:12.5px;cursor:pointer;box-shadow:var(--soft-sh);text-align:center}
.ibtn .ii{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:#fff;background:var(--grad)}
.ibtn .ii svg{width:24px;height:24px}.ibtn:active{transform:scale(.97)}
.ibtn.c2 .ii{background:linear-gradient(135deg,#0f9b8e,#34d399)}.ibtn.c3 .ii{background:linear-gradient(135deg,#e8590c,#ffb15c)}.ibtn.c4 .ii{background:linear-gradient(135deg,#7c3aed,#c084fc)}.ibtn.c5 .ii{background:linear-gradient(135deg,#be123c,#fb7185)}
.myday .mtiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.mt{background:var(--surface2);border-radius:14px;padding:10px 12px;border:1px solid var(--line)}.mt b{display:block;font-size:18px}.mt span{font-size:11.5px;color:var(--muted)}
.mt.r b{color:var(--danger)}.mt.a b{color:var(--accent)}.mt.g b{color:var(--ok)}
@media(min-width:700px){.myday .mtiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
/* bottom bar and drawer exist only in the phone look */
#mNav,#mDrawer,#mShade{display:none}
html.m-skin body{background:var(--bg)}
html.m-skin header{background:var(--grad);border-radius:0 0 26px 26px;padding:max(14px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 22px max(16px,env(safe-area-inset-left));box-shadow:0 8px 24px rgba(47,111,224,.28);gap:10px;flex-wrap:nowrap;position:relative;z-index:5}
html.m-skin header .brand{min-width:0}html.m-skin header .mark{width:38px;height:38px;border-radius:12px}
html.m-skin header h1{font-size:17px}html.m-skin header .sub{display:block;font-size:11.5px;opacity:.85}
html.m-skin header .pill,html.m-skin header #logout,html.m-skin header #instBtn{display:none}
html.m-skin .mburger{display:grid}
.mburger{display:none;place-items:center;flex:none;width:40px;height:40px;border-radius:12px;border:0;background:rgba(255,255,255,.18);color:#fff;cursor:pointer}
.mburger svg{width:22px;height:22px}
html.m-skin #tabs{display:none}
html.m-skin .shell{display:block;min-height:0}
html.m-skin aside{position:fixed;top:0;left:0;bottom:0;width:min(300px,84vw);z-index:80;transform:translateX(-105%);transition:transform .22s ease;display:flex;flex-direction:column;gap:2px;overflow-y:auto;padding:0 12px calc(16px + env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left));background:var(--grad);border:0;box-shadow:6px 0 30px rgba(10,14,60,.35)}
html.m-skin.m-open aside{transform:none}
html.m-skin aside .sbt{display:none}
html.m-skin aside .sh{display:block;color:rgba(255,255,255,.75);margin:14px 8px 6px}
html.m-skin aside #mods{display:flex;flex-direction:column;gap:2px}
html.m-skin aside .mod{width:100%;white-space:normal;color:#fff;background:none;border-radius:12px;padding:10px}
html.m-skin aside .mod .ic{background:rgba(255,255,255,.2);color:#fff;border-radius:10px}
html.m-skin aside .mod .tx small{display:block;color:rgba(255,255,255,.72)}
html.m-skin aside .mod.on{background:rgba(255,255,255,.2);color:#fff}
html.m-skin aside .cnt{background:#fff;color:var(--g-a)}
html.m-skin aside.col{width:min(300px,84vw)}html.m-skin aside.col .tx,html.m-skin aside.col .sh{display:block}html.m-skin aside.col .mod{justify-content:flex-start}
html.m-skin #mDrawer{display:flex}
.mdh{display:flex;align-items:center;gap:12px;padding:calc(18px + env(safe-area-inset-top,0px)) 6px 14px;border-bottom:1px solid rgba(255,255,255,.22);color:#fff}
.mdh .hav{flex:none;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.22);border:3px solid rgba(255,255,255,.75);display:grid;place-items:center;font-weight:800;font-size:18px}
.mdh b{display:block;font-size:16px;overflow-wrap:anywhere}.mdh small{opacity:.8;font-size:12px}
.mdx{margin-left:auto;align-self:flex-start;background:none;border:0;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:4px}
.mdout{display:flex;align-items:center;gap:10px;margin-top:auto;padding:12px 10px;border:0;border-top:1px solid rgba(255,255,255,.22);background:none;color:#fff;font-weight:600;cursor:pointer;width:100%;text-align:left}
.mdout svg{width:20px;height:20px}
html.m-skin #mShade{display:block;position:fixed;inset:0;background:rgba(8,12,40,.45);z-index:70;opacity:0;pointer-events:none;transition:opacity .2s}
html.m-skin.m-open #mShade{opacity:1;pointer-events:auto}
html.m-skin #content{padding:14px max(16px,env(safe-area-inset-right)) calc(96px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left))}
html.m-skin #mNav{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 22px rgba(46,49,146,.10);padding:6px max(8px,env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom,0px)) max(8px,env(safe-area-inset-left));border-radius:20px 20px 0 0}
#mNav button{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;border:0;background:none;color:var(--muted);font-size:10.5px;font-weight:600;padding:6px 2px;border-radius:14px;cursor:pointer;position:relative}
#mNav button svg{width:23px;height:23px}#mNav button[hidden]{display:none}
#mNav button.on{color:var(--g-b)}
#mNav button.on .ni{background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(47,111,224,.35)}
#mNav .ni{width:42px;height:30px;border-radius:12px;display:grid;place-items:center}
#mNav .nb{position:absolute;top:2px;left:calc(50% + 8px);min-width:16px;height:16px;border-radius:8px;background:#e8590c;color:#fff;font-size:10px;line-height:16px;padding:0 4px}
html.m-skin h2.pt{font-size:19px}
html.m-skin .igrid{grid-template-columns:repeat(3,minmax(0,1fr))}html.m-skin .ibtn{min-height:92px;font-size:12px}
html.m-skin .lcard .mark{margin-bottom:18px}
html.m-skin .card{border-radius:18px;box-shadow:var(--soft-sh);padding:14px}
html.m-skin .card h3{color:var(--g-a)}
html.m-skin .tile{border-radius:16px;border-left:0;border-top:4px solid var(--g-b);box-shadow:var(--soft-sh)}
html.m-skin .tile.r{border-top-color:var(--danger)}html.m-skin .tile.a{border-top-color:var(--accent)}html.m-skin .tile.g{border-top-color:var(--ok)}
html.m-skin .grid{grid-template-columns:repeat(2,minmax(0,1fr))}
html.m-skin .wrap{border-radius:16px;box-shadow:var(--soft-sh)}
html.m-skin th{background:var(--g-a)}
html.m-skin .btn{border-radius:999px;padding:8px 16px;border-color:var(--g-b);color:var(--g-b)}
html.m-skin .btn.p{background:var(--grad);border-color:transparent;color:#fff;box-shadow:0 4px 14px rgba(47,111,224,.30)}
html.m-skin .btn.d{border-color:var(--danger);color:var(--danger)}
html.m-skin input,html.m-skin select,html.m-skin textarea{border-radius:12px;padding:9px 12px;border-color:#9fdcf3}
html.m-skin input:focus,html.m-skin select:focus,html.m-skin textarea:focus{outline:2px solid var(--g-c);outline-offset:0}
html.m-skin #bar select{width:100%}
html.m-skin #panel{top:auto;left:0;right:0;width:100%;max-height:92vh;border-radius:22px 22px 0 0;transform:translateY(105%);padding:16px max(16px,env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left));z-index:90}
html.m-skin #panel.open{transform:none}
html.m-skin #panel::before{content:"";display:block;width:44px;height:5px;border-radius:3px;background:var(--line2);margin:0 auto 10px}
html.m-skin #toast{bottom:calc(92px + env(safe-area-inset-bottom,0px))}
html.m-skin .vpill{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
/* sign-in: white card on the gradient, pill fields */
html.m-skin #login{background:var(--grad)}
html.m-skin .lcard{background:#fff;color:#0f1b2d;border:0;border-radius:24px;box-shadow:0 16px 40px rgba(10,14,60,.35);backdrop-filter:none;-webkit-backdrop-filter:none}
html.m-skin .lcard h2{color:var(--g-a);text-shadow:none}html.m-skin .lcard .tag2{color:#64748b}
html.m-skin .lcard input{border:1.5px solid #9fdcf3;border-radius:999px;padding:12px 18px;background:#fff}
html.m-skin .lcard button{border-radius:999px;background:var(--grad);box-shadow:0 6px 18px rgba(47,111,224,.40)}
html.m-skin .lcard .err{color:var(--danger)}html.m-skin .lcard .hint2{display:none}
html.m-skin .lcard .mark{box-shadow:0 0 0 6px rgba(31,194,236,.18),0 6px 20px rgba(47,111,224,.35)}
@media(prefers-color-scheme:dark){html.m-skin .lcard{background:#121b2b;color:#e6edf7}html.m-skin .lcard input{background:#0f1726;color:#e6edf7;border-color:#2e4a6b}}
@media(prefers-reduced-motion:reduce){html.m-skin aside,#mShade,html.m-skin #panel{transition:none}}
@media print{#mNav,#mDrawer,#mShade{display:none!important}}`;

  const I = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.3"/><circle cx="4.5" cy="12" r="1.3"/><circle cx="4.5" cy="18" r="1.3"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    doc: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    menu: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    burger: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>',
    car: '<path d="M5 16h14M3 16v-4l2-5h14l2 5v4"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    todo: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 9l2 2 4-4M8 16h8"/>',
    store: '<path d="M3 9l2-5h14l2 5"/><path d="M4 9v11h16V9M3 9h18M9 20v-6h6v6"/>'
  };
  const svg = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[k] + '</svg>';
  window.imsIcon = svg;
  window.imsInitials = n => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

  const st = document.createElement('style'); st.id = 'ims-mobile-css'; st.textContent = CSS; document.head.appendChild(st);
  const root = document.documentElement;
  const inApp = /; wv\)/.test(navigator.userAgent) || /IcemanIMS/.test(navigator.userAgent);
  const mq = window.matchMedia('(max-width: 820px)');
  const apply = () => { root.classList.toggle('m-skin', inApp || mq.matches); if (!root.classList.contains('m-skin')) root.classList.remove('m-open'); };
  apply(); if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply);

  const NAV = [['home', 'Home', 'home'], ['items', 'Follow-up', 'list'], ['dash', 'Dashboard', 'chart'], ['report', 'Report', 'doc']];
  function build() {
    const app = document.getElementById('app'), aside = document.querySelector('aside'), header = document.querySelector('header');
    if (!app || !aside || !header || document.getElementById('mNav')) return;
    // menu button in the header
    const bg = document.createElement('button'); bg.className = 'mburger'; bg.type = 'button'; bg.title = 'Menu'; bg.setAttribute('aria-label', 'Open menu'); bg.innerHTML = svg('burger');
    bg.onclick = () => open(true); header.insertBefore(bg, header.firstChild);
    // drawer: profile on top of the module list, Sign out at the bottom
    const dh = document.createElement('div'); dh.id = 'mDrawer'; dh.className = 'mdh';
    dh.innerHTML = '<span class="hav" id="mAv">?</span><span style="min-width:0"><b id="mNm"></b><small id="mTt"></small></span><button class="mdx" type="button" aria-label="Close menu">&times;</button>';
    aside.insertBefore(dh, aside.firstChild); dh.querySelector('.mdx').onclick = () => open(false);
    const so = document.createElement('button'); so.className = 'mdout'; so.id = 'mOut'; so.type = 'button'; so.innerHTML = svg('out') + 'Sign out';
    so.onclick = () => { const b = document.getElementById('logout'); if (b) b.click(); }; aside.appendChild(so);
    const sh = document.createElement('div'); sh.id = 'mShade'; sh.onclick = () => open(false); document.body.appendChild(sh);
    // bottom bar: runs the matching #tabs button, the last one opens the drawer
    const nav = document.createElement('nav'); nav.id = 'mNav'; nav.setAttribute('aria-label', 'Main');
    nav.innerHTML = NAV.map(n => '<button type="button" data-mpage="' + n[0] + '"><span class="ni">' + svg(n[2]) + '</span>' + n[1] + '</button>').join('').replace('<button type="button" data-mpage="dash"', '<button type="button" data-mmine="1" hidden><span class="ni">' + svg('store') + '</span>My Outlets</button><button type="button" data-mpage="dash"') + '<button type="button" data-mmenu="1"><span class="ni">' + svg('menu') + '</span>Menu</button>';
    nav.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mmenu) return open(true);
      if (b.dataset.mmine) { if (location.hash) history.replaceState(null, '', location.pathname + location.search); open(false); go('mine', 'outlets'); window.scrollTo(0, 0); return; }
      if (b.dataset.mpage === 'items' && window.imsRepView && imsRepView() && window.imsMyList) { if (location.hash) history.replaceState(null, '', location.pathname + location.search); imsMyList(); window.scrollTo(0, 0); return; }
      const t = document.querySelector('#tabs button[data-page="' + b.dataset.mpage + '"]'); if (t) { t.click(); window.scrollTo(0, 0); }
    };
    app.appendChild(nav);
    document.getElementById('mods').addEventListener('click', e => { if (e.target.closest('button[data-mod]')) open(false); });
    new MutationObserver(sync).observe(document.getElementById('tabs'), {childList: true, subtree: true});
    sync();
  }
  function open(on) { root.classList.toggle('m-open', !!on && root.classList.contains('m-skin')); }
  function sync() {
    const tabs = document.getElementById('tabs'), nav = document.getElementById('mNav'); if (!tabs || !nav) return;
    // a sales rep sees My Outlets in place of Dashboard (v3.9)
    const rep = typeof window.imsRepView === 'function' && imsRepView();
    let pg = ''; try { pg = page; } catch (e) {}
    const onMine = rep && (pg === 'mine' || pg === 'outlet');
    const on = tabs.querySelector('button.on'), cur = onMine || pg === 'mine' ? '' : on ? on.dataset.page : 'home';
    const mb = nav.querySelector('[data-mmine]'); if (mb) { mb.hidden = !rep; mb.classList.toggle('on', onMine); }
    nav.querySelectorAll('[data-mpage]').forEach(b => {
      const t = tabs.querySelector('button[data-page="' + b.dataset.mpage + '"]');
      b.hidden = !t || (rep && b.dataset.mpage === 'dash'); b.classList.toggle('on', b.dataset.mpage === cur);
      const lab = t && t.firstChild && t.firstChild.nodeType === 3 ? t.firstChild.nodeValue.trim() : '', tn = [...b.childNodes].find(n => n.nodeType === 3);
      if (lab && tn && tn.nodeValue !== lab) tn.nodeValue = lab;   // same names as the tabs (Rep Team shows Team / Rep Day / Coverage)
      const badge = t && t.querySelector('.nbadge'), old = b.querySelector('.nb');
      if (old) old.remove(); if (badge) b.insertAdjacentHTML('beforeend', '<span class="nb">' + badge.textContent + '</span>');
    });
    try {
      if (typeof me !== 'undefined' && me) {
        const nm = me.full_name || me.username || '';
        document.getElementById('mNm').textContent = nm; document.getElementById('mAv').textContent = imsInitials(nm);
        document.getElementById('mTt').textContent = (typeof myTitle === 'function' ? myTitle() : '') || me.role || '';
      }
    } catch (e) {}
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
