import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaService } from './common/prisma/prisma.service';

// โมดูลหลักของระบบ Line Connect BFF
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
