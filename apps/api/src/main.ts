import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PaginationInterceptor } from './common/interceptors/pagination.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Cabeceras de seguridad HTTP con Helmet (RF-70 / Hardening)
  // Permite estilos CSS en línea ('unsafe-inline') para el portal SSR de rescate ciudadano (/p/:publicCode)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );

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
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Configuración de trust proxy según variable de entorno (para proxies inversos como Render)
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

  // Restricción de CORS según entorno y variable de configuración
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  if (nodeEnv === 'production') {
    if (!corsOrigin || corsOrigin.trim() === '') {
      throw new Error('[Config Error] CORS_ORIGIN debe definirse explícitamente en entorno de producción');
    }
    if (corsOrigin.trim() === '*' || corsOrigin.split(',').map((o) => o.trim()).includes('*')) {
      throw new Error('[Config Error] CORS_ORIGIN no puede ser "*" en entorno de producción');
    }
    const origins = corsOrigin.includes(',')
      ? corsOrigin.split(',').map((o) => o.trim())
      : corsOrigin.trim();
    app.enableCors({
      origin: origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });
  } else {
    // En desarrollo/testing se permite lista explícita configurable o valores locales por defecto.
    // NOTA: Los orígenes 'file://' y 'null' quedan reservados para la fase del instalador de escritorio y pruebas locales.
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
          'file://',
          'null',
        ],
        credentials: true,
      });
    }
  }

  await app.listen(port);
  console.log(`[VetApp API] Servidor iniciado en http://localhost:${port}`);
}

void bootstrap();
