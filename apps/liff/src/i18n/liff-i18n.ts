export type LiffLocale = 'TH' | 'EN';

export type LiffErrorKind =
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'NETWORK_ERROR'
  | 'INVALID_CONTACT';

export interface LiffI18nDictionary {
  readonly signInTitle: string;
  readonly signInSubtitle: string;
  readonly contactLabel: string;
  readonly contactPlaceholder: string;
  readonly acceptTncPrefix: string;
  readonly tncLinkText: string;
  readonly acceptPdpaPrefix: string;
  readonly pdpaLinkText: string;
  readonly continueBtn: string;
  readonly otpTitle: string;
  readonly otpSentToLabel: string;
  readonly otpRefLabel: string;
  readonly otpPlaceholder: string;
  readonly verifyOtpBtn: string;
  readonly backBtn: string;
  readonly homeWelcomeTitle: string;
  readonly homeLinkedBadge: string;
  readonly couponPopupTitle: string;
  readonly couponPopupDesc: string;
  readonly couponPopupCloseBtn: string;
}

export const LIFF_TEXTS: Record<LiffLocale, LiffI18nDictionary> = {
  TH: {
    signInTitle: 'เข้าสู่ระบบ / ลงทะเบียนสมาชิก',
    signInSubtitle: 'ผูกบัญชี LINE กับ The 1 Passport เพียงครั้งเดียวเพื่อรับสิทธิพิเศษ',
    contactLabel: 'เบอร์โทรศัพท์ หรือ อีเมล ที่ผูกกับ The 1',
    contactPlaceholder: 'เช่น 0812345678 หรือ name@email.com',
    acceptTncPrefix: 'ฉันได้อ่านและยอมรับ ',
    tncLinkText: 'ข้อกำหนดและเงื่อนไขการใช้งาน (Terms & Conditions)',
    acceptPdpaPrefix: 'ฉันรับทราบและให้ความยินยอมตาม ',
    pdpaLinkText: 'นโยบายคุ้มครองข้อมูลส่วนบุคคล (Privacy Policy)',
    continueBtn: 'ดำเนินการต่อ (Continue)',
    otpTitle: 'ยืนยันรหัส OTP 6 หลัก (The 1 Passport)',
    otpSentToLabel: 'ส่งรหัสยืนยันไปยัง:',
    otpRefLabel: 'รหัสอ้างอิง (Ref Code):',
    otpPlaceholder: 'กรอกรหัส OTP 6 หลัก',
    verifyOtpBtn: 'ยืนยันรหัส OTP',
    backBtn: 'ย้อนกลับ',
    homeWelcomeTitle: 'ยินดีต้อนรับสู่สมาชิก Line Connect',
    homeLinkedBadge: 'ผูกบัญชี The 1 สำเร็จแล้ว',
    couponPopupTitle: 'ยินดีด้วย! คุณได้รับคูปองส่วนลด 20%',
    couponPopupDesc:
      'คูปองต้อนรับสมาชิกใหม่ "Online First Registration" ลด 20% สูงสุด 400 บาท ถูกเพิ่มเข้ากระเป๋าคูปองของคุณเรียบร้อยแล้ว',
    couponPopupCloseBtn: 'เก็บคูปองและเข้าสู่หน้าหลัก',
  },
  EN: {
    signInTitle: 'Sign In / Register',
    signInSubtitle: 'Link your LINE account with The 1 Passport once to unlock exclusive rewards',
    contactLabel: 'Mobile Number or Email registered with The 1',
    contactPlaceholder: 'e.g. 0812345678 or name@email.com',
    acceptTncPrefix: 'I have read and agree to the ',
    tncLinkText: 'Terms & Conditions',
    acceptPdpaPrefix: 'I acknowledge and consent to the ',
    pdpaLinkText: 'Privacy Policy (PDPA)',
    continueBtn: 'Continue',
    otpTitle: 'Verify 6-Digit OTP (The 1 Passport)',
    otpSentToLabel: 'Verification code sent to:',
    otpRefLabel: 'Reference Code (Ref):',
    otpPlaceholder: 'Enter 6-digit OTP',
    verifyOtpBtn: 'Verify OTP',
    backBtn: 'Back',
    homeWelcomeTitle: 'Welcome to Line Connect',
    homeLinkedBadge: 'The 1 Account Linked',
    couponPopupTitle: 'Congratulations! You got a 20% OFF Coupon',
    couponPopupDesc:
      'Your "Online First Registration" coupon (20% OFF up to 400 THB) has been added to your coupon wallet.',
    couponPopupCloseBtn: 'Go to Home',
  },
};

const ERROR_MESSAGES: Record<LiffLocale, Record<LiffErrorKind, string>> = {
  TH: {
    OTP_INVALID: 'รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบตัวเลข 6 หลักและลองใหม่อีกครั้ง',
    OTP_EXPIRED: 'รหัส OTP หมดเวลาแล้ว กรุณากดย้อนกลับเพื่อขอรหัส OTP ใหม่',
    NETWORK_ERROR:
      'ไม่สามารถเชื่อมต่อเครือข่ายได้ในขณะนี้ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตและลองใหม่อีกครั้ง',
    INVALID_CONTACT: 'กรุณากรอกเบอร์โทรศัพท์มือถือ 10 หลัก หรืออีเมลให้ถูกต้อง',
  },
  EN: {
    OTP_INVALID: 'Invalid OTP code. Please check the 6-digit code and try again.',
    OTP_EXPIRED: 'The OTP code has expired. Please go back and request a new code.',
    NETWORK_ERROR:
      'Network connection unavailable. Please check your internet connection and try again.',
    INVALID_CONTACT: 'Please enter a valid 10-digit mobile number or email address.',
  },
};

// แปลงรหัสข้อผิดพลาดให้เป็นข้อความที่ลูกค้าเข้าใจได้ง่ายตามภาษาที่เลือก (TH / EN)
export function mapRegistrationErrorMessage(
  errorKind: LiffErrorKind,
  locale: LiffLocale,
): string {
  return ERROR_MESSAGES[locale][errorKind];
}

// ตรวจสอบความถูกต้องเบื้องต้นของเบอร์โทรศัพท์ (9-10 หลัก) หรืออีเมล
export function isValidContactInput(rawContact: string): boolean {
  const trimmed = rawContact.trim();
  const digitsOnly = trimmed.replace(/[-\s]/g, '');
  if (/^0\d{8,9}$/.test(digitsOnly)) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

// ซ่อนข้อมูลเบอร์โทรศัพท์หรืออีเมลบางส่วน (Mask) สำหรับแสดงบนหน้ายืนยัน OTP
export function maskContactForDisplay(rawContact: string): string {
  const trimmed = rawContact.trim();
  if (trimmed.includes('@')) {
    const [localPart, domainPart] = trimmed.split('@');
    const prefix = (localPart ?? '').slice(0, 2);
    return `${prefix}***@${domainPart ?? ''}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `${digits.slice(0, 3)}-***-${digits.slice(-4)}`;
  }
  return `${trimmed.slice(0, 2)}***`;
}
