import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GrantSource, GrantScope, PetSpecies, PetSex, TagStatus, Role } from '@prisma/client';
import { AccessGrantsService } from '../../src/modules/pets/access-grants.service';
import { AccessGrantGuard } from '../../src/common/guards/access-grant.guard';

interface MockAccessGrant {
  id: string;
  petId: string;
  clinicId: string;
  source: GrantSource;
  scope: GrantScope;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockPet {
  id: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  sex: PetSex;
  birthDate: Date;
  ownerId: string;
  deletedAt: Date | null;
}

describe('AccessGrantsService & AccessGrantGuard (T15 / RF-21, RF-22, RF-23, RF-24, RNF-8)', () => {
  let accessGrantsService: AccessGrantsService;
  let accessGrantGuard: AccessGrantGuard;
  let mockPrisma: any;
  let grantsDb: MockAccessGrant[];
  let petsDb: MockPet[];

  const validPetId = 'p0000000-0000-4000-8000-000000000001';
  const externalClinicId = 'c0000000-0000-4000-8000-000000000002';
  const originatingClinicId = 'c0000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    petsDb = [
      {
        id: validPetId,
        name: 'Firulais',
        species: PetSpecies.CANINE,
        breed: 'Labrador',
        sex: PetSex.MALE,
        birthDate: new Date('2022-01-01'),
        ownerId: 'o0000000-0000-4000-8000-000000000001',
        deletedAt: null,
      },
    ];

    grantsDb = [];

    mockPrisma = {
      pet: {
        findFirst: async ({ where }: any) => {
          return (
            petsDb.find(
              (p) =>
                p.id === where.id &&
                (where.deletedAt === undefined ||
                  (where.deletedAt === null && p.deletedAt === null)),
            ) || null
          );
        },
      },
      accessGrant: {
        findFirst: async ({ where, orderBy }: any) => {
          let list = grantsDb.filter((g) => {
            if (where.petId && g.petId !== where.petId) return false;
            if (where.clinicId && g.clinicId !== where.clinicId) return false;
            if (where.revokedAt === null && g.revokedAt !== null) return false;
            if (where.expiresAt?.gt && !(g.expiresAt > where.expiresAt.gt)) return false;
            return true;
          });
          if (orderBy?.expiresAt === 'desc') {
            list = [...list].sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
          }
          return list[0] || null;
        },
        findUnique: async ({ where }: any) => {
          return grantsDb.find((g) => g.id === where.id) || null;
        },
        create: async ({ data }: any) => {
          const newGrant: MockAccessGrant = {
            id: `grant-${grantsDb.length + 1}`,
            petId: data.petId,
            clinicId: data.clinicId,
            source: data.source || GrantSource.NFC_TAP,
            scope: data.scope || GrantScope.FULL_HISTORY,
            grantedAt: data.grantedAt || new Date(),
            expiresAt: data.expiresAt,
            revokedAt: null,
            notes: data.notes || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          grantsDb.push(newGrant);
          return newGrant;
        },
        update: async ({ where, data }: any) => {
          const index = grantsDb.findIndex((g) => g.id === where.id);
          if (index === -1) throw new Error('Grant not found');
          const current = grantsDb[index];
          const updated: MockAccessGrant = {
            ...current,
            ...data,
            updatedAt: new Date(),
          };
          grantsDb[index] = updated;
          return updated;
        },
      },
    };

    accessGrantsService = new AccessGrantsService(mockPrisma as any);
    accessGrantGuard = new AccessGrantGuard(accessGrantsService);
  });

