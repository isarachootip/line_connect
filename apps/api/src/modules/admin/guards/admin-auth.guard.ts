import { AdminRole, AdminUserDto } from '@line-connect/shared';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';

export const ADMIN_ROLES_METADATA_KEY = 'admin_allowed_roles';

export const RequireAdminRoles = (
  ...roles: readonly AdminRole[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(ADMIN_ROLES_METADATA_KEY, roles);

export interface AdminAuthenticatedRequest {
  readonly headers?: Record<string, string | string[] | undefined>;
  adminUser?: AdminUserDto;
}

export interface AdminSsoVerifyInput {
  readonly ssoToken: string;
  readonly requestedRole?: AdminRole;
}

// อินเทอร์เฟซสำหรับตรวจสอบ SSO Token ขององค์กร (เช่น Azure AD / Microsoft Entra ID)
// TODO: เชื่อมต่อ OIDC JWKS Endpoint จริงของ Azure AD เมื่อได้ค่า ADMIN_SSO_ISSUER_URL และ ADMIN_SSO_CLIENT_ID ขององค์กร
export interface AdminSsoProvider {
  verifyCorporateSsoToken(input: AdminSsoVerifyInput): Promise<AdminUserDto>;
}

// บริการจัดการ SSO (Mock สำหรับ Dev/Test) และออก/ตรวจสอบ Admin Session JWT พร้อม RBAC (ADMIN, MARKETING, VIEWER)
@Injectable()
export class AdminAuthService implements AdminSsoProvider {
  private readonly jwtSecret: string;

  constructor(
    jwtSecret = process.env.JWT_SECRET ??
      'default_dev_admin_jwt_secret_at_least_32_chars',
  ) {
    this.jwtSecret = jwtSecret;
  }

  // ตรวจสอบ SSO Token ขององค์กร (รองรับ Mock Token เฉพาะเมื่อไม่ได้ปิดโหมด Mock / ไม่ใช่ Production)
  async verifyCorporateSsoToken(
    input: AdminSsoVerifyInput,
  ): Promise<AdminUserDto> {
    const token = input.ssoToken.trim();
    if (!token || token === 'invalid-sso-token') {
      throw new UnauthorizedException('SSO Token ขององค์กรไม่ถูกต้องหรือหมดอายุ');
    }

    const isMockAllowed =
      process.env.ADMIN_SSO_USE_MOCK !== 'false' &&
      process.env.APP_ENV !== 'prod';
    if (!isMockAllowed && token.toLowerCase().startsWith('mock-sso-')) {
      throw new UnauthorizedException(
        'ไม่อนุญาตให้ใช้ Mock SSO Token ในสภาพแวดล้อม Production',
      );
    }

    const lower = token.toLowerCase();
    let role: AdminRole = input.requestedRole ?? AdminRole.VIEWER;
    if (lower.includes('admin')) {
      role = AdminRole.ADMIN;
    } else if (lower.includes('marketing')) {
      role = AdminRole.MARKETING;
    } else if (lower.includes('viewer')) {
      role = AdminRole.VIEWER;
    }

    const roleSlug = role.toLowerCase();
    return {
      adminId: `ADM-${role}`,
      email: `${roleSlug}@thaiwatsadu.co.th`,
      displayName: `เจ้าหน้าที่ ${role}`,
      role,
    };
  }

  // ออก Admin Session JWT อายุ 8 ชั่วโมงหลังยืนยัน SSO สำเร็จ
  issueAdminToken(user: AdminUserDto, nowSec = Math.floor(Date.now() / 1000)): string {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.adminId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        iat: nowSec,
        exp: nowSec + 8 * 3600,
      }),
    ).toString('base64url');
    const signature = this.sign(`${header}.${payload}`);
    return `${header}.${payload}.${signature}`;
  }

  // ตรวจสอบความถูกต้องของ Admin Session JWT
  verifyAdminToken(
    token: string,
    nowSec = Math.floor(Date.now() / 1000),
  ): AdminUserDto {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('รูปแบบ Admin Token ไม่ถูกต้อง');
    }
    const [header, payload, signature] = parts;
    const expectedSig = this.sign(`${header}.${payload}`);
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      throw new UnauthorizedException('ลายเซ็น Admin Token ไม่ถูกต้อง');
    }

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as {
      sub: string;
      email: string;
      displayName: string;
      role: AdminRole;
      exp: number;
    };

    if (decoded.exp <= nowSec) {
      throw new UnauthorizedException('Admin Session หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่');
    }

    return {
      adminId: decoded.sub,
      email: decoded.email,
      displayName: decoded.displayName,
      role: decoded.role,
    };
  }

  private sign(data: string): string {
    return crypto
      .createHmac('sha256', this.jwtSecret)
      .update(data)
      .digest('base64url');
  }
}

// Guard สำหรับตรวจสอบสิทธิ์ผู้ดูแลระบบและบังคับใช้ RBAC (ADMIN, MARKETING, VIEWER)
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AdminAuthenticatedRequest>();
    const rawAuth = req.headers?.authorization;
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('ไม่พบ Admin Bearer Token ในคำขอ');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const adminUser = this.adminAuthService.verifyAdminToken(token);
    req.adminUser = adminUser;

    const allowedRoles = this.reflector.getAllAndOverride<readonly AdminRole[]>(
      ADMIN_ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(adminUser.role)) {
        throw new ForbiddenException(
          `บทบาท ${adminUser.role} ไม่มีสิทธิ์ดำเนินการในคำสั่งนี้ (ต้องการ: ${allowedRoles.join(', ')})`,
        );
      }
    }

    return true;
  }
}
