import { BrandCode, ConsentType, CouponSource } from '../enums/brand.enum';

// ข้อมูลคะแนนสะสมแยกตามแบรนด์ไทวัสดุ (TWD) และ BnB Home (BNB)
export interface MemberBrandPointsDto {
  readonly twd: number;
  readonly bnb: number;
  readonly total: number;
}

// ข้อมูลคูปองพร้อมใช้งานสำหรับแสดงบนหน้า Home (สูงสุด 5 ใบล่าสุด)
export interface MemberHomeCouponDto {
  readonly walletId: string;
  readonly couponId: string;
  readonly code: string;
  readonly source: CouponSource;
  readonly type: string;
  readonly value: number;
  readonly maxDiscount: number | null;
  readonly validFrom: string;
  readonly validTo: string;
}

// ข้อมูลภารกิจ (Mission) ที่กำลังดำเนินการพร้อมความคืบหน้าสำหรับแสดงบนหน้า Home
export interface MemberHomeMissionDto {
  readonly missionId: string;
  readonly name: string;
  readonly target: number;
  readonly progress: number;
  readonly progressPercent: number;
  readonly completedAt: string | null;
  readonly startAt: string;
  readonly endAt: string;
}

// Response DTO สำหรับ GET /me/home (ใช้ร่วมกันระหว่าง Backend และ LIFF Frontend)
export interface MemberHomeResponseDto {
  readonly memberId: string;
  readonly brand: BrandCode;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly tier: string;
  readonly points: MemberBrandPointsDto;
  readonly availableCoupons: readonly MemberHomeCouponDto[];
  readonly activeMissions: readonly MemberHomeMissionDto[];
  readonly stale: boolean;
  readonly refreshed_at: string;
}

// รายการประวัติการรับหรือใช้คะแนนสะสมจาก The 1 (Point Claim Log)
export interface PointClaimHistoryItemDto {
  readonly claimId: string;
  readonly memberId: string;
  readonly points: number;
  readonly type: 'EARN' | 'REDEEM';
  readonly refId: string;
  readonly occurredAt: string;
}

// Response DTO สำหรับ GET /me/profile (ซ่อนข้อมูลเบอร์โทรและอีเมลบางส่วนตาม PDPA)
export interface MemberProfileResponseDto {
  readonly memberId: string;
  readonly cardNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly maskedPhone: string;
  readonly maskedEmail: string;
  readonly tier: string;
  readonly points: number;
  readonly pointClaimHistory: readonly PointClaimHistoryItemDto[];
  readonly stale: boolean;
  readonly refreshed_at: string;
}

// สถานะความยินยอมปัจจุบันของประเภทที่ระบุ
export interface ConsentStatusSummaryDto {
  readonly type: ConsentType;
  readonly version: string;
  readonly granted: boolean;
  readonly updatedAt: string;
}

// รายการประวัติความยินยอมแบบ Append-only
export interface ConsentHistoryEntryDto {
  readonly id: string;
  readonly type: ConsentType;
  readonly version: string;
  readonly grantedAt: string | null;
  readonly revokedAt: string | null;
}

// Response DTO สำหรับ GET /me/consent และ PUT /me/consent
export interface MemberConsentResponseDto {
  readonly memberId: string;
  readonly marketing: ConsentStatusSummaryDto | null;
  readonly history: readonly ConsentHistoryEntryDto[];
}

// Request DTO สำหรับ PUT /me/consent (เปลี่ยนความยินยอม MARKETING โดย insert แถวใหม่)
export interface UpdateMarketingConsentRequestDto {
  readonly granted: boolean;
  readonly version: string;
}
