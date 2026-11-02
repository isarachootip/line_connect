import { Module } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { AuditModule } from '../audit/audit.module';
import { SpendingDeadLetterRepository } from './repositories/spending-dead-letter.repository';
import { SpendingTxnRepository } from './repositories/spending-txn.repository';
import { TargetBatchRepository } from './repositories/target-batch.repository';
import { SpendingAuthVerifier } from './spending/spending-auth.verifier';
import { SpendingIngestionService } from './spending/spending-ingestion.service';
import { SpendingPullJob } from './spending/spending-pull.job';
import { SpendingController } from './spending/spending.controller';
import {
  TWD_SPENDING_CLIENT_TOKEN,
  TwdSpendingClient,
  TwdSpendingHttpClient,
  TwdSpendingMockClient,
} from './spending/twd-spending.client';
import { The1Module } from './the1/the1.module';

// โมดูล Integration สำหรับเชื่อมต่อ External API ของ The 1, ยอดใช้จ่ายไทวัสดุ (Push & Pull) และการส่งออก Batch File
@Module({
  imports: [The1Module, AuditModule],
  controllers: [SpendingController],
  providers: [
    SpendingTxnRepository,
    SpendingDeadLetterRepository,
    TargetBatchRepository,
    {
      provide: RedisService,
      useFactory: () =>
        new RedisService(
          process.env.REDIS_HOST ?? 'localhost',
          Number(process.env.REDIS_PORT ?? 6379),
          process.env.REDIS_PASSWORD ?? '',
        ),
    },
    TwdSpendingMockClient,
    {
      provide: TWD_SPENDING_CLIENT_TOKEN,
      inject: [TwdSpendingMockClient],
      useFactory: (mockClient: TwdSpendingMockClient): TwdSpendingClient => {
        const useMock =
          (process.env.TWD_SPENDING_API_USE_MOCK ?? 'true').toLowerCase() ===
          'true';
        return useMock
          ? mockClient
          : new TwdSpendingHttpClient({
              baseUrl:
                process.env.TWD_SPENDING_API_BASE_URL ??
                'https://api-mock.thaiwatsadu.com',
              apiKey: process.env.TWD_SPENDING_API_KEY ?? '',
            });
      },
    },
    {
      provide: SpendingAuthVerifier,
      useFactory: () => new SpendingAuthVerifier(),
    },
    SpendingIngestionService,
    SpendingPullJob,
  ],
  exports: [
    The1Module,
    SpendingTxnRepository,
    SpendingDeadLetterRepository,
    TargetBatchRepository,
    SpendingIngestionService,
    SpendingPullJob,
    TWD_SPENDING_CLIENT_TOKEN,
  ],
})
export class IntegrationModule {}
