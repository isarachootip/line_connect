import { BrandCode, isValidBrandCode } from '@line-connect/shared';

// โครงสร้างการตั้งค่าธีม โลโก้ และลิงก์ข้อกำหนดของแต่ละแบรนด์บนหน้าจอ LINE LIFF
export interface LiffBrandTheme {
  readonly brand: BrandCode;
  readonly displayNameTh: string;
  readonly displayNameEn: string;
  readonly primaryColorHex: string;
  readonly accentBgHex: string;
  readonly logoBadgeText: string;
  readonly tncUrl: string;
  readonly pdpaUrl: string;
}

const DEFAULT_TNC_URL = 'https://www.thaiwatsadu.com/th/terms-and-conditions';
const DEFAULT_PDPA_URL = 'https://www.thaiwatsadu.com/th/privacy-policy';

const BRAND_THEMES: Record<BrandCode, LiffBrandTheme> = {
  [BrandCode.TWD]: {
    brand: BrandCode.TWD,
    displayNameTh: 'ไทวัสดุ',
    displayNameEn: 'Thai Watsadu',
    primaryColorHex: '#E31837',
    accentBgHex: '#FEF2F2',
    logoBadgeText: 'TWD ไทวัสดุ',
    tncUrl: DEFAULT_TNC_URL,
    pdpaUrl: DEFAULT_PDPA_URL,
  },
  [BrandCode.BNB]: {
    brand: BrandCode.BNB,
    displayNameTh: 'BnB Home',
    displayNameEn: 'BnB Home',
    primaryColorHex: '#F37021',
    accentBgHex: '#FFF7ED',
    logoBadgeText: 'BnB Home',
    tncUrl: 'https://www.bnbhome.com/th/terms-and-conditions',
    pdpaUrl: 'https://www.bnbhome.com/th/privacy-policy',
  },
};

// ดึงข้อมูลการตั้งค่าธีมตามรหัสแบรนด์ (TWD หรือ BNB)
export function getBrandThemeConfig(brand: BrandCode): LiffBrandTheme {
  return BRAND_THEMES[brand];
}

// อ่านรหัสแบรนด์จาก URL Query (?brand=TWD หรือ ?brand=BNB) หากไม่ระบุหรือรูปแบบไม่ถูกต้องให้ใช้ TWD เป็นค่าเริ่มต้น
export function resolveBrandFromQuery(search = ''): BrandCode {
  const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(cleanSearch);
  const rawBrand = params.get('brand')?.trim().toUpperCase();
  if (rawBrand && isValidBrandCode(rawBrand)) {
    return rawBrand;
  }
  return BrandCode.TWD;
}
