import React from 'react';
import { MemberHomeResponseDto } from '@line-connect/shared';
import { LiffBrandTheme } from '../../config/liff-brand.config';
import { PortalSkeleton, StaleDataBanner } from './PortalCommon';

export interface HomeTabViewProps {
  readonly theme: LiffBrandTheme;
  readonly isLoading: boolean;
  readonly homeData: MemberHomeResponseDto | null;
  readonly onGoToCoupons: () => void;
  readonly onGoToMissions: () => void;
}

// หน้าจอที่ 1 (Home): การ์ดสมาชิก (ชื่อ, tier, แต้ม TWD/BnB), My Coupon แบบเลื่อนแนวนอน และ Mission พร้อม Progress Bar
export function HomeTabView(props: HomeTabViewProps): React.ReactElement {
  if (props.isLoading || !props.homeData) {
    return <PortalSkeleton label="กำลังโหลดข้อมูลหน้า Home..." />;
  }

  const { homeData, theme } = props;

  return (
    <div>
      <StaleDataBanner stale={homeData.stale} refreshedAt={homeData.refreshed_at} />

      {/* การ์ดสมาชิก (ชื่อ, Tier, แต้ม TWD / BnB) */}
      <section
        style={{
          background: `linear-gradient(135deg, ${theme.primaryColorHex}, #111827)`,
          color: '#ffffff',
          borderRadius: 16,
          padding: '1.25rem',
          marginBottom: '1rem',
          boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>สมาชิก {theme.logoBadgeText}</div>
            <h2 style={{ margin: '0.2rem 0', fontSize: '1.25rem' }}>{homeData.fullName}</h2>
          </div>
          <span
            style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '0.3rem 0.75rem',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: '0.82rem',
            }}
          >
            TIER: {homeData.tier}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            marginTop: '1rem',
            background: 'rgba(255,255,255,0.12)',
            padding: '0.75rem',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>แต้มไทวัสดุ (TWD)</div>
            <strong style={{ fontSize: '1.05rem' }}>{homeData.points.twd.toLocaleString()}</strong>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>แต้ม BnB Home</div>
            <strong style={{ fontSize: '1.05rem' }}>{homeData.points.bnb.toLocaleString()}</strong>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>แต้มรวม The 1</div>
            <strong style={{ fontSize: '1.05rem' }}>{homeData.points.total.toLocaleString()}</strong>
          </div>
        </div>
      </section>

      {/* My Coupon แบบเลื่อนแนวนอน (Horizontal Scroll) */}
      <section style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>My Coupon ({homeData.availableCoupons.length})</h3>
          <button
            type="button"
            onClick={props.onGoToCoupons}
            style={{ border: 'none', background: 'transparent', color: theme.primaryColorHex, fontWeight: 600 }}
          >
            ดูทั้งหมด &rarr;
          </button>
        </div>

        <div
          data-testid="home-horizontal-coupons"
          style={{
            display: 'flex',
            gap: '0.75rem',
            overflowX: 'auto',
            paddingBottom: '0.4rem',
          }}
        >
          {homeData.availableCoupons.map((cpn) => (
            <div
              key={cpn.walletId}
              style={{
                minWidth: 210,
                background: '#ffffff',
                border: `1px solid ${theme.primaryColorHex}`,
                borderRadius: 12,
                padding: '0.85rem',
                flexShrink: 0,
              }}
            >
              <div style={{ fontWeight: 700, color: theme.primaryColorHex }}>{cpn.code}</div>
              <div style={{ fontSize: '0.85rem', margin: '0.25rem 0' }}>
                ส่วนลด {cpn.value} {cpn.maxDiscount ? `(สูงสุด ${cpn.maxDiscount} บาท)` : ''}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                หมดเขต: {cpn.validTo.slice(0, 10)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Mission พร้อม Progress Bar */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Mission ที่กำลังดำเนินการ</h3>
          <button
            type="button"
            onClick={props.onGoToMissions}
            style={{ border: 'none', background: 'transparent', color: theme.primaryColorHex, fontWeight: 600 }}
          >
            ดูทั้งหมด &rarr;
          </button>
        </div>

        {homeData.activeMissions.map((m) => (
          <div
            key={m.missionId}
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '0.9rem',
              marginBottom: '0.6rem',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.4rem' }}>{m.name}</div>
            <div style={{ height: 10, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
              <div
                role="progressbar"
                aria-valuenow={m.progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  width: `${m.progressPercent}%`,
                  height: '100%',
                  background: theme.primaryColorHex,
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#4b5563', marginTop: '0.35rem' }}>
              <span>
                สะสมแล้ว {m.progress.toLocaleString()} / {m.target.toLocaleString()}
              </span>
              <strong>{m.progressPercent}%</strong>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
