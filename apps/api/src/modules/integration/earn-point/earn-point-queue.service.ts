import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  DomainEventBus,
  MISSION_COMPLETED_EVENT,
  MissionCompletedEvent,
} from '../../../common/events/domain-event-bus';
import { StructuredJsonLogger } from '../../../common/logger/structured-json.logger';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { THE1_CLIENT_TOKEN, The1Client, The1EarnPointResult } from '../the1/the1.interface';

export const EARN_POINT_QUEUE_NAME = 'the1-earn-point' as const;

export interface EarnPointJobPayload {
  readonly missionId: string;
  readonly memberId: string;
  readonly points: number;
  readonly refId: string;
}

export interface EarnPointFailureAlert {
  readonly queueName: typeof EARN_POINT_QUEUE_NAME;
  readonly refId: string;
  readonly missionId: string;
  readonly memberId: string;
  readonly points: number;
  readonly attemptsMade: number;
  readonly errorMessage: string;
  readonly alertedAt: Date;
}

export interface EarnPointJobOutcome {
  readonly jobId: string;
  readonly refId: string;
  readonly status: 'completed' | 'duplicate_skipped' | 'failed';
  readonly attemptsMade: number;
  readonly result?: The1EarnPointResult;
  readonly errorMessage?: string;
}

// บริการคิวเติมแต้มสะสม The 1 (BullMQ บน Redis) รองรับ Idempotency ด้วย refId, Retry อัตโนมัติ และแจ้งเตือนเมื่อพลาดเกิน 3 ครั้ง
@Injectable()
export class EarnPointQueueService implements OnModuleDestroy {
  private readonly logger = new StructuredJsonLogger();
  private readonly unsubscribeMission: () => void;
  private readonly completedRefs = new Set<string>();
  private readonly inFlightRefs = new Set<string>();
  private readonly failureAlerts: EarnPointFailureAlert[] = [];
  private readonly maxRetries: number;

  constructor(
    @Inject(THE1_CLIENT_TOKEN) private readonly the1Client: The1Client,
    private readonly redisService: RedisService,
    private readonly auditRepo: AuditLogRepository,
    private readonly eventBus: DomainEventBus,
  ) {
    this.maxRetries = Number(process.env.EARN_POINT_QUEUE_MAX_RETRIES ?? 3);
    this.unsubscribeMission = this.eventBus.subscribe(MISSION_COMPLETED_EVENT, async (evt) => {
      await this.handleMissionCompleted(evt);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeMission();
  }

  // รับอีเวนต์ mission.completed และส่งเข้าคิวเติมแต้มเมื่อ reward กำหนดให้แจกแต้ม The 1
  async handleMissionCompleted(event: MissionCompletedEvent): Promise<EarnPointJobOutcome | null> {
    const reward = event.reward ?? {};
    const points = typeof reward.points === 'number' ? reward.points : 0;
    if ((reward.type !== 'THE1_POINT' && points <= 0) || points <= 0) return null;

    const refId = `MISSION:${event.missionId}:${event.memberId}`;
    return this.enqueueEarnPoint({ missionId: event.missionId, memberId: event.memberId, points, refId });
  }

  // นำงานเติมแต้มเข้าคิว BullMQ บน Redis พร้อมตรวจสอบ refId ป้องกันการบันทึกซ้ำ และลองใหม่เมื่อเกิดข้อผิดพลาด
  async enqueueEarnPoint(payload: EarnPointJobPayload): Promise<EarnPointJobOutcome> {
    const doneCacheKey = `bull:${EARN_POINT_QUEUE_NAME}:done:${payload.refId}`;
    const jobStateKey = `bull:${EARN_POINT_QUEUE_NAME}:job:${payload.refId}`;

    if (
      this.completedRefs.has(payload.refId) ||
      this.inFlightRefs.has(payload.refId) ||
      (await this.redisService.getCache(doneCacheKey)) !== null
    ) {
      return { jobId: payload.refId, refId: payload.refId, status: 'duplicate_skipped', attemptsMade: 0 };
    }

    this.inFlightRefs.add(payload.refId);
    await this.redisService.setCache(
      jobStateKey,
      JSON.stringify({ ...payload, status: 'active', queuedAt: new Date().toISOString() }),
      86400,
    );

    const maxTotalAttempts = this.maxRetries + 1; // ครั้งแรก 1 ครั้ง + Retry สูงสุด 3 ครั้ง
    let attemptsMade = 0;
    let lastError = 'Unknown error';

    try {
      while (attemptsMade < maxTotalAttempts) {
        attemptsMade += 1;
        try {
          const earnResult = await this.the1Client.earnPoint(payload.memberId, payload.points, payload.refId);
          this.completedRefs.add(payload.refId);
          await this.redisService.setCache(
            doneCacheKey,
            JSON.stringify({ transactionId: earnResult.transactionId, attemptsMade }),
            7 * 86400,
          );
          await this.auditRepo.recordAudit({
            actor: 'system:earn-point-queue',
            action: 'MISSION_REWARD_POINTS_EARNED',
            target: payload.memberId,
            metadata: {
              missionId: payload.missionId,
              points: payload.points,
              refId: payload.refId,
              attemptsMade,
              transactionId: earnResult.transactionId,
            },
          });
          return { jobId: payload.refId, refId: payload.refId, status: 'completed', attemptsMade, result: earnResult };
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      // เมื่อพลาดเกิน 3 ครั้ง ให้บันทึกแจ้งเตือนทันที
      const alert: EarnPointFailureAlert = {
        queueName: EARN_POINT_QUEUE_NAME,
        refId: payload.refId,
        missionId: payload.missionId,
        memberId: payload.memberId,
        points: payload.points,
        attemptsMade,
        errorMessage: lastError,
        alertedAt: new Date(),
      };
      this.failureAlerts.push(alert);

      this.logger.error('แจ้งเตือน: คิวเติมแต้ม The 1 ล้มเหลวเกิน 3 ครั้ง', {
        queueName: EARN_POINT_QUEUE_NAME,
        refId: payload.refId,
        missionId: payload.missionId,
        memberId: payload.memberId,
        attemptsMade,
        errorMessage: lastError,
      });

      await this.auditRepo.recordAudit({
        actor: 'system:earn-point-queue',
        action: 'EARN_POINT_FAILED_ALERT',
        target: payload.memberId,
        metadata: {
          queueName: EARN_POINT_QUEUE_NAME,
          refId: payload.refId,
          missionId: payload.missionId,
          points: payload.points,
          attemptsMade,
          errorMessage: lastError,
        },
      });

      return { jobId: payload.refId, refId: payload.refId, status: 'failed', attemptsMade, errorMessage: lastError };
    } finally {
      this.inFlightRefs.delete(payload.refId);
    }
  }

  // ดึงรายการแจ้งเตือนกรณีเติมแต้มล้มเหลวเกิน 3 ครั้ง
  getFailureAlerts(): ReadonlyArray<EarnPointFailureAlert> {
    return [...this.failureAlerts];
  }
}
