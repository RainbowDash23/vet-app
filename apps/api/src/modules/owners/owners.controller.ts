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
  UseGuards,
} from '@nestjs/common';
import { Owner, Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { PaginatedResult } from '@vet-app/shared-types';
import { CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { LookupOwnerDto } from './dto/lookup-owner.dto';
import { SearchOwnerQueryDto } from './dto/search-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { OwnersService } from './owners.service';

/**
 * Controlador REST para el padrón centralizado de dueños (RF-14 a RF-16, RF-19, RF-60).
 */
@Controller('owners')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  /**
   * Registro de un nuevo dueño en el padrón centralizado (RF-14, RF-15).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.RECEPTION, Role.ADMIN)
  async create(@Body() createOwnerDto: CreateOwnerDto): Promise<Owner> {
    return this.ownersService.create(createOwnerDto);
  }

  /**
   * Consulta ciega de existencia de un dueño por documentId (RF-60).
   * Con límite de tasa por usuario (@nestjs/throttler).
   * Retorna { exists: true, pendingConsent: true } o { exists: false }.
   */
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.RECEPTION, Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async lookup(
    @Body() dto: LookupOwnerDto,
  ): Promise<{ exists: boolean; pendingConsent?: boolean }> {
    return this.ownersService.lookup(dto.documentId);
  }

  /**
   * Búsqueda paginada estándar de dueños vinculados a la clínica en sesión (RF-16, RF-60).
   */
  @Get()
  async findAll(
    @Query() query: SearchOwnerQueryDto,
    @CurrentClinicId() clinicId?: string,
  ): Promise<PaginatedResult<Owner>> {
    return this.ownersService.findAll(query, clinicId);
  }

  /**
   * Consulta el detalle de un dueño por su identificador (RF-14, RF-60).
   */
  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentClinicId() clinicId?: string,
  ): Promise<Owner> {
    return this.ownersService.findById(id, clinicId);
  }

  /**
   * Actualización de datos de filiación o contacto del dueño (RF-14, RF-63).
   */
  @Patch(':id')
  @Roles(Role.RECEPTION, Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateOwnerDto: UpdateOwnerDto,
    @CurrentClinicId() clinicId?: string,
  ): Promise<Owner> {
    return this.ownersService.update(id, updateOwnerDto, clinicId);
  }

  /**
   * Inactivación lógica (soft delete) de un dueño (RF-19).
   * Restringido exclusivamente al rol ADMIN.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  async softDelete(@Param('id') id: string): Promise<Owner> {
    return this.ownersService.softDelete(id);
  }
}
