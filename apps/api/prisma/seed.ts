import { PrismaClient, Role, Clinic, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export interface SeedClinicData {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
}

export interface SeedUserData {
  email: string;
  name: string;
  role: Role;
  clinicCode: string;
  phone?: string;
  licenseNumber?: string;
}

export const DEFAULT_SEED_PASSWORD = 'Password123!';
export const BCRYPT_ROUNDS = 12;

export const SEED_CLINICS: ReadonlyArray<SeedClinicData> = [
  {
    name: 'Clínica Veterinaria Central',
    code: 'CLINIC-01',
    address: 'Av. Principal 123',
    phone: '+1234567890',
    email: 'contacto@vetcentral.com',
  },
  {
    name: 'Hospital Veterinario 24 Horas',
    code: 'CLINIC-02',
    address: 'Calle Secundaria 456',
    phone: '+1234567899',
    email: 'urgencias@hospitalvet24.com',
  },
];

export const SEED_USERS: ReadonlyArray<SeedUserData> = [
  {
    email: 'admin@vetapp.com',
    name: 'Dr. Administrador Central',
    role: Role.ADMIN,
    clinicCode: 'CLINIC-01',
    phone: '+1234567891',
  },
  {
    email: 'vet@vetapp.com',
    name: 'Dra. Veterinaria Colegiada',
    role: Role.VET,
    clinicCode: 'CLINIC-01',
    licenseNumber: 'VET-98765',
    phone: '+1234567892',
  },
  {
    email: 'reception@vetapp.com',
    name: 'Recepcionista Turno Día',
    role: Role.RECEPTION,
    clinicCode: 'CLINIC-01',
    phone: '+1234567893',
  },
  {
    email: 'vet2@hospitalvet24.com',
    name: 'Dr. Veterinario Urgencias',
    role: Role.VET,
    clinicCode: 'CLINIC-02',
    licenseNumber: 'VET-11223',
    phone: '+1234567894',
  },
];

/**
 * Función principal de siembra de base de datos con clínicas y usuarios RBAC.
 * Diseñada para ser idempotente: puede ejecutarse múltiples veces sin producir duplicados
 * ni errores de clave foránea o unicidad.
 */
export async function seedDatabase(
  client?: PrismaClient,
): Promise<{ clinics: Clinic[]; users: User[] }> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'La siembra de datos de prueba está estrictamente deshabilitada en entorno de producción',
    );
  }

  const prisma = client ?? new PrismaClient();
  const seedPassword = process.env.SEED_DEFAULT_PASSWORD || DEFAULT_SEED_PASSWORD;
  const passwordHash = await bcrypt.hash(seedPassword, BCRYPT_ROUNDS);

  const clinicsMap = new Map<string, Clinic>();
  const createdClinics: Clinic[] = [];

  for (const clinicData of SEED_CLINICS) {
    const clinic = await prisma.clinic.upsert({
      where: { code: clinicData.code },
      update: {
        name: clinicData.name,
        address: clinicData.address,
        phone: clinicData.phone,
        email: clinicData.email,
        isActive: true,
      },
      create: {
        name: clinicData.name,
        code: clinicData.code,
        address: clinicData.address,
        phone: clinicData.phone,
        email: clinicData.email,
        isActive: true,
      },
    });
    clinicsMap.set(clinicData.code, clinic);
    createdClinics.push(clinic);
  }

  const createdUsers: User[] = [];

  for (const userData of SEED_USERS) {
    const clinic = clinicsMap.get(userData.clinicCode);
    if (!clinic) {
      throw new Error(
        `Clínica con código ${userData.clinicCode} no encontrada para el usuario ${userData.email}`,
      );
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: userData.email,
        deletedAt: null,
      },
    });

    if (existingUser) {
      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: userData.name,
          role: userData.role,
          clinicId: clinic.id,
          phone: userData.phone,
          licenseNumber: userData.licenseNumber ?? null,
          password: passwordHash,
          isActive: true,
        },
      });
      createdUsers.push(updated);
    } else {
      const created = await prisma.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          password: passwordHash,
          role: userData.role,
          clinicId: clinic.id,
          phone: userData.phone,
          licenseNumber: userData.licenseNumber ?? null,
          isActive: true,
        },
      });
      createdUsers.push(created);
    }
  }

  return { clinics: createdClinics, users: createdUsers };
}

async function main(): Promise<void> {
  console.log('[Seed] Iniciando siembra de datos de prueba...');
  const prisma = new PrismaClient();
  try {
    const result = await seedDatabase(prisma);
    console.log(
      `[Seed] ${result.clinics.length} clínicas y ${result.users.length} usuarios sembrados con éxito:`,
    );
    for (const user of result.users) {
      console.log(
        ` - ${user.email} (Role: ${user.role}, Cédula: ${user.licenseNumber ?? 'N/A'}, Clínica: ${user.clinicId})`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error('[Seed] Error durante la siembra:', e);
    process.exit(1);
  });
}
