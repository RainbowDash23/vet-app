import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EmergencyService } from './emergency.service';
import { EmergencyPetProfileDto } from './dto/emergency-pet-profile.dto';

/**
 * Controlador público de contingencia y rescate de mascotas (RF-35 a RF-38).
 * Este endpoint es de libre acceso público (sin JwtAuthGuard ni roles requeridos) para
 * permitir a cualquier ciudadano o rescatista obtener los datos básicos de contacto
 * del dueño al escanear la placa o ingresar el enlace de contingencia.
 */
@Controller('emergency')
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  /**
   * Consulta pública de perfil de emergencia mediante el UUID publicCode (RF-35).
   * Registra automáticamente la dirección IP y User-Agent en la bitácora de auditoría (RF-37).
   *
   * @param publicCode Código público UUID grabado en el tag/placa de la mascota.
   * @param req Objeto Request de Express para extracción de IP y User-Agent.
   */
  @Get(':publicCode')
  async getEmergencyProfile(
    @Param('publicCode') publicCode: string,
    @Req() req: Request,
  ): Promise<EmergencyPetProfileDto> {
    const ipAddress = req.ip || (req.socket as any)?.remoteAddress;

    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined;

    return this.emergencyService.getEmergencyProfile(publicCode, ipAddress, userAgent);
  }
}
