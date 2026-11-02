import { Injectable, LoggerService } from '@nestjs/common';
import { redactPii, redactStringPii } from './pii-redactor';

// โครงสร้าง JSON Log มาตรฐานสำหรับระบบ Monitoring & Audit
export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: 'info' | 'error' | 'warn' | 'debug' | 'verbose';
  readonly context: string;
  readonly message: string;
  readonly metadata: Record<string, unknown>;
}

export type LogWriterFn = (jsonLine: string) => void;

// บริการบันทึก Structured Log ในรูปแบบ JSON ที่ทำการ Mask เบอร์โทร อีเมล และ Token อัตโนมัติ
@Injectable()
export class StructuredJsonLogger implements LoggerService {
  private readonly writer: LogWriterFn;

  constructor(writer?: LogWriterFn) {
    this.writer = writer ?? ((line: string) => process.stdout.write(`${line}\n`));
  }

  log(message: unknown, metaOrContext?: unknown): void {
    this.emit('info', message, metaOrContext);
  }

  error(message: unknown, traceOrMeta?: unknown, context?: string): void {
    const combinedMeta =
      typeof traceOrMeta === 'object' && traceOrMeta !== null
        ? { ...(traceOrMeta as Record<string, unknown>), context }
        : { trace: traceOrMeta, context };
    this.emit('error', message, combinedMeta);
  }

  warn(message: unknown, metaOrContext?: unknown): void {
    this.emit('warn', message, metaOrContext);
  }

  debug(message: unknown, metaOrContext?: unknown): void {
    this.emit('debug', message, metaOrContext);
  }

  verbose(message: unknown, metaOrContext?: unknown): void {
    this.emit('verbose', message, metaOrContext);
  }

  private emit(
    level: StructuredLogEntry['level'],
    rawMessage: unknown,
    metaOrContext?: unknown,
  ): void {
    const messageStr =
      typeof rawMessage === 'string'
        ? redactStringPii(rawMessage)
        : JSON.stringify(redactPii(rawMessage));

    let context = 'Application';
    let metadata: Record<string, unknown> = {};

    if (typeof metaOrContext === 'string') {
      context = metaOrContext;
    } else if (typeof metaOrContext === 'object' && metaOrContext !== null) {
      const sanitizedMeta = redactPii(
        metaOrContext as Record<string, unknown>,
      );
      if (typeof sanitizedMeta.context === 'string') {
        context = sanitizedMeta.context;
      }
      metadata = sanitizedMeta;
    }

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: messageStr,
      metadata,
    };

    this.writer(JSON.stringify(entry));
  }
}
