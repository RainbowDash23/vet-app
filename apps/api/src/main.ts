import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PaginationInterceptor } from './common/interceptors/pagination.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Validación global estricta con whitelist (RF-55)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Filtro global de excepciones de Prisma (RF-8, RF-15, RF-19, RF-31)
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Interceptor global de paginación uniforme (RF-57)
  app.useGlobalInterceptors(new PaginationInterceptor());

  app.enableCors();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
  console.log(`[VetApp API] Servidor iniciado en http://localhost:${port}`);
}

void bootstrap();
