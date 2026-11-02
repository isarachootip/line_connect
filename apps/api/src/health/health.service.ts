import { Injectable } from '@nestjs/common';
import {
  AppEnvironment,
  HealthStatusDto,
} from '@line-connect/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

// บริการตรวจสอบความพร้อมของระบบฐานข้อมูลหลัก (PostgreSQL) และระบบแคช (Redis)
@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async checkHealth(): Promise<HealthStatusDto> {
    const [dbHealthy, redisHealthy] = await Promise.all([
      this.prismaService.checkDatabaseHealth(),
      this.redisService.checkRedisHealth(),
    ]);

    const rawEnv = process.env.APP_ENV;
    const environment =
      rawEnv === AppEnvironment.STAGING
        ? AppEnvironment.STAGING
        : rawEnv === AppEnvironment.PROD
          ? AppEnvironment.PROD
          : AppEnvironment.DEV;

    return {
      status: dbHealthy && redisHealthy ? 'up' : 'degraded',
      environment,
      dependencies: {
        database: dbHealthy ? 'up' : 'down',
        redis: redisHealthy ? 'up' : 'down',
      },
    };
  }
}
