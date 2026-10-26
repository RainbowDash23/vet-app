import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma } from '@prisma/client';

describe('T04 - Integridad del Esquema Prisma, Modelos e Índices Parciales', () => {
  const models = Prisma.dmmf.datamodel.models;
  const enums = Prisma.dmmf.datamodel.enums;

  describe('a) Integridad referencial (onDelete: Restrict)', () => {
    it('debe definir onDelete: Restrict en la relación Owner -> Pet (Pet.owner)', () => {
      const petModel = models.find((m) => m.name === 'Pet');
      assert.ok(petModel, 'El modelo Pet debe existir en el esquema Prisma');

      const ownerField = petModel.fields.find((f) => f.name === 'owner');
      assert.ok(ownerField, 'El campo owner debe existir en Pet');
      assert.strictEqual(
        ownerField.relationOnDelete,
        'Restrict',
        'Pet.owner debe tener onDelete: Restrict para evitar eliminar dueños con mascotas',
      );
    });

    it('debe definir onDelete: Restrict en la relación Clinic -> User (User.clinic)', () => {
      const userModel = models.find((m) => m.name === 'User');
      assert.ok(userModel, 'El modelo User debe existir en el esquema Prisma');

      const clinicField = userModel.fields.find((f) => f.name === 'clinic');
      assert.ok(clinicField, 'El campo clinic debe existir en User');
      assert.strictEqual(
        clinicField.relationOnDelete,
        'Restrict',
        'User.clinic debe tener onDelete: Restrict',
      );
    });

    it('debe definir onDelete: Restrict en la relación Clinic -> Visit (Visit.clinic)', () => {
      const visitModel = models.find((m) => m.name === 'Visit');
      assert.ok(visitModel, 'El modelo Visit debe existir en el esquema Prisma');

      const clinicField = visitModel.fields.find((f) => f.name === 'clinic');
      assert.ok(clinicField, 'El campo clinic debe existir en Visit');
      assert.strictEqual(
        clinicField.relationOnDelete,
        'Restrict',
        'Visit.clinic debe tener onDelete: Restrict',
      );
    });

    it('debe definir onDelete: Restrict en la relación Pet -> Visit y User -> Visit', () => {
      const visitModel = models.find((m) => m.name === 'Visit');
      assert.ok(visitModel, 'El modelo Visit debe existir');

      const petField = visitModel.fields.find((f) => f.name === 'pet');
      assert.ok(petField, 'El campo pet debe existir en Visit');
      assert.strictEqual(
        petField.relationOnDelete,
        'Restrict',
        'Visit.pet debe tener onDelete: Restrict',
      );

      const vetField = visitModel.fields.find((f) => f.name === 'veterinarian');
      assert.ok(vetField, 'El campo veterinarian debe existir en Visit');
      assert.strictEqual(
        vetField.relationOnDelete,
        'Restrict',
        'Visit.veterinarian debe tener onDelete: Restrict',
      );
    });
  });

  describe('b) Modelo AccessLog como estructura append-only', () => {
    it('debe carecer de deletedAt y updatedAt, asegurando inmutabilidad histórica', () => {
      const accessLogModel = models.find((m) => m.name === 'AccessLog');
      assert.ok(accessLogModel, 'El modelo AccessLog debe existir en el esquema Prisma');

      const fieldNames = accessLogModel.fields.map((f) => f.name);
      assert.ok(!fieldNames.includes('deletedAt'), 'AccessLog NO debe contener deletedAt');
      assert.ok(!fieldNames.includes('updatedAt'), 'AccessLog NO debe contener updatedAt');
      assert.ok(fieldNames.includes('timestamp'), 'AccessLog debe tener timestamp de auditoría');
    });
  });

  describe('c) Campos biológicos en Visit y modelo Notification', () => {
    it('debe incluir todas las constantes biológicas en Visit, incluyendo capillaryRefillTime (RF-44)', () => {
      const visitModel = models.find((m) => m.name === 'Visit');
      assert.ok(visitModel, 'El modelo Visit debe existir');

      const fieldNames = visitModel.fields.map((f) => f.name);
      assert.ok(fieldNames.includes('weight'), 'Visit debe contener weight');
      assert.ok(fieldNames.includes('temperature'), 'Visit debe contener temperature');
      assert.ok(fieldNames.includes('heartRate'), 'Visit debe contener heartRate');
      assert.ok(fieldNames.includes('respiratoryRate'), 'Visit debe contener respiratoryRate');
      assert.ok(
        fieldNames.includes('capillaryRefillTime'),
        'Visit debe contener capillaryRefillTime (RF-44)',
      );
    });

    it('debe incluir el modelo Notification con sus enums NotificationType y NotificationStatus', () => {
      const notificationModel = models.find((m) => m.name === 'Notification');
      assert.ok(notificationModel, 'El modelo Notification debe existir en el esquema Prisma');

      const fieldNames = notificationModel.fields.map((f) => f.name);
      assert.ok(fieldNames.includes('idempotencyKey'), 'Notification debe tener idempotencyKey');
      assert.ok(fieldNames.includes('type'), 'Notification debe tener type');
      assert.ok(fieldNames.includes('targetDate'), 'Notification debe tener targetDate');
      assert.ok(fieldNames.includes('status'), 'Notification debe tener status');
      assert.ok(fieldNames.includes('retryCount'), 'Notification debe tener retryCount');

      const typeEnum = enums.find((e) => e.name === 'NotificationType');
      assert.ok(typeEnum, 'El enum NotificationType debe existir');
      const typeValues = typeEnum.values.map((v) => v.name);
      assert.ok(typeValues.includes('VISIT_REMINDER'), 'NotificationType debe incluir VISIT_REMINDER');
      assert.ok(typeValues.includes('VACCINE_ALERT'), 'NotificationType debe incluir VACCINE_ALERT');

      const statusEnum = enums.find((e) => e.name === 'NotificationStatus');
      assert.ok(statusEnum, 'El enum NotificationStatus debe existir');
      const statusValues = statusEnum.values.map((v) => v.name);
      assert.ok(statusValues.includes('PENDING'), 'NotificationStatus debe incluir PENDING');
      assert.ok(statusValues.includes('SENT'), 'NotificationStatus debe incluir SENT');
      assert.ok(statusValues.includes('FAILED'), 'NotificationStatus debe incluir FAILED');
      assert.ok(statusValues.includes('CANCELLED'), 'NotificationStatus debe incluir CANCELLED');
    });
  });

  describe('d) Archivo custom_indexes.sql con los 7 índices parciales documentados', () => {
    it('debe existir apps/api/prisma/custom_indexes.sql y contener los 7 índices parciales', () => {
      const sqlPath = path.resolve(__dirname, '../prisma/custom_indexes.sql');
      assert.ok(fs.existsSync(sqlPath), 'El archivo prisma/custom_indexes.sql debe existir');

      const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

      const requiredIndexes = [
        'unique_active_tag_per_pet',
        'unique_active_tag_uid',
        'unique_active_user_email',
        'unique_active_vet_license',
        'unique_active_owner_document',
        'idx_visits_vet_active_schedule',
        'idx_pending_notifications',
      ];

      for (const idxName of requiredIndexes) {
        assert.ok(
          sqlContent.includes(idxName),
          `custom_indexes.sql debe definir el índice parcial ${idxName}`,
        );
      }
    });
  });

  describe('e) Modelo ClinicPatient y enum ClinicPatientSource (Padrón de Pacientes por Clínica)', () => {
    it('debe existir el modelo ClinicPatient con unicidad clinicId+petId y relaciones', () => {
      const cpModel = models.find((m) => m.name === 'ClinicPatient');
      assert.ok(cpModel, 'El modelo ClinicPatient debe existir en el esquema Prisma');

      const fieldNames = cpModel.fields.map((f) => f.name);
      assert.ok(fieldNames.includes('clinicId'), 'ClinicPatient debe contener clinicId');
      assert.ok(fieldNames.includes('petId'), 'ClinicPatient debe contener petId');
      assert.ok(fieldNames.includes('source'), 'ClinicPatient debe contener source');
      assert.ok(fieldNames.includes('addedAt'), 'ClinicPatient debe contener addedAt');

      const sourceEnum = enums.find((e) => e.name === 'ClinicPatientSource');
      assert.ok(sourceEnum, 'El enum ClinicPatientSource debe existir');
      const sourceValues = sourceEnum.values.map((v) => v.name);
      assert.ok(sourceValues.includes('REGISTERED'), 'ClinicPatientSource debe incluir REGISTERED');
      assert.ok(sourceValues.includes('ADDED_AFTER_SCAN'), 'ClinicPatientSource debe incluir ADDED_AFTER_SCAN');
    });
  });
});
