import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { redactPii } from '../../../common/logger/pii-redactor';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface CreateAuditLogInput {
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly metadata: Record<string, unknown>;
}

// Repository สำหรับตาราง audit_log (กรองข้อมูลส่วนบุคคลและ Token ออกจาก metadata อัตโนมัติก่อนบันทึก)
@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  // บันทึกประวัติการใช้งานระบบโดยผ่าน redactPii เสมอตามกฎความปลอดภัย
  async recordAudit(input: CreateAuditLogInput): Promise<AuditLog> {
    const sanitizedMetadata = redactPii(
      input.metadata,
    ) as Prisma.InputJsonObject;

    return this.prisma.auditLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        target: input.target,
        metadata: sanitizedMetadata,
      },
    });
  }
}
