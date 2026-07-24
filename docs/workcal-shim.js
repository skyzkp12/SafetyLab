/* ============================================================================
 * workcal-shim.js — ให้ปฏิทิน (workcal.js ตัวจริง) ทำงานบน GitHub
 * ดัก fetch /api/workcal/* แล้วอ่าน/เขียน Google Sheet แทน Flask
 * โหลด "ก่อน" workcal.js (และหลัง wt-shim.js — จะต่อ chain กันเอง)
 * ========================================================================== */
(function () {
  'use strict';
  const API_URL = (window.CFG && CFG.API_URL) || '';
  const token = () => localStorage.getItem('sched_token') || '';

  const CAPS = { IP_normal: 1, IK_normal: 3, IP_urgent: 1, IK_urgent: 2 };
  const DAYMODES = {
    maintenance: 'บำรุงรักษา', equip_doc: 'จัดทำเอกสารเครื่องมือ',
    intermediate: 'Intermediate Check', lighting: 'Lighting ใช้งาน (ไม่ทดสอบ Safety)',
  };

  let jobs = [];      // [{date,id,jobno,company,kind,urgent(bool),note,status_next}]
  let days = {};      // {iso:{status,note,by,ot(bool)}}
  let holidays = {};  // {iso:name}
  let loaded = false;

  const rid = () => Math.random().toString(16).slice(2, 10);

  async function load() {
    const r = await fetch(API_URL + '?action=all&token=' + encodeURIComponent(token()) + '&_=' + Date.now());
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'load');
    const d = j.data;
    jobs = (d.WorkCalendar_Jobs || []).map(x => ({
      date: x.date, id: x.id || rid(), jobno: x.jobno || '', company: x.company || '',
      kind: x.kind || 'IP', urgent: String(x.urgent).toUpperCase() === 'TRUE',
      note: x.note || '', status_next: x.status_next || '',
    }));
    days = {};
    (d.WorkCalendar_Days || []).forEach(x => {
      if (!x.date) return;
      days[x.date] = { status: x.status || '', note: x.note || '', by: x.by || '',
                       ot: String(x.ot).toUpperCase() === 'TRUE' };
    });
    holidays = Object.fromEntries((d.Holidays || []).filter(h => h.date).map(h => [h.date, h.name]));
    loaded = true;
  }

  async function save() {
    const jobRows = jobs.map(j => ({
      date: j.date, id: j.id, jobno: j.jobno, company: j.company, kind: j.kind,
      urgent: j.urgent ? 'TRUE' : 'FALSE', note: j.note || '', status_next: j.status_next || '',
    }));
    const dayRows = Object.keys(days).map(iso => ({
      date: iso, status: days[iso].status || '', note: days[iso].note || '',
      by: days[iso].by || '', ot: days[iso].ot ? 'TRUE' : 'FALSE',
    }));
    const body = JSON.stringify({ token: token(), action: 'saveAll',
      data: { WorkCalendar_Jobs: jobRows, WorkCalendar_Days: dayRows } });
    const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'save');
  }

  function jsonResp(o) { return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }); }

  async function handle(path, method, body) {
    if (!loaded) await load();

    // GET /month/<YYYY-MM>
    if (path.indexOf('/month/') === 0) {
      const ym = path.slice('/month/'.length);
      const daysOut = {};
      jobs.forEach(j => {
        if ((j.date || '').slice(0, 7) !== ym) return;
        (daysOut[j.date] = daysOut[j.date] || []).push({
          id: j.id, jobno: j.jobno, company: j.company, kind: j.kind,
          urgent: j.urgent, status_next: j.status_next,
        });
      });
      const blocks = {};
      Object.keys(days).forEach(iso => {
        if (iso.slice(0, 7) !== ym) return;
        const b = days[iso];
        if (b.status || b.ot) blocks[iso] = { status: b.status, note: b.note, ot: b.ot };
      });
      const hol = {};
      Object.keys(holidays).forEach(iso => { if (iso.slice(0, 7) === ym) hol[iso] = holidays[iso]; });
      return { is_admin: false, caps: CAPS, days: daysOut, blocks, daymodes: DAYMODES, holidays: hol };
    }

    // POST /add {date,kind,urgent,jobno}
    if (path === '/add' && method === 'POST') {
      jobs.push({ date: body.date, id: rid(), jobno: body.jobno || '', company: '',
        kind: (body.kind || 'IP').toUpperCase(), urgent: !!body.urgent, note: '', status_next: '' });
      await save();
      return { ok: true };
    }

    // POST /ot {date,on}
    if (path === '/ot' && method === 'POST') {
      const iso = body.date;
      const d = days[iso] || { status: '', note: '', by: '' };
      d.ot = !!body.on;
      if (!d.ot && !d.status) delete days[iso]; else days[iso] = d;
      await save();
      return { ok: true };
    }

    // POST /daymode {date,status}
    if (path === '/daymode' && method === 'POST') {
      const iso = body.date;
      if (body.status) { const d = days[iso] || {}; d.status = body.status; d.by = d.by || 'cloud'; days[iso] = d; }
      else if (days[iso]) { days[iso].status = ''; if (!days[iso].ot) delete days[iso]; }
      await save();
      return { ok: true };
    }

    // DELETE /<id>
    if (method === 'DELETE') {
      const id = path.slice(1);
      jobs = jobs.filter(j => j.id !== id);
      await save();
      return { ok: true };
    }

    throw new Error('unknown workcal op: ' + method + ' ' + path);
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = function (url, opt) {
    const u = (typeof url === 'string') ? url : (url && url.url) || '';
    if (u.indexOf('/api/workcal') === 0) {
      const path = u.slice('/api/workcal'.length).split('?')[0];
      const method = (opt && opt.method) || 'GET';
      let body; if (opt && opt.body) { try { body = JSON.parse(opt.body); } catch (e) {} }
      return handle(path, method, body).then(jsonResp).catch(e => jsonResp({ ok: false, error: e.message }));
    }
    return _fetch(url, opt);
  };
})();
