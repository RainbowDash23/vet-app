import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import {
  seedDatabase,
  SEED_CLINICS,
  SEED_USERS,
  DEFAULT_SEED_PASSWORD,
  BCRYPT_ROUNDS,
  SeedClinicData,
  SeedUserData,
} from '../prisma/seed';

describe('T05 - Semilla de Base de Datos con Clínicas y Usuarios RBAC', () => {
  describe('a) Definición y consistencia de las clínicas requeridas (RF-7)', () => {
    it('debe definir al menos 2 clínicas diferenciadas con códigos únicos y datos de contacto', () => {
      assert.ok(Array.isArray(SEED_CLINICS), 'SEED_CLINICS debe ser un arreglo');
      assert.ok(SEED_CLINICS.length >= 2, 'Deben existir al menos 2 clínicas diferenciadas');

      const clinic1 = SEED_CLINICS.find((c: SeedClinicData) => c.code === 'CLINIC-01');
      assert.ok(clinic1, 'Debe existir la clínica con código CLINIC-01');
      assert.strictEqual(clinic1.name, 'Clínica Veterinaria Central');
      assert.strictEqual(clinic1.address, 'Av. Principal 123');
      assert.strictEqual(clinic1.phone, '+1234567890');
      assert.strictEqual(clinic1.email, 'contacto@vetcentral.com');

      const clinic2 = SEED_CLINICS.find((c: SeedClinicData) => c.code === 'CLINIC-02');
      assert.ok(clinic2, 'Debe existir la clínica con código CLINIC-02');
      assert.strictEqual(clinic2.name, 'Hospital Veterinario 24 Horas');
      assert.strictEqual(clinic2.address, 'Calle Secundaria 456');
      assert.strictEqual(clinic2.phone, '+1234567899');
      assert.strictEqual(clinic2.email, 'urgencias@hospitalvet24.com');
    });
  });

  describe('b) Definición y consistencia de usuarios RBAC y salteo criptográfico (RF-10)', () => {
    it('debe definir el factor de salteo en exactamente 12 rondas de bcrypt', () => {
      assert.strictEqual(BCRYPT_ROUNDS, 12, 'El factor de salteo debe ser de 12 rondas');
    });

    it('debe incluir los 4 usuarios requeridos con sus roles respectivos', () => {
      assert.ok(Array.isArray(SEED_USERS), 'SEED_USERS debe ser un arreglo');

      const admin = SEED_USERS.find((u: SeedUserData) => u.email === 'admin@vetapp.com');
      assert.ok(admin, 'Debe existir el usuario ADMIN admin@vetapp.com');
      assert.strictEqual(admin.role, Role.ADMIN);
      assert.strictEqual(admin.clinicCode, 'CLINIC-01');

      const vet1 = SEED_USERS.find((u: SeedUserData) => u.email === 'vet@vetapp.com');
      assert.ok(vet1, 'Debe existir el usuario VET vet@vetapp.com');
      assert.strictEqual(vet1.role, Role.VET);
      assert.strictEqual(vet1.clinicCode, 'CLINIC-01');
      assert.strictEqual(vet1.licenseNumber, 'VET-98765');
      assert.strictEqual(vet1.phone, '+1234567892');

      const reception = SEED_USERS.find((u: SeedUserData) => u.email === 'reception@vetapp.com');
      assert.ok(reception, 'Debe existir el usuario RECEPTION reception@vetapp.com');
      assert.strictEqual(reception.role, Role.RECEPTION);
      assert.strictEqual(reception.clinicCode, 'CLINIC-01');
      assert.strictEqual(reception.phone, '+1234567893');

      const vet2 = SEED_USERS.find((u: SeedUserData) => u.email === 'vet2@hospitalvet24.com');
      assert.ok(vet2, 'Debe existir el usuario VET vet2@hospitalvet24.com para Clinic 2');
      assert.strictEqual(vet2.role, Role.VET);
      assert.strictEqual(vet2.clinicCode, 'CLINIC-02');
      assert.strictEqual(vet2.licenseNumber, 'VET-11223');
      assert.strictEqual(vet2.phone, '+1234567894');
    });

    it('los veterinarios deben poseer cédula profesional y pertenecer a su clínica respectiva', () => {
      const vets = SEED_USERS.filter((u: SeedUserData) => u.role === Role.VET);
      assert.strictEqual(vets.length, 2, 'Deben existir 2 veterinarios sembrados');

      for (const vet of vets) {
        assert.ok(
          vet.licenseNumber && vet.licenseNumber.trim().length > 0,
          `El veterinario ${vet.email} debe poseer cédula profesional (licenseNumber)`,
        );
        assert.ok(
          vet.clinicCode && vet.clinicCode.trim().length > 0,
          `El veterinario ${vet.email} debe estar asignado a una clínica`,
        );
      }

      const vet1 = vets.find((v: SeedUserData) => v.email === 'vet@vetapp.com');
      const vet2 = vets.find((v: SeedUserData) => v.email === 'vet2@hospitalvet24.com');
      assert.strictEqual(vet1?.clinicCode, 'CLINIC-01');
      assert.strictEqual(vet2?.clinicCode, 'CLINIC-02');
      assert.notStrictEqual(
        vet1?.clinicCode,
        vet2?.clinicCode,
        'Los veterinarios deben pertenecer a clínicas distintas para pruebas multi-clínica',
      );
    });
  });

  describe('c) Ejecución idempotente y validación de hash bcrypt de la semilla', () => {
    it('debe ejecutar seedDatabase() de manera determinista y producir hashes con 12 rondas de bcrypt', async () => {
      // Mock en memoria tipado para verificar la lógica de seedDatabase de forma autocontenida
      interface MockClinicEntity {
        id: string;
        name: string;
        code: string;
        phone: string | null;
        email: string | null;
        address: string | null;
        isActive: boolean;
        deletedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }

      interface MockUserEntity {
        id: string;
        email: string;
        name: string;
        password: string;
        role: Role;
        clinicId: string;
        licenseNumber: string | null;
        phone: string | null;
        isActive: boolean;
        deletedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }

      const mockClinics = new Map<string, MockClinicEntity>();
      const mockUsers = new Map<string, MockUserEntity>();

      const mockPrisma = {
        clinic: {
          upsert: async (args: { where: { code: string }; update: Partial<MockClinicEntity>; create: any }) => {
            const existing = mockClinics.get(args.where.code);
            if (existing) {
              const updated: MockClinicEntity = { ...existing, ...args.update, updatedAt: new Date() };
              mockClinics.set(args.where.code, updated);
              return updated;
            }
            const created: MockClinicEntity = {
              id: `mock-clinic-${args.create.code}`,
              ...args.create,
              isActive: true,
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockClinics.set(args.create.code, created);
            return created;
          },
          findFirst: async (args: { where: { code: string } }) => {
            return mockClinics.get(args.where.code) || null;
          },
        },
        user: {
          findFirst: async (args: { where: { email: string; deletedAt?: Date | null } }) => {
            const user = mockUsers.get(args.where.email);
            if (user && user.deletedAt === null) {
              return user;
            }
            return null;
          },
          create: async (args: { data: any }) => {
            const user: MockUserEntity = {
              id: `mock-user-${args.data.email}`,
              ...args.data,
              isActive: true,
              deletedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockUsers.set(args.data.email, user);
            return user;
          },
          update: async (args: { where: { id: string }; data: any }) => {
            for (const [email, user] of mockUsers.entries()) {
              if (user.id === args.where.id) {
                const updated: MockUserEntity = { ...user, ...args.data, updatedAt: new Date() };
                mockUsers.set(email, updated);
                return updated;
              }
            }
            throw new Error('User not found');
          },
        },
      } as any;

      // 1. Primera ejecución de la semilla
      const result1 = await seedDatabase(mockPrisma);
      assert.strictEqual(result1.clinics.length, 2, 'Deben sembrarse 2 clínicas en la primera pasada');
      assert.strictEqual(result1.users.length, 4, 'Deben sembrarse 4 usuarios en la primera pasada');

      // Verificación de hashes y rondas de salteo (12 rondas)
      for (const user of result1.users) {
        assert.ok(user.password, `El usuario ${user.email} debe poseer contraseña con hash`);
        const rounds = bcrypt.getRounds(user.password);
        assert.strictEqual(
          rounds,
          12,
          `La contraseña de ${user.email} debe estar hasheada con 12 rondas (obtenido: ${rounds})`,
        );

        const passwordMatches = await bcrypt.compare(DEFAULT_SEED_PASSWORD, user.password);
        assert.strictEqual(
          passwordMatches,
          true,
          `La contraseña de ${user.email} debe ser verificable contra DEFAULT_SEED_PASSWORD`,
        );
      }

      // 2. Segunda ejecución (prueba de idempotencia: no debe lanzar error ni duplicar registros)
      const result2 = await seedDatabase(mockPrisma);
      assert.strictEqual(
        result2.clinics.length,
        2,
        'Deben mantenerse 2 clínicas tras la segunda pasada (idempotencia)',
      );
      assert.strictEqual(
        result2.users.length,
        4,
        'Deben mantenerse 4 usuarios tras la segunda pasada (idempotencia)',
      );
      assert.strictEqual(
        mockClinics.size,
        2,
        'El total de clínicas en persistencia debe ser exactamente 2',
      );
      assert.strictEqual(
        mockUsers.size,
        4,
        'El total de usuarios en persistencia debe ser exactamente 4',
      );
    });
  });
});
