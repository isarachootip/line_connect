import { Module } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { AuditModule } from '../audit/audit.module';
import {
  SFTP_CLIENT_TOKEN,
  SftpClient,
  SftpMockClient,
  SftpTransportClient,
} from './batch/sftp.client';
import { TargetBatchExportService } from './batch/target-batch-export.service';
import { EarnPointQueueService } from './earn-point/earn-point-queue.service';
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

// โมดูล Integration สำหรับเชื่อมต่อ External API ของ The 1, คิว Earn Point, ยอดใช้จ่ายไทวัสดุ และการส่งออก Batch File ผ่าน SFTP
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
    SftpMockClient,
    {
      provide: SFTP_CLIENT_TOKEN,
      inject: [SftpMockClient],
      useFactory: (mockSftp: SftpMockClient): SftpClient => {
        const useMock =
          (process.env.SFTP_USE_MOCK ?? 'true').toLowerCase() === 'true';
        return useMock
          ? mockSftp
          : new SftpTransportClient({
              host: process.env.SFTP_HOST ?? 'sftp-mock.thaiwatsadu.com',
              port: Number(process.env.SFTP_PORT ?? 22),
              username: process.env.SFTP_USER ?? 'twd_batch_user',
              privateKeyPath:
                process.env.SFTP_KEY_PATH ?? './secrets/id_ed25519_twd_sftp',
              remoteDir:
                process.env.SFTP_REMOTE_DIR ?? '/incoming/target-batches',
            });
      },
    },
    {
      provide: SpendingAuthVerifier,
      useFactory: () => new SpendingAuthVerifier(),
    },
    SpendingIngestionService,
    SpendingPullJob,
    EarnPointQueueService,
    TargetBatchExportService,
  ],
  exports: [
    The1Module,
    SpendingTxnRepository,
    SpendingDeadLetterRepository,
    TargetBatchRepository,
    SpendingIngestionService,
    SpendingPullJob,
    EarnPointQueueService,
    TargetBatchExportService,
    TWD_SPENDING_CLIENT_TOKEN,
    SFTP_CLIENT_TOKEN,
  ],
})
export class IntegrationModule {}
