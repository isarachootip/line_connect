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
  LINE_LIFF_CHANNEL_ID_TWD: z.string().min(1),
  LINE_LIFF_CHANNEL_ID_BNB: z.string().min(1),
  THE1_MOCK: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  THE1_BASE_URL: z.string().url('ต้องระบุ THE1_BASE_URL เป็น URL ที่ถูกต้อง'),
  THE1_CLIENT_ID: z.string().min(1, 'ต้องระบุ THE1_CLIENT_ID'),
  THE1_CLIENT_SECRET: z.string().min(1, 'ต้องระบุ THE1_CLIENT_SECRET'),
  THE1_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  TWD_SPENDING_API_USE_MOCK: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  TWD_SPENDING_API_BASE_URL: z.string().url(),
  TWD_SPENDING_API_KEY: z.string().min(1),
  TWD_BATCH_EXPORT_DIR: z.string().min(1).default('./exports/batch'),
});

export type AppEnvConfig = z.infer<typeof envSchema>;

// ฟังก์ชันตรวจสอบ Environment Variables ตอนเริ่มต้นระบบ หากไม่ถูกต้องจะโยน Error ทันที
export function validateEnv(
  rawEnv: Record<string, string | undefined>,
): AppEnvConfig {
  const normalizedEnv: Record<string, string | undefined> = {
    ...rawEnv,
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
