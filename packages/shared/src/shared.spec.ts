import {
  BrandCode,
  ConsentType,
  createSuccessResponse,
  createErrorResponse,
  isValidBrandCode,
} from './index';

// ชุดทดสอบสำหรับประเภทข้อมูลกลาง (Shared Enums & Response Helpers)
describe('Shared Package Domain Contracts', () => {
  it('ควรตรวจสอบรหัสแบรนด์ไทวัสดุ (TWD) และ BnB Home (BNB) ได้อย่างถูกต้อง', () => {
    expect(isValidBrandCode('TWD')).toBe(true);
    expect(isValidBrandCode('BNB')).toBe(true);
    expect(isValidBrandCode('INVALID')).toBe(false);
    expect(BrandCode.TWD).toBe('TWD');
    expect(BrandCode.BNB).toBe('BNB');
  });

  it('ควรมีประเภทความยินยอม (ConsentType) ครบทั้ง T&C, PDPA และการตลาด', () => {
    expect(ConsentType.TERMS_AND_CONDITIONS).toBe('TERMS_AND_CONDITIONS');
    expect(ConsentType.PDPA_PRIVACY).toBe('PDPA_PRIVACY');
    expect(ConsentType.MARKETING).toBe('MARKETING');
  });

  it('ควรสร้างโครงสร้าง API Response สำเร็จและข้อผิดพลาดตามมาตรฐานเดียวกัน', () => {
    const successRes = createSuccessResponse({ points: 1250 }, 'req-001');
    expect(successRes.success).toBe(true);
    expect(successRes.data).toEqual({ points: 1250 });
    expect(successRes.requestId).toBe('req-001');
    expect(typeof successRes.timestamp).toBe('string');

    const errorRes = createErrorResponse('AUTH_OTP_EXPIRED', 'รหัส OTP หมดอายุ', 'req-002');
    expect(errorRes.success).toBe(false);
    expect(errorRes.error).toEqual({
      code: 'AUTH_OTP_EXPIRED',
      message: 'รหัส OTP หมดอายุ',
    });
    expect(errorRes.requestId).toBe('req-002');
  });
});
