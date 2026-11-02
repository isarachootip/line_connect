import {
  MemberMissionDetailDto,
  MemberMissionListResponseDto,
  MissionRuleConfig,
} from '@line-connect/shared';
import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Mission, MissionProgress } from '@prisma/client';
import {
  DomainEventBus,
  MISSION_COMPLETED_EVENT,
  SPENDING_RECORDED_EVENT,
  SpendingRecordedEvent,
} from '../../../common/events/domain-event-bus';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { SpendingTxnRepository } from '../../integration/repositories/spending-txn.repository';
import { MissionRepository } from '../repositories/mission.repository';
import { EvaluableSpendingTxn, MissionRuleEvaluator } from './mission-rule.evaluator';

export interface RecomputeMissionSummary {
  readonly missionId: string;
  readonly evaluatedMemberCount: number;
  readonly newlyCompletedMemberIds: readonly string[];
}

// บริการหลักของ Mission Engine: รับอีเวนต์ spending.recorded, อัปเดตความคืบหน้า, ส่ง mission.completed และคำนวณใหม่ (recompute)
@Injectable()
export class MissionEngineService implements OnModuleDestroy {
  private readonly unsubscribeSpending: () => void;
  private readonly memberTxnLedger = new Map<string, Map<string, EvaluableSpendingTxn>>();

