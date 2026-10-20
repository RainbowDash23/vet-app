import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Role, Tag } from '@prisma/client';
import { Request } from 'express';
import { CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { AssignTagDto } from './dto/assign-tag.dto';
import { ReportTagStatusDto } from './dto/report-tag-status.dto';
import { TagsService } from './tags.service';

/**
 * Controlador REST para el subsistema de tags NFC e identificación (RF-28 a RF-32, RF-56, RF-61, RF-63).
 */
@Controller('tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /**
   * Resuelve el identificador físico de un tag NFC escaneado (RF-28, RF-29).
   * Extrae de forma segura clinicId y userId de la sesión autenticada, así como IP y User-Agent.
   */
  @Get('resolve/:uid')
  async resolve(
    @Param('uid') uid: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const clinicId = req.user?.clinicId;
    if (!clinicId) {
      throw new UnauthorizedException(
        'Identificador de clínica no disponible en la sesión autenticada',
      );
    }
    const userId = req.user?.userId;
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = (req.headers['user-agent'] as string) || undefined;

    return this.tagsService.resolveUid(uid, clinicId, userId, ip, userAgent);
  }

  /**
   * Asigna un tag físico a una mascota registrada (RF-30, RF-31).
   * Restringido a los roles RECEPTION y ADMIN.
   */
  @Post('assign')
  @Roles(Role.RECEPTION, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async assign(@Body() assignTagDto: AssignTagDto): Promise<Tag> {
    return this.tagsService.assignTag(assignTagDto);
  }

  /**
   * Actualiza el estado operativo de un tag NFC (RF-32, RF-63).
   * Restringido a los roles RECEPTION y ADMIN de la clínica titular.
   */
  @Patch(':id/status')
  @Roles(Role.RECEPTION, Role.ADMIN)
  async reportStatus(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() reportStatusDto: ReportTagStatusDto,
  ): Promise<Tag> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    return this.tagsService.reportStatus(id, reportStatusDto, clinicId);
  }

  /**
   * Consulta el historial cronológico de tags asignados a una mascota (RF-61).
   */
  @Get('pet/:petId')
  async findByPetId(
    @CurrentClinicId() clinicId: string,
    @Param('petId') petId: string,
  ): Promise<Tag[]> {
    if (!clinicId) {
      throw new UnauthorizedException('Identificador de clínica no disponible en la sesión');
    }
    return this.tagsService.findByPetId(petId, clinicId);
  }
}
