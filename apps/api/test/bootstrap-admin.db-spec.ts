import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';
import { bootstrapAdmin, BCRYPT_ROUNDS } from '../src/scripts/bootstrap-admin';
import { seedDatabase } from '../prisma/seed';

describe('Bootstrap Admin en Producción contra PostgreSQL Real (RF-71)', () => {
  let prisma: PrismaClient;

  before(async () => {
    process.env.USE_REAL_DB = 'true';

    const rootEnvPath = path.resolve(__dirname, '../../..', '.env');
    const apiEnvPath = path.resolve(__dirname, '..', '.env');
    if (typeof process.loadEnvFile === 'function') {
      if (fs.existsSync(rootEnvPath)) {
        try {
          process.loadEnvFile(rootEnvPath);
        } catch {}
      } else if (fs.existsSync(apiEnvPath)) {
        try {
          process.loadEnvFile(apiEnvPath);
        } catch {}
      }
    }

    const port = process.env.POSTGRES_PORT || '5433';
    const user = process.env.POSTGRES_USER || 'vet_admin';
    const password = process.env.POSTGRES_PASSWORD || 'vet_secure_password_29518';
    const dbName = process.env.POSTGRES_DB || 'vet_app_db';
    process.env.DATABASE_URL = `postgresql://${user}:${password}@localhost:${port}/${dbName}?schema=public`;
    process.env.DIRECT_URL = process.env.DATABASE_URL;

    prisma = new PrismaClient();
    await prisma.$connect();
  });

  after(async () => {
    // Restaurar siembra base para no afectar otras suites
    try {
      await prisma.user.deleteMany({});
      await prisma.clinic.deleteMany({});
      await seedDatabase(prisma);
    } catch {}
    await prisma.$disconnect();
  });

  it('debe rechazar si faltan variables obligatorias o email inválido', async () => {
    await assert.rejects(
      async () => {
        await bootstrapAdmin(prisma, {
          email: '',
          password: 'ValidPassword123!',
          clinicName: 'Clínica Central',
          clinicCode: 'CLINIC-BOOT',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Faltan variables requeridas'));
        return true;
      },
    );

    await assert.rejects(
      async () => {
        await bootstrapAdmin(prisma, {
          email: 'not-an-email',
          password: 'ValidPassword123!',
          clinicName: 'Clínica Central',
          clinicCode: 'CLINIC-BOOT',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('dirección de correo válida'));
        return true;
      },
    );
  });

  it('debe rechazar contraseñas menores a 12 caracteres', async () => {
    await assert.rejects(
      async () => {
        await bootstrapAdmin(prisma, {
          email: 'admin@prod.vet',
          password: 'short',
          clinicName: 'Clínica Central',
          clinicCode: 'CLINIC-BOOT',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('al menos 12 caracteres'));
        return true;
      },
    );
  });

  it('debe crear la clínica y el usuario ADMIN con bcrypt 12 rondas cuando la base está limpia', async () => {
    // Limpiar usuarios y clínicas para simular base de datos recién migrada
    await prisma.accessLog.deleteMany({});
    await prisma.accessGrant.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.attachment.deleteMany({});
    await prisma.vaccination.deleteMany({});
    await prisma.visit.deleteMany({});
    await prisma.clinicPatient.deleteMany({});
    await prisma.tag.deleteMany({});
    await prisma.pet.deleteMany({});
    await prisma.clinicOwner.deleteMany({});
    await prisma.owner.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.clinic.deleteMany({});

    const rawPassword = 'SuperSecurePassword2026!';
    const result = await bootstrapAdmin(prisma, {
      email: 'founder@prodvet.com',
      password: rawPassword,
      clinicName: 'Hospital Veterinario de Producción',
      clinicCode: 'PROD-01',
    });

    assert.strictEqual(result.created, true);
    assert.ok(result.clinicId);
    assert.ok(result.userId);

    // Verificar en PostgreSQL real
    const userInDb = await prisma.user.findUnique({
      where: { id: result.userId },
      include: { clinic: true },
    });

    assert.ok(userInDb, 'El usuario ADMIN debe existir en la BD real');
    assert.strictEqual(userInDb.email, 'founder@prodvet.com');
    assert.strictEqual(userInDb.role, Role.ADMIN);
    assert.strictEqual(userInDb.isActive, true);
    assert.strictEqual(userInDb.clinic.code, 'PROD-01');
    assert.strictEqual(userInDb.clinic.name, 'Hospital Veterinario de Producción');

    // Verificar que la contraseña fue cifrada con bcrypt y coincide
    const passwordMatches = await bcrypt.compare(rawPassword, userInDb.password);
    assert.strictEqual(passwordMatches, true, 'El hash bcrypt debe coincidir con la contraseña');
  });

  it('idempotencia: si ya existe el administrador configurado y ningún otro usuario, no falla ni duplica', async () => {
    const userCountBefore = await prisma.user.count();
    assert.strictEqual(userCountBefore, 1);

    const result = await bootstrapAdmin(prisma, {
      email: 'founder@prodvet.com',
      password: 'SuperSecurePassword2026!',
      clinicName: 'Hospital Veterinario de Producción',
      clinicCode: 'PROD-01',
    });

    assert.strictEqual(result.created, false);
    const userCountAfter = await prisma.user.count();
    assert.strictEqual(userCountAfter, 1, 'No debe duplicar el usuario existente');
  });

  it('debe negarse a ejecutarse si ya existen otros usuarios en la base de datos', async () => {
    // Añadir un segundo usuario para simular una base de datos ya en operación
    const clinic = await prisma.clinic.findFirst();
    assert.ok(clinic);

    await prisma.user.create({
      data: {
        email: 'veterinario@prodvet.com',
        name: 'Dr. Veterinario',
        password: await bcrypt.hash('Password123!', BCRYPT_ROUNDS),
        role: Role.VET,
        clinicId: clinic.id,
        isActive: true,
      },
    });

    await assert.rejects(
      async () => {
        await bootstrapAdmin(prisma, {
          email: 'founder@prodvet.com',
          password: 'SuperSecurePassword2026!',
          clinicName: 'Hospital Veterinario de Producción',
          clinicCode: 'PROD-01',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Ya existen usuarios registrados'));
        return true;
      },
    );
  });
});
