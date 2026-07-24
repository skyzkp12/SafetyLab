/* ============================================================================
 * workcal.js — ปฏิทินงาน (ดึงจาก static/app.js บรรทัด 1253-1561 ตัวจริง)
 * ใช้บนแอป GitHub (docs/) คู่กับ workcal-shim.js (ยิง /api/workcal/* -> Sheet)
 * คงเป็น global เพื่อให้ onclick ในตาราง (wcDelete/wcAdd/...) ทำงาน
 * ========================================================================== */
var AUTH = window.AUTH || { role: 'tester' };
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
let wcState = { y:null, m:null, days:{}, isAdmin:false, caps:{}, urgentOpen:new Set(), blocks:{}, daymodes:{}, holidays:{} };
// โหมด "วันไม่ทดสอบ" (งานหลังบ้าน / Lighting ใช้งาน) — key ตรงกับ backend WORKCAL_DAYMODES
const WC_DAYMODES = [
  {k:'maintenance',  icon:'🔧', label:'บำรุงรักษา',            color:'#7c3aed'},
  {k:'equip_doc',    icon:'📄', label:'จัดทำเอกสารเครื่องมือ',  color:'#0891b2'},
  {k:'intermediate', icon:'🧭', label:'Intermediate Check',    color:'#ca8a04'},
  {k:'lighting',     icon:'💡', label:'Lighting ใช้งาน',       color:'#e11d48'},
];
const WC_DAYMODE_MAP = Object.fromEntries(WC_DAYMODES.map(x=>[x.k,x]));
const WC_MON = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const WC_DOW = ['จ','อ','พ','พฤ','ศ','ส','อา'];   // จันทร์→อาทิตย์
// โซนต่อวัน — แต่ละวันแบ่งเป็นโซน IP และ IK แยกกัน
//   IP: ปกติ 1 ช่อง + ปุ่ม ⚡ เปิดงานด่วน (1 งาน) · IK: ปกติ 3 ช่อง + ⚡ งานด่วน (2 งาน)
const WC_ZONES = [
  {kind:'IP', normalCap:1, urgentCap:1, cls:'ip', clsU:'ipu'},
  {kind:'IK', normalCap:3, urgentCap:2, cls:'ik', clsU:'iku'},
];
const wcColIndex = jsDay => (jsDay + 6) % 7;      // getDay(0=อา..6=ส) → คอลัมน์ จ..อา (0..6)
const wcISO = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

function wcShift(d){ let m=wcState.m+d, y=wcState.y; if(m<0){m=11;y--;} if(m>11){m=0;y++;} wcState.y=y; wcState.m=m; wcLoad(); }
function renderWorkCalendar(){
  const now=new Date();
  if(wcState.y===null){ wcState.y=now.getFullYear(); wcState.m=now.getMonth(); }
  wcLoad();
}
async function wcLoad(){
  const c=document.getElementById('page-content');
  if(c && !document.getElementById('wc-grid')) c.innerHTML='<div class="text-center py-10 text-slate-400">กำลังโหลดปฏิทิน…</div>';
  const ym=`${wcState.y}-${String(wcState.m+1).padStart(2,'0')}`;
  try{
    const r=await fetch(`/api/workcal/month/${ym}`).then(r=>r.json());
    wcState.days=r.days||{}; wcState.isAdmin=!!r.is_admin; wcState.caps=r.caps||{};
    wcState.blocks=r.blocks||{}; wcState.daymodes=r.daymodes||{}; wcState.holidays=r.holidays||{};
  }catch(e){ wcState.days={}; wcState.blocks={}; wcState.holidays={}; wcState.isAdmin=(AUTH.role==='admin'); }
  drawWorkCalendar();
}

// สร้าง HTML ของสล็อต 1 ช่อง — คืน string, หรือ null ถ้าเป็นช่องว่างฝั่งเจ้าหน้าที่ (ให้ผู้เรียกเติมปุ่มเอง)
function wcSlotHTML(j, cls, isAdmin, isUrgent){
  if(j){
    const del = isAdmin ? '' : `<span class="wc-del" onclick="event.stopPropagation();wcDelete('${j.id}')">✕</span>`;
    const txt = esc(j.jobno||j.company||cls.toUpperCase());
    return `<div class="wc-s wc-${cls} filled" title="${esc((j.jobno||'')+' '+(j.company||''))}">${txt}${del}</div>`;
  }
  if(isAdmin) return isUrgent ? '' : `<div class="wc-s wc-${cls} openslot">ว่าง</div>`;
  return null;   // เจ้าหน้าที่: ช่องว่าง → ผู้เรียกเติมปุ่ม +
}

