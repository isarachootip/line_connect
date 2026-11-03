import React, { useState } from 'react';
import { AdminMemberSearchResultDto } from '@line-connect/shared';

export interface MemberLookupPanelProps {
  readonly memberResult: AdminMemberSearchResultDto | null;
  readonly onSearchMember: (memberId: string) => Promise<void>;
}

// แผงค้นหาสมาชิกด้วย member_id แบบซ่อนข้อมูลส่วนบุคคล (Mask PII) สำหรับช่วยฝ่ายบริการลูกค้า
export function MemberLookupPanel(props: MemberLookupPanelProps): React.ReactElement {
  const [memberId, setMemberId] = useState('T1_DEV_001');

  return (
    <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '1rem' }}>
      <h2>3. ค้นหาสมาชิกสำหรับฝ่ายบริการลูกค้า (แสดงข้อมูลแบบ Mask ตาม PDPA)</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void props.onSearchMember(memberId);
        }}
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}
      >
        <input
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          placeholder="ระบุ The 1 Member ID เช่น T1_DEV_001"
          style={{ width: 280, padding: '0.4rem' }}
        />
        <button type="submit" style={{ padding: '0.4rem 0.8rem' }}>
          ค้นหาสมาชิก
        </button>
      </form>

      {props.memberResult ? (
        <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: 6 }}>
          <p>
            <strong>รหัสสมาชิก:</strong> {props.memberResult.memberId} |{' '}
            <strong>ชื่อ-นามสกุล (Masked):</strong> {props.memberResult.maskedFullName}
          </p>
          <p>
            <strong>ระดับสมาชิก:</strong> {props.memberResult.tier} |{' '}
            <strong>คะแนนสะสม:</strong> {props.memberResult.points.toLocaleString()} คะแนน |{' '}
            <strong>แบรนด์ที่ผูก:</strong> {props.memberResult.linkedBrands.join(', ')}
          </p>
          <p>
            <strong>Consent การตลาด (MARKETING):</strong>{' '}
            {props.memberResult.marketingConsentGranted ? 'ยินยอม (Active)' : 'ไม่ยินยอม / เพิกถอนแล้ว'} |{' '}
            <strong>Mission ที่ทำสำเร็จ:</strong> {props.memberResult.completedMissionCount} รายการ |{' '}
            <strong>คูปองพร้อมใช้:</strong> {props.memberResult.availableCouponCount} ใบ
          </p>
        </div>
      ) : null}
    </section>
  );
}
