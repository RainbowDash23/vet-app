import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role, Vaccination } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { QueryVaccinationDto } from './dto/query-vaccination.dto';
import { VaccinationsService } from './vaccinations.service';

/**
 * Controlador REST para el registro y consulta de vacunaciones y refuerzos (RF-48, RF-21, RNF-8).
 */
@Controller('vaccinations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VaccinationsController {
  constructor(private readonly vaccinationsService: VaccinationsService) {}

  /**
   * Registro de una nueva aplicación biológica por el profesional veterinario (RF-48).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.VET)
  async create(
    @CurrentClinicId() clinicId: string,
    @Req() req: Request & { user?: AuthenticatedUser & { id?: string; sub?: string } },
    @Body() createDto: CreateVaccinationDto,
  ): Promise<Vaccination> {
    const vetId = req.user?.id || req.user?.userId || req.user?.sub;
    if (!vetId) {
      throw new UnauthorizedException('Identificador de usuario no disponible en la sesión');
    }
    return this.vaccinationsService.create(clinicId, vetId, createDto);
  }

  /**
   * Consulta de vacunaciones de una mascota bajo consentimiento (AccessGrant) activo (RF-48, RF-21, RNF-8).
   */
  @Get('pet/:petId')
  @Roles(Role.VET, Role.ADMIN)
  async findByPetId(
    @CurrentClinicId() clinicId: string,
    @Param('petId') petId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResult<Vaccination>> {
    return this.vaccinationsService.findByPetId(petId, clinicId, page, limit);
  }

  /**
   * Lista vacunaciones registradas en la clínica autenticada con soporte de paginación.
   */
  @Get()
  async findAll(
    @CurrentClinicId() clinicId: string,
    @Query() queryDto?: QueryVaccinationDto,
  ): Promise<PaginatedResult<Vaccination>> {
    return this.vaccinationsService.findAll(clinicId, queryDto);
  }

  /**
   * Detalle de un registro de vacunación específico.
   */
  @Get(':id')
  async findById(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
  ): Promise<Vaccination> {
    return this.vaccinationsService.findById(id, clinicId);
  }
}
