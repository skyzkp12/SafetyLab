/* ============ กำหนดการ (คลาวด์) — logic หลัก ============ */
const STATE = { data:null, dirty:new Set(), view:'calendar', calMonth:null, planDate:null, statusKind:'ip' };
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };

/* ---------- boot ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  document.title = CFG.APP_TITLE || 'กำหนดการ';
  $('#loginBtn').onclick = doLogin;
  $('#tokenInput').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  $('#logoutBtn').onclick = () => { API.token=''; location.reload(); };
  $('#reloadBtn').onclick = () => loadAll(true);
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));

  if (CFG.API_URL.startsWith('PASTE')) { showLogin('ยังไม่ได้ตั้งค่า API_URL ใน config.js'); return; }
  if (API.token && await API.checkAuth()) { enterApp(); }
  else showLogin('');
});

function showLogin(msg){ $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#loginErr').textContent=msg||''; }
async function doLogin(){
  const t = $('#tokenInput').value.trim();
  if(!t){ $('#loginErr').textContent='ใส่รหัสก่อน'; return; }
  API.token = t;
  $('#loginBtn').textContent='กำลังตรวจ...';
  if(await API.checkAuth()) enterApp();
  else { API.token=''; $('#loginErr').textContent='รหัสไม่ถูกต้อง'; $('#loginBtn').textContent='เข้าใช้งาน'; }
}
function enterApp(){ $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); loadAll(); }

/* ---------- data ---------- */
async function loadAll(force){
  setSync('กำลังโหลด...','saving');
  try{
    STATE.data = await API.loadAll();
    STATE.dirty.clear();
    setSync('โหลดแล้ว','saved');
    render();
  }catch(e){ setSync('โหลดล้มเหลว','dirty'); toast('โหลดข้อมูลไม่ได้: '+e.message,'bad'); }
}
function markDirty(tab){ STATE.dirty.add(tab); setSync('มีการแก้ไข — ยังไม่บันทึก','dirty'); }
async function saveDirty(){
  if(!STATE.dirty.size){ toast('ไม่มีอะไรต้องบันทึก'); return; }
  setSync('กำลังบันทึก...','saving');
  try{
    for(const tab of Array.from(STATE.dirty)){
      await API.saveTab(tab, STATE.data[tab]||[]);
      STATE.dirty.delete(tab);
    }
    setSync('บันทึกแล้ว','saved'); toast('บันทึกขึ้น Google Sheet แล้ว','ok');
  }catch(e){ setSync('บันทึกล้มเหลว','dirty'); toast('บันทึกไม่ได้: '+e.message,'bad'); }
}
function setSync(txt,cls){ const s=$('#syncState'); s.textContent=txt; s.className='sync '+(cls||''); }
function toast(msg,kind){ const t=$('#toast'); t.textContent=msg; t.className='toast '+(kind||''); setTimeout(()=>t.classList.add('hidden'),2600); }

/* ---------- view switch ---------- */
function switchView(v){ STATE.view=v; document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===v)); render(); }
function render(){ if(!STATE.data) return;
  if(STATE.view==='calendar') renderCalendar();
  else if(STATE.view==='plan') renderPlan();
  else renderStatus();
}

/* ================= ปฏิทินงาน (Work Calendar) ================= */
const TH_MONTH=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DOW=['อา','จ','อ','พ','พฤ','ศ','ส'];
const NOTEST=[{v:'',t:'— ทดสอบปกติ'},{v:'maintenance',t:'🔧 บำรุงรักษา'},{v:'document',t:'📄 เอกสาร'},{v:'intermediate',t:'🔁 Intermediate'},{v:'lighting',t:'💡 Lighting'}];
const iso = d => d.toISOString().slice(0,10);

