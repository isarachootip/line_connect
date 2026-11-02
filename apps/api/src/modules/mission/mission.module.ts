import { Module } from '@nestjs/common';
import { MissionRepository } from './repositories/mission.repository';

// โมดูล Mission Engine สำหรับคำนวณเงื่อนไขภารกิจจากยอดใช้จ่ายและสั่งให้คะแนน (Earn Point)
@Module({
  providers: [MissionRepository],
  exports: [MissionRepository],
})
export class MissionModule {}
