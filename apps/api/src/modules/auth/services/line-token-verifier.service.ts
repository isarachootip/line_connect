import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Brand } from '@prisma/client';

export const LINE_TOKEN_VERIFIER_TOKEN = Symbol('LINE_TOKEN_VERIFIER_TOKEN');

export interface VerifiedLineIdentity {
  readonly lineUid: string;
  readonly channelId: string;
  readonly displayName?: string;
  readonly expiresAt: number;
}

export interface LineTokenVerifier {
  verifyIdToken(idToken: string, brand: Brand): Promise<VerifiedLineIdentity>;
}

export interface LineVerifyHttpResponse {
  readonly iss?: string;
  readonly sub?: string;
  readonly aud?: string;
  readonly exp?: number;
  readonly name?: string;
  readonly error?: string;
  readonly error_description?: string;
}

export type LineVerifyTransport = (
  url: string,
  formBody: string,
) => Promise<{ status: number; body: LineVerifyHttpResponse }>;

// แก้ไข/ดึงค่า LINE_CHANNEL_ID สำหรับตรวจสอบกับ LINE Verify Endpoint แยกตามแบรนด์หรือค่ากลาง
export function resolveLineChannelId(
  brand: Brand,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (brand === Brand.TWD && env.LINE_LIFF_CHANNEL_ID_TWD) {
    return env.LINE_LIFF_CHANNEL_ID_TWD;
  }
  if (brand === Brand.BNB && env.LINE_LIFF_CHANNEL_ID_BNB) {
    return env.LINE_LIFF_CHANNEL_ID_BNB;
  }
  return env.LINE_CHANNEL_ID ?? 'default_line_channel_id';
}

// บริการตรวจสอบ LINE ID Token กับ LINE OAuth2 Verify Endpoint จริง (ใช้ LINE_CHANNEL_ID ห้ามเชื่อ UID จาก Client)
@Injectable()
export class LineHttpTokenVerifier implements LineTokenVerifier {
  private readonly verifyUrl: string;
  private readonly transport: LineVerifyTransport;

  constructor(
    verifyUrl = process.env.LINE_VERIFY_URL ??
      'https://api.line.me/oauth2/v2.1/verify',
    transport?: LineVerifyTransport,
  ) {
    this.verifyUrl = verifyUrl;
    this.transport =
      transport ??
      (async (url: string, formBody: string) => {
        // TODO: ยืนยันการตั้งค่า Proxy/Timeout ของเครือข่ายภายในองค์กรเมื่อเชื่อมต่อ LINE OAuth2 Verify Endpoint จริง
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formBody,
        });
        const data = (await res.json()) as LineVerifyHttpResponse;
        return { status: res.status, body: data };
      });
  }

  async verifyIdToken(
    idToken: string,
    brand: Brand,
  ): Promise<VerifiedLineIdentity> {
    const trimmedToken = idToken.trim();
    if (!trimmedToken) {
      throw new UnauthorizedException('ไม่พบ LINE ID Token');
    }

    const channelId = resolveLineChannelId(brand);
    const params = new URLSearchParams({
      id_token: trimmedToken,
      client_id: channelId,
    });

    const response = await this.transport(this.verifyUrl, params.toString());
    if (response.status !== 200 || !response.body.sub) {
      throw new UnauthorizedException(
        'LINE ID Token ไม่ถูกต้องหรือหมดอายุจากการตรวจสอบกับ LINE Verify Endpoint',
      );
    }

    return {
      lineUid: response.body.sub,
      channelId: response.body.aud ?? channelId,
      displayName: response.body.name,
      expiresAt:
        response.body.exp ?? Math.floor(Date.now() / 1000) + 3600,
    };
  }
}

// บริการจำลองการตรวจสอบ LINE ID Token สำหรับโหมดพัฒนาและทดสอบ (สกัด line_uid จาก Token เท่านั้น ห้ามเชื่อค่าดิบจาก Client)
@Injectable()
export class LineMockTokenVerifier implements LineTokenVerifier {
  async verifyIdToken(
    idToken: string,
    brand: Brand,
  ): Promise<VerifiedLineIdentity> {
    const trimmed = idToken.trim();
    if (
      !trimmed ||
      trimmed.startsWith('invalid') ||
      trimmed.startsWith('expired')
    ) {
      throw new UnauthorizedException(
        'LINE ID Token ไม่ถูกต้องหรือหมดอายุ (LINE_VERIFY_FAILED)',
      );
    }

    const channelId = resolveLineChannelId(brand);
    const extractedUid = this.extractLineUidFromMockToken(trimmed);

    return {
      lineUid: extractedUid,
      channelId,
      displayName: `LINE_${extractedUid}`,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  private extractLineUidFromMockToken(token: string): string {
    // รองรับรูปแบบเช่น "line-id-token:U_LINE_001" หรือ "mock-line-token-U_LINE_001"
    if (token.includes(':')) {
      const parts = token.split(':');
      const candidate = parts[parts.length - 1]?.trim();
      if (candidate) {
        return candidate;
      }
    }
    const prefixPatterns = [
      /^mock-line-token-(.+)$/i,
      /^line-token-(.+)$/i,
      /^id-token-(.+)$/i,
    ];
    for (const pattern of prefixPatterns) {
      const match = token.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }
    const uidMatch = token.match(/(U_[A-Za-z0-9_]+|U[0-9a-fA-F]{8,})/);
    if (uidMatch?.[1]) {
      return uidMatch[1];
    }
    return `U_VERIFIED_${token.replace(/[^A-Za-z0-9_]/g, '_')}`;
  }
}
