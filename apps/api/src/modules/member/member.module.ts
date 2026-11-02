import { Module } from '@nestjs/common';
import { MemberProfileRepository } from './repositories/member-profile.repository';

// โมดูล Member สำหรับแสดงข้อมูลโปรไฟล์และคะแนนสะสมของไทวัสดุ (TWD) และ BnB Home (BNB)
@Module({
  providers: [MemberProfileRepository],
  exports: [MemberProfileRepository],
})
export class MemberModule {}