  constructor(
    private readonly missionRepo: MissionRepository,
    private readonly spendingTxnRepo: SpendingTxnRepository,
    private readonly ruleEvaluator: MissionRuleEvaluator,
    private readonly eventBus: DomainEventBus,
    private readonly auditRepo: AuditLogRepository,
  ) {
    this.unsubscribeSpending = this.eventBus.subscribe(SPENDING_RECORDED_EVENT, async (evt) => {
      await this.handleSpendingRecorded(evt);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeSpending();
  }

  // ประมวลผลเมื่อได้รับอีเวนต์ spending.recorded อัปเดตเฉพาะ Mission ที่ active และอยู่ในช่วงเวลา
  async handleSpendingRecorded(event: SpendingRecordedEvent): Promise<void> {
    this.recordInMemoryTxn({
      txnId: event.txnId,
      memberId: event.memberId,
      store: event.store,
      amount: event.amount,
      category: event.category,
      sku: event.sku,
      txnAt: event.txnAt,
    });

    const activeMissions = await this.missionRepo.findActiveMissions(event.txnAt);
    for (const mission of activeMissions) {
      if (mission.status === 'active') {
        await this.evaluateAndPersistForMember(mission, event.memberId, event.txnAt);
      }
    }
  }

  // คำนวณความคืบหน้าของสมาชิกทุกคนในภารกิจที่ระบุใหม่ทั้งหมดจากตาราง spending_txn (Idempotent Recompute)
  async recompute(missionId: string): Promise<RecomputeMissionSummary> {
    const mission = await this.missionRepo.findMissionById(missionId);
    if (!mission) throw new NotFoundException(`ไม่พบภารกิจรหัส ${missionId}`);

    const [periodTxns, existingProgresses] = await Promise.all([
      this.spendingTxnRepo.findAllByPeriod(mission.startAt, mission.endAt),
      this.missionRepo.findAllProgressesByMission(missionId),
    ]);

    const txnsByMember = new Map<string, EvaluableSpendingTxn[]>();
    for (const prog of existingProgresses) txnsByMember.set(prog.memberId, []);
    for (const row of periodTxns) {
      const list = txnsByMember.get(row.memberId) ?? [];
      list.push(this.toEvaluableTxn(row));
      txnsByMember.set(row.memberId, list);
    }

    const newlyCompletedMemberIds: string[] = [];
    for (const [memberId, memberTxns] of txnsByMember.entries()) {
      const newlyCompleted = await this.applyEvaluatedProgress(mission, memberId, memberTxns, new Date());
      if (newlyCompleted) newlyCompletedMemberIds.push(memberId);
    }

    await this.auditRepo.recordAudit({
      actor: 'system:mission-engine',
      action: 'MISSION_RECOMPUTED',
      target: missionId,
      metadata: { evaluatedMemberCount: txnsByMember.size, newlyCompletedCount: newlyCompletedMemberIds.length },
    });

    return { missionId, evaluatedMemberCount: txnsByMember.size, newlyCompletedMemberIds };
  }

  // GET /me/missions — ดึงรายการภารกิจทั้งหมดพร้อมความคืบหน้าของสมาชิก
  async getMemberMissions(memberId: string): Promise<MemberMissionListResponseDto> {
    const missions = await this.missionRepo.findAllAvailableMissions();
    const progresses = await this.missionRepo.findMemberProgresses(
      memberId,
      missions.map((m) => m.missionId),
    );
    const progressMap = new Map(progresses.map((p) => [p.missionId, p]));
    return {
      memberId,
      missions: missions.map((m) => this.toMissionDetailDto(m, progressMap.get(m.missionId))),
    };
  }

  // GET /me/missions/:id — ดึงรายละเอียดภารกิจรายตัวพร้อมความคืบหน้าของสมาชิก
  async getMemberMissionById(memberId: string, missionId: string): Promise<MemberMissionDetailDto> {
    const mission = await this.missionRepo.findMissionById(missionId);
    if (!mission) throw new NotFoundException(`ไม่พบภารกิจรหัส ${missionId}`);
    const progress = await this.missionRepo.findProgressByMemberAndMission(memberId, missionId);
    return this.toMissionDetailDto(mission, progress ?? undefined);
  }

  private async evaluateAndPersistForMember(mission: Mission, memberId: string, referenceNow: Date): Promise<void> {
    const dbTxns = await this.spendingTxnRepo.findByMemberAndPeriod(memberId, mission.startAt, mission.endAt);
    const mergedMap = new Map<string, EvaluableSpendingTxn>();
    for (const row of dbTxns) mergedMap.set(row.txnId, this.toEvaluableTxn(row));
    const memoryTxns = this.memberTxnLedger.get(memberId);
    if (memoryTxns) {
      for (const [txnId, txn] of memoryTxns.entries()) {
        if (!mergedMap.has(txnId)) mergedMap.set(txnId, txn);
      }
    }
    await this.applyEvaluatedProgress(mission, memberId, Array.from(mergedMap.values()), referenceNow);
  }

  private async applyEvaluatedProgress(
    mission: Mission,
    memberId: string,
    txns: readonly EvaluableSpendingTxn[],
    referenceNow: Date,
  ): Promise<boolean> {
    const target = Number(mission.target);
    const rule = (mission.rule ?? {}) as MissionRuleConfig;
    const evalResult = this.ruleEvaluator.evaluate(
      { missionId: mission.missionId, rule, target, startAt: mission.startAt, endAt: mission.endAt },
      txns,
    );

    const existing = await this.missionRepo.findProgressByMemberAndMission(memberId, mission.missionId);
    const wasCompleted = Boolean(existing?.completedAt);
    const completedAt = evalResult.isCompleted ? (existing?.completedAt ?? referenceNow) : null;

    await this.missionRepo.upsertProgress({
      memberId,
      missionId: mission.missionId,
      progress: evalResult.progress,
      completedAt,
    });

    if (evalResult.isCompleted && !wasCompleted && completedAt) {
      await this.eventBus.publish(MISSION_COMPLETED_EVENT, {
        eventName: MISSION_COMPLETED_EVENT,
        missionId: mission.missionId,
        memberId,
        progress: evalResult.progress,
        target,
        reward: (mission.reward ?? {}) as Record<string, unknown>,
        completedAt,
      });
      return true;
    }
    return false;
  }

  private recordInMemoryTxn(txn: EvaluableSpendingTxn): void {
    const map = this.memberTxnLedger.get(txn.memberId) ?? new Map<string, EvaluableSpendingTxn>();
    if (!map.has(txn.txnId)) map.set(txn.txnId, txn);
    this.memberTxnLedger.set(txn.memberId, map);
  }

  private toEvaluableTxn(row: { txnId: string; memberId: string; store: string; amount: unknown; category: string; sku: string; txnAt: Date }): EvaluableSpendingTxn {
    return { txnId: row.txnId, memberId: row.memberId, store: row.store, amount: Number(row.amount), category: row.category, sku: row.sku, txnAt: row.txnAt };
  }

  private toMissionDetailDto(mission: Mission, progressRow?: MissionProgress): MemberMissionDetailDto {
    const targetNum = Number(mission.target);
    const progressNum = progressRow ? Number(progressRow.progress) : 0;
    const percent = targetNum > 0 ? Math.min(100, Math.round((progressNum / targetNum) * 100)) : 0;
    const completedAtIso = progressRow?.completedAt ? progressRow.completedAt.toISOString() : null;
    return {
      missionId: mission.missionId,
      name: mission.name,
      status: mission.status,
      rule: (mission.rule ?? {}) as MissionRuleConfig,
      reward: (mission.reward ?? {}) as Record<string, unknown>,
      target: targetNum,
      progress: progressNum,
      progressPercent: percent,
      completed: Boolean(completedAtIso),
      completedAt: completedAtIso,
      startAt: mission.startAt.toISOString(),
      endAt: mission.endAt.toISOString(),
    };
  }
}
