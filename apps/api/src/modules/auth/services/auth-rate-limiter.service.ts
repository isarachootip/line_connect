import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

export interface AuthRateLimitOptions {
  readonly maxPerIp: number;
  readonly maxPerLineUid: number;
  readonly windowMs: number;
}

// บริการจำกัดอัตราการเรียกใช้งาน (Rate Limit) สำหรับ /auth/* แยกตาม IP Address และตาม line_uid
@Injectable()
export class AuthRateLimiterService {
  private readonly ipBuckets = new Map<string, RateLimitBucket>();
  private readonly lineUidBuckets = new Map<string, RateLimitBucket>();
  private readonly maxPerIp: number;
  private readonly maxPerLineUid: number;
  private readonly windowMs: number;

  constructor(options?: Partial<AuthRateLimitOptions>) {
    this.maxPerIp =
      options?.maxPerIp ?? Number(process.env.AUTH_RATE_LIMIT_PER_IP ?? 20);
    this.maxPerLineUid =
      options?.maxPerLineUid ??
      Number(process.env.AUTH_RATE_LIMIT_PER_LINE_UID ?? 10);
    const windowSec = Number(process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ?? 60);
    this.windowMs = options?.windowMs ?? windowSec * 1000;
  }

  // ตรวจสอบและนับจำนวนการเรียกต่อ IP หากเกินขีดจำกัดจะโยน HTTP 429 Too Many Requests
  consumeIp(ipAddress: string, nowMs = Date.now()): void {
    const normalizedIp = ipAddress.trim() || 'unknown-ip';
    this.consumeFromMap(
      this.ipBuckets,
      normalizedIp,
      this.maxPerIp,
      nowMs,
      'AUTH_RATE_LIMIT_IP_EXCEEDED',
      'จำนวนคำขอจาก IP นี้เกินขีดจำกัด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
    );
  }

  // ตรวจสอบและนับจำนวนการเรียกต่อ line_uid หากเกินขีดจำกัดจะโยน HTTP 429 Too Many Requests
  consumeLineUid(lineUid: string, nowMs = Date.now()): void {
    const normalizedUid = lineUid.trim();
    if (!normalizedUid) {
      return;
    }
    this.consumeFromMap(
      this.lineUidBuckets,
      normalizedUid,
      this.maxPerLineUid,
      nowMs,
      'AUTH_RATE_LIMIT_LINE_UID_EXCEEDED',
      'จำนวนคำขอสำหรับบัญชี LINE นี้เกินขีดจำกัด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
    );
  }

  // ล้างข้อมูลตัวนับทั้งหมด (สำหรับการทดสอบ)
  resetAll(): void {
    this.ipBuckets.clear();
    this.lineUidBuckets.clear();
  }

  private consumeFromMap(
    store: Map<string, RateLimitBucket>,
    key: string,
    limit: number,
    nowMs: number,
    errorCode: string,
    message: string,
  ): void {
    const existing = store.get(key);
    if (!existing || nowMs >= existing.resetAtMs) {
      store.set(key, {
        count: 1,
        resetAtMs: nowMs + this.windowMs,
      });
      return;
    }

    if (existing.count >= limit) {
      throw new HttpException(
        {
          code: errorCode,
          message,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((existing.resetAtMs - nowMs) / 1000),
          ),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
  }
}
