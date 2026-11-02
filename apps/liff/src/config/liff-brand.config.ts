import { BrandCode } from '@line-connect/shared';

// โครงสร้างการตั้งค่าธีมและข้อมูลแสดงผลของแต่ละแบรนด์บนหน้าจอ LINE LIFF
export interface LiffBrandTheme {
  readonly brand: BrandCode;
  readonly displayNameTh: string;
  readonly displayNameEn: string;
  readonly primaryColorHex: string;
}

const BRAND_THEMES: Record<BrandCode, LiffBrandTheme> = {
  [BrandCode.TWD]: {
    brand: BrandCode.TWD,
    displayNameTh: 'ไทวัสดุ',
    displayNameEn: 'Thai Watsadu',
    primaryColorHex: '#E31837',
  },
  [BrandCode.BNB]: {
    brand: BrandCode.BNB,
    displayNameTh: 'BnB Home',
    displayNameEn: 'BnB Home',
    primaryColorHex: '#F37021',
  },
};

// ดึงข้อมูลการตั้งค่าธีมตามรหัสแบรนด์ (TWD หรือ BNB)
export function getBrandThemeConfig(brand: BrandCode): LiffBrandTheme {
  return BRAND_THEMES[brand];
}
