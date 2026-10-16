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
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentClinicId } from '../../common/decorators/clinic.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SoftDeleteUserResponse, UserResponse, UsersService } from './users.service';

/**
 * Controlador REST para la gestión de usuarios y personal clínico (RF-10 a RF-13).
 */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Registro de nuevo colaborador clínico (RF-10, RF-11).
   * Restringido exclusivamente al rol ADMIN de la clínica.
   * El clinicId se inyecta de forma segura desde el token JWT verificado (RF-9, RNF-8).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async create(
    @CurrentClinicId() clinicId: string,
    @Body() createUserDto: CreateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.create(clinicId, createUserDto);
  }

  /**
   * Lista el personal clínico activo perteneciente a la clínica en sesión (RF-9, RNF-8).
   * Accesible para cualquier colaborador autenticado.
   */
  @Get()
  async findAll(@CurrentClinicId() clinicId: string): Promise<UserResponse[]> {
    return this.usersService.findAll(clinicId);
  }

  /**
   * Consulta el detalle de un colaborador clínico por su ID (RF-9, RNF-8).
   */
  @Get(':id')
  async findById(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
  ): Promise<UserResponse> {
    return this.usersService.findById(clinicId, id);
  }

  /**
   * Actualización de perfil, especialidad y disponibilidad horaria de un colaborador (RF-12).
   * Restringido exclusivamente al rol ADMIN.
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async update(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.update(clinicId, id, updateUserDto);
  }

  /**
   * Inactivación lógica de colaborador y revocación inmediata de sus sesiones (RF-13).
   * Restringido exclusivamente al rol ADMIN.
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async softDelete(
    @CurrentClinicId() clinicId: string,
    @Param('id') id: string,
  ): Promise<SoftDeleteUserResponse> {
    return this.usersService.softDelete(clinicId, id);
  }
}
