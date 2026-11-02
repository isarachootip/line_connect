import { Module } from '@nestjs/common';
import { LineLinkRepository } from './repositories/line-link.repository';
import { ConsentRepository } from './repositories/consent.repository';
import { The1TokenRepository } from './repositories/the1-token.repository';

// โมดูล Auth & Linking สำหรับเข้าสู่ระบบผ่าน LINE LIFF + The 1 OTP, ผูกบัญชี และจัดการ PDPA Consent
@Module({
  providers: [LineLinkRepository, ConsentRepository, The1TokenRepository],
  exports: [LineLinkRepository, ConsentRepository, The1TokenRepository],
})
export class AuthModule {}
