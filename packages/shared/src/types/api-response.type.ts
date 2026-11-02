// โครงสร้างรายละเอียดข้อผิดพลาดมาตรฐานสำหรับ API Response
export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
}

// โครงสร้างมาตรฐานของ API Response ทุกรายการในระบบ Line Connect BFF
export interface StandardApiResponse<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: ApiErrorDetail | null;
  readonly timestamp: string;
  readonly requestId?: string;
}

// สร้างผลลัพธ์กรณีทำงานสำเร็จตามรูปแบบมาตรฐาน
export function createSuccessResponse<T>(
  data: T,
  requestId?: string,
): StandardApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    timestamp: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
  };
}

// สร้างผลลัพธ์กรณีเกิดข้อผิดพลาดตามรูปแบบมาตรฐาน
export function createErrorResponse(
  code: string,
  message: string,
  requestId?: string,
): StandardApiResponse<null> {
  return {
    success: false,
    data: null,
    error: { code, message },
    timestamp: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
  };
}
