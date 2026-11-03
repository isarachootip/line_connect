import liff from '@line/liff';

// อินเทอร์เฟซจำลองการทำงานของ LINE LIFF SDK เพื่อรองรับการทำ Unit Test
export interface LiffSdkPort {
  init(config: { liffId: string }): Promise<void>;
  isInClient(): boolean;
  isLoggedIn(): boolean;
  getIDToken?: () => string | null;
}

// ผลลัพธ์จากการเริ่มต้นทำงานของ LIFF SDK
export interface LiffInitResult {
  readonly initialized: boolean;
  readonly liffId: string;
  readonly isInClient: boolean;
  readonly isLoggedIn: boolean;
  readonly idToken?: string | null;
  readonly error?: string;
}

// ฟังก์ชันเริ่มต้นทำงานของ LIFF SDK (เรียก liff.init)
export async function initializeLiffApp(
  liffId: string,
  sdk: LiffSdkPort = liff,
): Promise<LiffInitResult> {
  const trimmedId = liffId.trim();
  if (!trimmedId) {
    return {
      initialized: false,
      liffId: '',
      isInClient: false,
      isLoggedIn: false,
      error: 'ยังไม่ได้กำหนดค่า VITE_LIFF_ID ใน Environment Variable',
    };
  }

  try {
    await sdk.init({ liffId: trimmedId });
    return {
      initialized: true,
      liffId: trimmedId,
      isInClient: sdk.isInClient(),
      isLoggedIn: sdk.isLoggedIn(),
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'เกิดข้อผิดพลาดขณะเรียก liff.init';
    return {
      initialized: false,
      liffId: trimmedId,
      isInClient: false,
      isLoggedIn: false,
      error: message,
    };
  }
}

// ดึง LINE ID Token จาก LIFF SDK (หากรันในโหมดจำลองบน Browser จะคืน Mock Token สำหรับทดสอบ)
export function getLiffIdToken(
  sdk: LiffSdkPort = liff,
  fallbackMockToken = 'mock-line-id-token:U_DEV_LINE_001',
): string {
  try {
    const token = sdk.getIDToken ? sdk.getIDToken() : null;
    return token && token.trim().length > 0 ? token : fallbackMockToken;
  } catch {
    return fallbackMockToken;
  }
}
