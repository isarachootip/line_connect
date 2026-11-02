import {
  The1MemberDetail,
  The1PointClaimLog,
  The1Profile,
} from './the1.interface';

export interface MockMemberSeed {
  readonly detail: The1MemberDetail;
  profile: The1Profile;
  readonly logs: The1PointClaimLog[];
}

// สร้างข้อมูลสมาชิกตัวอย่าง 3 คนสำหรับ The1MockClient
export function createSampleThe1Members(): MockMemberSeed[] {
  return [
    {
      detail: {
        memberId: 'T1_MEM_001',
        cardNumber: '7010000000001',
        status: 'ACTIVE',
        registeredChannel: 'TWD_LIFF',
        joinedAt: '2024-01-15T08:00:00.000Z',
        phone: '0812345678',
        email: 'somchai.builder@thaiwatsadu.com',
      },
      profile: {
        memberId: 'T1_MEM_001',
        firstName: 'สมชาย',
        lastName: 'สร้างบ้าน',
        tier: 'GOLD',
        points: 3500,
        phone: '0812345678',
        email: 'somchai.builder@thaiwatsadu.com',
      },
      logs: [
        {
          claimId: 'CLM-1001',
          memberId: 'T1_MEM_001',
          points: 500,
          type: 'EARN',
          refId: 'INIT-SEED-001',
          occurredAt: '2026-10-01T10:00:00.000Z',
        },
      ],
    },
    {
      detail: {
        memberId: 'T1_MEM_002',
        cardNumber: '7010000000002',
        status: 'ACTIVE',
        registeredChannel: 'BNB_LIFF',
        joinedAt: '2024-05-20T09:30:00.000Z',
        phone: '0898765432',
        email: 'kanda.condo@bnbhome.com',
      },
      profile: {
        memberId: 'T1_MEM_002',
        firstName: 'กานดา',
        lastName: 'แต่งคอนโด',
        tier: 'PLATINUM',
        points: 12800,
        phone: '0898765432',
        email: 'kanda.condo@bnbhome.com',
      },
      logs: [],
    },
    {
      detail: {
        memberId: 'T1_MEM_003',
        cardNumber: '7010000000003',
        status: 'ACTIVE',
        registeredChannel: 'TWD_STORE',
        joinedAt: '2025-02-10T11:15:00.000Z',
        phone: '0861112233',
        email: 'anan.contractor@example.com',
      },
      profile: {
        memberId: 'T1_MEM_003',
        firstName: 'อนันต์',
        lastName: 'ช่างรับเหมา',
        tier: 'MEMBER',
        points: 950,
        phone: '0861112233',
        email: 'anan.contractor@example.com',
      },
      logs: [],
    },
  ];
}
