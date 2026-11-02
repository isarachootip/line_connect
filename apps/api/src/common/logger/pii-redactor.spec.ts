import {
  maskEmail,
  maskPhone,
  redactPii,
  redactStringPii,
} from './pii-redactor';

// ชุดทดสอบการปกปิดข้อมูลส่วนบุคคล (PII) และ Token ก่อนบันทึกลงระบบ Log
describe('PII Redactor (Zero PII Logging Policy)', () => {
  it('ควรซ่อนตัวเลขกลางของเบอร์โทรศัพท์ให้เหลือเฉพาะส่วนหน้าและส่วนท้าย', () => {
    expect(maskPhone('0812345678')).toBe('081-***-5678');
    expect(maskPhone('+66812345678')).toBe('+66-***-5678');
  });

  it('ควรซ่อนชื่อบัญชีอีเมลก่อนเครื่องหมาย @ เพื่อป้องกันการรั่วไหลใน Log', () => {
    expect(maskEmail('customer@thaiwatsadu.com')).toBe('cu***@thaiwatsadu.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
  });

  it('ควรซ่อนเบอร์โทร อีเมล และ Bearer/JWT Token ที่ปะปนอยู่ในข้อความ String อัตโนมัติ', () => {
    const rawText =
      'Login user 0812345678 email somchai@thaiwatsadu.com with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const maskedText = redactStringPii(rawText);

    expect(maskedText).not.toContain('0812345678');
    expect(maskedText).toContain('081-***-5678');
    expect(maskedText).not.toContain('somchai@thaiwatsadu.com');
    expect(maskedText).toContain('so***@thaiwatsadu.com');
    expect(maskedText).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(maskedText).toContain('[REDACTED_TOKEN]');
  });

  it('ควรกรองฟิลด์ข้อมูลส่วนบุคคลและ Token ใน Object ซ้อนกัน (Nested Object & Array) ออกทั้งหมด', () => {
    const rawLogPayload = {
      requestId: 'req-101',
      brand: 'TWD',
      member: {
        lineUid: 'U1234567890abcdef',
        phone: '0812345678',
        email: 'somchai@example.com',
      },
      auth: {
        accessToken: 'secret-access-token',
        refreshToken: 'secret-refresh-token',
      },
      note: 'ส่ง OTP ไปยัง 0891112222 และ user@bnbhome.com',
    };

    const sanitized = redactPii(rawLogPayload);

    expect(sanitized.member.phone).toBe('[REDACTED]');
    expect(sanitized.member.email).toBe('[REDACTED]');
    expect(sanitized.auth.accessToken).toBe('[REDACTED]');
    expect(sanitized.auth.refreshToken).toBe('[REDACTED]');
    expect(sanitized.note).toContain('089-***-2222');
    expect(sanitized.note).toContain('us***@bnbhome.com');
  });
});
