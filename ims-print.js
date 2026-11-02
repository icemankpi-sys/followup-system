// Iceman IMS: common print header and footer for every printed page / report (v2.4, 2026-11-02).
// Works for every "Print / Save as PDF" button and for Ctrl+P, because it runs on the browser's beforeprint event.
// Header (first page): Iceman logo, report headline, Created date and time, User (name · job title), operation shown.
// Footer (every page, in the page margin): Iceman IMS · headline · created · user, and "Page x of y" (Chrome 131+).
// Uses the main script's globals at run time ($, esc, me, myTitle, fmtDT).
(function () {
  const css = document.createElement('style');
  css.textContent = '#prHead{display:none}'
    + '@media print{'
    + '#prHead{display:flex!important;align-items:center;gap:14px;border-bottom:3px solid #2e3192;padding:0 0 8px;margin:0 0 12px;color:#0f1b2d;font-family:Segoe UI,Arial,sans-serif}'
    + '#prHead img{height:54px;width:auto}'
    + '#prHead .prT{flex:1;min-width:0}'
    + '#prHead .prS{font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:#2e3192;font-weight:700}'
    + '#prHead h1{margin:1px 0 0;font-size:20px;line-height:1.2;color:#1d1f63}'
    + '#prHead .prO{font-size:11px;color:#475569;margin-top:2px}'
    + '#prHead table{width:auto!important;flex:none;margin:0;border-collapse:collapse;font-size:11px;white-space:nowrap}'
    + '#prHead td{padding:1px 0 1px 10px;border:0;background:none}'
    + '#prHead td:first-child{color:#64748b;text-align:right}'
    + '#prHead td:last-child{font-weight:700;color:#0f1b2d}'
    + 'body.prOn #page h2.pt.prDup{display:none}'
    // clean paper copy: no scroll boxes or scrollbars, every column on the page, header row repeated, rows not split
    + '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + 'html,body,#app,.shell,#content,#page,#page div{overflow:visible!important;max-height:none!important}'
    + '::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}'
    + '#page .wrap{box-shadow:none!important;border:0!important;padding:0!important}'
    + '#page table{min-width:0!important;width:100%!important;border-collapse:collapse;font-size:9.5pt}'
    + '#page th,#page td{padding:3px 5px!important;position:static!important}'
    + '#page th{white-space:normal}'
    + '#page thead{display:table-header-group}#page tfoot{display:table-footer-group}'
    + '#page tr{break-inside:avoid;page-break-inside:avoid}'
    + '#page .tile,#page .bar{break-inside:avoid}'
    + '#page h2,#page h3{break-after:avoid}'
    + '#page .card{box-shadow:none!important}'
    + '#page #prHead table{width:auto!important;font-size:11px}#page #prHead td{padding:1px 0 1px 10px!important}'
    + '}';
  document.head.appendChild(css);

  const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';

  function headline() {
    const h = document.querySelector('#page h2.pt');
    if (h && txt(h)) return {text: txt(h), el: h};
    const t = document.querySelector('#tabs .on, #tabs [aria-selected="true"]');
    return {text: txt(t) || 'Iceman IMS report', el: null};
  }

  function build() {
    const page = $('page'); if (!page) return;
    clear();
    const hl = headline(), now = new Date();
    const logo = document.querySelector('#app header .brand img');
    const user = me ? (me.full_name || me.username || '') : '';
    const title = me && typeof myTitle === 'function' ? myTitle() : '';
    const hint = hl.el && hl.el.nextElementSibling && hl.el.nextElementSibling.classList.contains('hint') ? txt(hl.el.nextElementSibling) : '';
    const created = fmtDT(now);
    const head = document.createElement('div');
    head.id = 'prHead';
    head.innerHTML = (logo ? '<img alt="Iceman" src="' + logo.getAttribute('src') + '">' : '')
      + '<div class="prT"><div class="prS">Iceman IMS · Internal Management System</div><h1>' + esc(hl.text) + '</h1>' + (hint ? '<div class="prO">' + esc(hint) + '</div>' : '') + '</div>'
      + '<table><tr><td>Created</td><td>' + esc(created) + '</td></tr>'
      + '<tr><td>User</td><td>' + esc(user || 'not signed in') + '</td></tr>'
      + (title ? '<tr><td>Job title</td><td>' + esc(title) + '</td></tr>' : '') + '</table>';
    page.insertBefore(head, page.firstChild);
    // the headline is now in the print header, so hide the page's own copy (and its hint line) while printing
    if (hl.el) { hl.el.classList.add('prDup'); if (hint) hl.el.nextElementSibling.style.cssText += ';display:none'; head.dataset.hint = hint ? '1' : ''; }
    // footer on every page in the page margin (never covers the report); page numbers on the right
    const cs = s => '"' + String(s).replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ') + '"';
    // wide tables (many columns or wider than an A4 portrait page) print on A4 landscape so nothing is cut or squeezed
    let wide = false;
    page.querySelectorAll('table').forEach(t => {
      if (t.closest('#prHead') || !t.offsetParent) return;
      const cols = t.rows[0] ? [...t.rows[0].cells].reduce((n, c) => n + (c.colSpan || 1), 0) : 0;
      const ow = t.style.width, om = t.style.minWidth; t.style.minWidth = '0'; t.style.width = 'max-content';
      const w = t.offsetWidth; t.style.width = ow; t.style.minWidth = om;
      if (cols >= 9 || w > 900) wide = true;
    });
    const foot = document.createElement('style');
    foot.id = 'prFoot';
    foot.textContent = '@media print{@page{size:A4 ' + (wide ? 'landscape' : 'portrait') + ';margin:12mm 10mm 14mm;'
      + '@top-left{content:""}@top-center{content:""}@top-right{content:""}'   // replaces the browser's own date / title line
      + '@bottom-left{content:' + cs('Iceman IMS · ' + hl.text + ' · Created ' + created + ' by ' + (user || '-') + (title ? ' (' + title + ')' : '')) + ';font:8.5px Segoe UI,Arial,sans-serif;color:#64748b;vertical-align:top;padding-top:3mm}'
      + '@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8.5px Segoe UI,Arial,sans-serif;color:#64748b;vertical-align:top;padding-top:3mm}}}';
    document.head.appendChild(foot);
    document.body.classList.add('prOn');
  }

  function clear() {
    const h = $('prHead');
    if (h) {
      const d = document.querySelector('#page h2.pt.prDup');
      if (d) { d.classList.remove('prDup'); if (h.dataset.hint && d.nextElementSibling) d.nextElementSibling.style.display = ''; }
      h.remove();
    }
    const f = $('prFoot'); if (f) f.remove();
    document.body.classList.remove('prOn');
  }

  window.addEventListener('beforeprint', build);
  window.addEventListener('afterprint', clear);
  window.imsPrintHeader = {build, clear};   // for testing from the console
})();
