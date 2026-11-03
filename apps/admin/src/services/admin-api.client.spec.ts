import { AdminRole } from '@line-connect/shared';
import { AdminApiClient, canAdminModifyCampaigns } from './admin-api.client';

// ชุดทดสอบสำหรับ AdminApiClient และการตรวจสอบสิทธิ์ตามบทบาท (RBAC) ในฝั่ง Frontend
describe('Admin Backoffice Frontend Client & RBAC Helper', () => {
  it('canAdminModifyCampaigns ควรอนุญาตเฉพาะ ADMIN และ MARKETING แต่ไม่อนุญาต VIEWER', () => {
    expect(canAdminModifyCampaigns(AdminRole.ADMIN)).toBe(true);
    expect(canAdminModifyCampaigns(AdminRole.MARKETING)).toBe(true);
    expect(canAdminModifyCampaigns(AdminRole.VIEWER)).toBe(false);
  });

  it('AdminApiClient ควรสร้างอินสแตนซ์และแนบ Authorization Header เมื่อเรียก API ได้ถูกต้อง', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        memberId: 'T1_MEM_001',
        maskedFirstName: 'สม***',
        maskedLastName: 'สร***',
        maskedFullName: 'สม*** สร***',
        tier: 'GOLD',
        points: 3250,
        linkedBrands: ['TWD'],
        marketingConsentGranted: true,
        completedMissionCount: 1,
        availableCouponCount: 2,
        refreshedAt: '2026-11-03T12:00:00.000Z',
      }),
    }) as unknown as typeof fetch;

    try {
      const client = new AdminApiClient('http://localhost:3000');
      const result = await client.searchMember('admin-jwt-token', 'T1_MEM_001');
      expect(result.maskedFullName).toBe('สม*** สร***');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/admin/members/T1_MEM_001',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-jwt-token',
          }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
