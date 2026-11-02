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

// ประเภทเอกสารความยินยอม (Consent) ที่ต้องจัดเก็บตามกฎหมาย PDPA และข้อกำหนดบริการ
export enum ConsentType {
  TERMS_AND_CONDITIONS = 'TERMS_AND_CONDITIONS',
  PDPA_PRIVACY = 'PDPA_PRIVACY',
  MARKETING = 'MARKETING',
}

// สถานะการผูกบัญชีระหว่าง LINE UID กับ The 1 Member ID
export enum MemberLinkStatus {
  ACTIVE = 'ACTIVE',
  UNLINKED = 'UNLINKED',
  SUSPENDED = 'SUSPENDED',
}

// ตรวจสอบว่ารหัสที่รับเข้ามาเป็นแบรนด์ที่รองรับในระบบหรือไม่
export function isValidBrandCode(value: string): value is BrandCode {
  return value === BrandCode.TWD || value === BrandCode.BNB;
}
