import {
  Brand,
  Consent,
  LineLink,
  MemberProfile,
  The1Token,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface InMemoryAuthDbState {
  lineLinks: Map<string, LineLink>;
  the1Tokens: Map<string, The1Token>;
  memberProfiles: Map<string, MemberProfile>;
  consents: Consent[];
  auditLogs: Array<Record<string, unknown>>;
  failOnConsentCreate: boolean;
}

// สร้าง In-Memory Transactional Prisma Mock สำหรับทดสอบ Integration ของโมดูล Auth รวมถึงกรณี Rollback
export function createInMemoryAuthPrisma(): {
  prisma: PrismaService;
  state: InMemoryAuthDbState;
} {
  const state: InMemoryAuthDbState = {
    lineLinks: new Map<string, LineLink>(),
    the1Tokens: new Map<string, The1Token>(),
    memberProfiles: new Map<string, MemberProfile>(),
    consents: [],
    auditLogs: [],
    failOnConsentCreate: false,
  };

  const buildClient = (targetState: InMemoryAuthDbState) => ({
    lineLink: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { lineUid_brand: { lineUid: string; brand: Brand } };
        }) => {
          const key = `${where.lineUid_brand.lineUid}:${where.lineUid_brand.brand}`;
          return targetState.lineLinks.get(key) ?? null;
        },
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { lineUid_brand: { lineUid: string; brand: Brand } };
          create: LineLink;
          update: Partial<LineLink>;
        }) => {
          const key = `${where.lineUid_brand.lineUid}:${where.lineUid_brand.brand}`;
          const existing = targetState.lineLinks.get(key);
          const row: LineLink = existing
            ? { ...existing, ...update }
            : { ...create, id: `link-${targetState.lineLinks.size + 1}` };
          targetState.lineLinks.set(key, row);
          return row;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { lineUid_brand: { lineUid: string; brand: Brand } };
          data: Partial<LineLink>;
        }) => {
          const key = `${where.lineUid_brand.lineUid}:${where.lineUid_brand.brand}`;
          const existing = targetState.lineLinks.get(key);
          if (!existing) {
            throw new Error('Link not found');
          }
          const updated = { ...existing, ...data };
          targetState.lineLinks.set(key, updated);
          return updated;
        },
      ),
    },
    the1Token: {
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { memberId: string };
          create: The1Token;
          update: Partial<The1Token>;
        }) => {
          const existing = targetState.the1Tokens.get(where.memberId);
          const row: The1Token = existing
            ? { ...existing, ...update }
            : { ...create };
          targetState.the1Tokens.set(where.memberId, row);
          return row;
        },
      ),
      findUnique: jest.fn(
        async ({ where }: { where: { memberId: string } }) =>
          targetState.the1Tokens.get(where.memberId) ?? null,
      ),
      delete: jest.fn(async ({ where }: { where: { memberId: string } }) => {
        targetState.the1Tokens.delete(where.memberId);
      }),
    },
    memberProfile: {
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { memberId: string };
          create: MemberProfile;
          update: Partial<MemberProfile>;
        }) => {
          const existing = targetState.memberProfiles.get(where.memberId);
          const row: MemberProfile = existing
            ? { ...existing, ...update }
            : { ...create };
          targetState.memberProfiles.set(where.memberId, row);
          return row;
        },
      ),
      findUnique: jest.fn(
        async ({ where }: { where: { memberId: string } }) =>
          targetState.memberProfiles.get(where.memberId) ?? null,
      ),
    },
    consent: {
      create: jest.fn(async ({ data }: { data: Omit<Consent, 'id'> }) => {
        if (targetState.failOnConsentCreate) {
          throw new Error('DB_TRANSACTION_SIMULATED_FAILURE');
        }
        const row: Consent = {
          id: `consent-${targetState.consents.length + 1}`,
          ...data,
        };
        targetState.consents.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: { where: { memberId: string } }) =>
        targetState.consents.filter((c) => c.memberId === where.memberId),
      ),
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `audit-${targetState.auditLogs.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        targetState.auditLogs.push(row);
        return row;
      }),
    },
  });

  const rootClient = buildClient(state);
  const prisma = {
    ...rootClient,
    $transaction: jest.fn(
      async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
        const snapshot: InMemoryAuthDbState = {
          lineLinks: new Map(state.lineLinks),
          the1Tokens: new Map(state.the1Tokens),
          memberProfiles: new Map(state.memberProfiles),
          consents: [...state.consents],
          auditLogs: [...state.auditLogs],
          failOnConsentCreate: state.failOnConsentCreate,
        };
        const txClient = buildClient(snapshot);
        const result = await fn(txClient);
        state.lineLinks = snapshot.lineLinks;
        state.the1Tokens = snapshot.the1Tokens;
        state.memberProfiles = snapshot.memberProfiles;
        state.consents = snapshot.consents;
        return result;
      },
    ),
  } as unknown as PrismaService;

  return { prisma, state };
}
