import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService, LoginResponse, LogoutResponse } from './auth.service';
import { CurrentClinicId, CurrentUser, CurrentUserId } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthenticatedUser } from './interfaces/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Endpoint de autenticación único (sin registro público) (RF-1, RF-2).
   * Valida credenciales contra la base de datos y retorna el par de tokens firmado.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(loginDto);
  }

  /**
   * Endpoint de renovación de sesión con rotación atómica de Refresh Token (RF-6).
   * Invalida el token anterior y entrega un nuevo par de credenciales vigentes.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshDto: RefreshDto): Promise<LoginResponse> {
    return this.authService.refreshTokens(refreshDto);
  }

  /**
   * Endpoint de cierre de sesión y revocación en base de datos con denylist de JTI (RF-4).
   * Protegido por JwtAuthGuard. Extrae userId y jti del usuario autenticado
   * e invalida las credenciales activas.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() logoutDto?: LogoutDto,
  ): Promise<LogoutResponse> {
    return this.authService.logout(
      user.userId,
      user.jti || '',
      user.exp,
      logoutDto?.refreshToken,
    );
  }

  /**
   * Endpoint de prueba protegido: Solo accesible con rol ADMIN.
   */
  @Get('test/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  testAdmin(@CurrentUser() user: AuthenticatedUser) {
    return {
      status: 'ok',
      message: 'Acceso autorizado exclusivamente para rol ADMIN.',
      user,
    };
  }

  /**
   * Endpoint de prueba protegido: Solo accesible con rol VET.
   */
  @Get('test/vet')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VET)
  testVet(@CurrentUser() user: AuthenticatedUser) {
    return {
      status: 'ok',
      message: 'Acceso autorizado exclusivamente para rol VET (Veterinario).',
      user,
    };
  }

  /**
   * Endpoint de prueba protegido: Solo accesible con rol RECEPTION.
   */
  @Get('test/reception')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RECEPTION)
  testReception(@CurrentUser() user: AuthenticatedUser) {
    return {
      status: 'ok',
      message: 'Acceso autorizado exclusivamente para rol RECEPTION (Recepción).',
      user,
    };
  }

  /**
   * Endpoint de prueba para verificar los decoradores que extraen userId y clinicId del token.
   */
  @Get('test/me')
  @UseGuards(JwtAuthGuard)
  testMe(
    @CurrentUserId() userId: string,
    @CurrentClinicId() clinicId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      status: 'ok',
      message: 'Claims extraídos de manera criptográfica desde el JWT (inmunes a manipulación del cliente).',
      extractedUserId: userId,
      extractedClinicId: clinicId,
      fullUserSession: user,
    };
  }
}
