import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenRevocationService } from '../auth/token-revocation.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export const BCRYPT_SALT_ROUNDS = 12;

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: Role;
  clinicId: string;
  licenseNumber: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeleteUserResponse {
  success: boolean;
  message: string;
  userId: string;
  deletedAt: Date;
}

/**
 * Servicio de gestión de usuarios, personal clínico y control de acceso (RF-10, RF-11, RF-12, RF-13).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenRevocation: TokenRevocationService,
  ) {}

  /**
   * Registro de nuevo colaborador clínico (RF-10, RF-11).
   * - Exige licenseNumber obligatorio y no vacío si role === Role.VET (RF-10).
   * - Valida colisión de email contra usuarios activos (deletedAt: null) (RF-11).
   * - Valida colisión de licenseNumber contra veterinarios activos (deletedAt: null) (RF-11).
   * - Hashea la contraseña con bcryptjs usando 12 rondas de salteo.
   * - Retorna el usuario sanitizado sin exponer la contraseña hasheada.
   */
  async create(clinicId: string, createUserDto: CreateUserDto): Promise<UserResponse> {
    const { email, password, name, role, phone, licenseNumber } = createUserDto;

    // Validación condicional obligatoria de cédula profesional para rol VET (RF-10)
    if (role === Role.VET) {
      if (!licenseNumber || licenseNumber.trim() === '') {
        throw new BadRequestException(
          'El número de cédula profesional (licenseNumber) es obligatorio y no puede estar vacío para el rol VET',
        );
      }
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedLicense = licenseNumber && licenseNumber.trim() !== '' ? licenseNumber.trim() : null;

    // Validación de unicidad de email entre usuarios activos (RF-11)
    const existingEmail = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
    });

    if (existingEmail) {
      throw new ConflictException(
        `Ya existe un colaborador activo registrado con el correo electrónico '${normalizedEmail}'`,
      );
    }

    // Validación de unicidad de cédula profesional entre veterinarios activos (RF-11)
    if (trimmedLicense) {
      const existingLicense = await this.prisma.user.findFirst({
        where: {
          licenseNumber: trimmedLicense,
          deletedAt: null,
        },
      });

      if (existingLicense) {
        throw new ConflictException(
          `Ya existe un veterinario activo registrado con la cédula profesional '${trimmedLicense}'`,
        );
      }
    }

    // Hash seguro de la contraseña con bcrypt (exactamente 12 rondas de salteo)
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const createdUser = await this.prisma.user.create({
      data: {
        clinicId,
        email: normalizedEmail,
        password: hashedPassword,
        name: name.trim(),
        role,
        licenseNumber: trimmedLicense,
        phone: phone?.trim() || null,
        isActive: true,
      },
    });

    return this.sanitizeUser(createdUser);
  }

  /**
   * Consulta la lista de colaboradores activos de la clínica (RF-9, RNF-8).
   * Filtra estrictamente por clinicId y deletedAt: null.
   */
  async findAll(clinicId: string): Promise<UserResponse[]> {
    const users = await this.prisma.user.findMany({
      where: {
        clinicId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  /**
   * Consulta el detalle de un colaborador específico por su ID y clínica (RF-9, RNF-8).
   * Retorna HTTP 404 si el usuario no existe, está eliminado o pertenece a otra clínica.
   */
  async findById(clinicId: string, userId: string): Promise<UserResponse> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        clinicId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `Colaborador con identificador '${userId}' no encontrado o no pertenece a esta clínica`,
      );
    }

    return this.sanitizeUser(user);
  }

  /**
   * Actualización de perfil, especialidad y disponibilidad horaria (RF-12).
   */
  async update(
    clinicId: string,
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponse> {
    // Validar pertenencia multi-tenant y estado activo
    const existingUser = await this.prisma.user.findFirst({
      where: {
        id: userId,
        clinicId,
        deletedAt: null,
      },
    });

    if (!existingUser) {
      throw new NotFoundException(
        `Colaborador con identificador '${userId}' no encontrado o no pertenece a esta clínica`,
      );
    }

    const trimmedLicense =
      updateUserDto.licenseNumber !== undefined
        ? updateUserDto.licenseNumber?.trim() || null
        : undefined;

    // Si se modifica la cédula profesional, validar que no colisione con otro usuario activo (RF-11)
    if (trimmedLicense !== undefined && trimmedLicense !== null && trimmedLicense !== existingUser.licenseNumber) {
      const licenseCollision = await this.prisma.user.findFirst({
        where: {
          licenseNumber: trimmedLicense,
          deletedAt: null,
        },
      });

      if (licenseCollision && licenseCollision.id !== userId) {
        throw new ConflictException(
          `Ya existe otro veterinario activo registrado con la cédula profesional '${trimmedLicense}'`,
        );
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(updateUserDto.name !== undefined && { name: updateUserDto.name.trim() }),
        ...(updateUserDto.phone !== undefined && {
          phone: updateUserDto.phone ? updateUserDto.phone.trim() : null,
        }),
        ...(trimmedLicense !== undefined && { licenseNumber: trimmedLicense }),
        ...(updateUserDto.isActive !== undefined && { isActive: updateUserDto.isActive }),
      },
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Inactivación lógica de personal y revocación inmediata de acceso (RF-13).
   * - Marca deletedAt = now() e isActive = false.
   * - Revoca de forma atómica todas las sesiones y refresh tokens activos en BD vía TokenRevocationService.
   * - Preserva la integridad referencial de visitas e intervenciones médicas históricas.
   */
  async softDelete(clinicId: string, userId: string): Promise<SoftDeleteUserResponse> {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        id: userId,
        clinicId,
        deletedAt: null,
      },
    });

    if (!existingUser) {
      throw new NotFoundException(
        `Colaborador con identificador '${userId}' no encontrado o no pertenece a esta clínica`,
      );
    }

    const deletedAt = new Date();

    // 1. Aplicar borrado lógico
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt,
      },
    });

    // 2. Revocación atómica de todos los refresh tokens activos del usuario en base de datos (RF-13)
    await this.tokenRevocation.revokeUserRefreshTokens(userId);

    return {
      success: true,
      message: 'Colaborador dado de baja exitosamente. Sesiones revocadas.',
      userId,
      deletedAt,
    };
  }

  /**
   * Sanitiza la entidad User excluyendo determinísticamente el hash de contraseña.
   */
  private sanitizeUser(user: User): UserResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clinicId: user.clinicId,
      licenseNumber: user.licenseNumber,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
