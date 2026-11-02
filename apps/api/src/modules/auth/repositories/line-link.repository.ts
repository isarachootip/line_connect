import { Injectable } from '@nestjs/common';
import { Brand, LineLink, LineLinkStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface LinkMemberParams {
  readonly lineUid: string;
  readonly memberId: string;
  readonly brand: Brand;
}

// Repository สำหรับจัดการตาราง line_link (ผูก LINE UID กับ The 1 Member ID แยกตามแบรนด์)
@Injectable()
export class LineLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ผูกบัญชีหรืออัปเดตสถานะกลับมาเป็น active ตาม unique (line_uid, brand) รองรับ TransactionClient
  async linkMember(
    params: LinkMemberParams,
    tx?: Prisma.TransactionClient,
  ): Promise<LineLink> {
    const db = tx ?? this.prisma;
    const now = new Date();
    return db.lineLink.upsert({
      where: {
        lineUid_brand: {
          lineUid: params.lineUid,
          brand: params.brand,
        },
      },
      create: {
        lineUid: params.lineUid,
        memberId: params.memberId,
        brand: params.brand,
        linkedAt: now,
        status: LineLinkStatus.active,
      },
      update: {
        memberId: params.memberId,
        linkedAt: now,
        status: LineLinkStatus.active,
      },
    });
  }

  // ค้นหาข้อมูลการผูกบัญชีจาก line_uid และ brand รองรับ TransactionClient
  async findByLineUidAndBrand(
    lineUid: string,
    brand: Brand,
    tx?: Prisma.TransactionClient,
  ): Promise<LineLink | null> {
    const db = tx ?? this.prisma;
    return db.lineLink.findUnique({
      where: {
        lineUid_brand: { lineUid, brand },
      },
    });
  }

  // ยกเลิกการผูกบัญชีโดยเปลี่ยนสถานะเป็น unlinked รองรับ TransactionClient
  async unlinkMember(
    lineUid: string,
    brand: Brand,
    tx?: Prisma.TransactionClient,
  ): Promise<LineLink> {
    const db = tx ?? this.prisma;
    return db.lineLink.update({
      where: {
        lineUid_brand: { lineUid, brand },
      },
      data: {
        status: LineLinkStatus.unlinked,
      },
    });
  }
}
