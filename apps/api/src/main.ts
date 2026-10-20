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

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // Configuración de trust proxy según variable de entorno
  const expressApp = app.getHttpAdapter().getInstance();
  const trustProxyEnv = configService.get<string>('TRUST_PROXY', 'false');
  if (trustProxyEnv === 'true') {
    expressApp.set('trust proxy', true);
  } else if (trustProxyEnv !== 'false' && trustProxyEnv !== '') {
    const hops = Number(trustProxyEnv);
    expressApp.set('trust proxy', isNaN(hops) ? trustProxyEnv : hops);
  } else {
    expressApp.set('trust proxy', false);
  }

  // Restricción de CORS según variable de entorno
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  if (corsOrigin && corsOrigin !== '*') {
    const origins = corsOrigin.includes(',')
      ? corsOrigin.split(',').map((o) => o.trim())
      : corsOrigin.trim();
    app.enableCors({
      origin: origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });
  } else if (corsOrigin === '*') {
    app.enableCors({ origin: '*' });
  } else {
    app.enableCors({
      origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ],
      credentials: true,
    });
  }

  await app.listen(port);
  console.log(`[VetApp API] Servidor iniciado en http://localhost:${port}`);
}

void bootstrap();