function wcZoneCells(iso){
  const isAdmin=wcState.isAdmin;
  const jobs=(wcState.days[iso]||[]);
  let html='';
  for(const z of WC_ZONES){
    const normals=jobs.filter(j=>j.kind===z.kind && !j.urgent);
    const urgents=jobs.filter(j=>j.kind===z.kind && !!j.urgent);
    const showUrgent = urgents.length>0 || wcState.urgentOpen.has(`${iso}_${z.kind}`);
    // หัวโซน: ป้ายชนิด + ปุ่ม ⚡ เปิด/ปิดงานด่วน (เฉพาะเจ้าหน้าที่)
    let toggle='';
    if(!isAdmin){
      toggle = showUrgent
        ? `<span class="wc-urg on" title="งานด่วนวันนี้ ${urgents.length}/${z.urgentCap}" onclick="wcToggleUrgent('${iso}','${z.kind}')">⚡${urgents.length}/${z.urgentCap}</span>`
        : `<span class="wc-urg" title="เปิดช่องงานด่วนวันนี้" onclick="wcToggleUrgent('${iso}','${z.kind}')">⚡</span>`;
    }
    let z_html=`<div class="wc-zhead"><span class="wc-ztag wc-${z.cls}">${z.kind}</span>${toggle}</div>`;
    // ช่องปกติ
    for(let i=0;i<z.normalCap;i++){
      const cell=wcSlotHTML(normals[i], z.cls, isAdmin, false);
      z_html += cell!==null ? cell
        : `<button class="wc-s wc-${z.cls} empty" onclick="wcSlotInput(this,'${iso}','${z.kind}',false)">+</button>`;
    }
    // ช่องด่วน (แสดงเมื่อเปิด ⚡ หรือมีงานด่วนอยู่แล้ว)
    if(showUrgent){
      for(let i=0;i<z.urgentCap;i++){
        const cell=wcSlotHTML(urgents[i], z.clsU, isAdmin, true);
        if(cell!==null){ if(cell) z_html+=cell; }
        else z_html += `<button class="wc-s wc-${z.clsU} empty" onclick="wcSlotInput(this,'${iso}','${z.kind}',true)">+ ด่วน</button>`;
      }
    }
    html += `<div class="wc-zone">${z_html}</div>`;
  }
  return html;
}

// เนื้อในเซลล์เมื่อเป็น "วันไม่ทดสอบ" (งานหลังบ้าน/Lighting)
function wcBlockBody(iso, block){
  const meta = WC_DAYMODE_MAP[block.status] || {icon:'🚫', label:block.status, color:'#64748b'};
  const note = block.note ? `<div class="wc-block-note">${esc(block.note)}</div>` : '';
  const clr = wcState.isAdmin ? '' : `<button class="wc-block-clear" onclick="event.stopPropagation();wcSetDayMode('${iso}','')">↩ กลับมาทดสอบ</button>`;
  return `<div class="wc-block" style="--wcbg:${meta.color}">
    <div class="wc-block-tag">${meta.icon} ${esc(meta.label)}</div>
    <div class="wc-block-sub">งดทดสอบงานวันนี้</div>${note}${clr}
  </div>`;
}

// เนื้อในเซลล์วันหยุด (เสาร์-อาทิตย์/วันหยุดราชการ) ที่ยังไม่กด OT
function wcOffBody(iso, holiday, isAdmin){
  const name = `<div class="wc-off-name">${holiday?('🔴 '+esc(holiday)):'เสาร์–อาทิตย์'}</div>`;
  const btn = isAdmin ? '' : `<button class="wc-ot-btn" title="แจ้งว่าจะเข้ามาทำงาน OT วันนี้" onclick="event.stopPropagation();wcSetOT('${iso}',true)">➕ เข้ามา OT</button>`;
  return `<div class="wc-off">${name}${btn}</div>`;
}
async function wcSetOT(iso, on){
  try{
    const r=await fetch('/api/workcal/ot',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date:iso, on})}).then(r=>r.json());
    if(!r.ok){ alert(r.error||'ตั้งค่าไม่สำเร็จ'); return; }
  }catch(e){ alert('เชื่อมต่อไม่ได้'); return; }
  wcLoad();
}

