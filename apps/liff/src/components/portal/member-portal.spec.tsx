import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandCode, CouponWalletStatus } from '@line-connect/shared';
import { getBrandThemeConfig } from '../../config/liff-brand.config';
import { createFallbackPortalState, LiffPortalApiService } from '../../services/liff-portal.service';
import { CouponsTabView } from './CouponsTabView';
import { HomeTabView } from './HomeTabView';
import { MissionsTabView } from './MissionsTabView';
import { BottomNavBar, PortalSkeleton, StaleDataBanner } from './PortalCommon';
import { ProfileTabView } from './ProfileTabView';

// ตัวช่วย Render คอมโพเนนต์แบบ Testing-Library สำหรับตรวจสอบ HTML และข้อความที่แสดงผล
function renderComponent(element: React.ReactElement): {
  readonly html: string;
  readonly getByText: (matcher: string | RegExp) => string;
} {
  const html = renderToStaticMarkup(element);
  return {
    html,
    getByText: (matcher: string | RegExp): string => {
      const matched = typeof matcher === 'string' ? html.includes(matcher) : matcher.test(html);
      if (!matched) {
        throw new Error(`Expected rendered markup to contain ${String(matcher)}, got: ${html}`);
      }
      return html;
    },
  };
}

describe('Member Portal Components & API Service (Prompt 12)', () => {
  const twdTheme = getBrandThemeConfig(BrandCode.TWD);
  const fallback = createFallbackPortalState('T1_MEM_001', BrandCode.TWD);

  it('แสดง Skeleton ขณะกำลังโหลดข้อมูล (isLoading = true)', () => {
    const view = renderComponent(
      <HomeTabView
        theme={twdTheme}
        isLoading={true}
        homeData={null}
        onGoToCoupons={jest.fn()}
        onGoToMissions={jest.fn()}
      />,
    );
    expect(view.html).toContain('aria-busy="true"');
    expect(view.html).toContain('กำลังโหลดข้อมูลหน้า Home...');

    const skeletonOnly = renderComponent(<PortalSkeleton label="กำลังโหลด..." />);
    expect(skeletonOnly.html).toContain('aria-busy="true"');
  });

  it('แสดงป้ายแจ้งเตือน "ข้อมูล ณ เวลา ..." เมื่อ API ส่งค่า stale=true', () => {
    const staleHomeData = {
      ...fallback.home,
      stale: true,
      refreshed_at: '2026-11-03T10:30:00.000Z',
    };
    const view = renderComponent(
      <HomeTabView
        theme={twdTheme}
        isLoading={false}
        homeData={staleHomeData}
        onGoToCoupons={jest.fn()}
        onGoToMissions={jest.fn()}
      />,
    );
    view.getByText(/ข้อมูล ณ เวลา 2026-11-03T10:30:00.000Z/);

    const nonStaleBanner = renderComponent(
      <StaleDataBanner stale={false} refreshedAt="2026-11-03T10:30:00.000Z" />,
    );
    expect(nonStaleBanner.html).toBe('');
  });

  it('แสดงหน้า Home: Member Card (ชื่อ, Tier, แต้ม TWD/BnB), My Coupon และ Mission พร้อม Progress Bar', () => {
    const view = renderComponent(
      <HomeTabView
        theme={twdTheme}
        isLoading={false}
        homeData={fallback.home}
        onGoToCoupons={jest.fn()}
        onGoToMissions={jest.fn()}
      />,
    );
    view.getByText('สมชาย สร้างบ้าน');
    view.getByText('TIER: GOLD');
    view.getByText('2,150');
    view.getByText('1,100');
    view.getByText('ONLINE_FIRST_REG_20');
    view.getByText('ช้อปครบ 10,000 บาทที่ไทวัสดุ รับเพิ่ม 500 คะแนน The 1');
    expect(view.html).toContain('role="progressbar"');
  });

  it('แสดงหน้า My Coupon พร้อมแท็บ ที่ใช้ได้ / ใช้แล้ว / หมดอายุ ปุ่ม Use Now และกล่อง QR หน้าร้าน', () => {
    const view = renderComponent(
      <CouponsTabView
        theme={twdTheme}
        isLoading={false}
        coupons={fallback.coupons}
        activeRedemption={{
          walletId: 'wallet-welcome-20',
          couponId: 'CPN-ONLINE-FIRST-REG',
          code: 'ONLINE_FIRST_REG_20',
          status: CouponWalletStatus.USED,
          usedAt: '2026-11-03T12:00:00.000Z',
          redemptionCode: 'TWD-ME20-99',
          qrPayload: 'LINECONNECT|T1_MEM_001|wallet-welcome-20',
        }}
        onConfirmUseCoupon={jest.fn()}
      />,
    );
    view.getByText('ที่ใช้ได้');
    view.getByText('ใช้แล้ว');
    view.getByText('หมดอายุ');
    view.getByText('Use Now');
    view.getByText('CODE: TWD-ME20-99');
    view.getByText('LINECONNECT|T1_MEM_001|wallet-welcome-20');
  });

  it('แสดงหน้า Mission พร้อมวันเริ่ม–สิ้นสุด และแสดงหน้า My Profile พร้อมข้อมูล Mask และปุ่ม Unlink', () => {
    const missionView = renderComponent(
      <MissionsTabView theme={twdTheme} isLoading={false} missions={fallback.missions} />,
    );
    missionView.getByText('ช้อปครบ 10,000 บาทที่ไทวัสดุ รับเพิ่ม 500 คะแนน The 1');
    missionView.getByText(/เริ่ม 2026-11-01 - สิ้นสุด 2026-11-30/);
    missionView.getByText('ดูรายละเอียด');

    const profileView = renderComponent(
      <ProfileTabView
        theme={twdTheme}
        isLoading={false}
        profile={fallback.profile}
        consent={fallback.consent}
        onToggleMarketingConsent={jest.fn()}
        onUnlinkAccount={jest.fn()}
      />,
    );
    profileView.getByText('081-***-1234');
    profileView.getByText('som***@example.com');
    profileView.getByText('+500 คะแนน');
    profileView.getByText('การจัดการความเป็นส่วนตัว (PDPA)');
    profileView.getByText('ยกเลิกการเชื่อมบัญชี (Unlink Account)');
  });

  it('แสดง Bottom Navigation ครบทั้ง 4 เมนู และเรียก LiffPortalApiService ได้ถูกต้อง', async () => {
    const nav = renderComponent(
      <BottomNavBar activeTab="HOME" theme={twdTheme} onSelectTab={jest.fn()} />,
    );
    nav.getByText('Home');
    nav.getByText('My Coupon');
    nav.getByText('Mission');
    nav.getByText('My Profile');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fallback.home),
    }) as unknown as typeof fetch;

    try {
      const api = new LiffPortalApiService('http://localhost:3000');
      const res = await api.getHome('jwt-token', BrandCode.TWD);
      expect(res.memberId).toBe('T1_MEM_001');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
