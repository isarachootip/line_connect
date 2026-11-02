import { BadRequestException } from '@nestjs/common';
import { Brand } from '@prisma/client';
import { z } from 'zod';

// Schema ตรวจสอบข้อมูลขาเข้าสำหรับ POST /auth/line (รับเฉพาะ idToken และ brand โดยไม่เชื่อ lineUid จาก Client)
export const lineAuthRequestSchema = z.object({
  idToken: z.string().min(1, 'ต้องระบุ LINE ID Token (idToken)'),
  brand: z.nativeEnum(Brand, {
    errorMap: () => ({ message: 'brand ต้องเป็น TWD หรือ BNB เท่านั้น' }),
  }),
  // อนุญาตให้ส่งมาใน payload ได้เพื่อทดสอบว่า Backend เพิกเฉยต่อค่านี้และสกัดจาก idToken เท่านั้น
  lineUid: z.string().optional(),
});

export type LineAuthRequestDto = z.infer<typeof lineAuthRequestSchema>;

// Schema ตรวจสอบข้อมูลขาเข้าสำหรับ POST /auth/the1/callback หลังยืนยัน OTP สำเร็จ
export const the1CallbackRequestSchema = z
  .object({
    idToken: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    brand: z.nativeEnum(Brand).optional(),
    otpRef: z.string().min(1, 'ต้องระบุรหัสอ้างอิง OTP (otpRef)'),
    otpCode: z.string().min(4, 'ต้องระบุรหัส OTP (otpCode)'),
    memberId: z.string().min(1).optional(),
    tncVersion: z.string().min(1).optional(),
    pdpaVersion: z.string().min(1).optional(),
    consent: z
      .object({
        tncVersion: z.string().min(1),
        pdpaVersion: z.string().min(1),
      })
      .optional(),
    lineUid: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const resolvedTnc = val.consent?.tncVersion ?? val.tncVersion;
    const resolvedPdpa = val.consent?.pdpaVersion ?? val.pdpaVersion;
    if (!resolvedTnc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tncVersion'],
        message: 'ต้องระบุเวอร์ชันของข้อกำหนดและเงื่อนไข (tncVersion)',
      });
    }
    if (!resolvedPdpa) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pdpaVersion'],
        message: 'ต้องระบุเวอร์ชันของนโยบายคุ้มครองข้อมูลส่วนบุคคล (pdpaVersion)',
      });
    }
  });

export type The1CallbackRequestDto = z.infer<typeof the1CallbackRequestSchema>;

// Schema ตรวจสอบข้อมูลขาเข้าสำหรับ POST /auth/logout
export const logoutRequestSchema = z.object({
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
});

export type LogoutRequestDto = z.infer<typeof logoutRequestSchema>;

// ผลลัพธ์จาก POST /auth/line (แยกกรณีผูกบัญชีแล้ว กับยังไม่ผูกบัญชี)
export type LineAuthResponseDto =
  | {
      readonly linked: true;
      readonly brand: Brand;
      readonly memberId: string;
      readonly accessToken: string;
      readonly refreshToken: string;
      readonly expiresInSeconds: number;
    }
  | {
      readonly linked: false;
      readonly brand: Brand;
      readonly passportUrl: string;
      readonly state: string;
    };

// ผลลัพธ์จาก POST /auth/the1/callback
export interface The1CallbackResponseDto {
  readonly linked: true;
  readonly brand: Brand;
  readonly memberId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly isFirstRegistration: boolean;
}

// ฟังก์ชันช่วยตรวจสอบข้อมูลด้วย Zod Schema และแปลงเป็น BadRequestException มาตรฐาน
export function parseWithZod<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new BadRequestException(message);
  }
  return result.data;
}
