import React, { useState } from 'react';
import { LiffBrandTheme } from '../config/liff-brand.config';
import {
  LIFF_TEXTS,
  LiffLocale,
  maskContactForDisplay,
} from '../i18n/liff-i18n';

export interface The1OtpVerifyViewProps {
  readonly theme: LiffBrandTheme;
  readonly locale: LiffLocale;
  readonly rawContact: string;
  readonly otpRef: string;
  readonly errorMessage: string | null;
  readonly isSubmitting: boolean;
  readonly onSubmitOtp: (otpCode: string) => Promise<void>;
  readonly onBack: () => void;
}

// หน้าจอที่ 3: ยืนยันรหัส OTP 6 หลักของ The 1 Passport (แสดงเบอร์/อีเมลแบบ Mask และรหัสอ้างอิง Ref Code)
export function The1OtpVerifyView(props: The1OtpVerifyViewProps): React.ReactElement {
  const [otpCode, setOtpCode] = useState('');
  const t = LIFF_TEXTS[props.locale];
  const maskedContact = maskContactForDisplay(props.rawContact);
  const canVerify = /^\d{6}$/.test(otpCode.trim()) && !props.isSubmitting;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!canVerify) return;
    void props.onSubmitOtp(otpCode.trim());
  };

  return (
    <section
      style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '1.25rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', textAlign: 'center' }}>
        {t.otpTitle}
      </h2>

      <div
        style={{
          background: props.theme.accentBgHex,
          padding: '0.75rem',
          borderRadius: 10,
          marginBottom: '1rem',
          fontSize: '0.9rem',
          textAlign: 'center',
        }}
      >
        <div>
          {t.otpSentToLabel} <strong>{maskedContact}</strong>
        </div>
        <div style={{ marginTop: '0.25rem', color: '#4b5563' }}>
          {t.otpRefLabel} <strong>{props.otpRef}</strong>
        </div>
      </div>

      {props.errorMessage ? (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '0.65rem',
            borderRadius: 8,
            marginBottom: '0.85rem',
            fontSize: '0.88rem',
          }}
        >
          {props.errorMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder={t.otpPlaceholder}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.85rem',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            fontSize: '1.35rem',
            letterSpacing: '0.35rem',
            textAlign: 'center',
            marginBottom: '1rem',
          }}
        />

        <button
          type="submit"
          disabled={!canVerify}
          style={{
            width: '100%',
            padding: '0.85rem',
            borderRadius: 10,
            border: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            color: '#ffffff',
            background: canVerify ? props.theme.primaryColorHex : '#9ca3af',
            cursor: canVerify ? 'pointer' : 'not-allowed',
            marginBottom: '0.6rem',
          }}
        >
          {t.verifyOtpBtn}
        </button>

        <button
          type="button"
          onClick={props.onBack}
          style={{
            width: '100%',
            padding: '0.7rem',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            background: '#ffffff',
            color: '#374151',
            fontWeight: 600,
          }}
        >
          {t.backBtn}
        </button>
      </form>
    </section>
  );
}
