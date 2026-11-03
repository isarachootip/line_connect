import { Inject, Injectable } from '@nestjs/common';
import { Brand, ConsentType, LineLinkStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { sanitizeCsvCell } from '../../../common/security/security-hardening';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { TargetBatchRepository } from '../repositories/target-batch.repository';
import { SFTP_CLIENT_TOKEN, SftpClient, SftpUploadResult } from './sftp.client';

// TODO: ยืนยันลำดับและชื่อคอลัมน์ CSV สุดท้ายกับทีม CRM/Data ของไทวัสดุก่อนขึ้น Production
export const TWD_TARGET_BATCH_CSV_HEADERS = [
  'member_id', 'brand', 'segment', 'completed_mission_id', 'total_spend', 'marketing_consent_version', 'exported_at',
] as const;

export interface TargetSegmentCriteria {
  readonly segment: string;
  readonly completedMissionId?: string;
  readonly minTotalSpend?: number;
  readonly brand?: Brand;
  readonly actor?: string;
}

export interface TargetBatchExportSummary {
  readonly batchId: string;
  readonly segment: string;
  readonly rowCount: number;
  readonly exportedMemberIds: readonly string[];
  readonly localFilePath: string;
  readonly remotePath: string;
  readonly plainCsvPreview: string;
  readonly encryptedPayload: string;
  readonly sftpResult: SftpUploadResult;
}

interface ActiveMarketingConsentInfo {
  readonly memberId: string;
  readonly version: string;
}

// บริการสร้างและส่งออกไฟล์ Batch กลุ่มเป้าหมายที่ผ่านเกณฑ์ Segment และมี Consent MARKETING ยังมีผล
@Injectable()
export class TargetBatchExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly targetBatchRepo: TargetBatchRepository,
    private readonly auditRepo: AuditLogRepository,
    @Inject(SFTP_CLIENT_TOKEN) private readonly sftpClient: SftpClient,
  ) {}

  // ประมวลผลคัดกรองกลุ่มเป้าหมาย เข้ารหัสไฟล์ CSV ส่งผ่าน SFTP และบันทึก target_batch + audit_log
  async exportTargetSegment(
    criteria: TargetSegmentCriteria,
    now: Date = new Date(),
  ): Promise<TargetBatchExportSummary> {
    const activeConsentMap = await this.resolveActiveMarketingConsents();
    const eligibleConsentIds = new Set(activeConsentMap.keys());

    const lineLinks = await this.prisma.lineLink.findMany({
      where: {
        status: LineLinkStatus.active,
        ...(criteria.brand ? { brand: criteria.brand } : {}),
      },
    });
    const brandByMember = new Map<string, Brand>();
    for (const link of lineLinks) {
      if (!brandByMember.has(link.memberId)) brandByMember.set(link.memberId, link.brand);
    }

    let missionQualifiedIds: Set<string> | null = null;
    if (criteria.completedMissionId) {
      const progresses = await this.prisma.missionProgress.findMany({
        where: { missionId: criteria.completedMissionId },
      });
      missionQualifiedIds = new Set(
        progresses.filter((p) => p.completedAt !== null).map((p) => p.memberId),
      );
    }

    const allTxns = await this.prisma.spendingTxn.findMany({});
    const spendByMember = new Map<string, number>();
    for (const txn of allTxns) {
      const current = spendByMember.get(txn.memberId) ?? 0;
      spendByMember.set(txn.memberId, Math.round((current + Number(txn.amount)) * 100) / 100);
    }

    const candidateIds = new Set<string>([
      ...brandByMember.keys(),
      ...(missionQualifiedIds ?? []),
      ...spendByMember.keys(),
    ]);

    const exportedMemberIds: string[] = [];
    for (const memberId of Array.from(candidateIds).sort()) {
      if (!eligibleConsentIds.has(memberId)) continue;
      if (criteria.brand && brandByMember.get(memberId) !== criteria.brand) continue;
      if (missionQualifiedIds && !missionQualifiedIds.has(memberId)) continue;
      if (criteria.minTotalSpend !== undefined && (spendByMember.get(memberId) ?? 0) < criteria.minTotalSpend) {
        continue;
      }
      exportedMemberIds.push(memberId);
    }

    const exportedIso = now.toISOString();
    const csvLines: string[] = [TWD_TARGET_BATCH_CSV_HEADERS.join(',')];
    for (const memberId of exportedMemberIds) {
      const brand = brandByMember.get(memberId) ?? criteria.brand ?? Brand.TWD;
      const totalSpend = (spendByMember.get(memberId) ?? 0).toFixed(2);
      const consentInfo = activeConsentMap.get(memberId)!;
      const rowCells = [
        sanitizeCsvCell(memberId),
        sanitizeCsvCell(brand),
        sanitizeCsvCell(criteria.segment),
        sanitizeCsvCell(criteria.completedMissionId ?? ''),
        totalSpend,
        sanitizeCsvCell(consentInfo.version),
        exportedIso,
      ];
      csvLines.push(rowCells.join(','));
    }
    const plainCsv = csvLines.join('\n');
    const encryptedPayload = this.encryptionService.encrypt(plainCsv);

    const exportDir = process.env.TWD_BATCH_EXPORT_DIR ?? './exports/batch';
    const safeSegment = criteria.segment.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const remoteFileName = `${safeSegment}_${exportedIso.replace(/[:.]/g, '-')}.csv.enc`;
    const localFilePath = path.posix.join(exportDir.replace(/\\/g, '/'), remoteFileName);
    this.persistEncryptedFileIfPossible(exportDir, remoteFileName, encryptedPayload);

    const sftpResult = await this.sftpClient.uploadEncryptedBatchFile({
      localFilePath,
      remoteFileName,
      encryptedContent: encryptedPayload,
    });
    const batchRecord = await this.targetBatchRepo.createBatchRecord({
      segment: criteria.segment,
      filePath: localFilePath,
      rowCount: exportedMemberIds.length,
      sentAt: sftpResult.uploadedAt,
    });
    await this.auditRepo.recordAudit({
      actor: criteria.actor ?? 'system:target-batch-exporter',
      action: 'TARGET_BATCH_EXPORTED',
      target: batchRecord.batchId,
      metadata: {
        segment: criteria.segment,
        completedMissionId: criteria.completedMissionId ?? null,
        minTotalSpend: criteria.minTotalSpend ?? null,
        rowCount: exportedMemberIds.length,
        remotePath: sftpResult.remotePath,
        sftpHost: sftpResult.host,
      },
    });
    return {
      batchId: batchRecord.batchId,
      segment: criteria.segment,
      rowCount: exportedMemberIds.length,
      exportedMemberIds,
      localFilePath,
      remotePath: sftpResult.remotePath,
      plainCsvPreview: plainCsv,
      encryptedPayload,
      sftpResult,
    };
  }

  // ตรวจสอบประวัติ Consent แบบ Append-only และคืนเฉพาะสมาชิกที่แถว MARKETING ล่าสุดยังมีผล
  private async resolveActiveMarketingConsents(): Promise<Map<string, ActiveMarketingConsentInfo>> {
    const rows = await this.prisma.consent.findMany({ where: { type: ConsentType.MARKETING } });
    const latestByMember = new Map<string, { granted: boolean; version: string; ts: number }>();

    for (const row of rows) {
      const eventTime = (row.revokedAt ?? row.grantedAt ?? new Date(0)).getTime();
      const isGranted = row.grantedAt !== null && row.revokedAt === null;
      const prev = latestByMember.get(row.memberId);
      if (!prev || eventTime > prev.ts || (eventTime === prev.ts && !isGranted)) {
        latestByMember.set(row.memberId, { granted: isGranted, version: row.version, ts: eventTime });
      }
    }

    const activeMap = new Map<string, ActiveMarketingConsentInfo>();
    for (const [memberId, state] of latestByMember.entries()) {
      if (state.granted) activeMap.set(memberId, { memberId, version: state.version });
    }
    return activeMap;
  }

  private persistEncryptedFileIfPossible(dir: string, fileName: string, content: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, fileName), content, 'utf8');
    } catch {
      // กรณีรันบน Read-only Container จะส่งเนื้อหาที่เข้ารหัสผ่าน SFTP โดยตรง
    }
  }
}
