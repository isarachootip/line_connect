import { Injectable } from '@nestjs/common';
import { TargetBatch } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface CreateTargetBatchInput {
  readonly batchId?: string;
  readonly segment: string;
  readonly filePath: string;
  readonly rowCount: number;
  readonly sentAt?: Date | null;
}

// Repository สำหรับตาราง target_batch (บันทึกประวัติการสร้างและส่งไฟล์ Batch กลุ่มเป้าหมายกลับไทวัสดุ)
@Injectable()
export class TargetBatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  // สร้างรายการไฟล์ Batch ที่เตรียมส่งหรือส่งแล้ว
  async createBatchRecord(input: CreateTargetBatchInput): Promise<TargetBatch> {
    return this.prisma.targetBatch.create({
      data: {
        ...(input.batchId ? { batchId: input.batchId } : {}),
        segment: input.segment,
        filePath: input.filePath,
        rowCount: input.rowCount,
        sentAt: input.sentAt ?? null,
      },
    });
  }

  // อัปเดตเวลาที่ส่งไฟล์ Batch สำเร็จ
  async markBatchSent(
    batchId: string,
    sentAt: Date = new Date(),
  ): Promise<TargetBatch> {
    return this.prisma.targetBatch.update({
      where: { batchId },
      data: { sentAt },
    });
  }
}
