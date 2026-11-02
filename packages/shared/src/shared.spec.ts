import {
  AppEnvironment,
  BrandCode,
  ConsentType,
  HealthStatusDto,
  createSuccessResponse,
  createErrorResponse,
  isValidBrandCode,
} from './index';

// ชุดทดสอบสำหรับประเภทข้อมูลกลางและ DTO ที่ใช้ร่วมกัน (Shared Enums, DTOs & Response Helpers)
describe('Shared Package Domain Contracts', () => {
  it('ควรตรวจสอบรหัสแบรนด์ไทวัสดุ (TWD) และ BnB Home (BNB) ได้อย่างถูกต้อง', () => {
    expect(isValidBrandCode('TWD')).toBe(true);
    expect(isValidBrandCode('BNB')).toBe(true);
    expect(isValidBrandCode('INVALID')).toBe(false);
    expect(BrandCode.TWD).toBe('TWD');
    expect(BrandCode.BNB).toBe('BNB');
  });

  it('ควรมีค่าสภาพแวดล้อมระบบ (AppEnvironment) ครบทั้ง dev, staging และ prod', () => {
    expect(AppEnvironment.DEV).toBe('dev');
    expect(AppEnvironment.STAGING).toBe('staging');
    expect(AppEnvironment.PROD).toBe('prod');
  });

  it('ควรมีประเภทความยินยอม (ConsentType) ครบทั้ง T&C, PDPA และการตลาด', () => {
    expect(ConsentType.TERMS_AND_CONDITIONS).toBe('TERMS_AND_CONDITIONS');
    expect(ConsentType.PDPA_PRIVACY).toBe('PDPA_PRIVACY');
    expect(ConsentType.MARKETING).toBe('MARKETING');
  });

  it('ควรสร้างโครงสร้าง API Response และ HealthStatusDto ตามมาตรฐานเดียวกัน', () => {
    const healthPayload: HealthStatusDto = {
      status: 'up',
      environment: AppEnvironment.DEV,
      dependencies: {
        database: 'up',
        redis: 'up',
      },
    };
    const successRes = createSuccessResponse(healthPayload, 'req-001');
    expect(successRes.success).toBe(true);
    expect(successRes.data?.status).toBe('up');
    expect(successRes.data?.dependencies.database).toBe('up');
    expect(successRes.requestId).toBe('req-001');

    const errorRes = createErrorResponse('AUTH_OTP_EXPIRED', 'รหัส OTP หมดอายุ', 'req-002');
    expect(errorRes.success).toBe(false);
    expect(errorRes.error).toEqual({
      code: 'AUTH_OTP_EXPIRED',
      message: 'รหัส OTP หมดอายุ',
    });
  });
});
