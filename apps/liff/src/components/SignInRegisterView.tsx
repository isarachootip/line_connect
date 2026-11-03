import React, { useState } from 'react';
import { LiffBrandTheme } from '../config/liff-brand.config';
import {
  isValidContactInput,
  LIFF_TEXTS,
  LiffLocale,
  mapRegistrationErrorMessage,
} from '../i18n/liff-i18n';

export interface SignInRegisterViewProps {
  readonly theme: LiffBrandTheme;
  readonly locale: LiffLocale;
  readonly externalError: string | null;
  readonly onContinueToOtp: (contact: string) => void;
}

// หน้าจอที่ 2: Sign In / Register (แสดงโลโก้ The 1 + แบรนด์ TWD/BnB, ช่องเบอร์โทร/อีเมล, Checkbox ยอมรับ T&C + PDPA และปุ่ม Continue)
export function SignInRegisterView(props: SignInRegisterViewProps): React.ReactElement {
  const [contact, setContact] = useState('');
  const [acceptedTnc, setAcceptedTnc] = useState(false);
  const [acceptedPdpa, setAcceptedPdpa] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const t = LIFF_TEXTS[props.locale];
  const isContactValid = isValidContactInput(contact);
  const canContinue = isContactValid && acceptedTnc && acceptedPdpa;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isContactValid) {
      setValidationError(mapRegistrationErrorMessage('INVALID_CONTACT', props.locale));
      return;
    }
    if (!acceptedTnc || !acceptedPdpa) return;
    setValidationError(null);
    props.onContinueToOtp(contact.trim());
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
      {/* โลโก้ The 1 คู่กับโลโก้แบรนด์ (TWD หรือ BnB Home) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <span
          style={{
            background: '#111827',
            color: '#ffffff',
            fontWeight: 700,
            padding: '0.45rem 0.9rem',
            borderRadius: 999,
            fontSize: '0.95rem',
          }}
        >
          The 1
        </span>
        <span style={{ fontWeight: 700, color: '#9ca3af' }}>×</span>
        <span
          style={{
            background: props.theme.primaryColorHex,
            color: '#ffffff',
            fontWeight: 700,
            padding: '0.45rem 0.9rem',
            borderRadius: 999,
            fontSize: '0.95rem',
          }}
        >
          {props.theme.logoBadgeText}
        </span>
      </div>

      <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', textAlign: 'center' }}>{t.signInTitle}</h2>
      <p style={{ margin: '0 0 1rem 0', color: '#4b5563', fontSize: '0.9rem', textAlign: 'center' }}>
        {t.signInSubtitle}
      </p>

      {validationError || props.externalError ? (
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
          {validationError ?? props.externalError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
          {t.contactLabel}
        </label>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t.contactPlaceholder}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.75rem',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            fontSize: '1rem',
            marginBottom: '1rem',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.2rem', fontSize: '0.88rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={acceptedTnc}
              onChange={(e) => setAcceptedTnc(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              {t.acceptTncPrefix}
              <a href={props.theme.tncUrl} target="_blank" rel="noreferrer" style={{ color: props.theme.primaryColorHex }}>
                {t.tncLinkText}
              </a>
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={acceptedPdpa}
              onChange={(e) => setAcceptedPdpa(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              {t.acceptPdpaPrefix}
              <a href={props.theme.pdpaUrl} target="_blank" rel="noreferrer" style={{ color: props.theme.primaryColorHex }}>
                {t.pdpaLinkText}
              </a>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!canContinue}
          style={{
            width: '100%',
            padding: '0.85rem',
            borderRadius: 10,
            border: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            color: '#ffffff',
            background: canContinue ? props.theme.primaryColorHex : '#9ca3af',
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
        >
          {t.continueBtn}
        </button>
      </form>
    </section>
  );
}
