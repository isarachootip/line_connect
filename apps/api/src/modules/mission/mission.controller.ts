import {
  MemberMissionDetailDto,
  MemberMissionListResponseDto,
} from '@line-connect/shared';
import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedRequest,
  SessionAuthGuard,
} from '../auth/guards/session-auth.guard';
import { SessionJwtPayload } from '../auth/services/session-token.service';
import { MissionEngineService } from './services/mission-engine.service';

// Controller สำหรับแสดงรายการและรายละเอียดภารกิจของสมาชิก (GET /me/missions และ GET /me/missions/:id)
@Controller('me/missions')
@UseGuards(SessionAuthGuard)
export class MissionController {
  constructor(private readonly missionEngineService: MissionEngineService) {}

  // GET /me/missions — ดึงรายการภารกิจทั้งหมดพร้อมความคืบหน้าของสมาชิกปัจจุบัน
  @Get()
  async listMyMissions(
    @Req() req: AuthenticatedRequest,
  ): Promise<MemberMissionListResponseDto> {
    const session = this.requireSession(req);
    return this.missionEngineService.getMemberMissions(session.sub);
  }

  // GET /me/missions/:id — ดึงรายละเอียดภารกิจตามรหัสพร้อมความคืบหน้าของสมาชิกปัจจุบัน
  @Get(':id')
  async getMyMissionById(
    @Req() req: AuthenticatedRequest,
    @Param('id') missionId: string,
  ): Promise<MemberMissionDetailDto> {
    const session = this.requireSession(req);
    return this.missionEngineService.getMemberMissionById(
      session.sub,
      missionId,
    );
  }

  private requireSession(req: AuthenticatedRequest): SessionJwtPayload {
    if (!req.sessionUser) {
      throw new UnauthorizedException('ไม่พบข้อมูล Session ของผู้ใช้งาน');
    }
    return req.sessionUser;
  }
}
