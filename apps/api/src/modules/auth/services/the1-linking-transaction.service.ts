import { ConflictException, Injectable } from '@nestjs/common';
import { Brand, ConsentType, LineLinkStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  The1Profile,
  The1TokenResponse,
} from '../../integration/the1/the1.interface';
import { MemberProfileRepository } from '../../member/repositories/member-profile.repository';
import { ConsentRepository } from '../repositories/consent.repository';
import { LineLinkRepository } from '../repositories/line-link.repository';
import { The1TokenRepository } from '../repositories/the1-token.repository';

export interface PersistThe1LinkingParams {
  readonly lineUid: string;
  readonly brand: Brand;
  readonly memberId: string;
  readonly tokenResponse: The1TokenResponse;
  readonly profile: The1Profile;
  readonly tncVersion: string;
  readonly pdpaVersion: string;
}

export interface PersistThe1LinkingResult {
  readonly isFirstRegistration: boolean;
}

// บริการจัดการ Transaction เดียวสำหรับบันทึก the1_token, line_link, member_profile และ consent พร้อมกันการผูกซ้ำ
@Injectable()
export class The1LinkingTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineLinkRepo: LineLinkRepository,
    private readonly consentRepo: ConsentRepository,
    private readonly the1TokenRepo: The1TokenRepository,
    private readonly memberProfileRepo: MemberProfileRepository,
  ) {}

  // ตรวจสอบเบื้องต้นว่า (line_uid, brand) ผูกอยู่แล้วหรือไม่ก่อนเรียก External API
  async assertNotAlreadyLinked(lineUid: string, brand: Brand): Promise<void> {
    const existing = await this.lineLinkRepo.findByLineUidAndBrand(
      lineUid,
      brand,
    );
    if (existing && existing.status === LineLinkStatus.active) {
      throw new ConflictException(
        'บัญชี LINE นี้ได้ผูกกับสมาชิกภายใต้แบรนด์นี้แล้ว (LINE_ALREADY_LINKED)',
      );
    }
  }

  // บันทึก the1_token (เข้ารหัส), line_link, member_profile และ consent (TNC, PDPA) ใน Transaction เดียว
  async persistLinkingInTransaction(
    params: PersistThe1LinkingParams,
  ): Promise<PersistThe1LinkingResult> {
    return this.prisma.$transaction(async (tx) => {
      const currentLink = await this.lineLinkRepo.findByLineUidAndBrand(
        params.lineUid,
        params.brand,
        tx,
      );
      if (currentLink && currentLink.status === LineLinkStatus.active) {
        throw new ConflictException(
          'บัญชี LINE นี้ได้ผูกกับสมาชิกภายใต้แบรนด์นี้แล้ว (LINE_ALREADY_LINKED)',
        );
      }

      const isFirstRegistration = currentLink === null;

      await this.the1TokenRepo.saveToken(
        {
          memberId: params.memberId,
          accessToken: params.tokenResponse.accessToken,
          refreshToken: params.tokenResponse.refreshToken,
          expiresAt: params.tokenResponse.expiresAt,
        },
        tx,
      );

      await this.lineLinkRepo.linkMember(
        {
          lineUid: params.lineUid,
          memberId: params.memberId,
          brand: params.brand,
        },
        tx,
      );

      await this.memberProfileRepo.upsertProfile(
        {
          memberId: params.memberId,
          firstName: params.profile.firstName,
          lastName: params.profile.lastName,
          tier: params.profile.tier,
          points: params.profile.points,
        },
        tx,
      );

      await this.consentRepo.grantConsent(
        {
          memberId: params.memberId,
          type: ConsentType.TNC,
          version: params.tncVersion,
        },
        tx,
      );

      await this.consentRepo.grantConsent(
        {
          memberId: params.memberId,
          type: ConsentType.PDPA,
          version: params.pdpaVersion,
        },
        tx,
      );

      return { isFirstRegistration };
    });
  }
}
