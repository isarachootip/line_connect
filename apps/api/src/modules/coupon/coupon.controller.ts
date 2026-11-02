import {
  MemberCouponListResponseDto,
  UseCouponResponseDto,
} from '@line-connect/shared';
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CouponWalletStatus } from '@prisma/client';
import { z } from 'zod';
import {
  AuthenticatedRequest,
  SessionAuthGuard,
} from '../auth/guards/session-auth.guard';
import { SessionJwtPayload } from '../auth/services/session-token.service';
import { CouponService } from './services/coupon.service';

const couponFilterSchema = z
  .enum([
    CouponWalletStatus.available,
    CouponWalletStatus.used,
    CouponWalletStatus.expired,
  ])
  .optional();

// Controller สำหรับให้บริการกระเป๋าคูปองและตัดสิทธิ์คูปองหน้าร้านแก่สมาชิก (/me/coupons)
@Controller('me/coupons')
@UseGuards(SessionAuthGuard)
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  // GET /me/coupons?status=available|used|expired — ดึงรายการคูปองของสมาชิก
  @Get()
  async listMyCoupons(
    @Req() req: AuthenticatedRequest,
    @Query('status') statusQuery?: string,
    @Query('filter') filterQuery?: string,
  ): Promise<MemberCouponListResponseDto> {
    const session = this.requireSession(req);
    const rawFilter = statusQuery ?? filterQuery;
    const parsed = couponFilterSchema.safeParse(rawFilter);
    if (!parsed.success) {
      throw new BadRequestException(
        'พารามิเตอร์กรองสถานะคูปองต้องเป็น available, used หรือ expired เท่านั้น',
      );
    }
    return this.couponService.getMemberCoupons(session.sub, parsed.data);
  }

  // POST /me/coupons/:id/use — เปลี่ยนสถานะคูปองเป็น used แบบ Atomic และคืนโค้ด/QR สำหรับหน้าร้าน
  @Post(':id/use')
  @HttpCode(HttpStatus.OK)
  async useMyCoupon(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<UseCouponResponseDto> {
    const session = this.requireSession(req);
    const trimmedId = id?.trim();
    if (!trimmedId) {
      throw new BadRequestException('กรุณาระบุรหัสคูปองที่ต้องการใช้งาน');
    }
    return this.couponService.useCoupon(session.sub, trimmedId);
  }

  private requireSession(req: AuthenticatedRequest): SessionJwtPayload {
    if (!req.sessionUser) {
      throw new UnauthorizedException('ไม่พบข้อมูล Session ของผู้ใช้งาน');
    }
    return req.sessionUser;
  }
}
