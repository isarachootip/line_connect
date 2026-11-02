// ส่งออกประเภทข้อมูลและฟังก์ชันกลางทั้งหมดของแพ็กเกจ @line-connect/shared แบบระบุชื่อชัดเจน
export {
  AppEnvironment,
  BrandCode,
  LineLinkStatus,
  ConsentType,
  CouponSource,
  CouponWalletStatus,
  isValidBrandCode,
} from './enums/brand.enum';

export {
  type DependencyState,
  type HealthStatusDto,
  type ApiErrorDetail,
  type StandardApiResponse,
  createSuccessResponse,
  createErrorResponse,
} from './types/api-response.type';

export {
  type MemberBrandPointsDto,
  type MemberHomeCouponDto,
  type MemberHomeMissionDto,
  type MemberHomeResponseDto,
  type PointClaimHistoryItemDto,
  type MemberProfileResponseDto,
  type ConsentStatusSummaryDto,
  type ConsentHistoryEntryDto,
  type MemberConsentResponseDto,
  type UpdateMarketingConsentRequestDto,
} from './types/member.type';

export {
  type MissionRuleType,
  type MissionPeriodType,
  type MissionRuleConfig,
  type MemberMissionDetailDto,
  type MemberMissionListResponseDto,
} from './types/mission.type';
