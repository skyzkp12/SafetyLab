/**
 * E-Safety Lab — Schedule Cloud API (Google Apps Script Web App)
 * ------------------------------------------------------------------
 * ฐานข้อมูล = Google Sheet ตัวนี้เอง (แต่ละชนิดข้อมูล = 1 แท็บ)
 * หน้าเว็บ (GitHub Pages) เรียก doGet/doPost ตัวนี้เพื่ออ่าน/เขียน
 *
 * โปรโตคอลแบบ generic: โค้ดไม่รู้จักคอลัมน์ล่วงหน้า ใช้ "แถวหัว" (row 1)
 * เป็นชื่อคีย์ แล้วอ่าน/เขียนทั้งแท็บเป็น array ของ object
 * ค่าทุกช่องเก็บเป็น "ข้อความล้วน" (number format = @) กัน Sheet แปลง
 * วันที่/true/false เอง — ฝั่งเว็บจัดการ JSON.parse คอลัมน์ที่ซ้อน (เช่น notes) เอง
 *
 * ---- วิธี Deploy ----
 *  1. สร้าง Google Sheet ใหม่ในบัญชี skyzkp12@gmail.com
 *  2. Extensions → Apps Script → วางโค้ดนี้ทั้งหมด
 *  3. แก้ SHARED_TOKEN ให้เป็นรหัสของคุณเอง (ห้ามซ้ำใคร)
 *  4. รันฟังก์ชัน setup() หนึ่งครั้ง (เมนู Run → setup) เพื่อสร้างแท็บทั้งหมด
 *     — ครั้งแรกจะเด้งขออนุญาต ให้กด Allow ด้วยบัญชีตัวเอง
 *  5. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *     คัดลอก "Web app URL" ไปใส่ในหน้าเว็บ (web/config.js → API_URL)
 *  6. ทุกครั้งที่แก้โค้ดนี้: Deploy → Manage deployments → แก้ deploy เดิม
 *     (เลือก version = New) ไม่งั้น URL เดิมยังรันโค้ดเก่า
 */

// ======= ตั้งค่า =======
const SHARED_TOKEN = 'CHANGE_ME_ตั้งรหัสลับตรงนี้';  // รหัสร่วม ใช้ตัวเดียวทั้งทีม
const SS_ID = 'PASTE_SHEET_ID';  // ID ของ Google Sheet (ส่วนกลางของ URL /d/<ID>/edit)

// แท็บทั้งหมด + ลำดับคอลัมน์ (แถวหัว) — ปรับได้ ถ้าไม่มีแท็บจะถูกสร้างตอน setup()
const TABS = {
  WorkStatus_IP: ['id','pinned','notes','created','job_no','date_received','date_planned',
    'company','test_code','tester','report_lang','st_photo_before','st_probe','st_dust',
    'st_water','st_hipot','st_photo_after','st_academic','st_testresult','st_testreport',
    'st_sent_admin','dust_start','dust_end','water_start','water_end','hipot_voltage',
    'maint_reset','result','job_type'],
  WorkStatus_IK: ['id','pinned','notes','created','job_no','date_received','date_planned',
    'company','test_code','tester','report_lang','st_photo_before','st_test','test_start',
    'test_end','st_testresult','st_testreport','st_sent_admin','result','job_type'],
  WorkStatus_Companies: ['name','color'],
  WorkCalendar_Jobs: ['date','id','jobno','company','kind','urgent','note','status_next'],
  WorkCalendar_Days: ['date','status','note','by','ot'],
  WorkPlan: ['date','time','type','status','span','s1_title','s1_detail','s2_title','s2_detail'],
  WorkPlan_Days: ['date','ot'],
  Holidays: ['date','name'],
};

// ======= HTTP handlers =======
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!authOK(p.token)) return json({ok:false, error:'auth'});
  const action = p.action || 'all';
  try {
    if (action === 'all') {
      const out = {};
      Object.keys(TABS).forEach(function(t){ out[t] = readTab(t); });
      return json({ok:true, data:out, ts:new Date().toISOString()});
    }
    if (action === 'get') {
      return json({ok:true, tab:p.tab, rows:readTab(p.tab)});
    }
    return json({ok:false, error:'unknown action'});
  } catch (err) {
    return json({ok:false, error:String(err)});
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json({ok:false, error:'bad json'}); }
  if (!authOK(body.token)) return json({ok:false, error:'auth'});
  try {
    if (body.action === 'save') {
      writeTab(body.tab, body.rows || []);
      return json({ok:true, tab:body.tab, n:(body.rows||[]).length});
    }
    if (body.action === 'saveAll') {
      var res = {};
      Object.keys(body.data || {}).forEach(function(t){
        writeTab(t, body.data[t] || []);
        res[t] = (body.data[t] || []).length;
      });
      return json({ok:true, saved:res});
    }
    return json({ok:false, error:'unknown action'});
  } catch (err) {
    return json({ok:false, error:String(err)});
  }
}

// ======= core =======
function authOK(tok) { return tok === SHARED_TOKEN; }

function ssRoot() {
  // ผูกกับ Sheet ด้วย ID (ใช้ได้ทั้งสคริปต์แบบ standalone และ bound)
  return (typeof SS_ID === 'string' && SS_ID && SS_ID !== 'PASTE_SHEET_ID')
    ? SpreadsheetApp.openById(SS_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function sheetFor(tab) {
  const ss = ssRoot();
  var ws = ss.getSheetByName(tab);
  if (!ws) {
    ws = ss.insertSheet(tab);
    const headers = TABS[tab] || [];
    if (headers.length) ws.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return ws;
}

function readTab(tab) {
  const ws = sheetFor(tab);
  const rng = ws.getDataRange();
  const values = rng.getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function(h){ return String(h).trim(); });
  const rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function(c){ return c === '' || c === null; })) continue; // ข้ามแถวว่าง
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = row[c];
      if (v instanceof Date) {
        v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        v = (v === null || v === undefined) ? '' : String(v);
      }
      obj[headers[c]] = v;
    }
    rows.push(obj);
  }
  return rows;
}

function writeTab(tab, rows) {
  const ws = sheetFor(tab);
  const headers = TABS[tab] || (ws.getRange(1,1,1,ws.getLastColumn()).getValues()[0]
                    .map(function(h){return String(h).trim();}).filter(String));
  // เคลียร์ข้อมูลเก่า (เก็บแถวหัวไว้)
  const lastRow = ws.getLastRow();
  if (lastRow > 1) ws.getRange(2,1,lastRow-1, Math.max(1, ws.getLastColumn())).clearContent();
  // เขียนหัวเสมอ (กันหัวหาย)
  ws.getRange(1,1,1,headers.length).setValues([headers]);
  if (!rows.length) return;
  const matrix = rows.map(function(r){
    return headers.map(function(h){
      var v = r[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v); // เผื่อส่ง object มาตรงๆ
      return String(v);
    });
  });
  const range = ws.getRange(2,1,matrix.length,headers.length);
  range.setNumberFormat('@');        // บังคับเป็นข้อความล้วน กัน Sheet แปลงวันที่/บูลีน
  range.setValues(matrix);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ======= util: รันครั้งเดียวเพื่อสร้างแท็บทั้งหมด =======
function setup() {
  Object.keys(TABS).forEach(function(t){ sheetFor(t); });
  // ลบแท็บเริ่มต้น "Sheet1" ถ้าว่างและมีแท็บอื่นแล้ว
  const ss = ssRoot();
  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) ss.deleteSheet(s1);
  Logger.log('setup done: ' + Object.keys(TABS).join(', '));
}
