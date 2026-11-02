import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrationModule } from '../integration/integration.module';
import { MissionController } from './mission.controller';
import { MissionRepository } from './repositories/mission.repository';
import { MissionEngineService } from './services/mission-engine.service';
import { MissionRuleEvaluator } from './services/mission-rule.evaluator';

// โมดูล Mission Engine สำหรับคำนวณเงื่อนไขภารกิจจากยอดใช้จ่าย, ส่งอีเวนต์ mission.completed และแสดงผลหน้าภารกิจ
@Module({
  imports: [forwardRef(() => AuthModule), AuditModule, IntegrationModule],
  controllers: [MissionController],
  providers: [MissionRepository, MissionRuleEvaluator, MissionEngineService],
  exports: [MissionRepository, MissionRuleEvaluator, MissionEngineService],
})
export class MissionModule {}
