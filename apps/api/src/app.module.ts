import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';
import { StructuredJsonLogger } from './common/logger/structured-json.logger';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AuthModule } from './modules/auth/auth.module';
import { MemberModule } from './modules/member/member.module';
import { MissionModule } from './modules/mission/mission.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';

// โมดูลหลักของระบบ Line Connect API ที่รวมทุกส่วนประกอบย่อยตามสถาปัตยกรรม
@Module({
  imports: [
    GatewayModule,
    AuthModule,
    MemberModule,
    MissionModule,
    CouponModule,
    IntegrationModule,
    AdminModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    {
      provide: RedisService,
      useFactory: () =>
        new RedisService(
          process.env.REDIS_HOST ?? 'localhost',
          Number(process.env.REDIS_PORT ?? 6379),
          process.env.REDIS_PASSWORD ?? '',
        ),
    },
    HealthService,
    {
      provide: StructuredJsonLogger,
      useFactory: () => new StructuredJsonLogger(),
    },
  ],
  exports: [PrismaService, RedisService, StructuredJsonLogger],
})
export class AppModule {}
