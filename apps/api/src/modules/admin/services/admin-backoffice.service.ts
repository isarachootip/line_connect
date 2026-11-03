import {
  AdminCouponSummaryDto,
  AdminMemberSearchResultDto,
  AdminMissionSummaryDto,
  AdminRole,
  AdminSsoLoginResponseDto,
  CouponSource as SharedCouponSource,
  MissionRuleConfig,
} from '@line-connect/shared';
import { Injectable } from '@nestjs/common';
import { CouponSource, Mission, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import {
  TargetBatchExportService,
  TargetBatchExportSummary,
  TargetSegmentCriteria,
} from '../../integration/batch/target-batch-export.service';
import { AdminAuthService } from '../guards/admin-auth.guard';
import { AdminMemberSearchService } from './admin-member-search.service';

export interface UpsertAdminMissionInput {
  readonly missionId?: string;
  readonly name: string;
  readonly rule: Record<string, unknown>;
  readonly target: number;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reward: Record<string, unknown>;
  readonly status?: 'active' | 'inactive';
}

export interface CreateAdminCouponInput {
  readonly couponId?: string;
  readonly code: string;
  readonly source: CouponSource;
  readonly type: string;
  readonly value: number;
  readonly maxDiscount?: number | null;
  readonly validFrom: Date;
  readonly validTo: Date;
}

// บริการหลักสำหรับระบบ Admin Backoffice: SSO, จัดการ Mission, จัดการคูปอง, Export Batch และบันทึก Audit Log ทุก Action
@Injectable()
export class AdminBackofficeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditRepo: AuditLogRepository,
    private readonly adminAuthService: AdminAuthService,
    private readonly batchExportService: TargetBatchExportService,
    private readonly memberSearchService: AdminMemberSearchService,
  ) {}

  // เข้าสู่ระบบด้วย SSO ขององค์กร และออก Admin JWT พร้อมบันทึก Audit Log
  async loginWithSso(ssoToken: string, requestedRole?: AdminRole): Promise<AdminSsoLoginResponseDto> {
    const user = await this.adminAuthService.verifyCorporateSsoToken({ ssoToken, requestedRole });
    const accessToken = this.adminAuthService.issueAdminToken(user);
    await this.auditRepo.recordAudit({
      actor: user.adminId,
      action: 'ADMIN_SSO_LOGIN',
      target: user.email,
      metadata: { role: user.role },
    });
    return { accessToken, user };
  }

  // ดึงรายการ Mission ทั้งหมดพร้อมยอดผู้เข้าร่วมและยอดผู้ทำสำเร็จ
  async listMissionsWithStats(actor: string): Promise<AdminMissionSummaryDto[]> {
    const [missions, progresses] = await Promise.all([
      this.prisma.mission.findMany({ orderBy: { startAt: 'desc' } }),
      this.prisma.missionProgress.findMany({}),
    ]);
    await this.auditRepo.recordAudit({
      actor,
      action: 'ADMIN_MISSIONS_VIEWED',
      target: 'mission',
      metadata: { missionCount: missions.length },
    });
    return missions.map((m) => {
      const mProgs = progresses.filter((p) => p.missionId === m.missionId);
      const completedCount = mProgs.filter((p) => p.completedAt !== null).length;
      return this.toMissionSummary(m, mProgs.length, completedCount);
    });
  }

  // สร้างแคมเปญ Mission ใหม่
  async createMission(actor: string, input: UpsertAdminMissionInput): Promise<AdminMissionSummaryDto> {
    const created = await this.prisma.mission.create({
      data: {
        ...(input.missionId ? { missionId: input.missionId } : {}),
        name: input.name,
        rule: input.rule as Prisma.InputJsonValue,
        target: new Prisma.Decimal(input.target),
        startAt: input.startAt,
        endAt: input.endAt,
        reward: input.reward as Prisma.InputJsonValue,
        status: input.status ?? 'active',
      },
    });
    await this.auditRepo.recordAudit({
      actor,
      action: 'ADMIN_MISSION_CREATED',
      target: created.missionId,
      metadata: { name: created.name, target: input.target, status: created.status },
    });
    return this.toMissionSummary(created, 0, 0);
  }

  // แก้ไขรายละเอียดแคมเปญ Mission
  async updateMission(actor: string, missionId: string, input: UpsertAdminMissionInput): Promise<AdminMissionSummaryDto> {
    const updated = await this.prisma.mission.update({
      where: { missionId },
      data: {
        name: input.name,
        rule: input.rule as Prisma.InputJsonValue,
        target: new Prisma.Decimal(input.target),
        startAt: input.startAt,
        endAt: input.endAt,
        reward: input.reward as Prisma.InputJsonValue,
        ...(input.status ? { status: input.status } : {}),
      },
    });
    const mProgs = await this.prisma.missionProgress.findMany({ where: { missionId } });
    const completedCount = mProgs.filter((p) => p.completedAt !== null).length;
    await this.auditRepo.recordAudit({
      actor,
      action: 'ADMIN_MISSION_UPDATED',
      target: missionId,
      metadata: { name: updated.name, target: input.target, status: updated.status },
    });
    return this.toMissionSummary(updated, mProgs.length, completedCount);
  }

  // เปิด/ปิดสถานะแคมเปญ Mission (active / inactive)
  async setMissionStatus(actor: string, missionId: string, status: 'active' | 'inactive'): Promise<AdminMissionSummaryDto> {
    const updated = await this.prisma.mission.update({ where: { missionId }, data: { status } });
    const mProgs = await this.prisma.missionProgress.findMany({ where: { missionId } });
    const completedCount = mProgs.filter((p) => p.completedAt !== null).length;
    await this.auditRepo.recordAudit({
      actor,
      action: 'ADMIN_MISSION_STATUS_CHANGED',
      target: missionId,
      metadata: { status },
    });
    return this.toMissionSummary(updated, mProgs.length, completedCount);
  }

  // สร้างชุดคูปองใหม่ กำหนดมูลค่า เพดานส่วนลด (maxDiscount) และวันหมดอายุ
  async createCouponSet(actor: string, input: CreateAdminCouponInput): Promise<AdminCouponSummaryDto> {
    const maxDec = input.maxDiscount !== undefined && input.maxDiscount !== null ? new Prisma.Decimal(input.maxDiscount) : null;
    const created = await this.prisma.coupon.create({
      data: {
        ...(input.couponId ? { couponId: input.couponId } : {}),
        code: input.code,
        source: input.source,
        type: input.type,
        value: new Prisma.Decimal(input.value),
        maxDiscount: maxDec,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
    });
    await this.auditRepo.recordAudit({
      actor,
      action: 'ADMIN_COUPON_CREATED',
      target: created.couponId,
      metadata: { code: created.code, value: input.value, maxDiscount: input.maxDiscount ?? null },
    });
    return {
      couponId: created.couponId,
      code: created.code,
      source: created.source as unknown as SharedCouponSource,
      type: created.type,
      value: Number(created.value),
      maxDiscount: created.maxDiscount !== null ? Number(created.maxDiscount) : null,
      validFrom: created.validFrom.toISOString(),
      validTo: created.validTo.toISOString(),
    };
  }

  // สร้าง Segment และสั่งส่งออก Batch File ผ่าน SFTP
  async exportSegmentBatch(actor: string, criteria: Omit<TargetSegmentCriteria, 'actor'>): Promise<TargetBatchExportSummary> {
    return this.batchExportService.exportTargetSegment({ ...criteria, actor });
  }

  // ค้นหาสมาชิกด้วย member_id (Mask PII) เพื่อช่วยฝ่ายบริการลูกค้า
  async searchMemberById(actor: string, memberId: string): Promise<AdminMemberSearchResultDto> {
    return this.memberSearchService.searchMemberById(actor, memberId);
  }

  private toMissionSummary(m: Mission, totalParticipants: number, completedCount: number): AdminMissionSummaryDto {
    return {
      missionId: m.missionId,
      name: m.name,
      status: m.status,
      rule: (m.rule ?? {}) as MissionRuleConfig,
      target: Number(m.target),
      reward: (m.reward ?? {}) as Record<string, unknown>,
      startAt: m.startAt.toISOString(),
      endAt: m.endAt.toISOString(),
      totalParticipants,
      completedCount,
    };
  }
}