  describe('a) Concesión automática de AccessGrant por 24 horas y alcance FULL_HISTORY ante NFC_TAP (RF-22)', () => {
    it('debe crear un nuevo AccessGrant con vigencia exacta de 24 horas y scope FULL_HISTORY ante NFC_TAP', async () => {
      const before = Date.now();
      const grant = await accessGrantsService.grantAccess(
        validPetId,
        externalClinicId,
        GrantSource.NFC_TAP,
      );

      assert.ok(grant);
      assert.strictEqual(grant.petId, validPetId);
      assert.strictEqual(grant.clinicId, externalClinicId);
      assert.strictEqual(grant.source, GrantSource.NFC_TAP);
      assert.strictEqual(grant.scope, GrantScope.FULL_HISTORY);
      assert.strictEqual(grant.revokedAt, null);

      const expectedExpiration = before + 24 * 3600 * 1000;
      const actualExpiration = grant.expiresAt.getTime();
      const diff = Math.abs(actualExpiration - expectedExpiration);
      assert.ok(diff < 2000, `La expiración debe ser ~24h a partir de ahora, diff=${diff}ms`);
    });

    it('debe extender un AccessGrant activo previo refrescando su vencimiento a 24 horas', async () => {
      // Creamos un grant previo que vencía en 2 horas
      const existingGrant: MockAccessGrant = {
        id: 'existing-grant-1',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(Date.now() - 22 * 3600 * 1000),
        expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      grantsDb.push(existingGrant);

      const before = Date.now();
      const updatedGrant = await accessGrantsService.grantAccess(
        validPetId,
        externalClinicId,
        GrantSource.NFC_TAP,
      );

      assert.strictEqual(updatedGrant.id, 'existing-grant-1');
      const expectedExpiration = before + 24 * 3600 * 1000;
      const diff = Math.abs(updatedGrant.expiresAt.getTime() - expectedExpiration);
      assert.ok(diff < 2000, `La expiración extendida debe ser ~24h a partir de ahora, diff=${diff}ms`);
    });

    it('debe permitir especificar un scope y duración personalizada', async () => {
      const before = Date.now();
      const grant = await accessGrantsService.grantAccess(
        validPetId,
        externalClinicId,
        GrantSource.CLINIC_REFERRAL,
        GrantScope.VACCINES_ONLY,
        48,
      );

      assert.strictEqual(grant.scope, GrantScope.VACCINES_ONLY);
      assert.strictEqual(grant.source, GrantSource.CLINIC_REFERRAL);
      const expectedExpiration = before + 48 * 3600 * 1000;
      const diff = Math.abs(grant.expiresAt.getTime() - expectedExpiration);
      assert.ok(diff < 2000, `La expiración debe ser de 48h, diff=${diff}ms`);
    });

    it('debe lanzar NotFoundException si la mascota no existe o está inactiva', async () => {
      await assert.rejects(
        () => accessGrantsService.grantAccess('non-existent-pet', externalClinicId),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.match(err.message, /no encontrada/i);
          return true;
        },
      );
    });
  });

