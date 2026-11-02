import { AppEnvironment } from '@line-connect/shared';
import { validateEnv } from './env.schema';

// ชุดทดสอบการตรวจสอบตัวแปรสภาพแวดล้อมแยกตาม dev / staging / prod และการตั้งค่า The 1 API
describe('Environment Schema Validation (dev / staging / prod & The 1 Config)', () => {
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
    THE1_MOCK: 'true',
    THE1_BASE_URL: 'https://api-mock.the1.co.th',
    THE1_CLIENT_ID: 'mock_client_id',
    THE1_CLIENT_SECRET: 'mock_client_secret',
    THE1_TIMEOUT_MS: '3000',
    TWD_SPENDING_API_USE_MOCK: 'true',
    TWD_SPENDING_API_BASE_URL: 'https://api-mock.thaiwatsadu.com',
    TWD_SPENDING_API_KEY: 'mock_spending_key',
    TWD_BATCH_EXPORT_DIR: './exports/batch',
  };

  it('ควรรองรับการตั้งค่า APP_ENV ทั้ง dev, staging และ prod รวมถึงตัวแปร THE1_* ได้ถูกต้อง', () => {
    const devConfig = validateEnv({ ...validBaseEnv, APP_ENV: 'dev' });
    expect(devConfig.APP_ENV).toBe(AppEnvironment.DEV);
    expect(devConfig.THE1_MOCK).toBe(true);
    expect(devConfig.THE1_BASE_URL).toBe('https://api-mock.the1.co.th');
    expect(devConfig.THE1_TIMEOUT_MS).toBe(3000);

    const stagingConfig = validateEnv({
      ...validBaseEnv,
      APP_ENV: 'staging',
      THE1_MOCK: 'false',
    });
    expect(stagingConfig.APP_ENV).toBe(AppEnvironment.STAGING);
    expect(stagingConfig.THE1_MOCK).toBe(false);

    const prodConfig = validateEnv({
      ...validBaseEnv,
      APP_ENV: 'prod',
      NODE_ENV: 'production',
      LINE_CHANNEL_ID: '1234567890',
      LINE_VERIFY_MOCK: 'false',
      THE1_PASSPORT_URL: 'https://passport.the1.co.th/authorize',
      JWT_ACCESS_EXPIRES_SECONDS: '600',
      JWT_REFRESH_EXPIRES_SECONDS: '86400',
      AUTH_RATE_LIMIT_PER_IP: '30',
      AUTH_RATE_LIMIT_PER_LINE_UID: '15',
      AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
    });
    expect(prodConfig.APP_ENV).toBe(AppEnvironment.PROD);
    expect(prodConfig.LINE_CHANNEL_ID).toBe('1234567890');
    expect(prodConfig.LINE_VERIFY_MOCK).toBe(false);
    expect(prodConfig.THE1_PASSPORT_URL).toBe('https://passport.the1.co.th/authorize');
    expect(prodConfig.JWT_ACCESS_EXPIRES_SECONDS).toBe(600);
    expect(prodConfig.JWT_REFRESH_EXPIRES_SECONDS).toBe(86400);
    expect(prodConfig.AUTH_RATE_LIMIT_PER_IP).toBe(30);
    expect(prodConfig.AUTH_RATE_LIMIT_PER_LINE_UID).toBe(15);
    expect(prodConfig.AUTH_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(prodConfig.TWD_SPENDING_MODE).toBe('BOTH');
    expect(prodConfig.TWD_SPENDING_AUTH_MODE).toBe('HMAC');
    expect(prodConfig.TWD_SPENDING_PULL_INTERVAL_MINUTES).toBe(15);
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