// เมนูเลือกโหมด "วันไม่ทดสอบ" (ป๊อปอัพเล็ก) — เฉพาะเจ้าหน้าที่
function wcDayMenu(ev, iso){
  wcCloseMenu();
  const has=(wcState.blocks||{})[iso];
  let items=`<div class="wc-dm-head">📌 ${iso} — ตั้งเป็น “วันไม่ทดสอบ”</div>`;
  for(const m of WC_DAYMODES){
    items+=`<button class="wc-dm-item${has&&has.status===m.k?' cur':''}" onclick="wcSetDayMode('${iso}','${m.k}')"><i style="background:${m.color}"></i>${m.icon} ${m.label}</button>`;
  }
  if(has) items+=`<button class="wc-dm-item clr" onclick="wcSetDayMode('${iso}','')">↩ กลับมาทดสอบตามปกติ</button>`;
  const menu=document.createElement('div');
  menu.className='wc-daymenu'; menu.id='wc-daymenu'; menu.innerHTML=items;
  document.body.appendChild(menu);
  const r=ev.target.getBoundingClientRect();
  menu.style.left=Math.max(8, Math.min(r.left, window.innerWidth-238))+'px';
  menu.style.top=(r.bottom+4)+'px';
  setTimeout(()=>document.addEventListener('mousedown', wcMenuOutside), 0);
}
function wcMenuOutside(e){ const m=document.getElementById('wc-daymenu'); if(m && !m.contains(e.target)) wcCloseMenu(); }
function wcCloseMenu(){ const m=document.getElementById('wc-daymenu'); if(m) m.remove(); document.removeEventListener('mousedown', wcMenuOutside); }
async function wcSetDayMode(iso, status){
  wcCloseMenu();
  try{
    const r=await fetch('/api/workcal/daymode',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date:iso, status})}).then(r=>r.json());
    if(!r.ok){ alert(r.error||'ตั้งค่าไม่สำเร็จ'); return; }
  }catch(e){ alert('เชื่อมต่อไม่ได้'); return; }
  wcLoad();
}

