import { Brand, Mission, MissionProgress, Prisma, SpendingTxn } from '@prisma/client';
import {
  DomainEventBus,
  MISSION_COMPLETED_EVENT,
  SPENDING_RECORDED_EVENT,
} from '../../common/events/domain-event-bus';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogRepository } from '../audit/repositories/audit-log.repository';
import { SpendingTxnRepository } from '../integration/repositories/spending-txn.repository';
import { MissionController } from './mission.controller';
import { MissionRepository } from './repositories/mission.repository';
import { MissionEngineService } from './services/mission-engine.service';
import { MissionRuleEvaluator } from './services/mission-rule.evaluator';

// ชุดทดสอบสำหรับโมดูล Mission Engine ครบทั้ง 3 Rules, กรณีข้ามช่วงเวลา, บิลถูกยกเลิก (amount < 0), recompute และ /me/missions
describe('MissionEngineModule Unit & Integration Tests (3 Rules, Cross-Period, Negative Amount, Recompute & API)', () => {
  const evaluator = new MissionRuleEvaluator();
  const startAt = new Date('2026-11-01T00:00:00.000Z');
  const endAt = new Date('2026-11-30T23:59:59.000Z');

  it('Rule 1 (TOTAL_SPEND): ควรคำนวณยอดสะสมตามช่วงเวลา (DAY / MONTH / BROCHURE) และตัดรายการข้ามช่วงเวลาหรือหักยอดบิลที่ถูกยกเลิก (amount < 0)', () => {
    const brochureMission = {
      missionId: 'M-BROCHURE',
      rule: { type: 'TOTAL_SPEND' as const, periodType: 'BROCHURE' as const },
      target: 10000,
      startAt,
      endAt,
    };

    const resBrochure = evaluator.evaluate(brochureMission, [
      { txnId: 'T1', memberId: 'M1', store: 'TWD-BANGNA', amount: 6000, category: 'STEEL', sku: 'S1', txnAt: new Date('2026-11-05T10:00:00.000Z') },
      { txnId: 'T2', memberId: 'M1', store: 'TWD-BANGNA', amount: 5500, category: 'WOOD', sku: 'S2', txnAt: new Date('2026-11-10T10:00:00.000Z') },
      // บิลถูกยกเลิก (amount ติดลบ) ต้องหักยอดออก 2,000 บาท เหลือ 9,500 บาท (ยังไม่ครบ 10,000)
      { txnId: 'T3-CANCEL', memberId: 'M1', store: 'TWD-BANGNA', amount: -2000, category: 'WOOD', sku: 'S2', txnAt: new Date('2026-11-11T10:00:00.000Z') },
      // รายการข้ามช่วงเวลา (เดือนตุลาคม และเดือนธันวาคม) ต้องไม่ถูกนำมาคำนวณ
      { txnId: 'T-OUT-BEFORE', memberId: 'M1', store: 'TWD-BANGNA', amount: 9000, category: 'STEEL', sku: 'S1', txnAt: new Date('2026-10-31T23:59:59.000Z') },
      { txnId: 'T-OUT-AFTER', memberId: 'M1', store: 'TWD-BANGNA', amount: 9000, category: 'STEEL', sku: 'S1', txnAt: new Date('2026-12-01T00:00:00.000Z') },
    ]);

    expect(resBrochure.progress).toBe(9500);
    expect(resBrochure.isCompleted).toBe(false);

    // ทดสอบ periodType = DAY (นับเฉพาะวันที่ 2026-11-05 เท่านั้น)
    const dayMission = {
      missionId: 'M-DAY',
      rule: { type: 'TOTAL_SPEND' as const, periodType: 'DAY' as const, referenceDate: '2026-11-05T00:00:00.000Z' },
      target: 5000,
      startAt,
      endAt,
    };
    const resDay = evaluator.evaluate(dayMission, [
      { txnId: 'D1', memberId: 'M1', store: 'TWD-BANGNA', amount: 5200, category: 'STEEL', sku: 'S1', txnAt: new Date('2026-11-05T14:00:00.000Z') },
      { txnId: 'D2-OTHER-DAY', memberId: 'M1', store: 'TWD-BANGNA', amount: 4000, category: 'STEEL', sku: 'S1', txnAt: new Date('2026-11-06T08:00:00.000Z') },
    ]);
    expect(resDay.progress).toBe(5200);
    expect(resDay.isCompleted).toBe(true);
  });

  it('Rule 2 (FILTERED_SPEND) และ Rule 3 (PURCHASE_COUNT): ควรกรองตาม category, brand, SKU และลดจำนวนครั้งเมื่อบิลถูกยกเลิก (amount < 0)', () => {
    const filteredMission = {
      missionId: 'M-FILTERED',
      rule: { type: 'FILTERED_SPEND' as const, brand: 'TWD' as const, categories: ['CONSTRUCTION', 'TOOLS'], skus: ['SKU-TARGET-01'] },
      target: 5000,
      startAt,
      endAt,
    };

    const evalFiltered = evaluator.evaluate(filteredMission, [
      { txnId: 'F1', memberId: 'M1', store: 'TWD-RANGSIT', amount: 6000, category: 'CONSTRUCTION', sku: 'SKU-TARGET-01', txnAt: new Date('2026-11-03T10:00:00.000Z') },
      { txnId: 'F2-WRONG-BRAND', memberId: 'M1', store: 'BNB-RAMA2', amount: 5000, category: 'CONSTRUCTION', sku: 'SKU-TARGET-01', txnAt: new Date('2026-11-03T11:00:00.000Z') },
      { txnId: 'F3-WRONG-SKU', memberId: 'M1', store: 'TWD-RANGSIT', amount: 3000, category: 'CONSTRUCTION', sku: 'SKU-OTHER', txnAt: new Date('2026-11-03T12:00:00.000Z') },
      { txnId: 'F4-REFUND', memberId: 'M1', store: 'TWD-RANGSIT', amount: -500, category: 'CONSTRUCTION', sku: 'SKU-TARGET-01', txnAt: new Date('2026-11-04T10:00:00.000Z') },
    ]);
    expect(evalFiltered.progress).toBe(5500);
    expect(evalFiltered.isCompleted).toBe(true);

    const countMission = {
      missionId: 'M-COUNT',
      rule: { type: 'PURCHASE_COUNT' as const, brand: 'BNB' as const, minSpendPerTxn: 500 },
      target: 3,
      startAt,
      endAt,
    };
    const evalCount = evaluator.evaluate(countMission, [
      { txnId: 'C1', memberId: 'M1', store: 'BNB-BANGNA', amount: 800, category: 'DECOR', sku: 'K1', txnAt: new Date('2026-11-02T10:00:00.000Z') },
      { txnId: 'C2', memberId: 'M1', store: 'BNB-BANGNA', amount: 1200, category: 'DECOR', sku: 'K2', txnAt: new Date('2026-11-03T10:00:00.000Z') },
      { txnId: 'C3', memberId: 'M1', store: 'BNB-BANGNA', amount: 600, category: 'DECOR', sku: 'K3', txnAt: new Date('2026-11-04T10:00:00.000Z') },
      // บิลถูกยกเลิก 1 ครั้ง (-600) ต้องลดจำนวนครั้งจาก 3 เหลือ 2 ครั้ง
      { txnId: 'C4-VOID', memberId: 'M1', store: 'BNB-BANGNA', amount: -600, category: 'DECOR', sku: 'K3', txnAt: new Date('2026-11-05T10:00:00.000Z') },
    ]);
    expect(evalCount.progress).toBe(2);
    expect(evalCount.isCompleted).toBe(false);
  });

  it('ควรรับอีเวนต์ spending.recorded แบบ Idempotent, บันทึก completed_at, ส่ง mission.completed, รองรับ recompute(missionId) และให้บริการ GET /me/missions', async () => {
    const eventBus = new DomainEventBus();
    const missions = new Map<string, Mission>();
    const progresses = new Map<string, MissionProgress>();
    const txns: SpendingTxn[] = [];

    const activeMission: Mission = {
      missionId: 'MIS-001',
      name: 'ช้อปครบ 5,000 บาท รับ 200 คะแนน',
      rule: { type: 'TOTAL_SPEND', brand: 'TWD' },
      target: new Prisma.Decimal(5000),
      startAt,
      endAt,
      reward: { type: 'THE1_POINT', points: 200 },
      status: 'active',
    };
    missions.set(activeMission.missionId, activeMission);

    const prismaMock = {
      mission: {
        findMany: jest.fn(async () => Array.from(missions.values())),
        findUnique: jest.fn(async ({ where }: { where: { missionId: string } }) => missions.get(where.missionId) ?? null),
      },
      missionProgress: {
        findMany: jest.fn(async ({ where }: { where?: { memberId?: string; missionId?: string | { in: string[] } } }) =>
          Array.from(progresses.values()).filter((p) => {
            const matchMember = !where?.memberId || p.memberId === where.memberId;
            const matchMission =
              !where?.missionId ||
              (typeof where.missionId === 'string'
                ? p.missionId === where.missionId
                : where.missionId.in.includes(p.missionId));
            return matchMember && matchMission;
          }),
        ),
        findUnique: jest.fn(async ({ where }: { where: { memberId_missionId: { memberId: string; missionId: string } } }) =>
          progresses.get(`${where.memberId_missionId.memberId}:${where.memberId_missionId.missionId}`) ?? null,
        ),
        upsert: jest.fn(async ({ where, create, update }: { where: { memberId_missionId: { memberId: string; missionId: string } }; create: MissionProgress; update: Partial<MissionProgress> }) => {
          const key = `${where.memberId_missionId.memberId}:${where.memberId_missionId.missionId}`;
          const existing = progresses.get(key);
          const saved: MissionProgress = existing ? { ...existing, ...update } : { ...create, id: `mp-${progresses.size + 1}` };
          progresses.set(key, saved);
          return saved;
        }),
      },
      spendingTxn: {
        findMany: jest.fn(async ({ where }: { where?: { memberId?: string } }) =>
          txns.filter((t) => !where?.memberId || t.memberId === where.memberId),
        ),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;

    const engine = new MissionEngineService(
      new MissionRepository(prismaMock),
      new SpendingTxnRepository(prismaMock),
      evaluator,
      eventBus,
      new AuditLogRepository(prismaMock),
    );
    const controller = new MissionController(engine);

    const txnEvent = {
      eventName: SPENDING_RECORDED_EVENT,
      txnId: 'TXN-M-100',
      memberId: 'T1_MEM_001',
      store: 'TWD-BANGNA',
      amount: 5500,
      category: 'CONSTRUCTION',
      sku: 'SKU-1',
      txnAt: new Date('2026-11-10T10:00:00.000Z'),
      channel: 'PUSH' as const,
      occurredAt: new Date('2026-11-10T10:00:01.000Z'),
    };
    txns.push({ ...txnEvent, amount: new Prisma.Decimal(5500) });

    await eventBus.publish(SPENDING_RECORDED_EVENT, txnEvent);
    await eventBus.publish(SPENDING_RECORDED_EVENT, txnEvent);

    const completedEvents = eventBus.getPublishedEvents(MISSION_COMPLETED_EVENT);
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]).toMatchObject({
      missionId: 'MIS-001',
      memberId: 'T1_MEM_001',
      progress: 5500,
      target: 5000,
      reward: { type: 'THE1_POINT', points: 200 },
    });

    txns.push({
      txnId: 'TXN-M-200',
      memberId: 'T1_MEM_002',
      store: 'TWD-RAMA2',
      amount: new Prisma.Decimal(6200),
      category: 'TOOLS',
      sku: 'SKU-2',
      txnAt: new Date('2026-11-12T10:00:00.000Z'),
    });
    const recomputeRes = await engine.recompute('MIS-001');
    expect(recomputeRes.evaluatedMemberCount).toBe(2);
    expect(recomputeRes.newlyCompletedMemberIds).toEqual(['T1_MEM_002']);

    const req = { sessionUser: { jti: 's1', sub: 'T1_MEM_001', lineUid: 'U1', brand: Brand.TWD, type: 'access' as const, iat: 1, exp: 9999999999 } };
    const listRes = await controller.listMyMissions(req);
    expect(listRes.missions).toHaveLength(1);
    expect(listRes.missions[0].completed).toBe(true);

    const detailRes = await controller.getMyMissionById(req, 'MIS-001');
    expect(detailRes.progress).toBe(5500);
    expect(detailRes.progressPercent).toBe(100);
    engine.onModuleDestroy();
  });
});
