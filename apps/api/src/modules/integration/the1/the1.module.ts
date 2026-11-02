import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { THE1_CLIENT_TOKEN, The1Client } from './the1.interface';
import { The1MockClient } from './the1-mock.client';
import { The1HttpClient } from './the1-http.client';
import { The1ResiliencePolicy } from './the1-resilience';
import { ResilientThe1Client } from './resilient-the1.client';

// โมดูลเชื่อมต่อระบบ The 1 Passport ที่สลับระหว่าง Mock Server และ HttpClient ตามค่า THE1_MOCK ใน env
@Module({
  imports: [AuditModule],
  providers: [
    The1MockClient,
    {
      provide: The1ResiliencePolicy,
      useFactory: () =>
        new The1ResiliencePolicy({
          timeoutMs: Number(process.env.THE1_TIMEOUT_MS ?? 5000),
          maxRetries: 3,
          baseDelayMs: 100,
          failureThreshold: 3,
          cooldownMs: 30000,
        }),
    },
    {
      provide: THE1_CLIENT_TOKEN,
      inject: [The1MockClient, The1ResiliencePolicy, AuditLogRepository],
      useFactory: (
        mockClient: The1MockClient,
        resilience: The1ResiliencePolicy,
        auditRepo: AuditLogRepository,
      ): The1Client => {
        const useMock =
          (process.env.THE1_MOCK ?? process.env.THE1_API_USE_MOCK ?? 'true')
            .toLowerCase() === 'true';

        const underlyingClient: The1Client = useMock
          ? mockClient
          : new The1HttpClient({
              baseUrl:
                process.env.THE1_BASE_URL ??
                process.env.THE1_API_BASE_URL ??
                'https://api-mock.the1.co.th',
              clientId: process.env.THE1_CLIENT_ID ?? '',
              clientSecret: process.env.THE1_CLIENT_SECRET ?? '',
            });

        return new ResilientThe1Client(underlyingClient, resilience, auditRepo);
      },
    },
  ],
  exports: [THE1_CLIENT_TOKEN],
})
export class The1Module {}
