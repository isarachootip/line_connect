import { CouponSource, CouponWalletStatus } from '../enums/brand.enum';

// รายละเอียดคูปองในกระเป๋าของสมาชิกสำหรับแสดงในหน้า GET /me/coupons
export interface MemberCouponItemDto {
  readonly walletId: string;
  readonly couponId: string;
  readonly code: string;
  readonly source: CouponSource;
  readonly type: string;
  readonly value: number;
  readonly maxDiscount: number | null;
  readonly status: CouponWalletStatus;
  readonly usedAt: string | null;
  readonly validFrom: string;
  readonly validTo: string;
}

// Response DTO สำหรับ GET /me/coupons
export interface MemberCouponListResponseDto {
  readonly memberId: string;
  readonly filterStatus: CouponWalletStatus | null;
  readonly coupons: readonly MemberCouponItemDto[];
}

// Response DTO สำหรับ POST /me/coupons/:id/use (คืนโค้ดและ QR สำหรับสแกนหน้าร้าน)
export interface UseCouponResponseDto {
  readonly walletId: string;
  readonly couponId: string;
  readonly code: string;
  readonly status: CouponWalletStatus;
  readonly usedAt: string;
  readonly redemptionCode: string;
  readonly qrPayload: string;
}
