import React from 'react';
import { LiffBrandTheme } from '../config/liff-brand.config';
import { LIFF_TEXTS, LiffLocale } from '../i18n/liff-i18n';

export interface WelcomeCouponModalProps {
  readonly theme: LiffBrandTheme;
  readonly locale: LiffLocale;
  readonly memberId: string;
  readonly showWelcomeCouponPopup: boolean;
  readonly onClosePopup: () => void;
}

// หน้าจอที่ 4: หน้า Home หลังลงทะเบียนสำเร็จ พร้อมแสดง Popup ได้รับคูปองส่วนลด 20% (สูงสุด 400 บาท)
export function WelcomeCouponModal(props: WelcomeCouponModalProps): React.ReactElement {
  const t = LIFF_TEXTS[props.locale];

  return (
    <section
      style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '1.25rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          background: '#dcfce7',
          color: '#166534',
          padding: '0.25rem 0.75rem',
          borderRadius: 999,
          fontSize: '0.82rem',
          fontWeight: 700,
          marginBottom: '0.6rem',
        }}
      >
        ✓ {t.homeLinkedBadge}
      </div>

      <h2 style={{ margin: '0 0 0.4rem 0', color: props.theme.primaryColorHex }}>
        {t.homeWelcomeTitle}
      </h2>
      <p style={{ margin: 0, color: '#4b5563', fontSize: '0.92rem' }}>
        The 1 Member ID: <strong>{props.memberId}</strong> ({props.theme.logoBadgeText})
      </p>

      {props.showWelcomeCouponPopup ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            marginTop: '1.1rem',
            background: props.theme.accentBgHex,
            border: `2px solid ${props.theme.primaryColorHex}`,
            borderRadius: 14,
            padding: '1.1rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: props.theme.primaryColorHex }}>
            20% OFF
          </div>
          <h3 style={{ margin: '0.35rem 0', fontSize: '1.05rem' }}>{t.couponPopupTitle}</h3>
          <p style={{ margin: '0 0 0.9rem 0', fontSize: '0.88rem', color: '#374151' }}>
            {t.couponPopupDesc}
          </p>
          <button
            type="button"
            onClick={props.onClosePopup}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 10,
              border: 'none',
              background: props.theme.primaryColorHex,
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t.couponPopupCloseBtn}
          </button>
        </div>
      ) : null}
    </section>
  );
}
