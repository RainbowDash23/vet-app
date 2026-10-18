import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';
import {
  AccessAction,
  GrantScope,
  GrantSource,
  Role,
  TagStatus,
  VisitStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { PaginationInterceptor } from '../src/common/interceptors/pagination.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const supertest = require('supertest');
export const request: any = supertest;

export interface InMemoryDb {
  clinics: any[];
  users: any[];
  refreshTokens: any[];
  owners: any[];
  pets: any[];
  tags: any[];
  accessGrants: any[];
  accessLogs: any[];
  visits: any[];
  visitNotes: any[];
}

export const SEED_PASSWORDS = {
  admin: 'AdminSecurePass123!',
  vet: 'VetSecurePass123!',
  reception: 'ReceptionPass123!',
  vetB: 'VetBSecurePass123!',
};

export const CLINIC_A_ID = '11111111-aaaa-4111-8111-111111111111';
export const CLINIC_B_ID = '22222222-bbbb-4222-8222-222222222222';

export const USER_ADMIN_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const USER_VET_A_ID = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
export const USER_RECEPTION_A_ID = 'cccccccc-1111-4111-8111-cccccccccccc';
export const USER_VET_B_ID = 'dddddddd-2222-4222-8222-dddddddddddd';

export const OWNER_1_ID = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
export const PET_1_ID = 'ffffffff-1111-4111-8111-ffffffffffff';
export const TAG_1_UID = '04A1B2C3D4E5';
export const TAG_1_PUBLIC_CODE = '33333333-3333-4333-8333-333333333333';

export async function createInitialDb(): Promise<InMemoryDb> {
  const adminHash = await bcrypt.hash(SEED_PASSWORDS.admin, 10);
  const vetHash = await bcrypt.hash(SEED_PASSWORDS.vet, 10);
  const receptionHash = await bcrypt.hash(SEED_PASSWORDS.reception, 10);
  const vetBHash = await bcrypt.hash(SEED_PASSWORDS.vetB, 10);

  const clinics = [
    {
      id: CLINIC_A_ID,
      name: 'Clínica Veterinaria Central',
      code: 'CLINIC-01',
      address: 'Av. Principal 123',
      phone: '+1234567890',
      email: 'contacto@vetcentral.com',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: CLINIC_B_ID,
      name: 'Hospital Veterinario 24 Horas',
      code: 'CLINIC-02',
      address: 'Calle Secundaria 456',
      phone: '+1234567899',
      email: 'urgencias@hospitalvet24.com',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const users = [
    {
      id: USER_ADMIN_ID,
      email: 'admin@vetapp.com',
      password: adminHash,
      name: 'Dra. María González',
      role: Role.ADMIN,
      clinicId: CLINIC_A_ID,
      licenseNumber: null,
      phone: '+1234567891',
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: USER_VET_A_ID,
      email: 'vet@vetapp.com',
      password: vetHash,
      name: 'Dr. Alejandro Morales',
      role: Role.VET,
      clinicId: CLINIC_A_ID,
      licenseNumber: 'VET-98765',
      phone: '+1234567892',
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: USER_RECEPTION_A_ID,
      email: 'reception@vetapp.com',
      password: receptionHash,
      name: 'Carlos Ruiz',
      role: Role.RECEPTION,
      clinicId: CLINIC_A_ID,
      licenseNumber: null,
      phone: '+1234567893',
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: USER_VET_B_ID,
      email: 'vet2@vetapp.com',
      password: vetBHash,
      name: 'Dra. Elena Ortiz',
      role: Role.VET,
      clinicId: CLINIC_B_ID,
      licenseNumber: 'VET-54321',
      phone: '+1234567894',
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const owners = [
    {
      id: OWNER_1_ID,
      documentId: 'DOC123456',
      name: 'Carlos',
      lastName: 'Mendoza',
      phone: '+593991234567',
      email: 'carlos.mendoza@email.com',
      address: 'Calle Secreta 789',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const pets = [
    {
      id: PET_1_ID,
      name: 'Max',
      species: 'CANINE',
      breed: 'Golden Retriever',
      birthDate: new Date('2020-05-10'),
      reproductiveStatus: 'INTACT',
      sex: 'MALE',
      ownerId: OWNER_1_ID,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const tags = [
    {
      id: 'tag-1111-4111-8111-111111111111',
      uid: TAG_1_UID,
      publicCode: TAG_1_PUBLIC_CODE,
      status: TagStatus.ACTIVE,
      petId: PET_1_ID,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  return {
    clinics,
    users,
    refreshTokens: [],
    owners,
    pets,
    tags,
    accessGrants: [],
    accessLogs: [],
    visits: [],
    visitNotes: [],
  };
}

function matchCriteria(item: any, where: any): boolean {
  if (!where) return true;

  for (const key of Object.keys(where)) {
    const condition = where[key];

    if (condition === undefined) continue;

    if (key === 'OR' && Array.isArray(condition)) {
      const orMatched = condition.some((subWhere: any) => matchCriteria(item, subWhere));
      if (!orMatched) return false;
      continue;
    }

    if (key === 'AND' && Array.isArray(condition)) {
      const andMatched = condition.every((subWhere: any) => matchCriteria(item, subWhere));
      if (!andMatched) return false;
      continue;
    }

    if (condition === null) {
      if (item[key] !== null) return false;
      continue;
    }

    if (typeof condition === 'object' && condition !== null) {
      if (condition instanceof Date) {
        const itemDate = item[key] instanceof Date ? item[key] : new Date(item[key]);
        if (itemDate.getTime() !== condition.getTime()) return false;
        continue;
      }

      if ('gt' in condition) {
        const itemVal = item[key] instanceof Date ? item[key].getTime() : item[key];
        const condVal = condition.gt instanceof Date ? condition.gt.getTime() : condition.gt;
        if (!(itemVal > condVal)) return false;
      }
      if ('gte' in condition) {
        const itemVal = item[key] instanceof Date ? item[key].getTime() : item[key];
        const condVal = condition.gte instanceof Date ? condition.gte.getTime() : condition.gte;
        if (!(itemVal >= condVal)) return false;
      }
      if ('lt' in condition) {
        const itemVal = item[key] instanceof Date ? item[key].getTime() : item[key];
        const condVal = condition.lt instanceof Date ? condition.lt.getTime() : condition.lt;
        if (!(itemVal < condVal)) return false;
      }
      if ('lte' in condition) {
        const itemVal = item[key] instanceof Date ? item[key].getTime() : item[key];
        const condVal = condition.lte instanceof Date ? condition.lte.getTime() : condition.lte;
        if (!(itemVal <= condVal)) return false;
      }
      if ('in' in condition && Array.isArray(condition.in)) {
        if (!condition.in.includes(item[key])) return false;
      }
      if ('notIn' in condition && Array.isArray(condition.notIn)) {
        if (condition.notIn.includes(item[key])) return false;
      }
      if ('not' in condition) {
        if (item[key] === condition.not) return false;
      }
      continue;
    }

    if (item[key] !== condition) {
      return false;
    }
  }

  return true;
}

function applyOrderAndPagination(items: any[], orderBy: any, skip?: number, take?: number): any[] {
  let result = [...items];

  if (orderBy) {
    const keys = Object.keys(orderBy);
    if (keys.length > 0) {
      const orderKey = keys[0];
      const direction = orderBy[orderKey] === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const valA = a[orderKey];
        const valB = b[orderKey];
        if (valA instanceof Date && valB instanceof Date) {
          return (valA.getTime() - valB.getTime()) * direction;
        }
        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;
        return 0;
      });
    }
  }

  if (skip !== undefined && skip > 0) {
    result = result.slice(skip);
  }
  if (take !== undefined && take >= 0) {
    result = result.slice(0, take);
  }

  return result;
}

export function createMockPrismaService(db: InMemoryDb): any {
  const enrichItem = (item: any, table: string, include?: any, select?: any): any => {
    if (!item) return null;
    let enriched = { ...item };

    if (include) {
      if (table === 'users' && include.clinic) {
        enriched.clinic = db.clinics.find((c) => c.id === item.clinicId) || null;
      }
      if (table === 'refreshTokens' && include.user) {
        enriched.user = db.users.find((u) => u.id === item.userId) || null;
      }
      if (table === 'pets') {
        if (include.owner) {
          enriched.owner = db.owners.find((o) => o.id === item.ownerId) || null;
        }
        if (include.tags) {
          enriched.tags = db.tags.filter((t) => t.petId === item.id && t.deletedAt === null);
        }
        if (include.visits) {
          const v = db.visits
            .filter((v) => v.petId === item.id && v.deletedAt === null)
            .map((vis) => {
              if (include.visits.include?.clinic) {
                return { ...vis, clinic: db.clinics.find((c) => c.id === vis.clinicId) };
              }
              return vis;
            });
          enriched.visits = v;
        }
        if (include.accessGrants) {
          const g = db.accessGrants
            .filter((ag) => ag.petId === item.id)
            .map((gr) => {
              if (include.accessGrants.include?.clinic) {
                return { ...gr, clinic: db.clinics.find((c) => c.id === gr.clinicId) };
              }
              return gr;
            });
          enriched.accessGrants = g;
        }
      }
      if (table === 'tags') {
        if (include.pet) {
          const pet = db.pets.find((p) => p.id === item.petId);
          if (pet) {
            let petObj: any = { ...pet };
            if (include.pet.include?.owner) {
              petObj.owner = db.owners.find((o) => o.id === pet.ownerId) || null;
            }
            if (include.pet.include?.visits) {
              const visits = db.visits
                .filter((v) => v.petId === pet.id && v.deletedAt === null)
                .map((v) => {
                  if (include.pet.include.visits.include?.clinic) {
                    return { ...v, clinic: db.clinics.find((c) => c.id === v.clinicId) };
                  }
                  return v;
                });
              petObj.visits = visits;
            }
            if (include.pet.include?.accessGrants) {
              const grants = db.accessGrants
                .filter((ag) => ag.petId === pet.id)
                .map((ag) => {
                  if (include.pet.include.accessGrants.include?.clinic) {
                    return { ...ag, clinic: db.clinics.find((c) => c.id === ag.clinicId) };
                  }
                  return ag;
                });
              petObj.accessGrants = grants;
            }
            enriched.pet = petObj;
          } else {
            enriched.pet = null;
          }
        }
      }
      if (table === 'visits') {
        if (include.pet) {
          enriched.pet = db.pets.find((p) => p.id === item.petId) || null;
        }
        if (include.veterinarian) {
          const vet = db.users.find((u) => u.id === item.vetId);
          if (vet && include.veterinarian.select) {
            const selected: any = {};
            for (const key of Object.keys(include.veterinarian.select)) {
              if (include.veterinarian.select[key]) {
                selected[key] = (vet as any)[key];
              }
            }
            enriched.veterinarian = selected;
          } else {
            enriched.veterinarian = vet || null;
          }
        }
        if (include.clinic) {
          enriched.clinic = db.clinics.find((c) => c.id === item.clinicId) || null;
        }
        if (include.notesHistory) {
          enriched.notesHistory = db.visitNotes.filter((n) => n.visitId === item.id);
        }
      }
    }

    if (select) {
      const selected: any = {};
      for (const key of Object.keys(select)) {
        if (select[key]) {
          selected[key] = (enriched as any)[key];
        }
      }
      return selected;
    }

    return enriched;
  };

  const createTableOps = (tableKey: keyof InMemoryDb, tableName: string) => ({
    findFirst: async (args: any = {}) => {
      const list = db[tableKey];
      const match = list.find((item: any) => matchCriteria(item, args.where));
      return match ? enrichItem(match, tableName, args.include, args.select) : null;
    },
    findUnique: async (args: any = {}) => {
      const list = db[tableKey];
      const match = list.find((item: any) => matchCriteria(item, args.where));
      return match ? enrichItem(match, tableName, args.include, args.select) : null;
    },
    findMany: async (args: any = {}) => {
      const list = db[tableKey];
      const matches = list.filter((item: any) => matchCriteria(item, args.where));
      const sortedAndPaginated = applyOrderAndPagination(
        matches,
        args.orderBy,
        args.skip,
        args.take,
      );
      return sortedAndPaginated.map((item) =>
        enrichItem(item, tableName, args.include, args.select),
      );
    },
    count: async (args: any = {}) => {
      const list = db[tableKey];
      const matches = list.filter((item: any) => matchCriteria(item, args.where));
      return matches.length;
    },
    create: async (args: any = {}) => {
      const newItem = {
        id: args.data.id || crypto.randomUUID(),
        deletedAt: args.data.deletedAt !== undefined ? args.data.deletedAt : null,
        revokedAt: args.data.revokedAt !== undefined ? args.data.revokedAt : null,
        closedAt: args.data.closedAt !== undefined ? args.data.closedAt : null,
        ...args.data,
        createdAt: args.data.createdAt || new Date(),
        updatedAt: args.data.updatedAt || new Date(),
      };
      db[tableKey].push(newItem);
      return enrichItem(newItem, tableName, args.include, args.select);
    },
    update: async (args: any = {}) => {
      const list = db[tableKey];
      const index = list.findIndex((item: any) => matchCriteria(item, args.where));
      if (index === -1) {
        throw new Error(`Record to update not found in ${tableName}`);
      }
      const updated = {
        ...list[index],
        ...args.data,
        updatedAt: new Date(),
      };
      list[index] = updated;
      return enrichItem(updated, tableName, args.include, args.select);
    },
    updateMany: async (args: any = {}) => {
      const list = db[tableKey];
      let count = 0;
      for (let i = 0; i < list.length; i++) {
        if (matchCriteria(list[i], args.where)) {
          list[i] = {
            ...list[i],
            ...args.data,
            updatedAt: new Date(),
          };
          count++;
        }
      }
      return { count };
    },
    deleteMany: async (args: any = {}) => {
      const list = db[tableKey];
      const initialLength = list.length;
      db[tableKey] = list.filter((item: any) => !matchCriteria(item, args.where));
      return { count: initialLength - db[tableKey].length };
    },
  });

  const mockPrisma: any = {
    clinic: createTableOps('clinics', 'clinics'),
    user: createTableOps('users', 'users'),
    refreshToken: createTableOps('refreshTokens', 'refreshTokens'),
    owner: createTableOps('owners', 'owners'),
    pet: createTableOps('pets', 'pets'),
    tag: createTableOps('tags', 'tags'),
    accessGrant: createTableOps('accessGrants', 'accessGrants'),
    accessLog: {
      create: async (args: any = {}) => {
        const newLog = {
          id: args.data.id || crypto.randomUUID(),
          ...args.data,
          timestamp: args.data.timestamp || new Date(),
        };
        db.accessLogs.push(newLog);
        return newLog;
      },
      findMany: async (args: any = {}) => {
        const matches = db.accessLogs.filter((item: any) => matchCriteria(item, args.where));
        return applyOrderAndPagination(matches, args.orderBy, args.skip, args.take);
      },
      count: async (args: any = {}) => {
        return db.accessLogs.filter((item: any) => matchCriteria(item, args.where)).length;
      },
    },
    visit: createTableOps('visits', 'visits'),
    visitNote: createTableOps('visitNotes', 'visitNotes'),
    $transaction: async (arg: any) => {
      if (typeof arg === 'function') {
        return await arg(mockPrisma);
      }
      if (Array.isArray(arg)) {
        return await Promise.all(arg);
      }
      return arg;
    },
    $connect: async () => {},
    $disconnect: async () => {},
  };

  return mockPrisma;
}

export async function createTestApp(customDb?: InMemoryDb): Promise<{
  app: INestApplication;
  db: InMemoryDb;
  prisma: any;
}> {
  const db = customDb || (await createInitialDb());
  const mockPrisma = createMockPrismaService(db);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrisma)
    .compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new PaginationInterceptor());

  await app.init();

  return { app, db, prisma: mockPrisma };
}
