import { Brand, ConsentType, LineLinkStatus } from '@prisma/client';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LineLinkRepository } from './line-link.repository';
import { ConsentRepository } from './consent.repository';
import { The1TokenRepository } from './the1-token.repository';

// ชุดทดสอบสำหรับ Repository ของระบบ Auth & Linking (line_link, consent, the1_token)
describe('Auth & Linking Repositories (line_link, consent, the1_token)', () => {
  const testHexKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testHmacSecret = 'blind_index_hmac_secret_key_for_unit_testing_32chars';

  it('LineLinkRepository ควรผูกบัญชีตาม unique (line_uid, brand) และยกเลิกการผูกได้ถูกต้อง', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({
      id: 'link-1',
      lineUid: 'U_LINE_001',
      memberId: 'T1_MEM_001',
      brand: Brand.TWD,
      linkedAt: new Date('2026-11-02T00:00:00Z'),
      status: LineLinkStatus.active,
    });
    const mockUpdate = jest.fn().mockResolvedValue({
      id: 'link-1',
      lineUid: 'U_LINE_001',
      memberId: 'T1_MEM_001',
      brand: Brand.TWD,
      linkedAt: new Date('2026-11-02T00:00:00Z'),
      status: LineLinkStatus.unlinked,
    });

    const prismaMock = {
      lineLink: {
        upsert: mockUpsert,
        findUnique: jest.fn(),
        update: mockUpdate,
      },
    } as unknown as PrismaService;

    const repo = new LineLinkRepository(prismaMock);
    const linked = await repo.linkMember({
      lineUid: 'U_LINE_001',
      memberId: 'T1_MEM_001',
      brand: Brand.TWD,
    });

    expect(linked.status).toBe(LineLinkStatus.active);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lineUid_brand: { lineUid: 'U_LINE_001', brand: Brand.TWD },
        },
      }),
    );

    const unlinked = await repo.unlinkMember('U_LINE_001', Brand.TWD);
    expect(unlinked.status).toBe(LineLinkStatus.unlinked);
  });

  it('ConsentRepository ต้อง insert แถวใหม่ทุกครั้ง (Append-only) ทั้งกรณีให้และถอนความยินยอม ห้าม update ทับ', async () => {
    const mockCreate = jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'consent-row', ...args.data }),
    );
    const mockUpdate = jest.fn();

    const prismaMock = {
      consent: {
        create: mockCreate,
        update: mockUpdate,
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const repo = new ConsentRepository(prismaMock);

    const granted = await repo.grantConsent({
      memberId: 'T1_MEM_001',
      type: ConsentType.PDPA,
      version: 'v1.0',
    });
    expect(granted.grantedAt).toBeInstanceOf(Date);
    expect(granted.revokedAt).toBeNull();

    const revoked = await repo.revokeConsent({
      memberId: 'T1_MEM_001',
      type: ConsentType.MARKETING,
      version: 'v1.0',
    });
    expect(revoked.grantedAt).toBeNull();
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('The1TokenRepository ต้องเข้ารหัส access_token และ refresh_token ระดับ column ตอนเก็บ และถอดรหัสตอนอ่าน', async () => {
    const capturedRow: {
      memberId: string;
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    } = {
      memberId: '',
      accessToken: '',
      refreshToken: '',
      expiresAt: new Date(0),
    };

    const mockUpsert = jest.fn().mockImplementation(
      (args: {
        create: {
          memberId: string;
          accessToken: string;
          refreshToken: string;
          expiresAt: Date;
        };
      }) => {
        Object.assign(capturedRow, args.create);
        return Promise.resolve(capturedRow);
      },
    );
    const mockFindUnique = jest.fn().mockImplementation(() =>
      Promise.resolve(capturedRow),
    );

    const prismaMock = {
      the1Token: {
        upsert: mockUpsert,
        findUnique: mockFindUnique,
        delete: jest.fn(),
      },
    } as unknown as PrismaService;

    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    const repo = new The1TokenRepository(prismaMock, encryption);

    const expiresAt = new Date('2026-12-01T00:00:00Z');
    await repo.saveToken({
      memberId: 'T1_MEM_001',
      accessToken: 'plain-access-token-xyz',
      refreshToken: 'plain-refresh-token-abc',
      expiresAt,
    });

    expect(capturedRow.accessToken).not.toContain('plain-access-token-xyz');
    expect(capturedRow.refreshToken).not.toContain('plain-refresh-token-abc');

    const loaded = await repo.findByMemberId('T1_MEM_001');
    expect(loaded).toEqual({
      memberId: 'T1_MEM_001',
      accessToken: 'plain-access-token-xyz',
      refreshToken: 'plain-refresh-token-abc',
      expiresAt,
    });
  });

  it('The1TokenRepository.findTokensExpiringBefore ควรค้นหา Token ที่ใกล้หมดอายุและถอดรหัสกลับมาได้ถูกต้อง', async () => {
    const encryption = new EncryptionService(testHexKey, testHmacSecret);
    const expiresSoon = new Date('2026-11-02T10:04:00Z');
    const mockFindMany = jest.fn().mockResolvedValue([
      {
        memberId: 'T1_MEM_001',
        accessToken: encryption.encrypt('expiring-access-1'),
        refreshToken: encryption.encrypt('expiring-refresh-1'),
        expiresAt: expiresSoon,
      },
    ]);

    const prismaMock = {
      the1Token: {
        findMany: mockFindMany,
      },
    } as unknown as PrismaService;

    const repo = new The1TokenRepository(prismaMock, encryption);
    const threshold = new Date('2026-11-02T10:05:00Z');
    const tokens = await repo.findTokensExpiringBefore(threshold);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: threshold } },
      orderBy: { expiresAt: 'asc' },
    });
    expect(tokens).toEqual([
      {
        memberId: 'T1_MEM_001',
        accessToken: 'expiring-access-1',
        refreshToken: 'expiring-refresh-1',
        expiresAt: expiresSoon,
      },
    ]);
  });
});
