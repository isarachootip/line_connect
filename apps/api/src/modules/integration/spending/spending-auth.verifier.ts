import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export type SpendingAuthMode = 'HMAC' | 'MTLS';

export interface SpendingAuthOptions {
  readonly authMode: SpendingAuthMode;
  readonly hmacSecret: string;
  readonly allowedIps: readonly string[];
}

export interface PushAuthHeaders {
  readonly signature?: string;
  readonly clientCertVerified?: string;
}

// บริการตรวจสอบความปลอดภัยของช่องทาง Push (POST /integrations/spending) ด้วย IP Whitelist และ HMAC Signature หรือ mTLS
@Injectable()
export class SpendingAuthVerifier {
  private readonly authMode: SpendingAuthMode;
  private readonly hmacSecret: string;
  private readonly allowedIps: Set<string>;

  constructor(options?: Partial<SpendingAuthOptions>) {
    this.authMode =
      options?.authMode ??
      ((process.env.TWD_SPENDING_AUTH_MODE ?? 'HMAC').toUpperCase() as SpendingAuthMode);
    this.hmacSecret =
      options?.hmacSecret ??
      process.env.TWD_SPENDING_HMAC_SECRET ??
      'replace_with_strong_twd_spending_hmac_secret_32chars';

    const rawIps =
      options?.allowedIps ??
      (process.env.TWD_SPENDING_ALLOWED_IPS ?? '127.0.0.1,::1,10.0.0.1')
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean);
    this.allowedIps = new Set(rawIps);
  }

  // ตรวจสอบทั้ง IP Whitelist และการยืนยันตัวตนตามโหมดที่ตั้งค่าไว้ (HMAC หรือ mTLS)
  verifyPushRequest(
    clientIp: string,
    payload: unknown,
    headers: PushAuthHeaders,
  ): void {
    this.verifyIpAllowed(clientIp);

    if (this.authMode === 'MTLS') {
      this.verifyMtls(headers.clientCertVerified);
      return;
    }

    this.verifyHmacSignature(payload, headers.signature);
  }

  // ตรวจสอบว่า IP ต้นทางอยู่ในรายการที่อนุญาตหรือไม่
  verifyIpAllowed(clientIp: string): void {
    if (this.allowedIps.has('*')) {
      return;
    }
    const normalized = clientIp.replace(/^::ffff:/, '').trim();
    if (!this.allowedIps.has(normalized) && !this.allowedIps.has(clientIp.trim())) {
      throw new ForbiddenException(
        `ไม่อนุญาตให้เข้าถึงจาก IP ${normalized} (SPENDING_IP_FORBIDDEN)`,
      );
    }
  }

  // ตรวจสอบลายเซ็น HMAC-SHA256 ด้วย timingSafeEqual เพื่อป้องกัน Timing Attack
  verifyHmacSignature(payload: unknown, providedSignature?: string): void {
    if (!providedSignature || !providedSignature.trim()) {
      throw new UnauthorizedException(
        'ไม่พบลายเซ็น HMAC ใน Header x-twd-signature (MISSING_HMAC_SIGNATURE)',
      );
    }

    const cleanedSig = providedSignature
      .trim()
      .replace(/^sha256=/i, '');
    const expectedSig = this.computeHmacSignature(payload);

    const providedBuf = Buffer.from(cleanedSig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');

    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new UnauthorizedException(
        'ลายเซ็น HMAC Signature ไม่ถูกต้อง (INVALID_HMAC_SIGNATURE)',
      );
    }
  }

  // ตรวจสอบใบรับรอง mTLS จาก Reverse Proxy Header
  verifyMtls(clientCertVerified?: string): void {
    const normalized = (clientCertVerified ?? '').trim().toUpperCase();
    if (normalized !== 'SUCCESS' && normalized !== '1' && normalized !== 'TRUE') {
      throw new UnauthorizedException(
        'ไม่ผ่านการตรวจสอบใบรับรอง mTLS ของเครื่องลูกข่าย (INVALID_MTLS_CLIENT_CERT)',
      );
    }
  }

  // คำนวณค่า HMAC-SHA256 Hex จาก Payload JSON
  computeHmacSignature(payload: unknown): string {
    const serialized =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    return createHmac('sha256', this.hmacSecret)
      .update(serialized, 'utf8')
      .digest('hex');
  }
}
