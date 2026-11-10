import { Controller, Get, HttpStatus, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import type { PetSpecies, PetSex } from '@vet-app/shared-types';
import { EmergencyService } from './emergency.service';
import { EmergencyPetProfileDto } from './dto/emergency-pet-profile.dto';

/**
 * Función de escape estricto para mitigar cualquier riesgo de Cross-Site Scripting (XSS) (RF-64).
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Traduce el enum biológico de especie a un término cálido y natural en español.
 * Nunca retorna el identificador de enum crudo.
 */
export function formatSpeciesLabel(species: PetSpecies | string | null | undefined): string {
  const normalized = String(species || '').trim().toUpperCase();
  switch (normalized) {
    case 'CANINE':
      return 'Perro';
    case 'FELINE':
      return 'Gato';
    case 'AVIAN':
      return 'Ave';
    case 'EQUINE':
      return 'Caballo';
    case 'RODENT':
      return 'Roedor';
    case 'REPTILE':
      return 'Reptil';
    case 'OTHER':
    default:
      return 'Otro';
  }
}

/**
 * Traduce el sexo biológico a español (Macho / Hembra).
 * Si no está especificado o es desconocido, retorna null para no mostrarlo.
 */
export function formatSexLabel(sex: PetSex | string | null | undefined): string | null {
  const normalized = String(sex || '').trim().toUpperCase();
  switch (normalized) {
    case 'MALE':
      return 'Macho';
    case 'FEMALE':
      return 'Hembra';
    case 'UNKNOWN':
    default:
      return null;
  }
}

/**
 * Normaliza y valida si un número telefónico es real y utilizable.
 * Descarta valores nulos, vacíos, placeholders con puros ceros (ej. +000000000),
 * y cadenas con menos de 7 dígitos o más de 15 dígitos (estándar ITU-T E.164).
 */
export function isValidPhoneNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (!trimmed) return false;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;

  if (/^0+$/.test(digits)) return false;

  return true;
}

/**
 * Valida si un número telefónico está en formato internacional válido según E.164.
 * Debe comenzar obligatoriamente con el prefijo '+' seguido de un código de país
 * (entre 1 y 3 dígitos no iniciados en cero) y el número nacional de abonado,
 * completando entre 8 y 15 dígitos en total.
 */
export function isValidInternationalPhone(phone: string | null | undefined): boolean {
  if (!isValidPhoneNumber(phone)) return false;
  const trimmed = phone!.trim();

  if (!trimmed.startsWith('+')) return false;

  const clean = trimmed.replace(/[\s\-\(\)\.]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(clean);
}

/**
 * Obtiene el formato numérico internacional requerido por wa.me (solo dígitos, sin '+').
 */
export function getWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!isValidInternationalPhone(phone)) return null;
  const clean = phone!.trim().replace(/[\s\-\(\)\.]/g, '');
  return clean.replace(/^\+/, '');
}

/**
 * Obtiene la URI limpia para enlaces tel: (conservando '+' si es internacional).
 */
