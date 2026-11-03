import { Controller, Get, Header } from '@nestjs/common';
import {
  MonitoringDashboardSummary,
  MonitoringService,
} from './monitoring.service';

// Controller สำหรับให้บริการข้อมูล Metric แก่ Prometheus (GET /metrics) และข้อมูลสรุป Dashboard (GET /monitoring/summary)
@Controller()
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  // GET /metrics — ส่งออก Metric ในรูปแบบ Prometheus Text Format
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getPrometheusMetrics(): string {
    return this.monitoringService.exportPrometheusMetrics();
  }

  // GET /monitoring/summary — สรุปค่า Request Rate, Error Rate, Latency, คิว Earn Point ค้าง และรายการ Alert
  @Get('monitoring/summary')
  getDashboardSummary(): MonitoringDashboardSummary {
    return this.monitoringService.getDashboardSummary();
  }
}
