# Line Connect — ไทวัสดุ (TWD) & BnB Home

ระบบ **Line Connect** พัฒนาและดูแลโดย **IT-Division** สำหรับเชื่อมต่อลูกค้าผ่าน LINE Official Account (Rich Menu → LIFF) เข้ากับระบบสมาชิก **The 1 Passport** พร้อมระบบสะสมยอดซื้อ คำนวณ Mission แลกคูปอง และส่งออกไฟล์กลุ่มเป้าหมายกลับไปยังไทวัสดุ

## โครงสร้างโปรเจกต์ (Monorepo Workspaces)

- `apps/api` — ระบบ Backend (NestJS) แยก 8 โมดูลตามส่วนประกอบ (`gateway`, `auth`, `member`, `mission`, `coupon`, `integration`, `admin`, `audit`), Endpoint `GET /health` เช็ก DB + Redis, และ Structured JSON Logger ที่ Mask เบอร์โทร อีเมล และ Token อัตโนมัติ
- `apps/liff` — ระบบ LIFF Frontend (React + Vite + `@line/liff` SDK) หน้าเริ่มต้น Hello ที่เรียก `liff.init()`
- `packages/shared` — ประเภทข้อมูล (Type) และ DTO กลางที่ใช้ร่วมกันระหว่าง Backend และ Frontend

## วิธีรันระบบแบบ Local

### วิธีที่ 1: รันผ่าน Docker Compose ทั้งระบบ (`api`, `postgres`, `redis`)
```bash
cp .env.example .env
docker compose up -d --build
```
ตรวจสอบสถานะระบบได้ที่ `http://localhost:3000/health`

### วิธีที่ 2: รัน DB + Redis บน Docker และรันโค้ดแบบ Hot-Reload บนเครื่อง
```bash
# 1. คัดลอกไฟล์ตั้งค่าและเปิดใช้งานเฉพาะ postgres และ redis
cp .env.example .env
docker compose up -d postgres redis

# 2. ติดตั้งแพ็กเกจและสร้าง Prisma Client
npm install
npm run build --workspace=@line-connect/shared
npm run prisma:generate --workspace=@line-connect/api

# 3. รันตรวจสอบคุณภาพโค้ด เทสต์ และ Build ทั้ง Monorepo
npm run lint
npm test
npm run build

# 4. รันหน้าเว็บ LIFF (พอร์ต 5173)
npm run dev --workspace=@line-connect/liff
```
