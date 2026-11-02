import { Module } from '@nestjs/common';
import { AuditLogRepository } from './repositories/audit-log.repository';

// โมดูล Monitoring & Audit Log สำหรับบันทึกประวัติการใช้งานระบบโดยปราศจากข้อมูลส่วนบุคคล (PII-Free)
@Module({
  providers: [AuditLogRepository],
  exports: [AuditLogRepository],
})
export class AuditModule {}
