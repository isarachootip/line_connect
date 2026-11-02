import { Injectable } from '@nestjs/common';
import {
  Coupon,
  CouponSource,
  CouponWallet,
  CouponWalletStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface CreateCouponInput {
  readonly couponId?: string;
  readonly code: string;
  readonly source: CouponSource;
  readonly type: string;
  readonly value: number;
  readonly maxDiscount?: number | null;
  readonly validFrom: Date;
  readonly validTo: Date;
}

// Repository สำหรับตาราง coupon และ coupon_wallet
@Injectable()
export class CouponRepository {
  constructor(private readonly prisma: PrismaService) {}

  // สร้างคูปองใหม่ในระบบ
  async createCoupon(input: CreateCouponInput): Promise<Coupon> {
    return this.prisma.coupon.create({
      data: {
        ...(input.couponId ? { couponId: input.couponId } : {}),
        code: input.code,
        source: input.source,
        type: input.type,
        value: new Prisma.Decimal(input.value),
        maxDiscount:
          input.maxDiscount !== undefined && input.maxDiscount !== null
            ? new Prisma.Decimal(input.maxDiscount)
            : null,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
    });
  }

  // เพิ่มคูปองเข้ากระเป๋าของลูกค้าด้วยสถานะเริ่มต้น available
  async grantCouponToMember(
    memberId: string,
    couponId: string,
  ): Promise<CouponWallet> {
    return this.prisma.couponWallet.create({
      data: {
        memberId,
        couponId,
        status: CouponWalletStatus.available,
        usedAt: null,
      },
    });
  }

  // เปลี่ยนสถานะคูปองในกระเป๋าเป็น used พร้อมระบุเวลาที่ใช้งาน
  async markWalletCouponUsed(
    walletId: string,
    usedAt: Date = new Date(),
  ): Promise<CouponWallet> {
    return this.prisma.couponWallet.update({
      where: { id: walletId },
      data: {
        status: CouponWalletStatus.used,
        usedAt,
      },
    });
  }

  // ดึงคูปองที่พร้อมใช้งานของลูกค้า
  async findMemberAvailableCoupons(memberId: string): Promise<CouponWallet[]> {
    return this.prisma.couponWallet.findMany({
      where: {
        memberId,
        status: CouponWalletStatus.available,
      },
      include: { coupon: true },
    });
  }
}
