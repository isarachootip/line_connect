import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Brand, LineLinkStatus } from '@prisma/client';
import {
  DomainEventBus,
  MEMBER_REGISTERED_EVENT,
} from '../../../common/events/domain-event-bus';
import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import {
  THE1_CLIENT_TOKEN,
  The1Client,
} from '../../integration/the1/the1.interface';
import {
  LineAuthRequestDto,
  LineAuthResponseDto,
  The1CallbackRequestDto,
  The1CallbackResponseDto,
} from '../dto/auth.dto';
import { LineLinkRepository } from '../repositories/line-link.repository';
import { The1TokenRepository } from '../repositories/the1-token.repository';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import {
  LINE_TOKEN_VERIFIER_TOKEN,
  LineTokenVerifier,
} from './line-token-verifier.service';
import { SessionTokenService } from './session-token.service';
import { The1LinkingTransactionService } from './the1-linking-transaction.service';

// บริการหลักสำหรับตรวจสอบตัวตน LINE, ผูกบัญชี The 1 และจัดการ Logout
@Injectable()
export class AuthService {
  private readonly the1PassportBaseUrl: string;

  constructor(
    @Inject(LINE_TOKEN_VERIFIER_TOKEN)
    private readonly lineVerifier: LineTokenVerifier,
    @Inject(THE1_CLIENT_TOKEN)
    private readonly the1Client: The1Client,
    private readonly lineLinkRepo: LineLinkRepository,
    private readonly the1TokenRepo: The1TokenRepository,
    private readonly linkingTxService: The1LinkingTransactionService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly rateLimiter: AuthRateLimiterService,
    private readonly eventBus: DomainEventBus,
    private readonly auditRepo: AuditLogRepository,
  ) {
    this.the1PassportBaseUrl =
      process.env.THE1_PASSPORT_URL ??
      'https://passport-mock.the1.co.th/authorize';
  }

  // 1. POST /auth/line — ตรวจสอบ LINE ID Token กับ LINE (ไม่เชื่อ UID จาก Client) และเช็กสถานะการผูกบัญชี
  async loginWithLine(
    dto: LineAuthRequestDto,
    clientIp: string,
  ): Promise<LineAuthResponseDto> {
    this.rateLimiter.consumeIp(clientIp);
    const verifiedLine = await this.lineVerifier.verifyIdToken(dto.idToken, dto.brand);
    this.rateLimiter.consumeLineUid(verifiedLine.lineUid);

    const existingLink = await this.lineLinkRepo.findByLineUidAndBrand(
      verifiedLine.lineUid,
      dto.brand,
    );

    if (existingLink && existingLink.status === LineLinkStatus.active) {
      const tokens = this.sessionTokenService.issueSessionTokens({
        memberId: existingLink.memberId,
        lineUid: verifiedLine.lineUid,
        brand: dto.brand,
      });
      await this.auditRepo.recordAudit({
        actor: verifiedLine.lineUid,
        action: 'AUTH_LINE_LOGIN_LINKED',
        target: existingLink.memberId,
        metadata: { brand: dto.brand, linked: true },
      });
      return {
        linked: true,
        brand: dto.brand,
        memberId: existingLink.memberId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSeconds: tokens.expiresInSeconds,
      };
    }

    const state = this.sessionTokenService.issueLinkingStateToken({
      lineUid: verifiedLine.lineUid,
      brand: dto.brand,
    });
    const url = new URL(this.the1PassportBaseUrl);
    url.searchParams.set('brand', dto.brand);
    url.searchParams.set('state', state);

    await this.auditRepo.recordAudit({
      actor: verifiedLine.lineUid,
      action: 'AUTH_LINE_LOGIN_UNLINKED',
      target: dto.brand,
      metadata: { brand: dto.brand, linked: false },
    });

    return { linked: false, brand: dto.brand, passportUrl: url.toString(), state };
  }

