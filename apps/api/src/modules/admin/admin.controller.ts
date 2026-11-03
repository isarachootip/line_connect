import {
  AdminCouponSummaryDto,
  AdminMemberSearchResultDto,
  AdminMissionSummaryDto,
  AdminRole,
  AdminSsoLoginResponseDto,
} from '@line-connect/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Brand, CouponSource } from '@prisma/client';
import { z } from 'zod';
import { TargetBatchExportSummary } from '../integration/batch/target-batch-export.service';
import {
  AdminAuthenticatedRequest,
  AdminAuthGuard,
  RequireAdminRoles,
} from './guards/admin-auth.guard';
import { AdminBackofficeService } from './services/admin-backoffice.service';

const ssoLoginSchema = z.object({
  ssoToken: z.string().min(1),
  requestedRole: z.nativeEnum(AdminRole).optional(),
});

const upsertMissionSchema = z.object({
  missionId: z.string().min(1).optional(),
  name: z.string().min(1),
  rule: z.record(z.unknown()),
  target: z.number().positive(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  reward: z.record(z.unknown()),
  status: z.enum(['active', 'inactive']).optional(),
});

const statusToggleSchema = z.object({ status: z.enum(['active', 'inactive']) });

const createCouponSchema = z.object({
  couponId: z.string().min(1).optional(),
  code: z.string().min(1),
  source: z.nativeEnum(CouponSource).default(CouponSource.TWD),
  type: z.string().min(1),
  value: z.number().positive(),
  maxDiscount: z.number().positive().nullable().optional(),
  validFrom: z.string().min(1),
  validTo: z.string().min(1),
});

const exportBatchSchema = z.object({
  segment: z.string().min(1),
  completedMissionId: z.string().min(1).optional(),
  minTotalSpend: z.number().nonnegative().optional(),
  brand: z.nativeEnum(Brand).optional(),
});

// Controller สำหรับระบบ Admin Backoffice: SSO Login, จัดการ Mission, จัดการคูปอง, สั่ง Export Batch และค้นหาสมาชิก
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminBackofficeService) {}

  // POST /admin/auth/sso — เข้าสู่ระบบด้วย SSO ขององค์กร (เช่น Azure AD)
  @Post('auth/sso')
  @HttpCode(HttpStatus.OK)
  async loginSso(@Body() body: unknown): Promise<AdminSsoLoginResponseDto> {
    const parsed = ssoLoginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('ข้อมูล SSO Login ไม่ถูกต้อง');
    return this.adminService.loginWithSso(parsed.data.ssoToken, parsed.data.requestedRole);
  }

  // GET /admin/missions — ดูรายการ Mission และยอดผู้ทำสำเร็จ (ADMIN, MARKETING, VIEWER)
  @Get('missions')
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles(AdminRole.ADMIN, AdminRole.MARKETING, AdminRole.VIEWER)
  async listMissions(@Req() req: AdminAuthenticatedRequest): Promise<AdminMissionSummaryDto[]> {
    return this.adminService.listMissionsWithStats(this.requireActor(req));
  }

  // POST /admin/missions — สร้างแคมเปญ Mission ใหม่ (เฉพาะ ADMIN และ MARKETING)
  @Post('missions')
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles(AdminRole.ADMIN, AdminRole.MARKETING)
  async createMission(@Req() req: AdminAuthenticatedRequest, @Body() body: unknown): Promise<AdminMissionSummaryDto> {
    const parsed = upsertMissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('ข้อมูลสำหรับการสร้าง Mission ไม่ถูกต้อง');
    return this.adminService.createMission(this.requireActor(req), {
      ...parsed.data,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
    });
  }

  // PUT /admin/missions/:id — แก้ไขแคมเปญ Mission (เฉพาะ ADMIN และ MARKETING)
  @Put('missions/:id')
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles(AdminRole.ADMIN, AdminRole.MARKETING)
  async updateMission(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') missionId: string,
    @Body() body: unknown,
  ): Promise<AdminMissionSummaryDto> {
    const parsed = upsertMissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('ข้อมูลสำหรับการแก้ไข Mission ไม่ถูกต้อง');
    return this.adminService.updateMission(this.requireActor(req), missionId, {
      ...parsed.data,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
    });
  }

  // PATCH /admin/missions/:id/status — เปิด/ปิดแคมเปญ Mission (เฉพาะ ADMIN และ MARKETING)
  @Patch('missions/:id/status')
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles(AdminRole.ADMIN, AdminRole.MARKETING)
  async setMissionStatus(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id') missionId: string,
    @Body() body: unknown,
  ): Promise<AdminMissionSummaryDto> {
    const parsed = statusToggleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('สถานะของ Mission ต้องเป็น active หรือ inactive');
    return this.adminService.setMissionStatus(this.requireActor(req), missionId, parsed.data.status);
  }

  // POST /admin/coupons — สร้างชุดคูปอง กำหนดมูลค่า เพดาน และวันหมดอายุ (เฉพาะ ADMIN และ MARKETING)
  @Post('coupons')
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles(AdminRole.ADMIN, AdminRole.MARKETING)
  async createCoupon(@Req() req: AdminAuthenticatedRequest, @Body() body: unknown): Promise<AdminCouponSummaryDto> {
    const parsed = createCouponSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('ข้อมูลสำหรับการสร้างชุดคูปองไม่ถูกต้อง');
    return this.adminService.createCouponSet(this.requireActor(req), {
      ...parsed.data,
      validFrom: new Date(parsed.data.validFrom),
      validTo: new Date(parsed.data.validTo),
    });
  }

  // POST /admin/batches/export — สร้าง Segment และสั่งส่งออก Batch File ผ่าน SFTP (เฉพาะ ADMIN และ MARKETING)
  @Post('batches/export')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles(AdminRole.ADMIN, AdminRole.MARKETING)
  async exportSegmentBatch(@Req() req: AdminAuthenticatedRequest, @Body() body: unknown): Promise<TargetBatchExportSummary> {
    const parsed = exportBatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('ข้อมูลเงื่อนไข Segment สำหรับ Export Batch ไม่ถูกต้อง');
    return this.adminService.exportSegmentBatch(this.requireActor(req), parsed.data);
  }

  // GET /admin/members/:memberId — ค้นหาสมาชิกด้วย member_id แบบ Mask ข้อมูลส่วนบุคคล (ADMIN, MARKETING, VIEWER)
  @Get('members/:memberId')
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles(AdminRole.ADMIN, AdminRole.MARKETING, AdminRole.VIEWER)
  async searchMember(@Req() req: AdminAuthenticatedRequest, @Param('memberId') memberId: string): Promise<AdminMemberSearchResultDto> {
    return this.adminService.searchMemberById(this.requireActor(req), memberId.trim());
  }

  private requireActor(req: AdminAuthenticatedRequest): string {
    if (!req.adminUser) throw new UnauthorizedException('ไม่พบข้อมูลผู้ดูแลระบบใน Session');
    return `admin:${req.adminUser.adminId}:${req.adminUser.role}`;
  }
}
