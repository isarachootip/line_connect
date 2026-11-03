import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.schema';
import { StructuredJsonLogger } from './common/logger/structured-json.logger';
import {
  buildStrictCorsOptions,
  createSecurityHeadersMiddleware,
} from './common/security/security-hardening';

// จุดเริ่มต้นการทำงานของเซิร์ฟเวอร์ Backend (NestJS API Gateway / BFF)
async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  const logger = new StructuredJsonLogger();

  const app = await NestFactory.create(AppModule, {
    logger,
  });

  app.use(createSecurityHeadersMiddleware());
  app.enableCors(buildStrictCorsOptions(env.CORS_ALLOWED_ORIGINS));
  await app.listen(env.PORT);
  logger.log(`Line Connect API started on port ${env.PORT} (${env.APP_ENV})`, {
    context: 'Bootstrap',
    environment: env.APP_ENV,
  });
}

void bootstrap();
