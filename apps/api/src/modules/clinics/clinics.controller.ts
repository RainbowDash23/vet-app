import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Clinic, Role } from '@prisma/client';
import { CurrentClinic, CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  /**
   * Registra una nueva clínica en la plataforma (RF-7).
   * Restringido exclusivamente al rol ADMIN.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() createClinicDto: CreateClinicDto): Promise<Clinic> {
    return this.clinicsService.create(createClinicDto);
  }

  /**
   * Retorna los datos institucionales de la clínica a la que pertenece el usuario autenticado (RF-9, RNF-8).
   * El clinicId se extrae determinísticamente de la firma del token JWT con @CurrentClinic().
   * Accesible para cualquier usuario autenticado de la clínica (ADMIN, VET, RECEPTION).
   */
  @Get('current')
  @UseGuards(JwtAuthGuard)
  async findCurrent(@CurrentClinic() clinicId: string): Promise<Clinic> {
    return this.clinicsService.findCurrentClinic(clinicId);
  }

  /**
   * Actualiza los datos institucionales de la clínica actual (RF-7, RF-9).
   * Restringido exclusivamente al rol ADMIN.
   */
  @Patch('current')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateCurrent(
    @CurrentClinicId() clinicId: string,
    @Body() updateClinicDto: UpdateClinicDto,
  ): Promise<Clinic> {
    return this.clinicsService.update(clinicId, updateClinicDto);
  }

  /**
   * Consulta los datos de una clínica por su identificador único (ID) (RF-63).
   * Restringe el acceso a la propia clínica del ADMIN en sesión.
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findById(
    @Param('id') id: string,
    @CurrentClinicId() clinicId?: string,
  ): Promise<Clinic> {
    if (clinicId && id !== clinicId) {
      throw new NotFoundException('Clínica no encontrada');
    }
    return this.clinicsService.findById(id);
  }

  /**
   * Actualiza los datos de una clínica por su identificador único (ID) (RF-63).
   * Restringe la modificación a la propia clínica del ADMIN en sesión.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateClinicDto: UpdateClinicDto,
    @CurrentClinicId() clinicId?: string,
  ): Promise<Clinic> {
    if (clinicId && id !== clinicId) {
      throw new NotFoundException('Clínica no encontrada');
    }
    return this.clinicsService.update(id, updateClinicDto);
  }
}
