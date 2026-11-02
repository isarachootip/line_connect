import { Injectable } from '@nestjs/common';
import { Brand } from '@prisma/client';

export const MEMBER_REGISTERED_EVENT = 'member.registered' as const;
export const SPENDING_RECORDED_EVENT = 'spending.recorded' as const;
export const MISSION_COMPLETED_EVENT = 'mission.completed' as const;

export interface MemberRegisteredEvent {
  readonly eventName: typeof MEMBER_REGISTERED_EVENT;
  readonly memberId: string;
  readonly lineUid: string;
  readonly brand: Brand;
  readonly occurredAt: Date;
}

export interface SpendingRecordedEvent {
  readonly eventName: typeof SPENDING_RECORDED_EVENT;
  readonly txnId: string;
  readonly memberId: string;
  readonly store: string;
  readonly amount: number;
  readonly category: string;
  readonly sku: string;
  readonly txnAt: Date;
  readonly channel: 'PUSH' | 'PULL';
  readonly occurredAt: Date;
}

export interface MissionCompletedEvent {
  readonly eventName: typeof MISSION_COMPLETED_EVENT;
  readonly missionId: string;
  readonly memberId: string;
  readonly progress: number;
  readonly target: number;
  readonly reward: Record<string, unknown>;
  readonly completedAt: Date;
}

export type DomainEventMap = {
  readonly [MEMBER_REGISTERED_EVENT]: MemberRegisteredEvent;
  readonly [SPENDING_RECORDED_EVENT]: SpendingRecordedEvent;
  readonly [MISSION_COMPLETED_EVENT]: MissionCompletedEvent;
};

export type DomainEventName = keyof DomainEventMap;

export type DomainEventHandler<K extends DomainEventName> = (
  payload: DomainEventMap[K],
) => Promise<void> | void;

// บริการรับ-ส่ง Domain Event ภายในระบบ เช่น member.registered และ spending.recorded สำหรับ Mission Engine & Coupon
@Injectable()
export class DomainEventBus {
  private readonly handlers = new Map<
    DomainEventName,
    Set<DomainEventHandler<DomainEventName>>
  >();
  private readonly publishedHistory: Array<DomainEventMap[DomainEventName]> =
    [];

  // ลงทะเบียนผู้รับฟัง (Subscriber) สำหรับอีเวนต์ที่ต้องการ
  subscribe<K extends DomainEventName>(
    eventName: K,
    handler: DomainEventHandler<K>,
  ): () => void {
    const existing =
      this.handlers.get(eventName) ??
      new Set<DomainEventHandler<DomainEventName>>();
    existing.add(handler as DomainEventHandler<DomainEventName>);
    this.handlers.set(eventName, existing);

    return () => {
      existing.delete(handler as DomainEventHandler<DomainEventName>);
    };
  }

  // ส่งอีเวนต์ไปยังทุก Subscriber ที่ลงทะเบียนไว้
  async publish<K extends DomainEventName>(
    eventName: K,
    payload: DomainEventMap[K],
  ): Promise<void> {
    this.publishedHistory.push(payload);
    const registeredHandlers = this.handlers.get(eventName);
    if (!registeredHandlers || registeredHandlers.size === 0) {
      return;
    }

    for (const handler of registeredHandlers) {
      await handler(payload);
    }
  }

  // ดึงประวัติอีเวนต์ที่ถูกส่งออกไปแล้ว (สำหรับการตรวจสอบและทดสอบ)
  getPublishedEvents<K extends DomainEventName>(
    eventName?: K,
  ): ReadonlyArray<DomainEventMap[K]> {
    if (!eventName) {
      return [...this.publishedHistory] as Array<DomainEventMap[K]>;
    }
    return this.publishedHistory.filter(
      (evt) => evt.eventName === eventName,
    ) as Array<DomainEventMap[K]>;
  }

  // ล้างประวัติอีเวนต์สำหรับการทดสอบ
  clearPublishedEvents(): void {
    this.publishedHistory.length = 0;
  }
}
