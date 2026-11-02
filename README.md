# Line Connect — ไทวัสดุ (TWD) & BnB Home

ระบบ **Line Connect** พัฒนาและดูแลโดย **IT-Division** สำหรับเชื่อมต่อลูกค้าผ่าน LINE Official Account (Rich Menu → LIFF) เข้ากับระบบสมาชิก **The 1 Passport** พร้อมระบบสะสมยอดซื้อ คำนวณ Mission แลกคูปอง และส่งออกไฟล์กลุ่มเป้าหมายกลับไปยังไทวัสดุ

## โครงสร้างโปรเจกต์ (Monorepo Workspaces)

- `packages/shared` — ประเภทข้อมูลกลาง (Enums, Standard API Response Contracts)
- `apps/backend` — ระบบ Backend API Gateway/BFF, Core Security (AES-256-GCM + HMAC Blind Index, PII Redactor), Prisma ORM
- `apps/liff-frontend` — ระบบ LIFF Frontend สำหรับลูกค้าไทวัสดุ (TWD) และ BnB Home (BNB)
- `apps/admin` — ระบบ Admin Portal สำหรับจัดการแคมเปญ Mission, คูปอง, Batch Export และ Audit Log

## วิธีเริ่มต้นใช้งาน (Quick Start)

1. คัดลอกไฟล์ `.env.example` เป็น `.env` และตั้งค่าตัวแปรสภาพแวดล้อม:
   ```bash
   cp .env.example .env
   ```
2. รันบริการฐานข้อมูล PostgreSQL 16 และ Redis 7 ด้วย Docker Compose:
   ```bash
   docker compose up -d
   ```
3. ติดตั้ง Dependencies และสร้าง Prisma Client:
   ```bash
   npm install
   npm run build --workspace=@line-connect/shared
   npm run prisma:generate --workspace=@line-connect/backend
   ```
4. รันการตรวจสอบคุณภาพโค้ดและ Unit Tests ทั้งระบบ:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```
