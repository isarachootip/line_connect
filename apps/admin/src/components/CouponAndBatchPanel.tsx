import React, { useState } from 'react';
import { AdminCouponSummaryDto, AdminRole, BrandCode, CouponSource } from '@line-connect/shared';
import {
  canAdminModifyCampaigns,
  ExportSegmentBatchResponse,
} from '../services/admin-api.client';

export interface CouponAndBatchPanelProps {
  readonly role: AdminRole;
  readonly coupons: readonly AdminCouponSummaryDto[];
  readonly lastBatch: ExportSegmentBatchResponse | null;
  readonly onCreateCoupon: (code: string, value: number, maxDiscount: number, validTo: string) => Promise<void>;
  readonly onExportBatch: (segment: string, completedMissionId: string, minTotalSpend: number, brand: BrandCode) => Promise<void>;
}

// แผงจัดการชุดคูปอง และสร้าง Segment เพื่อส่งออก Batch File ผ่าน SFTP
export function CouponAndBatchPanel(props: CouponAndBatchPanelProps): React.ReactElement {
  const [code, setCode] = useState('TWDBUILDER500');
  const [value, setValue] = useState(15);
  const [maxDiscount, setMaxDiscount] = useState(500);
  const [validTo, setValidTo] = useState('2026-12-31T23:59:59.000Z');

  const [segment, setSegment] = useState('TWD_ACTIVE_BUILDERS_NOV');
  const [missionId, setMissionId] = useState('MIS-DEV-001');
  const [minSpend, setMinSpend] = useState(5000);
  const [brand, setBrand] = useState<BrandCode>(BrandCode.TWD);

  const canEdit = canAdminModifyCampaigns(props.role);

  return (
    <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
      <h2>2. จัดการคูปอง &amp; ส่งออก Batch File กลุ่มเป้าหมาย (SFTP)</h2>
      {canEdit ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void props.onCreateCoupon(code, value, maxDiscount, validTo);
            }}
            style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: 6 }}
          >
            <h3>สร้างชุดคูปอง ({CouponSource.TWD})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="รหัสคูปอง" />
              <input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} placeholder="มูลค่าส่วนลด" />
              <input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(Number(e.target.value))} placeholder="เพดานส่วนลดสูงสุด (บาท)" />
              <input value={validTo} onChange={(e) => setValidTo(e.target.value)} placeholder="วันหมดอายุ (ISO)" />
              <button type="submit">+ บันทึกชุดคูปอง</button>
            </div>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void props.onExportBatch(segment, missionId, minSpend, brand);
            }}
            style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: 6 }}
          >
            <h3>สร้าง Segment &amp; สั่ง Export Batch (เฉพาะผู้มี Consent MARKETING)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="ชื่อ Segment" />
              <input value={missionId} onChange={(e) => setMissionId(e.target.value)} placeholder="ทำ Mission สำเร็จ (รหัส)" />
              <input type="number" value={minSpend} onChange={(e) => setMinSpend(Number(e.target.value))} placeholder="ยอดสะสมขั้นต่ำ (บาท)" />
              <select value={brand} onChange={(e) => setBrand(e.target.value as BrandCode)}>
                <option value={BrandCode.TWD}>ไทวัสดุ (TWD)</option>
                <option value={BrandCode.BNB}>BnB Home (BNB)</option>
              </select>
              <button type="submit">ส่งออกไฟล์เข้ารหัสผ่าน SFTP</button>
            </div>
          </form>
        </div>
      ) : (
        <p style={{ color: '#6b7280' }}>เฉพาะบทบาท ADMIN และ MARKETING เท่านั้นที่สร้างคูปองหรือสั่ง Export Batch ได้</p>
      )}

      {props.lastBatch ? (
        <p style={{ marginTop: '0.75rem', color: '#047857' }}>
          ส่งออก Batch ล่าสุดสำเร็จ: <strong>{props.lastBatch.batchId}</strong> ({props.lastBatch.rowCount} รายการ) →{' '}
          <code>{props.lastBatch.remotePath}</code>
        </p>
      ) : null}
    </section>
  );
}
