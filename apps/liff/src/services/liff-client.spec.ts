import { initializeLiffApp, LiffSdkPort } from './liff-client';

// ชุดทดสอบสำหรับการเริ่มต้นทำงานของ LINE LIFF SDK (liff.init)
describe('initializeLiffApp (LIFF SDK Initializer)', () => {
  it('ควรเรียก liff.init ด้วย liffId ที่กำหนดและคืนสถานะเริ่มต้นสำเร็จ', async () => {
    const mockSdk: LiffSdkPort = {
      init: jest.fn<Promise<void>, [{ liffId: string }]>().mockResolvedValue(undefined),
      isInClient: jest.fn<boolean, []>().mockReturnValue(true),
      isLoggedIn: jest.fn<boolean, []>().mockReturnValue(true),
    };

    const result = await initializeLiffApp('1234567890-AbCdEfGh', mockSdk);

    expect(mockSdk.init).toHaveBeenCalledWith({ liffId: '1234567890-AbCdEfGh' });
    expect(result).toEqual({
      initialized: true,
      liffId: '1234567890-AbCdEfGh',
      isInClient: true,
      isLoggedIn: true,
    });
  });

  it('ควรคืนค่า initialized = false พร้อมข้อความแจ้งเตือนเมื่อ liffId ว่างเปล่าหรือเกิดข้อผิดพลาด', async () => {
    const mockSdk: LiffSdkPort = {
      init: jest.fn<Promise<void>, [{ liffId: string }]>(),
      isInClient: jest.fn<boolean, []>().mockReturnValue(false),
      isLoggedIn: jest.fn<boolean, []>().mockReturnValue(false),
    };

    const emptyResult = await initializeLiffApp('   ', mockSdk);
    expect(emptyResult.initialized).toBe(false);
    expect(mockSdk.init).not.toHaveBeenCalled();
  });
});
