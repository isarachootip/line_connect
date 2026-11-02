import { StructuredJsonLogger } from './structured-json.logger';

// ชุดทดสอบสำหรับ Structured JSON Logger ที่ Mask เบอร์โทร อีเมล และ Token อัตโนมัติ
describe('StructuredJsonLogger', () => {
  it('ควรพ่น Log เป็น JSON บรรทัดเดียวและ Mask เบอร์โทร อีเมล และ Token ทั้งหมดอัตโนมัติ', () => {
    const capturedLines: string[] = [];
    const logger = new StructuredJsonLogger((line) => capturedLines.push(line));

    logger.log(
      'ลูกค้า 0812345678 (customer@thaiwatsadu.com) ยืนยันตัวตนด้วย Bearer secretToken123456',
      {
        context: 'AuthService',
        phone: '0812345678',
        email: 'customer@thaiwatsadu.com',
        accessToken: 'raw-access-token-value',
        brand: 'TWD',
      },
    );

    expect(capturedLines).toHaveLength(1);
    const parsed = JSON.parse(capturedLines[0]) as {
      level: string;
      message: string;
      context: string;
      metadata: Record<string, unknown>;
      timestamp: string;
    };

    expect(parsed.level).toBe('info');
    expect(parsed.context).toBe('AuthService');
    expect(parsed.message).toContain('081-***-5678');
    expect(parsed.message).toContain('cu***@thaiwatsadu.com');
    expect(parsed.message).toContain('[REDACTED_TOKEN]');
    expect(parsed.message).not.toContain('0812345678');
    expect(parsed.message).not.toContain('secretToken123456');
    expect(parsed.metadata.phone).toBe('[REDACTED]');
    expect(parsed.metadata.email).toBe('[REDACTED]');
    expect(parsed.metadata.accessToken).toBe('[REDACTED]');
    expect(parsed.metadata.brand).toBe('TWD');
  });
});
