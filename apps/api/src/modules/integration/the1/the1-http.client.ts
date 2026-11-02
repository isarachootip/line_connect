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

export interface The1HttpConfig {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export type The1TransportFn = <T>(
  operationName: string,
  config: The1HttpConfig,
  payload: Record<string, unknown>,
) => Promise<T>;

// อะแดปเตอร์สำหรับเชื่อมต่อระบบ The 1 จริง (อ่านค่า THE1_BASE_URL, THE1_CLIENT_ID, THE1_CLIENT_SECRET จาก env)
@Injectable()
export class The1HttpClient implements The1Client {
  private readonly transport: The1TransportFn;

  constructor(
    private readonly config: The1HttpConfig,
    transport?: The1TransportFn,
  ) {
    this.transport =
      transport ??
      (async (operationName: string) => {
        // TODO: รอรับเอกสาร API Specification จริงของระบบ The 1 (ห้ามเดา URL / Path / Header จริงตามกฎข้อ 5)
        throw new The1ApiError(
          'THE1_REAL_SPEC_PENDING',
          `TODO: ยังไม่ได้ระบุ Spec จริงของ The 1 สำหรับคำสั่ง ${operationName} (baseUrl=${this.config.baseUrl}) กรุณาเปิด THE1_MOCK=true จนกว่าจะได้รับ Spec`,
          501,
          false,
        );
      });
  }

  async getToken(otpResult: The1OtpResult): Promise<The1TokenResponse> {
    // TODO: เชื่อมต่อ Endpoint Get Token ของ The 1 เมื่อได้รับ Spec จริง
    return this.transport<The1TokenResponse>('getToken', this.config, {
      otpRef: otpResult.otpRef,
    });
  }

  async refreshToken(refreshToken: string): Promise<The1TokenResponse> {
    // TODO: เชื่อมต่อ Endpoint Refresh Token ของ The 1 เมื่อได้รับ Spec จริง
    return this.transport<The1TokenResponse>('refreshToken', this.config, {
      hasRefreshToken: Boolean(refreshToken),
    });
  }

  async getMemberId(token: string): Promise<{ memberId: string }> {
    // TODO: เชื่อมต่อ Endpoint Get Member ID ของ The 1 เมื่อได้รับ Spec จริง
    return this.transport<{ memberId: string }>('getMemberId', this.config, {
      hasToken: Boolean(token),
    });
  }

  async getMemberDetail(memberId: string): Promise<The1MemberDetail> {
    // TODO: เชื่อมต่อ Endpoint Get Member Detail ของ The 1 เมื่อได้รับ Spec จริง
    return this.transport<The1MemberDetail>('getMemberDetail', this.config, {
      memberId,
    });
  }

  async getProfile(memberId: string): Promise<The1Profile> {
    // TODO: เชื่อมต่อ Endpoint Get Profile ของ The 1 เมื่อได้รับ Spec จริง
    return this.transport<The1Profile>('getProfile', this.config, { memberId });
  }

  async logout(token: string): Promise<{ success: boolean }> {
    // TODO: เชื่อมต่อ Endpoint Logout ของ The 1 เมื่อได้รับ Spec จริง
    return this.transport<{ success: boolean }>('logout', this.config, {
      hasToken: Boolean(token),
    });
  }

  async getPointClaimLog(
    memberId: string,
    from: Date,
    to: Date,
  ): Promise<The1PointClaimLog[]> {
    // TODO: เชื่อมต่อ Endpoint Get Point Claim Log ของ The 1 เมื่อได้รับ Spec จริง
    return this.transport<The1PointClaimLog[]>('getPointClaimLog', this.config, {
      memberId,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }

  async earnPoint(
    memberId: string,
    points: number,
    refId: string,
  ): Promise<The1EarnPointResult> {
    // TODO: เชื่อมต่อ Endpoint Earn Point ของ The 1 เมื่อได้รับ Spec จริง (Phase 2-3 รองรับ e-coupon เพิ่มเติม)
    return this.transport<The1EarnPointResult>('earnPoint', this.config, {
      memberId,
      points,
      refId,
    });
  }
}
