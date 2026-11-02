import {
  AppEnvironment,
  BrandCode,
  ConsentType,
  CouponSource,
  CouponWalletStatus,
  HealthStatusDto,
  LineLinkStatus,
  MemberHomeResponseDto,
  MemberProfileResponseDto,
  MemberConsentResponseDto,
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

  it('ควรรองรับโครงสร้าง DTO ของหน้า Home, Profile และ Consent สำหรับใช้งานร่วมกับ LIFF', () => {
    const homeDto: MemberHomeResponseDto = {
      memberId: 'T1_MEM_001',
      brand: BrandCode.TWD,
      firstName: 'สมชาย',
      lastName: 'สร้างบ้าน',
      fullName: 'สมชาย สร้างบ้าน',
      tier: 'GOLD',
      points: { twd: 3500, bnb: 3500, total: 3500 },
      availableCoupons: [],
      activeMissions: [],
      stale: false,
      refreshed_at: '2026-11-02T10:00:00.000Z',
    };
    const profileDto: MemberProfileResponseDto = {
      memberId: 'T1_MEM_001',
      cardNumber: '7010000000001',
      firstName: 'สมชาย',
      lastName: 'สร้างบ้าน',
      fullName: 'สมชาย สร้างบ้าน',
      maskedPhone: '081-***-5678',
      maskedEmail: 'so***@thaiwatsadu.com',
      tier: 'GOLD',
      points: 3500,
      pointClaimHistory: [],
      stale: false,
      refreshed_at: '2026-11-02T10:00:00.000Z',
    };
    const consentDto: MemberConsentResponseDto = {
      memberId: 'T1_MEM_001',
      marketing: {
        type: ConsentType.MARKETING,
        version: 'v1.0',
        granted: true,
        updatedAt: '2026-11-02T10:00:00.000Z',
      },
      history: [],
    };
    expect(homeDto.stale).toBe(false);
    expect(profileDto.maskedPhone).toBe('081-***-5678');
    expect(consentDto.marketing?.granted).toBe(true);
  });
});
