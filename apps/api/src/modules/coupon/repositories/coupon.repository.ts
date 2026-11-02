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

export type CouponWalletWithDetail = CouponWallet & { readonly coupon: Coupon };

// Repository สำหรับตาราง coupon และ coupon_wallet พร้อมรองรับการตัดสิทธิ์แบบ Atomic
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

  // สร้างหรือดึงข้อมูลคูปองตามรหัส code (Idempotent Upsert)
  async upsertCouponByCode(input: CreateCouponInput): Promise<Coupon> {
    const maxDiscountDec =
      input.maxDiscount !== undefined && input.maxDiscount !== null
        ? new Prisma.Decimal(input.maxDiscount)
        : null;
    return this.prisma.coupon.upsert({
      where: { code: input.code },
      create: {
        ...(input.couponId ? { couponId: input.couponId } : {}),
        code: input.code,
        source: input.source,
        type: input.type,
        value: new Prisma.Decimal(input.value),
        maxDiscount: maxDiscountDec,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
      update: {
        validTo: input.validTo,
      },
    });
  }

  // ค้นหาคูปองจาก couponId หรือ code
  async findCouponByIdOrCode(idOrCode: string): Promise<Coupon | null> {
    const byId = await this.prisma.coupon.findUnique({ where: { couponId: idOrCode } });
    if (byId) return byId;
    return this.prisma.coupon.findUnique({ where: { code: idOrCode } });
  }

  // ตรวจสอบว่าสมาชิกเคยได้รับคูปองรหัสนี้ในกระเป๋าแล้วหรือไม่
  async hasMemberReceivedCoupon(memberId: string, couponId: string): Promise<boolean> {
    const existing = await this.prisma.couponWallet.findMany({
      where: { memberId, couponId },
      take: 1,
    });
    return existing.length > 0;
  }

  // เพิ่มคูปองเข้ากระเป๋าของลูกค้าด้วยสถานะเริ่มต้น available
  async grantCouponToMember(memberId: string, couponId: string): Promise<CouponWallet> {
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

  // เปลี่ยนสถานะคูปองเป็น used แบบ Atomic (Compare-And-Swap เฉพาะแถวที่ยังเป็น available เท่านั้น)
  async redeemWalletCouponAtomically(
    walletId: string,
    memberId: string,
    usedAt: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.prisma.couponWallet.updateMany({
      where: {
        id: walletId,
        memberId,
        status: CouponWalletStatus.available,
      },
      data: {
        status: CouponWalletStatus.used,
        usedAt,
      },
    });
    return result.count === 1;
  }

  // ค้นหาคูปองในกระเป๋าของสมาชิกตาม walletId หรือ couponId
  async findMemberWalletItem(
    memberId: string,
    idOrCouponId: string,
  ): Promise<CouponWalletWithDetail | null> {
    const rows = await this.prisma.couponWallet.findMany({
      where: { memberId },
      include: { coupon: true },
    });
    return (
      rows.find((r) => r.id === idOrCouponId || r.couponId === idOrCouponId) ?? null
    );
  }

  // ดึงคูปองของลูกค้าตามสถานะ (available | used | expired หรือทั้งหมดหากไม่ระบุ)
  async findMemberCouponsByStatus(
    memberId: string,
    status?: CouponWalletStatus,
  ): Promise<CouponWalletWithDetail[]> {
    return this.prisma.couponWallet.findMany({
      where: {
        memberId,
        ...(status ? { status } : {}),
      },
      include: { coupon: true },
      orderBy: { coupon: { validFrom: 'desc' } },
    });
  }

  // ดึงคูปองที่พร้อมใช้งานของลูกค้า
  async findMemberAvailableCoupons(memberId: string): Promise<CouponWallet[]> {
    return this.prisma.couponWallet.findMany({
      where: { memberId, status: CouponWalletStatus.available },
      include: { coupon: true },
    });
  }

  // ดึงคูปองพร้อมใช้งานล่าสุดของลูกค้าพร้อมรายละเอียดคูปอง (สำหรับหน้า Home)
  async findLatestAvailableCouponsWithDetail(
    memberId: string,
    limit = 5,
  ): Promise<CouponWalletWithDetail[]> {
    const rows = await this.prisma.couponWallet.findMany({
      where: { memberId, status: CouponWalletStatus.available },
      include: { coupon: true },
      orderBy: { coupon: { validFrom: 'desc' } },
      take: limit,
    });
    return rows.slice(0, limit);
  }

  // เปลี่ยนสถานะคูปองที่หมดอายุแล้ว (validTo < now และยังเป็น available) ให้เป็น expired
  async expireOutdatedWalletCoupons(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.couponWallet.updateMany({
      where: {
        status: CouponWalletStatus.available,
        coupon: { validTo: { lt: now } },
      },
      data: {
        status: CouponWalletStatus.expired,
      },
    });
    return result.count;
  }
}
