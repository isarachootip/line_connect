import { Injectable } from '@nestjs/common';

export const THE1_ECOUPON_PROVIDER_TOKEN = Symbol('THE1_ECOUPON_PROVIDER_TOKEN');

export interface The1ECouponItem {
  readonly externalCouponId: string;
  readonly code: string;
  readonly title: string;
  readonly discountType: 'DISCOUNT_PERCENT' | 'DISCOUNT_AMOUNT';
  readonly value: number;
  readonly maxDiscount: number | null;
  readonly validFrom: Date;
  readonly validTo: Date;
  readonly status: 'available' | 'used' | 'expired';
}

export interface The1ECouponRedeemResult {
  readonly externalCouponId: string;
  readonly redemptionCode: string;
  readonly qrPayload: string;
  readonly redeemedAt: Date;
}

// อินเทอร์เฟซสำหรับเชื่อมต่อระบบ E-Coupon ของ The 1 (source = THE1) สำหรับ Phase 2–3
// TODO (Phase 2-3): รอยืนยัน API Specification และ Endpoint จริงจากทีม The 1 สำหรับดึง/แลก/ตัดสิทธิ์ E-Coupon (ห้ามเดา Endpoint จริง)
export interface The1ECouponProvider {
  listMemberECoupons(memberId: string): Promise<readonly The1ECouponItem[]>;
  issueECouponToMember(
    memberId: string,
    campaignCode: string,
    refId: string,
  ): Promise<The1ECouponItem>;
  redeemECoupon(
    memberId: string,
    externalCouponId: string,
  ): Promise<The1ECouponRedeemResult>;
}

// Mock / Placeholder สำหรับ The 1 E-Coupon ใน Phase 1 (ยังไม่ต้องเชื่อมต่อระบบภายนอกจริงจนกว่าจะเข้าสู่ Phase 2–3)
@Injectable()
export class NoopThe1ECouponProvider implements The1ECouponProvider {
  async listMemberECoupons(_memberId: string): Promise<readonly The1ECouponItem[]> {
    // TODO (Phase 2-3): เชื่อมต่อ API ดึงรายการ E-Coupon จาก The 1 เมื่อได้รับ Spec อย่างเป็นทางการ
    return [];
  }

  async issueECouponToMember(
    _memberId: string,
    campaignCode: string,
    refId: string,
  ): Promise<The1ECouponItem> {
    // TODO (Phase 2-3): เชื่อมต่อ API แจก E-Coupon จาก The 1 เมื่อได้รับ Spec อย่างเป็นทางการ
    const now = new Date();
    const validTo = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      externalCouponId: `THE1-ECPN-${refId}`,
      code: campaignCode,
      title: `The 1 E-Coupon (${campaignCode})`,
      discountType: 'DISCOUNT_AMOUNT',
      value: 100,
      maxDiscount: 100,
      validFrom: now,
      validTo,
      status: 'available',
    };
  }

  async redeemECoupon(
    memberId: string,
    externalCouponId: string,
  ): Promise<The1ECouponRedeemResult> {
    // TODO (Phase 2-3): เชื่อมต่อ API ตัดสิทธิ์ E-Coupon กับระบบ The 1 เมื่อได้รับ Spec อย่างเป็นทางการ
    const redeemedAt = new Date();
    const redemptionCode = `T1-${externalCouponId}`;
    return {
      externalCouponId,
      redemptionCode,
      qrPayload: `LINECONNECT:THE1_ECOUPON:${memberId}:${externalCouponId}`,
      redeemedAt,
    };
  }
}
