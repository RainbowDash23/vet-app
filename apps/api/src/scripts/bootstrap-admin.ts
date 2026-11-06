import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export interface BootstrapAdminParams {
  email?: string;
  password?: string;
  clinicName?: string;
  clinicCode?: string;
}

export interface BootstrapAdminResult {
  clinicId: string;
  userId: string;
  created: boolean;
}

export const BCRYPT_ROUNDS = 12;

/**
 * Script de inicialización segura para el primer administrador en producción (RF-71).
 *
 * Reglas de negocio:
 * 1. Lee credenciales de variables de entorno o parámetros explícitos.
 * 2. Valida longitud mínima de 12 caracteres para la contraseña.
 * 3. Es idempotente: si el usuario ya existe y es el único en el sistema, no falla ni duplica.
 * 4. Se niega a ejecutarse si ya existen otros usuarios en la base de datos.
 * 5. Cifra la contraseña con bcrypt a 12 rondas.
 * 6. NUNCA imprime la contraseña en logs o consola.
 */
export async function bootstrapAdmin(
  client?: PrismaClient,
  params?: BootstrapAdminParams,
): Promise<BootstrapAdminResult> {
  const prisma = client ?? new PrismaClient();

  const email = (params?.email ?? process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = params?.password ?? process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const clinicName = (params?.clinicName ?? process.env.BOOTSTRAP_CLINIC_NAME ?? '').trim();
  const clinicCode = (params?.clinicCode ?? process.env.BOOTSTRAP_CLINIC_CODE ?? '').trim();

  if (!email || !password || !clinicName || !clinicCode) {
    throw new Error(
      '[Bootstrap Error] Faltan variables requeridas: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_CLINIC_NAME y BOOTSTRAP_CLINIC_CODE deben estar definidas.',
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('[Bootstrap Error] BOOTSTRAP_ADMIN_EMAIL debe ser una dirección de correo válida.');
  }

  if (password.length < 12) {
    throw new Error('[Bootstrap Error] BOOTSTRAP_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
  }

  const existingUsersCount = await prisma.user.count({
    where: { deletedAt: null },
  });

  if (existingUsersCount > 0) {
    const existingAdmin = await prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (existingUsersCount === 1 && existingAdmin && existingAdmin.role === Role.ADMIN) {
      console.log('[Bootstrap] El usuario administrador inicial ya se encuentra configurado e inicializado. No se requieren cambios.');
      return {
        clinicId: existingAdmin.clinicId,
        userId: existingAdmin.id,
        created: false,
      };
    }

    throw new Error('[Bootstrap Error] Operación cancelada: Ya existen usuarios registrados en la base de datos.');
  }

  const clinic = await prisma.clinic.upsert({
    where: { code: clinicCode },
    update: {
      name: clinicName,
      email,
      isActive: true,
    },
    create: {
      name: clinicName,
      code: clinicCode,
      address: 'Sede Principal',
      phone: '+000000000',
      email,
      isActive: true,
    },
  });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const adminUser = await prisma.user.create({
    data: {
      email,
      name: 'Administrador Inicial',
      password: passwordHash,
      role: Role.ADMIN,
      clinicId: clinic.id,
      isActive: true,
    },
  });

  console.log('[Bootstrap] Administrador inicial creado exitosamente:');
  console.log(` - Email: ${adminUser.email}`);
  console.log(` - Rol: ${adminUser.role}`);
  console.log(` - Clínica: ${clinic.name} (${clinic.code})`);

  return {
    clinicId: clinic.id,
    userId: adminUser.id,
    created: true,
  };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  bootstrapAdmin(prisma)
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err: unknown) => {
      console.error((err as Error).message || err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
