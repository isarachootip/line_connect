import { Test, TestingModule } from '@nestjs/testing';
import { AppEnvironment } from '@line-connect/shared';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

// ชุดทดสอบสำหรับ Endpoint GET /health ที่ตรวจสอบสถานะการเชื่อมต่อทั้ง DB (PostgreSQL) และ Redis
describe('HealthController (GET /health)', () => {
  let controller: HealthController;
  let prismaService: { checkDatabaseHealth: jest.Mock<Promise<boolean>, []> };
  let redisService: { checkRedisHealth: jest.Mock<Promise<boolean>, []> };

  beforeEach(async () => {
    prismaService = {
      checkDatabaseHealth: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    };
    redisService = {
      checkRedisHealth: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('ควรคืนค่า status = up เมื่อทั้ง PostgreSQL และ Redis พร้อมใช้งาน', async () => {
    const response = await controller.getHealth();

    expect(response.success).toBe(true);
    expect(response.data?.status).toBe('up');
    expect(response.data?.environment).toBe(AppEnvironment.DEV);
    expect(response.data?.dependencies).toEqual({
      database: 'up',
      redis: 'up',
    });
    expect(prismaService.checkDatabaseHealth).toHaveBeenCalledTimes(1);
    expect(redisService.checkRedisHealth).toHaveBeenCalledTimes(1);
  });

  it('ควรคืนค่า status = degraded เมื่อฐานข้อมูลหรือ Redis ฝั่งใดฝั่งหนึ่งไม่สามารถเชื่อมต่อได้', async () => {
    redisService.checkRedisHealth.mockResolvedValueOnce(false);

    const response = await controller.getHealth();

    expect(response.success).toBe(true);
    expect(response.data?.status).toBe('degraded');
    expect(response.data?.dependencies).toEqual({
      database: 'up',
      redis: 'down',
    });
  });
});
