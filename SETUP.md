# ติดตั้ง "กำหนดการคลาวด์" (GitHub Pages + Apps Script + Google Sheet)

สแตกนี้ **ฟรี 100% ไม่มีเซิร์ฟเวอร์ ไม่หลับ ไม่ต้องผูกบัตร** และข้อมูลอยู่ในบัญชี Google ของคุณเอง

```
[GitHub Pages]  ──►  [Apps Script Web App]  ──►  [Google Sheet]
 หน้าเว็บ (web/)       API (appsscript/Code.gs)     ฐานข้อมูล
```

ทำตามลำดับ 4 ส่วน ใช้เวลา ~15 นาที

---

## ส่วนที่ 1 — Google Sheet + Apps Script (ฐานข้อมูล + API)

1. เข้า https://sheets.google.com ด้วย **skyzkp12@gmail.com** → สร้าง Sheet เปล่า ตั้งชื่อ `Schedule DB`
2. เมนู **Extensions → Apps Script**
3. ลบโค้ดตัวอย่างทิ้ง แล้ววางเนื้อหาไฟล์ **`appsscript/Code.gs`** ทั้งหมด
4. แก้บรรทัด `const SHARED_TOKEN = 'CHANGE_ME_...'` → ตั้งรหัสลับของคุณเอง เช่น `elu-2026-xy`
   - **จำรหัสนี้ไว้** ใช้ล็อกอินหน้าเว็บ
5. กด **Save** (ไอคอนแผ่นดิสก์)
6. เลือกฟังก์ชัน `setup` จาก dropdown ด้านบน → กด **Run**
   - ครั้งแรกเด้งขออนุญาต → **Review permissions → เลือกบัญชีตัวเอง → Advanced → Go to … (unsafe) → Allow**
   - รันเสร็จ กลับไปดู Sheet จะมีแท็บครบ 7 อัน (WorkStatus_IP, WorkPlan, ฯลฯ)
7. **Deploy → New deployment**
   - ไอคอนเฟือง ⚙️ → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy** → คัดลอก **Web app URL** (`https://script.google.com/macros/s/AKfy…/exec`)

> ⚠️ ทุกครั้งที่แก้ `Code.gs` ต้อง **Deploy → Manage deployments → ✏️ → Version: New → Deploy**
> ไม่งั้น URL เดิมยังรันโค้ดเก่า

---

## ส่วนที่ 2 — ย้ายข้อมูลเดิมเข้า Sheet (ครั้งเดียว)

บนเครื่องที่เห็นไฟล์ `T:\Dashboard\*.json` (เครื่องออฟฟิศ):

```
cd "C:\Users\Zbook Firefly 14 G8\Desktop\schedule-cloud\tools"
python migrate.py --push "<Web app URL>" "<รหัส SHARED_TOKEN>"
```

- จะพิมพ์ `ผลลัพธ์จาก Web App: {"ok":true,...}` = สำเร็จ
- เปิด Sheet เช็ก แท็บ WorkStatus_IP ควรมี 73 แถว ฯลฯ
- (ไม่อยากยิงตรง: รัน `python migrate.py` เฉยๆ ได้ `seed.json` เอาไป import เองก็ได้)

---

## ส่วนที่ 3 — หน้าเว็บขึ้น GitHub Pages

1. สร้าง repo ใหม่บน GitHub เช่น `schedule-cloud` (public ก็ได้ — โค้ดไม่มีข้อมูลลับ, ข้อมูลจริงอยู่ใน Sheet)
2. แก้ไฟล์ **`web/config.js`** → วาง `API_URL` = Web app URL จากส่วนที่ 1
3. push โฟลเดอร์ `web/` ขึ้น repo (ดูคำสั่งใน README.md)
4. GitHub → repo → **Settings → Pages**
   - Source: **Deploy from a branch** → Branch `main` → **/ (root)** หรือโฟลเดอร์ `/web`
   - Save → รอ ~1 นาที ได้ลิงก์ `https://<user>.github.io/schedule-cloud/`
5. เปิดลิงก์ → ใส่รหัส SHARED_TOKEN → ใช้งานได้เลย

> 💡 ถ้าตั้ง Pages ให้ชี้ราก repo ให้ย้ายไฟล์ใน `web/` ไปไว้รากด้วย
> หรือชี้ Pages ไปโฟลเดอร์ `/web` โดยตรง (ตัวเลือก folder ใน Settings → Pages)

---

## ส่วนที่ 4 — ปักเป็นแอปบนมือถือ

- **iPhone:** เปิดลิงก์ใน Safari → ปุ่มแชร์ → **Add to Home Screen**
- **Android:** Chrome → เมนู ⋮ → **ติดตั้งแอป / เพิ่มไปหน้าจอหลัก**

เข้าได้ทุกที่ ทุกเวลา ไม่ต้องเปิดคอมออฟฟิศ ไม่พึ่งไดรฟ์ NAS

---

## การเชื่อมกับ Dashboard เดิม (ออฟฟิศ)
Sheet คือ "ตัวจริงที่เดียว" — ถ้าจะให้ Dashboard เดิมอ่าน/เขียนที่เดียวกัน
ให้แก้ฝั่ง `app.py` ให้เรียก Web App เดียวกันแทนการอ่าน `*.json`
(ทำทีหลังได้ ตอนนี้ใช้คู่ขนานก่อนก็ได้ แล้ว re-migrate เป็นระยะ)

## แก้ปัญหา
- **หน้าเว็บขึ้น "โหลดข้อมูลไม่ได้"** → ส่วนใหญ่คือ `API_URL` ผิด หรือยังไม่ได้ Deploy เวอร์ชันใหม่
- **ใส่รหัสแล้วเด้ง "รหัสไม่ถูกต้อง"** → SHARED_TOKEN ใน Code.gs ไม่ตรงกับที่พิมพ์ (ระวังช่องว่าง)
- **CORS error ใน console** → ตรวจว่า Deploy ตั้ง Who has access = **Anyone** (ไม่ใช่ Anyone with Google account)
