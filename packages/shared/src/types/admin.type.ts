import { BrandCode, CouponSource } from '../enums/brand.enum';
import { MissionRuleConfig } from './mission.type';

// บทบาทของผู้ใช้งานระบบ Admin Backoffice
export enum AdminRole {
  ADMIN = 'ADMIN',
  MARKETING = 'MARKETING',
  VIEWER = 'VIEWER',
}

// ข้อมูลผู้ใช้งาน Admin หลังผ่านการยืนยันตัวตนด้วย SSO ขององค์กร (เช่น Azure AD)
export interface AdminUserDto {
  readonly adminId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AdminRole;
}

export interface AdminSsoLoginResponseDto {
  readonly accessToken: string;
  readonly user: AdminUserDto;
}

// ข้อมูลสรุปแคมเปญ Mission พร้อมยอดผู้เข้าร่วมและยอดผู้ทำสำเร็จสำหรับหน้า Admin
export interface AdminMissionSummaryDto {
  readonly missionId: string;
  readonly name: string;
  readonly status: string;
  readonly rule: MissionRuleConfig;
  readonly target: number;
  readonly reward: Record<string, unknown>;
  readonly startAt: string;
  readonly endAt: string;
  readonly totalParticipants: number;
  readonly completedCount: number;
}

// ข้อมูลสรุปชุดคูปองสำหรับหน้า Admin
export interface AdminCouponSummaryDto {
  readonly couponId: string;
  readonly code: string;
  readonly source: CouponSource;
  readonly type: string;
  readonly value: number;
  readonly maxDiscount: number | null;
  readonly validFrom: string;
  readonly validTo: string;
}

// ข้อมูลผลการค้นหาสมาชิกด้วย member_id (Mask ข้อมูลส่วนบุคคลทั้งหมดตาม PDPA)
export interface AdminMemberSearchResultDto {
  readonly memberId: string;
  readonly maskedFirstName: string;
  readonly maskedLastName: string;
  readonly maskedFullName: string;
  readonly tier: string;
  readonly points: number;
  readonly linkedBrands: readonly BrandCode[];
  readonly marketingConsentGranted: boolean;
  readonly completedMissionCount: number;
  readonly availableCouponCount: number;
  readonly refreshedAt: string;
}
