import React from 'react';
import { LiffBrandTheme } from '../../config/liff-brand.config';

export type PortalTabKey = 'HOME' | 'COUPONS' | 'MISSIONS' | 'PROFILE';

// แสดง Skeleton ระหว่างโหลดข้อมูลในแต่ละหน้า
export function PortalSkeleton(props: { readonly label?: string }): React.ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="portal-skeleton"
      style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '1.25rem',
        marginBottom: '1rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          height: 20,
          width: '55%',
          background: '#e5e7eb',
          borderRadius: 6,
          marginBottom: 12,
        }}
      />
      <div
        style={{
          height: 80,
          width: '100%',
          background: '#f3f4f6',
          borderRadius: 12,
          marginBottom: 12,
        }}
      />
      <div
        style={{
          height: 16,
          width: '75%',
          background: '#e5e7eb',
          borderRadius: 6,
        }}
      />
      <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
        {props.label ?? 'กำลังโหลดข้อมูล...'}
      </span>
    </div>
  );
}

// แสดงป้ายแจ้งเตือน "ข้อมูล ณ เวลา ..." เมื่อ API คืนค่า stale = true (Graceful Degradation)
export function StaleDataBanner(props: {
  readonly stale: boolean;
  readonly refreshedAt: string;
}): React.ReactElement | null {
  if (!props.stale) {
    return null;
  }
  return (
    <div
      role="status"
      data-testid="stale-data-banner"
      style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        color: '#92400e',
        padding: '0.55rem 0.85rem',
        borderRadius: 10,
        marginBottom: '0.85rem',
        fontSize: '0.85rem',
        fontWeight: 600,
      }}
    >
      ข้อมูล ณ เวลา {props.refreshedAt} (ระบบกำลังแสดงข้อมูลล่าสุดจากแคชชั่วคราว)
    </div>
  );
}

// แถบเมนูนำทางด้านล่าง (Bottom Navigation) สำหรับสลับทั้ง 4 หน้าหลัก
export function BottomNavBar(props: {
  readonly activeTab: PortalTabKey;
  readonly theme: LiffBrandTheme;
  readonly onSelectTab: (tab: PortalTabKey) => void;
}): React.ReactElement {
  const items: ReadonlyArray<{ readonly key: PortalTabKey; readonly label: string }> = [
    { key: 'HOME', label: 'Home' },
    { key: 'COUPONS', label: 'My Coupon' },
    { key: 'MISSIONS', label: 'Mission' },
    { key: 'PROFILE', label: 'My Profile' },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        background: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        borderRadius: 14,
        padding: '0.45rem',
        marginTop: '1rem',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
      }}
    >
      {items.map((item) => {
        const isActive = props.activeTab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => props.onSelectTab(item.key)}
            style={{
              padding: '0.55rem 0.25rem',
              borderRadius: 10,
              border: 'none',
              background: isActive ? props.theme.accentBgHex : 'transparent',
              color: isActive ? props.theme.primaryColorHex : '#4b5563',
              fontWeight: isActive ? 700 : 500,
              fontSize: '0.84rem',
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
