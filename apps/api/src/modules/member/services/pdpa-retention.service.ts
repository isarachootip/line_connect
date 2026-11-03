import { Inject, Injectable } from '@nestjs/common';
import { LineLinkStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { LineLinkRepository } from '../../auth/repositories/line-link.repository';
import { The1TokenRepository } from '../../auth/repositories/the1-token.repository';
import {
  SessionJwtPayload,
  SessionTokenService,
} from '../../auth/services/session-token.service';
import {
  THE1_CLIENT_TOKEN,
  The1Client,
} from '../../integration/the1/the1.interface';

export interface UnlinkMemberResponseDto {
  readonly success: boolean;
  readonly memberId: string;
  readonly status: 'unlinked';
  readonly unlinkedAt: string;
}

export interface PdpaRetentionCleanupResult {
  readonly retentionDays: number;
  readonly cutoffDate: string;
  readonly anonymizedCount: number;
  readonly anonymizedMemberIds: readonly string[];
}

// บริการจัดการสิทธิ์ตามกฎหมาย PDPA: ยกเลิกการผูกบัญชี (POST /me/unlink) และ Job ลบ/Anonymize ข้อมูลเมื่อครบกำหนด Retention Policy
@Injectable()
export class PdpaRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineLinkRepo: LineLinkRepository,
    private readonly the1TokenRepo: The1TokenRepository,
    private readonly sessionTokenService: SessionTokenService,
    private readonly auditRepo: AuditLogRepository,
    @Inject(THE1_CLIENT_TOKEN)
    private readonly the1Client: The1Client,
  ) {}

  // 1. POST /me/unlink — ยกเลิกการผูก LINE UID, ลบ the1_token, เปลี่ยน line_link เป็น unlinked, เพิกถอน Session และบันทึก audit_log
  async unlinkMemberAccount(
    session: SessionJwtPayload,
    now: Date = new Date(),
  ): Promise<UnlinkMemberResponseDto> {
    const memberId = session.sub;
    const lineUid = session.lineUid;
    const brand = session.brand;

    this.sessionTokenService.revokeSession(session.jti);

    const existingToken = await this.the1TokenRepo.findByMemberId(memberId);
    if (existingToken) {
      try {
        await this.the1Client.logout(existingToken.accessToken);
      } catch {
        // กรณี The 1 ภายนอกไม่ตอบสนอง ยังคงต้องลบ Token ในระบบของเราตามสิทธิ์ PDPA
      }
      await this.the1TokenRepo.deleteByMemberId(memberId);
    }

    const existingLink = await this.lineLinkRepo.findByLineUidAndBrand(
      lineUid,
      brand,
    );
    if (existingLink) {
      await this.lineLinkRepo.unlinkMember(lineUid, brand);
    }

    await this.auditRepo.recordAudit({
      actor: lineUid,
      action: 'MEMBER_UNLINKED',
      target: memberId,
      metadata: {
        brand,
        lineLinkStatus: LineLinkStatus.unlinked,
        the1TokenDeleted: true,
        unlinkedAt: now.toISOString(),
      },
    });

    return {
      success: true,
      memberId,
      status: 'unlinked',
      unlinkedAt: now.toISOString(),
    };
  }

  // 2. Job ลบและ Anonymize ข้อมูลส่วนบุคคลที่ยกเลิกผูกบัญชีเกินระยะเวลา Retention Policy ที่ฝ่ายกฎหมายกำหนด (PDPA_RETENTION_DAYS)
  async runRetentionCleanup(
    now: Date = new Date(),
    retentionDays = Number(process.env.PDPA_RETENTION_DAYS ?? 365),
  ): Promise<PdpaRetentionCleanupResult> {
    const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffMs);

    const allLinks = await this.prisma.lineLink.findMany({});
    const activeMemberIds = new Set(
      allLinks
        .filter((l) => l.status === LineLinkStatus.active)
        .map((l) => l.memberId),
    );

    const expiredUnlinkedRows = allLinks.filter(
      (l) =>
        l.status === LineLinkStatus.unlinked &&
        !l.lineUid.startsWith('ANON_') &&
        l.linkedAt.getTime() <= cutoffMs,
    );

    const anonymizedMemberIds: string[] = [];

    for (const row of expiredUnlinkedRows) {
      const anonymizedLineUid = `ANON_${createHash('sha256')
        .update(`${row.lineUid}:${row.id}`)
        .digest('hex')
        .slice(0, 24)}`;

      await this.prisma.lineLink.update({
        where: {
          lineUid_brand: {
            lineUid: row.lineUid,
            brand: row.brand,
          },
        },
        data: {
          lineUid: anonymizedLineUid,
          status: LineLinkStatus.unlinked,
        },
      });

      if (!activeMemberIds.has(row.memberId)) {
        const residualToken = await this.the1TokenRepo.findByMemberId(row.memberId);
        if (residualToken) {
          await this.the1TokenRepo.deleteByMemberId(row.memberId);
        }

        const existingProfile = await this.prisma.memberProfile.findUnique({
          where: { memberId: row.memberId },
        });
        if (existingProfile) {
          await this.prisma.memberProfile.update({
            where: { memberId: row.memberId },
            data: {
              firstName: '[ANONYMIZED]',
              lastName: '[ANONYMIZED]',
              points: 0,
            },
          });
        }
      }

      if (!anonymizedMemberIds.includes(row.memberId)) {
        anonymizedMemberIds.push(row.memberId);
      }
    }

    await this.auditRepo.recordAudit({
      actor: 'system:pdpa-retention-job',
      action: 'PDPA_RETENTION_ANONYMIZED',
      target: `batch:${anonymizedMemberIds.length}`,
      metadata: {
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        anonymizedCount: anonymizedMemberIds.length,
        anonymizedMemberIds,
      },
    });

    return {
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      anonymizedCount: anonymizedMemberIds.length,
      anonymizedMemberIds,
    };
  }
}
