// โมดูลเสริมความปลอดภัยตามมาตรฐาน OWASP Top 10: Security Headers, Strict CORS Whitelist และป้องกัน CSV Formula Injection
export const OWASP_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-XSS-Protection': '0',
};

export interface HeaderWritableResponse {
  setHeader(name: string, value: string): unknown;
}

// Middleware สำหรับแนบ HTTP Security Headers ทุก Response ของ API Gateway
export function createSecurityHeadersMiddleware(): (
  _req: unknown,
  res: HeaderWritableResponse,
  next: () => void,
) => void {
  return (_req: unknown, res: HeaderWritableResponse, next: () => void): void => {
    for (const [headerName, headerValue] of Object.entries(OWASP_SECURITY_HEADERS)) {
      res.setHeader(headerName, headerValue);
    }
    next();
  };
}

// แปลงค่า CORS_ALLOWED_ORIGINS จาก .env เป็นรายการ Origin ที่อนุญาตอย่างปลอดภัย (ไม่ยอมรับ '*')
export function parseAllowedCorsOrigins(rawOrigins: string): readonly string[] {
  return rawOrigins
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '*');
}

// ตรวจสอบว่า Origin ของคำขออยู่ในรายการ Domain ของ LIFF หรือ Admin ที่อนุญาตหรือไม่
export function isCorsOriginAllowed(
  requestOrigin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!requestOrigin) {
    return true;
  }
  return allowedOrigins.includes(requestOrigin.trim());
}

// สร้างการตั้งค่า CORS สำหรับ NestJS ที่อนุญาตเฉพาะ Origin ของ LIFF และ Admin เท่านั้น
export function buildStrictCorsOptions(rawAllowedOrigins: string): {
  origin: (
    requestOrigin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => void;
  methods: string[];
  allowedHeaders: string[];
  credentials: boolean;
} {
  const allowedOrigins = parseAllowedCorsOrigins(rawAllowedOrigins);
  return {
    origin: (requestOrigin, callback): void => {
      if (isCorsOriginAllowed(requestOrigin, allowedOrigins)) {
        callback(null, true);
      } else {
        callback(
          new Error(`ไม่อนุญาตการเข้าถึงข้ามโดเมน (CORS Blocked) สำหรับ Origin: ${requestOrigin}`),
          false,
        );
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-TWD-Signature'],
    credentials: true,
  };
}

// ป้องกัน CSV Formula Injection (OWASP Injection) สำหรับค่าที่จะเขียนลงไฟล์ Batch CSV
export function sanitizeCsvCell(rawValue: string): string {
  const trimmed = String(rawValue ?? '').replace(/[\r\n]+/g, ' ');
  if (/^[=+\-@\t]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}
