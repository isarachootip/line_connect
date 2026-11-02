import {
  ConsentStatusSummaryDto,
  ConsentType as SharedConsentType,
  MemberConsentResponseDto,
  UpdateMarketingConsentRequestDto,
} from '@line-connect/shared';
import { Injectable } from '@nestjs/common';
import { ConsentType as PrismaConsentType } from '@prisma/client';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { ConsentRepository } from '../../auth/repositories/consent.repository';
import { SessionJwtPayload } from '../../auth/services/session-token.service';

// บริการจัดการความยินยอมของสมาชิก (GET /me/consent และ PUT /me/consent แบบ Append-only: insert แถวใหม่เสมอ)
@Injectable()
export class MemberConsentService {
  constructor(
    private readonly consentRepo: ConsentRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  // ดึงสถานะความยินยอม MARKETING ล่าสุด และประวัติความยินยอมทั้งหมดของสมาชิก
  async getConsent(
    session: SessionJwtPayload,
  ): Promise<MemberConsentResponseDto> {
    const memberId = session.sub;
    const rows = await this.consentRepo.findHistoryByMember(memberId);

    const marketingRows = rows
      .filter((row) => row.type === PrismaConsentType.MARKETING)
      .sort((a, b) => {
        const timeA = (a.grantedAt ?? a.revokedAt ?? new Date(0)).getTime();
        const timeB = (b.grantedAt ?? b.revokedAt ?? new Date(0)).getTime();
        return timeB - timeA;
      });

    const latestMarketing = marketingRows[0];
    const marketingSummary: ConsentStatusSummaryDto | null = latestMarketing
      ? {
          type: SharedConsentType.MARKETING,
          version: latestMarketing.version,
          granted:
            latestMarketing.grantedAt !== null &&
            latestMarketing.revokedAt === null,
          updatedAt: (
            latestMarketing.grantedAt ??
            latestMarketing.revokedAt ??
            new Date()
          ).toISOString(),
        }
      : null;

    return {
      memberId,
      marketing: marketingSummary,
      history: rows.map((row) => ({
        id: row.id,
        type: row.type as unknown as SharedConsentType,
        version: row.version,
        grantedAt: row.grantedAt ? row.grantedAt.toISOString() : null,
        revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      })),
    };
  }

  // เปลี่ยนสถานะความยินยอม MARKETING โดยบังคับ insert แถวใหม่เสมอ ห้าม update ทับแถวเดิม
  async updateMarketingConsent(
    session: SessionJwtPayload,
    dto: UpdateMarketingConsentRequestDto,
  ): Promise<MemberConsentResponseDto> {
    const memberId = session.sub;

    if (dto.granted) {
      await this.consentRepo.grantConsent({
        memberId,
        type: PrismaConsentType.MARKETING,
        version: dto.version,
      });
    } else {
      await this.consentRepo.revokeConsent({
        memberId,
        type: PrismaConsentType.MARKETING,
        version: dto.version,
      });
    }

    await this.auditRepo.recordAudit({
      actor: session.lineUid,
      action: 'MEMBER_MARKETING_CONSENT_UPDATED',
      target: memberId,
      metadata: {
        granted: dto.granted,
        version: dto.version,
      },
    });

    return this.getConsent(session);
  }
}
