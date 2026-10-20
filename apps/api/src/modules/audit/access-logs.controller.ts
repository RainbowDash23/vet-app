import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessLog, Role } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessLogsService } from './access-logs.service';
import { QueryAccessLogDto } from './dto/query-access-log.dto';

/**
 * Controlador REST para la consulta de la bitácora de auditoría inmutable (RF-25, RF-37, RF-62, RNF-7).
 */
@Controller('audit/access-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccessLogsController {
  constructor(private readonly accessLogsService: AccessLogsService) {}

  /**
   * Consulta global y paginada de trazas de auditoría de la clínica activa (RF-25, RF-62).
   * Restringido exclusivamente al rol ADMIN.
   */
  @Get()
  @Roles(Role.ADMIN)
  async findAll(
    @CurrentClinicId() clinicId: string,
    @Query() query: QueryAccessLogDto,
  ): Promise<PaginatedResult<AccessLog>> {
    return this.accessLogsService.findAll({
      ...query,
      clinicId,
    });
  }

  /**
   * Consulta del historial cronológico de accesos de una mascota específica.
   * Autorizado para los roles ADMIN y VET.
   */
  @Get('pet/:petId')
  @Roles(Role.ADMIN, Role.VET)
  async findByPetId(
    @Param('petId', ParseUUIDPipe) petId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResult<AccessLog>> {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 10;
    return this.accessLogsService.findByPetId(petId, pageNum, limitNum);
  }
}
