# SC Barcodezy V2.4.2 — Backend connection repair

## วิธีเปิดบน Mac (แนะนำ)
1. แตก ZIP ให้ครบทั้งโฟลเดอร์ก่อน (อย่าเปิด HTML จาก ZIP โดยตรง)
2. ต้องมี Python 3.11 หรือ 3.12 แบบ 64-bit จาก https://www.python.org/downloads/ และพื้นที่ว่างหลาย GB สำหรับ dependencies และ model cache
3. เปิด `START_BARCODEZY_MAC.command` จาก Finder; ถ้าไฟล์ไม่ executable ให้เปิด Terminal ในโฟลเดอร์แล้วรัน `bash START_BARCODEZY_MAC.command` (ไม่ต้องใช้ sudo)
4. Launcher สร้าง `.venv` ติดตั้ง dependencies ครั้งแรก ตรวจ import ของ AI และถามว่าจะอนุญาตดาวน์โหลด Model Weights หรือไม่ ตอบ `y` หากต้องการใช้งานครั้งแรกและยังไม่มีโมเดล
5. เปิด Browser อัตโนมัติหลัง health check ผ่าน: http://127.0.0.1:8766/carton.html . เปิด Terminal ค้างไว้ระหว่างใช้งาน; Ctrl+C เพื่อหยุด
6. Product Trace > เลือกภาพ > Open Deep Analysis > ตรวจสอบ Service > เริ่ม Deep Analysis

Windows: เปิด `START_BARCODEZY_WINDOWS.bat` หลังติดตั้ง Python 3.11/3.12 64-bit. ขั้นตอนอื่นเหมือน Mac. Launcher ยังไม่ได้ทดสอบการติดตั้งจริงบน macOS/Windows หรือการดาวน์โหลดโมเดลครั้งแรก; ต้องมี internet และ PyTorch wheel ที่รองรับเครื่อง. ค่าเริ่มต้น CPU; อาจช้ามาก. OCR เป็นทางเลือก ติดตั้ง Tesseract แยกหากต้องใช้.

## สถานะที่แยกออกจากกัน
- Service: ต้องตอบ JSON จาก `/api/deep/health` ไม่ใช่หน้า HTML
- AI dependencies: ตรวจการมี package จาก API; Launcher ตรวจ import เพิ่ม แต่ไม่ได้รับรองทุก inference
- Model / inference: not_loaded, loading, load_failed, loaded, inference_completed, inference_failed. `not_loaded` ไม่ได้หมายความว่า weights หาย; ตรวจจริงเมื่อเริ่มงาน. `inference_completed` ไม่ใช่การรับรองความสวยหรือความถูกต้องของชิ้นส่วน
- ข้อผิดพลาด 401/403/404/timeout/network จะแยกตาม HTTP status ที่ browser เข้าถึงได้; browser ไม่สามารถระบุสาเหตุ CORS/TLS/network แยกจากกันได้ในทุกกรณี
- ไม่มี mock/fallback ไปเป็น Standard Tracing เมื่อ AI ทำงานไม่ได้

## Remote HTTPS / Vercel (ต้องมี backend จริงก่อน)
Vercel static ไม่รัน AI Python service นี้โดยอัตโนมัติ. สามารถใช้ Frontend Vercel ร่วมกับ backend ส่วนตัวที่ติดตั้งแล้วได้. เปิดตั้งค่าการเชื่อมต่อ Backend > Remote HTTPS API > กรอก HTTPS origin เช่น `https://ai.example.com` และ token > บันทึกและตรวจสอบ. URL เท่านั้นที่บันทึกใน localStorage; token อยู่ในหน่วยความจำของหน้าและต้องกรอกใหม่เมื่อ refresh. ใช้ backend ที่เชื่อถือได้เท่านั้น เพราะจะได้รับภาพเมื่อกดเริ่ม. ไม่เชื่อม localhost ผ่าน HTTPS cross-origin; ใช้ Local launcher เปิดหน้า same-origin แทน.

### ตัวอย่าง config สำหรับผู้ดูแล server ส่วนตัว (placeholder ไม่ใช่ URL ที่ใช้งานได้จริง)
ติดตั้ง requirements-grounded.txt บนเครื่อง AI worker แล้วตั้ง env:
```
SC_ALLOWED_ORIGINS=https://your-barcodezy.vercel.app
SC_ALLOWED_HOSTS=ai.example.com
SC_API_TOKEN=<random-secret-at-least-32-characters>
SC_DEVICE=cpu
SC_ALLOW_DOWNLOAD=1
```
สร้าง secret เช่น `python -c 'import secrets; print(secrets.token_urlsafe(48))'` และเก็บไว้ใน secret manager ของ server ไม่ใส่ใน HTML/JS/Git. ค่า `SC_ALLOWED_ORIGINS` และ `SC_ALLOWED_HOSTS` รับหลายค่าคั่นด้วย comma, ห้าม wildcard. คำสั่ง `python barcodezy_service.py` เปิด loopback เท่านั้น; remote ให้ผู้ดูแลวาง reverse proxy HTTPS บน host เดียวกันที่ส่ง Host ที่อนุญาตและส่งต่อ `/api/deep/*` ไป 127.0.0.1:8766. จำกัดการเข้าถึงด้วย firewall/VPN ตามเหมาะสม. หากใช้ container ให้กำหนด network/bind อย่างระมัดระวังและอย่าเปิด port Python สู่ Internet โดยตรง.

ทุก API request รวมทั้ง health และผลลัพธ์ต้องมี Bearer token เมื่อเปิด remote config. CORS อนุญาตเฉพาะ origin ที่ระบุ, POST ต้องมี X-SC-Deep. ระบบนี้เป็น single-user research service, jobs อยู่ใน memory; ไม่ใช่ multi-tenant production backend. ยังไม่มี user-level authorization, durable queue, rate limiting หรือ hosted E2E; ไม่ควรเปิดเป็นบริการสาธารณะ. V2.4.2 ไม่ได้สร้าง cloud server หรือ deploy ให้.

## Manual startup (ถ้า Launcher ใช้ไม่ได้)
```
cd deep-analysis
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-grounded.txt
SC_ALLOW_DOWNLOAD=1 python barcodezy_service.py
```
Windows ให้ใช้ PowerShell และ `.\.venv\Scripts\Activate.ps1`, `$env:SC_ALLOW_DOWNLOAD='1'` แทน. เปิด URL local ข้างต้น ไม่ใช่ไฟล์ HTML.

## ขอบเขตการแก้ไข
ยังคง V0.6 geometry/semantic engine, Standard/Guided Tracing และ Quality Gate เดิม. ไม่มีการเปลี่ยนโมเดลหรือรับประกันผล outline. ดู DEEP_ANALYSIS_V2.4.1.md สำหรับข้อจำกัดด้าน vector และ production export เดิม.
