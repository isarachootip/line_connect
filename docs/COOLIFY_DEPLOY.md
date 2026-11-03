# คู่มือการ Deploy ระบบ Line Connect ขึ้น Server ผ่าน Coolify

ระบบถูกเตรียมไฟล์สำหรับ **Coolify** ไว้พร้อมทั้ง 2 รูปแบบ คือ:
1. **แบบที่ 1 (แนะนำ — รวดเร็วที่สุด): Deploy ทั้ง Stack ด้วย `Docker Compose`** (ได้ครบทั้ง `postgres`, `redis`, `api`, `liff`, `admin` ในครั้งเดียว)
2. **แบบที่ 2: แยก Deploy ทีละ Application ด้วย `Dockerfile`**

---

## วิธีที่ 1: Deploy ทั้งระบบด้วย Docker Compose บน Coolify (แนะนำ)

1. เข้าหน้า **Coolify Dashboard** → เลือก **Projects** → กด **+ Add New Resource**
2. เลือก **Public Repository** (หรือ **Private Repository (GitHub App)**) แล้วใส่ URL:
   - `https://github.com/isarachootip/line_connect`
   - Branch: `main`
3. ในหัวข้อ **Build Pack** ให้เลือกเป็น **`Docker Compose`**
4. ช่อง **Docker Compose Location** ให้ระบุเป็น:
   - `/docker-compose.coolify.yml`
5. เมื่อเข้ามาที่หน้าตั้งค่า Resource บน Coolify จะเห็น 3 บริการเว็บหลัก ให้ผูก **Domains** ดังนี้:
   - **`api`** (Port `3000`): ใส่เป็น `https://api-lineconnect.yourdomain.com`
   - **`liff`** (Port `80`): ใส่เป็น `https://liff-lineconnect.yourdomain.com`
   - **`admin`** (Port `80`): ใส่เป็น `https://admin-lineconnect.yourdomain.com`
6. ไปที่แท็บ **Environment Variables** ใน Coolify แล้วตั้งค่าตัวแปรสำคัญ:
   ```env
   # URL ของ API ที่ให้หน้าเว็บ LIFF และ Admin เรียกหา (ต้องตรงกับโดเมนของ api ในข้อ 5)
   VITE_API_BASE_URL=https://api-lineconnect.yourdomain.com

   # อนุญาต CORS เฉพาะโดเมนของ LIFF, Admin และ LINE LIFF
   CORS_ALLOWED_ORIGINS=https://liff.line.me,https://liff-lineconnect.yourdomain.com,https://admin-lineconnect.yourdomain.com

   # รหัส LIFF ID จาก LINE Developers Console (ถ้ายังทดสอบบนเบราว์เซอร์ ใช้ค่าเริ่มต้นได้)
   VITE_LIFF_ID=1234567890-AbCdEfGh

   # คีย์เข้ารหัสข้อมูลส่วนบุคคล (64 ตัวอักษรฐานสิบหก) และ JWT Secret
   PII_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
   PII_BLIND_INDEX_SECRET=replace_with_strong_hmac_secret_at_least_32_chars_long
   JWT_SECRET=replace_with_strong_jwt_secret_at_least_32_chars_long
   ```
7. กดปุ่ม **Deploy** ด้านบนขวาได้เลย!
   - ตัว Container `api` จะทำการสร้างตารางทั้ง 12 ตารางใน PostgreSQL อัตโนมัติด้วยคำสั่ง `prisma db push` ทันทีที่เปิดเครื่องครั้งแรก

---

## วิธีที่ 2: แยก Deploy ทีละบริการด้วย Dockerfile บน Coolify

หากคุณสร้าง Database PostgreSQL และ Redis แยกไว้ใน Coolify แล้ว และต้องการเพิ่มเฉพาะตัวแอปแยกกัน 3 ตัว:

| บริการ | Build Pack | Base Directory | Dockerfile Location | Port Exposes | Healthcheck Path |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **1. Backend API** | `Dockerfile` | `/` | `/apps/api/Dockerfile` (หรือ `/Dockerfile`) | `3000` | `/health/live` |
| **2. LIFF Frontend** | `Dockerfile` | `/` | `/apps/liff/Dockerfile` | `80` | `/health` |
| **3. Admin Backoffice** | `Dockerfile` | `/` | `/apps/admin/Dockerfile` | `80` | `/health` |

> **ข้อควรระวังสำหรับ `liff` และ `admin` (Vite Frontend)**:
> ใน Coolify เมื่อตั้งค่าตัวแปร `VITE_API_BASE_URL` และ `VITE_LIFF_ID` ให้ติ๊กถูกที่ช่อง **"Is Build Variable?"** ด้วย เพื่อให้ Vite นำค่า URL ของ API ไปฝังตอนสั่ง Build ได้ถูกต้องครับ
