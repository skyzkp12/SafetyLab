/* ============================================================================
 * Work Track — ตารางสถานะงานทดสอบ IP/IK (แก้ไขเองได้)
 * renderWorkTrack() ถูกเรียกจาก app.js (navigate → 'worktrack')
 * ========================================================================== */
(function () {
  const MONTHS_EN = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

  const WT = {
    kind: 'ip',
    data: { companies: {}, ip: [], ik: [] },
    filter: { company: '', month: '', code: '', q: '' },
    monthOff: 0,   // การ์ด "ส่งแล้วในเดือน" — offset จากเดือนปัจจุบัน (0=เดือนนี้, -1=เดือนก่อน)
    seq: {},       // {jobId: {seq, round}} — ลำดับการใช้งานเครื่องมือ IP (คำนวณจากวันที่)
    loaded: false,
  };

  // ── รอบบำรุงรักษาเครื่องมือ IP: ใช้ครบ 20 งาน = ต้องบำรุงรักษา (1 งาน = 1 ครั้ง) ──
  const MAINT_CYCLE = 20;
  const MAINT_WARN = { 17: 'yel', 18: 'org', 19: 'red', 20: 'due' };

  // ประเภทงาน — ปุ่มเดียวกดวน '' → ปกติ → ด่วน → Pretest → RP01 → ''
  const JOB_TYPES = ['', 'normal', 'urgent', 'pretest', 'rp01'];
  const TYPE_META = {
    normal:  { text: 'ปกติ',    full: 'งานปกติ — กดเพื่อเปลี่ยนเป็น งานเร่งด่วน',  cls: 'nor' },
    urgent:  { text: 'ด่วน',    full: 'งานเร่งด่วน — กดเพื่อเปลี่ยนเป็น Pretest',  cls: 'urg' },
    pretest: { text: 'Pretest', full: 'งาน Pretest — กดเพื่อเปลี่ยนเป็น ออก RP01', cls: 'pre' },
    rp01:    { text: 'RP01',    full: 'งานออก RP01 — กดเพื่อล้างค่า',              cls: 'rp'  },
  };

  // ผลทดสอบรวม — กดวน '' → P → F → NA → ''
  const RESULTS = ['', 'P', 'F', 'NA'];
  const RESULT_META = {
    P:  { text: 'P',   full: 'ผลทดสอบ: Pass',  cls: 'p'  },
    F:  { text: 'F',   full: 'ผลทดสอบ: Fail',  cls: 'f'  },
    NA: { text: 'N/A', full: 'ผลทดสอบ: N/A',   cls: 'na' },
  };

  // เดือนที่การ์ดกำลังโชว์ (ตาม WT.monthOff) → {key:YYYYMM, date}
  function selMonth() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + WT.monthOff);
    return { key: d.getFullYear() * 100 + (d.getMonth() + 1), date: d };
  }

  // สถานะ: def = {key, abbr(หัวคอลัมน์ย่อ), full(คำอธิบายเต็ม), kind('time'|'water'|'volt'|'plain')}
  const IP_STATUS = [
    { key: 'st_photo_before', abbr: 'รูปก่อน',  full: 'ถ่ายรูปก่อนทดสอบ' },
    { key: 'st_probe',        abbr: 'Probe',    full: 'ทดสอบ Test Probe' },
    { key: 'st_dust',         abbr: 'ฝุ่น',     full: 'ทดสอบฝุ่น (กรอกเวลาเริ่ม–สิ้นสุด)', mode: 'dust' },
    { key: 'st_water',        abbr: 'น้ำ',      full: 'ทดสอบน้ำ (กรอกเวลาเริ่ม–สิ้นสุด)', mode: 'water' },
    { key: 'st_hipot',        abbr: 'HiPot',    full: 'ทดสอบความทนทานไฟฟ้า (ระบุแรงดัน)', mode: 'volt' },
    { key: 'st_photo_after',  abbr: 'รูปหลัง',  full: 'ถ่ายรูปหลังทดสอบ' },
    { key: 'st_academic',     abbr: 'วิชาการ',  full: 'จดใบบันทึกวิชาการ' },
    { key: 'st_testresult',   abbr: 'Result',   full: 'จัดทำ Test Result' },
    { key: 'st_testreport',   abbr: 'Report',   full: 'จัดทำ Test Report' },
    { key: 'st_sent_admin',   abbr: 'ส่งแอดมิน', full: 'จัดส่งให้แอดมิน' },
  ];
  const IK_STATUS = [
    { key: 'st_photo_before', abbr: 'รูปก่อน',  full: 'ถ่ายรูปก่อนทดสอบ' },
    { key: 'st_test',         abbr: 'ทดสอบ',    full: 'สถานะการทดสอบ (กรอกเวลาเริ่ม–สิ้นสุด)', mode: 'iktime' },
    { key: 'st_testresult',   abbr: 'Result',   full: 'จัดทำ Test Result' },
    { key: 'st_testreport',   abbr: 'Report',   full: 'จัดทำ Test Report' },
    { key: 'st_sent_admin',   abbr: 'ส่งแอดมิน', full: 'จัดส่งให้แอดมิน' },
  ];
  const statusDefs = () => WT.kind === 'ip' ? IP_STATUS : IK_STATUS;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  const isDone = v => v === '1' || v === 1 || v === true || v === 'done';

  function toast(msg, ok = true) {
    let t = document.getElementById('wt-toast');
    if (!t) { t = document.createElement('div'); t.id = 'wt-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'wt-toast ' + (ok ? 'ok' : 'err') + ' show';
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2000);
  }

  async function api(path, method = 'GET', body) {
    const opt = { method };
    if (body !== undefined) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    const r = await fetch('/api/worktrack' + path, opt);
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  // ── เดือน/ปี ของงาน: parse จากเลขงาน IP-YYMM-xxxx ก่อน, ไม่ได้ค่อยใช้วันที่รับงาน ──
  function jobMonth(job) {
    const jn = String(job.job_no || '');
    let m = jn.match(/[-\s](\d{2})(\d{2})[-\s]/);           // IP-2601-0001
    if (!m) m = jn.match(/(?:IP|IK)[-\s]?(\d{2})(\d{2})/i);   // IK2601...
    if (m) { const yy = +m[1], mm = +m[2]; if (mm >= 1 && mm <= 12) return { y: 2000 + yy, m: mm }; }
    const dr = String(job.date_received || job.date_planned || '');
    const dm = dr.match(/(\d{4})-(\d{2})/);
    if (dm) return { y: +dm[1], m: +dm[2] };
    return null;
  }
  function monthKey(job) { const g = jobMonth(job); return g ? (g.y * 100 + g.m) : 0; }
  function monthLabel(job) { const g = jobMonth(job); return g ? (MONTHS_EN[g.m - 1] + ' ' + g.y) : 'ไม่ระบุเดือน'; }

  function dot(company) {
    const c = WT.data.companies[company] || '#94a3b8';
    return `<span class="wt-dot" style="background:${c}"></span>`;
  }

  /* ── ลำดับการใช้งานเครื่องมือ IP ────────────────────────────────
   * เรียงงาน IP ตามวันที่ลงแผนทดสอบ (ไม่มีก็ใช้วันที่รับงาน) แล้วรันเลข 1..20 อัตโนมัติ
   * ครบ 20 → วนกลับเป็น 1 ของรอบถัดไป · ติ๊ก maint_reset = บำรุงรักษาหลังงานนั้น เริ่ม 1 ใหม่เลย
   * งานที่ยังไม่มีวันที่จะไม่ถูกนับ (ไม่รู้ลำดับการใช้เครื่องมือ)
   * ────────────────────────────────────────────────────────────── */
  function seqDate(j) { return String(j.date_planned || j.date_received || '').trim(); }

  function maintSeqMap() {
    const map = {};
    const jobs = (WT.data.ip || []).filter(seqDate).slice();
    jobs.sort((a, b) => {
      const da = seqDate(a), db = seqDate(b);
      if (da !== db) return da < db ? -1 : 1;
      return String(a.job_no || '').localeCompare(String(b.job_no || ''));
    });
    let n = 1, round = 1;
    jobs.forEach(j => {
      map[j.id] = { seq: n, round };
      if (isDone(j.maint_reset) || n >= MAINT_CYCLE) { n = 1; round++; } else { n++; }
    });
    return map;
  }
  function refreshSeq() { WT.seq = WT.kind === 'ip' ? maintSeqMap() : {}; return WT.seq; }

  // งานล่าสุดตามลำดับ = ตำแหน่งปัจจุบันของเครื่องมือในรอบ
  function maintNow() {
    let best = null;
    Object.keys(WT.seq).forEach(id => {
      const s = WT.seq[id];
      if (!best || s.round > best.round || (s.round === best.round && s.seq > best.seq)) best = { ...s, id };
    });
    return best;
  }

  /* ── render entry ──────────────────────────────────────────────── */
  window.renderWorkTrack = async function () {
    injectCss();
    const host = document.getElementById('page-content');
    host.innerHTML = `<div id="wt-root"><div class="wt-loading">กำลังโหลด…</div></div>`;
    try {
      WT.data = await api('/all');
      WT.loaded = true;
    } catch (e) {
      document.getElementById('wt-root').innerHTML = `<div class="wt-empty">โหลดข้อมูลไม่สำเร็จ: ${esc(e.message)}</div>`;
      return;
    }
    wtRender();
  };

  function currentList() { return (WT.data[WT.kind] || []); }

  function filtered() {
    const f = WT.filter;
    return currentList().filter(j => {
      if (f.company && j.company !== f.company) return false;
      if (f.month && String(monthKey(j)) !== f.month) return false;
      if (f.code && !String(j.test_code || '').toLowerCase().includes(f.code.toLowerCase())) return false;
      if (f.q) { const hay = (j.job_no + ' ' + j.company + ' ' + j.tester + ' ' + j.test_code).toLowerCase(); if (!hay.includes(f.q.toLowerCase())) return false; }
      return true;
    });
  }

  function wtRender() {
    refreshSeq();
    const root = document.getElementById('wt-root');
    root.innerHTML =
      tabsHtml() +
      cardsHtml() +
      filtersHtml() +
      tableAreaHtml();
    wireTop();
  }

  function tabsHtml() {
    return `<div class="wt-tabs">
      <button class="wt-tab ${WT.kind === 'ip' ? 'on' : ''}" data-k="ip">🚿 Work Status — IP</button>
      <button class="wt-tab ${WT.kind === 'ik' ? 'on' : ''}" data-k="ik">🔨 Work Status — IK</button>
    </div>`;
  }

  /* ── การ์ดสรุป ──────────────────────────────────────────────── */
  function cardsHtml() {
    refreshSeq();
    const list = currentList();
    const sentTotal = list.filter(j => isDone(j.st_sent_admin)).length;
    // เดือนที่เลือกดู (เลื่อนย้อนหลังได้ด้วยปุ่ม ‹ ›)
    const sel = selMonth();
    const isCur = WT.monthOff === 0;
    const monLab = MONTHS_EN[sel.date.getMonth()] + ' ' + sel.date.getFullYear();
    const monthList = list.filter(j => monthKey(j) === sel.key);
    const monthSent = monthList.filter(j => isDone(j.st_sent_admin));
    // ranking บริษัท
    const cnt = {}; list.forEach(j => { const c = (j.company || '').trim(); if (c) cnt[c] = (cnt[c] || 0) + 1; });
    const rank = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const medal = ['🥇', '🥈', '🥉'];
    const maxc = rank.length ? rank[0][1] : 1;
    return `<div class="wt-cards${WT.kind === 'ip' ? ' four' : ''}">
      ${WT.kind === 'ip' ? maintCardHtml() : ''}
      <div class="wt-card">
        <div class="wt-card-lab">📦 ส่งแอดมินแล้วทั้งหมด</div>
        <div class="wt-card-val">${sentTotal}<span class="wt-card-unit"> / ${list.length} งาน</span></div>
        <div class="wt-card-foot">งาน ${WT.kind.toUpperCase()} ที่จัดส่งครบแล้ว</div>
      </div>
      <div class="wt-card wt-clickable" id="wt-card-month">
        <div class="wt-card-lab wt-lab-row">
          <span>🗓️ ส่งแล้ว${isCur ? 'ในเดือนนี้' : 'ในเดือน'}</span>
          <span class="wt-mnav">
            <button class="wt-mbtn" id="wt-m-prev" title="เดือนก่อนหน้า">‹</button>
            <button class="wt-mbtn" id="wt-m-next" title="เดือนถัดไป"${isCur ? ' disabled' : ''}>›</button>
          </span>
        </div>
        <div class="wt-card-val" style="color:#0d9488">${monthSent.length}<span class="wt-card-unit"> / ${monthList.length} งาน</span></div>
        <div class="wt-card-foot">${monLab} · แตะดูรายละเอียด ›</div>
      </div>
      <div class="wt-card">
        <div class="wt-card-lab">🏆 บริษัทส่งทดสอบมากสุด</div>
        <div class="wt-rank">
          ${rank.length ? rank.map((r, i) => `<div class="wt-rank-row">
            <span class="wt-rank-medal">${medal[i]}</span>${dot(r[0])}
            <span class="wt-rank-name">${esc(r[0])}</span>
            <span class="wt-rank-bar"><span style="width:${Math.round(r[1] / maxc * 100)}%;background:${WT.data.companies[r[0]] || '#64748b'}"></span></span>
            <b class="wt-rank-cnt">${r[1]}</b></div>`).join('') : '<div class="wt-card-foot">ยังไม่มีงาน</div>'}
        </div>
      </div>
    </div>`;
  }

  // การ์ดรอบบำรุงรักษา — ยึดงาน IP ล่าสุดตามลำดับวันที่เป็นตำแหน่งปัจจุบันของเครื่องมือ
  function maintCardHtml() {
    const now = maintNow();
    if (!now) {
      return `<div class="wt-card">
        <div class="wt-card-lab">🛠️ รอบบำรุงรักษาเครื่องมือ</div>
        <div class="wt-card-val" style="color:#94a3b8">—</div>
        <div class="wt-card-foot">ยังไม่มีงาน IP ที่ระบุวันที่</div></div>`;
    }
    const lvl = MAINT_WARN[now.seq] || '';
    const left = MAINT_CYCLE - now.seq;
    const col = { yel: '#ca8a04', org: '#ea580c', red: '#dc2626', due: '#b91c1c' }[lvl] || '#1e40af';
    const foot = now.seq >= MAINT_CYCLE
      ? '🛠️ ครบรอบแล้ว — ต้องบำรุงรักษา'
      : (lvl ? '⚠️ เหลืออีก ' + left + ' งานถึงกำหนดบำรุงรักษา' : 'เหลืออีก ' + left + ' งาน · แตะดูรอบ ›');
    return `<div class="wt-card wt-clickable ${lvl ? 'warn-' + lvl : ''}" id="wt-card-maint">
      <div class="wt-card-lab">🛠️ รอบบำรุงรักษาเครื่องมือ</div>
      <div class="wt-card-val" style="color:${col}">${now.seq}<span class="wt-card-unit"> / ${MAINT_CYCLE} ครั้ง</span></div>
      <div class="wt-card-foot">รอบที่ ${now.round} · ${foot}</div>
      <div class="wt-mini-strip">${Array.from({ length: MAINT_CYCLE }, (_, i) => {
        const n = i + 1;
        const c = n < now.seq ? 'past' : n === now.seq ? 'now' : (MAINT_WARN[n] ? 'w-' + MAINT_WARN[n] : '');
        return `<span class="${c}"></span>`;
      }).join('')}</div></div>`;
  }

  /* ── ฟิลเตอร์ ──────────────────────────────────────────────── */
  function filtersHtml() {
    const list = currentList();
    const companies = [...new Set(list.map(j => (j.company || '').trim()).filter(Boolean))].sort();
    const months = [...new Set(list.map(j => monthKey(j)).filter(Boolean))].sort((a, b) => b - a);
    const monthOpt = m => { const y = Math.floor(m / 100), mo = m % 100; return MONTHS_EN[mo - 1] + ' ' + y; };
    return `<div class="wt-filters">
      <select id="wt-f-company" class="wt-input">
        <option value="">ทุกบริษัท</option>
        ${companies.map(c => `<option value="${esc(c)}" ${WT.filter.company === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <select id="wt-f-month" class="wt-input">
        <option value="">ทุกเดือน</option>
        ${months.map(m => `<option value="${m}" ${WT.filter.month === String(m) ? 'selected' : ''}>${monthOpt(m)}</option>`).join('')}
      </select>
      <input id="wt-f-code" class="wt-input" placeholder="รหัส ${WT.kind.toUpperCase()}XX" value="${esc(WT.filter.code)}" style="width:120px">
      <input id="wt-f-q" class="wt-input" placeholder="ค้นหา เลขงาน/บริษัท/ผู้ทดสอบ" value="${esc(WT.filter.q)}" style="flex:1;min-width:140px">
      <button class="wt-btn ghost" id="wt-clear">ล้าง</button>
      <button class="wt-btn primary" id="wt-add">➕ เพิ่มงาน</button>
      <button class="wt-btn accent" id="wt-fetch">⤵ ดึงงานใหม่</button>
      <button class="wt-btn excel" id="wt-export">⬇ Export Excel</button>
      <button class="wt-btn auto" id="wt-autotime" title="สแกนโฟลเดอร์งานใน Test results แล้วเติมเวลาทดสอบ (ฝุ่น/น้ำ/IK) จากเวลาถ่ายรูปให้อัตโนมัติ">🕒 ดึงเวลาอัตโนมัติ</button>
    </div>`;
  }

  /* ── ตาราง ──────────────────────────────────────────────── */
  function tableAreaHtml() {
    refreshSeq();
    const rows = filtered();
    const pinned = rows.filter(j => j.pinned);
    const normal = rows.filter(j => !j.pinned);
    // group ตามเดือน (ใหม่→เก่า)
    const groups = {};
    normal.forEach(j => { const k = monthKey(j); (groups[k] = groups[k] || []).push(j); });
    const keys = Object.keys(groups).map(Number).sort((a, b) => b - a);

    let html = '<div class="wt-table-wrap">';
    if (!rows.length) {
      html += `<div class="wt-empty">ยังไม่มีงาน ${WT.kind.toUpperCase()} — กด “➕ เพิ่มงาน” หรือ “⤵ ดึงงานใหม่”</div></div>`;
      return html;
    }
    if (pinned.length) {
      html += `<div class="wt-pin-head">📌 ปักหมุดไว้ (งานที่จะทดสอบ)</div>`;
      html += tableHtml(pinned, true);
    }
    keys.forEach(k => {
      const lbl = k ? monthLabel(groups[k][0]) : 'ไม่ระบุเดือน';
      const codes = groups[k].map(j => j.job_no).filter(Boolean).join(', ');
      html += `<div class="wt-month-head"><span class="wt-month-title">${esc(lbl)}</span><span class="wt-month-sub">${groups[k].length} งาน · ${esc(codes).slice(0, 120)}</span></div>`;
      html += tableHtml(groups[k], false);
    });
    html += '</div>';
    return html;
  }

  function tableHtml(list, pinnedTable) {
    const defs = statusDefs();
    const isIp = WT.kind === 'ip';
    const head = `<tr>
      <th class="wt-sticky">เลขงาน</th>
      ${isIp ? '<th title="ลำดับการใช้งานเครื่องมือในรอบบำรุงรักษา (20 ครั้ง/รอบ)">รอบใช้</th>' : ''}
      <th>รับงาน</th><th>แผน</th><th>บริษัท</th><th>รหัส</th><th>ผู้ทดสอบ</th><th>ภาษา</th>
      ${defs.map(d => `<th title="${esc(d.full)}">${esc(d.abbr)}</th>`).join('')}
      <th title="ผลทดสอบรวม — กดวน P → F → N/A">ผล</th>
      <th title="ประเภทงาน — กดวน ปกติ → ด่วน → Pretest → RP01">ประเภท</th>
      <th>หมายเหตุ</th><th></th></tr>`;
    const body = list.map(j => `<tr data-id="${j.id}">${rowInnerHtml(j, defs)}</tr>`).join('');
    return `<div class="wt-scroll"><table class="wt-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function rowInnerHtml(j, defs) {
    const notesN = (j.notes || []).length;
    const isIp = WT.kind === 'ip';
    return `
      <td class="wt-sticky"><div class="wt-jobcell">${dot(j.company)}<b>${esc(j.job_no) || '—'}</b>${j.pinned ? ' 📌' : ''}</div></td>
      ${isIp ? `<td>${seqBadgeHtml(j)}</td>` : ''}
      <td class="wt-muted">${esc(j.date_received)}</td>
      <td class="wt-muted">${esc(j.date_planned)}</td>
      <td>${esc(j.company)}</td>
      <td><span class="wt-code">${esc(j.test_code)}</span></td>
      <td>${esc(j.tester)}</td>
      <td>${langHtml(j)}</td>
      ${defs.map(d => `<td>${pillHtml(j, d)}</td>`).join('')}
      <td>${resultHtml(j)}</td>
      <td>${typeHtml(j)}</td>
      <td><button class="wt-note-btn ${notesN ? 'has' : ''}" onclick="wtNotes('${j.id}')">📝${notesN ? ' ' + notesN : ''}</button></td>
      <td><div class="wt-actions">
        <button class="wt-ic" title="ปักหมุด/ถอน" onclick="wtPin('${j.id}')">${j.pinned ? '📌' : '📍'}</button>
        <button class="wt-ic" title="แก้ไข" onclick="wtEdit('${j.id}')">✏️</button>
        <button class="wt-ic danger" title="ลบ" onclick="wtDel('${j.id}')">🗑️</button>
      </div></td>`;
  }

  // งาน Pretest ไม่ได้ออกรายงาน → ช่องภาษาโชว์ N/A
  function langHtml(j) {
    if (String(j.job_type || '') === 'pretest')
      return `<span class="wt-lang na" title="งาน Pretest ไม่ออกรายงาน">N/A</span>`;
    return `<span class="wt-lang">${esc(j.report_lang) || '—'}</span>`;
  }

  function seqBadgeHtml(j) {
    const s = WT.seq[j.id];
    if (!s) return `<span class="wt-seq none" title="ยังไม่ระบุวันที่ลงแผน/วันรับงาน — ยังไม่นับเข้ารอบ">—</span>`;
    const lvl = MAINT_WARN[s.seq] || '';
    const tip = `รอบที่ ${s.round} · ใช้งานครั้งที่ ${s.seq}/${MAINT_CYCLE}` +
      (s.seq >= MAINT_CYCLE ? ' — ครบรอบ ต้องบำรุงรักษาเครื่องมือ' : ` — เหลืออีก ${MAINT_CYCLE - s.seq} งาน`) +
      (isDone(j.maint_reset) ? ' · บำรุงรักษาแล้วหลังงานนี้' : '');
    return `<button class="wt-seq ${lvl}" onclick="wtMaint('${j.id}')" title="${esc(tip)}">${s.seq}<span class="wt-seq-tot">/${MAINT_CYCLE}</span>${isDone(j.maint_reset) ? '<span class="wt-seq-wr">🛠</span>' : ''}</button>`;
  }

  function resultHtml(j) {
    const v = String(j.result || '');
    const m = RESULT_META[v];
    return `<button class="wt-res ${m ? m.cls : ''}" onclick="wtResult('${j.id}')" title="${esc(m ? m.full : 'ยังไม่สรุปผล — กดเพื่อวน P → F → N/A')}">${m ? esc(m.text) : '–'}</button>`;
  }

  function typeHtml(j) {
    const m = TYPE_META[String(j.job_type || '')];
    return `<button class="wt-tp ${m ? m.cls + ' on' : ''}" onclick="wtType('${j.id}')" title="${esc(m ? m.full : 'ยังไม่ระบุประเภท — กดเพื่อวน ปกติ → ด่วน → Pretest → RP01')}">${m ? esc(m.text) : '–'}</button>`;
  }

  function pillHtml(j, d) {
    const on = isDone(j[d.key]);
    let sub = '';
    if (on) {
      if (d.mode === 'dust') sub = (j.dust_start || j.dust_end) ? `<span class="wt-sub">${esc(j.dust_start) || '?'}–${esc(j.dust_end) || '?'}</span>` : '';
      if (d.mode === 'water') sub = (j.water_start || j.water_end) ? `<span class="wt-sub">${esc(j.water_start) || '?'}–${esc(j.water_end) || '?'}</span>` : '';
      if (d.mode === 'volt') sub = j.hipot_voltage ? `<span class="wt-sub">${esc(j.hipot_voltage)}</span>` : '';
      if (d.mode === 'iktime') sub = (j.test_start || j.test_end) ? `<span class="wt-sub">${esc(j.test_start) || '?'}–${esc(j.test_end) || '?'}</span>` : '';
    }
    return `<button class="wt-pill ${on ? 'on' : ''}" onclick="wtStatus('${j.id}','${d.key}')" title="${esc(d.full)}">${on ? '✓ ' : ''}${esc(d.abbr)}${sub}</button>`;
  }

  /* ── wiring ──────────────────────────────────────────────── */
  function wireTop() {
    document.querySelectorAll('.wt-tab').forEach(b => b.onclick = () => { WT.kind = b.dataset.k; WT.filter = { company: '', month: '', code: '', q: '' }; wtRender(); });
    const bind = (id, ev, fn) => { const e = document.getElementById(id); if (e) e[ev] = fn; };
    bind('wt-f-company', 'onchange', e => { WT.filter.company = e.target.value; wtRender(); });
    bind('wt-f-month', 'onchange', e => { WT.filter.month = e.target.value; wtRender(); });
    bind('wt-f-code', 'oninput', e => { WT.filter.code = e.target.value; refreshTableOnly(); });
    bind('wt-f-q', 'oninput', e => { WT.filter.q = e.target.value; refreshTableOnly(); });
    bind('wt-clear', 'onclick', () => { WT.filter = { company: '', month: '', code: '', q: '' }; wtRender(); });
    bind('wt-add', 'onclick', () => wtEdit(null));
    bind('wt-fetch', 'onclick', wtFetchNew);
    bind('wt-export', 'onclick', wtExport);
    bind('wt-autotime', 'onclick', wtAutoTime);
    bind('wt-card-month', 'onclick', wtMonthDetail);
    bind('wt-card-maint', 'onclick', () => { const n = maintNow(); if (n) wtMaint(n.id); });
    // ปุ่มเลื่อนเดือน — กัน bubble ไปเปิด modal, ไม่ให้เลื่อนไปเดือนอนาคต
    const shift = (delta, ev) => { ev.stopPropagation(); if (delta > 0 && WT.monthOff >= 0) return; WT.monthOff += delta; refreshCards(); };
    bind('wt-m-prev', 'onclick', e => shift(-1, e));
    bind('wt-m-next', 'onclick', e => shift(1, e));
  }
  function refreshTableOnly() {
    const wrap = document.querySelector('.wt-table-wrap');
    if (wrap) wrap.outerHTML = tableAreaHtml();
  }
  window.wtPaintRow = patchRow;
  // re-render เฉพาะแถวการ์ด (การ์ดเดือนเปลี่ยนเลข) แล้ว rebind ปุ่มเลื่อน
  function refreshCards() {
    const el = document.querySelector('.wt-cards');
    if (!el) { wtRender(); return; }
    el.outerHTML = cardsHtml();
    const bind = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    const shift = (delta, ev) => { ev.stopPropagation(); if (delta > 0 && WT.monthOff >= 0) return; WT.monthOff += delta; refreshCards(); };
    bind('wt-card-month', wtMonthDetail);
    bind('wt-card-maint', () => { const n = maintNow(); if (n) wtMaint(n.id); });
    bind('wt-m-prev', e => shift(-1, e));
    bind('wt-m-next', e => shift(1, e));
  }

  /* ── status toggle + popups ──────────────────────────────── */
  window.wtStatus = function (id, key) {
    const j = currentList().find(x => x.id === id); if (!j) return;
    const def = statusDefs().find(d => d.key === key);
    if (def && def.mode) return openStatusPopup(j, def);
    // plain toggle
    const nv = isDone(j[key]) ? '' : '1';
    updateJob(id, { [key]: nv });
  };

  function openStatusPopup(j, def) {
    const on = isDone(j[def.key]);
    let inner = '';
    if (def.mode === 'volt') {
      inner = `<label class="wt-fl">แรงดันทดสอบ (ระบุ)</label>
        <input id="wt-pp-v" class="wt-input" placeholder="เช่น 1500 V / 3.75 kV" value="${esc(j.hipot_voltage)}">`;
    } else {
      const sK = def.mode === 'dust' ? 'dust' : def.mode === 'water' ? 'water' : 'test';
      inner = `<div class="wt-fl">เวลาทดสอบ${def.mode === 'water' ? ' (น้ำ)' : def.mode === 'dust' ? ' (ฝุ่น)' : ''}</div>
        <div class="wt-2col">
          <div><label class="wt-fl">เริ่ม</label><input id="wt-pp-s" type="time" class="wt-input" value="${esc(j[sK + '_start'])}"></div>
          <div><label class="wt-fl">สิ้นสุด</label><input id="wt-pp-e" type="time" class="wt-input" value="${esc(j[sK + '_end'])}"></div>
        </div>
        <div class="wt-hint">ข้อมูลเวลานี้ใช้ต่อสำหรับ Export อุณหภูมิ</div>`;
    }
    modal(`${def.full}`, inner, [
      on ? { label: 'ยกเลิกสถานะ (ยังไม่ทดสอบ)', cls: 'ghost', fn: () => clearStatus(j.id, def) } : null,
      { label: 'บันทึก = ทดสอบแล้ว', cls: 'primary', fn: () => saveStatusPopup(j.id, def) },
    ].filter(Boolean));
  }

  function saveStatusPopup(id, def) {
    const patch = { [def.key]: '1' };
    if (def.mode === 'volt') { patch.hipot_voltage = document.getElementById('wt-pp-v').value.trim(); }
    else {
      const sK = def.mode === 'dust' ? 'dust' : def.mode === 'water' ? 'water' : 'test';
      patch[sK + '_start'] = document.getElementById('wt-pp-s').value;
      patch[sK + '_end'] = document.getElementById('wt-pp-e').value;
    }
    closeModal(); updateJob(id, patch);
  }
  function clearStatus(id, def) {
    const patch = { [def.key]: '' };
    if (def.mode === 'volt') patch.hipot_voltage = '';
    else { const sK = def.mode === 'dust' ? 'dust' : def.mode === 'water' ? 'water' : 'test'; patch[sK + '_start'] = ''; patch[sK + '_end'] = ''; }
    closeModal(); updateJob(id, patch);
  }

  /* อัปเดตแบบไม่รีหน้า: เปลี่ยนข้อมูลในเครื่องก่อน วาดใหม่เฉพาะแถวนั้น แล้วค่อยยิง API
   * ถ้าเซฟไม่ผ่านจะย้อนค่ากลับให้ตรงกับเซิร์ฟเวอร์
   *   scope 'row'   — สถานะ/ประเภท/ผล (กระทบแถวเดียว)
   *   scope 'table' — maint_reset (เลขรอบของงานถัดๆ ไปเลื่อนตาม) / pin (ย้ายกลุ่ม)
   *   scope 'full'  — แก้ข้อมูลงาน (บริษัท/วันที่ → ฟิลเตอร์+กลุ่มเดือนเปลี่ยน)
   */
  async function updateJob(id, patch, scope = 'row') {
    const list = currentList();
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return;
    const prev = { ...list[idx] };
    Object.assign(list[idx], patch);
    paint(id, scope);
    try {
      const r = await api('/' + WT.kind + '/' + id, 'PUT', patch);
      const i2 = WT.data[WT.kind].findIndex(x => x.id === id);
      if (i2 >= 0) WT.data[WT.kind][i2] = r.job;
      if (r.companies) WT.data.companies = r.companies;
      paint(id, scope);
    } catch (e) {
      const i2 = WT.data[WT.kind].findIndex(x => x.id === id);
      if (i2 >= 0) WT.data[WT.kind][i2] = prev;
      paint(id, scope);
      toast('บันทึกไม่สำเร็จ: ' + e.message, false);
    }
  }

  function paint(id, scope) {
    if (scope === 'full') { wtRender(); return; }
    if (scope === 'table') { refreshTableOnly(); refreshCards(); return; }
    patchRow(id);
    refreshCards();
  }

  // วาดใหม่เฉพาะ <tr> ของงานนั้น — ตำแหน่ง scroll/โฟกัสช่องค้นหาไม่หาย
  function patchRow(id) {
    const j = currentList().find(x => x.id === id);
    if (!j) return;
    const trs = document.querySelectorAll(`.wt-table tr[data-id="${id}"]`);
    if (!trs.length) { refreshTableOnly(); return; }
    trs.forEach(tr => { tr.innerHTML = rowInnerHtml(j, statusDefs()); });
  }

  /* ── add / edit ──────────────────────────────────────────── */
  const LANGS = ['TH', 'EN', 'TH&EN'];
  window.wtEdit = function (id) {
    const isIp = WT.kind === 'ip';
    const j = id ? currentList().find(x => x.id === id) : {};
    const F = (k, label, ph = '', type = 'text') =>
      `<div class="wt-fld"><label class="wt-fl">${label}</label><input id="wt-e-${k}" type="${type}" class="wt-input" value="${esc(j[k])}" placeholder="${ph}"></div>`;
    const langSel = `<div class="wt-fld"><label class="wt-fl">ออกรายงานภาษา</label>
      <select id="wt-e-report_lang" class="wt-input">${LANGS.map(l => `<option ${j.report_lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    const body = `<div class="wt-form">
      ${F('job_no', 'เลขงาน', 'เช่น ' + (isIp ? 'IP-2601-0001' : 'IK-2601-0001'))}
      <div class="wt-2col">${F('date_received', 'วันที่รับงาน', '', 'date')}${F('date_planned', 'วันที่ลงแผนทดสอบ', '', 'date')}</div>
      ${F('company', 'บริษัท', 'ชื่อบริษัทลูกค้า')}
      <div class="wt-2col">${F('test_code', 'รหัสทดสอบ ' + (isIp ? 'IPXX' : 'IKXX'), isIp ? 'เช่น IP66' : 'เช่น IK08')}${F('tester', 'ชื่อผู้ทดสอบ')}</div>
      ${langSel}
    </div>`;
    modal(id ? 'แก้ไขงาน' : 'เพิ่มงาน ' + WT.kind.toUpperCase(), body, [
      { label: id ? 'บันทึกการแก้ไข' : 'เพิ่มงาน', cls: 'primary', fn: () => saveJob(id) },
    ]);
  };

  async function saveJob(id) {
    const g = k => { const e = document.getElementById('wt-e-' + k); return e ? e.value.trim() : ''; };
    const keys = ['job_no', 'date_received', 'date_planned', 'company', 'test_code', 'tester', 'report_lang'];
    const payload = {}; keys.forEach(k => payload[k] = g(k));
    if (!payload.job_no && !payload.company) { toast('ใส่เลขงานหรือบริษัทก่อน', false); return; }
    try {
      if (id) {
        const r = await api('/' + WT.kind + '/' + id, 'PUT', payload);
        const idx = WT.data[WT.kind].findIndex(x => x.id === id); if (idx >= 0) WT.data[WT.kind][idx] = r.job;
        if (r.companies) WT.data.companies = r.companies;
        toast('แก้ไขแล้ว');
      } else {
        const r = await api('/' + WT.kind, 'POST', payload);
        WT.data[WT.kind].push(r.job);
        if (r.companies) WT.data.companies = r.companies;
        toast('เพิ่มงานแล้ว');
      }
      closeModal(); wtRender();
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, false); }
  }

  window.wtDel = function (id) {
    const j = currentList().find(x => x.id === id);
    modal('ลบงาน', `<div class="wt-confirm">ลบงาน <b>${esc(j.job_no || j.company)}</b> ?<br>การลบนี้ย้อนกลับไม่ได้</div>`, [
      { label: 'ลบถาวร', cls: 'danger', fn: async () => {
        try { await api('/' + WT.kind + '/' + id, 'DELETE'); WT.data[WT.kind] = WT.data[WT.kind].filter(x => x.id !== id); closeModal(); wtRender(); toast('ลบแล้ว'); }
        catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, false); }
      } },
    ]);
  };

  window.wtPin = function (id) {
    const j = currentList().find(x => x.id === id);
    updateJob(id, { pinned: !j.pinned }, 'table');
  };

  // ประเภทงาน — กดวน '' → ปกติ → ด่วน → Pretest → RP01 → '' (ช่องภาษาในแถวเดียวกันอัปเดตตาม)
  window.wtType = function (id) {
    const j = currentList().find(x => x.id === id); if (!j) return;
    const cur = JOB_TYPES.indexOf(String(j.job_type || ''));
    updateJob(id, { job_type: JOB_TYPES[(cur + 1) % JOB_TYPES.length] });
  };

  // ผลทดสอบ — กดวน '' → P → F → NA → ''
  window.wtResult = function (id) {
    const j = currentList().find(x => x.id === id); if (!j) return;
    const cur = RESULTS.indexOf(String(j.result || ''));
    updateJob(id, { result: RESULTS[(cur + 1) % RESULTS.length] });
  };

  /* ── รอบบำรุงรักษาเครื่องมือ ─────────────────────────────────── */
  window.wtMaint = function (id) {
    const j = currentList().find(x => x.id === id); if (!j) return;
    const s = WT.seq[id]; if (!s) return;
    const on = isDone(j.maint_reset);
    const left = MAINT_CYCLE - s.seq;
    const body = `<div class="wt-form">
      <div class="wt-mt-big ${MAINT_WARN[s.seq] || ''}">ครั้งที่ ${s.seq}<span class="wt-card-unit"> / ${MAINT_CYCLE}</span></div>
      <div class="wt-hint" style="margin:0">รอบที่ ${s.round} · งาน <b>${esc(j.job_no || '(ไม่มีเลขงาน)')}</b> · วันที่ใช้ ${esc(seqDate(j))}</div>
      ${cycleStripHtml(s)}
      <div class="wt-mt-msg ${s.seq >= MAINT_CYCLE ? 'due' : ''}">${s.seq >= MAINT_CYCLE
        ? '🛠️ ครบ ' + MAINT_CYCLE + ' ครั้งแล้ว — ต้องบำรุงรักษาเครื่องมือก่อนใช้งานต่อ'
        : 'เหลืออีก <b>' + left + '</b> งาน จะครบรอบบำรุงรักษา'}</div>
      <label class="wt-mt-chk"><input type="checkbox" id="wt-mt-r" ${on ? 'checked' : ''}>
        <span><b>บำรุงรักษาเครื่องมือแล้วหลังงานนี้</b><br>
        <span class="wt-hint">ติ๊กเมื่อบำรุงรักษาก่อนครบ ${MAINT_CYCLE} ครั้ง — งานถัดไปจะเริ่มนับครั้งที่ 1 รอบใหม่</span></span></label>
      <div class="wt-hint">ลำดับนี้รันอัตโนมัติจากวันที่ลงแผนทดสอบของงาน IP ทุกงาน (ไม่มีวันที่ลงแผนจะใช้วันที่รับงาน)</div>
    </div>`;
    modal('🛠️ รอบการใช้งานเครื่องมือ', body, [
      { label: 'ปิด', cls: 'ghost', fn: closeModal },
      { label: 'บันทึก', cls: 'primary', fn: () => {
        const v = document.getElementById('wt-mt-r').checked ? '1' : '';
        closeModal();
        if (v !== (isDone(j.maint_reset) ? '1' : '')) updateJob(id, { maint_reset: v }, 'table');
      } },
    ]);
  };

  // แถบจุด 20 ช่องของรอบปัจจุบัน
  function cycleStripHtml(s) {
    let out = '<div class="wt-strip">';
    for (let i = 1; i <= MAINT_CYCLE; i++) {
      const cls = i < s.seq ? 'past' : i === s.seq ? 'now ' + (MAINT_WARN[i] || '') : (MAINT_WARN[i] || '') + ' ahead';
      out += `<span class="wt-strip-c ${cls}" title="ครั้งที่ ${i}">${i}</span>`;
    }
    return out + '</div>';
  }

  /* ── ดึงงานใหม่ (prefill) ─────────────────────────────────── */
  window.wtFetchNew = function () {
    const body = `<div class="wt-form">
      <div class="wt-hint">ใส่เลขงานที่ดึงมาได้ ระบบจะเดารหัส/เดือนให้เบื้องต้น แล้วแก้เพิ่มได้ทีหลัง</div>
      <div class="wt-fld"><label class="wt-fl">เลขงาน</label><input id="wt-e-job_no" class="wt-input" placeholder="เช่น ${WT.kind.toUpperCase()}-2601-0001"></div>
      <div class="wt-fld"><label class="wt-fl">บริษัท (ถ้ามี)</label><input id="wt-e-company" class="wt-input"></div>
      <div class="wt-fld"><label class="wt-fl">รหัสทดสอบ (ถ้ามี)</label><input id="wt-e-test_code" class="wt-input" placeholder="${WT.kind === 'ip' ? 'IP66' : 'IK08'}"></div>
    </div>`;
    modal('⤵ ดึงงานใหม่', body, [
      { label: 'เพิ่มเป็นแถวงาน', cls: 'primary', fn: async () => {
        const g = k => { const e = document.getElementById('wt-e-' + k); return e ? e.value.trim() : ''; };
        const payload = { job_no: g('job_no'), company: g('company'), test_code: g('test_code'), report_lang: 'TH&EN' };
        if (!payload.job_no) { toast('ใส่เลขงานก่อน', false); return; }
        try { const r = await api('/' + WT.kind, 'POST', payload); WT.data[WT.kind].push(r.job); if (r.companies) WT.data.companies = r.companies; closeModal(); wtRender(); toast('ดึงงานเข้าตารางแล้ว — แก้ไขรายละเอียดต่อได้'); }
        catch (e) { toast('ไม่สำเร็จ: ' + e.message, false); }
      } },
    ]);
  };

  /* ── Export Excel (ตามฟิลเตอร์ปัจจุบัน) ───────────────────── */
  function wtExport() {
    const p = new URLSearchParams();
    if (WT.filter.company) p.set('company', WT.filter.company);
    if (WT.filter.month) p.set('month', WT.filter.month);
    if (WT.filter.code) p.set('code', WT.filter.code);
    if (WT.filter.q) p.set('q', WT.filter.q);
    const qs = p.toString();
    const a = document.createElement('a');
    a.href = '/api/worktrack/' + WT.kind + '/export.xlsx' + (qs ? '?' + qs : '');
    document.body.appendChild(a); a.click(); a.remove();
    toast('กำลังดาวน์โหลด Excel (' + WT.kind.toUpperCase() + ')');
  }

  /* ── ดึงเวลาทดสอบอัตโนมัติ (EXIF รูปในโฟลเดอร์งาน) ─────────────── */
  const AT = { items: [], polling: false };

  function widenModal() {
    const m = document.querySelector('#wt-ov .wt-modal'); if (m) m.classList.add('wt-wide');
  }
  function atSetBody(html) {
    const b = document.querySelector('#wt-ov .wt-modal-b'); if (b) b.innerHTML = html;
  }

  window.wtAutoTime = async function () {
    AT.items = []; AT.polling = true;
    modal('🕒 ดึงเวลาทดสอบอัตโนมัติ',
      `<div id="at-body"><div class="at-prog"><div class="at-spin"></div>
        <div>กำลังเริ่มสแกนโฟลเดอร์งานใน Test results…</div>
        <div class="wt-hint">อ่านเวลาถ่ายรูป (EXIF) ในโฟลเดอร์ทดสอบฝุ่น/น้ำ (IP) และรูปตอนทดสอบ (IK) — งานที่ยังไม่มีเวลาเท่านั้น</div></div></div>`,
      [{ label: 'ปิด', cls: 'ghost', fn: () => { AT.polling = false; closeModal(); } }]);
    widenModal();
    try {
      let snap = await api('/autotime/scan', 'POST', { refresh: true, only_missing: true });
      atRenderProgress(snap);
      while (AT.polling && snap.running) {
        await new Promise(r => setTimeout(r, 1500));
        if (!AT.polling) return;
        snap = await api('/autotime/scan', 'POST', {});   // ไม่ refresh = อ่านสถานะเดิม
        atRenderProgress(snap);
      }
      if (AT.polling) { AT.items = snap.items || []; atShowResults(); }
    } catch (e) {
      AT.polling = false;
      atSetBody('<div class="at-prog"><div>❌ สแกนไม่สำเร็จ: ' + esc(e.message) + '</div></div>');
    }
  };

  function atRenderProgress(snap) {
    if (!snap.running && snap.items) return;   // จบแล้ว ให้ atShowResults จัดการ
    const t = snap.total || 0, dn = snap.done || 0;
    const pct = t ? Math.round(dn / t * 100) : 0;
    atSetBody(`<div class="at-prog"><div class="at-spin"></div>
      <div>กำลังสแกน <b>${dn}</b> / ${t} งาน…</div>
      <div class="at-bar"><span style="width:${pct}%"></span></div>
      <div class="wt-hint">อ่าน EXIF รูปผ่านไดรฟ์เครือข่ายอาจใช้เวลาสักครู่</div></div>`);
  }

  function rangeChip(s, e) {
    if (!s && !e) return '<span class="wt-muted">—</span>';
    return `<b>${esc(s || '?')}</b><span class="at-dash">–</span><b>${esc(e || '?')}</b>`;
  }
  function srcBadge(it, field) {
    const s = (it.psrc || {})[field];
    if (s === 'excel') return ' <span class="at-xls" title="ดึงจากไฟล์ Excel เวลา/env (รูปไม่มี EXIF) — ตรวจก่อนบันทึก">Excel</span>';
    if (s === 'root') return ' <span class="at-warn" title="ใช้รูปหลวมในโฟลเดอร์ราก (ไม่พบโฟลเดอร์ทดสอบชัดเจน) — ตรวจก่อนบันทึก">รูปหลวม</span>';
    return '';
  }
  function atProposedHtml(it) {
    if (it.kind === 'ip') {
      const p = it.proposed;
      return `<div class="at-pline">ฝุ่น ${rangeChip(p.dust_start, p.dust_end)}${srcBadge(it, 'dust_start')}</div>
              <div class="at-pline">น้ำ&nbsp; ${rangeChip(p.water_start, p.water_end)}${srcBadge(it, 'water_start')}</div>`;
    }
    const p = it.proposed;
    return `<div class="at-pline">${rangeChip(p.test_start, p.test_end)}${srcBadge(it, 'test_start')}</div>`;
  }
  function atCurrentHtml(it) {
    const c = it.current, any = Object.values(c).some(v => v);
    if (!any) return '<span class="wt-muted">ว่าง</span>';
    if (it.kind === 'ip')
      return `<div class="at-pline wt-muted">ฝุ่น ${esc(c.dust_start || '—')}–${esc(c.dust_end || '—')}</div>
              <div class="at-pline wt-muted">น้ำ&nbsp; ${esc(c.water_start || '—')}–${esc(c.water_end || '—')}</div>`;
    return `<div class="at-pline wt-muted">${esc(c.test_start || '—')}–${esc(c.test_end || '—')}</div>`;
  }
  // งานนี้มีค่าเสนอที่ยังว่างอยู่ (คุ้มค่าติ๊กไว้ให้) ไหม
  function atFillable(it) {
    if (it.status === 'nofolder' || it.status === 'none') return false;
    return Object.keys(it.proposed).some(f => it.proposed[f] && !(it.current[f] || ''));
  }

  function atShowResults() {
    const items = AT.items.slice().sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'ip' ? -1 : 1) || a.job_no.localeCompare(b.job_no));
    const okc = items.filter(i => i.status === 'ok').length;
    const partial = items.filter(i => i.status === 'partial').length;
    const none = items.filter(i => i.status === 'none').length;
    const nofolder = items.filter(i => i.status === 'nofolder').length;
    const rows = items.map(it => {
      const can = it.status === 'ok' || it.status === 'partial';
      const fill = atFillable(it);
      const badge = it.kind === 'ip' ? '<span class="at-kb ip">IP</span>' : '<span class="at-kb ik">IK</span>';
      const stat = it.status === 'ok' ? '<span class="at-st ok">ครบ</span>'
        : it.status === 'partial' ? '<span class="at-st part">บางส่วน</span>'
          : it.status === 'none' ? '<span class="at-st no">ไม่พบรูป</span>'
            : '<span class="at-st no">ไม่พบโฟลเดอร์</span>';
      const ck = can ? `<input type="checkbox" class="at-ck" data-key="${it.kind}:${it.id}" ${fill ? 'checked' : ''}>` : '';
      return `<tr class="${can ? '' : 'at-dim'}">
        <td class="at-c-ck">${ck}</td>
        <td>${badge} <b>${esc(it.job_no)}</b><div class="wt-muted at-co">${esc(it.company || '')}</div></td>
        <td>${can ? atProposedHtml(it) : '<span class="wt-muted">—</span>'}</td>
        <td>${atCurrentHtml(it)}</td>
        <td class="at-c-x">${it.excel ? esc(it.excel) : '<span class="wt-muted">—</span>'}</td>
        <td>${stat}</td></tr>`;
    }).join('');
    const body = `<div id="at-body">
      <div class="at-sum">พบ <b>${items.length}</b> งานที่ยังไม่มีเวลา — เติมได้ครบ ${okc} · บางส่วน ${partial} · ไม่พบรูป ${none} · ไม่พบโฟลเดอร์ ${nofolder}</div>
      <label class="at-ow"><input type="checkbox" id="at-overwrite"> เขียนทับค่าที่กรอกไว้แล้ว (ปกติจะเติมเฉพาะช่องที่ว่าง)</label>
      <div class="at-tablewrap"><table class="at-table"><thead><tr>
        <th><input type="checkbox" id="at-all" title="เลือก/ยกเลิกทั้งหมด"></th>
        <th>เลขงาน</th><th>เวลาจากรูป (EXIF)</th><th>ค่าปัจจุบัน</th><th>Excel อุณหภูมิ (เทียบ)</th><th>สถานะ</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="6" class="wt-muted" style="text-align:center;padding:20px">ไม่มีงานที่ต้องเติม 🎉</td></tr>'}</tbody></table></div>
      <div class="wt-hint">เวลามาจากเวลาถ่ายรูปในโฟลเดอร์ทดสอบ (ต้น–ท้าย) · “Excel อุณหภูมิ” แสดงไว้เทียบด้วยตาเท่านั้น ไม่ถูกเติมอัตโนมัติ</div>
    </div>`;
    modal('🕒 ดึงเวลาทดสอบอัตโนมัติ', body, [
      { label: '↻ สแกนใหม่', cls: 'ghost', fn: () => wtAutoTime() },
      { label: '✅ บันทึกที่เลือก', cls: 'primary', fn: atApply },
    ]);
    widenModal();
    const all = document.getElementById('at-all');
    if (all) all.onclick = () => document.querySelectorAll('.at-ck').forEach(c => { c.checked = all.checked; });
  }

  async function atApply() {
    const overwrite = document.getElementById('at-overwrite') && document.getElementById('at-overwrite').checked;
    const checked = [...document.querySelectorAll('.at-ck:checked')].map(c => c.dataset.key);
    const byKey = {}; AT.items.forEach(it => { byKey[it.kind + ':' + it.id] = it; });
    const updates = [];
    checked.forEach(k => {
      const it = byKey[k]; if (!it) return;
      const fields = {};
      Object.keys(it.proposed).forEach(f => {
        if (it.proposed[f] && (overwrite || !(it.current[f] || ''))) fields[f] = it.proposed[f];
      });
      if (Object.keys(fields).length) updates.push({ kind: it.kind, id: it.id, fields });
    });
    if (!updates.length) { toast('ยังไม่ได้เลือกงานที่จะเติม', false); return; }
    try {
      const r = await api('/autotime/apply', 'POST', { updates });
      const fresh = await api('/all');
      WT.data = fresh; closeModal(); wtRender();
      toast('เติมเวลาแล้ว ' + r.jobs + ' งาน (' + r.updated + ' ช่อง)');
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, false); }
  }

  /* ── การ์ดเดือน: รายละเอียด ───────────────────────────────── */
  function wtMonthDetail() {
    const sel = selMonth();
    const monthList = currentList().filter(j => monthKey(j) === sel.key);
    const sent = monthList.filter(j => isDone(j.st_sent_admin));
    const notSent = monthList.filter(j => !isDone(j.st_sent_admin));
    const li = arr => arr.length ? arr.map(j => `<div class="wt-md-row">${dot(j.company)}<b>${esc(j.job_no)}</b> <span class="wt-muted">${esc(j.company)}</span> <span class="wt-code">${esc(j.test_code)}</span></div>`).join('') : '<div class="wt-muted" style="padding:4px 0">— ไม่มี —</div>';
    const body = `<div class="wt-md">
      <div class="wt-md-h" style="color:#16a34a">✅ ส่งแอดมินแล้ว (${sent.length})</div>${li(sent)}
      <div class="wt-md-h" style="color:#ea580c;margin-top:12px">⏳ ยังไม่ส่ง (${notSent.length})</div>${li(notSent)}
    </div>`;
    modal(`งานเดือน ${MONTHS_EN[sel.date.getMonth()]} ${sel.date.getFullYear()}`, body, [{ label: 'ปิด', cls: 'ghost', fn: closeModal }]);
  }

  /* ── หมายเหตุ ─────────────────────────────────────────────── */
  window.wtNotes = function (id) {
    const j = currentList().find(x => x.id === id); if (!j) return;
    renderNotesModal(j);
  };
  function renderNotesModal(j) {
    const notes = j.notes || [];
    const list = notes.length ? notes.map(n => `<div class="wt-note">
      <div class="wt-note-top"><b>${esc(n.title) || '(ไม่มีหัวข้อ)'}</b><span class="wt-muted">${esc(n.date)}</span>
        <button class="wt-ic danger" onclick="wtNoteDel('${j.id}','${n.id}')">🗑️</button></div>
      <div class="wt-note-body">${esc(n.body).replace(/\n/g, '<br>')}</div></div>`).join('') : '<div class="wt-muted" style="padding:6px 0">ยังไม่มีหมายเหตุ</div>';
    const body = `<div class="wt-notes">
      ${list}
      <div class="wt-note-add">
        <input id="wt-n-title" class="wt-input" placeholder="หัวข้อ (เช่น ออก RP01)">
        <textarea id="wt-n-body" class="wt-input" rows="3" placeholder="เนื้อหา (เช่น แก้ ... วันที่ ... / ลูกค้าส่งเนมเพลตใหม่ / ขอส่ง Node เพิ่ม)"></textarea>
        <button class="wt-btn primary" onclick="wtNoteAdd('${j.id}')">➕ เพิ่มหมายเหตุ</button>
      </div></div>`;
    modal(`หมายเหตุ — ${esc(j.job_no || j.company)}`, body, [{ label: 'ปิด', cls: 'ghost', fn: closeModal }]);
  }
  window.wtNoteAdd = async function (id) {
    const t = document.getElementById('wt-n-title').value.trim();
    const b = document.getElementById('wt-n-body').value.trim();
    if (!t && !b) { toast('ใส่หัวข้อหรือเนื้อหาก่อน', false); return; }
    try {
      const r = await api('/' + WT.kind + '/' + id + '/notes', 'POST', { title: t, body: b });
      const j = currentList().find(x => x.id === id); j.notes = j.notes || []; j.notes.push(r.note);
      renderNotesModal(j); wtRenderTableSilently();
    } catch (e) { toast('ไม่สำเร็จ: ' + e.message, false); }
  };
  window.wtNoteDel = async function (id, nid) {
    try {
      await api('/' + WT.kind + '/' + id + '/notes/' + nid, 'DELETE');
      const j = currentList().find(x => x.id === id); j.notes = (j.notes || []).filter(n => n.id !== nid);
      renderNotesModal(j); wtRenderTableSilently();
    } catch (e) { toast('ไม่สำเร็จ: ' + e.message, false); }
  };
  function wtRenderTableSilently() { refreshTableOnly(); }

  /* ── modal ─────────────────────────────────────────────────── */
  function modal(title, bodyHtml, buttons) {
    closeModal();
    const ov = document.createElement('div'); ov.className = 'wt-ov'; ov.id = 'wt-ov';
    ov.innerHTML = `<div class="wt-modal"><div class="wt-modal-h"><b>${esc(title)}</b><button class="wt-x" id="wt-x">✕</button></div>
      <div class="wt-modal-b">${bodyHtml}</div>
      <div class="wt-modal-f">${(buttons || []).map((b, i) => `<button class="wt-btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#wt-x').onclick = closeModal;
    ov.onclick = e => { if (e.target === ov) closeModal(); };
    (buttons || []).forEach((b, i) => { ov.querySelector(`[data-i="${i}"]`).onclick = b.fn; });
    requestAnimationFrame(() => ov.classList.add('show'));
  }
  function closeModal() { const o = document.getElementById('wt-ov'); if (o) o.remove(); }
  window.wtCloseModal = closeModal;

  /* ── CSS (inject once) ─────────────────────────────────────── */
  function injectCss() {
    if (document.getElementById('wt-css')) return;
    const s = document.createElement('style'); s.id = 'wt-css';
    s.textContent = `
    #wt-root{font-size:13px;color:#0f172a}
    .wt-loading,.wt-empty{padding:40px;text-align:center;color:#64748b}
    .wt-tabs{display:flex;gap:8px;margin-bottom:14px}
    .wt-tab{border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:9px 16px;font-weight:700;color:#64748b;cursor:pointer}
    .wt-tab.on{background:#1e40af;color:#fff;border-color:#1e40af}
    .wt-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
    .wt-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
    .wt-card.wt-clickable{cursor:pointer;transition:box-shadow .15s} .wt-card.wt-clickable:hover{box-shadow:0 4px 14px rgba(15,23,42,.10)}
    .wt-card-lab{font-size:12px;color:#64748b;font-weight:600}
    .wt-card-val{font-size:26px;font-weight:800;margin-top:2px;color:#1e40af}
    .wt-card-unit{font-size:12px;color:#94a3b8;font-weight:600}
    .wt-card-foot{font-size:11px;color:#94a3b8;margin-top:2px}
    .wt-lab-row{display:flex;align-items:center;justify-content:space-between;gap:6px}
    .wt-mnav{display:inline-flex;gap:4px}
    .wt-mbtn{width:22px;height:22px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:7px;color:#475569;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s}
    .wt-mbtn:hover:not(:disabled){background:#e2e8f0}
    .wt-mbtn:disabled{opacity:.35;cursor:default}
    .wt-rank{margin-top:6px;display:flex;flex-direction:column;gap:5px}
    .wt-rank-row{display:flex;align-items:center;gap:6px;font-size:12px}
    .wt-rank-medal{width:16px}.wt-rank-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
    .wt-rank-bar{width:52px;height:7px;background:#eef2f7;border-radius:5px;overflow:hidden}.wt-rank-bar>span{display:block;height:100%}
    .wt-rank-cnt{width:20px;text-align:right}
    .wt-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
    .wt-input{border:1px solid #e2e8f0;border-radius:9px;padding:8px 11px;font-size:13px;font-family:inherit;background:#fff;outline:none;color:#0f172a}
    .wt-input:focus{border-color:#3b82f6}
    .wt-btn{border:0;border-radius:9px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
    .wt-btn.primary{background:#1e40af;color:#fff}.wt-btn.accent{background:#0d9488;color:#fff}
    .wt-btn.ghost{background:#f1f5f9;color:#475569}.wt-btn.danger{background:#e11d48;color:#fff}
    .wt-btn.excel{background:#15803d;color:#fff}
    .wt-btn.auto{background:#7c3aed;color:#fff}
    /* ── ดึงเวลาอัตโนมัติ ── */
    .wt-modal.wt-wide{max-width:940px}
    .at-prog{display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 10px;text-align:center}
    .at-spin{width:30px;height:30px;border:3px solid #ede9fe;border-top-color:#7c3aed;border-radius:50%;animation:at-sp .8s linear infinite}
    @keyframes at-sp{to{transform:rotate(360deg)}}
    .at-bar{width:70%;height:8px;background:#ede9fe;border-radius:6px;overflow:hidden}
    .at-bar>span{display:block;height:100%;background:#7c3aed;transition:width .3s}
    .at-sum{font-size:12.5px;color:#334155;margin-bottom:8px}
    .at-ow{display:flex;align-items:center;gap:7px;font-size:12px;color:#475569;margin-bottom:10px;cursor:pointer}
    .at-tablewrap{overflow:auto;max-height:52vh;border:1px solid #e2e8f0;border-radius:10px}
    .at-table{border-collapse:separate;border-spacing:0;width:100%;font-size:12px}
    .at-table th{background:#f8fafc;color:#64748b;font-weight:700;padding:7px 9px;text-align:left;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:1}
    .at-table td{padding:6px 9px;border-bottom:1px solid #f1f5f9;vertical-align:top}
    .at-table tr.at-dim td{opacity:.5}
    .at-c-ck{text-align:center;width:34px}.at-c-x{max-width:230px;white-space:normal;word-break:break-word;color:#64748b}
    .at-co{font-size:11px}
    .at-pline{white-space:nowrap;line-height:1.7}
    .at-dash{color:#94a3b8;margin:0 3px}
    .at-kb{font-size:9.5px;font-weight:800;padding:1px 5px;border-radius:5px;vertical-align:middle}
    .at-kb.ip{background:#dbeafe;color:#1d4ed8}.at-kb.ik{background:#fee2e2;color:#b91c1c}
    .at-st{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px;white-space:nowrap}
    .at-st.ok{background:#dcfce7;color:#15803d}.at-st.part{background:#fef9c3;color:#a16207}.at-st.no{background:#f1f5f9;color:#94a3b8}
    .at-warn{font-size:9.5px;font-weight:700;background:#ffedd5;color:#c2410c;padding:1px 5px;border-radius:5px;margin-left:4px}
    .at-xls{font-size:9.5px;font-weight:700;background:#dcfce7;color:#15803d;padding:1px 5px;border-radius:5px;margin-left:4px}
    .wt-pin-head,.wt-month-head{margin:16px 0 6px;display:flex;align-items:baseline;gap:10px}
    .wt-pin-head{color:#b45309;font-weight:800}
    .wt-month-title{font-weight:800;font-size:15px;color:#0f172a}
    .wt-month-sub{font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wt-scroll{overflow-x:auto;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
    .wt-table{border-collapse:separate;border-spacing:0;width:100%;font-size:12px;white-space:nowrap}
    .wt-table th{background:#f8fafc;color:#64748b;font-weight:700;padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;position:sticky;top:0}
    .wt-table td{padding:6px 10px;border-bottom:1px solid #f1f5f9}
    .wt-table tr:hover td{background:#f8fafc}
    .wt-sticky{position:sticky;left:0;background:#fff;z-index:2;box-shadow:1px 0 0 #e2e8f0}
    .wt-table th.wt-sticky{background:#f8fafc;z-index:3}
    .wt-jobcell{display:flex;align-items:center;gap:6px}
    .wt-dot{width:10px;height:10px;border-radius:50%;flex:none;display:inline-block}
    .wt-muted{color:#94a3b8}
    .wt-code{background:#eef2ff;color:#4338ca;border-radius:20px;padding:2px 9px;font-weight:700;font-size:11px}
    .wt-lang{background:#f1f5f9;color:#475569;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600}
    .wt-lang.na{background:#e2e8f0;color:#64748b;font-style:italic}
    /* ── ลำดับการใช้งานเครื่องมือ (รอบบำรุงรักษา) ── */
    .wt-seq{border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:8px;padding:3px 7px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;min-width:44px;display:inline-flex;align-items:center;justify-content:center;gap:1px;transition:transform .1s}
    .wt-seq:hover{transform:scale(1.06)}
    .wt-seq-tot{font-size:9px;font-weight:600;opacity:.6}
    .wt-seq-wr{font-size:9px;margin-left:2px}
    .wt-seq.none{background:transparent;border-color:transparent;color:#cbd5e1;cursor:default}
    .wt-seq.none:hover{transform:none}
    .wt-seq.yel{background:#fef9c3;border-color:#fde047;color:#a16207}
    .wt-seq.org{background:#ffedd5;border-color:#fdba74;color:#c2410c}
    .wt-seq.red{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}
    .wt-seq.due{background:#dc2626;border-color:#dc2626;color:#fff;animation:wt-pulse 1.4s ease-in-out infinite}
    @keyframes wt-pulse{0%,100%{opacity:1}50%{opacity:.55}}
    /* ── ผลทดสอบ P/F/N-A ── */
    .wt-res{border:1px solid #e2e8f0;background:#fff;color:#cbd5e1;border-radius:8px;padding:3px 0;width:38px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit}
    .wt-res:hover{border-color:#94a3b8}
    .wt-res.p{background:#dcfce7;border-color:#86efac;color:#15803d}
    .wt-res.f{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}
    .wt-res.na{background:#f1f5f9;border-color:#cbd5e1;color:#64748b}
    /* ── ประเภทงาน (ปุ่มเดียวกดวนค่า) ── */
    .wt-tp{border:1px solid #e2e8f0;background:#fff;color:#cbd5e1;border-radius:20px;padding:3px 0;width:60px;font-size:10.5px;font-weight:700;cursor:pointer;font-family:inherit}
    .wt-tp:hover{border-color:#94a3b8}
    .wt-tp.pre.on{background:#ede9fe;border-color:#c4b5fd;color:#6d28d9}
    .wt-tp.nor.on{background:#e0f2fe;border-color:#7dd3fc;color:#0369a1}
    .wt-tp.urg.on{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}
    .wt-tp.rp.on{background:#fef3c7;border-color:#fcd34d;color:#b45309}
    .wt-pill{border:1px solid #e2e8f0;background:#fff;color:#94a3b8;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-family:inherit}
    .wt-pill:hover{border-color:#cbd5e1}
    .wt-pill.on{background:#dcfce7;border-color:#86efac;color:#15803d}
    .wt-sub{font-size:9.5px;background:rgba(0,0,0,.06);border-radius:10px;padding:1px 5px;color:#334155}
    .wt-note-btn{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:3px 8px;cursor:pointer;font-size:12px}
    .wt-note-btn.has{background:#fef9c3;border-color:#fde047}
    .wt-actions{display:flex;gap:3px}
    .wt-ic{border:0;background:transparent;cursor:pointer;font-size:14px;padding:3px;border-radius:6px}
    .wt-ic:hover{background:#f1f5f9}.wt-ic.danger:hover{background:#fee2e2}
    .wt-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity .15s;padding:16px}
    .wt-ov.show{opacity:1}
    .wt-modal{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)}
    .wt-modal-h{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eef2f7}
    .wt-modal-h b{font-size:16px}
    .wt-x{border:0;background:transparent;font-size:16px;cursor:pointer;color:#94a3b8}
    .wt-modal-b{padding:16px 18px;overflow:auto}
    .wt-modal-f{padding:12px 18px;border-top:1px solid #eef2f7;display:flex;gap:8px;justify-content:flex-end}
    .wt-form,.wt-notes{display:flex;flex-direction:column;gap:11px}
    .wt-fld{display:flex;flex-direction:column;gap:4px}
    .wt-fl{font-size:12px;font-weight:700;color:#64748b}
    .wt-2col{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .wt-hint{font-size:11px;color:#94a3b8;margin-top:4px}
    .wt-confirm{padding:6px 0;line-height:1.6}
    .wt-note{border:1px solid #eef2f7;border-radius:10px;padding:9px 11px}
    .wt-note-top{display:flex;align-items:center;gap:8px}.wt-note-top b{flex:1}
    .wt-note-body{font-size:12.5px;color:#334155;margin-top:4px}
    .wt-note-add{display:flex;flex-direction:column;gap:8px;border-top:1px dashed #e2e8f0;padding-top:10px}
    .wt-md-row{display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px dashed #f1f5f9}
    .wt-md-h{font-weight:800;font-size:13px}
    .wt-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:10px;font-weight:700;font-size:13px;z-index:10000;opacity:0;transition:opacity .2s}
    .wt-toast.show{opacity:1}.wt-toast.err{background:#e11d48}
    /* ── การ์ด/โมดัล รอบบำรุงรักษา ── */
    .wt-card.warn-yel{border-color:#fde047;background:#fffbeb}
    .wt-card.warn-org{border-color:#fdba74;background:#fff7ed}
    .wt-card.warn-red,.wt-card.warn-due{border-color:#fca5a5;background:#fef2f2}
    .wt-mini-strip{display:flex;gap:1.5px;margin-top:7px}
    .wt-mini-strip>span{flex:1;height:5px;border-radius:2px;background:#e2e8f0}
    .wt-mini-strip>span.past{background:#94a3b8}
    .wt-mini-strip>span.now{background:#1e40af;height:7px;margin-top:-1px}
    .wt-mini-strip>span.w-yel{background:#fde047}.wt-mini-strip>span.w-org{background:#fdba74}
    .wt-mini-strip>span.w-red,.wt-mini-strip>span.w-due{background:#fca5a5}
    .wt-mt-big{font-size:30px;font-weight:800;color:#1e40af}
    .wt-mt-big.yel{color:#ca8a04}.wt-mt-big.org{color:#ea580c}
    .wt-mt-big.red{color:#dc2626}.wt-mt-big.due{color:#b91c1c}
    .wt-strip{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin:4px 0}
    .wt-strip-c{height:24px;border-radius:6px;background:#f1f5f9;color:#94a3b8;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:1px solid #e2e8f0}
    .wt-strip-c.past{background:#e2e8f0;color:#64748b}
    .wt-strip-c.now{background:#1e40af;border-color:#1e40af;color:#fff;transform:scale(1.1)}
    .wt-strip-c.now.yel{background:#ca8a04;border-color:#ca8a04}
    .wt-strip-c.now.org{background:#ea580c;border-color:#ea580c}
    .wt-strip-c.now.red,.wt-strip-c.now.due{background:#dc2626;border-color:#dc2626}
    .wt-strip-c.yel.ahead{background:#fef9c3;border-color:#fde047;color:#a16207}
    .wt-strip-c.org.ahead{background:#ffedd5;border-color:#fdba74;color:#c2410c}
    .wt-strip-c.red.ahead,.wt-strip-c.due.ahead{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}
    .wt-mt-msg{background:#f8fafc;border-radius:9px;padding:9px 11px;font-size:12.5px;color:#334155}
    .wt-mt-msg.due{background:#fef2f2;color:#b91c1c;font-weight:700}
    .wt-mt-chk{display:flex;gap:9px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:10px;padding:10px;cursor:pointer;font-size:12.5px}
    .wt-mt-chk input{margin-top:2px;flex:none}
    @media(max-width:820px){.wt-cards,.wt-cards.four{grid-template-columns:1fr}}
    @media(min-width:821px) and (max-width:1250px){.wt-cards.four{grid-template-columns:repeat(2,1fr)}}
    @media(min-width:1251px){.wt-cards.four{grid-template-columns:repeat(4,1fr)}}
    `;
    document.head.appendChild(s);
  }
})();
