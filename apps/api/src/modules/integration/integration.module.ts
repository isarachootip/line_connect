import { Module } from '@nestjs/common';
import { SpendingTxnRepository } from './repositories/spending-txn.repository';
import { TargetBatchRepository } from './repositories/target-batch.repository';
import { The1Module } from './the1/the1.module';

// โมดูล Integration สำหรับเชื่อมต่อ External API ของ The 1, ยอดใช้จ่ายไทวัสดุ และการส่งออก Batch File
@Module({
  imports: [The1Module],
  providers: [SpendingTxnRepository, TargetBatchRepository],
  exports: [The1Module, SpendingTxnRepository, TargetBatchRepository],
})
export class IntegrationModule {}
