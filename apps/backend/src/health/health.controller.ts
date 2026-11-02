import { Controller, Get } from '@nestjs/common';
import {
  BrandCode,
  StandardApiResponse,
  createSuccessResponse,
} from '@line-connect/shared';

// โครงสร้างข้อมูลผลลัพธ์สำหรับตรวจสอบสถานะความพร้อมของระบบ
export interface HealthCheckPayload {
  readonly status: 'ok';
  readonly service: string;
  readonly supportedBrands: readonly BrandCode[];
}

// คอนโทรลเลอร์สำหรับตรวจสอบสถานะการทำงานของระบบ BFF (Health Check)
@Controller('api/v1/health')
export class HealthController {
  @Get()
  getHealth(): StandardApiResponse<HealthCheckPayload> {
    return createSuccessResponse({
      status: 'ok',
      service: 'line-connect-bff',
      supportedBrands: [BrandCode.TWD, BrandCode.BNB],
    });
  }
}
