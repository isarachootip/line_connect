// สภาพแวดล้อมการทำงานของระบบ (แยก dev / staging / prod)
export enum AppEnvironment {
  DEV = 'dev',
  STAGING = 'staging',
  PROD = 'prod',
}

// รหัสแบรนด์ภายใต้ระบบ Line Connect (ไทวัสดุ และ BnB Home)
export enum BrandCode {
  TWD = 'TWD',
  BNB = 'BNB',
}

// สถานะการผูกบัญชีในตาราง line_link (active | unlinked)
export enum LineLinkStatus {
  ACTIVE = 'active',
  UNLINKED = 'unlinked',
}

// ประเภทความยินยอมในตาราง consent (TNC | PDPA | MARKETING)
export enum ConsentType {
  TNC = 'TNC',
  PDPA = 'PDPA',
  MARKETING = 'MARKETING',
}

// แหล่งที่มาของคูปองในตาราง coupon (TWD | THE1)
export enum CouponSource {
  TWD = 'TWD',
  THE1 = 'THE1',
}

// สถานะคูปองของลูกค้าในตาราง coupon_wallet (available | used | expired)
export enum CouponWalletStatus {
  AVAILABLE = 'available',
  USED = 'used',
  EXPIRED = 'expired',
}

// ตรวจสอบว่ารหัสที่รับเข้ามาเป็นแบรนด์ที่รองรับในระบบหรือไม่
export function isValidBrandCode(value: string): value is BrandCode {
  return value === BrandCode.TWD || value === BrandCode.BNB;
}
