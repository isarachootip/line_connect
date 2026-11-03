import React, { useEffect, useState } from 'react';
import { BrandCode } from '@line-connect/shared';
import { SignInRegisterView } from './components/SignInRegisterView';
import { The1OtpVerifyView } from './components/The1OtpVerifyView';
import { WelcomeCouponModal } from './components/WelcomeCouponModal';
import { getBrandThemeConfig, resolveBrandFromQuery } from './config/liff-brand.config';
import { LiffLocale, mapRegistrationErrorMessage } from './i18n/liff-i18n';
import { LiffAuthApiService, LiffRegistrationFlowError } from './services/liff-auth.service';
import { getLiffIdToken, initializeLiffApp, LiffInitResult } from './services/liff-client';

export type RegistrationStep = 'LOADING' | 'SIGN_IN_REGISTER' | 'OTP_VERIFY' | 'HOME';

const authApi = new LiffAuthApiService(
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
);

// แอปพลิเคชัน LINE LIFF หลักสำหรับ Flow ลงทะเบียนและเข้าสู่ระบบด้วย The 1 Passport (รองรับ TH/EN และธีม TWD/BnB)
export function App(): React.ReactElement {
  const initialBrand = resolveBrandFromQuery(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const [brand, setBrand] = useState<BrandCode>(initialBrand);
  const [locale, setLocale] = useState<LiffLocale>('TH');
  const [step, setStep] = useState<RegistrationStep>('LOADING');
  const [liffStatus, setLiffStatus] = useState<LiffInitResult | null>(null);
  const [idToken, setIdToken] = useState<string>('');
  const [authState, setAuthState] = useState<string>('mock-state-001');
  const [contact, setContact] = useState<string>('');
  const [otpRef, setOtpRef] = useState<string>('T1-8892');
  const [memberId, setMemberId] = useState<string>('');
  const [showCouponModal, setShowCouponModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const brandTheme = getBrandThemeConfig(brand);

  useEffect(() => {
    const liffId = import.meta.env.VITE_LIFF_ID ?? 'mock-liff-id-local';
    void (async () => {
      const initRes = await initializeLiffApp(liffId);
      setLiffStatus(initRes);
      const token = getLiffIdToken();
      setIdToken(token);

      try {
        const lineRes = await authApi.checkLineAuth(token, brand);
        if (lineRes.linked) {
          setMemberId(lineRes.memberId);
          setStep('HOME');
        } else {
          setAuthState(lineRes.state);
          setStep('SIGN_IN_REGISTER');
        }
      } catch {
        setStep('SIGN_IN_REGISTER');
      }
    })();
  }, [brand]);

  const handleContinueToOtp = (userContact: string): void => {
    setContact(userContact);
    setOtpRef(`T1-${Math.floor(1000 + Math.random() * 9000)}`);
    setErrorMessage(null);
    setStep('OTP_VERIFY');
  };

  const handleSubmitOtp = async (otpCode: string): Promise<void> => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const callbackRes = await authApi.verifyOtpAndLinkMember({
        idToken,
        state: authState,
        brand,
        otpRef,
        otpCode,
        tncVersion: 'v1.0',
        pdpaVersion: 'v1.0',
      });
      setMemberId(callbackRes.memberId);
      setShowCouponModal(callbackRes.isFirstRegistration);
      setStep('HOME');
    } catch (err) {
      const kind = err instanceof LiffRegistrationFlowError ? err.kind : 'NETWORK_ERROR';
      setErrorMessage(mapRegistrationErrorMessage(kind, locale));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 430, margin: '0 auto', minHeight: '100vh', padding: '1rem', background: '#f9fafb' }}>
      {/* แถบส่วนหัว Mobile-First: สลับแบรนด์ (?brand=TWD|BNB) และภาษา (TH / EN) */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => setBrand(BrandCode.TWD)}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: 6,
              border: 'none',
              background: brand === BrandCode.TWD ? '#E31837' : '#e5e7eb',
              color: brand === BrandCode.TWD ? '#ffffff' : '#374151',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
          >
            TWD
          </button>
          <button
            type="button"
            onClick={() => setBrand(BrandCode.BNB)}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: 6,
              border: 'none',
              background: brand === BrandCode.BNB ? '#F37021' : '#e5e7eb',
              color: brand === BrandCode.BNB ? '#ffffff' : '#374151',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
          >
            BnB
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button type="button" onClick={() => setLocale('TH')} style={{ fontWeight: locale === 'TH' ? 700 : 400 }}>
            TH
          </button>
          <button type="button" onClick={() => setLocale('EN')} style={{ fontWeight: locale === 'EN' ? 700 : 400 }}>
            EN
          </button>
        </div>
      </header>

      {step === 'LOADING' ? (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>
          กำลังตรวจสอบสถานะบัญชี LINE LIFF ({liffStatus?.liffId ?? '...'})...
        </p>
      ) : null}

      {step === 'SIGN_IN_REGISTER' ? (
        <SignInRegisterView theme={brandTheme} locale={locale} externalError={errorMessage} onContinueToOtp={handleContinueToOtp} />
      ) : null}

      {step === 'OTP_VERIFY' ? (
        <The1OtpVerifyView
          theme={brandTheme}
          locale={locale}
          rawContact={contact}
          otpRef={otpRef}
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          onSubmitOtp={handleSubmitOtp}
          onBack={() => {
            setErrorMessage(null);
            setStep('SIGN_IN_REGISTER');
          }}
        />
      ) : null}

      {step === 'HOME' ? (
        <WelcomeCouponModal
          theme={brandTheme}
          locale={locale}
          memberId={memberId || 'T1_MEM_001'}
          showWelcomeCouponPopup={showCouponModal}
          onClosePopup={() => setShowCouponModal(false)}
        />
      ) : null}
    </main>
  );
}
