import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import {
  LineAuthResponseDto,
  The1CallbackResponseDto,
  lineAuthRequestSchema,
  logoutRequestSchema,
  parseWithZod,
  the1CallbackRequestSchema,
} from './dto/auth.dto';
import { AuthService } from './services/auth.service';

// Controller จัดการ Endpoint ระบบยืนยันตัวตนและผูกบัญชี (/auth/line, /auth/the1/callback, /auth/logout)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 1. POST /auth/line — ตรวจสอบ LINE ID Token และคืนสถานะการผูกบัญชี
  @Post('line')
  @HttpCode(HttpStatus.OK)
  async loginWithLine(
    @Body() body: unknown,
    @Ip() ip?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ): Promise<LineAuthResponseDto> {
    const dto = parseWithZod(lineAuthRequestSchema, body);
    const clientIp = this.extractClientIp(ip, forwardedFor);
    return this.authService.loginWithLine(dto, clientIp);
  }

  // 2. POST /auth/the1/callback — รับผลหลังยืนยัน OTP, ผูกบัญชีและบันทึกข้อมูลภายใต้ Transaction เดียว
  @Post('the1/callback')
  @HttpCode(HttpStatus.OK)
  async handleThe1Callback(
    @Body() body: unknown,
    @Ip() ip?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ): Promise<The1CallbackResponseDto> {
    const dto = parseWithZod(the1CallbackRequestSchema, body);
    const clientIp = this.extractClientIp(ip, forwardedFor);
    return this.authService.handleThe1Callback(dto, clientIp);
  }

  // 4. POST /auth/logout — เรียก The 1 logout และเพิกถอน Session
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() body: unknown,
    @Headers('authorization') authHeader?: string,
    @Ip() ip?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ): Promise<{ success: boolean }> {
    const parsedBody = parseWithZod(logoutRequestSchema, body ?? {});
    const bearerToken = this.extractBearerToken(authHeader);
    const token =
      bearerToken ?? parsedBody.accessToken ?? parsedBody.refreshToken ?? '';
    const clientIp = this.extractClientIp(ip, forwardedFor);
    return this.authService.logout(token, clientIp);
  }

  private extractBearerToken(authHeader?: string): string | undefined {
    if (!authHeader) {
      return undefined;
    }
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim();
  }

  private extractClientIp(ip?: string, forwardedFor?: string): string {
    if (forwardedFor) {
      const firstIp = forwardedFor.split(',')[0]?.trim();
      if (firstIp) {
        return firstIp;
      }
    }
    return ip?.trim() || '127.0.0.1';
  }
}
