import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  SpendingBatchIngestSummary,
  SpendingIngestionService,
} from './spending-ingestion.service';
import {
  TWD_SPENDING_CLIENT_TOKEN,
  TwdSpendingClient,
} from './twd-spending.client';

export interface SpendingPullCycleResult {
  readonly skipped: boolean;
  readonly previousCursor: string | null;
  readonly nextCursor: string | null;
  readonly summary: SpendingBatchIngestSummary | null;
}

// Job สำหรับช่องทาง B (Pull): เรียก Get Spending ของไทวัสดุตามรอบเวลาที่กำหนดด้วย Cursor ล่าสุด
@Injectable()
export class SpendingPullJob implements OnModuleDestroy {
  public static readonly CURSOR_CACHE_KEY = 'twd_spending:pull_cursor';
  private static readonly CURSOR_TTL_SECONDS = 30 * 24 * 60 * 60;
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(TWD_SPENDING_CLIENT_TOKEN)
    private readonly twdSpendingClient: TwdSpendingClient,
    private readonly ingestionService: SpendingIngestionService,
    private readonly redisService: RedisService,
  ) {}

  // ดึงยอดใช้จ่ายจากไทวัสดุ 1 รอบโดยอ้างอิง Cursor ล่าสุดที่เก็บไว้ใน Redis
  async runPullCycle(): Promise<SpendingPullCycleResult> {
    const mode = (process.env.TWD_SPENDING_MODE ?? 'BOTH').toUpperCase();
    if (mode !== 'PULL' && mode !== 'BOTH') {
      return {
        skipped: true,
        previousCursor: null,
        nextCursor: null,
        summary: null,
      };
    }

    const previousCursor = await this.redisService.getCache(
      SpendingPullJob.CURSOR_CACHE_KEY,
    );
    const page = await this.twdSpendingClient.getSpending({
      cursor: previousCursor,
      limit: SpendingIngestionService.MAX_BATCH_SIZE,
    });

    const summary = await this.ingestionService.ingestBatch(
      page.items,
      'PULL',
    );

    if (page.nextCursor) {
      await this.redisService.setCache(
        SpendingPullJob.CURSOR_CACHE_KEY,
        page.nextCursor,
        SpendingPullJob.CURSOR_TTL_SECONDS,
      );
    }

    return {
      skipped: false,
      previousCursor,
      nextCursor: page.nextCursor,
      summary,
    };
  }

  // เริ่มรัน Job ตามรอบเวลาจาก TWD_SPENDING_PULL_INTERVAL_MINUTES
  startSchedule(
    intervalMinutes = Number(
      process.env.TWD_SPENDING_PULL_INTERVAL_MINUTES ?? 15,
    ),
  ): void {
    this.stopSchedule();
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    this.timerHandle = setInterval(() => {
      void this.runPullCycle();
    }, intervalMs);
  }

  stopSchedule(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  onModuleDestroy(): void {
    this.stopSchedule();
  }
}
