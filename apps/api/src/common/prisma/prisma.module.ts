import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// โมดูลกลางสำหรับให้บริการ PrismaService แก่ทุก Repository ในระบบ
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
