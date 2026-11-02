import { Injectable } from '@nestjs/common';
import { Socket } from 'net';

// บริการจัดการและตรวจสอบสถานะการเชื่อมต่อ Redis สำหรับระบบ OTP, Cache และ Queue
@Injectable()
export class RedisService {
  private readonly host: string;
  private readonly port: number;
  private readonly password: string;
  private readonly timeoutMs: number;

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
