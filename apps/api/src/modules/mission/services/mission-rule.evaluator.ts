import { MissionRuleConfig, MissionRuleType } from '@line-connect/shared';
import { Injectable } from '@nestjs/common';

export interface EvaluableSpendingTxn {
  readonly txnId: string;
  readonly memberId: string;
  readonly store: string;
  readonly amount: number;
  readonly category: string;
  readonly sku: string;
  readonly txnAt: Date;
}

export interface MissionEvaluationContext {
  readonly missionId: string;
  readonly rule: MissionRuleConfig;
  readonly target: number;
  readonly startAt: Date;
  readonly endAt: Date;
}

export interface MissionEvaluationResult {
  readonly progress: number;
  readonly isCompleted: boolean;
  readonly matchedTxnIds: readonly string[];
}

// บริการคำนวณเงื่อนไขภารกิจ (Pure Function) รองรับทั้ง 3 Rule ใน Phase 1, กรณีข้ามช่วงเวลา และบิลถูกยกเลิก (amount < 0)
@Injectable()
export class MissionRuleEvaluator {
  // คำนวณความคืบหน้าของภารกิจจากรายการธุรกรรมโดยตัด txnId ซ้ำออกอัตโนมัติ (Idempotent)
  evaluate(
    mission: MissionEvaluationContext,
    transactions: readonly EvaluableSpendingTxn[],
  ): MissionEvaluationResult {
    const uniqueTxns = this.deduplicateByTxnId(transactions);
    const matchingTxns = uniqueTxns.filter((txn) => this.matchesMissionCriteria(mission, txn));

    const ruleType = this.resolveRuleType(mission.rule);
    let rawProgress = 0;

    if (ruleType === 'PURCHASE_COUNT') {
      for (const txn of matchingTxns) {
        if (txn.amount > 0) rawProgress += 1;
        else if (txn.amount < 0) rawProgress -= 1;
      }
    } else {
      for (const txn of matchingTxns) {
        rawProgress += txn.amount;
      }
    }

    const clampedProgress = Math.max(0, Number(rawProgress.toFixed(2)));
    return {
      progress: clampedProgress,
      isCompleted: clampedProgress >= mission.target,
      matchedTxnIds: matchingTxns.map((t) => t.txnId),
    };
  }

  private resolveRuleType(rule: MissionRuleConfig): MissionRuleType {
    if (rule.type === 'PURCHASE_COUNT') return 'PURCHASE_COUNT';
    const hasFilter = Boolean(
      (rule.category && rule.category !== 'ALL') ||
        (rule.categories && rule.categories.length > 0) ||
        (rule.brand && rule.brand !== 'ALL') ||
        (rule.brands && rule.brands.length > 0) ||
        rule.sku ||
        (rule.skus && rule.skus.length > 0),
    );
    if (rule.type === 'FILTERED_SPEND' || hasFilter) return 'FILTERED_SPEND';
    return 'TOTAL_SPEND';
  }

  private matchesMissionCriteria(mission: MissionEvaluationContext, txn: EvaluableSpendingTxn): boolean {
    if (!this.isWithinPeriod(mission, txn.txnAt)) return false;

    const { rule } = mission;
    if (rule.minSpendPerTxn && rule.minSpendPerTxn > 0 && Math.abs(txn.amount) < rule.minSpendPerTxn) {
      return false;
    }

    return (
      this.matchesBrand(rule, txn.store) &&
      this.matchesStringFilter(rule.category, rule.categories, txn.category) &&
      this.matchesStringFilter(rule.sku, rule.skus, txn.sku)
    );
  }

  private isWithinPeriod(mission: MissionEvaluationContext, txnAt: Date): boolean {
    const t = txnAt.getTime();
    if (t < mission.startAt.getTime() || t > mission.endAt.getTime()) return false;

    const periodType = mission.rule.periodType ?? 'BROCHURE';
    const refDate = mission.rule.referenceDate ? new Date(mission.rule.referenceDate) : mission.startAt;

    if (periodType === 'DAY') {
      return (
        txnAt.getUTCFullYear() === refDate.getUTCFullYear() &&
        txnAt.getUTCMonth() === refDate.getUTCMonth() &&
        txnAt.getUTCDate() === refDate.getUTCDate()
      );
    }
    if (periodType === 'MONTH') {
      return (
        txnAt.getUTCFullYear() === refDate.getUTCFullYear() &&
        txnAt.getUTCMonth() === refDate.getUTCMonth()
      );
    }
    return true;
  }

  private matchesBrand(rule: MissionRuleConfig, store: string): boolean {
    const allowedBrands: string[] = [];
    if (rule.brand && rule.brand !== 'ALL') allowedBrands.push(rule.brand.toUpperCase());
    if (rule.brands) {
      for (const b of rule.brands) allowedBrands.push(b.toUpperCase());
    }
    if (allowedBrands.length === 0) return true;
    const upperStore = store.trim().toUpperCase();
    return allowedBrands.some(
      (b) => upperStore === b || upperStore.startsWith(`${b}-`) || upperStore.startsWith(`${b}_`),
    );
  }

  private matchesStringFilter(
    singleVal: string | undefined,
    listVal: readonly string[] | undefined,
    actual: string,
  ): boolean {
    const allowed: string[] = [];
    if (singleVal && singleVal.toUpperCase() !== 'ALL') allowed.push(singleVal.toUpperCase());
    if (listVal) {
      for (const item of listVal) {
        if (item.toUpperCase() !== 'ALL') allowed.push(item.toUpperCase());
      }
    }
    if (allowed.length === 0) return true;
    return allowed.includes(actual.trim().toUpperCase());
  }

  private deduplicateByTxnId(txns: readonly EvaluableSpendingTxn[]): EvaluableSpendingTxn[] {
    const map = new Map<string, EvaluableSpendingTxn>();
    for (const item of txns) {
      if (!map.has(item.txnId)) map.set(item.txnId, item);
    }
    return Array.from(map.values()).sort((a, b) => a.txnAt.getTime() - b.txnAt.getTime());
  }
}
