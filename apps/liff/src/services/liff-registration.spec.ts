import { BrandCode } from '@line-connect/shared';
import { resolveBrandFromQuery } from '../config/liff-brand.config';
import {
  isValidContactInput,
  mapRegistrationErrorMessage,
  maskContactForDisplay,
} from '../i18n/liff-i18n';
import {
  LiffAuthApiService,
  LiffRegistrationFlowError,
} from './liff-auth.service';
import { getLiffIdToken, LiffSdkPort } from './liff-client';

// ชุดทดสอบสำหรับ Flow ลงทะเบียนใน apps/liff (Prompt 11): ?brand=, liff.getIDToken, POST /auth/line, OTP 6 หลัก, Mask เบอร์/อีเมล และข้อความ Error TH/EN
describe('LIFF Registration Flow Services & Helpers (Prompt 11)', () => {
  it('resolveBrandFromQuery ควรแยกแยะแบรนด์ TWD และ BNB จาก query ?brand= ได้อย่างถูกต้อง', () => {
    expect(resolveBrandFromQuery('?brand=BNB')).toBe(BrandCode.BNB);
    expect(resolveBrandFromQuery('?brand=bnb')).toBe(BrandCode.BNB);
    expect(resolveBrandFromQuery('?brand=TWD')).toBe(BrandCode.TWD);
    expect(resolveBrandFromQuery('')).toBe(BrandCode.TWD);
  });

  it('isValidContactInput และ maskContactForDisplay ควรตรวจสอบและซ่อนเบอร์โทร/อีเมลสำหรับหน้า OTP ได้ถูกต้อง', () => {
    expect(isValidContactInput('0812345678')).toBe(true);
    expect(isValidContactInput('somchai@thaiwatsadu.com')).toBe(true);
    expect(isValidContactInput('1234')).toBe(false);

    expect(maskContactForDisplay('0812345678')).toBe('081-***-5678');
    expect(maskContactForDisplay('somchai@thaiwatsadu.com')).toBe('so***@thaiwatsadu.com');
  });

  it('mapRegistrationErrorMessage ควรแสดงข้อความแจ้งเตือนที่ลูกค้าเข้าใจได้ทั้งภาษา TH และ EN (OTP ผิด, หมดเวลา, เครือข่ายล่ม)', () => {
    expect(mapRegistrationErrorMessage('OTP_INVALID', 'TH')).toContain('รหัส OTP ไม่ถูกต้อง');
    expect(mapRegistrationErrorMessage('OTP_EXPIRED', 'TH')).toContain('หมดเวลา');
    expect(mapRegistrationErrorMessage('NETWORK_ERROR', 'TH')).toContain('เชื่อมต่อเครือข่าย');

    expect(mapRegistrationErrorMessage('OTP_INVALID', 'EN')).toContain('Invalid OTP');
    expect(mapRegistrationErrorMessage('OTP_EXPIRED', 'EN')).toContain('expired');
    expect(mapRegistrationErrorMessage('NETWORK_ERROR', 'EN')).toContain('Network');
  });

  it('LiffAuthApiService ควรรองรับ Flow: getIDToken -> POST /auth/line (linked=false) -> POST /auth/the1/callback (isFirstRegistration=true) และจัดการ Error ได้ครบถ้วน', async () => {
    const mockSdk: LiffSdkPort = {
      init: jest.fn().mockResolvedValue(undefined),
      isInClient: () => true,
      isLoggedIn: () => true,
      getIDToken: () => 'line-jwt-token-001',
    };
    const token = getLiffIdToken(mockSdk);
    expect(token).toBe('line-jwt-token-001');

    const originalFetch = globalThis.fetch;
    const authService = new LiffAuthApiService('http://localhost:3000');

    try {
      // 1. ทดสอบ POST /auth/line คืน linked=false
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          linked: false,
          brand: BrandCode.TWD,
          passportUrl: 'https://passport-mock.the1.co.th/authorize',
          state: 'state-xyz',
        }),
      }) as unknown as typeof fetch;

      const lineCheck = await authService.checkLineAuth(token, BrandCode.TWD);
      expect(lineCheck.linked).toBe(false);

      // 2. ทดสอบกรณี OTP หมดเวลา (000000) และ OTP ไม่ถูกต้อง (999999)
      await expect(
        authService.verifyOtpAndLinkMember({
          idToken: token,
          state: 'state-xyz',
          brand: BrandCode.TWD,
          otpRef: 'T1-1234',
          otpCode: '000000',
          tncVersion: 'v1.0',
          pdpaVersion: 'v1.0',
        }),
      ).rejects.toMatchObject({ kind: 'OTP_EXPIRED' } as Partial<LiffRegistrationFlowError>);

      await expect(
        authService.verifyOtpAndLinkMember({
          idToken: token,
          state: 'state-xyz',
          brand: BrandCode.TWD,
          otpRef: 'T1-1234',
          otpCode: '999999',
          tncVersion: 'v1.0',
          pdpaVersion: 'v1.0',
        }),
      ).rejects.toMatchObject({ kind: 'OTP_INVALID' } as Partial<LiffRegistrationFlowError>);

      // 3. ทดสอบ POST /auth/the1/callback สำเร็จและได้รับสิทธิ์คูปอง 20% (isFirstRegistration = true)
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          linked: true,
          brand: BrandCode.TWD,
          memberId: 'T1_MEM_001',
          accessToken: 'jwt-access',
          refreshToken: 'jwt-refresh',
          isFirstRegistration: true,
        }),
      }) as unknown as typeof fetch;

      const callbackRes = await authService.verifyOtpAndLinkMember({
        idToken: token,
        state: 'state-xyz',
        brand: BrandCode.TWD,
        otpRef: 'T1-1234',
        otpCode: '123456',
        tncVersion: 'v1.0',
        pdpaVersion: 'v1.0',
      });
      expect(callbackRes.linked).toBe(true);
      expect(callbackRes.isFirstRegistration).toBe(true);
      expect(callbackRes.memberId).toBe('T1_MEM_001');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
