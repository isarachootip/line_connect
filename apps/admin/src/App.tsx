import React, { useState } from 'react';
import {
  AdminCouponSummaryDto,
  AdminMemberSearchResultDto,
  AdminMissionSummaryDto,
  AdminRole,
  AdminUserDto,
  BrandCode,
  CouponSource,
} from '@line-connect/shared';
import { CouponAndBatchPanel } from './components/CouponAndBatchPanel';
import { MemberLookupPanel } from './components/MemberLookupPanel';
import { MissionManagerPanel } from './components/MissionManagerPanel';
import {
  AdminApiClient,
  ExportSegmentBatchResponse,
} from './services/admin-api.client';

const apiClient = new AdminApiClient(
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
);

// หน้าจอหลักของระบบ Line Connect Admin Backoffice (SSO Login + RBAC: ADMIN, MARKETING, VIEWER)
export function App(): React.ReactElement {
  const [adminUser, setAdminUser] = useState<AdminUserDto>({
    adminId: 'ADM-ADMIN',
    email: 'admin@thaiwatsadu.co.th',
    displayName: 'เจ้าหน้าที่ ADMIN',
    role: AdminRole.ADMIN,
  });
  const [token, setToken] = useState<string>('');
  const [missions, setMissions] = useState<AdminMissionSummaryDto[]>([]);
  const [coupons, setCoupons] = useState<AdminCouponSummaryDto[]>([]);
  const [lastBatch, setLastBatch] = useState<ExportSegmentBatchResponse | null>(null);
  const [memberResult, setMemberResult] = useState<AdminMemberSearchResultDto | null>(null);

  const handleSsoLogin = async (role: AdminRole): Promise<void> => {
    const res = await apiClient.loginWithSso(`mock-sso-${role.toLowerCase()}`, role);
    setAdminUser(res.user);
    setToken(res.accessToken);
    const list = await apiClient.listMissions(res.accessToken);
    setMissions(list);
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 1080, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, color: '#dc2626' }}>
            Line Connect Admin Backoffice (ไทวัสดุ &amp; BnB Home)
          </h1>
          <small>
            ผู้ใช้งานปัจจุบัน: <strong>{adminUser.displayName}</strong> ({adminUser.email}) — บทบาท:{' '}
            <strong>{adminUser.role}</strong>
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" onClick={() => void handleSsoLogin(AdminRole.ADMIN)}>
            SSO Login (ADMIN)
          </button>
          <button type="button" onClick={() => void handleSsoLogin(AdminRole.MARKETING)}>
            SSO Login (MARKETING)
          </button>
          <button type="button" onClick={() => void handleSsoLogin(AdminRole.VIEWER)}>
            SSO Login (VIEWER)
          </button>
        </div>
      </header>

      <MissionManagerPanel
        role={adminUser.role}
        missions={missions}
        onCreateMission={async (name, target, points) => {
          const created = await apiClient.createMission(token, {
            name,
            rule: { type: 'TOTAL_SPEND', periodType: 'MONTH' },
            target,
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
            reward: { type: 'THE1_POINT', points },
          });
          setMissions((prev) => [created, ...prev]);
        }}
        onToggleStatus={async (missionId, nextStatus) => {
          const updated = await apiClient.toggleMissionStatus(token, missionId, nextStatus);
          setMissions((prev) => prev.map((m) => (m.missionId === missionId ? updated : m)));
        }}
      />

      <CouponAndBatchPanel
        role={adminUser.role}
        coupons={coupons}
        lastBatch={lastBatch}
        onCreateCoupon={async (code, value, maxDiscount, validTo) => {
          const created = await apiClient.createCoupon(token, {
            code,
            source: CouponSource.TWD,
            type: 'DISCOUNT_PERCENT',
            value,
            maxDiscount,
            validFrom: new Date().toISOString(),
            validTo,
          });
          setCoupons((prev) => [created, ...prev]);
        }}
        onExportBatch={async (segment, completedMissionId, minTotalSpend, brand: BrandCode) => {
          const exported = await apiClient.exportSegmentBatch(token, {
            segment,
            completedMissionId,
            minTotalSpend,
            brand,
          });
          setLastBatch(exported);
        }}
      />

      <MemberLookupPanel
        memberResult={memberResult}
        onSearchMember={async (memberId) => {
          const found = await apiClient.searchMember(token, memberId);
          setMemberResult(found);
        }}
      />
    </main>
  );
}
