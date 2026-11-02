import { Injectable } from '@nestjs/common';
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
import { createSampleThe1Members, MockMemberSeed } from './the1-mock.fixtures';

// Mock Server ของระบบ The 1 (เปิดด้วย THE1_MOCK=true) มีสมาชิกตัวอย่าง 3 คน และจำลองกรณี Token หมดอายุ
@Injectable()
export class The1MockClient implements The1Client {
  private readonly members = new Map<string, MockMemberSeed>();
  private readonly activeTokens = new Map<string, string>();

  constructor() {
    for (const item of createSampleThe1Members()) {
      this.members.set(item.detail.memberId, item);
    }
  }

  async getToken(otpResult: The1OtpResult): Promise<The1TokenResponse> {
    if (otpResult.otpCode === '000000') {
      throw new The1ApiError('THE1_INVALID_OTP', 'รหัส OTP ไม่ถูกต้อง', 401, false);
    }
    const memberId = otpResult.memberId ?? 'T1_MEM_001';
    const accessToken = `mock-access-${memberId}-${Date.now()}`;
    const refreshToken = `mock-refresh-${memberId}-${Date.now()}`;
    this.activeTokens.set(accessToken, memberId);
    this.activeTokens.set(refreshToken, memberId);

    const expiresInSeconds = 3600;
    return {
      accessToken,
      refreshToken,
      expiresInSeconds,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async refreshToken(refreshToken: string): Promise<The1TokenResponse> {
    this.verifyTokenNotExpired(refreshToken);
    const memberId = this.activeTokens.get(refreshToken) ?? 'T1_MEM_001';
    const newAccess = `mock-access-refreshed-${memberId}-${Date.now()}`;
    const newRefresh = `mock-refresh-rotated-${memberId}-${Date.now()}`;
    this.activeTokens.set(newAccess, memberId);
    this.activeTokens.set(newRefresh, memberId);

    return {
      accessToken: newAccess,
      refreshToken: newRefresh,
      expiresInSeconds: 3600,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };
  }

  async getMemberId(token: string): Promise<{ memberId: string }> {
    this.verifyTokenNotExpired(token);
    const memberId = this.activeTokens.get(token) ?? 'T1_MEM_001';
    return { memberId };
  }

  async getMemberDetail(memberId: string): Promise<The1MemberDetail> {
    return this.getMemberOrThrow(memberId).detail;
  }

  async getProfile(memberId: string): Promise<The1Profile> {
    return { ...this.getMemberOrThrow(memberId).profile };
  }

  async logout(token: string): Promise<{ success: boolean }> {
    this.verifyTokenNotExpired(token);
    this.activeTokens.delete(token);
    return { success: true };
  }

  async getPointClaimLog(
    memberId: string,
    from: Date,
    to: Date,
  ): Promise<The1PointClaimLog[]> {
    const member = this.getMemberOrThrow(memberId);
    return member.logs.filter((entry) => {
      const time = new Date(entry.occurredAt).getTime();
      return time >= from.getTime() && time <= to.getTime();
    });
  }

  async earnPoint(
    memberId: string,
    points: number,
    refId: string,
  ): Promise<The1EarnPointResult> {
    const member = this.getMemberOrThrow(memberId);
    member.profile = {
      ...member.profile,
      points: member.profile.points + points,
    };
    const claimLog: The1PointClaimLog = {
      claimId: `CLM-${Date.now()}`,
      memberId,
      points,
      type: 'EARN',
      refId,
      occurredAt: new Date().toISOString(),
    };
    member.logs.push(claimLog);

    return {
      transactionId: claimLog.claimId,
      memberId,
      earnedPoints: points,
      newBalance: member.profile.points,
      refId,
    };
  }

  private verifyTokenNotExpired(token: string): void {
    if (!token || token.startsWith('expired-')) {
      throw new The1ApiError(
        'THE1_TOKEN_EXPIRED',
        'Token ของระบบ The 1 หมดอายุหรือถูกเพิกถอนแล้ว (401 Unauthorized)',
        401,
        false,
      );
    }
  }

  private getMemberOrThrow(memberId: string): MockMemberSeed {
    const found = this.members.get(memberId);
    if (!found) {
      throw new The1ApiError(
        'THE1_MEMBER_NOT_FOUND',
        `ไม่พบรหัสสมาชิก ${memberId} ในระบบจำลอง The 1`,
        404,
        false,
      );
    }
    return found;
  }
}
