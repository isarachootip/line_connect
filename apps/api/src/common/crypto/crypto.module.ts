import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

const DEFAULT_DEV_HEX_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DEFAULT_DEV_BLIND_SECRET =
  'dev_blind_index_hmac_secret_at_least_32_characters_long';

// โมดูลกลางสำหรับให้บริการเข้ารหัสข้อมูลส่วนบุคคลและ Token (AES-256-GCM) ด้วย Key จาก Environment Variable
@Global()
@Module({
  providers: [
    {
      provide: EncryptionService,
      useFactory: () =>
        new EncryptionService(
          process.env.PII_ENCRYPTION_KEY ?? DEFAULT_DEV_HEX_KEY,
          process.env.PII_BLIND_INDEX_SECRET ?? DEFAULT_DEV_BLIND_SECRET,
        ),
    },
  ],
  exports: [EncryptionService],
})
export class CryptoModule {}
