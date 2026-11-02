import { BrandCode } from '@line-connect/shared';
import { getBrandThemeConfig } from './liff-brand.config';

// ชุดทดสอบการตั้งค่าธีมและชื่อแสดงผลของ LIFF แยกตามแบรนด์ (ไทวัสดุ และ BnB Home)
describe('LIFF Brand Theme Configuration', () => {
  it('ควรคืนค่าข้อมูลแบรนด์ไทวัสดุ (TWD) ได้อย่างถูกต้อง', () => {
    const twdConfig = getBrandThemeConfig(BrandCode.TWD);
    expect(twdConfig.brand).toBe(BrandCode.TWD);
    expect(twdConfig.displayNameTh).toBe('ไทวัสดุ');
    expect(twdConfig.primaryColorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('ควรคืนค่าข้อมูลแบรนด์ BnB Home (BNB) ได้อย่างถูกต้อง', () => {
    const bnbConfig = getBrandThemeConfig(BrandCode.BNB);
    expect(bnbConfig.brand).toBe(BrandCode.BNB);
    expect(bnbConfig.displayNameTh).toBe('BnB Home');
    expect(bnbConfig.primaryColorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