function renderCalendar(){
  const c=$('#content'); c.innerHTML='';
  if(!STATE.calMonth){ const n=new Date(); STATE.calMonth=new Date(n.getFullYear(),n.getMonth(),1); }
  const m=STATE.calMonth;
  const head=el('div','cal-head');
  const prev=el('button','icon-btn','‹'); prev.onclick=()=>{STATE.calMonth=new Date(m.getFullYear(),m.getMonth()-1,1);renderCalendar();};
  const next=el('button','icon-btn','›'); next.onclick=()=>{STATE.calMonth=new Date(m.getFullYear(),m.getMonth()+1,1);renderCalendar();};
  const title=el('div','section-title',`${TH_MONTH[m.getMonth()]} ${m.getFullYear()+543}`);
  const save=el('button','btn primary','💾 บันทึก'); save.onclick=saveDirty;
  head.append(prev,title,next,el('div','spacer'),save);
  c.append(head);

  const grid=el('div','cal-grid');
  DOW.forEach(d=>grid.append(el('div','cal-dow',d)));
  const jobsBy=groupBy(STATE.data.WorkCalendar_Jobs,'date');
  const daysBy={}; (STATE.data.WorkCalendar_Days||[]).forEach(d=>daysBy[d.date]=d);
  const holBy={}; (STATE.data.Holidays||[]).forEach(h=>holBy[h.date]=h.name);
  const today=iso(new Date());
  const first=new Date(m.getFullYear(),m.getMonth(),1);
  const start=new Date(first); start.setDate(1-first.getDay());
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const key=iso(d); const inMonth=d.getMonth()===m.getMonth();
    const cell=el('div','cal-cell'+(inMonth?'':' other'));
    if(key===today) cell.classList.add('today');
    const notest=daysBy[key];
    if(holBy[key]) cell.classList.add('holiday');
    else if(notest && notest.status) cell.classList.add('notest');
    const dl=el('div','cal-date',String(d.getDate()));
    if(holBy[key]) dl.append(el('span','hname',holBy[key]));
    cell.append(dl);
    if(notest && notest.status){ const lbl=(NOTEST.find(n=>n.v===notest.status)||{}).t||notest.status; cell.append(el('div','notest-tag',lbl)); }
    (jobsBy[key]||[]).forEach(j=>{
      const jb=el('div','cal-job'+(j.kind==='IK'?' ik':'')+(j.urgent==='TRUE'?' urgent':''),
        (j.urgent==='TRUE'?'⚡':'')+(j.jobno||'(ไม่มีเลข)'));
      cell.append(jb);
    });
    cell.onclick=()=>openDayModal(key);
    grid.append(cell);
  }
  c.append(grid);
}

