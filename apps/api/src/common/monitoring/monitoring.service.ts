import { Injectable } from '@nestjs/common';

export interface MonitoringAlertItem {
  readonly code:
    | 'HIGH_ERROR_RATE_ALERT'
    | 'LOW_UPTIME_SLA_ALERT'
    | 'HIGH_LATENCY_P95_ALERT'
    | 'EARN_POINT_QUEUE_BACKLOG_ALERT';
  readonly severity: 'WARNING' | 'CRITICAL';
  readonly message: string;
  readonly currentValue: number;
  readonly thresholdValue: number;
}

export interface MonitoringDashboardSummary {
  readonly timestamp: string;
  readonly totalRequests: number;
  readonly errorRequests: number;
  readonly requestRatePerMinute: number;
  readonly errorRatePercent: number;
  readonly avgLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly earnPointQueuePendingCount: number;
  readonly earnPointQueueFailedCount: number;
  readonly uptimePercent: number;
  readonly alerts: readonly MonitoringAlertItem[];
}

// บริการเก็บและคำนวณ Metric สำหรับระบบ Monitoring, Dashboard และแจ้งเตือนเมื่อ Error Rate > 1% หรือ Uptime < 99.5%
@Injectable()
export class MonitoringService {
  public static readonly ERROR_RATE_THRESHOLD_PERCENT = 1.0;
  public static readonly UPTIME_SLA_THRESHOLD_PERCENT = 99.5;
  public static readonly LATENCY_P95_THRESHOLD_MS = 500;
  public static readonly EARN_POINT_BACKLOG_THRESHOLD = 100;

  private totalRequests = 0;
  private errorRequests = 0;
  private readonly latencySamplesMs: number[] = [];
  private earnPointPendingCount = 0;
  private earnPointFailedCount = 0;
  private totalHealthChecks = 0;
  private successfulHealthChecks = 0;
  private readonly startedAtMs = Date.now();

  // บันทึกผลการเรียกใช้งาน HTTP Request พร้อมความหน่วง (Latency) และรหัสสถานะ
  recordHttpRequest(statusCode: number, durationMs: number): void {
    this.totalRequests += 1;
    if (statusCode >= 500) {
      this.errorRequests += 1;
    }
    this.latencySamplesMs.push(Math.max(0, Math.round(durationMs * 100) / 100));
    if (this.latencySamplesMs.length > 5000) {
      this.latencySamplesMs.shift();
    }
  }

  // อัปเดตสถานะความพร้อมใช้งาน (Uptime Probe) สำหรับคำนวณ SLA 99.5%
  recordUptimeCheck(isHealthy: boolean): void {
    this.totalHealthChecks += 1;
    if (isHealthy) {
      this.successfulHealthChecks += 1;
    }
  }

  // อัปเดตจำนวนคิวเติมแต้ม The 1 ที่ค้างรอและที่ล้มเหลว
  updateEarnPointQueueMetrics(pendingCount: number, failedCount: number): void {
    this.earnPointPendingCount = Math.max(0, pendingCount);
    this.earnPointFailedCount = Math.max(0, failedCount);
  }

