// ชั้นเชื่อมต่อ Apps Script Web App (ฐานข้อมูล = Google Sheet)
// - GET  ?token=..&action=all         -> โหลดทุกแท็บทีเดียว
// - POST {token,action:'save',tab,rows} -> บันทึกทั้งแท็บ (overwrite)
// ใช้ Content-Type text/plain กัน CORS preflight (Apps Script ไม่ตอบ preflight)

const API = {
  get token() { return localStorage.getItem('sched_token') || ''; },
  set token(v) { localStorage.setItem('sched_token', v || ''); },

  async loadAll() {
    const url = CFG.API_URL + '?action=all&token=' + encodeURIComponent(API.token)
              + '&_=' + Date.now();
    const r = await fetch(url, { method: 'GET' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'load failed');
    return j.data;   // { WorkStatus_IP:[...], WorkPlan:[...], ... }
  },

  async saveTab(tab, rows) {
    const body = JSON.stringify({ token: API.token, action: 'save', tab, rows });
    const r = await fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'save failed');
    return j;
  },

  // ตรวจรหัส: ลองโหลด ถ้า error=auth แปลว่ารหัสผิด
  async checkAuth() {
    try {
      const url = CFG.API_URL + '?action=all&token=' + encodeURIComponent(API.token)
                + '&_=' + Date.now();
      const r = await fetch(url);
      const j = await r.json();
      return j.ok === true;
    } catch (e) { return false; }
  },
};
