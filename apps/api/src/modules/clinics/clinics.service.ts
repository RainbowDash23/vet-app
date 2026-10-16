import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Clinic } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una nueva clínica en la plataforma (RF-7).
   * Valida la unicidad del código alfanumérico normalizado en minúsculas (RF-8).
   */
  async create(createClinicDto: CreateClinicDto): Promise<Clinic> {
    const normalizedCode = createClinicDto.code.trim().toLowerCase();

    // Verificación preventiva de duplicidad de código institucional (RF-8)
    const existingClinic = await this.prisma.clinic.findUnique({
      where: { code: normalizedCode },
    });

    if (existingClinic) {
      throw new ConflictException(
        `Ya existe una clínica registrada con el código "${normalizedCode}"`,
      );
    }

    return this.prisma.clinic.create({
      data: {
        name: createClinicDto.name.trim(),
        code: normalizedCode,
        phone: createClinicDto.phone ? createClinicDto.phone.trim() : null,
        email: createClinicDto.email ? createClinicDto.email.trim().toLowerCase() : null,
        address: createClinicDto.address ? createClinicDto.address.trim() : null,
      },
    });
  }

  /**
   * Retorna una clínica por su identificador único ID.
   * Lanza NotFoundException si no existe o fue eliminada lógicamente.
   */
  async findById(id: string): Promise<Clinic> {
    const clinic = await this.prisma.clinic.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!clinic) {
      throw new NotFoundException(`Clínica con id "${id}" no encontrada`);
    }

    return clinic;
  }

  /**
   * Retorna la clínica actual a la que pertenece el usuario autenticado (RF-9, RNF-8).
   */
  async findCurrentClinic(clinicId: string): Promise<Clinic> {
    return this.findById(clinicId);
  }

  /**
   * Actualiza los atributos institucionales u operativos de una clínica.
   */
  async update(id: string, updateClinicDto: UpdateClinicDto): Promise<Clinic> {
    // Validar existencia previa de la clínica
    await this.findById(id);

    return this.prisma.clinic.update({
      where: { id },
      data: {
        ...(updateClinicDto.name !== undefined && { name: updateClinicDto.name.trim() }),
        ...(updateClinicDto.phone !== undefined && {
          phone: updateClinicDto.phone ? updateClinicDto.phone.trim() : null,
        }),
        ...(updateClinicDto.email !== undefined && {
          email: updateClinicDto.email ? updateClinicDto.email.trim().toLowerCase() : null,
        }),
        ...(updateClinicDto.address !== undefined && {
          address: updateClinicDto.address ? updateClinicDto.address.trim() : null,
        }),
        ...(updateClinicDto.isActive !== undefined && { isActive: updateClinicDto.isActive }),
      },
    });
  }
}
