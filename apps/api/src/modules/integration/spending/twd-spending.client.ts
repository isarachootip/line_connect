import { Injectable } from '@nestjs/common';

export const TWD_SPENDING_CLIENT_TOKEN = Symbol('TWD_SPENDING_CLIENT_TOKEN');

// รูปแบบข้อมูลรายการยอดใช้จ่ายดิบจากไทวัสดุ (รองรับทั้ง snake_case ตาม Spec และ camelCase)
export interface RawSpendingTransactionItem {
  readonly txn_id?: string;
  readonly txnId?: string;
  readonly member_id?: string;
  readonly memberId?: string;
  readonly phone?: string;
  readonly store?: string;
  readonly amount?: number | string;
  readonly category?: string;
  readonly sku?: string;
  readonly txn_at?: string | Date;
  readonly txnAt?: string | Date;
}

export interface TwdGetSpendingParams {
  readonly cursor: string | null;
  readonly limit?: number;
}

export interface TwdSpendingPageResult {
  readonly items: readonly RawSpendingTransactionItem[];
  readonly nextCursor: string | null;
}

// อินเทอร์เฟซเชื่อมต่อ API ยอดใช้จ่ายรายลูกค้าของไทวัสดุ (Get Spending) สำหรับโหมด Pull และการค้นหาสมาชิกจากเบอร์โทร
export interface TwdSpendingClient {
  getSpending(params: TwdGetSpendingParams): Promise<TwdSpendingPageResult>;
  resolveMemberIdByPhone(phone: string): Promise<string | null>;
}

export interface TwdSpendingHttpConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
}

// บริการจำลอง (Mock) สำหรับ API ยอดใช้จ่ายไทวัสดุ รองรับการดึงด้วย Cursor และการแปลงเบอร์โทรเป็นรหัสสมาชิก
@Injectable()
export class TwdSpendingMockClient implements TwdSpendingClient {
  private readonly phoneToMemberMap = new Map<string, string>([
    ['0812345678', 'T1_MEM_001'],
    ['+66812345678', 'T1_MEM_001'],
    ['0898765432', 'T1_MEM_002'],
    ['+66898765432', 'T1_MEM_002'],
    ['0861112233', 'T1_MEM_003'],
    ['+66861112233', 'T1_MEM_003'],
  ]);

  private readonly mockPages = new Map<string, TwdSpendingPageResult>([
    [
      'INITIAL',
      {
        items: [
          {
            txn_id: 'TWD-PULL-001',
            member_id: 'T1_MEM_001',
            store: 'TWD-BANGNA',
            amount: 4200,
            category: 'CONSTRUCTION',
            sku: 'SKU-CEMENT-101',
            txn_at: '2026-11-02T09:00:00.000Z',
          },
          {
            txn_id: 'TWD-PULL-002',
            phone: '0898765432',
            store: 'TWD-RANGSIT',
            amount: 8500,
            category: 'DECOR',
            sku: 'SKU-TILE-202',
            txn_at: '2026-11-02T09:15:00.000Z',
          },
        ],
        nextCursor: 'CURSOR_PAGE_2',
      },
    ],
    [
      'CURSOR_PAGE_2',
      {
        items: [
          {
            txn_id: 'TWD-PULL-003',
            member_id: 'T1_MEM_003',
            store: 'TWD-RAMA2',
            amount: 1500,
            category: 'TOOLS',
            sku: 'SKU-DRILL-303',
            txn_at: '2026-11-02T10:00:00.000Z',
          },
        ],
        nextCursor: 'CURSOR_END',
      },
    ],
    [
      'CURSOR_END',
      {
        items: [],
        nextCursor: 'CURSOR_END',
      },
    ],
  ]);

  async getSpending(
    params: TwdGetSpendingParams,
  ): Promise<TwdSpendingPageResult> {
    const key = params.cursor ?? 'INITIAL';
    const page = this.mockPages.get(key) ?? {
      items: [],
      nextCursor: params.cursor,
    };
    const limit = params.limit ?? 1000;
    return {
      items: page.items.slice(0, limit),
      nextCursor: page.nextCursor,
    };
  }

  async resolveMemberIdByPhone(phone: string): Promise<string | null> {
    const normalized = phone.replace(/[\s-]/g, '').trim();
    return this.phoneToMemberMap.get(normalized) ?? null;
  }
}

// บริการเชื่อมต่อ HTTP API ยอดใช้จ่ายไทวัสดุจริง (เปิดใช้งานเมื่อ TWD_SPENDING_API_USE_MOCK=false)
@Injectable()
export class TwdSpendingHttpClient implements TwdSpendingClient {
  constructor(private readonly config: TwdSpendingHttpConfig) {}

  async getSpending(
    params: TwdGetSpendingParams,
  ): Promise<TwdSpendingPageResult> {
    // TODO: รอรับเอกสาร API Specification จริงของระบบ Get Spending ไทวัสดุ (ห้ามเดา URL / Path จริงตามกฎข้อ 5)
    throw new Error(
      `TODO: ยังไม่ได้ระบุ Spec จริงของ TWD Get Spending API (baseUrl=${this.config.baseUrl}, cursor=${String(params.cursor)}) กรุณาตั้งค่า TWD_SPENDING_API_USE_MOCK=true`,
    );
  }

  async resolveMemberIdByPhone(_phone: string): Promise<string | null> {
    // TODO: เชื่อมต่อระบบค้นหา Member ID จากเบอร์โทรศัพท์ผ่าน Blind Index หรือ API กลางเมื่อยืนยัน Spec จริง
    return null;
  }
}
