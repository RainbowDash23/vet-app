import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Pet, Role } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreatePetDto } from './dto/create-pet.dto';
import { SearchPetQueryDto } from './dto/search-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PetsService } from './pets.service';

/**
 * Controlador REST para la gestión de mascotas en el padrón centralizado (RF-17 a RF-20, RF-60, RF-63).
 */
@Controller('pets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  /**
   * Registro de una nueva mascota vinculada a un dueño (RF-17, RF-18, RF-60, RF-63).
   * Registra createdByClinicId y valida el vínculo asistencial con el dueño.
   * Restringido a los roles RECEPTION y ADMIN (RF-63).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.RECEPTION, Role.ADMIN)
  async create(
    @CurrentClinicId() clinicId: string,
    @Body() createPetDto: CreatePetDto,
    @Req() req?: Request & { user?: AuthenticatedUser & { id?: string; userId?: string; sub?: string } },
  ): Promise<Pet> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    const userId = req?.user?.id || req?.user?.userId || req?.user?.sub;
    return this.petsService.create(createPetDto, clinicId, userId);
  }

  /**
   * Búsqueda y listado paginado estándar de mascotas asociadas a la clínica autenticada (RF-63).
   */
  @Get()
  async findAll(
    @CurrentClinicId() clinicId: string,
    @Query() query: SearchPetQueryDto,
  ): Promise<PaginatedResult<Pet>> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    return this.petsService.findAll(query, clinicId);
  }

  /**
   * Consulta el detalle de una mascota activa por su identificador.
   */
  @Get(':id')
  async findById(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
  ): Promise<Pet> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    return this.petsService.findById(id, clinicId);
  }

  /**
   * Actualización de atributos de una mascota activa (RF-63).
   */
  @Patch(':id')
  @Roles(Role.RECEPTION, Role.ADMIN)
  async update(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() updatePetDto: UpdatePetDto,
  ): Promise<Pet> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    return this.petsService.update(id, updatePetDto, clinicId);
  }

  /**
   * Inactivación lógica (soft delete) de una mascota y desactivación de tags (RF-19, RF-20).
   * Restringido exclusivamente al rol ADMIN.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  async softDelete(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
  ): Promise<Pet> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    return this.petsService.softDelete(id, clinicId);
  }
}
