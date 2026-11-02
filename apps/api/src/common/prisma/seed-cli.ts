import { AppEnvironment } from '@line-connect/shared';
import { EncryptionService } from '../crypto/encryption.service';
import { StructuredJsonLogger } from '../logger/structured-json.logger';
import { PrismaService } from './prisma.service';
import { runDevSeed } from './dev-seeder';

const DEFAULT_DEV_HEX_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DEFAULT_DEV_BLIND_SECRET =
  'dev_blind_index_hmac_secret_at_least_32_characters_long';

// สคริปต์ CLI สำหรับรัน Seed ข้อมูลเริ่มต้นในสภาพแวดล้อมการพัฒนา (dev)
async function executeSeedCli(): Promise<void> {
  const logger = new StructuredJsonLogger();
  const prisma = new PrismaService();
  const encryption = new EncryptionService(
    process.env.PII_ENCRYPTION_KEY ?? DEFAULT_DEV_HEX_KEY,
    process.env.PII_BLIND_INDEX_SECRET ?? DEFAULT_DEV_BLIND_SECRET,
  );

  const rawEnv = process.env.APP_ENV;
  const appEnv =
    rawEnv === AppEnvironment.PROD
      ? AppEnvironment.PROD
      : rawEnv === AppEnvironment.STAGING
        ? AppEnvironment.STAGING
        : AppEnvironment.DEV;

  try {
    await prisma.onModuleInit();
    const result = await runDevSeed(prisma, encryption, appEnv);
    logger.log('สร้างข้อมูลจำลอง (Dev Seed) สำเร็จครบทั้ง 11 ตาราง', {
      context: 'DevSeedCli',
      ...result,
    });
  } finally {
    await prisma.onModuleDestroy();
  }
}

void executeSeedCli();
