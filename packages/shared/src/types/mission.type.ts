// ประเภทของเงื่อนไขภารกิจ (Mission Rule) ทั้ง 3 รูปแบบใน Phase 1
export type MissionRuleType =
  | 'TOTAL_SPEND'
  | 'FILTERED_SPEND'
  | 'PURCHASE_COUNT';

// ช่วงเวลาสำหรับการคำนวณยอดสะสม (วัน / เดือน / ช่วงโบรชัวร์แคมเปญ)
export type MissionPeriodType = 'DAY' | 'MONTH' | 'BROCHURE';

// โครงสร้าง JSONB สำหรับกำหนดเงื่อนไขของภารกิจในตาราง mission.rule
export interface MissionRuleConfig {
  readonly type?: MissionRuleType;
  readonly periodType?: MissionPeriodType;
  readonly referenceDate?: string;
  readonly brand?: 'TWD' | 'BNB' | 'ALL';
  readonly brands?: readonly ('TWD' | 'BNB')[];
  readonly category?: string;
  readonly categories?: readonly string[];
  readonly sku?: string;
  readonly skus?: readonly string[];
  readonly minSpendPerTxn?: number;
}

// ข้อมูลรายละเอียดภารกิจพร้อมความคืบหน้าของสมาชิกสำหรับ GET /me/missions และ GET /me/missions/{id}
export interface MemberMissionDetailDto {
  readonly missionId: string;
  readonly name: string;
  readonly status: string;
  readonly rule: MissionRuleConfig;
  readonly reward: Record<string, unknown>;
  readonly target: number;
  readonly progress: number;
  readonly progressPercent: number;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly startAt: string;
  readonly endAt: string;
}

// Response DTO สำหรับ GET /me/missions
export interface MemberMissionListResponseDto {
  readonly memberId: string;
  readonly missions: readonly MemberMissionDetailDto[];
}
