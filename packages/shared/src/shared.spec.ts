import {
  AppEnvironment,
  BrandCode,
  ConsentType,
  CouponSource,
  CouponWalletStatus,
  HealthStatusDto,
  LineLinkStatus,
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

  it('ควรมีประเภทความยินยอม (ConsentType), สถานะ LineLink และสถานะคูปองตรงตามสเปกฐานข้อมูล', () => {
    expect(ConsentType.TNC).toBe('TNC');
    expect(ConsentType.PDPA).toBe('PDPA');
    expect(ConsentType.MARKETING).toBe('MARKETING');
    expect(LineLinkStatus.ACTIVE).toBe('active');
    expect(LineLinkStatus.UNLINKED).toBe('unlinked');
    expect(CouponSource.TWD).toBe('TWD');
    expect(CouponSource.THE1).toBe('THE1');
    expect(CouponWalletStatus.AVAILABLE).toBe('available');
    expect(CouponWalletStatus.USED).toBe('used');
    expect(CouponWalletStatus.EXPIRED).toBe('expired');
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

    const errorRes = createErrorResponse('AUTH_OTP_EXPIRED', 'รหัส OTP หมดอายุ', 'req-002');
    expect(errorRes.success).toBe(false);
    expect(errorRes.error).toEqual({
      code: 'AUTH_OTP_EXPIRED',
      message: 'รหัส OTP หมดอายุ',
    });
  });
});
