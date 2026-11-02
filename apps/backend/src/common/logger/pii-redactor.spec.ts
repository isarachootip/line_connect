import { maskEmail, maskPhone, redactPii } from './pii-redactor';

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

  it('ควรกรองฟิลด์ข้อมูลส่วนบุคคลและ Token ใน Object ซ้อนกัน (Nested Object & Array) ออกทั้งหมด', () => {
    const rawLogPayload = {
      requestId: 'req-101',
      brand: 'TWD',
      member: {
        lineUid: 'U1234567890abcdef',
        phone: '0812345678',
        email: 'somchai@example.com',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
      },
      auth: {
        accessToken: 'secret-access-token',
        refreshToken: 'secret-refresh-token',
        otpCode: '123456',
      },
      items: [{ phone: '0898765432', points: 500 }],
    };

    const sanitized = redactPii(rawLogPayload);

    expect(sanitized.requestId).toBe('req-101');
    expect(sanitized.brand).toBe('TWD');
    expect(sanitized.member.lineUid).toBe('U1234567890abcdef');
    expect(sanitized.member.phone).toBe('[REDACTED]');
    expect(sanitized.member.email).toBe('[REDACTED]');
    expect(sanitized.member.firstName).toBe('[REDACTED]');
    expect(sanitized.member.lastName).toBe('[REDACTED]');
    expect(sanitized.auth.accessToken).toBe('[REDACTED]');
    expect(sanitized.auth.refreshToken).toBe('[REDACTED]');
    expect(sanitized.auth.otpCode).toBe('[REDACTED]');
    expect(sanitized.items[0].phone).toBe('[REDACTED]');
    expect(sanitized.items[0].points).toBe(500);
  });
});
