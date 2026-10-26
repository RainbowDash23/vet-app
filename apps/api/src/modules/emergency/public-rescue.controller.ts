import { Controller, Get, HttpStatus, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { EmergencyService } from './emergency.service';
import { EmergencyPetProfileDto } from './dto/emergency-pet-profile.dto';

/**
 * Función de escape estricto para mitigar cualquier riesgo de Cross-Site Scripting (XSS) (RF-64).
 */
function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Genera el documento HTML SSR responsivo para el portal público de rescate (RF-64).
 * Cero JavaScript, estilos CSS en línea embebidos, sin CDN externas y censura absoluta
 * de documentos de identidad, correos electrónicos y direcciones físicas.
 */
function renderRescueHtml(profile: EmergencyPetProfileDto): string {
  const petName = escapeHtml(profile.petName);
  const species = escapeHtml(profile.species);
  const breed = escapeHtml(profile.breed || 'No especificada');
  const ownerName = escapeHtml(profile.ownerName);
  const ownerPhone = escapeHtml(profile.ownerPhone);
  const clinicName = escapeHtml(profile.clinicName);
  const clinicPhone = profile.clinicPhone ? escapeHtml(profile.clinicPhone) : null;

  const clinicPhoneHtml = clinicPhone
    ? `<a href="tel:${clinicPhone}" class="btn-call secondary">Llamar a la Clínica: ${clinicPhone}</a>`
    : `<div class="info-muted">Teléfono de clínica no registrado</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mascota registrada - contacto de emergencia</title>
  <meta property="og:title" content="Mascota registrada - contacto de emergencia">
  <meta property="og:description" content="Portal público de contacto de emergencia para mascotas registradas.">
  <meta property="og:type" content="website">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f3f4f6;
      color: #1f2937;
      line-height: 1.5;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      max-width: 480px;
      width: 100%;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    .header {
      background-color: #dc2626;
      color: #ffffff;
      padding: 24px 20px;
      text-align: center;
    }
    .header h1 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header p {
      font-size: 0.875rem;
      opacity: 0.9;
    }
    .content {
      padding: 24px 20px;
    }
    .section {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #f3f4f6;
    }
    .section:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .section-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .pet-name {
      font-size: 1.75rem;
      font-weight: 800;
      color: #111827;
      margin-bottom: 4px;
    }
    .pet-details {
      font-size: 0.95rem;
      color: #4b5563;
    }
    .contact-name {
      font-size: 1.1rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 6px;
    }
    .btn-call {
      display: block;
      width: 100%;
      padding: 12px 16px;
      background-color: #2563eb;
      color: #ffffff;
      text-align: center;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      margin-top: 8px;
    }
    .btn-call.secondary {
      background-color: #059669;
    }
    .info-muted {
      font-size: 0.875rem;
      color: #6b7280;
      font-style: italic;
      margin-top: 4px;
    }
    .footer {
      background-color: #f9fafb;
      padding: 12px 20px;
      text-align: center;
      font-size: 0.75rem;
      color: #9ca3af;
      border-top: 1px solid #f3f4f6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>¡Mascota Extraviada!</h1>
      <p>Información de contacto para rescate inmediato</p>
    </div>
    <div class="content">
      <div class="section">
        <div class="section-title">Paciente</div>
        <div class="pet-name">${petName}</div>
        <div class="pet-details"><strong>Especie:</strong> ${species} | <strong>Raza:</strong> ${breed}</div>
      </div>
      <div class="section">
        <div class="section-title">Propietario</div>
        <div class="contact-name">${ownerName}</div>
        <a href="tel:${ownerPhone}" class="btn-call">Llamar al Dueño: ${ownerPhone}</a>
      </div>
      <div class="section">
        <div class="section-title">Clínica de Referencia</div>
        <div class="contact-name">${clinicName}</div>
        ${clinicPhoneHtml}
      </div>
    </div>
    <div class="footer">
      Sistema Veterinario de Rescate e Identificación
    </div>
  </div>
</body>
</html>`;
}

/**
 * Genera el documento HTML SSR 404 amigable cuando el código no existe o el tag está inactivo (RF-64).
 */
function renderNotFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código no encontrado - Rescate</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f3f4f6;
      color: #1f2937;
      line-height: 1.5;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      max-width: 480px;
      width: 100%;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      text-align: center;
      padding: 40px 24px;
    }
    .badge {
      display: inline-block;
      padding: 6px 12px;
      background-color: #fee2e2;
      color: #991b1b;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 600;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #111827;
      margin-top: 16px;
      margin-bottom: 12px;
    }
    p {
      color: #4b5563;
      font-size: 0.95rem;
      margin-bottom: 20px;
    }
    .advice {
      font-size: 0.85rem;
      color: #6b7280;
      border-top: 1px solid #f3f4f6;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Error 404</div>
    <h1>Código de rescate no encontrado o inactivo</h1>
    <p>Esta placa de identificación o código de rescate no se encuentra activo o no existe en el sistema.</p>
    <p class="advice">Si has encontrado una mascota con esta placa, por favor acude a una clínica veterinaria cercana para escanear su microchip o placa con un lector autorizado.</p>
  </div>
</body>
</html>`;
}

/**
 * Controlador de contingencia para la página pública de rescate (RF-64).
 * Renderiza páginas HTML en el servidor (SSR) sin scripts de cliente, responsivas para móviles
 * y con limitación de tasa por dirección IP (@nestjs/throttler).
 */
@Controller('p')
export class PublicRescueController {
  constructor(private readonly emergencyService: EmergencyService) {}

  /**
   * Endpoint público de rescate GET /p/:publicCode (RF-64).
   */
  @Get(':publicCode')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getRescuePage(
    @Param('publicCode') publicCode: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ipAddress = req.ip || req.socket.remoteAddress;

    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined;

    try {
      const profile = await this.emergencyService.getEmergencyProfile(
        publicCode,
        ipAddress,
        userAgent,
      );

      const html = renderRescueHtml(profile);
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(html);
    } catch {
      const html = renderNotFoundHtml();
      res
        .status(HttpStatus.NOT_FOUND)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(html);
    }
  }
}
