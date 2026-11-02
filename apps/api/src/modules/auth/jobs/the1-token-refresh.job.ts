import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import {
  THE1_CLIENT_TOKEN,
  The1Client,
} from '../../integration/the1/the1.interface';
import { The1TokenRepository } from '../repositories/the1-token.repository';

export interface TokenRefreshJobSummary {
  readonly scannedCount: number;
  readonly refreshedCount: number;
  readonly failedCount: number;
  readonly refreshedMemberIds: readonly string[];
  readonly failedMemberIds: readonly string[];
}

// 3. Job สำหรับต่ออายุ Token ของระบบ The 1 ล่วงหน้าก่อนหมดเวลา 5 นาที (300 วินาที)
@Injectable()
export class The1TokenRefreshJob implements OnModuleDestroy {
  private static readonly FIVE_MINUTES_MS = 5 * 60 * 1000;
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly the1TokenRepo: The1TokenRepository,
    @Inject(THE1_CLIENT_TOKEN)
    private readonly the1Client: The1Client,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  // ประมวลผลรอบการต่ออายุ Token ที่จะหมดอายุภายใน 5 นาทีข้างหน้าจากเวลาอ้างอิง (now)
  async runRefreshCycle(now = new Date()): Promise<TokenRefreshJobSummary> {
    const thresholdDate = new Date(
      now.getTime() + The1TokenRefreshJob.FIVE_MINUTES_MS,
    );
    const expiringTokens =
      await this.the1TokenRepo.findTokensExpiringBefore(thresholdDate);

    const refreshedMemberIds: string[] = [];
    const failedMemberIds: string[] = [];

    for (const tokenRecord of expiringTokens) {
      try {
        const refreshed = await this.the1Client.refreshToken(
          tokenRecord.refreshToken,
        );
        await this.the1TokenRepo.saveToken({
          memberId: tokenRecord.memberId,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        });
        refreshedMemberIds.push(tokenRecord.memberId);

        await this.auditRepo.recordAudit({
          actor: 'system:the1-token-refresh-job',
          action: 'THE1_TOKEN_REFRESH_SUCCESS',
          target: tokenRecord.memberId,
          metadata: {
            previousExpiresAt: tokenRecord.expiresAt.toISOString(),
            newExpiresAt: refreshed.expiresAt.toISOString(),
          },
        });
      } catch (err: unknown) {
        failedMemberIds.push(tokenRecord.memberId);
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        await this.auditRepo.recordAudit({
          actor: 'system:the1-token-refresh-job',
          action: 'THE1_TOKEN_REFRESH_FAILED',
          target: tokenRecord.memberId,
          metadata: {
            reason: errorMessage,
          },
        });
      }
    }

    return {
      scannedCount: expiringTokens.length,
      refreshedCount: refreshedMemberIds.length,
      failedCount: failedMemberIds.length,
      refreshedMemberIds,
      failedMemberIds,
    };
  }

  // เริ่มตั้งเวลาทำงานอัตโนมัติเป็นรอบๆ (เช่น ทุก 60 วินาที)
  startSchedule(intervalMs = 60_000): void {
    this.stopSchedule();
    this.timerHandle = setInterval(() => {
      void this.runRefreshCycle();
    }, intervalMs);
  }

  // หยุดการทำงานของตัวตั้งเวลาเมื่อปิดระบบหรือจบการทดสอบ
  stopSchedule(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  onModuleDestroy(): void {
    this.stopSchedule();
  }
}
