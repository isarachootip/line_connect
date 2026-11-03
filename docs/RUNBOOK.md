# คู่มือปฏิบัติการเหตุฉุกเฉิน (Incident Runbook) — ระบบ Line Connect

- **ผู้รับผิดชอบหลัก**: ทีม IT-Division (On-call Engineer)
- **ช่องทางตรวจสอบสถานะ**: `GET /health/ready`, `GET /monitoring/summary`, `GET /metrics`
- **คำสั่ง Rollback ด่วนด้วยคำสั่งเดียว**:
  ```bash
  npm run deploy:rollback
  # หรือ: kubectl rollout undo deployment/line-connect-api -n line-connect-prod
  ```

---

## กรณีที่ 1: ระบบ The 1 API ล่มหรือเกิด Timeout ต่อเนื่อง (The 1 Outage)

### อาการและการแจ้งเตือน (Symptoms & Alerts)
- ได้รับแจ้งเตือน `LineConnectEarnPointQueueBacklog` หรือ `EARN_POINT_FAILED_ALERT` ใน Log
- ค่า `stale: true` ในหน้า `Home` และ `My Profile` เพิ่มสูงขึ้น

### กลไกป้องกันอัตโนมัติของระบบ (Graceful Degradation)
1. **หน้า Home และ My Profile**: `MemberProfileCacheService` จะดึงข้อมูลล่าสุดจาก Redis Cache หรือตาราง `member_profile` มาแสดงพร้อมป้าย `"ข้อมูล ณ เวลา ..."` โดยที่ลูกค้ายังดูคูปองและภารกิจได้ตามปกติ
2. **การเติมแต้มรางวัล (Earn Point)**: `EarnPointQueueService` จะเก็บคำสั่งไว้ในคิวพร้อม `refId` กันบันทึกซ้ำ และทำการ Retry อัตโนมัติสูงสุด 3 ครั้งก่อนส่ง Alert

### ขั้นตอนการแก้ไขของทีม IT-Division
1. ตรวจสอบสถานะการเชื่อมต่อกับ The 1:
   ```bash
   curl -s https://api.lineconnect.thaiwatsadu.com/monitoring/summary
   ```
2. ประสานงานทีม The 1 Partner Support พร้อมแจ้งช่วงเวลาที่เกิด Timeout
3. เมื่อระบบ The 1 กลับมาทำงานปกติ:
   - คิวที่ค้างอยู่ใน `EarnPointQueueService` จะทยอยส่งซ้ำด้วย `refId` เดิมโดยไม่เกิดการเติมแต้มซ้ำ (Idempotent)
   - ตรวจสอบตาราง `audit_log` (`action = 'EARN_POINT_SUCCESS'`) เพื่อยืนยันว่าทุกรายการที่ค้างได้รับการเติมแต้มครบถ้วน

---

## กรณีที่ 2: ข้อมูลยอดใช้จ่ายไทวัสดุไม่เข้า (Spending Ingestion Stall)

### อาการและการแจ้งเตือน (Symptoms & Alerts)
- ลูกค้าซื้อสินค้าที่ไทวัสดุหรือ BnB Home แล้วความคืบหน้า `Mission` ไม่ขยับ
- ไม่พบ Log `SPENDING_BATCH_INGESTED` ในตาราง `audit_log` เกินกว่า 30 นาที

### ขั้นตอนการแก้ไขของทีม IT-Division
1. **ตรวจสอบตาราง Dead-Letter (`spending_dead_letter`)**:
   - ดูว่ามีรายการถูกปฏิเสธเนื่องจาก Schema ผิดรูปแบบหรือยอดติดลบในช่องทาง Push/Pull หรือไม่
2. **ตรวจสอบช่องทาง Push Webhook (`POST /integrations/spending`)**:
   - ตรวจสอบว่า IP ต้นทางของไทวัสดุตรงกับ `TWD_SPENDING_ALLOWED_IPS` และลายเซ็น `X-TWD-Signature` ใช้ `TWD_SPENDING_HMAC_SECRET` ตรงกันหรือไม่
3. **สั่งดึงข้อมูลย้อนหลังผ่าน Pull Job และคำนวณภารกิจใหม่ (`recompute`)**:
   - ระบบรองรับ Idempotency ด้วย `txn_id` unique ดังนั้นสามารถดึงข้อมูลซ้ำช่วงเวลาที่ขาดหายได้อย่างปลอดภัยโดยไม่ถูกนับยอดซ้ำ
   - หลังจากข้อมูลเข้าครบแล้ว ให้เรียก `MissionEngineService.recompute(missionId)` เพื่อคำนวณความคืบหน้าและแจก Reward ย้อนหลังให้ลูกค้าครบทุกคน

---

## กรณีที่ 3: คูปองถูกใช้งานผิดปกติ (Abnormal Coupon Redemption / Spike)

### อาการและการแจ้งเตือน (Symptoms & Alerts)
- พบจำนวนการเรียก `POST /me/coupons/:id/use` หรือการแจกคูปองพุ่งสูงผิดปกติในเวลาอันสั้น

### กลไกป้องกันอัตโนมัติของระบบ
- การกดใช้คูปองใช้ `redeemWalletCouponAtomically` (`UPDATE coupon_wallet SET status='used' WHERE id=... AND member_id=... AND status='available'`) ร่วมกับ In-flight Lock ป้องกัน Race Condition 100%

### ขั้นตอนการแก้ไขของทีม IT-Division
1. **ตรวจสอบ `audit_log` ทันที**:
   - ค้นหา `action = 'COUPON_USED'` หรือ `action = 'ADMIN_COUPON_CREATED'` เพื่อดู `actor` (`member_id`) และรหัสคูปอง (`code`) ที่ผิดปกติ
2. **ระงับชุดคูปองชั่วคราวผ่าน Admin Backoffice**:
   - เข้าหน้า Admin Backoffice (สิทธิ์ `ADMIN` หรือ `MARKETING`) เพื่อปรับวันหมดอายุ (`validTo`) ของคูปองชุดที่ผิดปกติให้สิ้นสุดทันที
3. **หากเกิดจาก حساب/Token ที่ถูกละเมิด**:
   - เพิกถอน Session ของสมาชิกรายนั้นผ่านระบบ Auth Revocation และแจ้งทีม CISO เพื่อตรวจสอบเพิ่มเติม