function openDayModal(date){
  const jobsBy=groupBy(STATE.data.WorkCalendar_Jobs,'date');
  const list=(jobsBy[date]||[]).slice();
  const dayRow=(STATE.data.WorkCalendar_Days||[]).find(d=>d.date===date)||{date,status:'',note:'',by:''};
  const bg=el('div','modal-bg'); const mo=el('div','modal');
  mo.append(el('h3',null,'📆 '+date));

  // no-test status
  const f1=el('div','field'); f1.append(el('label',null,'ประเภทวัน (ไม่ทดสอบ)'));
  const sel=el('select'); NOTEST.forEach(n=>{const o=el('option',null,n.t);o.value=n.v;if(n.v===dayRow.status)o.selected=true;sel.append(o);}); f1.append(sel);
  mo.append(f1);

  mo.append(el('div','section-title','งานในวันนี้'));
  const jobsBox=el('div'); mo.append(jobsBox);
  function drawJobs(){
    jobsBox.innerHTML='';
    list.forEach((j,idx)=>{
      const r=el('div','row'); r.style.marginBottom='6px';
      const no=el('input'); no.type='text'; no.placeholder='เลขงาน'; no.value=j.jobno||''; no.style.flex='1';
      no.oninput=()=>j.jobno=no.value;
      const kind=el('select'); ['IP','IK'].forEach(k=>{const o=el('option',null,k);o.value=k;if((j.kind||'IP')===k)o.selected=true;kind.append(o);}); kind.onchange=()=>j.kind=kind.value;
      const urg=el('button','btn'+(j.urgent==='TRUE'?' danger':''), j.urgent==='TRUE'?'⚡ด่วน':'ปกติ');
      urg.onclick=()=>{j.urgent=j.urgent==='TRUE'?'FALSE':'TRUE';drawJobs();};
      const del=el('button','btn danger','✕'); del.onclick=()=>{list.splice(idx,1);drawJobs();};
      r.append(no,kind,urg,del); jobsBox.append(r);
    });
  }
  drawJobs();
  const add=el('button','btn','+ เพิ่มงาน'); add.onclick=()=>{list.push({date,id:rid(),jobno:'',company:'',kind:'IP',urgent:'FALSE',note:'',status_next:''});drawJobs();};
  mo.append(add);

  const foot=el('div','row'); foot.style.marginTop='16px';
  const cancel=el('button','btn','ยกเลิก'); cancel.onclick=()=>bg.remove();
  const ok=el('button','btn primary','ตกลง'); ok.style.marginLeft='auto';
  ok.onclick=()=>{
    // jobs: replace all rows for this date
    STATE.data.WorkCalendar_Jobs = STATE.data.WorkCalendar_Jobs.filter(j=>j.date!==date)
      .concat(list.map(j=>({date,id:j.id||rid(),jobno:j.jobno||'',company:j.company||'',kind:j.kind||'IP',urgent:j.urgent||'FALSE',note:j.note||'',status_next:j.status_next||''})));
    markDirty('WorkCalendar_Jobs');
    // day status
    const days=STATE.data.WorkCalendar_Days; const ex=days.find(d=>d.date===date);
    if(sel.value){ if(ex){ex.status=sel.value;} else days.push({date,status:sel.value,note:'',by:'cloud'}); markDirty('WorkCalendar_Days'); }
    else if(ex){ STATE.data.WorkCalendar_Days=days.filter(d=>d.date!==date); markDirty('WorkCalendar_Days'); }
    bg.remove(); renderCalendar();
  };
  foot.append(cancel,ok); mo.append(foot);
  bg.append(mo); bg.onclick=e=>{if(e.target===bg)bg.remove();}; document.body.append(bg);
}

/* ================= แผนงาน (Work Plan) ================= */
function planTimes(){ const out=[]; for(let h=8;h<=17;h++){ for(const mm of ['00','30']){ if(h===17&&mm==='30')break; out.push(String(h).padStart(2,'0')+':'+mm);} } return out; }
const PLAN_TYPES=['','P1','P2','P3','P4','P5','P6','พัก','ประชุม'];