function drawWorkCalendar(){
  const c=document.getElementById('page-content'); if(!c) return;
  const {y,m}=wcState;
  const isAdmin=wcState.isAdmin;
  const startCol=wcColIndex(new Date(y,m,1).getDay());
  const days=new Date(y,m+1,0).getDate();
  const today=new Date(); const isToday=d=>d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();
  let cells='';
  for(let i=0;i<startCol;i++) cells+=`<div class="wc-cell wc-blank"></div>`;
  for(let d=1;d<=days;d++){
    const col=wcColIndex(new Date(y,m,d).getDay());
    const weekend = col>=5;
    const iso=wcISO(y,m,d);
    const meta=(wcState.blocks||{})[iso]||null;     // {status?, ot?}
    const holiday=(wcState.holidays||{})[iso]||'';   // ชื่อวันหยุดราชการ
    const isOff = weekend || !!holiday;
    const blockStatus = meta && meta.status;         // วันไม่ทดสอบ (งานหลังบ้าน) — เฉพาะวันทำงาน
    const ot = !!(meta && meta.ot);                  // กดเข้ามา OT ในวันหยุด

    let cls='wc-cell';
    if(isToday(d)) cls+=' wc-today';
    if(isOff) cls+=(ot?' wc-otday':' wc-weekend');
    if(blockStatus) cls+=' wc-closed';

    // มุมขวาของหัววัน: ปุ่ม ⋯ (วันทำงาน) ตั้ง "วันไม่ทดสอบ"
    const gear = (!isAdmin && !isOff) ? `<span class="wc-gear" title="จัดการวันนี้ (วันไม่ทดสอบ)" onclick="event.stopPropagation();wcDayMenu(event,'${iso}')">⋯</span>` : '';
    const dtag = (isOff && !ot) ? ' <span class="wc-hol">หยุด</span>' : '';

    let body;
    if(blockStatus){
      body = wcBlockBody(iso, meta);
    } else if(isOff && !ot){
      body = wcOffBody(iso, holiday, isAdmin);
    } else {
      const otName = holiday ? ' · '+esc(holiday) : '';
      const otTag = ot ? `<div class="wc-ot-tag">⏱️ OT${otName}${isAdmin?'':` <span class="wc-ot-x" title="ยกเลิก OT" onclick="event.stopPropagation();wcSetOT('${iso}',false)">✕</span>`}</div>` : '';
      body = `${otTag}<div class="wc-slots">${wcZoneCells(iso)}</div>`;
    }
    cells+=`<div class="${cls}">
      <div class="wc-daynum"><span>${d}${dtag}</span>${gear}</div>
      ${body}
    </div>`;
  }
  const banner = isAdmin
    ? '📨 มุมมองแอดมิน — วันที่แสดง = <b>วันจะได้รับรายงาน</b> (วันทดสอบ +2) · ดูอย่างเดียว แก้ไขไม่ได้ · สีม่วง = <b>วันไม่ทดสอบ</b> (งานหลังบ้าน/Lighting) · สีแดง = เสาร์-อาทิตย์/<b>วันหยุดราชการ</b> · ปรึกษา Ned เพื่อวางวันส่งลูกค้า'
    : '🧪 มุมมองเจ้าหน้าที่ทดสอบ — แต่ละวันแบ่งโซน <b>IP</b> (1) / <b>IK</b> (3) · กด <b>+</b> ลงเลขงาน · <b>⚡</b> เปิดงานด่วน (IP1/IK2) · <b>⋯</b> ตั้ง <b>วันไม่ทดสอบ</b> (บำรุงรักษา/เอกสารเครื่องมือ/Intermediate/Lighting) · วันหยุด (แดง/วันหยุดราชการ) กด <b>➕ เข้ามา OT</b> เพื่อเปิดลงงานวันนั้น';
  c.innerHTML=`
    <style>
      .wc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap}
      .wc-nav{display:flex;align-items:center;gap:8px}
      .wc-nav button{width:34px;height:34px;border:1px solid #e2e8f0;background:#fff;border-radius:9px;cursor:pointer;font-size:16px}
      .wc-nav button:hover{background:#fff7ed;border-color:#fdba74}
      .wc-mlabel{font-size:17px;font-weight:700;color:#1e293b;min-width:170px;text-align:center}
      .wc-role{font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px}
      .wc-banner{font-size:12px;border-radius:10px;padding:8px 12px;margin-bottom:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}
      .wc-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
      .wc-dow{text-align:center;font-size:11px;font-weight:700;color:#94a3b8;padding:3px 0}
      .wc-dow.we{color:#ef4444}
      .wc-cell{background:#fff;border:1px solid #e2e8f0;border-radius:9px;min-height:140px;padding:5px}
      .wc-blank{background:transparent;border:none}
      .wc-weekend{background:#fef2f2;border-color:#fecaca}
      .wc-today{border-color:#f97316;box-shadow:0 0 0 1px #f97316 inset}
      .wc-daynum{font-size:12px;font-weight:700;color:#475569;margin-bottom:3px;display:flex;justify-content:space-between;align-items:center}
      .wc-hol{font-size:9px;font-weight:600;color:#ef4444}
      .wc-slots{display:flex;flex-direction:column;gap:4px}
      .wc-zone{display:flex;flex-direction:column;gap:2px;padding:3px;border-radius:7px;background:#f8fafc;border:1px solid #eef2f7}
      .wc-zhead{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:1px}
      .wc-ztag{font-size:9px;font-weight:800;padding:0 6px;border-radius:4px;color:#fff;letter-spacing:.4px;line-height:15px}
      .wc-ztag.wc-ip{background:#0d9488}.wc-ztag.wc-ik{background:#2563eb}
      .wc-urg{cursor:pointer;font-size:10px;line-height:1;padding:2px 5px;border-radius:6px;border:1px solid #fecaca;color:#ef4444;background:#fff;user-select:none;white-space:nowrap}
      .wc-urg:hover{background:#fef2f2;border-color:#fca5a5}
      .wc-urg.on{background:#fee2e2;border-color:#fca5a5;color:#b91c1c;font-weight:700}
      .wc-gear{cursor:pointer;color:#94a3b8;font-weight:800;font-size:14px;line-height:1;padding:0 4px;border-radius:5px}
      .wc-gear:hover{background:#f1f5f9;color:#475569}
      .wc-otday{background:#fffbeb;border-color:#fde68a}
      .wc-off{display:flex;flex-direction:column;gap:7px;align-items:flex-start;padding:4px 2px}
      .wc-off-name{font-size:10px;color:#ef4444;font-weight:600;line-height:1.3}
      .wc-ot-btn{font-size:10px;border:1px dashed #fca5a5;background:#fff;color:#ef4444;border-radius:7px;padding:4px 7px;cursor:pointer;white-space:nowrap;font-weight:600}
      .wc-ot-btn:hover{background:#fef2f2;border-color:#f87171}
      .wc-ot-tag{font-size:9px;font-weight:700;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:5px;padding:2px 5px;margin-bottom:3px;display:flex;align-items:center;justify-content:space-between;gap:4px;white-space:nowrap;overflow:hidden}
      .wc-ot-x{cursor:pointer;color:#b45309;opacity:.7}.wc-ot-x:hover{opacity:1}
      .wc-cell.wc-closed{background:#faf5ff;border-color:#e9d5ff}
      .wc-block{--wcbg:#64748b;display:flex;flex-direction:column;gap:3px;padding:7px 6px;border-radius:8px;
        background:color-mix(in srgb,var(--wcbg) 9%,#fff);border:1px solid color-mix(in srgb,var(--wcbg) 32%,#fff)}
      .wc-block-tag{font-size:11px;font-weight:800;color:var(--wcbg);line-height:1.25}
      .wc-block-sub{font-size:9px;color:#94a3b8}
      .wc-block-note{font-size:9px;color:#64748b;white-space:normal}
      .wc-block-clear{margin-top:4px;font-size:10px;border:1px dashed #cbd5e1;background:#fff;border-radius:6px;padding:2px 4px;cursor:pointer;color:#64748b}
      .wc-block-clear:hover{border-color:#94a3b8;color:#334155}
      .wc-daymenu{position:fixed;z-index:9999;background:#fff;border:1px solid #e2e8f0;border-radius:11px;box-shadow:0 10px 28px rgba(15,23,42,.18);padding:6px;min-width:220px}
      .wc-dm-head{font-size:11px;color:#94a3b8;padding:4px 6px 6px}
      .wc-dm-item{display:flex;align-items:center;gap:7px;width:100%;text-align:left;font-size:12px;border:none;background:#fff;border-radius:7px;padding:8px;cursor:pointer;color:#334155}
      .wc-dm-item:hover{background:#f8fafc}
      .wc-dm-item.cur{background:#f1f5f9;font-weight:700}
      .wc-dm-item i{width:10px;height:10px;border-radius:3px;display:inline-block;flex:none}
      .wc-dm-item.clr{color:#0d9488;border-top:1px solid #f1f5f9;margin-top:4px}
      .wc-s{font-size:10px;line-height:1.2;border-radius:5px;padding:2px 4px;min-height:15px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;justify-content:space-between;gap:2px}
      .wc-s.empty{border:1px dashed #cbd5e1;background:#fff;color:#cbd5e1;cursor:pointer;justify-content:center;font-weight:700}
      .wc-s.empty.wc-ipu,.wc-s.empty.wc-iku{border-color:#fca5a5;color:#fca5a5}
      .wc-s.empty:hover{background:#fff7ed;border-color:#fb923c;color:#fb923c}
      .wc-s.openslot{border:1px dashed #e2e8f0;color:#cbd5e1;background:#fff;justify-content:center;font-size:9px}
      .wc-s.filled{color:#fff;font-weight:600}
      .wc-ip.filled{background:#0d9488}.wc-ik.filled{background:#2563eb}
      .wc-ipu.filled{background:#dc2626}.wc-iku.filled{background:#ea580c}
      .wc-del{cursor:pointer;opacity:.7;font-size:9px}.wc-del:hover{opacity:1}
      .wc-inp{width:100%;font-size:10px;border:1px solid #fb923c;border-radius:5px;padding:1px 4px;outline:none}
      .wc-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:#64748b;margin-top:10px}
      .wc-legend span{display:inline-flex;align-items:center;gap:4px}
      .wc-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
    </style>
    <div class="wc-head">
      <div class="wc-nav">
        <button onclick="wcShift(-1)" title="เดือนก่อน">‹</button>
        <div class="wc-mlabel">${WC_MON[m]} ${y+543}</div>
        <button onclick="wcShift(1)" title="เดือนถัดไป">›</button>
        <button onclick="wcLoad()" title="รีเฟรช" style="font-size:13px">↻</button>
      </div>
      <span class="wc-role" style="background:${isAdmin?'#ffedd5':'#dcfce7'};color:${isAdmin?'#c2410c':'#15803d'}">${isAdmin?'📨 แอดมิน (ดูอย่างเดียว)':'🧪 เจ้าหน้าที่ทดสอบ'}</span>
    </div>
    <div class="wc-banner">${banner}</div>
    <div class="wc-grid" id="wc-grid">${WC_DOW.map((d,i)=>`<div class="wc-dow${i>=5?' we':''}">${d}</div>`).join('')}${cells}</div>
    <div class="wc-legend">
      <span><i style="background:#0d9488"></i>IP ปกติ</span>
      <span><i style="background:#2563eb"></i>IK ปกติ</span>
      <span><i style="background:#dc2626"></i>IP ด่วน</span>
      <span><i style="background:#ea580c"></i>IK ด่วน</span>
      <span><i style="background:#fef2f2;border:1px solid #fecaca"></i>เสาร์–อาทิตย์ / วันหยุดราชการ (แดง)</span>
      <span><i style="background:#fffbeb;border:1px solid #fde68a"></i>วัน OT (เข้ามาทำงาน)</span>
      <span style="width:100%;height:0"></span>
      <span style="color:#94a3b8">วันไม่ทดสอบ:</span>
      ${WC_DAYMODES.map(x=>`<span><i style="background:${x.color}"></i>${x.icon} ${x.label}</span>`).join('')}
    </div>`;
}

