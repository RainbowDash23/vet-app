import { Injectable, Logger } from '@nestjs/common';

/**
 * Proveedor de transporte para el envío de correos electrónicos y notificaciones.
 * En entornos de desarrollo y pruebas opera con logger estructurado y retorno
 * booleano configurable para simulación de escenarios de éxito y fallo (RF-54).
 */
@Injectable()
export class MailTransportService {
  private readonly logger = new Logger(MailTransportService.name);
  private shouldSucceed = true;

  /**
   * Configura si los envíos simulados deben tener éxito o fallar (para testing y validación).
   *
   * @param value Estado booleano deseado.
   */
  setShouldSucceed(value: boolean): void {
    this.shouldSucceed = value;
  }

  /**
   * Envía un correo electrónico o mensaje de notificación sanitaria.
   *
   * @param recipient Dirección de correo electrónico o identificador del destinatario.
   * @param subject Asunto de la comunicación.
   * @param content Contenido o cuerpo del mensaje.
   * @returns true si el mensaje fue aceptado por el transporte, false en caso de fallo.
   */
  async send(
    recipient: string,
    subject: string,
    content: string,
  ): Promise<boolean> {
    this.logger.log(
      `[MailTransport] Despachando a "${recipient}" | Asunto: "${subject}" | Contenido: ${content.slice(0, 80)}...`,
    );

    if (!this.shouldSucceed) {
      this.logger.warn(`[MailTransport] Simulación de error de red/transporte hacia "${recipient}"`);
      return false;
    }

    return true;
  }
}
