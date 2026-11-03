import React, { useState } from 'react';
import { MemberMissionDetailDto } from '@line-connect/shared';
import { LiffBrandTheme } from '../../config/liff-brand.config';
import { PortalSkeleton } from './PortalCommon';

export interface MissionsTabViewProps {
  readonly theme: LiffBrandTheme;
  readonly isLoading: boolean;
  readonly missions: readonly MemberMissionDetailDto[];
}

// หน้าจอที่ 3 (Mission): รายการ Mission วันเริ่ม-สิ้นสุด Progress Bar และหน้า Detail
export function MissionsTabView(props: MissionsTabViewProps): React.ReactElement {
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);

  if (props.isLoading) {
    return <PortalSkeleton label="กำลังโหลดภารกิจ Mission..." />;
  }

  const selectedMission = props.missions.find(
    (m) => m.missionId === selectedMissionId,
  );

  // หน้าแสดงรายละเอียดภารกิจ (Mission Detail View)
  if (selectedMission) {
    return (
      <section
        data-testid="mission-detail-view"
        style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: '1.15rem',
          border: '1px solid #e5e7eb',
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedMissionId(null)}
          style={{
            border: 'none',
            background: 'transparent',
            color: props.theme.primaryColorHex,
            fontWeight: 700,
            marginBottom: '0.75rem',
            cursor: 'pointer',
          }}
        >
          &larr; กลับหน้ารายการ Mission
        </button>

        <h2 style={{ margin: '0 0 0.4rem 0', fontSize: '1.15rem' }}>
          {selectedMission.name}
        </h2>
        <div style={{ fontSize: '0.84rem', color: '#6b7280', marginBottom: '0.85rem' }}>
          ระยะเวลาแคมเปญ: {selectedMission.startAt.slice(0, 10)} ถึง{' '}
          {selectedMission.endAt.slice(0, 10)}
        </div>

        <div style={{ height: 12, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              width: `${selectedMission.progressPercent}%`,
              height: '100%',
              background: props.theme.primaryColorHex,
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.88rem' }}>
          <span>
            ความคืบหน้า: {selectedMission.progress.toLocaleString()} /{' '}
            {selectedMission.target.toLocaleString()}
          </span>
          <strong>{selectedMission.progressPercent}%</strong>
        </div>

        <div
          style={{
            marginTop: '1rem',
            background: props.theme.accentBgHex,
            padding: '0.85rem',
            borderRadius: 10,
            fontSize: '0.88rem',
          }}
        >
          <div>
            <strong>ประเภทเงื่อนไข (Rule):</strong> {selectedMission.rule.type}
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <strong>สถานะภารกิจ:</strong>{' '}
            {selectedMission.completed ? 'ทำภารกิจสำเร็จแล้ว ✓' : 'กำลังสะสมยอด'}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.15rem' }}>ภารกิจสะสมยอด (Missions)</h2>
      {props.missions.map((m) => (
        <div
          key={m.missionId}
          style={{
            background: '#ffffff',
            borderRadius: 12,
            padding: '0.95rem',
            marginBottom: '0.7rem',
            border: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.96rem' }}>{m.name}</div>
          <div style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0.25rem 0 0.55rem 0' }}>
            เริ่ม {m.startAt.slice(0, 10)} - สิ้นสุด {m.endAt.slice(0, 10)}
          </div>

          <div style={{ height: 10, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${m.progressPercent}%`,
                height: '100%',
                background: props.theme.primaryColorHex,
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.5rem',
              fontSize: '0.84rem',
            }}
          >
            <span>
              {m.progress.toLocaleString()} / {m.target.toLocaleString()} ({m.progressPercent}%)
            </span>
            <button
              type="button"
              onClick={() => setSelectedMissionId(m.missionId)}
              style={{
                border: `1px solid ${props.theme.primaryColorHex}`,
                background: '#ffffff',
                color: props.theme.primaryColorHex,
                borderRadius: 8,
                padding: '0.35rem 0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ดูรายละเอียด
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
