import { Module } from '@nestjs/common';
import { SpendingTxnRepository } from './repositories/spending-txn.repository';
import { TargetBatchRepository } from './repositories/target-batch.repository';

// โมดูล Integration สำหรับเชื่อมต่อ External API ของ The 1, ยอดใช้จ่ายไทวัสดุ และการส่งออก Batch File
@Module({
  providers: [SpendingTxnRepository, TargetBatchRepository],
  exports: [SpendingTxnRepository, TargetBatchRepository],
})
export class IntegrationModule {}
