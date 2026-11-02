import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.schema';

// จุดเริ่มต้นการทำงานของเซิร์ฟเวอร์ Backend (NestJS API Gateway / BFF)
async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  await app.listen(env.PORT);
}

void bootstrap();
