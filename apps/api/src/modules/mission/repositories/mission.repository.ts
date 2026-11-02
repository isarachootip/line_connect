import { Injectable } from '@nestjs/common';
import { Mission, MissionProgress, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface CreateMissionInput {
  readonly missionId?: string;
  readonly name: string;
  readonly rule: Prisma.InputJsonValue;
  readonly target: number;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reward: Prisma.InputJsonValue;
  readonly status: string;
}

export interface UpsertMissionProgressInput {
  readonly memberId: string;
  readonly missionId: string;
  readonly progress: number;
  readonly completedAt?: Date | null;
}

// Repository สำหรับตาราง mission และ mission_progress
@Injectable()
export class MissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  // สร้างแคมเปญภารกิจใหม่
  async createMission(input: CreateMissionInput): Promise<Mission> {
    return this.prisma.mission.create({
      data: {
        ...(input.missionId ? { missionId: input.missionId } : {}),
        name: input.name,
        rule: input.rule,
        target: new Prisma.Decimal(input.target),
        startAt: input.startAt,
        endAt: input.endAt,
        reward: input.reward,
        status: input.status,
      },
    });
  }

  // ดึงรายการภารกิจที่กำลังเปิดใช้งานในช่วงเวลาที่กำหนด
  async findActiveMissions(atDate: Date = new Date()): Promise<Mission[]> {
    return this.prisma.mission.findMany({
      where: {
        status: 'active',
        startAt: { lte: atDate },
        endAt: { gte: atDate },
      },
    });
  }

  // อัปเดตความคืบหน้าภารกิจของสมาชิกตาม unique (member_id, mission_id)
  async upsertProgress(
    input: UpsertMissionProgressInput,
  ): Promise<MissionProgress> {
    const decimalProgress = new Prisma.Decimal(input.progress);
    return this.prisma.missionProgress.upsert({
      where: {
        memberId_missionId: {
          memberId: input.memberId,
          missionId: input.missionId,
        },
      },
      create: {
        memberId: input.memberId,
        missionId: input.missionId,
        progress: decimalProgress,
        completedAt: input.completedAt ?? null,
      },
      update: {
        progress: decimalProgress,
        completedAt: input.completedAt ?? null,
      },
    });
  }
}
