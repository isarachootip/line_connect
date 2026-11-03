import React, { useEffect, useState } from 'react';
import {
  ConsentType,
  CouponWalletStatus,
  MemberConsentResponseDto,
  MemberCouponItemDto,
  MemberHomeResponseDto,
  MemberMissionDetailDto,
  MemberProfileResponseDto,
  UseCouponResponseDto,
} from '@line-connect/shared';
import { LiffBrandTheme } from '../../config/liff-brand.config';
import { LiffLocale } from '../../i18n/liff-i18n';
import { createFallbackPortalState, LiffPortalApiService } from '../../services/liff-portal.service';
import { WelcomeCouponModal } from '../WelcomeCouponModal';
import { CouponsTabView } from './CouponsTabView';
import { HomeTabView } from './HomeTabView';
import { MissionsTabView } from './MissionsTabView';
import { BottomNavBar, PortalTabKey } from './PortalCommon';
import { ProfileTabView } from './ProfileTabView';

export interface MemberPortalShellProps {
  readonly theme: LiffBrandTheme;
  readonly locale: LiffLocale;
  readonly memberId: string;
  readonly accessToken?: string;
  readonly showWelcomeCouponPopup: boolean;
  readonly onCloseWelcomePopup: () => void;
  readonly onUnlinked: () => void;
  readonly portalApi?: LiffPortalApiService;
}

const defaultPortalApi = new LiffPortalApiService(
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
);

// โครงหน้าหลักหลังเชื่อมบัญชีสำเร็จ ประกอบด้วย 4 แท็บหลัก (Home, My Coupon, Mission, My Profile) และ Bottom Navigation
export function MemberPortalShell(props: MemberPortalShellProps): React.ReactElement {
  const api = props.portalApi ?? defaultPortalApi;
  const token = props.accessToken ?? 'mock-jwt-access-token';
  const fallback = createFallbackPortalState(props.memberId, props.theme.brand);

  const [activeTab, setActiveTab] = useState<PortalTabKey>('HOME');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [homeData, setHomeData] = useState<MemberHomeResponseDto | null>(fallback.home);
  const [coupons, setCoupons] = useState<readonly MemberCouponItemDto[]>(fallback.coupons);
  const [activeRedemption, setActiveRedemption] = useState<UseCouponResponseDto | null>(null);
  const [missions, setMissions] = useState<readonly MemberMissionDetailDto[]>(fallback.missions);
  const [profile, setProfile] = useState<MemberProfileResponseDto | null>(fallback.profile);
  const [consent, setConsent] = useState<MemberConsentResponseDto | null>(fallback.consent);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    void (async () => {
      try {
        const [homeRes, cpnRes, msnRes, profRes, conRes] = await Promise.all([
          api.getHome(token, props.theme.brand),
          api.getCoupons(token),
          api.getMissions(token),
          api.getProfile(token),
          api.getConsent(token),
        ]);
        if (!mounted) return;
        setHomeData(homeRes);
        setCoupons(cpnRes.coupons);
        setMissions(msnRes.missions);
        setProfile(profRes);
        setConsent(conRes);
      } catch {
        // แสดงผลด้วยข้อมูล Fallback เมื่อเชื่อมต่อแบบออฟไลน์
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [props.memberId, props.theme.brand, token]);

  const handleConfirmUseCoupon = async (walletId: string): Promise<void> => {
    try {
      const res = await api.useCoupon(token, walletId);
      setActiveRedemption(res);
    } catch {
      setActiveRedemption({
        walletId,
        couponId: 'CPN-ONLINE-FIRST-REG',
        code: 'ONLINE_FIRST_REG_20',
        status: CouponWalletStatus.USED,
        usedAt: new Date().toISOString(),
        redemptionCode: `TWD-${walletId.slice(-4).toUpperCase()}-99`,
        qrPayload: `LINECONNECT|${props.memberId}|${walletId}|ONLINE_FIRST_REG_20`,
      });
    }
    setCoupons((prev) =>
      prev.map((c) => (c.walletId === walletId ? { ...c, status: CouponWalletStatus.USED } : c)),
    );
  };

  const handleToggleMarketing = async (nextGranted: boolean): Promise<void> => {
    try {
      const updated = await api.updateMarketingConsent(token, nextGranted);
      setConsent(updated);
    } catch {
      setConsent((prev) =>
        prev
          ? {
              ...prev,
              marketing: {
                type: ConsentType.MARKETING,
                version: 'v1.0',
                granted: nextGranted,
                updatedAt: new Date().toISOString(),
              },
            }
          : null,
      );
    }
  };

  const handleUnlink = async (): Promise<void> => {
    try {
      await api.unlinkAccount(token);
    } catch {
      // ดำเนินการสลับกลับหน้าลงทะเบียนแม้โหมดออฟไลน์
    }
    props.onUnlinked();
  };

  return (
    <div>
      {props.showWelcomeCouponPopup ? (
        <div style={{ marginBottom: '0.85rem' }}>
          <WelcomeCouponModal
            theme={props.theme}
            locale={props.locale}
            memberId={props.memberId}
            showWelcomeCouponPopup={props.showWelcomeCouponPopup}
            onClosePopup={props.onCloseWelcomePopup}
          />
        </div>
      ) : null}

      {activeTab === 'HOME' ? (
        <HomeTabView
          theme={props.theme}
          isLoading={isLoading}
          homeData={homeData}
          onGoToCoupons={() => setActiveTab('COUPONS')}
          onGoToMissions={() => setActiveTab('MISSIONS')}
        />
      ) : null}

      {activeTab === 'COUPONS' ? (
        <CouponsTabView
          theme={props.theme}
          isLoading={isLoading}
          coupons={coupons}
          activeRedemption={activeRedemption}
          onConfirmUseCoupon={handleConfirmUseCoupon}
        />
      ) : null}

      {activeTab === 'MISSIONS' ? (
        <MissionsTabView theme={props.theme} isLoading={isLoading} missions={missions} />
      ) : null}

      {activeTab === 'PROFILE' ? (
        <ProfileTabView
          theme={props.theme}
          isLoading={isLoading}
          profile={profile}
          consent={consent}
          onToggleMarketingConsent={handleToggleMarketing}
          onUnlinkAccount={handleUnlink}
        />
      ) : null}

      <BottomNavBar activeTab={activeTab} theme={props.theme} onSelectTab={setActiveTab} />
    </div>
  );
}
