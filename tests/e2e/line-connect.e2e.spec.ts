// สคริปต์ Playwright End-to-End Test ครอบคลุม 7 เส้นทางหลักของระบบ Line Connect (ไทวัสดุ และ BnB Home)
export interface PlaywrightPageLike {
  goto(url: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  textContent(selector: string): Promise<string | null>;
}

export interface PlaywrightRequestContextLike {
  post(
    url: string,
    options: {
      headers?: Record<string, string>;
      data?: Record<string, unknown>;
    },
  ): Promise<{ status(): number; json(): Promise<Record<string, unknown>> }>;
  get(
    url: string,
    options: { headers?: Record<string, string> },
  ): Promise<{ status(): number; json(): Promise<Record<string, unknown>> }>;
  put(
    url: string,
    options: {
      headers?: Record<string, string>;
      data?: Record<string, unknown>;
    },
  ): Promise<{ status(): number; json(): Promise<Record<string, unknown>> }>;
}

const API_BASE_URL = process.env.STAGING_API_BASE_URL ?? 'http://localhost:3000';
const LIFF_BASE_URL = process.env.STAGING_LIFF_BASE_URL ?? 'http://localhost:5173';

// ฟังก์ชันรันทดสอบ Playwright E2E ทั้ง 7 ขั้นตอนกับเซิร์ฟเวอร์ Staging / Local
export async function runPlaywrightE2eJourney(
  page: PlaywrightPageLike,
  request: PlaywrightRequestContextLike,
): Promise<void> {
  // 1. ลงทะเบียนครั้งแรกผ่าน LIFF -> ได้รับคูปองต้อนรับ 20% (ONLINE_FIRST_REG_20)
  await page.goto(`${LIFF_BASE_URL}/?brand=TWD`);
  const callbackRes = await request.post(`${API_BASE_URL}/auth/the1/callback`, {
    data: {
      idToken: 'mock-id-token-e2e-user-01',
      brand: 'TWD',
      otpRef: 'T1-9901',
      otpCode: '123456',
      tncVersion: 'v1.0',
      pdpaVersion: 'v1.0',
    },
  });
  if (callbackRes.status() !== 200) {
    throw new Error(`Expected 200 from /auth/the1/callback, got ${callbackRes.status()}`);
  }
  const callbackBody = await callbackRes.json();
  const accessToken = String(callbackBody.accessToken ?? '');
  if (!callbackBody.isFirstRegistration) {
    throw new Error('Expected isFirstRegistration = true on first registration');
  }

  // 2. Login ซ้ำไม่ต้องยืนยัน OTP (POST /auth/line คืน linked: true ทันที)
  const reloginRes = await request.post(`${API_BASE_URL}/auth/line`, {
    data: { idToken: 'mock-id-token-e2e-user-01', brand: 'TWD' },
  });
  const reloginBody = await reloginRes.json();
  if (reloginBody.linked !== true) {
    throw new Error('Expected repeat login to return linked = true without OTP');
  }

  // 3. ยอดใช้จ่ายเข้าแล้ว Mission progress เพิ่มขึ้น
  await request.post(`${API_BASE_URL}/integrations/spending`, {
    headers: { 'X-TWD-Signature': process.env.E2E_SPENDING_SIGNATURE ?? 'mock-hmac-sig' },
    data: {
      txnId: 'TXN-E2E-001',
      memberId: callbackBody.memberId,
      store: 'TWD-BANGNA',
      amount: 4500,
      category: 'CONSTRUCTION',
      sku: 'SKU-STEEL-01',
      txnAt: new Date().toISOString(),
    },
  });
  const missionsMid = await (
    await request.get(`${API_BASE_URL}/me/missions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).json();
  if (!Array.isArray(missionsMid.missions)) {
    throw new Error('Expected missions array from GET /me/missions');
  }

  // 4. ยอดใช้จ่ายสะสมครบเป้าหมาย Mission -> ได้รับ Reward (คูปอง + คะแนน The 1)
  await request.post(`${API_BASE_URL}/integrations/spending`, {
    headers: { 'X-TWD-Signature': process.env.E2E_SPENDING_SIGNATURE ?? 'mock-hmac-sig' },
    data: {
      txnId: 'TXN-E2E-002',
      memberId: callbackBody.memberId,
      store: 'TWD-BANGNA',
      amount: 6000,
      category: 'CONSTRUCTION',
      sku: 'SKU-STEEL-02',
      txnAt: new Date().toISOString(),
    },
  });

  // 5. ใช้คูปอง (POST /me/coupons/:id/use) -> ได้รหัสหน้าร้านและ QR Payload
  const couponsRes = await (
    await request.get(`${API_BASE_URL}/me/coupons?status=available`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).json();
  const firstCoupon = (couponsRes.coupons as Array<{ walletId: string }>)[0];
  const useRes = await (
    await request.post(`${API_BASE_URL}/me/coupons/${firstCoupon.walletId}/use`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).json();
  if (!useRes.redemptionCode || !useRes.qrPayload) {
    throw new Error('Expected redemptionCode and qrPayload after using coupon');
  }

  // 6. ถอนความยินยอมการตลาด (PUT /me/consent granted=false)
  const consentRes = await (
    await request.put(`${API_BASE_URL}/me/consent`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { granted: false, version: 'v1.0' },
    })
  ).json();
  if ((consentRes.marketing as { granted: boolean })?.granted !== false) {
    throw new Error('Expected marketing consent to be revoked');
  }

  // 7. ยกเลิกการผูกบัญชี (POST /me/unlink)
  const unlinkRes = await (
    await request.post(`${API_BASE_URL}/me/unlink`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  ).json();
  if (unlinkRes.status !== 'unlinked') {
    throw new Error('Expected account status to become unlinked');
  }
}
