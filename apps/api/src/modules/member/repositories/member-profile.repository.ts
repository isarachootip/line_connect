import { Injectable } from '@nestjs/common';
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

  // บันทึกหรืออัปเดตแคชโปรไฟล์สมาชิกโดยเข้ารหัส first_name และ last_name ก่อนลงฐานข้อมูล
  async upsertProfile(input: MemberProfileDto): Promise<void> {
    const encryptedFirst = this.encryptionService.encrypt(input.firstName);
    const encryptedLast = this.encryptionService.encrypt(input.lastName);
    const refreshedAt = input.refreshedAt ?? new Date();

    await this.prisma.memberProfile.upsert({
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

  // ดึงข้อมูลโปรไฟล์สมาชิกจากแคชพร้อมถอดรหัสชื่อ-นามสกุล
  async findByMemberId(memberId: string): Promise<MemberProfileDto | null> {
    const row = await this.prisma.memberProfile.findUnique({
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
