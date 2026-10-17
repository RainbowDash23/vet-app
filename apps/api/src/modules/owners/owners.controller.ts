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
import { PaginatedResult } from '@vet-app/shared-types';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { SearchOwnerQueryDto } from './dto/search-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { OwnersService } from './owners.service';

/**
 * Controlador REST para el padrón centralizado de dueños (RF-14 a RF-16, RF-19).
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
  async create(@Body() createOwnerDto: CreateOwnerDto): Promise<Owner> {
    return this.ownersService.create(createOwnerDto);
  }

  /**
   * Búsqueda paginada estándar de dueños (RF-16).
   */
  @Get()
  async findAll(@Query() query: SearchOwnerQueryDto): Promise<PaginatedResult<Owner>> {
    return this.ownersService.findAll(query);
  }

  /**
   * Consulta el detalle de un dueño por su identificador (RF-14).
   */
  @Get(':id')
  async findById(@Param('id') id: string): Promise<Owner> {
    return this.ownersService.findById(id);
  }

  /**
   * Actualización de datos de filiación o contacto del dueño (RF-14).
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateOwnerDto: UpdateOwnerDto,
  ): Promise<Owner> {
    return this.ownersService.update(id, updateOwnerDto);
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
