import { AppEnvironment } from '@line-connect/shared';
import { validateEnv } from './env.schema';

// ชุดทดสอบการตรวจสอบตัวแปรสภาพแวดล้อมแยกตาม dev / staging / prod
describe('Environment Schema Validation (dev / staging / prod)', () => {
  const validBaseEnv: Record<string, string> = {
    APP_ENV: 'dev',
    NODE_ENV: 'development',
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

  it('ควรรองรับการตั้งค่า APP_ENV ทั้ง dev, staging และ prod ได้อย่างถูกต้อง', () => {
    const devConfig = validateEnv({ ...validBaseEnv, APP_ENV: 'dev' });
    expect(devConfig.APP_ENV).toBe(AppEnvironment.DEV);

    const stagingConfig = validateEnv({ ...validBaseEnv, APP_ENV: 'staging' });
    expect(stagingConfig.APP_ENV).toBe(AppEnvironment.STAGING);

    const prodConfig = validateEnv({
      ...validBaseEnv,
      APP_ENV: 'prod',
      NODE_ENV: 'production',
    });
    expect(prodConfig.APP_ENV).toBe(AppEnvironment.PROD);
  });

  it('ควรโยนข้อผิดพลาดเมื่อระบุ APP_ENV ที่ไม่อยู่ใน dev | staging | prod', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        APP_ENV: 'invalid_env',
      }),
    ).toThrow(/APP_ENV/);
  });

  it('ควรโยนข้อผิดพลาดเมื่อ PII_ENCRYPTION_KEY ไม่ใช่เลขฐานสิบหกความยาว 64 ตัวอักษร', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        PII_ENCRYPTION_KEY: 'short_invalid_key',
      }),
    ).toThrow(/PII_ENCRYPTION_KEY/);
  });
});
