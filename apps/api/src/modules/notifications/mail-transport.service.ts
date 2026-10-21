import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Proveedor de transporte para el envío de correos electrónicos y notificaciones sanitarias (RF-54).
 * Soporta dos controladores configurables mediante la variable MAIL_DRIVER:
 * - 'log' (por defecto): Emite el contenido del correo al logger estructurado sin abrir sockets ni conectar a red.
 * - 'smtp': Emite correos a través de nodemailer utilizando la configuración SMTP del entorno.
 */
@Injectable()
export class MailTransportService {
  private readonly logger = new Logger(MailTransportService.name);
  private shouldSucceed = true;
  private customTransporter: Transporter | null = null;

  /**
   * Permite inyectar un transporte simulado para pruebas unitarias sin conexión de red.
   */
  setTransporter(transporter: Transporter | null): void {
    this.customTransporter = transporter;
  }

  /**
   * Configura si los envíos simulados deben tener éxito o fallar (para testing y validación).
   */
  setShouldSucceed(value: boolean): void {
    this.shouldSucceed = value;
  }

  /**
   * Crea o resuelve la instancia del transporte nodemailer en función del entorno.
   */
  private getTransporter(): Transporter | null {
    if (this.customTransporter) {
      return this.customTransporter;
    }

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  /**
   * Envía un correo electrónico o mensaje de notificación sanitaria (RF-54).
   *
   * @param recipient Dirección de correo electrónico del destinatario.
   * @param subject Asunto de la comunicación.
   * @param content Contenido o cuerpo del mensaje.
   * @returns true si el mensaje fue aceptado por el transporte, false en caso de fallo.
   */
  async send(
    recipient: string,
    subject: string,
    content: string,
  ): Promise<boolean> {
    const driver = process.env.MAIL_DRIVER || 'log';

    if (driver === 'smtp') {
      const transporter = this.getTransporter();
      if (!transporter) {
        this.logger.error('[MailTransport SMTP] Configuración SMTP incompleta o transporte no inicializado');
        return false;
      }

      try {
        const from = process.env.SMTP_FROM || 'no-reply@vetapp.local';
        await transporter.sendMail({
          from,
          to: recipient,
          subject,
          text: content,
        });

        this.logger.log(
          `[MailTransport SMTP] Correo enviado exitosamente a "${recipient}" | Asunto: "${subject}"`,
        );
        return true;
      } catch (error: any) {
        this.logger.error(
          `[MailTransport SMTP] Error enviando correo hacia "${recipient}": ${error?.message}`,
        );
        return false;
      }
    }

    // Modo LOG por defecto
    this.logger.log(
      `[MailTransport LOG] Despachando a "${recipient}" | Asunto: "${subject}" | Contenido: ${content.slice(0, 80)}...`,
    );

    if (!this.shouldSucceed) {
      this.logger.warn(`[MailTransport LOG] Simulación de error de transporte hacia "${recipient}"`);
      return false;
    }

    return true;
  }
}
