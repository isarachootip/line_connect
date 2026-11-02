import { validateEnv } from './env.schema';

// ชุดทดสอบการตรวจสอบตัวแปรสภาพแวดล้อม (Environment Variable Validation)
describe('Environment Schema Validation', () => {
  const validBaseEnv: Record<string, string> = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://lineconnect:pwd@localhost:5432/line_connect_db',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    PII_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    PII_BLIND_INDEX_SECRET: 'super_secret_hmac_key_at_least_32_characters_long',
    JWT_SECRET: 'super_secret_jwt_key_at_least_32_characters_long',
    LINE_LIFF_CHANNEL_ID_TWD: '1234567890',
    LINE_LIFF_CHANNEL_ID_BNB: '0987654321',
    THE1_API_USE_MOCK: 'true',
    THE1_API_BASE_URL: 'https://api-mock.the1.co.th',
    THE1_CLIENT_ID: 'mock_client_id',
    THE1_CLIENT_SECRET: 'mock_client_secret',
    TWD_SPENDING_API_USE_MOCK: 'true',
    TWD_SPENDING_API_BASE_URL: 'https://api-mock.thaiwatsadu.com',
    TWD_SPENDING_API_KEY: 'mock_spending_key',
    TWD_BATCH_EXPORT_DIR: './exports/batch',
  };

  it('ควรผ่านการตรวจสอบและแปลงชนิดข้อมูลให้ถูกต้องเมื่อตั้งค่าครบถ้วน', () => {
    const config = validateEnv(validBaseEnv);
    expect(config.PORT).toBe(3000);
    expect(config.REDIS_PORT).toBe(6379);
    expect(config.THE1_API_USE_MOCK).toBe(true);
    expect(config.TWD_SPENDING_API_USE_MOCK).toBe(true);
  });

  it('ควรโยนข้อผิดพลาดเมื่อ PII_ENCRYPTION_KEY ไม่ใช่เลขฐานสิบหกความยาว 64 ตัวอักษร', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        PII_ENCRYPTION_KEY: 'short_invalid_key',
      }),
    ).toThrow(/PII_ENCRYPTION_KEY/);
  });

  it('ควรโยนข้อผิดพลาดเมื่อขาดตัวแปรสำคัญ เช่น DATABASE_URL หรือ JWT_SECRET สั้นเกินไป', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        JWT_SECRET: 'too_short',
      }),
    ).toThrow(/JWT_SECRET/);
  });
});
