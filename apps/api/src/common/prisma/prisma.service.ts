import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// บริการจัดการการเชื่อมต่อฐานข้อมูล PostgreSQL ผ่าน Prisma ORM พร้อมฟังก์ชันตรวจสอบสถานะ
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // เชื่อมต่อฐานข้อมูลอัตโนมัติเมื่อโมดูลของ NestJS เริ่มทำงาน (รองรับโหมด Offline/Dev เมื่อยังไม่ได้เปิด Docker Postgres)
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      if (process.env.APP_ENV === 'prod') {
        throw new Error('ไม่สามารถเชื่อมต่อฐานข้อมูล PostgreSQL บน Production ได้');
      }
    }
  }

  // ปิดการเชื่อมต่อฐานข้อมูลอย่างปลอดภัยเมื่อแอปพลิเคชันหยุดทำงาน
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  // ตรวจสอบความพร้อมของฐานข้อมูล PostgreSQL ด้วยคำสั่ง SELECT 1
  async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
