import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  SessionJwtPayload,
  SessionTokenService,
} from '../services/session-token.service';

export interface AuthenticatedRequest {
  readonly headers?: Record<string, string | string[] | undefined>;
  sessionUser?: SessionJwtPayload;
}

// Guard สำหรับตรวจสอบ Session JWT จาก Prompt 4 ก่อนอนุญาตให้เข้าถึง Endpoint ภายใต้ /me/*
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionTokenService: SessionTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawAuth = request.headers?.authorization;
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;

    if (!authHeader) {
      throw new UnauthorizedException(
        'กรุณาเข้าสู่ระบบก่อนใช้งาน (ไม่พบ Authorization Bearer Token)',
      );
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token) {
      throw new UnauthorizedException('รูปแบบ Authorization Header ไม่ถูกต้อง');
    }

    const verifiedPayload = this.sessionTokenService.verifyToken(
      token,
      'access',
    );
    request.sessionUser = verifiedPayload;
    return true;
  }
}
