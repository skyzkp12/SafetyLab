/* ============================================================================
 * Work Plan v2 — แผนงานรายวัน (30 นาที/แถว) + ปฏิทินเดือน/สัปดาห์ + งานหลายช่อง(merge) + OT
 * renderWorkPlan() เรียกจาก app.js (navigate → 'workplan')
 * ========================================================================== */
(function () {
  const TH_DAY = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const TH_DAY_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const TH_MON = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const STATUS = { '': { lab: '—', cls: 'none' }, not_yet: { lab: 'Not Yet', cls: 'ny' },
                   finish: { lab: 'Finish', cls: 'fin' }, block: { lab: 'Block', cls: 'blk' } };
  const STATUS_CYCLE = ['', 'not_yet', 'finish', 'block'];

  const WP = { date: ymd(new Date()), calYM: ym(new Date()), weekStart: '', slots: {}, ot: false,
               types: [], typeMap: {}, times: [], otTimes: [], monthDays: [], weekData: {}, doFlash: false };

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function parseD(ds) { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(ds, n) { const dt = parseD(ds); dt.setDate(dt.getDate() + n); return ymd(dt); }
  function mondayOf(ds) { const dt = parseD(ds); const off = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - off); return ymd(dt); }
  function addMin(t, mins) { let [h, m] = t.split(':').map(Number); let tot = h * 60 + m + mins; return pad(Math.floor(tot / 60)) + ':' + pad(tot % 60); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function dateThai(ds) { const [y, m, d] = ds.split('-').map(Number); return `${d} ${TH_MON[m - 1]} ${y + 543}`; }
  function effectiveTimes() { return WP.times.concat(WP.ot ? WP.otTimes : []); }

  function toast(msg, ok = true) {
    let t = document.getElementById('wp-toast');
    if (!t) { t = document.createElement('div'); t.id = 'wp-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'wp-toast ' + (ok ? 'ok' : 'err') + ' show';
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1900);
  }
  async function api(path, method = 'GET', body) {
    const opt = { method };
    if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    const r = await fetch('/api/workplan' + path, opt);
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  window.renderWorkPlan = async function () {
    injectCss();
    document.getElementById('page-content').innerHTML = `<div id="wp-root"><div class="wp-loading">กำลังโหลด…</div></div>`;
    try {
      WP.types = await api('/types');
      WP.typeMap = {}; WP.types.forEach(t => WP.typeMap[t.code] = t);
      WP.weekStart = mondayOf(WP.date);
      await Promise.all([loadMonth(WP.calYM), loadWeek(WP.weekStart), loadDay(WP.date)]);
    } catch (e) {
      document.getElementById('wp-root').innerHTML = `<div class="wp-empty">โหลดข้อมูลไม่สำเร็จ: ${esc(e.message)}</div>`;
      return;
    }
    wpRender();
  };

  async function loadMonth(yms) { const r = await api('/month/' + yms); WP.monthDays = r.days || []; }
  async function loadWeek(mon) { const r = await api('/week/' + mon); WP.weekData = r.days || {}; }
  async function loadDay(date) {
    const r = await api('/day/' + date);
    WP.slots = (r.day && r.day.slots) || {}; WP.times = r.times || []; WP.otTimes = r.ot_times || [];
    WP.ot = !!(r.day && r.day.ot);
  }

  function wpRender() {
    document.getElementById('wp-root').innerHTML =
      `<div class="wp-top">${calendarHtml()}${weekHtml()}</div>` + legendHtml() + dayHeaderHtml() + `<div id="wp-grid">${gridHtml()}</div>`;
    wireTop(); wireGrid();
    if (WP.doFlash) { WP.doFlash = false; flashWeekCells(); }
  }
  function refreshGrid() { const g = document.getElementById('wp-grid'); if (g) { g.innerHTML = gridHtml(); wireGrid(); } }

  /* ── ปฏิทินเดือน (ซ้าย) ─────────────────────────────────── */
  function calendarHtml() {
    const [y, m] = WP.calYM.split('-').map(Number);
    const first = new Date(y, m - 1, 1), start = first.getDay(), dim = new Date(y, m, 0).getDate(), today = ymd(new Date());
    let cells = '';
    for (let i = 0; i < start; i++) cells += `<div class="wp-cal-cell empty"></div>`;
    for (let d = 1; d <= dim; d++) {
      const ds = y + '-' + pad(m) + '-' + pad(d);
      const cls = [ds === WP.date ? 'sel' : '', ds === today ? 'today' : '', WP.monthDays.includes(ds) ? 'has' : ''].join(' ');
      cells += `<div class="wp-cal-cell ${cls}" data-d="${ds}">${d}${WP.monthDays.includes(ds) ? '<span class="wp-cal-dot"></span>' : ''}</div>`;
    }
    return `<div class="wp-cal">
      <div class="wp-cal-head"><button class="wp-navbtn" id="wp-prev">‹</button><b>${TH_MON[m - 1]} ${y + 543}</b>
        <button class="wp-navbtn" id="wp-next">›</button><span class="wp-spacer"></span><button class="wp-btn ghost" id="wp-today">วันนี้</button></div>
      <div class="wp-cal-grid">${TH_DAY.map(d => `<div class="wp-cal-dow">${d}</div>`).join('')}${cells}</div></div>`;
  }

  /* ── ปฏิทิน/Overview สัปดาห์ (ขวา) ─────────────────────── */
  function extractJobs(day) {
    const set = new Set(), slots = (day && day.slots) || {}, re = /(I[KP])[-\s]?(\d{4})[-\s]?(\d{3,4})/gi;
    Object.values(slots).forEach(s => ['s1', 's2'].forEach(k => {
      const o = s[k] || {}, txt = (o.title || '') + ' ' + (o.detail || ''); let m;
      while ((m = re.exec(txt))) set.add(m[1].toUpperCase() + '-' + m[2] + '-' + m[3]);
    }));
    return [...set];
  }
  function weekHtml() {
    const wkEnd = addDays(WP.weekStart, 6);
    let rows = '';
    for (let i = 0; i < 7; i++) {
      const ds = addDays(WP.weekStart, i), dow = parseD(ds).getDay();
      const jobs = extractJobs(WP.weekData[ds] || { slots: {} });
      const isSel = ds === WP.date, isToday = ds === ymd(new Date());
      rows += `<button class="wp-wk-row ${isSel ? 'sel' : ''} ${isToday ? 'today' : ''}" data-d="${ds}">
        <span class="wp-wk-day">${TH_DAY[dow]}<b>${parseD(ds).getDate()}</b></span>
        <span class="wp-wk-jobs">${jobs.length ? jobs.map(j => `<span class="wp-jobchip">${esc(j)}</span>`).join('') : '<span class="wp-wk-empty">—</span>'}</span></button>`;
    }
    return `<div class="wp-week">
      <div class="wp-week-head"><button class="wp-navbtn" id="wp-wprev">‹</button>
        <b>สัปดาห์ ${parseD(WP.weekStart).getDate()}–${parseD(wkEnd).getDate()} ${TH_MON[parseD(wkEnd).getMonth()]}</b>
        <button class="wp-navbtn" id="wp-wnext">›</button><span class="wp-spacer"></span><span class="wp-week-cap">งานที่ทดสอบในสัปดาห์นี้</span></div>
      <div class="wp-week-list">${rows}</div></div>`;
  }
  function flashWeekCells() {
    let cur = WP.weekStart;
    for (let i = 0; i < 7; i++) { const cell = document.querySelector(`.wp-cal-cell[data-d="${cur}"]`); if (cell) cell.classList.add('wk'); cur = addDays(cur, 1); }
    setTimeout(() => document.querySelectorAll('.wp-cal-cell.wk').forEach(c => c.classList.remove('wk')), 1500);
  }

  function legendHtml() {
    return `<div class="wp-legend">${WP.types.map(t => `<span class="wp-leg"><span class="wp-leg-dot" style="background:${t.color}"></span>${t.code} ${esc(t.label)}</span>`).join('')}</div>`;
  }
  function dayHeaderHtml() {
    const dow = parseD(WP.date).getDay(), filled = Object.keys(WP.slots).length;
    return `<div class="wp-dayhead">
      <div class="wp-dayhead-l"><b>แผนงาน วัน${TH_DAY_FULL[dow]} ที่ ${dateThai(WP.date)}</b>
        <span class="wp-muted">${filled ? filled + ' ช่วงเวลามีงาน' : 'ยังว่าง'}${WP.ot ? ' · เปิด OT' : ''}</span></div>
      <div class="wp-dayhead-r"><button class="wp-btn excel" id="wp-exp-day">⬇ Export วันนี้</button>
        <button class="wp-btn excel2" id="wp-exp-month">⬇ Export ทั้งเดือน</button></div></div>`;
  }

  /* ── ตารางเวลา + งานหลายช่อง (merge) + OT ──────────────── */
  function gridHtml() {
    const times = effectiveTimes(), covered = {};
    times.forEach((t, i) => { const s = WP.slots[t]; const span = (s && s.span) || 1; if (span > 1) for (let k = 1; k < span && i + k < times.length; k++) covered[times[i + k]] = t; });
    let rows = '';
    times.forEach((t, i) => {
      if (covered[t]) { rows += `<tr class="wp-covered"></tr>`; return; }   // แถวว่างให้ rowspan ครอบ (ห้ามข้าม)
      const s = WP.slots[t] || {}; const span = Math.min((s.span || 1), times.length - i); rows += rowHtml(t, span, i);
    });
    const otLabel = WP.ot ? '－ ปิดโซน OT' : '＋ เปิดโซน OT (ทำงานล่วงเวลา ถึงเที่ยงคืน)';
    return `<div class="wp-tablewrap"><table class="wp-table">
      <thead><tr><th style="width:78px">ช่วงเวลา</th><th style="width:180px">ประเภทงาน</th>
        <th>Station 1 (แผนล่วงหน้า)</th><th>Station 2 (หน้างานจริง)</th><th style="width:108px">สถานะ</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="wp-otbar"><button class="wp-btn ${WP.ot ? 'otoff' : 'ot'}" id="wp-ot">${otLabel}</button></div>`;
  }
  function rowHtml(t, span, i) {
    const s = WP.slots[t] || {}, ty = s.type ? WP.typeMap[s.type] : null;
    const rs = span > 1 ? ` rowspan="${span}"` : '';
    const timeLabel = span > 1 ? (t + '–' + addMin(t, 30 * span)) : t;
    const otRow = i >= WP.times.length;
    const tint = ty ? `box-shadow:inset 4px 0 0 ${ty.color};` : '';
    return `<tr data-t="${t}" class="${otRow ? 'wp-otrow' : ''}" style="${tint}">
      <td class="wp-time"${rs}>${timeLabel}${span > 1 ? `<span class="wp-dur">${span / 2} ชม.</span>` : ''}</td>
      <td${rs}>${typeSelectHtml(t, s.type)}</td>
      <td${rs}>${stationCell(t, 's1', s.s1)}</td>
      <td${rs}>${stationCell(t, 's2', s.s2)}</td>
      <td${rs}>${statusHtml(t, s.status)}</td></tr>`;
  }
  function typeSelectHtml(t, val) {
    const c = val && WP.typeMap[val] ? WP.typeMap[val].color : '#cbd5e1';
    return `<div class="wp-type"><span class="wp-type-dot" style="background:${c}"></span>
      <select class="wp-type-sel" data-t="${t}"><option value="">— เลือกงาน —</option>
      ${WP.types.map(ty => `<option value="${ty.code}" ${val === ty.code ? 'selected' : ''}>${ty.code} · ${esc(ty.label)}</option>`).join('')}</select></div>`;
  }
  function stationCell(t, sk, obj) {
    obj = obj || {};
    if (!(obj.title || obj.detail)) return `<button class="wp-st empty" data-t="${t}" data-s="${sk}">＋ เพิ่มรายละเอียด</button>`;
    return `<button class="wp-st" data-t="${t}" data-s="${sk}"><b>${esc(obj.title) || '(ไม่มีหัวข้อ)'}</b>${obj.detail ? `<span>${esc(obj.detail)}</span>` : ''}</button>`;
  }
  function statusHtml(t, st) { const info = STATUS[st || ''] || STATUS['']; return `<button class="wp-status ${info.cls}" data-t="${t}">${info.lab}</button>`; }

  /* ── wiring ─────────────────────────────────────────────── */
  function wireTop() {
    const g = id => document.getElementById(id);
    g('wp-prev').onclick = () => shiftMonth(-1);
    g('wp-next').onclick = () => shiftMonth(1);
    g('wp-today').onclick = () => gotoDate(ymd(new Date()), true);
    g('wp-wprev').onclick = () => shiftWeek(-1);
    g('wp-wnext').onclick = () => shiftWeek(1);
    document.querySelectorAll('.wp-cal-cell[data-d]').forEach(c => c.onclick = () => gotoDate(c.dataset.d));
    document.querySelectorAll('.wp-wk-row').forEach(c => c.onclick = () => gotoDate(c.dataset.d));
    g('wp-exp-day').onclick = () => download('/day/' + WP.date + '/export.xlsx', 'วันนี้');
    g('wp-exp-month').onclick = () => download('/month/' + WP.calYM + '/export.xlsx', 'ทั้งเดือน');
  }
  function wireGrid() {
    document.querySelectorAll('.wp-type-sel').forEach(s => s.onchange = () => setType(s));
    document.querySelectorAll('.wp-st').forEach(b => b.onclick = () => stationPopup(b.dataset.t, b.dataset.s));
    document.querySelectorAll('.wp-status').forEach(b => b.onclick = () => cycleStatus(b.dataset.t, b));
    const ot = document.getElementById('wp-ot'); if (ot) ot.onclick = toggleOT;
  }

  async function gotoDate(ds, alsoMonth) {
    WP.date = ds;
    const mon = mondayOf(ds);
    const weekChanged = mon !== WP.weekStart;
    if (weekChanged) { WP.weekStart = mon; WP.doFlash = true; }
    if (alsoMonth || ym(parseD(ds)) !== WP.calYM) WP.calYM = ym(parseD(ds));
    await Promise.all([weekChanged ? loadWeek(mon) : Promise.resolve(), loadMonth(WP.calYM), loadDay(ds)]);
    wpRender();
  }
  async function shiftMonth(delta) {
    const [y, m] = WP.calYM.split('-').map(Number);
    WP.calYM = ym(new Date(y, m - 1 + delta, 1)); await loadMonth(WP.calYM); wpRender();
  }
  async function shiftWeek(delta) {
    WP.weekStart = addDays(WP.weekStart, delta * 7); WP.date = WP.weekStart; WP.doFlash = true;
    if (ym(parseD(WP.weekStart)) !== WP.calYM) { WP.calYM = ym(parseD(WP.weekStart)); await loadMonth(WP.calYM); }
    await Promise.all([loadWeek(WP.weekStart), loadDay(WP.date)]); wpRender();
  }
  function toggleOT() { WP.ot = !WP.ot; refreshGrid(); saveDayBg(); }

  /* ── optimistic edits (instant UI, save เบื้องหลัง) ─────── */
  function slotObj(t) { WP.slots[t] = WP.slots[t] || { type: '', s1: {}, s2: {}, status: '', span: 1 }; return WP.slots[t]; }
  function isEmptySlot(o) { return o && !o.type && !o.status && !(o.s1 || {}).title && !(o.s1 || {}).detail && !(o.s2 || {}).title && !(o.s2 || {}).detail; }
  function cleanupSlot(t) { if (isEmptySlot(WP.slots[t])) delete WP.slots[t]; }
  function setType(sel) {
    const t = sel.dataset.t, o = slotObj(t); o.type = sel.value; cleanupSlot(t);
    const ty = sel.value ? WP.typeMap[sel.value] : null, tr = sel.closest('tr');
    if (tr) tr.style.boxShadow = ty ? ('inset 4px 0 0 ' + ty.color) : '';
    const dot = tr && tr.querySelector('.wp-type-dot'); if (dot) dot.style.background = ty ? ty.color : '#cbd5e1';
    saveDayBg();
  }
  function cycleStatus(t, btn) {
    const o = slotObj(t), nx = STATUS_CYCLE[(STATUS_CYCLE.indexOf(o.status || '') + 1) % STATUS_CYCLE.length];
    o.status = nx; cleanupSlot(t);
    const info = STATUS[nx] || STATUS['']; btn.className = 'wp-status ' + info.cls; btn.textContent = info.lab;
    saveDayBg();
  }
  function updateCalDot() {
    const has = Object.keys(WP.slots).length > 0, inList = WP.monthDays.includes(WP.date);
    if (has && !inList) WP.monthDays.push(WP.date);
    if (!has && inList) WP.monthDays = WP.monthDays.filter(d => d !== WP.date);
    if (WP.weekData[WP.date]) WP.weekData[WP.date].slots = WP.slots; else WP.weekData[WP.date] = { slots: WP.slots };
    const cell = document.querySelector('.wp-cal-cell.sel');
    if (cell) { cell.classList.toggle('has', has); const dot = cell.querySelector('.wp-cal-dot');
      if (has && !dot) { const s = document.createElement('span'); s.className = 'wp-cal-dot'; cell.appendChild(s); } if (!has && dot) dot.remove(); }
  }
  function saveDayBg() { updateCalDot(); saveDay(); }
  async function saveDay() {
    try { await api('/day/' + WP.date, 'POST', { slots: WP.slots, ot: WP.ot }); }
    catch (e) { toast('เซฟไม่สำเร็จ (ลองแก้อีกครั้ง): ' + e.message, false); }
  }

  /* ── Station popup + ระยะเวลา (span) ────────────────────── */
  function maxSpanAt(t) {
    const times = effectiveTimes(), i = times.indexOf(t); if (i < 0) return 1;
    let mx = 1;
    for (let k = 1; i + k < times.length; k++) { const ct = times[i + k], cs = WP.slots[ct]; if (cs && !isEmptySlot(cs)) break; mx++; }
    return Math.min(mx, 16);
  }
  function stationPopup(t, sk) {
    const slot = WP.slots[t] || {}, o = slot[sk] || {}, curSpan = slot.span || 1, mx = Math.max(curSpan, maxSpanAt(t));
    const label = sk === 's1' ? 'Station 1 — งานที่วางแผนไว้' : 'Station 2 — งานจริงหน้างาน (ถ้าเปลี่ยนจากแผน)';
    let durOpts = '';
    for (let n = 1; n <= mx; n++) durOpts += `<option value="${n}" ${n === curSpan ? 'selected' : ''}>${n === 1 ? '30 นาที' : (n / 2) + ' ชม. (' + n + ' ช่อง)'}</option>`;
    const body = `<div class="wp-form">
      <div class="wp-fld"><label class="wp-fl">หัวข้องาน</label><input id="wp-t" class="wp-input" value="${esc(o.title)}" placeholder="เช่น ทดสอบฝุ่น IP-2601-0001"></div>
      <div class="wp-fld"><label class="wp-fl">รายละเอียด</label><textarea id="wp-d" class="wp-input" rows="3" placeholder="รายละเอียดงาน / หมายเหตุ">${esc(o.detail)}</textarea></div>
      <div class="wp-fld"><label class="wp-fl">⏱ ใช้เวลาทำงาน (จะเหมาช่องเวลา + merge แถวให้อัตโนมัติ)</label>
        <select id="wp-span" class="wp-input">${durOpts}</select></div></div>`;
    modal(`${label} · ${t}`, body, [
      (o.title || o.detail) ? { label: 'ล้างช่องนี้', cls: 'ghost', fn: () => { closeModal(); saveStation(t, sk, {}, null); } } : null,
      { label: 'บันทึก', cls: 'primary', fn: () => {
        const title = document.getElementById('wp-t').value.trim(), detail = document.getElementById('wp-d').value.trim();
        const span = parseInt(document.getElementById('wp-span').value, 10) || 1;
        closeModal(); saveStation(t, sk, (title || detail) ? { title, detail } : {}, span);
      } },
    ].filter(Boolean));
  }
  function saveStation(t, sk, val, span) {
    const o = slotObj(t); o[sk] = val;
    if (span != null) o.span = span; else if (!o.span) o.span = 1;
    cleanupSlot(t);
    saveDayBg(); refreshGrid();   // rebuild เพื่อให้ merge/แถวถูกต้อง
  }

  function download(path, what) {
    const a = document.createElement('a'); a.href = '/api/workplan' + path; document.body.appendChild(a); a.click(); a.remove();
    toast('กำลังดาวน์โหลด Excel (' + what + ')');
  }

  /* ── modal ──────────────────────────────────────────────── */
  function modal(title, bodyHtml, buttons) {
    closeModal();
    const ov = document.createElement('div'); ov.className = 'wp-ov'; ov.id = 'wp-ov';
    ov.innerHTML = `<div class="wp-modal"><div class="wp-modal-h"><b>${esc(title)}</b><button class="wp-x" id="wp-x">✕</button></div>
      <div class="wp-modal-b">${bodyHtml}</div>
      <div class="wp-modal-f">${(buttons || []).map((b, i) => `<button class="wp-btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#wp-x').onclick = closeModal;
    ov.onclick = e => { if (e.target === ov) closeModal(); };
    (buttons || []).forEach((b, i) => { ov.querySelector(`[data-i="${i}"]`).onclick = b.fn; });
    requestAnimationFrame(() => ov.classList.add('show'));
  }
  function closeModal() { const o = document.getElementById('wp-ov'); if (o) o.remove(); }

  /* ── CSS ────────────────────────────────────────────────── */
  function injectCss() {
    if (document.getElementById('wp-css')) return;
    const s = document.createElement('style'); s.id = 'wp-css';
    s.textContent = `
    #wp-root{font-size:13px;color:#0f172a}
    .wp-loading,.wp-empty{padding:40px;text-align:center;color:#64748b}
    .wp-top{display:flex;gap:12px;margin-bottom:12px;align-items:stretch;flex-wrap:wrap}
    .wp-cal,.wp-week{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px}
    .wp-cal{flex:0 0 340px} .wp-week{flex:1;min-width:300px;display:flex;flex-direction:column}
    .wp-cal-head,.wp-week-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .wp-cal-head b,.wp-week-head b{font-size:14px} .wp-spacer{flex:1}
    .wp-week-cap{font-size:11px;color:#94a3b8}
    .wp-navbtn{border:1px solid #e2e8f0;background:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:15px;color:#475569}
    .wp-navbtn:hover{background:#f1f5f9}
    .wp-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
    .wp-cal-dow{text-align:center;font-size:11px;color:#94a3b8;font-weight:700;padding:2px 0}
    .wp-cal-cell{position:relative;aspect-ratio:1.5;display:flex;align-items:center;justify-content:center;border-radius:8px;cursor:pointer;font-size:12.5px;color:#334155;border:1px solid transparent}
    .wp-cal-cell.empty{cursor:default} .wp-cal-cell:not(.empty):hover{background:#f1f5f9}
    .wp-cal-cell.today{border-color:#93c5fd;font-weight:800}
    .wp-cal-cell.sel{background:#1e40af;color:#fff;font-weight:800}
    .wp-cal-dot{position:absolute;bottom:4px;width:5px;height:5px;border-radius:50%;background:#16a34a}
    .wp-cal-cell.sel .wp-cal-dot{background:#fff}
    .wp-cal-cell.wk{animation:wkflash 1.5s ease-out}
    @keyframes wkflash{0%,12%{box-shadow:inset 0 0 0 2px #f59e0b;background:rgba(245,158,11,.4)}100%{box-shadow:none;background:transparent}}
    .wp-week-list{display:flex;flex-direction:column;gap:4px;overflow:auto}
    .wp-wk-row{display:flex;align-items:center;gap:10px;text-align:left;border:1px solid #eef2f7;background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer;font-family:inherit}
    .wp-wk-row:hover{background:#f8fafc;border-color:#dbeafe}
    .wp-wk-row.sel{border-color:#1e40af;background:#eff6ff}
    .wp-wk-row.today .wp-wk-day{color:#1e40af}
    .wp-wk-day{flex:0 0 44px;color:#64748b;font-size:11px;font-weight:700;display:flex;flex-direction:column;align-items:center;line-height:1.1}
    .wp-wk-day b{font-size:15px;color:#0f172a}
    .wp-wk-jobs{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
    .wp-jobchip{background:#eef2ff;color:#4338ca;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700}
    .wp-wk-empty{color:#cbd5e1}
    .wp-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:12px}
    .wp-leg{display:flex;align-items:center;gap:5px;font-size:11.5px;color:#475569}
    .wp-leg-dot{width:10px;height:10px;border-radius:3px}
    .wp-dayhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}
    .wp-dayhead-l b{font-size:16px}.wp-dayhead-l .wp-muted{margin-left:8px;font-size:12px}
    .wp-dayhead-r{display:flex;gap:8px}.wp-muted{color:#94a3b8}
    .wp-btn{border:0;border-radius:9px;padding:8px 13px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
    .wp-btn.primary{background:#1e40af;color:#fff}.wp-btn.ghost{background:#f1f5f9;color:#475569}
    .wp-btn.excel{background:#15803d;color:#fff}.wp-btn.excel2{background:#0d9488;color:#fff}
    .wp-btn.ot{background:#f59e0b;color:#fff}.wp-btn.otoff{background:#64748b;color:#fff}
    .wp-tablewrap{overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
    .wp-table{border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px}
    .wp-table th{background:#f8fafc;color:#64748b;font-weight:700;padding:9px 10px;text-align:left;border-bottom:1px solid #e2e8f0;position:sticky;top:0}
    .wp-table td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top}
    .wp-table tr:hover td{background:#fafcff}
    .wp-otrow td{background:#fffbeb}
    .wp-time{font-weight:700;color:#475569;white-space:nowrap}
    .wp-dur{display:block;font-size:10px;color:#ea580c;font-weight:700}
    .wp-type{display:flex;align-items:center;gap:6px}
    .wp-type-dot{width:10px;height:10px;border-radius:50%;flex:none}
    .wp-type-sel{border:1px solid #e2e8f0;border-radius:8px;padding:5px 6px;font-size:12px;font-family:inherit;background:#fff;max-width:160px;color:#0f172a}
    .wp-st{width:100%;text-align:left;border:1px dashed #e2e8f0;background:#fff;border-radius:8px;padding:5px 9px;cursor:pointer;font-family:inherit;font-size:12px;display:flex;flex-direction:column;gap:1px;min-height:30px}
    .wp-st:hover{border-color:#93c5fd;background:#f8fafc}
    .wp-st.empty{color:#94a3b8;align-items:center;justify-content:center}
    .wp-st b{color:#0f172a}.wp-st span{color:#64748b;font-size:11px;white-space:pre-wrap}
    .wp-status{width:100%;border:1px solid #e2e8f0;border-radius:20px;padding:5px 8px;font-weight:700;font-size:11.5px;cursor:pointer;font-family:inherit;background:#fff;color:#94a3b8}
    .wp-status.ny{background:#f1f5f9;color:#475569}.wp-status.fin{background:#dcfce7;color:#15803d;border-color:#86efac}.wp-status.blk{background:#fee2e2;color:#b91c1c;border-color:#fca5a5}
    .wp-otbar{padding:10px 0 4px;text-align:center}
    .wp-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity .15s;padding:16px}
    .wp-ov.show{opacity:1}
    .wp-modal{background:#fff;border-radius:16px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)}
    .wp-modal-h{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eef2f7}
    .wp-modal-h b{font-size:15px}.wp-x{border:0;background:transparent;font-size:16px;cursor:pointer;color:#94a3b8}
    .wp-modal-b{padding:16px 18px}.wp-modal-f{padding:12px 18px;border-top:1px solid #eef2f7;display:flex;gap:8px;justify-content:flex-end}
    .wp-form{display:flex;flex-direction:column;gap:11px}.wp-fld{display:flex;flex-direction:column;gap:4px}
    .wp-fl{font-size:12px;font-weight:700;color:#64748b}
    .wp-input{border:1px solid #e2e8f0;border-radius:9px;padding:9px 11px;font-size:14px;font-family:inherit;outline:none;color:#0f172a;width:100%}
    .wp-input:focus{border-color:#3b82f6}
    .wp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:10px;font-weight:700;font-size:13px;z-index:10000;opacity:0;transition:opacity .2s}
    .wp-toast.show{opacity:1}.wp-toast.err{background:#e11d48}
    @media(max-width:760px){.wp-cal{flex:1 1 100%}}
    `;
    document.head.appendChild(s);
  }
})();
