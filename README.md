# กำหนดการคลาวด์ (Schedule Cloud)

แยกเมนูกลุ่ม **"กำหนดการ"** จาก E-Safety Lab Dashboard ขึ้นคลาวด์แบบเบาๆ
ใช้ได้ทุกที่ ไม่พึ่งคอมออฟฟิศ ไม่พึ่งไดรฟ์ NAS (ที่ชอบหลุด)

**สแตก:** GitHub Pages (หน้าเว็บ) + Google Apps Script (API) + Google Sheet (ฐานข้อมูล) — ฟรีทั้งหมด

## เมนูที่ย้ายมา
- 📆 **ปฏิทินงาน** (Work Calendar) — งานต่อวัน + วันไม่ทดสอบ + วันหยุด
- 🗓️ **แผนงาน** (Work Plan) — ช่องเวลา 30 นาที
- 📋 **สถานะงาน** (Work Status) — ตาราง IP/IK + สถานะแต่ละขั้น

## โครงสร้าง
```
appsscript/Code.gs   API + สร้างแท็บ (วางใน Apps Script ของ Sheet)
web/                 หน้าเว็บ static (ขึ้น GitHub Pages)
  index.html style.css app.js api.js config.js manifest.webmanifest
tools/migrate.py     ย้ายข้อมูล JSON เดิม -> Sheet
SETUP.md             คู่มือติดตั้งทีละขั้น  <-- เริ่มที่นี่
```

## เริ่มใช้
อ่าน **[SETUP.md](SETUP.md)** ทำตาม 4 ส่วน (~15 นาที)

## push ขึ้น GitHub
```
git add -A
git commit -m "schedule cloud app"
git branch -M main
git remote add origin https://github.com/<user>/schedule-cloud.git
git push -u origin main
```
แล้วตั้ง Settings → Pages → Branch main → root (หรือโฟลเดอร์ /web)
