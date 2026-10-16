import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('[Seed] Iniciando siembra de datos de prueba...');

  // 1. Crear clínica inicial
  const clinic = await prisma.clinic.upsert({
    where: { code: 'CLINIC-01' },
    update: {},
    create: {
      name: 'Clínica Veterinaria Central',
      code: 'CLINIC-01',
      phone: '+1234567890',
      email: 'contacto@vetcentral.com',
      address: 'Av. Principal 123',
    },
  });

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 2. Crear usuario ADMIN
  await prisma.user.upsert({
    where: { email: 'admin@vetapp.com' },
    update: {},
    create: {
      email: 'admin@vetapp.com',
      name: 'Dr. Administrador',
      password: passwordHash,
      role: Role.ADMIN,
      clinicId: clinic.id,
      phone: '+1234567891',
    },
  });

  // 3. Crear usuario VET
  await prisma.user.upsert({
    where: { email: 'vet@vetapp.com' },
    update: {},
    create: {
      email: 'vet@vetapp.com',
      name: 'Dra. Veterinaria Colegiada',
      password: passwordHash,
      role: Role.VET,
      clinicId: clinic.id,
      licenseNumber: 'VET-98765',
      phone: '+1234567892',
    },
  });

  // 4. Crear usuario RECEPTION
  await prisma.user.upsert({
    where: { email: 'reception@vetapp.com' },
    update: {},
    create: {
      email: 'reception@vetapp.com',
      name: 'Recepcionista Turno Día',
      password: passwordHash,
      role: Role.RECEPTION,
      clinicId: clinic.id,
      phone: '+1234567893',
    },
  });

  console.log('[Seed] Datos de prueba creados con éxito:');
  console.log(' - admin@vetapp.com (Role: ADMIN, Clave: Password123!)');
  console.log(' - vet@vetapp.com (Role: VET, Clave: Password123!)');
  console.log(' - reception@vetapp.com (Role: RECEPTION, Clave: Password123!)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
