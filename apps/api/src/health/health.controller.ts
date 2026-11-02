import { Controller, Get } from '@nestjs/common';
import {
  HealthStatusDto,
  StandardApiResponse,
  createSuccessResponse,
} from '@line-connect/shared';
import { HealthService } from './health.service';

// คอนโทรลเลอร์สำหรับ Endpoint GET /health เพื่อตรวจสอบสถานะ DB และ Redis
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(): Promise<StandardApiResponse<HealthStatusDto>> {
    const statusDto = await this.healthService.checkHealth();
    return createSuccessResponse(statusDto);
  }
}