// เปิด/ปิดโซนงานด่วนของวันนั้น (เฉพาะการแสดงช่องว่าง — ถ้ามีงานด่วนอยู่แล้วจะแสดงเสมอ)
function wcToggleUrgent(iso, kind){
  const key=`${iso}_${kind}`;
  if(wcState.urgentOpen.has(key)) wcState.urgentOpen.delete(key);
  else wcState.urgentOpen.add(key);
  drawWorkCalendar();
}

// พิมพ์เลขงานลงสล็อตสดๆ (เจ้าหน้าที่)
function wcSlotInput(btn, iso, kind, urgent){
  const cell=btn.parentElement;
  btn.outerHTML=`<input class="wc-inp" placeholder="เลขงาน" data-iso="${iso}" data-kind="${kind}" data-urg="${urgent}"
    onkeydown="wcInpKey(event,this)" onblur="wcInpBlur(this)">`;
  const inp=cell.querySelector('.wc-inp'); if(inp) inp.focus();
}
function wcInpKey(ev,inp){
  if(ev.key==='Enter'){ ev.preventDefault(); wcAdd(inp); }
  else if(ev.key==='Escape'){ inp._cancel=true; drawWorkCalendar(); }
}
function wcInpBlur(inp){ if(!inp._done && !inp._cancel && (inp.value||'').trim()) wcAdd(inp); else drawWorkCalendar(); }
async function wcAdd(inp){
  const jobno=(inp.value||'').trim(); if(!jobno){ drawWorkCalendar(); return; }
  inp._done=true;
  const body={date:inp.dataset.iso, kind:inp.dataset.kind, urgent:inp.dataset.urg==='true', jobno};
  try{
    const r=await fetch('/api/workcal/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
    if(!r.ok) alert(r.error||'เพิ่มไม่สำเร็จ');
  }catch(e){ alert('เชื่อมต่อไม่ได้'); }
  wcLoad();
}
async function wcDelete(id){
  if(!confirm('ลบงานนี้ออกจากปฏิทิน?')) return;
  try{ await fetch('/api/workcal/'+id,{method:'DELETE'}); }catch(e){}
  wcLoad();
}
window.renderWorkCalendar = renderWorkCalendar;