function renderPlan(){
  const c=$('#content'); c.innerHTML='';
  if(!STATE.planDate) STATE.planDate=iso(new Date());
  const head=el('div','cal-head');
  const dp=el('input'); dp.type='date'; dp.value=STATE.planDate; dp.onchange=()=>{STATE.planDate=dp.value;renderPlan();};
  const prev=el('button','icon-btn','‹'); prev.onclick=()=>shiftPlan(-1);
  const next=el('button','icon-btn','›'); next.onclick=()=>shiftPlan(1);
  const save=el('button','btn primary','💾 บันทึก'); save.onclick=saveDirty;
  head.append(prev,dp,next,el('div','spacer'),save);
  c.append(head);

  const byTime={}; (STATE.data.WorkPlan||[]).filter(p=>p.date===STATE.planDate).forEach(p=>byTime[p.time]=p);
  const grid=el('div','plan-grid');
  const hdr=el('div','plan-row');
  hdr.append(el('div','plan-time muted','เวลา'),el('div','muted','งาน'),el('div','muted s2','ช่อง 2'),el('div','muted','ประเภท'));
  grid.append(hdr);
  planTimes().forEach(t=>{
    const p=byTime[t]||{date:STATE.planDate,time:t,type:'',status:'',span:'1',s1_title:'',s1_detail:'',s2_title:'',s2_detail:''};
    const row=el('div','plan-row');
    row.append(el('div','plan-time',t));
    row.append(slotCell(p,'s1_title'));
    const s2=slotCell(p,'s2_title'); s2.classList.add('s2'); row.append(s2);
    const ty=el('select'); PLAN_TYPES.forEach(x=>{const o=el('option',null,x||'—');o.value=x;if((p.type||'')===x)o.selected=true;ty.append(o);});
    ty.onchange=()=>{p.type=ty.value;upsertPlan(p);};
    row.append(ty);
    grid.append(row);
  });
  c.append(grid);
}
function slotCell(p,field){
  const d=el('div','plan-slot'); const i=el('input'); i.type='text'; i.value=p[field]||''; i.placeholder='—';
  i.oninput=()=>{p[field]=i.value;upsertPlan(p);}; d.append(i); return d;
}
function upsertPlan(p){
  const arr=STATE.data.WorkPlan; const idx=arr.findIndex(x=>x.date===p.date&&x.time===p.time);
  const empty=!p.s1_title&&!p.s2_title&&!p.type&&!p.status;
  if(empty){ if(idx>=0) arr.splice(idx,1); }
  else { if(idx>=0) arr[idx]=p; else arr.push(p); }
  markDirty('WorkPlan');
}
function shiftPlan(n){ const d=new Date(STATE.planDate); d.setDate(d.getDate()+n); STATE.planDate=iso(d); renderPlan(); }

