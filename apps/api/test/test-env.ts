/**
 * Helper compartido para configuración hermética del entorno de pruebas.
 * Define valores por defecto válidos y ficticios para variables requeridas
 * sin exponer secretos reales ni depender de bases de datos o archivos .env externos.
 */
export function ensureTestEnv(): void {
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??=
    'postgresql://test_mock_user:test_mock_password@localhost:5432/test_mock_db?schema=public';
  process.env.DIRECT_URL ??=
    'postgresql://test_mock_user:test_mock_password@localhost:5432/test_mock_db?schema=public';
  process.env.JWT_SECRET ??=
    'test_mock_jwt_secret_must_be_at_least_32_characters_long_for_validation';
  process.env.JWT_REFRESH_SECRET ??=
    'test_mock_jwt_refresh_secret_at_least_32_characters_long_for_validation';
  process.env.MAIL_DRIVER ??= 'log';
  process.env.NOTIFICATIONS_CRON_ENABLED ??= 'false';
}

ensureTestEnv();