  // 2. POST /auth/the1/callback — รับผล OTP, ดึงข้อมูล The 1, บันทึกใน Transaction เดียว และส่งอีเวนต์ member.registered
  async handleThe1Callback(
    dto: The1CallbackRequestDto,
    clientIp: string,
  ): Promise<The1CallbackResponseDto> {
    this.rateLimiter.consumeIp(clientIp);
    const { lineUid, brand } = await this.resolveVerifiedCallbackIdentity(dto);
    this.rateLimiter.consumeLineUid(lineUid);

    await this.linkingTxService.assertNotAlreadyLinked(lineUid, brand);

    const tokenResponse = await this.the1Client.getToken({
      otpRef: dto.otpRef,
      otpCode: dto.otpCode,
      memberId: dto.memberId,
    });
    const { memberId } = await this.the1Client.getMemberId(tokenResponse.accessToken);
    const profile = await this.the1Client.getProfile(memberId);

    const tncVersion = dto.consent?.tncVersion ?? dto.tncVersion ?? 'v1.0';
    const pdpaVersion = dto.consent?.pdpaVersion ?? dto.pdpaVersion ?? 'v1.0';

    const { isFirstRegistration } =
      await this.linkingTxService.persistLinkingInTransaction({
        lineUid,
        brand,
        memberId,
        tokenResponse,
        profile,
        tncVersion,
        pdpaVersion,
      });

    if (isFirstRegistration) {
      await this.eventBus.publish(MEMBER_REGISTERED_EVENT, {
        eventName: MEMBER_REGISTERED_EVENT,
        memberId,
        lineUid,
        brand,
        occurredAt: new Date(),
      });
    }

    const sessionTokens = this.sessionTokenService.issueSessionTokens({
      memberId,
      lineUid,
      brand,
    });
    await this.auditRepo.recordAudit({
      actor: lineUid,
      action: 'AUTH_THE1_LINK_SUCCESS',
      target: memberId,
      metadata: { brand, isFirstRegistration, tncVersion, pdpaVersion },
    });

    return {
      linked: true,
      brand,
      memberId,
      accessToken: sessionTokens.accessToken,
      refreshToken: sessionTokens.refreshToken,
      expiresInSeconds: sessionTokens.expiresInSeconds,
      isFirstRegistration,
    };
  }

  // 4. POST /auth/logout — เรียก The 1 logout, ลบ Token ที่เก็บไว้ และเพิกถอน Session
  async logout(sessionToken: string, clientIp: string): Promise<{ success: boolean }> {
    this.rateLimiter.consumeIp(clientIp);
    if (!sessionToken.trim()) {
      throw new UnauthorizedException('ไม่พบ Session Token สำหรับการออกจากระบบ');
    }

    const payload = this.sessionTokenService.verifyToken(sessionToken);
    this.rateLimiter.consumeLineUid(payload.lineUid);
    this.sessionTokenService.revokeSession(payload.jti);

    const storedThe1Token = await this.the1TokenRepo.findByMemberId(payload.sub);
    if (storedThe1Token) {
      await this.the1Client.logout(storedThe1Token.accessToken);
      await this.the1TokenRepo.deleteByMemberId(payload.sub);
    }

    await this.auditRepo.recordAudit({
      actor: payload.lineUid,
      action: 'AUTH_LOGOUT',
      target: payload.sub,
      metadata: { brand: payload.brand, sessionRevoked: true },
    });

    return { success: true };
  }

  private async resolveVerifiedCallbackIdentity(
    dto: The1CallbackRequestDto,
  ): Promise<{ lineUid: string; brand: Brand }> {
    if (dto.state) {
      const statePayload = this.sessionTokenService.verifyToken(dto.state, 'linking_state');
      const brand = dto.brand ?? statePayload.brand;
      if (dto.idToken) {
        const verified = await this.lineVerifier.verifyIdToken(dto.idToken, brand);
        if (verified.lineUid !== statePayload.lineUid) {
          throw new UnauthorizedException('ข้อมูลตัวตนจาก LINE ID Token ไม่ตรงกับ State ของการผูกบัญชี');
        }
      }
      return { lineUid: statePayload.lineUid, brand };
    }
    if (dto.idToken && dto.brand) {
      const verified = await this.lineVerifier.verifyIdToken(dto.idToken, dto.brand);
      return { lineUid: verified.lineUid, brand: dto.brand };
    }
    throw new UnauthorizedException(
      'ต้องยืนยันตัวตนด้วย LINE ID Token หรือ State Token ที่ลงลายเซ็นเท่านั้น ห้ามส่งเฉพาะ lineUid ดิบจาก Client',
    );
  }
}
