import {
  BrandCode,
  CouponSource as SharedCouponSource,
  MemberConsentResponseDto,
  MemberHomeCouponDto,
  MemberHomeMissionDto,
  MemberHomeResponseDto,
  MemberProfileResponseDto,
  PointClaimHistoryItemDto,
  UpdateMarketingConsentRequestDto,
} from '@line-connect/shared';
import { Inject, Injectable } from '@nestjs/common';
import { maskEmail, maskPhone } from '../../../common/logger/pii-redactor';
import { SessionJwtPayload } from '../../auth/services/session-token.service';
import { CouponRepository } from '../../coupon/repositories/coupon.repository';
import {
  THE1_CLIENT_TOKEN,
  The1Client,
} from '../../integration/the1/the1.interface';
import { MissionRepository } from '../../mission/repositories/mission.repository';
import { MemberConsentService } from './member-consent.service';
import { MemberProfileCacheService } from './member-profile-cache.service';

// บริการหลักของโมดูล Member สำหรับหน้า Home (/me/home), Profile (/me/profile) และจัดการ Consent (/me/consent)
@Injectable()
export class MemberService {
  private static readonly MAX_HOME_COUPONS = 5;
  private static readonly CLAIM_LOG_LOOKBACK_DAYS = 90;

  constructor(
    private readonly profileCacheService: MemberProfileCacheService,
    private readonly couponRepo: CouponRepository,
    private readonly missionRepo: MissionRepository,
    private readonly memberConsentService: MemberConsentService,
    @Inject(THE1_CLIENT_TOKEN)
    private readonly the1Client: The1Client,
  ) {}

  // 1. GET /me/home: ชื่อ, tier, แต้มแยก TWD/BnB, คูปองพร้อมใช้ 5 ใบล่าสุด, Mission ที่กำลังทำพร้อม progress
  async getHome(
    session: SessionJwtPayload,
    now = new Date(),
  ): Promise<MemberHomeResponseDto> {
    const memberId = session.sub;
    const { profile, stale, refreshedAt } =
      await this.profileCacheService.getProfileWithFallback(memberId, now);

    const latestCoupons =
      await this.couponRepo.findLatestAvailableCouponsWithDetail(
        memberId,
        MemberService.MAX_HOME_COUPONS,
      );
    const availableCoupons: MemberHomeCouponDto[] = latestCoupons.map(
      (entry) => ({
        walletId: entry.id,
        couponId: entry.coupon.couponId,
        code: entry.coupon.code,
        source: entry.coupon.source as unknown as SharedCouponSource,
        type: entry.coupon.type,
        value: Number(entry.coupon.value),
        maxDiscount:
          entry.coupon.maxDiscount !== null
            ? Number(entry.coupon.maxDiscount)
            : null,
        validFrom: entry.coupon.validFrom.toISOString(),
        validTo: entry.coupon.validTo.toISOString(),
      }),
    );

    const activeMissionsRaw = await this.missionRepo.findActiveMissions(now);
    const progresses = await this.missionRepo.findMemberProgresses(
      memberId,
      activeMissionsRaw.map((m) => m.missionId),
    );
    const progressByMission = new Map(progresses.map((p) => [p.missionId, p]));

    const activeMissions: MemberHomeMissionDto[] = activeMissionsRaw
      .map((mission) => {
        const memberProg = progressByMission.get(mission.missionId);
        const targetNum = Number(mission.target);
        const progressNum = memberProg ? Number(memberProg.progress) : 0;
        const percent =
          targetNum > 0
            ? Math.min(100, Math.round((progressNum / targetNum) * 100))
            : 0;
        return {
          missionId: mission.missionId,
          name: mission.name,
          target: targetNum,
          progress: progressNum,
          progressPercent: percent,
          completedAt: memberProg?.completedAt
            ? memberProg.completedAt.toISOString()
            : null,
          startAt: mission.startAt.toISOString(),
          endAt: mission.endAt.toISOString(),
        };
      })
      .filter((item) => item.completedAt === null);

    return {
      memberId,
      brand: session.brand as unknown as BrandCode,
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: `${profile.firstName} ${profile.lastName}`.trim(),
      tier: profile.tier,
      points: {
        twd: profile.points,
        bnb: profile.points,
        total: profile.points,
      },
      availableCoupons,
      activeMissions,
      stale,
      refreshed_at: refreshedAt,
    };
  }

  // 2. GET /me/profile: ข้อมูลส่วนตัว (mask เบอร์และอีเมลบางส่วน) และประวัติเคลมแต้มจาก getPointClaimLog
  async getProfile(
    session: SessionJwtPayload,
    now = new Date(),
  ): Promise<MemberProfileResponseDto> {
    const memberId = session.sub;
    const { profile, stale: profileStale, refreshedAt } =
      await this.profileCacheService.getProfileWithFallback(memberId, now);

    let isStale = profileStale;
    let cardNumber = '';
    let rawPhone = profile.phone ?? '';
    let rawEmail = profile.email ?? '';
    let claimHistory: PointClaimHistoryItemDto[] = [];

    if (!profileStale) {
      try {
        const fromDate = new Date(
          now.getTime() -
            MemberService.CLAIM_LOG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
        );
        const [detail, claimLogs] = await Promise.all([
          this.the1Client.getMemberDetail(memberId),
          this.the1Client.getPointClaimLog(memberId, fromDate, now),
        ]);
        cardNumber = detail.cardNumber;
        rawPhone = detail.phone ?? rawPhone;
        rawEmail = detail.email ?? rawEmail;
        claimHistory = claimLogs.map((log) => ({
          claimId: log.claimId,
          memberId: log.memberId,
          points: log.points,
          type: log.type,
          refId: log.refId,
          occurredAt: log.occurredAt,
        }));
      } catch {
        isStale = true;
      }
    }

    return {
      memberId,
      cardNumber,
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: `${profile.firstName} ${profile.lastName}`.trim(),
      maskedPhone: rawPhone ? maskPhone(rawPhone) : '[REDACTED]',
      maskedEmail: rawEmail ? maskEmail(rawEmail) : '[REDACTED]',
      tier: profile.tier,
      points: profile.points,
      pointClaimHistory: claimHistory,
      stale: isStale,
      refreshed_at: refreshedAt,
    };
  }

  // 3. GET /me/consent: ดูสถานะและประวัติความยินยอมทั้งหมดรวมถึง MARKETING
  async getConsent(
    session: SessionJwtPayload,
  ): Promise<MemberConsentResponseDto> {
    return this.memberConsentService.getConsent(session);
  }

  // 4. PUT /me/consent: เปลี่ยนความยินยอม MARKETING โดยบังคับ insert แถวใหม่เสมอ ห้าม update ทับ
  async updateMarketingConsent(
    session: SessionJwtPayload,
    dto: UpdateMarketingConsentRequestDto,
  ): Promise<MemberConsentResponseDto> {
    return this.memberConsentService.updateMarketingConsent(session, dto);
  }
}
