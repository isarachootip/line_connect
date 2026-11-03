import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  SessionJwtPayload,
  SessionTokenService,
} from '../services/session-token.service';

export interface AuthenticatedRequest {
  readonly headers?: Record<string, string | string[] | undefined>;
  readonly query?: Record<string, unknown>;
  readonly params?: Record<string, unknown>;
  readonly body?: Record<string, unknown>;
  sessionUser?: SessionJwtPayload;
}

// Guard สำหรับตรวจสอบ Session JWT และป้องกัน IDOR (ไม่อนุญาตให้เข้าถึงข้อมูลของสมาชิกรายอื่น) ภายใต้ /me/*
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

    const attemptedMemberId =
      request.headers?.['x-member-id'] ??
      request.query?.memberId ??
      request.params?.memberId ??
      (typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>).memberId
        : undefined);

    if (
      typeof attemptedMemberId === 'string' &&
      attemptedMemberId.trim().length > 0 &&
      attemptedMemberId.trim() !== verifiedPayload.sub
    ) {
      throw new ForbiddenException(
        'ไม่อนุญาตให้เข้าถึงข้อมูลของสมาชิกรายอื่น (IDOR Protection)',
      );
    }

    request.sessionUser = verifiedPayload;
    return true;
  }
}
