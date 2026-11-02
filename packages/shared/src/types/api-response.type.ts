import { AppEnvironment } from '../enums/brand.enum';

// สถานะการเชื่อมต่อของบริการภายนอกหรือฐานข้อมูลย่อย (DB / Redis)
export type DependencyState = 'up' | 'down';

// DTO สำหรับผลลัพธ์ของ Endpoint GET /health ที่เช็กทั้ง PostgreSQL และ Redis
export interface HealthStatusDto {
  readonly status: 'up' | 'degraded';
  readonly environment: AppEnvironment;
  readonly dependencies: {
    readonly database: DependencyState;
    readonly redis: DependencyState;
  };
}

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
