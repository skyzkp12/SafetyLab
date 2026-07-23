# -*- coding: utf-8 -*-
"""
ย้ายข้อมูลกำหนดการเดิม (ไฟล์ JSON ใน T:\\Dashboard) -> รูปแบบแท็บของ Google Sheet
- โหมดปกติ  : สร้าง seed.json (ดูได้ / import เองได้)
- โหมด --push: ยิงเข้า Web App โดยตรง (saveAll)  ต้องมี API_URL + TOKEN

ใช้:
  python migrate.py                      # สร้าง seed.json
  python migrate.py --push URL TOKEN     # ย้ายเข้า Sheet เลย
"""
import json, os, sys, io
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
except Exception:
    pass

SRC = r"T:\Dashboard"   # โฟลเดอร์ที่มีไฟล์ JSON เดิม

def load(name):
    p = os.path.join(SRC, name)
    with open(p, encoding="utf-8") as f:
        return json.load(f)

def build():
    tabs = {}

    # ---- Work Status (IP / IK / companies) ----
    ws = load("workstatus_jobs.json")
    def flat_jobs(lst):
        out = []
        for j in lst:
            r = dict(j)
            r["pinned"] = "TRUE" if j.get("pinned") else "FALSE"
            r["notes"]  = json.dumps(j.get("notes", []), ensure_ascii=False)
            out.append(r)
        return out
    tabs["WorkStatus_IP"] = flat_jobs(ws.get("ip", []))
    tabs["WorkStatus_IK"] = flat_jobs(ws.get("ik", []))
    tabs["WorkStatus_Companies"] = [
        {"name": k, "color": v} for k, v in ws.get("companies", {}).items()
    ]

    # ---- Work Calendar (jobs ต่อวัน + วันไม่ทดสอบ) ----
    wc = load("workcal_jobs.json")
    jobs_rows = []
    for date, lst in wc.get("jobs", {}).items():
        for j in lst:
            jobs_rows.append({
                "date": date,
                "id": j.get("id", ""),
                "jobno": j.get("jobno", ""),
                "company": j.get("company", ""),
                "kind": j.get("kind", ""),
                "urgent": "TRUE" if j.get("urgent") else "FALSE",
                "note": j.get("note", ""),
                "status_next": j.get("status_next", ""),
            })
    tabs["WorkCalendar_Jobs"] = jobs_rows
    day_rows = []
    for date, d in wc.get("days", {}).items():
        day_rows.append({
            "date": date,
            "status": d.get("status", ""),
            "note": d.get("note", ""),
            "by": d.get("by", ""),
        })
    tabs["WorkCalendar_Days"] = day_rows

    # ---- Holidays ----
    hol = load("workcal_holidays.json")
    tabs["Holidays"] = [{"date": k, "name": v} for k, v in hol.items()]

    # ---- Work Plan (slot ต่อเวลา) ----
    wp = load("workplan_data.json")
    plan_rows = []
    for date, d in wp.get("days", {}).items():
        slots = d.get("slots", {})
        for time, s in slots.items():
            s1 = s.get("s1", {}) or {}
            s2 = s.get("s2", {}) or {}
            plan_rows.append({
                "date": date,
                "time": time,
                "type": s.get("type", ""),
                "status": s.get("status", ""),
                "span": str(s.get("span", 1)),
                "s1_title": s1.get("title", ""),
                "s1_detail": s1.get("detail", ""),
                "s2_title": s2.get("title", ""),
                "s2_detail": s2.get("detail", ""),
            })
    tabs["WorkPlan"] = plan_rows
    return tabs

def main():
    tabs = build()
    counts = {k: len(v) for k, v in tabs.items()}
    print("นับแถวที่ย้าย:", json.dumps(counts, ensure_ascii=False))

    if len(sys.argv) >= 4 and sys.argv[1] == "--push":
        import urllib.request
        url, token = sys.argv[2], sys.argv[3]
        payload = json.dumps({"token": token, "action": "saveAll", "data": tabs},
                             ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=payload,
              headers={"Content-Type": "text/plain;charset=utf-8"})
        with urllib.request.urlopen(req) as resp:
            print("ผลลัพธ์จาก Web App:", resp.read().decode("utf-8"))
    else:
        out = os.path.join(os.path.dirname(__file__), "seed.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(tabs, f, ensure_ascii=False, indent=1)
        print("เขียน seed.json แล้วที่:", out)
        print("จะย้ายเข้า Sheet เลย ให้รัน:  python migrate.py --push <API_URL> <TOKEN>")

if __name__ == "__main__":
    main()
