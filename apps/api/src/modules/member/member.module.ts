import { Module, forwardRef } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CouponModule } from '../coupon/coupon.module';
import { The1Module } from '../integration/the1/the1.module';
import { MissionModule } from '../mission/mission.module';
import { MemberController } from './member.controller';
import { MemberProfileRepository } from './repositories/member-profile.repository';
import { MemberConsentService } from './services/member-consent.service';
import { MemberProfileCacheService } from './services/member-profile-cache.service';
import { MemberService } from './services/member.service';
import { PdpaRetentionService } from './services/pdpa-retention.service';

// โมดูล Member สำหรับแสดงข้อมูลหน้า Home, Profile, ประวัติแต้ม และจัดการ Consent ของไทวัสดุ (TWD) และ BnB Home (BNB)
@Module({
  imports: [
    forwardRef(() => AuthModule),
    AuditModule,
    The1Module,
    CouponModule,
    MissionModule,
  ],
  controllers: [MemberController],
  providers: [
    MemberProfileRepository,
    {
      provide: RedisService,
      useFactory: () =>
        new RedisService(
          process.env.REDIS_HOST ?? 'localhost',
          Number(process.env.REDIS_PORT ?? 6379),
          process.env.REDIS_PASSWORD ?? '',
        ),
    },
    MemberProfileCacheService,
    MemberConsentService,
    MemberService,
    PdpaRetentionService,
  ],
  exports: [
    MemberProfileRepository,
    MemberProfileCacheService,
    MemberConsentService,
    MemberService,
    PdpaRetentionService,
  ],
})
export class MemberModule {}
