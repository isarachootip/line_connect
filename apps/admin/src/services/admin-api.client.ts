import {
  AdminCouponSummaryDto,
  AdminMemberSearchResultDto,
  AdminMissionSummaryDto,
  AdminRole,
  AdminSsoLoginResponseDto,
  BrandCode,
  CouponSource,
} from '@line-connect/shared';

export interface CreateMissionPayload {
  readonly missionId?: string;
  readonly name: string;
  readonly rule: Record<string, unknown>;
  readonly target: number;
  readonly startAt: string;
  readonly endAt: string;
  readonly reward: Record<string, unknown>;
  readonly status?: 'active' | 'inactive';
}

export interface CreateCouponPayload {
  readonly code: string;
  readonly source: CouponSource;
  readonly type: string;
  readonly value: number;
  readonly maxDiscount: number | null;
  readonly validFrom: string;
  readonly validTo: string;
}

export interface ExportSegmentBatchPayload {
  readonly segment: string;
  readonly completedMissionId?: string;
  readonly minTotalSpend?: number;
  readonly brand?: BrandCode;
}

export interface ExportSegmentBatchResponse {
  readonly batchId: string;
  readonly segment: string;
  readonly rowCount: number;
  readonly remotePath: string;
}

// ตรวจสอบว่าบทบาทของผู้ดูแลระบบมีสิทธิ์สร้าง/แก้ไข Mission, คูปอง และสั่ง Export Batch หรือไม่
export function canAdminModifyCampaigns(role: AdminRole): boolean {
  return role === AdminRole.ADMIN || role === AdminRole.MARKETING;
}

// บริการเชื่อมต่อ Backend API สำหรับหน้าจอ Admin Backoffice
export class AdminApiClient {
  constructor(private readonly baseUrl = 'http://localhost:3000') {}

  async loginWithSso(
    ssoToken: string,
    requestedRole?: AdminRole,
  ): Promise<AdminSsoLoginResponseDto> {
    return this.request<AdminSsoLoginResponseDto>('/admin/auth/sso', {
      method: 'POST',
      body: JSON.stringify({ ssoToken, requestedRole }),
    });
  }

  async listMissions(accessToken: string): Promise<AdminMissionSummaryDto[]> {
    return this.request<AdminMissionSummaryDto[]>('/admin/missions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async createMission(
    accessToken: string,
    payload: CreateMissionPayload,
  ): Promise<AdminMissionSummaryDto> {
    return this.request<AdminMissionSummaryDto>('/admin/missions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
  }

  async updateMission(
    accessToken: string,
    missionId: string,
    payload: CreateMissionPayload,
  ): Promise<AdminMissionSummaryDto> {
    return this.request<AdminMissionSummaryDto>(`/admin/missions/${missionId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
  }

  async toggleMissionStatus(
    accessToken: string,
    missionId: string,
    status: 'active' | 'inactive',
  ): Promise<AdminMissionSummaryDto> {
    return this.request<AdminMissionSummaryDto>(
      `/admin/missions/${missionId}/status`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status }),
      },
    );
  }

  async createCoupon(
    accessToken: string,
    payload: CreateCouponPayload,
  ): Promise<AdminCouponSummaryDto> {
    return this.request<AdminCouponSummaryDto>('/admin/coupons', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
  }

  async exportSegmentBatch(
    accessToken: string,
    payload: ExportSegmentBatchPayload,
  ): Promise<ExportSegmentBatchResponse> {
    return this.request<ExportSegmentBatchResponse>('/admin/batches/export', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
  }

  async searchMember(
    accessToken: string,
    memberId: string,
  ): Promise<AdminMemberSearchResultDto> {
    return this.request<AdminMemberSearchResultDto>(
      `/admin/members/${encodeURIComponent(memberId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`เรียกใช้งาน Admin API ล้มเหลว (HTTP ${response.status})`);
    }
    return (await response.json()) as T;
  }
}
