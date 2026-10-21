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

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

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
    throw new Error(`[Config Error] Variables de entorno inválidas o faltantes:\n${errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n')}`);
  }

  if (
    validatedConfig.NODE_ENV === Environment.Production &&
    validatedConfig.JWT_SECRET &&
    validatedConfig.JWT_SECRET.toLowerCase().includes('change_me')
  ) {
    throw new Error(
      '[Config Error] JWT_SECRET no puede contener "change_me" en entorno de producción',
    );
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
