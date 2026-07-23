/* ============================================================================
 * wt-shim.js — ให้ worktrack.js ตัวจริง (ที่ยิง /api/worktrack/*) ทำงานบน GitHub
 * โดยดัก fetch แล้วอ่าน/เขียน Google Sheet (ผ่าน Apps Script Web App) แทน Flask
 * โหลดไฟล์นี้ "ก่อน" worktrack.js
 * ========================================================================== */
(function () {
  'use strict';

  const API_URL = (window.CFG && CFG.API_URL) || '';
  const token = () => localStorage.getItem('sched_token') || '';

  // พาเลตสีบริษัท (ตรงกับฝั่ง Local app.py)
  const COLORS = ['#2563eb', '#16a34a', '#e11d48', '#f59e0b', '#7c3aed', '#0891b2',
    '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#c026d3',
    '#ca8a04', '#dc2626', '#059669', '#9333ea', '#0369a1', '#b91c1c',
    '#15803d', '#a21caf', '#1d4ed8', '#be123c', '#4d7c0f', '#c2410c'];

  const IP_FIELDS = ['job_no', 'date_received', 'date_planned', 'company', 'test_code', 'tester',
    'report_lang', 'st_photo_before', 'st_probe', 'st_dust', 'st_water', 'st_hipot',
    'st_photo_after', 'st_academic', 'st_testresult', 'st_testreport', 'st_sent_admin',
    'dust_start', 'dust_end', 'water_start', 'water_end', 'hipot_voltage',
    'maint_reset', 'result', 'job_type'];
  const IK_FIELDS = ['job_no', 'date_received', 'date_planned', 'company', 'test_code', 'tester',
    'report_lang', 'st_photo_before', 'st_test', 'test_start', 'test_end',
    'st_testresult', 'st_testreport', 'st_sent_admin', 'result', 'job_type'];

  let D = { companies: {}, ip: [], ik: [] };   // สำเนาในหน่วยความจำ (source = Sheet)
  let loaded = false;

  const rid = () => Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 6);
  const today = () => new Date().toISOString().slice(0, 10);

  // ── คุยกับ Sheet ──
  async function sheetLoad() {
    const url = API_URL + '?action=all&token=' + encodeURIComponent(token()) + '&_=' + Date.now();
    const r = await fetch(url);                    // fetch แท้ (ไม่โดน shim เพราะไม่ใช่ /api/worktrack)
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'load');
    const data = j.data;
    const unflat = rows => (rows || []).map(x => {
      const o = Object.assign({}, x);
      o.pinned = String(x.pinned).toUpperCase() === 'TRUE';
      try { o.notes = JSON.parse(x.notes || '[]'); } catch (e) { o.notes = []; }
      return o;
    });
    D = {
      companies: Object.fromEntries((data.WorkStatus_Companies || []).filter(c => c.name).map(c => [c.name, c.color])),
      ip: unflat(data.WorkStatus_IP),
      ik: unflat(data.WorkStatus_IK),
    };
    loaded = true;
  }

  async function sheetSave() {
    const flat = jobs => (jobs || []).map(j => {
      const o = Object.assign({}, j);
      o.pinned = j.pinned ? 'TRUE' : 'FALSE';
      o.notes = JSON.stringify(j.notes || []);
      return o;
    });
    const body = JSON.stringify({
      token: token(), action: 'saveAll', data: {
        WorkStatus_IP: flat(D.ip),
        WorkStatus_IK: flat(D.ik),
        WorkStatus_Companies: Object.entries(D.companies).map(([name, color]) => ({ name, color })),
      },
    });
    const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'save');
  }

  function assignColor(company) {
    company = (company || '').trim();
    if (!company || D.companies[company]) return;
    const used = new Set(Object.values(D.companies));
    D.companies[company] = COLORS.find(c => !used.has(c)) || ('#' + (Math.abs(hash(company)) & 0xffffff).toString(16).padStart(6, '0'));
  }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  function jsonResp(obj) {
    return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── handler หลัก: จำลอง /api/worktrack/* ให้ตรงสัญญาที่ worktrack.js คาดหวัง ──
  async function handle(path, method, body) {
    // /all
    if (path === '/all') { if (!loaded) await sheetLoad(); return { companies: D.companies, ip: D.ip, ik: D.ik }; }

    // /autotime/* — ต้องพึ่ง NAS/EXIF → ไม่รองรับบนคลาวด์ (คืนว่าง กันพัง)
    if (path.indexOf('/autotime') === 0) return { ok: true, jobs: [], updates: [], note: 'ดึงเวลาอัตโนมัติใช้ได้เฉพาะบนเครื่องแล็บ' };

    const parts = path.split('/').filter(Boolean);   // เช่น ['ip','<id>','notes','<nid>']
    const kind = parts[0];
    if (kind !== 'ip' && kind !== 'ik') throw new Error('bad kind');
    const fields = kind === 'ip' ? IP_FIELDS : IK_FIELDS;
    if (!loaded) await sheetLoad();
    const list = D[kind];

    // POST /<kind>  = เพิ่มงาน
    if (parts.length === 1 && method === 'POST') {
      const job = { id: rid(), pinned: false, notes: [], created: new Date().toISOString().slice(0, 19) };
      fields.forEach(f => job[f] = (body && body[f]) || '');
      assignColor(job.company);
      list.push(job);
      await sheetSave();
      return { ok: true, job, companies: D.companies };
    }

    const id = parts[1];
    const job = list.find(x => x.id === id);

    // /<kind>/<id>/notes ...
    if (parts[2] === 'notes') {
      if (!job) throw new Error('ไม่พบรายการ');
      if (method === 'POST') {
        const note = { id: rid(), title: (body && body.title) || '', body: (body && body.body) || '', date: today() };
        job.notes = job.notes || []; job.notes.push(note);
        await sheetSave();
        return { ok: true, note };
      }
      if (method === 'DELETE') {
        const nid = parts[3];
        job.notes = (job.notes || []).filter(n => n.id !== nid);
        await sheetSave();
        return { ok: true };
      }
    }

    // PUT /<kind>/<id>  = แก้ไขงาน
    if (parts.length === 2 && method === 'PUT') {
      if (!job) throw new Error('ไม่พบรายการ');
      Object.assign(job, body || {});
      assignColor(job.company);
      await sheetSave();
      return { ok: true, job, companies: D.companies };
    }

    // DELETE /<kind>/<id>
    if (parts.length === 2 && method === 'DELETE') {
      D[kind] = list.filter(x => x.id !== id);
      await sheetSave();
      return { ok: true };
    }

    throw new Error('unknown worktrack op: ' + method + ' ' + path);
  }

  // ── ดัก fetch ──
  const _fetch = window.fetch.bind(window);
  window.fetch = function (url, opt) {
    const u = (typeof url === 'string') ? url : (url && url.url) || '';
    if (u.indexOf('/api/worktrack') === 0) {
      const path = u.slice('/api/worktrack'.length).split('?')[0];
      const method = (opt && opt.method) || 'GET';
      let body;
      if (opt && opt.body) { try { body = JSON.parse(opt.body); } catch (e) {} }
      return handle(path, method, body)
        .then(jsonResp)
        .catch(e => jsonResp({ ok: false, error: e.message }));
    }
    return _fetch(url, opt);
  };
})();
