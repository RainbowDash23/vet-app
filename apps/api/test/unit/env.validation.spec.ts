import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { validateEnv, Environment } from '../../src/config/env.validation';

describe('EnvValidation (RNF-2, RF-10 / Security Hardening)', () => {
  const baseValidConfig = {
    PORT: 3000,
    DATABASE_URL: 'postgresql://vet_admin:secure@localhost:5433/vet_app_db?schema=public',
    JWT_SECRET: 'super_secret_production_key_that_is_at_least_32_chars_long',
  };

  it('debe aceptar variables de entorno válidas en development', () => {
    const config = validateEnv({
      ...baseValidConfig,
      NODE_ENV: 'development',
      JWT_SECRET: 'change_me_super_secret_for_development_32_chars',
    });
    assert.strictEqual(config.NODE_ENV, Environment.Development);
  });

  it('debe rechazar un JWT_SECRET que contenga "change_me" cuando NODE_ENV sea production', () => {
    assert.throws(
      () => {
        validateEnv({
          ...baseValidConfig,
          NODE_ENV: 'production',
          JWT_SECRET: 'change_me_super_secret_for_development_32_chars',
        });
      },
      (err: any) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('change_me'));
        return true;
      },
    );
  });

  it('debe aceptar un JWT_SECRET seguro sin "change_me" cuando NODE_ENV sea production', () => {
    const config = validateEnv({
      ...baseValidConfig,
      NODE_ENV: 'production',
      JWT_SECRET: 'a_very_secure_high_entropy_secret_key_32_bytes_min',
    });
    assert.strictEqual(config.NODE_ENV, Environment.Production);
  });
it('debe aceptar MAIL_DRIVER=log sin requerir variables SMTP', () => {
    const config = validateEnv({
      ...baseValidConfig,
      MAIL_DRIVER: 'log',
    });
    assert.strictEqual(config.MAIL_DRIVER, 'log');
  });

  it('debe rechazar MAIL_DRIVER=smtp si faltan variables SMTP requeridas', () => {
    assert.throws(
      () => {
        validateEnv({
          ...baseValidConfig,
          MAIL_DRIVER: 'smtp',
        });
      },
      (err: any) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('SMTP'));
        return true;
      },
    );
  });

  it('debe aceptar MAIL_DRIVER=smtp con todas las variables SMTP suministradas', () => {
    const config = validateEnv({
      ...baseValidConfig,
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.mailtrap.io',
      SMTP_PORT: 2525,
      SMTP_USER: 'test_user',
      SMTP_PASS: 'test_pass',
      SMTP_FROM: 'Vet <no-reply@vet.local>',
    });
    assert.strictEqual(config.MAIL_DRIVER, 'smtp');
    assert.strictEqual(config.SMTP_HOST, 'smtp.mailtrap.io');
    assert.strictEqual(config.SMTP_PORT, 2525);
  });
});
