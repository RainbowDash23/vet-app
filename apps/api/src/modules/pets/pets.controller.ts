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
import { Pet, Role } from '@prisma/client';
import { PaginatedResult } from '@vet-app/shared-types';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePetDto } from './dto/create-pet.dto';
import { SearchPetQueryDto } from './dto/search-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { PetsService } from './pets.service';

/**
 * Controlador REST para la gestión de mascotas en el padrón centralizado (RF-17 a RF-20).
 */
@Controller('pets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  /**
   * Registro de una nueva mascota vinculada a un dueño (RF-17, RF-18).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createPetDto: CreatePetDto): Promise<Pet> {
    return this.petsService.create(createPetDto);
  }

  /**
   * Búsqueda y listado paginado estándar de mascotas.
   */
  @Get()
  async findAll(@Query() query: SearchPetQueryDto): Promise<PaginatedResult<Pet>> {
    return this.petsService.findAll(query);
  }

  /**
   * Consulta el detalle de una mascota activa por su identificador.
   */
  @Get(':id')
  async findById(@Param('id') id: string): Promise<Pet> {
    return this.petsService.findById(id);
  }

  /**
   * Actualización de atributos de una mascota activa.
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updatePetDto: UpdatePetDto,
  ): Promise<Pet> {
    return this.petsService.update(id, updatePetDto);
  }

  /**
   * Inactivación lógica (soft delete) de una mascota y desactivación de tags (RF-19, RF-20).
   * Restringido exclusivamente al rol ADMIN.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  async softDelete(@Param('id') id: string): Promise<Pet> {
    return this.petsService.softDelete(id);
  }
}
