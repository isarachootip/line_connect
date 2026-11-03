import React, { useState } from 'react';
import {
  CouponWalletStatus,
  MemberCouponItemDto,
  UseCouponResponseDto,
} from '@line-connect/shared';
import { LiffBrandTheme } from '../../config/liff-brand.config';
import { PortalSkeleton } from './PortalCommon';

export interface CouponsTabViewProps {
  readonly theme: LiffBrandTheme;
  readonly isLoading: boolean;
  readonly coupons: readonly MemberCouponItemDto[];
  readonly activeRedemption: UseCouponResponseDto | null;
  readonly onConfirmUseCoupon: (walletId: string) => Promise<void>;
}

// หน้าจอที่ 2 (My Coupon): แท็บ ที่ใช้ได้ / ใช้แล้ว / หมดอายุ ปุ่ม Use Now พร้อมยืนยันก่อนใช้ และแสดงโค้ด/QR หน้าร้าน
export function CouponsTabView(props: CouponsTabViewProps): React.ReactElement {
  const [filterTab, setFilterTab] = useState<CouponWalletStatus>(
    CouponWalletStatus.AVAILABLE,
  );
  const [confirmingCoupon, setConfirmingCoupon] =
    useState<MemberCouponItemDto | null>(null);

  if (props.isLoading) {
    return <PortalSkeleton label="กำลังโหลดกระเป๋าคูปอง..." />;
  }

  const filteredCoupons = props.coupons.filter((c) => c.status === filterTab);

  return (
    <section>
      <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.15rem' }}>กระเป๋าคูปองของฉัน (My Coupon)</h2>

      {/* แท็บสลับสถานะ: ที่ใช้ได้ / ใช้แล้ว / หมดอายุ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '1rem' }}>
        {(
          [
            { status: CouponWalletStatus.AVAILABLE, label: 'ที่ใช้ได้' },
            { status: CouponWalletStatus.USED, label: 'ใช้แล้ว' },
            { status: CouponWalletStatus.EXPIRED, label: 'หมดอายุ' },
          ] as const
        ).map((tab) => {
          const isSelected = filterTab === tab.status;
          return (
            <button
              key={tab.status}
              type="button"
              onClick={() => setFilterTab(tab.status)}
              style={{
                padding: '0.55rem',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: isSelected ? props.theme.primaryColorHex : '#ffffff',
                color: isSelected ? '#ffffff' : '#374151',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* กล่องยืนยันก่อนใช้คูปอง */}
      {confirmingCoupon ? (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="confirm-use-coupon-dialog"
          style={{
            background: '#fffbeb',
            border: '2px solid #f59e0b',
            borderRadius: 12,
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem' }}>
            ยืนยันการใช้คูปอง {confirmingCoupon.code}
          </h3>
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.86rem', color: '#4b5563' }}>
            กรุณากดยืนยันต่อหน้าพนักงานแคชเชียร์ เมื่อกดใช้แล้วจะไม่สามารถนำกลับมาใช้ซ้ำได้
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                const targetId = confirmingCoupon.walletId;
                setConfirmingCoupon(null);
                void props.onConfirmUseCoupon(targetId);
              }}
              style={{
                flex: 1,
                padding: '0.6rem',
                borderRadius: 8,
                border: 'none',
                background: props.theme.primaryColorHex,
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ยืนยันใช้คูปองทันที
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCoupon(null)}
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#ffffff',
              }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}

      {/* แสดงรหัสโค้ดและ QR สำหรับหน้าร้านหลังยืนยันการใช้คูปอง */}
      {props.activeRedemption ? (
        <div
          data-testid="coupon-redemption-qr-box"
          style={{
            background: '#ecfdf5',
            border: '2px solid #10b981',
            borderRadius: 12,
            padding: '1rem',
            marginBottom: '1rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 700, color: '#047857' }}>พร้อมสแกนที่จุดชำระเงินหน้าร้าน</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.4rem 0' }}>
            CODE: {props.activeRedemption.redemptionCode}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#374151', wordBreak: 'break-all' }}>
            QR Payload: <code>{props.activeRedemption.qrPayload}</code>
          </div>
        </div>
      ) : null}

      {/* รายการคูปองตามแท็บ */}
      {filteredCoupons.map((c) => (
        <div
          key={c.walletId}
          style={{
            background: '#ffffff',
            borderRadius: 12,
            padding: '0.9rem',
            marginBottom: '0.65rem',
            border: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: props.theme.primaryColorHex }}>{c.code}</div>
            <div style={{ fontSize: '0.86rem' }}>
              ส่วนลด {c.value} {c.maxDiscount ? `(สูงสุด ${c.maxDiscount} บาท)` : ''}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#6b7280' }}>
              ใช้ได้ถึง: {c.validTo.slice(0, 10)}
            </div>
          </div>

          {c.status === CouponWalletStatus.AVAILABLE ? (
            <button
              type="button"
              onClick={() => setConfirmingCoupon(c)}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: 8,
                border: 'none',
                background: props.theme.primaryColorHex,
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Use Now
            </button>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
              {c.status === CouponWalletStatus.USED ? 'ใช้แล้ว' : 'หมดอายุ'}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
