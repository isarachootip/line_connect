import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Brand } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

export type SessionTokenType = 'access' | 'refresh' | 'linking_state';

export interface SessionJwtPayload {
  readonly jti: string;
  readonly sub: string;
  readonly lineUid: string;
  readonly brand: Brand;
  readonly type: SessionTokenType;
  readonly iat: number;
  readonly exp: number;
}

export interface IssuedSessionTokens {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
}

// บริการออกและตรวจสอบ Session JWT (อายุสั้น), Refresh Token, State Token และจัดการเพิกถอน Session (Revocation)
@Injectable()
export class SessionTokenService {
  private readonly jwtSecret: string;
  private readonly accessExpiresSeconds: number;
  private readonly refreshExpiresSeconds: number;
  private readonly revokedSessions = new Set<string>();

  constructor(
    jwtSecret = process.env.JWT_SECRET ??
      'default_jwt_secret_for_line_connect_at_least_32_chars',
    accessExpiresSeconds = Number(
      process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 900,
    ),
    refreshExpiresSeconds = Number(
      process.env.JWT_REFRESH_EXPIRES_SECONDS ?? 604800,
    ),
  ) {
    this.jwtSecret = jwtSecret;
    this.accessExpiresSeconds = accessExpiresSeconds;
    this.refreshExpiresSeconds = refreshExpiresSeconds;
  }

  // ออกคู่ Session JWT (อายุสั้น) และ Refresh Token ที่ใช้ sessionId (jti) ร่วมกันเพื่อเพิกถอนพร้อมกันได้
  issueSessionTokens(params: {
    memberId: string;
    lineUid: string;
    brand: Brand;
  }): IssuedSessionTokens {
    const sessionId = randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);

    const accessPayload: SessionJwtPayload = {
      jti: sessionId,
      sub: params.memberId,
      lineUid: params.lineUid,
      brand: params.brand,
      type: 'access',
      iat: nowSec,
      exp: nowSec + this.accessExpiresSeconds,
    };

    const refreshPayload: SessionJwtPayload = {
      jti: sessionId,
      sub: params.memberId,
      lineUid: params.lineUid,
      brand: params.brand,
      type: 'refresh',
      iat: nowSec,
      exp: nowSec + this.refreshExpiresSeconds,
    };

    return {
      sessionId,
      accessToken: this.signJwt(accessPayload),
      refreshToken: this.signJwt(refreshPayload),
      expiresInSeconds: this.accessExpiresSeconds,
    };
  }

  // ออก Signed State Token อายุสั้น (10 นาที) สำหรับแนบไปกับ URL ของ The 1 Passport ตอนยังไม่ผูกบัญชี
  issueLinkingStateToken(params: { lineUid: string; brand: Brand }): string {
    const nowSec = Math.floor(Date.now() / 1000);
    return this.signJwt({
      jti: randomUUID(),
      sub: params.lineUid,
      lineUid: params.lineUid,
      brand: params.brand,
      type: 'linking_state',
      iat: nowSec,
      exp: nowSec + 600,
    });
  }

  // ตรวจสอบลายเซ็น วันหมดอายุ และสถานะการเพิกถอนของ JWT
  verifyToken(
    token: string,
    expectedType?: SessionTokenType,
  ): SessionJwtPayload {
    const parts = token.trim().split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('รูปแบบ Session Token ไม่ถูกต้อง');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = this.computeSignature(
      `${encodedHeader}.${encodedPayload}`,
    );

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('ลายเซ็นของ Session Token ไม่ถูกต้อง');
    }

    const payloadJson = Buffer.from(encodedPayload, 'base64url').toString(
      'utf8',
    );
    const payload = JSON.parse(payloadJson) as SessionJwtPayload;
    const nowSec = Math.floor(Date.now() / 1000);

    if (payload.exp <= nowSec) {
      throw new UnauthorizedException('Session Token หมดอายุแล้ว');
    }

    if (expectedType && payload.type !== expectedType) {
      throw new UnauthorizedException('ประเภทของ Session Token ไม่ถูกต้อง');
    }

    if (this.revokedSessions.has(payload.jti)) {
      throw new UnauthorizedException(
        'Session นี้ถูกเพิกถอนแล้ว (SESSION_REVOKED)',
      );
    }

    return payload;
  }

  // เพิกถอน Session ตามรหัส jti เมื่อผู้ใช้ทำการ Logout
  revokeSession(sessionId: string): void {
    this.revokedSessions.add(sessionId);
  }

  // ตรวจสอบว่า Session ถูกเพิกถอนไปแล้วหรือไม่
  isSessionRevoked(sessionId: string): boolean {
    return this.revokedSessions.has(sessionId);
  }

  private signJwt(payload: SessionJwtPayload): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header), 'utf8').toString(
      'base64url',
    );
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      'utf8',
    ).toString('base64url');
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = this.computeSignature(signingInput);
    return `${signingInput}.${signature}`;
  }

  private computeSignature(signingInput: string): string {
    return createHmac('sha256', this.jwtSecret)
      .update(signingInput, 'utf8')
      .digest('base64url');
  }
}
