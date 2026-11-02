import { Injectable } from '@nestjs/common';
import { Socket } from 'net';

interface InMemoryCacheEntry {
  readonly value: string;
  readonly expiresAtMs: number;
}

// บริการจัดการและตรวจสอบสถานะการเชื่อมต่อ Redis สำหรับระบบ OTP, Cache (member_profile 10 นาที) และ Queue
@Injectable()
export class RedisService {
  private readonly host: string;
  private readonly port: number;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly memoryCache = new Map<string, InMemoryCacheEntry>();

  constructor(
    host = process.env.REDIS_HOST ?? 'localhost',
    port = Number(process.env.REDIS_PORT ?? 6379),
    password = process.env.REDIS_PASSWORD ?? '',
    timeoutMs = 1500,
  ) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.timeoutMs = timeoutMs;
  }

  // บันทึกค่าลงแคชพร้อมกำหนดอายุ (TTL เป็นวินาที เช่น 600 วินาที = 10 นาที)
  async setCache(
    key: string,
    value: string,
    ttlSeconds: number,
    nowMs = Date.now(),
  ): Promise<void> {
    this.memoryCache.set(key, {
      value,
      expiresAtMs: nowMs + ttlSeconds * 1000,
    });
  }

  // อ่านค่าจากแคช หากหมดอายุแล้วจะลบออกและคืนค่า null
  async getCache(key: string, nowMs = Date.now()): Promise<string | null> {
    const entry = this.memoryCache.get(key);
    if (!entry) {
      return null;
    }
    if (nowMs >= entry.expiresAtMs) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  // ลบค่าออกจากแคชตามคีย์ที่ระบุ
  async deleteCache(key: string): Promise<void> {
    this.memoryCache.delete(key);
  }

  // ส่งคำสั่ง PING ไปยังเซิร์ฟเวอร์ Redis และตรวจสอบว่าได้รับ +PONG กลับมาหรือไม่
  async checkRedisHealth(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = new Socket();
      let settled = false;

      const finish = (result: boolean): void => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(result);
        }
      };

      socket.setTimeout(this.timeoutMs);
      socket.once('error', () => finish(false));
      socket.once('timeout', () => finish(false));

      socket.connect(this.port, this.host, () => {
        if (this.password) {
          socket.write(`AUTH ${this.password}\r\nPING\r\n`);
        } else {
          socket.write('PING\r\n');
        }
      });

      socket.on('data', (chunk: Buffer) => {
        const responseText = chunk.toString('utf8');
        if (responseText.includes('+PONG')) {
          finish(true);
        } else if (responseText.startsWith('-ERR') || responseText.startsWith('-NOAUTH')) {
          finish(false);
        }
      });
    });
  }
}