  // คำนวณสรุปข้อมูลสำหรับ Dashboard และประเมินเงื่อนไขการแจ้งเตือน (Alert Evaluation)
  getDashboardSummary(now: Date = new Date()): MonitoringDashboardSummary {
    const elapsedMinutes = Math.max(1, (now.getTime() - this.startedAtMs) / 60_000);
    const requestRatePerMinute =
      Math.round((this.totalRequests / elapsedMinutes) * 100) / 100;

    const errorRatePercent =
      this.totalRequests > 0
        ? Math.round((this.errorRequests / this.totalRequests) * 10000) / 100
        : 0;

    const avgLatencyMs =
      this.latencySamplesMs.length > 0
        ? Math.round(
            (this.latencySamplesMs.reduce((acc, v) => acc + v, 0) /
              this.latencySamplesMs.length) *
              100,
          ) / 100
        : 0;

    const p95LatencyMs = this.computeP95(this.latencySamplesMs);

    const uptimePercent =
      this.totalHealthChecks > 0
        ? Math.round(
            (this.successfulHealthChecks / this.totalHealthChecks) * 10000,
          ) / 100
        : 100;

    const alerts: MonitoringAlertItem[] = [];

    if (errorRatePercent > MonitoringService.ERROR_RATE_THRESHOLD_PERCENT) {
      alerts.push({
        code: 'HIGH_ERROR_RATE_ALERT',
        severity: 'CRITICAL',
        message: `อัตรา Error Rate สูงเกินเกณฑ์ (${errorRatePercent}% > ${MonitoringService.ERROR_RATE_THRESHOLD_PERCENT}%)`,
        currentValue: errorRatePercent,
        thresholdValue: MonitoringService.ERROR_RATE_THRESHOLD_PERCENT,
      });
    }

    if (uptimePercent < MonitoringService.UPTIME_SLA_THRESHOLD_PERCENT) {
      alerts.push({
        code: 'LOW_UPTIME_SLA_ALERT',
        severity: 'CRITICAL',
        message: `ค่า Uptime ต่ำกว่าเกณฑ์ SLA (${uptimePercent}% < ${MonitoringService.UPTIME_SLA_THRESHOLD_PERCENT}%)`,
        currentValue: uptimePercent,
        thresholdValue: MonitoringService.UPTIME_SLA_THRESHOLD_PERCENT,
      });
    }

    if (p95LatencyMs > MonitoringService.LATENCY_P95_THRESHOLD_MS) {
      alerts.push({
        code: 'HIGH_LATENCY_P95_ALERT',
        severity: 'WARNING',
        message: `ความหน่วง p95 สูงเกินเกณฑ์ (${p95LatencyMs} ms > ${MonitoringService.LATENCY_P95_THRESHOLD_MS} ms)`,
        currentValue: p95LatencyMs,
        thresholdValue: MonitoringService.LATENCY_P95_THRESHOLD_MS,
      });
    }

    if (
      this.earnPointPendingCount > MonitoringService.EARN_POINT_BACKLOG_THRESHOLD ||
      this.earnPointFailedCount > 0
    ) {
      alerts.push({
        code: 'EARN_POINT_QUEUE_BACKLOG_ALERT',
        severity: 'CRITICAL',
        message: `พบรายการคิวเติมแต้ม The 1 ค้าง (${this.earnPointPendingCount}) หรือล้มเหลว (${this.earnPointFailedCount})`,
        currentValue: this.earnPointPendingCount + this.earnPointFailedCount,
        thresholdValue: MonitoringService.EARN_POINT_BACKLOG_THRESHOLD,
      });
    }

    return {
      timestamp: now.toISOString(),
      totalRequests: this.totalRequests,
      errorRequests: this.errorRequests,
      requestRatePerMinute,
      errorRatePercent,
      avgLatencyMs,
      p95LatencyMs,
      earnPointQueuePendingCount: this.earnPointPendingCount,
      earnPointQueueFailedCount: this.earnPointFailedCount,
      uptimePercent,
      alerts,
    };
  }

  // ส่งออกข้อมูลในรูปแบบ Prometheus Exposition Format สำหรับให้ Prometheus ดึงข้อมูลผ่าน GET /metrics
  exportPrometheusMetrics(now: Date = new Date()): string {
    const summary = this.getDashboardSummary(now);
    return [
      '# HELP line_connect_requests_total จำนวนคำขอทั้งหมดในระบบ Line Connect',
      '# TYPE line_connect_requests_total counter',
      `line_connect_requests_total ${summary.totalRequests}`,
      '# HELP line_connect_error_rate_percent อัตราข้อผิดพลาด HTTP 5xx (ร้อยละ)',
      '# TYPE line_connect_error_rate_percent gauge',
      `line_connect_error_rate_percent ${summary.errorRatePercent}`,
      '# HELP line_connect_latency_p95_ms ความหน่วงที่ Percentile 95 (มิลลิวินาที)',
      '# TYPE line_connect_latency_p95_ms gauge',
      `line_connect_latency_p95_ms ${summary.p95LatencyMs}`,
      '# HELP line_connect_earn_point_queue_pending จำนวนคิวเติมแต้ม The 1 ที่ค้างรอ',
      '# TYPE line_connect_earn_point_queue_pending gauge',
      `line_connect_earn_point_queue_pending ${summary.earnPointQueuePendingCount}`,
      '# HELP line_connect_earn_point_queue_failed จำนวนคิวเติมแต้ม The 1 ที่ล้มเหลวเกินกำหนด',
      '# TYPE line_connect_earn_point_queue_failed gauge',
      `line_connect_earn_point_queue_failed ${summary.earnPointQueueFailedCount}`,
      '# HELP line_connect_uptime_percent ค่าความพร้อมใช้งานตามเกณฑ์ SLA (ร้อยละ)',
      '# TYPE line_connect_uptime_percent gauge',
      `line_connect_uptime_percent ${summary.uptimePercent}`,
    ].join('\n');
  }

  private computeP95(samples: readonly number[]): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
    );
    return sorted[index];
  }
}
