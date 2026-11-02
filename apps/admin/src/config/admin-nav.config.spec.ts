import { getAdminModules } from './admin-nav.config';

// ชุดทดสอบรายการเมนูหลักในระบบ Admin Portal สำหรับทีม IT-Division และทีมการตลาด
describe('Admin Portal Navigation Configuration', () => {
  it('ควรมีโมดูลจัดการระบบครบตามขอบเขตงาน (Members, Missions, Coupons, Batch, Audit)', () => {
    const modules = getAdminModules();
    const keys = modules.map((item) => item.key);

    expect(keys).toEqual([
      'members',
      'missions',
      'coupons',
      'batch-exports',
      'audit-logs',
    ]);
  });
});
