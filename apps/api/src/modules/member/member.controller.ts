import {
  MemberConsentResponseDto,
  MemberHomeResponseDto,
  MemberProfileResponseDto,
} from '@line-connect/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedRequest,
  SessionAuthGuard,
} from '../auth/guards/session-auth.guard';
import { SessionJwtPayload } from '../auth/services/session-token.service';
import { parseUpdateMarketingConsentDto } from './dto/member.dto';
import { MemberService } from './services/member.service';
import {
  PdpaRetentionService,
  UnlinkMemberResponseDto,
} from './services/pdpa-retention.service';

// Controller สำหรับให้บริการข้อมูลสมาชิกภายใต้ /me/* (ทุก Endpoint ต้องผ่าน SessionAuthGuard จาก Prompt 4)
@Controller('me')
@UseGuards(SessionAuthGuard)
export class MemberController {
  constructor(
    private readonly memberService: MemberService,
    @Optional() private readonly pdpaRetentionService?: PdpaRetentionService,
  ) {}

  // GET /me/home — ชื่อ, tier, แต้มแยก TWD/BnB, คูปองพร้อมใช้ 5 ใบล่าสุด, Mission ที่กำลังทำพร้อม progress
  @Get('home')
  async getHome(
    @Req() req: AuthenticatedRequest,
  ): Promise<MemberHomeResponseDto> {
    const session = this.requireSession(req);
    return this.memberService.getHome(session);
  }

  // GET /me/profile — ข้อมูลส่วนตัว (mask เบอร์และอีเมลบางส่วน) และประวัติเคลมแต้มจาก getPointClaimLog
  @Get('profile')
  async getProfile(
    @Req() req: AuthenticatedRequest,
  ): Promise<MemberProfileResponseDto> {
    const session = this.requireSession(req);
    return this.memberService.getProfile(session);
  }

  // GET /me/consent — ดูสถานะและประวัติความยินยอมรวมถึง MARKETING
  @Get('consent')
  async getConsent(
    @Req() req: AuthenticatedRequest,
  ): Promise<MemberConsentResponseDto> {
    const session = this.requireSession(req);
    return this.memberService.getConsent(session);
  }

  // PUT /me/consent — เปลี่ยนสถานะความยินยอม MARKETING (insert แถวใหม่ ไม่ update ทับ)
  @Put('consent')
  async updateConsent(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<MemberConsentResponseDto> {
    const session = this.requireSession(req);
    const dto = parseUpdateMarketingConsentDto(body);
    return this.memberService.updateMarketingConsent(session, dto);
  }

  // POST /me/unlink — ยกเลิกการผูก LINE UID, ลบ the1_token, เปลี่ยน line_link เป็น unlinked และบันทึก audit_log
  @Post('unlink')
  @HttpCode(HttpStatus.OK)
  async unlinkAccount(
    @Req() req: AuthenticatedRequest,
  ): Promise<UnlinkMemberResponseDto> {
    const session = this.requireSession(req);
    if (!this.pdpaRetentionService) {
      throw new UnauthorizedException('บริการจัดการสิทธิ์ PDPA ยังไม่พร้อมใช้งาน');
    }
    return this.pdpaRetentionService.unlinkMemberAccount(session);
  }

  private requireSession(req: AuthenticatedRequest): SessionJwtPayload {
    if (!req.sessionUser) {
      throw new UnauthorizedException('ไม่พบข้อมูล Session ของผู้ใช้งาน');
    }
    return req.sessionUser;
  }
}
