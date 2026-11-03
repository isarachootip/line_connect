import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

describe('Prompt 15 — Monitoring Metrics, Dashboard & SLA Alert Evaluation', () => {
  it('ควรคำนวณ Request Rate, Error Rate, Latency p95, คิว Earn Point และส่งออก Prometheus Metrics ได้ถูกต้อง', () => {
    const service = new MonitoringService();
    const controller = new MonitoringController(service);

    for (let i = 0; i < 99; i += 1) {
      service.recordHttpRequest(200, 120);
    }
    service.recordHttpRequest(200, 380);
    service.recordUptimeCheck(true);
    service.updateEarnPointQueueMetrics(5, 0);

    const summary = controller.getDashboardSummary();
    expect(summary.totalRequests).toBe(100);
    expect(summary.errorRatePercent).toBe(0);
    expect(summary.p95LatencyMs).toBeLessThan(500);
    expect(summary.uptimePercent).toBe(100);
    expect(summary.alerts).toHaveLength(0);

    const promText = controller.getPrometheusMetrics();
    expect(promText).toContain('line_connect_requests_total 100');
    expect(promText).toContain('line_connect_earn_point_queue_pending 5');
  });

  it('ควรสร้าง Alert ทันทีเมื่อ Error Rate > 1%, Uptime < 99.5%, Latency p95 > 500ms หรือมีคิว Earn Point ค้าง/ล้มเหลว', () => {
    const service = new MonitoringService();

    // จำลองคำขอ 100 ครั้ง ล้มเหลว (500) 2 ครั้ง -> Error Rate = 2% (> 1%) และ Latency = 650ms (> 500ms)
    for (let i = 0; i < 98; i += 1) {
      service.recordHttpRequest(200, 650);
    }
    service.recordHttpRequest(500, 700);
    service.recordHttpRequest(503, 720);

    // จำลอง Uptime Check 100 ครั้ง ล้มเหลว 1 ครั้ง -> Uptime = 99.0% (< 99.5%)
    for (let i = 0; i < 99; i += 1) {
      service.recordUptimeCheck(true);
    }
    service.recordUptimeCheck(false);

    // จำลองคิว Earn Point ล้มเหลว 1 รายการ
    service.updateEarnPointQueueMetrics(15, 1);

    const summary = service.getDashboardSummary();
    expect(summary.errorRatePercent).toBe(2);
    expect(summary.uptimePercent).toBe(99);

    const alertCodes = summary.alerts.map((a) => a.code);
    expect(alertCodes).toContain('HIGH_ERROR_RATE_ALERT');
    expect(alertCodes).toContain('LOW_UPTIME_SLA_ALERT');
    expect(alertCodes).toContain('HIGH_LATENCY_P95_ALERT');
    expect(alertCodes).toContain('EARN_POINT_QUEUE_BACKLOG_ALERT');
  });
});
