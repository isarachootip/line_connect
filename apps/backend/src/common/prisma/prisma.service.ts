import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// บริการจัดการการเชื่อมต่อฐานข้อมูล PostgreSQL ผ่าน Prisma ORM
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // เชื่อมต่อฐานข้อมูลอัตโนมัติเมื่อโมดูลของ NestJS เริ่มทำงาน
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // ปิดการเชื่อมต่อฐานข้อมูลอย่างปลอดภัยเมื่อแอปพลิเคชันหยุดทำงาน
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
