import 'reflect-metadata';
import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { validateEnv, Environment } from '../../src/config/env.validation';

describe('EnvValidation (RNF-2, RF-10 / Production Security Hardening)', () => {
  const baseValidConfig = {
    PORT: 3000,
    DATABASE_URL: 'postgresql://vet_admin:secure@localhost:5433/vet_app_db?schema=public',
    JWT_SECRET: 'super_secret_development_key_that_is_at_least_32_chars_long',
  };

  const validProdConfig = {
    ...baseValidConfig,
    NODE_ENV: 'production',
    JWT_SECRET: 'k7F9mX2vP4wQ8zR1tY5uI3oA6sD0fG2hJ', // 32 chars, no sample keywords
    JWT_REFRESH_SECRET: 'b8N3vC5xZ1mK9lJ7hG5fD3sA2qW4eR6t', // 32 chars, distinct, no sample keywords
    NOTIFICATIONS_CRON_ENABLED: 'false',
    CORS_ORIGIN: 'https://vet-app.example.com',
  };

  it('debe aceptar variables de entorno válidas en development', () => {
    const config = validateEnv({
      ...baseValidConfig,
      NODE_ENV: 'development',
      JWT_SECRET: 'change_me_super_secret_for_development_32_chars',
    });
    assert.strictEqual(config.NODE_ENV, Environment.Development);
  });

  describe('Validaciones de Producción (NODE_ENV=production)', () => {
    it('debe aceptar una configuración de producción completamente válida', () => {
      const config = validateEnv(validProdConfig);
      assert.strictEqual(config.NODE_ENV, Environment.Production);
      assert.strictEqual(config.NOTIFICATIONS_CRON_ENABLED, 'false');
      assert.strictEqual(config.CORS_ORIGIN, 'https://vet-app.example.com');
    });

    it('debe rechazar un JWT_SECRET que contenga palabras de ejemplo ("change_me", "secret", "password")', () => {
      assert.throws(
        () => {
          validateEnv({
            ...validProdConfig,
            JWT_SECRET: 'change_me_super_secret_key_long_enough_32_chars',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('JWT_SECRET no puede contener valores de ejemplo'));
          return true;
        },
      );
    });

    it('debe rechazar si falta JWT_REFRESH_SECRET en producción', () => {
      const invalid = { ...validProdConfig };
      delete (invalid as any).JWT_REFRESH_SECRET;
      assert.throws(
        () => {
          validateEnv(invalid);
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('JWT_REFRESH_SECRET es obligatorio'));
          return true;
        },
      );
    });

    it('debe rechazar un JWT_REFRESH_SECRET que contenga palabras de ejemplo', () => {
      assert.throws(
        () => {
          validateEnv({
            ...validProdConfig,
            JWT_REFRESH_SECRET: 'my_default_refresh_token_secret_value_32_chars',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('JWT_REFRESH_SECRET no puede contener valores de ejemplo'));
          return true;
        },
      );
    });

    it('debe rechazar si JWT_SECRET y JWT_REFRESH_SECRET son idénticos', () => {
      const sameKey = 'k7F9mX2vP4wQ8zR1tY5uI3oA6sD0fG2hJ';
      assert.throws(
        () => {
          validateEnv({
            ...validProdConfig,
            JWT_SECRET: sameKey,
            JWT_REFRESH_SECRET: sameKey,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('no pueden ser idénticos'));
          return true;
        },
      );
    });

    it('debe rechazar si NOTIFICATIONS_CRON_ENABLED no es explícito en producción', () => {
      const invalid = { ...validProdConfig };
      delete (invalid as any).NOTIFICATIONS_CRON_ENABLED;
      assert.throws(
        () => {
          validateEnv(invalid);
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('NOTIFICATIONS_CRON_ENABLED'));
          return true;
        },
      );
    });

    it('debe rechazar si CORS_ORIGIN es "*" en producción', () => {
      assert.throws(
        () => {
          validateEnv({
            ...validProdConfig,
            CORS_ORIGIN: '*',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('CORS_ORIGIN no puede ser "*"'));
          return true;
        },
      );
    });

    it('debe rechazar si CORS_ORIGIN incluye "*" entre múltiples orígenes en producción', () => {
      assert.throws(
        () => {
          validateEnv({
            ...validProdConfig,
            CORS_ORIGIN: 'https://vet-app.example.com, *',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('CORS_ORIGIN no puede ser "*"'));
          return true;
        },
      );
    });

    it('debe rechazar si CORS_ORIGIN está vacío o ausente en producción', () => {
      const invalid = { ...validProdConfig };
      delete (invalid as any).CORS_ORIGIN;
      assert.throws(
        () => {
          validateEnv(invalid);
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('CORS_ORIGIN debe definirse'));
          return true;
        },
      );
    });
  });

  describe('Configuración de Transporte de Correo', () => {
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
        (err: unknown) => {
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
});
