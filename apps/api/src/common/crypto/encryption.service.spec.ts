import { EncryptionService } from './encryption.service';

// ชุดทดสอบการเข้ารหัสข้อมูลส่วนบุคคล (PDPA) และ Token ด้วย AES-256-GCM และ HMAC Blind Index
describe('EncryptionService (PDPA & Token Security)', () => {
  const testEncryptionKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testBlindIndexSecret =
    'blind_index_hmac_secret_key_for_unit_testing_32chars';

  let service: EncryptionService;

  beforeEach(() => {
    service = new EncryptionService(testEncryptionKey, testBlindIndexSecret);
  });

  it('ควรเข้ารหัสและถอดรหัสข้อมูลส่วนบุคคล (เบอร์โทร/อีเมล/Token) กลับมาเป็นค่าเดิมได้ถูกต้อง', () => {
    const originalPhone = '0812345678';
    const encrypted = service.encrypt(originalPhone);

    expect(encrypted).not.toContain(originalPhone);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(originalPhone);
  });

  it('ควรสร้าง Ciphertext ที่ไม่ซ้ำกันแม้เข้ารหัสข้อมูลเดียวกัน (สุ่ม IV ทุกครั้ง)', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret';
    const cipher1 = service.encrypt(token);
    const cipher2 = service.encrypt(token);

    expect(cipher1).not.toBe(cipher2);
    expect(service.decrypt(cipher1)).toBe(token);
    expect(service.decrypt(cipher2)).toBe(token);
  });

  it('ควรโยนข้อผิดพลาดทันทีเมื่อข้อมูลที่เข้ารหัสถูกแก้ไขหรือปลอมแปลง (Auth Tag Integrity)', () => {
    const encrypted = service.encrypt('0899998888');
    const parts = encrypted.split(':');
    const tamperedCipher = `${parts[0]}:${parts[1]}:ff${parts[2].slice(2)}`;

    expect(() => service.decrypt(tamperedCipher)).toThrow();
  });

  it('ควรสร้าง Blind Index (HMAC-SHA256) ที่คงที่สำหรับการค้นหาโดย normalize ช่องว่างและตัวพิมพ์เล็ก-ใหญ่', () => {
    const hash1 = service.createBlindIndex('  User@Example.com ');
    const hash2 = service.createBlindIndex('user@example.com');
    const hashOther = service.createBlindIndex('other@example.com');

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe(hashOther);
  });
});
