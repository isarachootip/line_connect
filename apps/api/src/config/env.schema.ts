import { z } from 'zod';
import { AppEnvironment } from '@line-connect/shared';

// โครงสร้าง Schema สำหรับตรวจสอบความถูกต้องของ Environment Variables แยกตาม dev / staging / prod
export const envSchema = z.object({
  APP_ENV: z
    .nativeEnum(AppEnvironment, {
      errorMap: () => ({
        message: 'APP_ENV ต้องเป็นค่า dev, staging หรือ prod เท่านั้น',
      }),
    })
    .default(AppEnvironment.DEV),
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1, 'ต้องระบุ DATABASE_URL สำหรับเชื่อมต่อ PostgreSQL'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  MEMBER_PROFILE_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(600),
  PII_ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'PII_ENCRYPTION_KEY ต้องเป็นรหัสฐานสิบหกความยาว 64 ตัวอักษร (32 ไบต์สำหรับ AES-256-GCM)',
    ),
  PII_BLIND_INDEX_SECRET: z
    .string()
    .min(32, 'PII_BLIND_INDEX_SECRET ต้องมีความยาวอย่างน้อย 32 ตัวอักษร'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET ต้องมีความยาวอย่างน้อย 32 ตัวอักษร'),
  JWT_ACCESS_EXPIRES_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604800),
  LINE_CHANNEL_ID: z.string().min(1).default('default_line_channel_id'),
  LINE_LIFF_CHANNEL_ID_TWD: z.string().min(1),
  LINE_LIFF_CHANNEL_ID_BNB: z.string().min(1),
  LINE_VERIFY_MOCK: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  LINE_VERIFY_URL: z
    .string()
    .url('ต้องระบุ LINE_VERIFY_URL เป็น URL ที่ถูกต้อง')
    .default('https://api.line.me/oauth2/v2.1/verify'),
  THE1_PASSPORT_URL: z
    .string()
    .url('ต้องระบุ THE1_PASSPORT_URL เป็น URL ที่ถูกต้อง')
    .default('https://passport-mock.the1.co.th/authorize'),
  AUTH_RATE_LIMIT_PER_IP: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_PER_LINE_UID: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  THE1_MOCK: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  THE1_BASE_URL: z.string().url('ต้องระบุ THE1_BASE_URL เป็น URL ที่ถูกต้อง'),
  THE1_CLIENT_ID: z.string().min(1, 'ต้องระบุ THE1_CLIENT_ID'),
  THE1_CLIENT_SECRET: z.string().min(1, 'ต้องระบุ THE1_CLIENT_SECRET'),
  THE1_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  TWD_SPENDING_MODE: z.enum(['PUSH', 'PULL', 'BOTH']).default('BOTH'),
  TWD_SPENDING_AUTH_MODE: z.enum(['HMAC', 'MTLS']).default('HMAC'),
  TWD_SPENDING_HMAC_SECRET: z
    .string()
    .min(16, 'TWD_SPENDING_HMAC_SECRET ต้องมีความยาวอย่างน้อย 16 ตัวอักษร')
    .default('replace_with_strong_twd_spending_hmac_secret_32chars'),
  TWD_SPENDING_ALLOWED_IPS: z.string().min(1).default('127.0.0.1,::1,10.0.0.1'),
  TWD_SPENDING_PULL_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15),
  TWD_SPENDING_API_USE_MOCK: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  TWD_SPENDING_API_BASE_URL: z.string().url(),
  TWD_SPENDING_API_KEY: z.string().min(1),
  TWD_BATCH_EXPORT_DIR: z.string().min(1).default('./exports/batch'),
  EARN_POINT_QUEUE_MAX_RETRIES: z.coerce.number().int().positive().default(3),
  SFTP_USE_MOCK: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  SFTP_HOST: z.string().min(1).default('sftp-mock.thaiwatsadu.com'),
  SFTP_PORT: z.coerce.number().int().positive().default(22),
  SFTP_USER: z.string().min(1).default('twd_batch_user'),
  SFTP_KEY_PATH: z.string().min(1).default('./secrets/id_ed25519_twd_sftp'),
  SFTP_REMOTE_DIR: z.string().min(1).default('/incoming/target-batches'),
  ADMIN_SSO_USE_MOCK: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  ADMIN_SSO_ISSUER_URL: z
    .string()
    .url()
    .default('https://login.microsoftonline.com/common/v2.0'),
  ADMIN_SSO_CLIENT_ID: z.string().min(1).default('default_admin_sso_client_id'),
});

export type AppEnvConfig = z.infer<typeof envSchema>;

// ฟังก์ชันตรวจสอบ Environment Variables ตอนเริ่มต้นระบบ หากไม่ถูกต้องจะโยน Error ทันที
export function validateEnv(
  rawEnv: Record<string, string | undefined>,
): AppEnvConfig {
  const normalizedEnv: Record<string, string | undefined> = {
    ...rawEnv,
    LINE_CHANNEL_ID:
      rawEnv.LINE_CHANNEL_ID ??
      rawEnv.LINE_LIFF_CHANNEL_ID_TWD ??
      'default_line_channel_id',
    THE1_MOCK: rawEnv.THE1_MOCK ?? rawEnv.THE1_API_USE_MOCK,
    THE1_BASE_URL: rawEnv.THE1_BASE_URL ?? rawEnv.THE1_API_BASE_URL,
  };
  const parsed = envSchema.safeParse(normalizedEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`ตั้งค่า Environment Variable ไม่ถูกต้อง: ${issues}`);
  }
  return parsed.data;
}
