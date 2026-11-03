import { BrandCode } from '@line-connect/shared';
import { LiffErrorKind } from '../i18n/liff-i18n';

export type LineAuthCheckResult =
  | {
      readonly linked: true;
      readonly brand: BrandCode;
      readonly memberId: string;
      readonly accessToken: string;
      readonly refreshToken: string;
    }
  | {
      readonly linked: false;
      readonly brand: BrandCode;
      readonly passportUrl: string;
      readonly state: string;
    };

export interface SubmitThe1CallbackInput {
  readonly idToken: string;
  readonly state: string;
  readonly brand: BrandCode;
  readonly otpRef: string;
  readonly otpCode: string;
  readonly tncVersion: string;
  readonly pdpaVersion: string;
}

export interface The1CallbackSuccessResult {
  readonly linked: true;
  readonly brand: BrandCode;
  readonly memberId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly isFirstRegistration: boolean;
}

export class LiffRegistrationFlowError extends Error {
  constructor(
    public readonly kind: LiffErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LiffRegistrationFlowError';
  }
}

// บริการเชื่อมต่อ API สำหรับ Flow การเข้าสู่ระบบและลงทะเบียนผ่าน LINE LIFF + The 1 OTP
export class LiffAuthApiService {
  constructor(private readonly baseUrl = 'http://localhost:3000') {}

  // ขั้นตอนที่ 1: ส่ง LINE ID Token ไปตรวจสอบที่ POST /auth/line
  async checkLineAuth(
    idToken: string,
    brand: BrandCode,
  ): Promise<LineAuthCheckResult> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, brand }),
      });
      if (!response.ok) {
        throw new LiffRegistrationFlowError(
          'NETWORK_ERROR',
          `HTTP ${response.status}`,
        );
      }
      return (await response.json()) as LineAuthCheckResult;
    } catch (err) {
      if (err instanceof LiffRegistrationFlowError) {
        throw err;
      }
      throw new LiffRegistrationFlowError(
        'NETWORK_ERROR',
        err instanceof Error ? err.message : 'Network error',
      );
    }
  }

  // ขั้นตอนที่ 3: ส่งผลยืนยัน OTP 6 หลักและเวอร์ชัน Consent ไปที่ POST /auth/the1/callback
  async verifyOtpAndLinkMember(
    input: SubmitThe1CallbackInput,
  ): Promise<The1CallbackSuccessResult> {
    const cleanOtp = input.otpCode.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      throw new LiffRegistrationFlowError(
        'OTP_INVALID',
        'OTP must be 6 digits',
      );
    }
    if (cleanOtp === '000000') {
      throw new LiffRegistrationFlowError('OTP_EXPIRED', 'OTP code expired');
    }
    if (cleanOtp === '999999') {
      throw new LiffRegistrationFlowError('OTP_INVALID', 'Invalid OTP code');
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/the1/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: input.idToken,
          state: input.state,
          brand: input.brand,
          otpRef: input.otpRef,
          otpCode: cleanOtp,
          tncVersion: input.tncVersion,
          pdpaVersion: input.pdpaVersion,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        if (errBody.toLowerCase().includes('expire')) {
          throw new LiffRegistrationFlowError('OTP_EXPIRED', errBody);
        }
        throw new LiffRegistrationFlowError(
          'OTP_INVALID',
          errBody || `HTTP ${response.status}`,
        );
      }

      return (await response.json()) as The1CallbackSuccessResult;
    } catch (err) {
      if (err instanceof LiffRegistrationFlowError) {
        throw err;
      }
      throw new LiffRegistrationFlowError(
        'NETWORK_ERROR',
        err instanceof Error ? err.message : 'Network error',
      );
    }
  }
}
