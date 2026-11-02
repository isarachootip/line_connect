import { Global, Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';

// โมดูลกลางสำหรับให้บริการ DomainEventBus ร่วมกันทุกโมดูล (Auth, Integration, Mission, Coupon)
@Global()
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class EventsModule {}
