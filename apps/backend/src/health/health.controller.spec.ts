import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { BrandCode } from '@line-connect/shared';

// ชุดทดสอบสำหรับตรวจสอบสถานะความพร้อมของระบบ (Health Check Endpoint)
describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('ควรคืนค่าสถานะของระบบ Line Connect พร้อมรายชื่อแบรนด์ที่รองรับ (TWD และ BNB)', () => {
    const response = controller.getHealth();

    expect(response.success).toBe(true);
    expect(response.data).not.toBeNull();
    expect(response.data?.status).toBe('ok');
    expect(response.data?.service).toBe('line-connect-bff');
    expect(response.data?.supportedBrands).toEqual([BrandCode.TWD, BrandCode.BNB]);
  });
});
