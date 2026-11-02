import { Injectable } from '@nestjs/common';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { The1ResiliencePolicy } from './the1-resilience';
import {
  The1ApiError,
  The1Client,
  The1EarnPointResult,
  The1MemberDetail,
  The1OtpResult,
  The1PointClaimLog,
  The1Profile,
  The1TokenResponse,
} from './the1.interface';

// ตัวห่อหุ้ม The1Client ที่จัดการ Timeout, Retry, Circuit Breaker และบันทึก audit_log ทุก Request โดยปลอด PII/Token
@Injectable()
export class ResilientThe1Client implements The1Client {
  constructor(
    private readonly delegate: The1Client,
    private readonly resilience: The1ResiliencePolicy,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  async getToken(otpResult: The1OtpResult): Promise<The1TokenResponse> {
    return this.invokeWithAudit(
      'THE1_GET_TOKEN',
      otpResult.memberId ?? 'otp-exchange',
      { otpRef: otpResult.otpRef },
      () => this.delegate.getToken(otpResult),
    );
  }

  async refreshToken(refreshToken: string): Promise<The1TokenResponse> {
    return this.invokeWithAudit(
      'THE1_REFRESH_TOKEN',
      'the1-session',
      {},
      () => this.delegate.refreshToken(refreshToken),
    );
  }

  async getMemberId(token: string): Promise<{ memberId: string }> {
    return this.invokeWithAudit(
      'THE1_GET_MEMBER_ID',
      'the1-session',
      {},
      () => this.delegate.getMemberId(token),
    );
  }

  async getMemberDetail(memberId: string): Promise<The1MemberDetail> {
    return this.invokeWithAudit(
      'THE1_GET_MEMBER_DETAIL',
      memberId,
      { memberId },
      () => this.delegate.getMemberDetail(memberId),
    );
  }

  async getProfile(memberId: string): Promise<The1Profile> {
    return this.invokeWithAudit(
      'THE1_GET_PROFILE',
      memberId,
      { memberId },
      () => this.delegate.getProfile(memberId),
    );
  }

  async logout(token: string): Promise<{ success: boolean }> {
    return this.invokeWithAudit(
      'THE1_LOGOUT',
      'the1-session',
      {},
      () => this.delegate.logout(token),
    );
  }

  async getPointClaimLog(
    memberId: string,
    from: Date,
    to: Date,
  ): Promise<The1PointClaimLog[]> {
    return this.invokeWithAudit(
      'THE1_GET_POINT_CLAIM_LOG',
      memberId,
      { memberId, from: from.toISOString(), to: to.toISOString() },
      () => this.delegate.getPointClaimLog(memberId, from, to),
    );
  }

  async earnPoint(
    memberId: string,
    points: number,
    refId: string,
  ): Promise<The1EarnPointResult> {
    return this.invokeWithAudit(
      'THE1_EARN_POINT',
      memberId,
      { memberId, points, refId },
      () => this.delegate.earnPoint(memberId, points, refId),
    );
  }

  private async invokeWithAudit<T>(
    action: string,
    target: string,
    safeMeta: Record<string, unknown>,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await this.resilience.execute(operation);
      await this.auditLogRepository.recordAudit({
        actor: 'system:the1-client',
        action,
        target,
        metadata: {
          ...safeMeta,
          status: 'success',
          durationMs: Date.now() - startedAt,
        },
      });
      return result;
    } catch (err: unknown) {
      const statusCode = err instanceof The1ApiError ? err.statusCode : 500;
      const errorCode =
        err instanceof The1ApiError ? err.code : 'THE1_UNKNOWN_ERROR';
      await this.auditLogRepository.recordAudit({
        actor: 'system:the1-client',
        action,
        target,
        metadata: {
          ...safeMeta,
          status: 'error',
          statusCode,
          errorCode,
          durationMs: Date.now() - startedAt,
        },
      });
      throw err;
    }
  }
}