/* ================= สถานะงาน (Work Status) ================= */
const COLS_IP=[
  {k:'job_no',t:'เลขงาน',w:110},{k:'company',t:'บริษัท',co:1},{k:'test_code',t:'รหัส'},
  {k:'tester',t:'ผู้ทดสอบ'},{k:'date_received',t:'รับ',date:1},{k:'date_planned',t:'นัด',date:1},
  {k:'st_photo_before',t:'ถ่ายก่อน',chk:1},{k:'st_probe',t:'Probe',chk:1},{k:'st_dust',t:'ฝุ่น',chk:1},
  {k:'st_water',t:'น้ำ',chk:1},{k:'st_hipot',t:'Hipot',chk:1},{k:'st_photo_after',t:'ถ่ายหลัง',chk:1},
  {k:'st_testresult',t:'ผล',chk:1},{k:'st_testreport',t:'รายงาน',chk:1},{k:'st_sent_admin',t:'ส่งแอดมิน',chk:1},
  {k:'result',t:'สรุป'},
];
const COLS_IK=[
  {k:'job_no',t:'เลขงาน',w:110},{k:'company',t:'บริษัท',co:1},{k:'test_code',t:'รหัส'},
  {k:'tester',t:'ผู้ทดสอบ'},{k:'date_received',t:'รับ',date:1},{k:'date_planned',t:'นัด',date:1},
  {k:'st_photo_before',t:'ถ่ายก่อน',chk:1},{k:'st_test',t:'ทดสอบ',chk:1},
  {k:'st_testresult',t:'ผล',chk:1},{k:'st_testreport',t:'รายงาน',chk:1},{k:'st_sent_admin',t:'ส่งแอดมิน',chk:1},
  {k:'result',t:'สรุป'},
];
function renderStatus(){
  const c=$('#content'); c.innerHTML='';
  const head=el('div','cal-head');
  const ipBtn=el('button','btn'+(STATE.statusKind==='ip'?' primary':''),'IP ('+STATE.data.WorkStatus_IP.length+')');
  const ikBtn=el('button','btn'+(STATE.statusKind==='ik'?' primary':''),'IK ('+STATE.data.WorkStatus_IK.length+')');
  ipBtn.onclick=()=>{STATE.statusKind='ip';renderStatus();};
  ikBtn.onclick=()=>{STATE.statusKind='ik';renderStatus();};
  const add=el('button','btn','+ เพิ่มงาน'); add.onclick=addStatusRow;
  const save=el('button','btn primary','💾 บันทึก'); save.onclick=saveDirty;
  head.append(ipBtn,ikBtn,el('div','spacer'),add,save);
  c.append(head);

  const kind=STATE.statusKind; const tab='WorkStatus_'+kind.toUpperCase();
  const cols=kind==='ip'?COLS_IP:COLS_IK;
  const rows=STATE.data[tab];
  const coColor={}; (STATE.data.WorkStatus_Companies||[]).forEach(x=>coColor[x.name]=x.color);
  // sort: pinned first, then by date_planned
  rows.sort((a,b)=>((b.pinned==='TRUE')-(a.pinned==='TRUE'))||String(a.date_planned).localeCompare(String(b.date_planned)));

  const wrap=el('div','tbl-wrap'); const table=el('table');
  const thead=el('tr'); thead.append(el('th',null,'📌')); cols.forEach(col=>thead.append(el('th',null,col.t))); thead.append(el('th',null,''));
  table.append(thead);
  rows.forEach(r=>{
    const tr=el('tr');
    const pinTd=el('td'); const pin=el('span','pin'+(r.pinned==='TRUE'?' on':''),'📌');
    pin.onclick=()=>{r.pinned=r.pinned==='TRUE'?'FALSE':'TRUE';markDirty(tab);renderStatus();}; pinTd.append(pin); tr.append(pinTd);
    cols.forEach(col=>{
      const td=el('td');
      if(col.chk){ const b=el('span','chk'+(r[col.k]==='1'?' on':''),r[col.k]==='1'?'✓':''); b.onclick=()=>{r[col.k]=r[col.k]==='1'?'':'1';markDirty(tab);b.className='chk'+(r[col.k]==='1'?' on':'');b.textContent=r[col.k]==='1'?'✓':'';}; td.append(b); }
      else { const i=el('input'); i.type=col.date?'date':'text'; i.value=r[col.k]||''; if(col.w)i.style.minWidth=col.w+'px';
        if(col.co && coColor[r[col.k]]){ const dot=el('span','co-dot'); dot.style.background=coColor[r[col.k]]; td.append(dot); }
        i.oninput=()=>{r[col.k]=i.value;markDirty(tab);}; td.append(i); }
      tr.append(td);
    });
    const delTd=el('td'); const del=el('button','btn danger','✕'); del.onclick=()=>{ if(confirm('ลบงาน '+(r.job_no||'')+' ?')){ const a=STATE.data[tab]; a.splice(a.indexOf(r),1); markDirty(tab); renderStatus(); } }; delTd.append(del); tr.append(delTd);
    table.append(tr);
  });
  wrap.append(table); c.append(wrap);
}
function addStatusRow(){
  const kind=STATE.statusKind; const tab='WorkStatus_'+kind.toUpperCase();
  const base={id:rid()+rid(),pinned:'FALSE',notes:'[]',created:new Date().toISOString().slice(0,19),job_no:'',date_received:'',date_planned:'',company:'',test_code:'',tester:'',report_lang:'TH',result:'',job_type:''};
  const checks=(kind==='ip'?COLS_IP:COLS_IK).filter(c=>c.chk).map(c=>c.k);
  checks.forEach(k=>base[k]='');
  if(kind==='ip'){Object.assign(base,{dust_start:'',dust_end:'',water_start:'',water_end:'',hipot_voltage:'',maint_reset:'',st_academic:''});}
  else {Object.assign(base,{test_start:'',test_end:''});}
  STATE.data[tab].unshift(base); markDirty(tab); renderStatus();
}

/* ---------- utils ---------- */
function groupBy(arr,key){ const m={}; (arr||[]).forEach(x=>{(m[x[key]]=m[x[key]]||[]).push(x);}); return m; }
function rid(){ return Math.random().toString(16).slice(2,10); }
