import React, { useState } from 'react';
import { AdminMissionSummaryDto, AdminRole } from '@line-connect/shared';
import { canAdminModifyCampaigns } from '../services/admin-api.client';

export interface MissionManagerPanelProps {
  readonly role: AdminRole;
  readonly missions: readonly AdminMissionSummaryDto[];
  readonly onCreateMission: (name: string, target: number, points: number) => Promise<void>;
  readonly onToggleStatus: (missionId: string, nextStatus: 'active' | 'inactive') => Promise<void>;
}

// แผงจัดการแคมเปญ Mission: สร้าง แก้ไข เปิด/ปิด และดูยอดผู้ทำสำเร็จ
export function MissionManagerPanel(props: MissionManagerPanelProps): React.ReactElement {
  const [name, setName] = useState('ช้อปไทวัสดุครบ 5,000 บาท รับเพิ่ม 200 คะแนน');
  const [target, setTarget] = useState(5000);
  const [points, setPoints] = useState(200);
  const canEdit = canAdminModifyCampaigns(props.role);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!canEdit) return;
    void props.onCreateMission(name, target, points);
  };

  return (
    <section style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
      <h2>1. จัดการแคมเปญ Mission &amp; ยอดผู้ทำสำเร็จ</h2>
      {canEdit ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อแคมเปญ Mission"
            style={{ flex: 1, minWidth: 220, padding: '0.4rem' }}
          />
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            placeholder="เป้าหมาย (บาท)"
            style={{ width: 130, padding: '0.4rem' }}
          />
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            placeholder="แต้ม The 1"
            style={{ width: 110, padding: '0.4rem' }}
          />
          <button type="submit" style={{ padding: '0.4rem 0.8rem' }}>
            + สร้าง Mission
          </button>
        </form>
      ) : (
        <p style={{ color: '#6b7280' }}>บทบาท VIEWER สามารถดูรายการและยอดผู้ทำสำเร็จได้เท่านั้น</p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>รหัส</th>
            <th style={{ padding: '0.5rem' }}>ชื่อแคมเปญ</th>
            <th style={{ padding: '0.5rem' }}>เป้าหมาย</th>
            <th style={{ padding: '0.5rem' }}>สถานะ</th>
            <th style={{ padding: '0.5rem' }}>ผู้เข้าร่วม / ทำสำเร็จ</th>
            <th style={{ padding: '0.5rem' }}>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {props.missions.map((m) => (
            <tr key={m.missionId} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.5rem' }}>{m.missionId}</td>
              <td style={{ padding: '0.5rem' }}>{m.name}</td>
              <td style={{ padding: '0.5rem' }}>{m.target.toLocaleString()}</td>
              <td style={{ padding: '0.5rem' }}>{m.status}</td>
              <td style={{ padding: '0.5rem' }}>
                {m.totalParticipants} คน / <strong>สำเร็จ {m.completedCount} คน</strong>
              </td>
              <td style={{ padding: '0.5rem' }}>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() =>
                      void props.onToggleStatus(
                        m.missionId,
                        m.status === 'active' ? 'inactive' : 'active',
                      )
                    }
                  >
                    {m.status === 'active' ? 'ปิดแคมเปญ' : 'เปิดแคมเปญ'}
                  </button>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
