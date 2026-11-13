// Iceman IMS - Calendar (v5.4, 2026-11-14, Oshan): events on dates, with optional start / end times.
// Left menu: main category "Calendar" with three sub items (one module 'calendar', one permission per operation):
//   Month Calendar (page items), Week View (dash), Day Schedule (report). Click a date or a time slot to add an event, click an event to open / change it.
// Print / Save as PDF uses the common Iceman header and footer (ims-print.js); month and week print on A4 landscape, the day schedule on portrait with a details table.
// Storage: public.cal_events (Supabase/39 calendar.sql). Access: view = see, edit = add events + change / delete own, full = change / delete anyone's.
// An event without an operation is "All operations": seen by everyone with Calendar access, added / changed by Full or the Admin only.
// Loaded before the main script. Uses its globals at run time only (api, fetchAll, $, esc, me, op, ops, access, rank, lvl, opsFor, go, closeDrawer, toast).
(function () {
  const css = document.createElement('style');
  css.textContent = `
.cal-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 8px}.cal-nav b{min-width:210px;text-align:center}
.cal-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin:2px 0 8px}.cal-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.cal-scroll{overflow-x:auto}
.cal-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));min-width:640px;border:1px solid var(--line2);border-radius:10px;overflow:hidden;background:var(--surface)}
.cal-month .dh{background:var(--primary);color:var(--primary-ink);font-weight:700;font-size:12px;text-align:center;padding:5px 2px}
.cal-month .dc{min-height:104px;border-top:1px solid var(--line);border-left:1px solid var(--line);padding:3px;cursor:pointer;overflow:hidden}
.cal-month .dc:nth-child(7n+8){border-left:0}
.cal-month .dc.out{background:var(--surface2);opacity:.65}.cal-month .dc.sun{background:var(--surface2)}
.cal-month .dc.today{outline:2px solid var(--accent);outline-offset:-2px}
.cal-month .dn{font-size:12px;font-weight:700;display:inline-block;min-width:22px;text-align:center;border-radius:11px;padding:0 4px;color:var(--ink2)}
.cal-month .dc.today .dn{background:var(--accent);color:#fff}
.cal-month .dn:hover{background:var(--primary-soft)}
.cev{display:block;font-size:11px;line-height:1.25;border-radius:4px;padding:1px 4px;margin:2px 0;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;text-align:left;width:100%;border:0}
.cev small{opacity:.9;margin-right:3px}
.cal-month .ex{display:none}.cal-month .mr{font-size:11px;color:var(--muted);padding:0 4px}
.cal-tg{display:grid;border:1px solid var(--line2);border-radius:10px;overflow:hidden;background:var(--surface);min-width:640px}
.cal-tg.one{min-width:300px}
.cal-tg .th{background:var(--primary);color:var(--primary-ink);font-weight:700;font-size:12px;text-align:center;padding:5px 2px;cursor:pointer}
.cal-tg .th.today{background:var(--accent)}
.cal-tg .ad{border-top:1px solid var(--line);border-left:1px solid var(--line);padding:2px;min-height:26px}
.cal-tg .hl{font-size:11px;color:var(--muted);text-align:right;padding:0 4px;position:relative}
.cal-tg .col{position:relative;border-left:1px solid var(--line);border-top:1px solid var(--line);cursor:pointer;background-image:linear-gradient(to bottom,var(--line) 1px,transparent 1px);background-size:100% var(--hh)}
.cal-tg .col.sun{background-color:var(--surface2)}
.cal-tg .te{position:absolute;border-radius:5px;color:#fff;font-size:11px;line-height:1.25;padding:2px 4px;overflow:hidden;cursor:pointer;border:1px solid rgba(255,255,255,.6);box-sizing:border-box}
.cal-tg .te b{display:block;font-size:11px}
.cal-day-list td{vertical-align:top}
.cal-day-list .dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}
.cal-empty{color:var(--muted);font-size:13px;padding:8px 0}
@media(max-width:820px){.cal-month .dc{min-height:78px}.cal-nav b{min-width:150px}}
@media print{
  .cal-scroll{overflow:visible!important}
  .cal-month,.cal-tg{min-width:0!important;width:100%!important}
  .cal-month .dc{min-height:25mm;cursor:default}.cal-month .ex{display:block!important}.cal-month .mr{display:none!important}
  .cev,.cal-tg .te{white-space:normal;overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact;cursor:default}
  .cal-month .dh,.cal-tg .th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .cal-nav,.cal-hint{display:none!important}
  .cal-legend{margin:0 0 4px}
}`;
  document.head.appendChild(css);

  // ---------- dates ----------
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const pd = s => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
  const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  const isoW = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + 3 - (x.getDay() + 6) % 7); const w1 = new Date(x.getFullYear(), 0, 4); return 1 + Math.round(((x - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7); };
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], DOWL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dow = d => (d.getDay() + 6) % 7;
  const fmtD = d => d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
  const fmtL = d => DOWL[dow(d)] + ' ' + fmtD(d) + ' ' + d.getFullYear();
  const hm = t => t ? String(t).slice(0, 5) : '';
  const mins = t => { const a = hm(t).split(':').map(Number); return a[0] * 60 + a[1]; };
  const fromMins = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const todayD = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

  const TYPES = [['meeting', 'Meeting', '#2e5bd6'], ['deadline', 'Deadline', '#d9362b'], ['collection', 'Collection follow-up', '#1f8a4c'], ['stock', 'Stock taking', '#b86e00'],
    ['visit', 'Visit / Audit', '#7a3fd1'], ['leave', 'Holiday / Leave', '#5b6472'], ['other', 'Other', '#0e7f91']];
  const typeOf = k => TYPES.find(t => t[0] === k) || TYPES[TYPES.length - 1];
  const legend = () => '<div class="cal-legend">' + TYPES.map(t => '<span><i style="background:' + t[2] + '"></i>' + t[1] + '</span>').join('') + '</div>';

  // ---------- state ----------
  const C = {range: null, events: [], mo: null, wk: null, day: null, error: ''};
  const initDates = () => { if (!C.mo) { const t = todayD(); C.mo = new Date(t.getFullYear(), t.getMonth(), 1); C.wk = monday(t); C.day = t; } };

  // ---------- access ----------
  const bestRank = () => { if (me && me.role === 'admin') return 3; let b = 0; (access || []).forEach(a => { if (['calendar', '*'].includes(a.module)) b = Math.max(b, rank(a.level)); }); return b; };
  const canAdd = () => bestRank() >= 2;
  const opRank = o => o ? rank(lvl(o, 'calendar')) : bestRank() >= 3 ? 3 : 0;   // an "All operations" event needs Full
  const canChange = e => { if (!me) return false; const r = opRank(e.operation); return r >= 3 || (r >= 2 && e.created_by && e.created_by === me.id); };
  const myAddOps = () => (ops || []).filter(o => rank(lvl(o.code, 'calendar')) >= 2);
  const opName = c => { if (!c) return 'All operations'; const o = (ops || []).find(x => x.code === c); return o ? o.code + ' - ' + o.name : c; };

  // ---------- load ----------
  async function ensure(from, to) {
    initDates();
    const f = ymd(from), t = ymd(to);
    if (C.range && C.range[0] <= f && C.range[1] >= t) return;
    const f2 = ymd(addD(from, -31)), t2 = ymd(addD(to, 31));
    C.events = await fetchAll('/rest/v1/cal_events?select=*&event_date=lte.' + t2 + '&or=(end_date.gte.' + f2 + ',event_date.gte.' + f2 + ')&order=event_date.asc,start_time.asc.nullsfirst,id.asc');
    C.range = [f2, t2];
  }
  const dayEvents = k => C.events.filter(e => e.event_date <= k && (e.end_date || e.event_date) >= k && (!op || !e.operation || e.operation === op))
    .sort((a, b) => (a.start_time ? 1 : 0) - (b.start_time ? 1 : 0) || String(a.start_time || '').localeCompare(String(b.start_time || '')) || a.id - b.id);
  async function show(draw, from, to) {
    $('page').innerHTML = '<div class="hint">Loading...</div>';
    try { await ensure(from, to); draw(); }
    catch (e) { $('page').innerHTML = '<div class="card err">Could not load the calendar: ' + esc(e.message) + '<div class="hint">If this is new, the database section (Supabase/39 calendar.sql) may not be set up yet.</div></div>'; }
  }
  const refresh = () => { C.range = null; return go(); };

  // ---------- event chips ----------
  const chipTxt = e => (e.start_time ? '<small>' + hm(e.start_time) + '</small>' : '') + esc(e.title);
  const chipTitle = e => esc(typeOf(e.etype)[1] + ': ' + e.title + (e.start_time ? ' (' + hm(e.start_time) + (e.end_time ? ' - ' + hm(e.end_time) : '') + ')' : ' (all day)') + ' · ' + opName(e.operation) + (e.owner_name ? ' · ' + e.owner_name : ''));
  const chip = (e, extra) => '<button type="button" class="cev' + (extra ? ' ' + extra : '') + '" data-ev="' + e.id + '" style="background:' + typeOf(e.etype)[2] + '" title="' + chipTitle(e) + '">' + chipTxt(e) + '</button>';

  // ---------- Month ----------
  function drawMonth() {
    const m0 = C.mo, mEnd = new Date(m0.getFullYear(), m0.getMonth() + 1, 0), gs = monday(m0), ge = addD(monday(mEnd), 6), tk = ymd(todayD());
    const label = m0.toLocaleDateString('en-GB', {month: 'long', year: 'numeric'});
    let cells = DOW.map(d => '<div class="dh">' + d + '</div>').join('');
    for (let d = gs; d <= ge; d = addD(d, 1)) {
      const k = ymd(d), evs = dayEvents(k), out = d.getMonth() !== m0.getMonth();
      cells += '<div class="dc' + (out ? ' out' : '') + (dow(d) === 6 ? ' sun' : '') + (k === tk ? ' today' : '') + '" data-d="' + k + '"><span class="dn" data-day="' + k + '" title="Open the day schedule">' + d.getDate() + '</span>'
        + evs.map((e, i) => chip(e, i >= 3 ? 'ex' : '')).join('') + (evs.length > 3 ? '<div class="mr">+' + (evs.length - 3) + ' more</div>' : '') + '</div>';
    }
    $('page').innerHTML = '<div class="cal-nav noprint"><button class="btn" id="cPrev">&lsaquo; Previous</button><b>' + esc(label) + '</b><button class="btn" id="cNext">Next &rsaquo;</button><button class="btn" id="cNow">Today</button>'
      + (canAdd() ? '<button class="btn p" id="cAdd">+ Add event</button>' : '') + '<button class="btn p" id="rPrint">Print / Save as PDF</button></div>'
      + '<h2 class="pt">Calendar &middot; ' + esc(label) + '</h2><div class="hint">' + (op ? 'Operation ' + esc(op) + ' (and events for all operations)' : 'All my operations') + ' &middot; Iceman IMS</div>' + legend()
      + '<div class="cal-scroll"><div class="cal-month" data-print-land="1">' + cells + '</div></div>'
      + '<div class="hint cal-hint">' + (canAdd() ? 'Click a date to add an event, click an event to open it, click the date number to see that day by time.' : 'You can view events. Ask the Admin for Edit access to add events.') + '</div>';
    $('cPrev').onclick = () => { C.mo = new Date(m0.getFullYear(), m0.getMonth() - 1, 1); go(); };
    $('cNext').onclick = () => { C.mo = new Date(m0.getFullYear(), m0.getMonth() + 1, 1); go(); };
    $('cNow').onclick = () => { const t = todayD(); C.mo = new Date(t.getFullYear(), t.getMonth(), 1); go(); };
    if ($('cAdd')) $('cAdd').onclick = () => evForm(null, {date: ymd(todayD())});
    bind($('page'));
    document.querySelectorAll('#page .dc').forEach(c => c.onclick = e => { if (e.target.closest('[data-ev],[data-day]')) return; if (canAdd()) evForm(null, {date: c.dataset.d}); });
    document.querySelectorAll('#page [data-day]').forEach(s => s.onclick = () => { C.day = pd(s.dataset.day); go('report', 'calendar'); });
  }
  function bind(root) { root.querySelectorAll('[data-ev]').forEach(b => b.onclick = e => { e.stopPropagation(); const ev = C.events.find(x => String(x.id) === b.dataset.ev); if (ev) evForm(ev); }); }

  // ---------- time grid (Week and Day) ----------
  const HH = 48;   // px per hour
  function timeGrid(days, land) {
    let from = 7, to = 19;
    days.forEach(d => dayEvents(ymd(d)).forEach(e => { if (e.start_time) { from = Math.min(from, Math.floor(mins(e.start_time) / 60)); to = Math.max(to, Math.ceil((e.end_time ? mins(e.end_time) : mins(e.start_time) + 60) / 60)); } }));
    to = Math.min(24, to); const H = (to - from) * HH, n = days.length, tk = ymd(todayD());
    let h = '<div class="cal-tg' + (n === 1 ? ' one' : '') + '"' + (land ? ' data-print-land="1"' : '') + ' style="--hh:' + HH + 'px;grid-template-columns:46px repeat(' + n + ',minmax(0,1fr))"><div></div>'
      + days.map(d => '<div class="th' + (ymd(d) === tk ? ' today' : '') + '" data-day="' + ymd(d) + '">' + DOW[dow(d)] + ' ' + d.getDate() + '</div>').join('')
      + '<div class="hl" style="padding-top:4px">all day</div>'
      + days.map(d => '<div class="ad" data-add="' + ymd(d) + '">' + dayEvents(ymd(d)).filter(e => !e.start_time).map(e => chip(e)).join('') + '</div>').join('')
      + '<div class="hl" style="height:' + H + 'px">' + Array.from({length: to - from}, (_, i) => '<div style="position:absolute;top:' + Math.max(0, i * HH - 7) + 'px;right:4px">' + pad(from + i) + ':00</div>').join('') + '</div>';
    days.forEach(d => {
      const k = ymd(d), evs = dayEvents(k).filter(e => e.start_time).map(e => ({e, s: mins(e.start_time), t: e.end_time ? mins(e.end_time) : mins(e.start_time) + 60}));
      const lanes = []; evs.forEach(x => { let i = lanes.findIndex(end => end <= x.s); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = x.t; x.lane = i; });
      // overlapping events share the width: the lane count of each cluster
      evs.forEach(x => { x.cols = Math.max(...evs.filter(y => y.s < x.t && y.t > x.s).map(y => y.lane)) + 1; });
      h += '<div class="col' + (dow(d) === 6 ? ' sun' : '') + '" data-slot="' + k + '" style="height:' + H + 'px">' + evs.map(x => {
        const top = (x.s - from * 60) * HH / 60, ht = Math.max(18, (x.t - x.s) * HH / 60 - 1), w = 100 / x.cols;
        return '<div class="te" data-ev="' + x.e.id + '" style="top:' + top + 'px;height:' + ht + 'px;left:calc(' + (x.lane * w) + '% + 1px);width:calc(' + w + '% - 2px);background:' + typeOf(x.e.etype)[2] + '" title="' + chipTitle(x.e) + '"><b>' + hm(x.e.start_time) + (x.e.end_time ? ' - ' + hm(x.e.end_time) : '') + '</b>' + esc(x.e.title) + '</div>';
      }).join('') + '</div>';
    });
    return h + '</div>';
  }
  function bindGrid(from) {
    bind($('page'));
    document.querySelectorAll('#page .th[data-day]').forEach(s => s.onclick = () => { C.day = pd(s.dataset.day); go('report', 'calendar'); });
    if (!canAdd()) return;
    document.querySelectorAll('#page .ad').forEach(c => c.onclick = e => { if (e.target.closest('[data-ev]')) return; evForm(null, {date: c.dataset.add}); });
    document.querySelectorAll('#page .col').forEach(c => c.onclick = e => {
      if (e.target.closest('[data-ev]')) return;
      const r = c.getBoundingClientRect(), m = Math.floor(((e.clientY - r.top) / HH) * 2) * 30 + from * 60;   // half hour under the click
      evForm(null, {date: c.dataset.slot, start: fromMins(Math.min(m, 23 * 60)), end: fromMins(Math.min(m + 60, 23 * 60 + 59))});
    });
  }
  const gridFrom = days => { let from = 7; days.forEach(d => dayEvents(ymd(d)).forEach(e => { if (e.start_time) from = Math.min(from, Math.floor(mins(e.start_time) / 60)); })); return from; };

  // ---------- Week ----------
  function drawWeek() {
    const ws = C.wk, days = [...Array(7)].map((_, i) => addD(ws, i)), label = 'Week ' + isoW(ws) + ' (' + fmtD(ws) + ' to ' + fmtD(addD(ws, 6)) + ' ' + addD(ws, 6).getFullYear() + ')';
    $('page').innerHTML = '<div class="cal-nav noprint"><button class="btn" id="cPrev">&lsaquo; Previous week</button><b>' + esc(label) + '</b><button class="btn" id="cNext">Next week &rsaquo;</button><button class="btn" id="cNow">This week</button>'
      + (canAdd() ? '<button class="btn p" id="cAdd">+ Add event</button>' : '') + '<button class="btn p" id="rPrint">Print / Save as PDF</button></div>'
      + '<h2 class="pt">Calendar &middot; ' + esc(label) + '</h2><div class="hint">' + (op ? 'Operation ' + esc(op) + ' (and events for all operations)' : 'All my operations') + ' &middot; Iceman IMS</div>' + legend()
      + '<div class="cal-scroll">' + timeGrid(days, true) + '</div>'
      + '<div class="hint cal-hint">' + (canAdd() ? 'Click a time slot to add an event at that time, click an event to open it, click a day name to open that day.' : 'You can view events.') + '</div>';
    $('cPrev').onclick = () => { C.wk = addD(ws, -7); go(); };
    $('cNext').onclick = () => { C.wk = addD(ws, 7); go(); };
    $('cNow').onclick = () => { C.wk = monday(todayD()); go(); };
    if ($('cAdd')) $('cAdd').onclick = () => evForm(null, {date: ymd(todayD())});
    bindGrid(gridFrom(days));
  }

  // ---------- Day schedule ----------
  function drawDay() {
    const d = C.day, k = ymd(d), evs = dayEvents(k), label = fmtL(d);
    const rows = evs.map(e => '<tr><td style="white-space:nowrap">' + (e.start_time ? hm(e.start_time) + (e.end_time ? ' - ' + hm(e.end_time) : '') : 'All day') + '</td><td><span class="dot" style="background:' + typeOf(e.etype)[2] + '"></span><b>' + esc(e.title) + '</b></td><td>' + esc(typeOf(e.etype)[1]) + '</td><td>' + esc(opName(e.operation)) + '</td><td>' + esc(e.owner_name || '') + '</td><td>' + esc(e.description || '') + '</td></tr>').join('');
    $('page').innerHTML = '<div class="cal-nav noprint"><button class="btn" id="cPrev">&lsaquo; Previous day</button><b>' + esc(label) + '</b><button class="btn" id="cNext">Next day &rsaquo;</button><button class="btn" id="cNow">Today</button><input type="date" id="cPick" value="' + k + '">'
      + (canAdd() ? '<button class="btn p" id="cAdd">+ Add event</button>' : '') + '<button class="btn p" id="rPrint">Print / Save as PDF</button></div>'
      + '<h2 class="pt">Day schedule &middot; ' + esc(label) + '</h2><div class="hint">' + (op ? 'Operation ' + esc(op) + ' (and events for all operations)' : 'All my operations') + ' &middot; ' + evs.length + ' event' + (evs.length === 1 ? '' : 's') + ' &middot; Iceman IMS</div>' + legend()
      + '<div class="cal-scroll">' + timeGrid([d], false) + '</div>'
      + '<div class="card" style="margin-top:12px"><h3>Events of the day</h3>' + (evs.length ? '<div class="wrap" style="box-shadow:none"><table class="cal-day-list"><thead><tr><th>Time</th><th>Event</th><th>Type</th><th>Operation</th><th>Owner</th><th>Notes</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="cal-empty">No events on this day.</div>') + '</div>'
      + '<div class="hint cal-hint">' + (canAdd() ? 'Click a time slot to add an event at that time.' : 'You can view events.') + '</div>';
    $('cPrev').onclick = () => { C.day = addD(d, -1); go(); };
    $('cNext').onclick = () => { C.day = addD(d, 1); go(); };
    $('cNow').onclick = () => { C.day = todayD(); go(); };
    $('cPick').onchange = e => { if (e.target.value) { C.day = pd(e.target.value); go(); } };
    if ($('cAdd')) $('cAdd').onclick = () => evForm(null, {date: k});
    bindGrid(gridFrom([d]));
  }

  // ---------- event form (side panel) ----------
  function evForm(ev, pre) {
    pre = pre || {};
    const isNew = !ev, e = ev || {title: '', description: '', etype: 'meeting', event_date: pre.date || ymd(todayD()), end_date: null, start_time: pre.start || null, end_time: pre.end || null, operation: op || (bestRank() >= 3 ? null : ((myAddOps()[0] || {}).code || null)), owner_name: ''};
    const edit = isNew ? canAdd() : canChange(e);
    const addOps = myAddOps(), opts = (addOps.length ? addOps : []).slice();
    if (!isNew && e.operation && !opts.some(o => o.code === e.operation)) { const o = (ops || []).find(x => x.code === e.operation); if (o) opts.push(o); }
    const allOk = bestRank() >= 3;
    const dis = edit ? '' : ' disabled';
    const allDay = !e.start_time;
    $('panel').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><h3>' + (isNew ? 'New event' : edit ? 'Event' : 'Event (view only)') + '</h3><button class="btn" id="eClose">Close</button></div>'
      + '<label>Title</label><input id="eTitle" maxlength="200" value="' + esc(e.title) + '"' + dis + '>'
      + '<label>Type</label><select id="eType"' + dis + '>' + TYPES.map(t => '<option value="' + t[0] + '"' + (t[0] === e.etype ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select>'
      + '<label>Date</label><input type="date" id="eDate" value="' + e.event_date + '"' + dis + '>'
      + '<label><input type="checkbox" id="eAll" style="width:auto"' + (allDay ? ' checked' : '') + dis + '> All day</label>'
      + '<div id="eTimes" style="' + (allDay ? 'display:none' : '') + '"><label>Start time</label><input type="time" id="eStart" value="' + hm(e.start_time) + '"' + dis + '><label>End time</label><input type="time" id="eEnd" value="' + hm(e.end_time) + '"' + dis + '></div>'
      + '<div id="eEndD" style="' + (allDay ? '' : 'display:none') + '"><label>Last day (only for an all-day event over several days)</label><input type="date" id="eEndDate" value="' + (e.end_date || '') + '"' + dis + '></div>'
      + '<label>Operation</label><select id="eOp"' + dis + '>' + (allOk || (!isNew && !e.operation) ? '<option value=""' + (e.operation ? '' : ' selected') + '>All operations</option>' : '') + opts.map(o => '<option value="' + o.code + '"' + (o.code === e.operation ? ' selected' : '') + '>' + esc(o.code + ' - ' + o.name) + '</option>').join('') + '</select>'
      + '<label>Owner (who is responsible)</label><input id="eOwner" maxlength="120" value="' + esc(e.owner_name || '') + '"' + dis + '>'
      + '<label>Description</label><textarea id="eDesc" rows="4" maxlength="2000"' + dis + '>' + esc(e.description || '') + '</textarea>'
      + (isNew ? '' : '<div class="hint" style="margin-top:6px">Added by ' + esc(e.by_name || 'not captured') + (e.updated_by_name && e.updated_by_name !== e.by_name ? ' &middot; last changed by ' + esc(e.updated_by_name) : '') + '</div>')
      + '<div class="err" id="pErr"></div>'
      + (edit ? '<div class="row2"><button class="btn p" id="eSave">Save</button>' + (isNew ? '' : '<button class="btn d" id="eDel">Delete</button>') + '</div>' : '');
    $('panel').classList.add('open');
    $('eClose').onclick = () => closeDrawer();
    const sync = () => { const a = $('eAll').checked; $('eTimes').style.display = a ? 'none' : ''; $('eEndD').style.display = a ? '' : 'none'; };
    $('eAll').onchange = () => { sync(); if (!$('eAll').checked && !$('eStart').value) { $('eStart').value = '09:00'; $('eEnd').value = '10:00'; } };
    if (!edit) return;
    $('eSave').onclick = async () => {
      const g = id => $(id).value.trim(), all = $('eAll').checked, err = m => { $('pErr').textContent = m; };
      if (!g('eTitle')) return err('Write the event title first');
      if (!g('eDate')) return err('Pick the date');
      const body = {title: g('eTitle'), description: g('eDesc') || null, etype: $('eType').value, event_date: g('eDate'), operation: $('eOp').value || null, owner_name: g('eOwner') || null,
        end_date: null, start_time: null, end_time: null};
      if (all) { if (g('eEndDate')) { if (g('eEndDate') < body.event_date) return err('The last day is before the date'); body.end_date = g('eEndDate'); } }
      else { if (!g('eStart')) return err('Give the start time, or tick All day'); body.start_time = g('eStart'); if (g('eEnd')) { if (g('eEnd') <= g('eStart')) return err('The end time must be after the start time'); body.end_time = g('eEnd'); } }
      if (!body.operation && !allOk) return err('Pick an operation. Only Full access can add an event for all operations');
      try {
        if (isNew) await api('/rest/v1/cal_events', {method: 'POST', body, headers: {Prefer: 'return=minimal'}});
        else await api('/rest/v1/cal_events?id=eq.' + e.id, {method: 'PATCH', body, headers: {Prefer: 'return=minimal'}});
        closeDrawer(); toast(isNew ? 'Event added' : 'Event saved');
        if (body.event_date) { const d = pd(body.event_date); C.mo = new Date(d.getFullYear(), d.getMonth(), 1); }
        refresh();
      } catch (er) { err(er.message); }
    };
    if ($('eDel')) $('eDel').onclick = async () => {
      if ($('eDel').dataset.sure !== '1') { $('eDel').dataset.sure = '1'; $('eDel').textContent = 'Tap again to delete'; setTimeout(() => { if ($('eDel')) { $('eDel').dataset.sure = ''; $('eDel').textContent = 'Delete'; } }, 3000); return; }
      try { await api('/rest/v1/cal_events?id=eq.' + e.id, {method: 'DELETE', headers: {Prefer: 'return=minimal'}}); closeDrawer(); toast('Event deleted'); refresh(); }
      catch (er) { $('pErr').textContent = er.message; }
    };
  }

  // ---------- Home card ----------
  function card(m) {
    setTimeout(async () => { try { initDates(); const t = todayD(); await ensure(t, addD(t, 7)); const el = document.getElementById('card-calendar'); if (!el) return;
      const n = dayEvents(ymd(t)).length, soon = [...Array(7)].reduce((s, _, i) => s + dayEvents(ymd(addD(t, i + 1))).length, 0);
      el.innerHTML = '<b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">' + esc(m.sub) + '</div><div style="font-size:20px;font-weight:700;margin-top:6px">' + n + '</div><div class="hint">event' + (n === 1 ? '' : 's') + ' today &middot; ' + soon + ' in the next 7 days</div>'; } catch (e) {} }, 0);
    return '<div class="card mcard" data-mod="calendar" data-go="items" id="card-calendar"><b>' + esc(m.name) + '</b> <span class="badge b-live">Live</span><div class="hint">Loading...</div></div>';
  }

  const monthRange = () => { initDates(); return [monday(C.mo), addD(monday(new Date(C.mo.getFullYear(), C.mo.getMonth() + 1, 0)), 6)]; };
  window.MODULE_PAGES = Object.assign(window.MODULE_PAGES || {}, {calendar: {
    items: () => { initDates(); const r = monthRange(); show(drawMonth, r[0], r[1]); },
    dash: () => { initDates(); show(drawWeek, C.wk, addD(C.wk, 6)); },
    report: () => { initDates(); show(drawDay, C.day, C.day); },
    card}});
})();
