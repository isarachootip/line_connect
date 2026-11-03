import { AdminMemberSearchResultDto, BrandCode } from '@line-connect/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConsentType,
  CouponWalletStatus,
  LineLinkStatus,
} from '@prisma/client';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';

// บริการค้นหาข้อมูลสมาชิกด้วย member_id แบบซ่อนข้อมูลส่วนบุคคล (Mask PII) สำหรับช่วยฝ่ายบริการลูกค้า
@Injectable()
export class AdminMemberSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  // ค้นหาสมาชิกด้วย member_id พร้อมบันทึก audit_log ทุกครั้งที่ค้นหา
  async searchMemberById(
    actor: string,
    memberId: string,
  ): Promise<AdminMemberSearchResultDto> {
    const profile = await this.prisma.memberProfile.findUnique({
      where: { memberId },
    });
    if (!profile) {
      throw new NotFoundException(`ไม่พบข้อมูลสมาชิกรหัส ${memberId}`);
    }

    const [links, consents, progresses, coupons] = await Promise.all([
      this.prisma.lineLink.findMany({
        where: { memberId, status: LineLinkStatus.active },
      }),
      this.prisma.consent.findMany({
        where: { memberId, type: ConsentType.MARKETING },
      }),
      this.prisma.missionProgress.findMany({ where: { memberId } }),
      this.prisma.couponWallet.findMany({
        where: { memberId, status: CouponWalletStatus.available },
      }),
    ]);

    const maskedFirstName = this.maskThaiName(
      this.safeDecrypt(profile.firstName),
    );
    const maskedLastName = this.maskThaiName(
      this.safeDecrypt(profile.lastName),
    );
    const latestMarketing = consents[consents.length - 1];

    await this.auditRepo.recordAudit({
      actor,
      action: 'ADMIN_MEMBER_SEARCHED',
      target: memberId,
      metadata: { reason: 'customer_service_lookup' },
    });

    return {
      memberId,
      maskedFirstName,
      maskedLastName,
      maskedFullName: `${maskedFirstName} ${maskedLastName}`.trim(),
      tier: profile.tier,
      points: profile.points,
      linkedBrands: links.map((l) => l.brand as unknown as BrandCode),
      marketingConsentGranted: Boolean(
        latestMarketing?.grantedAt && !latestMarketing?.revokedAt,
      ),
      completedMissionCount: progresses.filter((p) => p.completedAt !== null)
        .length,
      availableCouponCount: coupons.length,
      refreshedAt: profile.refreshedAt.toISOString(),
    };
  }

  private safeDecrypt(cipherText: string): string {
    try {
      return this.encryptionService.decrypt(cipherText);
    } catch {
      return cipherText;
    }
  }

  private maskThaiName(name: string): string {
    const trimmed = name.trim();
    return trimmed.length <= 2
      ? `${trimmed.slice(0, 1)}***`
      : `${trimmed.slice(0, 2)}***`;
  }
}
