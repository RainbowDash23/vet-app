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

  return validatedConfig;
}