export function getTelUri(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Genera el documento HTML SSR responsivo para el portal público de rescate (RF-64).
 * Cero JavaScript, estilos CSS en línea embebidos, sin CDN externas y censura absoluta
 * de documentos de identidad, correos electrónicos y direcciones físicas.
 */
export function renderRescueHtml(profile: EmergencyPetProfileDto): string {
  const petName = escapeHtml(profile.petName);
  const ownerName = escapeHtml(profile.ownerName);
  const ownerPhone = profile.ownerPhone?.trim() ?? '';
  const clinicName = escapeHtml(profile.clinicName);
  const clinicPhone = profile.clinicPhone?.trim() ?? null;

  // Construcción de detalles de la mascota: Especie &bull; Sexo &bull; Raza (solo si existe)
  const detailsParts: string[] = [escapeHtml(formatSpeciesLabel(profile.species))];
  const sexLabel = formatSexLabel(profile.sex);
  if (sexLabel) {
    detailsParts.push(escapeHtml(sexLabel));
  }
  const rawBreed = profile.breed?.trim();
  if (
    rawBreed &&
    rawBreed.toLowerCase() !== 'no especificada' &&
    rawBreed.toLowerCase() !== 'sin raza'
  ) {
    detailsParts.push(escapeHtml(rawBreed));
  }
  const petDetailsHtml = detailsParts.join(' &bull; ');

  // Construcción de bloque de contacto del dueño
  let ownerContactHtml = '';
  const isOwnerPhoneValid = isValidPhoneNumber(ownerPhone);

  if (isOwnerPhoneValid) {
    const telUri = getTelUri(ownerPhone);
    const waNumber = getWhatsAppNumber(ownerPhone);

    const callBtn = telUri
      ? `<a href="tel:${telUri}" class="btn-action btn-call">Llamar</a>`
      : '';
    const waBtn = waNumber
      ? `<a href="https://wa.me/${waNumber}" class="btn-action btn-whatsapp" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>`
      : '';

    ownerContactHtml = `
      <div class="phone-display">${escapeHtml(ownerPhone)}</div>
      <div class="btn-group">
        ${callBtn}
        ${waBtn}
      </div>`;
  } else {
    ownerContactHtml = `<div class="info-muted">Teléfono de contacto no disponible</div>`;
  }

  // Construcción de bloque de clínica de referencia (solo si tiene teléfono válido no placeholder)
  let clinicSectionHtml = '';
  if (isValidPhoneNumber(clinicPhone)) {
    const clinicTelUri = getTelUri(clinicPhone!);
    const clinicCallBtn = clinicTelUri
      ? `<a href="tel:${clinicTelUri}" class="btn-action btn-secondary">Llamar a la clínica</a>`
      : '';

    clinicSectionHtml = `
      <div class="section">
        <div class="section-title">Clínica de referencia</div>
        <div class="contact-name">${clinicName}</div>
        <div class="phone-display">${escapeHtml(clinicPhone!)}</div>
        <div class="btn-group">
          ${clinicCallBtn}
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Mascota registrada - contacto de emergencia</title>
  <meta property="og:title" content="Mascota registrada - contacto de emergencia">
  <meta property="og:description" content="Portal público de contacto de emergencia para mascotas registradas.">
  <meta property="og:type" content="website">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #0f172a;
      line-height: 1.5;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
      max-width: 440px;
      width: 100%;
      overflow: hidden;
    }
    .header {
      background-color: #0f172a;
      color: #ffffff;
      padding: 28px 24px 22px;
      text-align: center;
    }
    .header h1 {
      font-size: 1.375rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin-bottom: 6px;
      color: #ffffff;
    }
    .header p {
      font-size: 0.9375rem;
      color: #94a3b8;
      line-height: 1.4;
    }
    .content {
      padding: 24px;
    }
    .section {
      margin-bottom: 22px;
      padding-bottom: 20px;
      border-bottom: 1px solid #f1f5f9;
    }
    .section:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .badge-tag {
      display: inline-block;
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #0369a1;
      background-color: #e0f2fe;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 10px;
    }
    .section-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #475569;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .pet-name {
      font-size: 1.75rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
      margin-bottom: 4px;
      line-height: 1.2;
    }
    .pet-details {
      font-size: 0.9375rem;
      color: #334155;
      font-weight: 500;
    }
    .contact-name {
      font-size: 1.125rem;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .phone-display {
      font-size: 0.9375rem;
      color: #475569;
      margin-bottom: 12px;
      font-family: inherit;
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-action {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 48px;
      padding: 12px 20px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 1rem;
      text-decoration: none;
      text-align: center;
      transition: background-color 0.15s ease;
      touch-action: manipulation;
    }
    .btn-action:focus-visible {
      outline: 3px solid #0284c7;
      outline-offset: 2px;
    }
    .btn-call {
      background-color: #0369a1;
      color: #ffffff;
    }
    .btn-call:hover {
      background-color: #075985;
    }
    .btn-whatsapp {
      background-color: #15803d;
      color: #ffffff;
    }
    .btn-whatsapp:hover {
      background-color: #166534;
    }
    .btn-secondary {
      background-color: #334155;
      color: #ffffff;
    }
    .btn-secondary:hover {
      background-color: #1e293b;
    }
    .info-muted {
      font-size: 0.875rem;
      color: #64748b;
      font-style: italic;
      margin-top: 4px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 16px 20px;
      text-align: center;
      font-size: 0.8125rem;
      color: #64748b;
      font-weight: 500;
      border-top: 1px solid #f1f5f9;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Esta mascota tiene dueño</h1>
      <p>Ayúdala a volver a casa: contacta a su dueño</p>
    </div>
    <div class="content">
      <div class="section">
        <div class="badge-tag">MASCOTA</div>
        <div class="pet-name">${petName}</div>
        <div class="pet-details">${petDetailsHtml}</div>
      </div>
      <div class="section">
        <div class="section-title">Contacto del dueño</div>
        <div class="contact-name">${ownerName}</div>
        ${ownerContactHtml}
      </div>
      ${clinicSectionHtml}
    </div>
    <div class="footer">
      Identificación de mascotas con llavero NFC
    </div>
  </div>
</body>
</html>`;
}

/**
 * Genera el documento HTML SSR 404 amigable cuando el código no existe o el tag está inactivo (RF-64).
 */
export function renderNotFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Código no encontrado - Rescate</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #0f172a;
      line-height: 1.5;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
      max-width: 440px;
      width: 100%;
      overflow: hidden;
      text-align: center;
      padding: 40px 24px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background-color: #fee2e2;
      color: #991b1b;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    h1 {
      font-size: 1.375rem;
      font-weight: 700;
      color: #0f172a;
      margin-top: 16px;
      margin-bottom: 12px;
      line-height: 1.3;
    }
    p {
      color: #475569;
      font-size: 0.9375rem;
      margin-bottom: 20px;
      line-height: 1.5;
    }
    .advice {
      font-size: 0.875rem;
      color: #64748b;
      border-top: 1px solid #f1f5f9;
      padding-top: 16px;
      line-height: 1.45;
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
        .setHeader('X-Robots-Tag', 'noindex, nofollow')
        .setHeader('Cache-Control', 'no-store')
        .send(html);
    } catch {
      const html = renderNotFoundHtml();
      res
        .status(HttpStatus.NOT_FOUND)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .setHeader('X-Robots-Tag', 'noindex, nofollow')
        .setHeader('Cache-Control', 'no-store')
        .send(html);
    }
  }
}
