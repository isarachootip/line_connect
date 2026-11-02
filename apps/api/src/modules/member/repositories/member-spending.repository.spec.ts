import { Prisma } from '@prisma/client';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MemberProfileRepository } from './member-profile.repository';
import { SpendingTxnRepository } from '../../integration/repositories/spending-txn.repository';

// ชุดทดสอบสำหรับ MemberProfileRepository (member_profile) และ SpendingTxnRepository (spending_txn)
describe('MemberProfile & SpendingTxn Repositories', () => {
  const testHexKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'blind_index_hmac_secret_key_for_unit_testing_32chars';

  it('MemberProfileRepository ต้องเข้ารหัส first_name และ last_name ตอนบันทึกลงแคช และถอดรหัสตอนอ่าน', async () => {
    const savedRow = {
      memberId: '',
      firstName: '',
      lastName: '',
      tier: '',
      points: 0,
      refreshedAt: new Date(0),
    };

    const mockUpsert = jest.fn().mockImplementation(
      (args: {
        create: {
          memberId: string;
          firstName: string;
          lastName: string;
          tier: string;
          points: number;
          refreshedAt: Date;
        };
      }) => {
        Object.assign(savedRow, args.create);
        return Promise.resolve(savedRow);
      },
    );
    const mockFindUnique = jest.fn().mockImplementation(() =>
      Promise.resolve(savedRow),
    );

    const prismaMock = {
      memberProfile: {
        upsert: mockUpsert,
        findUnique: mockFindUnique,
      },
    } as unknown as PrismaService;

    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    const repo = new MemberProfileRepository(prismaMock, encryption);

    await repo.upsertProfile({
      memberId: 'T1_MEM_001',
      firstName: 'สมชาย',
      lastName: 'รักบ้าน',
      tier: 'GOLD',
      points: 4500,
    });

    expect(savedRow.firstName).not.toContain('สมชาย');
    expect(savedRow.lastName).not.toContain('รักบ้าน');

    const loaded = await repo.findByMemberId('T1_MEM_001');
    expect(loaded?.firstName).toBe('สมชาย');
    expect(loaded?.lastName).toBe('รักบ้าน');
    expect(loaded?.tier).toBe('GOLD');
    expect(loaded?.points).toBe(4500);
  });

  it('SpendingTxnRepository ควรบันทึกยอดใช้จ่ายโดยอ้างอิง txn_id (unique) และดึงรายการตามช่วงเวลาได้', async () => {
    const txnAt = new Date('2026-11-02T10:00:00Z');
    const mockUpsert = jest.fn().mockResolvedValue({
      txnId: 'TXN-2026-0001',
      memberId: 'T1_MEM_001',
      store: 'TWD-BANGNA',
      amount: new Prisma.Decimal(3500.5),
      category: 'CONSTRUCTION',
      sku: 'SKU-CEMENT-01',
      txnAt,
    });
    const mockFindMany = jest.fn().mockResolvedValue([
      {
        txnId: 'TXN-2026-0001',
        memberId: 'T1_MEM_001',
        store: 'TWD-BANGNA',
        amount: new Prisma.Decimal(3500.5),
        category: 'CONSTRUCTION',
        sku: 'SKU-CEMENT-01',
        txnAt,
      },
    ]);

    const prismaMock = {
      spendingTxn: {
        upsert: mockUpsert,
        findMany: mockFindMany,
      },
    } as unknown as PrismaService;

    const repo = new SpendingTxnRepository(prismaMock);
    const record = await repo.recordTransaction({
      txnId: 'TXN-2026-0001',
      memberId: 'T1_MEM_001',
      store: 'TWD-BANGNA',
      amount: 3500.5,
      category: 'CONSTRUCTION',
      sku: 'SKU-CEMENT-01',
      txnAt,
    });

    expect(record.txnId).toBe('TXN-2026-0001');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { txnId: 'TXN-2026-0001' },
      }),
    );

    const list = await repo.findByMemberAndPeriod(
      'T1_MEM_001',
      new Date('2026-11-01T00:00:00Z'),
      new Date('2026-11-30T23:59:59Z'),
    );
    expect(list).toHaveLength(1);
  });
});