  describe('b) Verificación de validez activa de AccessGrant mientras permanezca dentro de las 24 horas (RF-23)', () => {
    it('hasActiveGrant debe retornar true para una clínica con grant vigente dentro de las 24 horas', async () => {
      grantsDb.push({
        id: 'active-grant-1',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 3600 * 1000), // Vence en 10h
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const hasGrant = await accessGrantsService.hasActiveGrant(validPetId, externalClinicId);
      assert.strictEqual(hasGrant, true);

      const activeGrant = await accessGrantsService.getActiveGrant(validPetId, externalClinicId);
      assert.ok(activeGrant);
      assert.strictEqual(activeGrant?.id, 'active-grant-1');
    });

    it('evalúa jerarquía de scopes: FULL_HISTORY cubre requerimiento de VACCINES_ONLY', async () => {
      grantsDb.push({
        id: 'full-grant',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 3600 * 1000),
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const fullQualified = await accessGrantsService.hasActiveGrant(
        validPetId,
        externalClinicId,
        GrantScope.FULL_HISTORY,
      );
      const vaccinesQualified = await accessGrantsService.hasActiveGrant(
        validPetId,
        externalClinicId,
        GrantScope.VACCINES_ONLY,
      );

      assert.strictEqual(fullQualified, true);
      assert.strictEqual(vaccinesQualified, true);
    });

    it('un grant con VACCINES_ONLY califica para VACCINES_ONLY pero no para FULL_HISTORY', async () => {
      grantsDb.push({
        id: 'vaccines-grant',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.VACCINES_ONLY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 3600 * 1000),
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const fullQualified = await accessGrantsService.hasActiveGrant(
        validPetId,
        externalClinicId,
        GrantScope.FULL_HISTORY,
      );
      const vaccinesQualified = await accessGrantsService.hasActiveGrant(
        validPetId,
        externalClinicId,
        GrantScope.VACCINES_ONLY,
      );

      assert.strictEqual(fullQualified, false);
      assert.strictEqual(vaccinesQualified, true);
    });
  });

  describe('c) Detección de vencimiento: retorna false cuando el grant ha vencido o fue revocado (RF-24)', () => {
    it('debe retornar false si el grant expiró (expiresAt < now)', async () => {
      grantsDb.push({
        id: 'expired-grant',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(Date.now() - 25 * 3600 * 1000),
        expiresAt: new Date(Date.now() - 1 * 3600 * 1000), // Expiró hace 1 hora
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const hasGrant = await accessGrantsService.hasActiveGrant(validPetId, externalClinicId);
      assert.strictEqual(hasGrant, false);

      const activeGrant = await accessGrantsService.getActiveGrant(validPetId, externalClinicId);
      assert.strictEqual(activeGrant, null);
    });

    it('debe retornar false si el grant fue revocado (revokedAt !== null) aun si no ha expirado', async () => {
      grantsDb.push({
        id: 'revoked-grant',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 3600 * 1000),
        revokedAt: new Date(), // Revocado
        notes: 'Revocado por el dueño',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const hasGrant = await accessGrantsService.hasActiveGrant(validPetId, externalClinicId);
      assert.strictEqual(hasGrant, false);
    });

    it('debe retornar false si no existe ningún grant entre la mascota y la clínica', async () => {
      const hasGrant = await accessGrantsService.hasActiveGrant(validPetId, 'other-clinic-99');
      assert.strictEqual(hasGrant, false);
    });

    it('revokeGrant debe registrar revokedAt y notas, invalidando el acceso inmediatamente', async () => {
      grantsDb.push({
        id: 'grant-to-revoke',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 20 * 3600 * 1000),
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      assert.strictEqual(await accessGrantsService.hasActiveGrant(validPetId, externalClinicId), true);

      const revoked = await accessGrantsService.revokeGrant('grant-to-revoke', 'Paciente dado de alta');
      assert.ok(revoked.revokedAt);
      assert.strictEqual(revoked.notes, 'Paciente dado de alta');

      assert.strictEqual(await accessGrantsService.hasActiveGrant(validPetId, externalClinicId), false);
    });

    it('revokeGrant debe lanzar NotFoundException si el grantId no existe', async () => {
      await assert.rejects(
        () => accessGrantsService.revokeGrant('non-existent-grant'),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          return true;
        },
      );
    });
  });

  describe('d) Filtrado estricto de datos de mascota sin consentimiento activo devolviendo solo datos mínimos (RF-21)', () => {
    it('debe limitar el resultado a datos de filiación censurando historia médica, notas, vacunas y dirección', () => {
      const fullPetData = {
        id: validPetId,
        name: 'Firulais',
        species: PetSpecies.CANINE,
        breed: 'Labrador',
        sex: PetSex.MALE,
        birthDate: new Date('2022-01-01'),
        color: 'Dorado',
        owner: {
          id: 'owner-1',
          name: 'Carlos',
          lastName: 'Pérez',
          phone: '+593991234567',
          email: 'carlos@perez.com',
          documentId: '0912345678',
          address: 'Av. Siempre Viva 123 y Calle Roble',
        },
        tags: [
          {
            id: 'tag-1',
            uid: '04A1B2C3',
            status: TagStatus.ACTIVE,
          },
        ],
        visits: [
          {
            id: 'visit-1',
            reason: 'Chequeo general',
            diagnosis: 'Gastritis aguda por ingesta de cuerpo extraño',
            treatment: 'Ranitidina y dieta blanda',
            weight: 24.5,
            notes: 'Paciente reservado',
          },
        ],
        vaccinations: [
          {
            id: 'vac-1',
            vaccineType: 'RABIES',
            brandName: 'Rabisin',
            batchNumber: 'LOTE-998',
          },
        ],
        attachments: [
          {
            id: 'att-1',
            filename: 'radiografia_abdomen.pdf',
          },
        ],
      };

      const filtered = accessGrantsService.filterPetDataByConsent(fullPetData, false);

      // Datos permitidos de filiación
      assert.strictEqual(filtered.id, validPetId);
      assert.strictEqual(filtered.name, 'Firulais');
      assert.strictEqual(filtered.species, PetSpecies.CANINE);
      assert.strictEqual(filtered.breed, 'Labrador');
      assert.strictEqual(filtered.sex, PetSex.MALE);
      assert.strictEqual(filtered.owner?.phone, '+593991234567');
      assert.strictEqual(filtered.ownerPhone, '+593991234567');
      assert.strictEqual(filtered.tagStatus, TagStatus.ACTIVE);

      // Censura estricta médica y de privacidad del dueño
      assert.strictEqual((filtered as any).visits, undefined);
      assert.strictEqual((filtered as any).vaccinations, undefined);
      assert.strictEqual((filtered as any).attachments, undefined);
      assert.strictEqual((filtered as any).notes, undefined);
      assert.strictEqual((filtered as any).medicalHistory, undefined);
      assert.strictEqual(filtered.owner?.address, undefined);
      assert.strictEqual(filtered.owner?.documentId, undefined);
    });
  });

  describe('e) Entrega de historial médico completo bajo consentimiento activo (RF-23)', () => {
    it('debe entregar la ficha completa incluyendo visitas, vacunas y diagnósticos cuando hasGrant === true', () => {
      const fullPetData = {
        id: validPetId,
        name: 'Firulais',
        species: PetSpecies.CANINE,
        breed: 'Labrador',
        sex: PetSex.MALE,
        owner: {
          id: 'owner-1',
          name: 'Carlos',
          lastName: 'Pérez',
          phone: '+593991234567',
        },
        visits: [
          {
            id: 'visit-1',
            reason: 'Vacunación anual',
            diagnosis: 'Sano',
          },
        ],
        vaccinations: [
          {
            id: 'vac-1',
            vaccineType: 'MULTIPLE',
          },
        ],
      };

      const result = accessGrantsService.filterPetDataByConsent(fullPetData, true);

      assert.strictEqual(result.id, validPetId);
      assert.strictEqual(result.visits.length, 1);
      assert.strictEqual(result.visits[0].reason, 'Vacunación anual');
      assert.strictEqual(result.vaccinations.length, 1);
    });
  });

  describe('f) AccessGrantGuard: permite acceso si hay grant vigente y bloquea con HTTP 403 Forbidden (RF-24, RNF-8)', () => {
    const createMockExecutionContext = (
      params: Record<string, string>,
      user?: { role?: Role; clinicId?: string },
    ): ExecutionContext => {
      const request = {
        params,
        user,
      };
      return {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as unknown as ExecutionContext;
    };

    it('debe permitir acceso cuando existe un grant activo para (petId, clinicId) usando param petId', async () => {
      grantsDb.push({
        id: 'guard-active-grant',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const context = createMockExecutionContext(
        { petId: validPetId },
        { role: Role.VET, clinicId: externalClinicId },
      );

      const canActivate = await accessGrantGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });

    it('debe permitir acceso cuando el identificador se encuentra en el parámetro id', async () => {
      grantsDb.push({
        id: 'guard-active-grant-2',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const context = createMockExecutionContext(
        { id: validPetId },
        { role: Role.VET, clinicId: externalClinicId },
      );

      const canActivate = await accessGrantGuard.canActivate(context);
      assert.strictEqual(canActivate, true);
    });

    it('debe lanzar ForbiddenException (HTTP 403) con mensaje descriptivo si no hay grant activo (RF-24, RNF-8)', async () => {
      const context = createMockExecutionContext(
        { petId: validPetId },
        { role: Role.VET, clinicId: externalClinicId },
      );

      await assert.rejects(
        () => accessGrantGuard.canActivate(context),
        (err: any) => {
          assert.ok(err instanceof ForbiddenException);
          assert.strictEqual(
            err.message,
            'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar la historia médica de este paciente',
          );
          return true;
        },
      );
    });

    it('debe lanzar ForbiddenException (HTTP 403) si el grant ha expirado', async () => {
      grantsDb.push({
        id: 'guard-expired-grant',
        petId: validPetId,
        clinicId: externalClinicId,
        source: GrantSource.NFC_TAP,
        scope: GrantScope.FULL_HISTORY,
        grantedAt: new Date(Date.now() - 30 * 3600 * 1000),
        expiresAt: new Date(Date.now() - 6 * 3600 * 1000),
        revokedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const context = createMockExecutionContext(
        { petId: validPetId },
        { role: Role.VET, clinicId: externalClinicId },
      );

      await assert.rejects(
        () => accessGrantGuard.canActivate(context),
        (err: any) => {
          assert.ok(err instanceof ForbiddenException);
          assert.strictEqual(
            err.message,
            'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar la historia médica de este paciente',
          );
          return true;
        },
      );
    });

    it('debe lanzar ForbiddenException si no se especifica petId en los parámetros de ruta', async () => {
      const context = createMockExecutionContext(
        {},
        { role: Role.VET, clinicId: externalClinicId },
      );

      await assert.rejects(
        () => accessGrantGuard.canActivate(context),
        (err: any) => {
          assert.ok(err instanceof ForbiddenException);
          assert.strictEqual(
            err.message,
            'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para consultar la historia médica de este paciente',
          );
          return true;
        },
      );
    });

    it('debe lanzar ForbiddenException si no existe usuario o clinicId en la sesión autenticada', async () => {
      const context = createMockExecutionContext({ petId: validPetId }, undefined);

      await assert.rejects(
        () => accessGrantGuard.canActivate(context),
        (err: any) => {
          assert.ok(err instanceof ForbiddenException);
          return true;
        },
      );
    });
  });
});
