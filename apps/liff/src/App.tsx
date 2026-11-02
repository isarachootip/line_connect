import React, { useEffect, useState } from 'react';
import { BrandCode } from '@line-connect/shared';
import { getBrandThemeConfig } from './config/liff-brand.config';
import { initializeLiffApp, LiffInitResult } from './services/liff-client';

// หน้าจอเริ่มต้น (Hello Page) ที่ทำการเรียก liff.init และแสดงสถานะการเชื่อมต่อ
export function App(): React.ReactElement {
  const [status, setStatus] = useState<LiffInitResult | null>(null);
  const brandTheme = getBrandThemeConfig(BrandCode.TWD);

  useEffect(() => {
    const liffId = import.meta.env.VITE_LIFF_ID ?? 'mock-liff-id-local';
    void initializeLiffApp(liffId).then((res) => {
      setStatus(res);
    });
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1.5rem' }}>
      <h1 style={{ color: brandTheme.primaryColorHex }}>
        Hello Line Connect ({brandTheme.displayNameTh} &amp; BnB Home)
      </h1>
      <p>สถานะการเรียกใช้งาน LINE LIFF SDK (`liff.init`):</p>
      {status === null ? (
        <p>กำลังเริ่มต้น LIFF SDK...</p>
      ) : (
        <ul>
          <li>LIFF ID: {status.liffId}</li>
          <li>Initialized: {status.initialized ? 'สำเร็จ' : 'ไม่สำเร็จ'}</li>
          <li>In LINE Client: {status.isInClient ? 'ใช่' : 'ไม่ใช่'}</li>
          {status.error ? <li>หมายเหตุ: {status.error}</li> : null}
        </ul>
      )}
    </main>
  );
}
