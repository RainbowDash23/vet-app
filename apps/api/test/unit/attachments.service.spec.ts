import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GrantScope, Role } from '@prisma/client';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { AttachmentsService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../../src/modules/attachments/attachments.service';
import { AttachmentsController } from '../../src/modules/attachments/attachments.controller';
import { UploadAttachmentDto } from '../../src/modules/attachments/dto/upload-attachment.dto';
import { AccessGrantsService } from '../../src/modules/pets/access-grants.service';

interface MockPet {
  id: string;
  name: string;
  deletedAt: Date | null;
}

interface MockVisit {
  id: string;
  petId: string;
  clinicId: string;
  deletedAt: Date | null;
}

interface MockAttachment {
  id: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  uploadedById: string;
  petId: string | null;
  visitId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

describe('AttachmentsService & AttachmentsController - T23 (RF-49, RF-50, RNF-8)', () => {
  let attachmentsService: AttachmentsService;
  let attachmentsController: AttachmentsController;

  const validClinicId = '11111111-1111-4111-8111-111111111111';
  const otherClinicId = '99999999-9999-4999-8999-999999999999';
  const validPetId = '22222222-2222-4222-8222-222222222222';
  const inactivePetId = '33333333-3333-4333-8333-333333333333';
  const validVisitId = '44444444-4444-4444-8444-444444444444';
  const inactiveVisitId = '55555555-5555-4555-8555-555555555555';
  const validUserId = '66666666-6666-4666-8666-666666666666';
  const attachmentId = '77777777-7777-4777-8777-777777777777';

  let mockPets: MockPet[];
  let mockVisits: MockVisit[];
  let mockAttachments: MockAttachment[];
  let mockPrisma: any;
  let mockAccessGrantsService: any;

  beforeEach(() => {
    mockPets = [
      {
        id: validPetId,
        name: 'Max',
        deletedAt: null,
      },
      {
        id: inactivePetId,
        name: 'Milo',
        deletedAt: new Date(),
      },
    ];

    mockVisits = [
      {
        id: validVisitId,
        petId: validPetId,
        clinicId: validClinicId,
        deletedAt: null,
      },
      {
        id: inactiveVisitId,
        petId: validPetId,
        clinicId: validClinicId,
        deletedAt: new Date(),
      },
    ];

    mockAttachments = [
      {
        id: attachmentId,
        filename: 'radiografia_torax.png',
        storagePath: 'uploads/attachments/77777777-7777-4777-8777-777777777777.png',
        mimeType: 'image/png',
        sizeBytes: 204800,
        description: 'Radiografía lateral de tórax',
        uploadedById: validUserId,
        petId: validPetId,
        visitId: validVisitId,
        deletedAt: null,
        createdAt: new Date('2026-10-15T10:00:00Z'),
        updatedAt: new Date('2026-10-15T10:00:00Z'),
      },
    ];

    mockPrisma = {
      pet: {
        findFirst: async ({ where }: any) => {
          return (
            mockPets.find((p) => {
              if (where.id && p.id !== where.id) return false;
              if (where.deletedAt === null && p.deletedAt !== null) return false;
              return true;
            }) || null
          );
        },
      },
      visit: {
        findFirst: async ({ where }: any) => {
          return (
            mockVisits.find((v) => {
              if (where.id && v.id !== where.id) return false;
              if (where.deletedAt === null && v.deletedAt !== null) return false;
              return true;
            }) || null
          );
        },
      },
      attachment: {
        findFirst: async ({ where, include }: any) => {
          const found = mockAttachments.find((a) => {
            if (where.id && a.id !== where.id) return false;
            if (where.deletedAt === null && a.deletedAt !== null) return false;
            if (where.petId && a.petId !== where.petId) return false;
            return true;
          });
          if (!found) return null;
          const res: any = { ...found };
          if (include?.visit && res.visitId) {
            res.visit = mockVisits.find((v) => v.id === res.visitId) || null;
          }
          if (include?.pet && res.petId) {
            res.pet = mockPets.find((p) => p.id === res.petId) || null;
          }
          return res;
        },
        findMany: async ({ where, orderBy }: any) => {
          let list = mockAttachments.filter((a) => {
            if (where?.petId && a.petId !== where.petId) return false;
            if (where?.deletedAt === null && a.deletedAt !== null) return false;
            return true;
          });
          if (orderBy?.createdAt === 'desc') {
            list = [...list].sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            );
          }
          return list;
        },
        create: async ({ data }: any) => {
          const newAtt: MockAttachment = {
            id: '88888888-8888-4888-8888-888888888888',
            filename: data.filename,
            storagePath: data.storagePath,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes,
            description: data.description ?? null,
            uploadedById: data.uploadedById,
            petId: data.petId ?? null,
            visitId: data.visitId ?? null,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockAttachments.push(newAtt);
          return newAtt;
        },
        update: async ({ where, data }: any) => {
          const index = mockAttachments.findIndex((a) => a.id === where.id);
          if (index === -1) throw new Error('Not found');
          mockAttachments[index] = {
            ...mockAttachments[index],
            ...data,
            updatedAt: new Date(),
          };
          return mockAttachments[index];
        },
      },
    };

    mockAccessGrantsService = {
      hasActiveGrant: async (petId: string, clinicId: string, scope?: GrantScope) => {
        // Por defecto, validClinicId tiene grant activo FULL_HISTORY, otherClinicId no
        if (clinicId === validClinicId && petId === validPetId) {
          return true;
        }
        return false;
      },
    };

    attachmentsService = new AttachmentsService(
      mockPrisma as any,
      mockAccessGrantsService as unknown as AccessGrantsService,
    );

    attachmentsController = new AttachmentsController(attachmentsService);
  });

  describe('1. Subida exitosa comprobando tipos MIME autorizados y límite de 10 MB (RF-49)', () => {
    it('debe definir las constantes de validación requeridas (ALLOWED_MIME_TYPES y MAX_FILE_SIZE)', () => {
      assert.deepStrictEqual(ALLOWED_MIME_TYPES, [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/dicom',
      ]);
      assert.strictEqual(MAX_FILE_SIZE, 10 * 1024 * 1024);
    });

    it('debe permitir la subida de un archivo PDF válido con petId y visitId', async () => {
      const file = {
        originalname: 'hemograma_completo.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 500, // 500 KB
      };
      const dto: UploadAttachmentDto = {
        petId: validPetId,
        visitId: validVisitId,
        description: 'Resultado de hemograma automatizado',
      };

      const result = await attachmentsService.uploadAttachment(
        validUserId,
        validClinicId,
        file,
        dto,
      );

      assert.ok(result);
      assert.strictEqual(result.filename, 'hemograma_completo.pdf');
      assert.strictEqual(result.mimeType, 'application/pdf');
      assert.strictEqual(result.sizeBytes, 1024 * 500);
      assert.strictEqual(result.uploadedById, validUserId);
      assert.strictEqual(result.petId, validPetId);
      assert.strictEqual(result.visitId, validVisitId);
      assert.strictEqual(result.description, 'Resultado de hemograma automatizado');
      assert.ok(result.storagePath.startsWith('uploads/attachments/'));
      assert.ok(result.storagePath.endsWith('.pdf'));
    });

    it('debe permitir la subida de una imagen JPEG', async () => {
      const file = {
        originalname: 'lesion_cutanea.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 1024, // 1 MB
      };
      const dto: UploadAttachmentDto = {
        petId: validPetId,
      };

      const result = await attachmentsService.uploadAttachment(
        validUserId,
        validClinicId,
        file,
        dto,
      );

      assert.ok(result);
      assert.strictEqual(result.mimeType, 'image/jpeg');
      assert.ok(result.storagePath.endsWith('.jpg') || result.storagePath.endsWith('.jpeg'));
    });

    it('debe permitir la subida de una imagen PNG', async () => {
      const file = {
        originalname: 'ecografia.png',
        mimetype: 'image/png',
        size: 2 * 1024 * 1024, // 2 MB
      };
      const dto: UploadAttachmentDto = {};

      const result = await attachmentsService.uploadAttachment(
        validUserId,
        validClinicId,
        file,
        dto,
      );

      assert.ok(result);
      assert.strictEqual(result.mimeType, 'image/png');
      assert.ok(result.storagePath.endsWith('.png'));
    });

    it('debe permitir la subida de un estudio DICOM', async () => {
      const file = {
        originalname: 'tomografia_craneo.dcm',
        mimetype: 'application/dicom',
        size: 8 * 1024 * 1024, // 8 MB
      };
      const dto: UploadAttachmentDto = {
        petId: validPetId,
      };

      const result = await attachmentsService.uploadAttachment(
        validUserId,
        validClinicId,
        file,
        dto,
      );

      assert.ok(result);
      assert.strictEqual(result.mimeType, 'application/dicom');
    });

    it('debe permitir la subida en el límite exacto de 10 MB (10485760 bytes)', async () => {
      const file = {
        originalname: 'estudio_resonancia.pdf',
        mimetype: 'application/pdf',
        size: 10 * 1024 * 1024,
      };
      const dto: UploadAttachmentDto = {};

      const result = await attachmentsService.uploadAttachment(
        validUserId,
        validClinicId,
        file,
        dto,
      );

      assert.ok(result);
      assert.strictEqual(result.sizeBytes, 10485760);
    });

    it('debe almacenar el archivo en una ruta segura fuera del directorio web público', async () => {
      const file = {
        originalname: '../../etc/passwd.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };
      const dto: UploadAttachmentDto = {};

      const result = await attachmentsService.uploadAttachment(
        validUserId,
        validClinicId,
        file,
        dto,
      );

      // La ruta de almacenamiento debe estar contenida en uploads/attachments/ y usar un UUID seguro
      assert.ok(result.storagePath.startsWith('uploads/attachments/'));
      assert.ok(!result.storagePath.includes('..'));
      assert.ok(!result.storagePath.includes('passwd'));
    });

    it('debe lanzar NotFoundException si el petId suministrado no existe', async () => {
      const file = {
        originalname: 'analisis.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };
      const dto: UploadAttachmentDto = {
        petId: '00000000-0000-4000-8000-000000000000',
      };

      await assert.rejects(
        () => attachmentsService.uploadAttachment(validUserId, validClinicId, file, dto),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada o inactiva');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si la mascota está inactiva (deletedAt no es null)', async () => {
      const file = {
        originalname: 'analisis.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };
      const dto: UploadAttachmentDto = {
        petId: inactivePetId,
      };

      await assert.rejects(
        () => attachmentsService.uploadAttachment(validUserId, validClinicId, file, dto),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Mascota no encontrada o inactiva');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si el visitId suministrado no existe', async () => {
      const file = {
        originalname: 'analisis.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };
      const dto: UploadAttachmentDto = {
        visitId: '00000000-0000-4000-8000-000000000000',
      };

      await assert.rejects(
        () => attachmentsService.uploadAttachment(validUserId, validClinicId, file, dto),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Visita no encontrada o inactiva');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si la visita está inactiva (deletedAt no es null)', async () => {
      const file = {
        originalname: 'analisis.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };
      const dto: UploadAttachmentDto = {
        visitId: inactiveVisitId,
      };

      await assert.rejects(
        () => attachmentsService.uploadAttachment(validUserId, validClinicId, file, dto),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Visita no encontrada o inactiva');
          return true;
        },
      );
    });
  });

  describe('2. Rechazo con HTTP 400 Bad Request ante tipos MIME no autorizados (RF-49)', () => {
    it('debe rechazar archivos de texto plano text/plain con HTTP 400 Bad Request', () => {
      assert.throws(
        () =>
          attachmentsService.validateFile({
            mimetype: 'text/plain',
            size: 1024,
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.strictEqual(
            err.message,
            'Tipo de archivo no permitido. Solo se aceptan PDF, JPEG, PNG y DICOM',
          );
          return true;
        },
      );
    });

    it('debe rechazar scripts application/javascript con HTTP 400 Bad Request', () => {
      assert.throws(
        () =>
          attachmentsService.validateFile({
            mimetype: 'application/javascript',
            size: 1024,
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.strictEqual(
            err.message,
            'Tipo de archivo no permitido. Solo se aceptan PDF, JPEG, PNG y DICOM',
          );
          return true;
        },
      );
    });

    it('debe rechazar ejecutables application/x-msdownload con HTTP 400 Bad Request', () => {
      assert.throws(
        () =>
          attachmentsService.validateFile({
            mimetype: 'application/x-msdownload',
            size: 1024,
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          return true;
        },
      );
    });

    it('debe rechazar application/octet-stream genérico con HTTP 400 Bad Request', () => {
      assert.throws(
        () =>
          attachmentsService.validateFile({
            mimetype: 'application/octet-stream',
            size: 1024,
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          return true;
        },
      );
    });
  });

  describe('3. Rechazo con HTTP 400 Bad Request ante archivos que superen los 10 MB (RF-49)', () => {
    it('debe rechazar archivo de 10 MB + 1 byte con mensaje descriptivo', () => {
      assert.throws(
        () =>
          attachmentsService.validateFile({
            mimetype: 'application/pdf',
            size: 10 * 1024 * 1024 + 1,
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.strictEqual(
            err.message,
            'El archivo excede el tamaño máximo permitido de 10 MB',
          );
          return true;
        },
      );
    });

    it('debe rechazar archivo de 15 MB con HTTP 400 Bad Request', () => {
      assert.throws(
        () =>
          attachmentsService.validateFile({
            mimetype: 'image/png',
            size: 15 * 1024 * 1024,
          }),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.strictEqual(
            err.message,
            'El archivo excede el tamaño máximo permitido de 10 MB',
          );
          return true;
        },
      );
    });
  });

  describe('4. Descarga autorizada condicionada a la vigencia de un AccessGrant a favor de la clínica solicitante (RF-50)', () => {
    it('debe permitir la descarga si la clínica tiene AccessGrant activo para la mascota', async () => {
      const result = await attachmentsService.getAttachmentForDownload(
        attachmentId,
        validClinicId,
      );

      assert.ok(result);
      assert.strictEqual(result.id, attachmentId);
      assert.strictEqual(result.filename, 'radiografia_torax.png');
    });

    it('debe permitir la descarga directa si el adjunto no tiene petId asociado', async () => {
      const generalAttachment: MockAttachment = {
        id: '99999999-8888-4999-8888-777777777777',
        filename: 'protocolo_general.pdf',
        storagePath: 'uploads/attachments/protocolo.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        description: 'Protocolo clínico',
        uploadedById: validUserId,
        petId: null,
        visitId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockAttachments.push(generalAttachment);

      const result = await attachmentsService.getAttachmentForDownload(
        generalAttachment.id,
        otherClinicId,
      );

      assert.ok(result);
      assert.strictEqual(result.id, generalAttachment.id);
    });

    it('debe lanzar NotFoundException si el archivo adjunto no existe', async () => {
      await assert.rejects(
        () =>
          attachmentsService.getAttachmentForDownload(
            '00000000-0000-4000-8000-000000000000',
            validClinicId,
          ),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Archivo adjunto no encontrado');
          return true;
        },
      );
    });

    it('debe lanzar NotFoundException si el archivo adjunto fue borrado lógicamente (deletedAt no es null)', async () => {
      mockAttachments[0].deletedAt = new Date();

      await assert.rejects(
        () =>
          attachmentsService.getAttachmentForDownload(
            attachmentId,
            validClinicId,
          ),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Archivo adjunto no encontrado');
          return true;
        },
      );
    });
  });

  describe('5. Bloqueo determinista con HTTP 403 Forbidden en ausencia de consentimiento activo o grant vencido (RF-50, RNF-8)', () => {
    it('debe lanzar ForbiddenException (HTTP 403) con mensaje descriptivo si no hay grant activo para la clínica', async () => {
      await assert.rejects(
        () =>
          attachmentsService.getAttachmentForDownload(
            attachmentId,
            otherClinicId,
          ),
        (err: any) => {
          assert.ok(err instanceof ForbiddenException);
          assert.strictEqual(
            err.message,
            'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para acceder a los archivos clínicos de este paciente',
          );
          return true;
        },
      );
    });

    it('findByPetId: debe permitir listar adjuntos activos si hay AccessGrant activo', async () => {
      const results = await attachmentsService.findByPetId(
        validPetId,
        validClinicId,
      );

      assert.ok(Array.isArray(results));
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].petId, validPetId);
    });

    it('findByPetId: debe rechazar con HTTP 403 Forbidden si no hay grant activo', async () => {
      await assert.rejects(
        () => attachmentsService.findByPetId(validPetId, otherClinicId),
        (err: any) => {
          assert.ok(err instanceof ForbiddenException);
          assert.strictEqual(
            err.message,
            'Acceso denegado: se requiere un consentimiento (AccessGrant) activo para acceder a los archivos clínicos de este paciente',
          );
          return true;
        },
      );
    });

    it('softDelete: debe marcar deletedAt con fecha actual para un adjunto activo', async () => {
      const deleted = await attachmentsService.softDelete(
        attachmentId,
        validUserId,
        validClinicId,
      );

      assert.ok(deleted);
      assert.ok(deleted.deletedAt !== null);

      // Comprobamos que findFirst ya no lo encuentra
      const after = await mockPrisma.attachment.findFirst({
        where: { id: attachmentId, deletedAt: null },
      });
      assert.strictEqual(after, null);
    });

    it('softDelete: debe lanzar NotFoundException si el adjunto no existe o ya está borrado', async () => {
      await assert.rejects(
        () =>
          attachmentsService.softDelete(
            '00000000-0000-4000-8000-000000000000',
            validUserId,
            validClinicId,
          ),
        (err: any) => {
          assert.ok(err instanceof NotFoundException);
          assert.strictEqual(err.message, 'Archivo adjunto no encontrado');
          return true;
        },
      );
    });
  });

  describe('6. AttachmentsController: roles RBAC y delegación adecuada', () => {
    it('POST /attachments debe requerir roles VET y ADMIN y delegar en attachmentsService.uploadAttachment', async () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttachmentsController.prototype.upload);
      assert.deepStrictEqual(roles, [Role.VET, Role.ADMIN]);

      const req: any = {
        user: { id: validUserId, clinicId: validClinicId },
      };
      const file = {
        originalname: 'informe.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      };
      const dto: UploadAttachmentDto = { petId: validPetId };

      const res = await attachmentsController.upload(validClinicId, req, file, dto);
      assert.ok(res);
      assert.strictEqual(res.filename, 'informe.pdf');
    });

    it('POST /attachments debe lanzar BadRequestException si no se adjunta ningún archivo', async () => {
      const req: any = {
        user: { id: validUserId, clinicId: validClinicId },
      };
      const dto: UploadAttachmentDto = {};

      await assert.rejects(
        () => attachmentsController.upload(validClinicId, req, null as any, dto),
        (err: any) => {
          assert.ok(err instanceof BadRequestException);
          assert.strictEqual(err.message, 'Debe proporcionar un archivo para adjuntar');
          return true;
        },
      );
    });

    it('GET /attachments/:id/download debe delegar a getAttachmentForDownload', async () => {
      const res = await attachmentsController.download(validClinicId, attachmentId);
      assert.ok(res);
      assert.strictEqual(res.id, attachmentId);
    });

    it('GET /attachments/pet/:petId debe requerir roles VET y ADMIN y delegar a findByPetId', async () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttachmentsController.prototype.findByPetId);
      assert.deepStrictEqual(roles, [Role.VET, Role.ADMIN]);

      const res = await attachmentsController.findByPetId(validClinicId, validPetId);
      assert.ok(Array.isArray(res));
      assert.strictEqual(res.length, 1);
    });

    it('DELETE /attachments/:id debe requerir roles VET y ADMIN y delegar a softDelete', async () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AttachmentsController.prototype.remove);
      assert.deepStrictEqual(roles, [Role.VET, Role.ADMIN]);

      const req: any = {
        user: { id: validUserId, clinicId: validClinicId },
      };
      const res = await attachmentsController.remove(validClinicId, req, attachmentId);
      assert.ok(res);
      assert.ok(res.deletedAt !== null);
    });
  });

  describe('7. Validación de DTO con class-validator (UploadAttachmentDto)', () => {
    it('debe ser válido con todos los atributos opcionales correctos', async () => {
      const dto = plainToInstance(UploadAttachmentDto, {
        petId: validPetId,
        visitId: validVisitId,
        description: 'Adjunto de prueba clínica',
      });
      const errors = await validate(dto as object);
      assert.strictEqual(errors.length, 0);
    });

    it('debe ser válido con un objeto vacío (todos los campos son opcionales)', async () => {
      const dto = plainToInstance(UploadAttachmentDto, {});
      const errors = await validate(dto as object);
      assert.strictEqual(errors.length, 0);
    });

    it('debe fallar si petId no es un UUID v4', async () => {
      const dto = plainToInstance(UploadAttachmentDto, {
        petId: 'id-invalido',
      });
      const errors = await validate(dto as object);
      assert.ok(errors.length > 0);
      assert.ok(errors.some((e) => e.property === 'petId'));
    });

    it('debe fallar si visitId no es un UUID v4', async () => {
      const dto = plainToInstance(UploadAttachmentDto, {
        visitId: 'id-invalido',
      });
      const errors = await validate(dto as object);
      assert.ok(errors.length > 0);
      assert.ok(errors.some((e) => e.property === 'visitId'));
    });

    it('debe fallar si description excede los 255 caracteres', async () => {
      const dto = plainToInstance(UploadAttachmentDto, {
        description: 'A'.repeat(256),
      });
      const errors = await validate(dto as object);
      assert.ok(errors.length > 0);
      assert.ok(errors.some((e) => e.property === 'description'));
    });
  });
});
