import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import { SpendingAuthVerifier } from './spending-auth.verifier';
import {
  SpendingBatchIngestSummary,
  SpendingIngestionService,
} from './spending-ingestion.service';

interface SpendingPushBodyShape {
  readonly items?: readonly unknown[];
  readonly transactions?: readonly unknown[];
}

// Controller สำหรับช่องทาง A (Push): POST /integrations/spending รับรายการยอดใช้จ่ายเป็น Batch สูงสุด 1,000 รายการ
@Controller('integrations/spending')
export class SpendingController {
  constructor(
    private readonly authVerifier: SpendingAuthVerifier,
    private readonly ingestionService: SpendingIngestionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receiveSpendingBatch(
    @Body() body: unknown,
    @Ip() ip?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('x-twd-signature') signature?: string,
    @Headers('x-client-cert-verified') clientCertVerified?: string,
  ): Promise<SpendingBatchIngestSummary> {
    const mode = (process.env.TWD_SPENDING_MODE ?? 'BOTH').toUpperCase();
    if (mode !== 'PUSH' && mode !== 'BOTH') {
      throw new ForbiddenException(
        'ช่องทาง Push สำหรับรับยอดใช้จ่ายถูกปิดใช้งานในการตั้งค่าระบบ (SPENDING_PUSH_DISABLED)',
      );
    }

    const clientIp = this.extractClientIp(ip, forwardedFor);
    this.authVerifier.verifyPushRequest(clientIp, body, {
      signature,
      clientCertVerified,
    });

    const items = this.extractItemsArray(body);
    return this.ingestionService.ingestBatch(items, 'PUSH');
  }

  private extractItemsArray(body: unknown): readonly unknown[] {
    if (Array.isArray(body)) {
      return body;
    }
    if (body && typeof body === 'object') {
      const shaped = body as SpendingPushBodyShape;
      if (Array.isArray(shaped.items)) {
        return shaped.items;
      }
      if (Array.isArray(shaped.transactions)) {
        return shaped.transactions;
      }
    }
    throw new BadRequestException(
      'รูปแบบ Payload ไม่ถูกต้อง ต้องส่งเป็น Array หรือระบุฟิลด์ items / transactions',
    );
  }

  private extractClientIp(ip?: string, forwardedFor?: string): string {
    if (forwardedFor) {
      const first = forwardedFor.split(',')[0]?.trim();
      if (first) {
        return first;
      }
    }
    return ip?.trim() || '127.0.0.1';
  }
}
