import { Module } from '@nestjs/common';
import { DomainEventBus } from '../../common/events/domain-event-bus';
import { AuditModule } from '../audit/audit.module';
import { The1Module } from '../integration/the1/the1.module';
import { MemberModule } from '../member/member.module';
import { AuthController } from './auth.controller';
import { The1TokenRefreshJob } from './jobs/the1-token-refresh.job';
import { ConsentRepository } from './repositories/consent.repository';
import { LineLinkRepository } from './repositories/line-link.repository';
import { The1TokenRepository } from './repositories/the1-token.repository';
import { AuthRateLimiterService } from './services/auth-rate-limiter.service';
import { AuthService } from './services/auth.service';
import {
  LINE_TOKEN_VERIFIER_TOKEN,
  LineHttpTokenVerifier,
  LineMockTokenVerifier,
  LineTokenVerifier,
} from './services/line-token-verifier.service';
import { SessionTokenService } from './services/session-token.service';
import { The1LinkingTransactionService } from './services/the1-linking-transaction.service';

// โมดูล Auth & Linking สำหรับเข้าสู่ระบบผ่าน LINE LIFF + The 1 OTP, ผูกบัญชี, ต่ออายุ Token และจัดการ PDPA Consent
@Module({
  imports: [AuditModule, The1Module, MemberModule],
  controllers: [AuthController],
  providers: [
    LineLinkRepository,
    ConsentRepository,
    The1TokenRepository,
    DomainEventBus,
    SessionTokenService,
    The1LinkingTransactionService,
    {
      provide: AuthRateLimiterService,
      useFactory: () => new AuthRateLimiterService(),
    },
    LineMockTokenVerifier,
    {
      provide: LINE_TOKEN_VERIFIER_TOKEN,
      inject: [LineMockTokenVerifier],
      useFactory: (mockVerifier: LineMockTokenVerifier): LineTokenVerifier => {
        const useMock =
          (process.env.LINE_VERIFY_MOCK ?? 'true').toLowerCase() === 'true';
        return useMock
          ? mockVerifier
          : new LineHttpTokenVerifier(process.env.LINE_VERIFY_URL);
      },
    },
    AuthService,
    The1TokenRefreshJob,
  ],
  exports: [
    LineLinkRepository,
    ConsentRepository,
    The1TokenRepository,
    DomainEventBus,
    SessionTokenService,
    AuthRateLimiterService,
    AuthService,
    The1TokenRefreshJob,
  ],
})
export class AuthModule {}
