import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role, Visit, VisitNote } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { AttendVisitDto } from './dto/attend-visit.dto';
import { CancelVisitDto } from './dto/cancel-visit.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { CreateVisitNoteDto } from './dto/create-visit-note.dto';
import { QueryVisitDto } from './dto/query-visit.dto';
import { VisitsService } from './visits.service';
import { VisitNotesService } from './visit-notes.service';

/**
 * Controlador REST para agendamiento, gestión, notas e historial de visitas clínicas (RF-39 a RF-47).
 */
@Controller('visits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitsController {
  constructor(
    private readonly visitsService: VisitsService,
    @Optional() private readonly visitNotesService?: VisitNotesService,
  ) {}

  /**
   * Agendamiento de una nueva cita clínica con validación de solapamiento de horarios (RF-39, RF-40).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.RECEPTION, Role.ADMIN, Role.VET)
  async create(
    @CurrentClinicId() clinicId: string,
    @Body() createVisitDto: CreateVisitDto,
  ): Promise<Visit> {
    return this.visitsService.scheduleVisit(clinicId, createVisitDto);
  }

  /**
   * Consulta paginada de visitas pertenecientes a la clínica autenticada.
   */
  @Get()
  async findAll(
    @CurrentClinicId() clinicId: string,
    @Query() queryDto?: QueryVisitDto,
  ): Promise<PaginatedResult<Visit>> {
    return this.visitsService.findAll(clinicId, queryDto);
  }

  /**
   * Consulta cronológica paginada de visitas e historial médico de una mascota (RF-47).
   * Restringido a usuarios VET y ADMIN bajo consentimiento (AccessGrant) activo (RF-47, RNF-8).
   */
  @Get('history/pet/:petId')
  @Roles(Role.VET, Role.ADMIN)
  async getPetMedicalHistory(
    @CurrentClinicId() clinicId: string,
    @Param('petId') petId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResult<Visit>> {
    return this.visitsService.getPetMedicalHistory(petId, clinicId, page, limit);
  }

  /**
   * Consulta el detalle de una visita específica por su identificador.
   */
  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentClinicId() clinicId?: string,
  ): Promise<Visit> {
    return this.visitsService.findById(id, clinicId);
  }

  /**
   * Cancelación de una visita clínica con motivo obligatorio (RF-41, RF-42).
   */
  @Patch(':id/cancel')
  @Roles(Role.RECEPTION, Role.ADMIN, Role.VET)
  async cancel(
    @CurrentClinicId() clinicId: string,
    @Param('id') visitId: string,
    @Body() cancelDto: CancelVisitDto,
  ): Promise<Visit> {
    return this.visitsService.cancelVisit(clinicId, visitId, cancelDto);
  }

  /**
   * Registro de atención médica, anamnesis, constantes vitales y tratamiento (RF-43, RF-44).
   * Restringido exclusivamente al profesional veterinario (Role.VET) (RF-3).
   */
  @Patch(':id/attend')
  @Roles(Role.VET)
  async attend(
    @CurrentClinicId() clinicId: string,
    @Param('id') visitId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() attendDto: AttendVisitDto,
  ): Promise<Visit> {
    const userId = req.user?.userId || (req.user as any)?.id;
    if (!userId) {
      throw new UnauthorizedException('Identificador de usuario no disponible en la sesión');
    }
    return this.visitsService.attendVisit(clinicId, visitId, userId, attendDto);
  }

  /**
   * Cierre formal e inmutable de la visita médica (RF-45).
   * Restringido exclusivamente al profesional veterinario (Role.VET) (RF-3).
   */
  @Post(':id/close')
  @Roles(Role.VET)
  async close(
    @CurrentClinicId() clinicId: string,
    @Param('id') visitId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<Visit> {
    const userId = req.user?.userId || (req.user as any)?.id;
    if (!userId) {
      throw new UnauthorizedException('Identificador de usuario no disponible en la sesión');
    }
    return this.visitsService.closeVisit(clinicId, visitId, userId);
  }

  /**
   * Adición de notas evolutivas complementarias inmutables sobre visitas médicas cerradas (RF-46).
   * Restringido exclusivamente al profesional veterinario (Role.VET) (RF-3, RF-46).
   */
  @Post(':id/notes')
  @Roles(Role.VET)
  async createNote(
    @CurrentClinicId() clinicId: string,
    @Param('id') visitId: string,
    @Req() req: Request & { user?: AuthenticatedUser },
    @Body() createNoteDto: CreateVisitNoteDto,
  ): Promise<VisitNote> {
    if (!this.visitNotesService) {
      throw new Error('VisitNotesService no disponible');
    }
    const userId = req.user?.userId || (req.user as any)?.id;
    if (!userId) {
      throw new UnauthorizedException('Identificador de usuario no disponible en la sesión');
    }
    return this.visitNotesService.createNote(clinicId, visitId, userId, createNoteDto);
  }

  /**
   * Consulta las notas evolutivas de una visita médica ordenadas cronológicamente (RF-46).
   */
  @Get(':id/notes')
  async findNotesByVisitId(
    @Param('id') visitId: string,
  ): Promise<VisitNote[]> {
    if (!this.visitNotesService) {
      throw new Error('VisitNotesService no disponible');
    }
    return this.visitNotesService.findByVisitId(visitId);
  }
}
