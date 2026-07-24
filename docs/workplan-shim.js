/* ============================================================================
 * workplan-shim.js — ให้แผนงาน (workplan.js ตัวจริง) ทำงานบน GitHub
 * ดัก fetch /api/workplan/* แล้วอ่าน/เขียน Google Sheet แทน Flask
 * โหลด "ก่อน" workplan.js (ต่อ chain window.fetch กับ wt-shim/workcal-shim เอง)
 *
 * แท็บ Sheet: WorkPlan (slot 30 นาที) + WorkPlan_Days (วันเปิด OT)
 *   - อ่าน/เขียน slot ได้เสมอ (WorkPlan มีใน schema เดิม)
 *   - OT (WorkPlan_Days) จะ persist ก็ต่อเมื่อ redeploy Code.gs ใหม่ (มีแท็บนี้)
 *     ตรวจจาก doGet: ถ้าคืนคีย์ WorkPlan_Days = แท็บมีแล้ว → บันทึก OT ด้วย
 *     ถ้ายังไม่มี → บันทึกเฉพาะ WorkPlan (กัน saveAll พังทั้งก้อน) OT อยู่ในหน่วยความจำรอบนี้
 * ========================================================================== */
(function () {
  'use strict';
  const API_URL = (window.CFG && CFG.API_URL) || '';
  const token = () => localStorage.getItem('sched_token') || '';

  // ── ประเภทงาน + ช่วงเวลา (ต้องตรงกับ app.py: WORKPLAN_TYPES / _wp_times / _wp_ot_times) ──
  const TYPES = [
    { code: 'P1', label: 'IK · ทดสอบ', color: '#2563eb' },
    { code: 'P2', label: 'IK · ทำรายงาน', color: '#0891b2' },
    { code: 'P3', label: 'IP · ทดสอบฝุ่น', color: '#ca8a04' },
    { code: 'P4', label: 'IP · ทดสอบน้ำ', color: '#0d9488' },
    { code: 'P5', label: 'IP · ทนทานไฟฟ้า', color: '#dc2626' },
    { code: 'P6', label: 'IP · ทำรายงาน', color: '#0e7490' },
    { code: 'P7', label: 'เอกสาร ISO', color: '#7c3aed' },
    { code: 'P8', label: 'ออกแบบ/ปรับปรุงพื้นที่-อุปกรณ์', color: '#ea580c' },
    { code: 'P9', label: 'บำรุงรักษาเครื่องมือ', color: '#65a30d' },
    { code: 'P10', label: 'Intermediate Check', color: '#db2777' },
    { code: 'P11', label: 'ELU ขอด่วน', color: '#e11d48' },
    { code: 'P12', label: 'งานการจัดการ', color: '#475569' },
  ];
  function times() {
    const out = []; let h = 8, m = 0;
    while (h < 18) { out.push(pad(h) + ':' + pad(m)); m += 30; if (m >= 60) { m = 0; h++; } }
    return out;
  }
  function otTimes() {
    const out = []; let h = 18, m = 0;
    while (h < 24) { out.push(pad(h) + ':' + pad(m)); m += 30; if (m >= 60) { m = 0; h++; } }
    return out;
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  let days = {};          // { iso: {slots:{time:{type,status,span,s1:{title,detail},s2:{title,detail}}}, ot:bool} }
  let hasOtTab = false;   // แท็บ WorkPlan_Days มีใน Sheet แล้วหรือยัง (จาก doGet)
  let loaded = false;

  async function load() {
    const r = await fetch(API_URL + '?action=all&token=' + encodeURIComponent(token()) + '&_=' + Date.now());
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'load');
    const d = j.data || {};
    days = {};
    (d.WorkPlan || []).forEach(x => {
      const dt = x.date, tm = x.time;
      if (!dt || !tm) return;
      let span = parseInt(x.span, 10); if (!span || span < 1) span = 1;
      (days[dt] = days[dt] || { slots: {} }).slots[tm] = {
        type: x.type || '', status: x.status || '', span,
        s1: { title: x.s1_title || '', detail: x.s1_detail || '' },
        s2: { title: x.s2_title || '', detail: x.s2_detail || '' },
      };
    });
    hasOtTab = ('WorkPlan_Days' in d);
    if (hasOtTab) {
      (d.WorkPlan_Days || []).forEach(x => {
        if (x.date && String(x.ot).toUpperCase() === 'TRUE') {
          (days[x.date] = days[x.date] || { slots: {} }).ot = true;
        }
      });
    }
    loaded = true;
  }

  async function save() {
    const plan = [];
    const planday = [];
    Object.keys(days).forEach(dt => {
      const day = days[dt] || { slots: {} };
      if (day.ot) planday.push({ date: dt, ot: 'TRUE' });
      const slots = day.slots || {};
      Object.keys(slots).forEach(tm => {
        const s = slots[tm] || {};
        const s1 = s.s1 || {}, s2 = s.s2 || {};
        plan.push({ date: dt, time: tm, type: s.type || '', status: s.status || '',
          span: String(s.span || 1), s1_title: s1.title || '', s1_detail: s1.detail || '',
          s2_title: s2.title || '', s2_detail: s2.detail || '' });
      });
    });
    const data = { WorkPlan: plan };
    if (hasOtTab) data.WorkPlan_Days = planday;   // ส่งเฉพาะเมื่อแท็บมีจริง กัน saveAll พังทั้งก้อน
    const body = JSON.stringify({ token: token(), action: 'saveAll', data });
    const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'save');
  }

  // เก็บเฉพาะ slot ที่มีเนื้อหา (mirror api_workplan_save ใน app.py)
  function cleanSlots(slots) {
    const out = {};
    Object.keys(slots || {}).forEach(t => {
      const s = slots[t]; if (!s || typeof s !== 'object') return;
      const s1 = s.s1 || {}, s2 = s.s2 || {};
      if (s.type || s.status || s1.title || s1.detail || s2.title || s2.detail) out[t] = s;
    });
    return out;
  }

  function jsonResp(o) { return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }); }

  async function handle(path, method, body) {
    // /types อ่าน static ได้เลย ไม่ต้องโหลด Sheet
    if (path === '/types') return TYPES;

    if (!loaded) await load();

    // GET /day/<date>
    if (path.indexOf('/day/') === 0 && method === 'GET') {
      const date = path.slice('/day/'.length);
      return { date, day: days[date] || { slots: {} }, times: times(), ot_times: otTimes() };
    }

    // POST /day/<date>  {slots, ot}
    if (path.indexOf('/day/') === 0 && method === 'POST') {
      const date = path.slice('/day/'.length);
      const clean = cleanSlots((body && body.slots) || {});
      const ot = !!(body && body.ot);
      if (Object.keys(clean).length || ot) {
        const entry = { slots: clean };
        if (ot) entry.ot = true;
        days[date] = entry;
      } else {
        delete days[date];
      }
      await save();
      return { ok: true };
    }

    // GET /month/<YYYY-MM>
    if (path.indexOf('/month/') === 0) {
      const ym = path.slice('/month/'.length);
      const out = Object.keys(days)
        .filter(k => k.slice(0, 7) === ym && Object.keys(days[k].slots || {}).length)
        .sort();
      return { days: out };
    }

    // GET /week/<YYYY-MM-DD>
    if (path.indexOf('/week/') === 0) {
      const start = path.slice('/week/'.length);
      const out = {};
      const p = start.split('-').map(Number);
      let cur = new Date(p[0], p[1] - 1, p[2]);
      for (let i = 0; i < 7; i++) {
        const ds = cur.getFullYear() + '-' + pad(cur.getMonth() + 1) + '-' + pad(cur.getDate());
        out[ds] = days[ds] || { slots: {} };
        cur.setDate(cur.getDate() + 1);
      }
      return { days: out };
    }

    throw new Error('unknown workplan op: ' + method + ' ' + path);
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = function (url, opt) {
    const u = (typeof url === 'string') ? url : (url && url.url) || '';
    if (u.indexOf('/api/workplan') === 0) {
      const path = u.slice('/api/workplan'.length).split('?')[0];
      const method = (opt && opt.method) || 'GET';
      let body; if (opt && opt.body) { try { body = JSON.parse(opt.body); } catch (e) {} }
      return handle(path, method, body).then(jsonResp).catch(e => jsonResp({ ok: false, error: e.message }));
    }
    return _fetch(url, opt);
  };
})();
