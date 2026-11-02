import { Injectable } from '@nestjs/common';
import { Consent, ConsentType } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface ConsentRecordInput {
  readonly memberId: string;
  readonly type: ConsentType;
  readonly version: string;
  readonly timestamp?: Date;
}

// Repository สำหรับตาราง consent (บังคับ Append-only: ห้าม update ทับ ให้ insert แถวใหม่ทุกครั้ง)
@Injectable()
export class ConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // บันทึกการให้ความยินยอมโดย INSERT แถวใหม่เสมอ
  async grantConsent(input: ConsentRecordInput): Promise<Consent> {
    return this.prisma.consent.create({
      data: {
        memberId: input.memberId,
        type: input.type,
        version: input.version,
        grantedAt: input.timestamp ?? new Date(),
        revokedAt: null,
      },
    });
  }

  // บันทึกการเพิกถอนความยินยอมโดย INSERT แถวใหม่เสมอ (ห้าม update ทับแถวเดิม)
  async revokeConsent(input: ConsentRecordInput): Promise<Consent> {
    return this.prisma.consent.create({
      data: {
        memberId: input.memberId,
        type: input.type,
        version: input.version,
        grantedAt: null,
        revokedAt: input.timestamp ?? new Date(),
      },
    });
  }

  // ดึงประวัติความยินยอมทั้งหมดของสมาชิก
  async findHistoryByMember(memberId: string): Promise<Consent[]> {
    return this.prisma.consent.findMany({
      where: { memberId },
      orderBy: [{ grantedAt: 'desc' }, { revokedAt: 'desc' }],
    });
  }
}
