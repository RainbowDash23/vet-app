import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  PORT: number = 3000;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  DIRECT_URL?: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET?: string;

  @IsOptional()
  @IsString()
  PUBLIC_BASE_URL?: string;

  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  MAIL_DRIVER?: string;

  @IsOptional()
  @IsString()
  NOTIFICATIONS_CRON_ENABLED?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsNumber()
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASS?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM?: string;

  @IsOptional()
  @IsString()
  SMTP_SECURE?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `[Config Error] Variables de entorno inválidas o faltantes:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  if (validatedConfig.NODE_ENV === Environment.Production) {
    const sampleKeywords = [
      'change_me',
      'secret',
      'changeme',
      'password',
      '123456',
      'default',
      'example',
      'admin',
    ];

    // Validación de JWT_SECRET en producción
    if (!validatedConfig.JWT_SECRET || validatedConfig.JWT_SECRET.length < 32) {
      throw new Error(
        '[Config Error] JWT_SECRET debe tener al menos 32 caracteres en entorno de producción',
      );
    }
    const lowerSecret = validatedConfig.JWT_SECRET.toLowerCase();
    if (sampleKeywords.some((kw) => lowerSecret.includes(kw))) {
      throw new Error(
        '[Config Error] JWT_SECRET no puede contener valores de ejemplo o predeterminados en entorno de producción',
      );
    }

    // Validación de JWT_REFRESH_SECRET en producción
    if (!validatedConfig.JWT_REFRESH_SECRET || validatedConfig.JWT_REFRESH_SECRET.length < 32) {
      throw new Error(
        '[Config Error] JWT_REFRESH_SECRET es obligatorio y debe tener al menos 32 caracteres en entorno de producción',
      );
    }
    const lowerRefreshSecret = validatedConfig.JWT_REFRESH_SECRET.toLowerCase();
    if (sampleKeywords.some((kw) => lowerRefreshSecret.includes(kw))) {
      throw new Error(
        '[Config Error] JWT_REFRESH_SECRET no puede contener valores de ejemplo o predeterminados en entorno de producción',
      );
    }

    // JWT_SECRET y JWT_REFRESH_SECRET no deben ser iguales
    if (validatedConfig.JWT_SECRET === validatedConfig.JWT_REFRESH_SECRET) {
      throw new Error(
        '[Config Error] JWT_SECRET y JWT_REFRESH_SECRET no pueden ser idénticos en entorno de producción',
      );
    }

    // NOTIFICATIONS_CRON_ENABLED debe definirse explícitamente como "true" o "false"
    if (
      validatedConfig.NOTIFICATIONS_CRON_ENABLED !== 'true' &&
      validatedConfig.NOTIFICATIONS_CRON_ENABLED !== 'false'
    ) {
      throw new Error(
        '[Config Error] NOTIFICATIONS_CRON_ENABLED debe definirse explícitamente como "true" o "false" en entorno de producción',
      );
    }

    // CORS_ORIGIN no puede ser "*" ni estar vacío en producción
    if (!validatedConfig.CORS_ORIGIN || validatedConfig.CORS_ORIGIN.trim() === '') {
      throw new Error(
        '[Config Error] CORS_ORIGIN debe definirse explícitamente en entorno de producción',
      );
    }
    if (
      validatedConfig.CORS_ORIGIN.trim() === '*' ||
      validatedConfig.CORS_ORIGIN.split(',').map((o) => o.trim()).includes('*')
    ) {
      throw new Error(
        '[Config Error] CORS_ORIGIN no puede ser "*" en entorno de producción',
      );
    }
  }

  if (validatedConfig.MAIL_DRIVER === 'smtp') {
    const missing: string[] = [];
    if (!validatedConfig.SMTP_HOST) missing.push('SMTP_HOST');
    if (!validatedConfig.SMTP_PORT) missing.push('SMTP_PORT');
    if (!validatedConfig.SMTP_USER) missing.push('SMTP_USER');
    if (!validatedConfig.SMTP_PASS) missing.push('SMTP_PASS');
    if (!validatedConfig.SMTP_FROM) missing.push('SMTP_FROM');

    if (missing.length > 0) {
      throw new Error(
        `[Config Error] Variables de configuración SMTP requeridas cuando MAIL_DRIVER=smtp faltantes: ${missing.join(', ')}`,
      );
    }
  }

  return validatedConfig;
}
