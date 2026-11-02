import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface MemberProfileDto {
  readonly memberId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly tier: string;
  readonly points: number;
  readonly refreshedAt?: Date;
}

// Repository สำหรับตาราง member_profile (Cache โปรไฟล์จาก The 1 พร้อมเข้ารหัสชื่อ-นามสกุลตาม PDPA)
@Injectable()
export class MemberProfileRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  // บันทึกหรืออัปเดตแคชโปรไฟล์สมาชิกโดยเข้ารหัส first_name และ last_name ก่อนลงฐานข้อมูล รองรับ TransactionClient
  async upsertProfile(
    input: MemberProfileDto,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const encryptedFirst = this.encryptionService.encrypt(input.firstName);
    const encryptedLast = this.encryptionService.encrypt(input.lastName);
    const refreshedAt = input.refreshedAt ?? new Date();

    await db.memberProfile.upsert({
      where: { memberId: input.memberId },
      create: {
        memberId: input.memberId,
        firstName: encryptedFirst,
        lastName: encryptedLast,
        tier: input.tier,
        points: input.points,
        refreshedAt,
      },
      update: {
        firstName: encryptedFirst,
        lastName: encryptedLast,
        tier: input.tier,
        points: input.points,
        refreshedAt,
      },
    });
  }

  // ดึงข้อมูลโปรไฟล์สมาชิกจากแคชพร้อมถอดรหัสชื่อ-นามสกุล รองรับ TransactionClient
  async findByMemberId(
    memberId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MemberProfileDto | null> {
    const db = tx ?? this.prisma;
    const row = await db.memberProfile.findUnique({
      where: { memberId },
    });
    if (!row) {
      return null;
    }

    return {
      memberId: row.memberId,
      firstName: this.encryptionService.decrypt(row.firstName),
      lastName: this.encryptionService.decrypt(row.lastName),
      tier: row.tier,
      points: row.points,
      refreshedAt: row.refreshedAt,
    };
  }
}
