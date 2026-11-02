// รายชื่อคีย์ที่เป็นข้อมูลส่วนบุคคล (PII) และความลับ (Tokens/OTP) ที่ห้ามบันทึกลง Log โดยเด็ดขาด
const SENSITIVE_FIELD_NAMES = new Set([
  'phone',
  'phonenumber',
  'mobile',
  'email',
  'firstname',
  'lastname',
  'fullname',
  'nationalid',
  'citizenid',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'token',
  'otp',
  'otpcode',
  'password',
  'secret',
  'clientsecret',
  'authorization',
]);

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const THAI_PHONE_PATTERN = /(?:\+66|0)[689]\d{8}\b/g;

// ซ่อนตัวเลขตรงกลางของเบอร์โทรศัพท์ เช่น 0812345678 -> 081-***-5678
export function maskPhone(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.length < 7) {
    return '[REDACTED]';
  }
  const prefix = cleaned.slice(0, 3);
  const suffix = cleaned.slice(-4);
  return `${prefix}-***-${suffix}`;
}

// ซ่อนชื่อบัญชีอีเมลก่อนเครื่องหมาย @ เช่น customer@thaiwatsadu.com -> cu***@thaiwatsadu.com
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) {
    return '[REDACTED]';
  }
  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex);
  const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
  return `${visiblePrefix}***${domainPart}`;
}

// ค้นหาและซ่อนเบอร์โทร อีเมล และ Token ที่ปะปนอยู่ในข้อความ String อัตโนมัติ
export function redactStringPii(rawText: string): string {
  return rawText
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED_TOKEN]')
    .replace(JWT_PATTERN, '[REDACTED_TOKEN]')
    .replace(EMAIL_PATTERN, (matched) => maskEmail(matched))
    .replace(THAI_PHONE_PATTERN, (matched) => maskPhone(matched));
}

// ตรวจสอบและแทนที่ค่าใน Object, Array หรือ String ที่เป็นข้อมูลส่วนบุคคลและ Token อัตโนมัติ
export function redactPii<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return redactStringPii(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    const sanitizedArray = input.map((item: unknown) => redactPii(item));
    return sanitizedArray as unknown as T;
  }

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const sanitizedRecord: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
      if (SENSITIVE_FIELD_NAMES.has(normalizedKey)) {
        sanitizedRecord[key] = '[REDACTED]';
      } else {
        sanitizedRecord[key] = redactPii(value);
      }
    }

    return sanitizedRecord as unknown as T;
  }

  return input;
}
