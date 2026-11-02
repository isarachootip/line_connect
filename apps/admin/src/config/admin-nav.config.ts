// โครงสร้างข้อมูลเมนูโมดูลในระบบ Admin Portal
export interface AdminModuleItem {
  readonly key:
    | 'members'
    | 'missions'
    | 'coupons'
    | 'batch-exports'
    | 'audit-logs';
  readonly labelTh: string;
  readonly path: string;
}

const ADMIN_MODULES: readonly AdminModuleItem[] = [
  {
    key: 'members',
    labelTh: 'ข้อมูลสมาชิกและการผูกบัญชี The 1',
    path: '/admin/members',
  },
  {
    key: 'missions',
    labelTh: 'จัดการแคมเปญ Mission และเงื่อนไขยอดซื้อ',
    path: '/admin/missions',
  },
  {
    key: 'coupons',
    labelTh: 'จัดการคูปองและการแลกคะแนน (Redemption)',
    path: '/admin/coupons',
  },
  {
    key: 'batch-exports',
    labelTh: 'ส่งออกไฟล์กลุ่มเป้าหมาย (Batch Export ไทวัสดุ)',
    path: '/admin/batch-exports',
  },
  {
    key: 'audit-logs',
    labelTh: 'ตรวจสอบประวัติการใช้งานระบบ (Audit Log & PDPA)',
    path: '/admin/audit-logs',
  },
];

// คืนค่ารายการโมดูลทั้งหมดสำหรับแสดงในแถบนำทางของระบบ Admin
export function getAdminModules(): readonly AdminModuleItem[] {
  return ADMIN_MODULES;
}
