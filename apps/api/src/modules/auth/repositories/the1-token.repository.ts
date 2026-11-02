import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface DecryptedThe1Token {
  readonly memberId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
}

// Repository สำหรับตาราง the1_token ที่เข้ารหัส access_token และ refresh_token ระดับ column ด้วย key จาก env
@Injectable()
export class The1TokenRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  // เข้ารหัส access_token และ refresh_token ก่อนบันทึกลงฐานข้อมูล รองรับ TransactionClient
  async saveToken(
    input: DecryptedThe1Token,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const encryptedAccess = this.encryptionService.encrypt(input.accessToken);
    const encryptedRefresh = this.encryptionService.encrypt(input.refreshToken);

    await db.the1Token.upsert({
      where: { memberId: input.memberId },
      create: {
        memberId: input.memberId,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt: input.expiresAt,
      },
      update: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt: input.expiresAt,
      },
    });
  }

  // อ่านข้อมูล Token และถอดรหัสกลับมาใช้งานใน Memory เท่านั้น
  async findByMemberId(
    memberId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DecryptedThe1Token | null> {
    const db = tx ?? this.prisma;
    const row = await db.the1Token.findUnique({
      where: { memberId },
    });
    if (!row) {
      return null;
    }

    return {
      memberId: row.memberId,
      accessToken: this.encryptionService.decrypt(row.accessToken),
      refreshToken: this.encryptionService.decrypt(row.refreshToken),
      expiresAt: row.expiresAt,
    };
  }

  // ค้นหา Token ทั้งหมดที่จะหมดอายุภายในเวลาที่กำหนด (เช่น ก่อนหมดเวลา 5 นาที) และถอดรหัสเพื่อนำไปต่ออายุ
  async findTokensExpiringBefore(
    thresholdDate: Date,
  ): Promise<DecryptedThe1Token[]> {
    const rows = await this.prisma.the1Token.findMany({
      where: {
        expiresAt: {
          lte: thresholdDate,
        },
      },
      orderBy: {
        expiresAt: 'asc',
      },
    });

    return rows.map((row) => ({
      memberId: row.memberId,
      accessToken: this.encryptionService.decrypt(row.accessToken),
      refreshToken: this.encryptionService.decrypt(row.refreshToken),
      expiresAt: row.expiresAt,
    }));
  }

  // ลบ Token ของสมาชิกเมื่อทำการ Logout หรือยกเลิกผูกบัญชี
  async deleteByMemberId(
    memberId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.the1Token.delete({
      where: { memberId },
    });
  }
}
