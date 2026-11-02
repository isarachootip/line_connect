import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

// บริการเข้ารหัสข้อมูลส่วนบุคคล (PDPA) และ Token ด้วย AES-256-GCM พร้อมสร้าง HMAC Blind Index
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12;
  private readonly keyBuffer: Buffer;
  private readonly blindIndexSecret: string;

  constructor(encryptionKeyHex: string, blindIndexSecret: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(encryptionKeyHex)) {
      throw new Error(
        'กุญแจเข้ารหัส (PII_ENCRYPTION_KEY) ต้องเป็นเลขฐานสิบหกความยาว 64 ตัวอักษร',
      );
    }
    if (blindIndexSecret.length < 32) {
      throw new Error(
        'กุญแจ Blind Index (PII_BLIND_INDEX_SECRET) ต้องมีความยาวอย่างน้อย 32 ตัวอักษร',
      );
    }
    this.keyBuffer = Buffer.from(encryptionKeyHex, 'hex');
    this.blindIndexSecret = blindIndexSecret;
  }

  // เข้ารหัสข้อความ Plaintext เป็นรูปแบบ ivHex:authTagHex:cipherTextHex
  encrypt(plainText: string): string {
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, this.keyBuffer, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('hex'),
      authTag.toString('hex'),
      encrypted.toString('hex'),
    ].join(':');
  }

  // ถอดรหัสข้อความจากรูปแบบ ivHex:authTagHex:cipherTextHex และตรวจสอบความถูกต้องด้วย Auth Tag
  decrypt(encryptedPayload: string): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('รูปแบบข้อมูลที่เข้ารหัสไม่ถูกต้อง');
    }

    const [ivHex, authTagHex, cipherTextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const cipherText = Buffer.from(cipherTextHex, 'hex');

    const decipher = createDecipheriv(this.algorithm, this.keyBuffer, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(cipherText),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  // สร้างค่า Hash คงที่ด้วย HMAC-SHA256 สำหรับใช้ค้นหาข้อมูลส่วนบุคคลโดยไม่ต้องถอดรหัสทั้งตาราง
  createBlindIndex(rawValue: string): string {
    const normalized = rawValue.trim().toLowerCase();
    return createHmac('sha256', this.blindIndexSecret)
      .update(normalized, 'utf8')
      .digest('hex');
  }
}
