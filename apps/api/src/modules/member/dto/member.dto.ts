import { UpdateMarketingConsentRequestDto } from '@line-connect/shared';
import { z } from 'zod';
import { parseWithZod } from '../../auth/dto/auth.dto';

// Schema ตรวจสอบข้อมูลขาเข้าสำหรับ PUT /me/consent (อนุญาตให้เปลี่ยนสถานะความยินยอม MARKETING พร้อมระบุเวอร์ชัน)
export const updateMarketingConsentSchema: z.ZodType<UpdateMarketingConsentRequestDto> =
  z.object({
    granted: z.boolean({
      required_error: 'ต้องระบุสถานะความยินยอม (granted: true | false)',
      invalid_type_error: 'granted ต้องเป็นค่า boolean เท่านั้น',
    }),
    version: z
      .string({
        required_error: 'ต้องระบุเวอร์ชันของความยินยอม (version)',
      })
      .min(1, 'version ต้องไม่เป็นค่าว่าง'),
  });

// ฟังก์ชันตรวจสอบและแปลงข้อมูลขาเข้าของ PUT /me/consent
export function parseUpdateMarketingConsentDto(
  payload: unknown,
): UpdateMarketingConsentRequestDto {
  return parseWithZod(updateMarketingConsentSchema, payload);
}
