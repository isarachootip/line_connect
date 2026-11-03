import React from 'react';
import {
  MemberConsentResponseDto,
  MemberProfileResponseDto,
} from '@line-connect/shared';
import { LiffBrandTheme } from '../../config/liff-brand.config';
import { PortalSkeleton, StaleDataBanner } from './PortalCommon';

export interface ProfileTabViewProps {
  readonly theme: LiffBrandTheme;
  readonly isLoading: boolean;
  readonly profile: MemberProfileResponseDto | null;
  readonly consent: MemberConsentResponseDto | null;
  readonly onToggleMarketingConsent: (nextGranted: boolean) => Promise<void>;
  readonly onUnlinkAccount: () => Promise<void>;
}

// หน้าจอที่ 4 (My Profile): ข้อมูลส่วนตัว ประวัติแต้ม การจัดการความเป็นส่วนตัว (Consent การตลาด) และปุ่มยกเลิกการเชื่อมบัญชี
export function ProfileTabView(props: ProfileTabViewProps): React.ReactElement {
  if (props.isLoading || !props.profile) {
    return <PortalSkeleton label="กำลังโหลดข้อมูลโปรไฟล์..." />;
  }

  const { profile } = props;
  const marketingGranted = Boolean(props.consent?.marketing?.granted);

  return (
    <section>
      <StaleDataBanner stale={profile.stale} refreshedAt={profile.refreshed_at} />

      {/* ข้อมูลส่วนตัว (แสดงเบอร์และอีเมลแบบ Mask ตาม PDPA) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          padding: '1rem',
          marginBottom: '0.85rem',
          border: '1px solid #e5e7eb',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>ข้อมูลส่วนตัว (My Profile)</h2>
        <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
          <div>
            <strong>ชื่อ-นามสกุล:</strong> {profile.fullName}
          </div>
          <div>
            <strong>รหัสสมาชิก The 1:</strong> {profile.memberId} (บัตร: {profile.cardNumber})
          </div>
          <div>
            <strong>เบอร์โทรศัพท์:</strong> {profile.maskedPhone}
          </div>
          <div>
            <strong>อีเมล:</strong> {profile.maskedEmail}
          </div>
          <div>
            <strong>ระดับสมาชิก:</strong> {profile.tier} ({profile.points.toLocaleString()} คะแนน)
          </div>
        </div>
      </div>

      {/* ประวัติแต้มสะสมและการแลกคะแนน (Point Claim History) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          padding: '1rem',
          marginBottom: '0.85rem',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>ประวัติแต้มสะสม</h3>
        {profile.pointClaimHistory.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>ยังไม่มีประวัติรายการคะแนน</p>
        ) : (
          profile.pointClaimHistory.map((item) => (
            <div
              key={item.claimId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.45rem 0',
                borderTop: '1px solid #f3f4f6',
                fontSize: '0.86rem',
              }}
            >
              <span>
                {item.type === 'EARN' ? 'รับคะแนน' : 'แลกคะแนน'} ({item.refId})
              </span>
              <strong style={{ color: item.type === 'EARN' ? '#047857' : '#b91c1c' }}>
                {item.type === 'EARN' ? '+' : '-'}
                {item.points.toLocaleString()} คะแนน
              </strong>
            </div>
          ))
        )}
      </div>

      {/* การจัดการความเป็นส่วนตัว (เปิด/ปิด Consent การตลาดแบบ Append-only) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          padding: '1rem',
          marginBottom: '0.85rem',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1rem' }}>การจัดการความเป็นส่วนตัว (PDPA)</h3>
        <label
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.88rem',
            cursor: 'pointer',
          }}
        >
          <span>รับข่าวสารและสิทธิพิเศษทางการตลาด (MARKETING Consent)</span>
          <input
            type="checkbox"
            checked={marketingGranted}
            onChange={(e) => void props.onToggleMarketingConsent(e.target.checked)}
          />
        </label>
      </div>

      {/* ปุ่มยกเลิกการเชื่อมบัญชี */}
      <button
        type="button"
        onClick={() => void props.onUnlinkAccount()}
        style={{
          width: '100%',
          padding: '0.8rem',
          borderRadius: 10,
          border: '1px solid #ef4444',
          background: '#fef2f2',
          color: '#b91c1c',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        ยกเลิกการเชื่อมบัญชี (Unlink Account)
      </button>
    </section>
  );
}
