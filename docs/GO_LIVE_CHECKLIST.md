# รายการตรวจสอบก่อนเปิดใช้งานจริง (Go Live Checklist) — ระบบ Line Connect (ไทวัสดุ และ BnB Home)

เอกสารนี้ใช้สำหรับตรวจเช็กความพร้อมขั้นสุดท้ายร่วมกันระหว่าง **IT-Division**, **CISO (Security)**, **Marketing** และ **Customer Service** ก่อนเปิดให้บริการระบบ Line Connect บน Production

---

## 1. ความปลอดภัยและข้อกำหนดกฎหมาย (Security & PDPA Sign-off)
- [ ] **ผลทดสอบ Penetration Test (Pentest) โดยทีม CISO / ผู้เชี่ยวชาญภายนอก**: ไม่พบช่องโหว่ระดับ **Critical** หรือ **High** ค้างอยู่ในระบบ
- [ ] **การตั้งค่าคีย์เข้ารหัสบน Production Secret Manager**:
  - [ ] ตั้งค่า `PII_ENCRYPTION_KEY` (64 hex chars สำหรับ AES-256-GCM) และ `PII_BLIND_INDEX_SECRET` ชุดจริงของ Production
  - [ ] ตั้งค่า `JWT_SECRET` และ `TWD_SPENDING_HMAC_SECRET` ชุดจริงของ Production
  - [ ] ตั้งค่า `LINE_VERIFY_MOCK=false`, `THE1_MOCK=false`, `TWD_SPENDING_API_USE_MOCK=false`, `SFTP_USE_MOCK=false`, `ADMIN_SSO_USE_MOCK=false`
- [ ] **การจำกัดสิทธิ์เข้าถึง (CORS & Firewall)**:
  - [ ] ตั้งค่า `CORS_ALLOWED_ORIGINS` เฉพาะโดเมนจริงของ LINE LIFF (`https://liff.line.me`) และโดเมนจริงของ Admin Backoffice
  - [ ] ตั้งค่า `TWD_SPENDING_ALLOWED_IPS` เฉพาะ IP ของระบบไทวัสดุ Production
- [ ] **นโยบายเก็บรักษาข้อมูลส่วนบุคคล (PDPA Retention Policy)**:
  - [ ] ยืนยันค่า `PDPA_RETENTION_DAYS` กับฝ่ายกฎหมาย และเปิดรัน Job `PdpaRetentionService.runRetentionCleanup`

---

## 2. การตรวจรับงานของผู้ใช้งาน (UAT Sign-off)
- [ ] ทดสอบครบทุกหัวข้อในเอกสาร [UAT_TEST_CASES.md](file:///c:/atgv/Line_connect/docs/UAT_TEST_CASES.md) บนสภาพแวดล้อม `staging` ผ่านเกณฑ์ 100%
- [ ] ทดสอบประสิทธิภาพด้วย k6 ([k6-auth-and-home.js](file:///c:/atgv/Line_connect/tests/load/k6-auth-and-home.js)) ที่จำนวนผู้ใช้พร้อมกันตามที่ทีม Marketing คาดการณ์ โดยได้ค่า **Latency p95 < 500 ms** และ **Error Rate < 1%**
- [ ] ได้รับลายเซ็นอนุมัติ UAT Sign-off ครบทั้ง 4 ฝ่าย (Marketing, Customer Service, CISO, IT-Division)

---

## 3. การตั้งค่า LINE Official Account, Rich Menu และ Production LIFF URL
- [ ] **LINE OA ไทวัสดุ (TWD)**:
  - [ ] สร้าง LIFF App บน LINE Developers Console ของไทวัสดุ และชี้ Endpoint URL ไปที่ `https://<prod-liff-domain>/?brand=TWD`
  - [ ] ผูกปุ่มบน Rich Menu ของ LINE OA ไทวัสดุ เข้ากับ LIFF URL `https://liff.line.me/<TWD_LIFF_ID>?brand=TWD`
  - [ ] นำค่า Channel ID ไปตั้งใน `LINE_LIFF_CHANNEL_ID_TWD`
- [ ] **LINE OA BnB Home (BNB)**:
  - [ ] สร้าง LIFF App บน LINE Developers Console ของ BnB Home และชี้ Endpoint URL ไปที่ `https://<prod-liff-domain>/?brand=BNB`
  - [ ] ผูกปุ่มบน Rich Menu ของ LINE OA BnB Home เข้ากับ LIFF URL `https://liff.line.me/<BNB_LIFF_ID>?brand=BNB`
  - [ ] นำค่า Channel ID ไปตั้งใน `LINE_LIFF_CHANNEL_ID_BNB`

---

## 4. ระบบเฝ้าระวังและการสำรองข้อมูล (Monitoring, Alerting & Backup)
- [ ] เปิดใช้งาน Prometheus Scrape ที่ `/metrics` และตั้งค่า Alert Rules จาก [prometheus-alerts.yaml](file:///c:/atgv/Line_connect/deploy/monitoring/prometheus-alerts.yaml) (แจ้งเตือนเมื่อ `Error Rate > 1%`, `Uptime < 99.5%`, หรือคิว Earn Point ค้าง)
- [ ] ทดสอบซ้อมคำสั่ง Rollback (`npm run deploy:rollback`) และขั้นตอนตาม [RUNBOOK.md](file:///c:/atgv/Line_connect/docs/RUNBOOK.md)
- [ ] เปิดใช้งาน Automated Daily Backup และ Point-in-Time Recovery (PITR) บนฐานข้อมูล PostgreSQL Production

---

## 5. แผนการเปิดใช้งานแบบค่อยเป็นค่อยไป (Pilot Rollout Plan ก่อนเปิดทั้งหมด)

| ระยะ (Phase) | กลุ่มเป้าหมาย (Target Audience) | ระยะเวลา | เกณฑ์ผ่านเพื่อไประยะถัดไป (Exit Criteria) |
| :--- | :--- | :---: | :--- |
| **Phase 1: Internal Pilot (Friends & Family)** | พนักงาน IT-Division และทีม Marketing (ประมาณ 100–200 คน) ผ่าน Rich Menu พิเศษสำหรับกลุ่ม Pilot | วันที่ 1–3 | - ลงทะเบียนและรับคูปองต้อนรับ 20% สำเร็จ 100%<br>- Error Rate < 0.5%, Latency p95 < 500 ms |
| **Phase 2: Selected Store Pilot** | ลูกค้าจริงที่สาขานำร่องของไทวัสดุ 2 สาขา และ BnB Home 1 สาขา | วันที่ 4–7 | - ยอดใช้จ่ายจาก POS สาขานำร่องเข้าสู่ระบบถูกต้อง<br>- คำนวณ Mission, เติมแต้ม The 1 และส่งออกไฟล์ Batch ผ่าน SFTP สำเร็จ |
| **Phase 3: Nationwide Full Go-Live** | เปิด Rich Menu หลักให้ลูกค้า LINE OA ไทวัสดุและ BnB Home ทั้งหมดทั่วประเทศ | วันที่ 8 เป็นต้นไป | - เฝ้าระวัง Dashboard อย่างใกล้ชิดตลอด 72 ชั่วโมงแรกหลังเปิดระบบทั่วประเทศ |
