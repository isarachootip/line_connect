import {
  BrandCode,
  ConsentType,
  CouponSource,
  CouponWalletStatus,
  MemberConsentResponseDto,
  MemberCouponItemDto,
  MemberCouponListResponseDto,
  MemberHomeResponseDto,
  MemberMissionDetailDto,
  MemberMissionListResponseDto,
  MemberProfileResponseDto,
  UseCouponResponseDto,
} from '@line-connect/shared';

// บริการเชื่อมต่อ API สำหรับหน้าหลักหลังเชื่อมบัญชีครบทั้ง 4 แท็บ (Home, My Coupon, Mission, My Profile)
export class LiffPortalApiService {
  constructor(private readonly baseUrl = 'http://localhost:3000') {}

  async getHome(accessToken: string, brand: BrandCode): Promise<MemberHomeResponseDto> {
    return this.request<MemberHomeResponseDto>(`/me/home?brand=${brand}`, accessToken);
  }

  async getCoupons(accessToken: string, status?: CouponWalletStatus): Promise<MemberCouponListResponseDto> {
    const query = status ? `?status=${status}` : '';
    return this.request<MemberCouponListResponseDto>(`/me/coupons${query}`, accessToken);
  }

  async useCoupon(accessToken: string, walletOrCouponId: string): Promise<UseCouponResponseDto> {
    return this.request<UseCouponResponseDto>(
      `/me/coupons/${encodeURIComponent(walletOrCouponId)}/use`,
      accessToken,
      { method: 'POST' },
    );
  }

  async getMissions(accessToken: string): Promise<MemberMissionListResponseDto> {
    return this.request<MemberMissionListResponseDto>('/me/missions', accessToken);
  }

  async getMissionDetail(accessToken: string, missionId: string): Promise<MemberMissionDetailDto> {
    return this.request<MemberMissionDetailDto>(
      `/me/missions/${encodeURIComponent(missionId)}`,
      accessToken,
    );
  }

  async getProfile(accessToken: string): Promise<MemberProfileResponseDto> {
    return this.request<MemberProfileResponseDto>('/me/profile', accessToken);
  }

  async getConsent(accessToken: string): Promise<MemberConsentResponseDto> {
    return this.request<MemberConsentResponseDto>('/me/consent', accessToken);
  }

  async updateMarketingConsent(
    accessToken: string,
    granted: boolean,
    version = 'v1.0',
  ): Promise<MemberConsentResponseDto> {
    return this.request<MemberConsentResponseDto>('/me/consent', accessToken, {
      method: 'PUT',
      body: JSON.stringify({ granted, version }),
    });
  }

  async unlinkAccount(accessToken: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/me/unlink', accessToken, {
      method: 'POST',
    });
  }

  private async request<T>(
    path: string,
    accessToken: string,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
      body: init?.body,
    });
    if (!response.ok) {
      throw new Error(`เรียกใช้งาน Portal API ล้มเหลว (HTTP ${response.status})`);
    }
    return (await response.json()) as T;
  }
}

// ข้อมูลตัวอย่างเริ่มต้นสำหรับแสดงผลเมื่อเปิดพรีวิวแบบ Offline
export function createFallbackHomeData(
  memberId: string,
  brand: BrandCode,
): MemberHomeResponseDto {
  return {
    memberId,
    brand,
    firstName: 'สมชาย',
    lastName: 'สร้างบ้าน',
    fullName: 'สมชาย สร้างบ้าน',
    tier: 'GOLD',
    points: { twd: 2150, bnb: 1100, total: 3250 },
    availableCoupons: [
      {
        walletId: 'wallet-welcome-20',
        couponId: 'CPN-ONLINE-FIRST-REG',
        code: 'ONLINE_FIRST_REG_20',
        source: CouponSource.TWD,
        type: 'ONLINE_FIRST_REGISTRATION_20_PERCENT',
        value: 20,
        maxDiscount: 400,
        validFrom: '2026-11-01T00:00:00.000Z',
        validTo: '2027-01-31T23:59:59.000Z',
      },
    ],
    activeMissions: [
      {
        missionId: 'MIS-DEV-001',
        name: 'ช้อปครบ 10,000 บาทที่ไทวัสดุ รับเพิ่ม 500 คะแนน The 1',
        target: 10000,
        progress: 4500,
        progressPercent: 45,
        completedAt: null,
        startAt: '2026-11-01T00:00:00.000Z',
        endAt: '2026-11-30T23:59:59.000Z',
      },
    ],
    stale: false,
    refreshed_at: '2026-11-03T12:00:00.000Z',
  };
}

export function createFallbackPortalState(memberId: string, brand: BrandCode): {
  readonly home: MemberHomeResponseDto;
  readonly coupons: readonly MemberCouponItemDto[];
  readonly missions: readonly MemberMissionDetailDto[];
  readonly profile: MemberProfileResponseDto;
  readonly consent: MemberConsentResponseDto;
} {
  const home = createFallbackHomeData(memberId, brand);
  return {
    home,
    coupons: [{ ...home.availableCoupons[0], status: CouponWalletStatus.AVAILABLE, usedAt: null }],
    missions: [
      {
        ...home.activeMissions[0],
        status: 'ACTIVE',
        rule: { type: 'TOTAL_SPEND', brand },
        reward: { points: 500 },
        completed: false,
      },
    ],
    profile: {
      memberId,
      cardNumber: '2011889900112233',
      firstName: home.firstName,
      lastName: home.lastName,
      fullName: home.fullName,
      maskedPhone: '081-***-1234',
      maskedEmail: 'som***@example.com',
      tier: home.tier,
      points: home.points.total,
      pointClaimHistory: [
        { claimId: 'CLM-001', memberId, points: 500, type: 'EARN', refId: 'MIS-DEV-001', occurredAt: '2026-11-02T10:00:00.000Z' },
      ],
      stale: false,
      refreshed_at: home.refreshed_at,
    },
    consent: {
      memberId,
      marketing: { type: ConsentType.MARKETING, version: 'v1.0', granted: true, updatedAt: '2026-11-01T10:00:00.000Z' },
      history: [],
    },
  };
}
